/**
 * Enforcement Hooks
 *
 * PreToolUse hooks that enforce usage patterns:
 * - Block GitHub URLs in WebFetch/Bash (suggest gh CLI)
 * - Block WebFetch (suggest research tools)
 * - Block WebSearch (suggest research delegation)
 */

import type { Command } from 'commander';
import {
  HookInput,
  HookCategory,
  RegisterFn,
  allowTool,
  denyTool,
  registerCategory,
  registerCategoryForDaemon,
} from './shared.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GITHUB_DOMAINS = ['github.com', 'raw.githubusercontent.com', 'gist.github.com'];

// ─────────────────────────────────────────────────────────────────────────────
// GitHub URL Enforcement
// ─────────────────────────────────────────────────────────────────────────────

const HOOK_GITHUB_URL = 'enforcement github-url';

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
        denyTool("GitHub URL detected. Use 'gh' CLI: gh api repos/OWNER/REPO/contents/PATH", HOOK_GITHUB_URL);
      }
    }
    allowTool(HOOK_GITHUB_URL);
  }

  // Check Bash commands for curl, wget, tavily extract
  if (toolName === 'Bash') {
    const command = (toolInput.command as string) || '';

    // Check for fetch-like commands
    const isFetchCmd = ['curl', 'wget', 'tavily extract'].some((cmd) => command.includes(cmd));
    if (!isFetchCmd) {
      allowTool(HOOK_GITHUB_URL);
    }

    // Check for GitHub URLs
    for (const domain of GITHUB_DOMAINS) {
      if (command.includes(domain)) {
        denyTool("GitHub URL detected. Use 'gh' CLI: gh api repos/OWNER/REPO/contents/PATH", HOOK_GITHUB_URL);
      }
    }
  }

  allowTool(HOOK_GITHUB_URL);
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Fetch Enforcement
// ─────────────────────────────────────────────────────────────────────────────

const HOOK_RESEARCH_FETCH = 'enforcement research-fetch';

/**
 * Block WebFetch and suggest research tools.
 *
 * Triggered by: PreToolUse matcher "WebFetch"
 */
export function enforceResearchFetch(input: HookInput): void {
  const url = (input.tool_input?.url as string) || '';

  if (!url) {
    allowTool(HOOK_RESEARCH_FETCH);
  }

  denyTool(
    'WebFetch blocked. Use `ah tavily extract "<url>"` instead.',
    HOOK_RESEARCH_FETCH
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Search Enforcement
// ─────────────────────────────────────────────────────────────────────────────

const HOOK_RESEARCH_SEARCH = 'enforcement research-search';

/**
 * Block WebSearch and suggest research delegation.
 *
 * Triggered by: PreToolUse matcher "WebSearch"
 */
export function enforceResearchSearch(_input: HookInput): void {
  denyTool(
    'WebSearch blocked. Use `ah perplexity research "<query>"` instead.',
    HOOK_RESEARCH_SEARCH
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Category Definition
// ─────────────────────────────────────────────────────────────────────────────

/** Enforcement hooks category */
export const category: HookCategory = {
  name: 'enforcement',
  description: 'Enforcement hooks (PreToolUse)',
  hooks: [
    {
      name: 'github-url',
      description: 'Block GitHub URLs in fetch commands',
      handler: enforceGitHubUrl,
      errorFallback: { type: 'allowTool' },
      logPayload: (input) => ({ tool: input.tool_name }),
    },
    {
      name: 'research-fetch',
      description: 'Block WebFetch and suggest `ah tavily extract "<url>"` instead',
      handler: enforceResearchFetch,
      errorFallback: { type: 'allowTool' },
      logPayload: (input) => ({ tool: input.tool_name }),
    },
    {
      name: 'research-search',
      description: 'Block WebSearch and suggest `ah perplexity research "<query>"` instead',
      handler: enforceResearchSearch,
      errorFallback: { type: 'allowTool' },
      logPayload: (input) => ({ tool: input.tool_name }),
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register enforcement hook subcommands.
 */
export function register(parent: Command): void {
  registerCategory(parent, category);
}

// ─────────────────────────────────────────────────────────────────────────────
// Daemon Handler Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register handlers for daemon mode.
 */
export function registerDaemonHandlers(register: RegisterFn): void {
  registerCategoryForDaemon(category, register);
}
