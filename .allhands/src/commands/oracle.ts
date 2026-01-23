/**
 * Oracle Commands (Agent-Facing)
 *
 * Multi-provider LLM inference for agent tasks.
 * Uses the standardized oracle library for provider integration.
 *
 * Commands:
 * - ah oracle ask <query> - Raw LLM inference with file context
 * - ah oracle compaction <logs> <prompt> <alignment> - Post-agent analysis
 * - ah oracle pr-build [--branch] [--dry-run] - Create PR with generated description
 *
 * Note: Internal oracle functions (like branch naming) are NOT exposed
 * via CLI - they are only available through direct library imports.
 */

import { Command } from 'commander';
import {
  ask,
  getDefaultProvider,
  PROVIDERS,
  type ProviderName,
} from '../lib/llm.js';
import { buildPR } from '../lib/oracle.js';
import { runCompaction } from '../lib/compaction.js';

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
    .action(async (query: string, options: {
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
    });

  // ah oracle compaction
  oracle
    .command('compaction <conversation_logs> <prompt_file>')
    .description('Post-agent analysis and learning extraction')
    .action(async (
      conversationLogs: string,
      promptFile: string
    ) => {
      try {
        const result = await runCompaction({
          conversationLogs,
          promptFile,
        });

        // Simple output - window gets killed after this anyway
        // The important work is updating the prompt file's Progress section
        if (result.success) {
          console.log(`Compaction complete: ${result.recommendation.action} (attempt ${result.attemptNumber})`);
        } else {
          console.error(`Compaction failed: ${result.error}`);
          process.exit(1);
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`Error: ${error}`);
        process.exit(1);
      }
    });

  // ah oracle pr-build
  oracle
    .command('pr-build')
    .description('Create PR with generated description')
    .option('--branch <branch>', 'Branch to create PR from')
    .option('--dry-run', 'Generate description without creating PR')
    .option('--json', 'Output as JSON')
    .action(async (options: {
      branch?: string;
      dryRun?: boolean;
      json?: boolean;
    }) => {
      try {
        const result = await buildPR(options.branch, undefined, options.dryRun);

        if (options.json) {
          console.log(JSON.stringify({
            success: result.success,
            pr_url: result.prUrl,
            pr_number: result.prNumber,
            title: result.title,
            body: result.body,
            dry_run: options.dryRun || false,
          }, null, 2));
          return;
        }

        if (options.dryRun) {
          console.log(`\n=== PR Preview (Dry Run) ===\n`);
          console.log(`Title: ${result.title}`);
          console.log(`\nBody:\n${result.body}`);
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
    });
}
