/**
 * Tools Command - MCP server integrations with session management.
 *
 * Commands:
 * - ah tools list                        - List all available MCP servers
 * - ah tools <server>                    - List tools on a server
 * - ah tools <server>:<tool> [args]      - Call a specific tool
 * - ah tools <server> --help-tool        - Show help for server
 * - ah tools <server>:<tool> --help-tool - Show help for specific tool
 *
 * Session management (stateful servers only):
 * - ah tools <server> --restart          - Restart session (recovery from bad state)
 * - ah tools --sessions                  - List all active sessions
 * - ah tools --shutdown-daemon           - Shutdown the daemon for this AGENT_ID
 *
 * Session Lifecycle:
 * - Sessions are auto-started on first tool call (no --start needed)
 * - Sessions auto-cleanup after inactivity timeout (no --stop needed)
 * - Use --restart only if a server gets into a bad state
 *
 * Session isolation via AGENT_ID:
 * - AGENT_ID=<id> ah tools ...           - Use specific agent session
 * - Default AGENT_ID is "default"
 */

import { Command } from 'commander';
import {
  callTool,
  discoverTools,
  getAgentId,
  getDaemonInfo,
  isDaemonRunning,
  listSessions,
  restartServer,
  shutdownDaemon,
} from '../lib/mcp-client.js';
import {
  DAEMON_DEFAULT_MCP_TIMEOUT,
  formatToolHelp,
  type McpServerConfig,
  type McpToolSchema,
} from '../lib/mcp-runtime.js';
import { discoverServers, getServer } from '../mcp/index.js';

export function register(program: Command): void {
  program
    .command('tools [target]')
    .description('MCP tool integrations with session management')
    .option('--json', 'Output as JSON')
    .option('--help-tool', 'Show help for the target')
    .option('--list', 'List all available MCP servers')
    .option('--sessions', 'List all active sessions')
    .option('--restart', 'Restart server session (recovery from bad state)')
    .option('--shutdown-daemon', 'Shutdown the daemon for this AGENT_ID')
    .allowUnknownOption(true)
    .action(async (target: string | undefined, options: {
      json?: boolean;
      helpTool?: boolean;
      list?: boolean;
      sessions?: boolean;
      restart?: boolean;
      shutdownDaemon?: boolean;
    }, cmd: Command) => {
      const agentId = getAgentId();

      // Shutdown daemon
      if (options.shutdownDaemon) {
        await handleShutdownDaemon(agentId, options.json);
        return;
      }

      // List all active sessions
      if (options.sessions) {
        await handleListSessions(agentId, options.json);
        return;
      }

      // List all servers
      if (options.list || !target) {
        await handleListServers(agentId, options.json);
        return;
      }

      // Parse target: "server" or "server:tool"
      const [serverName, toolName] = target.split(':');

      const config = await getServer(serverName);
      if (!config) {
        const servers = await discoverServers();
        const available = Array.from(servers.keys()).join(', ');
        const msg = `Unknown server: ${serverName}. Available: ${available || 'none'}`;
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          console.error(`Error: ${msg}`);
        }
        process.exit(1);
      }

      // Restart command (stateful servers only)
      if (options.restart) {
        if (!config.stateful) {
          const msg = `Server ${serverName} is stateless. --restart only works with stateful servers.`;
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            console.error(`Error: ${msg}`);
          }
          process.exit(1);
        }

        await handleSessionRestart(config, agentId, options.json);
        return;
      }

      // Get tools
      let allTools: McpToolSchema[];
      try {
        allTools = await discoverTools(config, agentId);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(`Error discovering tools: ${error}`);
        }
        process.exit(1);
      }

      // List tools on server (no tool specified)
      if (!toolName) {
        if (options.helpTool) {
          // Full help with session management info
          if (options.json) {
            console.log(JSON.stringify({
              success: true,
              server: config.name,
              description: config.description,
              stateful: config.stateful ?? false,
              stateful_session_timeout: config.stateful_session_timeout ?? DAEMON_DEFAULT_MCP_TIMEOUT,
              agentId,
              tools: allTools,
            }, null, 2));
          } else {
            const helpText = await formatServerHelpWithSession(config, allTools, agentId);
            console.log(helpText);
          }
        } else {
          // Brief tool list
          await handleListTools(config, allTools, options.json);
        }
        return;
      }

      // Find the specific tool
      const tool = allTools.find((t) => t.name === toolName);
      if (!tool) {
        const available = allTools.map((t) => t.name).join(', ');
        const msg = `Unknown tool: ${toolName} on ${serverName}. Available: ${available}`;
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          console.error(`Error: ${msg}`);
        }
        process.exit(1);
      }

      // Help for specific tool
      if (options.helpTool) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            server: config.name,
            tool,
            hint: config.toolHints?.[toolName],
          }, null, 2));
        } else {
          console.log(formatToolHelp(tool, config.toolHints?.[toolName]));
        }
        return;
      }

      // Call the tool - parse remaining args as params
      const params = parseToolArgs(cmd.args.slice(1)); // Skip the target arg

      try {
        const result = await callTool(config, toolName, params, agentId);
        if (options.json) {
          console.log(JSON.stringify({ success: true, result }, null, 2));
        } else {
          if (typeof result === 'string') {
            console.log(result);
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error }));
        } else {
          console.error(`Error: ${error}`);
        }
        process.exit(1);
      }
    });
}

/**
 * Format server help with session management info.
 */
async function formatServerHelpWithSession(
  config: McpServerConfig,
  tools: McpToolSchema[],
  agentId: string
): Promise<string> {
  const lines: string[] = [];

  // Header
  lines.push(`${config.name} - ${config.description}`);

  if (config.stateful) {
    const timeoutMs = config.stateful_session_timeout ?? DAEMON_DEFAULT_MCP_TIMEOUT;
    const timeoutSec = Math.round(timeoutMs / 1000);

    lines.push('');
    lines.push('  [STATEFUL] This server maintains session state between calls.');
    lines.push('');
    lines.push('  Session Lifecycle:');
    lines.push('    - Auto-starts on first tool call');
    lines.push(`    - Auto-closes after ${timeoutSec}s of inactivity`);
    lines.push('    - Use --restart if server gets into a bad state');
    lines.push('');
    lines.push('  Commands:');
    lines.push('    --restart   Restart session (for recovery)');
    lines.push('');
    lines.push('  Session Isolation (set AGENT_ID env var for parallel sessions):');
    lines.push(`    Current AGENT_ID: ${agentId}`);

    const daemonInfo = await getDaemonInfo(agentId);
    if (daemonInfo.running) {
      lines.push(`    Daemon: running (PID: ${daemonInfo.pid})`);
      if (daemonInfo.sessions && daemonInfo.sessions.includes(config.name)) {
        lines.push(`    Session: active`);
      } else {
        lines.push('    Session: not started (will start on first call)');
      }
    } else {
      lines.push('    Daemon: not running (will start on first call)');
    }
  } else {
    lines.push('');
    lines.push('  [STATELESS] Each tool call is independent.');
  }

  lines.push('');
  lines.push(`Tools (${tools.length}):`);

  for (const tool of tools) {
    lines.push('');
    lines.push(formatToolHelp(tool, config.toolHints?.[tool.name]));
  }

  return lines.join('\n');
}

/**
 * List all available MCP servers.
 */
async function handleListServers(agentId: string, json?: boolean): Promise<void> {
  const servers = await discoverServers();

  if (servers.size === 0) {
    if (json) {
      console.log(JSON.stringify({ success: true, servers: [] }));
    } else {
      console.log('No MCP servers configured.');
      console.log('Add servers in .allhands/harness/src/mcp/ (copy _template.ts)');
    }
    return;
  }

  const daemonRunning = isDaemonRunning(agentId);

  if (json) {
    const serverList = Array.from(servers.values()).map((s) => ({
      name: s.name,
      description: s.description,
      type: s.type ?? 'stdio',
      stateful: s.stateful ?? false,
      stateful_session_timeout: s.stateful_session_timeout ?? DAEMON_DEFAULT_MCP_TIMEOUT,
    }));
    console.log(JSON.stringify({
      success: true,
      agentId,
      daemonRunning,
      servers: serverList,
    }, null, 2));
    return;
  }

  console.log(`Available MCP servers (AGENT_ID: ${agentId}):`);
  console.log('');
  for (const config of servers.values()) {
    const stateLabel = config.stateful ? '[STATEFUL]' : '[STATELESS]';
    console.log(`  ${config.name} ${stateLabel}`);
    console.log(`       ${config.description}`);
  }
  console.log('');
  console.log('Usage:');
  console.log('  ah tools <server>              List tools on server');
  console.log('  ah tools <server>:<tool>       Call a tool');
  console.log('  ah tools <server> --help-tool  Show detailed help');
  console.log('  ah tools --sessions            List active sessions');
  console.log('');
  console.log('Session isolation: AGENT_ID=<id> ah tools ...');
}

/**
 * List all active sessions.
 */
async function handleListSessions(agentId: string, json?: boolean): Promise<void> {
  const sessions = await listSessions(agentId);
  const daemonInfo = await getDaemonInfo(agentId);

  if (json) {
    console.log(JSON.stringify({
      success: true,
      agentId,
      daemon: daemonInfo,
      sessions: sessions.map((s) => ({
        server: s.serverName,
        startedAt: s.startedAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        timeoutMs: s.timeoutMs,
        pid: s.pid,
      })),
    }, null, 2));
    return;
  }

  console.log(`Sessions for AGENT_ID: ${agentId}`);
  console.log('');

  if (!daemonInfo.running) {
    console.log('  Daemon: not running');
    console.log('  No active sessions.');
    return;
  }

  console.log(`  Daemon: running (PID: ${daemonInfo.pid})`);
  console.log('');

  if (sessions.length === 0) {
    console.log('  No active MCP sessions.');
    return;
  }

  console.log('  Active sessions:');
  for (const session of sessions) {
    const idleMs = Date.now() - session.lastUsedAt.getTime();
    const idleSec = Math.floor(idleMs / 1000);
    const timeoutSec = Math.floor(session.timeoutMs / 1000);
    const remaining = Math.max(0, timeoutSec - idleSec);
    console.log(`    ${session.serverName}`);
    console.log(`       PID: ${session.pid ?? 'unknown'}, Idle: ${idleSec}s, Timeout in: ${remaining}s`);
  }
}

/**
 * List tools available on a server.
 */
async function handleListTools(
  config: McpServerConfig,
  tools: McpToolSchema[],
  json?: boolean
): Promise<void> {
  if (json) {
    console.log(JSON.stringify({
      success: true,
      server: config.name,
      stateful: config.stateful ?? false,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    }, null, 2));
    return;
  }

  const stateLabel = config.stateful ? '[STATEFUL]' : '[STATELESS]';
  console.log(`${config.name} - ${config.description} ${stateLabel}`);
  console.log('');
  console.log(`Tools (${tools.length}):`);

  for (const tool of tools) {
    // Build parameter signature
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

    console.log(`  ${tool.name}(${params.join(', ')})`);
    if (tool.description) {
      console.log(`       ${tool.description}`);
    }
  }

  console.log('');
  console.log('Usage: ah tools ' + config.name + ':<tool> --<param>=<value>');

  if (config.stateful) {
    console.log('');
    console.log('Session: auto-starts on first call, use --restart for recovery');
  }
}

/**
 * Handle daemon shutdown command.
 */
async function handleShutdownDaemon(
  agentId: string,
  json?: boolean
): Promise<void> {
  const daemonInfo = await getDaemonInfo(agentId);

  if (!daemonInfo.running) {
    if (json) {
      console.log(JSON.stringify({
        success: true,
        agentId,
        wasRunning: false,
      }, null, 2));
    } else {
      console.log(`Daemon not running (AGENT_ID: ${agentId}).`);
    }
    return;
  }

  await shutdownDaemon(agentId);

  if (json) {
    console.log(JSON.stringify({
      success: true,
      agentId,
      wasRunning: true,
      pid: daemonInfo.pid,
    }, null, 2));
  } else {
    console.log(`Daemon shutdown (AGENT_ID: ${agentId}, PID: ${daemonInfo.pid}).`);
  }
}

/**
 * Handle session restart command.
 */
async function handleSessionRestart(
  config: McpServerConfig,
  agentId: string,
  json?: boolean
): Promise<void> {
  const result = await restartServer(config, agentId);

  if (json) {
    console.log(JSON.stringify({
      success: result.success,
      server: config.name,
      agentId,
      pid: result.pid,
      error: result.error,
    }, null, 2));
    return;
  }

  if (result.success) {
    console.log(`Session ${config.name} restarted (AGENT_ID: ${agentId}, MCP PID: ${result.pid ?? 'unknown'}).`);
  } else {
    console.error(`Failed to restart ${config.name}: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Parse tool arguments from command line.
 *
 * Supports:
 * - --param=value
 * - --param value
 * - --flag (boolean true)
 * - JSON string as single argument
 */
function parseToolArgs(args: string[]): Record<string, unknown> {
  // Filter out our own flags
  const toolArgs = args.filter((arg) =>
    arg !== '--restart' &&
    arg !== '--json' &&
    arg !== '--help-tool' &&
    arg !== '--list' &&
    arg !== '--sessions' &&
    arg !== '--shutdown-daemon'
  );

  // Check if first arg is JSON
  if (toolArgs.length === 1 && toolArgs[0].startsWith('{')) {
    try {
      return JSON.parse(toolArgs[0]);
    } catch {
      // Not JSON, parse as flags
    }
  }

  const params: Record<string, unknown> = {};
  let i = 0;

  while (i < toolArgs.length) {
    const arg = toolArgs[i];

    if (arg.startsWith('--')) {
      const withoutDashes = arg.slice(2);

      if (withoutDashes.includes('=')) {
        // --param=value
        const [key, ...valueParts] = withoutDashes.split('=');
        const value = valueParts.join('=');
        params[key] = parseValue(value);
      } else if (i + 1 < toolArgs.length && !toolArgs[i + 1].startsWith('--')) {
        // --param value
        params[withoutDashes] = parseValue(toolArgs[i + 1]);
        i++;
      } else {
        // --flag (boolean)
        params[withoutDashes] = true;
      }
    }

    i++;
  }

  return params;
}

/**
 * Parse a string value to appropriate type.
 */
function parseValue(value: string): unknown {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  // JSON array or object
  if ((value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('{') && value.endsWith('}'))) {
    try {
      return JSON.parse(value);
    } catch {
      // Return as string
    }
  }

  return value;
}
