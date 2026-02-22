/**
 * Event Loop Daemon
 *
 * Non-blocking event loop that monitors external state:
 * 1. PR review feedback polling (configurable reviewer)
 * 2. Git branch change detection (and associated spec changes)
 * 3. Agent window status monitoring
 * 4. Prompt execution loop (when enabled)
 *
 * In the branch-keyed model:
 * - The current git branch determines the active spec
 * - Branch changes trigger spec context updates
 * - No separate "active spec" tracking needed
 */

import { getCurrentBranch, updatePRReviewStatus, sanitizeBranchForDir, readStatus, readAlignmentFrontmatter } from './planning.js';
import { loadProjectSettings } from '../hooks/shared.js';
import { listWindows, SESSION_NAME, sessionExists, getCurrentSession, getSpawnedAgentRegistry, unregisterSpawnedAgent } from './tmux.js';
import { pickNextPrompt, markPromptInProgress, loadAllPrompts, type PromptFile } from './prompts.js';
import { shutdownDaemon } from './mcp-client.js';
import { getSpecForBranch, type SpecFile } from './specs.js';
import {
  checkPRReviewStatus,
  hasNewReview,
  parsePRUrl,
  type PRReviewState,
} from './pr-review.js';

/** Cooldown between spawns to prevent race conditions with tmux registry */
const SPAWN_COOLDOWN_MS = 10000;

export interface PromptSnapshot {
  count: number;
  pending: number;
  inProgress: number;
  done: number;
  /** Hash of prompt filenames + statuses for change detection */
  hash: string;
}

export interface EventLoopState {
  currentBranch: string;
  currentSpec: SpecFile | null;
  planningKey: string | null;  // Sanitized branch name for .planning/ lookup
  prUrl: string | null;
  prReviewFeedbackAvailable: boolean;
  prReviewState: PRReviewState;
  activeAgents: string[];
  lastCheckTime: number;
  loopEnabled: boolean;
  parallelEnabled: boolean;  // Parallel execution mode
  emergentEnabled: boolean;  // Emergent exploration toggle (blocks tangential when off)
  /** Active executor prompt numbers (supports parallel execution) */
  activeExecutorPrompts: number[];
  /** Timestamp of last executor spawn (for race condition protection) */
  lastExecutorSpawnTime: number | null;
  /** Last known prompt state for change detection */
  promptSnapshot: PromptSnapshot | null;
  /** Tick counter for modulus-based polling */
  tickCount: number;
  /** Consecutive emergent planner spawns without new prompt creation (resets when new pending prompts appear) */
  emergentSpawnCount: number;
  /** Total prompt count at last emergent planner spawn, used to detect whether it produced new prompts */
  emergentLastPromptCount: number;
}

export interface EventLoopCallbacks {
  onPRReviewFeedback?: (available: boolean) => void;
  onBranchChange?: (newBranch: string, spec: SpecFile | null) => void;
  onAgentsChange?: (agents: string[]) => void;
  onSpawnExecutor?: (prompt: PromptFile) => void;
  /** Called when emergent planner should be spawned (no pending + no in_progress) */
  onSpawnEmergentPlanning?: (emergentEnabled: boolean) => void;
  onLoopStatus?: (message: string) => void;
  /** Called when prompts are added, removed, or their status changes */
  onPromptsChange?: (prompts: PromptFile[], snapshot: PromptSnapshot) => void;
}

// Note: Use isLockedBranch() from planning.ts for consistent branch checks

export class EventLoop {
  private intervalId: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;
  private state: EventLoopState;
  private callbacks: EventLoopCallbacks;
  private cwd: string;

  // PR review settings from .allhands/settings.json
  private prReviewCheckFrequency: number;
  private reviewMatchPattern: string;
  private rerunComment: string;

  constructor(
    cwd: string,
    callbacks: EventLoopCallbacks = {},
    pollIntervalMs?: number
  ) {
    this.cwd = cwd;
    this.callbacks = callbacks;

    // Load settings from .allhands/settings.json
    const settings = loadProjectSettings();
    this.pollIntervalMs = pollIntervalMs ?? settings?.eventLoop?.tickIntervalMs ?? 5000;
    this.prReviewCheckFrequency = settings?.prReview?.checkFrequency ?? 3;
    this.reviewMatchPattern = settings?.prReview?.reviewMatchPattern ?? 'greptile';
    this.rerunComment = settings?.prReview?.rerunComment ?? '@greptile';

    // Initialize state based on current branch
    const currentBranch = getCurrentBranch(cwd);
    const currentSpec = getSpecForBranch(currentBranch, cwd);
    const planningKey = sanitizeBranchForDir(currentBranch);

    this.state = {
      currentBranch,
      currentSpec,
      planningKey,
      prUrl: null,
      prReviewFeedbackAvailable: false,
      prReviewState: {
        status: 'none',
        lastCommentId: null,
        lastCommentTime: null,
        reviewCycle: 0,
      },
      activeAgents: [],
      lastCheckTime: Date.now(),
      loopEnabled: false,
      parallelEnabled: false,
      emergentEnabled: true,
      activeExecutorPrompts: [],
      lastExecutorSpawnTime: null,
      promptSnapshot: null,
      tickCount: 0,
      emergentSpawnCount: 0,
      emergentLastPromptCount: 0,
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
   * Set the PR URL to monitor for PR review feedback
   */
  setPRUrl(url: string | null): void {
    this.state.prUrl = url;
    this.state.prReviewFeedbackAvailable = false;
  }

  /**
   * Enable or disable the prompt execution loop
   */
  setLoopEnabled(enabled: boolean): void {
    this.state.loopEnabled = enabled;
    this.state.emergentSpawnCount = 0;
    if (!enabled) {
      this.state.activeExecutorPrompts = [];
      this.state.lastExecutorSpawnTime = null;
    }
  }

  /**
   * Enable or disable parallel execution mode
   */
  setParallelEnabled(enabled: boolean): void {
    this.state.parallelEnabled = enabled;
  }

  /**
   * Enable or disable emergent exploration (blocks tangential phase when off)
   */
  setEmergentEnabled(enabled: boolean): void {
    this.state.emergentEnabled = enabled;
  }

  /**
   * Force an immediate tick of the event loop.
   * Use when enabling parallel mode to spawn immediately without waiting.
   */
  async forceTick(): Promise<void> {
    await this.tick();
  }

  /**
   * Get current state
   */
  getState(): EventLoopState {
    return { ...this.state };
  }

  /**
   * Manually set branch context after TUI-initiated branch changes.
   *
   * This prevents the EventLoop from triggering onBranchChange callbacks
   * for changes that the TUI already handled (e.g., switch-spec, clear-spec).
   * Without this, the EventLoop would detect the branch change on its next
   * tick and potentially overwrite TUI state with stale/incorrect data.
   */
  setBranchContext(branch: string, spec: SpecFile | null): void {
    this.state.currentBranch = branch;
    this.state.currentSpec = spec;
    this.state.planningKey = sanitizeBranchForDir(branch);
  }

  /**
   * Main tick - runs all checks
   */
  private async tick(): Promise<void> {
    this.state.lastCheckTime = Date.now();
    this.state.tickCount++;

    await Promise.all([
      this.checkPRReviewFeedback(),
      this.checkGitBranch(),
      this.checkAgentWindows(),
      this.checkPromptFiles(),
    ]);

    // Check prompt loop after agent windows (needs to know active agents)
    await this.checkPromptLoop();
  }

  /**
   * Check for PR review feedback
   *
   * Uses the pr-review library to:
   * - Track review cycles (not just presence)
   * - Compare comment timestamps with last check
   * - Update status.yaml with current state
   *
   * Polls at a configurable frequency (every N ticks) since reviews
   * can take several minutes to complete.
   */
  private async checkPRReviewFeedback(): Promise<void> {
    if (!this.state.prUrl) {
      return;
    }

    // Only poll every prReviewCheckFrequency ticks (not every tick)
    if (this.state.tickCount % this.prReviewCheckFrequency !== 0) {
      return;
    }

    // Validate PR URL
    const prInfo = parsePRUrl(this.state.prUrl);
    if (!prInfo) {
      return;
    }

    try {
      // Get lastReviewRunTime from status.yaml to filter comments
      let afterTime: string | undefined;
      if (this.state.planningKey) {
        try {
          const status = readStatus(this.state.planningKey, this.cwd);
          afterTime = status?.prReview?.lastReviewRunTime ?? undefined;
        } catch {
          // Status file might not exist - ignore
        }
      }

      // Get current PR review state
      const currentState = await checkPRReviewStatus(
        this.state.prUrl,
        this.reviewMatchPattern,
        afterTime,
        this.cwd
      );

      // Check if there's a new review
      const isNewReview = hasNewReview(this.state.prReviewState, currentState);

      // Update feedback available flag
      const hasReviewComment = currentState.status === 'completed';

      if (hasReviewComment !== this.state.prReviewFeedbackAvailable || isNewReview) {
        this.state.prReviewFeedbackAvailable = hasReviewComment;
        this.state.prReviewState = currentState;

        // Update status.yaml with PR review state (use planning key)
        if (this.state.planningKey) {
          try {
            updatePRReviewStatus(
              {
                reviewCycle: currentState.reviewCycle,
                lastReviewTime: currentState.lastCommentTime,
                status: currentState.status,
              },
              this.state.planningKey,
              this.cwd
            );
          } catch {
            // Status file might not exist - ignore
          }
        }

        // Notify if there's a new review
        if (isNewReview) {
          this.callbacks.onPRReviewFeedback?.(hasReviewComment);
        }
      }
    } catch {
      // Silently fail - might not have gh installed or no PR
    }
  }

  /**
   * Check for git branch changes
   *
   * In the branch-keyed model:
   * - Branch changes are the primary trigger for context changes
   * - Find the spec for the new branch via findSpecByBranch()
   * - Notify callbacks so TUI can update state
   */
  private async checkGitBranch(): Promise<void> {
    try {
      const currentBranch = getCurrentBranch(this.cwd);

      if (currentBranch !== this.state.currentBranch) {
        // Branch changed - update spec context
        this.state.currentBranch = currentBranch;
        this.state.currentSpec = getSpecForBranch(currentBranch, this.cwd);
        this.state.planningKey = sanitizeBranchForDir(currentBranch);

        // Notify callback with branch and spec info
        this.callbacks.onBranchChange?.(currentBranch, this.state.currentSpec);
      }
    } catch (err) {
      console.error('[EventLoop] checkGitBranch failed:', err);
    }
  }

  /**
   * Check for changes in prompt files
   *
   * The harness is the coordinator and watcher - it detects when agents
   * create, modify, or delete prompt files and notifies the TUI.
   * This enables reactive UI updates without agents needing to know about the harness.
   */
  private async checkPromptFiles(): Promise<void> {
    // Need planning directory to check prompts
    if (!this.state.planningKey) {
      return;
    }

    try {
      const prompts = loadAllPrompts(this.state.planningKey, this.cwd);
      const snapshot = this.computePromptSnapshot(prompts);

      // Check if prompts have changed
      const hasChanged = !this.state.promptSnapshot ||
        snapshot.hash !== this.state.promptSnapshot.hash;

      if (hasChanged) {
        // Reset emergent planner backoff when new pending prompts appear (external prompt creation)
        if (this.state.promptSnapshot && snapshot.pending > this.state.promptSnapshot.pending) {
          this.state.emergentSpawnCount = 0;
        }
        this.state.promptSnapshot = snapshot;
        this.callbacks.onPromptsChange?.(prompts, snapshot);
      }
    } catch (err) {
      console.error('[EventLoop] checkPromptFiles failed:', err);
    }
  }

  /**
   * Compute a snapshot of prompt state for change detection
   */
  private computePromptSnapshot(prompts: PromptFile[]): PromptSnapshot {
    let pending = 0;
    let inProgress = 0;
    let done = 0;

    // Build hash from filenames + statuses + numbers
    const parts: string[] = [];
    for (const p of prompts) {
      parts.push(`${p.filename}:${p.frontmatter.status}:${p.frontmatter.number}`);
      switch (p.frontmatter.status) {
        case 'pending': pending++; break;
        case 'in_progress': inProgress++; break;
        case 'done': done++; break;
      }
    }
    parts.sort(); // Consistent ordering

    return {
      count: prompts.length,
      pending,
      inProgress,
      done,
      hash: parts.join('|'),
    };
  }

  /**
   * Check for changes in agent windows
   *
   * Only tracks agents that were spawned by ALL HANDS (in the registry)
   * and still exist in tmux. This prevents picking up unrelated tmux windows.
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
          // Also clear the registry since session is gone
          for (const name of this.state.activeAgents) {
            unregisterSpawnedAgent(name);
          }
          this.state.activeAgents = [];
          this.callbacks.onAgentsChange?.([]);
        }
        return;
      }

      const windows = listWindows(sessionName);
      const registry = getSpawnedAgentRegistry();

      // Only include windows that:
      // 1. Are in our spawned registry (were created by ALL HANDS)
      // 2. Still exist in tmux
      // 3. Are not the TUI/hub window
      const agentWindows = windows
        .filter((w) => w.index > 0 && w.name !== 'hub' && registry.has(w.name))
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
          // Unregister disappeared agents
          for (const name of disappeared) {
            unregisterSpawnedAgent(name);
          }

          // If an executor exited, remove it from activeExecutorPrompts
          // Extract prompt number from window name (e.g., "executor-03" -> 3)
          for (const name of disappeared) {
            if (name.startsWith('executor')) {
              const match = name.match(/-(\d+)$/);
              if (match) {
                const promptNum = parseInt(match[1], 10);
                this.state.activeExecutorPrompts = this.state.activeExecutorPrompts.filter(
                  (n) => n !== promptNum
                );
              }
            }
          }
          // Clear spawn timestamp to allow new spawns
          if (disappeared.some((name) => name.startsWith('executor') || name.startsWith('emergent'))) {
            this.state.lastExecutorSpawnTime = null;
          }
        }

        this.state.activeAgents = agentWindows;
        this.callbacks.onAgentsChange?.(agentWindows);
      }

      // Reconcile activeExecutorPrompts with actual running agents
      // This handles cases where an agent dies before being detected in activeAgents
      // (e.g., immediate compaction after spawn)
      if (this.state.activeExecutorPrompts.length > 0) {
        const runningPromptNums = new Set<number>();
        for (const name of agentWindows) {
          if (name.startsWith('executor')) {
            const match = name.match(/-(\d+)$/);
            if (match) {
              runningPromptNums.add(parseInt(match[1], 10));
            }
          }
        }
        // Keep only prompts that have a running agent
        const before = this.state.activeExecutorPrompts.length;
        this.state.activeExecutorPrompts = this.state.activeExecutorPrompts.filter(
          (n) => runningPromptNums.has(n)
        );
        // If we cleaned up stale prompts, also clear spawn timestamp
        if (this.state.activeExecutorPrompts.length < before) {
          this.state.lastExecutorSpawnTime = null;
        }
      }
    } catch (err) {
      console.error('[EventLoop] checkAgentWindows failed:', err);
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
   * Unified prompt loop — single decision path:
   *
   * 1. loop enabled + pending prompts → pick next, spawn executor
   * 2. loop enabled + no pending + no in_progress → spawn emergent planner
   * 3. loop enabled + no pending + in_progress exist → wait (executors still working)
   * 4. loop disabled → nothing
   *
   * Parallel rules: spawn up to maxParallel executors; only ONE emergent planner at a time.
   */
  private async checkPromptLoop(): Promise<void> {
    if (!this.state.loopEnabled) {
      return;
    }

    // Need a planning directory to pick prompts (spec file is optional metadata)
    if (!this.state.planningKey) {
      this.callbacks.onLoopStatus?.('No planning directory for this branch - loop paused');
      return;
    }

    try {
      // Execution gating: only spawn executors/emergent planners when stage is 'executing'
      try {
        const status = readStatus(this.state.planningKey, this.cwd);
        if (status?.stage !== 'executing') {
          this.callbacks.onLoopStatus?.(`Stage is '${status?.stage || 'unknown'}' — waiting for executing stage`);
          return;
        }
      } catch {
        // No status file — cannot determine stage, skip spawning
        return;
      }

      // Block if emergent planner is running (only ONE at a time)
      const hasEmergent = this.state.activeAgents.some((name) => name.startsWith('emergent'));
      if (hasEmergent) {
        return;
      }

      // Count active executors
      const activeExecutors = this.state.activeAgents.filter((name) => name.startsWith('executor'));

      // Determine max parallel based on toggle
      const settings = loadProjectSettings();
      const maxParallel = this.state.parallelEnabled
        ? (settings?.spawn?.maxParallelPrompts ?? 3)
        : 1;

      // Check capacity - if at max, don't spawn
      if (activeExecutors.length >= maxParallel) {
        return;
      }

      // Time-based guard: don't spawn if we spawned recently (within cooldown)
      if (
        this.state.lastExecutorSpawnTime &&
        Date.now() - this.state.lastExecutorSpawnTime < SPAWN_COOLDOWN_MS
      ) {
        return;
      }

      // Pick next prompt from planning directory
      const result = pickNextPrompt(
        this.state.planningKey,
        this.cwd,
        this.state.activeExecutorPrompts
      );

      if (result.prompt) {
        // Pending prompt available → spawn executor
        markPromptInProgress(result.prompt.path);
        this.state.activeExecutorPrompts.push(result.prompt.frontmatter.number);
        this.state.lastExecutorSpawnTime = Date.now();

        this.callbacks.onLoopStatus?.(
          `Spawning executor for prompt ${result.prompt.frontmatter.number}: ${result.prompt.frontmatter.title}`
        );
        this.callbacks.onSpawnExecutor?.(result.prompt);
        return;
      }

      // No pending prompts — check if we should spawn emergent planner
      if (
        result.stats &&
        result.stats.pending === 0 &&
        result.stats.inProgress === 0
      ) {
        // Check emergent toggle — only blocks tangential (Phase 2)
        if (!this.state.emergentEnabled) {
          const frontmatter = readAlignmentFrontmatter(this.state.planningKey, this.cwd);
          if (frontmatter?.core_consolidation === 'complete') {
            this.callbacks.onLoopStatus?.('Emergent toggle OFF — tangential exploration blocked');
            return;
          }
          // core_consolidation is pending — allow emergent spawn for core work
        }

        // Track whether prior emergent planner spawn was productive (created new prompts)
        const currentPromptCount = this.state.promptSnapshot?.count ?? 0;
        if (currentPromptCount <= this.state.emergentLastPromptCount) {
          // Emergent planner spawned but didn't produce new prompts — unproductive
          this.state.emergentSpawnCount++;
        } else {
          // Emergent planner produced work — reset backoff
          this.state.emergentSpawnCount = 0;
        }

        // Apply exponential backoff for unproductive spawns
        const cooldownMs = SPAWN_COOLDOWN_MS * Math.pow(2, Math.min(this.state.emergentSpawnCount, 4));
        if (
          this.state.lastExecutorSpawnTime &&
          Date.now() - this.state.lastExecutorSpawnTime < cooldownMs
        ) {
          this.callbacks.onLoopStatus?.(
            `Emergent planner backoff: waiting ${cooldownMs / 1000}s (${this.state.emergentSpawnCount} unproductive spawns)`
          );
          return;
        }

        // Spawn emergent planner
        this.state.lastExecutorSpawnTime = Date.now();
        this.state.emergentLastPromptCount = currentPromptCount;

        this.callbacks.onLoopStatus?.(
          `Spawning emergent planner (attempt ${this.state.emergentSpawnCount + 1})`
        );
        this.callbacks.onSpawnEmergentPlanning?.(this.state.emergentEnabled);
        return;
      }

      // In-progress prompts still running — wait
      this.callbacks.onLoopStatus?.(result.reason);
    } catch (err) {
      console.error('[EventLoop] checkPromptLoop failed:', err);
    }
  }

}
