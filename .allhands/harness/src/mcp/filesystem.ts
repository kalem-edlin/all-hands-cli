/**
 * Filesystem MCP Server - File system operations
 *
 * Provides file reading and directory listing capabilities.
 * Stateless - each call is independent.
 *
 * Source: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem
 *
 * No API key required.
 */

import type { McpServerConfig } from '../lib/mcp-runtime.js';

export const config: McpServerConfig = {
  name: 'filesystem',

  description: 'File system operations - read files, list directories',

  type: 'stdio',

  command: 'npx',
  // The path argument is the allowed directory - using current working directory
  args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],

  // Stateless - no session persistence needed
  stateful: false,

  toolHints: {
    read_file: 'Read the contents of a file at the given path.',
    list_directory: 'List contents of a directory.',
    write_file: 'Write content to a file.',
  },
};
