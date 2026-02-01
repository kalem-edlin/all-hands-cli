/**
 * Specs Commands (Agent-Facing)
 *
 * High-level spec management operations.
 *
 * Commands:
 * - ah specs list              - List all specs grouped by domain_name
 * - ah specs complete <name>   - Mark spec completed, move spec out of roadmap
 * - ah specs create <path>     - Create spec: validate, assign branch, commit and push
 * - ah specs graph             - Render dependency graph with availability markers
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getGitRoot, getCurrentBranch } from '../lib/planning.js';
import { getBaseBranch, gitExec } from '../lib/git.js';
import { KnowledgeService } from '../lib/knowledge.js';
import { findSpecByBranch, getSpecForBranch, loadAllSpecs as loadAllSpecGroups, type SpecFile, type SpecFrontmatter } from '../lib/specs.js';
import { logCommandStart, logCommandSuccess, logCommandError } from '../lib/trace-store.js';

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
export function updateSpecStatus(filePath: string, newStatus: 'roadmap' | 'in_progress' | 'completed'): boolean {
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
 * Find a spec by ID (filename without extension)
 */
function findSpecByName(name: string): SpecFile | null {
  const groups = loadAllSpecGroups();
  for (const group of groups) {
    const spec = group.specs.find((s) => s.id === name);
    if (spec) return spec;
  }
  return null;
}

/**
 * Reindex knowledge bases after spec file moves.
 * Updates both 'docs' and 'roadmap' indexes to reflect the file move.
 */
export async function reindexAfterMove(
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
      const groups = loadAllSpecGroups();
      let allSpecs = groups.flatMap((g) => g.specs);

      // Apply status filters
      if (options.roadmap) {
        allSpecs = allSpecs.filter((s) => s.status === 'roadmap');
      } else if (options.completed) {
        allSpecs = allSpecs.filter((s) => s.status === 'completed');
      } else if (options.inProgress) {
        allSpecs = allSpecs.filter((s) => s.status === 'in_progress');
      }

      // Group by domain_name
      const byDomain: Record<string, SpecFile[]> = {};
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

        const sortedSpecs = domainSpecs.sort((a, b) => a.id.localeCompare(b.id));

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
            console.log(`  ${statusIcon} ${spec.id}${deps}`);
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
        const domainSpecs = byDomain[domain].sort((a, b) => a.id.localeCompare(b.id));
        for (const spec of domainSpecs) {
          const statusIcon = spec.status === 'completed' ? '[x]' : spec.status === 'in_progress' ? '[>]' : '[ ]';
          const deps = spec.dependencies.length > 0 ? ` (deps: ${spec.dependencies.join(', ')})` : '';
          console.log(`  ${statusIcon} ${spec.id}${deps}`);
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
      const spec = getSpecForBranch(branch);

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

  // ah specs graph
  specs
    .command('graph')
    .description('Render dependency graph showing spec relationships and availability')
    .option('--json', 'Output as JSON')
    .option('--roadmap', 'Only show roadmap/in-progress specs')
    .action((options: { json?: boolean; roadmap?: boolean }) => {
      const allSpecs = loadAllSpecGroups().flatMap((g) => g.specs);

      if (allSpecs.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0, available: [], tree: [], summary: { completed: 0, in_progress: 0, roadmap: 0, available: 0 } }, null, 2));
        } else {
          console.log('No specs found.');
        }
        return;
      }

      // Index all specs by id for lookups
      const specById = new Map<string, typeof allSpecs[0]>();
      for (const spec of allSpecs) {
        specById.set(spec.id, spec);
      }

      // Compute availability: roadmap + all deps completed (against full unfiltered set)
      // Dangling deps (unknown spec ids) are treated as satisfied
      function isAvailable(spec: typeof allSpecs[0]): boolean {
        if (spec.status !== 'roadmap') return false;
        return spec.dependencies.every((depId) => {
          const dep = specById.get(depId);
          return !dep || dep.status === 'completed';
        });
      }

      const availableIds = allSpecs.filter(isAvailable).map((s) => s.id).sort();

      // Build display set (filtered or full)
      let displaySpecs = allSpecs;
      if (options.roadmap) {
        displaySpecs = allSpecs.filter((s) => s.status !== 'completed');
        if (displaySpecs.length === 0) {
          if (options.json) {
            console.log(JSON.stringify({ success: true, count: 0, available: availableIds, tree: [], summary: { completed: allSpecs.filter((s) => s.status === 'completed').length, in_progress: 0, roadmap: 0, available: availableIds.length } }, null, 2));
          } else {
            console.log('No roadmap specs found.');
          }
          return;
        }
      }

      const displayIds = new Set(displaySpecs.map((s) => s.id));

      // Build parent→children edges and find roots in one pass
      const childrenOf = new Map<string, string[]>();
      const roots: string[] = [];
      for (const spec of displaySpecs) {
        const visibleDeps = spec.dependencies.filter((depId) => depId !== spec.id && displayIds.has(depId));
        if (visibleDeps.length === 0) {
          roots.push(spec.id);
        }
        for (const depId of visibleDeps) {
          if (!childrenOf.has(depId)) childrenOf.set(depId, []);
          childrenOf.get(depId)!.push(spec.id);
        }
      }

      // Detect orphaned cycles: specs not reachable from roots
      const reachable = new Set<string>();
      function markReachable(id: string): void {
        if (reachable.has(id)) return;
        reachable.add(id);
        for (const childId of childrenOf.get(id) || []) {
          markReachable(childId);
        }
      }
      for (const rootId of roots) {
        markReachable(rootId);
      }
      for (const spec of displaySpecs) {
        if (!reachable.has(spec.id)) {
          roots.push(spec.id);
          markReachable(spec.id);
        }
      }

      // Sort roots alphabetically
      roots.sort();

      // Summary counts
      const summary = {
        completed: displaySpecs.filter((s) => s.status === 'completed').length,
        in_progress: displaySpecs.filter((s) => s.status === 'in_progress').length,
        roadmap: displaySpecs.filter((s) => s.status === 'roadmap').length,
        available: availableIds.length,
      };

      // JSON output
      if (options.json) {
        interface TreeNode {
          id: string;
          domain_name: string;
          status: string;
          available: boolean;
          children: TreeNode[];
        }

        function buildJsonTree(id: string, path: Set<string>): TreeNode | null {
          const spec = specById.get(id);
          if (!spec) return null;
          const node: TreeNode = {
            id: spec.id,
            domain_name: spec.domain_name,
            status: spec.status,
            available: availableIds.includes(spec.id),
            children: [],
          };
          if (path.has(id)) return node; // cycle: return node without children
          path.add(id);
          const children = (childrenOf.get(id) || []).slice().sort();
          for (const childId of children) {
            const child = buildJsonTree(childId, path);
            if (child) node.children.push(child);
          }
          path.delete(id);
          return node;
        }

        const tree: TreeNode[] = [];
        for (const rootId of roots) {
          const node = buildJsonTree(rootId, new Set());
          if (node) tree.push(node);
        }

        console.log(JSON.stringify({
          success: true,
          count: displaySpecs.length,
          available: availableIds,
          tree,
          summary,
        }, null, 2));
        return;
      }

      // Human-readable tree output
      const lines: string[] = [];
      lines.push(`Dependency Tree (${displaySpecs.length} specs):\n`);

      function statusIcon(status: string): string {
        if (status === 'completed') return '[x]';
        if (status === 'in_progress') return '[>]';
        return '[ ]';
      }

      function renderNode(id: string, prefix: string, isLast: boolean, isRoot: boolean, pathSet: Set<string>): void {
        const spec = specById.get(id);
        if (!spec) return;

        const connector = isRoot ? '' : isLast ? '└── ' : '├── ';
        const icon = statusIcon(spec.status);
        const avail = availableIds.includes(spec.id) ? ' ★' : '';

        if (pathSet.has(id)) {
          lines.push(`${prefix}${connector}${icon} ${spec.id} (${spec.domain_name}) [cycle]`);
          return;
        }

        lines.push(`${prefix}${connector}${icon} ${spec.id} (${spec.domain_name})${avail}`);

        const children = (childrenOf.get(id) || []).slice().sort();
        if (children.length === 0) return;

        pathSet.add(id);
        const childPrefix = isRoot ? prefix : prefix + (isLast ? '    ' : '│   ');
        for (let i = 0; i < children.length; i++) {
          renderNode(children[i], childPrefix, i === children.length - 1, false, pathSet);
        }
        pathSet.delete(id);
      }

      for (const rootId of roots) {
        renderNode(rootId, '', true, true, new Set());
      }

      lines.push('');
      lines.push('Legend: [x] completed  [>] in_progress  [ ] roadmap  ★ available');

      console.log(lines.join('\n'));
    });

  // ah specs create <path>
  specs
    .command('create <path>')
    .description('Create spec: validate, assign branch, commit and push to base branch')
    .option('--json', 'Output as JSON')
    .action((specPath: string, options: { json?: boolean }) => {
      const commandName = 'specs create';
      const commandArgs = { specPath, options };
      logCommandStart(commandName, commandArgs);

      const gitRoot = getGitRoot();
      const baseBranch = getBaseBranch();
      const currentBranch = getCurrentBranch();

      // 1. Enforce being on base branch
      if (currentBranch !== baseBranch) {
        const error = `Spec creation requires being on the base branch (${baseBranch}). Currently on: ${currentBranch}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      // 2. Validate spec file
      const absolutePath = specPath.startsWith('/') ? specPath : join(process.cwd(), specPath);
      const specRelativePath = relative(gitRoot, absolutePath);

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

      if (!specRelativePath.startsWith('specs/roadmap/')) {
        const error = `Spec file must be in specs/roadmap/. Got: ${specRelativePath}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      // 3. Derive branch name from spec type
      const specName = basename(absolutePath, '.spec.md');
      const frontmatter = parseSpecFrontmatter(absolutePath);
      const specType = frontmatter?.type || 'milestone';

      const SPEC_TYPE_BRANCH_PREFIX: Record<string, string> = {
        milestone: 'feature/',
        investigation: 'fix/',
        optimization: 'optimize/',
        refactor: 'refactor/',
        documentation: 'docs/',
        triage: 'triage/',
      };

      const prefix = SPEC_TYPE_BRANCH_PREFIX[specType] || 'feature/';
      let specBranch = frontmatter?.branch || `${prefix}${specName}`;

      // Handle branch name collisions
      const baseBranchName = specBranch;
      let suffix = 1;
      let existingSpec = findSpecByBranch(specBranch, gitRoot);
      while (existingSpec && existingSpec.id !== specName) {
        suffix++;
        specBranch = `${baseBranchName}-${suffix}`;
        existingSpec = findSpecByBranch(specBranch, gitRoot);
      }

      // 4. Write branch to spec frontmatter if not present or changed
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

      // 5. Stage only the spec file
      const addResult = gitExec(['add', '--', specRelativePath], gitRoot);
      if (!addResult.success) {
        const error = `Failed to stage spec file: ${addResult.stderr}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      // 6. Commit
      const commitResult = gitExec(['commit', '-m', `spec: ${specName}`], gitRoot);
      if (!commitResult.success) {
        const error = `Failed to commit: ${commitResult.stderr}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      // 7. Push to origin
      const pushResult = gitExec(['push', 'origin', baseBranch], gitRoot);
      if (!pushResult.success) {
        const error = `Failed to push to origin ${baseBranch}: ${pushResult.stderr}`;
        logCommandError(commandName, error, commandArgs);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(error);
        }
        process.exit(1);
      }

      // 8. Report results
      logCommandSuccess(commandName, {
        name: specName,
        branch: specBranch,
        path: specRelativePath,
      });

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          name: specName,
          branch: specBranch,
          path: specRelativePath,
        }, null, 2));
      } else {
        console.log(`Created spec: ${specName}`);
        console.log(`  Branch: ${specBranch}`);
        console.log(`  Path: ${specRelativePath}`);
      }
    });
}
