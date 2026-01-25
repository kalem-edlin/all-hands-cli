/**
 * Prompt Management and Picker
 *
 * Handles prompt file operations and the prompt picker algorithm
 * for the execution loop.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { lockSync, unlockSync } from 'proper-lockfile';
import { getPlanningPaths } from './planning.js';

export type PromptStatus = 'pending' | 'in_progress' | 'done';
export type PromptPriority = 'high' | 'medium' | 'low';

export interface PromptFrontmatter {
  number: number;
  title: string;
  status: PromptStatus;
  dependencies: number[];
  priority: PromptPriority;
  attempts: number;
  commits: string[];
  created: string;
  updated: string;
}

export interface PromptFile {
  path: string;
  filename: string;
  frontmatter: PromptFrontmatter;
  body: string;
  rawContent: string;
}

export interface PickerResult {
  prompt: PromptFile | null;
  reason: string;
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    done: number;
    blocked: number;
  };
}

const PRIORITY_ORDER: Record<PromptPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Execute a function with file locking to prevent race conditions.
 */
function withFileLock<T>(filePath: string, fn: () => T): T {
  if (!existsSync(filePath)) {
    // File doesn't exist yet, no locking needed
    return fn();
  }

  lockSync(filePath);
  try {
    return fn();
  } finally {
    try {
      unlockSync(filePath);
    } catch {
      // Ignore unlock errors
    }
  }
}

/**
 * Parse a prompt file
 */
export function parsePromptFile(filePath: string): PromptFile | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const rawContent = readFileSync(filePath, 'utf-8');
    const frontmatterMatch = rawContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = parseYaml(frontmatterMatch[1]) as PromptFrontmatter;
    const body = frontmatterMatch[2];

    return {
      path: filePath,
      filename: basename(filePath),
      frontmatter,
      body,
      rawContent,
    };
  } catch {
    return null;
  }
}

/**
 * Load all prompt files from the planning directory for a spec
 */
export function loadAllPrompts(spec: string, cwd?: string): PromptFile[] {
  const paths = getPlanningPaths(spec, cwd);

  if (!existsSync(paths.prompts)) {
    return [];
  }

  const files = readdirSync(paths.prompts)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(paths.prompts, f));

  const prompts: PromptFile[] = [];
  for (const file of files) {
    const prompt = parsePromptFile(file);
    if (prompt) {
      prompts.push(prompt);
    }
  }

  return prompts;
}

/**
 * Check if a prompt's dependencies are satisfied
 */
export function dependenciesSatisfied(
  prompt: PromptFile,
  allPrompts: PromptFile[]
): boolean {
  const deps = prompt.frontmatter.dependencies || [];
  if (deps.length === 0) return true;

  const donePromptNumbers = new Set(
    allPrompts
      .filter((p) => p.frontmatter.status === 'done')
      .map((p) => p.frontmatter.number)
  );

  return deps.every((depNum) => donePromptNumbers.has(depNum));
}

/**
 * Pick the next prompt to execute for a spec
 *
 * Algorithm:
 * 1. Filter to pending/in_progress prompts with satisfied dependencies
 * 2. Prefer in_progress over pending (resume interrupted work)
 * 3. Sort by priority (high > medium > low)
 * 4. Within same priority, sort by number (lower first)
 */
export function pickNextPrompt(spec: string, cwd?: string): PickerResult {
  const prompts = loadAllPrompts(spec, cwd);

  const stats = {
    total: prompts.length,
    pending: 0,
    inProgress: 0,
    done: 0,
    blocked: 0,
  };

  // Count by status
  for (const p of prompts) {
    switch (p.frontmatter.status) {
      case 'pending':
        stats.pending++;
        break;
      case 'in_progress':
        stats.inProgress++;
        break;
      case 'done':
        stats.done++;
        break;
    }
  }

  if (prompts.length === 0) {
    return {
      prompt: null,
      reason: 'No prompt files found',
      stats,
    };
  }

  // Filter to actionable prompts
  const actionable = prompts.filter((p) => {
    if (p.frontmatter.status === 'done') return false;
    if (!dependenciesSatisfied(p, prompts)) {
      stats.blocked++;
      return false;
    }
    return true;
  });

  // Recalculate pending count (some may be blocked)
  stats.pending = stats.pending - stats.blocked;

  if (actionable.length === 0) {
    if (stats.done === stats.total) {
      return {
        prompt: null,
        reason: 'All prompts completed',
        stats,
      };
    }
    return {
      prompt: null,
      reason: 'No actionable prompts (all remaining are blocked by dependencies)',
      stats,
    };
  }

  // Sort: in_progress first, then by priority, then by number
  actionable.sort((a, b) => {
    // In-progress prompts first (resume interrupted work)
    if (a.frontmatter.status === 'in_progress' && b.frontmatter.status !== 'in_progress') {
      return -1;
    }
    if (b.frontmatter.status === 'in_progress' && a.frontmatter.status !== 'in_progress') {
      return 1;
    }

    // Then by priority
    const priorityDiff =
      PRIORITY_ORDER[a.frontmatter.priority] - PRIORITY_ORDER[b.frontmatter.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by number
    return a.frontmatter.number - b.frontmatter.number;
  });

  const selected = actionable[0];
  const reason =
    selected.frontmatter.status === 'in_progress'
      ? `Resuming in-progress prompt ${selected.frontmatter.number}`
      : `Selected prompt ${selected.frontmatter.number} (${selected.frontmatter.priority} priority)`;

  return {
    prompt: selected,
    reason,
    stats,
  };
}

/**
 * Update a prompt file's frontmatter
 */
export function updatePromptFrontmatter(
  filePath: string,
  updates: Partial<PromptFrontmatter>
): PromptFile | null {
  return withFileLock(filePath, () => {
    const prompt = parsePromptFile(filePath);
    if (!prompt) return null;

    const updatedFrontmatter = {
      ...prompt.frontmatter,
      ...updates,
      updated: new Date().toISOString(),
    };

    const newContent = `---
${stringifyYaml(updatedFrontmatter).trim()}
---
${prompt.body}`;

    writeFileSync(filePath, newContent);
    return parsePromptFile(filePath);
  });
}

/**
 * Mark a prompt as in_progress
 */
export function markPromptInProgress(filePath: string): PromptFile | null {
  return updatePromptFrontmatter(filePath, { status: 'in_progress' });
}

/**
 * Mark a prompt as done
 */
export function markPromptDone(filePath: string): PromptFile | null {
  return updatePromptFrontmatter(filePath, { status: 'done' });
}

/**
 * Increment prompt attempts counter
 */
export function incrementPromptAttempts(filePath: string): PromptFile | null {
  const prompt = parsePromptFile(filePath);
  if (!prompt) return null;

  return updatePromptFrontmatter(filePath, {
    attempts: (prompt.frontmatter.attempts || 0) + 1,
  });
}

/**
 * Create a new prompt file for a spec
 */
export function createPrompt(
  number: number,
  title: string,
  tasks: string[],
  options: {
    dependencies?: number[];
    priority?: PromptPriority;
    acceptanceCriteria?: string[];
  } = {},
  spec: string,
  cwd?: string
): string {
  const paths = getPlanningPaths(spec, cwd);
  const now = new Date().toISOString();

  const frontmatter: PromptFrontmatter = {
    number,
    title,
    status: 'pending',
    dependencies: options.dependencies || [],
    priority: options.priority || 'medium',
    attempts: 0,
    commits: [],
    created: now,
    updated: now,
  };

  const tasksList = tasks.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const criteriaSection = options.acceptanceCriteria
    ? `\n## Acceptance Criteria\n\n${options.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}\n`
    : '';

  const content = `---
${stringifyYaml(frontmatter).trim()}
---

## Tasks

${tasksList}
${criteriaSection}
## Progress

<!-- Agent-updated section -->

`;

  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const filename = `${String(number).padStart(2, '0')}-${slug}.md`;
  const filePath = join(paths.prompts, filename);

  writeFileSync(filePath, content);
  return filePath;
}

/**
 * Get prompt by number for a spec
 */
export function getPromptByNumber(
  number: number,
  spec: string,
  cwd?: string
): PromptFile | null {
  const prompts = loadAllPrompts(spec, cwd);
  return prompts.find((p) => p.frontmatter.number === number) || null;
}

/**
 * Append content to a prompt's Progress section
 *
 * Format appended:
 * ### Attempt N (timestamp)
 * **Result**: Continue | Scratch | **Progress**: NN%
 *
 * **Key Learnings**:
 * - Learning 1
 * - Learning 2
 *
 * **Blockers**: Blocker description
 *
 * **Preserved**: `file1.ts`, `file2.ts`
 */
export function appendToProgressSection(
  filePath: string,
  content: string
): PromptFile | null {
  return withFileLock(filePath, () => {
    const prompt = parsePromptFile(filePath);
    if (!prompt) return null;

    // Find the Progress section
    const progressMarker = '## Progress';
    const progressIndex = prompt.body.indexOf(progressMarker);

    if (progressIndex === -1) {
      // No Progress section found - append to end
      const newBody = prompt.body + '\n## Progress\n\n' + content + '\n';
      const newContent = `---
${stringifyYaml(prompt.frontmatter).trim()}
---
${newBody}`;
      writeFileSync(filePath, newContent);
      return parsePromptFile(filePath);
    }

    // Insert content after Progress section header and any existing content
    // Find the next section (## header) or end of file
    const afterProgress = prompt.body.substring(progressIndex + progressMarker.length);
    const nextSectionMatch = afterProgress.match(/\n## [^\n]+/);

    let insertPoint: number;
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      // Insert before the next section
      insertPoint = progressIndex + progressMarker.length + nextSectionMatch.index;
    } else {
      // No next section - append to end
      insertPoint = prompt.body.length;
    }

    const newBody =
      prompt.body.substring(0, insertPoint).trimEnd() +
      '\n\n' +
      content +
      '\n' +
      prompt.body.substring(insertPoint);

    const newContent = `---
${stringifyYaml(prompt.frontmatter).trim()}
---
${newBody}`;

    writeFileSync(filePath, newContent);
    return parsePromptFile(filePath);
  });
}

/**
 * Increment attempts and return the new attempt number
 * (Alias for incrementPromptAttempts that returns the count)
 */
export function incrementAttempts(filePath: string): number {
  const prompt = parsePromptFile(filePath);
  if (!prompt) return 1;

  const newAttempts = (prompt.frontmatter.attempts || 0) + 1;
  updatePromptFrontmatter(filePath, { attempts: newAttempts });
  return newAttempts;
}

/**
 * Add a commit hash to a prompt's commits array
 *
 * Commits are stored in chronological order (oldest first).
 * This tracks all work done on the prompt, including failed attempts.
 */
export function addCommitToPrompt(filePath: string, commitHash: string): PromptFile | null {
  const prompt = parsePromptFile(filePath);
  if (!prompt) return null;

  const commits = prompt.frontmatter.commits || [];

  // Avoid duplicates
  if (commits.includes(commitHash)) {
    return prompt;
  }

  return updatePromptFrontmatter(filePath, {
    commits: [...commits, commitHash],
  });
}

/**
 * Get all commits for a prompt
 */
export function getPromptCommits(filePath: string): string[] {
  const prompt = parsePromptFile(filePath);
  if (!prompt) return [];
  return prompt.frontmatter.commits || [];
}
