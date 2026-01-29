/**
 * Transcript Parser
 *
 * Parses Claude Code JSONL transcript files to extract:
 * - Last assistant message
 * - Recent tool calls
 * - Files modified (via Edit/Write)
 * - Errors encountered
 * - Pending todos
 */

import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TranscriptSummary {
  /** Last assistant message text */
  lastAssistantMessage: string | null;
  /** Recent tool calls (name + brief input) */
  recentToolCalls: Array<{ tool: string; input: string }>;
  /** Files modified via Edit/Write */
  filesModified: string[];
  /** Errors from tool results */
  errorsEncountered: string[];
  /** Pending todos from last TodoWrite */
  pendingTodos: string[];
}

interface TranscriptEntry {
  type?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string; tool_use?: unknown }>;
  };
  tool_use?: {
    name?: string;
    input?: Record<string, unknown>;
  };
  tool_result?: {
    content?: string;
    is_error?: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a Claude Code transcript JSONL file.
 *
 * Streams the file to handle large transcripts efficiently.
 * Extracts useful summary information for compaction system messages.
 */
export async function parseTranscript(transcriptPath: string): Promise<TranscriptSummary> {
  const summary: TranscriptSummary = {
    lastAssistantMessage: null,
    recentToolCalls: [],
    filesModified: [],
    errorsEncountered: [],
    pendingTodos: [],
  };

  if (!existsSync(transcriptPath)) {
    return summary;
  }

  const fileStream = createReadStream(transcriptPath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const seenFiles = new Set<string>();
  const recentToolLimit = 20; // Keep last N tool calls

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const entry: TranscriptEntry = JSON.parse(line);

      // Extract assistant message
      if (entry.message?.role === 'assistant') {
        const content = entry.message.content;
        if (typeof content === 'string') {
          summary.lastAssistantMessage = content;
        } else if (Array.isArray(content)) {
          // Find text content
          const textBlock = content.find((b) => b.type === 'text' && b.text);
          if (textBlock?.text) {
            summary.lastAssistantMessage = textBlock.text;
          }
        }
      }

      // Extract tool uses
      if (entry.tool_use?.name) {
        const tool = entry.tool_use.name;
        const input = entry.tool_use.input || {};

        // Track tool call
        const inputSummary = summarizeToolInput(tool, input);
        summary.recentToolCalls.push({ tool, input: inputSummary });

        // Keep only recent
        if (summary.recentToolCalls.length > recentToolLimit) {
          summary.recentToolCalls.shift();
        }

        // Track file modifications
        if ((tool === 'Edit' || tool === 'Write') && typeof input.file_path === 'string') {
          if (!seenFiles.has(input.file_path)) {
            seenFiles.add(input.file_path);
            summary.filesModified.push(input.file_path);
          }
        }

        // Track todos from TodoWrite
        if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
          summary.pendingTodos = (input.todos as Array<{ content?: string; status?: string }>)
            .filter((t) => t.status === 'pending' || t.status === 'in_progress')
            .map((t) => t.content || '')
            .filter((c) => c.length > 0);
        }
      }

      // Extract errors from tool results
      if (entry.tool_result?.is_error && entry.tool_result.content) {
        const errorContent = entry.tool_result.content;
        // Truncate long errors
        const errorSummary =
          errorContent.length > 200 ? errorContent.slice(0, 200) + '...' : errorContent;
        summary.errorsEncountered.push(errorSummary);

        // Keep only recent errors
        if (summary.errorsEncountered.length > 5) {
          summary.errorsEncountered.shift();
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return summary;
}

/**
 * Create a brief summary of tool input for context.
 */
function summarizeToolInput(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return (input.file_path as string) || '';
    case 'Bash':
      const cmd = (input.command as string) || '';
      return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
    case 'Grep':
      return `pattern: ${input.pattern || ''}`;
    case 'Glob':
      return `pattern: ${input.pattern || ''}`;
    case 'Task':
      return (input.description as string) || '';
    default:
      return '';
  }
}

/**
 * Build a compact system message from transcript summary.
 * Used for PreCompact hook to provide context during conversation compaction.
 */
export function buildCompactionMessage(summary: TranscriptSummary): string {
  const parts: string[] = [];

  parts.push('## Session Context (from transcript)');

  if (summary.filesModified.length > 0) {
    parts.push('\n### Files Modified');
    summary.filesModified.slice(-10).forEach((f) => parts.push(`- ${f}`));
  }

  if (summary.pendingTodos.length > 0) {
    parts.push('\n### Pending Tasks');
    summary.pendingTodos.forEach((t) => parts.push(`- ${t}`));
  }

  if (summary.errorsEncountered.length > 0) {
    parts.push('\n### Recent Errors');
    summary.errorsEncountered.forEach((e) => parts.push(`- ${e}`));
  }

  if (summary.recentToolCalls.length > 0) {
    parts.push('\n### Recent Activity');
    summary.recentToolCalls.slice(-5).forEach((tc) => {
      const info = tc.input ? `: ${tc.input}` : '';
      parts.push(`- ${tc.tool}${info}`);
    });
  }

  return parts.join('\n');
}
