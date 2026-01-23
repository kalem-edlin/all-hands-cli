/**
 * Schema Command (Agent-Facing)
 *
 * Outputs schema definitions for file types.
 * Agents use this to understand how to write valid files.
 *
 * Usage: ah schema <type> [property]
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse, stringify } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function register(program: Command): void {
  program
    .command('schema <type> [property]')
    .description('Output schema for a file type (prompt, alignment, spec, documentation). Optionally specify a top-level property to inspect.')
    .option('--json', 'Output as JSON instead of YAML')
    .action(async (type: string, property: string | undefined, options: { json?: boolean }) => {
      const schemaDir = join(__dirname, '..', '..', 'schema');
      const schemaPath = join(schemaDir, `${type}.yaml`);

      if (!existsSync(schemaPath)) {
        const available = getAvailableSchemas(schemaDir);
        console.error(`Schema not found: ${type}`);
        console.error(`Available schemas: ${available.join(', ')}`);
        process.exit(1);
      }

      const content = readFileSync(schemaPath, 'utf-8');
      const parsed = parse(content);

      // If a property is specified, extract only that top-level property
      if (property) {
        if (!(property in parsed)) {
          const availableProps = Object.keys(parsed);
          console.warn(`Warning: Property '${property}' not found in schema '${type}'`);
          console.warn(`Available top-level properties: ${availableProps.join(', ')}`);
          process.exit(1);
        }

        const subset = { [property]: parsed[property] };
        if (options.json) {
          console.log(JSON.stringify(subset, null, 2));
        } else {
          console.log(stringify(subset));
        }
        return;
      }

      // Output full schema
      if (options.json) {
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log(content);
      }
    });
}

function getAvailableSchemas(schemaDir: string): string[] {
  if (!existsSync(schemaDir)) return [];

  const { readdirSync } = require('fs');
  return readdirSync(schemaDir)
    .filter((f: string) => f.endsWith('.yaml'))
    .map((f: string) => f.replace('.yaml', ''));
}
