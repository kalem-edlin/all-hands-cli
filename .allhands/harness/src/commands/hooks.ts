/**
 * Hooks Command (Hidden)
 *
 * Internal command for Claude Code hook handlers.
 * All hooks read JSON from stdin and output JSON to stdout.
 *
 * Subcommands are auto-discovered from src/hooks/*.ts files.
 * Each hook module exports a `register(parent: Command)` function.
 *
 * Usage:
 *   echo '{"tool_name":"WebFetch","tool_input":{"url":"..."}}' | ah hooks enforcement github-url
 */

import { Command } from 'commander';
import { discoverAndRegisterHooks } from '../hooks/index.js';

export function register(program: Command): void {
  const hooks = program
    .command('hooks', { hidden: true })
    .description('Hook commands (internal use)');

  // Auto-discover and register hook subcommands
  discoverAndRegisterHooks(hooks);
}
