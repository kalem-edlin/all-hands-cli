/**
 * Sub-agent infrastructure for envoy.
 * Uses OpenCode SDK to spawn agents for specialized tasks.
 */

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

export { AgentRunner } from "./runner.js";
