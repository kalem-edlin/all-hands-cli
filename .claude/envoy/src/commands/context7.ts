/**
 * Context7 API commands - library documentation search and context retrieval.
 *
 * Flow: search (find library) → context (get docs for known library)
 */

import { Command } from "commander";
import { BaseCommand, type CommandResult } from "./base.js";
import { Context7, Context7Error, type Library } from "@upstash/context7-sdk";

class Context7SearchCommand extends BaseCommand {
  readonly name = "search";
  readonly description = "Search for libraries by name, returns IDs for context command";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<library>", "Library name to search (e.g., react, fastify)")
      .argument("[query]", "Optional query for relevance ranking")
      .option("--limit <n>", "Max results (default: 5)", parseInt);
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const apiKey = process.env.CONTEXT7_API_KEY;
    if (!apiKey) {
      return this.error("auth_error", "CONTEXT7_API_KEY not set");
    }

    const library = args.library as string;
    const query = (args.query as string) ?? `How to use ${library}`;
    const limit = (args.limit as number) ?? 5;

    try {
      const client = new Context7({ apiKey });
      const [libraries, durationMs] = await this.timedExecute(() =>
        client.searchLibrary(query, library)
      );

      // Slim output for LLM consumption - only what's needed for decisions
      const results = libraries.slice(0, limit).map((lib: Library) => ({
        id: lib.id, // Required for context command
        name: lib.name,
        description: lib.description,
        snippets: lib.totalSnippets,
        trust: lib.trustScore,
      }));

      return this.success(
        {
          query: library,
          results,
          usage: results.length > 0
            ? `Use: envoy context7 context "${results[0].id}" "your question"`
            : undefined,
        },
        {
          result_count: results.length,
          command: "context7 search",
          duration_ms: durationMs,
        }
      );
    } catch (e) {
      if (e instanceof Context7Error) {
        return this.error("api_error", e.message);
      }
      if (e instanceof Error && e.message.includes("timeout")) {
        return this.error("timeout", `Request timed out after ${this.timeoutMs}ms`);
      }
      return this.error("api_error", e instanceof Error ? e.message : String(e));
    }
  }
}

class Context7ContextCommand extends BaseCommand {
  readonly name = "context";
  readonly description = "Get documentation context for a known library (use search first)";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<libraryId>", "Library ID from search (e.g., /facebook/react)")
      .argument("<query>", "What you need docs for (e.g., 'hooks usage')")
      .option("--text", "Return plain text instead of JSON (better for direct LLM use)");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const apiKey = process.env.CONTEXT7_API_KEY;
    if (!apiKey) {
      return this.error("auth_error", "CONTEXT7_API_KEY not set");
    }

    const libraryId = args.libraryId as string;
    const query = args.query as string;
    const useText = args.text as boolean;

    try {
      const client = new Context7({ apiKey });

      if (useText) {
        // Plain text mode - directly usable in LLM prompts
        const [content, durationMs] = await this.timedExecute(() =>
          client.getContext(query, libraryId, { type: "txt" })
        );

        return this.success(
          {
            library: libraryId,
            query,
            content,
          },
          {
            format: "text",
            command: "context7 context",
            duration_ms: durationMs,
          }
        );
      }

      // JSON mode - structured docs
      const [docs, durationMs] = await this.timedExecute(() =>
        client.getContext(query, libraryId, { type: "json" })
      );

      const documentation = docs.map((doc) => ({
        title: doc.title,
        content: doc.content,
        source: doc.source,
      }));

      return this.success(
        {
          library: libraryId,
          query,
          docs: documentation,
        },
        {
          doc_count: documentation.length,
          command: "context7 context",
          duration_ms: durationMs,
        }
      );
    } catch (e) {
      if (e instanceof Context7Error) {
        return this.error(
          "api_error",
          e.message,
          "Ensure libraryId is valid (from search results)"
        );
      }
      if (e instanceof Error && e.message.includes("timeout")) {
        return this.error("timeout", `Request timed out after ${this.timeoutMs}ms`);
      }
      return this.error("api_error", e instanceof Error ? e.message : String(e));
    }
  }
}

export const COMMANDS = {
  search: Context7SearchCommand,
  context: Context7ContextCommand,
};
