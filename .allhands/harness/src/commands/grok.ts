/**
 * Grok Commands (Agent-Facing)
 *
 * X/Twitter search for technology research using xAI Grok.
 *
 * Commands:
 * - ah grok search <query>    - Search X for tech opinions and insights
 * - ah grok challenge <query> - Challenge research findings with X search
 */

import { Command } from 'commander';

const SYSTEM_PROMPT = `You are a technology research assistant. Search X (Twitter) for posts about the given technology, tool, or concept.

Find and synthesize:
- Developer opinions and experiences
- Comparisons with alternatives
- Common issues or gotchas
- Recent developments or announcements
- Community sentiment

Return a structured summary with key findings and notable posts.`;

const CHALLENGER_PROMPT = `You are a critical research challenger. Given research findings, search X to:

1. CHALLENGE: Find contradicting opinions, failed implementations, known issues
2. ALTERNATIVES: Surface newer/better tools the research may have missed
3. TRENDS: Identify emerging patterns that could affect the recommendations
4. SENTIMENT: Gauge real developer satisfaction vs marketing claims
5. DISCUSSIONS: Find where the best practitioners are discussing this topic

Be skeptical. Surface what the research missed or got wrong. Focus on recent posts (last 6 months).`;

interface GrokResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

const DEFAULT_TIMEOUT = 120000;

export function register(program: Command): void {
  const grok = program
    .command('grok')
    .description('X/Twitter search for technology research');

  // ah grok search
  grok
    .command('search <query>')
    .description('Search X for tech opinions, alternatives, and insights')
    .option('--context <context>', 'Previous research findings to build upon')
    .option('--json', 'Output as JSON')
    .action(async (query: string, options: { context?: string; json?: boolean }) => {
      const apiKey = process.env.X_AI_API_KEY;
      if (!apiKey) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'X_AI_API_KEY not set' }));
        } else {
          console.error('Error: X_AI_API_KEY not set in environment');
        }
        process.exit(1);
      }

      let userPrompt: string;
      if (options.context) {
        userPrompt = `Previous research findings:
${options.context}

Now search X for additional insights about: ${query}

Focus on opinions, alternatives, and community discussions that complement the existing findings.`;
      } else {
        userPrompt = `Search X for developer opinions, experiences, and alternatives regarding: ${query}`;
      }

      try {
        const response = await callGrokApi(apiKey, userPrompt, SYSTEM_PROMPT);

        const content = response.choices?.[0]?.message?.content ?? '';
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

        console.log('X Search Results:');
        console.log();
        console.log(content);

        if (citations.length > 0) {
          console.log();
          console.log('Sources:');
          for (const citation of citations) {
            console.log(`  - ${citation}`);
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

  // ah grok challenge
  grok
    .command('challenge <query>')
    .description('Challenge research findings with X search')
    .requiredOption('--findings <findings>', 'Research findings to challenge')
    .option('--json', 'Output as JSON')
    .action(async (query: string, options: { findings: string; json?: boolean }) => {
      const apiKey = process.env.X_AI_API_KEY;
      if (!apiKey) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'X_AI_API_KEY not set' }));
        } else {
          console.error('Error: X_AI_API_KEY not set in environment');
        }
        process.exit(1);
      }

      const userPrompt = `Original query: ${query}

Research findings to challenge:
${options.findings}

Search X to challenge these findings.`;

      try {
        const response = await callGrokApi(apiKey, userPrompt, CHALLENGER_PROMPT);

        const content = response.choices?.[0]?.message?.content ?? '';
        const citations = response.citations ?? [];

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            query,
            mode: 'challenge',
            content,
            citations,
          }, null, 2));
          return;
        }

        console.log('Challenge Results:');
        console.log();
        console.log(content);

        if (citations.length > 0) {
          console.log();
          console.log('Sources:');
          for (const citation of citations) {
            console.log(`  - ${citation}`);
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

async function callGrokApi(
  apiKey: string,
  userPrompt: string,
  systemPrompt: string
): Promise<GrokResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

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
          { role: 'system', content: systemPrompt },
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
