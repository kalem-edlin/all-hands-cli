/**
 * MCP Server Template
 *
 * Copy this file to create a new MCP server integration:
 *   cp _template.ts my-server.ts
 *
 * Then edit the config to match your server's requirements.
 * The server will be automatically discovered by `ah tools`.
 */

import type { McpServerConfig } from '../lib/mcp-runtime.js';

export const config: McpServerConfig = {
  // Unique name for this server (used in CLI: ah tools <name>:tool)
  name: 'template',

  // Human-readable description
  description: 'Template MCP server - copy and customize',

  // Transport type: 'stdio' (default), 'http', or 'sse'
  type: 'stdio',

  // For stdio transport: command to execute
  command: 'npx',
  args: ['-y', '@example/mcp-server'],

  // Environment variables - use ${VAR_NAME} for values from .env.ai
  env: {
    // EXAMPLE_API_KEY: '${EXAMPLE_API_KEY}',
  },

  // For http/sse transport: URL endpoint (instead of command/args)
  // url: 'https://api.example.com/mcp',

  // HTTP headers for http/sse transport
  // headers: {
  //   Authorization: 'Bearer ${API_TOKEN}',
  // },

  // Tools to hide from discovery (optional)
  // hiddenTools: ['dangerous_tool', 'internal_tool'],

  // Extra hints for specific tools (shown in --help)
  // toolHints: {
  //   my_tool: 'Use this when you need to do X. Prefer Y for Z.',
  // },
};
