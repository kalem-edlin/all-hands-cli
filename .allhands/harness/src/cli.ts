#!/usr/bin/env tsx
/**
 * All Hands CLI - Main Entry Point
 *
 * Commands are auto-discovered from the commands/ directory.
 * Each command module exports a `register` function.
 */

import { Command } from 'commander';
import { discoverAndRegister } from './commands/index.js';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('ah')
    .description('All Hands - Agentic harness for model-first software development')
    .version('0.1.0');

  // Auto-discover and register all commands
  await discoverAndRegister(program);

  // Handle no command
  if (process.argv.length <= 2) {
    program.help();
  }

  await program.parseAsync();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
