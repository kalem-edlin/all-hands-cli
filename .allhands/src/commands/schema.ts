/**
 * Schema Command (Agent-Facing)
 *
 * Outputs schema definitions for file types.
 * Agents use this to understand how to write valid files.
 *
 * Usage: ah schema <type>
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function register(program: Command): void {
  program
    .command('schema <type>')
    .description('Output schema for a file type (prompt, alignment, spec, documentation)')
    .option('--json', 'Output as JSON instead of YAML')
    .action(async (type: string, options: { json?: boolean }) => {
      const schemaDir = join(__dirname, '..', '..', 'schema');
      const schemaPath = join(schemaDir, `${type}.yaml`);

      if (!existsSync(schemaPath)) {
        const available = getAvailableSchemas(schemaDir);
        console.error(`Schema not found: ${type}`);
        console.error(`Available schemas: ${available.join(', ')}`);
        process.exit(1);
      }

      const content = readFileSync(schemaPath, 'utf-8');

      if (options.json) {
        const { parse } = await import('yaml');
        const parsed = parse(content);
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
