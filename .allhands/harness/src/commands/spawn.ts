/**
 * Spawn commands - agent spawning via OpenCode SDK.
 *
 * Commands:
 *   ah spawn codesearch "<query>" [--budget <n>] [--steps <n>]
 *   ah spawn reposearch "<query>" --repos <url1,url2,...> [--steps <n>]
 */

import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { AgentRunner, withDebugInfo, type ReposearchOutput } from "../lib/opencode/index.js";
import { BaseCommand, type CommandResult } from "../lib/base-command.js";
import { loadProjectSettings } from "../hooks/shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const getProjectRoot = (): string => {
  return process.env.PROJECT_ROOT || process.cwd();
};

// Load prompts
const CODESEARCH_PROMPT_PATH = join(__dirname, "../lib/opencode/prompts/codesearch.md");
const getCodesearchPrompt = (): string => readFileSync(CODESEARCH_PROMPT_PATH, "utf-8");

const REPOSEARCH_PROMPT_PATH = join(__dirname, "../lib/opencode/prompts/reposearch.md");
const getReposearchPrompt = (): string => readFileSync(REPOSEARCH_PROMPT_PATH, "utf-8");

// Codesearch defaults
const DEFAULT_TOOL_BUDGET = 12;
const DEFAULT_STEPS_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 120000; // 2 min

// Reposearch defaults
const DEFAULT_REPOSEARCH_STEPS = 30;
const DEFAULT_REPOSEARCH_TIMEOUT_MS = 180000; // 3 min
const DEFAULT_REPOSEARCH_TOOL_BUDGET = 20;

// Output types
interface CodeResult {
  file: string;
  line_start: number;
  line_end: number;
  code: string;
  relevance: "high" | "medium" | "low";
  match_type: "structural" | "text" | "semantic";
  context?: string;
}

interface CodesearchOutput {
  results: CodeResult[];
  warnings: string[];
  dev_notes: {
    tool_budget_used: number;
    tools_invoked: string[];
    tools_failed: string[];
  };
}

/**
 * Codesearch command - spawn code search agent with ast-grep, ripgrep, and LSP.
 */
class CodesearchCommand extends BaseCommand {
  readonly name = "codesearch";
  readonly description = "AI code search with structural (ast-grep), text (ripgrep), and semantic (LSP) tools";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<query>", "Code search query (natural language or pattern)")
      .option("--budget <n>", "Soft tool budget hint for the agent", String(DEFAULT_TOOL_BUDGET))
      .option("--steps <n>", "Hard step limit for agent iterations", String(DEFAULT_STEPS_LIMIT))
      .option("--debug", "Include agent debug metadata (model, timing, fallback) in output");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const query = args.query as string;
    const debug = !!args.debug;
    const settings = loadProjectSettings();
    const toolBudget = parseInt(
      (args.budget as string) ??
        String(settings?.opencodeSdk?.codesearchToolBudget ?? DEFAULT_TOOL_BUDGET),
      10
    );
    const stepsLimit = parseInt((args.steps as string) ?? String(DEFAULT_STEPS_LIMIT), 10);

    if (!query) {
      return this.error("validation_error", "query is required");
    }

    const projectRoot = getProjectRoot();
    const runner = new AgentRunner(projectRoot);

    // Build user message with budget context
    const userMessage = `## Search Query
${query}

## Budget
- Tool budget (soft): ${toolBudget} tool calls
- Available tools: ast-grep MCP (structural), grep (text), read, lsp, glob
- Prioritize structural matches (ast-grep) for code patterns, text (grep) for literals/comments

Respond with JSON matching the required schema.`;

    try {
      const result = await runner.run<CodesearchOutput>(
        {
          name: "codesearch",
          systemPrompt: getCodesearchPrompt(),
          timeoutMs: DEFAULT_TIMEOUT_MS,
          steps: stepsLimit,
        },
        userMessage
      );

      if (!result.success) {
        return this.error("agent_error", result.error ?? "Unknown agent error");
      }

      const data = result.data!;

      return this.success(withDebugInfo({
        query,
        result_count: data.results.length,
        results: data.results,
        warnings: data.warnings,
        dev_notes: data.dev_notes,
        metadata: result.metadata,
      }, result, debug));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error("spawn_error", message);
    }
  }
}

/**
 * Derive a directory name from a GitHub URL.
 * e.g. "https://github.com/org/repo" -> "org--repo"
 */
function repoDirName(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove .git suffix and leading slash, replace / with --
    const path = parsed.pathname.replace(/\.git$/, "").replace(/^\//, "");
    return path.replace(/\//g, "--");
  } catch {
    // Fallback: use basename-like extraction
    return basename(url).replace(/\.git$/, "") || "repo";
  }
}

/**
 * Clone or pull a repo into the .reposearch directory.
 * Returns the local directory path, or null on failure.
 */
function cloneOrPullRepo(reposearchDir: string, repoUrl: string): string | null {
  const dirName = repoDirName(repoUrl);
  const repoDir = join(reposearchDir, dirName);

  try {
    if (existsSync(join(repoDir, ".git"))) {
      // Repo already cloned — pull latest
      execFileSync("git", ["pull", "--ff-only"], {
        cwd: repoDir,
        stdio: "pipe",
        timeout: 60000,
      });
    } else {
      // Fresh clone (shallow)
      mkdirSync(reposearchDir, { recursive: true });
      execFileSync("git", ["clone", "--depth", "1", repoUrl, repoDir], {
        stdio: "pipe",
        timeout: 120000,
      });
    }
    return repoDir;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Warning: Failed to clone/pull ${repoUrl}: ${message}`);
    return null;
  }
}

/**
 * Reposearch command - spawn research agent that searches across current project and external repos.
 */
class ReposearchCommand extends BaseCommand {
  readonly name = "reposearch";
  readonly description = "Research code across the current project and external GitHub repositories";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<query>", "Research query (natural language)")
      .requiredOption("--repos <urls>", "Comma-separated GitHub repo URLs to search")
      .option("--steps <n>", "Hard step limit for agent iterations", String(DEFAULT_REPOSEARCH_STEPS))
      .option("--debug", "Include agent debug metadata (model, timing, fallback) in output");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const query = args.query as string;
    const reposRaw = args.repos as string;
    const stepsLimit = parseInt((args.steps as string) ?? String(DEFAULT_REPOSEARCH_STEPS), 10);
    const debug = !!args.debug;

    if (!query) {
      return this.error("validation_error", "query is required");
    }
    if (!reposRaw) {
      return this.error("validation_error", "--repos is required (comma-separated GitHub URLs)");
    }

    const repoUrls = reposRaw.split(",").map((u) => u.trim()).filter(Boolean);
    if (repoUrls.length === 0) {
      return this.error("validation_error", "No valid repo URLs provided");
    }

    const projectRoot = getProjectRoot();
    const reposearchDir = join(projectRoot, ".reposearch");

    // Clone or pull each repo
    const repoDirectories: Array<{ url: string; dir: string }> = [];
    const warnings: string[] = [];

    for (const url of repoUrls) {
      const dir = cloneOrPullRepo(reposearchDir, url);
      if (dir) {
        repoDirectories.push({ url, dir });
      } else {
        warnings.push(`Failed to clone/pull: ${url}`);
      }
    }

    if (repoDirectories.length === 0) {
      return this.error("clone_error", "All repo clones/pulls failed. Check URLs and network.");
    }

    const runner = new AgentRunner(projectRoot);

    // Build directory listing for the agent
    const repoListing = repoDirectories
      .map((r) => `- ${r.url} → ${r.dir}`)
      .join("\n");

    const userMessage = `## Research Query
${query}

## Directories to Search

### Current Project
- Root: ${projectRoot}

### External Repositories
${repoListing}

## Budget
- Tool budget (soft): ${DEFAULT_REPOSEARCH_TOOL_BUDGET} tool calls
- Available tools: grep (text search), glob (file patterns), read (file content), lsp (if available)
- Search all relevant directories to answer the query

${warnings.length > 0 ? `## Warnings\n${warnings.map((w) => `- ${w}`).join("\n")}\n\n` : ""}Respond with JSON matching the required schema.`;

    try {
      const result = await runner.run<ReposearchOutput>(
        {
          name: "reposearch",
          systemPrompt: getReposearchPrompt(),
          timeoutMs: DEFAULT_REPOSEARCH_TIMEOUT_MS,
          steps: stepsLimit,
        },
        userMessage
      );

      if (!result.success) {
        return this.error("agent_error", result.error ?? "Unknown agent error");
      }

      const data = result.data!;

      return this.success(withDebugInfo({
        query,
        repos_requested: repoUrls,
        repos_analyzed: data.repos_analyzed,
        analysis: data.analysis,
        code_references: data.code_references,
        warnings,
        metadata: result.metadata,
      }, result, debug));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error("spawn_error", message);
    }
  }
}

/**
 * Register spawn commands on the given commander program.
 */
export function register(program: Command): void {
  const spawnCmd = program
    .command("spawn")
    .description("Spawn sub-agents for specialized tasks");

  // Register codesearch
  const codesearch = new CodesearchCommand();
  const codesearchCmd = spawnCmd.command(codesearch.name).description(codesearch.description);
  codesearch.defineArguments(codesearchCmd);
  codesearchCmd.action(async (...args) => {
    const opts = args[args.length - 2] as Record<string, unknown>;
    const cmdObj = args[args.length - 1] as Command;
    const positionalArgs = cmdObj.args;

    const namedArgs: Record<string, unknown> = { ...opts };
    if (positionalArgs[0]) namedArgs.query = positionalArgs[0];

    const result = await codesearch.execute(namedArgs);
    console.log(JSON.stringify(result, null, 2));
  });

  // Register reposearch
  const reposearch = new ReposearchCommand();
  const reposearchCmd = spawnCmd.command(reposearch.name).description(reposearch.description);
  reposearch.defineArguments(reposearchCmd);
  reposearchCmd.action(async (...args) => {
    const opts = args[args.length - 2] as Record<string, unknown>;
    const cmdObj = args[args.length - 1] as Command;
    const positionalArgs = cmdObj.args;

    const namedArgs: Record<string, unknown> = { ...opts };
    if (positionalArgs[0]) namedArgs.query = positionalArgs[0];

    const result = await reposearch.execute(namedArgs);
    console.log(JSON.stringify(result, null, 2));
  });
}
