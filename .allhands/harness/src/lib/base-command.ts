/**
 * BaseCommand - Foundation for all ah CLI commands
 *
 * Provides:
 * - Structured logging with pino
 * - Agent context tracking (AGENT_TYPE, PROMPT_NUMBER, SPEC_NAME)
 * - JSON vs human-friendly output modes
 * - Standard error handling
 */

import pino from 'pino';

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
 * Create a logger instance with context
 */
export function createLogger(name: string, context: Partial<CommandContext> = {}): pino.Logger {
  const transport = context.json
    ? undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
        },
      });

  const logger = pino(
    {
      name,
      level: context.verbose ? 'debug' : 'info',
      base: {
        ...(context.agentType && { agent: context.agentType }),
        ...(context.promptNumber && { prompt: context.promptNumber }),
        ...(context.specName && { spec: context.specName }),
      },
    },
    transport
  );

  return logger;
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
 * Execute a command with standard error handling
 */
export async function executeCommand<T>(
  name: string,
  context: CommandContext,
  fn: () => Promise<CommandResult<T>>
): Promise<void> {
  const logger = createLogger(name, context);

  try {
    logger.debug({ action: 'start' }, `Starting ${name}`);
    const result = await fn();
    logger.debug({ action: 'complete', success: result.success }, `Completed ${name}`);

    const output = formatOutput(result, context);
    if (result.success) {
      console.log(output);
    } else {
      console.error(output);
      process.exit(1);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ action: 'error', error }, `Failed ${name}`);

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
