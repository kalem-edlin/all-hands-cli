/**
 * Core plan commands: init, status, check, cleanup-orphaned
 */

import { Command } from "commander";
import { readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  ensurePlanDir,
  getBaseBranch,
  getBranch,
  getProjectRoot,
  getPromptId,
  planExists,
  readAllPrompts,
  readPlan,
  readSummary,
  readUserInput,
  sanitizeBranch,
} from "../../lib/index.js";
import { BaseCommand, CommandResult } from "../base.js";

/**
 * Initialize plan directory for current branch.
 */
export class InitCommand extends BaseCommand {
  readonly name = "init";
  readonly description = "Initialize plan directory for current branch";

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    ensurePlanDir();

    return this.success({
      initialized: true,
      branch,
      base_branch: getBaseBranch(),
    });
  }
}

/**
 * Get plan directory status for current branch.
 */
export class StatusCommand extends BaseCommand {
  readonly name = "status";
  readonly description = "Get plan directory status for current branch";

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    const exists = planExists();

    return this.success({
      exists,
      branch,
      base_branch: getBaseBranch(),
    });
  }
}

/**
 * Check plan status and return context based on stage.
 */
export class CheckCommand extends BaseCommand {
  readonly name = "check";
  readonly description = "Get plan status and context based on stage";

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    if (!planExists()) {
      return this.success({
        exists: false,
        stage: null,
        message: "No plan directory exists for this branch",
      });
    }

    const plan = readPlan();
    const userInput = readUserInput();
    const summary = readSummary();
    const prompts = readAllPrompts();

    // Default stage if plan doesn't exist yet
    const stage = plan?.frontMatter?.stage ?? "draft";

    // Build response based on stage
    const response: Record<string, unknown> = {
      exists: true,
      stage,
      branch,
    };

    if (stage === "draft" && userInput) {
      // Draft with user input: return user_input.md
      response.user_input = userInput;
    } else if (stage === "in_progress") {
      // In progress: return user_input, plan context, and prompt descriptions
      response.user_input = userInput;
      response.plan_context = plan?.content ?? null;
      response.prompts = prompts.map((p) => ({
        id: getPromptId(p.number, p.variant),
        description: p.frontMatter.description,
        status: p.frontMatter.status,
        kind: p.frontMatter.kind,
        depends_on: p.frontMatter.depends_on,
      }));
    } else if (stage === "completed") {
      // Completed: return summary
      response.summary = summary;
    }

    return this.success(response);
  }
}

/**
 * Clean up orphaned plan directories (branches no longer exist).
 */
export class CleanupOrphanedCommand extends BaseCommand {
  readonly name = "cleanup-orphaned";
  readonly description = "Remove plan directories for deleted branches";

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const root = getProjectRoot();
    const plansDir = join(root, ".claude", "plans");

    // Exit if plans directory doesn't exist
    try {
      statSync(plansDir);
    } catch {
      return this.success({ cleaned: [], message: "No plans directory" });
    }

    // Get all local branches (sanitized)
    const branchResult = spawnSync("git", ["branch", "--format=%(refname:short)"], {
      encoding: "utf-8",
      cwd: root,
    });
    if (branchResult.status !== 0) {
      return this.error("git_error", "Failed to list branches");
    }

    const localBranches = new Set(
      branchResult.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(sanitizeBranch)
    );

    // Find orphaned plan directories
    const cleaned: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(plansDir);
    } catch {
      return this.success({ cleaned: [], message: "Plans directory empty or inaccessible" });
    }

    for (const entry of entries) {
      const entryPath = join(plansDir, entry);
      try {
        if (!statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }

      // Remove if no matching branch
      if (!localBranches.has(entry)) {
        try {
          rmSync(entryPath, { recursive: true, force: true });
          cleaned.push(entry);
        } catch {
          // Skip if removal fails
        }
      }
    }

    return this.success({
      cleaned,
      cleaned_count: cleaned.length,
    });
  }
}
