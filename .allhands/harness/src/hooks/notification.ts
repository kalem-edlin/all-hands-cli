/**
 * Notification Hooks
 *
 * Hooks that send desktop notifications for various Claude Code events:
 * - stop: Agent has stopped working (Stop:*)
 * - compact: Context is being compacted (PreCompact:*)
 *
 * Uses jamf/Notifier for macOS notifications.
 */

import type { Command } from 'commander';
import { HookInput, readHookInput } from './shared.js';
import { sendGateNotification } from '../lib/notification.js';
import { logHookStart, logHookSuccess } from '../lib/trace-store.js';

const HOOK_STOP = 'notification stop';
const HOOK_COMPACT = 'notification compact';

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
  logHookSuccess(HOOK_STOP, { action: 'approve' });
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
  logHookSuccess(HOOK_COMPACT, { action: 'continue' });
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

  // ah hooks notification stop
  notification
    .command('stop')
    .description('Handle stop notification (Stop:*)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_STOP, {});
        handleStopNotification(input);
      } catch {
        // On error, approve stop
        logHookSuccess(HOOK_STOP, { action: 'approve', error: true });
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
        logHookStart(HOOK_COMPACT, {});
        handleCompactNotification(input);
      } catch {
        // On error, allow compaction
        logHookSuccess(HOOK_COMPACT, { action: 'continue', error: true });
        console.log(JSON.stringify({ continue: true }));
        process.exit(0);
      }
    });
}
