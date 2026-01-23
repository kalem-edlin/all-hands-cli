/**
 * Validate Command (Agent-Facing)
 *
 * Validates files against their schema types.
 * Used by hooks and agents to verify file correctness.
 *
 * Usage: ah validate <file> [--type <type>]
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  validateFile,
  listSchemas,
  formatErrors,
} from '../lib/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function register(program: Command): void {
  program
    .command('validate <file>')
    .description('Validate a file against its schema')
    .option('-t, --type <type>', 'Schema type (prompt, alignment, spec, documentation)')
    .option('--json', 'Output as JSON')
    .action(async (file: string, options: { type?: string; json?: boolean }) => {
      if (!existsSync(file)) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }));
        } else {
          console.error(`File not found: ${file}`);
        }
        process.exit(1);
      }

      let schemaType = options.type;
      if (!schemaType) {
        schemaType = inferSchemaType(file) ?? undefined;
      }

      if (!schemaType) {
        const available = listSchemas();
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Could not determine schema type',
            available,
          }));
        } else {
          console.error('Could not determine schema type. Use --type to specify.');
          console.error(`Available types: ${available.join(', ')}`);
        }
        process.exit(1);
      }

      const content = readFileSync(file, 'utf-8');
      const result = validateFile(content, schemaType);

      if (options.json) {
        console.log(JSON.stringify({
          success: result.valid,
          file,
          schemaType,
          errors: result.errors,
        }));
        process.exit(result.valid ? 0 : 1);
      }

      if (result.valid) {
        console.log(`Valid: ${file} (schema: ${schemaType})`);
      } else {
        console.error(`Invalid: ${file} (schema: ${schemaType})`);
        console.error(formatErrors(result));
        process.exit(1);
      }
    });
}

function inferSchemaType(file: string): string | null {
  if (file.includes('/prompts/') || file.match(/prompt.*\.md$/i)) {
    return 'prompt';
  }
  if (file.includes('alignment') || file.match(/alignment\.md$/i)) {
    return 'alignment';
  }
  if (file.includes('/specs/') || file.endsWith('.spec.md')) {
    return 'spec';
  }
  if (file.includes('/docs/') && file.endsWith('.md')) {
    return 'documentation';
  }
  return null;
}
