/**
 * Observability system for claude-envoy.
 * Log-based tracing via envoy.log.
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getProjectRoot, getBranch } from "./git.js";

/**
 * Derive plan_name from branch.
 * Worktree branches follow pattern: feature-foo/implementation-1-A
 * Plan name is the parent branch before /implementation-*
 */
export function getPlanName(branch?: string | null): string | undefined {
  const b = branch ?? getBranch();
  if (!b) return undefined;
  // Strip /implementation-* suffix if present
  const match = b.match(/^(.+?)\/implementation-/);
  return match ? match[1] : b;
}

// --- Constants ---

/** Max string length before truncation in logs (default 200, configurable via env) */
const MAX_LOG_STRING_LENGTH = parseInt(
  process.env.ENVOY_LOG_MAX_STRING_LENGTH ?? "200",
  10
);

// --- Types ---

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  command: string;
  plan_name?: string;
  branch?: string;
  agent?: string;
  args?: Record<string, unknown>;
  result?: "success" | "error";
  duration_ms?: number;
  context?: Record<string, unknown>;
}


// --- File Paths ---

function getObservabilityDir(): string {
  return join(getProjectRoot(), ".claude");
}

function getLogPath(): string {
  return join(getObservabilityDir(), "envoy.log");
}

// --- Ensure Directory Exists ---

function ensureObservabilityDir(): void {
  const dir = getObservabilityDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// --- String Trimming ---

/**
 * Recursively trim all strings in an object/array to max length.
 * Adds ellipsis when truncated. Handles circular references.
 */
function trimStrings(
  value: unknown,
  maxLen = MAX_LOG_STRING_LENGTH,
  visited = new WeakSet<object>()
): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > maxLen ? value.slice(0, maxLen) + "..." : value;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) return "[Circular Reference]";
    visited.add(value);
    return value.map((item) => trimStrings(item, maxLen, visited));
  }

  if (typeof value === "object") {
    if (visited.has(value)) return "[Circular Reference]";
    visited.add(value);
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = trimStrings(v, maxLen, visited);
    }
    return result;
  }

  return value;
}

// --- Logging ---

/**
 * Write a log entry to envoy.log.
 */
export function log(entry: Omit<LogEntry, "timestamp">): void {
  ensureObservabilityDir();
  const branch = getBranch() || undefined;
  const fullEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    branch,
    plan_name: getPlanName(branch),
    ...entry,
    // Trim long strings in args and context to prevent log bloat
    args: entry.args
      ? (trimStrings(entry.args) as Record<string, unknown>)
      : undefined,
    context: entry.context
      ? (trimStrings(entry.context) as Record<string, unknown>)
      : undefined,
  };
  try {
    appendFileSync(getLogPath(), JSON.stringify(fullEntry) + "\n");
  } catch {
    // Silent fail - observability should not break commands
  }
}

/**
 * Log an info-level entry.
 */
export function logInfo(
  command: string,
  context?: Record<string, unknown>,
  args?: Record<string, unknown>
): void {
  log({ level: "info", command, context, args });
}

/**
 * Log a warning-level entry.
 */
export function logWarn(
  command: string,
  context?: Record<string, unknown>,
  args?: Record<string, unknown>
): void {
  log({ level: "warn", command, context, args });
}

/**
 * Log an error-level entry.
 */
export function logError(
  command: string,
  context?: Record<string, unknown>,
  args?: Record<string, unknown>
): void {
  log({ level: "error", command, context, args });
}

/**
 * Log command start.
 */
export function logCommandStart(
  command: string,
  args?: Record<string, unknown>,
  agent?: string
): void {
  log({
    level: "info",
    command,
    agent,
    args,
    result: undefined,
    context: { phase: "start" },
  });
}

/**
 * Log command completion.
 */
export function logCommandComplete(
  command: string,
  result: "success" | "error",
  duration_ms: number,
  context?: Record<string, unknown>,
  agent?: string
): void {
  log({
    level: result === "error" ? "error" : "info",
    command,
    agent,
    result,
    duration_ms,
    context: { ...context, phase: "complete" },
  });
}

