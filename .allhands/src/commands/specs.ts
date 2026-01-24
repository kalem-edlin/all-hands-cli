/**
 * Specs Commands (Agent-Facing)
 *
 * High-level spec management operations.
 *
 * Commands:
 * - ah specs list              - List all specs grouped by domain_name
 * - ah specs complete <name>   - Mark spec completed, move spec out of roadmap
 * - ah specs resurrect <name>  - Mark spec incomplete, move spec back to roadmap
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getGitRoot } from '../lib/planning.js';

interface SpecFrontmatter {
  name: string;
  domain_name: string;
  status: 'roadmap' | 'in_progress' | 'completed';
  dependencies: string[];
}

interface SpecInfo {
  name: string;
  domain_name: string;
  status: 'roadmap' | 'in_progress' | 'completed';
  path: string;
  dependencies: string[];
}

/**
 * Parse spec file frontmatter
 */
function parseSpecFrontmatter(filePath: string): SpecFrontmatter | null {
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    return parseYaml(frontmatterMatch[1]) as SpecFrontmatter;
  } catch {
    return null;
  }
}

/**
 * Update spec file frontmatter status
 */
function updateSpecStatus(filePath: string, newStatus: 'roadmap' | 'in_progress' | 'completed'): boolean {
  if (!existsSync(filePath)) return false;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) return false;

    const frontmatter = parseYaml(frontmatterMatch[1]) as SpecFrontmatter;
    frontmatter.status = newStatus;

    const newContent = `---\n${stringifyYaml(frontmatter).trim()}\n---\n${frontmatterMatch[2]}`;
    writeFileSync(filePath, newContent);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan a directory for spec files and parse their frontmatter
 */
function scanSpecsDir(dir: string): SpecInfo[] {
  if (!existsSync(dir)) return [];

  const specs: SpecInfo[] = [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.spec.md'));

  for (const file of files) {
    const filePath = join(dir, file);
    const frontmatter = parseSpecFrontmatter(filePath);
    if (frontmatter) {
      specs.push({
        name: frontmatter.name || file.replace('.spec.md', ''),
        domain_name: frontmatter.domain_name || 'uncategorized',
        status: frontmatter.status || 'roadmap',
        path: filePath,
        dependencies: frontmatter.dependencies || [],
      });
    }
  }

  return specs;
}

/**
 * Load all specs from both specs/ and specs/roadmap/
 */
function loadAllSpecs(): SpecInfo[] {
  const gitRoot = getGitRoot();
  const specsDir = join(gitRoot, 'specs');
  const roadmapDir = join(specsDir, 'roadmap');

  const rootSpecs = scanSpecsDir(specsDir);
  const roadmapSpecs = scanSpecsDir(roadmapDir);

  return [...rootSpecs, ...roadmapSpecs];
}

/**
 * Find a spec by name
 */
function findSpecByName(name: string): SpecInfo | null {
  const specs = loadAllSpecs();
  return specs.find((s) => s.name === name) || null;
}

export function register(program: Command): void {
  const specs = program
    .command('specs')
    .description('Spec management');

  // ah specs list
  specs
    .command('list')
    .description('List all specs grouped by domain')
    .option('--json', 'Output as JSON')
    .option('--domains-only', 'Only list domain names')
    .option('--domain <name>', 'Filter to a specific domain')
    .action(async (options: { json?: boolean; domainsOnly?: boolean; domain?: string }) => {
      const allSpecs = loadAllSpecs();

      // Group by domain_name
      const byDomain: Record<string, SpecInfo[]> = {};
      for (const spec of allSpecs) {
        const domain = spec.domain_name || 'uncategorized';
        if (!byDomain[domain]) {
          byDomain[domain] = [];
        }
        byDomain[domain].push(spec);
      }

      const domains = Object.keys(byDomain).sort();

      // Handle --domains-only
      if (options.domainsOnly) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            count: domains.length,
            domains,
          }, null, 2));
        } else {
          for (const domain of domains) {
            console.log(domain);
          }
        }
        return;
      }

      // Handle --domain <name>
      if (options.domain) {
        const domainSpecs = byDomain[options.domain];
        if (!domainSpecs) {
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: `Domain not found: ${options.domain}` }));
          } else {
            console.error(`Domain not found: ${options.domain}`);
          }
          process.exit(1);
        }

        const sortedSpecs = domainSpecs.sort((a, b) => a.name.localeCompare(b.name));

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            domain: options.domain,
            count: sortedSpecs.length,
            specs: sortedSpecs,
          }, null, 2));
        } else {
          console.log(`## ${options.domain}\n`);
          for (const spec of sortedSpecs) {
            const statusIcon = spec.status === 'completed' ? '[x]' : spec.status === 'in_progress' ? '[>]' : '[ ]';
            const deps = spec.dependencies.length > 0 ? ` (deps: ${spec.dependencies.join(', ')})` : '';
            console.log(`  ${statusIcon} ${spec.name}${deps}`);
          }
        }
        return;
      }

      // Default: list all specs grouped by domain
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          count: allSpecs.length,
          domains: byDomain,
        }, null, 2));
        return;
      }

      console.log(`Found ${allSpecs.length} spec(s):\n`);

      for (const domain of domains) {
        console.log(`## ${domain}`);
        const domainSpecs = byDomain[domain].sort((a, b) => a.name.localeCompare(b.name));
        for (const spec of domainSpecs) {
          const statusIcon = spec.status === 'completed' ? '[x]' : spec.status === 'in_progress' ? '[>]' : '[ ]';
          const deps = spec.dependencies.length > 0 ? ` (deps: ${spec.dependencies.join(', ')})` : '';
          console.log(`  ${statusIcon} ${spec.name}${deps}`);
        }
        console.log();
      }
    });

  // ah specs complete <name>
  specs
    .command('complete <name>')
    .description('Mark spec completed and move to specs/')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      const spec = findSpecByName(name);

      if (!spec) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Spec not found: ${name}` }));
        } else {
          console.error(`Spec not found: ${name}`);
        }
        process.exit(1);
      }

      if (spec.status === 'completed') {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Spec already completed: ${name}` }));
        } else {
          console.error(`Spec already completed: ${name}`);
        }
        process.exit(1);
      }

      const gitRoot = getGitRoot();
      const specsDir = join(gitRoot, 'specs');
      const targetPath = join(specsDir, `${name}.spec.md`);

      // Update status in frontmatter
      if (!updateSpecStatus(spec.path, 'completed')) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'Failed to update spec status' }));
        } else {
          console.error('Failed to update spec status');
        }
        process.exit(1);
      }

      // Move file if it's in roadmap
      if (spec.path.includes('/roadmap/')) {
        mkdirSync(dirname(targetPath), { recursive: true });
        renameSync(spec.path, targetPath);
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          name,
          status: 'completed',
          path: spec.path.includes('/roadmap/') ? targetPath : spec.path,
        }, null, 2));
        return;
      }

      console.log(`Marked spec completed: ${name}`);
      if (spec.path.includes('/roadmap/')) {
        console.log(`  Moved to: ${targetPath}`);
      }
    });

  // ah specs resurrect <name>
  specs
    .command('resurrect <name>')
    .description('Mark spec incomplete and move back to roadmap')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      const spec = findSpecByName(name);

      if (!spec) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Spec not found: ${name}` }));
        } else {
          console.error(`Spec not found: ${name}`);
        }
        process.exit(1);
      }

      if (spec.status === 'roadmap') {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Spec already in roadmap: ${name}` }));
        } else {
          console.error(`Spec already in roadmap: ${name}`);
        }
        process.exit(1);
      }

      const gitRoot = getGitRoot();
      const roadmapDir = join(gitRoot, 'specs', 'roadmap');
      const targetPath = join(roadmapDir, `${name}.spec.md`);

      // Update status in frontmatter
      if (!updateSpecStatus(spec.path, 'roadmap')) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'Failed to update spec status' }));
        } else {
          console.error('Failed to update spec status');
        }
        process.exit(1);
      }

      // Move file if it's not already in roadmap
      if (!spec.path.includes('/roadmap/')) {
        mkdirSync(roadmapDir, { recursive: true });
        renameSync(spec.path, targetPath);
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          name,
          status: 'roadmap',
          path: !spec.path.includes('/roadmap/') ? targetPath : spec.path,
        }, null, 2));
        return;
      }

      console.log(`Resurrected spec to roadmap: ${name}`);
      if (!spec.path.includes('/roadmap/')) {
        console.log(`  Moved to: ${targetPath}`);
      }
    });
}
