/**
 * Prompts Command (Agent-Facing)
 *
 * Lists and analyzes prompt files with their frontmatter status.
 * Uses the active spec to determine which prompts to show.
 *
 * Usage:
 * - ah prompts status              - List all prompts with status summaries
 * - ah prompts status --pending    - Only show pending prompts
 * - ah prompts status --in-progress - Only show in-progress prompts
 * - ah prompts status --done       - Only show completed prompts
 * - ah prompts status --type <type> - Filter by type (planned, emergent, user-patch, review-fix)
 * - ah prompts status --spec <name> - Use specific spec (defaults to active)
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  getCurrentBranch,
  sanitizeBranchForDir,
  getPlanningPaths,
  listPromptFiles,
  planningDirExists,
} from '../lib/planning.js';
import { tracedAction } from '../lib/base-command.js';

interface PromptFrontmatter {
  number: number;
  title: string;
  type: 'planned' | 'emergent' | 'user-patch' | 'review-fix';
  planning_session: number;
  status: 'pending' | 'in_progress' | 'done';
  dependencies: number[];
  attempts: number;
  commits: string[];
  validation_suites: string[];
  skills: string[];
  patches_prompts?: number[];
}

interface PromptSummary {
  number: number;
  title: string;
  type: string;
  status: string;
  file: string;
  dependencies: number[];
  attempts: number;
  hasSummary: boolean;
  patches_prompts?: number[];
}

/**
 * Extract frontmatter from markdown content
 */
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check if prompt has a success or failure summary
 */
function hasSummarySection(content: string): boolean {
  return content.includes('SUCCESS SUMMARY:') || content.includes('FAILURE SUMMARY:');
}

/**
 * Parse a prompt file and extract summary info
 */
function parsePromptFile(filePath: string, relativePath: string): PromptSummary | null {
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const frontmatter = extractFrontmatter(content) as PromptFrontmatter | null;

    if (!frontmatter || typeof frontmatter.number !== 'number') {
      return null;
    }

    return {
      number: frontmatter.number,
      title: frontmatter.title || 'Untitled',
      type: frontmatter.type || 'planned',
      status: frontmatter.status || 'pending',
      file: relativePath,
      dependencies: frontmatter.dependencies || [],
      attempts: frontmatter.attempts || 0,
      hasSummary: hasSummarySection(content),
      ...(frontmatter.patches_prompts && { patches_prompts: frontmatter.patches_prompts }),
    };
  } catch {
    return null;
  }
}

/**
 * Load all prompts for a spec
 */
function loadPrompts(spec: string, cwd?: string): PromptSummary[] {
  if (!planningDirExists(spec, cwd)) {
    return [];
  }

  const paths = getPlanningPaths(spec, cwd);
  const files = listPromptFiles(spec, cwd);
  const prompts: PromptSummary[] = [];

  for (const file of files) {
    const filePath = join(paths.prompts, file);
    const relativePath = `.planning/${spec}/prompts/${file}`;
    const summary = parsePromptFile(filePath, relativePath);

    if (summary) {
      prompts.push(summary);
    }
  }

  // Sort by number
  return prompts.sort((a, b) => a.number - b.number);
}

export function register(program: Command): void {
  const cmd = program
    .command('prompts')
    .description('Prompt file analysis and status');

  cmd
    .command('status')
    .description('List all prompts with their frontmatter status')
    .option('--json', 'Output as JSON (default)')
    .option('--spec <name>', 'Spec to check (defaults to active)')
    .option('--pending', 'Only show pending prompts')
    .option('--in-progress', 'Only show in-progress prompts')
    .option('--done', 'Only show completed prompts')
    .option('--type <type>', 'Filter by type (planned, emergent, user-patch, review-fix)')
    .option('--emergent', 'Shorthand for --type emergent')
    .option('--user-patch', 'Shorthand for --type user-patch')
    .action(tracedAction('prompts status', async (options: {
      json?: boolean;
      spec?: string;
      pending?: boolean;
      inProgress?: boolean;
      done?: boolean;
      type?: string;
      emergent?: boolean;
      userPatch?: boolean;
    }) => {
      const cwd = process.cwd();

      // Determine which planning key to use (from option or current branch)
      // The planning key is the sanitized branch name, not the spec ID
      let spec: string | null = options.spec ?? null;
      if (!spec) {
        const branch = getCurrentBranch(cwd);
        spec = sanitizeBranchForDir(branch);
      }

      // Check if spec has planning
      if (!planningDirExists(spec, cwd)) {
        console.log(JSON.stringify({
          success: false,
          error: `No planning directory found for spec "${spec}". Initialize with \`ah planning setup --spec <path>\`.`,
        }, null, 2));
        return;
      }

      let prompts = loadPrompts(spec, cwd);

      // Apply status filters
      if (options.pending) {
        prompts = prompts.filter((p) => p.status === 'pending');
      } else if (options.inProgress) {
        prompts = prompts.filter((p) => p.status === 'in_progress');
      } else if (options.done) {
        prompts = prompts.filter((p) => p.status === 'done');
      }

      // Apply type filters
      let typeFilter = options.type;
      if (options.emergent) typeFilter = 'emergent';
      if (options.userPatch) typeFilter = 'user-patch';

      if (typeFilter) {
        prompts = prompts.filter((p) => p.type === typeFilter);
      }

      // Compute stats
      const stats = {
        total: prompts.length,
        pending: prompts.filter((p) => p.status === 'pending').length,
        in_progress: prompts.filter((p) => p.status === 'in_progress').length,
        done: prompts.filter((p) => p.status === 'done').length,
        by_type: {
          planned: prompts.filter((p) => p.type === 'planned').length,
          emergent: prompts.filter((p) => p.type === 'emergent').length,
          'user-patch': prompts.filter((p) => p.type === 'user-patch').length,
          'review-fix': prompts.filter((p) => p.type === 'review-fix').length,
        },
      };

      console.log(JSON.stringify({
        success: true,
        spec,
        stats,
        prompts,
      }, null, 2));
    }));

  cmd
    .command('unblocked')
    .description('List prompts that are ready to execute (pending with all dependencies done)')
    .option('--spec <name>', 'Spec to check (defaults to active)')
    .action(tracedAction('prompts unblocked', async (options: { spec?: string }) => {
      const cwd = process.cwd();

      // Determine which planning key to use (from option or current branch)
      let spec: string | null = options.spec ?? null;
      if (!spec) {
        const branch = getCurrentBranch(cwd);
        spec = sanitizeBranchForDir(branch);
      }

      if (!planningDirExists(spec, cwd)) {
        console.log(JSON.stringify({
          success: false,
          error: `No planning directory found for "${spec}".`,
        }, null, 2));
        return;
      }

      const allPrompts = loadPrompts(spec, cwd);

      // Get set of done prompt numbers
      const doneNumbers = new Set(
        allPrompts
          .filter((p) => p.status === 'done')
          .map((p) => p.number)
      );

      // Find pending prompts with all dependencies satisfied
      const unblocked = allPrompts.filter((p) => {
        if (p.status !== 'pending') return false;

        // Check if all dependencies are done
        return p.dependencies.every((dep) => doneNumbers.has(dep));
      });

      console.log(JSON.stringify({
        success: true,
        spec,
        count: unblocked.length,
        prompts: unblocked,
      }, null, 2));
    }));

  cmd
    .command('summaries')
    .description('List prompts that have success/failure summaries (completed executions)')
    .option('--spec <name>', 'Spec to check (defaults to active)')
    .action(tracedAction('prompts summaries', async (options: { spec?: string }) => {
      const cwd = process.cwd();

      // Determine which planning key to use (from option or current branch)
      let spec: string | null = options.spec ?? null;
      if (!spec) {
        const branch = getCurrentBranch(cwd);
        spec = sanitizeBranchForDir(branch);
      }

      if (!planningDirExists(spec, cwd)) {
        console.log(JSON.stringify({
          success: false,
          error: `No planning directory found for "${spec}".`,
        }, null, 2));
        return;
      }

      const prompts = loadPrompts(spec, cwd).filter((p) => p.hasSummary);

      console.log(JSON.stringify({
        success: true,
        spec,
        count: prompts.length,
        prompts,
      }, null, 2));
    }));
}
