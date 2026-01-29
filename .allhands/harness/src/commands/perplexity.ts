/**
 * Perplexity Commands (Agent-Facing)
 *
 * Web search with citations using Perplexity's sonar-pro model.
 * Matches the configuration used by the Perplexity MCP server.
 *
 * Commands:
 * - ah perplexity research <query> - Web search with citations
 *   --challenge: Challenge findings using Grok X/Twitter search
 */

import { Command } from 'commander';
import { tracedAction } from '../lib/base-command.js';

interface PerplexityResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[];
}

interface GrokResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[];
}

const GROK_CHALLENGER_PROMPT = `You are a critical research challenger. Given research findings, search X to:

1. CHALLENGE: Find contradicting opinions, failed implementations, known issues
2. ALTERNATIVES: Surface newer/better tools the research may have missed
3. TRENDS: Identify emerging patterns that could affect the recommendations
4. SENTIMENT: Gauge real developer satisfaction vs marketing claims
5. DISCUSSIONS: Find where the best practitioners are discussing this topic

Be skeptical. Surface what the research missed or got wrong. Focus on recent posts (last 6 months).`;

const GROK_TIMEOUT = 120000;

const PERPLEXITY_TIMEOUT = parseInt(process.env.PERPLEXITY_TIMEOUT_MS ?? '60000', 10);

export function register(program: Command): void {
  const perplexity = program
    .command('perplexity')
    .description('Web search with citations');

  // ah perplexity research
  perplexity
    .command('research <query>')
    .description('Web search with citations (sonar-pro model)')
    .option('--json', 'Output as JSON')
    .option('--challenge', 'Challenge findings using Grok X/Twitter search')
    .action(tracedAction('perplexity research', async (query: string, options: { json?: boolean; challenge?: boolean }) => {
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

        const content = response.choices?.[0]?.message?.content ?? '';
        const citations = response.citations ?? [];

        // If --challenge flag, use Grok to challenge the findings
        let challengeContent: string | undefined;
        let challengeCitations: string[] | undefined;

        if (options.challenge) {
          const grokApiKey = process.env.X_AI_API_KEY;
          if (!grokApiKey) {
            if (options.json) {
              console.log(JSON.stringify({ success: false, error: 'X_AI_API_KEY not set (required for --challenge)' }));
            } else {
              console.error('Error: X_AI_API_KEY not set in environment (required for --challenge)');
            }
            process.exit(1);
          }

          const grokResponse = await callGrokChallengeApi(grokApiKey, query, content);
          challengeContent = grokResponse.choices?.[0]?.message?.content ?? '';
          challengeCitations = grokResponse.citations ?? [];
        }

        if (options.json) {
          const result: Record<string, unknown> = {
            success: true,
            query,
            content,
            citations,
          };
          if (options.challenge) {
            result.challenge = {
              content: challengeContent,
              citations: challengeCitations,
            };
          }
          console.log(JSON.stringify(result, null, 2));
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

        if (options.challenge && challengeContent) {
          console.log();
          console.log('---');
          console.log();
          console.log('Challenge (via X/Twitter):');
          console.log();
          console.log(challengeContent);

          if (challengeCitations && challengeCitations.length > 0) {
            console.log();
            console.log('Challenge Sources:');
            for (const citation of challengeCitations) {
              console.log(`  - ${citation}`);
            }
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
    }));
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
        model: 'sonar-pro',
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

async function callGrokChallengeApi(
  apiKey: string,
  query: string,
  findings: string
): Promise<GrokResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROK_TIMEOUT);

  const userPrompt = `Original query: ${query}

Research findings to challenge:
${findings}

Search X to challenge these findings.`;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast',
        messages: [
          { role: 'system', content: GROK_CHALLENGER_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as GrokResponse;
  } finally {
    clearTimeout(timeout);
  }
}
