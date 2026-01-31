/**
 * Git utilities for All Hands CLI.
 *
 * Provides git context for notifications and other features.
 */

import { spawnSync } from "child_process";
import { basename } from "path";
import { getBaseBranch, getLocalBaseBranch } from '../hooks/shared.js';

// Re-export getBaseBranch and getLocalBaseBranch for consumers
export { getBaseBranch, getLocalBaseBranch };

// ── Safe git execution wrapper ──────────────────────────────────────────────

export interface GitExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Safe git command execution using spawnSync with argument arrays.
 * No shell involved — immune to command injection via branch names, paths, etc.
 */
export function gitExec(args: string[], cwd?: string): GitExecResult {
  const workingDir = cwd || process.cwd();
  const result = spawnSync('git', args, {
    encoding: 'utf-8',
    cwd: workingDir,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    success: result.status === 0,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
    exitCode: result.status ?? 1,
  };
}

// ── Input validation ────────────────────────────────────────────────────────

const GIT_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

/**
 * Validate a git ref (branch name, tag, etc.) against a safe allowlist pattern.
 * Throws a descriptive error if the ref contains unsafe characters.
 *
 * Apply at the boundary where user-derived values (spec frontmatter `branch`,
 * settings `baseBranch`) enter git operations — not deep inside helpers.
 */
export function validateGitRef(ref: string, label: string): void {
  if (!ref || !GIT_REF_PATTERN.test(ref)) {
    throw new Error(
      `Invalid ${label}: "${ref}". Git refs must start with an alphanumeric character and contain only alphanumerics, slashes, underscores, dots, and hyphens.`
    );
  }
}

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
  const result = gitExec(['rev-parse', '--show-toplevel'], cwd);
  return result.success ? result.stdout : cwd;
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
 *
 * Fail-safe: returns true when git itself fails (non-zero exit or exception).
 * When we can't determine repo state, assume dirty to prevent destructive
 * operations (checkout, clean, branch delete) from proceeding on false data.
 */
export function hasUncommittedChanges(cwd?: string): boolean {
  const workingDir = cwd || process.cwd();
  try {
    const result = spawnSync("git", ["status", "--porcelain"], {
      encoding: "utf-8",
      cwd: workingDir,
    });
    // Fail-safe: if git status itself fails, assume changes exist
    if (result.status !== 0) {
      return true;
    }
    return result.stdout.trim().length > 0;
  } catch {
    // Fail-safe: exception means we can't determine state — assume dirty
    return true;
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

// ── Remote sync ─────────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  conflicts: string[];
}

/**
 * Sync the current branch with origin/main.
 * Used at three lifecycle points: activation, PR creation, completion.
 *
 * Flow: fetch origin main → merge origin/main --no-edit →
 *   on conflict: parse conflicted files, abort merge, return conflicts list
 *   on success: return { success: true, conflicts: [] }
 */
export function syncWithOriginMain(cwd?: string): SyncResult {
  const workingDir = cwd || process.cwd();

  // 1. Fetch latest main from origin
  const fetch = gitExec(['fetch', 'origin', 'main'], workingDir);
  if (!fetch.success) {
    return { success: false, conflicts: [] };
  }

  // 2. Attempt merge
  const merge = gitExec(['merge', 'origin/main', '--no-edit'], workingDir);
  if (merge.success) {
    return { success: true, conflicts: [] };
  }

  // 3. Merge failed — detect conflicts
  const diffResult = gitExec(
    ['diff', '--name-only', '--diff-filter=U'],
    workingDir,
  );
  const conflicts = diffResult.stdout
    ? diffResult.stdout.split('\n').filter(Boolean)
    : [];

  // 4. Abort the failed merge to restore clean state
  gitExec(['merge', '--abort'], workingDir);

  return { success: false, conflicts };
}
