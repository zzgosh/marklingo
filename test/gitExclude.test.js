import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendMarkLingoGitExclude,
  ensureMarkLingoGitExclude,
  findGitRepository,
  hasMarkLingoGitExclude,
  MARKLINGO_GIT_EXCLUDE_PATTERN,
} from '../out/git/exclude.js';

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marklingo-git-exclude-'));
  fs.mkdirSync(path.join(root, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'info', 'exclude'), '# existing\nnode_modules/\n', 'utf8');
  return root;
}

test('appends MarkLingo translated output pattern to git exclude content', () => {
  const next = appendMarkLingoGitExclude('# existing\nnode_modules/\n');

  assert.match(next, /# MarkLingo translated Markdown outputs/);
  assert.match(next, /\*_mdt\.md/);
  assert.equal(hasMarkLingoGitExclude(next), true);
});

test('detects the MarkLingo git exclude pattern as an exact line', () => {
  assert.equal(hasMarkLingoGitExclude(` ${MARKLINGO_GIT_EXCLUDE_PATTERN} \n`), true);
  assert.equal(hasMarkLingoGitExclude('docs/*_mdt.md\n'), false);
});

test('updates .git/info/exclude idempotently', async () => {
  const root = makeTempRepo();
  try {
    const repo = await findGitRepository(path.join(root, 'docs', 'guide.md'));
    assert.ok(repo, 'expected repository detection');

    assert.equal(await ensureMarkLingoGitExclude(repo), 'added');
    assert.equal(await ensureMarkLingoGitExclude(repo), 'already-present');

    const content = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
    assert.equal(content.match(/\*_mdt\.md/g)?.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('detects worktree gitdir files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marklingo-worktree-'));
  const gitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marklingo-gitdir-'));
  try {
    fs.mkdirSync(path.join(gitDir, 'info'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git'), `gitdir: ${gitDir}\n`, 'utf8');

    const repo = await findGitRepository(root);
    assert.ok(repo, 'expected repository detection');
    assert.equal(repo.gitDir, gitDir);
    assert.equal(repo.excludeFile, path.join(gitDir, 'info', 'exclude'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(gitDir, { recursive: true, force: true });
  }
});
