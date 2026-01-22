/**
 * Knowledge commands - semantic search and indexing for docs and specs.
 *
 * Commands:
 *   envoy knowledge docs search <query> [--metadata-only] [--force-aggregate] [--no-aggregate]
 *   envoy knowledge specs search <query> [--metadata-only] [--force-aggregate] [--no-aggregate]
 *   envoy knowledge docs reindex-all
 *   envoy knowledge specs reindex-all
 *   envoy knowledge reindex-all (all indexes)
 *   envoy knowledge docs reindex-from-changes [--files <json_array>]
 *   envoy knowledge specs reindex-from-changes [--files <json_array>]
 *   envoy knowledge reindex-from-changes (all indexes, auto-detect from git)
 *   envoy knowledge status (all indexes)
 */

import { spawnSync } from "child_process";
import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  AgentRunner,
  type AggregatorOutput,
  type SearchResult,
} from "../lib/agents/index.js";
import { getBaseBranch } from "../lib/git.js";
import {
  INDEX_CONFIGS,
  KnowledgeService,
  type FileChange,
  type IndexName,
} from "../lib/knowledge.js";
import { BaseCommand, CommandResult } from "./base.js";

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
 * Auto-detect file changes since branch diverged from base for a specific index.
 */
function getChangesFromGit(indexName: IndexName): FileChange[] {
  const config = INDEX_CONFIGS[indexName];
  if (!config) return [];

  const baseBranch = getBaseBranch();
  const cwd = getProjectRoot();

  // Get merge-base commit
  const mergeBaseResult = spawnSync("git", ["merge-base", baseBranch, "HEAD"], {
    encoding: "utf-8",
    cwd,
  });

  if (mergeBaseResult.status !== 0) {
    return [];
  }

  const mergeBase = mergeBaseResult.stdout.trim();

  // Get changed files since merge-base, filtered to index paths
  const diffResult = spawnSync(
    "git",
    ["diff", "--name-status", `${mergeBase}..HEAD`, "--", ...config.paths],
    { encoding: "utf-8", cwd }
  );

  if (diffResult.status !== 0 || !diffResult.stdout.trim()) {
    return [];
  }

  const changes: FileChange[] = [];
  const lines = diffResult.stdout.trim().split("\n");

  for (const line of lines) {
    const [status, filePath] = line.split("\t");
    if (!filePath) continue;

    // Check extension
    const ext = "." + filePath.split(".").pop();
    if (!config.extensions.includes(ext)) continue;

    // Skip README.md files (navigation only, not indexed)
    if (filePath.endsWith("README.md")) continue;

    if (status === "A") {
      changes.push({ path: filePath, added: true });
    } else if (status === "M") {
      changes.push({ path: filePath, modified: true });
    } else if (status === "D") {
      changes.push({ path: filePath, deleted: true });
    }
  }

  return changes;
}

/**
 * Search command factory - creates a search command for a specific index
 */
function createSearchCommand(indexName: IndexName): typeof BaseCommand {
  return class extends BaseCommand {
    readonly name = "search";
    readonly description = `Semantic search ${indexName} (aggregates large results automatically)`;

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
        const results = await service.search(indexName, query, 50, metadataOnly);

        // Skip aggregation if metadata-only or explicitly disabled
        if (metadataOnly || noAggregate) {
          return this.success({
            index: indexName,
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
            index: indexName,
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
        const agentModel = process.env.AGENT_MODEL?.trim() || "opencode-default";
        console.error(`[knowledge.${indexName}.search] Starting aggregation: query="${query.slice(0, 50)}...", tokens=${totalTokens}, results=${results.length}, full=${fullResults.length}, minimized=${minimizedResults.length}, model=${agentModel}`);
        const aggregationStart = Date.now();

        try {
          const runner = new AgentRunner(projectRoot);
          const input = formatAggregatorInput(query, fullResults, minimizedResults);

          const result = await runner.run<AggregatorOutput>(
            {
              name: "knowledge-aggregator",
              systemPrompt: getAggregatorPrompt(),
              timeoutMs: 60000,
            },
            input
          );

          const aggregationDuration = Date.now() - aggregationStart;

          if (!result.success || !result.data) {
            console.error(`[knowledge.${indexName}.search] Aggregation FAILED after ${aggregationDuration}ms: error="${result.error}", model=${result.metadata?.model ?? agentModel}, tokens=${totalTokens}, results=${results.length}`);
            return this.error(
              "aggregation_failed",
              `${result.error ?? "Unknown aggregation error"} (${totalTokens} tokens, ${results.length} results, ${aggregationDuration}ms, model=${result.metadata?.model ?? agentModel})`
            );
          }

          console.error(`[knowledge.${indexName}.search] Aggregation SUCCESS in ${aggregationDuration}ms: model=${result.metadata?.model ?? agentModel}`);
          return this.success({
            index: indexName,
            aggregated: true,
            insight: result.data.insight,
            lsp_entry_points: result.data.lsp_entry_points,
            design_notes: result.data.design_notes,
            metadata: result.metadata,
          });
        } catch (e) {
          const aggregationDuration = Date.now() - aggregationStart;
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`[knowledge.${indexName}.search] Aggregation EXCEPTION after ${aggregationDuration}ms: error="${errMsg}", model=${agentModel}, tokens=${totalTokens}, results=${results.length}`);
          return this.error(
            "aggregation_failed",
            `${errMsg} (${totalTokens} tokens, ${results.length} results, ${aggregationDuration}ms, model=${agentModel})`
          );
        }
      } catch (e) {
        return this.error(
          "search_error",
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  };
}

/**
 * Reindex-all command factory - creates a reindex command for a specific index
 */
function createReindexAllCommand(indexName: IndexName): typeof BaseCommand {
  return class extends BaseCommand {
    readonly name = "reindex-all";
    readonly description = `Rebuild ${indexName} search index`;

    defineArguments(): void {
      // No arguments
    }

    async execute(): Promise<CommandResult> {
      try {
        const service = new KnowledgeService(getProjectRoot());
        const result = await service.reindexAll(indexName);

        return this.success({
          index: indexName,
          message: `${indexName} index reindexed`,
          stats: result,
        });
      } catch (e) {
        return this.error(
          "reindex_error",
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  };
}

/**
 * Reindex-from-changes command factory - creates an incremental reindex command for a specific index
 */
function createReindexFromChangesCommand(indexName: IndexName): typeof BaseCommand {
  return class extends BaseCommand {
    readonly name = "reindex-from-changes";
    readonly description = `Update ${indexName} index from changed files (auto-detects from git if --files omitted)`;

    defineArguments(cmd: Command): void {
      cmd.option("--files <json>", "JSON array of file changes (optional, auto-detects from git merge-base if omitted)");
    }

    async execute(args: Record<string, unknown>): Promise<CommandResult> {
      const filesJson = args.files as string | undefined;

      let changes: FileChange[];

      if (filesJson) {
        try {
          changes = JSON.parse(filesJson);
        } catch {
          return this.error("validation_error", "Invalid JSON in --files parameter");
        }
      } else {
        changes = getChangesFromGit(indexName);
        if (changes.length === 0) {
          return this.success({
            index: indexName,
            message: `No ${indexName} changes detected since branch diverged from base`,
            files: [],
          });
        }
      }

      try {
        const service = new KnowledgeService(getProjectRoot());
        const result = await service.reindexFromChanges(indexName, changes);

        return this.success({
          index: indexName,
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
  };
}

/**
 * Status command factory - creates a status command for a specific index
 */
function createStatusCommand(indexName: IndexName): typeof BaseCommand {
  return class extends BaseCommand {
    readonly name = "status";
    readonly description = `Check ${indexName} index status`;

    defineArguments(): void {
      // No arguments
    }

    async execute(): Promise<CommandResult> {
      try {
        const service = new KnowledgeService(getProjectRoot());
        const status = await service.checkIndex(indexName);

        return this.success({
          index: indexName,
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
  };
}

/**
 * Reindex-all command for ALL indexes
 */
class ReindexAllIndexesCommand extends BaseCommand {
  readonly name = "reindex-all";
  readonly description = "Rebuild all search indexes (docs, specs)";

  defineArguments(): void {
    // No arguments
  }

  async execute(): Promise<CommandResult> {
    try {
      const service = new KnowledgeService(getProjectRoot());
      const results = await service.reindexAllIndexes();

      return this.success({
        message: "All indexes reindexed",
        indexes: results,
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
 * Reindex-from-changes command for ALL indexes
 */
class ReindexFromChangesAllCommand extends BaseCommand {
  readonly name = "reindex-from-changes";
  readonly description = "Update all indexes from changed files (auto-detects from git)";

  defineArguments(): void {
    // No arguments - always auto-detects
  }

  async execute(): Promise<CommandResult> {
    const projectRoot = getProjectRoot();
    const service = new KnowledgeService(projectRoot);
    const indexResults: Record<string, { message: string; files: { path: string; action: string }[] }> = {};

    try {
      for (const indexName of KnowledgeService.getIndexNames() as IndexName[]) {
        const changes = getChangesFromGit(indexName);
        if (changes.length === 0) {
          indexResults[indexName] = {
            message: `No ${indexName} changes detected`,
            files: [],
          };
        } else {
          const result = await service.reindexFromChanges(indexName, changes);
          indexResults[indexName] = {
            message: result.message,
            files: result.files,
          };
        }
      }

      return this.success({
        message: "All indexes updated",
        indexes: indexResults,
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
 * Status command for ALL indexes
 */
class StatusAllCommand extends BaseCommand {
  readonly name = "status";
  readonly description = "Check status of all indexes";

  defineArguments(): void {
    // No arguments
  }

  async execute(): Promise<CommandResult> {
    try {
      const service = new KnowledgeService(getProjectRoot());
      const statuses = await service.checkAllIndexes();

      const needsReindex = Object.entries(statuses)
        .filter(([, status]) => !status.exists)
        .map(([name]) => name);

      return this.success({
        indexes: statuses,
        needs_reindex: needsReindex,
      });
    } catch (e) {
      return this.error(
        "status_error",
        e instanceof Error ? e.message : String(e)
      );
    }
  }
}

function formatAggregatorInput(
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

// Create index-specific command sets
const docsCommands = {
  search: createSearchCommand("docs"),
  "reindex-all": createReindexAllCommand("docs"),
  "reindex-from-changes": createReindexFromChangesCommand("docs"),
  status: createStatusCommand("docs"),
};

const specsCommands = {
  search: createSearchCommand("specs"),
  "reindex-all": createReindexAllCommand("specs"),
  "reindex-from-changes": createReindexFromChangesCommand("specs"),
  status: createStatusCommand("specs"),
};

/**
 * Export commands with nested structure for 3-level CLI support:
 * - envoy knowledge docs search "query"
 * - envoy knowledge specs search "query"
 * - envoy knowledge reindex-all (all indexes)
 * - envoy knowledge status (all indexes)
 */
export const COMMANDS = {
  // Nested commands for each index
  docs: docsCommands,
  specs: specsCommands,
  // Top-level commands that operate on all indexes
  "reindex-all": ReindexAllIndexesCommand,
  "reindex-from-changes": ReindexFromChangesAllCommand,
  status: StatusAllCommand,
};
