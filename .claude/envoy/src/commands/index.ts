/**
 * Command registry - auto-discovers command modules.
 */

import { readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { CommandClass } from "./base.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Command value can be a CommandClass or a nested group of CommandClasses
export type CommandValue = CommandClass | Record<string, CommandClass>;
export type CommandRegistry = Record<string, CommandValue>;

export interface CommandModule {
  COMMANDS: CommandRegistry;
}

/**
 * Discover all command modules in the commands directory.
 * Returns a map of module name -> COMMANDS object.
 *
 * Supports:
 * - Single-file modules: foo.ts -> import ./foo.js
 * - Directory modules: foo/index.ts -> import ./foo/index.js
 * - Nested command groups (3-level commands like `envoy knowledge docs search`)
 */
export async function discoverCommands(): Promise<
  Map<string, CommandRegistry>
> {
  const commands = new Map<string, CommandRegistry>();

  const entries = readdirSync(__dirname);

  for (const entry of entries) {
    const entryPath = join(__dirname, entry);
    const stat = statSync(entryPath);

    let moduleName: string;
    let importPath: string;

    if (stat.isDirectory()) {
      // Directory module: check for index.ts
      const indexPath = join(entryPath, "index.ts");
      try {
        statSync(indexPath);
        moduleName = entry;
        importPath = `./${entry}/index.js`;
      } catch {
        // No index.ts, skip this directory
        continue;
      }
    } else if (
      entry.endsWith(".ts") &&
      !entry.startsWith("base") &&
      !entry.startsWith("index")
    ) {
      // Single-file module
      moduleName = entry.replace(".ts", "");
      importPath = `./${moduleName}.js`;
    } else {
      continue;
    }

    try {
      const module = (await import(importPath)) as CommandModule;
      if (module.COMMANDS && Object.keys(module.COMMANDS).length > 0) {
        commands.set(moduleName, module.COMMANDS);
      }
    } catch (e) {
      // Skip modules with missing dependencies or errors
      console.error(`Warning: Could not load ${moduleName}: ${e}`);
    }
  }

  return commands;
}
