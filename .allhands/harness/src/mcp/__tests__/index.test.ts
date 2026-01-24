/**
 * Tests for MCP Server Registry
 */

import { describe, expect, it } from 'vitest';
import { discoverServers, getServer, listServerNames } from '../index.js';

describe('MCP Server Registry', () => {
  it('discovers servers from directory', async () => {
    const servers = await discoverServers();

    // Returns a Map (may be empty if no servers configured)
    expect(servers).toBeInstanceOf(Map);
  });

  it('getServer returns undefined for unknown name', async () => {
    const config = await getServer('nonexistent-server');
    expect(config).toBeUndefined();
  });

  it('listServerNames returns array', async () => {
    const names = await listServerNames();

    expect(names).toBeInstanceOf(Array);

    // If there are names, they should be sorted
    if (names.length > 0) {
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    }
  });

  it('server configs have required fields when present', async () => {
    const servers = await discoverServers();

    for (const [name, config] of servers) {
      expect(config.name).toBe(name);
      expect(config.description).toBeTruthy();

      // Should have either command (stdio) or url (http/sse)
      const hasCommand = config.command !== undefined;
      const hasUrl = config.url !== undefined;
      expect(hasCommand || hasUrl).toBe(true);
    }
  });
});
