/**
 * Observability system for All Hands CLI.
 * Lightweight logging for command and agent execution.
 */

import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV !== "production" ? {
    target: "pino-pretty",
    options: { colorize: true }
  } : undefined
});

export type LogLevel = "info" | "warn" | "error";

/**
 * Log command start with optional context.
 */
export function logCommandStart(command: string, context?: Record<string, unknown>): void {
  logger.info({ command, ...context }, `[${command}] started`);
}

/**
 * Log command completion with result and duration.
 */
export function logCommandComplete(
  command: string,
  result: "success" | "error",
  durationMs: number,
  context?: Record<string, unknown>
): void {
  const level = result === "error" ? "error" : "info";
  logger[level](
    { command, result, duration_ms: durationMs, ...context },
    `[${command}] ${result} in ${durationMs}ms`
  );
}

/**
 * Log warning message.
 */
export function logWarn(message: string, context?: Record<string, unknown>): void {
  logger.warn(context, message);
}

/**
 * Log error message.
 */
export function logError(message: string, context?: Record<string, unknown>): void {
  logger.error(context, message);
}

export { logger };
