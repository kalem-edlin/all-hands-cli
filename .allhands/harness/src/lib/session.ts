/**
 * Session State Management
 *
 * Persists TUI session state to .allhands/harness/.cache/session.json
 * This file is:
 * - NOT git tracked
 * - Polled by EventLoop for changes (agents can modify it)
 * - Persisted between TUI sessions
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { getGitRoot } from './planning.js';

export interface SessionState {
  active_spec: string | null;
  /** The tmux window ID where the TUI is running (e.g., @0) */
  hub_window_id: string | null;
  /** Window names spawned by this TUI session */
  spawned_windows: string[];
}

const DEFAULT_SESSION: SessionState = {
  active_spec: null,
  hub_window_id: null,
  spawned_windows: [],
};

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
      active_spec: parsed.active_spec ?? null,
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
 * Get the currently active spec from session
 */
export function getActiveSpec(cwd?: string): string | null {
  return readSession(cwd).active_spec;
}

/**
 * Set the active spec in session
 */
export function setActiveSpec(spec: string | null, cwd?: string): void {
  const session = readSession(cwd);
  session.active_spec = spec;
  writeSession(session, cwd);
}

/**
 * Clear the active spec (set to null)
 */
export function clearActiveSpec(cwd?: string): void {
  setActiveSpec(null, cwd);
}

/**
 * Set the hub window ID (called at TUI startup)
 */
export function setHubWindowId(windowId: string | null, cwd?: string): void {
  const session = readSession(cwd);
  session.hub_window_id = windowId;
  writeSession(session, cwd);
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
  const session = readSession(cwd);
  if (!session.spawned_windows.includes(windowName)) {
    session.spawned_windows.push(windowName);
    writeSession(session, cwd);
  }
}

/**
 * Unregister a spawned window (persisted to disk)
 */
export function removeSpawnedWindow(windowName: string, cwd?: string): void {
  const session = readSession(cwd);
  session.spawned_windows = session.spawned_windows.filter(w => w !== windowName);
  writeSession(session, cwd);
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
  const session = readSession(cwd);
  session.hub_window_id = null;
  session.spawned_windows = [];
  writeSession(session, cwd);
}
