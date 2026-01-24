/**
 * Enforcement Hooks
 *
 * PreToolUse hooks that enforce usage patterns:
 * - Block GitHub URLs in WebFetch/Bash (suggest gh CLI)
 * - Block WebFetch (suggest research tools)
 * - Block WebSearch (suggest research delegation)
 */

import type { Command } from 'commander';
import { HookInput, denyTool, allowTool, readHookInput } from './shared.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GITHUB_DOMAINS = ['github.com', 'raw.githubusercontent.com', 'gist.github.com'];

// ─────────────────────────────────────────────────────────────────────────────
// GitHub URL Enforcement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block GitHub URLs in WebFetch and Bash fetch commands.
 * Suggests using the gh CLI instead.
 *
 * Triggered by: PreToolUse matcher "(WebFetch|Bash)"
 */
export function enforceGitHubUrl(input: HookInput): void {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Check WebFetch URLs
  if (toolName === 'WebFetch') {
    const url = (toolInput.url as string) || '';
    for (const domain of GITHUB_DOMAINS) {
      if (url.includes(domain)) {
        denyTool("GitHub URL detected. Use 'gh' CLI: gh api repos/OWNER/REPO/contents/PATH");
      }
    }
    allowTool();
  }

  // Check Bash commands for curl, wget, tavily extract
  if (toolName === 'Bash') {
    const command = (toolInput.command as string) || '';

    // Check for fetch-like commands
    const isFetchCmd = ['curl', 'wget', 'tavily extract'].some((cmd) => command.includes(cmd));
    if (!isFetchCmd) {
      allowTool();
    }

    // Check for GitHub URLs
    for (const domain of GITHUB_DOMAINS) {
      if (command.includes(domain)) {
        denyTool("GitHub URL detected. Use 'gh' CLI: gh api repos/OWNER/REPO/contents/PATH");
      }
    }
  }

  allowTool();
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Fetch Enforcement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block WebFetch and suggest research tools.
 *
 * Triggered by: PreToolUse matcher "WebFetch"
 */
export function enforceResearchFetch(input: HookInput): void {
  const url = (input.tool_input?.url as string) || '';

  if (!url) {
    allowTool();
  }

  denyTool(
    'WebFetch blocked. Main agent: delegate to researcher agent. Subagent: use `ah tavily extract "<url>"` instead.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Search Enforcement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block WebSearch and suggest research delegation.
 *
 * Triggered by: PreToolUse matcher "WebSearch"
 */
export function enforceResearchSearch(_input: HookInput): void {
  denyTool(
    'WebSearch blocked. Main agent: delegate to researcher agent. Subagent: respond to main agent requesting researcher delegation.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register enforcement hook subcommands.
 */
export function register(parent: Command): void {
  const enforcement = parent
    .command('enforcement')
    .description('Enforcement hooks (PreToolUse)');

  enforcement
    .command('github-url')
    .description('Block GitHub URLs in fetch commands')
    .action(async () => {
      try {
        const input = await readHookInput();
        enforceGitHubUrl(input);
      } catch {
        allowTool();
      }
    });

  enforcement
    .command('research-fetch')
    .description('Block WebFetch and suggest research tools')
    .action(async () => {
      try {
        const input = await readHookInput();
        enforceResearchFetch(input);
      } catch {
        allowTool();
      }
    });

  enforcement
    .command('research-search')
    .description('Block WebSearch and suggest research delegation')
    .action(async () => {
      try {
        const input = await readHookInput();
        enforceResearchSearch(input);
      } catch {
        allowTool();
      }
    });
}
