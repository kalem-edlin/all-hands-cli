/**
 * Trace Store - Dual storage for observability events
 *
 * Provides:
 * - SQLite database for structured queries
 * - JSONL file for greppable backup
 * - Payload trimming to prevent log bloat
 *
 * All events include agent context from environment variables:
 * - AGENT_ID, AGENT_TYPE, PROMPT_NUMBER, SPEC_NAME, BRANCH
 */

import { mkdirSync, appendFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';
import type BetterSqlite3 from 'better-sqlite3';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof BetterSqlite3;

// ============================================================================
// Configuration (env-configurable)
// ============================================================================

const MAX_STRING_LENGTH = parseInt(process.env.TRACE_MAX_STRING_LENGTH ?? '200', 10);
const MAX_DEPTH = parseInt(process.env.TRACE_MAX_DEPTH ?? '3', 10);
const MAX_ARRAY_ITEMS = parseInt(process.env.TRACE_MAX_ARRAY_ITEMS ?? '5', 10);
const MAX_OBJECT_KEYS = parseInt(process.env.TRACE_MAX_OBJECT_KEYS ?? '8', 10);

// ============================================================================
// Types
// ============================================================================

export type TraceEventType =
  | 'session.start'
  | 'session.end'
  | 'prompt.submit'
  | 'tool.pre'
  | 'tool.post'
  | 'tool.failure'      // Tool returned an error result
  | 'tool.denied'       // Hook denied the tool use
  | 'bash.error'        // Bash command non-zero exit
  | 'hook.start'        // Hook execution started
  | 'hook.success'      // Hook execution succeeded
  | 'hook.error'        // Hook execution failed
  | 'harness.error'     // Internal harness error
  | 'tui.action'        // TUI user action
  | 'tui.lifecycle'     // TUI lifecycle event
  | 'tui.error'         // TUI runtime error
  | 'command.start'     // CLI command started
  | 'command.success'   // CLI command succeeded
  | 'command.error'     // CLI command failed
  | 'agent.spawn'
  | 'agent.stop'
  | 'agent.compact';

/** Error event types for filtering */
export const ERROR_EVENT_TYPES: TraceEventType[] = [
  'tool.failure',
  'tool.denied',
  'bash.error',
  'hook.error',
  'harness.error',
  'tui.error',
  'command.error',
];

export interface TraceEvent {
  id?: number;
  timestamp: string;
  eventType: TraceEventType;
  agentId: string | null;
  agentType: string | null;
  promptNumber: string | null;
  specName: string | null;
  branch: string | null;
  toolName: string | null;
  viaDaemon: boolean;  // true if executed via CLI daemon, false if via tsx
  payload: Record<string, unknown>;
}

export interface TraceQueryOptions {
  agentId?: string;
  agentType?: string;
  eventType?: TraceEventType;
  toolName?: string;
  since?: string; // ISO timestamp or relative like '1h', '30m'
  limit?: number;
  offset?: number;
  errorsOnly?: boolean; // Only return error events
}

export interface TraceStats {
  totalEvents: number;
  totalErrors: number;
  byEventType: Record<string, number>;
  byAgentType: Record<string, number>;
  byToolName: Record<string, number>;
}

// ============================================================================
// Trimming Logic (similar to envoy observability)
// ============================================================================

/**
 * Truncate strings that exceed MAX_STRING_LENGTH
 */
function trimStrings(obj: unknown, seen = new WeakSet()): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    if (obj.length > MAX_STRING_LENGTH) {
      return obj.slice(0, MAX_STRING_LENGTH) + '...';
    }
    return obj;
  }

  if (typeof obj !== 'object') return obj;

  // Circular reference protection
  if (seen.has(obj as object)) return '[Circular]';
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map(item => trimStrings(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = trimStrings(value, seen);
  }
  return result;
}

/**
 * Truncate structure depth and breadth
 */
function truncateStructure(obj: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  // Circular reference protection
  if (seen.has(obj as object)) return '[Circular]';
  seen.add(obj as object);

  if (depth >= MAX_DEPTH) {
    if (Array.isArray(obj)) {
      return `[Array(${obj.length})]`;
    }
    return `[Object(${Object.keys(obj).length} keys)]`;
  }

  if (Array.isArray(obj)) {
    const truncated = obj.slice(0, MAX_ARRAY_ITEMS).map(
      item => truncateStructure(item, depth + 1, seen)
    );
    if (obj.length > MAX_ARRAY_ITEMS) {
      truncated.push(`... +${obj.length - MAX_ARRAY_ITEMS} more`);
    }
    return truncated;
  }

  const keys = Object.keys(obj);
  const result: Record<string, unknown> = {};
  const selectedKeys = keys.slice(0, MAX_OBJECT_KEYS);

  for (const key of selectedKeys) {
    result[key] = truncateStructure((obj as Record<string, unknown>)[key], depth + 1, seen);
  }

  if (keys.length > MAX_OBJECT_KEYS) {
    result['...'] = `+${keys.length - MAX_OBJECT_KEYS} more keys`;
  }

  return result;
}

/**
 * Sanitize payload for logging
 */
export function sanitizePayload(payload: unknown): Record<string, unknown> {
  const truncated = truncateStructure(payload);
  const trimmed = trimStrings(truncated);
  return (trimmed as Record<string, unknown>) ?? {};
}

// ============================================================================
// Agent Context
// ============================================================================

/**
 * Get agent context from environment variables
 */
export function getAgentContext(): Pick<TraceEvent, 'agentId' | 'agentType' | 'promptNumber' | 'specName' | 'branch' | 'viaDaemon'> {
  return {
    agentId: process.env.AGENT_ID || null,
    agentType: process.env.AGENT_TYPE || null,
    promptNumber: process.env.PROMPT_NUMBER || null,
    specName: process.env.SPEC_NAME || null,
    branch: process.env.BRANCH || null,
    viaDaemon: process.env.AH_VIA_DAEMON === '1',
  };
}

// ============================================================================
// Storage Paths
// ============================================================================

/**
 * Get the project root directory.
 * Uses CLAUDE_PROJECT_DIR if set (by Claude Code), otherwise falls back to cwd.
 */
function getProjectRoot(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function getStoragePaths(cwd?: string): { dbPath: string; jsonlPath: string } {
  const base = cwd || getProjectRoot();
  const cacheDir = join(base, '.allhands', 'harness', '.cache', 'trace');

  return {
    dbPath: join(cacheDir, 'trace.db'),
    jsonlPath: join(cacheDir, 'trace.jsonl'),
  };
}

// ============================================================================
// SQLite Database
// ============================================================================

// Cache databases by path to support multiple projects in same process
const dbCache = new Map<string, BetterSqlite3.Database>();

function getDb(cwd?: string): BetterSqlite3.Database {
  const { dbPath } = getStoragePaths(cwd);

  // Return cached connection for this path
  const cached = dbCache.get(dbPath);
  if (cached) return cached;

  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      agent_id TEXT,
      agent_type TEXT,
      prompt_number TEXT,
      spec_name TEXT,
      branch TEXT,
      tool_name TEXT,
      is_error INTEGER DEFAULT 0,
      via_daemon INTEGER DEFAULT 0,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_agent_type ON events(agent_type);
    CREATE INDEX IF NOT EXISTS idx_events_tool_name ON events(tool_name);
    CREATE INDEX IF NOT EXISTS idx_events_is_error ON events(is_error);
  `);

  dbCache.set(dbPath, db);
  return db;
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Check if an event type is an error type
 */
function isErrorEvent(eventType: TraceEventType): boolean {
  return ERROR_EVENT_TYPES.includes(eventType);
}

/**
 * Log a trace event to both SQLite and JSONL
 */
export function logEvent(
  eventType: TraceEventType,
  payload: Record<string, unknown>,
  toolName?: string,
  cwd?: string
): void {
  const context = getAgentContext();
  const timestamp = new Date().toISOString();
  const sanitizedPayload = sanitizePayload(payload);
  const isError = isErrorEvent(eventType) ? 1 : 0;

  const event = {
    timestamp,
    eventType,
    ...context,
    toolName: toolName || null,
    isError: isError === 1,
    payload: sanitizedPayload,
  };

  // Write to SQLite
  try {
    const database = getDb(cwd);
    const stmt = database.prepare(`
      INSERT INTO events (timestamp, event_type, agent_id, agent_type, prompt_number, spec_name, branch, tool_name, is_error, via_daemon, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.timestamp,
      event.eventType,
      event.agentId,
      event.agentType,
      event.promptNumber,
      event.specName,
      event.branch,
      event.toolName,
      isError,
      event.viaDaemon ? 1 : 0,
      JSON.stringify(event.payload)
    );
  } catch (err) {
    // Silent failure - don't break the hook
    console.error(`[trace-store] SQLite write error: ${err}`);
  }

  // Write to JSONL
  try {
    const { jsonlPath } = getStoragePaths(cwd);
    mkdirSync(dirname(jsonlPath), { recursive: true });
    appendFileSync(jsonlPath, JSON.stringify(event) + '\n');
  } catch (err) {
    // Silent failure
    console.error(`[trace-store] JSONL write error: ${err}`);
  }
}

/**
 * Log a harness internal error
 * Use this for errors that occur within the harness itself (not tool failures)
 */
export function logHarnessError(
  error: Error | string,
  context: Record<string, unknown> = {},
  cwd?: string
): void {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  logEvent('harness.error', {
    error: errorMessage,
    stack: errorStack,
    ...context,
  }, undefined, cwd);
}

/**
 * Log a hook execution error
 */
export function logHookError(
  hookName: string,
  error: Error | string,
  input?: Record<string, unknown>,
  cwd?: string
): void {
  const errorMessage = error instanceof Error ? error.message : error;

  logEvent('hook.error', {
    hook: hookName,
    error: errorMessage,
    input: input ? sanitizePayload(input) : undefined,
  }, undefined, cwd);
}

/**
 * Log a TUI runtime error
 * Use this for errors that occur within the TUI (e.g., rendering, modal handling, agent spawning)
 */
export function logTuiError(
  component: string,
  error: Error | string,
  context: Record<string, unknown> = {},
  cwd?: string
): void {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  logEvent('tui.error', {
    component,
    error: errorMessage,
    stack: errorStack,
    ...context,
  }, undefined, cwd);
}

/**
 * Log CLI command start
 * Use this at the beginning of important CLI commands (specs, prompts, etc.)
 */
export function logCommandStart(
  command: string,
  args: Record<string, unknown> = {},
  cwd?: string
): void {
  logEvent('command.start', {
    command,
    args: sanitizePayload(args),
  }, undefined, cwd);
}

/**
 * Log CLI command success
 * Use this when a CLI command completes successfully
 */
export function logCommandSuccess(
  command: string,
  result: Record<string, unknown> = {},
  cwd?: string
): void {
  logEvent('command.success', {
    command,
    result: sanitizePayload(result),
  }, undefined, cwd);
}

/**
 * Log CLI command error
 * Use this when a CLI command fails
 */
export function logCommandError(
  command: string,
  error: Error | string,
  args: Record<string, unknown> = {},
  cwd?: string
): void {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  logEvent('command.error', {
    command,
    error: errorMessage,
    stack: errorStack,
    args: sanitizePayload(args),
  }, undefined, cwd);
}

// ============================================================================
// Hook Logging
// ============================================================================

/**
 * Log hook execution start
 * Use this at the beginning of hook handlers
 */
export function logHookStart(
  hookName: string,
  input: Record<string, unknown> = {},
  cwd?: string
): void {
  logEvent('hook.start', {
    hook: hookName,
    input: sanitizePayload(input),
  }, undefined, cwd);
}

/**
 * Log hook execution success
 * Use this when a hook completes successfully
 */
export function logHookSuccess(
  hookName: string,
  result: Record<string, unknown> = {},
  cwd?: string
): void {
  logEvent('hook.success', {
    hook: hookName,
    result: sanitizePayload(result),
  }, undefined, cwd);
}

// ============================================================================
// TUI Logging
// ============================================================================

/**
 * Log TUI user action
 * Use this when user performs an action in the TUI
 */
export function logTuiAction(
  action: string,
  data: Record<string, unknown> = {},
  cwd?: string
): void {
  logEvent('tui.action', {
    action,
    ...sanitizePayload(data),
  }, undefined, cwd);
}

/**
 * Log TUI lifecycle event
 * Use this for TUI state changes and lifecycle events
 */
export function logTuiLifecycle(
  event: string,
  data: Record<string, unknown> = {},
  cwd?: string
): void {
  logEvent('tui.lifecycle', {
    event,
    ...sanitizePayload(data),
  }, undefined, cwd);
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Parse relative time strings like '1h', '30m', '2d'
 */
function parseRelativeTime(input: string): Date {
  const now = new Date();
  const match = input.match(/^(\d+)([smhd])$/);

  if (!match) {
    // Try parsing as ISO timestamp
    const date = new Date(input);
    if (!isNaN(date.getTime())) return date;
    throw new Error(`Invalid time format: ${input}`);
  }

  const [, num, unit] = match;
  const value = parseInt(num, 10);

  switch (unit) {
    case 's': return new Date(now.getTime() - value * 1000);
    case 'm': return new Date(now.getTime() - value * 60 * 1000);
    case 'h': return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'd': return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    default: throw new Error(`Invalid time unit: ${unit}`);
  }
}

/**
 * Query events with filters
 */
export function queryEvents(options: TraceQueryOptions = {}, cwd?: string): (TraceEvent & { isError?: boolean })[] {
  const database = getDb(cwd);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.agentId) {
    conditions.push('agent_id = ?');
    params.push(options.agentId);
  }

  if (options.agentType) {
    conditions.push('agent_type = ?');
    params.push(options.agentType);
  }

  if (options.eventType) {
    conditions.push('event_type = ?');
    params.push(options.eventType);
  }

  if (options.toolName) {
    conditions.push('tool_name = ?');
    params.push(options.toolName);
  }

  if (options.since) {
    const sinceDate = parseRelativeTime(options.since);
    conditions.push('timestamp >= ?');
    params.push(sinceDate.toISOString());
  }

  if (options.errorsOnly) {
    conditions.push('is_error = 1');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const sql = `
    SELECT * FROM events
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const rows = database.prepare(sql).all(...params) as Array<{
    id: number;
    timestamp: string;
    event_type: string;
    agent_id: string | null;
    agent_type: string | null;
    prompt_number: string | null;
    spec_name: string | null;
    branch: string | null;
    tool_name: string | null;
    is_error: number;
    via_daemon: number;
    payload: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    eventType: row.event_type as TraceEventType,
    agentId: row.agent_id,
    agentType: row.agent_type,
    promptNumber: row.prompt_number,
    specName: row.spec_name,
    branch: row.branch,
    toolName: row.tool_name,
    isError: row.is_error === 1,
    viaDaemon: row.via_daemon === 1,
    payload: JSON.parse(row.payload),
  }));
}

/**
 * Get aggregate statistics
 */
export function getStats(since?: string, cwd?: string): TraceStats {
  const database = getDb(cwd);

  let whereClause = '';
  const params: unknown[] = [];

  if (since) {
    const sinceDate = parseRelativeTime(since);
    whereClause = 'WHERE timestamp >= ?';
    params.push(sinceDate.toISOString());
  }

  // Total count
  const totalRow = database.prepare(`SELECT COUNT(*) as count FROM events ${whereClause}`).get(...params) as { count: number };

  // Error count
  const errorWhereClause = whereClause ? `${whereClause} AND is_error = 1` : 'WHERE is_error = 1';
  const errorRow = database.prepare(`SELECT COUNT(*) as count FROM events ${errorWhereClause}`).get(...params) as { count: number };

  // By event type
  const eventTypeRows = database.prepare(`
    SELECT event_type, COUNT(*) as count FROM events ${whereClause} GROUP BY event_type
  `).all(...params) as Array<{ event_type: string; count: number }>;

  // By agent type
  const agentTypeWhereClause = whereClause
    ? `${whereClause} AND agent_type IS NOT NULL`
    : 'WHERE agent_type IS NOT NULL';
  const agentTypeRows = database.prepare(`
    SELECT agent_type, COUNT(*) as count FROM events ${agentTypeWhereClause} GROUP BY agent_type
  `).all(...params) as Array<{ agent_type: string; count: number }>;

  // By tool name
  const toolNameWhereClause = whereClause
    ? `${whereClause} AND tool_name IS NOT NULL`
    : 'WHERE tool_name IS NOT NULL';
  const toolNameRows = database.prepare(`
    SELECT tool_name, COUNT(*) as count FROM events ${toolNameWhereClause} GROUP BY tool_name
  `).all(...params) as Array<{ tool_name: string; count: number }>;

  return {
    totalEvents: totalRow.count,
    totalErrors: errorRow.count,
    byEventType: Object.fromEntries(eventTypeRows.map(r => [r.event_type, r.count])),
    byAgentType: Object.fromEntries(agentTypeRows.map(r => [r.agent_type, r.count])),
    byToolName: Object.fromEntries(toolNameRows.map(r => [r.tool_name, r.count])),
  };
}

/**
 * Close all database connections (for cleanup)
 */
export function closeDb(): void {
  Array.from(dbCache.values()).forEach((db) => db.close());
  dbCache.clear();
}

/**
 * Clear all trace logs (both SQLite database and JSONL file)
 */
export function clearLogs(cwd?: string): void {
  const { jsonlPath } = getStoragePaths(cwd);

  // Clear SQLite database
  try {
    const database = getDb(cwd);
    database.exec('DELETE FROM events');
  } catch (err) {
    console.error(`[trace-store] SQLite clear error: ${err}`);
  }

  // Clear JSONL file by truncating it
  try {
    if (existsSync(jsonlPath)) {
      writeFileSync(jsonlPath, '');
    }
  } catch (err) {
    console.error(`[trace-store] JSONL clear error: ${err}`);
  }
}
