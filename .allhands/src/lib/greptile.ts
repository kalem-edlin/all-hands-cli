/**
 * Greptile Utilities
 *
 * Functions for managing Greptile PR review integration:
 * - Polling for review comments
 * - Triggering reviews via PR comment
 * - Tracking review state across cycles
 */

import { execSync } from 'child_process';

export interface GreptileReviewState {
  status: 'pending' | 'reviewing' | 'completed' | 'none';
  lastCommentId: string | null;
  lastCommentTime: string | null;
  reviewCycle: number;
}

export interface PRInfo {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Parse a GitHub PR URL into owner, repo, and number
 *
 * Supports formats:
 * - https://github.com/owner/repo/pull/123
 * - github.com/owner/repo/pull/123
 */
export function parsePRUrl(url: string): PRInfo | null {
  const match = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10),
  };
}

/**
 * Check the current Greptile review status on a PR
 *
 * Examines PR comments to determine if Greptile has reviewed
 * and tracks the most recent review comment.
 */
export async function checkGreptileStatus(
  prUrl: string,
  cwd?: string
): Promise<GreptileReviewState> {
  const prInfo = parsePRUrl(prUrl);
  if (!prInfo) {
    return {
      status: 'none',
      lastCommentId: null,
      lastCommentTime: null,
      reviewCycle: 0,
    };
  }

  try {
    // Fetch PR comments with id, user, and created_at
    const output = execSync(
      `gh api repos/${prInfo.owner}/${prInfo.repo}/pulls/${prInfo.number}/comments --jq '.[] | select(.user.login | test("greptile|coderabbit"; "i")) | {id: .id, user: .user.login, created_at: .created_at}'`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: cwd || process.cwd(),
      }
    );

    // Parse the NDJSON output
    const comments = output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as { id: number; user: string; created_at: string };
        } catch {
          return null;
        }
      })
      .filter((c): c is { id: number; user: string; created_at: string } => c !== null);

    if (comments.length === 0) {
      return {
        status: 'none',
        lastCommentId: null,
        lastCommentTime: null,
        reviewCycle: 0,
      };
    }

    // Find the most recent comment
    const sortedComments = comments.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latestComment = sortedComments[0];

    return {
      status: 'completed',
      lastCommentId: String(latestComment.id),
      lastCommentTime: latestComment.created_at,
      reviewCycle: comments.length,
    };
  } catch {
    // No comments or error - return none status
    return {
      status: 'none',
      lastCommentId: null,
      lastCommentTime: null,
      reviewCycle: 0,
    };
  }
}

/**
 * Trigger a Greptile review by posting a comment on the PR
 *
 * Posts "@greptile review" to trigger Greptile's review bot.
 */
export async function triggerGreptileReview(
  prUrl: string,
  cwd?: string
): Promise<{ success: boolean; commentId?: string }> {
  const prInfo = parsePRUrl(prUrl);
  if (!prInfo) {
    return { success: false };
  }

  try {
    // Post a comment to trigger Greptile
    const output = execSync(
      `gh pr comment ${prInfo.number} --body "@greptile review" --repo ${prInfo.owner}/${prInfo.repo}`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: cwd || process.cwd(),
      }
    );

    // gh pr comment outputs the comment URL on success
    const commentIdMatch = output.match(/\/comments\/(\d+)/);

    return {
      success: true,
      commentId: commentIdMatch ? commentIdMatch[1] : undefined,
    };
  } catch {
    return { success: false };
  }
}

/**
 * Compare two review states to detect new reviews
 *
 * Returns true if there's a new review since the previous state.
 */
export function hasNewReview(
  previous: GreptileReviewState,
  current: GreptileReviewState
): boolean {
  // No previous review, now has one
  if (previous.status === 'none' && current.status === 'completed') {
    return true;
  }

  // Different comment ID (new review)
  if (
    previous.lastCommentId !== current.lastCommentId &&
    current.lastCommentId !== null
  ) {
    return true;
  }

  // Higher review cycle
  if (current.reviewCycle > previous.reviewCycle) {
    return true;
  }

  return false;
}
