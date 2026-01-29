/**
 * Planning Utilities - Shared functions for spec management
 *
 * In the branch-keyed model:
 * - Planning directories are keyed by sanitized branch name
 * - The spec's frontmatter.branch field is the source of truth
 * - Current git branch determines which spec is "current"
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { getGitRoot, getCurrentBranch, sanitizeBranchForDir } from './planning.js';
import { findSpecByBranch, type SpecFile } from './specs.js';

interface StatusFile {
  name: string;
  spec: string;
  stage: string;
}

/**
 * Extract spec name from spec file frontmatter.
 */
export function extractSpecNameFromFile(specPath: string): string | null {
  if (!existsSync(specPath)) {
    return null;
  }

  try {
    const content = readFileSync(specPath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    const frontmatter = parseYaml(frontmatterMatch[1]) as { name?: string };
    return frontmatter.name || null;
  } catch {
    return null;
  }
}

/**
 * Find spec by spec file path.
 * Returns the planning directory key if found.
 */
export function findSpecForPath(specPath: string, cwd?: string): string | null {
  const workDir = cwd || process.cwd();
  const gitRoot = getGitRoot(workDir);
  const planningRoot = join(gitRoot, '.planning');

  if (!existsSync(planningRoot)) {
    return null;
  }

  // Normalize the spec path for comparison
  const normalizedSpecPath = resolve(workDir, specPath);
  const relativeSpecPath = normalizedSpecPath.replace(gitRoot + '/', '');

  const entries = readdirSync(planningRoot, { withFileTypes: true });

  for (const entry of entries) {
    // Skip non-directories and hidden files
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const statusPath = join(planningRoot, entry.name, 'status.yaml');
    if (!existsSync(statusPath)) continue;

    try {
      const content = readFileSync(statusPath, 'utf-8');
      const status = parseYaml(content) as StatusFile;

      // Compare spec paths (handle both absolute and relative)
      const statusSpecPath = status.spec?.replace(gitRoot + '/', '');
      if (statusSpecPath === relativeSpecPath || status.spec === specPath) {
        return entry.name; // Return the planning directory key
      }
    } catch {
      // Skip malformed status files
      continue;
    }
  }

  return null;
}

export interface SpecLink {
  /** Planning directory key (sanitized branch name) */
  key: string;
  /** Path to spec file */
  specFile: string;
  /** Current stage (planning, executing, reviewing, pr, compound) */
  stage: string;
  /** Whether this is the current branch's planning directory */
  isCurrent: boolean;
  /** Associated spec info (if found via branch lookup) */
  spec?: SpecFile;
}

/**
 * List all planning directories with their spec associations.
 */
export function listAllSpecs(cwd?: string): SpecLink[] {
  const workDir = cwd || process.cwd();
  const gitRoot = getGitRoot(workDir);
  const planningRoot = join(gitRoot, '.planning');

  if (!existsSync(planningRoot)) {
    return [];
  }

  const currentBranch = getCurrentBranch(cwd);
  const currentKey = sanitizeBranchForDir(currentBranch);
  const entries = readdirSync(planningRoot, { withFileTypes: true });
  const specs: SpecLink[] = [];

  for (const entry of entries) {
    // Skip non-directories and hidden files
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const statusPath = join(planningRoot, entry.name, 'status.yaml');
    if (!existsSync(statusPath)) continue;

    try {
      const content = readFileSync(statusPath, 'utf-8');
      const status = parseYaml(content) as StatusFile;

      // Try to find the associated spec
      // The key should match the sanitized version of a spec's branch field
      // This is a best-effort lookup - the spec may not exist
      let associatedSpec: SpecFile | undefined;

      // If the key looks like a sanitized branch, try to find the spec
      // by checking all specs for one whose sanitized branch matches
      // For now, we just mark isCurrent based on matching keys

      specs.push({
        key: entry.name,
        specFile: status.spec,
        stage: status.stage,
        isCurrent: entry.name === currentKey,
        spec: associatedSpec,
      });
    } catch {
      // Skip malformed status files
      continue;
    }
  }

  return specs;
}
