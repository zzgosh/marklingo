import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

const repoRoot = resolve('.');
const testRoot = mkdtempSync(join(tmpdir(), 'marklingo-vscode-test-'));
const workspacePath = resolve(testRoot, 'workspace');
const userDataDir = resolve(testRoot, 'user-data');

mkdirSync(workspacePath, { recursive: true });
mkdirSync(userDataDir, { recursive: true });

function resolveDownloadedVsCodeExecutable(downloadedExecutable) {
  if (existsSync(downloadedExecutable)) return downloadedExecutable;

  if (process.platform === 'darwin') {
    const codeExecutable = resolve(dirname(downloadedExecutable), 'Code');
    if (existsSync(codeExecutable)) return codeExecutable;
  }

  throw new Error(`Downloaded VS Code executable was not found: ${downloadedExecutable}`);
}

try {
  const vscodeExecutablePath = resolveDownloadedVsCodeExecutable(await downloadAndUnzipVSCode());
  await runTests({
    extensionDevelopmentPath: repoRoot,
    extensionTestsPath: resolve(repoRoot, 'test/integration/run.cjs'),
    vscodeExecutablePath,
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
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}
