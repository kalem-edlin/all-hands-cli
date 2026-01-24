/**
 * Validate Command (Agent-Facing)
 *
 * Validates files against their schema types.
 * Used by hooks and agents to verify file correctness.
 *
 * Usage:
 *   ah validate <file> [--type <type>]  - Validate a single file
 *   ah validate agents                   - Validate all agent profiles
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadAllProfiles } from '../lib/opencode/index.js';
import {
  formatErrors,
  listSchemas,
  validateFile,
} from '../lib/schema.js';
import { TEMPLATE_VAR_NAMES } from '../lib/schemas/template-vars.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function register(program: Command): void {
  const validateCmd = program
    .command('validate')
    .description('Validate files against schemas');

  // Subcommand: validate agents
  validateCmd
    .command('agents')
    .description('Validate all agent profiles')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const { profiles, errors } = loadAllProfiles();

      if (options.json) {
        console.log(JSON.stringify({
          success: errors.length === 0,
          profileCount: profiles.length,
          errors,
          templateVars: TEMPLATE_VAR_NAMES,
        }));
        process.exit(errors.length === 0 ? 0 : 1);
      }

      console.log(`\nAgent Profile Validation`);
      console.log(`========================\n`);
      console.log(`Found ${profiles.length} agent profiles\n`);

      if (errors.length === 0) {
        console.log('All profiles valid!\n');
        for (const profile of profiles) {
          console.log(`  ${profile.name}`);
          console.log(`    Flow: ${profile.flow}`);
          console.log(`    TUI Action: ${profile.tuiAction ?? '(none)'}`);
          console.log(`    Template Vars: ${profile.templateVars.length > 0 ? profile.templateVars.join(', ') : '(none)'}`);
          console.log();
        }
      } else {
        console.log('Validation errors:\n');
        for (const err of errors) {
          console.log(`  ${err.name}:`);
          for (const e of err.errors) {
            console.log(`    ERROR: ${e}`);
          }
          for (const w of err.warnings) {
            console.log(`    WARN: ${w}`);
          }
          console.log();
        }
        process.exit(1);
      }

      console.log('\nValid template variables:');
      console.log(`  ${TEMPLATE_VAR_NAMES.join(', ')}\n`);
    });

  // Subcommand: validate file <path>
  validateCmd
    .command('file <path>')
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
  if (file.includes('/validation/') && file.endsWith('.md')) {
    return 'validation-suite';
  }
  if (file.includes('/skills/') && file.endsWith('SKILL.md')) {
    return 'skill';
  }
  return null;
}
