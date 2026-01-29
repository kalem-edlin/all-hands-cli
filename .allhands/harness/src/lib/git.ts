/**
 * Git utilities for All Hands CLI.
 *
 * Provides git context for notifications and other features.
 */

import { execSync, spawnSync } from "child_process";
import { basename, dirname, join, relative } from "path";
import { existsSync, mkdirSync, copyFileSync, rmSync } from "fs";
import { getBaseBranch, getLocalBaseBranch } from '../hooks/shared.js';

// Re-export getBaseBranch and getLocalBaseBranch for consumers
export { getBaseBranch, getLocalBaseBranch };

// Protected branches - no planning required
const PROTECTED_BRANCHES = new Set([
  "main",
  "master",
  "develop",
  "development",
  "dev",
  "staging",
  "stage",
  "production",
  "prod",
]);

// Prefixes that indicate direct mode (no planning)
const DIRECT_MODE_PREFIXES = ["quick/", "curator/"];

/**
 * Get current git branch name.
 * Uses CLAUDE_PROJECT_DIR if available (for hooks), else current directory.
 */
export function getBranch(): string {
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const result = spawnSync("git", ["branch", "--show-current"], {
      encoding: "utf-8",
      cwd,
    });
    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Convert branch name to safe directory name (feat/auth -> feat-auth).
 */
export function sanitizeBranch(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Check if branch should skip planning.
 */
export function isDirectModeBranch(branch: string): boolean {
  if (PROTECTED_BRANCHES.has(branch)) {
    return true;
  }
  return DIRECT_MODE_PREFIXES.some((prefix) => branch.startsWith(prefix));
}

/**
 * Get git diff against a reference.
 */
export function getDiff(ref: string): string {
  try {
    const result = spawnSync("git", ["diff", ref], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (result.status !== 0) {
      // Fallback to empty tree if ref doesn't exist (fresh repo)
      const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
      const fallback = spawnSync("git", ["diff", emptyTree], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return fallback.stdout || "(No changes)";
    }

    return result.stdout || "(No changes)";
  } catch {
    return "(Unable to get diff)";
  }
}

/**
 * Get the project root directory (where .git is located).
 * Uses CLAUDE_PROJECT_DIR if available (for hooks), else current directory.
 */
export function getProjectRoot(): string {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return cwd;
  }
}

/**
 * Get the repo's root directory name (e.g., "claude-agents").
 */
export function getRepoName(): string {
  return basename(getProjectRoot()) || "";
}

/**
 * Get the plan directory path for current branch.
 */
export function getPlanDir(cwd?: string): string {
  const root = cwd ?? getProjectRoot();
  const branch = getBranch();
  const planId = sanitizeBranch(branch);
  return `${root}/.allhands/plans/${planId}`;
}

/**
 * Get the current HEAD commit hash.
 */
export function getHeadCommit(cwd?: string): string {
  const workingDir = cwd || process.cwd();

  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf-8",
      cwd: workingDir,
    });

    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Get short commit hash (7 chars).
 */
export function getShortCommit(commitHash: string): string {
  return commitHash.substring(0, 7);
}

/**
 * Check if there are uncommitted changes in the working directory.
 * Returns true if there are staged or unstaged changes.
 */
export function hasUncommittedChanges(cwd?: string): boolean {
  const workingDir = cwd || process.cwd();
  try {
    const result = spawnSync("git", ["status", "--porcelain"], {
      encoding: "utf-8",
      cwd: workingDir,
    });
    // If output is non-empty, there are uncommitted changes
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Checkout a git branch.
 * Returns true on success, false on failure.
 */
export function checkoutBranch(branch: string, cwd?: string): boolean {
  const workingDir = cwd || process.cwd();
  try {
    const result = spawnSync("git", ["checkout", branch], {
      encoding: "utf-8",
      cwd: workingDir,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export interface CommitToBranchOptions {
  /** Absolute paths to files to commit */
  files: string[];
  /** Target branch to commit to */
  branch: string;
  /** Commit message */
  message: string;
  /** Git root directory (defaults to current project root) */
  cwd?: string;
}

export interface CommitToBranchResult {
  success: boolean;
  error?: string;
  /** How the commit was made: 'direct' (on branch), 'existing-worktree', or 'temp-worktree' */
  method?: 'direct' | 'existing-worktree' | 'temp-worktree';
  /** The branch that was committed to */
  branch?: string;
  /** Current branch (if different from target) */
  currentBranch?: string;
}

/**
 * Find an existing worktree for a given branch.
 * Returns the worktree path if found, null otherwise.
 */
export function findWorktreeForBranch(branch: string, cwd?: string): string | null {
  const workingDir = cwd || process.cwd();
  try {
    const worktreeList = execSync('git worktree list --porcelain', {
      cwd: workingDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = worktreeList.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) {
        const wtPath = lines[i].substring('worktree '.length);
        // Check next lines for branch info
        for (let j = i + 1; j < lines.length && !lines[j].startsWith('worktree '); j++) {
          if (lines[j] === `branch refs/heads/${branch}`) {
            return wtPath;
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Commit files directly to a target branch without switching the current checkout.
 *
 * Handles three scenarios:
 * 1. Already on target branch → stash, add files, commit, pop stash
 * 2. Existing worktree for target branch → use it with stash safety
 * 3. No existing worktree → create temp worktree, commit, cleanup
 *
 * Files are copied to the target branch context and committed there.
 * The files remain as local changes in the current working directory.
 */
export function commitFilesToBranch(options: CommitToBranchOptions): CommitToBranchResult {
  const { files, branch, message } = options;
  const gitRoot = options.cwd || getProjectRoot();
  const currentBranch = getBranch();

  // Validate files exist
  for (const file of files) {
    if (!existsSync(file)) {
      return { success: false, error: `File not found: ${file}` };
    }
  }

  // Convert absolute paths to relative paths from git root
  const relativePaths = files.map(f => relative(gitRoot, f));

  /**
   * Helper to commit files in a given worktree context with stash safety
   */
  function commitInWorktree(worktreePath: string): CommitToBranchResult & { method: 'direct' | 'existing-worktree' | 'temp-worktree' } {
    const method = worktreePath === gitRoot ? 'direct' :
                   (worktreePath.includes('worktrees-tmp') ? 'temp-worktree' : 'existing-worktree');

    try {
      // Copy files to worktree and stage them
      for (let i = 0; i < files.length; i++) {
        const srcPath = files[i];
        const relPath = relativePaths[i];
        const destPath = join(worktreePath, relPath);

        // Ensure target directory exists
        mkdirSync(dirname(destPath), { recursive: true });

        // Copy file (skip if same location - direct mode)
        if (srcPath !== destPath) {
          copyFileSync(srcPath, destPath);
        }

        // Stage the file
        execSync(`git add "${relPath}"`, { cwd: worktreePath, stdio: 'pipe' });
      }

      // Commit
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: worktreePath,
        stdio: 'pipe'
      });

      return {
        success: true,
        method,
        branch,
        currentBranch: currentBranch !== branch ? currentBranch : undefined,
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { success: false, error: errorMsg, method };
    }
  }

  // Case 1: Already on target branch
  if (currentBranch === branch) {
    return commitInWorktree(gitRoot);
  }

  // Case 2: Check for existing worktree
  const existingWorktree = findWorktreeForBranch(branch, gitRoot);
  if (existingWorktree) {
    return commitInWorktree(existingWorktree);
  }

  // Case 3: Create temporary worktree
  const tempWorktreePath = join(gitRoot, '.git', 'worktrees-tmp', `commit-${Date.now()}`);

  try {
    mkdirSync(dirname(tempWorktreePath), { recursive: true });
    execSync(`git worktree add "${tempWorktreePath}" "${branch}"`, {
      cwd: gitRoot,
      stdio: 'pipe'
    });

    const result = commitInWorktree(tempWorktreePath);

    // Cleanup temporary worktree
    try {
      execSync(`git worktree remove "${tempWorktreePath}" --force`, {
        cwd: gitRoot,
        stdio: 'pipe'
      });
    } catch {
      // Try manual cleanup
      try {
        rmSync(tempWorktreePath, { recursive: true, force: true });
        execSync('git worktree prune', { cwd: gitRoot, stdio: 'pipe' });
      } catch {
        // Ignore cleanup errors
      }
    }

    return result;
  } catch (e) {
    // Cleanup on worktree creation failure
    try {
      rmSync(tempWorktreePath, { recursive: true, force: true });
      execSync('git worktree prune', { cwd: gitRoot, stdio: 'pipe' });
    } catch {
      // Ignore cleanup errors
    }
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Failed to create worktree: ${errorMsg}` };
  }
}

/**
 * Create a new branch from a base branch without checking it out.
 * Useful for setting up spec branches while staying on the current branch.
 *
 * @returns true if branch was created successfully, false if it already exists or failed
 */
export function createBranchWithoutCheckout(
  branch: string,
  baseBranch: string,
  cwd?: string
): { success: boolean; created: boolean; error?: string } {
  const workingDir = cwd || getProjectRoot();

  try {
    // Check if branch already exists
    const checkResult = spawnSync('git', ['rev-parse', '--verify', branch], {
      encoding: 'utf-8',
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (checkResult.status === 0) {
      // Branch already exists
      return { success: true, created: false };
    }

    // Create branch from base without checkout
    const result = spawnSync('git', ['branch', branch, baseBranch], {
      encoding: 'utf-8',
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      return {
        success: false,
        created: false,
        error: result.stderr?.trim() || 'Failed to create branch',
      };
    }

    return { success: true, created: true };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { success: false, created: false, error: errorMsg };
  }
}
