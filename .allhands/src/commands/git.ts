/**
 * Git Commands
 *
 * Exposes git utilities that leverage automatic base branch detection.
 * Useful for agents that need to diff against the base without knowing
 * which branch that is (main, master, develop, etc.).
 *
 * Commands:
 * - ah git base            - Show detected base branch
 * - ah git diff-base       - Show diff from base branch to HEAD
 * - ah git diff-base-files - List changed file names from base to HEAD
 */

import { Command } from 'commander';
import { getBaseBranch, getChangedFilesFromBase, getDiffFromBase } from '../lib/git.js';

export function register(program: Command): void {
  const git = program
    .command('git')
    .description('Git utilities with automatic base branch detection');

  // ah git base
  git
    .command('base')
    .description('Show the detected base branch (main, master, develop, etc.)')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const baseBranch = getBaseBranch();

      if (options.json) {
        console.log(JSON.stringify({ base_branch: baseBranch }, null, 2));
      } else {
        console.log(baseBranch);
      }
    });

  // ah git diff-base
  git
    .command('diff-base')
    .description('Show diff from base branch to HEAD (three-dot diff)')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const baseBranch = getBaseBranch();
      const diff = getDiffFromBase();

      if (options.json) {
        console.log(JSON.stringify({ base_branch: baseBranch, diff }, null, 2));
      } else {
        console.log(diff);
      }
    });

  // ah git diff-base-files
  git
    .command('diff-base-files')
    .description('List file names changed from base branch to HEAD')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const baseBranch = getBaseBranch();
      const files = getChangedFilesFromBase();

      if (options.json) {
        console.log(JSON.stringify({ base_branch: baseBranch, files, count: files.length }, null, 2));
      } else {
        if (files.length === 0) {
          console.log('(No changed files from base)');
        } else {
          files.forEach(f => console.log(f));
        }
      }
    });
}
