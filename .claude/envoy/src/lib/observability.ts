/**
 * Observability system for claude-envoy.
 * Dual system: metrics.jsonl (analytics) + envoy.log (detailed traces).
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

// --- Types ---

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  command: string;
  plan_name?: string;
  branch?: string;
  caller?: string;
  args?: Record<string, unknown>;
  result?: "success" | "error";
  duration_ms?: number;
  context?: Record<string, unknown>;
}

export interface MetricEvent {
  type: string;
  timestamp: string;
  plan_name?: string;
  branch?: string;
  [key: string]: unknown;
}

// --- File Paths ---

function getObservabilityDir(): string {
  return join(getProjectRoot(), ".claude");
}

function getLogPath(): string {
  return join(getObservabilityDir(), "envoy.log");
}

function getMetricsPath(): string {
  return join(getObservabilityDir(), "metrics.jsonl");
}

// --- Ensure Directory Exists ---

function ensureObservabilityDir(): void {
  const dir = getObservabilityDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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
  args?: Record<string, unknown>
): void {
  log({
    level: "info",
    command,
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
  context?: Record<string, unknown>
): void {
  log({
    level: result === "error" ? "error" : "info",
    command,
    result,
    duration_ms,
    context: { ...context, phase: "complete" },
  });
}

// --- Metrics ---

/**
 * Append a metric event to metrics.jsonl.
 */
export function recordMetric(
  event: { type: string } & Record<string, unknown>
): void {
  ensureObservabilityDir();
  const branch = typeof event.branch === "string" ? event.branch : getBranch();
  const planName = typeof event.plan_name === "string" ? event.plan_name : getPlanName(branch);
  const fullEvent: MetricEvent = {
    ...event,
    timestamp: new Date().toISOString(),
    branch: branch || undefined,
    plan_name: planName,
  };
  try {
    appendFileSync(getMetricsPath(), JSON.stringify(fullEvent) + "\n");
  } catch {
    // Silent fail - observability should not break commands
  }
}

// --- Specific Metric Events ---

export function recordPlanCreated(data: {
  mode: string;
  prompt_count: number;
  has_variants: boolean;
  plan_name?: string;
}): void {
  recordMetric({ type: "plan_created", ...data });
}

export function recordPlanCompleted(data: {
  duration_ms: number;
  prompt_count: number;
  total_iterations: number;
  gemini_calls: number;
  plan_name?: string;
}): void {
  recordMetric({ type: "plan_completed", ...data });
}

export function recordPromptStarted(data: {
  prompt_num: number;
  variant?: string | null;
  specialist?: string;
  is_debug: boolean;
  plan_name?: string;
}): void {
  recordMetric({ type: "prompt_started", ...data });
}

export function recordPromptCompleted(data: {
  prompt_num: number;
  variant?: string | null;
  duration_ms: number;
  iterations: number;
  review_passes: number;
  plan_name?: string;
}): void {
  recordMetric({ type: "prompt_completed", ...data });
}

export function recordGateCompleted(data: {
  gate_type: string;
  duration_ms: number;
  user_refinements_count: number;
  plan_name?: string;
}): void {
  recordMetric({ type: "gate_completed", ...data });
}

export function recordGeminiCall(data: {
  endpoint: "audit" | "review" | "ask";
  duration_ms: number;
  success: boolean;
  retries: number;
  verdict?: string;
  plan_name?: string;
}): void {
  recordMetric({ type: "gemini_call", ...data });
}

export function recordOracleCall(data: {
  provider: string;
  endpoint: string;
  duration_ms: number;
  success: boolean;
  retries: number;
  verdict?: string;
  plan_name?: string;
}): void {
  recordMetric({ type: "oracle_call", ...data });
}

export function recordDiscoveryCompleted(data: {
  specialist: string;
  approach_count: number;
  variant_count: number;
  question_count: number;
  plan_name?: string;
}): void {
  recordMetric({ type: "discovery_completed", ...data });
}

export function recordDocumentationExtracted(data: {
  prompt_num: number;
  variant?: string | null;
  files_affected: number;
  plan_name?: string;
}): void {
  recordMetric({ type: "documentation_extracted", ...data });
}
