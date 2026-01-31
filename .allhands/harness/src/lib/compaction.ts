/**
 * Compaction Handler
 *
 * Post-agent analysis and learning extraction.
 * Analyzes conversation logs, git diff, and prompt state to determine:
 * - Whether to keep or discard code changes
 * - What learnings to preserve for the next attempt
 * - How to update the prompt's progress section
 */

import { readFileSync, existsSync } from 'fs';
import {
  analyzeConversation,
  recommendAction,
  type ConversationAnalysis,
  type ActionRecommendation,
} from './oracle.js';
import {
  appendToProgressSection,
  incrementAttempts,
  parsePromptFile,
} from './prompts.js';
import { readAlignment, getCurrentBranch } from './planning.js';
import { gitExec } from './git.js';

export interface CompactionInput {
  conversationLogs: string; // File path
  promptFile: string; // File path
  cwd?: string;
}

export interface CompactionResult {
  success: boolean;
  analysis: ConversationAnalysis;
  recommendation: ActionRecommendation;
  gitDiff: string;
  attemptNumber: number;
  progressUpdate: string;
  committed: boolean;
  error?: string;
}

/**
 * Get a summary of the current git diff
 *
 * Returns the --stat output for a quick overview of changes.
 */
export function getGitDiffSummary(cwd?: string): string {
  const workingDir = cwd || process.cwd();

  try {
    // Get both staged and unstaged changes
    const stagedResult = gitExec(['diff', '--cached', '--stat'], workingDir);
    const staged = stagedResult.stdout;

    const unstagedResult = gitExec(['diff', '--stat'], workingDir);
    const unstaged = unstagedResult.stdout;

    const parts: string[] = [];
    if (staged) {
      parts.push('Staged:\n' + staged);
    }
    if (unstaged) {
      parts.push('Unstaged:\n' + unstaged);
    }

    if (parts.length === 0) {
      return 'No changes detected';
    }

    return parts.join('\n\n');
  } catch {
    return 'Unable to get git diff';
  }
}

/**
 * Get the full git diff (not just stat)
 */
export function getGitDiffFull(cwd?: string, maxLines: number = 500): string {
  const workingDir = cwd || process.cwd();

  try {
    const diffResult = gitExec(['diff', 'HEAD'], workingDir);
    const diff = diffResult.stdout;

    // Truncate if too long
    const lines = diff.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + '\n... (truncated)';
    }

    return diff;
  } catch {
    return '';
  }
}

/**
 * Run the compaction process
 *
 * 1. Read all input files
 * 2. Get git diff
 * 3. Analyze conversation with oracle
 * 4. Get action recommendation
 * 5. Update prompt progress section
 * 6. Increment attempts
 * 7. Execute recommendation (commit or discard)
 */
export async function runCompaction(input: CompactionInput): Promise<CompactionResult> {
  const workingDir = input.cwd || process.cwd();

  // Read input files
  let conversationLogs: string;
  let promptContent: string;
  let alignmentContent: string;

  try {
    if (!existsSync(input.conversationLogs)) {
      throw new Error(`Conversation logs not found: ${input.conversationLogs}`);
    }
    conversationLogs = readFileSync(input.conversationLogs, 'utf-8');

    if (!existsSync(input.promptFile)) {
      throw new Error(`Prompt file not found: ${input.promptFile}`);
    }
    promptContent = readFileSync(input.promptFile, 'utf-8');

    // Infer alignment doc from current branch
    const branch = getCurrentBranch(workingDir);
    alignmentContent = readAlignment(branch, workingDir) || '';
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      analysis: {
        wasGettingClose: false,
        progressPercentage: 0,
        keyLearnings: [],
        blockers: [errorMsg],
        partialWork: [],
      },
      recommendation: {
        action: 'continue',
        reasoning: 'File read error - defaulting to continue',
        preserveFiles: [],
        discardFiles: [],
      },
      gitDiff: '',
      attemptNumber: 0,
      progressUpdate: '',
      committed: false,
      error: errorMsg,
    };
  }

  // Get git diff
  const gitDiffSummary = getGitDiffSummary(workingDir);
  const gitDiffFull = getGitDiffFull(workingDir);

  // Analyze conversation
  const analysis = await analyzeConversation(
    conversationLogs,
    promptContent,
    alignmentContent,
    gitDiffFull
  );

  // Get current attempt number and increment
  const prompt = parsePromptFile(input.promptFile);
  const currentAttempt = prompt?.frontmatter.attempts || 0;
  const attemptNumber = incrementAttempts(input.promptFile);

  // Get action recommendation
  const recommendation = await recommendAction(analysis, attemptNumber, gitDiffFull);

  // Build progress update
  const progressUpdate = formatProgressUpdate(
    attemptNumber,
    analysis,
    recommendation
  );

  // Append to prompt progress section
  appendToProgressSection(input.promptFile, progressUpdate);

  // Execute recommendation
  let committed = false;
  try {
    committed = await executeRecommendation(
      recommendation,
      `compaction(prompt-${prompt?.frontmatter.number || 0}): ${recommendation.action} - ${recommendation.reasoning.substring(0, 50)}`,
      workingDir
    );
  } catch {
    // Execution failed but analysis succeeded
  }

  return {
    success: true,
    analysis,
    recommendation,
    gitDiff: gitDiffSummary,
    attemptNumber,
    progressUpdate,
    committed,
  };
}

/**
 * Format the progress update for the prompt file
 */
function formatProgressUpdate(
  attemptNumber: number,
  analysis: ConversationAnalysis,
  recommendation: ActionRecommendation
): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [
    `### Attempt ${attemptNumber} (${timestamp})`,
    `**Result**: ${recommendation.action.charAt(0).toUpperCase() + recommendation.action.slice(1)} | **Progress**: ${analysis.progressPercentage}%`,
    '',
  ];

  if (analysis.keyLearnings.length > 0) {
    lines.push('**Key Learnings**:');
    for (const learning of analysis.keyLearnings) {
      lines.push(`- ${learning}`);
    }
    lines.push('');
  }

  if (analysis.blockers.length > 0) {
    lines.push(`**Blockers**: ${analysis.blockers.join('; ')}`);
    lines.push('');
  }

  if (recommendation.preserveFiles.length > 0) {
    const files = recommendation.preserveFiles.map((f) => `\`${f}\``).join(', ');
    lines.push(`**Preserved**: ${files}`);
  }

  return lines.join('\n');
}

/**
 * Execute the recommendation (commit or discard changes)
 *
 * Returns true if a commit was made.
 */
export async function executeRecommendation(
  recommendation: ActionRecommendation,
  commitMessage: string,
  cwd?: string
): Promise<boolean> {
  const workingDir = cwd || process.cwd();

  if (recommendation.action === 'continue') {
    // Commit all changes
    try {
      // Stage all changes
      gitExec(['add', '-A'], workingDir);

      // Check if there are staged changes
      const statusResult = gitExec(['status', '--porcelain'], workingDir);

      if (statusResult.stdout) {
        // Commit — spawnSync handles the message safely, no shell escaping needed
        gitExec(['commit', '-m', commitMessage], workingDir);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  } else {
    // Scratch - discard changes but preserve specified files
    try {
      if (recommendation.preserveFiles.length > 0) {
        // Stash preserve files first
        for (const file of recommendation.preserveFiles) {
          try {
            gitExec(['stash', 'push', '-m', `preserve-${file}`, '--', file], workingDir);
          } catch {
            // File might not have changes
          }
        }
      }

      // Discard all changes
      gitExec(['checkout', '.'], workingDir);

      // Clean untracked files (except .planning/)
      gitExec(['clean', '-fd', '--exclude=.planning'], workingDir);

      // Restore preserved files
      if (recommendation.preserveFiles.length > 0) {
        for (const file of recommendation.preserveFiles) {
          try {
            gitExec(['stash', 'pop'], workingDir);
          } catch {
            // Stash might be empty
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }
}
