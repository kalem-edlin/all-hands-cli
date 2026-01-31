/**
 * Spec File Management
 *
 * Handles discovery and loading of spec files for spec selection.
 * Scans specs/roadmap/ for planned/in-progress specs and specs/ for completed specs.
 * Only .spec.md files are matched. Parses YAML frontmatter for domain_name and status fields.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import { ensurePlanningDir, initializeStatus } from './planning.js';

export type SpecType = 'milestone' | 'investigation' | 'optimization' | 'refactor' | 'documentation' | 'triage';

export interface SpecFrontmatter {
  name?: string;
  domain_name?: string;
  type?: SpecType;
  status?: 'roadmap' | 'in_progress' | 'completed';
  dependencies?: string[];
  branch?: string;  // Source of truth for spec's working branch
  initial_workflow_domain?: SpecType;
}

export interface SpecFile {
  id: string;
  filename: string;
  path: string;
  title: string;
  category: 'roadmap' | 'active' | 'completed';
  domain_name: string;
  type: SpecType;
  status: 'roadmap' | 'in_progress' | 'completed';
  dependencies: string[];
  branch?: string;  // Source of truth for spec's working branch
}

export interface SpecGroup {
  category: 'roadmap' | 'active' | 'completed';
  label: string;
  specs: SpecFile[];
}

export interface DomainGroup {
  domain_name: string;
  specs: SpecFile[];
}

/**
 * Parse frontmatter from spec file content
 */
export function parseFrontmatter(content: string): SpecFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  try {
    return parseYaml(match[1]) as SpecFrontmatter;
  } catch {
    return null;
  }
}

/**
 * Extract title from spec file content
 * Looks for first H1 heading or uses filename
 */
function extractTitle(content: string, filename: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }
  // Fall back to filename without extension
  return filename.replace(/\.spec\.md$/i, '').replace(/\.md$/i, '').replace(/-/g, ' ');
}

/**
 * Scan a directory for spec files
 */
export function scanSpecDir(
  dir: string,
  category: 'roadmap' | 'active' | 'completed'
): SpecFile[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.spec.md')
  );

  return files.map((filename) => {
    const path = join(dir, filename);
    const content = readFileSync(path, 'utf-8');
    const title = extractTitle(content, filename);
    const id = filename.replace(/\.spec\.md$/i, '').replace(/\.md$/i, '');
    const frontmatter = parseFrontmatter(content);

    return {
      id,
      filename,
      path,
      title,
      category,
      domain_name: frontmatter?.domain_name || 'uncategorized',
      type: frontmatter?.type || 'milestone',
      status: frontmatter?.status || (category === 'completed' ? 'completed' : category === 'roadmap' ? 'roadmap' : 'in_progress'),
      dependencies: frontmatter?.dependencies || [],
      branch: frontmatter?.branch,
    };
  });
}

/**
 * Load all spec files grouped by category
 */
export function loadAllSpecs(cwd?: string): SpecGroup[] {
  const basePath = cwd || process.cwd();
  const groups: SpecGroup[] = [];

  // Roadmap specs (planned)
  const roadmapDir = join(basePath, 'specs', 'roadmap');
  const roadmapSpecs = scanSpecDir(roadmapDir, 'roadmap');
  if (roadmapSpecs.length > 0) {
    groups.push({
      category: 'roadmap',
      label: 'Roadmap (Planned)',
      specs: roadmapSpecs,
    });
  }

  // Completed specs (in specs/ root)
  const specsDir = join(basePath, 'specs');
  const completedSpecs = scanSpecDir(specsDir, 'completed');
  if (completedSpecs.length > 0) {
    groups.push({
      category: 'completed',
      label: 'Completed',
      specs: completedSpecs,
    });
  }

  return groups;
}

/**
 * Find a spec file by ID
 */
export function findSpecById(specId: string, cwd?: string): SpecFile | null {
  const groups = loadAllSpecs(cwd);
  for (const group of groups) {
    const spec = group.specs.find((s) => s.id === specId);
    if (spec) {
      return spec;
    }
  }
  return null;
}

/**
 * Convert spec groups to modal items format
 */
export function specsToModalItems(
  groups: SpecGroup[]
): Array<{ id: string; label: string; type: 'header' | 'item' }> {
  const items: Array<{ id: string; label: string; type: 'header' | 'item' }> = [];

  for (const group of groups) {
    // Add header
    items.push({
      id: `header-${group.category}`,
      label: `── ${group.label} ──`,
      type: 'header',
    });

    // Add specs (use id which is the filename without extension)
    for (const spec of group.specs) {
      items.push({
        id: spec.id,
        label: spec.id,
        type: 'item',
      });
    }
  }

  // If no specs found, add a helpful message
  if (items.length === 0) {
    items.push({
      id: 'header-empty',
      label: '── No specs found ──',
      type: 'header',
    });
    items.push({
      id: 'info',
      label: 'Add .md files to specs/',
      type: 'item',
    });
  }

  return items;
}

/**
 * Load all specs grouped by domain_name
 */
export function loadSpecsByDomain(cwd?: string): DomainGroup[] {
  const groups = loadAllSpecs(cwd);
  const allSpecs = groups.flatMap((g) => g.specs);

  // Group by domain_name
  const byDomain: Record<string, SpecFile[]> = {};
  for (const spec of allSpecs) {
    const domain = spec.domain_name;
    if (!byDomain[domain]) {
      byDomain[domain] = [];
    }
    byDomain[domain].push(spec);
  }

  // Convert to array sorted by domain name
  return Object.entries(byDomain)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain_name, specs]) => ({
      domain_name,
      specs: specs.sort((a, b) => a.id.localeCompare(b.id)),
    }));
}

/**
 * Get all specs with a specific status
 */
export function getSpecsByStatus(
  status: 'roadmap' | 'in_progress' | 'completed',
  cwd?: string
): SpecFile[] {
  const groups = loadAllSpecs(cwd);
  return groups.flatMap((g) => g.specs).filter((s) => s.status === status);
}

/**
 * Find a spec by its branch field
 * Returns the spec whose frontmatter.branch matches the given branch name
 *
 * NOTE: This only works if the spec file exists on the current branch.
 * For robust lookup that works across branch switches, use getSpecForBranch().
 */
export function findSpecByBranch(branch: string, cwd?: string): SpecFile | null {
  const groups = loadAllSpecs(cwd);
  for (const group of groups) {
    const spec = group.specs.find((s) => s.branch === branch);
    if (spec) {
      return spec;
    }
  }
  return null;
}

/**
 * Get the spec associated with a branch, using .planning/ as the source of truth.
 *
 * This function works correctly even when spec files don't exist on the current
 * branch (e.g., when on a feature branch but specs live on main).
 *
 * Lookup order:
 * 1. Check .planning/{sanitized_branch}/status.yaml for persisted spec path
 * 2. If found, extract spec ID and try to load full spec from current tree
 * 3. If spec file not on current branch, return minimal SpecFile with ID
 * 4. Fall back to findSpecByBranch() - if found, create planning dir
 */
export function getSpecForBranch(branch: string, cwd?: string): SpecFile | null {
  const basePath = cwd || process.cwd();
  const planningKey = branch.replace(/[^a-zA-Z0-9_-]/g, '-');
  const statusPath = join(basePath, '.planning', planningKey, 'status.yaml');

  // Check if planning directory exists with status file
  if (existsSync(statusPath)) {
    try {
      const content = readFileSync(statusPath, 'utf-8');
      const status = parseYaml(content) as { spec?: string; name?: string };

      if (status?.spec) {
        // Extract spec ID from path (e.g., "specs/roadmap/my-spec.md" -> "my-spec")
        const specId = basename(status.spec)
          .replace(/\.spec\.md$/i, '')
          .replace(/\.md$/i, '');

        // Try to find the full spec in current tree
        const fullSpec = findSpecById(specId, cwd);
        if (fullSpec) {
          return fullSpec;
        }

        // Spec file not on current branch - return minimal SpecFile
        // This happens when spec is on main but we're on a feature branch
        return {
          id: specId,
          filename: basename(status.spec),
          path: status.spec,
          title: specId.replace(/-/g, ' '),
          category: 'active',
          domain_name: 'unknown',
          type: 'milestone',
          status: 'in_progress',
          dependencies: [],
          branch: branch,
        };
      }
    } catch {
      // Status file parse error - fall through to findSpecByBranch
    }
  }

  // No planning dir or no spec in status - try branch-based lookup
  const spec = findSpecByBranch(branch, cwd);

  // If we found a spec but no planning dir exists, create it
  if (spec) {
    try {
      ensurePlanningDir(planningKey, cwd);
      initializeStatus(planningKey, spec.path, branch, cwd);
    } catch {
      // Failed to create planning dir - continue without it
    }
  }

  return spec;
}

const VALID_WORKFLOW_DOMAINS: SpecType[] = ['milestone', 'investigation', 'optimization', 'refactor', 'documentation', 'triage'];

/**
 * Get the workflow domain from a spec file's frontmatter.
 * Uses proper YAML parsing via parseFrontmatter(). Validates against
 * the SpecType union and defaults to 'milestone' for unknown values.
 */
export function getWorkflowDomain(specPath: string): SpecType {
  try {
    if (!existsSync(specPath)) return 'milestone';
    const content = readFileSync(specPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    if (frontmatter?.initial_workflow_domain && VALID_WORKFLOW_DOMAINS.includes(frontmatter.initial_workflow_domain)) {
      return frontmatter.initial_workflow_domain;
    }
  } catch {
    // Ignore parse errors, use default
  }
  return 'milestone';
}
