/**
 * Agent Profile Management
 *
 * Loads agent profiles and builds invocation contexts for TUI-delegated agents.
 * Profiles define: flow, env vars, and message templates for each agent type.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AgentProfile {
  name: string;
  flow: string;
  env: Record<string, string>;
  messageTemplate?: string;
  templateVars?: string[];
  /**
   * If true, this agent is scoped to a specific prompt and can have multiple
   * instances running concurrently (one per prompt).
   * Prompt-scoped agents include the prompt number in their ID (e.g., "executor-01").
   * Non-prompt-scoped agents use their name as AGENT_ID (e.g., "coordinator").
   */
  promptScoped?: boolean;
}

export interface AgentInvocation {
  env: Record<string, string>;
  flowPath: string;
  preamble: string;
}

/**
 * Stock environment variables injected for ALL agents.
 * These are derived from context, not defined in profiles.
 */
export const STOCK_ENV_VARS = [
  'AGENT_NAME',      // Derived from profile.name
  'MILESTONE_NAME',  // Current milestone
  'BRANCH',          // Current git branch
  'PROMPT_FILE_NAME', // Current prompt file (if applicable)
] as const;

interface RawAgentProfile {
  name: string;
  flow: string;
  env?: Record<string, string>;
  message_template?: string;
  template_vars?: string[];
  prompt_scoped?: boolean;
}

/**
 * Get the agents directory path
 */
function getAgentsDir(): string {
  return join(__dirname, '..', '..', 'agents');
}

/**
 * Get the flows directory path
 */
function getFlowsDir(): string {
  return join(__dirname, '..', '..', 'flows');
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
    const raw = parseYaml(content) as RawAgentProfile;

    return {
      name: raw.name,
      flow: raw.flow,
      env: raw.env || {},
      messageTemplate: raw.message_template,
      templateVars: raw.template_vars,
      promptScoped: raw.prompt_scoped ?? false,
    };
  } catch {
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
 * Resolve template variables in a string
 *
 * Replaces ${VAR_NAME} with values from context.
 * Unresolved variables are left as-is.
 */
export function resolveTemplate(
  template: string,
  context: Record<string, string>
): string {
  return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return context[varName] !== undefined ? context[varName] : match;
  });
}

/**
 * Build a complete agent invocation from profile and context
 *
 * Returns:
 * - env: Merged environment variables with resolved values
 * - flowPath: Absolute path to the flow file
 * - preamble: Resolved message template to inject above flow
 *
 * Stock env vars are injected automatically:
 * - AGENT_NAME: From profile.name
 * - MILESTONE_NAME: From context
 * - BRANCH: From context
 * - PROMPT_FILE_NAME: From context (if provided)
 */
export function buildAgentInvocation(
  profile: AgentProfile,
  context: Record<string, string>
): AgentInvocation {
  // Start with stock env vars
  const env: Record<string, string> = {
    AGENT_NAME: profile.name,
  };

  // Add stock vars from context
  if (context.MILESTONE_NAME) env.MILESTONE_NAME = context.MILESTONE_NAME;
  if (context.BRANCH) env.BRANCH = context.BRANCH;
  if (context.PROMPT_FILE_NAME) env.PROMPT_FILE_NAME = context.PROMPT_FILE_NAME;

  // Add profile-specific env overrides (if any)
  for (const [key, value] of Object.entries(profile.env)) {
    env[key] = resolveTemplate(value, context);
  }

  // Resolve flow path
  const flowsDir = getFlowsDir();
  const flowPath = join(flowsDir, profile.flow);

  // Resolve preamble
  const preamble = profile.messageTemplate
    ? resolveTemplate(profile.messageTemplate, context)
    : '';

  return {
    env,
    flowPath,
    preamble,
  };
}

/**
 * Validate that a profile's flow file exists
 */
export function validateProfile(profile: AgentProfile): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const flowsDir = getFlowsDir();
  const flowPath = join(flowsDir, profile.flow);

  if (!existsSync(flowPath)) {
    errors.push(`Flow file not found: ${profile.flow}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Load and validate all agent profiles
 */
export function loadAllProfiles(): {
  profiles: AgentProfile[];
  errors: Array<{ name: string; errors: string[] }>;
} {
  const names = listAgentProfiles();
  const profiles: AgentProfile[] = [];
  const errors: Array<{ name: string; errors: string[] }> = [];

  for (const name of names) {
    const profile = loadAgentProfile(name);
    if (!profile) {
      errors.push({ name, errors: ['Failed to parse profile'] });
      continue;
    }

    const validation = validateProfile(profile);
    if (!validation.valid) {
      errors.push({ name, errors: validation.errors });
    }

    profiles.push(profile);
  }

  return { profiles, errors };
}
