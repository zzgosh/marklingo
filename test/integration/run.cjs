const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
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
        for (const block of blocks) {
          if (state.translationOverrides.has(block.markdown)) {
            translated[block.id] = state.translationOverrides.get(block.markdown);
          } else if (state.corruptPlaceholderOutput && block.markdown.includes('__MDT_')) {
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

function translatedPath(sourceUri, suffix = 'en') {
  const parsed = path.parse(sourceUri.fsPath);
  return path.join(parsed.dir, `${parsed.name}_${suffix}_mdt.md`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
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
  assert.deepEqual(request.body.reasoning, { effort: 'none', exclude: true });
  assert.equal(request.body.response_format.type, 'json_object');
  assert.equal(request.body.messages[0].role, 'system');
  assert.equal(request.body.messages[1].role, 'user');

  const { path: metaPath, meta } = findMetaForSource(context.seeded.globalStorageUri, source);
  assert.match(path.basename(metaPath), /_en_[a-f0-9]+_mdt\.meta\.json$/);
  assert.equal(meta.debug.status, 'success');
  assert.equal(meta.debug.settings.request.stream, false);
  assert.equal(meta.debug.settings.request.reasoning.effort, 'none');
  assert.equal(meta.debug.result.warningCount, 0);
  assert.ok(!JSON.stringify(meta.debug).includes('test-key'), 'debug metadata must not include the API key');
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
    await runTest('translates selected YAML frontmatter values only', testTranslatesFrontmatterValues, context);
    await runTest('reuses cached translations on incremental runs', testReusesCachedTranslations, context);
    await runTest('compacts private cache into tracking stubs', testCompactsPrivateCacheIntoTrackingStubs, context);
    await runTest('translates .md files even when VS Code uses a different language mode', testTranslatesMarkdownExtensionWithNonMarkdownLanguageMode, context);
    await runTest('retries fallback blocks instead of caching source fallback', testRetriesFallbackBlocks, context);
    await runTest('deletes current project translations without skipping edited outputs', testDeletesCurrentProjectTranslations, context);
  } finally {
    await server.close();
  }
}

module.exports = { run };
