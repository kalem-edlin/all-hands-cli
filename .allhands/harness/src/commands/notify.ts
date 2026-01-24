/**
 * Notification Commands
 *
 * Desktop notifications via jamf/Notifier (macOS).
 * For direct CLI notification sending.
 *
 * Commands:
 * - ah notify send <title> <message>    - Send a notification
 *
 * For hook-based notifications (idle, elicitation), see:
 *   ah hooks notification --help
 *
 * Requires: https://github.com/jamf/Notifier
 * Install: brew install --cask notifier
 */

import { Command } from 'commander';
import { sendNotification } from '../lib/notification.js';

export function register(program: Command): void {
  const notify = program
    .command('notify')
    .description('Desktop notifications (direct CLI use)');

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
}
