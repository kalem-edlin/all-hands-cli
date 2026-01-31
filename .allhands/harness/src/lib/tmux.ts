/**
 * Tmux Integration
 *
 * Manages tmux sessions and windows for agent spawning.
 *
 * Session Structure:
 * - Session: ah-hub (standardized name)
 * - Window 0: TUI (main control)
 * - Window 1+: Agent windows (coordinator, planner, executor, etc.)
 *
 * Startup Logic:
 * 1. Check if tmux is available (fail with error if not)
 * 2. If NOT in tmux: Create new session with user-provided name
 * 3. If in tmux with multiple windows: Ask to create new session or use current
 * 4. If in tmux with single window: Use current session
 * 5. Rename active session to "ah-hub"
 *
 * Environment Variables passed to agents:
 * - AGENT_ID: Unique agent identifier (= window name, used for MCP daemon isolation)
 * - AGENT_TYPE: executor, coordinator, planner, judge, ideation, pr-reviewer
 * - PROMPT_NUMBER: Current prompt number (when applicable)
 * - SPEC_NAME: Current spec name
 * - BRANCH: Current git branch
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import {
  buildAgentInvocation,
  listAgentProfiles,
  loadAgentProfile,
  type TemplateContext
} from './opencode/index.js';
import { getCurrentBranch, getPlanningPaths } from './planning.js';
import { getBaseBranch } from './git.js';
import { addSpawnedWindow, removeSpawnedWindow, getSpawnedWindows } from './session.js';
import { loadProjectSettings } from '../hooks/shared.js';
import { getSpecForBranch } from './specs.js';

/**
 * Agent type = agent profile name.
 * Derived from .allhands/agents/*.yaml profile files.
 */
export type AgentType = string;

export interface AgentEnv {
  AGENT_ID: string;
  AGENT_TYPE: AgentType;
  PROMPT_NUMBER?: string;
  SPEC_NAME?: string;
  BRANCH: string;
}

export interface SpawnConfig {
  name: string;
  agentType: AgentType;
  flowPath: string;
  preamble?: string;
  promptNumber?: number;
  specName?: string;
  nonCoding?: boolean;
  /** If true, switch focus to the new window after spawning (default: true for TUI actions) */
  focusWindow?: boolean;
  /**
   * If true, this agent is scoped to a specific prompt and can have multiple
   * instances running concurrently (one per prompt).
   * Prompt-scoped agents include the prompt number in their ID (e.g., "executor-01").
   * Non-prompt-scoped agents use their name as AGENT_ID and only one can run at a time.
   */
  promptScoped?: boolean;
}

export interface SessionContext {
  inTmux: boolean;
  currentSession: string | null;
  windowCount: number;
}

export interface SessionSetupResult {
  sessionName: string;
  isNew: boolean;
}

export const SESSION_NAME = 'ah-hub';

/**
 * In-memory cache of agents spawned by ALL HANDS.
 * Also persisted to session.json for cross-process visibility.
 */
const spawnedAgentRegistry = new Set<string>();

/**
 * Clean up old launcher scripts (older than 24 hours)
 */
function cleanupOldLaunchers(launcherDir: string): void {
  if (!existsSync(launcherDir)) return;

  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();

  try {
    const files = readdirSync(launcherDir);
    for (const file of files) {
      if (!file.endsWith('-launcher.sh') && !file.endsWith('-prompt.txt')) continue;

      const filePath = join(launcherDir, file);
      try {
        const stat = statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          unlinkSync(filePath);
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Register an agent as spawned by ALL HANDS (persisted to disk)
 */
export function registerSpawnedAgent(windowName: string, cwd?: string): void {
  spawnedAgentRegistry.add(windowName);
  addSpawnedWindow(windowName, cwd);
}

/**
 * Unregister an agent (persisted to disk)
 */
export function unregisterSpawnedAgent(windowName: string, cwd?: string): void {
  spawnedAgentRegistry.delete(windowName);
  removeSpawnedWindow(windowName, cwd);
}

/**
 * Check if an agent was spawned by ALL HANDS
 */
export function isSpawnedAgent(windowName: string, cwd?: string): boolean {
  // Check both in-memory cache and persisted state
  if (spawnedAgentRegistry.has(windowName)) return true;
  return getSpawnedWindows(cwd).includes(windowName);
}

/**
 * Get all registered spawned agents (from persisted state)
 */
export function getSpawnedAgentRegistry(cwd?: string): Set<string> {
  // Merge in-memory and persisted for complete view
  const persisted = getSpawnedWindows(cwd);
  return new Set([...spawnedAgentRegistry, ...persisted]);
}

/**
 * Get current tmux window ID (stable identifier like @0)
 */
export function getCurrentWindowId(): string | null {
  if (!process.env.TMUX) return null;
  try {
    return execSync('tmux display-message -p "#{window_id}"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get current tmux context (are we in tmux, which session, how many windows)
 */
export function getTmuxContext(): SessionContext {
  const inTmux = !!process.env.TMUX;

  if (!inTmux) {
    return { inTmux: false, currentSession: null, windowCount: 0 };
  }

  try {
    const currentSession = execSync('tmux display-message -p "#S"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const windowList = execSync(
      `tmux list-windows -t "${currentSession}" -F "#{window_index}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const windowCount = windowList.trim().split('\n').filter((l) => l).length;

    return { inTmux: true, currentSession, windowCount };
  } catch {
    return { inTmux: true, currentSession: null, windowCount: 0 };
  }
}

/**
 * Check if tmux needs to prompt user for session decision
 * Returns: 'create-new' | 'use-current' | 'no-prompt-needed'
 */
export function getSessionDecision(context: SessionContext): 'create-new' | 'use-current' | 'no-prompt-needed' {
  if (!context.inTmux) {
    // Not in tmux - will need to create new
    return 'create-new';
  }

  if (context.windowCount > 1) {
    // Multiple windows - should ask user
    // This will be handled by TUI prompting
    return 'create-new'; // Default to create-new, TUI can override
  }

  // Single window in tmux - use current
  return 'use-current';
}

/**
 * Rename current session to ah-hub
 */
export function renameCurrentSession(): void {
  try {
    execSync(`tmux rename-session "${SESSION_NAME}"`, { stdio: 'pipe' });
  } catch {
    // Session might already be named this
  }
}

/**
 * Create a new tmux session and attach to it
 */
export function createNewSession(sessionName: string, cwd?: string): void {
  const cwdArg = cwd ? `-c "${cwd}"` : '';
  execSync(`tmux new-session -d -s "${sessionName}" ${cwdArg}`, { stdio: 'pipe' });
}

/**
 * Setup TUI session with the new logic
 *
 * @param promptForNewSession - Callback to ask user if they want a new session
 * @param promptForSessionName - Callback to get session name from user
 * @param cwd - Working directory
 * @returns Session setup result
 */
export async function setupTUISession(
  promptForNewSession: () => Promise<boolean>,
  promptForSessionName: () => Promise<string>,
  cwd?: string
): Promise<SessionSetupResult> {
  // Step 1: Check tmux availability
  if (!isTmuxInstalled()) {
    throw new Error('tmux is required but not found. Please install tmux and try again.');
  }

  const context = getTmuxContext();

  // Step 2: Determine session strategy
  if (!context.inTmux) {
    // Not in tmux - create new session
    const name = await promptForSessionName();
    createNewSession(name, cwd);
    // Attach and rename
    execSync(`tmux rename-session -t "${name}" "${SESSION_NAME}"`, { stdio: 'pipe' });
    return { sessionName: SESSION_NAME, isNew: true };
  }

  if (context.windowCount > 1) {
    // Multiple windows - ask user
    const wantNew = await promptForNewSession();
    if (wantNew) {
      const name = await promptForSessionName();
      createNewSession(name, cwd);
      execSync(`tmux rename-session -t "${name}" "${SESSION_NAME}"`, { stdio: 'pipe' });
      // Switch to new session
      execSync(`tmux switch-client -t "${SESSION_NAME}"`, { stdio: 'pipe' });
      return { sessionName: SESSION_NAME, isNew: true };
    }
  }

  // Use current session - just rename it
  renameCurrentSession();
  return { sessionName: SESSION_NAME, isNew: false };
}

/**
 * Get the session name for the current branch (legacy - kept for compatibility)
 */
export function getSessionName(branch?: string): string {
  // Now always returns ah-hub for active session
  return SESSION_NAME;
}

/**
 * Check if tmux is installed
 */
export function isTmuxInstalled(): boolean {
  try {
    execSync('which tmux', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a tmux session exists
 */
export function sessionExists(sessionName: string): boolean {
  try {
    execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new tmux session
 */
export function createSession(sessionName: string, cwd?: string): void {
  const cwdArg = cwd ? `-c "${cwd}"` : '';
  execSync(`tmux new-session -d -s "${sessionName}" ${cwdArg}`, { stdio: 'pipe' });
}

/**
 * Get the current tmux session name (if inside tmux)
 */
export function getCurrentSession(): string | null {
  if (!process.env.TMUX) {
    return null;
  }

  try {
    return execSync('tmux display-message -p "#S"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Ensure session exists, creating if necessary
 *
 * IMPORTANT: If already inside tmux, uses the CURRENT session.
 * Only creates a new session if not inside tmux.
 */
export function ensureSession(branch?: string, cwd?: string): string {
  // If we're already in tmux, use the current session
  const currentSession = getCurrentSession();
  if (currentSession) {
    return currentSession;
  }

  // Not in tmux - check if our target session exists, or create it
  const sessionName = getSessionName(branch);

  if (!sessionExists(sessionName)) {
    createSession(sessionName, cwd);
  }

  return sessionName;
}

/**
 * List windows in a session
 */
export function listWindows(sessionName: string): Array<{ index: number; name: string; id: string }> {
  try {
    const output = execSync(
      `tmux list-windows -t "${sessionName}" -F "#{window_index}:#{window_name}:#{window_id}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    return output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(':');
        const index = parseInt(parts[0], 10);
        const name = parts[1];
        const id = parts[2] || '';
        return { index, name, id };
      });
  } catch {
    return [];
  }
}

/**
 * Check if a window with given name exists
 */
export function windowExists(sessionName: string, windowName: string): boolean {
  const windows = listWindows(sessionName);
  return windows.some((w) => w.name === windowName);
}

/**
 * Create a new window in the session
 *
 * @param sessionName - Target session
 * @param windowName - Name for the new window
 * @param cwd - Working directory
 * @param detached - If true, don't switch focus to new window (default: true)
 */
export function createWindow(
  sessionName: string,
  windowName: string,
  cwd?: string,
  detached: boolean = true
): number {
  const cwdArg = cwd ? `-c "${cwd}"` : '';
  const detachArg = detached ? '-d' : '';
  execSync(`tmux new-window ${detachArg} -t "${sessionName}" -n "${windowName}" ${cwdArg}`, {
    stdio: 'pipe',
  });

  // Get the new window's index
  const windows = listWindows(sessionName);
  const window = windows.find((w) => w.name === windowName);
  return window?.index ?? -1;
}

/**
 * Kill a window by name
 */
export function killWindow(sessionName: string, windowName: string): boolean {
  try {
    execSync(`tmux kill-window -t "${sessionName}:${windowName}"`, { stdio: 'pipe' });
    // Unregister from ALL HANDS tracking
    unregisterSpawnedAgent(windowName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send keys to a window
 */
export function sendKeys(sessionName: string, windowName: string, keys: string): void {
  execSync(`tmux send-keys -t "${sessionName}:${windowName}" "${keys}" Enter`, {
    stdio: 'pipe',
  });
}

/**
 * Capture window output
 */
export function capturePane(
  sessionName: string,
  windowName: string,
  lines: number = 100
): string {
  try {
    return execSync(
      `tmux capture-pane -t "${sessionName}:${windowName}" -p -S -${lines}`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch {
    return '';
  }
}

/**
 * Select/focus a window
 */
export function selectWindow(sessionName: string, windowName: string): void {
  execSync(`tmux select-window -t "${sessionName}:${windowName}"`, { stdio: 'pipe' });
}

/**
 * Rename the current window
 */
export function renameCurrentWindow(newName: string): void {
  if (!process.env.TMUX) return;
  try {
    execSync(`tmux rename-window "${newName}"`, { stdio: 'pipe' });
  } catch {
    // Ignore errors
  }
}

/**
 * Rename a specific window by ID (stable even if focus changes)
 * Falls back to renaming current window if no target specified
 */
export function renameWindow(targetWindowId: string | null, newName: string): void {
  if (!process.env.TMUX) return;
  try {
    if (targetWindowId) {
      // Use -t to target the specific window by ID
      execSync(`tmux rename-window -t "${targetWindowId}" "${newName}"`, { stdio: 'pipe' });
    } else {
      // Fallback to current window
      execSync(`tmux rename-window "${newName}"`, { stdio: 'pipe' });
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Build the window name for an agent.
 *
 * Non-prompt-scoped agents use their name directly (e.g., "planner").
 * Prompt-scoped agents include the prompt number (e.g., "executor-01").
 */
export function buildWindowName(config: SpawnConfig): string {
  if (!config.promptScoped) {
    return config.name;
  }

  // Prompt-scoped agents include prompt number
  if (config.promptNumber !== undefined) {
    return `${config.name}-${String(config.promptNumber).padStart(2, '0')}`;
  }

  // Fallback: use name as-is
  return config.name;
}

/**
 * Build environment variables for agent
 */
export function buildAgentEnv(config: SpawnConfig, branch: string, windowName: string): Record<string, string> {
  // Note: BASE_BRANCH is communicated via the initial prompt, not env vars
  const env: Record<string, string> = {
    AGENT_ID: windowName, // Window name = AGENT_ID (used for MCP daemon isolation)
    AGENT_TYPE: config.agentType,
    BRANCH: branch,
  };

  if (config.promptScoped) {
    env.PROMPT_SCOPED = 'true';

    // Set autocompact threshold for prompt-scoped agents only
    const settings = loadProjectSettings();
    const autocompactAt = settings?.spawn?.promptScopedAutocompactAt ?? 65;
    env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = String(autocompactAt);
  }

  if (config.promptNumber !== undefined) {
    env.PROMPT_NUMBER = String(config.promptNumber).padStart(2, '0');
  }

  if (config.specName) {
    env.SPEC_NAME = config.specName;
  }

  return env;
}

/**
 * Spawn a Claude Code agent in a tmux window
 *
 * This creates a new window and runs `claude` with the appropriate
 * flow and configuration.
 *
 * @param config - Agent spawn configuration
 * @param branch - Git branch (defaults to current)
 * @param cwd - Working directory
 * @returns Session and window names
 * @throws Error if non-prompt-scoped agent already exists
 *
 * Window naming:
 * - Non-prompt-scoped agents use name directly (e.g., "planner")
 * - Prompt-scoped agents include prompt number (e.g., "executor-01")
 *
 * The window name becomes the AGENT_ID for MCP daemon isolation.
 *
 * Window focus behavior:
 * - config.focusWindow = true (default): Switch to the new window after spawning
 * - config.focusWindow = false: Create window in background (for loop-spawned executors)
 */
export function spawnAgent(
  config: SpawnConfig,
  branch?: string,
  cwd?: string
): { sessionName: string; windowName: string } {
  const currentBranch = branch || getCurrentBranch();
  const sessionName = ensureSession(currentBranch, cwd);
  const windowName = buildWindowName(config);
  const shouldFocus = config.focusWindow !== false; // Default to true

  // Non-prompt-scoped agent enforcement: fail if already running
  if (!config.promptScoped && windowExists(sessionName, windowName)) {
    throw new Error(
      `Agent "${windowName}" is already running. Only one instance of non-prompt-scoped agents is allowed.`
    );
  }

  // Kill existing window if present (for prompt-scoped agents being restarted)
  if (windowExists(sessionName, windowName)) {
    killWindow(sessionName, windowName);
  }

  // Create new window (detached - don't switch focus yet)
  createWindow(sessionName, windowName, cwd, true);

  // Register this agent as spawned by ALL HANDS
  registerSpawnedAgent(windowName);

  // Build environment variables for the agent
  const env = buildAgentEnv(config, currentBranch, windowName);

  // Read the flow file content directly instead of referencing it
  let flowContent = '';
  if (existsSync(config.flowPath)) {
    flowContent = readFileSync(config.flowPath, 'utf-8');
  }

  // Write a launcher script to avoid all shell escaping issues
  const tempDir = join(cwd || process.cwd(), '.allhands', 'harness', '.cache', 'launchers');
  mkdirSync(tempDir, { recursive: true });

  // Clean up old launcher files (older than 24h)
  cleanupOldLaunchers(tempDir);

  const launcherScript = join(tempDir, `${windowName}-launcher.sh`);
  const promptFile = join(tempDir, `${windowName}-prompt.txt`);

  // Build combined prompt: flow content + preamble + base branch info
  // NO system prompt - everything goes into the initial user prompt
  const baseBranch = getBaseBranch();
  const promptParts: string[] = [];

  if (flowContent) {
    promptParts.push(flowContent);
  }

  if (config.preamble && config.preamble.trim()) {
    promptParts.push(config.preamble);
  }

  // Always append base branch info
  promptParts.push(`The base branch name is "${baseBranch}".`);

  const combinedPrompt = promptParts.join('\n\n');
  writeFileSync(promptFile, combinedPrompt, 'utf-8');

  // Build the launcher script
  const scriptLines: string[] = ['#!/bin/bash', ''];

  // Skip pyenv rehash to avoid lock contention when spawning multiple agents
  scriptLines.push('export PYENV_REHASH_SKIP=1');

  // Export environment variables
  for (const [key, value] of Object.entries(env)) {
    scriptLines.push(`export ${key}="${value}"`);
  }
  scriptLines.push('');

  // Build claude command - NO system prompt, everything in initial prompt
  const cmdParts: string[] = ['claude'];
  cmdParts.push('--settings .claude/settings.json');
  cmdParts.push('--dangerously-skip-permissions');
  cmdParts.push(`"$(cat '${promptFile}')"`)

  scriptLines.push(cmdParts.join(' \\\n  '));

  writeFileSync(launcherScript, scriptLines.join('\n'), { mode: 0o755 });

  // Execute the launcher script with exec so it replaces the shell.
  // This ensures the window closes when claude exits (no orphan shell).
  sendKeys(sessionName, windowName, `exec bash '${launcherScript}'`);

  // Switch focus to the new window if requested (default for TUI actions)
  if (shouldFocus) {
    selectWindow(sessionName, windowName);
  }

  return { sessionName, windowName };
}

/**
 * Configuration for profile-based agent spawning
 */
export interface ProfileSpawnConfig {
  /** Agent profile name (must exist in .allhands/agents/) */
  agentName: string;
  /** Template context for variable resolution */
  context: TemplateContext;
  /** Optional prompt number for prompt-scoped agents */
  promptNumber?: number;
  /** If true, switch focus to the new window (default: true) */
  focusWindow?: boolean;
  /** Optional flow path override — when provided, use this instead of the profile's default flow */
  flowOverride?: string;
}

/**
 * Spawn an agent using its profile definition
 *
 * This is the preferred way to spawn agents. It:
 * 1. Loads the agent profile
 * 2. Validates required template variables
 * 3. Resolves the message template
 * 4. Spawns the agent with proper configuration
 *
 * @param config - Profile spawn configuration
 * @param branch - Git branch (defaults to current)
 * @param cwd - Working directory
 * @returns Session and window names
 * @throws Error if profile not found, validation fails, or non-prompt-scoped agent already exists
 */
export function spawnAgentFromProfile(
  config: ProfileSpawnConfig,
  branch?: string,
  cwd?: string
): { sessionName: string; windowName: string } {
  const profile = loadAgentProfile(config.agentName);

  if (!profile) {
    const available = listAgentProfiles();
    throw new Error(
      `Agent profile not found: ${config.agentName}. Available profiles: ${available.join(', ')}`
    );
  }

  // Build the invocation (validates template vars)
  const invocation = buildAgentInvocation(profile, config.context);

  // Convert to SpawnConfig (flowOverride takes precedence over profile's default flow)
  const spawnConfig: SpawnConfig = {
    name: profile.name,
    agentType: profile.name,
    flowPath: config.flowOverride || invocation.flowPath,
    preamble: invocation.preamble,
    promptNumber: config.promptNumber,
    specName: config.context.SPEC_NAME ?? undefined,
    nonCoding: profile.nonCoding,
    focusWindow: config.focusWindow,
    promptScoped: profile.promptScoped,
  };

  return spawnAgent(spawnConfig, branch, cwd);
}

/**
 * Configuration for custom flow spawning
 */
export interface CustomFlowConfig {
  /** Absolute path to the flow file */
  flowPath: string;
  /** Custom message to use as system prompt/preamble */
  customMessage: string;
  /** Unique window name (e.g., "custom-flow-1") */
  windowName: string;
  /** If true, switch focus to the new window (default: true) */
  focusWindow?: boolean;
  /** Current spec name (optional, for context) */
  specName?: string;
}

/**
 * Spawn a custom flow agent
 *
 * This allows running any flow file with a custom message as the preamble.
 * The agent is tracked like profiled agents but without profile restrictions.
 *
 * @param config - Custom flow configuration
 * @param branch - Git branch (defaults to current)
 * @param cwd - Working directory
 * @returns Session and window names
 */
export function spawnCustomFlow(
  config: CustomFlowConfig,
  branch?: string,
  cwd?: string
): { sessionName: string; windowName: string } {
  const currentBranch = branch || getCurrentBranch();
  const sessionName = ensureSession(currentBranch, cwd);
  const windowName = config.windowName;
  const shouldFocus = config.focusWindow !== false;

  // Kill existing window if present (allow respawning)
  if (windowExists(sessionName, windowName)) {
    killWindow(sessionName, windowName);
  }

  // Create new window (detached - don't switch focus yet)
  createWindow(sessionName, windowName, cwd, true);

  // Register this agent as spawned by ALL HANDS
  registerSpawnedAgent(windowName);

  // Build environment variables for the custom flow agent
  // Note: BASE_BRANCH is communicated via the initial prompt, not env vars
  const env: Record<string, string> = {
    AGENT_ID: windowName,
    AGENT_TYPE: 'custom-flow',
    BRANCH: currentBranch,
  };

  if (config.specName) {
    env.SPEC_NAME = config.specName;
  }

  // Read the flow file content
  let flowContent = '';
  if (existsSync(config.flowPath)) {
    flowContent = readFileSync(config.flowPath, 'utf-8');
  }

  // Write a launcher script to avoid all shell escaping issues
  const tempDir = join(cwd || process.cwd(), '.allhands', 'harness', '.cache', 'launchers');
  mkdirSync(tempDir, { recursive: true });

  // Clean up old launcher files (older than 24h)
  cleanupOldLaunchers(tempDir);

  const launcherScript = join(tempDir, `${windowName}-launcher.sh`);
  const promptFile = join(tempDir, `${windowName}-prompt.txt`);

  // Build combined prompt: flow content + custom message + base branch info
  // NO system prompt - everything goes into the initial user prompt
  const baseBranch = getBaseBranch();
  const promptParts: string[] = [];

  if (flowContent) {
    promptParts.push(flowContent);
  }

  if (config.customMessage && config.customMessage.trim()) {
    promptParts.push(config.customMessage);
  }

  // Always append base branch info
  promptParts.push(`The base branch name is "${baseBranch}".`);

  const combinedPrompt = promptParts.join('\n\n');
  writeFileSync(promptFile, combinedPrompt, 'utf-8');

  // Build the launcher script
  const scriptLines: string[] = ['#!/bin/bash', ''];

  // Skip pyenv rehash to avoid lock contention when spawning multiple agents
  scriptLines.push('export PYENV_REHASH_SKIP=1');

  // Export environment variables
  for (const [key, value] of Object.entries(env)) {
    scriptLines.push(`export ${key}="${value}"`);
  }
  scriptLines.push('');

  // Build claude command - NO system prompt, everything in initial prompt
  const cmdParts: string[] = ['claude'];
  cmdParts.push('--settings .claude/settings.json');
  cmdParts.push('--dangerously-skip-permissions');
  cmdParts.push(`"$(cat '${promptFile}')"`)

  scriptLines.push(cmdParts.join(' \\\n  '));

  writeFileSync(launcherScript, scriptLines.join('\n'), { mode: 0o755 });

  // Execute the launcher script with exec so it replaces the shell
  sendKeys(sessionName, windowName, `exec bash '${launcherScript}'`);

  // Switch focus to the new window if requested
  if (shouldFocus) {
    selectWindow(sessionName, windowName);
  }

  return { sessionName, windowName };
}

/**
 * Build standard template context from planning state
 *
 * This constructs the context object needed for agent spawning
 * by reading the current planning state.
 *
 * @param spec - The spec name (used for planning paths)
 * @param specName - Optional display name for spec
 * @param promptNumber - Optional prompt number
 * @param promptPath - Optional prompt file path
 * @param cwd - Working directory
 */
export function buildTemplateContext(
  spec: string,
  specName?: string,
  promptNumber?: number,
  promptPath?: string,
  cwd?: string
): TemplateContext {
  // Use spec for planning paths (directory key)
  const paths = getPlanningPaths(spec, cwd);
  const branch = getCurrentBranch(cwd);

  // Resolve spec type for SPEC_TYPE template variable
  const branchSpec = getSpecForBranch(branch, cwd);

  const context: TemplateContext = {
    BRANCH: branch,
    PLANNING_FOLDER: paths.root,
    PROMPTS_FOLDER: paths.prompts,
    ALIGNMENT_PATH: paths.alignment,
    OUTPUT_PATH: join(paths.root, 'e2e-test-plan.md'),
    SPEC_TYPE: branchSpec?.type ?? 'milestone',
  };

  // Set spec name (use the display name if provided, else the directory name)
  context.SPEC_NAME = specName || spec;

  if (promptNumber !== undefined) {
    context.PROMPT_NUMBER = String(promptNumber).padStart(2, '0');
  }

  if (promptPath) {
    context.PROMPT_PATH = promptPath;
  }

  // Add hypothesis domains from settings.json
  const settings = loadProjectSettings();
  const defaultDomains = ['testing', 'stability', 'performance', 'feature', 'ux', 'integration'];
  const domains = settings?.emergent?.hypothesisDomains ?? defaultDomains;
  context.HYPOTHESIS_DOMAINS = domains.join(', ');

  // Try to read spec path from status (YAML format)
  if (existsSync(paths.status)) {
    try {
      const content = readFileSync(paths.status, 'utf-8');
      const specMatch = content.match(/^spec:\s*(.+)/m);
      if (specMatch) {
        context.SPEC_PATH = specMatch[1].trim();
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Resolve WORKFLOW_DOMAIN_PATH from spec's initial_workflow_domain frontmatter
  const basePath = cwd || process.cwd();
  let workflowDomain = 'milestone';
  if (context.SPEC_PATH) {
    try {
      const specFullPath = join(basePath, context.SPEC_PATH);
      if (existsSync(specFullPath)) {
        const specContent = readFileSync(specFullPath, 'utf-8');
        const fmMatch = specContent.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const domainMatch = fmMatch[1].match(/^initial_workflow_domain:\s*(.+)/m);
          if (domainMatch) {
            workflowDomain = domainMatch[1].trim();
          }
        }
      }
    } catch {
      // Ignore parse errors, use default
    }
  }
  const workflowDomainPath = join(basePath, '.allhands', 'workflows', `${workflowDomain}.md`);
  if (existsSync(workflowDomainPath)) {
    context.WORKFLOW_DOMAIN_PATH = workflowDomainPath;
  } else {
    console.warn(`Workflow domain config not found: ${workflowDomainPath}`);
    context.WORKFLOW_DOMAIN_PATH = '';
  }

  return context;
}

/**
 * Attach to the tmux session
 */
export function attachSession(sessionName: string): void {
  // This will take over the terminal
  const child = spawn('tmux', ['attach-session', '-t', sessionName], {
    stdio: 'inherit',
  });

  child.on('exit', () => {
    process.exit(0);
  });
}

/**
 * Get info about all running agents
 *
 * Only returns agents that were spawned by ALL HANDS (tracked in registry)
 * AND still exist in tmux.
 */
export function getRunningAgents(branch?: string): Array<{
  windowName: string;
  agentType?: string;
}> {
  // Use current session if we're in tmux, otherwise fall back to named session
  const currentSession = getCurrentSession();
  const sessionName = currentSession || getSessionName(branch);

  if (!sessionExists(sessionName)) {
    return [];
  }

  const windows = listWindows(sessionName);
  const registry = getSpawnedAgentRegistry();

  // Filter to agent windows that:
  // 1. Are in our spawned registry (were created by ALL HANDS)
  // 2. Still exist in tmux
  // 3. Are not the TUI/hub window
  return windows
    .filter((w) => w.index > 0 && w.name !== 'hub' && registry.has(w.name))
    .map((w) => ({
      windowName: w.name,
      agentType: inferAgentType(w.name),
    }));
}

/**
 * Get all valid agent types from profiles.
 */
export function getAgentTypes(): string[] {
  return listAgentProfiles().map((name) => {
    const profile = loadAgentProfile(name);
    return profile?.name ?? name;
  });
}

/**
 * Infer agent type from window name using agent profiles.
 *
 * Window names follow patterns:
 * - Non-prompt-scoped: exact profile name (e.g., "planner")
 * - Prompt-scoped: "{name}-{NN}" (e.g., "executor-01")
 */
function inferAgentType(windowName: string): AgentType | undefined {
  const lowerName = windowName.toLowerCase();

  // Load all profiles and match against window name
  const profileNames = listAgentProfiles();

  for (const profileName of profileNames) {
    const profile = loadAgentProfile(profileName);
    if (!profile) continue;

    const name = profile.name.toLowerCase();

    if (!profile.promptScoped) {
      // Non-prompt-scoped: exact match
      if (lowerName === name) {
        return name;
      }
    } else {
      // Prompt-scoped: match "{name}" or "{name}-{NN}"
      if (lowerName === name || lowerName.match(new RegExp(`^${name}-\\d+$`))) {
        return name;
      }
    }
  }

  return undefined;
}
