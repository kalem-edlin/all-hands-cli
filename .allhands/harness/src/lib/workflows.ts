/**
 * Workflow Configuration Loader
 *
 * Loads workflow configs from .allhands/workflows/ directory.
 * Hypothesis domains are defined in .allhands/settings.json.
 * Workflow configs can restrict which domains are available for that workflow type.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { parseWorkflowConfig, type WorkflowConfig } from './schemas/workflow.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Re-export types for convenience
export type { WorkflowConfig };

/**
 * Get the workflows directory path
 */
export function getWorkflowsDir(): string {
  // Navigate from harness/src/lib to .allhands/workflows
  return join(__dirname, '..', '..', '..', '..', 'workflows');
}

/**
 * Get the settings.json path
 */
function getSettingsPath(cwd?: string): string {
  const base = cwd || process.cwd();
  return join(base, '.allhands', 'settings.json');
}

/**
 * Load hypothesis domains from settings.json
 */
export function loadDomainsFromSettings(cwd?: string): string[] {
  const settingsPath = getSettingsPath(cwd);

  if (!existsSync(settingsPath)) {
    return getDefaultDomains();
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    const domains = settings?.emergent?.hypothesisDomains;

    if (Array.isArray(domains) && domains.length > 0) {
      return domains;
    }

    return getDefaultDomains();
  } catch {
    return getDefaultDomains();
  }
}

/**
 * Default domains when not configured in settings.json
 */
function getDefaultDomains(): string[] {
  return ['testing', 'stability', 'performance', 'feature', 'ux', 'integration'];
}

/**
 * Load a workflow config by name
 * Returns null if workflow doesn't exist or is invalid
 */
export function loadWorkflowConfig(name: string): WorkflowConfig | null {
  const workflowsDir = getWorkflowsDir();
  const configPath = join(workflowsDir, `${name}.yaml`);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const raw = parseYaml(content);
    const result = parseWorkflowConfig(raw);

    if (!result.success) {
      console.error(`Invalid workflow config ${name}:`, result.errors);
      return null;
    }

    return result.config;
  } catch {
    return null;
  }
}

/**
 * List all available workflow names
 */
export function listWorkflows(): string[] {
  const workflowsDir = getWorkflowsDir();

  if (!existsSync(workflowsDir)) {
    return [];
  }

  return readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
    .map((f) => f.replace('.yaml', ''));
}

/**
 * Get hypothesis domains for a workflow
 * - If workflow config exists, use its domains
 * - Otherwise, use domains from settings.json
 */
export function getHypothesisDomains(workflowName?: string, cwd?: string): string[] {
  if (workflowName) {
    const config = loadWorkflowConfig(workflowName);
    if (config) {
      return config.hypothesisDomains;
    }
  }

  // Fall back to settings.json domains
  return loadDomainsFromSettings(cwd);
}

/**
 * Format hypothesis domains for agent message template
 * Returns comma-separated string
 */
export function formatHypothesisDomains(workflowName?: string, cwd?: string): string {
  return getHypothesisDomains(workflowName, cwd).join(', ');
}

/**
 * Default workflow type when not specified in spec
 */
export const DEFAULT_WORKFLOW = 'milestone';
