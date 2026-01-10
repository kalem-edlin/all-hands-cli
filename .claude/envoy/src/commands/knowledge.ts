/**
 * Knowledge commands - semantic search and indexing for docs/ documentation.
 *
 * Commands:
 *   envoy knowledge search <query> [--metadata-only]
 *   envoy knowledge reindex-all
 *   envoy knowledge reindex-from-changes --files <json_array>
 */

import { Command } from "commander";
import { BaseCommand, CommandResult } from "./base.js";
import { KnowledgeService, type FileChange } from "../lib/knowledge.js";

const getProjectRoot = (): string => {
  return process.env.PROJECT_ROOT || process.cwd();
};

/**
 * Search command - semantic search against docs index
 */
class SearchCommand extends BaseCommand {
  readonly name = "search";
  readonly description = "Semantic search docs (use descriptive phrases, not keywords)";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<query>", "Descriptive phrase (e.g. 'how to handle API authentication' not 'auth')")
      .option("--metadata-only", "Return only file paths and descriptions (no full content)");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const query = args.query as string;
    const metadataOnly = !!args.metadataOnly;

    if (!query) {
      return this.error("validation_error", "query is required");
    }

    try {
      const service = new KnowledgeService(getProjectRoot());
      const results = await service.search(query, 50, metadataOnly);

      return this.success({
        message: "Search completed",
        query,
        metadata_only: metadataOnly,
        results,
        result_count: results.length,
      });
    } catch (e) {
      return this.error(
        "search_error",
        e instanceof Error ? e.message : String(e)
      );
    }
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
