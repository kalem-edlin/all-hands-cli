/**
 * Planning Directory Management
 *
 * Handles .planning/ directory structure:
 * - .planning/{branch}/prompts/     - Prompt files for execution
 * - .planning/{branch}/alignment.md - Alignment doc with decisions
 * - .planning/{branch}/status.yaml  - Session state
 *
 * In the branch-keyed model:
 * - Planning directories are keyed by sanitized branch name (feature/foo → feature-foo)
 * - The spec's frontmatter.branch field is the source of truth for which branch belongs to which spec
 * - Current git branch determines the active spec via findSpecByBranch()
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getBaseBranch } from './git.js';

/**
 * Locked branch patterns - branches that should never have planning dirs.
 * Includes BASE_BRANCH, common protected branches, and worktree/quick prefixes.
 */
const LOCKED_BRANCH_NAMES = new Set([
  'main',
  'master',
  'develop',
  'dev',
  'stage',
  'staging',
  'prod',
  'production',
]);

const LOCKED_BRANCH_PREFIXES = ['wt-', 'quick/'];

/**
 * Sanitize a branch name for use as a directory name.
 * Converts slashes and other non-safe characters to hyphens.
 * Example: feature/foo-bar → feature-foo-bar
 */
export function sanitizeBranchForDir(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/**
 * Check if a branch is a "locked" branch that should not have planning.
 * Locked branches: BASE_BRANCH, main, develop, dev, stage, staging, prod, production, wt-*, quick/*
 */
export function isLockedBranch(branch: string): boolean {
  // Check if it's the configured base branch
  const baseBranch = getBaseBranch();
  if (branch === baseBranch) {
    return true;
  }

  // Check against known locked names
  if (LOCKED_BRANCH_NAMES.has(branch)) {
    return true;
  }

  // Check prefixes
  for (const prefix of LOCKED_BRANCH_PREFIXES) {
    if (branch.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

export interface LoopConfig {
  enabled?: boolean;  // Deprecated: loop always starts disabled, not persisted
  parallel?: boolean;  // Parallel execution enabled (persisted per spec)
  iteration: number;
}

export interface PRStatus {
  url: string;
  number: number;
  created: string;
}

export interface PRReviewStatus {
  reviewCycle: number;
  lastReviewTime: string | null;
  lastReviewRunTime: string | null;  // When we started waiting for review
  status: 'pending' | 'reviewing' | 'completed' | 'none';
}

export interface StatusFile {
  name: string;           // Directory key (sanitized branch name)
  branch?: string;        // Original branch name (for collision detection)
  spec: string;           // Path to spec file
  stage: 'planning' | 'executing' | 'reviewing' | 'pr' | 'compound' | 'steering';
  loop: LoopConfig;
  compound_run: boolean;
  created: string;
  updated: string;
  pr?: PRStatus;
  prReview?: PRReviewStatus;
}

export interface AlignmentFrontmatter {
  name: string;           // Spec name
  spec: string;           // Path to spec file
  created: string;
  updated: string;
}

export interface DecisionEntry {
  promptNumber: number;
  promptTitle: string;
  decision: string;
  files: string[];
  summary: string;
}

/**
 * Get the current git branch name
 */
export function getCurrentBranch(cwd?: string): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return branch;
  } catch {
    return 'main';
  }
}

/**
 * Get the root of the git repository
 */
export function getGitRoot(cwd?: string): string {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return root;
  } catch {
    return process.cwd();
  }
}

/**
 * Get the .planning directory path for a key (sanitized branch name)
 */
export function getPlanningDir(key: string, cwd?: string): string {
  const gitRoot = getGitRoot(cwd);
  return join(gitRoot, '.planning', key);
}

/**
 * Get paths within the planning directory for a key
 */
export function getPlanningPaths(key: string, cwd?: string) {
  const planningDir = getPlanningDir(key, cwd);
  return {
    root: planningDir,
    prompts: join(planningDir, 'prompts'),
    alignment: join(planningDir, 'alignment.md'),
    status: join(planningDir, 'status.yaml'),
  };
}

/**
 * Ensure the .planning directory structure exists for a key
 */
export function ensurePlanningDir(key: string, cwd?: string): void {
  const paths = getPlanningPaths(key, cwd);

  // Create directories
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(paths.prompts, { recursive: true });
}

/**
 * Check if planning directory exists for a key
 */
export function planningDirExists(key: string, cwd?: string): boolean {
  const paths = getPlanningPaths(key, cwd);
  return existsSync(paths.root);
}

/**
 * Read the status file for a key
 */
export function readStatus(key: string, cwd?: string): StatusFile | null {
  const paths = getPlanningPaths(key, cwd);

  if (!existsSync(paths.status)) {
    return null;
  }

  try {
    const content = readFileSync(paths.status, 'utf-8');
    return parseYaml(content) as StatusFile;
  } catch {
    return null;
  }
}

/**
 * Check if a branch matches the status file's original branch.
 * Returns true if they match or if no branch is stored (backwards compatibility).
 * Returns false if there's a collision (different branches sanitized to same key).
 */
export function validateBranchForStatus(
  currentBranch: string,
  key: string,
  cwd?: string
): { valid: boolean; storedBranch?: string } {
  const status = readStatus(key, cwd);
  if (!status) {
    return { valid: true }; // No status file, no collision
  }

  if (!status.branch) {
    return { valid: true }; // Old status file without branch, assume valid
  }

  if (status.branch === currentBranch) {
    return { valid: true, storedBranch: status.branch };
  }

  // Collision detected: different branch maps to same key
  return { valid: false, storedBranch: status.branch };
}

/**
 * Write the status file for a key
 */
export function writeStatus(status: StatusFile, key: string, cwd?: string): void {
  const paths = getPlanningPaths(key, cwd);
  ensurePlanningDir(key, cwd);

  const content = stringifyYaml(status);
  writeFileSync(paths.status, content);
}

/**
 * Update specific fields in the status file for a key
 */
export function updateStatus(
  updates: Partial<StatusFile>,
  key: string,
  cwd?: string
): StatusFile {
  const current = readStatus(key, cwd);
  if (!current) {
    throw new Error('No status file exists. Initialize planning first.');
  }

  const updated: StatusFile = {
    ...current,
    ...updates,
    updated: new Date().toISOString(),
  };

  writeStatus(updated, key, cwd);
  return updated;
}

/**
 * Create initial status file for a new planning directory
 *
 * @param key - The directory key (sanitized branch name)
 * @param specPath - Path to the spec file
 * @param originalBranch - Original branch name (for collision detection)
 * @param cwd - Working directory
 */
export function initializeStatus(
  key: string,
  specPath: string,
  originalBranch?: string | null,
  cwd?: string
): StatusFile {
  const now = new Date().toISOString();

  const status: StatusFile = {
    name: key,
    branch: originalBranch ?? undefined,
    spec: specPath,
    stage: 'planning',
    loop: {
      iteration: 0,
    },
    compound_run: false,
    created: now,
    updated: now,
  };

  writeStatus(status, key, cwd);
  return status;
}

/**
 * Read the alignment doc frontmatter for a key
 */
export function readAlignmentFrontmatter(
  key: string,
  cwd?: string
): AlignmentFrontmatter | null {
  const paths = getPlanningPaths(key, cwd);

  if (!existsSync(paths.alignment)) {
    return null;
  }

  try {
    const content = readFileSync(paths.alignment, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    return parseYaml(frontmatterMatch[1]) as AlignmentFrontmatter;
  } catch {
    return null;
  }
}

/**
 * Read the full alignment doc for a key
 */
export function readAlignment(key: string, cwd?: string): string | null {
  const paths = getPlanningPaths(key, cwd);

  if (!existsSync(paths.alignment)) {
    return null;
  }

  return readFileSync(paths.alignment, 'utf-8');
}

/**
 * Create initial alignment doc for a spec
 */
export function initializeAlignment(
  specName: string,
  specPath: string,
  overview: string,
  hardRequirements: string[],
  cwd?: string
): void {
  const paths = getPlanningPaths(specName, cwd);
  ensurePlanningDir(specName, cwd);

  const now = new Date().toISOString();
  const frontmatter = stringifyYaml({
    name: specName,
    spec: specPath,
    created: now,
    updated: now,
  });

  const requirementsList = hardRequirements.map((r) => `- ${r}`).join('\n');

  const content = `---
${frontmatter.trim()}
---

## Overview

${overview}

## Hard Requirements

${requirementsList}

## Key Decisions

<!-- Decisions appended by executing agents -->

`;

  writeFileSync(paths.alignment, content);
}

/**
 * Append a decision to the alignment doc for a key
 */
export function appendDecision(
  entry: DecisionEntry,
  key: string,
  cwd?: string
): void {
  const paths = getPlanningPaths(key, cwd);

  if (!existsSync(paths.alignment)) {
    throw new Error('No alignment doc exists. Initialize planning first.');
  }

  const content = readFileSync(paths.alignment, 'utf-8');
  const filesList = entry.files.map((f) => `\`${f}\``).join(', ');
  const promptLink = `./prompts/${String(entry.promptNumber).padStart(2, '0')}-${entry.promptTitle.toLowerCase().replace(/\s+/g, '-')}.md`;

  const decisionBlock = `
### Prompt ${String(entry.promptNumber).padStart(2, '0')}: ${entry.promptTitle}

**Decision**: ${entry.decision}

**Files**: ${filesList}

**Summary**: ${entry.summary}

**Link**: \`${promptLink}\`
`;

  // Update frontmatter updated timestamp
  const updatedContent = content.replace(
    /^(---\n[\s\S]*?updated:\s*).+(\n---)/m,
    `$1${new Date().toISOString()}$2`
  );

  writeFileSync(paths.alignment, updatedContent + decisionBlock);
}

/**
 * List all prompt files in the planning directory for a key
 */
export function listPromptFiles(key: string, cwd?: string): string[] {
  const paths = getPlanningPaths(key, cwd);

  if (!existsSync(paths.prompts)) {
    return [];
  }

  return readdirSync(paths.prompts)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

/**
 * Get alignment doc token count estimate (rough) for a key
 */
export function getAlignmentTokenCount(key: string, cwd?: string): number {
  const content = readAlignment(key, cwd);
  if (!content) return 0;

  // Rough estimate: ~4 chars per token
  return Math.ceil(content.length / 4);
}

/**
 * Update PR status in status file for a key
 */
export function updatePRStatus(
  url: string,
  number: number,
  key: string,
  cwd?: string
): StatusFile {
  return updateStatus(
    {
      pr: {
        url,
        number,
        created: new Date().toISOString(),
      },
    },
    key,
    cwd
  );
}

/**
 * Update PR review status in status file for a key
 */
export function updatePRReviewStatus(
  state: Partial<PRReviewStatus>,
  key: string,
  cwd?: string
): StatusFile {
  const current = readStatus(key, cwd);
  if (!current) {
    throw new Error('No status file exists. Initialize planning first.');
  }

  const currentPRReview = current.prReview || {
    reviewCycle: 0,
    lastReviewTime: null,
    lastReviewRunTime: null,
    status: 'none' as const,
  };

  return updateStatus(
    {
      prReview: {
        ...currentPRReview,
        ...state,
      },
    },
    key,
    cwd
  );
}

// ============================================================================
// Planning Directory Listing
// ============================================================================

export interface PlanningInfo {
  /** Directory key (sanitized branch name) */
  key: string;
  /** Path to spec file */
  specPath: string;
  /** Current stage */
  stage: string;
  /** Whether this is for the current git branch */
  isCurrent: boolean;
}

/**
 * List all planning directories
 */
export function listPlanningDirs(cwd?: string): PlanningInfo[] {
  const gitRoot = getGitRoot(cwd);
  const planningRoot = join(gitRoot, '.planning');

  if (!existsSync(planningRoot)) {
    return [];
  }

  const currentBranch = getCurrentBranch(cwd);
  const currentKey = sanitizeBranchForDir(currentBranch);
  const entries = readdirSync(planningRoot, { withFileTypes: true });
  const dirs: PlanningInfo[] = [];

  for (const entry of entries) {
    // Skip non-directories and hidden files
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const statusPath = join(planningRoot, entry.name, 'status.yaml');
    if (!existsSync(statusPath)) {
      continue;
    }

    try {
      const content = readFileSync(statusPath, 'utf-8');
      const status = parseYaml(content) as StatusFile;

      dirs.push({
        key: entry.name,
        specPath: status.spec,
        stage: status.stage,
        isCurrent: entry.name === currentKey,
      });
    } catch {
      // Skip malformed status files
      continue;
    }
  }

  return dirs;
}
