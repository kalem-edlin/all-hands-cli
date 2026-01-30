/**
 * Validation Hooks
 *
 * PostToolUse hooks that run diagnostics on edited files:
 * - Python: pyright + ruff (if available)
 * - TypeScript: tsc --noEmit
 * - Schema validation for schema-managed markdown files
 */

import { execSync } from 'child_process';
import type { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { dirname, extname, join, relative } from 'path';
import { minimatch } from 'minimatch';
import {
  detectSchemaType,
  type SchemaType,
  loadSchema as loadSchemaFromLib,
  extractFrontmatter,
  validateFrontmatter as validateFrontmatterFromLib,
  type ValidationError,
} from '../lib/schema.js';
import {
  HookInput,
  HookCategory,
  RegisterFn,
  allowTool,
  blockTool,
  denyTool,
  FormatConfig,
  getProjectDir,
  loadProjectSettings,
  outputContext,
  registerCategory,
  registerCategoryForDaemon,
} from './shared.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hook Names
// ─────────────────────────────────────────────────────────────────────────────

const HOOK_DIAGNOSTICS = 'validation diagnostics';
const HOOK_SCHEMA = 'validation schema';
const HOOK_FORMAT = 'validation format';
const HOOK_SCHEMA_PRE = 'validation schema-pre';

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

/**
 * Find the nearest tsconfig.json by walking up from the file's directory.
 */
function findTsConfig(filePath: string): string | null {
  let dir = dirname(filePath);
  const root = '/';

  while (dir !== root) {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // Reached filesystem root
    dir = parent;
  }

  return null;
}

function runTscDiagnostics(filePath: string): DiagnosticResult | null {
  if (!isToolAvailable('tsc')) {
    return null;
  }

  // Find the project's tsconfig.json to get correct compiler options
  const tsconfig = findTsConfig(filePath);

  try {
    // Run tsc on the whole project and filter for this file's errors
    // This ensures we use the correct tsconfig settings (esModuleInterop, target, etc.)
    // tsc outputs paths relative to tsconfig dir, so convert the absolute filePath to match
    const tscDir = tsconfig ? dirname(tsconfig) : undefined;
    const grepPath = tsconfig ? relative(dirname(tsconfig), filePath) : filePath;
    const tscCmd = tsconfig
      ? `tsc --noEmit -p "${tsconfig}" 2>&1 | grep -E "^${grepPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" || true`
      : `tsc --noEmit "${filePath}"`;

    const output = execSync(tscCmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: tscDir,
    });

    if (output.trim()) {
      const lines = output.trim().split('\n').filter(Boolean).slice(0, 5);
      if (lines.length > 0) {
        return { tool: 'tsc', errors: lines };
      }
    }
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
    allowTool(HOOK_DIAGNOSTICS);
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
    outputContext(context, HOOK_DIAGNOSTICS);
  }

  allowTool(HOOK_DIAGNOSTICS);
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

/**
 * Detect which schema applies to a file path (wrapper for shared function)
 */
function detectSchemaTypeLocal(filePath: string): SchemaType | null {
  return detectSchemaType(filePath, getProjectDir());
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
 * Run schema validation on a file.
 * Delegates to lib/schema.ts for parsing and validation.
 * Returns validation errors or null if valid.
 */
function runSchemaValidation(filePath: string): ValidationError[] | null {
  // Detect schema type
  const schemaType = detectSchemaTypeLocal(filePath);
  if (!schemaType) {
    // Not a schema-managed file
    return null;
  }

  // Load schema (cached in lib)
  const schema = loadSchemaFromLib(schemaType);
  if (!schema) {
    return null;
  }

  // Read file content
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, 'utf-8');

  // Parse frontmatter using lib
  const { frontmatter } = extractFrontmatter(content);
  if (!frontmatter) {
    return [{
      field: 'frontmatter',
      message: 'File is missing valid YAML frontmatter (---...---)',
    }];
  }

  // Validate against schema using lib
  const result = validateFrontmatterFromLib(frontmatter, schema);
  const errors: ValidationError[] = [...result.errors];

  // Add skill-specific validation
  if (schemaType === 'skill') {
    errors.push(...validateSkillSpecificRules(filePath, frontmatter));
  }

  return errors;
}

/**
 * Run schema validation on content (for PreToolUse before file is written).
 * Delegates to lib/schema.ts for parsing and validation.
 * Returns validation errors or null if valid/not schema-managed.
 */
function runSchemaValidationOnContent(filePath: string, content: string): ValidationError[] | null {
  // Detect schema type
  const schemaType = detectSchemaTypeLocal(filePath);
  if (!schemaType) {
    // Not a schema-managed file
    return null;
  }

  // Load schema (cached in lib)
  const schema = loadSchemaFromLib(schemaType);
  if (!schema) {
    return null;
  }

  // Parse frontmatter from content using lib
  const { frontmatter } = extractFrontmatter(content);
  if (!frontmatter) {
    return [{
      field: 'frontmatter',
      message: 'File is missing valid YAML frontmatter (---...---)',
    }];
  }

  // Validate against schema using lib
  const result = validateFrontmatterFromLib(frontmatter, schema);
  const errors: ValidationError[] = [...result.errors];

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
// Auto-Format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the format command for a specific file.
 * Checks patterns first, then falls back to default command.
 */
function getFormatCommand(config: FormatConfig, filePath: string): string | null {
  // Check patterns first (most specific)
  if (config.patterns) {
    for (const pattern of config.patterns) {
      if (minimatch(filePath, pattern.match) || filePath.endsWith(pattern.match.replace('*', ''))) {
        return pattern.command;
      }
    }
  }

  // Fall back to default command
  return config.command || null;
}

/**
 * Run auto-format on an edited file.
 *
 * Reads format configuration from .allhands/settings.json:
 * {
 *   "validation": {
 *     "format": {
 *       "enabled": true,
 *       "command": "pnpm format",
 *       "patterns": [
 *         { "match": "*.py", "command": "ruff format" }
 *       ]
 *     }
 *   }
 * }
 *
 * Triggered by: PostToolUse matcher "(Write|Edit)"
 */
export function runFormat(input: HookInput): void {
  const settings = loadProjectSettings();
  const formatConfig = settings?.validation?.format;

  // Check if formatting is enabled
  if (!formatConfig?.enabled) {
    return allowTool(HOOK_FORMAT);
  }

  const filePath = input.tool_input?.file_path as string | undefined;
  if (!filePath) {
    return allowTool(HOOK_FORMAT);
  }

  const command = getFormatCommand(formatConfig!, filePath!);
  if (!command) {
    return allowTool(HOOK_FORMAT);
  }

  try {
    // Run format command on the file
    // Use || true pattern to ensure non-blocking (format failures shouldn't stop the agent)
    execSync(`${command} "${filePath}"`, {
      cwd: getProjectDir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000, // 30 second timeout
    });
  } catch {
    // Format failures are non-blocking
    // Could optionally log or output context here
  }

  allowTool(HOOK_FORMAT);
}

/**
 * Validate schema-managed markdown files (PostToolUse).
 *
 * Triggered by: PostToolUse matcher "(Write|Edit)"
 */
export function validateSchema(input: HookInput): void {
  const filePath = input.tool_input?.file_path as string | undefined;

  if (!filePath) {
    return allowTool(HOOK_SCHEMA);
  }

  const errors = runSchemaValidation(filePath!);

  if (errors && errors.length > 0) {
    const schemaType = detectSchemaTypeLocal(filePath!) || 'unknown';
    const context = formatSchemaErrors(errors, schemaType);
    blockTool(context, HOOK_SCHEMA);
  }

  allowTool(HOOK_SCHEMA);
}

/**
 * Validate schema-managed markdown files before write/edit (PreToolUse).
 *
 * Triggered by: PreToolUse matcher "(Write|Edit)"
 */
export function validateSchemaPre(input: HookInput): void {
  const toolName = input.tool_name as string | undefined;
  const filePath = input.tool_input?.file_path as string | undefined;

  if (!filePath) {
    return allowTool(HOOK_SCHEMA_PRE);
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
      return allowTool(HOOK_SCHEMA_PRE);
    }

    // Read current file content
    if (!existsSync(filePath)) {
      return allowTool(HOOK_SCHEMA_PRE);
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
    return allowTool(HOOK_SCHEMA_PRE);
  }

  const errors = runSchemaValidationOnContent(filePath, contentToValidate);

  if (errors && errors.length > 0) {
    const schemaType = detectSchemaTypeLocal(filePath) || 'unknown';
    const context = formatSchemaErrors(errors, schemaType);
    denyTool(context, HOOK_SCHEMA_PRE);
  }

  allowTool(HOOK_SCHEMA_PRE);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Category Definition
// ─────────────────────────────────────────────────────────────────────────────

/** Validation hooks category */
export const category: HookCategory = {
  name: 'validation',
  description: 'Validation hooks',
  hooks: [
    {
      name: 'diagnostics',
      description: 'Run diagnostics on edited files (PostToolUse)',
      handler: runDiagnostics,
      errorFallback: { type: 'allowTool' },
      logPayload: (input) => ({ tool: input.tool_name, file: input.tool_input?.file_path }),
    },
    {
      name: 'schema',
      description: 'Validate schema-managed markdown files (PostToolUse)',
      handler: validateSchema,
      errorFallback: { type: 'allowTool' },
      logPayload: (input) => ({ tool: input.tool_name, file: input.tool_input?.file_path }),
    },
    {
      name: 'format',
      description: 'Auto-format edited files (PostToolUse)',
      handler: runFormat,
      errorFallback: { type: 'allowTool' },
      logPayload: (input) => ({ tool: input.tool_name, file: input.tool_input?.file_path }),
    },
    {
      name: 'schema-pre',
      description: 'Validate schema-managed markdown files before write/edit (PreToolUse)',
      handler: validateSchemaPre,
      errorFallback: { type: 'allowTool' },
      logPayload: (input) => ({ tool: input.tool_name, file: input.tool_input?.file_path }),
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register validation hook subcommands.
 */
export function register(parent: Command): void {
  registerCategory(parent, category);
}

// ─────────────────────────────────────────────────────────────────────────────
// Daemon Handler Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register handlers for daemon mode.
 */
export function registerDaemonHandlers(register: RegisterFn): void {
  registerCategoryForDaemon(category, register);
}
