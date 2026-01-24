/**
 * Tests for MCP Runtime
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  interpolateEnv,
  resolveEnvVars,
  buildServerCommand,
  formatToolHelp,
  type McpServerConfig,
  type McpToolSchema,
} from '../mcp-runtime.js';

describe('interpolateEnv', () => {
  beforeEach(() => {
    vi.stubEnv('TEST_VAR', 'test-value');
    vi.stubEnv('ANOTHER_VAR', 'another-value');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('replaces ${VAR} with env value', () => {
    const result = interpolateEnv('prefix-${TEST_VAR}-suffix');
    expect(result).toBe('prefix-test-value-suffix');
  });

  it('replaces multiple vars', () => {
    const result = interpolateEnv('${TEST_VAR} and ${ANOTHER_VAR}');
    expect(result).toBe('test-value and another-value');
  });

  it('returns string unchanged if no vars', () => {
    const result = interpolateEnv('no vars here');
    expect(result).toBe('no vars here');
  });

  it('throws if env var not set', () => {
    expect(() => interpolateEnv('${NONEXISTENT_VAR}')).toThrow(
      'Environment variable NONEXISTENT_VAR is not set'
    );
  });
});

describe('resolveEnvVars', () => {
  beforeEach(() => {
    vi.stubEnv('API_KEY', 'secret-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves all env vars in object', () => {
    const result = resolveEnvVars({
      KEY: '${API_KEY}',
      STATIC: 'static-value',
    });
    expect(result).toEqual({
      KEY: 'secret-key',
      STATIC: 'static-value',
    });
  });

  it('returns empty object for undefined', () => {
    expect(resolveEnvVars(undefined)).toEqual({});
  });
});

describe('buildServerCommand', () => {
  it('builds stdio command', () => {
    const config: McpServerConfig = {
      name: 'test',
      description: 'Test server',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@example/server'],
    };

    const result = buildServerCommand(config);
    expect(result).toEqual(['npx', '-y', '@example/server']);
  });

  it('builds http URL', () => {
    const config: McpServerConfig = {
      name: 'test',
      description: 'Test server',
      type: 'http',
      url: 'https://api.example.com/mcp',
    };

    const result = buildServerCommand(config);
    expect(result).toEqual(['https://api.example.com/mcp']);
  });

  it('defaults to stdio when type not specified', () => {
    const config: McpServerConfig = {
      name: 'test',
      description: 'Test server',
      command: 'npx',
      args: ['server'],
    };

    const result = buildServerCommand(config);
    expect(result).toEqual(['npx', 'server']);
  });

  it('throws if stdio missing command', () => {
    const config: McpServerConfig = {
      name: 'test',
      description: 'Test server',
      type: 'stdio',
    };

    expect(() => buildServerCommand(config)).toThrow("requires 'command'");
  });

  it('throws if http missing url', () => {
    const config: McpServerConfig = {
      name: 'test',
      description: 'Test server',
      type: 'http',
    };

    expect(() => buildServerCommand(config)).toThrow("requires 'url'");
  });
});

describe('formatToolHelp', () => {
  it('formats tool with required params', () => {
    const tool: McpToolSchema = {
      name: 'my_tool',
      description: 'Does something useful',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target URL' },
          count: { type: 'number', description: 'Number of items' },
        },
        required: ['url'],
      },
    };

    const result = formatToolHelp(tool);
    expect(result).toContain('my_tool(url:string, [count:number])');
    expect(result).toContain('Does something useful');
    expect(result).toContain('url (required)');
    expect(result).toContain('count (optional)');
  });

  it('formats tool with no params', () => {
    const tool: McpToolSchema = {
      name: 'simple',
      description: 'Simple tool',
    };

    const result = formatToolHelp(tool);
    expect(result).toContain('simple()');
    expect(result).toContain('Simple tool');
  });

  it('includes hint when provided', () => {
    const tool: McpToolSchema = {
      name: 'my_tool',
      description: 'Does something',
    };

    const result = formatToolHelp(tool, 'Use this for validation');
    expect(result).toContain('Hint: Use this for validation');
  });

  it('formats array types', () => {
    const tool: McpToolSchema = {
      name: 'batch',
      description: 'Batch operation',
      inputSchema: {
        type: 'object',
        properties: {
          urls: { type: 'array', items: { type: 'string' } },
        },
        required: ['urls'],
      },
    };

    const result = formatToolHelp(tool);
    expect(result).toContain('urls:string[]');
  });
});
