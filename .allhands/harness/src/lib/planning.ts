/**
 * Planning Directory Management
 *
 * Handles .planning/ directory structure:
 * - .planning/{branch}/prompts/     - Prompt files for execution
 * - .planning/{branch}/alignment.md - Alignment doc with decisions
 * - .planning/{branch}/status.yaml  - Session state
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { execSync } from 'child_process';

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
  milestone: string;
  spec: string;
  branch: string;
  stage: 'planning' | 'executing' | 'reviewing' | 'pr' | 'compound';
  loop: LoopConfig;
  compound_run: boolean;
  created: string;
  updated: string;
  pr?: PRStatus;
  greptile?: GreptileStatus;
}

export interface AlignmentFrontmatter {
  milestone: string;
  spec: string;
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
    }).trim();
    return root;
  } catch {
    return process.cwd();
  }
}

/**
 * Get the .planning directory path for the current branch
 */
export function getPlanningDir(branch?: string, cwd?: string): string {
  const gitRoot = getGitRoot(cwd);
  const currentBranch = branch || getCurrentBranch(cwd);
  return join(gitRoot, '.planning', currentBranch);
}

/**
 * Get paths within the planning directory
 */
export function getPlanningPaths(branch?: string, cwd?: string) {
  const planningDir = getPlanningDir(branch, cwd);
  return {
    root: planningDir,
    prompts: join(planningDir, 'prompts'),
    alignment: join(planningDir, 'alignment.md'),
    status: join(planningDir, 'status.yaml'),
  };
}

/**
 * Ensure the .planning directory structure exists
 */
export function ensurePlanningDir(branch?: string, cwd?: string): void {
  const paths = getPlanningPaths(branch, cwd);

  // Create directories
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(paths.prompts, { recursive: true });
}

/**
 * Check if planning directory exists for a branch
 */
export function planningDirExists(branch?: string, cwd?: string): boolean {
  const paths = getPlanningPaths(branch, cwd);
  return existsSync(paths.root);
}

/**
 * Read the status file
 */
export function readStatus(branch?: string, cwd?: string): StatusFile | null {
  const paths = getPlanningPaths(branch, cwd);

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
 * Write the status file
 */
export function writeStatus(status: StatusFile, branch?: string, cwd?: string): void {
  const paths = getPlanningPaths(branch, cwd);
  ensurePlanningDir(branch, cwd);

  const content = stringifyYaml(status);
  writeFileSync(paths.status, content);
}

/**
 * Update specific fields in the status file
 */
export function updateStatus(
  updates: Partial<StatusFile>,
  branch?: string,
  cwd?: string
): StatusFile {
  const current = readStatus(branch, cwd);
  if (!current) {
    throw new Error('No status file exists. Initialize a milestone first.');
  }

  const updated: StatusFile = {
    ...current,
    ...updates,
    updated: new Date().toISOString(),
  };

  writeStatus(updated, branch, cwd);
  return updated;
}

/**
 * Create initial status file for a new milestone
 */
export function initializeStatus(
  milestone: string,
  specPath: string,
  branch?: string,
  cwd?: string
): StatusFile {
  const currentBranch = branch || getCurrentBranch(cwd);
  const now = new Date().toISOString();

  const status: StatusFile = {
    milestone,
    spec: specPath,
    branch: currentBranch,
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

  writeStatus(status, branch, cwd);
  return status;
}

/**
 * Read the alignment doc frontmatter
 */
export function readAlignmentFrontmatter(
  branch?: string,
  cwd?: string
): AlignmentFrontmatter | null {
  const paths = getPlanningPaths(branch, cwd);

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
 * Read the full alignment doc
 */
export function readAlignment(branch?: string, cwd?: string): string | null {
  const paths = getPlanningPaths(branch, cwd);

  if (!existsSync(paths.alignment)) {
    return null;
  }

  return readFileSync(paths.alignment, 'utf-8');
}

/**
 * Create initial alignment doc
 */
export function initializeAlignment(
  milestone: string,
  specPath: string,
  overview: string,
  hardRequirements: string[],
  branch?: string,
  cwd?: string
): void {
  const paths = getPlanningPaths(branch, cwd);
  ensurePlanningDir(branch, cwd);

  const now = new Date().toISOString();
  const frontmatter = stringifyYaml({
    milestone,
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
 * Append a decision to the alignment doc
 */
export function appendDecision(
  entry: DecisionEntry,
  branch?: string,
  cwd?: string
): void {
  const paths = getPlanningPaths(branch, cwd);

  if (!existsSync(paths.alignment)) {
    throw new Error('No alignment doc exists. Initialize a milestone first.');
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
 * List all prompt files in the planning directory
 */
export function listPromptFiles(branch?: string, cwd?: string): string[] {
  const paths = getPlanningPaths(branch, cwd);

  if (!existsSync(paths.prompts)) {
    return [];
  }

  return readdirSync(paths.prompts)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

/**
 * Get alignment doc token count estimate (rough)
 */
export function getAlignmentTokenCount(branch?: string, cwd?: string): number {
  const content = readAlignment(branch, cwd);
  if (!content) return 0;

  // Rough estimate: ~4 chars per token
  return Math.ceil(content.length / 4);
}

/**
 * Update PR status in status file
 */
export function updatePRStatus(
  url: string,
  number: number,
  branch?: string,
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
    branch,
    cwd
  );
}

/**
 * Update Greptile review status in status file
 */
export function updateGreptileStatus(
  state: Partial<GreptileStatus>,
  branch?: string,
  cwd?: string
): StatusFile {
  const current = readStatus(branch, cwd);
  if (!current) {
    throw new Error('No status file exists. Initialize a milestone first.');
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
    branch,
    cwd
  );
}
