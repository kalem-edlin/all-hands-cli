/**
 * Oracle - Harness-Specific AI Tasks
 *
 * High-level AI functions specific to the All Hands harness.
 * These are INTERNAL functions - not exposed to agents via CLI.
 *
 * Uses llm.ts for the underlying provider integration.
 *
 * Functions:
 * - suggestBranchName() - Generate branch name from spec
 * - generatePRDescription() - Generate PR content from prompts + alignment
 * - analyzeConversation() - Analyze agent conversation for compaction
 * - recommendAction() - Recommend continue vs scratch based on analysis
 * - buildPR() - Create PR via gh CLI with generated description
 */

import { execSync } from 'child_process';
import { ask } from './llm.js';
import {
  readAlignment,
  updatePRStatus
} from './planning.js';
import { loadAllPrompts, type PromptFile } from './prompts.js';

// ============================================================================
// Types
// ============================================================================

export type BranchPrefix = 'feat' | 'chore' | 'fix' | 'refactor' | 'exp' | 'docs';

export interface BranchSuggestion {
  prefix: BranchPrefix;
  name: string;
  fullName: string;
  reasoning: string;
}

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
// Branch Naming (Internal)
// ============================================================================

/**
 * Suggest a branch name based on a spec file
 *
 * INTERNAL ONLY - Not exposed via CLI to agents.
 * Used by TUI for switch-spec functionality.
 *
 * Branch prefixes:
 * - feat/   - New features
 * - chore/  - Tooling, config, CI/CD
 * - fix/    - Bug fixes
 * - refactor/ - Code restructuring
 * - exp/    - Experimental (throw-away)
 * - docs/   - Documentation
 */
export async function suggestBranchName(
  specContent: string,
  specFilename: string
): Promise<BranchSuggestion> {
  const prompt = `You are a git branch naming assistant. Given a spec, suggest an appropriate branch name.

## Branch Prefix Rules:
- feat/ - New features or functionality
- chore/ - Tooling, configuration, CI/CD, dependencies
- fix/ - Bug fixes
- refactor/ - Code restructuring without new features
- exp/ - Experimental work (throw-away, exploratory)
- docs/ - Documentation only

## Requirements:
1. Choose the most appropriate prefix based on the spec content
2. Create a short, kebab-case branch name (max 50 chars total)
3. The name should be descriptive but concise

## Spec Filename: ${specFilename}

## Spec Content:
${specContent}

## Response Format (JSON only, no markdown):
{
  "prefix": "feat",
  "name": "example-branch-name",
  "reasoning": "Brief explanation of why this prefix and name"
}`;

  try {
    const result = await ask(prompt, {
      context: 'You must respond with valid JSON only. No markdown code blocks.',
    });

    // Parse JSON response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      prefix: string;
      name: string;
      reasoning: string;
    };

    // Validate prefix
    const validPrefixes: BranchPrefix[] = ['feat', 'chore', 'fix', 'refactor', 'exp', 'docs'];
    const prefix = validPrefixes.includes(parsed.prefix as BranchPrefix)
      ? (parsed.prefix as BranchPrefix)
      : 'feat';

    // Sanitize branch name
    const name = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 40);

    return {
      prefix,
      name,
      fullName: `${prefix}/${name}`,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    // Fallback: derive from filename
    const baseName = specFilename
      .replace(/\.spec\.md$/i, '')
      .replace(/\.md$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 40);

    return {
      prefix: 'feat',
      name: baseName,
      fullName: `feat/${baseName}`,
      reasoning: 'Fallback: derived from spec filename',
    };
  }
}

// ============================================================================
// PR Generation (Internal)
// ============================================================================

/**
 * Get git diff from base branch (main/master) to current branch
 */
function getGitDiffFromBase(cwd?: string, maxLines: number = 300): string {
  const workingDir = cwd || process.cwd();

  try {
    // Determine base branch (main or master)
    let baseBranch = 'main';
    try {
      execSync('git rev-parse --verify main', { cwd: workingDir, stdio: 'pipe' });
    } catch {
      baseBranch = 'master';
    }

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

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as PRContent;
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

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    return JSON.parse(jsonMatch[0]) as ConversationAnalysis;
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

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as ActionRecommendation;

    // Validate action
    if (parsed.action !== 'continue' && parsed.action !== 'scratch') {
      parsed.action = 'continue';
    }

    return parsed;
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
    // Create PR via gh CLI
    // Escape quotes in title and body for shell safety
    const escapedTitle = prContent.title.replace(/"/g, '\\"');
    const escapedBody = prContent.body.replace(/"/g, '\\"').replace(/\$/g, '\\$');

    const output = execSync(
      `gh pr create --title "${escapedTitle}" --body "${escapedBody}"`,
      {
        encoding: 'utf-8',
        cwd: workingDir,
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
          const escapedReviewSteps = prContent.reviewSteps
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$');
          execSync(
            `gh pr comment ${prNumber} --body "${escapedReviewSteps}"`,
            {
              encoding: 'utf-8',
              cwd: workingDir,
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
