import { execSync, spawnSync } from 'child_process';

export interface GhResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export function gh(args: string[], cwd?: string): GhResult {
  const result = spawnSync('gh', args, {
    cwd: cwd || process.cwd(),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    success: result.status === 0,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
  };
}

export function checkGhInstalled(): boolean {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function checkGhAuth(): boolean {
  const result = gh(['auth', 'status']);
  return result.success;
}

export function getGhUser(): string | null {
  const result = gh(['api', 'user', '-q', '.login']);
  return result.success ? result.stdout : null;
}
