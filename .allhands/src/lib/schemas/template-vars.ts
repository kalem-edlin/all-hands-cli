/**
 * Template Variables Registry
 *
 * Single source of truth for all template variables used in agent profiles.
 * Provides type safety, runtime validation, and self-documentation.
 */

import { z } from 'zod';

/**
 * All valid template variables that can be used in agent message_template fields.
 * Each variable has a Zod schema for validation and a description.
 */
export const TemplateVars = {
  // Path variables
  SPEC_PATH: z.string().describe('Path to milestone spec file'),
  ALIGNMENT_PATH: z.string().describe('Path to alignment doc'),
  PROMPTS_FOLDER: z.string().describe('Path to prompts directory'),
  PROMPT_PATH: z.string().describe('Path to specific prompt file'),
  OUTPUT_PATH: z.string().describe('Output file path'),
  PLANNING_FOLDER: z.string().describe('Path to .planning/{branch} directory'),

  // Identifier variables
  MILESTONE_NAME: z.string().describe('Current milestone name'),
  PROMPT_NUMBER: z
    .string()
    .regex(/^\d{2}$/)
    .describe('Prompt number as two digits (01, 02, etc.)'),

  // Branch/context variables
  BRANCH: z.string().describe('Current git branch name'),
} as const;

/**
 * Union type of all valid template variable names
 */
export type TemplateVarName = keyof typeof TemplateVars;

/**
 * Array of all valid template variable names (for runtime checks)
 */
export const TEMPLATE_VAR_NAMES = Object.keys(TemplateVars) as TemplateVarName[];

/**
 * Context object passed to template resolution.
 * All variables are optional - validation happens against profile requirements.
 */
export type TemplateContext = Partial<Record<TemplateVarName, string>>;

/**
 * Zod schema for validating a single template variable name
 */
export const TemplateVarNameSchema = z.enum(TEMPLATE_VAR_NAMES as [TemplateVarName, ...TemplateVarName[]]);

/**
 * Validate that a string is a valid template variable name
 */
export function isValidTemplateVar(name: string): name is TemplateVarName {
  return TEMPLATE_VAR_NAMES.includes(name as TemplateVarName);
}

/**
 * Validate a context object against required variables.
 * Returns errors for missing or invalid variables.
 */
export function validateContext(
  context: TemplateContext,
  requiredVars: TemplateVarName[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const varName of requiredVars) {
    const value = context[varName];

    if (value === undefined || value === '') {
      errors.push(`Missing required template variable: ${varName}`);
      continue;
    }

    // Validate value against the variable's schema
    const schema = TemplateVars[varName];
    const result = schema.safeParse(value);

    if (!result.success) {
      errors.push(`Invalid value for ${varName}: ${result.error.issues[0]?.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get description for a template variable
 */
export function getTemplateVarDescription(name: TemplateVarName): string {
  return TemplateVars[name].description ?? name;
}

/**
 * Extract template variable references from a template string.
 * Returns array of variable names found in ${VAR_NAME} patterns.
 */
export function extractTemplateVars(template: string): string[] {
  const matches = template.matchAll(/\$\{([^}]+)\}/g);
  return [...matches].map((m) => m[1]);
}

/**
 * Validate that all variables referenced in a template are valid.
 */
export function validateTemplateString(template: string): { valid: boolean; invalidVars: string[] } {
  const refs = extractTemplateVars(template);
  const invalidVars = refs.filter((v) => !isValidTemplateVar(v));

  return {
    valid: invalidVars.length === 0,
    invalidVars,
  };
}
