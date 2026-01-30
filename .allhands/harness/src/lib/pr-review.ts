/**
 * PR Review Utilities
 *
 * Functions for managing PR review integration with configurable reviewers:
 * - Polling for review comments based on configurable detection string
 * - Triggering reviews via PR comment
 * - Tracking review state across cycles
 */

import { execSync } from 'child_process';

export interface PRReviewState {
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
 * Check the current PR review status
 *
 * Examines PR comments to find those matching the pattern against
 * comment author name or body, optionally filtering by time.
 *
 * @param prUrl - The PR URL to check
 * @param reviewMatchPattern - Pattern to match against comment author name and body (case-insensitive)
 * @param afterTime - Only consider comments created after this ISO timestamp
 * @param cwd - Working directory for gh CLI
 */
export async function checkPRReviewStatus(
  prUrl: string,
  reviewMatchPattern: string,
  afterTime?: string,
  cwd?: string
): Promise<PRReviewState> {
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
    // Fetch all PR comments (both review comments and issue comments)
    // We need to check both endpoints since reviewers may post to either
    const reviewCommentsOutput = execSync(
      `gh api repos/${prInfo.owner}/${prInfo.repo}/pulls/${prInfo.number}/comments --jq '.[] | {id: .id, body: .body, user: .user.login, created_at: .created_at}'`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: cwd || process.cwd(),
      }
    );

    const issueCommentsOutput = execSync(
      `gh api repos/${prInfo.owner}/${prInfo.repo}/issues/${prInfo.number}/comments --jq '.[] | {id: .id, body: .body, user: .user.login, created_at: .created_at}'`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: cwd || process.cwd(),
      }
    );

    // Combine and parse comments from both sources
    const allCommentsRaw = [reviewCommentsOutput, issueCommentsOutput]
      .map((output) => output.trim())
      .filter(Boolean)
      .join('\n');

    const allComments = allCommentsRaw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as { id: number; body: string; user: string; created_at: string };
        } catch {
          return null;
        }
      })
      .filter((c): c is { id: number; body: string; user: string; created_at: string } => c !== null);

    // Filter comments where author name or body matches the pattern (case-insensitive)
    const matchRegex = new RegExp(reviewMatchPattern, 'i');
    let matchingComments = allComments.filter((c) => matchRegex.test(c.user) || matchRegex.test(c.body));

    // Filter by afterTime if provided
    if (afterTime) {
      const afterTimeMs = new Date(afterTime).getTime();
      matchingComments = matchingComments.filter(
        (c) => new Date(c.created_at).getTime() > afterTimeMs
      );
    }

    if (matchingComments.length === 0) {
      return {
        status: 'none',
        lastCommentId: null,
        lastCommentTime: null,
        reviewCycle: 0,
      };
    }

    // Find the most recent matching comment
    const sortedComments = matchingComments.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latestComment = sortedComments[0];

    return {
      status: 'completed',
      lastCommentId: String(latestComment.id),
      lastCommentTime: latestComment.created_at,
      reviewCycle: matchingComments.length,
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
 * Trigger a PR review by posting a comment on the PR
 *
 * Posts the configured rerun comment to trigger the reviewer bot.
 *
 * @param prUrl - The PR URL to comment on
 * @param rerunComment - The comment text to post
 * @param cwd - Working directory for gh CLI
 */
export async function triggerPRReview(
  prUrl: string,
  rerunComment: string,
  cwd?: string
): Promise<{ success: boolean; commentId?: string }> {
  const prInfo = parsePRUrl(prUrl);
  if (!prInfo) {
    return { success: false };
  }

  try {
    // Post a comment to trigger the reviewer
    const output = execSync(
      `gh pr comment ${prInfo.number} --body "${rerunComment}" --repo ${prInfo.owner}/${prInfo.repo}`,
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
  previous: PRReviewState,
  current: PRReviewState
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
