/**
 * Oracle - Harness-Specific AI Tasks
 *
 * High-level AI functions specific to the All Hands harness.
 * These are INTERNAL functions - not exposed to agents via CLI.
 *
 * Uses llm.ts for the underlying provider integration.
 *
 * Functions:
 * - generatePRDescription() - Generate PR content from prompts + alignment
 * - analyzeConversation() - Analyze agent conversation for compaction
 * - recommendAction() - Recommend continue vs scratch based on analysis
 * - buildPR() - Create PR via gh CLI with generated description
 */

import { execSync } from 'child_process';
import { z } from 'zod';
import { ask } from './llm.js';
import {
  readAlignment,
  updatePRStatus
} from './planning.js';
import { loadAllPrompts, type PromptFile } from './prompts.js';
import { getBaseBranch } from './git.js';

// ============================================================================
// Zod Schemas for LLM Response Validation
// ============================================================================

const PRContentSchema = z.object({
  title: z.string(),
  body: z.string(),
  reviewSteps: z.string(),
});

const ConversationAnalysisSchema = z.object({
  wasGettingClose: z.boolean(),
  progressPercentage: z.number().min(0).max(100),
  keyLearnings: z.array(z.string()),
  blockers: z.array(z.string()),
  partialWork: z.array(z.string()),
});

const ActionRecommendationSchema = z.object({
  action: z.enum(['scratch', 'continue']),
  reasoning: z.string(),
  preserveFiles: z.array(z.string()),
  discardFiles: z.array(z.string()),
});

/**
 * Extract JSON from LLM response text.
 * Handles responses wrapped in markdown code blocks or bare JSON.
 */
function extractJSON(text: string): string | null {
  // Try markdown code block first (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Fall back to finding first complete JSON object
  // Find the first { and match to its closing }
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(startIdx, i + 1);
        }
      }
    }
  }

  return null;
}

// ============================================================================
// Types
// ============================================================================

export interface PRContent {
  title: string;
  body: string;
  reviewSteps: string;
}

export interface ConversationAnalysis {
  wasGettingClose: boolean;
  progressPercentage: number;
  keyLearnings: string[];
  blockers: string[];
  partialWork: string[];
}

export interface ActionRecommendation {
  action: 'scratch' | 'continue';
  reasoning: string;
  preserveFiles: string[];
  discardFiles: string[];
}

export interface BuildPRResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  title: string;
  body: string;
  reviewSteps?: string;
}

// ============================================================================
// PR Generation (Internal)
// ============================================================================

/**
 * Get git diff from base branch to current branch
 */
function getGitDiffFromBase(cwd?: string, maxLines: number = 300): string {
  const workingDir = cwd || process.cwd();

  try {
    // Use the configured base branch
    const baseBranch = getBaseBranch(workingDir);

    // Get diff stat summary
    const diffStat = execSync(`git diff ${baseBranch}...HEAD --stat`, {
      encoding: 'utf-8',
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Get actual diff (truncated)
    const diff = execSync(`git diff ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
      cwd: workingDir,
      maxBuffer: 1024 * 1024 * 10,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = diff.split('\n');
    const truncatedDiff = lines.length > maxLines
      ? lines.slice(0, maxLines).join('\n') + '\n... (truncated)'
      : diff;

    return `### Summary\n${diffStat}\n\n### Changes\n${truncatedDiff}`;
  } catch {
    return 'Unable to get git diff';
  }
}

/**
 * Generate a PR description from prompts and alignment doc
 *
 * INTERNAL ONLY - Not exposed via CLI to agents.
 * Used by TUI for create-pr functionality.
 * Uses Gemini provider for generation.
 */
export async function generatePRDescription(
  prompts: Array<{ number: number; title: string; status: string }>,
  alignmentContent: string,
  specName: string,
  cwd?: string
): Promise<PRContent> {
  const promptSummary = prompts
    .map((p) => `- ${p.number}. ${p.title} (${p.status})`)
    .join('\n');

  const gitDiff = getGitDiffFromBase(cwd);

  const prompt = `Generate a pull request title and description for this spec.

## Milestone: ${specName}

## Prompts Completed:
${promptSummary}

## Alignment Document:
${alignmentContent}

## Git Diff (from base branch):
${gitDiff}

## Instructions:
- Write a clear, concise PR title (max 72 chars)
- Summarize the key changes based on the git diff
- Reference the prompts that were completed
- Include a Test Plan section
- Generate a step-by-step file review guide for manual reviewers

## Review Steps Guide Requirements:
- List all changed files, grouping related files (e.g., component + test, interface + implementation)
- Order steps by review priority:
  1. Core logic changes first
  2. API/interface changes
  3. Supporting utilities
  4. Tests and validation
  5. Configuration and documentation
- For each step, describe what to look for (breaking changes, edge cases, consistency)
- Include key questions the reviewer should answer
- Note cross-file concerns (data flow, state changes across boundaries)

## Response Format (JSON only):
{
  "title": "Short PR title (max 72 chars)",
  "body": "Markdown PR body with Summary and Test Plan sections",
  "reviewSteps": "Markdown guide with numbered steps for manual file review"
}`;

  try {
    const result = await ask(prompt, {
      provider: 'gemini',
      context: 'You must respond with valid JSON only. No markdown code blocks.',
    });

    const jsonStr = extractJSON(result.text);
    if (!jsonStr) {
      throw new Error('No JSON found in response');
    }

    const parsed = PRContentSchema.parse(JSON.parse(jsonStr));
    return parsed;
  } catch {
    // Fallback
    return {
      title: `[${specName}] Implementation complete`,
      body: `## Summary\nImplementation of ${specName} spec.\n\n## Prompts\n${promptSummary}`,
      reviewSteps: `## Review Steps\n\nReview all changed files in the diff.`,
    };
  }
}

// ============================================================================
// Conversation Analysis (Internal)
// ============================================================================

/**
 * Analyze an agent conversation for compaction
 *
 * INTERNAL ONLY - Called by compaction handler after agent session.
 * Examines conversation logs to understand progress and extract learnings.
 */
export async function analyzeConversation(
  logs: string,
  promptContent: string,
  alignmentContent: string,
  gitDiff: string
): Promise<ConversationAnalysis> {
  const prompt = `Analyze this agent conversation and extract useful information for the next attempt.

## Task Prompt:
${promptContent}

## Alignment Document:
${alignmentContent}

## Git Diff Summary:
${gitDiff}

## Conversation Logs:
${logs}

## Analysis Required:

1. Was the agent making meaningful progress toward the goal? (yes/no)
2. Estimate the percentage of the task that was completed (0-100)
3. What key learnings would help a fresh agent? (specific patterns, APIs, approaches that work)
4. What blocked the agent from completion? (missing deps, wrong approach, unclear requirements)
5. What partial work is valuable and should be preserved? (list specific files or code)

## Response Format (JSON only):
{
  "wasGettingClose": true,
  "progressPercentage": 65,
  "keyLearnings": ["Pattern X works well for...", "The API requires..."],
  "blockers": ["Missing dependency Z", "Unclear requirement about..."],
  "partialWork": ["src/lib/foo.ts", "src/commands/bar.ts"]
}`;

  try {
    const result = await ask(prompt, {
      context: 'You must respond with valid JSON only. No markdown code blocks. Be concise.',
    });

    const jsonStr = extractJSON(result.text);
    if (!jsonStr) {
      throw new Error('No JSON found in response');
    }

    return ConversationAnalysisSchema.parse(JSON.parse(jsonStr));
  } catch {
    // Conservative fallback - assume some progress was made
    return {
      wasGettingClose: true,
      progressPercentage: 50,
      keyLearnings: [],
      blockers: ['Analysis failed - defaulting to continue'],
      partialWork: [],
    };
  }
}

/**
 * Recommend whether to continue or scratch based on analysis
 *
 * INTERNAL ONLY - Called by compaction handler.
 * Uses analysis and git diff to decide if code should be kept.
 */
export async function recommendAction(
  analysis: ConversationAnalysis,
  attemptNumber: number,
  gitDiff: string
): Promise<ActionRecommendation> {
  const prompt = `Based on this analysis, recommend whether to continue with the existing code or scratch and start fresh.

## Analysis:
- Progress: ${analysis.progressPercentage}%
- Was getting close: ${analysis.wasGettingClose}
- Key learnings: ${analysis.keyLearnings.join('; ')}
- Blockers: ${analysis.blockers.join('; ')}
- Partial work: ${analysis.partialWork.join(', ')}
- Attempt number: ${attemptNumber}

## Git Diff:
${gitDiff}

## Considerations:
1. Code stability - Does it compile/run? Is there test coverage?
2. Boilerplate vs logic - Is this mostly setup code or actual implementation?
3. Complexity of remaining work - How much is left to do?
4. Risk of starting fresh - Would we lose valuable progress?

## Decision Guidelines:
- CONTINUE if: >40% progress, code compiles, meaningful logic exists
- SCRATCH if: <20% progress, code broken, mostly boilerplate, wrong approach

## Response Format (JSON only):
{
  "action": "continue",
  "reasoning": "Brief explanation of the decision",
  "preserveFiles": ["files to keep if scratching"],
  "discardFiles": ["files that should be removed"]
}`;

  try {
    const result = await ask(prompt, {
      context: 'You must respond with valid JSON only. No markdown code blocks.',
    });

    const jsonStr = extractJSON(result.text);
    if (!jsonStr) {
      throw new Error('No JSON found in response');
    }

    // Zod validates action is 'scratch' | 'continue'
    return ActionRecommendationSchema.parse(JSON.parse(jsonStr));
  } catch {
    // Default to continue to avoid losing code
    return {
      action: 'continue',
      reasoning: 'Defaulting to continue due to analysis failure',
      preserveFiles: [],
      discardFiles: [],
    };
  }
}

// ============================================================================
// PR Building (Internal)
// ============================================================================

/**
 * Build and create a PR with generated description
 *
 * INTERNAL ONLY - Called by pr-build command.
 * Uses generatePRDescription and gh CLI to create PR.
 *
 * @param spec - The spec name to build PR for
 * @param cwd - Working directory
 * @param dryRun - If true, don't actually create the PR
 */
export async function buildPR(
  spec: string,
  cwd?: string,
  dryRun: boolean = false
): Promise<BuildPRResult> {
  const workingDir = cwd || process.cwd();

  // Load prompts and alignment from spec
  const prompts = loadAllPrompts(spec, workingDir);
  const alignmentContent = readAlignment(spec, workingDir);

  if (prompts.length === 0) {
    return {
      success: false,
      title: '',
      body: 'No prompts found for this spec',
    };
  }

  // Use spec name for PR generation
  const specName = spec;

  // Generate PR content
  const promptSummary = prompts.map((p: PromptFile) => ({
    number: p.frontmatter.number,
    title: p.frontmatter.title,
    status: p.frontmatter.status,
  }));

  const prContent = await generatePRDescription(
    promptSummary,
    alignmentContent || '',
    specName,
    workingDir
  );

  if (dryRun) {
    return {
      success: true,
      title: prContent.title,
      body: prContent.body,
      reviewSteps: prContent.reviewSteps,
    };
  }

  try {
    // Create PR via gh CLI using stdin for body to avoid shell escaping issues
    const output = execSync(
      `gh pr create --title "${prContent.title.replace(/"/g, '\\"')}" --body-file -`,
      {
        encoding: 'utf-8',
        cwd: workingDir,
        input: prContent.body,
      }
    );

    // Parse PR URL from output
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
    const prUrl = urlMatch ? urlMatch[0] : undefined;
    const prNumber = urlMatch ? parseInt(urlMatch[1], 10) : undefined;

    // Update status.yaml with PR info
    if (prUrl && prNumber) {
      updatePRStatus(prUrl, prNumber, spec, workingDir);

      // Post review steps as the first comment
      if (prContent.reviewSteps) {
        try {
          execSync(
            `gh pr comment ${prNumber} --body-file -`,
            {
              encoding: 'utf-8',
              cwd: workingDir,
              input: prContent.reviewSteps,
            }
          );
        } catch {
          // Non-fatal: PR was created, just couldn't add the comment
          console.error('Warning: Could not add review steps comment to PR');
        }
      }
    }

    return {
      success: true,
      prUrl,
      prNumber,
      title: prContent.title,
      body: prContent.body,
      reviewSteps: prContent.reviewSteps,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      title: prContent.title,
      body: `PR creation failed: ${errorMsg}`,
    };
  }
}
