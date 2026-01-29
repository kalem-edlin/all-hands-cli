/**
 * Tavily Commands (Agent-Facing)
 *
 * Web search and content extraction for agentic workflows.
 *
 * Commands:
 * - ah tavily search <query>    - Web search with optional LLM answer
 * - ah tavily extract <urls...> - Extract full content from URLs
 */

import { Command } from 'commander';
import { tracedAction } from '../lib/base-command.js';

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  query?: string;
  answer?: string;
  results?: TavilySearchResult[];
  response_time?: number;
}

interface TavilyExtractResult {
  url?: string;
  raw_content?: string;
}

interface TavilyExtractResponse {
  results?: TavilyExtractResult[];
  failed_results?: unknown[];
  response_time?: number;
}

const DEFAULT_TIMEOUT = 120000;

export function register(program: Command): void {
  const tavily = program
    .command('tavily')
    .description('Web search and content extraction');

  // ah tavily search
  tavily
    .command('search <query>')
    .description('Web search with optional LLM answer')
    .option('--max-results <n>', 'Max results (default: 5, max: 20)', parseInt)
    .option('--json', 'Output as JSON')
    .action(tracedAction('tavily search', async (query: string, options: { maxResults?: number; json?: boolean }) => {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'TAVILY_API_KEY not set' }));
        } else {
          console.error('Error: TAVILY_API_KEY not set in environment');
        }
        process.exit(1);
      }

      const payload: Record<string, unknown> = {
        query,
        search_depth: 'basic',
        topic: 'general',
        include_answer: true,
      };

      if (options.maxResults !== undefined) {
        payload.max_results = Math.min(options.maxResults, 20);
      }

      try {
        const response = await callTavilyApi<TavilySearchResponse>(
          apiKey,
          'search',
          payload
        );

        const results = (response.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
        }));

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            query: response.query ?? query,
            answer: response.answer,
            results,
            response_time: response.response_time,
          }, null, 2));
          return;
        }

        if (response.answer) {
          console.log('Answer:');
          console.log(response.answer);
          console.log();
        }

        console.log(`Results (${results.length}):`);
        for (const r of results) {
          console.log();
          console.log(`  ${r.title}`);
          console.log(`  ${r.url}`);
          if (r.content) {
            const preview = r.content.slice(0, 200) + (r.content.length > 200 ? '...' : '');
            console.log(`  ${preview}`);
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

  // ah tavily extract
  tavily
    .command('extract <urls...>')
    .description('Extract full content from URLs (max 20)')
    .option('--json', 'Output as JSON')
    .action(tracedAction('tavily extract', async (urls: string[], options: { json?: boolean }) => {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'TAVILY_API_KEY not set' }));
        } else {
          console.error('Error: TAVILY_API_KEY not set in environment');
        }
        process.exit(1);
      }

      if (urls.length > 20) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'Maximum 20 URLs allowed' }));
        } else {
          console.error('Error: Maximum 20 URLs allowed');
        }
        process.exit(1);
      }

      const payload = {
        urls,
        extract_depth: 'advanced',
        format: 'markdown',
        include_images: false,
      };

      try {
        const response = await callTavilyApi<TavilyExtractResponse>(
          apiKey,
          'extract',
          payload
        );

        const results = (response.results ?? []).map((r) => ({
          url: r.url,
          content: r.raw_content,
        }));
        const failed = response.failed_results ?? [];

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            results,
            failed_count: failed.length,
            response_time: response.response_time,
          }, null, 2));
          return;
        }

        console.log(`Extracted ${results.length} URL(s), ${failed.length} failed`);
        for (const r of results) {
          console.log();
          console.log(`--- ${r.url} ---`);
          console.log(r.content ?? '(no content)');
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

async function callTavilyApi<T>(
  apiKey: string,
  endpoint: 'search' | 'extract',
  payload: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(`https://api.tavily.com/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
