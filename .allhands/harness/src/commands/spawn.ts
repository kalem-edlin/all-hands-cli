/**
 * Spawn commands - agent spawning via OpenCode SDK.
 *
 * Commands:
 *   ah spawn codesearch "<query>" [--budget <n>] [--steps <n>]
 */

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { AgentRunner } from "../lib/opencode/index.js";
import { BaseCommand, type CommandResult } from "../lib/base-command.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const getProjectRoot = (): string => {
  return process.env.PROJECT_ROOT || process.cwd();
};

// Load prompt
const CODESEARCH_PROMPT_PATH = join(__dirname, "../lib/opencode/prompts/codesearch.md");
const getCodesearchPrompt = (): string => readFileSync(CODESEARCH_PROMPT_PATH, "utf-8");

// Defaults
const DEFAULT_TOOL_BUDGET = 12;
const DEFAULT_STEPS_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 120000; // 2 min

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
      .option("--steps <n>", "Hard step limit for agent iterations", String(DEFAULT_STEPS_LIMIT));
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const query = args.query as string;
    const toolBudget = parseInt(
      (args.budget as string) ??
        process.env.CODESEARCH_TOOL_BUDGET ??
        String(DEFAULT_TOOL_BUDGET),
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
          // MCP servers can be configured via environment or passed explicitly
          // mcp: {
          //   "ast-grep": {
          //     type: "local",
          //     command: ["uvx", "--from", "ast-grep-mcp", "ast-grep-mcp"],
          //   },
          // },
        },
        userMessage
      );

      if (!result.success) {
        return this.error("agent_error", result.error ?? "Unknown agent error");
      }

      const data = result.data!;

      // Warnings are included in the response data

      return this.success({
        query,
        result_count: data.results.length,
        results: data.results,
        warnings: data.warnings,
        dev_notes: data.dev_notes,
        metadata: result.metadata,
      });
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

  const codesearch = new CodesearchCommand();
  const cmd = spawnCmd.command(codesearch.name).description(codesearch.description);
  codesearch.defineArguments(cmd);
  cmd.action(async (...args) => {
    const opts = args[args.length - 2] as Record<string, unknown>;
    const cmdObj = args[args.length - 1] as Command;
    const positionalArgs = cmdObj.args;

    // Map positional args to named args based on command definition
    const namedArgs: Record<string, unknown> = { ...opts };
    if (positionalArgs[0]) namedArgs.query = positionalArgs[0];

    const result = await codesearch.execute(namedArgs);
    console.log(JSON.stringify(result, null, 2));
  });
}
