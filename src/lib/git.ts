import { execSync, spawnSync } from 'child_process';

export interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export function git(args: string[], cwd: string): GitResult {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    success: result.status === 0,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
  };
}

export function getStagedFiles(repoPath: string): Set<string> {
  const result = git(['diff', '--cached', '--name-only'], repoPath);
  if (!result.success || !result.stdout) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').filter(Boolean));
}

export function isGitRepo(path: string): boolean {
  const result = git(['rev-parse', '--git-dir'], path);
  return result.success;
}

export function checkGitInstalled(): boolean {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all files tracked by git plus untracked files, excluding gitignored files.
 * This respects .gitignore at all levels.
 */
export function getGitFiles(repoPath: string): string[] {
  // Get tracked files
  const tracked = git(['ls-files'], repoPath);
  // Get untracked files that are NOT ignored
  const untracked = git(['ls-files', '--others', '--exclude-standard'], repoPath);

  const files: string[] = [];
  if (tracked.success && tracked.stdout) {
    files.push(...tracked.stdout.split('\n').filter(Boolean));
  }
  if (untracked.success && untracked.stdout) {
    files.push(...untracked.stdout.split('\n').filter(Boolean));
  }
  return files;
}
