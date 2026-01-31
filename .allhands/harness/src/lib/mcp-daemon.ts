/**
 * MCP Session Daemon - Persistent MCP session manager.
 *
 * This daemon runs as a background process and manages MCP client sessions
 * for stateful servers. It listens on a Unix socket and accepts JSON commands.
 *
 * Each AGENT_ID gets its own daemon instance, enabling parallel sessions.
 *
 * Socket path: .allhands/harness/.cache/sessions/{AGENT_ID}.sock
 *
 * Commands:
 * - { cmd: "call", server: string, tool: string, params: object, config: McpServerConfig }
 *     Auto-starts server session if needed, then calls the tool.
 * - { cmd: "discover", server: string, config: McpServerConfig }
 *     Auto-starts server session if needed, returns available tools.
 * - { cmd: "restart", server: string, config: McpServerConfig }
 *     Restarts a server session (for recovery from bad state).
 * - { cmd: "list" }
 *     Lists all active server sessions.
 * - { cmd: "info" }
 *     Returns daemon info (pid, session count, etc.)
 * - { cmd: "ping" }
 *     Keep-alive, resets activity timer for all sessions.
 * - { cmd: "shutdown" }
 *     Graceful shutdown - closes all sessions and exits.
 *
 * Session Lifecycle:
 * - Sessions are auto-started on first call/discover.
 * - Each session has its own inactivity timeout (from config or default).
 * - When a session times out, it's closed and removed.
 * - When no sessions remain, the daemon exits immediately.
 * - Daemon can also be killed externally (e.g., tmux cleanup).
 */

import { createServer, type Server, type Socket } from 'net';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServerConfig, McpToolSchema } from './mcp-runtime.js';
import { resolveEnvVars, DAEMON_DEFAULT_MCP_TIMEOUT } from './mcp-runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Path: harness/src/lib/ -> harness/src/ -> harness/
const HARNESS_ROOT = join(__dirname, '..', '..');
const SESSIONS_DIR = join(HARNESS_ROOT, '.cache', 'sessions');

/**
 * How often to check for session timeouts (30 seconds).
 */
const TIMEOUT_CHECK_INTERVAL_MS = 30000;

/**
 * Active session state.
 */
interface McpSession {
  client: Client;
  transport: StdioClientTransport;
  config: McpServerConfig;
  startedAt: Date;
  lastUsedAt: Date;
  timeoutMs: number;
  tools?: McpToolSchema[];
}

/**
 * Daemon command types.
 */
type DaemonCommand =
  | { cmd: 'call'; server: string; tool: string; params: Record<string, unknown>; config: McpServerConfig }
  | { cmd: 'discover'; server: string; config: McpServerConfig }
  | { cmd: 'restart'; server: string; config: McpServerConfig }
  | { cmd: 'list' }
  | { cmd: 'info' }
  | { cmd: 'ping' }
  | { cmd: 'shutdown' };

/**
 * Session manager - tracks active MCP client sessions.
 */
const sessions = new Map<string, McpSession>();

/**
 * Reference to the server for shutdown.
 */
let serverInstance: Server | null = null;
let cleanupFn: (() => void) | null = null;

/**
 * Create and connect a new MCP client for a server.
 */
async function createClient(config: McpServerConfig): Promise<{ client: Client; transport: StdioClientTransport }> {
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
    { name: 'allhands-daemon', version: '0.1.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  return { client, transport };
}

/**
 * Ensure a session exists for a server, creating one if needed.
 * Returns the session.
 */
async function ensureSession(server: string, config: McpServerConfig): Promise<McpSession> {
  const existing = sessions.get(server);
  if (existing) {
    existing.lastUsedAt = new Date();
    return existing;
  }

  // Create new session
  const { client, transport } = await createClient(config);
  const timeoutMs = config.stateful_session_timeout ?? DAEMON_DEFAULT_MCP_TIMEOUT;

  const session: McpSession = {
    client,
    transport,
    config,
    startedAt: new Date(),
    lastUsedAt: new Date(),
    timeoutMs,
  };

  sessions.set(server, session);
  console.log(`Session started: ${server} (timeout: ${timeoutMs}ms)`);

  return session;
}

/**
 * Close and remove a session.
 */
async function closeSession(server: string): Promise<void> {
  const session = sessions.get(server);
  if (!session) return;

  try {
    await session.transport.close();
  } catch {
    // Ignore close errors
  }

  sessions.delete(server);
  console.log(`Session closed: ${server}`);

  // If no sessions remain, exit immediately
  if (sessions.size === 0) {
    console.log('No sessions remaining, daemon exiting.');
    if (serverInstance && cleanupFn) {
      serverInstance.close();
      cleanupFn();
    }
    process.exit(0);
  }
}

/**
 * Handle tool call command.
 * Auto-starts session if needed.
 */
async function handleCall(
  server: string,
  tool: string,
  params: Record<string, unknown>,
  config: McpServerConfig
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const session = await ensureSession(server, config);
    const callTimeout = config.stateful_session_timeout ?? 60000;
    const result = await session.client.callTool(
      { name: tool, arguments: params },
      undefined,
      { timeout: callTimeout }
    );

    // Extract content from result
    if ('content' in result && Array.isArray(result.content)) {
      const textContent = result.content.find((c) => c.type === 'text');
      if (textContent && 'text' in textContent) {
        try {
          return { success: true, result: JSON.parse(textContent.text) };
        } catch {
          return { success: true, result: textContent.text };
        }
      }
      return { success: true, result: result.content };
    }

    return { success: true, result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Handle discover tools command.
 * Auto-starts session if needed for stateful servers.
 */
async function handleDiscover(
  server: string,
  config: McpServerConfig
): Promise<{ success: boolean; tools?: McpToolSchema[]; error?: string }> {
  try {
    const session = await ensureSession(server, config);

    if (!session.tools) {
      const result = await session.client.listTools();
      session.tools = result.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as McpToolSchema['inputSchema'],
      }));
    }

    const tools = config.hiddenTools?.length
      ? session.tools.filter((t) => !config.hiddenTools!.includes(t.name))
      : session.tools;

    return { success: true, tools };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Handle restart command.
 * Closes existing session and creates a new one.
 */
async function handleRestart(
  server: string,
  config: McpServerConfig
): Promise<{ success: boolean; pid?: number; error?: string }> {
  // Close existing session if any
  const existing = sessions.get(server);
  if (existing) {
    try {
      await existing.transport.close();
    } catch {
      // Ignore
    }
    sessions.delete(server);
    console.log(`Session stopped for restart: ${server}`);
  }

  // Create new session
  try {
    const session = await ensureSession(server, config);
    return { success: true, pid: session.transport.pid ?? undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Handle list sessions command.
 */
function handleList(): { success: boolean; sessions: Array<{ server: string; startedAt: string; lastUsedAt: string; timeoutMs: number; pid?: number }> } {
  const result: Array<{ server: string; startedAt: string; lastUsedAt: string; timeoutMs: number; pid?: number }> = [];

  for (const [server, session] of sessions) {
    result.push({
      server,
      startedAt: session.startedAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      timeoutMs: session.timeoutMs,
      pid: session.transport.pid ?? undefined,
    });
  }

  return { success: true, sessions: result };
}

/**
 * Handle ping command - refreshes all session timestamps.
 */
function handlePing(): { success: boolean; pong: true; sessionsRefreshed: number } {
  const now = new Date();
  for (const session of sessions.values()) {
    session.lastUsedAt = now;
  }
  return { success: true, pong: true, sessionsRefreshed: sessions.size };
}

/**
 * Process a command from client.
 */
async function processCommand(command: DaemonCommand): Promise<unknown> {
  switch (command.cmd) {
    case 'call':
      return handleCall(command.server, command.tool, command.params, command.config);
    case 'discover':
      return handleDiscover(command.server, command.config);
    case 'restart':
      return handleRestart(command.server, command.config);
    case 'list':
      return handleList();
    case 'info':
      return {
        success: true,
        pid: process.pid,
        sessionCount: sessions.size,
        sessions: Array.from(sessions.keys()),
      };
    case 'ping':
      return handlePing();
    case 'shutdown':
      // Graceful shutdown
      console.log('Shutdown requested');
      for (const session of sessions.values()) {
        try {
          await session.transport.close();
        } catch {
          // Ignore
        }
      }
      sessions.clear();
      process.exit(0);
    default:
      return { success: false, error: 'Unknown command' };
  }
}

/**
 * Handle client connection.
 */
function handleConnection(socket: Socket): void {
  let buffer = '';

  socket.on('data', async (data) => {
    buffer += data.toString();

    // Process complete JSON messages (newline-delimited)
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const command = JSON.parse(line) as DaemonCommand;
        const result = await processCommand(command);
        socket.write(JSON.stringify(result) + '\n');
      } catch (e) {
        socket.write(JSON.stringify({
          success: false,
          error: e instanceof Error ? e.message : String(e),
        }) + '\n');
      }
    }
  });

  socket.on('error', () => {
    // Client disconnected, ignore
  });
}

/**
 * Check for timed-out sessions and close them.
 */
async function checkSessionTimeouts(): Promise<void> {
  const now = Date.now();
  const toClose: string[] = [];

  for (const [server, session] of sessions) {
    const idleMs = now - session.lastUsedAt.getTime();
    if (idleMs >= session.timeoutMs) {
      console.log(`Session timed out: ${server} (idle ${Math.round(idleMs / 1000)}s)`);
      toClose.push(server);
    }
  }

  for (const server of toClose) {
    await closeSession(server);
  }
}

/**
 * Graceful shutdown - close all sessions and exit.
 */
async function gracefulShutdown(server: Server, cleanup: () => void, reason: string): Promise<void> {
  console.log(`Daemon shutting down: ${reason}`);

  // Close all MCP sessions
  for (const session of sessions.values()) {
    try {
      await session.transport.close();
    } catch {
      // Ignore
    }
  }
  sessions.clear();

  // Close the server
  server.close();

  // Cleanup files
  cleanup();

  process.exit(0);
}

/**
 * Start the daemon.
 */
function startDaemon(agentId: string): void {
  // Ensure sessions directory exists
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  const socketPath = join(SESSIONS_DIR, `${agentId}.sock`);
  const pidPath = join(SESSIONS_DIR, `${agentId}.pid`);

  // Clean up stale socket
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // Ignore
    }
  }

  const server = createServer(handleConnection);
  serverInstance = server;

  // Cleanup function for files
  const cleanup = () => {
    try {
      if (existsSync(socketPath)) unlinkSync(socketPath);
      if (existsSync(pidPath)) unlinkSync(pidPath);
    } catch {
      // Ignore
    }
  };
  cleanupFn = cleanup;

  server.listen(socketPath, () => {
    // Write PID file
    writeFileSync(pidPath, String(process.pid));
    console.log(`Daemon started for agent ${agentId} (PID: ${process.pid})`);
    console.log(`Socket: ${socketPath}`);
    console.log(`Default session timeout: ${DAEMON_DEFAULT_MCP_TIMEOUT}ms`);
  });

  server.on('error', (err) => {
    console.error('Daemon error:', err);
    process.exit(1);
  });

  // Start session timeout checker
  const timeoutChecker = setInterval(async () => {
    await checkSessionTimeouts();
  }, TIMEOUT_CHECK_INTERVAL_MS);

  // Don't let the interval keep the process alive if everything else is done
  timeoutChecker.unref();

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    gracefulShutdown(server, cleanup, 'SIGINT');
  });
  process.on('SIGTERM', () => {
    gracefulShutdown(server, cleanup, 'SIGTERM');
  });
}

// Main - start daemon with AGENT_ID from args or env
const agentId = process.argv[2] || process.env.AGENT_ID || 'default';
startDaemon(agentId);
