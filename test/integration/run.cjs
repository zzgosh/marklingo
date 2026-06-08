const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vscode = require('vscode');

const EXTENSION_ID = 'zzgosh.marklingo';
const MODEL_ID = 'test/mock-model';
const PROVIDER_DRAFT_SETTING_VALUES = {
  'providers.openai.modelId': 'gpt-5.4-mini',
  'providers.deepseek.modelId': 'deepseek-v4-flash',
  'providers.moonshot.modelId': 'kimi-k2.6',
  'providers.glm.modelId': 'glm-4.7',
  'providers.xiaomiMimo.modelId': 'mimo-v2-flash',
};

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function extractBlocks(body) {
  const userMessage = [...body.messages].reverse().find((message) => message.role === 'user');
  assert.ok(userMessage, 'expected a user message');
  const jsonInputMarker = 'JSON input:';
  const marker = userMessage.content.includes(jsonInputMarker) ? jsonInputMarker : '---';
  const markerIndex = userMessage.content.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'expected prompt JSON marker');
  const payload = JSON.parse(userMessage.content.slice(markerIndex + marker.length).trim());
  assert.ok(Array.isArray(payload.blocks), 'expected blocks array');
  return payload.blocks;
}

async function createMockOpenRouterServer() {
  const state = {
    chatRequests: [],
    corruptPlaceholderOutput: false,
    responseShape: 'mapping',
    invalidBlocksArrayThreshold: undefined,
    translationOverrides: new Map(),
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/api/v1/models') {
        sendJson(res, 200, {
          data: [{ id: MODEL_ID, canonical_slug: MODEL_ID, context_length: 128000 }],
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/chat/completions') {
        const raw = await readRequestBody(req);
        const body = JSON.parse(raw);
        const blocks = extractBlocks(body);
        state.chatRequests.push({ body, blocks });

        const translated = {};
        const translatedBlocks = [];
        for (const block of blocks) {
          let value;
          if (state.translationOverrides.has(block.markdown)) {
            value = state.translationOverrides.get(block.markdown);
          } else if (state.corruptPlaceholderOutput && /__(?:MDT_[A-Za-z0-9_]+|M\d+)__/.test(block.markdown)) {
            value = `MOCK:${block.markdown.replace(/__(?:MDT_[A-Za-z0-9_]+|M\d+)__/g, 'BROKEN_PLACEHOLDER')}`;
          } else {
            value = `MOCK:${block.markdown}`;
          }
          translated[block.id] = value;
          translatedBlocks.push({ id: block.id, markdown: value });
        }

        if (state.responseShape === 'blocksArray') {
          if (state.invalidBlocksArrayThreshold && blocks.length > state.invalidBlocksArrayThreshold) {
            sendJson(res, 200, {
              choices: [{ message: { content: '{"blocks":[{"id":"broken","markdown":"unterminated}]}' } }],
            });
            return;
          }
          sendJson(res, 200, {
            choices: [{ message: { content: `---\n${JSON.stringify({ blocks: translatedBlocks })}` } }],
          });
          return;
        }

        sendJson(res, 200, {
          choices: [{ message: { content: JSON.stringify(translated) } }],
        });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object', 'expected server address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    state,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function workspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'expected a workspace folder');
  return folder.uri.fsPath;
}

async function cleanWorkspace() {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const root = workspaceRoot();
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
}

async function configureExtension(mockServer) {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `expected extension ${EXTENSION_ID}`);
  await extension.activate();

  return configureMockProvider(mockServer);
}

async function configureMockProvider(mockServer, options = {}) {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  await cfg.update('openrouter.provider', 'openaiCompatible', vscode.ConfigurationTarget.Global);
  await cfg.update('openrouter.baseUrl', mockServer.baseUrl, vscode.ConfigurationTarget.Global);
  await cfg.update('openrouter.modelId', options.modelId ?? MODEL_ID, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.openaiCompatible.baseUrl', mockServer.baseUrl, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.openaiCompatible.modelId', options.modelId ?? MODEL_ID, vscode.ConfigurationTarget.Global);
  await cfg.update('translation.targetLanguage', 'English', vscode.ConfigurationTarget.Global);
  await cfg.update('translation.requestMode', 'auto', vscode.ConfigurationTarget.Global);

  const seeded = await vscode.commands.executeCommand('marklingo.test.seedState', {
    apiKey: options.apiKey ?? 'test-key',
    skipVerifiedAdapterMode: options.skipVerifiedAdapterMode,
    verifiedAdapterMode: options.verifiedAdapterMode,
  });
  assert.equal(seeded.origin, new URL(mockServer.baseUrl).origin);
  return seeded;
}

async function clearProviderConfiguration() {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  await cfg.update('openrouter.provider', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('openrouter.baseUrl', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('openrouter.modelId', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.openrouter.modelId', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.openai.modelId', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.deepseek.modelId', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.moonshot.modelId', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.glm.modelId', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.xiaomiMimo.modelId', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.openaiCompatible.baseUrl', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('providers.openaiCompatible.modelId', undefined, vscode.ConfigurationTarget.Global);
}

async function writeMarkdown(name, content) {
  const uri = vscode.Uri.file(path.join(workspaceRoot(), name));
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  return uri;
}

async function replaceMarkdown(uri, content) {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), content);
  const applied = await vscode.workspace.applyEdit(edit);
  assert.equal(applied, true);
  await doc.save();
}

async function translate(uri, languageId) {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  let doc = await vscode.workspace.openTextDocument(uri);
  if (languageId) {
    doc = await vscode.languages.setTextDocumentLanguage(doc, languageId);
  }
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('marklingo.translateCurrentMarkdown');
}

async function withWindowMessageStubs(stubs, fn) {
  const originals = {};
  for (const [key, stub] of Object.entries(stubs)) {
    originals[key] = vscode.window[key];
    vscode.window[key] = stub;
    assert.equal(vscode.window[key], stub, `expected vscode.window.${key} to be stubbed`);
  }

  try {
    return await fn();
  } finally {
    for (const [key, original] of Object.entries(originals)) {
      vscode.window[key] = original;
    }
  }
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(Symbol.for('timeout')), ms));
}

function translatedPath(sourceUri, suffix = 'en') {
  const parsed = path.parse(sourceUri.fsPath);
  return path.join(parsed.dir, `${parsed.name}_${suffix}_mdt.md`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function openTabFilePaths() {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map((tab) => tab.input?.uri?.fsPath)
    .filter(Boolean);
}

function findMetasForSource(globalStorageUri, sourceUri) {
  const root = vscode.Uri.parse(globalStorageUri).fsPath;
  const matches = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.meta.json')) {
        const meta = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
        if (meta.sourceUri === sourceUri.toString()) {
          matches.push({ path: entryPath, meta });
        }
      }
    }
  };
  visit(root);
  return matches;
}

function findMetaForSource(globalStorageUri, sourceUri) {
  const matches = findMetasForSource(globalStorageUri, sourceUri);
  assert.equal(matches.length, 1, `expected one meta file for ${sourceUri.toString()}`);
  return matches[0];
}

async function testTranslatesMarkdownAndWritesDebugMeta(context) {
  await cleanWorkspace();
  const source = await writeMarkdown('translate.md', '# Title\n\nSee [docs](https://example.com).\n');

  context.server.state.chatRequests = [];
  await translate(source);

  const output = readText(translatedPath(source));
  assert.match(output, /MOCK:# Title/);
  assert.match(output, /MOCK:See \[docs\]\(https:\/\/example\.com\)\./);
  assert.ok(fs.existsSync(translatedPath(source)), 'expected language-suffixed translated file');
  assert.ok(
    vscode.window.visibleTextEditors.some((editor) => editor.document.uri.fsPath === translatedPath(source)),
    'expected translated Markdown file to be open as a visible editor',
  );

  const request = context.server.state.chatRequests[0];
  assert.equal(request.body.stream, false);
  assert.equal(Object.hasOwn(request.body, 'reasoning'), false);
  assert.equal(request.body.response_format.type, 'json_object');
  assert.equal(request.body.messages[0].role, 'system');
  assert.equal(request.body.messages[1].role, 'user');

  const { path: metaPath, meta } = findMetaForSource(context.seeded.globalStorageUri, source);
  assert.match(path.basename(metaPath), /_en_[a-f0-9]+_mdt\.meta\.json$/);
  assert.equal(meta.debug.status, 'success');
  assert.equal(meta.debug.settings.request.stream, false);
  assert.equal(meta.debug.settings.request.reasoning, undefined);
  assert.equal(meta.debug.result.warningCount, 0);
  assert.ok(!JSON.stringify(meta.debug).includes('test-key'), 'debug metadata must not include the API key');
}

async function testTranslationModelModeParsesBlocksArrayAndSplitsInvalidChunks(context) {
  await cleanWorkspace();
  const source = await writeMarkdown(
    'translation-model.md',
    [
      '# One',
      '',
      'Second paragraph.',
      '',
      'Third paragraph.',
      '',
      'Fourth paragraph.',
      '',
      'Fifth paragraph.',
      '',
    ].join('\n'),
  );

  const cfg = vscode.workspace.getConfiguration('marklingo');
  await cfg.update('translation.requestMode', 'translationModel', vscode.ConfigurationTarget.Global);
  await cfg.update('translation.translationModelMaxBlocksPerRequest', 4, vscode.ConfigurationTarget.Global);
  await cfg.update('translation.translationModelConcurrency', 1, vscode.ConfigurationTarget.Global);

  context.server.state.responseShape = 'blocksArray';
  context.server.state.invalidBlocksArrayThreshold = 3;
  context.server.state.chatRequests = [];
  try {
    await translate(source);
  } finally {
    await cfg.update('translation.requestMode', 'auto', vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelMaxBlocksPerRequest', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelConcurrency', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelMaxOutputTokens', undefined, vscode.ConfigurationTarget.Global);
    context.server.state.responseShape = 'mapping';
    context.server.state.invalidBlocksArrayThreshold = undefined;
  }

  assert.equal(context.server.state.chatRequests.length, 4, 'expected invalid 4-block chunk to be split into two 2-block retries');
  assert.equal(context.server.state.chatRequests[0].blocks.length, 4);
  assert.equal(context.server.state.chatRequests[1].blocks.length, 2);
  assert.equal(context.server.state.chatRequests[2].blocks.length, 2);
  assert.equal(context.server.state.chatRequests[3].blocks.length, 1);
  assert.ok(!Object.hasOwn(context.server.state.chatRequests[0].body, 'reasoning'), 'expected translation-model mode to omit reasoning');
  assert.equal(context.server.state.chatRequests[0].body.temperature, 0.7);
  assert.equal(context.server.state.chatRequests[0].body.top_p, 0.6);
  assert.equal(context.server.state.chatRequests[0].body.max_tokens, 8192);
  assert.equal(context.server.state.chatRequests[0].body.response_format.type, 'json_object');
  assert.match(context.server.state.chatRequests[0].body.messages.at(-1).content, /JSON input:/);

  const output = readText(translatedPath(source));
  assert.match(output, /MOCK:# One/);
  assert.match(output, /MOCK:Second paragraph\./);
  assert.match(output, /MOCK:Fifth paragraph\./);

  const { meta } = findMetaForSource(context.seeded.globalStorageUri, source);
  assert.equal(meta.debug.settings.adapterMode, 'translationModel');
  assert.equal(meta.debug.plan.chunkCount, 2);
  assert.equal(meta.debug.plan.actualRequestCount, 4);
  assert.equal(meta.debug.plan.chunks[0].maxTokens, 8192);
  assert.equal(meta.debug.result.warningCount, 0);
}

async function testTranslationModelModeRetriesOnlyFailedBlocks(context) {
  await cleanWorkspace();
  const source = await writeMarkdown(
    'translation-model-partial-retry.md',
    [
      '# Good',
      '',
      'Plain paragraph.',
      '',
      '[Docs](https://example.com)',
      '',
    ].join('\n'),
  );

  const cfg = vscode.workspace.getConfiguration('marklingo');
  await cfg.update('translation.requestMode', 'translationModel', vscode.ConfigurationTarget.Global);
  await cfg.update('translation.translationModelMaxBlocksPerRequest', 4, vscode.ConfigurationTarget.Global);
  await cfg.update('translation.translationModelConcurrency', 1, vscode.ConfigurationTarget.Global);

  context.server.state.responseShape = 'blocksArray';
  context.server.state.corruptPlaceholderOutput = true;
  context.server.state.chatRequests = [];
  try {
    await translate(source);
  } finally {
    await cfg.update('translation.requestMode', 'auto', vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelMaxBlocksPerRequest', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelConcurrency', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelMaxOutputTokens', undefined, vscode.ConfigurationTarget.Global);
    context.server.state.responseShape = 'mapping';
    context.server.state.corruptPlaceholderOutput = false;
  }

  assert.equal(context.server.state.chatRequests.length, 2, 'expected only the failed placeholder block to be retried');
  assert.equal(context.server.state.chatRequests[0].blocks.length, 3);
  assert.equal(context.server.state.chatRequests[1].blocks.length, 1);
  assert.match(context.server.state.chatRequests[1].blocks[0].markdown, /__M\d+__/);

  const output = readText(translatedPath(source));
  assert.match(output, /MOCK:# Good/);
  assert.match(output, /MOCK:Plain paragraph\./);
  assert.match(output, /\[Docs\]\(https:\/\/example\.com\)/);
  assert.doesNotMatch(output, /MOCK:\[Docs\]/);

  const { meta } = findMetaForSource(context.seeded.globalStorageUri, source);
  assert.equal(meta.debug.plan.actualRequestCount, 2);
  assert.equal(meta.debug.result.warningCount, 1);
}

async function testTranslationModelModeSplitRetriesRepeatedValidationFailures(context) {
  await cleanWorkspace();
  const source = await writeMarkdown(
    'translation-model-repeated-validation-failures.md',
    [
      '# Good',
      '',
      '[First](https://first.example.com)',
      '',
      '[Second](https://second.example.com)',
      '',
    ].join('\n'),
  );

  const cfg = vscode.workspace.getConfiguration('marklingo');
  await cfg.update('translation.requestMode', 'translationModel', vscode.ConfigurationTarget.Global);
  await cfg.update('translation.translationModelMaxBlocksPerRequest', 4, vscode.ConfigurationTarget.Global);
  await cfg.update('translation.translationModelConcurrency', 1, vscode.ConfigurationTarget.Global);

  context.server.state.responseShape = 'blocksArray';
  context.server.state.corruptPlaceholderOutput = true;
  context.server.state.chatRequests = [];
  try {
    await translate(source);
  } finally {
    await cfg.update('translation.requestMode', 'auto', vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelMaxBlocksPerRequest', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelConcurrency', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelMaxOutputTokens', undefined, vscode.ConfigurationTarget.Global);
    context.server.state.responseShape = 'mapping';
    context.server.state.corruptPlaceholderOutput = false;
  }

  assert.equal(context.server.state.chatRequests.length, 3, 'expected two failed blocks to be split into bounded single-block retries');
  assert.equal(context.server.state.chatRequests[0].blocks.length, 3);
  assert.equal(context.server.state.chatRequests[1].blocks.length, 1);
  assert.equal(context.server.state.chatRequests[2].blocks.length, 1);

  const output = readText(translatedPath(source));
  assert.match(output, /MOCK:# Good/);
  assert.match(output, /\[First\]\(https:\/\/first\.example\.com\)/);
  assert.match(output, /\[Second\]\(https:\/\/second\.example\.com\)/);
  assert.doesNotMatch(output, /MOCK:\[First\]/);
  assert.doesNotMatch(output, /MOCK:\[Second\]/);

  const { meta } = findMetaForSource(context.seeded.globalStorageUri, source);
  assert.equal(meta.debug.plan.actualRequestCount, 3);
  assert.equal(meta.debug.result.warningCount, 2);
}

async function testTranslatesFolderMarkdownFiles(context) {
  await cleanWorkspace();
  const folder = vscode.Uri.file(path.join(workspaceRoot(), 'docs'));
  const first = await writeMarkdown('docs/first.md', '# First\n\nTranslate the first file.\n');
  const second = await writeMarkdown('docs/nested/second.markdown', '# Second\n\nTranslate the nested file.\n');
  const generated = await writeMarkdown('docs/existing_en_mdt.md', '# Existing output\n\nDo not translate this generated file.\n');
  await writeMarkdown('docs/.git/config.md', '# Git\n\nDo not scan this directory.\n');
  await writeMarkdown('docs/node_modules/package.md', '# Dependency\n\nDo not scan this directory.\n');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(workspaceRoot(), 'docs', 'notes.txt')), Buffer.from('Not Markdown.\n', 'utf8'));

  await withWindowMessageStubs(
    {
      showWarningMessage: async (message, _options, action) => {
        assert.match(message, /Translate 2 files/);
        assert.match(message, /docs and subfolders/);
        return action;
      },
      showInformationMessage: async () => undefined,
    },
    async () => {
      await vscode.commands.executeCommand('marklingo.translateFolderMarkdown', folder);
    },
  );

  assert.equal(context.server.state.chatRequests.length, 2);
  assert.match(readText(translatedPath(first)), /MOCK:# First/);
  assert.match(readText(translatedPath(second)), /MOCK:# Second/);
  assert.equal(
    fs.existsSync(path.join(path.dirname(generated.fsPath), 'existing_en_mdt_en_mdt.md')),
    false,
    'expected generated Markdown output to be skipped',
  );

  const openTabs = openTabFilePaths();
  assert.ok(openTabs.includes(translatedPath(first)), 'expected first translated file to be opened as a tab');
  assert.ok(!openTabs.includes(translatedPath(second)), 'expected later batch output not to be opened as a tab');
  assert.equal(
    fs.existsSync(translatedPath(vscode.Uri.file(path.join(workspaceRoot(), 'docs', '.git', 'config.md')))),
    false,
    'expected .git Markdown files to be skipped',
  );
  assert.equal(
    fs.existsSync(translatedPath(vscode.Uri.file(path.join(workspaceRoot(), 'docs', 'node_modules', 'package.md')))),
    false,
    'expected node_modules Markdown files to be skipped',
  );
}

async function testTranslatesExplorerSelectedMarkdownFile(context) {
  await cleanWorkspace();
  const source = await writeMarkdown('explorer-selected.md', '# Explorer\n\nTranslate without opening the source first.\n');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');

  await vscode.commands.executeCommand('marklingo.translateExplorerMarkdownFile', source);

  assert.equal(context.server.state.chatRequests.length, 1);
  assert.match(readText(translatedPath(source)), /MOCK:# Explorer/);
  assert.ok(openTabFilePaths().includes(translatedPath(source)), 'expected translated Explorer-selected file to be opened as a tab');
}

async function testTranslatesExplorerMultiSelectedMarkdownResources(context) {
  await cleanWorkspace();
  const clicked = await writeMarkdown('multi/clicked.md', '# Clicked\n\nTranslate the clicked file.\n');
  const other = await writeMarkdown('multi/other.markdown', '# Other\n\nTranslate the other selected file.\n');
  await writeMarkdown('multi/ignore.txt', 'Not Markdown.\n');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');

  await withWindowMessageStubs(
    {
      showWarningMessage: async (message, _options, action) => {
        assert.match(message, /Translate 2 files from the selected Explorer items/);
        return action;
      },
      showInformationMessage: async () => undefined,
    },
    async () => {
      await vscode.commands.executeCommand('marklingo.translateSelectedMarkdownResources', clicked, [clicked, other]);
    },
  );

  assert.equal(context.server.state.chatRequests.length, 2);
  assert.match(readText(translatedPath(clicked)), /MOCK:# Clicked/);
  assert.match(readText(translatedPath(other)), /MOCK:# Other/);

  const openTabs = openTabFilePaths();
  assert.ok(openTabs.includes(translatedPath(clicked)), 'expected first selected output to be opened');
  assert.ok(!openTabs.includes(translatedPath(other)), 'expected later selected outputs not to be opened');
}

async function testFolderTranslationReusesCachedFiles(context) {
  await cleanWorkspace();
  const folder = vscode.Uri.file(path.join(workspaceRoot(), 'cached-docs'));
  const cached = await writeMarkdown('cached-docs/cached.md', '# Cached\n\nReuse this cached translation.\n');
  const fresh = await writeMarkdown('cached-docs/fresh.md', '# Fresh\n\nTranslate this fresh file.\n');

  await translate(cached);
  assert.equal(context.server.state.chatRequests.length, 1);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  context.server.state.chatRequests = [];

  await withWindowMessageStubs(
    {
      showWarningMessage: async (_message, _options, action) => action,
      showInformationMessage: async () => undefined,
    },
    async () => {
      await vscode.commands.executeCommand('marklingo.translateFolderMarkdown', folder);
    },
  );

  assert.equal(context.server.state.chatRequests.length, 1, 'expected only the uncached file to call OpenRouter');
  assert.match(context.server.state.chatRequests[0].blocks.map((block) => block.markdown).join('\n'), /Fresh/);
  assert.ok(fs.existsSync(translatedPath(cached)), 'expected cached output to be rewritten from cache');
  assert.ok(fs.existsSync(translatedPath(fresh)), 'expected fresh output to be written');
}

async function testFolderCommandRequiresExplorerResource() {
  await cleanWorkspace();

  await withWindowMessageStubs(
    {
      showErrorMessage: async (message) => {
        assert.match(message, /Right-click a folder in the Explorer/);
      },
    },
    async () => {
      await vscode.commands.executeCommand('marklingo.translateFolderMarkdown');
    },
  );
}

async function testTranslatesFrontmatterValues(context) {
  await cleanWorkspace();
  const source = await writeMarkdown(
    'frontmatter.md',
    [
      '---',
      'name: codex-screen-recording',
      'literal: |',
      '  title: literal-machine-name',
      'build:',
      '  description: internal build description',
      'description: Record precise macOS screen evidence.',
      'draft: false',
      '---',
      '',
      '# Overview',
      '',
      'Translate the body.',
      '',
    ].join('\n'),
  );

  context.server.state.chatRequests = [];
  context.server.state.translationOverrides = new Map([['Record precise macOS screen evidence.', 'MOCK: Record precise macOS screen evidence.']]);
  await translate(source);

  const output = readText(translatedPath(source));
  assert.match(output, /name: codex-screen-recording/);
  assert.match(output, /title: literal-machine-name/);
  assert.match(output, /description: internal build description/);
  assert.match(output, /description: "MOCK: Record precise macOS screen evidence\."/);
  assert.match(output, /draft: false/);
  assert.match(output, /MOCK:# Overview/);
  assert.match(output, /MOCK:Translate the body\./);

  const blocks = context.server.state.chatRequests.flatMap((request) => request.blocks);
  assert.ok(blocks.some((block) => block.markdown === 'Record precise macOS screen evidence.'));
  assert.ok(!blocks.some((block) => block.markdown.includes('codex-screen-recording')));
  assert.ok(!blocks.some((block) => block.markdown.includes('literal-machine-name')));
  assert.ok(!blocks.some((block) => block.markdown.includes('internal build description')));
  assert.ok(!blocks.some((block) => block.markdown.includes('name:')));
  assert.ok(!blocks.some((block) => block.markdown.includes('draft: false')));
  context.server.state.translationOverrides = new Map();
}

async function testReusesCachedTranslations(context) {
  await cleanWorkspace();
  const source = await writeMarkdown('cache.md', '# Title\n\nFirst paragraph.\n');

  context.server.state.chatRequests = [];
  await translate(source);
  assert.equal(context.server.state.chatRequests.length, 1);

  await replaceMarkdown(source, '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n');
  context.server.state.chatRequests = [];
  await translate(source);

  assert.equal(context.server.state.chatRequests.length, 1);
  assert.equal(context.server.state.chatRequests[0].blocks.length, 1);
  assert.match(context.server.state.chatRequests[0].blocks[0].markdown, /Second paragraph/);
}

async function testCompactsPrivateCacheIntoTrackingStubs(context) {
  await cleanWorkspace();
  await vscode.commands.executeCommand('marklingo.test.deleteProjectTranslationData', {
    projectUri: vscode.Uri.file(workspaceRoot()).toString(),
  });
  const olderSource = await writeMarkdown('storage-old.md', '# Storage\n\nKeep this older cached paragraph.\n');

  context.server.state.chatRequests = [];
  await translate(olderSource);
  assert.equal(context.server.state.chatRequests.length, 1);

  await new Promise((resolve) => setTimeout(resolve, 20));
  const newerSource = await writeMarkdown('storage-new.md', '# Storage\n\nKeep this newer cached paragraph.\n');
  context.server.state.chatRequests = [];
  await translate(newerSource);
  assert.equal(context.server.state.chatRequests.length, 1);

  const olderOutput = translatedPath(olderSource);
  const newerOutput = translatedPath(newerSource);
  const { meta: olderActiveMeta } = findMetaForSource(context.seeded.globalStorageUri, olderSource);
  const { meta: newerActiveMeta } = findMetaForSource(context.seeded.globalStorageUri, newerSource);
  assert.equal(olderActiveMeta.cache.payloadStatus, 'active');
  assert.equal(newerActiveMeta.cache.payloadStatus, 'active');
  assert.ok(olderActiveMeta.outputHash, 'expected active meta to track output hash');
  assert.ok(Object.keys(olderActiveMeta.translations).length > 0, 'expected active meta to cache translations');
  assert.ok(olderActiveMeta.segments.length > 0, 'expected active meta to track translated segment hashes');
  assert.equal(olderActiveMeta.segments.some((segment) => Object.hasOwn(segment, 'source')), false, 'expected slim meta segments to omit source text');

  const statsBefore = await vscode.commands.executeCommand('marklingo.test.readPrivateStorageStats');
  assert.ok(statsBefore.activeCacheCount >= 2, 'expected active cache entries before compaction');

  const lruSummary = await vscode.commands.executeCommand('marklingo.test.compactPrivateStorage', { targetBytes: statsBefore.totalBytes - 1 });
  assert.equal(lruSummary.evictedEntries, 1, 'expected quota compaction to evict only the least recently used cache payload');
  assert.equal(findMetaForSource(context.seeded.globalStorageUri, olderSource).meta.cache.payloadStatus, 'evicted');
  assert.equal(findMetaForSource(context.seeded.globalStorageUri, newerSource).meta.cache.payloadStatus, 'active');

  const summary = await vscode.commands.executeCommand('marklingo.test.compactPrivateStorage', { targetBytes: 0 });
  assert.ok(summary.evictedEntries >= 1, 'expected compaction to evict at least one cache payload');
  assert.ok(summary.reclaimedBytes > 0, 'expected compaction to reclaim bytes');

  const { meta: stubMeta } = findMetaForSource(context.seeded.globalStorageUri, olderSource);
  assert.equal(stubMeta.cache.payloadStatus, 'evicted');
  assert.equal(stubMeta.outputUri, vscode.Uri.file(olderOutput).toString());
  assert.equal(stubMeta.outputHash, olderActiveMeta.outputHash);
  assert.deepEqual(stubMeta.segments, []);
  assert.deepEqual(stubMeta.translations, {});
  assert.equal(stubMeta.debug, undefined);
  assert.ok(fs.existsSync(olderOutput), 'expected visible translated output to remain after cache compaction');
  assert.ok(fs.existsSync(newerOutput), 'expected newer visible translated output to remain after cache compaction');

  context.server.state.chatRequests = [];
  await translate(olderSource);
  assert.equal(context.server.state.chatRequests.length, 1, 'expected translation to call the model after cache payload eviction');
  assert.ok(context.server.state.chatRequests[0].blocks.length > 0);
  const { meta: rewrittenMeta } = findMetaForSource(context.seeded.globalStorageUri, olderSource);
  assert.equal(rewrittenMeta.cache.payloadStatus, 'active');
  assert.ok(Object.keys(rewrittenMeta.translations).length > 0);
  assert.equal(rewrittenMeta.segments.some((segment) => Object.hasOwn(segment, 'source')), false);
}

async function testTranslatesMarkdownExtensionWithNonMarkdownLanguageMode(context) {
  await cleanWorkspace();
  const source = await writeMarkdown('SKILL.md', '# Skill\n\nTranslate this file.\n');

  context.server.state.chatRequests = [];
  await translate(source, 'plaintext');

  const output = readText(translatedPath(source));
  assert.match(output, /MOCK:# Skill/);
  assert.equal(context.server.state.chatRequests.length, 1);
}

async function testRetriesFallbackBlocks(context) {
  await cleanWorkspace();
  const source = await writeMarkdown('fallback.md', 'See [docs](https://example.com).\n');

  context.server.state.corruptPlaceholderOutput = true;
  context.server.state.chatRequests = [];
  await translate(source);

  const firstOutput = readText(translatedPath(source));
  assert.equal(firstOutput, 'See [docs](https://example.com).\n');
  const firstMeta = findMetaForSource(context.seeded.globalStorageUri, source).meta;
  assert.equal(firstMeta.debug.result.fallbackBlocks, 1);
  assert.equal(Object.keys(firstMeta.translations).length, 0);

  context.server.state.corruptPlaceholderOutput = false;
  context.server.state.chatRequests = [];
  await translate(source);

  assert.equal(context.server.state.chatRequests.length, 1);
  assert.equal(context.server.state.chatRequests[0].blocks.length, 1);
  const secondOutput = readText(translatedPath(source));
  assert.match(secondOutput, /MOCK:See \[docs\]\(https:\/\/example\.com\)\./);
}

async function testDeletesTranslatedFilesButKeepsCurrentProjectCache(context) {
  await cleanWorkspace();
  await vscode.commands.executeCommand('marklingo.test.deleteProjectTranslationData', {
    projectUri: vscode.Uri.file(workspaceRoot()).toString(),
  });
  const source = await writeMarkdown('file-only-cleanup.md', '# Cleanup\n\nCached paragraph.\n');

  context.server.state.chatRequests = [];
  await translate(source);
  assert.equal(context.server.state.chatRequests.length, 1);
  const output = translatedPath(source);
  assert.ok(fs.existsSync(output), 'expected current project output before file-only cleanup');
  fs.appendFileSync(output, '\nManual edit before file-only cleanup.\n', 'utf8');
  const firstMeta = findMetaForSource(context.seeded.globalStorageUri, source).meta;
  assert.equal(firstMeta.cache.payloadStatus, 'active');

  const summary = await vscode.commands.executeCommand('marklingo.test.deleteProjectTranslationData', {
    projectUri: source.toString(),
    workspaceOutputs: true,
    metadataCache: false,
  });

  assert.equal(summary.deleted, 1);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.missing, 0);
  assert.equal(summary.errors.length, 0);
  assert.equal(summary.metadataCacheCleared, false);
  assert.equal(fs.existsSync(output), false, 'expected edited current project output to be deleted');
  assert.equal(findMetasForSource(context.seeded.globalStorageUri, source).length, 1);

  context.server.state.chatRequests = [];
  await translate(source);
  assert.equal(context.server.state.chatRequests.length, 0, 'expected cached translations to rebuild the deleted output');
  assert.ok(fs.existsSync(output), 'expected cached translation to recreate the output file');
}

async function testCommandDeletesTranslatedFilesButKeepsCurrentProjectCache(context) {
  await cleanWorkspace();
  await vscode.commands.executeCommand('marklingo.test.deleteProjectTranslationData', {
    projectUri: vscode.Uri.file(workspaceRoot()).toString(),
  });
  const source = await writeMarkdown('command-file-only-cleanup.md', '# Cleanup\n\nCommand cached paragraph.\n');

  context.server.state.chatRequests = [];
  await translate(source);
  assert.equal(context.server.state.chatRequests.length, 1);
  const output = translatedPath(source);
  assert.ok(fs.existsSync(output), 'expected current project output before command cleanup');
  fs.appendFileSync(output, '\nManual edit before command cleanup.\n', 'utf8');

  const messages = { warnings: [], infos: [] };
  await withWindowMessageStubs({
    showWarningMessage: async (message, ...items) => {
      messages.warnings.push(String(message));
      return items.includes('Delete') ? 'Delete' : undefined;
    },
    showInformationMessage: async (message) => {
      messages.infos.push(String(message));
      return undefined;
    },
  }, async () => {
    const doc = await vscode.workspace.openTextDocument(source);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('marklingo.deleteCurrentProjectTranslatedFiles');
  });

  assert.deepEqual(messages.warnings, [
    "MarkLingo: Delete this project's tracked translated Markdown files, including files edited after generation?",
  ]);
  assert.ok(!messages.warnings[0].includes('metadata/cache'), 'expected confirmation copy to omit metadata/cache');
  assert.equal(fs.existsSync(output), false, 'expected command to delete edited current project output');
  assert.equal(findMetasForSource(context.seeded.globalStorageUri, source).length, 1, 'expected command to keep metadata cache');
  assert.match(messages.infos.at(-1) ?? '', /Translation metadata\/cache was kept/);

  context.server.state.chatRequests = [];
  await translate(source);
  assert.equal(context.server.state.chatRequests.length, 0, 'expected cached translations to rebuild the deleted output');
  assert.ok(fs.existsSync(output), 'expected cached translation to recreate the output file');
}

async function testDeletesCurrentProjectTranslations(context) {
  await cleanWorkspace();
  await vscode.commands.executeCommand('marklingo.test.deleteProjectTranslationData', {
    projectUri: vscode.Uri.file(workspaceRoot()).toString(),
  });
  const source = await writeMarkdown('cleanup.md', '# Cleanup\n\nWorkspace paragraph.\n');

  context.server.state.chatRequests = [];
  await translate(source);
  const output = translatedPath(source);
  assert.ok(fs.existsSync(output), 'expected current project output before cleanup');
  fs.appendFileSync(output, '\nManual edit before cleanup.\n', 'utf8');

  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marklingo-other-project-'));
  try {
    const external = vscode.Uri.file(path.join(externalRoot, 'outside.md'));
    await vscode.workspace.fs.writeFile(external, Buffer.from('# Outside\n\nOther project paragraph.\n', 'utf8'));
    await translate(external);
    const externalOutput = translatedPath(external);
    assert.ok(fs.existsSync(externalOutput), 'expected other project output before cleanup');
    fs.appendFileSync(externalOutput, '\nOther project manual edit.\n', 'utf8');

    const summary = await vscode.commands.executeCommand('marklingo.test.deleteProjectTranslationData', {
      projectUri: source.toString(),
    });

    assert.equal(summary.deleted, 1);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.missing, 0);
    assert.equal(summary.errors.length, 0);
    assert.equal(fs.existsSync(output), false, 'expected edited current project output to be deleted');
    assert.equal(fs.existsSync(externalOutput), true, 'expected other project output to remain');
    assert.equal(findMetasForSource(context.seeded.globalStorageUri, source).length, 0);
    assert.equal(findMetasForSource(context.seeded.globalStorageUri, external).length, 1);
  } finally {
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
}

async function testClearAllDataDoesNotWaitForNotification() {
  const { clearExtensionDataScopes } = await import(pathToFileURL(
    path.join(__dirname, '..', '..', 'out', 'commands', 'clearExtensionData.js'),
  ).href);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marklingo-cleanup-test-'));
  const fakeContext = {
    secrets: {
      delete: async () => undefined,
    },
    globalState: {
      get: () => [],
      update: async () => undefined,
    },
    globalStorageUri: vscode.Uri.file(tempDir),
  };

  try {
    let notificationShown = false;
    await withWindowMessageStubs({
      showInformationMessage: async () => {
        notificationShown = true;
        return new Promise(() => undefined);
      },
    }, async () => {
      const result = await Promise.race([
        clearExtensionDataScopes(fakeContext, { apiKeys: true }),
        timeout(1000),
      ]);
      assert.equal(result, true);
    });

    assert.equal(notificationShown, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createMemoryExtensionContext() {
  const secrets = new Map();
  const globalState = new Map();
  return {
    secrets: {
      get: async (key) => secrets.get(key),
      store: async (key, value) => {
        secrets.set(key, value);
      },
      delete: async (key) => {
        secrets.delete(key);
      },
    },
    globalState: {
      get: (key) => globalState.get(key),
      update: async (key, value) => {
        if (value === undefined) {
          globalState.delete(key);
        } else {
          globalState.set(key, value);
        }
      },
    },
  };
}

async function testCommandProviderSetupOpensSettingsWhenProviderNeverSaved(context) {
  const { getOpenRouterSettings, DEFAULT_OPENROUTER_BASE_URL } = await import(pathToFileURL(
    path.join(__dirname, '..', '..', 'out', 'services', 'openRouterClient.js'),
  ).href);
  const cfg = vscode.workspace.getConfiguration('marklingo');
  await clearProviderConfiguration();
  await cfg.update('openrouter.baseUrl', DEFAULT_OPENROUTER_BASE_URL, vscode.ConfigurationTarget.Global);

  const commandCalls = [];
  const warnings = [];
  const originalExecuteCommand = vscode.commands.executeCommand;
  const fakeContext = createMemoryExtensionContext();

  try {
    vscode.commands.executeCommand = async (command, ...args) => {
      commandCalls.push([command, ...args]);
      return undefined;
    };

    await withWindowMessageStubs({
      showQuickPick: async () => {
        throw new Error('Expected provider setup to open Settings without a QuickPick.');
      },
      showInputBox: async () => {
        throw new Error('Expected provider setup to open Settings without an input box.');
      },
      showWarningMessage: async (message) => {
        warnings.push(message);
      },
    }, async () => {
      await assert.rejects(
        () => getOpenRouterSettings(fakeContext),
        (error) => error instanceof vscode.CancellationError,
      );
    });

    assert.deepEqual(commandCalls, [['marklingo.openSettings']]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /needs a verified provider before translating/);
  } finally {
    vscode.commands.executeCommand = originalExecuteCommand;
    await configureMockProvider(context.server);
  }
}

async function testDefaultOpenRouterSetupWorksWithoutProviderSelector(context) {
  const {
    DEFAULT_OPENROUTER_BASE_URL,
    getOpenRouterSettings,
    storeOpenRouterApiKey,
  } = await import(pathToFileURL(
    path.join(__dirname, '..', '..', 'out', 'services', 'openRouterClient.js'),
  ).href);
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const fakeContext = createMemoryExtensionContext();
  const originalExecuteCommand = vscode.commands.executeCommand;

  try {
    await clearProviderConfiguration();
    await cfg.update('openrouter.baseUrl', DEFAULT_OPENROUTER_BASE_URL, vscode.ConfigurationTarget.Global);
    await cfg.update('openrouter.modelId', MODEL_ID, vscode.ConfigurationTarget.Global);
    await storeOpenRouterApiKey(fakeContext, 'test-key', DEFAULT_OPENROUTER_BASE_URL);

    vscode.commands.executeCommand = async (command, ...args) => {
      if (command === 'marklingo.openSettings') {
        throw new Error('Expected saved default OpenRouter setup to skip Settings.');
      }
      return originalExecuteCommand(command, ...args);
    };

    const settings = await getOpenRouterSettings(fakeContext);

    assert.equal(settings.providerType, 'openrouter');
    assert.equal(settings.baseUrl, DEFAULT_OPENROUTER_BASE_URL);
    assert.equal(settings.modelId, MODEL_ID);
    assert.equal(settings.apiKey, 'test-key');
  } finally {
    vscode.commands.executeCommand = originalExecuteCommand;
    await configureMockProvider(context.server);
  }
}

async function testCommandProviderSetupOpensSettingsForIncompleteProviderConfiguration(context) {
  const { getOpenRouterSettings } = await import(pathToFileURL(
    path.join(__dirname, '..', '..', 'out', 'services', 'openRouterClient.js'),
  ).href);
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const commandCalls = [];
  const warnings = [];
  const originalExecuteCommand = vscode.commands.executeCommand;
  const fakeContext = createMemoryExtensionContext();

  const scenarios = [
    {
      name: 'missing required API key',
      setup: async () => {
        await cfg.update('openrouter.provider', 'openai', vscode.ConfigurationTarget.Global);
        await cfg.update('providers.openai.modelId', 'gpt-5.4-mini', vscode.ConfigurationTarget.Global);
      },
    },
    {
      name: 'missing custom Base URL',
      setup: async () => {
        await cfg.update('openrouter.provider', 'openaiCompatible', vscode.ConfigurationTarget.Global);
        await cfg.update('providers.openaiCompatible.modelId', MODEL_ID, vscode.ConfigurationTarget.Global);
      },
    },
    {
      name: 'missing custom Model ID',
      setup: async () => {
        await cfg.update('openrouter.provider', 'openaiCompatible', vscode.ConfigurationTarget.Global);
        await cfg.update('providers.openaiCompatible.baseUrl', context.server.baseUrl, vscode.ConfigurationTarget.Global);
      },
    },
  ];

  try {
    vscode.commands.executeCommand = async (command, ...args) => {
      commandCalls.push([command, ...args]);
      return undefined;
    };

    await withWindowMessageStubs({
      showQuickPick: async () => {
        throw new Error('Expected incomplete provider setup to open Settings without a QuickPick.');
      },
      showInputBox: async () => {
        throw new Error('Expected incomplete provider setup to open Settings without an input box.');
      },
      showWarningMessage: async (message) => {
        warnings.push(message);
      },
    }, async () => {
      for (const scenario of scenarios) {
        commandCalls.length = 0;
        warnings.length = 0;
        await clearProviderConfiguration();
        await scenario.setup();

        await assert.rejects(
          () => getOpenRouterSettings(fakeContext),
          (error) => error instanceof vscode.CancellationError,
          scenario.name,
        );

        assert.deepEqual(commandCalls, [['marklingo.openSettings']], scenario.name);
        assert.equal(warnings.length, 1, scenario.name);
        assert.match(warnings[0], /needs a verified provider before translating/, scenario.name);
      }
    });
  } finally {
    vscode.commands.executeCommand = originalExecuteCommand;
    await configureMockProvider(context.server);
  }
}

async function testTranslateCommandOpensSettingsWhenProviderIsNotVerified(context) {
  await cleanWorkspace();
  const source = await writeMarkdown('unverified-provider.md', '# Setup\n\nTranslate only after verification.\n');
  await configureMockProvider(context.server, {
    modelId: 'test/unverified-model',
    skipVerifiedAdapterMode: true,
  });
  context.server.state.chatRequests = [];

  const commandCalls = [];
  const warnings = [];
  const originalExecuteCommand = vscode.commands.executeCommand;

  try {
    vscode.commands.executeCommand = async (command, ...args) => {
      if (command === 'marklingo.openSettings') {
        commandCalls.push([command, ...args]);
        return undefined;
      }
      return originalExecuteCommand(command, ...args);
    };

    await withWindowMessageStubs({
      showQuickPick: async () => {
        throw new Error('Expected unverified provider setup to skip QuickPick prompts.');
      },
      showInputBox: async () => {
        throw new Error('Expected unverified provider setup to skip input prompts.');
      },
      showWarningMessage: async (message) => {
        warnings.push(message);
      },
      showErrorMessage: async (message) => {
        throw new Error(`Expected provider setup cancellation, not an error notification: ${message}`);
      },
    }, async () => {
      await translate(source);
    });

    assert.deepEqual(commandCalls, [['marklingo.openSettings']]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Save and Verify/);
    assert.equal(context.server.state.chatRequests.length, 0, 'expected no translation request before provider verification');
    assert.equal(fs.existsSync(translatedPath(source)), false, 'expected no translated file before provider verification');
  } finally {
    vscode.commands.executeCommand = originalExecuteCommand;
    await configureMockProvider(context.server);
  }
}

async function testTranslateCommandOpensSettingsAfterProviderSettingsAreCleared(context) {
  await cleanWorkspace();
  const source = await writeMarkdown('cleared-settings.md', '# Cleared\n\nSettings were removed.\n');
  await configureMockProvider(context.server);
  await clearProviderConfiguration();
  context.server.state.chatRequests = [];

  const commandCalls = [];
  const originalExecuteCommand = vscode.commands.executeCommand;
  const warnings = [];

  try {
    vscode.commands.executeCommand = async (command, ...args) => {
      if (command === 'marklingo.openSettings') {
        commandCalls.push([command, ...args]);
        return undefined;
      }
      return originalExecuteCommand(command, ...args);
    };

    await withWindowMessageStubs({
      showQuickPick: async () => {
        throw new Error('Expected cleared provider settings to skip QuickPick prompts.');
      },
      showInputBox: async () => {
        throw new Error('Expected cleared provider settings to skip input prompts.');
      },
      showWarningMessage: async (message) => {
        warnings.push(message);
      },
      showErrorMessage: async (message) => {
        throw new Error(`Expected provider setup cancellation, not an error notification: ${message}`);
      },
    }, async () => {
      await translate(source);
    });

    assert.deepEqual(commandCalls, [['marklingo.openSettings']]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /needs a verified provider before translating/);
    assert.equal(context.server.state.chatRequests.length, 0, 'expected no request after provider settings were cleared');
  } finally {
    vscode.commands.executeCommand = originalExecuteCommand;
    await configureMockProvider(context.server);
  }
}

async function testProviderDraftSettingsAreRegistered() {
  try {
    for (const [key, value] of Object.entries(PROVIDER_DRAFT_SETTING_VALUES)) {
      const cfg = vscode.workspace.getConfiguration('marklingo');
      await cfg.update(key, value, vscode.ConfigurationTarget.Global);
      assert.equal(vscode.workspace.getConfiguration('marklingo').get(key), value);
    }
  } finally {
    for (const key of Object.keys(PROVIDER_DRAFT_SETTING_VALUES)) {
      await vscode.workspace.getConfiguration('marklingo').update(key, undefined, vscode.ConfigurationTarget.Global);
    }
  }
}

async function runTest(name, fn, context) {
  try {
    const cfg = vscode.workspace.getConfiguration('marklingo');
    await cfg.update('translation.requestMode', 'auto', vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelMaxBlocksPerRequest', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.translationModelConcurrency', undefined, vscode.ConfigurationTarget.Global);
    context.server.state.chatRequests = [];
    context.server.state.corruptPlaceholderOutput = false;
    context.server.state.responseShape = 'mapping';
    context.server.state.invalidBlocksArrayThreshold = undefined;
    await fn(context);
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function run() {
  const server = await createMockOpenRouterServer();
  try {
    const seeded = await configureExtension(server);
    const context = { server, seeded };
    await runTest('translates markdown through mock OpenRouter and writes debug metadata', testTranslatesMarkdownAndWritesDebugMeta, context);
    await runTest('translation-model mode parses blocks arrays and splits invalid chunks', testTranslationModelModeParsesBlocksArrayAndSplitsInvalidChunks, context);
    await runTest('translation-model mode retries only failed blocks', testTranslationModelModeRetriesOnlyFailedBlocks, context);
    await runTest('translation-model mode split-retries repeated validation failures', testTranslationModelModeSplitRetriesRepeatedValidationFailures, context);
    await runTest('translates folder markdown files through explorer command', testTranslatesFolderMarkdownFiles, context);
    await runTest('translates explorer-selected markdown file', testTranslatesExplorerSelectedMarkdownFile, context);
    await runTest('translates explorer multi-selected markdown resources', testTranslatesExplorerMultiSelectedMarkdownResources, context);
    await runTest('folder translation reuses cached files', testFolderTranslationReusesCachedFiles, context);
    await runTest('folder command requires an explorer resource', testFolderCommandRequiresExplorerResource, context);
    await runTest('translates selected YAML frontmatter values only', testTranslatesFrontmatterValues, context);
    await runTest('reuses cached translations on incremental runs', testReusesCachedTranslations, context);
    await runTest('compacts private cache into tracking stubs', testCompactsPrivateCacheIntoTrackingStubs, context);
    await runTest('translates .md files even when VS Code uses a different language mode', testTranslatesMarkdownExtensionWithNonMarkdownLanguageMode, context);
    await runTest('retries fallback blocks instead of caching source fallback', testRetriesFallbackBlocks, context);
    await runTest('deletes current project translated files while keeping metadata cache', testDeletesTranslatedFilesButKeepsCurrentProjectCache, context);
    await runTest('command deletes current project translated files while keeping metadata cache', testCommandDeletesTranslatedFilesButKeepsCurrentProjectCache, context);
    await runTest('deletes current project translations without skipping edited outputs', testDeletesCurrentProjectTranslations, context);
    await runTest('clear all data does not wait for notification dismissal', testClearAllDataDoesNotWaitForNotification, context);
    await runTest('provider draft settings are registered and writable', testProviderDraftSettingsAreRegistered, context);
    await runTest('default OpenRouter setup works without provider selector', testDefaultOpenRouterSetupWorksWithoutProviderSelector, context);
    await runTest('command provider setup opens Settings when no provider was saved', testCommandProviderSetupOpensSettingsWhenProviderNeverSaved, context);
    await runTest('command provider setup opens Settings for incomplete provider configuration', testCommandProviderSetupOpensSettingsForIncompleteProviderConfiguration, context);
    await runTest('translate command opens Settings when provider is not verified', testTranslateCommandOpensSettingsWhenProviderIsNotVerified, context);
    await runTest('translate command opens Settings after provider settings are cleared', testTranslateCommandOpensSettingsAfterProviderSettingsAreCleared, context);
  } finally {
    await server.close();
  }
}

module.exports = { run };
