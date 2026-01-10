/**
 * Prompt lifecycle commands: next, start-prompt, record-implementation, complete-prompt, etc.
 */

import { execSync, spawnSync } from "child_process";
import { Command } from "commander";
import { GoogleGenAI } from "@google/genai";
import type { PromptFrontMatter } from "../../lib/index.js";
import {
  getBaseBranch,
  getBranch,
  getDiff,
  getPromptId,
  planExists,
  readAllPrompts,
  readPlan,
  readPrompt,
  readUserInput,
  updatePlanStage,
  writePrompt,
  writeSummary,
} from "../../lib/index.js";
import { BaseCommand, CommandResult } from "../base.js";

/**
 * Get next available prompts respecting dependencies.
 */
export class NextCommand extends BaseCommand {
  readonly name = "next";
  readonly description = "Get next available prompts respecting dependencies";

  defineArguments(cmd: Command): void {
    cmd.option("-n <count>", "Number of independent prompts to return");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    if (!planExists()) {
      return this.error("no_plan", "No plan directory exists for this branch");
    }

    // Get count from args, env var, or default to 1
    const countArg = args.n as string | undefined;
    const envCount = process.env.N_PARALLEL_WORKERS;
    const count = countArg
      ? parseInt(countArg, 10)
      : envCount
        ? parseInt(envCount, 10)
        : 1;

    if (isNaN(count) || count < 1) {
      return this.error("invalid_count", "Count must be a positive integer");
    }

    const prompts = readAllPrompts();

    // Build set of merged prompt numbers
    const mergedNumbers = new Set<number>();
    for (const p of prompts) {
      if (p.frontMatter.status === "merged") {
        mergedNumbers.add(p.number);
      }
    }

    // Find prompts that can be worked on (not merged, not in_progress, deps satisfied)
    const availablePrompts: Array<{
      number: number;
      variant: string | null;
      frontMatter: PromptFrontMatter;
      content: string;
    }> = [];

    for (const p of prompts) {
      // Skip already merged or in_progress
      if (p.frontMatter.status === "merged" || p.frontMatter.in_progress) {
        continue;
      }

      // Check all dependencies are merged
      const depsAreMerged = p.frontMatter.depends_on.every((dep) => mergedNumbers.has(dep));
      if (!depsAreMerged) {
        continue;
      }

      availablePrompts.push(p);
    }

    // Sort: debug prompts first, then by number, then by variant
    availablePrompts.sort((a, b) => {
      // Debug prompts first
      const aDebug = a.frontMatter.kind === "debug" ? 0 : 1;
      const bDebug = b.frontMatter.kind === "debug" ? 0 : 1;
      if (aDebug !== bDebug) return aDebug - bDebug;

      // Then by number
      if (a.number !== b.number) return a.number - b.number;

      // Then by variant (null first, then alphabetically)
      if (!a.variant && b.variant) return -1;
      if (a.variant && !b.variant) return 1;
      return (a.variant || "").localeCompare(b.variant || "");
    });

    // Select up to count prompts, pulling all variants when one is selected
    const selectedNumbers = new Set<number>();
    const selected: typeof availablePrompts = [];

    for (const p of availablePrompts) {
      if (selectedNumbers.size >= count && !selectedNumbers.has(p.number)) {
        break;
      }
      selectedNumbers.add(p.number);
      selected.push(p);
    }

    // Format response
    const result = selected.map((p) => ({
      prompt_num: p.number,
      variant: p.variant,
      description: p.frontMatter.description,
      relevant_files: p.frontMatter.relevant_files,
      kind: p.frontMatter.kind,
    }));

    return this.success({
      prompts: result,
      count: result.length,
      requested: count,
    });
  }
}

/**
 * Start working on a prompt - set in_progress and tracking info.
 */
export class StartPromptCommand extends BaseCommand {
  readonly name = "start-prompt";
  readonly description = "Start working on a prompt";

  defineArguments(cmd: Command): void {
    cmd.argument("<number>", "Prompt number (integer)");
    cmd.argument("[variant]", "Optional variant letter (A, B, etc.)");
    cmd.option("--specialist <name>", "Name of the specialist/agent working on this prompt");
    cmd.option("--worktree <branch>", "Worktree branch name for tracking");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    const number = parseInt(args.number as string, 10);
    if (isNaN(number) || number < 1) {
      return this.error("invalid_number", "Prompt number must be a positive integer");
    }

    const variant = args.variant as string | undefined;
    if (variant && !/^[A-Z]$/.test(variant)) {
      return this.error("invalid_variant", "Variant must be a single uppercase letter (A-Z)");
    }

    const id = getPromptId(number, variant || null);
    const prompt = readPrompt(number, variant || null);
    if (!prompt) {
      return this.error("not_found", `Prompt ${id} not found`);
    }

    const specialist = args.specialist as string | undefined;
    const worktree = args.worktree as string | undefined;

    // Update prompt front matter
    const updatedFrontMatter: PromptFrontMatter = {
      ...prompt.frontMatter,
      in_progress: true,
      current_iteration: 1,
      delegated_to: (specialist as PromptFrontMatter["delegated_to"]) || null,
      worktree_branch_name: worktree || null,
    };

    writePrompt(number, variant || null, updatedFrontMatter, prompt.content);

    return this.success({
      id,
      in_progress: true,
      specialist: specialist || null,
      worktree: worktree || null,
      current_iteration: 1,
    });
  }
}

/**
 * Record implementation walkthrough for a prompt.
 */
export class RecordImplementationCommand extends BaseCommand {
  readonly name = "record-implementation";
  readonly description = "Record implementation walkthrough for a prompt";

  defineArguments(cmd: Command): void {
    cmd.argument("<number>", "Prompt number (integer)");
    cmd.argument("[variant]", "Optional variant letter (A, B, etc.)");
    cmd.option("--walkthrough <walkthrough>", "Structured walkthrough markdown");
    cmd.option("--iteration <n>", "Iteration number (1 for initial, 2+ for refinements)");
    cmd.option("--refinement-reason <reason>", "Context for why this iteration was needed");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    const number = parseInt(args.number as string, 10);
    if (isNaN(number) || number < 1) {
      return this.error("invalid_number", "Prompt number must be a positive integer");
    }

    const variant = args.variant as string | undefined;
    if (variant && !/^[A-Z]$/.test(variant)) {
      return this.error("invalid_variant", "Variant must be a single uppercase letter (A-Z)");
    }

    const id = getPromptId(number, variant || null);
    const prompt = readPrompt(number, variant || null);
    if (!prompt) {
      return this.error("not_found", `Prompt ${id} not found`);
    }

    const walkthrough = args.walkthrough as string | undefined;
    if (!walkthrough) {
      return this.error("missing_walkthrough", "Walkthrough is required");
    }

    const iterationStr = args.iteration as string | undefined;
    const iteration = iterationStr ? parseInt(iterationStr, 10) : 1;
    if (isNaN(iteration) || iteration < 1) {
      return this.error("invalid_iteration", "Iteration must be a positive integer");
    }

    const refinementReason = args.refinementReason as string | undefined;
    if (iteration > 1 && !refinementReason) {
      return this.error("missing_refinement_reason", "Refinement reason is required for iteration > 1");
    }

    // Build walkthrough entry
    const walkthroughEntry: PromptFrontMatter["walkthrough"][0] = {
      iteration,
      type: iteration === 1 ? "initial" : "review-refinement",
      refinement_reason: refinementReason || null,
      approach: walkthrough,
      changes: [],
      decisions: [],
    };

    // Append to existing walkthrough
    const existingWalkthrough = prompt.frontMatter.walkthrough || [];
    const updatedWalkthrough = [...existingWalkthrough, walkthroughEntry];

    const updatedFrontMatter: PromptFrontMatter = {
      ...prompt.frontMatter,
      status: "implemented",
      current_iteration: iteration,
      walkthrough: updatedWalkthrough,
    };

    writePrompt(number, variant || null, updatedFrontMatter, prompt.content);

    return this.success({
      id,
      status: "implemented",
      iteration,
      walkthrough_count: updatedWalkthrough.length,
    });
  }
}

/**
 * Complete a prompt - set status to merged.
 */
export class CompletePromptCommand extends BaseCommand {
  readonly name = "complete-prompt";
  readonly description = "Complete a prompt (set status to merged)";

  defineArguments(cmd: Command): void {
    cmd.argument("<number>", "Prompt number (integer)");
    cmd.argument("[variant]", "Optional variant letter (A, B, etc.)");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    const number = parseInt(args.number as string, 10);
    if (isNaN(number) || number < 1) {
      return this.error("invalid_number", "Prompt number must be a positive integer");
    }

    const variant = args.variant as string | undefined;
    if (variant && !/^[A-Z]$/.test(variant)) {
      return this.error("invalid_variant", "Variant must be a single uppercase letter (A-Z)");
    }

    const id = getPromptId(number, variant || null);
    const prompt = readPrompt(number, variant || null);
    if (!prompt) {
      return this.error("not_found", `Prompt ${id} not found`);
    }

    const updatedFrontMatter: PromptFrontMatter = {
      ...prompt.frontMatter,
      status: "merged",
      in_progress: false,
    };

    writePrompt(number, variant || null, updatedFrontMatter, prompt.content);

    return this.success({
      id,
      status: "merged",
    });
  }
}

/**
 * Get prompt walkthrough for documentation extraction.
 */
export class GetPromptWalkthroughCommand extends BaseCommand {
  readonly name = "get-prompt-walkthrough";
  readonly description = "Get prompt walkthrough for documentation extraction";

  defineArguments(cmd: Command): void {
    cmd.argument("<number>", "Prompt number (integer)");
    cmd.argument("[variant]", "Optional variant letter (A, B, etc.)");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    const number = parseInt(args.number as string, 10);
    if (isNaN(number) || number < 1) {
      return this.error("invalid_number", "Prompt number must be a positive integer");
    }

    const variant = args.variant as string | undefined;
    if (variant && !/^[A-Z]$/.test(variant)) {
      return this.error("invalid_variant", "Variant must be a single uppercase letter (A-Z)");
    }

    const id = getPromptId(number, variant || null);
    const prompt = readPrompt(number, variant || null);
    if (!prompt) {
      return this.error("not_found", `Prompt ${id} not found`);
    }

    // Get git diff summary for this prompt's changes
    let gitDiffSummary = "";
    const mergeCommit = prompt.frontMatter.merge_commit_hash;
    const relevantFiles = prompt.frontMatter.relevant_files || [];

    if (mergeCommit) {
      try {
        const result = spawnSync(
          "git",
          ["diff", "--stat", `${mergeCommit}^..${mergeCommit}`],
          { encoding: "utf-8" }
        );
        gitDiffSummary = result.stdout || "(No changes in merge commit)";
      } catch {
        gitDiffSummary = "(Unable to get merge commit diff)";
      }
    } else if (relevantFiles.length > 0) {
      try {
        const baseBranch = getBaseBranch();
        const result = spawnSync(
          "git",
          ["diff", "--stat", baseBranch, "--", ...relevantFiles],
          { encoding: "utf-8" }
        );
        gitDiffSummary = result.stdout || "(No changes)";
      } catch {
        gitDiffSummary = "(Unable to get diff)";
      }
    }

    return this.success({
      prompt_num: number,
      variant: variant || null,
      description: prompt.frontMatter.description,
      success_criteria: prompt.frontMatter.success_criteria,
      walkthrough: prompt.frontMatter.walkthrough || [],
      git_diff_summary: gitDiffSummary,
      merge_commit_hash: mergeCommit || null,
    });
  }
}

/**
 * Mark a prompt as having its documentation extracted.
 */
export class MarkPromptExtractedCommand extends BaseCommand {
  readonly name = "mark-prompt-extracted";
  readonly description = "Mark prompt documentation as extracted";

  defineArguments(cmd: Command): void {
    cmd.argument("<number>", "Prompt number (integer)");
    cmd.argument("[variant]", "Optional variant letter (A, B, etc.)");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    const number = parseInt(args.number as string, 10);
    if (isNaN(number) || number < 1) {
      return this.error("invalid_number", "Prompt number must be a positive integer");
    }

    const variant = args.variant as string | undefined;
    if (variant && !/^[A-Z]$/.test(variant)) {
      return this.error("invalid_variant", "Variant must be a single uppercase letter (A-Z)");
    }

    const id = getPromptId(number, variant || null);
    const prompt = readPrompt(number, variant || null);
    if (!prompt) {
      return this.error("not_found", `Prompt ${id} not found`);
    }

    const updatedFrontMatter: PromptFrontMatter = {
      ...prompt.frontMatter,
      documentation_extracted: true,
    };

    writePrompt(number, variant || null, updatedFrontMatter, prompt.content);

    return this.success({
      id,
      documentation_extracted: true,
    });
  }
}

/**
 * Get all walkthroughs from prompts not yet documented.
 * Returns walkthroughs for all prompts where documentation_extracted is false.
 */
export class GetAllWalkthroughsCommand extends BaseCommand {
  readonly name = "get-all-walkthroughs";
  readonly description = "Get walkthroughs from all undocumented prompts";

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    if (!planExists()) {
      return this.error("no_plan", "No plan directory exists for this branch");
    }

    const prompts = readAllPrompts();
    const undocumented = prompts.filter((p) => !p.frontMatter.documentation_extracted);

    const walkthroughs = undocumented.map((p) => ({
      prompt_num: p.number,
      variant: p.variant,
      id: getPromptId(p.number, p.variant),
      description: p.frontMatter.description,
      walkthrough: p.frontMatter.walkthrough || [],
      relevant_files: p.frontMatter.relevant_files || [],
    }));

    return this.success({
      count: walkthroughs.length,
      walkthroughs,
    });
  }
}

/**
 * Mark all undocumented prompts as documentation_extracted.
 */
export class MarkAllDocumentedCommand extends BaseCommand {
  readonly name = "mark-all-documented";
  readonly description = "Mark all undocumented prompts as documentation extracted";

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    if (!planExists()) {
      return this.error("no_plan", "No plan directory exists for this branch");
    }

    const prompts = readAllPrompts();
    const undocumented = prompts.filter((p) => !p.frontMatter.documentation_extracted);
    const marked: string[] = [];

    for (const p of undocumented) {
      const prompt = readPrompt(p.number, p.variant);
      if (prompt) {
        const updatedFrontMatter: PromptFrontMatter = {
          ...prompt.frontMatter,
          documentation_extracted: true,
        };
        writePrompt(p.number, p.variant, updatedFrontMatter, prompt.content);
        marked.push(getPromptId(p.number, p.variant));
      }
    }

    return this.success({
      marked_count: marked.length,
      marked_prompts: marked,
    });
  }
}

/**
 * Release all prompts from in_progress status.
 */
export class ReleaseAllPromptsCommand extends BaseCommand {
  readonly name = "release-all-prompts";
  readonly description = "Release all prompts from in_progress status";

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    if (!planExists()) {
      return this.error("no_plan", "No plan directory exists for this branch");
    }

    const prompts = readAllPrompts();
    let releasedCount = 0;

    for (const p of prompts) {
      if (p.frontMatter.in_progress) {
        const updatedFrontMatter: PromptFrontMatter = {
          ...p.frontMatter,
          in_progress: false,
        };
        writePrompt(p.number, p.variant, updatedFrontMatter, p.content);
        releasedCount++;
      }
    }

    return this.success({
      released_count: releasedCount,
      total_prompts: prompts.length,
    });
  }
}

/**
 * Complete the plan - generate summary, create PR.
 */
export class CompleteCommand extends BaseCommand {
  readonly name = "complete";
  readonly description = "Complete the plan - generate summary and create PR";

  private readonly SUMMARY_PROMPT = `You are a technical writer creating a pull request summary.

Given a plan, implementation walkthroughs, user input, and git diff, generate a clear PR description.

Format:
## Summary
[1-3 bullet points summarizing what was implemented]

## Changes
[Grouped by area/feature, list major changes]

## Testing
[How to test these changes]

## Notes
[Any additional context, breaking changes, or follow-up items]`;

  defineArguments(_cmd: Command): void {
    // No arguments
  }

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const branch = getBranch();
    if (!branch) {
      return this.error("no_branch", "Not in a git repository or no branch checked out");
    }

    if (!planExists()) {
      return this.error("no_plan", "No plan directory exists for this branch");
    }

    const apiKey = process.env.VERTEX_API_KEY;
    if (!apiKey) {
      return this.error("auth_error", "VERTEX_API_KEY not set");
    }

    // Gather context
    const plan = readPlan();
    const userInput = readUserInput();
    const prompts = readAllPrompts();
    const baseBranch = getBaseBranch();
    const diff = getDiff(baseBranch);

    // Build context for summary generation
    const promptSummaries = prompts.map((p) => {
      const id = getPromptId(p.number, p.variant);
      const walkthrough = p.frontMatter.walkthrough || [];
      return `### Prompt ${id}: ${p.frontMatter.description}
Status: ${p.frontMatter.status}
Iterations: ${walkthrough.length}
${walkthrough.map((w) => `- Iteration ${w.iteration} (${w.type}): ${w.approach.substring(0, 200)}...`).join("\n")}`;
    }).join("\n\n");

    const fullPrompt = `${this.SUMMARY_PROMPT}

## Plan
${plan?.content || "(No plan content)"}

## User Input
${userInput || "(No user input)"}

## Prompts Implemented
${promptSummaries}

## Git Diff (against ${baseBranch})
\`\`\`diff
${diff.substring(0, 50000)}
\`\`\`

Generate the PR summary now.`;

    try {
      // Generate summary with Gemini
      const [summary, durationMs] = await this.timedExecute(async () => {
        const client = new GoogleGenAI({ vertexai: true, apiKey });
        const result = await client.models.generateContent({
          model: "gemini-2.0-flash",
          contents: fullPrompt,
        });
        return result.text ?? "";
      });

      // Write summary
      writeSummary(summary);

      // Update plan stage to completed
      updatePlanStage("completed");

      // Push to remote
      try {
        execSync(`git push -u origin ${branch}`, { encoding: "utf-8", stdio: "pipe" });
      } catch {
        // Push might fail if already up to date or no remote
      }

      // Create PR using gh CLI
      let prUrl = "";
      try {
        const prResult = spawnSync(
          "gh",
          [
            "pr",
            "create",
            "--title",
            plan?.frontMatter?.branch_name || branch,
            "--body",
            summary,
            "--base",
            baseBranch,
          ],
          { encoding: "utf-8" }
        );
        if (prResult.status === 0) {
          prUrl = prResult.stdout.trim();
        } else {
          // PR might already exist, try to get URL
          const viewResult = spawnSync("gh", ["pr", "view", "--json", "url"], {
            encoding: "utf-8",
          });
          if (viewResult.status === 0) {
            const parsed = JSON.parse(viewResult.stdout);
            prUrl = parsed.url || "";
          }
        }
      } catch {
        // gh CLI might not be available
      }

      return this.success(
        {
          success: true,
          pr_url: prUrl,
          summary_written: true,
          stage: "completed",
        },
        {
          command: "plan complete",
          duration_ms: durationMs,
        }
      );
    } catch (e) {
      return this.error("api_error", e instanceof Error ? e.message : String(e));
    }
  }
}
