import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.HOST ?? '127.0.0.1';
const requestedPort = Number.parseInt(process.env.PORT ?? '4177', 10);

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const compile = spawnSync(npmCommand, ['run', 'compile'], {
  cwd: root,
  stdio: 'inherit',
});

if (compile.error) {
  throw compile.error;
}

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const defaultModelId = packageJson.contributes.configuration.properties['marklingo.openrouter.modelId'].default;
const settingsHtmlUrl = pathToFileURL(path.join(root, 'out/webview/settingsHtml.js')).href;
const promptsUrl = pathToFileURL(path.join(root, 'out/translation/prompts.js')).href;
const { createSettingsHtmlNonce, renderSettingsHtml } = await import(`${settingsHtmlUrl}?t=${Date.now()}`);
const { resolveSystemPrompt } = await import(`${promptsUrl}?t=${Date.now()}`);

function getPreviewThemeCss(nonce) {
  return `<style nonce="${nonce}">
    :root {
      --vscode-editor-background: #1f1f1f;
      --vscode-foreground: #d4d4d4;
      --vscode-descriptionForeground: #9d9d9d;
      --vscode-sideBar-background: #252526;
      --vscode-widget-border: #3c3c3c;
      --vscode-input-background: #313131;
      --vscode-button-background: #0e639c;
      --vscode-button-foreground: #ffffff;
      --vscode-errorForeground: #f85149;
      --vscode-focusBorder: #007fd4;
      --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --vscode-editor-font-family: "SF Mono", Monaco, Consolas, monospace;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --vscode-editor-background: #ffffff;
        --vscode-foreground: #1f2328;
        --vscode-descriptionForeground: #57606a;
        --vscode-sideBar-background: #f6f8fa;
        --vscode-widget-border: #d0d7de;
        --vscode-input-background: #ffffff;
        --vscode-button-background: #0969da;
        --vscode-button-foreground: #ffffff;
        --vscode-errorForeground: #cf222e;
        --vscode-focusBorder: #0969da;
      }
    }
  </style>`;
}

function getPreviewBridgeScript(nonce) {
  return `<script nonce="${nonce}">
    window.__marklingoPreviewMessages = [];
    window.acquireVsCodeApi = () => ({
      postMessage(message) {
        window.__marklingoPreviewMessages.push(message);
        console.info('[MarkLingo Settings preview]', message);
        if (!message || typeof message.type !== 'string') return;
        const reply = (payload) => window.setTimeout(() => window.postMessage(payload, window.location.origin), 140);
        if (message.type === 'updateSetting') {
          reply({ type: 'saved', key: message.key, value: message.value, saveId: message.saveId });
          return;
        }
        if (message.type === 'setApiKey') {
          const value = typeof message.value === 'string' ? message.value : '';
          reply({ type: 'apiKeyStatus', hasKey: Boolean(value), saveId: message.saveId });
          return;
        }
        if (message.type === 'clearCurrentProjectData') {
          console.info('[MarkLingo Settings preview] clearCurrentProjectData is mocked; no files or metadata are deleted.');
          return;
        }
        if (message.type === 'clearAllData') {
          console.info('[MarkLingo Settings preview] clearAllData is mocked; no files or settings are deleted.');
          return;
        }
        if (message.type === 'optimizeStorage') {
          console.info('[MarkLingo Settings preview] optimizeStorage is mocked; no cached translations are changed.');
          return;
        }
        if (message.type === 'copySystemPrompt') {
          navigator.clipboard?.writeText(message.value ?? '').catch(() => {});
          console.info('[MarkLingo Settings preview] copySystemPrompt is mocked.');
        }
      },
    });
  </script>`;
}

function buildState(url) {
  const usesCustomLanguage = url.searchParams.get('custom') === '1';
  return {
    shortcutLabel: 'Option + Command + T',
    shortcutStatus: 'Default shortcut for Markdown editors.',
    shortcutWarning: url.searchParams.get('warning') === '1'
      ? 'If VS Code routes this key to another command, MarkLingo cannot show a prompt because its command is not invoked.'
      : '',
    baseUrl: 'https://openrouter.ai/api/v1',
    hasApiKey: url.searchParams.get('apiKey') !== 'missing',
    modelId: defaultModelId,
    requestMode: url.searchParams.get('mode') ?? 'auto',
    targetLanguage: usesCustomLanguage ? 'Custom...' : '简体中文',
    targetLanguageCustom: usesCustomLanguage ? 'Brazilian Portuguese' : '',
    systemPrompt: resolveSystemPrompt('', usesCustomLanguage ? 'Brazilian Portuguese' : '简体中文'),
    customPrompt: '',
    storageRoot: path.join(root, '.vscode-test', 'marklingo-preview', 'globalStorage', 'projects'),
    currentProjectPath: root,
    storageStats: {
      totalBytes: url.searchParams.get('storage') === 'full' ? 285 * 1024 * 1024 : 46 * 1024 * 1024,
      quotaBytes: 300 * 1024 * 1024,
      projectCount: 3,
      metaFileCount: 14,
      activeCacheCount: 11,
      evictedCacheCount: 3,
      cachePayloadBytes: url.searchParams.get('storage') === 'full' ? 250 * 1024 * 1024 : 38 * 1024 * 1024,
    },
  };
}

let actualPort = requestedPort;

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${host}:${actualPort}`);
  if (requestUrl.pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  if (requestUrl.pathname !== '/') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  const nonce = createSettingsHtmlNonce();
  const html = renderSettingsHtml({
    beforeMainScript: getPreviewBridgeScript(nonce),
    cspSource: "'self'",
    extraHead: getPreviewThemeCss(nonce),
    nonce,
    state: buildState(requestUrl),
  });
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(html);
});

async function listen(port) {
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

try {
  await listen(requestedPort);
} catch (error) {
  if (error?.code !== 'EADDRINUSE' || process.env.PORT) {
    throw error;
  }
  await listen(0);
}

const address = server.address();
actualPort = typeof address === 'object' && address ? address.port : requestedPort;
const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
console.log(`MarkLingo Settings preview: http://${displayHost}:${actualPort}/`);
console.log('Press Ctrl+C to stop the preview server.');
