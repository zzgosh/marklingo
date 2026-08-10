import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function readWorkflow() {
  return fs.readFileSync(
    new URL('../.github/workflows/sync-model-pricing.yml', import.meta.url),
    'utf8',
  );
}

test('cleans the generated snapshot before switching to an open pricing branch', () => {
  const workflow = readWorkflow();
  const saveCandidate = workflow.indexOf('cp "$snapshot_path" "$candidate_file"');
  const restoreBase = workflow.indexOf('git restore --source=HEAD --worktree -- "$snapshot_path"');
  const switchBranch = workflow.indexOf('git switch --create "$target_branch"');

  assert.ok(saveCandidate >= 0, 'expected the generated snapshot to be saved');
  assert.ok(restoreBase > saveCandidate, 'expected the tracked snapshot to be restored after saving it');
  assert.ok(switchBranch > restoreBase, 'expected branch switching only after the worktree is clean');
});

test('updates exactly one existing pricing pull request and rejects ambiguous matches', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /--limit 1000/);
  assert.match(workflow, /matching_pr_count > 1/);
  assert.match(workflow, /Found multiple open model pricing pull requests/);
  assert.match(workflow, /git switch --create "\$target_branch" --track "origin\/\$target_branch"/);
  assert.match(workflow, /git merge --no-edit "origin\/\$base_branch"/);
});

test('compares the candidate with the open pull request before appending a commit', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /cp "\$candidate_file" "\$snapshot_path"/);
  assert.match(workflow, /if git diff --cached --quiet/);
  assert.match(workflow, /git rev-list --count "origin\/\$target_branch\.\.HEAD"/);
  assert.match(workflow, /Open pricing pull request #\$existing_pr_number already contains the latest Gateway pricing/);
  assert.match(workflow, /if ! git diff --cached --quiet; then\n\s+git commit -m "chore: update model pricing snapshot"/);
});

test('recovers a pushed branch when pull request creation is retried', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /git ls-remote --heads origin "refs\/heads\/\$target_branch"/);
  assert.match(workflow, /Reusing pricing branch from an earlier attempt/);
  assert.match(workflow, /matching_pr_count == 1/);
});

test('validates every run and creates a pull request only for a new cycle', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /if \[ "\$base_changed" = false \]; then/);
  assert.match(workflow, /Gateway pricing is unchanged and no pricing pull request is open/);
  assert.match(workflow, /- name: Run checks\n\s+run: npm run check/);
  assert.match(
    workflow,
    /if: steps\.pricing\.outputs\.update_needed == 'true' && steps\.pricing\.outputs\.existing_pr_number == ''/,
  );
  assert.match(workflow, /TARGET_BRANCH: \$\{\{ steps\.pricing\.outputs\.target_branch \}\}/);
  assert.match(workflow, /Future pricing changes will be appended to this pull request until it is merged or closed/);
});
