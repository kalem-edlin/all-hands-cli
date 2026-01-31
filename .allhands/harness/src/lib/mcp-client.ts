/**
 * MCP Client - Connects to session daemon for stateful servers.
 *
 * For stateful servers (playwright, xcodebuild, etc.), connects to a
 * per-agent daemon that manages persistent MCP sessions.
 *
 * For stateless servers, uses direct one-shot connections.
 *
 * Daemon socket path: .allhands/harness/.cache/sessions/{AGENT_ID}.sock
 *
 * Session Lifecycle (stateful servers):
 * - Sessions are auto-started on first tool call.
 * - Sessions timeout after inactivity (configurable per-server).
 * - When all sessions timeout, daemon exits.
 * - Use --restart flag to recover from bad state.
 */

import { connect, type Socket } from 'net';
import { spawn } from 'child_process';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServerConfig, McpToolSchema } from './mcp-runtime.js';
import { resolveEnvVars } from './mcp-runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Path: harness/src/lib/ -> harness/src/ -> harness/
const HARNESS_ROOT = join(__dirname, '..', '..');
const SESSIONS_DIR = join(HARNESS_ROOT, '.cache', 'sessions');
const DAEMON_SCRIPT = join(__dirname, 'mcp-daemon.ts');

/**
 * Get the agent ID from environment.
 */
export function getAgentId(): string {
  return process.env.AGENT_ID ?? 'default';
}

/**
 * Get the socket path for an agent.
 */
function getSocketPath(agentId: string): string {
  return join(SESSIONS_DIR, `${agentId}.sock`);
}

/**
 * Get the PID file path for an agent.
 */
function getPidPath(agentId: string): string {
  return join(SESSIONS_DIR, `${agentId}.pid`);
}

/**
 * Check if the daemon is running for an agent.
 */
export function isDaemonRunning(agentId?: string): boolean {
  const aid = agentId ?? getAgentId();
  const pidPath = getPidPath(aid);
  const socketPath = getSocketPath(aid);

  if (!existsSync(pidPath) || !existsSync(socketPath)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    // Check if process is running
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sleep helper for async waiting.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the daemon for an agent (if not already running).
 */
export async function startDaemon(agentId?: string): Promise<void> {
  const aid = agentId ?? getAgentId();

  if (isDaemonRunning(aid)) {
    return;
  }

  // Ensure sessions directory exists
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  // Spawn daemon as detached process
  const child = spawn('npx', ['tsx', DAEMON_SCRIPT, aid], {
    cwd: HARNESS_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, AGENT_ID: aid },
  });

  child.unref();

  // Wait for socket to be created (with timeout)
  const socketPath = getSocketPath(aid);
  const startTime = Date.now();
  const timeout = 10000; // 10 seconds

  while (!existsSync(socketPath)) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Daemon failed to start for agent ${aid}`);
    }
    await sleep(100);
  }
}

/**
 * Send a command to the daemon and get response.
 */
async function sendToDaemon<T>(agentId: string, command: unknown, timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const socketPath = getSocketPath(agentId);

    if (!existsSync(socketPath)) {
      reject(new Error(`Daemon not running for agent ${agentId}`));
      return;
    }

    const socket: Socket = connect(socketPath);
    let buffer = '';

    socket.on('connect', () => {
      socket.write(JSON.stringify(command) + '\n');
    });

    socket.on('data', (data) => {
      buffer += data.toString();
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx !== -1) {
        const response = buffer.slice(0, newlineIdx);
        socket.end();
        try {
          resolve(JSON.parse(response) as T);
        } catch (e) {
          reject(new Error(`Invalid response from daemon: ${response}`));
        }
      }
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Daemon connection timeout'));
    });

    socket.setTimeout(timeoutMs);
  });
}

/**
 * Create and connect a new MCP client for a one-shot call.
 */
async function createOneShot(config: McpServerConfig): Promise<{ client: Client; transport: StdioClientTransport }> {
  if (!config.command) {
    throw new Error(`Server ${config.name} requires 'command' for stdio transport`);
  }

  const env = resolveEnvVars(config.env);

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env, ...env } as Record<string, string>,
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'allhands-cli', version: '0.1.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  return { client, transport };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Restart a server session (for recovery from bad state).
 */
export async function restartServer(
  config: McpServerConfig,
  agentId?: string
): Promise<{ success: boolean; pid?: number; error?: string }> {
  const aid = agentId ?? getAgentId();

  // Ensure daemon is running
  await startDaemon(aid);

  return sendToDaemon(aid, {
    cmd: 'restart',
    server: config.name,
    config,
  });
}

/**
 * List all active sessions.
 */
export async function listSessions(agentId?: string): Promise<Array<{
  serverName: string;
  startedAt: Date;
  lastUsedAt: Date;
  timeoutMs: number;
  pid?: number;
}>> {
  const aid = agentId ?? getAgentId();

  if (!isDaemonRunning(aid)) {
    return [];
  }

  const result = await sendToDaemon<{
    success: boolean;
    sessions: Array<{ server: string; startedAt: string; lastUsedAt: string; timeoutMs: number; pid?: number }>;
  }>(aid, { cmd: 'list' });

  return result.sessions.map((s) => ({
    serverName: s.server,
    startedAt: new Date(s.startedAt),
    lastUsedAt: new Date(s.lastUsedAt),
    timeoutMs: s.timeoutMs,
    pid: s.pid,
  }));
}

/**
 * Discover tools from an MCP server.
 *
 * For stateful servers, uses daemon (auto-starts session).
 * For stateless servers, uses one-shot connection.
 */
export async function discoverTools(
  config: McpServerConfig,
  agentId?: string
): Promise<McpToolSchema[]> {
  const aid = agentId ?? getAgentId();

  if (config.stateful) {
    // Ensure daemon is running, then discover via daemon
    await startDaemon(aid);

    const result = await sendToDaemon<{
      success: boolean;
      tools?: McpToolSchema[];
      error?: string;
    }>(aid, {
      cmd: 'discover',
      server: config.name,
      config,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Failed to discover tools');
    }

    return result.tools ?? [];
  }

  // Stateless: one-shot discovery
  const { client, transport } = await createOneShot(config);

  try {
    const result = await client.listTools();
    const tools = result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as McpToolSchema['inputSchema'],
    }));

    return config.hiddenTools?.length
      ? tools.filter((t) => !config.hiddenTools!.includes(t.name))
      : tools;
  } finally {
    await transport.close();
  }
}

/**
 * Call a tool on an MCP server.
 *
 * For stateful servers, uses daemon (auto-starts session).
 * For stateless servers, uses one-shot connection.
 */
export async function callTool(
  config: McpServerConfig,
  toolName: string,
  params: Record<string, unknown>,
  agentId?: string
): Promise<unknown> {
  const aid = agentId ?? getAgentId();

  if (config.stateful) {
    // Ensure daemon is running, then call via daemon
    await startDaemon(aid);

    const callTimeout = config.stateful_session_timeout ?? 30000;
    const result = await sendToDaemon<{
      success: boolean;
      result?: unknown;
      error?: string;
    }>(aid, {
      cmd: 'call',
      server: config.name,
      tool: toolName,
      params,
      config,
    }, callTimeout);

    if (!result.success) {
      throw new Error(result.error ?? 'Tool call failed');
    }

    return result.result;
  }

  // Stateless: one-shot connection
  const { client, transport } = await createOneShot(config);

  try {
    const result = await client.callTool({ name: toolName, arguments: params });

    if ('content' in result && Array.isArray(result.content)) {
      const textContent = result.content.find((c) => c.type === 'text');
      if (textContent && 'text' in textContent) {
        try {
          return JSON.parse(textContent.text);
        } catch {
          return textContent.text;
        }
      }
      return result.content;
    }

    return result;
  } finally {
    await transport.close();
  }
}

/**
 * Shutdown the daemon for an agent.
 * Called by tmux cleanup or manual shutdown.
 */
export async function shutdownDaemon(agentId?: string): Promise<void> {
  const aid = agentId ?? getAgentId();

  if (!isDaemonRunning(aid)) {
    return;
  }

  try {
    await sendToDaemon(aid, { cmd: 'shutdown' });
  } catch {
    // Daemon may have already exited
  }
}

/**
 * Get daemon info.
 */
export async function getDaemonInfo(agentId?: string): Promise<{
  running: boolean;
  pid?: number;
  socketPath?: string;
  sessionCount?: number;
  sessions?: string[];
}> {
  const aid = agentId ?? getAgentId();
  const pidPath = getPidPath(aid);
  const socketPath = getSocketPath(aid);

  if (!isDaemonRunning(aid)) {
    return { running: false };
  }

  try {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);

    // Get live info from daemon
    const info = await sendToDaemon<{
      success: boolean;
      pid: number;
      sessionCount: number;
      sessions: string[];
    }>(aid, { cmd: 'info' });

    return {
      running: true,
      pid,
      socketPath,
      sessionCount: info.sessionCount,
      sessions: info.sessions,
    };
  } catch {
    return { running: false };
  }
}

/**
 * Send ping to daemon to keep sessions alive.
 */
export async function pingDaemon(agentId?: string): Promise<{ success: boolean; sessionsRefreshed: number }> {
  const aid = agentId ?? getAgentId();

  if (!isDaemonRunning(aid)) {
    return { success: false, sessionsRefreshed: 0 };
  }

  return sendToDaemon(aid, { cmd: 'ping' });
}
