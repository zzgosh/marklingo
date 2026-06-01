import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const MARKLINGO_GIT_EXCLUDE_PATTERN = '*_mdt.md';
const MARKLINGO_GIT_EXCLUDE_HEADER = '# MarkLingo translated Markdown outputs';

export type GitRepositoryInfo = {
  workTree: string;
  gitDir: string;
  excludeFile: string;
};

async function statSafe(filePath: string): Promise<import('node:fs').Stats | undefined> {
  try {
    return await fs.stat(filePath);
  } catch {
    return undefined;
  }
}

async function resolveGitDir(gitPath: string, workTree: string): Promise<string | undefined> {
  const stat = await statSafe(gitPath);
  if (!stat) return undefined;
  if (stat.isDirectory()) return gitPath;
  if (!stat.isFile()) return undefined;

  const content = await fs.readFile(gitPath, 'utf8');
  const match = content.match(/^gitdir:\s*(.+)\s*$/m);
  if (!match) return undefined;
  const gitDir = match[1].trim();
  return path.isAbsolute(gitDir) ? gitDir : path.resolve(workTree, gitDir);
}

export async function findGitRepository(startPath: string): Promise<GitRepositoryInfo | undefined> {
  let current = path.resolve(startPath);
  const startStat = await statSafe(current);
  if (startStat?.isFile()) current = path.dirname(current);

  while (true) {
    const gitDir = await resolveGitDir(path.join(current, '.git'), current);
    if (gitDir) {
      return {
        workTree: current,
        gitDir,
        excludeFile: path.join(gitDir, 'info', 'exclude'),
      };
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function hasMarkLingoGitExclude(content: string): boolean {
  return content.split(/\r?\n/).some((line) => line.trim() === MARKLINGO_GIT_EXCLUDE_PATTERN);
}

export function appendMarkLingoGitExclude(content: string): string {
  const base = content.length === 0
    ? ''
    : content.endsWith('\n')
      ? `${content}\n`
      : `${content}\n\n`;
  return `${base}${MARKLINGO_GIT_EXCLUDE_HEADER}\n${MARKLINGO_GIT_EXCLUDE_PATTERN}\n`;
}

export async function ensureMarkLingoGitExclude(repo: GitRepositoryInfo): Promise<'added' | 'already-present'> {
  let content = '';
  try {
    content = await fs.readFile(repo.excludeFile, 'utf8');
  } catch {
    content = '';
  }

  if (hasMarkLingoGitExclude(content)) return 'already-present';

  await fs.mkdir(path.dirname(repo.excludeFile), { recursive: true });
  await fs.writeFile(repo.excludeFile, appendMarkLingoGitExclude(content), 'utf8');
  return 'added';
}
