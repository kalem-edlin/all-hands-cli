/**
 * Oracle Commands (Agent-Facing)
 *
 * Multi-provider LLM inference for agent tasks.
 * Uses the standardized oracle library for provider integration.
 *
 * Commands:
 * - ah oracle ask <query> - Raw LLM inference with file context
 * - ah oracle pr-build [--branch] [--dry-run] - Create PR with generated description
 *
 */

import { Command } from 'commander';
import { tracedAction } from '../lib/base-command.js';
import {
  ask,
  getDefaultProvider,
  PROVIDERS,
  type ProviderName,
} from '../lib/llm.js';
import { buildPR } from '../lib/oracle.js';

export function register(program: Command): void {
  const oracle = program
    .command('oracle')
    .description('Multi-provider LLM inference');

  // ah oracle ask
  oracle
    .command('ask <query>')
    .description('Raw LLM inference with optional file context')
    .option('--provider <provider>', 'LLM provider (gemini | openai)', getDefaultProvider())
    .option('--model <model>', 'Override default model')
    .option('--files <files...>', 'Files to include as context')
    .option('--context <context>', 'Additional context')
    .option('--json', 'Output as JSON')
    .action(tracedAction('oracle ask', async (query: string, options: {
      provider: ProviderName;
      model?: string;
      files?: string[];
      context?: string;
      json?: boolean;
    }) => {
      // Validate provider
      if (!PROVIDERS[options.provider]) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'Invalid provider. Use: gemini, openai' }));
        } else {
          console.error('Error: Invalid provider. Use: gemini, openai');
        }
        process.exit(1);
      }

      try {
        const result = await ask(query, {
          provider: options.provider,
          model: options.model,
          files: options.files,
          context: options.context,
        });

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            content: result.text,
            model: result.model,
            provider: result.provider,
            duration_ms: result.durationMs,
          }, null, 2));
          return;
        }

        console.log(result.text);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(`Error: ${error}`);
        }
        process.exit(1);
      }
    }));

  // ah oracle pr-build
  oracle
    .command('pr-build')
    .description('Create PR with generated description')
    .option('--spec <spec>', 'Spec to create PR for (defaults to active)')
    .option('--dry-run', 'Generate description without creating PR')
    .option('--json', 'Output as JSON')
    .action(tracedAction('oracle pr-build', async (options: {
      spec?: string;
      dryRun?: boolean;
      json?: boolean;
    }) => {
      try {
        // Import planning utils here to avoid circular dependency
        const { getCurrentBranch, sanitizeBranchForDir, planningDirExists } = await import('../lib/planning.js');
        const { getSpecForBranch } = await import('../lib/specs.js');

        let spec = options.spec;
        if (!spec) {
          // Use current branch to find spec
          const branch = getCurrentBranch();
          const currentSpec = getSpecForBranch(branch);
          if (currentSpec) {
            spec = sanitizeBranchForDir(branch);
          }
        }
        if (!spec) {
          console.error('Error: No spec for current branch. Checkout a spec branch first.');
          return;
        }
        const result = await buildPR(spec, undefined, options.dryRun);

        if (options.json) {
          console.log(JSON.stringify({
            success: result.success,
            pr_url: result.prUrl,
            pr_number: result.prNumber,
            title: result.title,
            body: result.body,
            review_steps: result.reviewSteps,
            dry_run: options.dryRun || false,
          }, null, 2));
          return;
        }

        if (options.dryRun) {
          console.log(`\n=== PR Preview (Dry Run) ===\n`);
          console.log(`Title: ${result.title}`);
          console.log(`\nBody:\n${result.body}`);
          console.log(`\n=== Review Steps (Posted as Comment) ===\n`);
          console.log(result.reviewSteps);
          return;
        }

        if (result.success && result.prUrl) {
          console.log(`\n=== PR Created ===\n`);
          console.log(`URL: ${result.prUrl}`);
          console.log(`Number: #${result.prNumber}`);
          console.log(`Title: ${result.title}`);
        } else {
          console.error(`Failed to create PR: ${result.body}`);
          process.exit(1);
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(`Error: ${error}`);
        }
        process.exit(1);
      }
    }));
}
