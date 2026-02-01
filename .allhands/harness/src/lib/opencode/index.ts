/**
 * OpenCode SDK integration for All Hands.
 *
 * This module provides:
 * - Agent profiles: YAML-defined configurations for TUI-spawned agents
 * - Agent runner: OpenCode SDK wrapper for sub-agent execution
 */

// Re-export profile management
export * from './profiles.js';

// MCP server configuration (matches opencode SDK McpLocalConfig)
export interface McpServerConfig {
  type: "local";
  command: string[]; // Command and args as array: ["uvx", "--from", "pkg", "server"]
  environment?: Record<string, string>;
  enabled?: boolean;
}

// Agent configuration
export interface AgentConfig {
  name: string;
  systemPrompt: string;
  model?: string;
  timeoutMs?: number;
  steps?: number; // Hard limit on agent iterations
  mcp?: Record<string, McpServerConfig>; // MCP servers to enable
}

// Agent execution result
export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    model: string;
    tokens_used?: number;
    duration_ms: number;
    fallback?: boolean;
    primary_error?: string;
  };
}

// Search result type (mirrors KnowledgeService.SearchResult)
export interface SearchResult {
  resource_path: string;
  similarity: number;
  token_count: number;
  description: string;
  relevant_files: string[];
  full_resource_context?: string;
}

// Knowledge aggregator input
export interface AggregatorInput {
  query: string;
  full_results: SearchResult[];
  minimized_results: SearchResult[];
}

// Skills aggregator output
export interface SkillSearchOutput {
  guidance: string;
  relevant_skills: Array<{
    name: string;
    file: string;
    relevance: string;
    key_excerpts: string[];
    references: string[];
  }>;
  design_notes?: string[];
}

// Solutions aggregator output
export interface SolutionSearchOutput {
  guidance: string;
  relevant_solutions: Array<{
    title: string;
    file: string;
    relevance: string;
    key_excerpts: string[];
    related_memories: string[];
  }>;
  memory_insights: Array<{
    name: string;
    domain: string;
    source: string;
    relevance: string;
  }>;
  design_notes?: string[];
}

// Knowledge aggregator output
export interface AggregatorOutput {
  insight: string;
  lsp_entry_points: Array<{
    file: string;
    symbol: string | null;
    why: string;
  }>;
  design_notes?: string[];
}

// Reposearch output types
export interface RepoCodeReference {
  repo: string;        // "current" or the GitHub URL
  file: string;        // relative path within the repo
  line_start: number;
  line_end: number;
  code: string;
  context: string;
}

export interface ReposearchOutput {
  analysis: string;              // markdown research findings
  code_references: RepoCodeReference[];
  repos_analyzed: string[];
}

export { AgentRunner } from "./runner.js";

// Debug metadata for agent results (included when --debug flag is passed)
export interface AgentDebugInfo {
  model_used: string;
  time_taken_ms: number;
  fallback_used: boolean;
  primary_error?: string;
  tokens_used?: number;
}

/**
 * Conditionally enrich a payload with agent debug metadata.
 * Use with --debug flag on commands that run opencode agents.
 */
export function withDebugInfo<T extends Record<string, unknown>>(
  payload: T,
  result: AgentResult,
  debug: boolean,
): T & { _debug?: AgentDebugInfo } {
  if (!debug || !result.metadata) return payload;
  return {
    ...payload,
    _debug: {
      model_used: result.metadata.model,
      time_taken_ms: result.metadata.duration_ms,
      fallback_used: result.metadata.fallback ?? false,
      primary_error: result.metadata.primary_error,
      tokens_used: result.metadata.tokens_used,
    },
  };
}
