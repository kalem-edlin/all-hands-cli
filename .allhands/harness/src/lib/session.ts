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
}

const DEFAULT_SESSION: SessionState = {
  active_spec: null,
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
