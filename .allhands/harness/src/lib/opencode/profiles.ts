/**
 * Agent Profile Management
 *
 * Loads agent profiles and builds invocation contexts for TUI-delegated agents.
 * Profiles define: flow, template vars, and message templates for each agent type.
 *
 * This module provides:
 * - Profile loading with Zod validation
 * - Template variable resolution
 * - Context building for agent spawning
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import {
  RawAgentProfileSchema,
  normalizeProfile,
  validateProfileSemantics,
  type AgentProfile,
} from '../schemas/agent-profile.js';
import {
  validateContext,
  type TemplateContext,
  type TemplateVarName,
} from '../schemas/template-vars.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Result of building an agent invocation
 */
export interface AgentInvocation {
  /** Environment variables to set for the agent */
  env: Record<string, string>;
  /** Absolute path to the flow file */
  flowPath: string;
  /** Resolved message template (preamble) */
  preamble: string;
  /** The profile used */
  profile: AgentProfile;
}

/**
 * Stock environment variables injected for ALL agents.
 * These are derived from context, not defined in profiles.
 */
export const STOCK_ENV_VARS = [
  'AGENT_ID',
  'AGENT_NAME',
  'AGENT_TYPE',
  'SPEC_NAME',
  'BRANCH',
  'PROMPT_NUMBER',
] as const;

/**
 * Get the agents directory path
 * Path: harness/src/lib/opencode/ -> harness/src/lib/ -> harness/src/ -> harness/ -> .allhands/ -> agents/
 */
function getAgentsDir(): string {
  return join(__dirname, '..', '..', '..', '..', 'agents');
}

/**
 * Get the flows directory path
 * Path: harness/src/lib/opencode/ -> harness/src/lib/ -> harness/src/ -> harness/ -> .allhands/ -> flows/
 */
function getFlowsDir(): string {
  return join(__dirname, '..', '..', '..', '..', 'flows');
}

/**
 * Load an agent profile by name
 */
export function loadAgentProfile(name: string): AgentProfile | null {
  const agentsDir = getAgentsDir();
  const profilePath = join(agentsDir, `${name}.yaml`);

  if (!existsSync(profilePath)) {
    return null;
  }

  try {
    const content = readFileSync(profilePath, 'utf-8');
    const rawData = parseYaml(content);

    // Validate with Zod
    const parseResult = RawAgentProfileSchema.safeParse(rawData);

    if (!parseResult.success) {
      console.error(`Invalid profile ${name}:`, parseResult.error.format());
      return null;
    }

    return normalizeProfile(parseResult.data);
  } catch (err) {
    console.error(`Failed to load profile ${name}:`, err);
    return null;
  }
}

/**
 * List all available agent profiles
 */
export function listAgentProfiles(): string[] {
  const agentsDir = getAgentsDir();

  if (!existsSync(agentsDir)) {
    return [];
  }

  return readdirSync(agentsDir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace('.yaml', ''));
}

/**
 * Get all profiles indexed by their TUI action
 */
export function getProfilesByTuiAction(): Map<string, AgentProfile[]> {
  const map = new Map<string, AgentProfile[]>();
  const names = listAgentProfiles();

  for (const name of names) {
    const profile = loadAgentProfile(name);
    if (profile?.tuiAction) {
      const existing = map.get(profile.tuiAction) ?? [];
      existing.push(profile);
      map.set(profile.tuiAction, existing);
    }
  }

  return map;
}

/**
 * Resolve template variables in a string
 *
 * Replaces ${VAR_NAME} with values from context.
 * Unresolved variables are left as-is (for debugging visibility).
 */
export function resolveTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = context[varName as TemplateVarName];
    return value !== undefined ? value : match;
  });
}

/**
 * Validate that a profile's flow file exists
 */
export function validateProfileFlowExists(profile: AgentProfile): {
  valid: boolean;
  error?: string;
} {
  const flowsDir = getFlowsDir();
  const flowPath = join(flowsDir, profile.flow);

  if (!existsSync(flowPath)) {
    return {
      valid: false,
      error: `Flow file not found: ${profile.flow}`,
    };
  }

  return { valid: true };
}

/**
 * Build a complete agent invocation from profile and context
 *
 * This is the main entry point for spawning agents. It:
 * 1. Validates required template variables are provided
 * 2. Resolves the message template
 * 3. Returns everything needed to spawn the agent
 *
 * @param profile - The agent profile (from loadAgentProfile)
 * @param context - Template variable values
 * @returns AgentInvocation or throws on validation failure
 */
export function buildAgentInvocation(
  profile: AgentProfile,
  context: TemplateContext
): AgentInvocation {
  // Validate required template variables
  const validation = validateContext(context, profile.templateVars);

  if (!validation.valid) {
    throw new Error(
      `Missing required template variables for agent "${profile.name}": ${validation.errors.join(', ')}`
    );
  }

  // Validate flow file exists
  const flowCheck = validateProfileFlowExists(profile);
  if (!flowCheck.valid) {
    throw new Error(`Agent "${profile.name}": ${flowCheck.error}`);
  }

  // Build environment variables
  const env: Record<string, string> = {
    AGENT_NAME: profile.name,
    AGENT_TYPE: profile.name,
  };

  // Add context values that map to env vars
  if (context.SPEC_NAME) env.SPEC_NAME = context.SPEC_NAME;
  if (context.BRANCH) env.BRANCH = context.BRANCH;
  if (context.PROMPT_NUMBER) env.PROMPT_NUMBER = context.PROMPT_NUMBER;

  // Resolve flow path
  const flowsDir = getFlowsDir();
  const flowPath = join(flowsDir, profile.flow);

  // Resolve preamble from message template
  const preamble = profile.messageTemplate
    ? resolveTemplate(profile.messageTemplate, context)
    : '';

  return {
    env,
    flowPath,
    preamble,
    profile,
  };
}

/**
 * Build invocation for an agent by name
 *
 * Convenience wrapper that loads the profile first.
 */
export function buildAgentInvocationByName(
  agentName: string,
  context: TemplateContext
): AgentInvocation {
  const profile = loadAgentProfile(agentName);

  if (!profile) {
    throw new Error(`Agent profile not found: ${agentName}`);
  }

  return buildAgentInvocation(profile, context);
}

/**
 * Load and validate all agent profiles
 *
 * Returns all valid profiles and any validation errors.
 */
export function loadAllProfiles(): {
  profiles: AgentProfile[];
  errors: Array<{ name: string; errors: string[]; warnings: string[] }>;
} {
  const names = listAgentProfiles();
  const profiles: AgentProfile[] = [];
  const errors: Array<{ name: string; errors: string[]; warnings: string[] }> = [];

  for (const name of names) {
    const profile = loadAgentProfile(name);

    if (!profile) {
      errors.push({ name, errors: ['Failed to parse profile'], warnings: [] });
      continue;
    }

    // Validate flow exists
    const flowCheck = validateProfileFlowExists(profile);

    // Validate semantic consistency
    const semanticCheck = validateProfileSemantics(profile);

    const allErrors: string[] = [];
    const allWarnings: string[] = [...semanticCheck.warnings];

    if (!flowCheck.valid && flowCheck.error) {
      allErrors.push(flowCheck.error);
    }

    allErrors.push(...semanticCheck.errors);

    if (allErrors.length > 0 || allWarnings.length > 0) {
      errors.push({ name, errors: allErrors, warnings: allWarnings });
    }

    profiles.push(profile);
  }

  return { profiles, errors };
}

// Re-export types
export type { AgentProfile } from '../schemas/agent-profile.js';
export type { TemplateContext, TemplateVarName } from '../schemas/template-vars.js';
