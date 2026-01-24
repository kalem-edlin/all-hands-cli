/**
 * Command Registry - Auto-discovers command modules.
 *
 * Each command file should export a `register` function that takes
 * a Commander program and registers its commands.
 */

import { readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CommandModule {
  register: (program: Command) => void;
}

/**
 * Auto-discover and register all command modules in the commands directory.
 *
 * Discovers:
 * - Single-file modules: foo.ts exports { register }
 * - Skips: index.ts, base files
 */
export async function discoverAndRegister(program: Command): Promise<void> {
  const entries = readdirSync(__dirname);

  for (const entry of entries) {
    const entryPath = join(__dirname, entry);
    const stat = statSync(entryPath);

    // Skip directories and non-ts files
    if (stat.isDirectory()) continue;
    if (!entry.endsWith('.ts')) continue;
    if (entry === 'index.ts') continue;

    const moduleName = entry.replace('.ts', '');
    const importPath = `./${moduleName}.js`;

    try {
      const module = (await import(importPath)) as CommandModule;
      if (typeof module.register === 'function') {
        module.register(program);
      }
    } catch (e) {
      // Skip modules with errors - log for debugging
      console.error(`Warning: Could not load ${moduleName}: ${e}`);
    }
  }
}
