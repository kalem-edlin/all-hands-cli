/**
 * Validation Tools Command (Agent-Facing)
 *
 * Lists and discovers validation tooling suites.
 * Agents use this to find relevant validation tooling for their tasks.
 *
 * Usage: ah validation-tools list
 */

import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { tracedAction } from '../lib/base-command.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ValidationSuiteFrontmatter {
  name: string;
  description: string;
  globs: string[];
  tools: string[];
}

interface ValidationSuiteEntry {
  name: string;
  description: string;
  globs: string[];
  tools: string[];
  file: string;
}

/**
 * Extract frontmatter from markdown content
 */
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Get the validation directory path
 * Path: harness/src/commands/ -> harness/src/ -> harness/ -> .allhands/ -> validation/
 */
function getValidationToolingDir(): string {
  return join(__dirname, '..', '..', '..', 'validation');
}

/**
 * List all validation suites by reading .md files and extracting frontmatter
 */
function listValidationSuites(): ValidationSuiteEntry[] {
  const dir = getValidationToolingDir();

  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const suites: ValidationSuiteEntry[] = [];

  for (const file of files) {
    const filePath = join(dir, file);
    const content = readFileSync(filePath, 'utf-8');
    const frontmatter = extractFrontmatter(content) as ValidationSuiteFrontmatter | null;

    if (frontmatter && frontmatter.name && frontmatter.description && frontmatter.globs && Array.isArray(frontmatter.tools)) {
      suites.push({
        name: frontmatter.name,
        description: frontmatter.description,
        globs: frontmatter.globs,
        tools: frontmatter.tools,
        file: `.allhands/validation/${file}`,
      });
    }
  }

  return suites;
}

export function register(program: Command): void {
  const cmd = program
    .command('validation-tools')
    .description('Discover and list validation tooling suites');

  cmd
    .command('list')
    .description('List all validation suites with their descriptions and glob patterns')
    .option('--json', 'Output as JSON (default)')
    .action(tracedAction('validation-tools list', async () => {
      const suites = listValidationSuites();

      if (suites.length === 0) {
        console.log(JSON.stringify({
          success: true,
          suites: [],
          message: 'No validation suites found. Create suites in .allhands/validation/ using `ah schema validation-suite` for the file structure.',
        }, null, 2));
        return;
      }

      console.log(JSON.stringify({
        success: true,
        suites,
        count: suites.length,
      }, null, 2));
    }));
}
