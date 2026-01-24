/**
 * Agent Profile Schema
 *
 * Zod schema for validating agent profile YAML files.
 * Replaces the static YAML schema with runtime validation.
 */

import { z } from 'zod';
import { TemplateVarNameSchema, validateTemplateString, type TemplateVarName } from './template-vars.js';

/**
 * Raw agent profile as parsed from YAML (snake_case)
 */
export const RawAgentProfileSchema = z.object({
  name: z.string().min(1).describe('Agent identifier (also used as tmux window name)'),

  flow: z.string().min(1).describe('Flow file name relative to .allhands/flows/'),

  prompt_scoped: z
    .boolean()
    .default(false)
    .describe('If true, multiple instances can run (one per prompt)'),

  message_template: z
    .string()
    .optional()
    .describe('Template string with ${VAR} interpolation'),

  template_vars: z
    .array(TemplateVarNameSchema)
    .optional()
    .describe('Required variables for message_template'),

  // TUI integration
  tui_action: z
    .string()
    .optional()
    .describe('TUI action name that spawns this agent (e.g., "ideation", "compound")'),

  tui_label: z
    .string()
    .optional()
    .describe('Display label in TUI (defaults to capitalized name)'),

  tui_requires_milestone: z
    .boolean()
    .default(false)
    .describe('If true, TUI action requires an active milestone'),

  non_coding: z
    .boolean()
    .default(false)
    .describe('If true, agent is non-coding (affects some behaviors)'),
});

export type RawAgentProfile = z.infer<typeof RawAgentProfileSchema>;

/**
 * Normalized agent profile (camelCase, with defaults applied)
 */
export interface AgentProfile {
  name: string;
  flow: string;
  promptScoped: boolean;
  messageTemplate?: string;
  templateVars: TemplateVarName[];
  tuiAction?: string;
  tuiLabel?: string;
  tuiRequiresMilestone: boolean;
  nonCoding: boolean;
}

/**
 * Transform raw YAML profile to normalized TypeScript interface
 */
export function normalizeProfile(raw: RawAgentProfile): AgentProfile {
  return {
    name: raw.name,
    flow: raw.flow,
    promptScoped: raw.prompt_scoped,
    messageTemplate: raw.message_template,
    templateVars: (raw.template_vars ?? []) as TemplateVarName[],
    tuiAction: raw.tui_action,
    tuiLabel: raw.tui_label,
    tuiRequiresMilestone: raw.tui_requires_milestone,
    nonCoding: raw.non_coding,
  };
}

/**
 * Validation result for an agent profile
 */
export interface ProfileValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an agent profile beyond basic schema validation.
 * Checks:
 * - Template variables in message_template match template_vars list
 * - No unknown template variables
 */
export function validateProfileSemantics(profile: AgentProfile): ProfileValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate message_template references
  if (profile.messageTemplate) {
    const templateCheck = validateTemplateString(profile.messageTemplate);

    if (!templateCheck.valid) {
      errors.push(`Invalid template variables in message_template: ${templateCheck.invalidVars.join(', ')}`);
    }

    // Check that all referenced vars are in template_vars
    const referencedVars = profile.messageTemplate.match(/\$\{([^}]+)\}/g)?.map((m) => m.slice(2, -1)) ?? [];

    for (const refVar of referencedVars) {
      if (!profile.templateVars.includes(refVar as TemplateVarName)) {
        warnings.push(`Template references ${refVar} but it's not in template_vars list`);
      }
    }

    // Check for unused template_vars
    for (const declaredVar of profile.templateVars) {
      if (!referencedVars.includes(declaredVar)) {
        warnings.push(`template_vars declares ${declaredVar} but it's not used in message_template`);
      }
    }
  } else if (profile.templateVars.length > 0) {
    warnings.push('template_vars defined but no message_template to use them');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
