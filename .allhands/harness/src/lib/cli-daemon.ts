/**
 * CLI Daemon - TUI-hosted socket server for fast hook execution.
 *
 * When the TUI is running, hooks connect via Unix socket instead of
 * spawning a fresh Node.js process. This eliminates ~400ms startup
 * overhead per hook invocation.
 *
 * The daemon runs hooks by intercepting stdout and process.exit(),
 * so hooks don't need any modification.
 *
 * Socket path: /tmp/ah-daemon-<hash>.sock (hash of project root)
 */

import { createServer, createConnection, type Server, type Socket } from 'net';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { createHash } from 'crypto';
import { dirname } from 'path';
import type { HookInput } from '../hooks/shared.js';

// Signal class to catch process.exit() calls
class ExitSignal extends Error {
  constructor(public code: number = 0) {
    super(`Exit with code ${code}`);
    this.name = 'ExitSignal';
  }
}

// Hook handler type - takes input and may call process.exit/write to stdout
type HookHandler = (input: HookInput) => void | Promise<void>;

// Registry of hook handlers, keyed by "category.name"
const handlers = new Map<string, HookHandler>();

export interface DaemonCommand {
  cmd: 'hook' | 'ping' | 'shutdown' | 'list';
  category?: string;  // e.g., 'context', 'validation', 'observability'
  name?: string;      // e.g., 'tldr-inject', 'signature'
  input?: HookInput;
}

/**
 * Get the socket path for the CLI daemon.
 *
 * Uses /tmp with a hash of the project directory to keep the path short.
 * macOS limits Unix domain socket paths to 104 bytes — project-relative
 * paths like .allhands/harness/.cache/cli-daemon.sock can exceed that
 * in deep directory trees or multi-worktree setups.
 */
export function getSocketPath(projectDir: string): string {
  const hash = createHash('sha256').update(projectDir).digest('hex').slice(0, 16);
  return `/tmp/ah-daemon-${hash}.sock`;
}

/**
 * Check if the daemon socket exists.
 */
export function isDaemonRunning(projectDir: string): boolean {
  return existsSync(getSocketPath(projectDir));
}

/**
 * Register a hook handler for daemon mode.
 */
export function registerHandler(category: string, name: string, handler: HookHandler): void {
  handlers.set(`${category}.${name}`, handler);
}

/**
 * Run a hook handler with intercepted I/O.
 * Captures stdout and catches process.exit() calls.
 */
async function runWithInterceptedIO(handler: HookHandler, input: HookInput): Promise<string> {
  let output = '';

  // Save originals
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalViaDaemon = process.env.AH_VIA_DAEMON;

  // Mark as running via daemon for trace logging
  process.env.AH_VIA_DAEMON = '1';

  // Intercept process.exit
  process.exit = ((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as typeof process.exit;

  // Intercept stdout.write
  process.stdout.write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    output += str;
    // Call callback if provided
    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (cb) cb();
    return true;
  }) as typeof process.stdout.write;

  try {
    await handler(input);
  } catch (e) {
    if (!(e instanceof ExitSignal)) {
      throw e;
    }
    // ExitSignal is expected - hook completed normally
  } finally {
    // Restore originals
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    if (originalViaDaemon === undefined) {
      delete process.env.AH_VIA_DAEMON;
    } else {
      process.env.AH_VIA_DAEMON = originalViaDaemon;
    }
  }

  return output.trim();
}

/**
 * Process a daemon command.
 */
async function processCommand(command: DaemonCommand): Promise<unknown> {
  switch (command.cmd) {
    case 'hook': {
      if (!command.category || !command.name) {
        return { success: false, error: 'Missing category or name' };
      }

      const key = `${command.category}.${command.name}`;
      const handler = handlers.get(key);

      if (!handler) {
        // Handler not registered - return fallback signal
        return { success: true, output: '', fallback: true };
      }

      try {
        const input: HookInput = command.input || {};
        // Claude Code PostToolUse sends tool_response; normalize to tool_result
        if (input.tool_response !== undefined && input.tool_result === undefined) {
          input.tool_result = input.tool_response;
        }
        const output = await runWithInterceptedIO(handler, input);
        return { success: true, output };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    case 'list':
      return {
        success: true,
        handlers: Array.from(handlers.keys()),
      };

    case 'ping':
      return { success: true, pong: true, handlers: handlers.size };

    case 'shutdown':
      return { success: true, shutting_down: true };

    default:
      return { success: false, error: 'Unknown command' };
  }
}

/**
 * Handle a client connection.
 */
function createConnectionHandler() {
  return function handleConnection(socket: Socket): void {
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

          // Handle shutdown after responding
          if (command.cmd === 'shutdown') {
            process.nextTick(() => socket.end());
          }
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
  };
}

/**
 * CLI Daemon instance.
 */
export class CLIDaemon {
  private server: Server | null = null;
  private socketPath: string;

  constructor(private projectDir: string) {
    this.socketPath = getSocketPath(projectDir);
  }

  /**
   * Start the daemon server.
   */
  async start(): Promise<void> {
    if (this.server) return;

    // Ensure cache directory exists
    const cacheDir = dirname(this.socketPath);
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    // Check if socket exists and is in use
    if (existsSync(this.socketPath)) {
      const isInUse = await this.isSocketInUse();
      if (isInUse) {
        // Another daemon is running - don't start a second one
        console.error('CLI daemon already running, skipping start');
        return;
      }
      // Socket exists but is stale - clean it up
      try {
        unlinkSync(this.socketPath);
      } catch {
        // Ignore
      }
    }

    // Load and register hook handlers
    await this.loadHandlers();

    this.server = createServer(createConnectionHandler());

    this.server.listen(this.socketPath, () => {
      // Socket ready
    });

    this.server.on('error', (e) => {
      console.error('CLI daemon error:', e);
    });
  }

  /**
   * Load hook modules and register their handlers.
   * Each module exports handler functions that we register here.
   */
  private async loadHandlers(): Promise<void> {
    try {
      // Import hook modules - they'll register their handlers
      const contextModule = await import('../hooks/context.js');
      const observabilityModule = await import('../hooks/observability.js');
      const validationModule = await import('../hooks/validation.js');
      const lifecycleModule = await import('../hooks/lifecycle.js');
      const enforcementModule = await import('../hooks/enforcement.js');

      // Register handlers from each module if they export a registerDaemonHandlers function
      for (const mod of [contextModule, observabilityModule, validationModule, lifecycleModule, enforcementModule]) {
        if (typeof mod.registerDaemonHandlers === 'function') {
          mod.registerDaemonHandlers(registerHandler);
        }
      }
    } catch (e) {
      console.error('Failed to load hook modules:', e);
    }
  }

  /**
   * Stop the daemon server.
   */
  stop(): void {
    if (!this.server) return;

    this.server.close();
    this.server = null;

    // Clean up socket file
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Check if the socket is currently in use by another daemon.
   * Attempts to connect to the socket - if successful, it's in use.
   */
  private async isSocketInUse(): Promise<boolean> {
    return new Promise((resolve) => {
      const client = createConnection(this.socketPath);

      const timeout = setTimeout(() => {
        client.destroy();
        resolve(false); // Timed out - socket is stale
      }, 500);

      client.on('connect', () => {
        clearTimeout(timeout);
        // Send a ping to verify it's actually a daemon
        client.write('{"cmd":"ping"}\n');
      });

      client.on('data', () => {
        clearTimeout(timeout);
        client.destroy();
        resolve(true); // Got a response - daemon is running
      });

      client.on('error', () => {
        clearTimeout(timeout);
        client.destroy();
        resolve(false); // Connection failed - socket is stale
      });
    });
  }

  /**
   * Get count of registered handlers.
   */
  getHandlerCount(): number {
    return handlers.size;
  }
}
