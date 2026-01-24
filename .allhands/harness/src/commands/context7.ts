/**
 * Context7 Commands (Agent-Facing)
 *
 * Library documentation search and context retrieval.
 * Flow: search (find library) → context (get docs for known library)
 *
 * Commands:
 * - ah context7 search <library> [query] - Search for libraries by name
 * - ah context7 context <libraryId> <query> - Get documentation context
 */

import { Command } from 'commander';
import { Context7, type Library } from '@upstash/context7-sdk';

const DEFAULT_TIMEOUT = 120000;

export function register(program: Command): void {
  const context7 = program
    .command('context7')
    .description('Library documentation search and context retrieval');

  // ah context7 search
  context7
    .command('search <library>')
    .argument('[query]', 'Optional query for relevance ranking')
    .description('Search for libraries by name, returns IDs for context command')
    .option('--limit <n>', 'Max results (default: 5)', parseInt)
    .option('--json', 'Output as JSON')
    .action(async (library: string, query: string | undefined, options: { limit?: number; json?: boolean }) => {
      const apiKey = process.env.CONTEXT7_API_KEY;
      if (!apiKey) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'CONTEXT7_API_KEY not set' }));
        } else {
          console.error('Error: CONTEXT7_API_KEY not set in environment');
        }
        process.exit(1);
      }

      const client = new Context7({ apiKey });
      const searchQuery = query ?? `How to use ${library}`;
      const limit = options.limit ?? 5;

      try {
        const libraries = await withTimeout(() => client.searchLibrary(searchQuery, library));

        if (!Array.isArray(libraries)) {
          throw new Error('Unexpected response format from Context7');
        }

        const results = libraries.slice(0, limit).map((lib: Library) => ({
          id: lib.id,
          name: lib.name,
          description: lib.description,
          snippets: lib.totalSnippets,
          trust: lib.trustScore,
        }));

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            query: library,
            results,
            usage: results.length > 0
              ? `Use: ah context7 context "${results[0].id}" "your question"`
              : undefined,
          }, null, 2));
          return;
        }

        console.log(`Search results for: ${library}`);
        console.log();

        if (results.length === 0) {
          console.log('No libraries found. Try a different search term.');
          return;
        }

        for (const lib of results) {
          console.log(`  ID: ${lib.id}`);
          console.log(`  Name: ${lib.name}`);
          if (lib.description) {
            console.log(`  Description: ${lib.description}`);
          }
          console.log(`  Snippets: ${lib.snippets}, Trust: ${lib.trust}`);
          console.log();
        }

        console.log(`Usage: ah context7 context "${results[0].id}" "your question"`);
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

  // ah context7 context
  context7
    .command('context <libraryId> <query>')
    .description('Get documentation context for a known library (use search first)')
    .option('--text', 'Return plain text instead of JSON (better for direct LLM use)')
    .option('--json', 'Output as JSON')
    .action(async (libraryId: string, query: string, options: { text?: boolean; json?: boolean }) => {
      const apiKey = process.env.CONTEXT7_API_KEY;
      if (!apiKey) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'CONTEXT7_API_KEY not set' }));
        } else {
          console.error('Error: CONTEXT7_API_KEY not set in environment');
        }
        process.exit(1);
      }

      const client = new Context7({ apiKey });

      try {
        if (options.text) {
          // Plain text mode - directly usable in LLM prompts
          const content = await withTimeout(() =>
            client.getContext(query, libraryId, { type: 'txt' })
          );

          if (options.json) {
            console.log(JSON.stringify({
              success: true,
              library: libraryId,
              query,
              content,
              format: 'text',
            }, null, 2));
            return;
          }

          console.log(content);
          return;
        }

        // JSON mode - structured docs
        const docs = await withTimeout(() =>
          client.getContext(query, libraryId, { type: 'json' })
        );

        if (!Array.isArray(docs)) {
          throw new Error('Unexpected response format from Context7');
        }

        const documentation = docs.map((doc) => ({
          title: doc.title,
          content: doc.content,
          source: doc.source,
        }));

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            library: libraryId,
            query,
            docs: documentation,
            doc_count: documentation.length,
          }, null, 2));
          return;
        }

        console.log(`Documentation for: ${libraryId}`);
        console.log(`Query: ${query}`);
        console.log();

        for (const doc of documentation) {
          console.log(`--- ${doc.title} ---`);
          console.log(doc.content);
          if (doc.source) {
            console.log(`Source: ${doc.source}`);
          }
          console.log();
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        const suggestion = 'Ensure libraryId is valid (from search results)';
        if (options.json) {
          console.log(JSON.stringify({ success: false, error, suggestion }));
        } else {
          console.error(`Error: ${error}`);
          console.error(suggestion);
        }
        process.exit(1);
      }
    });
}

async function withTimeout<T>(fn: () => Promise<T>): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Request timed out')), DEFAULT_TIMEOUT);
    timeoutId.unref(); // Don't keep process alive after main work completes
  });
  return Promise.race([fn(), timeout]);
}
