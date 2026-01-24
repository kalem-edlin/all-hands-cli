/**
 * Perplexity Commands (Agent-Facing)
 *
 * Deep research with citations using Perplexity's sonar-deep-research model.
 *
 * Commands:
 * - ah perplexity research <query> - Deep research with citations
 */

import { Command } from 'commander';

interface PerplexityResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[];
}

const PERPLEXITY_TIMEOUT = parseInt(process.env.PERPLEXITY_TIMEOUT_MS ?? '300000', 10);

export function register(program: Command): void {
  const perplexity = program
    .command('perplexity')
    .description('Deep research with citations');

  // ah perplexity research
  perplexity
    .command('research <query>')
    .description('Deep research with citations')
    .option('--json', 'Output as JSON')
    .action(async (query: string, options: { json?: boolean }) => {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'PERPLEXITY_API_KEY not set' }));
        } else {
          console.error('Error: PERPLEXITY_API_KEY not set in environment');
        }
        process.exit(1);
      }

      try {
        const response = await callPerplexityApi(apiKey, query);

        let content = response.choices?.[0]?.message?.content ?? '';
        // Remove <think> tags if present
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const citations = response.citations ?? [];

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            query,
            content,
            citations,
          }, null, 2));
          return;
        }

        console.log('Research Results:');
        console.log();
        console.log(content);

        if (citations.length > 0) {
          console.log();
          console.log('Citations:');
          for (let i = 0; i < citations.length; i++) {
            console.log(`  [${i + 1}] ${citations[i]}`);
          }
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

async function callPerplexityApi(apiKey: string, query: string): Promise<PerplexityResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT);

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-deep-research',
        messages: [{ role: 'user', content: query }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as PerplexityResponse;
  } finally {
    clearTimeout(timeout);
  }
}
