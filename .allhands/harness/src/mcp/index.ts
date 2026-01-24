/**
 * MCP Server Registry
 *
 * Auto-discovers MCP server configs from this directory.
 * Each .ts file (except index.ts and _template.ts) should export
 * a `config` object of type McpServerConfig.
 */

import { readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { McpServerConfig } from '../lib/mcp-runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface McpServerModule {
  config: McpServerConfig;
}

/**
 * Discover and load all MCP server configs.
 */
export async function discoverServers(): Promise<Map<string, McpServerConfig>> {
  const servers = new Map<string, McpServerConfig>();
  const entries = readdirSync(__dirname);

  for (const entry of entries) {
    // Skip index and template
    if (entry === 'index.ts' || entry === '_template.ts') continue;

    const entryPath = join(__dirname, entry);
    const stat = statSync(entryPath);

    // Only .ts files
    if (stat.isDirectory()) continue;
    if (!entry.endsWith('.ts')) continue;

    const moduleName = entry.replace('.ts', '');
    const importPath = `./${moduleName}.js`;

    try {
      const module = (await import(importPath)) as McpServerModule;
      if (module.config && typeof module.config === 'object') {
        servers.set(module.config.name, module.config);
      }
    } catch (e) {
      // Log but don't fail - allow partial discovery
      console.error(`Warning: Could not load MCP server ${moduleName}: ${e}`);
    }
  }

  return servers;
}

/**
 * Get a specific server config by name.
 */
export async function getServer(name: string): Promise<McpServerConfig | undefined> {
  const servers = await discoverServers();
  return servers.get(name);
}

/**
 * List all available server names.
 */
export async function listServerNames(): Promise<string[]> {
  const servers = await discoverServers();
  return Array.from(servers.keys()).sort();
}
