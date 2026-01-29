/**
 * Workflow Configuration Schema
 *
 * Zod schema for workflow config files in .allhands/workflows/
 * Workflows can restrict which hypothesis domains from settings.json are available.
 */

import { z } from 'zod';

/**
 * Raw workflow config schema (snake_case from YAML)
 */
export const RawWorkflowConfigSchema = z.object({
  name: z.string().describe('Workflow identifier (matches filename without extension)'),
  description: z.string().describe('Human-readable description of the workflow purpose'),
  hypothesis_domains: z
    .array(z.string())
    .min(1)
    .describe('List of hypothesis domains available to emergent refinement agents'),
});

export type RawWorkflowConfig = z.infer<typeof RawWorkflowConfigSchema>;

/**
 * Normalized workflow config interface (camelCase for TypeScript)
 */
export interface WorkflowConfig {
  name: string;
  description: string;
  hypothesisDomains: string[];
}

/**
 * Normalize raw YAML config to TypeScript interface
 */
export function normalizeWorkflowConfig(raw: RawWorkflowConfig): WorkflowConfig {
  return {
    name: raw.name,
    description: raw.description,
    hypothesisDomains: raw.hypothesis_domains,
  };
}

/**
 * Validate and parse a workflow config object
 */
export function parseWorkflowConfig(data: unknown): { success: true; config: WorkflowConfig } | { success: false; errors: string[] } {
  const result = RawWorkflowConfigSchema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  return {
    success: true,
    config: normalizeWorkflowConfig(result.data),
  };
}
