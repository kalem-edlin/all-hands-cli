/**
 * Event Loop Daemon
 *
 * Non-blocking event loop that monitors external state:
 * 1. Greptile PR feedback polling
 * 2. Git branch change detection
 * 3. Agent window status monitoring
 * 4. Prompt execution loop (when enabled)
 *
 * Uses setInterval with cleanup to prevent memory leaks.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getCurrentBranch } from './planning.js';
import { listWindows, SESSION_NAME, sessionExists, getCurrentSession } from './tmux.js';
import { pickNextPrompt, markPromptInProgress, type PromptFile } from './prompts.js';
import { shutdownDaemon } from './mcp-client.js';

export interface EventLoopState {
  currentBranch: string;
  prUrl: string | null;
  greptileFeedbackAvailable: boolean;
  activeAgents: string[];
  lastCheckTime: number;
  loopEnabled: boolean;
  currentExecutorPrompt: number | null;
}

export interface EventLoopCallbacks {
  onGreptileFeedback?: (available: boolean) => void;
  onBranchChange?: (newBranch: string) => void;
  onAgentsChange?: (agents: string[]) => void;
  onSpawnExecutor?: (prompt: PromptFile) => void;
  onLoopStatus?: (message: string) => void;
}

// Protected branches that should not trigger auto .planning/ init
const PROTECTED_BRANCHES = [
  'main',
  'master',
  'stage',
  'staging',
  'develop',
  'development',
  'prod',
  'production',
];

const PROTECTED_PREFIXES = ['wt-'];

export class EventLoop {
  private intervalId: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;
  private state: EventLoopState;
  private callbacks: EventLoopCallbacks;
  private cwd: string;

  constructor(
    cwd: string,
    callbacks: EventLoopCallbacks = {},
    pollIntervalMs: number = 5000
  ) {
    this.cwd = cwd;
    this.callbacks = callbacks;
    this.pollIntervalMs = pollIntervalMs;
    this.state = {
      currentBranch: getCurrentBranch(),
      prUrl: null,
      greptileFeedbackAvailable: false,
      activeAgents: [],
      lastCheckTime: Date.now(),
      loopEnabled: false,
      currentExecutorPrompt: null,
    };
  }

  /**
   * Start the event loop
   */
  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    this.intervalId = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[EventLoop] Error in tick:', err);
      });
    }, this.pollIntervalMs);

    // Run initial tick
    this.tick().catch((err) => {
      console.error('[EventLoop] Error in initial tick:', err);
    });
  }

  /**
   * Stop the event loop and clean up
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Set the PR URL to monitor for Greptile feedback
   */
  setPRUrl(url: string | null): void {
    this.state.prUrl = url;
    this.state.greptileFeedbackAvailable = false;
  }

  /**
   * Enable or disable the prompt execution loop
   */
  setLoopEnabled(enabled: boolean): void {
    this.state.loopEnabled = enabled;
    if (!enabled) {
      this.state.currentExecutorPrompt = null;
    }
  }

  /**
   * Get current state
   */
  getState(): EventLoopState {
    return { ...this.state };
  }

  /**
   * Main tick - runs all checks
   */
  private async tick(): Promise<void> {
    this.state.lastCheckTime = Date.now();

    await Promise.all([
      this.checkGreptileFeedback(),
      this.checkGitBranch(),
      this.checkAgentWindows(),
    ]);

    // Check prompt loop after agent windows (needs to know active agents)
    await this.checkPromptLoop();
  }

  /**
   * Check for Greptile PR feedback
   */
  private async checkGreptileFeedback(): Promise<void> {
    if (!this.state.prUrl) {
      return;
    }

    try {
      // Extract PR info from URL
      // Format: https://github.com/owner/repo/pull/123
      const match = this.state.prUrl.match(
        /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
      );
      if (!match) {
        return;
      }

      const [, owner, repo, prNumber] = match;

      // Check PR comments for Greptile review
      const output = execSync(
        `gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --jq '.[].user.login'`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd }
      );

      // Check if greptile-bot or similar has commented
      const hasGreptileComment =
        output.toLowerCase().includes('greptile') ||
        output.toLowerCase().includes('coderabbit');

      if (hasGreptileComment !== this.state.greptileFeedbackAvailable) {
        this.state.greptileFeedbackAvailable = hasGreptileComment;
        this.callbacks.onGreptileFeedback?.(hasGreptileComment);
      }
    } catch {
      // Silently fail - might not have gh installed or no PR
    }
  }

  /**
   * Check for git branch changes
   */
  private async checkGitBranch(): Promise<void> {
    try {
      const currentBranch = getCurrentBranch();

      if (currentBranch !== this.state.currentBranch) {
        const previousBranch = this.state.currentBranch;
        this.state.currentBranch = currentBranch;

        // Check if we should auto-init .planning/ for this branch
        if (!this.isProtectedBranch(currentBranch)) {
          this.ensurePlanningDir(currentBranch);
        }

        this.callbacks.onBranchChange?.(currentBranch);
      }
    } catch {
      // Silently fail
    }
  }

  /**
   * Check for changes in agent windows
   */
  private async checkAgentWindows(): Promise<void> {
    try {
      // Use current session if in tmux, otherwise fall back to SESSION_NAME
      const currentSession = getCurrentSession();
      const sessionName = currentSession || SESSION_NAME;

      if (!sessionExists(sessionName)) {
        // Session gone - cleanup all agent daemons
        if (this.state.activeAgents.length > 0) {
          await this.cleanupAgentDaemons(this.state.activeAgents);
          this.state.activeAgents = [];
          this.callbacks.onAgentsChange?.([]);
        }
        return;
      }

      const windows = listWindows(sessionName);
      // Filter out the TUI/hub window by index and name
      const agentWindows = windows
        .filter((w) => w.index > 0 && w.name !== 'hub')
        .map((w) => w.name);

      // Check if agents have changed
      const sortedCurrent = [...agentWindows].sort();
      const sortedPrevious = [...this.state.activeAgents].sort();

      if (JSON.stringify(sortedCurrent) !== JSON.stringify(sortedPrevious)) {
        // Find agents that disappeared and cleanup their daemons
        const disappeared = this.state.activeAgents.filter(
          (name) => !agentWindows.includes(name)
        );

        if (disappeared.length > 0) {
          await this.cleanupAgentDaemons(disappeared);
        }

        this.state.activeAgents = agentWindows;
        this.callbacks.onAgentsChange?.(agentWindows);
      }
    } catch {
      // Silently fail
    }
  }

  /**
   * Cleanup MCP daemons for agents that have exited.
   * The window name IS the AGENT_ID, so we can directly shutdown their daemons.
   */
  private async cleanupAgentDaemons(agentNames: string[]): Promise<void> {
    for (const agentName of agentNames) {
      try {
        // Window name = AGENT_ID for daemon isolation
        await shutdownDaemon(agentName);
      } catch {
        // Ignore errors - daemon may already be gone
      }
    }
  }

  /**
   * Check if we should spawn an executor for the next prompt
   */
  private async checkPromptLoop(): Promise<void> {
    if (!this.state.loopEnabled) {
      return;
    }

    try {
      // Check if there's already an executor running
      const hasExecutor = this.state.activeAgents.some(
        (name) => name.startsWith('prompt-') || name === 'executor'
      );

      if (hasExecutor) {
        // Executor still running, wait for it to finish
        return;
      }

      // No executor running - pick next prompt
      const result = pickNextPrompt(this.state.currentBranch, this.cwd);

      if (!result.prompt) {
        // No actionable prompts
        this.callbacks.onLoopStatus?.(result.reason);
        return;
      }

      // Mark prompt as in_progress and spawn executor
      markPromptInProgress(result.prompt.path);
      this.state.currentExecutorPrompt = result.prompt.frontmatter.number;

      this.callbacks.onLoopStatus?.(
        `Spawning executor for prompt ${result.prompt.frontmatter.number}: ${result.prompt.frontmatter.title}`
      );
      this.callbacks.onSpawnExecutor?.(result.prompt);
    } catch {
      // Silently fail
    }
  }

  /**
   * Check if a branch is protected (should not auto-init .planning/)
   */
  private isProtectedBranch(branch: string): boolean {
    const lowerBranch = branch.toLowerCase();

    if (PROTECTED_BRANCHES.includes(lowerBranch)) {
      return true;
    }

    for (const prefix of PROTECTED_PREFIXES) {
      if (lowerBranch.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Ensure .planning/{branch}/ directory exists
   */
  private ensurePlanningDir(branch: string): void {
    const planningDir = join(this.cwd, '.planning', branch);

    if (!existsSync(planningDir)) {
      mkdirSync(planningDir, { recursive: true });

      // Create subdirectories
      mkdirSync(join(planningDir, 'prompts'), { recursive: true });
    }
  }
}
