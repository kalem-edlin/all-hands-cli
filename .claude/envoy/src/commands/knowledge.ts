/**
 * Knowledge commands - semantic search and indexing for docs/ documentation.
 *
 * Commands:
 *   envoy knowledge search <query> [--metadata-only] [--force-aggregate] [--no-aggregate]
 *   envoy knowledge reindex-all
 *   envoy knowledge reindex-from-changes --files <json_array>
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import { BaseCommand, CommandResult } from "./base.js";
import { KnowledgeService, type FileChange } from "../lib/knowledge.js";
import {
  AgentRunner,
  type AggregatorOutput,
  type SearchResult,
} from "../lib/agents/index.js";

const getProjectRoot = (): string => {
  return process.env.PROJECT_ROOT || process.cwd();
};

// Load aggregator prompt from file
const __dirname = dirname(fileURLToPath(import.meta.url));
const AGGREGATOR_PROMPT_PATH = join(__dirname, "../lib/agents/prompts/knowledge-aggregator.md");

const getAggregatorPrompt = (): string => {
  return readFileSync(AGGREGATOR_PROMPT_PATH, "utf-8");
};

const DEFAULT_TOKEN_THRESHOLD = 3500;

/**
 * Search command - semantic search against docs index with hybrid aggregation
 */
class SearchCommand extends BaseCommand {
  readonly name = "search";
  readonly description = "Semantic search docs (aggregates large results automatically)";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<query>", "Descriptive phrase (e.g. 'how to handle API authentication' not 'auth')")
      .option("--metadata-only", "Return only file paths and descriptions (no full content)")
      .option("--force-aggregate", "Force aggregation even below threshold")
      .option("--no-aggregate", "Disable aggregation entirely");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const query = args.query as string;
    const metadataOnly = !!args.metadataOnly;
    const forceAggregate = !!args.forceAggregate;
    const noAggregate = !!args.noAggregate;

    if (!query) {
      return this.error("validation_error", "query is required");
    }

    const projectRoot = getProjectRoot();

    try {
      const service = new KnowledgeService(projectRoot);
      const results = await service.search(query, 50, metadataOnly);

      // Skip aggregation if metadata-only or explicitly disabled
      if (metadataOnly || noAggregate) {
        return this.success({
          query,
          metadata_only: metadataOnly,
          results,
          result_count: results.length,
        });
      }

      // Calculate total tokens
      const totalTokens = results.reduce((sum, r) => sum + r.token_count, 0);
      const parsedThreshold = parseInt(
        process.env.KNOWLEDGE_AGGREGATOR_TOKEN_THRESHOLD ?? String(DEFAULT_TOKEN_THRESHOLD),
        10
      );
      const threshold = Number.isNaN(parsedThreshold) ? DEFAULT_TOKEN_THRESHOLD : parsedThreshold;

      // Skip aggregation if below threshold
      if (totalTokens < threshold && !forceAggregate) {
        return this.success({
          aggregated: false,
          total_tokens: totalTokens,
          threshold,
          results,
          result_count: results.length,
        });
      }

      // Separate full vs minimized results
      const fullResults = results.filter((r) => r.full_resource_context) as SearchResult[];
      const minimizedResults = results
        .filter((r) => !r.full_resource_context)
        .map((r) => ({
          resource_path: r.resource_path,
          similarity: r.similarity,
          token_count: r.token_count,
          description: r.description,
          relevant_files: r.relevant_files,
        })) as SearchResult[];

      // Run aggregator agent
      try {
        const runner = new AgentRunner(projectRoot);
        const input = this.formatAggregatorInput(query, fullResults, minimizedResults);

        const result = await runner.run<AggregatorOutput>(
          {
            name: "knowledge-aggregator",
            systemPrompt: getAggregatorPrompt(),
            timeoutMs: 60000,
          },
          input
        );

        if (!result.success || !result.data) {
          // Fallback to raw results on aggregation failure
          return this.success({
            aggregated: false,
            aggregation_error: result.error ?? "Unknown aggregation error",
            total_tokens: totalTokens,
            results,
            result_count: results.length,
          });
        }

        return this.success({
          aggregated: true,
          insight: result.data.insight,
          references: result.data.references,
          design_notes: result.data.design_notes,
          metadata: result.metadata,
        });
      } catch (e) {
        // Fallback to raw results on any error
        return this.success({
          aggregated: false,
          aggregation_error: e instanceof Error ? e.message : String(e),
          total_tokens: totalTokens,
          results,
          result_count: results.length,
        });
      }
    } catch (e) {
      return this.error(
        "search_error",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  private formatAggregatorInput(
    query: string,
    fullResults: SearchResult[],
    minimizedResults: SearchResult[]
  ): string {
    return `## Query
${query}

## Full Results (${fullResults.length} documents with complete content)

${fullResults.map((r) => `### ${r.resource_path}
- Similarity: ${r.similarity.toFixed(3)}
- Tokens: ${r.token_count}
- Description: ${r.description}

Content:
\`\`\`
${r.full_resource_context}
\`\`\`
`).join("\n")}

## Minimized Results (${minimizedResults.length} documents - request expansion if needed)

${minimizedResults.map((r) => `- **${r.resource_path}** (similarity: ${r.similarity.toFixed(3)}, ${r.token_count} tokens)
  ${r.description}
`).join("\n")}

Please analyze and provide your response as JSON.`;
  }
}

/**
 * Reindex-all command - full rebuild of docs index
 */
class ReindexAllCommand extends BaseCommand {
  readonly name = "reindex-all";
  readonly description = "Rebuild docs search index";

  defineArguments(): void {
    // No arguments
  }

  async execute(): Promise<CommandResult> {
    try {
      const service = new KnowledgeService(getProjectRoot());
      const result = await service.reindexAll();

      return this.success({
        message: "Docs index reindexed",
        stats: result,
      });
    } catch (e) {
      return this.error(
        "reindex_error",
        e instanceof Error ? e.message : String(e)
      );
    }
  }
}

/**
 * Reindex-from-changes command - incremental index update from file changes
 */
class ReindexFromChangesCommand extends BaseCommand {
  readonly name = "reindex-from-changes";
  readonly description = "Update docs index from changed files (for git hooks)";

  defineArguments(cmd: Command): void {
    cmd.requiredOption("--files <json>", "JSON array of file changes");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const filesJson = args.files as string;

    if (!filesJson) {
      return this.error("validation_error", "--files is required");
    }

    let changes: FileChange[];
    try {
      changes = JSON.parse(filesJson);
    } catch {
      return this.error("validation_error", "Invalid JSON in --files parameter");
    }

    try {
      const service = new KnowledgeService(getProjectRoot());
      const result = await service.reindexFromChanges(changes);

      if (!result.success) {
        return {
          status: "error",
          error: {
            type: "missing_references",
            message: result.message,
          },
          data: {
            missing_references: result.missing_references,
            files: result.files,
          },
        };
      }

      return this.success({
        message: result.message,
        files: result.files,
      });
    } catch (e) {
      return this.error(
        "reindex_error",
        e instanceof Error ? e.message : String(e)
      );
    }
  }
}

/**
 * Status command - check docs index health
 */
class StatusCommand extends BaseCommand {
  readonly name = "status";
  readonly description = "Check docs index status";

  defineArguments(): void {
    // No arguments
  }

  async execute(): Promise<CommandResult> {
    try {
      const service = new KnowledgeService(getProjectRoot());
      const status = await service.checkIndex();

      return this.success({
        index_exists: status.exists,
        needs_reindex: !status.exists,
      });
    } catch (e) {
      return this.error(
        "status_error",
        e instanceof Error ? e.message : String(e)
      );
    }
  }
}

export const COMMANDS = {
  search: SearchCommand,
  "reindex-all": ReindexAllCommand,
  "reindex-from-changes": ReindexFromChangesCommand,
  status: StatusCommand,
};
