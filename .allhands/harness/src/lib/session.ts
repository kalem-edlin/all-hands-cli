/**
 * Session State Management
 *
 * Persists TUI session state to .allhands/harness/.cache/session.json
 * This file is:
 * - NOT git tracked
 * - Polled by EventLoop for changes (agents can modify it)
 * - Persisted between TUI sessions
 *
 * Note: Active spec is now determined by the current git branch and
 * the spec's frontmatter.branch field. See findSpecByBranch() in specs.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { lockSync, unlockSync } from 'proper-lockfile';
import { getGitRoot } from './planning.js';

export interface SessionState {
  /** The tmux window ID where the TUI is running (e.g., @0) */
  hub_window_id: string | null;
  /** Window names spawned by this TUI session */
  spawned_windows: string[];
}

const DEFAULT_SESSION: SessionState = {
  hub_window_id: null,
  spawned_windows: [],
};

/**
 * Execute a function with file locking to prevent race conditions.
 * Uses proper-lockfile for cross-process synchronization.
 */
function withSessionLock<T>(cwd: string | undefined, fn: () => T): T {
  const sessionPath = getSessionPath(cwd);
  const cacheDir = dirname(sessionPath);

  // Ensure cache directory and file exist before locking
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  if (!existsSync(sessionPath)) {
    writeFileSync(sessionPath, JSON.stringify(DEFAULT_SESSION, null, 2));
  }

  lockSync(sessionPath);
  try {
    return fn();
  } finally {
    try {
      unlockSync(sessionPath);
    } catch {
      // Ignore unlock errors (file may have been deleted)
    }
  }
}

/**
 * Get the path to the session cache file
 */
export function getSessionPath(cwd?: string): string {
  const gitRoot = getGitRoot(cwd);
  return join(gitRoot, '.allhands', 'harness', '.cache', 'session.json');
}

/**
 * Read the current session state
 */
export function readSession(cwd?: string): SessionState {
  const sessionPath = getSessionPath(cwd);

  if (!existsSync(sessionPath)) {
    return { ...DEFAULT_SESSION };
  }

  try {
    const content = readFileSync(sessionPath, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      hub_window_id: parsed.hub_window_id ?? null,
      spawned_windows: parsed.spawned_windows ?? [],
    };
  } catch {
    return { ...DEFAULT_SESSION };
  }
}

/**
 * Write the session state
 */
export function writeSession(state: SessionState, cwd?: string): void {
  const sessionPath = getSessionPath(cwd);
  const cacheDir = dirname(sessionPath);

  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  writeFileSync(sessionPath, JSON.stringify(state, null, 2));
}

/**
 * Set the hub window ID (called at TUI startup)
 */
export function setHubWindowId(windowId: string | null, cwd?: string): void {
  withSessionLock(cwd, () => {
    const session = readSession(cwd);
    session.hub_window_id = windowId;
    writeSession(session, cwd);
  });
}

/**
 * Get the hub window ID
 */
export function getHubWindowId(cwd?: string): string | null {
  return readSession(cwd).hub_window_id;
}

/**
 * Register a spawned window (persisted to disk)
 */
export function addSpawnedWindow(windowName: string, cwd?: string): void {
  withSessionLock(cwd, () => {
    const session = readSession(cwd);
    if (!session.spawned_windows.includes(windowName)) {
      session.spawned_windows.push(windowName);
      writeSession(session, cwd);
    }
  });
}

/**
 * Unregister a spawned window (persisted to disk)
 */
export function removeSpawnedWindow(windowName: string, cwd?: string): void {
  withSessionLock(cwd, () => {
    const session = readSession(cwd);
    session.spawned_windows = session.spawned_windows.filter(w => w !== windowName);
    writeSession(session, cwd);
  });
}

/**
 * Get all spawned windows
 */
export function getSpawnedWindows(cwd?: string): string[] {
  return readSession(cwd).spawned_windows;
}

/**
 * Clear all TUI session state (called on clean exit)
 */
export function clearTuiSession(cwd?: string): void {
  withSessionLock(cwd, () => {
    const session = readSession(cwd);
    session.hub_window_id = null;
    session.spawned_windows = [];
    writeSession(session, cwd);
  });
}

