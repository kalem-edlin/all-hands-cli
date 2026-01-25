/**
 * Spec File Management
 *
 * Handles discovery and loading of spec files for spec selection.
 * Scans specs/roadmap/ for planned specs and specs/ for others.
 * Parses YAML frontmatter for domain_name and status fields.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';

export interface SpecFrontmatter {
  name?: string;
  domain_name?: string;
  status?: 'roadmap' | 'in_progress' | 'completed';
  dependencies?: string[];
}

export interface SpecFile {
  id: string;
  filename: string;
  path: string;
  title: string;
  category: 'roadmap' | 'active' | 'completed';
  domain_name: string;
  status: 'roadmap' | 'in_progress' | 'completed';
  dependencies: string[];
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
function parseFrontmatter(content: string): SpecFrontmatter | null {
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
function scanSpecDir(
  dir: string,
  category: 'roadmap' | 'active' | 'completed'
): SpecFile[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.spec.md') || (f.endsWith('.md') && !f.startsWith('_'))
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
      status: frontmatter?.status || (category === 'completed' ? 'completed' : category === 'roadmap' ? 'roadmap' : 'in_progress'),
      dependencies: frontmatter?.dependencies || [],
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

  // Active specs (in specs/ root, not in subdirs)
  const specsDir = join(basePath, 'specs');
  const activeSpecs = scanSpecDir(specsDir, 'active');
  if (activeSpecs.length > 0) {
    groups.push({
      category: 'active',
      label: 'Active',
      specs: activeSpecs,
    });
  }

  // Completed specs
  const completedDir = join(basePath, 'specs', 'completed');
  const completedSpecs = scanSpecDir(completedDir, 'completed');
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

    // Add specs
    for (const spec of group.specs) {
      items.push({
        id: spec.id,
        label: spec.title,
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
