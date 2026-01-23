/**
 * Playwright MCP Server - Browser automation via Microsoft Playwright
 *
 * Provides browser automation using Playwright's accessibility tree.
 * LLM-friendly - operates on structured data, no vision models needed.
 *
 * Source: https://github.com/microsoft/playwright-mcp
 *
 * No API key required.
 */

import type { McpServerConfig } from '../lib/mcp-runtime.js';

export const config: McpServerConfig = {
  name: 'playwright',

  description: 'Browser automation - navigate, click, fill forms, take screenshots',

  type: 'stdio',

  command: 'npx',
  args: ['-y', '@playwright/mcp@latest'],

  // Stateful - browser session persists between calls
  stateful: true,

  toolHints: {
    browser_navigate: 'Navigate to a URL. First step for any browser interaction.',
    browser_snapshot: 'Get accessibility snapshot of the page. Use to understand page structure.',
    browser_click: 'Click an element by reference from snapshot.',
    browser_type: 'Type text into a focused element.',
    browser_screenshot: 'Take a screenshot. Returns base64 PNG.',
  },
};
