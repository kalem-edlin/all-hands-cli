/**
 * Hook Registry - Auto-discovers hook modules.
 *
 * Each hook file should export a `register` function that takes
 * a Commander Command (the parent 'hooks' command) and registers its subcommands.
 *
 * Skips: index.ts, shared.ts, transcript-parser.ts (utilities)
 */

import { readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Files to skip (utilities, not hook commands)
const SKIP_FILES = ['index.ts', 'shared.ts', 'transcript-parser.ts'];

export interface HookModule {
  register: (parent: Command) => void;
}

/**
 * Auto-discover and register all hook modules.
 *
 * @param parent - The parent 'hooks' command to register subcommands on
 */
export async function discoverAndRegisterHooks(parent: Command): Promise<void> {
  const entries = readdirSync(__dirname);

  for (const entry of entries) {
    const entryPath = join(__dirname, entry);
    const stat = statSync(entryPath);

    // Skip directories and non-ts files
    if (stat.isDirectory()) continue;
    if (!entry.endsWith('.ts')) continue;
    if (SKIP_FILES.includes(entry)) continue;

    const moduleName = entry.replace('.ts', '');
    const importPath = `./${moduleName}.js`;

    try {
      const module = (await import(importPath)) as HookModule;
      if (typeof module.register === 'function') {
        module.register(parent);
      }
    } catch (e) {
      // Skip modules with errors - log for debugging
      console.error(`Warning: Could not load hook module ${moduleName}: ${e}`);
    }
  }
}
