import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve('.');
const userDataDir = process.env.MARKLINGO_DEV_USER_DATA_DIR ?? join(tmpdir(), 'marklingo-dev-user');
const extensionsDir = process.env.MARKLINGO_DEV_EXTENSIONS_DIR ?? join(tmpdir(), 'marklingo-dev-extensions');
const macCodeCli = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
const codeCli = process.env.VSCODE_CLI
  ?? (process.platform === 'darwin' && existsSync(macCodeCli) ? macCodeCli : 'code');

mkdirSync(userDataDir, { recursive: true });
mkdirSync(extensionsDir, { recursive: true });

const args = [
  '--new-window',
  '--disable-workspace-trust',
  '--skip-welcome',
  '--skip-release-notes',
  '--user-data-dir',
  userDataDir,
  '--extensions-dir',
  extensionsDir,
  '--extensionDevelopmentPath',
  repoRoot,
  repoRoot,
];

console.log(`Opening MarkLingo development window with ${codeCli}`);
console.log(`User data: ${userDataDir}`);
console.log(`Extensions: ${extensionsDir}`);
console.log('MarkLingo is loaded as a development extension, not installed into the Extensions view.');
console.log('The isolated Extensions view may show "Installed 0"; use Command Palette > "MarkLingo: Open Settings" to verify it.');

const result = spawnSync(codeCli, args, { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 0;
}
