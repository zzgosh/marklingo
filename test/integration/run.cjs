const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vscode = require('vscode');

const EXTENSION_ID = 'zzgosh.marklingo';
const MODEL_ID = 'test/mock-model';

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
  const marker = '---';
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
        for (const block of blocks) {
          if (state.corruptPlaceholderOutput && block.markdown.includes('__MDT_')) {
            translated[block.id] = `MOCK:${block.markdown.replace(/__MDT_[A-Za-z0-9_]+__/g, 'BROKEN_PLACEHOLDER')}`;
          } else {
            translated[block.id] = `MOCK:${block.markdown}`;
          }
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

  const cfg = vscode.workspace.getConfiguration('marklingo');
  await cfg.update('openrouter.baseUrl', mockServer.baseUrl, vscode.ConfigurationTarget.Global);
  await cfg.update('openrouter.modelId', MODEL_ID, vscode.ConfigurationTarget.Global);
  await cfg.update('translation.targetLanguage', 'English', vscode.ConfigurationTarget.Global);
  await cfg.update('storage.outputLocation', 'sourceFolder', vscode.ConfigurationTarget.Global);

  const seeded = await vscode.commands.executeCommand('marklingo.test.seedState', { apiKey: 'test-key' });
  assert.equal(seeded.origin, new URL(mockServer.baseUrl).origin);
  return seeded;
}

async function writeMarkdown(name, content) {
  const uri = vscode.Uri.file(path.join(workspaceRoot(), name));
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

function translatedPath(sourceUri) {
  const parsed = path.parse(sourceUri.fsPath);
  return path.join(parsed.dir, `${parsed.name}_mdt.md`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function findMetaForSource(globalStorageUri, sourceUri) {
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
  assert.ok(
    vscode.window.visibleTextEditors.some((editor) => editor.document.uri.fsPath === translatedPath(source)),
    'expected translated Markdown file to be open as a visible editor',
  );

  const request = context.server.state.chatRequests[0];
  assert.equal(request.body.stream, false);
  assert.deepEqual(request.body.reasoning, { effort: 'none', exclude: true });
  assert.equal(request.body.response_format.type, 'json_object');
  assert.equal(request.body.messages[0].role, 'system');
  assert.equal(request.body.messages[1].role, 'user');

  const { meta } = findMetaForSource(context.seeded.globalStorageUri, source);
  assert.equal(meta.debug.status, 'success');
  assert.equal(meta.debug.settings.request.stream, false);
  assert.equal(meta.debug.settings.request.reasoning.effort, 'none');
  assert.equal(meta.debug.result.warningCount, 0);
  assert.ok(!JSON.stringify(meta.debug).includes('test-key'), 'debug metadata must not include the API key');
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

async function runTest(name, fn, context) {
  try {
    context.server.state.chatRequests = [];
    context.server.state.corruptPlaceholderOutput = false;
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
    await runTest('reuses cached translations on incremental runs', testReusesCachedTranslations, context);
    await runTest('translates .md files even when VS Code uses a different language mode', testTranslatesMarkdownExtensionWithNonMarkdownLanguageMode, context);
    await runTest('retries fallback blocks instead of caching source fallback', testRetriesFallbackBlocks, context);
  } finally {
    await server.close();
  }
}

module.exports = { run };
