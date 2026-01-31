/**
 * Oracle - Harness-Specific AI Tasks
 *
 * High-level AI functions specific to the All Hands harness.
 * These are INTERNAL functions - not exposed to agents via CLI.
 *
 * Uses llm.ts for the underlying provider integration.
 *
 * Functions:
 * - generatePRDescription() - Generate PR content from spec + alignment
 * - analyzeConversation() - Analyze agent conversation for compaction
 * - recommendAction() - Recommend continue vs scratch based on analysis
 * - buildPR() - Create PR via gh CLI with generated description
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { ask, getCompactionProvider } from './llm.js';
import {
  readAlignment,
  readAlignmentFrontmatter,
  readStatus,
  updatePRStatus,
  getPlanningPaths,
  getGitRoot,
  sanitizeBranchForDir,
  getCurrentBranch,
} from './planning.js';
import { getBaseBranch, gitExec, validateGitRef, syncWithOriginMain } from './git.js';
import { logEvent } from './trace-store.js';

// ============================================================================
// Zod Schemas for LLM Response Validation
// ============================================================================

const PRContentSchema = z.object({
  title: z.string(),
  body: z.string(),
  reviewSteps: z.string(),
});

// Use coerce to handle LLMs returning strings instead of proper types
// e.g., "true" -> true, "65" -> 65
const ConversationAnalysisSchema = z.object({
  wasGettingClose: z.coerce.boolean(),
  progressPercentage: z.coerce.number().min(0).max(100),
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
  existingPR?: boolean; // True if PR already existed and was reused
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
    const baseBranch = getBaseBranch();
    validateGitRef(baseBranch, 'baseBranch');

    // Get diff stat summary
    const diffStatResult = gitExec(['diff', `${baseBranch}...HEAD`, '--stat'], workingDir);
    const diffStat = diffStatResult.success ? diffStatResult.stdout : '';

    // Get actual diff (truncated)
    const diffResult = gitExec(['diff', `${baseBranch}...HEAD`], workingDir);
    const diff = diffResult.stdout;

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
  alignmentContent: string,
  specName: string,
  cwd?: string,
  specContent?: string
): Promise<PRContent> {
  const gitDiff = getGitDiffFromBase(cwd);

  // Parse changed files from git diff for review steps grouping
  const changedFiles = parseChangedFilesFromDiff(gitDiff);

  const prompt = `Generate a pull request title and description.

## Original Requirements (Spec File):
${specContent || 'Not provided'}

## Implementation Summary (Alignment Document):
${alignmentContent}

## Changed Files:
${changedFiles.join('\n')}

## Instructions:
Write a standard, concise PR description like you would see on any professional open source project.
- PR title: Clear, under 72 chars, describes what was implemented
- PR body: Brief summary of what was built and why, followed by a test plan
- Do NOT reference individual prompts, tasks, or implementation steps
- Focus on the end result and value delivered
- Keep it concise - this is a PR description, not documentation

## Review Steps Requirements:
Group the changed files into logical review buckets based on the alignment document and file relationships.
- Group related files together (e.g., API + its tests, component + styles)
- Order by review priority: Core logic → API/interfaces → Utilities → Tests → Config/docs
- For each bucket, briefly note what to look for
- Keep it scannable - bullet points, not paragraphs

## Response Format (JSON only):
{
  "title": "Short PR title",
  "body": "## Summary\\n\\nBrief description.\\n\\n## Test Plan\\n\\n- How to test",
  "reviewSteps": "## Review Steps\\n\\n### 1. Core Logic\\n- file1.ts\\n- file2.ts\\n\\nLook for: X, Y\\n\\n### 2. Tests\\n..."
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
    // Fallback: Extract a summary from alignment doc instead of listing prompts
    const alignmentSummary = extractAlignmentSummary(alignmentContent);
    return {
      title: `${specName}`,
      body: `## Summary\n\n${alignmentSummary}\n\n## Test Plan\n\n- Run the test suite\n- Manual verification of core functionality`,
      reviewSteps: generateFallbackReviewSteps(changedFiles),
    };
  }
}

/**
 * Parse changed file paths from git diff output
 */
function parseChangedFilesFromDiff(gitDiff: string): string[] {
  const files: string[] = [];
  const lines = gitDiff.split('\n');
  for (const line of lines) {
    // Match "diff --git a/path b/path" format
    const match = line.match(/^diff --git a\/(.+) b\//);
    if (match) {
      files.push(match[1]);
    }
  }
  return files;
}

/**
 * Extract a brief summary from the alignment document
 */
function extractAlignmentSummary(alignmentContent: string): string {
  if (!alignmentContent) {
    return 'Implementation complete.';
  }

  // Try to find an overview or summary section
  const overviewMatch = alignmentContent.match(/## Overview\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (overviewMatch) {
    const overview = overviewMatch[1].trim();
    // Take first paragraph or first 500 chars
    const firstParagraph = overview.split('\n\n')[0];
    return firstParagraph.slice(0, 500);
  }

  // Fallback: take content after frontmatter, first paragraph
  const withoutFrontmatter = alignmentContent.replace(/^---[\s\S]*?---\n/, '');
  const firstParagraph = withoutFrontmatter.trim().split('\n\n')[0];
  return firstParagraph.slice(0, 500) || 'Implementation complete.';
}

/**
 * Generate fallback review steps grouped by file type
 */
function generateFallbackReviewSteps(files: string[]): string {
  const groups: Record<string, string[]> = {
    'Core Logic': [],
    'API/Routes': [],
    'Components': [],
    'Tests': [],
    'Configuration': [],
    'Other': [],
  };

  for (const file of files) {
    if (file.includes('.test.') || file.includes('.spec.') || file.includes('__tests__')) {
      groups['Tests'].push(file);
    } else if (file.includes('/api/') || file.includes('/routes/') || file.includes('router')) {
      groups['API/Routes'].push(file);
    } else if (file.includes('/components/') || file.includes('.tsx')) {
      groups['Components'].push(file);
    } else if (file.match(/\.(json|yaml|yml|config\.|rc\.)/) || file.includes('config')) {
      groups['Configuration'].push(file);
    } else if (file.match(/\.(ts|js|py|go|rs)$/)) {
      groups['Core Logic'].push(file);
    } else {
      groups['Other'].push(file);
    }
  }

  let steps = '## Review Steps\n\n';
  let stepNum = 1;

  for (const [groupName, groupFiles] of Object.entries(groups)) {
    if (groupFiles.length > 0) {
      steps += `### ${stepNum}. ${groupName}\n`;
      for (const f of groupFiles) {
        steps += `- ${f}\n`;
      }
      steps += '\n';
      stepNum++;
    }
  }

  return steps || '## Review Steps\n\nReview all changed files.';
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
      provider: getCompactionProvider(),
    });

    const jsonStr = extractJSON(result.text);
    if (!jsonStr) {
      throw new Error('No JSON found in response');
    }

    return ConversationAnalysisSchema.parse(JSON.parse(jsonStr));
  } catch (error) {
    // Log the actual error for debugging
    const errorMsg = error instanceof Error ? error.message : String(error);
    logEvent('harness.error', {
      source: 'oracle.analyzeConversation',
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Conservative fallback - assume some progress was made
    return {
      wasGettingClose: true,
      progressPercentage: 50,
      keyLearnings: [],
      blockers: [`Analysis failed: ${errorMsg}`],
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
      provider: getCompactionProvider(),
    });

    const jsonStr = extractJSON(result.text);
    if (!jsonStr) {
      throw new Error('No JSON found in response');
    }

    // Zod validates action is 'scratch' | 'continue'
    return ActionRecommendationSchema.parse(JSON.parse(jsonStr));
  } catch (error) {
    // Log the actual error for debugging
    const errorMsg = error instanceof Error ? error.message : String(error);
    logEvent('harness.error', {
      source: 'oracle.recommendAction',
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Default to continue to avoid losing code
    return {
      action: 'continue',
      reasoning: `Defaulting to continue: ${errorMsg}`,
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

  // Check if PR already exists in status.yaml
  const branch = getCurrentBranch(workingDir);
  const planningKey = sanitizeBranchForDir(branch);
  const status = readStatus(planningKey, workingDir);
  const existingPR = status?.pr;

  // Load alignment and spec content
  const alignmentContent = readAlignment(spec, workingDir);

  if (!alignmentContent) {
    return {
      success: false,
      title: '',
      body: 'No alignment document found for this spec',
    };
  }

  // Load spec content from the spec file path in alignment frontmatter
  const alignmentFrontmatter = readAlignmentFrontmatter(spec, workingDir);
  let specContent: string | undefined;
  if (alignmentFrontmatter?.spec) {
    try {
      const specPath = join(getGitRoot(workingDir), alignmentFrontmatter.spec);
      specContent = readFileSync(specPath, 'utf-8');
    } catch {
      // Non-fatal: spec file might not exist
    }
  }

  // Generate PR content
  const prContent = await generatePRDescription(
    alignmentContent,
    spec,
    workingDir,
    specContent
  );

  if (dryRun) {
    return {
      success: true,
      title: prContent.title,
      body: prContent.body,
      reviewSteps: prContent.reviewSteps,
    };
  }

  // If PR already exists, UPDATE instead of creating
  if (existingPR?.url && existingPR?.number) {
    try {
      // Sync with origin/main before push
      const syncResult = syncWithOriginMain(workingDir);
      if (!syncResult.success) {
        const failureReason = syncResult.conflicts.length > 0
          ? `Merge conflicts with main must be resolved before updating PR:\n${syncResult.conflicts.join('\n')}`
          : 'Failed to sync with main. This can be caused by uncommitted changes or network issues. Please resolve and try again.';
        return {
          success: false,
          title: prContent.title,
          body: failureReason,
        };
      }

      // Push any new changes first
      gitExec(['push', '-u', 'origin', 'HEAD'], workingDir);

      // Update PR description
      updatePRDescription(existingPR.number, prContent.body, workingDir);

      // Update comments (review steps and E2E test plan)
      updatePRComments(existingPR.number, prContent.reviewSteps, spec, workingDir);

      return {
        success: true,
        prUrl: existingPR.url,
        prNumber: existingPR.number,
        title: prContent.title,
        body: prContent.body,
        reviewSteps: prContent.reviewSteps,
        existingPR: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        title: prContent.title,
        body: `PR update failed: ${errorMsg}`,
      };
    }
  }

  // No existing PR - create new one
  try {
    // Sync with origin/main before push
    const syncResult = syncWithOriginMain(workingDir);
    if (!syncResult.success) {
      const failureReason = syncResult.conflicts.length > 0
        ? `Merge conflicts with main must be resolved before creating PR:\n${syncResult.conflicts.join('\n')}`
        : 'Failed to sync with main. This can be caused by uncommitted changes or network issues. Please resolve and try again.';
      return {
        success: false,
        title: prContent.title,
        body: failureReason,
      };
    }

    // Push branch to remote before creating PR
    const pushResult = gitExec(['push', '-u', 'origin', 'HEAD'], workingDir);
    if (!pushResult.success && !pushResult.stderr.includes('Everything up-to-date')) {
      return {
        success: false,
        title: prContent.title,
        body: `Failed to push branch: ${pushResult.stderr}`,
      };
    }

    // Create PR via gh CLI with argument arrays — no shell interpolation
    const prCreateResult = spawnSync('gh', [
      'pr', 'create',
      '--title', prContent.title,
      '--body-file', '-',
    ], {
      encoding: 'utf-8',
      cwd: workingDir,
      input: prContent.body,
    });

    if (prCreateResult.status !== 0) {
      const errOutput = prCreateResult.stderr || '';
      // Check if PR already exists (race condition) - update instead
      if (errOutput.includes('already exists') || errOutput.includes('pull request already')) {
        return handleExistingPRRace(prContent, spec, workingDir);
      }
      return {
        success: false,
        title: prContent.title,
        body: `PR creation failed: ${errOutput}`,
      };
    }

    const output = prCreateResult.stdout || '';

    // Parse PR URL from output
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
    const prUrl = urlMatch ? urlMatch[0] : undefined;
    const prNumber = urlMatch ? parseInt(urlMatch[1], 10) : undefined;

    // Update status.yaml with PR info and post comments
    if (prUrl && prNumber) {
      updatePRStatus(prUrl, prNumber, spec, workingDir);
      postPRComments(prNumber, prContent.reviewSteps, spec, workingDir);
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

/**
 * Handle race condition where PR already exists during creation.
 * Fetches existing PR info and updates it instead.
 */
function handleExistingPRRace(
  prContent: PRContent,
  spec: string,
  workingDir: string
): BuildPRResult {
  try {
    const prViewResult = spawnSync('gh', ['pr', 'view', '--json', 'url,number'], {
      encoding: 'utf-8',
      cwd: workingDir,
    });
    if (prViewResult.status !== 0) {
      return { success: false, title: prContent.title, body: 'PR already exists but could not retrieve info' };
    }
    const prInfo = JSON.parse(prViewResult.stdout || '{}');
    const raceExistingUrl = prInfo.url;
    const raceExistingNumber = prInfo.number;

    if (raceExistingUrl && raceExistingNumber) {
      updatePRStatus(raceExistingUrl, raceExistingNumber, spec, workingDir);
      updatePRDescription(raceExistingNumber, prContent.body, workingDir);
      updatePRComments(raceExistingNumber, prContent.reviewSteps, spec, workingDir);

      return {
        success: true,
        prUrl: raceExistingUrl,
        prNumber: raceExistingNumber,
        title: prContent.title,
        body: prContent.body,
        reviewSteps: prContent.reviewSteps,
        existingPR: true,
      };
    }
  } catch {
    // Couldn't get existing PR info
  }
  return { success: false, title: prContent.title, body: 'PR already exists but could not retrieve info' };
}

/**
 * Post review steps and E2E test plan comments to a PR
 * Order: Review steps first, then E2E test plan
 */
function postPRComments(
  prNumber: number,
  reviewSteps: string | undefined,
  spec: string,
  workingDir: string
): void {
  // Post review steps FIRST
  if (reviewSteps) {
    const result = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body-file', '-'], {
      encoding: 'utf-8',
      cwd: workingDir,
      input: reviewSteps,
    });
    if (result.status !== 0) {
      console.error('Warning: Could not add review steps comment to PR');
    }
  }

  // Post E2E test plan AFTER review steps
  const planningPaths = getPlanningPaths(spec, workingDir);
  const e2eTestPlanPath = join(planningPaths.root, 'e2e-test-plan.md');
  if (existsSync(e2eTestPlanPath)) {
    let e2eTestPlan = readFileSync(e2eTestPlanPath, 'utf-8');
    // Strip YAML frontmatter if present
    e2eTestPlan = e2eTestPlan.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
    const result = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body-file', '-'], {
      encoding: 'utf-8',
      cwd: workingDir,
      input: `## E2E Test Plan\n\n${e2eTestPlan}`,
    });
    if (result.status !== 0) {
      console.error('Warning: Could not add e2e test plan comment to PR');
    }
  }
}

/**
 * Update PR description via gh CLI
 */
function updatePRDescription(
  prNumber: number,
  body: string,
  workingDir: string
): boolean {
  const result = spawnSync('gh', ['pr', 'edit', String(prNumber), '--body-file', '-'], {
    encoding: 'utf-8',
    cwd: workingDir,
    input: body,
  });
  if (result.status !== 0) {
    console.error('Warning: Could not update PR description');
    return false;
  }
  return true;
}

interface PRComment {
  id: number;
  body: string;
  author: { login: string };
  createdAt: string;
}

/**
 * Get all issue comments on a PR (these are the top-level comments, not review comments)
 */
function getPRComments(prNumber: number, workingDir: string): PRComment[] {
  try {
    // Get repo owner/name
    const repoResult = spawnSync('gh', ['repo', 'view', '--json', 'owner,name'], {
      encoding: 'utf-8',
      cwd: workingDir,
    });
    if (repoResult.status !== 0) return [];
    const { owner, name } = JSON.parse(repoResult.stdout || '{}');

    // Get issue comments (top-level PR comments)
    const commentsResult = spawnSync('gh', [
      'api', `repos/${owner.login}/${name}/issues/${prNumber}/comments`,
      '--jq', '[.[] | {id: .id, body: .body, author: {login: .user.login}, createdAt: .created_at}]',
    ], {
      encoding: 'utf-8',
      cwd: workingDir,
    });
    if (commentsResult.status !== 0) return [];
    return JSON.parse(commentsResult.stdout || '[]');
  } catch {
    return [];
  }
}

/**
 * Update a specific comment on a PR
 */
function updatePRComment(
  commentId: number,
  body: string,
  workingDir: string
): boolean {
  try {
    // Get repo owner/name
    const repoResult = spawnSync('gh', ['repo', 'view', '--json', 'owner,name'], {
      encoding: 'utf-8',
      cwd: workingDir,
    });
    if (repoResult.status !== 0) return false;
    const { owner, name } = JSON.parse(repoResult.stdout || '{}');

    const patchResult = spawnSync('gh', [
      'api', '--method', 'PATCH',
      `repos/${owner.login}/${name}/issues/comments/${commentId}`,
      '-f', 'body=@-',
    ], {
      encoding: 'utf-8',
      cwd: workingDir,
      input: body,
    });
    return patchResult.status === 0;
  } catch {
    return false;
  }
}

/**
 * Update existing PR comments (review steps and E2E test plan)
 * Finds comments by pattern matching and updates them
 */
function updatePRComments(
  prNumber: number,
  reviewSteps: string | undefined,
  spec: string,
  workingDir: string
): void {
  const comments = getPRComments(prNumber, workingDir);
  if (comments.length === 0) {
    // No existing comments, post new ones
    postPRComments(prNumber, reviewSteps, spec, workingDir);
    return;
  }

  // Find and update review steps comment (first comment or one with ## File Walkthrough)
  if (reviewSteps) {
    // Look for comment containing file walkthrough patterns
    const reviewComment = comments.find(c =>
      c.body.includes('## File Walkthrough') ||
      c.body.includes('## Review Steps') ||
      c.body.includes('## Changes Overview')
    );

    if (reviewComment) {
      updatePRComment(reviewComment.id, reviewSteps, workingDir);
    } else {
      // No matching comment found, post new one
      const result = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body-file', '-'], {
        encoding: 'utf-8',
        cwd: workingDir,
        input: reviewSteps,
      });
      if (result.status !== 0) {
        console.error('Warning: Could not add review steps comment to PR');
      }
    }
  }

  // Find and update E2E test plan comment
  const planningPaths = getPlanningPaths(spec, workingDir);
  const e2eTestPlanPath = join(planningPaths.root, 'e2e-test-plan.md');
  if (existsSync(e2eTestPlanPath)) {
    let e2eTestPlan = readFileSync(e2eTestPlanPath, 'utf-8');
    // Strip YAML frontmatter if present
    e2eTestPlan = e2eTestPlan.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
    const e2eBody = `## E2E Test Plan\n\n${e2eTestPlan}`;

    // Look for existing E2E comment
    const e2eComment = comments.find(c => c.body.includes('## E2E Test Plan'));

    if (e2eComment) {
      // Check if content is different (compare without the header)
      const existingContent = e2eComment.body.replace(/^## E2E Test Plan\s*\n*/, '').trim();
      if (existingContent !== e2eTestPlan) {
        updatePRComment(e2eComment.id, e2eBody, workingDir);
      }
    } else {
      // No E2E comment exists, post new one
      const result = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body-file', '-'], {
        encoding: 'utf-8',
        cwd: workingDir,
        input: e2eBody,
      });
      if (result.status !== 0) {
        console.error('Warning: Could not add e2e test plan comment to PR');
      }
    }
  }
}
