/**
 * Notification Commands
 *
 * Desktop notifications via jamf/Notifier (macOS).
 * Designed for use from Claude Code hooks.
 *
 * Commands:
 * - ah notify send <title> <message>    - Send a notification
 * - ah notify gate <type> <message>     - Send a gate notification (alert)
 * - ah notify hook <type> <message>     - Send a hook notification (banner)
 *
 * Requires: https://github.com/jamf/Notifier
 * Install: brew install --cask notifier
 */

import { Command } from 'commander';
import {
  sendNotification,
  sendGateNotification,
  sendHookNotification,
} from '../lib/notification.js';

export function register(program: Command): void {
  const notify = program
    .command('notify')
    .description('Desktop notifications for Claude Code hooks');

  // ah notify send <title> <message>
  notify
    .command('send <title> <message>')
    .description('Send a system notification')
    .option('--sound <name>', 'Sound name (macOS system sounds)')
    .option('-t, --type <type>', 'Notification type: banner or alert', 'banner')
    .option('--json', 'Output as JSON')
    .action(
      async (
        title: string,
        message: string,
        options: { sound?: string; type?: string; json?: boolean }
      ) => {
        const type = options.type as 'banner' | 'alert' | undefined;
        const sent = sendNotification({
          title,
          message,
          sound: options.sound,
          type,
        });

        const result = sent
          ? { success: true, sent: true, title, message }
          : { success: false, sent: false, reason: 'notifier not available or failed' };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (sent) {
          console.log(`Notification sent: ${title}`);
        } else {
          console.error('Failed to send notification (notifier not installed?)');
          process.exit(1);
        }
      }
    );

  // ah notify gate <gate_type> <message>
  notify
    .command('gate <gate_type> <message>')
    .description('Send a gate notification (persistent alert)')
    .option('--json', 'Output as JSON')
    .action(
      async (gateType: string, message: string, options: { json?: boolean }) => {
        const sent = sendGateNotification(gateType, message);

        const result = sent
          ? { success: true, sent: true, gate_type: gateType }
          : { success: false, sent: false, reason: 'notifier not available or failed' };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (sent) {
          console.log(`Gate notification sent: ${gateType}`);
        } else {
          console.error('Failed to send notification (notifier not installed?)');
          process.exit(1);
        }
      }
    );

  // ah notify hook <hook_type> <message>
  notify
    .command('hook <hook_type> <message>')
    .description('Send a hook notification (auto-dismiss banner)')
    .option('--json', 'Output as JSON')
    .action(
      async (hookType: string, message: string, options: { json?: boolean }) => {
        const sent = sendHookNotification(hookType, message);

        const result = sent
          ? { success: true, sent: true, hook_type: hookType }
          : { success: false, sent: false, reason: 'notifier not available or failed' };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (sent) {
          console.log(`Hook notification sent: ${hookType}`);
        } else {
          console.error('Failed to send notification (notifier not installed?)');
          process.exit(1);
        }
      }
    );
}
