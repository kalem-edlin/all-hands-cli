/**
 * Lifecycle Hooks
 *
 * Hooks for agent lifecycle events:
 * - Stop: Send notification and kill tmux window
 * - PreCompact: Summarize progress, append to prompt file, kill tmux window
 */

import { execSync } from 'child_process';
import { appendFileSync, existsSync } from 'fs';
import type { Command } from 'commander';
import { HookInput, outputStopHook, outputPreCompact, readHookInput } from './shared.js';
import { parseTranscript, buildCompactionMessage } from './transcript-parser.js';
import { sendNotification } from '../lib/notification.js';
import { killWindow, SESSION_NAME, windowExists, getCurrentSession } from '../lib/tmux.js';
import { getPromptByNumber } from '../lib/prompts.js';
import { getCurrentBranch, sanitizeBranchForDir } from '../lib/planning.js';
import { getSpecForBranch } from '../lib/specs.js';
import { ask } from '../lib/llm.js';
import { logHookStart, logHookSuccess } from '../lib/trace-store.js';

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

  // Send notification
  const title = agentId ? `${agentType} Stopped` : 'Agent Stopped';
  const message = agentId ? `Agent ${agentId} has stopped` : 'The agent session has stopped';

  sendNotification({
    title,
    message,
    type: 'banner',
  });

  // Explicitly kill the tmux window to ensure cleanup
  // (prompt-scoped agents may not close naturally even with exec)
  // Use current session (not hardcoded SESSION_NAME) since agents may be
  // spawned in whatever session is active, not necessarily 'ah-hub'
  const sessionName = getCurrentSession() || SESSION_NAME;
  if (agentId && windowExists(sessionName, agentId)) {
    killWindow(sessionName, agentId);
  }

  // Approve stop
  outputStopHook('approve', undefined, HOOK_AGENT_STOP);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-Compact
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get git status summary (changed/added/deleted files)
 */
function getGitStatus(): string {
  try {
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return status.trim() || 'No changes';
  } catch {
    return 'Unable to get git status';
  }
}

/**
 * Generate compaction summary using oracle
 */
async function generateCompactionSummary(
  transcriptSummary: string,
  gitStatus: string,
  promptContent: string
): Promise<string> {
  const prompt = `You are summarizing an agent's work session that was interrupted due to context limits.

## Original Prompt Requirements
${promptContent}

## Session Summary (from transcript)
${transcriptSummary}

## Git Status (file changes)
${gitStatus}

## Your Task
Generate a concise summary to append to the prompt file. This will help the next agent run continue the work.

Include:
1. **Progress Made**: What was accomplished
2. **Current State**: Where work stopped
3. **Next Steps**: What should be done next
4. **Decision**: One of:
   - CONTINUE: Build on existing work
   - RESTART: Start fresh (if approach was wrong)
   - BLOCKED: Needs human intervention (explain why)

Format your response as markdown that can be appended to the prompt file.
Start with a timestamp header: ## Compaction Summary - [timestamp]`;

  try {
    const result = await ask(prompt, { timeout: 60000 });
    return result.text;
  } catch (error) {
    // Fallback summary if oracle fails
    return `## Compaction Summary - ${new Date().toISOString()}

**Note**: Oracle unavailable, generated basic summary.

### Session Info
${transcriptSummary}

### Git Status
\`\`\`
${gitStatus}
\`\`\`

### Decision
CONTINUE - Proceed from current state.
`;
  }
}

/**
 * Handle pre-compaction lifecycle event.
 *
 * When context gets too long and compaction is triggered:
 * 1. If PROMPT_NUMBER is set:
 *    - Parse transcript for session summary
 *    - Get git status (file changes)
 *    - Call oracle to generate summary/decision
 *    - Append summary to prompt file
 * 2. Kill the tmux window (terminate the Claude instance)
 * 3. Event loop can then re-run the prompt with learnings
 *
 * Triggered by: PreCompact matcher "*"
 */
export async function handleAgentCompact(input: HookInput): Promise<void> {
  const agentId = process.env.AGENT_ID;
  const promptNumber = process.env.PROMPT_NUMBER;
  const transcriptPath = input.transcript_path;

  // Use current session (not hardcoded SESSION_NAME) since agents may be
  // spawned in whatever session is active, not necessarily 'ah-hub'
  const sessionName = getCurrentSession() || SESSION_NAME;

  // If no prompt number, just kill the window (not a managed prompt execution)
  if (!promptNumber) {
    sendNotification({
      title: 'Context Compaction',
      message: 'Agent context limit reached, terminating',
      type: 'banner',
    });

    if (agentId && windowExists(sessionName, agentId)) {
      killWindow(sessionName, agentId);
    }

    outputPreCompact(undefined, HOOK_AGENT_COMPACT);
    return;
  }

  // Get the planning key from env or current branch
  let spec = process.env.SPEC_NAME;
  if (!spec) {
    const branch = getCurrentBranch();
    const currentSpec = getSpecForBranch(branch);
    if (currentSpec) {
      spec = sanitizeBranchForDir(branch);
    }
  }
  if (!spec) {
    // No spec, just kill the window
    if (agentId && windowExists(sessionName, agentId)) {
      killWindow(sessionName, agentId);
    }
    outputPreCompact(undefined, HOOK_AGENT_COMPACT);
    return;
  }

  // Get the prompt file
  const promptNum = parseInt(promptNumber, 10);
  const prompt = getPromptByNumber(promptNum, spec);

  if (!prompt) {
    // Prompt file not found, just kill
    if (agentId && windowExists(sessionName, agentId)) {
      killWindow(sessionName, agentId);
    }
    outputPreCompact(undefined, HOOK_AGENT_COMPACT);
    return;
  }

  try {
    // Parse transcript
    let transcriptSummary = '(No transcript available)';
    if (transcriptPath && existsSync(transcriptPath)) {
      const parsed = await parseTranscript(transcriptPath);
      transcriptSummary = buildCompactionMessage(parsed);
    }

    // Get git status
    const gitStatus = getGitStatus();

    // Generate summary via oracle
    const summary = await generateCompactionSummary(
      transcriptSummary,
      gitStatus,
      prompt.body
    );

    // Append summary to prompt file
    appendFileSync(prompt.path, `\n\n${summary}\n`);

    // Send notification
    sendNotification({
      title: 'Compaction Complete',
      message: `Prompt ${promptNumber} summary saved, terminating agent`,
      type: 'banner',
    });
  } catch (error) {
    // Log error but continue with termination
    const errorMsg = error instanceof Error ? error.message : String(error);
    sendNotification({
      title: 'Compaction Warning',
      message: `Error saving summary: ${errorMsg.slice(0, 50)}`,
      type: 'banner',
    });
  }

  // Kill the tmux window
  if (agentId && windowExists(sessionName, agentId)) {
    killWindow(sessionName, agentId);
  }

  outputPreCompact(undefined, HOOK_AGENT_COMPACT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register lifecycle hook subcommands.
 */
export function register(parent: Command): void {
  const lifecycle = parent
    .command('lifecycle')
    .description('Lifecycle hooks (Stop, PreCompact)');

  lifecycle
    .command('agent-stop')
    .description('Handle agent stop event')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_AGENT_STOP, { agentId: process.env.AGENT_ID });
        handleAgentStop(input);
      } catch {
        // On error, approve stop
        logHookSuccess(HOOK_AGENT_STOP, { action: 'approve', error: true });
        console.log(JSON.stringify({ decision: 'approve' }));
        process.exit(0);
      }
    });

  lifecycle
    .command('agent-compact')
    .description('Handle pre-compaction event')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_AGENT_COMPACT, {
          agentId: process.env.AGENT_ID,
          promptNumber: process.env.PROMPT_NUMBER,
        });
        await handleAgentCompact(input);
      } catch {
        // On error, continue without context
        logHookSuccess(HOOK_AGENT_COMPACT, { action: 'continue', error: true });
        console.log(JSON.stringify({ continue: true }));
        process.exit(0);
      }
    });
}
