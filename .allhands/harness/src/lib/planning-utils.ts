/**
 * Planning Utilities - Shared functions for spec management
 *
 * In the spec-based model:
 * - Directories are keyed by spec name, not branch
 * - last_known_branch is a nullable hint for agents
 * - Spec name IS the directory key
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { getActiveSpec, getGitRoot } from './planning.js';

interface StatusFile {
  name: string;
  spec: string;
  last_known_branch: string | null;
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
 * Returns the spec name (directory name) if found.
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
    // Skip non-directories and hidden files (like .active)
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const statusPath = join(planningRoot, entry.name, 'status.yaml');
    if (!existsSync(statusPath)) continue;

    try {
      const content = readFileSync(statusPath, 'utf-8');
      const status = parseYaml(content) as StatusFile;

      // Compare spec paths (handle both absolute and relative)
      const statusSpecPath = status.spec?.replace(gitRoot + '/', '');
      if (statusSpecPath === relativeSpecPath || status.spec === specPath) {
        return entry.name; // Return the spec name (directory name)
      }
    } catch {
      // Skip malformed status files
      continue;
    }
  }

  return null;
}

export interface SpecLink {
  /** Spec name (directory name, primary key) */
  name: string;
  /** Path to spec file */
  specFile: string;
  /** Current stage (planning, executing, reviewing, pr, compound) */
  stage: string;
  /** Last known branch (nullable hint for agents) */
  lastKnownBranch: string | null;
  /** Whether this spec is currently active */
  isActive: boolean;
}

/**
 * List all specs from .planning directories.
 */
export function listAllSpecs(cwd?: string): SpecLink[] {
  const workDir = cwd || process.cwd();
  const gitRoot = getGitRoot(workDir);
  const planningRoot = join(gitRoot, '.planning');

  if (!existsSync(planningRoot)) {
    return [];
  }

  const activeSpec = getActiveSpec(cwd);
  const entries = readdirSync(planningRoot, { withFileTypes: true });
  const specs: SpecLink[] = [];

  for (const entry of entries) {
    // Skip non-directories and hidden files (like .active)
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const statusPath = join(planningRoot, entry.name, 'status.yaml');
    if (!existsSync(statusPath)) continue;

    try {
      const content = readFileSync(statusPath, 'utf-8');
      const status = parseYaml(content) as StatusFile;

      specs.push({
        name: entry.name,
        specFile: status.spec,
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
