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
import { join, dirname, relative, basename } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getGitRoot, getCurrentBranch } from '../lib/planning.js';
import { getBaseBranch, commitFilesToBranch, createBranchWithoutCheckout } from '../lib/git.js';
import { KnowledgeService } from '../lib/knowledge.js';
import { findSpecByBranch } from '../lib/specs.js';
import { logCommandStart, logCommandSuccess, logCommandError } from '../lib/trace-store.js';

interface SpecFrontmatter {
  name: string;
  domain_name: string;
  status: 'roadmap' | 'in_progress' | 'completed';
  dependencies: string[];
  branch?: string;  // Source of truth for spec's working branch
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

/**
 * Reindex knowledge bases after spec file moves.
 * Updates both 'docs' and 'roadmap' indexes to reflect the file move.
 */
async function reindexAfterMove(
  gitRoot: string,
  oldPath: string,
  newPath: string,
  quiet: boolean = false
): Promise<void> {
  const service = new KnowledgeService(gitRoot, { quiet });
  const oldRelPath = relative(gitRoot, oldPath);
  const newRelPath = relative(gitRoot, newPath);

  // Update roadmap index: remove old location if it was in roadmap
  if (oldRelPath.startsWith('specs/roadmap/')) {
    await service.reindexFromChanges('roadmap', [
      { path: oldRelPath, deleted: true },
    ]);
  }
  // Add new location if it's now in roadmap
  if (newRelPath.startsWith('specs/roadmap/')) {
    await service.reindexFromChanges('roadmap', [
      { path: newRelPath, added: true },
    ]);
  }

  // Update docs index: docs includes all of specs/
  // Remove from old location, add to new location
  await service.reindexFromChanges('docs', [
    { path: oldRelPath, deleted: true },
    { path: newRelPath, added: true },
  ]);
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
    .option('--roadmap', 'Only show specs in the roadmap (not completed)')
    .option('--completed', 'Only show completed specs')
    .option('--in-progress', 'Only show in-progress specs')
    .action(async (options: { json?: boolean; domainsOnly?: boolean; domain?: string; roadmap?: boolean; completed?: boolean; inProgress?: boolean }) => {
      let allSpecs = loadAllSpecs();

      // Apply status filters
      if (options.roadmap) {
        allSpecs = allSpecs.filter((s) => s.status === 'roadmap');
      } else if (options.completed) {
        allSpecs = allSpecs.filter((s) => s.status === 'completed');
      } else if (options.inProgress) {
        allSpecs = allSpecs.filter((s) => s.status === 'in_progress');
      }

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

  // ah specs current
  specs
    .command('current')
    .description('Show spec for current git branch')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const branch = getCurrentBranch();
      const spec = findSpecByBranch(branch);

      if (!spec) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            hasSpec: false,
            branch,
            message: 'No spec for this branch',
          }, null, 2));
        } else {
          console.log(`No spec for branch: ${branch}`);
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          hasSpec: true,
          branch,
          spec: {
            id: spec.id,
            name: spec.title,
            path: spec.path,
            domain: spec.domain_name,
            status: spec.status,
            dependencies: spec.dependencies,
          },
        }, null, 2));
      } else {
        console.log(`Branch: ${branch}`);
        console.log(`Spec: ${spec.id}`);
        console.log(`  Title: ${spec.title}`);
        console.log(`  Path: ${spec.path}`);
        console.log(`  Domain: ${spec.domain_name}`);
        console.log(`  Status: ${spec.status}`);
        if (spec.dependencies.length > 0) {
          console.log(`  Dependencies: ${spec.dependencies.join(', ')}`);
        }
      }
    });

  // ah specs complete <name>
  specs
    .command('complete <name>')
    .description('Mark spec completed and move to specs/')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      const commandName = 'specs complete';
      const commandArgs = { name, options };
      logCommandStart(commandName, commandArgs);

      const spec = findSpecByName(name);

      if (!spec) {
        const error = `Spec not found: ${name}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      if (spec.status === 'completed') {
        const error = `Spec already completed: ${name}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      const gitRoot = getGitRoot();
      const specsDir = join(gitRoot, 'specs');
      const targetPath = join(specsDir, `${name}.spec.md`);

      // Update status in frontmatter
      if (!updateSpecStatus(spec.path, 'completed')) {
        const error = 'Failed to update spec status';
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      // Move file if it's in roadmap
      const wasInRoadmap = spec.path.includes('/roadmap/');
      if (wasInRoadmap) {
        mkdirSync(dirname(targetPath), { recursive: true });
        renameSync(spec.path, targetPath);

        // Reindex knowledge bases to reflect the move
        if (!options.json) {
          console.log('  Reindexing knowledge bases...');
        }
        await reindexAfterMove(gitRoot, spec.path, targetPath, options.json);
      }

      // Log success
      logCommandSuccess(commandName, {
        name,
        status: 'completed',
        path: wasInRoadmap ? targetPath : spec.path,
        reindexed: wasInRoadmap,
      });

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          name,
          status: 'completed',
          path: wasInRoadmap ? targetPath : spec.path,
          reindexed: wasInRoadmap,
        }, null, 2));
        return;
      }

      console.log(`Marked spec completed: ${name}`);
      if (wasInRoadmap) {
        console.log(`  Moved to: ${targetPath}`);
        console.log('  Knowledge indexes updated ✓');
      }
    });

  // ah specs resurrect <name>
  specs
    .command('resurrect <name>')
    .description('Mark spec incomplete and move back to roadmap')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      const commandName = 'specs resurrect';
      const commandArgs = { name, options };
      logCommandStart(commandName, commandArgs);

      const spec = findSpecByName(name);

      if (!spec) {
        const error = `Spec not found: ${name}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      if (spec.status === 'roadmap') {
        const error = `Spec already in roadmap: ${name}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      const gitRoot = getGitRoot();
      const roadmapDir = join(gitRoot, 'specs', 'roadmap');
      const targetPath = join(roadmapDir, `${name}.spec.md`);

      // Update status in frontmatter
      if (!updateSpecStatus(spec.path, 'roadmap')) {
        const error = 'Failed to update spec status';
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      // Move file if it's not already in roadmap
      const wasNotInRoadmap = !spec.path.includes('/roadmap/');
      if (wasNotInRoadmap) {
        mkdirSync(roadmapDir, { recursive: true });
        renameSync(spec.path, targetPath);

        // Reindex knowledge bases to reflect the move
        if (!options.json) {
          console.log('  Reindexing knowledge bases...');
        }
        await reindexAfterMove(gitRoot, spec.path, targetPath, options.json);
      }

      // Log success
      logCommandSuccess(commandName, {
        name,
        status: 'roadmap',
        path: wasNotInRoadmap ? targetPath : spec.path,
        reindexed: wasNotInRoadmap,
      });

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          name,
          status: 'roadmap',
          path: wasNotInRoadmap ? targetPath : spec.path,
          reindexed: wasNotInRoadmap,
        }, null, 2));
        return;
      }

      console.log(`Resurrected spec to roadmap: ${name}`);
      if (wasNotInRoadmap) {
        console.log(`  Moved to: ${targetPath}`);
        console.log('  Knowledge indexes updated ✓');
      }
    });

  // ah specs persist <path>
  specs
    .command('persist <path>')
    .description('Create spec branch, update frontmatter, and commit to base branch')
    .option('--json', 'Output as JSON')
    .option('--no-branch', 'Skip branch creation (just commit to base)')
    .action((specPath: string, options: { json?: boolean; branch?: boolean }) => {
      const commandName = 'specs persist';
      const commandArgs = { specPath, options };
      logCommandStart(commandName, commandArgs);

      const gitRoot = getGitRoot();
      const baseBranch = getBaseBranch();

      // Resolve spec path
      const absolutePath = specPath.startsWith('/') ? specPath : join(process.cwd(), specPath);
      const relativePath = relative(gitRoot, absolutePath);

      if (!existsSync(absolutePath)) {
        const error = `Spec file not found: ${specPath}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      // Validate it's a spec file
      if (!absolutePath.endsWith('.spec.md')) {
        const error = 'File must be a .spec.md file';
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      const specName = basename(absolutePath, '.spec.md');
      let specBranch: string = `feature/${specName}`;
      let branchCreated = false;

      // Read current frontmatter to check for existing branch
      const frontmatter = parseSpecFrontmatter(absolutePath);

      // Handle branch creation if not disabled
      if (options.branch !== false) {
        // Use existing branch from frontmatter, or use the default
        if (frontmatter?.branch) {
          specBranch = frontmatter.branch;
        }

        // Resolve branch collisions by appending a number
        const baseBranchName = specBranch;
        let suffix = 1;
        let existingSpec = findSpecByBranch(specBranch, gitRoot);
        while (existingSpec && existingSpec.id !== specName) {
          suffix++;
          specBranch = `${baseBranchName}-${suffix}`;
          existingSpec = findSpecByBranch(specBranch, gitRoot);
        }

        // Create the branch from base without checkout
        const branchResult = createBranchWithoutCheckout(specBranch, baseBranch, gitRoot);

        if (!branchResult.success) {
          const error = `Failed to create branch: ${branchResult.error}`;
          logCommandError(commandName, error, commandArgs);
          if (options.json) {
            console.log(JSON.stringify({ success: false, error }));
          } else {
            console.error(error);
          }
          process.exit(1);
        }

        branchCreated = branchResult.created;

        // Update spec frontmatter with branch if missing or changed due to collision
        if (!frontmatter?.branch || frontmatter.branch !== specBranch) {
          try {
            const content = readFileSync(absolutePath, 'utf-8');
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

            if (frontmatterMatch) {
              const fm = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
              fm.branch = specBranch;
              const newContent = `---\n${stringifyYaml(fm).trim()}\n---\n${frontmatterMatch[2]}`;
              writeFileSync(absolutePath, newContent);
            }
          } catch (e) {
            const error = `Failed to update frontmatter: ${e instanceof Error ? e.message : String(e)}`;
            logCommandError(commandName, error, commandArgs);
            if (options.json) {
              console.log(JSON.stringify({ success: false, error }));
            } else {
              console.error(error);
            }
            process.exit(1);
          }
        }
      }

      // Use generic git utility to commit to base branch
      const result = commitFilesToBranch({
        files: [absolutePath],
        branch: baseBranch,
        message: `spec: ${specName}`,
        cwd: gitRoot,
      });

      if (!result.success) {
        const error = result.error || 'Unknown error';
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(`Failed to persist spec: ${error}`);
        }
        process.exit(1);
      }

      // Log success
      logCommandSuccess(commandName, {
        path: relativePath,
        baseBranch,
        specBranch,
        branchCreated,
        method: result.method,
      });

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          path: relativePath,
          baseBranch,
          specBranch,
          branchCreated,
          currentBranch: result.currentBranch,
          method: result.method,
        }, null, 2));
      } else {
        console.log(`Committed spec to ${baseBranch}: ${relativePath}`);
        if (specBranch) {
          if (branchCreated) {
            console.log(`  Created branch: ${specBranch}`);
          } else {
            console.log(`  Branch exists: ${specBranch}`);
          }
        }
        if (result.currentBranch) {
          console.log(`  (You remain on ${result.currentBranch})`);
        }
      }
    });
}
