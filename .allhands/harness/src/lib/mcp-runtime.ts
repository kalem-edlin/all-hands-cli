/**
 * MCP Runtime - Lazy-loaded MCP server integration via mcptools CLI.
 *
 * This module provides:
 * - Type definitions for MCP server configs
 * - Env var interpolation (${VAR_NAME} -> process.env.VAR_NAME)
 * - mcptools CLI wrapper for tool discovery and execution
 * - SWR (stale-while-revalidate) caching for tool schemas
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Path: harness/src/lib/ -> harness/src/ -> harness/
const HARNESS_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(HARNESS_ROOT, '.cache', 'mcp');

/**
 * MCP server configuration - one per server wrapper file.
 */
export interface McpServerConfig {
  /** Server identifier (used in CLI: ah tools <name>:tool) */
  name: string;

  /** Human-readable description of what this server provides */
  description: string;

  /** Transport type - stdio (command) or http/sse (url) */
  type?: 'stdio' | 'http' | 'sse';

  /** Command to execute (stdio transport) */
  command?: string;

  /** Arguments for command (stdio transport) */
  args?: string[];

  /** Environment variables - values can use ${VAR_NAME} for interpolation */
  env?: Record<string, string>;

  /** URL endpoint (http/sse transport) */
  url?: string;

  /** HTTP headers (http/sse transport) */
  headers?: Record<string, string>;

  /** Tools to hide from discovery (default: show all) */
  hiddenTools?: string[];

  /** Extra hints for specific tools (shown in --help) */
  toolHints?: Record<string, string>;

  /**
   * Whether this server maintains state between tool calls.
   *
   * Stateful servers (e.g., Playwright, XcodeBuild) keep a persistent session
   * that survives between CLI invocations. The session is automatically started
   * on first tool call and cleaned up after inactivity timeout.
   *
   * Use --restart flag if the server gets into a bad state.
   *
   * Stateless servers (e.g., fetch, filesystem) create a fresh connection
   * for each tool call.
   */
  stateful?: boolean;

  /**
   * Inactivity timeout for stateful sessions in milliseconds.
   * After this period of no tool calls, the session is automatically closed.
   * Default: 120000 (2 minutes). Only applies when stateful: true.
   */
  stateful_session_timeout?: number;
}

/**
 * Default timeout for stateful MCP sessions (2 minutes).
 */
export const DAEMON_DEFAULT_MCP_TIMEOUT = 120000;

/**
 * Tool schema from MCP server discovery.
 */
export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, {
      type: string;
      description?: string;
      items?: { type: string };
    }>;
    required?: string[];
  };
}

/**
 * Cached tool discovery result.
 */
interface ToolCache {
  timestamp: number;
  tools: McpToolSchema[];
}

/**
 * Check if mcptools CLI is available.
 */
export function isMcpToolsInstalled(): boolean {
  try {
    execSync('mcp version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Interpolate environment variables in a string.
 * Replaces ${VAR_NAME} with process.env.VAR_NAME.
 */
export function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(`Environment variable ${varName} is not set`);
    }
    return envValue;
  });
}

/**
 * Interpolate all env vars in a config's env object.
 */
export function resolveEnvVars(env: Record<string, string> | undefined): Record<string, string> {
  if (!env) return {};

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    resolved[key] = interpolateEnv(value);
  }
  return resolved;
}

/**
 * Build the mcptools server command from config.
 */
export function buildServerCommand(config: McpServerConfig): string[] {
  if (config.type === 'http' || config.type === 'sse') {
    if (!config.url) {
      throw new Error(`Server ${config.name} requires 'url' for ${config.type} transport`);
    }
    return [config.url];
  }

  // Default to stdio
  if (!config.command) {
    throw new Error(`Server ${config.name} requires 'command' for stdio transport`);
  }

  return [config.command, ...(config.args ?? [])];
}

/**
 * Get cache file path for a server.
 */
function getCachePath(serverName: string): string {
  return join(CACHE_DIR, `${serverName}.json`);
}

/**
 * Load cached tools for a server.
 */
function loadCache(serverName: string): ToolCache | null {
  const cachePath = getCachePath(serverName);
  if (!existsSync(cachePath)) return null;

  try {
    const data = readFileSync(cachePath, 'utf-8');
    return JSON.parse(data) as ToolCache;
  } catch {
    return null;
  }
}

/**
 * Save tools to cache.
 */
function saveCache(serverName: string, tools: McpToolSchema[]): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cache: ToolCache = {
    timestamp: Date.now(),
    tools,
  };

  writeFileSync(getCachePath(serverName), JSON.stringify(cache, null, 2));
}

/**
 * Discover tools from an MCP server via mcptools CLI.
 */
export async function discoverTools(config: McpServerConfig): Promise<McpToolSchema[]> {
  const serverCmd = buildServerCommand(config);
  const env = resolveEnvVars(config.env);

  return new Promise((resolve, reject) => {
    const args = ['tools', '--format', 'json', ...serverCmd];

    const proc = spawn('mcp', args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`mcp tools failed: ${stderr || 'unknown error'}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        // mcptools returns { tools: [...] } wrapper
        const tools = (parsed.tools ?? parsed) as McpToolSchema[];

        // Filter out hidden tools
        const filtered = config.hiddenTools?.length
          ? tools.filter((t) => !config.hiddenTools!.includes(t.name))
          : tools;

        resolve(filtered);
      } catch (e) {
        reject(new Error(`Failed to parse tool discovery: ${e}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn mcp: ${err.message}`));
    });
  });
}

/**
 * Get tools with SWR caching.
 *
 * Returns cached tools immediately, triggers background refresh.
 * If no cache exists, performs blocking discovery.
 */
export async function getToolsWithCache(
  config: McpServerConfig,
  forceRefresh = false
): Promise<McpToolSchema[]> {
  const cache = loadCache(config.name);

  if (forceRefresh || !cache) {
    // No cache or force refresh - blocking discovery
    const tools = await discoverTools(config);
    saveCache(config.name, tools);
    return tools;
  }

  // Return cached immediately, refresh in background (SWR pattern)
  discoverTools(config)
    .then((tools) => saveCache(config.name, tools))
    .catch(() => {
      // Silent fail on background refresh - cache still valid
    });

  return cache.tools;
}

/**
 * Call a tool on an MCP server.
 */
export async function callTool(
  config: McpServerConfig,
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const serverCmd = buildServerCommand(config);
  const env = resolveEnvVars(config.env);

  return new Promise((resolve, reject) => {
    const args = [
      'call',
      toolName,
      '--params',
      JSON.stringify(params),
      '--format',
      'json',
      ...serverCmd,
    ];

    const proc = spawn('mcp', args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Tool call failed: ${stderr || 'unknown error'}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        // Not JSON - return raw output
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn mcp: ${err.message}`));
    });
  });
}

/**
 * Format tool schema for human-readable help output.
 */
export function formatToolHelp(
  tool: McpToolSchema,
  hint?: string
): string {
  const lines: string[] = [];

  // Tool signature
  const params: string[] = [];
  const props = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);

  for (const [name, schema] of Object.entries(props)) {
    let typeStr = schema.type;
    if (schema.items?.type) {
      typeStr = `${schema.items.type}[]`;
    }

    if (required.has(name)) {
      params.push(`${name}:${typeStr}`);
    } else {
      params.push(`[${name}:${typeStr}]`);
    }
  }

  lines.push(`${tool.name}(${params.join(', ')})`);

  // Description
  if (tool.description) {
    lines.push(`     ${tool.description}`);
  }

  // Parameter details
  if (Object.keys(props).length > 0) {
    lines.push('');
    lines.push('  Parameters:');
    for (const [name, schema] of Object.entries(props)) {
      const reqStr = required.has(name) ? '(required)' : '(optional)';
      const desc = schema.description || '';
      lines.push(`    ${name} ${reqStr}  ${desc}`);
    }
  }

  // Custom hint
  if (hint) {
    lines.push('');
    lines.push(`  Hint: ${hint}`);
  }

  return lines.join('\n');
}

/**
 * Format all tools from a server for help output.
 */
export function formatServerHelp(
  config: McpServerConfig,
  tools: McpToolSchema[]
): string {
  const lines: string[] = [];

  lines.push(`${config.name} - ${config.description}`);
  lines.push('');
  lines.push(`Tools (${tools.length}):`);

  for (const tool of tools) {
    lines.push('');
    lines.push(formatToolHelp(tool, config.toolHints?.[tool.name]));
  }

  return lines.join('\n');
}
