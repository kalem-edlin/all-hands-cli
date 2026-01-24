/**
 * Notification Hooks
 *
 * Hooks that send desktop notifications for various Claude Code events:
 * - idle: Agent is idle/waiting for input (Notification:idle_prompt)
 * - elicitation: Agent is asking a question (PreToolUse:AskUserQuestion)
 *
 * Uses jamf/Notifier for macOS notifications.
 */

import type { Command } from 'commander';
import { HookInput, readHookInput, allowTool } from './shared.js';
import { sendGateNotification } from '../lib/notification.js';

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse: AskUserQuestion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle elicitation notification (AskUserQuestion).
 *
 * Sends an alert notification when the agent is asking the user a question,
 * so the user knows they need to respond.
 *
 * Triggered by: PreToolUse matcher "AskUserQuestion"
 */
function handleElicitationNotification(input: HookInput): void {
  // Extract question preview from tool input
  const questions = input.tool_input?.questions as Array<{ question?: string }> | undefined;
  const firstQuestion = questions?.[0]?.question || 'Agent has a question';

  // Truncate for notification display
  const preview = firstQuestion.length > 60
    ? firstQuestion.slice(0, 57) + '...'
    : firstQuestion;

  sendGateNotification('Question', preview);

  // Allow the tool to proceed
  allowTool();
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop: Agent stopped
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle stop notification.
 *
 * Sends a notification when the agent has stopped working.
 *
 * Triggered by: Stop matcher "*"
 */
function handleStopNotification(_input: HookInput): void {
  sendGateNotification('Stopped', 'Agent has finished');

  // Output approval to allow stop
  console.log(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// PreCompact: Context compaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle pre-compact notification.
 *
 * Sends a notification when the agent is about to compact context.
 *
 * Triggered by: PreCompact matcher "*"
 */
function handleCompactNotification(_input: HookInput): void {
  sendGateNotification('Compacting', 'Context is being summarized');

  // Output to allow compaction to proceed
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register notification hook subcommands.
 */
export function register(parent: Command): void {
  const notification = parent
    .command('notification')
    .description('Notification hooks (desktop alerts for events)');

  // ah hooks notification elicitation
  notification
    .command('elicitation')
    .description('Handle question notification (PreToolUse:AskUserQuestion)')
    .action(async () => {
      try {
        const input = await readHookInput();
        handleElicitationNotification(input);
      } catch {
        // On error, allow tool
        allowTool();
      }
    });

  // ah hooks notification stop
  notification
    .command('stop')
    .description('Handle stop notification (Stop:*)')
    .action(async () => {
      try {
        const input = await readHookInput();
        handleStopNotification(input);
      } catch {
        // On error, approve stop
        console.log(JSON.stringify({ decision: 'approve' }));
        process.exit(0);
      }
    });

  // ah hooks notification compact
  notification
    .command('compact')
    .description('Handle compact notification (PreCompact:*)')
    .action(async () => {
      try {
        const input = await readHookInput();
        handleCompactNotification(input);
      } catch {
        // On error, allow compaction
        console.log(JSON.stringify({ continue: true }));
        process.exit(0);
      }
    });
}
