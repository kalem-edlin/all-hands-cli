/**
 * Knowledge commands - semantic search and indexing for docs and roadmap.
 *
 * Commands:
 *   ah knowledge docs search <query> [--metadata-only]
 *   ah knowledge roadmap search <query> [--metadata-only]
 *   ah knowledge docs reindex
 *   ah knowledge roadmap reindex
 *   ah knowledge reindex (all indexes)
 *   ah knowledge status (all indexes)
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
} from "../lib/opencode/index.js";
import {
  INDEX_CONFIGS,
  KnowledgeService,
  type FileChange,
  type IndexName,
} from "../lib/knowledge.js";
import { BaseCommand, CommandResult } from "../lib/base-command.js";
import { getBaseBranch } from "../lib/git.js";

const getProjectRoot = (): string => {
  return process.env.PROJECT_ROOT || process.cwd();
};

// Load aggregator prompt from file
const __dirname = dirname(fileURLToPath(import.meta.url));
const AGGREGATOR_PROMPT_PATH = join(__dirname, "../lib/opencode/prompts/knowledge-aggregator.md");

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
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (mergeBaseResult.status !== 0) {
    return [];
  }

  const mergeBase = mergeBaseResult.stdout.trim();

  // Get changed files since merge-base, filtered to index paths
  const diffResult = spawnSync(
    "git",
    ["diff", "--name-status", `${mergeBase}..HEAD`, "--", ...config.paths],
    { encoding: "utf-8", cwd, stdio: ['pipe', 'pipe', 'pipe'] }
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
 * Search command - searches a specific index
 */
class SearchCommand extends BaseCommand {
  readonly name = "search";
  readonly description: string;
  private readonly indexName: IndexName;

  constructor(indexName: IndexName) {
    super();
    this.indexName = indexName;
    this.description = `Semantic search ${indexName}`;
  }

  defineArguments(cmd: Command): void {
    cmd
      .argument("<query>", "Descriptive phrase (e.g. 'how to handle API authentication')")
      .option("--metadata-only", "Return only file paths and descriptions (no full content)")
      .option("--no-aggregate", "Disable aggregation entirely");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const query = args.query as string;
    const metadataOnly = !!args.metadataOnly;
    const noAggregate = !!args.noAggregate;

    if (!query) {
      return this.error("validation_error", "query is required");
    }

    const projectRoot = getProjectRoot();

    try {
      const service = new KnowledgeService(projectRoot);
      const results = await service.search(this.indexName, query, 50, metadataOnly);

      // Skip aggregation if metadata-only or explicitly disabled
      if (metadataOnly || noAggregate) {
        return this.success({
          index: this.indexName,
          query,
          metadata_only: metadataOnly,
          results,
          result_count: results.length,
        });
      }

      // Check if aggregation is needed (token threshold)
      const totalTokens = results.reduce((sum, r) => sum + r.token_count, 0);
      if (totalTokens <= DEFAULT_TOKEN_THRESHOLD) {
        return this.success({
          index: this.indexName,
          query,
          results,
          result_count: results.length,
          aggregated: false,
        });
      }

      // Aggregate with AI
      const runner = new AgentRunner(projectRoot);
      const fullResults = results.filter(r => r.full_resource_context);
      const minimizedResults = results.filter(r => !r.full_resource_context);

      const userMessage = JSON.stringify({
        query,
        full_results: fullResults,
        minimized_results: minimizedResults.map(r => ({
          resource_path: r.resource_path,
          similarity: r.similarity,
          description: r.description,
          relevant_files: r.relevant_files,
        })),
      });

      const agentResult = await runner.run<AggregatorOutput>(
        {
          name: "knowledge-aggregator",
          systemPrompt: getAggregatorPrompt(),
          timeoutMs: 60000,
          steps: 5,
        },
        userMessage
      );

      if (!agentResult.success) {
        // Fall back to raw results on aggregation failure
        return this.success({
          index: this.indexName,
          query,
          results,
          result_count: results.length,
          aggregated: false,
          aggregation_error: agentResult.error,
        });
      }

      return this.success({
        index: this.indexName,
        query,
        aggregated: true,
        insight: agentResult.data!.insight,
        lsp_entry_points: agentResult.data!.lsp_entry_points,
        design_notes: agentResult.data!.design_notes,
        source_results: results.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error("search_error", message);
    }
  }
}

/**
 * Reindex command - rebuilds an index
 */
class ReindexCommand extends BaseCommand {
  readonly name = "reindex";
  readonly description: string;
  private readonly indexName: IndexName | "all";

  constructor(indexName: IndexName | "all") {
    super();
    this.indexName = indexName;
    this.description = indexName === "all"
      ? "Rebuild all indexes"
      : `Rebuild ${indexName} index`;
  }

  defineArguments(cmd: Command): void {
    cmd.option("--from-changes", "Only reindex changed files since branch diverged from base");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const fromChanges = !!args.fromChanges;
    const projectRoot = getProjectRoot();
    const service = new KnowledgeService(projectRoot);

    try {
      if (this.indexName === "all") {
        if (fromChanges) {
          const results: Record<string, unknown> = {};
          for (const name of KnowledgeService.getIndexNames()) {
            const changes = getChangesFromGit(name as IndexName);
            if (changes.length > 0) {
              results[name] = await service.reindexFromChanges(name as IndexName, changes);
            } else {
              results[name] = { skipped: true, reason: "no changes detected" };
            }
          }
          return this.success({ indexes: results });
        } else {
          const results = await service.reindexAllIndexes();
          return this.success({ indexes: results });
        }
      } else {
        if (fromChanges) {
          const changes = getChangesFromGit(this.indexName);
          if (changes.length === 0) {
            return this.success({
              index: this.indexName,
              skipped: true,
              reason: "no changes detected"
            });
          }
          const result = await service.reindexFromChanges(this.indexName, changes);
          return this.success({ index: this.indexName, ...result });
        } else {
          const result = await service.reindexAll(this.indexName);
          return this.success({ index: this.indexName, ...result });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error("reindex_error", message);
    }
  }
}

/**
 * Status command - check index status
 */
class StatusCommand extends BaseCommand {
  readonly name = "status";
  readonly description = "Check status of all indexes";

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const projectRoot = getProjectRoot();
    const service = new KnowledgeService(projectRoot);

    try {
      const results = await service.checkAllIndexes();
      return this.success({ indexes: results });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error("status_error", message);
    }
  }
}

/**
 * Register knowledge commands on the given commander program.
 */
export function register(program: Command): void {
  const knowledgeCmd = program
    .command("knowledge")
    .description("Semantic search and indexing for docs and specs");

  // Create subcommand for each index (docs, specs)
  for (const indexName of KnowledgeService.getIndexNames()) {
    const indexCmd = knowledgeCmd
      .command(indexName)
      .description(`${INDEX_CONFIGS[indexName].description} operations`);

    // Search command
    const searchCmd = new SearchCommand(indexName as IndexName);
    const searchSubCmd = indexCmd.command(searchCmd.name).description(searchCmd.description);
    searchCmd.defineArguments(searchSubCmd);
    searchSubCmd.action(async (...args) => {
      const opts = args[args.length - 2] as Record<string, unknown>;
      const cmdObj = args[args.length - 1] as Command;
      const positionalArgs = cmdObj.args;
      const namedArgs: Record<string, unknown> = { ...opts };
      if (positionalArgs[0]) namedArgs.query = positionalArgs[0];
      const result = await searchCmd.execute(namedArgs);
      console.log(JSON.stringify(result, null, 2));
    });

    // Reindex command
    const reindexCmd = new ReindexCommand(indexName as IndexName);
    const reindexSubCmd = indexCmd.command(reindexCmd.name).description(reindexCmd.description);
    reindexCmd.defineArguments(reindexSubCmd);
    reindexSubCmd.action(async (...args) => {
      const opts = args[args.length - 2] as Record<string, unknown>;
      const result = await reindexCmd.execute(opts);
      console.log(JSON.stringify(result, null, 2));
    });
  }

  // Global reindex command
  const globalReindexCmd = new ReindexCommand("all");
  const globalReindexSubCmd = knowledgeCmd.command("reindex").description(globalReindexCmd.description);
  globalReindexCmd.defineArguments(globalReindexSubCmd);
  globalReindexSubCmd.action(async (...args) => {
    const opts = args[args.length - 2] as Record<string, unknown>;
    const result = await globalReindexCmd.execute(opts);
    console.log(JSON.stringify(result, null, 2));
  });

  // Status command
  const statusCmd = new StatusCommand();
  const statusSubCmd = knowledgeCmd.command(statusCmd.name).description(statusCmd.description);
  statusCmd.defineArguments(statusSubCmd);
  statusSubCmd.action(async () => {
    const result = await statusCmd.execute({});
    console.log(JSON.stringify(result, null, 2));
  });
}
