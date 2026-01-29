/**
 * Lifecycle Hooks
 *
 * Hooks for agent lifecycle events:
 * - Stop: Send notification and kill tmux window
 * - PreCompact: Summarize progress, append to prompt file, kill tmux window
 */

import { existsSync } from 'fs';
import type { Command } from 'commander';
import {
  HookInput,
  HookCategory,
  RegisterFn,
  outputStopHook,
  outputPreCompact,
  registerCategory,
  registerCategoryForDaemon,
} from './shared.js';
import { logHookSuccess } from '../lib/trace-store.js';
import { sendNotification } from '../lib/notification.js';
import { killWindow, SESSION_NAME, windowExists, getCurrentSession } from '../lib/tmux.js';
import { getPromptByNumber } from '../lib/prompts.js';
import { getCurrentBranch, sanitizeBranchForDir } from '../lib/planning.js';
import { runCompaction } from '../lib/compaction.js';

const HOOK_AGENT_STOP = 'lifecycle agent-stop';
const HOOK_AGENT_COMPACT = 'lifecycle agent-compact';

// ─────────────────────────────────────────────────────────────────────────────
// Agent Stop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle agent stop lifecycle event.
 *
 * - Sends desktop notification
 * - Kills the tmux window (for prompt-scoped agents that may not close naturally)
 * - Approves the stop
 *
 * Triggered by: Stop matcher "*"
 */
export function handleAgentStop(_input: HookInput): void {
  const agentId = process.env.AGENT_ID;
  const agentType = process.env.AGENT_TYPE || 'Agent';
  const isPromptScoped = process.env.PROMPT_SCOPED === 'true';

  // Send notification
  const title = agentId ? `${agentType} Stopped` : 'Agent Stopped';
  const message = agentId ? `Agent ${agentId} has stopped` : 'The agent session has stopped';

  sendNotification({
    title,
    message,
    type: 'banner',
  });

  // Only kill the tmux window for prompt-scoped agents.
  // Non-prompt-scoped agents should remain running (their window stays open).
  // Prompt-scoped agents may not close naturally even with exec, so we
  // explicitly kill them here.
  if (isPromptScoped) {
    const sessionName = getCurrentSession() || SESSION_NAME;
    if (agentId && windowExists(sessionName, agentId)) {
      killWindow(sessionName, agentId);
    }
  }

  // Approve stop
  outputStopHook('approve', undefined, HOOK_AGENT_STOP);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-Compact
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle pre-compaction lifecycle event.
 *
 * When context gets too long and compaction is triggered for a prompt-scoped agent:
 * 1. Run full compaction analysis via oracle:
 *    - Analyze conversation for progress, learnings, blockers
 *    - Recommend action: continue (keep code) or scratch (discard)
 *    - Increment attempts counter in prompt frontmatter
 *    - Append detailed progress update to prompt file
 *    - Execute recommendation (commit or discard changes)
 * 2. Kill the tmux window (terminate the Claude instance)
 * 3. Event loop can then re-run the prompt with learnings
 *
 * Criteria to run full compaction:
 * - PROMPT_SCOPED=true (agent is prompt-scoped)
 * - PROMPT_NUMBER is set (we know which prompt file to update)
 * - transcript_path exists (we have conversation logs to analyze)
 *
 * Triggered by: PreCompact matcher "*"
 */
export async function handleAgentCompact(input: HookInput): Promise<void> {
  const agentId = process.env.AGENT_ID;
  const promptNumber = process.env.PROMPT_NUMBER;
  const isPromptScoped = process.env.PROMPT_SCOPED === 'true';
  const transcriptPath = input.transcript_path;

  // Only process compaction for prompt-scoped agents with PROMPT_NUMBER.
  // Non-prompt-scoped agents (like the main session) should just pass through
  // without killing windows or attempting to write summaries.
  if (!isPromptScoped || !promptNumber) {
    logHookSuccess(HOOK_AGENT_COMPACT, {
      action: 'skip',
      reason: !isPromptScoped ? 'not_prompt_scoped' : 'no_prompt_number',
    });
    return outputPreCompact(undefined);
  }

  // Use current session (not hardcoded SESSION_NAME) since agents may be
  // spawned in whatever session is active, not necessarily 'ah-hub'
  const sessionName = getCurrentSession() || SESSION_NAME;

  // Get the planning key (sanitized branch name) for directory lookups.
  // The planning directory is .planning/<sanitized-branch>/ (e.g., "feature-core-taskflow-crud").
  const branch = getCurrentBranch();
  const planningKey = sanitizeBranchForDir(branch);

  // Get the prompt file
  const promptNum = parseInt(promptNumber, 10);
  const prompt = getPromptByNumber(promptNum, planningKey);

  if (!prompt) {
    // Prompt file not found, kill window and exit
    logHookSuccess(HOOK_AGENT_COMPACT, { action: 'skip', reason: 'no_prompt', promptNum, planningKey });
    if (agentId && windowExists(sessionName, agentId)) {
      killWindow(sessionName, agentId);
    }
    return outputPreCompact(undefined);
  }

  // Need transcript to run compaction analysis
  if (!transcriptPath || !existsSync(transcriptPath)) {
    sendNotification({
      title: 'Compaction Skipped',
      message: `No transcript available for prompt ${promptNumber}`,
      type: 'banner',
    });
    if (agentId && windowExists(sessionName, agentId)) {
      killWindow(sessionName, agentId);
    }
    return outputPreCompact(undefined, HOOK_AGENT_COMPACT);
  }

  // Notify that compaction is starting
  sendNotification({
    title: 'Compaction Starting',
    message: `Analyzing prompt ${promptNumber}...`,
    type: 'banner',
  });

  try {
    // Run full compaction analysis (result written to prompt file)
    await runCompaction({
      conversationLogs: transcriptPath,
      promptFile: prompt.path,
    });
  } catch {
    // Compaction failed - error logged to trace store
  }

  // Kill the tmux window after compaction completes.
  // PreCompact hook does NOT stop the Claude session - we must explicitly kill it.
  if (agentId && windowExists(sessionName, agentId)) {
    killWindow(sessionName, agentId);
  }

  outputPreCompact(undefined, HOOK_AGENT_COMPACT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Category Definition
// ─────────────────────────────────────────────────────────────────────────────

/** Lifecycle hooks category */
export const category: HookCategory = {
  name: 'lifecycle',
  description: 'Lifecycle hooks (Stop, PreCompact)',
  hooks: [
    {
      name: 'agent-stop',
      description: 'Handle agent stop event',
      handler: handleAgentStop,
      errorFallback: { type: 'outputStopHook', decision: 'approve' },
      logPayload: () => ({ agentId: process.env.AGENT_ID }),
    },
    {
      name: 'agent-compact',
      description: 'Handle pre-compaction event',
      handler: handleAgentCompact,
      errorFallback: { type: 'continue' },
      logPayload: () => ({
        agentId: process.env.AGENT_ID,
        promptNumber: process.env.PROMPT_NUMBER,
        promptScoped: process.env.PROMPT_SCOPED,
        specName: process.env.SPEC_NAME,
      }),
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register lifecycle hook subcommands.
 */
export function register(parent: Command): void {
  registerCategory(parent, category);
}

// ─────────────────────────────────────────────────────────────────────────────
// Daemon Handler Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register handlers for daemon mode.
 */
export function registerDaemonHandlers(register: RegisterFn): void {
  registerCategoryForDaemon(category, register);
}
