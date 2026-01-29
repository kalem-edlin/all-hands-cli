/**
 * BaseCommand - Foundation for all ah CLI commands
 *
 * Provides:
 * - Agent context tracking (AGENT_TYPE, PROMPT_NUMBER, SPEC_NAME)
 * - JSON vs human-friendly output modes
 * - Standard error handling
 * - Trace logging (SQLite + JSONL)
 */

import { logCommandStart, logCommandSuccess, logCommandError } from './trace-store.js';

export interface CommandContext {
  /** Agent type (executor, coordinator, planner, judge, ideation, documentor, pr-reviewer) */
  agentType?: string;
  /** Current prompt number (e.g., "01") */
  promptNumber?: string;
  /** Current spec name */
  specName?: string;
  /** Output format */
  json: boolean;
  /** Verbose logging */
  verbose: boolean;
}

export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

/**
 * Get context from environment variables (set by tmux window spawner)
 */
export function getEnvContext(): Partial<CommandContext> {
  return {
    agentType: process.env.AGENT_TYPE,
    promptNumber: process.env.PROMPT_NUMBER,
    specName: process.env.SPEC_NAME,
  };
}

/**
 * Format output based on context
 */
export function formatOutput<T>(result: CommandResult<T>, context: CommandContext): string {
  if (context.json) {
    return JSON.stringify(result, null, 2);
  }

  if (!result.success) {
    let output = `Error: ${result.error}`;
    if (result.details) {
      output += `\n${result.details}`;
    }
    return output;
  }

  if (typeof result.data === 'string') {
    return result.data;
  }

  return JSON.stringify(result.data, null, 2);
}

/**
 * Parse common command options into context
 */
export function parseContext(options: {
  agent?: string;
  json?: boolean;
  verbose?: boolean;
}): CommandContext {
  const envContext = getEnvContext();
  return {
    agentType: options.agent || envContext.agentType,
    promptNumber: envContext.promptNumber,
    specName: envContext.specName,
    json: options.json ?? false,
    verbose: options.verbose ?? false,
  };
}

/**
 * Execute a command with standard error handling and trace logging
 */
export async function executeCommand<T>(
  name: string,
  context: CommandContext,
  fn: () => Promise<CommandResult<T>>,
  args: Record<string, unknown> = {}
): Promise<void> {
  // Log command start to trace store
  logCommandStart(name, { ...args, context });

  try {
    const result = await fn();

    const output = formatOutput(result, context);
    if (result.success) {
      // Log success to trace store
      logCommandSuccess(name, { data: result.data });
      console.log(output);
    } else {
      // Log error to trace store
      logCommandError(name, result.error || 'Unknown error', args);
      console.error(output);
      process.exit(1);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    // Log error to trace store
    logCommandError(name, error, args);

    const result: CommandResult<T> = {
      success: false,
      error: `Command failed: ${error}`,
    };
    console.error(formatOutput(result, context));
    process.exit(1);
  }
}

/**
 * Add common options to a commander command
 */
export function addCommonOptions(cmd: { option: (flags: string, description: string) => unknown }) {
  cmd.option('--agent <type>', 'Agent type for logging context');
  cmd.option('--json', 'Output as JSON (for agent consumption)');
  cmd.option('-v, --verbose', 'Enable verbose logging');
  return cmd;
}

/**
 * Wrap a Commander action handler with trace logging.
 * Use this for commands that don't use executeCommand.
 *
 * @example
 * .action(tracedAction('specs persist', async (path, options) => {
 *   // command implementation
 * }))
 */
export function tracedAction<TArgs extends unknown[]>(
  commandName: string,
  handler: (...args: TArgs) => Promise<void> | void
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    // Extract args for logging (filter out Commander object at the end)
    const logArgs: Record<string, unknown> = {};
    args.slice(0, -1).forEach((arg, i) => {
      logArgs[`arg${i}`] = arg;
    });

    logCommandStart(commandName, logArgs);

    try {
      await handler(...args);
      // If we get here without process.exit, it succeeded
      logCommandSuccess(commandName, {});
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logCommandError(commandName, error, logArgs);
      throw err; // Re-throw to let Commander handle it
    }
  };
}

/**
 * BaseCommand - Abstract base class for command implementations.
 * Provides helper methods for success/error responses.
 */
export abstract class BaseCommand {
  abstract readonly name: string;
  abstract readonly description: string;

  abstract defineArguments(cmd: import('commander').Command): void;
  abstract execute(args: Record<string, unknown>): Promise<CommandResult>;

  /**
   * Create a success result
   */
  protected success<T>(data: T): CommandResult<T> {
    return { success: true, data };
  }

  /**
   * Create an error result
   */
  protected error(code: string, message: string, details?: string): CommandResult {
    return {
      success: false,
      error: `${code}: ${message}`,
      details,
    };
  }
}
