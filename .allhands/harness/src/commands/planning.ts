/**
 * Planning Command - Manage .planning/ directories (branch-keyed)
 *
 * Commands:
 * - ah planning status               - Show planning status for current branch
 * - ah planning list                 - List all planning directories
 * - ah planning ensure               - Ensure planning dir exists for current branch
 *
 * In the branch-keyed model:
 * - Planning directories are keyed by sanitized branch name (feature/foo → feature-foo)
 * - The spec's frontmatter.branch field is the source of truth
 * - Current git branch determines the active context
 */

import { Command } from 'commander';
import {
  initializeStatus,
  readStatus,
  updateStatus,
  getPlanningPaths,
  planningDirExists,
  getCurrentBranch,
  sanitizeBranchForDir,
  ensurePlanningDir,
  listPlanningDirs,
  resetPlanningArtifacts,
  type StatusFile,
} from '../lib/planning.js';
import { getSpecForBranch } from '../lib/specs.js';
import { tracedAction } from '../lib/base-command.js';

export function register(program: Command): void {
  const cmd = program
    .command('planning')
    .description('Manage .planning/ directories (branch-keyed)');

  // ah planning status
  cmd
    .command('status')
    .description('Show planning status for current branch')
    .option('--json', 'Output as JSON')
    .action(tracedAction('planning status', async (options: { json?: boolean }) => {
      const cwd = process.cwd();
      const branch = getCurrentBranch(cwd);
      const dirKey = sanitizeBranchForDir(branch);

      // Find spec for current branch
      const spec = getSpecForBranch(branch, cwd);
      const status = readStatus(dirKey, cwd);

      if (!spec) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            hasSpec: false,
            hasPlanning: !!status,
            branch,
            message: 'No spec for this branch',
          }, null, 2));
        } else {
          console.log(`Branch: ${branch}`);
          console.log('No spec linked to this branch.');
          if (status) {
            console.log(`  (Planning dir exists: .planning/${dirKey}/)`);
          }
        }
        return;
      }

      if (!status) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            hasSpec: true,
            hasPlanning: false,
            branch,
            spec: {
              id: spec.id,
              path: spec.path,
            },
            message: 'Spec exists but no planning directory. Run "ah planning ensure".',
          }, null, 2));
        } else {
          console.log(`Branch: ${branch}`);
          console.log(`Spec: ${spec.id}`);
          console.log('No planning directory. Run "ah planning ensure" to create it.');
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          hasSpec: true,
          hasPlanning: true,
          branch,
          planningDir: `.planning/${dirKey}/`,
          specInfo: {
            id: spec.id,
            path: spec.path,
          },
          ...status,
        }, null, 2));
      } else {
        console.log(`Branch: ${branch}`);
        console.log(`Spec: ${spec.id} (${spec.path})`);
        console.log(`Planning: .planning/${dirKey}/`);
        console.log(`Stage: ${status.stage}`);
        if (status.pr) {
          console.log(`PR: ${status.pr.url}`);
        }
      }
    }));

  // ah planning list
  cmd
    .command('list')
    .description('List all planning directories')
    .option('--json', 'Output as JSON')
    .action(tracedAction('planning list', async (options: { json?: boolean }) => {
      const cwd = process.cwd();
      const dirs = listPlanningDirs(cwd);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          count: dirs.length,
          dirs,
        }, null, 2));
      } else {
        if (dirs.length === 0) {
          console.log('No planning directories found.');
          return;
        }

        console.log(`Found ${dirs.length} planning director${dirs.length === 1 ? 'y' : 'ies'}:\n`);
        for (const dir of dirs) {
          const marker = dir.isCurrent ? '→ ' : '  ';
          console.log(`${marker}${dir.key}/`);
          console.log(`    Spec: ${dir.specPath}`);
          console.log(`    Stage: ${dir.stage}`);
        }
      }
    }));

  // ah planning ensure
  cmd
    .command('ensure')
    .description('Ensure planning directory exists for current branch')
    .option('--json', 'Output as JSON')
    .option('--no-spec', 'Allow specless planning directory (for quick-loop)')
    .action(tracedAction('planning ensure', async (options: { json?: boolean; spec?: boolean }) => {
      const cwd = process.cwd();
      const branch = getCurrentBranch(cwd);
      const noSpec = options.spec === false; // commander negates --no-spec into spec: false

      // Find spec for this branch (skip if --no-spec)
      const spec = noSpec ? null : getSpecForBranch(branch, cwd);

      if (!spec && !noSpec) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: `No spec found for branch: ${branch}`,
            branch,
          }, null, 2));
        } else {
          console.error(`No spec found for branch: ${branch}`);
          console.error('Use "ah specs current" to check branch-spec mapping, or --no-spec for specless planning.');
        }
        process.exit(1);
      }

      // Use sanitized branch name for directory
      const dirKey = sanitizeBranchForDir(branch);
      const alreadyExists = planningDirExists(dirKey, cwd);

      if (!alreadyExists) {
        // Create planning directory structure
        ensurePlanningDir(dirKey, cwd);

        // Initialize status file with original branch for collision detection
        initializeStatus(dirKey, spec?.path ?? '', branch, cwd);
      }

      const status = readStatus(dirKey, cwd);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          branch,
          specId: spec?.id ?? null,
          specPath: spec?.path ?? null,
          planningDir: `.planning/${dirKey}/`,
          created: !alreadyExists,
          status,
        }, null, 2));
      } else {
        if (alreadyExists) {
          console.log(`Planning directory exists: .planning/${dirKey}/`);
        } else {
          console.log(`Created planning directory: .planning/${dirKey}/`);
        }
        console.log(`  Branch: ${branch}`);
        if (spec) {
          console.log(`  Spec: ${spec.id} (${spec.path})`);
        } else {
          console.log(`  Spec: (none)`);
        }
        console.log(`  Stage: ${status?.stage || 'planning'}`);
      }
    }));

  // ah planning reset
  cmd
    .command('reset')
    .description('Reset planning artifacts for current branch (deletes prompts and alignment doc, resets stage to planning)')
    .option('--json', 'Output as JSON')
    .action(tracedAction('planning reset', async (options: { json?: boolean }) => {
      const cwd = process.cwd();
      const branch = getCurrentBranch(cwd);
      const dirKey = sanitizeBranchForDir(branch);

      if (!planningDirExists(dirKey, cwd)) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: `No planning directory for branch: ${branch}`,
            branch,
          }, null, 2));
        } else {
          console.error(`No planning directory for branch: ${branch}`);
        }
        process.exit(1);
      }

      const wasReset = resetPlanningArtifacts(dirKey, cwd);

      if (options.json) {
        console.log(JSON.stringify({
          success: wasReset,
          branch,
          planningDir: `.planning/${dirKey}/`,
          message: 'Planning artifacts cleared — spec revision requires re-planning',
        }, null, 2));
      } else {
        console.log('Planning artifacts cleared — spec revision requires re-planning');
        console.log(`  Branch: ${branch}`);
        console.log(`  Planning: .planning/${dirKey}/`);
        console.log(`  Stage: planning`);
      }
    }));

  // ah planning enable
  cmd
    .command('enable')
    .description('Set planning stage to executing for current branch (activates the loop)')
    .option('--json', 'Output as JSON')
    .action(tracedAction('planning enable', async (options: { json?: boolean }) => {
      const cwd = process.cwd();
      const branch = getCurrentBranch(cwd);
      const dirKey = sanitizeBranchForDir(branch);

      if (!planningDirExists(dirKey, cwd)) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: `No planning directory for branch: ${branch}`,
            branch,
          }, null, 2));
        } else {
          console.error(`No planning directory for branch: ${branch}`);
          console.error('Run "ah planning ensure" first.');
        }
        process.exit(1);
      }

      updateStatus({ stage: 'executing' as StatusFile['stage'] }, dirKey, cwd);
      const status = readStatus(dirKey, cwd);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          branch,
          planningDir: `.planning/${dirKey}/`,
          stage: status?.stage,
        }, null, 2));
      } else {
        console.log(`Planning enabled for branch: ${branch}`);
        console.log(`  Planning: .planning/${dirKey}/`);
        console.log(`  Stage: ${status?.stage}`);
      }
    }));
}
