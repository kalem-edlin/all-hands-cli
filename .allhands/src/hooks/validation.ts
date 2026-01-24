/**
 * Validation Hooks
 *
 * PostToolUse hooks that run diagnostics on edited files:
 * - Python: pyright + ruff (if available)
 * - TypeScript: tsc --noEmit
 * - Schema validation for schema-managed markdown files
 */

import { execSync } from 'child_process';
import { extname, join, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { Command } from 'commander';
import { parse as parseYaml } from 'yaml';
import { HookInput, outputContext, allowTool, blockTool, denyTool, readHookInput, getProjectDir } from './shared.js';
import { minimatch } from 'minimatch';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DiagnosticResult {
  tool: string;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Detection
// ─────────────────────────────────────────────────────────────────────────────

function isToolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Python Diagnostics
// ─────────────────────────────────────────────────────────────────────────────

function runPyrightDiagnostics(filePath: string): DiagnosticResult | null {
  if (!isToolAvailable('pyright')) {
    return null;
  }

  try {
    execSync(`pyright --outputjson "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return null; // No errors
  } catch (e: unknown) {
    const error = e as { stdout?: string };
    if (error.stdout) {
      try {
        const output = JSON.parse(error.stdout);
        const diagnostics = output.generalDiagnostics || [];
        const errors = diagnostics
          .filter((d: { severity: string }) => d.severity === 'error')
          .map((d: { file: string; range: { start: { line: number } }; message: string }) => {
            const line = d.range?.start?.line ?? 0;
            return `${d.file}:${line}: ${d.message}`;
          })
          .slice(0, 5); // Limit to 5 errors

        if (errors.length > 0) {
          return { tool: 'pyright', errors };
        }
      } catch {
        // Parse error, skip
      }
    }
    return null;
  }
}

function runRuffDiagnostics(filePath: string): DiagnosticResult | null {
  if (!isToolAvailable('ruff')) {
    return null;
  }

  try {
    execSync(`ruff check "${filePath}" --output-format=text`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return null; // No errors
  } catch (e: unknown) {
    const error = e as { stdout?: string };
    if (error.stdout) {
      const lines = error.stdout.trim().split('\n').filter(Boolean).slice(0, 5);
      if (lines.length > 0) {
        return { tool: 'ruff', errors: lines };
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript Diagnostics
// ─────────────────────────────────────────────────────────────────────────────

function runTscDiagnostics(filePath: string): DiagnosticResult | null {
  if (!isToolAvailable('tsc')) {
    return null;
  }

  try {
    execSync(`tsc --noEmit "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return null; // No errors
  } catch (e: unknown) {
    const error = e as { stdout?: string; stderr?: string };
    const output = error.stdout || error.stderr || '';
    if (output) {
      const lines = output.trim().split('\n').filter(Boolean).slice(0, 5);
      if (lines.length > 0) {
        return { tool: 'tsc', errors: lines };
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Diagnostics Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run diagnostics on an edited file.
 *
 * Triggered by: PostToolUse matcher "(Write|Edit)"
 */
export function runDiagnostics(input: HookInput): void {
  const filePath = input.tool_input?.file_path as string | undefined;

  if (!filePath) {
    allowTool();
  }

  const ext = extname(filePath!).toLowerCase();
  const results: DiagnosticResult[] = [];

  // Python files
  if (ext === '.py') {
    const pyright = runPyrightDiagnostics(filePath!);
    if (pyright) results.push(pyright);

    const ruff = runRuffDiagnostics(filePath!);
    if (ruff) results.push(ruff);
  }

  // TypeScript files
  if (ext === '.ts' || ext === '.tsx') {
    const tsc = runTscDiagnostics(filePath!);
    if (tsc) results.push(tsc);
  }

  // Output context if there are errors
  if (results.length > 0) {
    const context = formatDiagnosticsContext(results);
    outputContext(context);
  }

  allowTool();
}

/**
 * Format diagnostic results as context string.
 */
function formatDiagnosticsContext(results: DiagnosticResult[]): string {
  const parts: string[] = ['## Diagnostics'];

  for (const result of results) {
    parts.push(`\n### ${result.tool}`);
    result.errors.forEach((e) => parts.push(e));
  }

  parts.push('\nPlease fix these issues before continuing.');

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Validation
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SchemaPattern {
  pattern: string;
  schemaType: 'prompt' | 'alignment' | 'spec' | 'documentation' | 'validation-suite' | 'skill';
}

const SCHEMA_PATTERNS: SchemaPattern[] = [
  { pattern: '.planning/**/prompts/*.md', schemaType: 'prompt' },
  { pattern: '.planning/**/alignment.md', schemaType: 'alignment' },
  { pattern: 'specs/**/*.spec.md', schemaType: 'spec' },
  { pattern: 'specs/roadmap/**/*.spec.md', schemaType: 'spec' },
  { pattern: 'docs/**/*.md', schemaType: 'documentation' },
  { pattern: '.allhands/validation-tooling/*.md', schemaType: 'validation-suite' },
  { pattern: '.allhands/skills/*/SKILL.md', schemaType: 'skill' },
];

interface SchemaDefinition {
  frontmatter: Record<string, {
    type: string;
    required?: boolean;
    default?: unknown;
    values?: string[];
    items?: string;
    description?: string;
  }>;
  body?: {
    description?: string;
    sections?: Array<{
      name: string;
      required?: boolean;
      description?: string;
    }>;
  };
}

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Detect which schema applies to a file path
 */
function detectSchemaType(filePath: string): 'prompt' | 'alignment' | 'spec' | 'documentation' | 'validation-suite' | 'skill' | null {
  const projectDir = getProjectDir();
  // Make path relative to project
  const relativePath = filePath.startsWith(projectDir)
    ? filePath.slice(projectDir.length + 1)
    : filePath;

  for (const { pattern, schemaType } of SCHEMA_PATTERNS) {
    if (minimatch(relativePath, pattern)) {
      return schemaType;
    }
  }
  return null;
}

/**
 * Load schema definition from YAML file
 */
function loadSchema(schemaType: string): SchemaDefinition | null {
  const schemaPath = join(__dirname, '..', '..', 'schema', `${schemaType}.yaml`);
  if (!existsSync(schemaPath)) {
    return null;
  }

  try {
    const content = readFileSync(schemaPath, 'utf-8');
    return parseYaml(content) as SchemaDefinition;
  } catch {
    return null;
  }
}

/**
 * Parse frontmatter from a markdown file
 */
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract folder name from skill file path
 * e.g., ".allhands/skills/my-skill/SKILL.md" -> "my-skill"
 */
function extractSkillFolderName(filePath: string): string | null {
  const match = filePath.match(/\.allhands\/skills\/([^/]+)\/SKILL\.md$/);
  return match ? match[1] : null;
}

/**
 * Validate skill-specific rules (name must match folder)
 */
function validateSkillSpecificRules(
  filePath: string,
  frontmatter: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const folderName = extractSkillFolderName(filePath);

  if (folderName && frontmatter.name && frontmatter.name !== folderName) {
    errors.push({
      field: 'name',
      message: `Skill name '${frontmatter.name}' must match containing folder '${folderName}'`,
    });
  }

  return errors;
}

/**
 * Validate frontmatter against schema
 */
function validateFrontmatter(
  frontmatter: Record<string, unknown>,
  schema: SchemaDefinition
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!schema.frontmatter) return errors;

  // Check required fields
  for (const [fieldName, fieldDef] of Object.entries(schema.frontmatter)) {
    const value = frontmatter[fieldName];

    // Check required
    if (fieldDef.required && (value === undefined || value === null)) {
      errors.push({
        field: fieldName,
        message: `Required field '${fieldName}' is missing`,
      });
      continue;
    }

    // Skip validation if not present and not required
    if (value === undefined || value === null) continue;

    // Type validation
    switch (fieldDef.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be a string`,
          });
        }
        break;

      case 'integer':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be an integer`,
          });
        }
        break;

      case 'enum':
        if (fieldDef.values && !fieldDef.values.includes(value as string)) {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be one of: ${fieldDef.values.join(', ')}`,
          });
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push({
            field: fieldName,
            message: `Field '${fieldName}' must be an array`,
          });
        }
        break;
    }
  }

  return errors;
}

/**
 * Run schema validation on a file.
 * Returns validation errors or null if valid.
 */
function runSchemaValidation(filePath: string): ValidationError[] | null {
  // Detect schema type
  const schemaType = detectSchemaType(filePath);
  if (!schemaType) {
    // Not a schema-managed file
    return null;
  }

  // Load schema
  const schema = loadSchema(schemaType);
  if (!schema) {
    return null;
  }

  // Read file content
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, 'utf-8');

  // Parse frontmatter
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return [{
      field: 'frontmatter',
      message: 'File is missing valid YAML frontmatter (---...---)',
    }];
  }

  // Validate against schema
  const errors = validateFrontmatter(frontmatter, schema);

  // Add skill-specific validation
  if (schemaType === 'skill') {
    errors.push(...validateSkillSpecificRules(filePath, frontmatter));
  }

  return errors;
}

/**
 * Run schema validation on content (for PreToolUse before file is written).
 * Returns validation errors or null if valid/not schema-managed.
 */
function runSchemaValidationOnContent(filePath: string, content: string): ValidationError[] | null {
  // Detect schema type
  const schemaType = detectSchemaType(filePath);
  if (!schemaType) {
    // Not a schema-managed file
    return null;
  }

  // Load schema
  const schema = loadSchema(schemaType);
  if (!schema) {
    return null;
  }

  // Parse frontmatter from content
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return [{
      field: 'frontmatter',
      message: 'File is missing valid YAML frontmatter (---...---)',
    }];
  }

  // Validate against schema
  const errors = validateFrontmatter(frontmatter, schema);

  // Add skill-specific validation
  if (schemaType === 'skill') {
    errors.push(...validateSkillSpecificRules(filePath, frontmatter));
  }

  return errors;
}

/**
 * Format validation errors as context string
 */
function formatSchemaErrors(errors: ValidationError[], schemaType: string): string {
  const parts: string[] = [`## Schema Validation Errors (${schemaType})`];

  for (const error of errors) {
    parts.push(`- ${error.message}`);
  }

  parts.push('\nPlease fix the frontmatter to match the schema. Run `ah schema ' + schemaType + '` to see the expected format.');

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register validation hook subcommands.
 */
export function register(parent: Command): void {
  const validation = parent
    .command('validation')
    .description('Validation hooks');

  validation
    .command('diagnostics')
    .description('Run diagnostics on edited files (PostToolUse)')
    .action(async () => {
      try {
        const input = await readHookInput();
        runDiagnostics(input);
      } catch {
        allowTool();
      }
    });

  validation
    .command('schema')
    .description('Validate schema-managed markdown files (PostToolUse)')
    .action(async () => {
      try {
        const input = await readHookInput();
        const filePath = input.tool_input?.file_path as string | undefined;

        if (!filePath) {
          allowTool();
        }

        const errors = runSchemaValidation(filePath!);

        if (errors && errors.length > 0) {
          const schemaType = detectSchemaType(filePath!) || 'unknown';
          const context = formatSchemaErrors(errors, schemaType);
          blockTool(context);
        }

        allowTool();
      } catch {
        allowTool();
      }
    });

  validation
    .command('schema-pre')
    .description('Validate schema-managed markdown files before write/edit (PreToolUse)')
    .action(async () => {
      try {
        const input = await readHookInput();
        const toolName = input.tool_name as string | undefined;
        const filePath = input.tool_input?.file_path as string | undefined;

        if (!filePath) {
          allowTool();
          return;
        }

        let contentToValidate: string | undefined;

        if (toolName === 'Write') {
          // Write tool provides content directly
          contentToValidate = input.tool_input?.content as string | undefined;
        } else if (toolName === 'Edit') {
          // Edit tool provides old_string and new_string - we need to compute the result
          const oldString = input.tool_input?.old_string as string | undefined;
          const newString = input.tool_input?.new_string as string | undefined;
          const replaceAll = input.tool_input?.replace_all as boolean | undefined;

          if (oldString === undefined || newString === undefined) {
            allowTool();
            return;
          }

          // Read current file content
          if (!existsSync(filePath)) {
            allowTool();
            return;
          }

          const currentContent = readFileSync(filePath, 'utf-8');

          // Apply the edit to get the resulting content
          if (replaceAll) {
            contentToValidate = currentContent.split(oldString).join(newString);
          } else {
            contentToValidate = currentContent.replace(oldString, newString);
          }
        }

        if (!contentToValidate) {
          allowTool();
          return;
        }

        const errors = runSchemaValidationOnContent(filePath, contentToValidate);

        if (errors && errors.length > 0) {
          const schemaType = detectSchemaType(filePath) || 'unknown';
          const context = formatSchemaErrors(errors, schemaType);
          denyTool(context);
        }

        allowTool();
      } catch {
        allowTool();
      }
    });
}
