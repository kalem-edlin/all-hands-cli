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
 * - AGENT_TYPE: executor, coordinator, planner, judge, ideation, documentor, pr-reviewer
 * - PROMPT_NUMBER: Current prompt number (when applicable)
 * - MILESTONE_NAME: Current milestone name
 * - BRANCH: Current git branch
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getCurrentBranch } from './planning.js';
import { listAgentProfiles, loadAgentProfile } from './agents.js';

/**
 * Agent type = agent profile name.
 * Derived from .allhands/agents/*.yaml profile files.
 */
export type AgentType = string;

export interface AgentEnv {
  AGENT_ID: string;
  AGENT_TYPE: AgentType;
  PROMPT_NUMBER?: string;
  MILESTONE_NAME?: string;
  BRANCH: string;
}

export interface SpawnConfig {
  name: string;
  agentType: AgentType;
  flowPath: string;
  preamble?: string;
  promptNumber?: number;
  milestoneName?: string;
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
export function listWindows(sessionName: string): Array<{ index: number; name: string }> {
  try {
    const output = execSync(
      `tmux list-windows -t "${sessionName}" -F "#{window_index}:#{window_name}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    return output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [index, name] = line.split(':');
        return { index: parseInt(index, 10), name };
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
  const env: Record<string, string> = {
    AGENT_ID: windowName, // Window name = AGENT_ID (used for MCP daemon isolation)
    AGENT_TYPE: config.agentType,
    BRANCH: branch,
  };

  if (config.promptNumber !== undefined) {
    env.PROMPT_NUMBER = String(config.promptNumber).padStart(2, '0');
  }

  if (config.milestoneName) {
    env.MILESTONE_NAME = config.milestoneName;
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

  // Build environment as inline vars (VAR=value VAR2=value command)
  // Pass windowName so AGENT_ID is set correctly
  const env = buildAgentEnv(config, currentBranch, windowName);
  const envPrefix = Object.entries(env)
    .map(([k, v]) => `${k}='${v}'`)
    .join(' ');

  // Build the prompt
  const parts: string[] = [];

  // Add preamble if provided
  if (config.preamble) {
    parts.push(config.preamble);
  }

  // Add flow reference
  if (existsSync(config.flowPath)) {
    parts.push(`Read and follow the instructions in: ${config.flowPath}`);
  }

  const prompt = parts.join('\n\n');

  // Quote the prompt properly for shell
  const escapedPrompt = prompt.replace(/'/g, "'\\''");

  // Build command: VAR=value VAR2=value claude --dangerously-skip-permissions 'prompt'
  const fullCommand = `${envPrefix} claude --dangerously-skip-permissions '${escapedPrompt}'`;
  sendKeys(sessionName, windowName, fullCommand);

  // Switch focus to the new window if requested (default for TUI actions)
  if (shouldFocus) {
    selectWindow(sessionName, windowName);
  }

  return { sessionName, windowName };
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

  // Filter to agent windows (exclude TUI/hub window by name and index 0)
  return windows
    .filter((w) => w.index > 0 && w.name !== 'hub')
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
