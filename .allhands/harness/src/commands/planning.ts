/**
 * Planning Command - Manage .planning/ directories (spec-based)
 *
 * Commands:
 * - ah planning activate <spec>               - Set active spec (accepts name or file path, creates planning dir if needed)
 * - ah planning deactivate                    - Clear the active spec
 * - ah planning setup --spec <path>           - [Deprecated] Use 'activate' instead
 * - ah planning update-branch --spec <name> --branch <branch> - Update last_known_branch hint
 * - ah planning status [--spec <name>]        - Show planning status (defaults to active)
 * - ah planning list                          - List all specs with active indicator
 */

import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  initializeStatus,
  readStatus,
  getPlanningPaths,
  getGitRoot,
  getActiveSpec,
  setActiveSpec,
  clearActiveSpec,
  updateLastKnownBranch,
  planningDirExists,
} from '../lib/planning.js';
import {
  extractSpecNameFromFile,
  findSpecForPath,
  listAllSpecs,
} from '../lib/planning-utils.js';

export function register(program: Command): void {
  const cmd = program
    .command('planning')
    .description('Manage .planning/ directories (spec-based)');

  cmd
    .command('setup')
    .description('[Deprecated] Use "activate <spec_path>" instead. Creates .planning/{spec}/ directory.')
    .requiredOption('--spec <path>', 'Path to the spec file')
    .action(async (options: { spec: string }) => {
      const cwd = process.cwd();
      const specPath = resolve(cwd, options.spec);

      // Validate spec exists
      if (!existsSync(specPath)) {
        console.log(JSON.stringify({
          success: false,
          error: `Spec file not found: ${options.spec}`,
        }, null, 2));
        return;
      }

      // Extract spec name from spec file
      const specName = extractSpecNameFromFile(specPath);
      if (!specName) {
        console.log(JSON.stringify({
          success: false,
          error: `Could not extract spec name from file. Ensure spec has 'name' in frontmatter.`,
        }, null, 2));
        return;
      }

      // Check if this spec file already has a planning directory
      const existingSpec = findSpecForPath(options.spec, cwd);
      if (existingSpec && existingSpec !== specName) {
        console.log(JSON.stringify({
          success: false,
          error: `Spec file already linked to planning directory "${existingSpec}".`,
          existingSpec,
        }, null, 2));
        return;
      }

      // Check if planning already exists for this spec
      const paths = getPlanningPaths(specName, cwd);
      if (existsSync(paths.status)) {
        const existingStatus = readStatus(specName, cwd);
        if (existingStatus && existingStatus.spec !== specPath && existingStatus.spec !== options.spec) {
          const gitRoot = getGitRoot(cwd);
          const relativeSpecPath = specPath.replace(gitRoot + '/', '');
          if (existingStatus.spec !== relativeSpecPath) {
            console.log(JSON.stringify({
              success: false,
              error: `Spec "${specName}" already linked to different file: ${existingStatus.spec}`,
              existingSpecFile: existingStatus.spec,
            }, null, 2));
            return;
          }
        }
        // Already set up for this spec
        console.log(JSON.stringify({
          success: true,
          message: `Planning already exists for spec "${specName}"`,
          spec: specName,
          specFile: options.spec,
          planningDir: `.planning/${specName}/`,
          alreadyExisted: true,
        }, null, 2));
        return;
      }

      // Create planning directory structure
      mkdirSync(paths.root, { recursive: true });
      mkdirSync(paths.prompts, { recursive: true });

      // Initialize status file with last_known_branch: null
      const gitRoot = getGitRoot(cwd);
      const relativeSpecPath = specPath.replace(gitRoot + '/', '');
      initializeStatus(specName, relativeSpecPath, null, cwd);

      console.log(JSON.stringify({
        success: true,
        message: `Created .planning/${specName}/ linked to spec`,
        spec: specName,
        specFile: relativeSpecPath,
        planningDir: `.planning/${specName}/`,
        last_known_branch: null,
        alreadyExisted: false,
      }, null, 2));
    });

  cmd
    .command('activate <spec>')
    .description('Set the active spec (accepts spec name or spec file path)')
    .action(async (specArg: string) => {
      const cwd = process.cwd();
      let specName: string;
      let specFile: string | null = null;

      // Determine if argument is a file path or spec name
      const isPath = specArg.includes('/') || specArg.endsWith('.md');

      if (isPath) {
        // It's a file path - resolve and extract spec name
        const specPath = resolve(cwd, specArg);

        if (!existsSync(specPath)) {
          console.log(JSON.stringify({
            success: false,
            error: `Spec file not found: ${specArg}`,
          }, null, 2));
          return;
        }

        const extracted = extractSpecNameFromFile(specPath);
        if (!extracted) {
          console.log(JSON.stringify({
            success: false,
            error: `Could not extract spec name from file. Ensure spec has 'name' in frontmatter.`,
          }, null, 2));
          return;
        }

        specName = extracted;
        const gitRoot = getGitRoot(cwd);
        specFile = specPath.replace(gitRoot + '/', '');
      } else {
        // It's a spec name
        specName = specArg;
      }

      // Create planning directory if it doesn't exist
      if (!planningDirExists(specName, cwd)) {
        if (!specFile) {
          console.log(JSON.stringify({
            success: false,
            error: `Spec "${specName}" has no planning directory. Provide spec file path to create it.`,
          }, null, 2));
          return;
        }

        // Create planning directory structure (absorbs setup functionality)
        const paths = getPlanningPaths(specName, cwd);
        mkdirSync(paths.root, { recursive: true });
        mkdirSync(paths.prompts, { recursive: true });
        initializeStatus(specName, specFile, null, cwd);
      }

      // Set as active
      setActiveSpec(specName, cwd);

      // Return full status
      const status = readStatus(specName, cwd);
      console.log(JSON.stringify({
        success: true,
        message: `Activated spec: ${specName}`,
        spec: specName,
        specFile: status?.spec || specFile,
        planningDir: `.planning/${specName}/`,
        last_known_branch: status?.last_known_branch || null,
        stage: status?.stage || 'planning',
        ...status,
      }, null, 2));
    });

  cmd
    .command('deactivate')
    .description('Clear the active spec')
    .action(async () => {
      const cwd = process.cwd();
      const current = getActiveSpec(cwd);

      clearActiveSpec(cwd);

      console.log(JSON.stringify({
        success: true,
        message: current
          ? `Deactivated spec: ${current}`
          : 'No active spec to deactivate',
        previousSpec: current,
      }, null, 2));
    });

  cmd
    .command('update-branch')
    .description('Update the last_known_branch hint for a spec')
    .requiredOption('--spec <name>', 'Spec name')
    .requiredOption('--branch <branch>', 'Branch name (or "null" to clear)')
    .action(async (options: { spec: string; branch: string }) => {
      const cwd = process.cwd();

      // Verify spec exists
      if (!planningDirExists(options.spec, cwd)) {
        console.log(JSON.stringify({
          success: false,
          error: `Spec "${options.spec}" does not exist.`,
        }, null, 2));
        return;
      }

      const branchValue = options.branch === 'null' ? null : options.branch;
      updateLastKnownBranch(options.spec, branchValue, cwd);

      console.log(JSON.stringify({
        success: true,
        message: `Updated last_known_branch for ${options.spec}`,
        spec: options.spec,
        last_known_branch: branchValue,
      }, null, 2));
    });

  cmd
    .command('status')
    .description('Show planning status (defaults to active spec)')
    .option('--spec <name>', 'Spec to check (defaults to active)')
    .action(async (options: { spec?: string }) => {
      const cwd = process.cwd();

      // Determine which spec to check
      let spec: string | null = options.spec ?? null;
      if (!spec) {
        spec = getActiveSpec(cwd);
        if (!spec) {
          console.log(JSON.stringify({
            success: true,
            hasPlanning: false,
            message: 'No active spec. Use "ah planning activate <spec>" to set one.',
          }, null, 2));
          return;
        }
      }

      const status = readStatus(spec, cwd);

      if (!status) {
        console.log(JSON.stringify({
          success: true,
          spec,
          hasPlanning: false,
          message: `No planning directory for spec "${spec}"`,
        }, null, 2));
        return;
      }

      const activeSpec = getActiveSpec(cwd);
      console.log(JSON.stringify({
        success: true,
        hasPlanning: true,
        isActive: spec === activeSpec,
        ...status,
      }, null, 2));
    });

  cmd
    .command('list')
    .description('List all specs with active indicator')
    .action(async () => {
      const cwd = process.cwd();
      const specs = listAllSpecs(cwd);

      console.log(JSON.stringify({
        success: true,
        count: specs.length,
        activeSpec: getActiveSpec(cwd),
        specs,
      }, null, 2));
    });
}
