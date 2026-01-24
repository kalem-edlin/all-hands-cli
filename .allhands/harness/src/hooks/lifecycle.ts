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
import { killWindow, SESSION_NAME, windowExists } from '../lib/tmux.js';
import { getPromptByNumber } from '../lib/prompts.js';
import { ask } from '../lib/llm.js';

// ─────────────────────────────────────────────────────────────────────────────
// Agent Stop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle agent stop lifecycle event.
 *
 * - Sends desktop notification
 * - Kills tmux window if AGENT_ID is set (spawned agent)
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

  // Kill tmux window if spawned agent
  if (agentId && windowExists(SESSION_NAME, agentId)) {
    try {
      killWindow(SESSION_NAME, agentId);
    } catch {
      // Ignore errors - window might already be closed
    }
  }

  // Approve stop - allow agent to stop
  outputStopHook('approve');
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

  // If no prompt number, just kill the window (not a managed prompt execution)
  if (!promptNumber) {
    sendNotification({
      title: 'Context Compaction',
      message: 'Agent context limit reached, terminating',
      type: 'banner',
    });

    if (agentId && windowExists(SESSION_NAME, agentId)) {
      killWindow(SESSION_NAME, agentId);
    }

    outputPreCompact();
    return;
  }

  // Get the prompt file
  const promptNum = parseInt(promptNumber, 10);
  const prompt = getPromptByNumber(promptNum);

  if (!prompt) {
    // Prompt file not found, just kill
    if (agentId && windowExists(SESSION_NAME, agentId)) {
      killWindow(SESSION_NAME, agentId);
    }
    outputPreCompact();
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
  if (agentId && windowExists(SESSION_NAME, agentId)) {
    killWindow(SESSION_NAME, agentId);
  }

  outputPreCompact();
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
        handleAgentStop(input);
      } catch {
        // On error, approve stop
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
        await handleAgentCompact(input);
      } catch {
        // On error, continue without context
        console.log(JSON.stringify({ continue: true }));
        process.exit(0);
      }
    });
}
