/**
 * Planning Directory Management
 *
 * Handles .planning/ directory structure:
 * - .planning/{spec}/prompts/     - Prompt files for execution
 * - .planning/{spec}/alignment.md - Alignment doc with decisions
 * - .planning/{spec}/status.yaml  - Session state
 *
 * Active spec is stored in .allhands/harness/.cache/session.json (see session.ts)
 *
 * The harness is a "dumb filing cabinet" - specs are the directory key.
 * Branch management is handled by agent flows, not the harness.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getBaseBranch } from './git.js';
import { getActiveSpec, setActiveSpec, clearActiveSpec } from './session.js';

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
  enabled: boolean;
  emergent: boolean;
  iteration: number;
}

export interface PRStatus {
  url: string;
  number: number;
  created: string;
}

export interface GreptileStatus {
  reviewCycle: number;
  lastReviewTime: string | null;
  status: 'pending' | 'reviewing' | 'completed' | 'none';
}

export interface StatusFile {
  name: string;           // Spec name (directory key)
  spec: string;           // Path to spec file
  last_known_branch: string | null;
  stage: 'planning' | 'executing' | 'reviewing' | 'pr' | 'compound';
  loop: LoopConfig;
  compound_run: boolean;
  created: string;
  updated: string;
  pr?: PRStatus;
  greptile?: GreptileStatus;
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
 * Get the .planning directory path for a spec
 */
export function getPlanningDir(spec: string, cwd?: string): string {
  const gitRoot = getGitRoot(cwd);
  return join(gitRoot, '.planning', spec);
}

/**
 * Get paths within the planning directory for a spec
 */
export function getPlanningPaths(spec: string, cwd?: string) {
  const planningDir = getPlanningDir(spec, cwd);
  return {
    root: planningDir,
    prompts: join(planningDir, 'prompts'),
    alignment: join(planningDir, 'alignment.md'),
    status: join(planningDir, 'status.yaml'),
  };
}

/**
 * Ensure the .planning directory structure exists for a spec
 */
export function ensurePlanningDir(spec: string, cwd?: string): void {
  const paths = getPlanningPaths(spec, cwd);

  // Create directories
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(paths.prompts, { recursive: true });
}

/**
 * Check if planning directory exists for a spec
 */
export function planningDirExists(spec: string, cwd?: string): boolean {
  const paths = getPlanningPaths(spec, cwd);
  return existsSync(paths.root);
}

/**
 * Read the status file for a spec
 */
export function readStatus(spec: string, cwd?: string): StatusFile | null {
  const paths = getPlanningPaths(spec, cwd);

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
 * Write the status file for a spec
 */
export function writeStatus(status: StatusFile, spec: string, cwd?: string): void {
  const paths = getPlanningPaths(spec, cwd);
  ensurePlanningDir(spec, cwd);

  const content = stringifyYaml(status);
  writeFileSync(paths.status, content);
}

/**
 * Update specific fields in the status file for a spec
 */
export function updateStatus(
  updates: Partial<StatusFile>,
  spec: string,
  cwd?: string
): StatusFile {
  const current = readStatus(spec, cwd);
  if (!current) {
    throw new Error('No status file exists. Initialize a spec first.');
  }

  const updated: StatusFile = {
    ...current,
    ...updates,
    updated: new Date().toISOString(),
  };

  writeStatus(updated, spec, cwd);
  return updated;
}

/**
 * Create initial status file for a new spec
 *
 * @param specName - The spec name (used as directory key)
 * @param specPath - Path to the spec file
 * @param lastKnownBranch - Initial branch hint (nullable)
 * @param cwd - Working directory
 */
export function initializeStatus(
  specName: string,
  specPath: string,
  lastKnownBranch: string | null = null,
  cwd?: string
): StatusFile {
  const now = new Date().toISOString();

  const status: StatusFile = {
    name: specName,
    spec: specPath,
    last_known_branch: lastKnownBranch,
    stage: 'planning',
    loop: {
      enabled: false,
      emergent: false,
      iteration: 0,
    },
    compound_run: false,
    created: now,
    updated: now,
  };

  writeStatus(status, specName, cwd);
  return status;
}

/**
 * Read the alignment doc frontmatter for a spec
 */
export function readAlignmentFrontmatter(
  spec: string,
  cwd?: string
): AlignmentFrontmatter | null {
  const paths = getPlanningPaths(spec, cwd);

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
 * Read the full alignment doc for a spec
 */
export function readAlignment(spec: string, cwd?: string): string | null {
  const paths = getPlanningPaths(spec, cwd);

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
 * Append a decision to the alignment doc for a spec
 */
export function appendDecision(
  entry: DecisionEntry,
  spec: string,
  cwd?: string
): void {
  const paths = getPlanningPaths(spec, cwd);

  if (!existsSync(paths.alignment)) {
    throw new Error('No alignment doc exists. Initialize a spec first.');
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
 * List all prompt files in the planning directory for a spec
 */
export function listPromptFiles(spec: string, cwd?: string): string[] {
  const paths = getPlanningPaths(spec, cwd);

  if (!existsSync(paths.prompts)) {
    return [];
  }

  return readdirSync(paths.prompts)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

/**
 * Get alignment doc token count estimate (rough) for a spec
 */
export function getAlignmentTokenCount(spec: string, cwd?: string): number {
  const content = readAlignment(spec, cwd);
  if (!content) return 0;

  // Rough estimate: ~4 chars per token
  return Math.ceil(content.length / 4);
}

/**
 * Update PR status in status file for a spec
 */
export function updatePRStatus(
  url: string,
  number: number,
  spec: string,
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
    spec,
    cwd
  );
}

/**
 * Update Greptile review status in status file for a spec
 */
export function updateGreptileStatus(
  state: Partial<GreptileStatus>,
  spec: string,
  cwd?: string
): StatusFile {
  const current = readStatus(spec, cwd);
  if (!current) {
    throw new Error('No status file exists. Initialize a spec first.');
  }

  const currentGreptile = current.greptile || {
    reviewCycle: 0,
    lastReviewTime: null,
    status: 'none' as const,
  };

  return updateStatus(
    {
      greptile: {
        ...currentGreptile,
        ...state,
      },
    },
    spec,
    cwd
  );
}

// ============================================================================
// Active Spec Management (re-exported from session.ts)
// ============================================================================

// Session state is stored in .allhands/harness/.cache/session.json
// Re-export for backwards compatibility
export { getActiveSpec, setActiveSpec, clearActiveSpec } from './session.js';

/**
 * Update the last_known_branch hint for a spec
 */
export function updateLastKnownBranch(
  spec: string,
  branch: string | null,
  cwd?: string
): void {
  try {
    updateStatus({ last_known_branch: branch }, spec, cwd);
  } catch {
    // Ignore if status file doesn't exist
  }
}

// ============================================================================
// Spec Listing
// ============================================================================

export interface SpecInfo {
  name: string;
  specPath: string;
  stage: string;
  lastKnownBranch: string | null;
  isActive: boolean;
}

/**
 * List all specs in .planning/
 */
export function listSpecs(cwd?: string): SpecInfo[] {
  const gitRoot = getGitRoot(cwd);
  const planningRoot = join(gitRoot, '.planning');

  if (!existsSync(planningRoot)) {
    return [];
  }

  const activeSpec = getActiveSpec(cwd);
  const entries = readdirSync(planningRoot, { withFileTypes: true });
  const specs: SpecInfo[] = [];

  for (const entry of entries) {
    // Skip non-directories and the .active file
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

      specs.push({
        name: entry.name,
        specPath: status.spec,
        stage: status.stage,
        lastKnownBranch: status.last_known_branch ?? null,
        isActive: entry.name === activeSpec,
      });
    } catch {
      // Skip malformed status files
      continue;
    }
  }

  return specs;
}

