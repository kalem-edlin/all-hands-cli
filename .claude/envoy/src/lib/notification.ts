/**
 * System notification utilities using jamf/Notifier (macOS).
 *
 * Notification structure:
 * - title: Event type (what happened)
 * - subtitle: Branch/feature context
 * - message: Specific details for the user
 *
 * Requires: https://github.com/jamf/Notifier installed at:
 *   /Applications/Utilities/Notifier.app
 * or available in PATH as 'notifier'
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { logInfo, logWarn } from "./observability.js";
import { getBranch, getRepoName } from "./git.js";

export interface NotifyOptions {
  title: string;           // Event type (required)
  message: string;         // Specific details (required)
  sound?: string;
  type?: "banner" | "alert"; // banner auto-dismisses, alert persists
}

const NOTIFIER_DEFAULT_PATH = "/Applications/Utilities/Notifier.app/Contents/MacOS/Notifier";

/**
 * Find the notifier binary path.
 */
function getNotifierPath(): string | null {
  // Check default install location
  if (existsSync(NOTIFIER_DEFAULT_PATH)) {
    return NOTIFIER_DEFAULT_PATH;
  }
  // Check if 'notifier' is in PATH
  const result = spawnSync("which", ["notifier"], { encoding: "utf-8" });
  if (result.status === 0 && result.stdout.trim()) {
    return "notifier";
  }
  return null;
}

/**
 * Send a system notification via jamf/Notifier.
 *
 * Layout:
 *   Title: event type (e.g., "Agent Stopped", "Plan Gate")
 *   Subtitle: branch name (auto-detected)
 *   Message: specific details
 */
export function sendNotification(options: NotifyOptions): boolean {
  const notifierPath = getNotifierPath();
  if (!notifierPath) {
    logWarn("notification.skip", { reason: "notifier not installed" });
    return false;
  }

  const repo = getRepoName();
  const branch = getBranch() || "unknown";
  const subtitle = repo ? `${repo} ${branch}` : branch;
  const notifType = options.type || "banner";

  const args: string[] = [
    "--type", notifType,
    "--title", options.title,
    "--subtitle", subtitle,
    "--message", options.message,
  ];

  if (options.sound) {
    args.push("--sound", options.sound);
  }

  try {
    const result = spawnSync(notifierPath, args, {
      stdio: "ignore",
      timeout: 5000,
    });

    if (result.status === 0) {
      logInfo("notification.sent", {
        title: options.title,
        message: options.message.substring(0, 50),
        branch,
        type: notifType,
      });
      return true;
    } else {
      logWarn("notification.failed", { status: result.status });
      return false;
    }
  } catch (e) {
    logWarn("notification.error", { error: String(e) });
    return false;
  }
}

/**
 * Send a gate notification. Uses alert type (persists until dismissed).
 */
export function sendGateNotification(
  gateType: string,
  message: string
): boolean {
  return sendNotification({
    title: `${gateType} Gate`,
    message,
    type: "alert",
  });
}

/**
 * Send a hook notification. Uses banner type (auto-dismisses).
 */
export function sendHookNotification(
  hookType: string,
  message: string
): boolean {
  return sendNotification({
    title: hookType,
    message,
    type: "banner",
  });
}
