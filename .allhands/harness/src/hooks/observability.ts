/**
 * Observability Hooks
 *
 * Centralized event tracking for debugging and analysis.
 * All events are logged to SQLite + JSONL via trace-store.
 *
 * Events captured:
 * - session-start: Agent session initialized
 * - prompt-submit: User prompt submitted
 * - tool-pre: Pre-tool use (filtered by inclusion list)
 * - tool-post: Post-tool use (filtered by inclusion list)
 * - task-spawn: Task/subagent spawned (special handling for rich metadata)
 * - agent-stop: Agent stopped
 *
 * Filtering:
 * - Bash commands are filtered to only log valuable commands (tldr, ast-grep, git, etc.)
 * - Bash(ah*) is excluded to avoid recursion
 * - Low-value tools (Glob, Grep, Read) are excluded
 * - Task spawns are always logged with full metadata
 */

import type { Command } from 'commander';
import {
  HookInput,
  HookCategory,
  RegisterFn,
  allowTool,
  registerCategory,
  registerCategoryForDaemon,
} from './shared.js';
import { logEvent } from '../lib/trace-store.js';

// ─────────────────────────────────────────────────────────────────────────────
// Filtering Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tools to ALWAYS log (high-value orchestration)
 */
const ALWAYS_LOG_TOOLS = new Set([
  'Task',
  'EnterPlanMode',
  'ExitPlanMode',
  'AskUserQuestion',
  'Write',
  'Edit',
  'NotebookEdit',
]);

/**
 * Tools to NEVER log (high-frequency, low-value)
 */
const NEVER_LOG_TOOLS = new Set([
  'Glob',
  'Grep',
  'Read',
  'TaskList',
  'TaskGet',
  'TaskCreate',
  'TaskUpdate',
  'TaskOutput',
  'TaskStop',
]);

/**
 * Bash command prefixes to log (valuable for debugging)
 */
const BASH_LOG_PREFIXES = [
  'tldr',
  'ast-grep',
  'sg',  // ast-grep alias
  'git',
  'npm',
  'pnpm',
  'yarn',
  'pytest',
  'vitest',
  'jest',
  'docker',
  'make',
  'cargo',
  'go ',
  'python',
  'node',
  'uv',
  'pip',
];

/**
 * Bash command prefixes to NEVER log (avoid recursion)
 */
const BASH_EXCLUDE_PREFIXES = [
  'ah ',
  'ah\t',
  'echo ',
  'cat ',
  'ls ',
  'cd ',
  'pwd',
];

// ─────────────────────────────────────────────────────────────────────────────
// Filtering Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine if a tool use should be logged
 */
function shouldLogTool(toolName: string, toolInput: Record<string, unknown>): boolean {
  // Always log these
  if (ALWAYS_LOG_TOOLS.has(toolName)) {
    return true;
  }

  // Never log these
  if (NEVER_LOG_TOOLS.has(toolName)) {
    return false;
  }

  // Special handling for Bash
  if (toolName === 'Bash') {
    const command = String(toolInput.command || '').trim().toLowerCase();

    // Exclude certain prefixes
    for (const prefix of BASH_EXCLUDE_PREFIXES) {
      if (command.startsWith(prefix.toLowerCase())) {
        return false;
      }
    }

    // Include if matches valuable prefixes
    for (const prefix of BASH_LOG_PREFIXES) {
      if (command.startsWith(prefix.toLowerCase())) {
        return true;
      }
    }

    // Default: don't log unknown bash commands
    return false;
  }

  // Default: log other tools (WebFetch, WebSearch, etc.)
  return true;
}

/**
 * Extract a summary of the bash command for logging
 */
function summarizeBashCommand(command: string): string {
  // Get first line only
  const firstLine = command.split('\n')[0].trim();

  // Truncate if too long
  if (firstLine.length > 200) {
    return firstLine.slice(0, 200) + '...';
  }

  return firstLine;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle session start event
 */
function handleSessionStart(input: HookInput): void {
  logEvent('session.start', {
    session_id: input.session_id,
    transcript_path: input.transcript_path,
  });

  // Silent exit - don't modify session start
  process.exit(0);
}

/**
 * Handle user prompt submit event
 */
function handlePromptSubmit(input: HookInput): void {
  // Extract prompt from tool_input if present
  const prompt = input.tool_input?.prompt || input.tool_input?.message || '(no prompt captured)';

  logEvent('prompt.submit', {
    session_id: input.session_id,
    prompt,
  });

  // Silent exit
  process.exit(0);
}

/**
 * Handle pre-tool use event (filtered)
 */
function handleToolPre(input: HookInput): void {
  const toolName = input.tool_name || 'unknown';
  const toolInput = input.tool_input || {};

  if (!shouldLogTool(toolName, toolInput)) {
    // Silent exit - don't log this tool
    allowTool();
  }

  // Build payload
  const payload: Record<string, unknown> = {
    session_id: input.session_id,
  };

  // Add tool-specific info
  if (toolName === 'Bash') {
    payload.command_summary = summarizeBashCommand(String(toolInput.command || ''));
    payload.timeout = toolInput.timeout;
  } else if (toolName === 'Task') {
    // Rich metadata for Task spawns
    payload.subagent_type = toolInput.subagent_type;
    payload.description = toolInput.description;
    payload.prompt_preview = String(toolInput.prompt || '').slice(0, 200);
    payload.model = toolInput.model;
    payload.run_in_background = toolInput.run_in_background;
  } else if (toolName === 'Write' || toolName === 'Edit') {
    payload.file_path = toolInput.file_path;
  } else if (toolName === 'AskUserQuestion') {
    payload.questions = toolInput.questions;
  } else {
    // Generic: include a subset of input keys
    const inputKeys = Object.keys(toolInput).slice(0, 5);
    for (const key of inputKeys) {
      payload[key] = toolInput[key];
    }
  }

  logEvent('tool.pre', payload, toolName);

  // Allow the tool
  allowTool();
}

/**
 * Detect if a bash result indicates an error
 */
function isBashError(toolResult: unknown): { isError: boolean; exitCode?: number; stderr?: string } {
  if (typeof toolResult === 'string') {
    // Check for common error patterns in output
    const lowerResult = toolResult.toLowerCase();
    if (
      lowerResult.includes('error:') ||
      lowerResult.includes('command not found') ||
      lowerResult.includes('no such file or directory') ||
      lowerResult.includes('permission denied') ||
      lowerResult.includes('fatal:') ||
      lowerResult.includes('traceback (most recent call last)') ||
      lowerResult.includes('syntaxerror:') ||
      lowerResult.includes('typeerror:') ||
      lowerResult.includes('exception:')
    ) {
      return { isError: true, stderr: toolResult.slice(0, 500) };
    }
  }

  // Check if result is an object with error info
  if (typeof toolResult === 'object' && toolResult !== null) {
    const result = toolResult as Record<string, unknown>;
    if (result.exitCode && result.exitCode !== 0) {
      return {
        isError: true,
        exitCode: result.exitCode as number,
        stderr: result.stderr ? String(result.stderr).slice(0, 500) : undefined,
      };
    }
    if (result.error) {
      return { isError: true, stderr: String(result.error).slice(0, 500) };
    }
  }

  return { isError: false };
}

/**
 * Handle post-tool use event (filtered)
 */
function handleToolPost(input: HookInput): void {
  const toolName = input.tool_name || 'unknown';
  const toolInput = input.tool_input || {};

  if (!shouldLogTool(toolName, toolInput)) {
    // Silent exit
    process.exit(0);
  }

  // Check for bash errors
  if (toolName === 'Bash') {
    const errorCheck = isBashError(input.tool_result);
    if (errorCheck.isError) {
      // Log as bash.error instead of tool.post
      logEvent('bash.error', {
        session_id: input.session_id,
        command_summary: summarizeBashCommand(String(toolInput.command || '')),
        exit_code: errorCheck.exitCode,
        stderr: errorCheck.stderr,
      }, 'Bash');

      process.exit(0);
    }
  }

  // Build payload for successful execution
  const payload: Record<string, unknown> = {
    session_id: input.session_id,
  };

  // Add result summary (truncated)
  if (input.tool_result !== undefined) {
    const resultStr = typeof input.tool_result === 'string'
      ? input.tool_result
      : JSON.stringify(input.tool_result);

    payload.result_preview = resultStr.slice(0, 300);
    payload.result_length = resultStr.length;
  }

  // Add tool-specific info
  if (toolName === 'Write' || toolName === 'Edit') {
    payload.file_path = toolInput.file_path;
  } else if (toolName === 'Task') {
    payload.subagent_type = toolInput.subagent_type;
    payload.description = toolInput.description;
  } else if (toolName === 'Bash') {
    payload.command_summary = summarizeBashCommand(String(toolInput.command || ''));
  }

  logEvent('tool.post', payload, toolName);

  // Silent exit
  process.exit(0);
}

/**
 * Handle tool failure event (PostToolUseFailure hook)
 * This fires when a tool returns an error result
 */
function handleToolFailure(input: HookInput): void {
  const toolName = input.tool_name || 'unknown';
  const toolInput = input.tool_input || {};

  // Log ALL failures (important for debugging)
  const payload: Record<string, unknown> = {
    session_id: input.session_id,
  };

  // Add tool-specific context
  if (toolName === 'Bash') {
    payload.command_summary = summarizeBashCommand(String(toolInput.command || ''));
  } else if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Read') {
    payload.file_path = toolInput.file_path;
  } else if (toolName === 'Task') {
    payload.subagent_type = toolInput.subagent_type;
    payload.description = toolInput.description;
  } else {
    // For other tools, include a subset of input
    const inputKeys = Object.keys(toolInput).slice(0, 5);
    for (const key of inputKeys) {
      payload[`input_${key}`] = toolInput[key];
    }
  }

  // Add error from result
  if (input.tool_result !== undefined) {
    const resultStr = typeof input.tool_result === 'string'
      ? input.tool_result
      : JSON.stringify(input.tool_result);

    payload.error = resultStr.slice(0, 500);
  }

  logEvent('tool.failure', payload, toolName);

  // Silent exit
  process.exit(0);
}

/**
 * Handle tool denial event (when a PreToolUse hook denies the tool)
 */
function handleToolDenied(input: HookInput, reason: string): void {
  const toolName = input.tool_name || 'unknown';
  const toolInput = input.tool_input || {};

  const payload: Record<string, unknown> = {
    session_id: input.session_id,
    denial_reason: reason,
  };

  // Add tool-specific context
  if (toolName === 'Bash') {
    payload.command_summary = summarizeBashCommand(String(toolInput.command || ''));
  } else if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Read') {
    payload.file_path = toolInput.file_path;
  } else if (toolName === 'Task') {
    payload.subagent_type = toolInput.subagent_type;
    payload.description = toolInput.description;
  }

  logEvent('tool.denied', payload, toolName);
}

/**
 * Handle Task spawn event (special - always logged with rich metadata)
 *
 * This is separate from tool-pre because Task spawns are critical
 * for understanding agent orchestration and should capture all metadata.
 */
function handleTaskSpawn(input: HookInput): void {
  const toolInput = input.tool_input || {};

  const payload: Record<string, unknown> = {
    session_id: input.session_id,
    subagent_type: toolInput.subagent_type,
    description: toolInput.description,
    prompt: toolInput.prompt, // Full prompt for Task spawns
    model: toolInput.model,
    run_in_background: toolInput.run_in_background,
    allowed_tools: toolInput.allowed_tools,
    max_turns: toolInput.max_turns,
  };

  logEvent('agent.spawn', payload, 'Task');

  // Allow the task
  allowTool();
}

/**
 * Handle agent stop event
 */
function handleAgentStop(input: HookInput): void {
  try {
    logEvent('agent.stop', {
      session_id: input.session_id,
      transcript_path: input.transcript_path,
      stop_hook_active: input.stop_hook_active,
    });
  } catch {
    // Silent failure - don't break the stop hook
  }

  // Let the lifecycle hook handle the actual stop
  process.exit(0);
}

/**
 * Handle agent compact event
 */
function handleAgentCompact(input: HookInput): void {
  try {
    logEvent('agent.compact', {
      session_id: input.session_id,
      transcript_path: input.transcript_path,
    });
  } catch {
    // Silent failure - don't break the compact hook
  }

  // Let the lifecycle hook handle the actual compaction
  process.exit(0);
}

/**
 * Handle pre-tool use (combined handler with Task routing)
 */
function handleToolPreWithTaskRouting(input: HookInput): void {
  if (input.tool_name === 'Task') {
    handleTaskSpawn(input);
  } else {
    handleToolPre(input);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Category Definition
// ─────────────────────────────────────────────────────────────────────────────

/** Observability hooks category */
export const category: HookCategory = {
  name: 'observability',
  description: 'Observability hooks for event tracking',
  hooks: [
    {
      name: 'session-start',
      description: 'Log session start event',
      handler: handleSessionStart,
      errorFallback: { type: 'silent' },
    },
    {
      name: 'prompt-submit',
      description: 'Log user prompt submit event',
      handler: handlePromptSubmit,
      errorFallback: { type: 'silent' },
    },
    {
      name: 'tool-pre',
      description: 'Log pre-tool use event (filtered)',
      handler: handleToolPreWithTaskRouting,
      errorFallback: { type: 'silent' },
    },
    {
      name: 'tool-post',
      description: 'Log post-tool use event (filtered)',
      handler: handleToolPost,
      errorFallback: { type: 'silent' },
    },
    {
      name: 'tool-failure',
      description: 'Log tool failure event',
      handler: handleToolFailure,
      errorFallback: { type: 'silent' },
    },
    {
      name: 'agent-stop',
      description: 'Log agent stop event',
      handler: handleAgentStop,
      errorFallback: { type: 'silent' },
    },
    {
      name: 'agent-compact',
      description: 'Log agent compact event',
      handler: handleAgentCompact,
      errorFallback: { type: 'silent' },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

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
