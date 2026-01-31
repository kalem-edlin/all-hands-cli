/**
 * TUI Command - Launch the terminal user interface
 *
 * The TUI provides a dashboard for:
 * - Starting/stopping the execution loop
 * - Spawning agent sessions (ideate, coordinator, planner, etc.)
 * - Monitoring loop progress and agent activity
 * - Managing specs and PR workflows
 *
 * In the branch-keyed model:
 * - Current git branch determines the active spec
 * - Switching specs means checking out the spec's branch
 * - Planning directories are keyed by sanitized branch name
 */

import { Command } from 'commander';
import { join, basename, dirname, relative } from 'path';
import { existsSync, readFileSync, renameSync } from 'fs';

import { TUI } from '../tui/index.js';
import type { TUIState, PRActionState, PromptItem, AgentInfo } from '../tui/index.js';
import {
  readStatus,
  getCurrentBranch,
  updateStatus,
  updatePRReviewStatus,
  initializeStatus,
  getPlanningPaths,
  ensurePlanningDir,
  sanitizeBranchForDir,
  planningDirExists,
} from '../lib/planning.js';
import { triggerPRReview } from '../lib/pr-review.js';
import { loadProjectSettings } from '../hooks/shared.js';
import { findSpecForPath, extractSpecNameFromFile } from '../lib/planning-utils.js';
import { getBaseBranch, hasUncommittedChanges, gitExec, validateGitRef, syncWithOriginMain } from '../lib/git.js';
import { loadAllPrompts, getNextPromptNumber } from '../lib/prompts.js';
import {
  isTmuxInstalled,
  spawnAgentFromProfile,
  buildTemplateContext,
  getRunningAgents,
  renameWindow,
  getCurrentWindowId,
} from '../lib/tmux.js';
import { setHubWindowId, clearTuiSession } from '../lib/session.js';
import { getProfilesByTuiAction } from '../lib/opencode/index.js';
import { buildPR } from '../lib/oracle.js';
import type { PromptFile } from '../lib/prompts.js';
import { findSpecById, getSpecForBranch, type SpecFile, type SpecType } from '../lib/specs.js';
import { updateSpecStatus, reindexAfterMove } from './specs.js';
import { logTuiError, logTuiAction, logTuiLifecycle } from '../lib/trace-store.js';
import { getFlowsDirectory } from '../lib/flows.js';

/**
 * Unified scoping flow — all spec types route here.
 * Domain-specific behavior is driven by the WORKFLOW_DOMAIN_PATH template variable,
 * not by flow file selection.
 */
export const UNIFIED_SCOPING_FLOW = 'IDEATION_SCOPING.md';

/**
 * Launch the TUI - can be called directly or via command
 */
export async function launchTUI(options: { spec?: string } = {}): Promise<void> {
  const cwd = process.cwd();

  // IMMEDIATELY capture window ID before any slow operations (like tldr indexing)
  // This ensures we track the correct window even if user switches away during init
  const hubWindowId = getCurrentWindowId();
  if (hubWindowId) {
    setHubWindowId(hubWindowId, cwd);
  }

  const branch = getCurrentBranch(cwd);
  const planningKey = sanitizeBranchForDir(branch);

  // Find current spec from branch using planning dir as source of truth
  const currentSpec = getSpecForBranch(branch, cwd);

  // TLDR semantic indexing now runs in background after TUI launches (see TUI.startBackgroundIndexing)

  // Load initial state from current branch's planning directory
  // Load prompts if planning directory exists, regardless of status file
  const status = planningDirExists(planningKey, cwd) ? readStatus(planningKey, cwd) : null;
  const prompts = planningDirExists(planningKey, cwd) ? loadAllPrompts(planningKey, cwd) : [];

  // Convert prompts to PromptItem format
  const promptItems: PromptItem[] = prompts.map((p) => ({
    number: p.frontmatter.number,
    title: p.frontmatter.title,
    status: p.frontmatter.status as 'pending' | 'in_progress' | 'done',
    path: p.path,
  }));

  // Get active agents from tmux
  const runningAgents = getRunningAgents(branch);
  const activeAgents: AgentInfo[] = runningAgents.map((a) => ({
    name: a.windowName,
    agentType: a.agentType || 'unknown',
    isRunning: true,
  }));

  const baseBranch = getBaseBranch();

  // Determine initial PR action state based on PR and review status
  let initialPRActionState: PRActionState = 'create-pr';
  if (status?.pr?.url) {
    // PR exists - check if review feedback was received
    if (status?.prReview?.lastReviewTime) {
      // Review feedback was received - show rerun option
      initialPRActionState = 'rerun-pr-review';
    } else {
      // PR created but waiting for review
      initialPRActionState = 'awaiting-review';
    }
  }

  const initialState: Partial<TUIState> = {
    loopEnabled: false, // Always start disabled, regardless of saved status
    parallelEnabled: status?.loop?.parallel ?? false,
    prompts: promptItems,
    activeAgents,
    spec: currentSpec?.id,
    branch,
    baseBranch,
    prActionState: initialPRActionState,
    customFlowCounter: 0,
  };

  // Rename the hub window (using captured ID to target correct window even if focus changed)
  renameWindow(hubWindowId, 'hub');

  const tui = new TUI({
    onAction: (action: string, data) => {
      // Get current branch/spec from TUI state (not captured at init time)
      const currentBranch = tui.getState().branch || getCurrentBranch(cwd);
      const currentPlanningKey = sanitizeBranchForDir(currentBranch);
      const spec = getSpecForBranch(currentBranch, cwd);
      handleAction(tui, action, currentPlanningKey, spec, currentBranch, data);
    },
    onExit: () => {
      console.log('\nExiting All Hands TUI...');
      process.exit(0);
    },
    onSpawnExecutor: (prompt, executorBranch, specId) => {
      spawnExecutorForPrompt(tui, prompt, executorBranch, specId);
    },
    onSpawnEmergentPlanning: (emergentBranch, specId) => {
      spawnEmergentPlanningAgent(tui, emergentBranch, specId);
    },
    cwd: process.cwd(),
  });

  // Set initial state
  tui.updateState(initialState);
  tui.log(`Branch: ${branch}`);
  if (currentSpec) {
    tui.log(`Spec: ${currentSpec.id} (${status?.stage || 'no planning'})`);
  } else {
    tui.log('No spec for this branch. Use Switch Spec to select one.');
  }

  // Log TUI launch
  logTuiLifecycle('tui.start', {
    branch,
    spec: currentSpec?.id,
    promptCount: promptItems.length,
    agentCount: activeAgents.length,
  }, cwd);

  // Start TUI
  tui.start();
}

// No register function - TUI is launched directly from CLI when no command is given

/**
 * Spawn agents for a TUI action using profile definitions
 *
 * Looks up all agent profiles with matching tui_action and spawns them.
 * Multiple profiles can share the same tui_action (e.g., compound can spawn multiple agents).
 */
async function spawnAgentsForAction(
  tui: TUI,
  action: string,
  planningKey: string | null,
  currentSpec: SpecFile | null,
  branch: string,
  status: ReturnType<typeof readStatus>,
  cwd?: string,
  contextOverrides?: Record<string, string>
): Promise<boolean> {
  const profileMap = getProfilesByTuiAction();
  const profiles = profileMap.get(action);

  if (!profiles || profiles.length === 0) {
    return false; // No profiles for this action
  }

  // Check if any profile requires spec
  const requiresSpec = profiles.some((p) => p.tuiRequiresSpec);
  if (requiresSpec && !currentSpec) {
    tui.log('Error: No spec for this branch. Checkout a spec branch first.');
    return true; // Handled, but with error
  }

  // Check tmux availability
  if (!isTmuxInstalled()) {
    tui.log('Error: tmux is required for agent spawning');
    return true;
  }

  // Build template context once for all agents
  const context = buildTemplateContext(
    planningKey || 'default', // Use planning key for paths
    status?.name,
    undefined, // promptNumber - not applicable for TUI actions
    undefined, // promptPath - not applicable for TUI actions
    cwd
  );

  // Apply context overrides (e.g., WORKFLOW_DOMAIN_PATH for initiative steering)
  if (contextOverrides) {
    Object.assign(context, contextOverrides);
  }

  // Spawn each profile
  for (const profile of profiles) {
    const label = profile.tuiLabel ?? profile.name;
    tui.log(`Spawning ${label}...`);

    try {
      const result = spawnAgentFromProfile(
        {
          agentName: profile.name,
          context,
          focusWindow: profiles.length === 1, // Only focus if single agent
        },
        branch,
        cwd
      );

      tui.log(`Spawned ${profile.name} in ${result.sessionName}:${result.windowName}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      tui.log(`Error spawning ${profile.name}: ${message}`);
      logTuiError('spawn-agent', e instanceof Error ? e : message, {
        action,
        profileName: profile.name,
        spec: currentSpec?.id,
        branch,
      }, cwd);
    }
  }

  // Track compound_run in status when compound action is triggered
  if (action === 'compound' && planningKey && status) {
    updateStatus({ compound_run: true }, planningKey, cwd);
  }

  updateRunningAgents(tui, branch);
  return true;
}

/**
 * Check for uncommitted changes and prompt the user for confirmation.
 * Returns true if no uncommitted changes or user confirms proceeding.
 */
async function confirmProceedWithUncommittedChanges(
  tui: TUI,
  cwd: string,
  message: string
): Promise<boolean> {
  if (hasUncommittedChanges(cwd)) {
    const proceed = await tui.showConfirmation('Uncommitted Changes', message);
    return proceed;
  }
  return true;
}

async function handleAction(
  tui: TUI,
  action: string,
  planningKey: string | null,
  currentSpec: SpecFile | null,
  branch: string,
  data?: Record<string, unknown>
): Promise<void> {
  const cwd = process.cwd();

  // Log TUI action
  logTuiAction(action, {
    spec: currentSpec?.id,
    branch,
    planningKey,
    data,
  }, cwd);

  // Read status from planning directory
  const status = planningKey ? readStatus(planningKey, cwd) : null;

  // Prepare context overrides for actions that need them
  let contextOverrides: Record<string, string> | undefined;
  if (action === 'initiative-steering' && data?.domain) {
    const selectedDomain = data.domain as string;
    const domainConfigPath = join(cwd, '.allhands', 'workflows', `${selectedDomain}.md`);
    if (existsSync(domainConfigPath)) {
      contextOverrides = {
        WORKFLOW_DOMAIN_PATH: domainConfigPath,
      };
    } else {
      console.warn(`Workflow domain config not found: ${domainConfigPath}`);
    }
  }

  // Pre-spawn gate: sync with origin/main before compounding
  if (action === 'compound') {
    const syncResult = syncWithOriginMain(cwd);
    if (!syncResult.success && syncResult.conflicts.length > 0) {
      // Merge conflicts — already aborted by syncWithOriginMain
      await tui.showConfirmation(
        'Compounding Aborted',
        'Merge conflicts with main — compounding aborted',
        'Conflicting files:\n' + syncResult.conflicts.map(f => '  - ' + f).join('\n') + '\n\nResolve conflicts manually, push, and retry compounding.'
      );
      return;
    } else if (!syncResult.success) {
      // Fetch failure (no conflicts — network/remote issue)
      await tui.showConfirmation(
        'Compounding Aborted',
        'Failed to sync with remote main — compounding aborted',
        'Could not fetch origin/main. Check your network connection and remote configuration.'
      );
      return;
    }
  }

  // Try to handle as a profile-based agent spawn
  const handledByProfile = await spawnAgentsForAction(tui, action, planningKey, currentSpec, branch, status, cwd, contextOverrides);
  if (handledByProfile) {
    return;
  }

  // Handle non-agent actions
  switch (action) {
    case 'create-pr': {
      if (!currentSpec || !planningKey) {
        tui.log('Error: No spec for this branch. Checkout a spec branch first.');
        return;
      }

      // Warn about uncommitted changes — gives user a chance to cancel and commit first
      const proceedWithPR = await confirmProceedWithUncommittedChanges(
        tui, cwd, 'You have uncommitted changes that will not be included in the PR. Proceed anyway?'
      );
      if (!proceedWithPR) break;

      // Check if we're creating or updating
      const existingStatus = status?.pr?.url ? 'Updating' : 'Creating';
      tui.log(`${existingStatus} PR via oracle...`);

      try {
        // buildPR uses planning key for reading prompts/alignment
        const result = await buildPR(planningKey, cwd);

        if (result.success && result.prUrl) {
          const action = result.existingPR ? 'updated' : 'created';
          tui.log(`PR ${action}: ${result.prUrl}`);
          tui.setPRUrl(result.prUrl);

          // Set lastReviewRunTime to now for comment filtering
          updatePRReviewStatus(
            { lastReviewRunTime: new Date().toISOString() },
            planningKey,
            cwd
          );
        } else {
          tui.log(`Error: ${result.body}`);
          tui.log('You may need to push your branch first or check gh auth status.');
          logTuiError('create-pr', result.body || 'PR creation failed', {
            spec: currentSpec.id,
            branch,
          }, cwd);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        tui.log(`Error: ${message}`);
        logTuiError('create-pr', e instanceof Error ? e : message, {
          spec: currentSpec?.id,
          branch,
        }, cwd);
      }
      break;
    }

    case 'rerun-pr-review': {
      if (!planningKey) {
        tui.log('Error: No planning context. Checkout a spec branch first.');
        return;
      }

      // Get PR URL from status
      const prStatus = status?.pr;
      if (!prStatus?.url) {
        tui.log('Error: No PR found. Create a PR first.');
        return;
      }

      // Warn about uncommitted changes — gives user a chance to cancel and commit first
      const proceedWithReview = await confirmProceedWithUncommittedChanges(
        tui, cwd, 'You have uncommitted changes that will not be included in the PR. Proceed anyway?'
      );
      if (!proceedWithReview) break;

      tui.log('Triggering PR re-review...');

      try {
        // Push any unpushed commits before triggering review
        const workingDir = cwd || process.cwd();
        const unpushedResult = gitExec(['log', '@{u}..HEAD', '--oneline'], workingDir);

        if (unpushedResult.success && unpushedResult.stdout) {
          tui.log('Pushing local commits to remote...');
          const pushResult = gitExec(['push'], workingDir);
          if (pushResult.success) {
            tui.log('Commits pushed successfully.');
          } else {
            tui.log('Warning: Could not push commits. Continuing with review trigger...');
          }
        } else if (!unpushedResult.success) {
          // No upstream or other git error - try push anyway
          const pushResult = gitExec(['push'], workingDir);
          if (!pushResult.success) {
            tui.log('Warning: Could not push commits. Continuing with review trigger...');
          }
        }

        // Load settings for rerun comment
        const settings = loadProjectSettings();
        const rerunComment = settings?.prReview?.rerunComment ?? '@greptile';

        // Post comment to trigger review
        const result = await triggerPRReview(prStatus.url, rerunComment, cwd);

        if (result.success) {
          tui.log(`Re-review triggered with comment: ${rerunComment}`);

          // Update lastReviewRunTime and transition to awaiting state
          updatePRReviewStatus(
            { lastReviewRunTime: new Date().toISOString() },
            planningKey,
            cwd
          );

          // Transition TUI back to awaiting-review state
          tui.setPRUrl(prStatus.url);
        } else {
          tui.log('Error: Failed to post review comment');
          logTuiError('rerun-pr-review', 'Failed to post review comment', {
            prUrl: prStatus.url,
          }, cwd);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        tui.log(`Error: ${message}`);
        logTuiError('rerun-pr-review', e instanceof Error ? e : message, {
          prUrl: prStatus?.url,
        }, cwd);
      }
      break;
    }

    case 'mark-completed': {
      if (!currentSpec) {
        tui.log('Error: No spec for this branch. Checkout a spec branch first.');
        return;
      }

      if (currentSpec.status === 'completed') {
        tui.log('Spec is already marked as completed.');
        break;
      }

      // Warn about uncommitted changes — gives user a chance to cancel and commit first
      const proceedWithComplete = await confirmProceedWithUncommittedChanges(
        tui, cwd, 'You have uncommitted changes that will not be included in the final push. Proceed anyway?'
      );
      if (!proceedWithComplete) break;

      tui.log(`Marking spec as completed: ${currentSpec.id}`);

      try {
        // Remote sync: fetch + merge origin/main
        tui.log('Syncing with origin/main...');
        const syncResult = syncWithOriginMain(cwd);

        if (!syncResult.success && syncResult.conflicts.length > 0) {
          // Merge conflicts detected — already aborted by syncWithOriginMain
          const conflictDetail = "Conflicting files:\n" + syncResult.conflicts.map(f => "  - " + f).join("\n") + "\n\nResolve conflicts manually, push, and retry completion.";
          await tui.showConfirmation(
            'Merge Conflicts Detected',
            `Could not merge origin/main into ${branch}.`,
            conflictDetail
          );
          logTuiError('mark-completed', `Merge conflicts: ${syncResult.conflicts.join(', ')}`, {
            spec: currentSpec.id,
            branch,
            conflicts: syncResult.conflicts,
          }, cwd);
          return;
        } else if (!syncResult.success) {
          tui.log('Warning: Could not sync with origin/main. Continuing with local state.');
        } else {
          tui.log('Synced with origin/main successfully.');
        }

        // Compute relative paths for git staging before the move
        const oldRelPath = relative(cwd, currentSpec.path);
        const newRelPath = relative(cwd, join(cwd, 'specs', currentSpec.filename));
        const destPath = join(cwd, 'specs', currentSpec.filename);

        if (existsSync(destPath)) {
          tui.log(`Error: Destination already exists: ${destPath}`);
          break;
        }

        // Move spec file from specs/roadmap/ to specs/
        renameSync(currentSpec.path, destPath);
        tui.log(`Moved spec to: specs/${currentSpec.filename}`);

        // Update frontmatter on the new path
        updateSpecStatus(destPath, 'completed');

        // Reindex roadmap and docs indexes after file move
        await reindexAfterMove(cwd, currentSpec.path, destPath, true);

        // Stage only the moved spec file (deletion of old + addition of new)
        gitExec(['add', '--', oldRelPath], cwd);
        gitExec(['add', '--', newRelPath], cwd);

        // Commit
        const commitResult = gitExec(['commit', '-m', `chore: mark spec ${currentSpec.id} as completed`], cwd);
        if (!commitResult.success) {
          tui.log(`Error committing: ${commitResult.stderr}`);
          break;
        }

        // Push with -u to ensure upstream tracking is set
        const pushResult = gitExec(['push', '-u', 'origin', 'HEAD'], cwd);
        if (!pushResult.success) {
          tui.log('Warning: Could not push completion commit.');
        }

        // Refresh spec list to reflect completed status — developer stays on feature branch
        const refreshedSpec = getSpecForBranch(branch, cwd);
        tui.syncBranchContext(branch, refreshedSpec);

        tui.log(`Spec ${currentSpec.id} completed successfully.`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        tui.log(`Error: ${message}`);
        logTuiError('mark-completed', e instanceof Error ? e : message, {
          spec: currentSpec?.id,
          branch,
        }, cwd);
      }
      break;
    }

    case 'switch-spec': {
      const specId = data?.specId as string | undefined;
      if (!specId || specId.startsWith('header-') || specId === 'info') {
        // Header or info item selected, ignore
        break;
      }

      tui.log(`Switching to spec: ${specId}`);

      try {
        // Guard: check for uncommitted changes before any git operations
        const proceedWithSwitch = await confirmProceedWithUncommittedChanges(
          tui, cwd, 'You have uncommitted changes that may be lost during branch switch. Proceed anyway?'
        );
        if (!proceedWithSwitch) break;

        // Find spec file using specs library
        const specFile = findSpecById(specId, cwd);

        if (!specFile) {
          tui.log(`Error: Spec file not found: ${specId}`);
          break;
        }

        // Check if spec has a branch assigned
        if (!specFile.branch) {
          tui.log(`Error: Spec "${specId}" has no branch assigned.`);
          tui.log('Use "ah specs create <spec_path>" to assign a branch.');
          break;
        }

        // Completed specs cannot be switched to
        if (specFile.status === 'completed') {
          tui.log(`Spec "${specFile.id}" is completed and cannot be selected.`);
          break;
        }

        const specBranch = specFile.branch!;

        // Validate branch name safety
        validateGitRef(specBranch, 'spec branch');

        // Cross-worktree detection: check if spec is active in another worktree
        const worktreeResult = gitExec(['worktree', 'list', '--porcelain'], cwd);
        if (worktreeResult.success) {
          const worktreeLines = worktreeResult.stdout.split('\n');
          const worktreePaths: string[] = [];
          for (const line of worktreeLines) {
            if (line.startsWith('worktree ')) {
              worktreePaths.push(line.substring('worktree '.length));
            }
          }

          const sanitizedBranchKey = sanitizeBranchForDir(specBranch);
          for (const wtPath of worktreePaths) {
            // Skip the current working directory
            if (wtPath === cwd) continue;
            const planningPath = join(wtPath, '.planning', sanitizedBranchKey);
            if (existsSync(planningPath)) {
              await tui.showConfirmation(
                'Spec Active in Another Worktree',
                `Cannot activate spec here.`,
                `Spec '${specFile.id}' is already active in another worktree:\n  ${wtPath}\n\nSwitch to that directory to continue work on this spec.`
              );
              process.stderr.write(`Error: Spec '${specFile.id}' is already active in worktree: ${wtPath}\n`);
              logTuiError('switch-spec', `Spec active in another worktree: ${wtPath}`, {
                specId,
                specBranch,
                worktreePath: wtPath,
              }, cwd);
              // Use a flag to break out of the switch case
              tui.log(`Spec is active in worktree: ${wtPath}`);
              return;
            }
          }
        }

        // Branch creation / checkout with remote sync
        const branchExists = gitExec(['rev-parse', '--verify', specBranch], cwd);

        if (!branchExists.success) {
          // Branch does NOT exist locally — create from origin/main
          tui.log(`Creating new branch from origin/main: ${specBranch}`);

          // Fetch first (non-blocking on failure)
          const fetchResult = gitExec(['fetch', 'origin', 'main'], cwd);
          if (!fetchResult.success) {
            tui.log('Warning: Could not fetch from origin. Creating branch from local state.');
          }

          // Create branch from origin/main (or local main if fetch failed)
          const createBase = fetchResult.success ? 'origin/main' : 'main';
          const createResult = gitExec(['checkout', '-b', specBranch, createBase], cwd);
          if (!createResult.success) {
            tui.log(`Error creating branch: ${createResult.stderr}`);
            logTuiError('checkout-branch', createResult.stderr, {
              specId,
              specBranch,
              branch,
            }, cwd);
            break;
          }
        } else {
          // Branch exists — checkout and merge origin/main
          tui.log(`Checking out existing branch: ${specBranch}`);

          const checkoutResult = gitExec(['checkout', specBranch], cwd);
          if (!checkoutResult.success) {
            tui.log(`Error checking out branch: ${checkoutResult.stderr}`);
            logTuiError('checkout-branch', checkoutResult.stderr, {
              specId,
              specBranch,
              branch,
            }, cwd);
            break;
          }

          // Sync with origin/main
          tui.log('Syncing with origin/main...');
          const syncResult = syncWithOriginMain(cwd);

          if (!syncResult.success && syncResult.conflicts.length > 0) {
            // Merge conflicts detected — already aborted by syncWithOriginMain
            const conflictDetail = "Conflicting files:\n" + syncResult.conflicts.map(f => "  - " + f).join("\n") + "\n\nResolve conflicts manually and retry.";
            await tui.showConfirmation(
              'Merge Conflicts Detected',
              `Could not merge origin/main into ${specBranch}.`,
              conflictDetail
            );
            process.stderr.write(`Error: Merge conflicts in ${specBranch}: ${syncResult.conflicts.join(', ')}\n`);
            logTuiError('switch-spec', `Merge conflicts: ${syncResult.conflicts.join(', ')}`, {
              specId,
              specBranch,
              conflicts: syncResult.conflicts,
            }, cwd);
            // Return without completing activation — user must resolve conflicts
            return;
          } else if (!syncResult.success) {
            // Fetch or merge failed without conflicts (e.g., no remote)
            tui.log('Warning: Could not sync with origin/main. Continuing with local state.');
          } else {
            tui.log('Synced with origin/main successfully.');
          }
        }

        // Preserve .planning/ directory creation
        const newPlanningKey = sanitizeBranchForDir(specBranch);

        if (!planningDirExists(newPlanningKey, cwd)) {
          tui.log(`Creating .planning/${newPlanningKey}/`);
          ensurePlanningDir(newPlanningKey, cwd);
          initializeStatus(newPlanningKey, specFile.path, specBranch, cwd);
        }

        // Update TUI state
        const newPrompts = loadAllPrompts(newPlanningKey, cwd);
        tui.updateState({
          spec: specFile.id,
          branch: specBranch,
          prompts: newPrompts.map((p) => ({
            number: p.frontmatter.number,
            title: p.frontmatter.title,
            status: p.frontmatter.status as 'pending' | 'in_progress' | 'done',
            path: p.path,
          })),
        });

        // Sync EventLoop state to prevent stale branch detection
        tui.syncBranchContext(specBranch, specFile);

        tui.log(`Switched to spec: ${specFile.id} on branch: ${specBranch}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        tui.log(`Error: ${message}`);
        logTuiError('switch-spec', e instanceof Error ? e : message, {
          specId: data?.specId,
          spec: currentSpec?.id,
          branch,
        }, cwd);
      }
      break;
    }

    case 'toggle-loop': {
      const enabled = data?.enabled as boolean;
      // Don't persist enabled state - loop always starts disabled
      tui.log(`Loop: ${enabled ? 'Started' : 'Stopped'}`);
      break;
    }

    case 'toggle-parallel': {
      const enabled = data?.enabled as boolean;
      if (planningKey && status) {
        updateStatus({ loop: { ...status.loop, parallel: enabled } }, planningKey, cwd);
      }
      tui.log(`Parallel: ${enabled ? 'Enabled' : 'Disabled'}`);
      break;
    }

    case 'select-prompt': {
      const prompt = data?.prompt as { number: number; title: string } | undefined;
      if (prompt) {
        tui.log(`Selected prompt: ${prompt.number}. ${prompt.title}`);
        // TODO: Could show prompt details or offer to edit
      }
      break;
    }

    case 'refresh': {
      // Reload prompts from filesystem
      if (planningKey && planningDirExists(planningKey, cwd)) {
        const refreshedPrompts = loadAllPrompts(planningKey, cwd);
        tui.updateState({
          prompts: refreshedPrompts.map((p) => ({
            number: p.frontmatter.number,
            title: p.frontmatter.title,
            status: p.frontmatter.status as 'pending' | 'in_progress' | 'done',
            path: p.path,
          })),
        });
        tui.log(`Refreshed: ${refreshedPrompts.length} prompts`);
      } else {
        tui.log('No planning directory for this branch');
      }
      break;
    }

    case 'new-initiative': {
      const specType = data?.specType as string | undefined;
      if (!specType) {
        tui.log('Error: No spec type selected.');
        break;
      }

      tui.log(`New Initiative: ${specType}`);

      // Spawn ideation agent with unified scoping flow and domain-specific config
      try {
        const context = buildTemplateContext(
          planningKey || 'default',
          status?.name,
          undefined,
          undefined,
          cwd
        );

        // Override WORKFLOW_DOMAIN_PATH based on the selected spec type
        context.WORKFLOW_DOMAIN_PATH = join(cwd, '.allhands', 'workflows', `${specType}.md`);

        // Detect active spec for revision mode
        const activeSpec = getSpecForBranch(branch, cwd);
        if (activeSpec && activeSpec.status !== 'completed') {
          const specAbsPath = activeSpec.path.startsWith('/') ? activeSpec.path : join(cwd, activeSpec.path);
          context.SPEC_PATH = specAbsPath;
          context.SPEC_NAME = activeSpec.id;
          tui.log(`Active spec detected: ${activeSpec.id} — ideation will enter revision mode`);
        }

        // All spec types route to the unified scoping flow
        const flowOverride = join(getFlowsDirectory(), UNIFIED_SCOPING_FLOW);

        const result = spawnAgentFromProfile(
          {
            agentName: 'ideation',
            context,
            focusWindow: true,
            flowOverride,
          },
          branch,
          cwd
        );

        tui.log(`Spawned ideation in ${result.sessionName}:${result.windowName}`);
        updateRunningAgents(tui, branch);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        tui.log(`Error spawning ideation: ${message}`);
        logTuiError('new-initiative', e instanceof Error ? e : message, {
          specType,
          branch,
        }, cwd);
      }
      break;
    }

    default:
      tui.log(`Action: ${action}`);
  }
}

function updateRunningAgents(tui: TUI, branch: string): void {
  const agents = getRunningAgents(branch);
  const activeAgents: AgentInfo[] = agents.map((a) => ({
    name: a.windowName,
    agentType: a.agentType || 'unknown',
    isRunning: true,
  }));
  tui.updateState({ activeAgents });
}

function spawnExecutorForPrompt(tui: TUI, prompt: PromptFile, branch: string, specId: string): void {
  const promptNumber = prompt.frontmatter.number;
  const cwd = process.cwd();
  const planningKey = sanitizeBranchForDir(branch);

  tui.log(`Spawning executor for: ${prompt.frontmatter.title}`);

  try {
    // Build context with prompt-specific info (use sanitized planning key for paths)
    const context = buildTemplateContext(
      planningKey,
      specId,  // Use spec file name, not prompt title
      promptNumber,
      prompt.path,
      cwd
    );

    const result = spawnAgentFromProfile(
      {
        agentName: 'executor',
        context,
        promptNumber,
        focusWindow: false, // Don't steal focus from TUI
      },
      branch,
      cwd
    );

    tui.log(`Spawned executor in ${result.sessionName}:${result.windowName}`);
    updateRunningAgents(tui, branch);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    tui.log(`Error spawning executor: ${message}`);
    logTuiError('spawn-executor', e instanceof Error ? e : message, {
      promptNumber,
      promptTitle: prompt.frontmatter.title,
      branch,
    }, cwd);
  }
}

function spawnEmergentPlanningAgent(tui: TUI, branch: string, specId: string): void {
  const cwd = process.cwd();
  const planningKey = sanitizeBranchForDir(branch);

  // Get next available prompt number for emergent planner window name
  const nextPromptNumber = getNextPromptNumber(planningKey, cwd);

  tui.log(`Spawning emergent planner (will create prompts from ${nextPromptNumber})`);

  try {
    const context = buildTemplateContext(
      planningKey,
      specId,
      nextPromptNumber,
      undefined,
      cwd
    );

    const result = spawnAgentFromProfile(
      {
        agentName: 'emergent',
        context,
        promptNumber: nextPromptNumber,
        focusWindow: false, // Don't steal focus from TUI
      },
      branch,
      cwd
    );

    tui.log(`Spawned emergent planner in ${result.sessionName}:${result.windowName}`);
    updateRunningAgents(tui, branch);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    tui.log(`Error spawning emergent planner: ${message}`);
    logTuiError('spawn-emergent', e instanceof Error ? e : message, {
      promptNumber: nextPromptNumber,
      branch,
    }, cwd);
  }
}
