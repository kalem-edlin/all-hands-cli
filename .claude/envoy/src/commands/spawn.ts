/**
 * Spawn commands - agent spawning via OpenCode SDK.
 *
 * Commands:
 *   envoy spawn codesearch "<query>" [--budget <n>] [--steps <n>]
 */

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { AgentRunner } from "../lib/agents/index.js";
import { logWarn } from "../lib/observability.js";
import { BaseCommand, type CommandResult } from "./base.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const getProjectRoot = (): string => {
  return process.env.PROJECT_ROOT || process.cwd();
};

// Load prompt
const CODESEARCH_PROMPT_PATH = join(__dirname, "../lib/agents/prompts/codesearch.md");
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
          mcp: {
            "ast-grep": {
              type: "local",
              command: ["uvx", "--from", "git+https://github.com/ast-grep/ast-grep-mcp", "ast-grep-server"],
            },
          },
        },
        userMessage
      );

      if (!result.success || !result.data) {
        return this.error("agent_failed", result.error ?? "Unknown agent error");
      }

      // Log warnings
      for (const warning of result.data.warnings ?? []) {
        logWarn("spawn.codesearch", { warning });
      }

      // Log tool failures
      for (const failure of result.data.dev_notes?.tools_failed ?? []) {
        logWarn("spawn.codesearch", { tool_failed: failure });
      }

      return this.success(
        {
          results: result.data.results,
          warnings: result.data.warnings,
          dev_notes: result.data.dev_notes,
        },
        result.metadata
      );
    } catch (e) {
      return this.error("execution_error", e instanceof Error ? e.message : String(e));
    }
  }
}

export const COMMANDS = {
  codesearch: CodesearchCommand,
};
