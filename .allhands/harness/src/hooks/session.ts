/**
 * Session Hooks - Session lifecycle management
 *
 * Hooks for session start/resume events:
 * - TLDR cache warming (async, non-blocking)
 */

import type { Command } from 'commander';
import { readHookInput, getProjectDir } from './shared.js';
import { isTldrInstalled, isTldrDaemonRunning, warmIndex } from '../lib/tldr.js';
import { logHookStart, logHookSuccess } from '../lib/trace-store.js';

const HOOK_TLDR_WARM = 'session tldr-warm';

// ─────────────────────────────────────────────────────────────────────────────
// SessionStart: tldr-warm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Warm TLDR cache on session start/resume.
 *
 * This hook runs asynchronously and non-blocking:
 * - If TLDR is not installed, exits silently
 * - If daemon is already running, exits silently
 * - Otherwise, starts daemon in background
 *
 * Triggered by: SessionStart matcher "*"
 */
async function tldrWarm(): Promise<void> {
  const projectDir = getProjectDir();

  // Skip if TLDR not installed
  if (!isTldrInstalled()) {
    logHookSuccess(HOOK_TLDR_WARM, { action: 'skip', reason: 'not_installed' });
    console.log('{}');
    process.exit(0);
  }

  // Skip if daemon already running
  if (isTldrDaemonRunning(projectDir)) {
    logHookSuccess(HOOK_TLDR_WARM, { action: 'skip', reason: 'daemon_running' });
    console.log('{}');
    process.exit(0);
  }

  // Start warming in background (non-blocking)
  try {
    await warmIndex(projectDir);
    logHookSuccess(HOOK_TLDR_WARM, { action: 'warmed' });
  } catch {
    // Ignore errors - best effort warming
    logHookSuccess(HOOK_TLDR_WARM, { action: 'skip', reason: 'error' });
  }

  // Always succeed - don't block session start
  console.log('{}');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register session hook subcommands.
 */
export function register(parent: Command): void {
  const session = parent
    .command('session')
    .description('Session lifecycle hooks');

  session
    .command('tldr-warm')
    .description('Warm TLDR cache on session start (SessionStart)')
    .action(async () => {
      try {
        // Read input but don't require it
        await readHookInput().catch(() => ({}));
        logHookStart(HOOK_TLDR_WARM, {});
        await tldrWarm();
      } catch {
        // On any error, exit cleanly
        logHookSuccess(HOOK_TLDR_WARM, { action: 'skip', reason: 'error' });
        console.log('{}');
        process.exit(0);
      }
    });
}
