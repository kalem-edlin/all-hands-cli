/**
 * Utility commands for claude-envoy.
 * Includes hook event logging for Claude Code lifecycle events.
 */

import { Command } from "commander";
import { BaseCommand, CommandResult } from "./base.js";
import { log } from "../lib/observability.js";

/**
 * Hook input from Claude Code (common fields).
 */
interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  trigger?: string; // PreCompact: "manual" | "auto"
  stop_hook_active?: boolean; // Stop/SubagentStop
  transcript_path?: string; // ignored
  permission_mode?: string; // ignored
}

/**
 * Read stdin as JSON.
 */
async function readStdinJson(): Promise<HookInput> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");

    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      resolve({});
    }, 1000);

    process.stdin.on("data", (chunk) => (data += chunk));

    process.stdin.on("end", () => {
      clearTimeout(timer);
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error(`Invalid JSON input: ${e}`));
      }
    });

    process.stdin.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Log a Claude Code hook event.
 * Reads hook input from stdin and logs relevant fields.
 */
class LogEventCommand extends BaseCommand {
  readonly name = "log-event";
  readonly description = "Log a Claude Code hook event (reads stdin JSON)";

  defineArguments(cmd: Command): void {
    cmd.argument("<event>", "Event name (e.g., SubagentStop, PreCompact)");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const eventArg = args.event as string;
    const input = await readStdinJson();

    // Use hook_event_name from input if available, else use arg
    const eventName = input.hook_event_name || eventArg;

    // Build context with relevant fields only
    const context: Record<string, unknown> = {
      session_id: input.session_id,
    };

    // Add event-specific fields
    if (eventName === "PreCompact" && input.trigger !== undefined) {
      context.trigger = input.trigger;
    }
    if (
      (eventName === "Stop" || eventName === "SubagentStop") &&
      input.stop_hook_active !== undefined
    ) {
      context.stop_hook_active = input.stop_hook_active;
    }

    // Log directly (not via executeWithLogging to avoid double-logging)
    log({
      level: "info",
      command: `hook.${eventName}`,
      context,
    });

    return this.success({ logged: true, event: eventName });
  }
}

export const COMMANDS = {
  "log-event": LogEventCommand,
};
