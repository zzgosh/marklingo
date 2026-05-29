import { rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const repoRoot = resolve('.');
const testRoot = resolve(repoRoot, '.vscode-test');
const workspacePath = resolve(testRoot, 'workspace');
const userDataDir = resolve(testRoot, 'user-data');

rmSync(workspacePath, { recursive: true, force: true });
rmSync(userDataDir, { recursive: true, force: true });
mkdirSync(workspacePath, { recursive: true });
mkdirSync(userDataDir, { recursive: true });

try {
  await runTests({
    extensionDevelopmentPath: repoRoot,
    extensionTestsPath: resolve(repoRoot, 'test/integration/run.cjs'),
    launchArgs: [
      workspacePath,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--user-data-dir',
      userDataDir,
    ],
  });
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
}
