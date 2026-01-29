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
import { join, basename, dirname } from 'path';
import { existsSync, readFileSync, mkdirSync, renameSync } from 'fs';
import { execSync } from 'child_process';
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
import { getBaseBranch, getLocalBaseBranch } from '../lib/git.js';
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
import { findSpecById, getSpecForBranch, type SpecFile } from '../lib/specs.js';
import { logTuiError, logTuiAction, logTuiLifecycle } from '../lib/trace-store.js';

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
    emergentEnabled: status?.loop.emergent ?? false,
    parallelEnabled: status?.loop?.parallel ?? false,
    prompts: promptItems,
    activeAgents,
    spec: currentSpec?.id,
    branch,
    baseBranch,
    prActionState: initialPRActionState,
    compoundRun: status?.compound_run ?? false,
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
    onSpawnEmergent: (prompt, emergentBranch, specId) => {
      spawnEmergentForPrompt(tui, prompt, emergentBranch, specId);
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
 * Multiple profiles can share the same tui_action (e.g., compound spawns both documentor and compounder).
 */
async function spawnAgentsForAction(
  tui: TUI,
  action: string,
  planningKey: string | null,
  currentSpec: SpecFile | null,
  branch: string,
  status: ReturnType<typeof readStatus>,
  cwd?: string
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
    tui.updateState({ compoundRun: true });
  }

  updateRunningAgents(tui, branch);
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

  // Try to handle as a profile-based agent spawn
  const handledByProfile = await spawnAgentsForAction(tui, action, planningKey, currentSpec, branch, status, cwd);
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

      tui.log('Triggering PR re-review...');

      try {
        // Push any unpushed commits before triggering review
        try {
          const unpushedResult = execSync('git log @{u}..HEAD --oneline 2>/dev/null || echo ""', {
            encoding: 'utf-8',
            cwd: cwd || process.cwd(),
          }).trim();

          if (unpushedResult) {
            tui.log('Pushing local commits to remote...');
            execSync('git push', {
              encoding: 'utf-8',
              cwd: cwd || process.cwd(),
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            tui.log('Commits pushed successfully.');
          }
        } catch {
          // No upstream or other git error - try push anyway
          try {
            execSync('git push', {
              encoding: 'utf-8',
              cwd: cwd || process.cwd(),
              stdio: ['pipe', 'pipe', 'pipe'],
            });
          } catch {
            // Push failed, but continue with review trigger
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

      // Check for uncommitted changes before proceeding
      try {
        const statusOut = execSync('git status --porcelain', { encoding: 'utf-8', cwd }).trim();
        if (statusOut.length > 0) {
          await tui.showConfirmation(
            'Uncommitted Changes',
            'You have uncommitted changes in your working tree. Please commit or discard them before marking the spec as completed.'
          );
          break;
        }
      } catch {
        // git status failed — warn and bail
        tui.log('Error: Could not check git status.');
        break;
      }

      tui.log(`Marking spec as completed: ${currentSpec.id}`);

      try {
        // Push any unpushed commits to the feature branch
        try {
          const unpushedResult = execSync('git log @{u}..HEAD --oneline 2>/dev/null || echo ""', {
            encoding: 'utf-8',
            cwd: cwd || process.cwd(),
          }).trim();

          if (unpushedResult) {
            tui.log('Pushing local commits to remote...');
            execSync('git push', {
              encoding: 'utf-8',
              cwd: cwd || process.cwd(),
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            tui.log('Commits pushed successfully.');
          }
        } catch {
          // No upstream or other git error - try push anyway
          try {
            execSync('git push', {
              encoding: 'utf-8',
              cwd: cwd || process.cwd(),
              stdio: ['pipe', 'pipe', 'pipe'],
            });
          } catch {
            tui.log('Warning: Could not push commits. Continuing with completion...');
          }
        }

        // Move spec from roadmap to completed
        const completedDir = join(cwd, 'specs', 'completed');
        if (!existsSync(completedDir)) {
          mkdirSync(completedDir, { recursive: true });
        }

        const destPath = join(completedDir, currentSpec.filename);
        if (existsSync(destPath)) {
          tui.log(`Error: Destination already exists: ${destPath}`);
          break;
        }

        renameSync(currentSpec.path, destPath);
        tui.log(`Moved spec to: specs/completed/${currentSpec.filename}`);

        // Commit the move
        execSync(`git add "${currentSpec.path}" "${destPath}" && git commit -m "chore: mark spec ${currentSpec.id} as completed"`, { stdio: 'pipe', cwd });

        // Push the completion commit
        try {
          execSync('git push', {
            encoding: 'utf-8',
            cwd: cwd || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch {
          tui.log('Warning: Could not push completion commit.');
        }

        // Checkout local base branch
        const localBase = getLocalBaseBranch();
        const baseBranch = getBaseBranch();
        tui.log(`Checking out local base branch: ${localBase}`);
        execSync(`git checkout ${localBase}`, { stdio: 'pipe', cwd });

        // Update TUI state
        tui.updateState({
          spec: undefined,
          branch: localBase,
          prompts: [],
        });

        // Sync EventLoop state to prevent stale branch detection
        tui.syncBranchContext(localBase, null);

        tui.log(`Spec ${currentSpec.id} completed. You are now ready to merge into ${baseBranch}.`);
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
        // Find spec file using specs library
        let specFile = findSpecById(specId, cwd);

        if (!specFile) {
          tui.log(`Error: Spec file not found: ${specId}`);
          break;
        }

        // Check if spec has a branch assigned
        if (!specFile.branch) {
          tui.log(`Error: Spec "${specId}" has no branch assigned.`);
          tui.log('Use "ah specs persist <spec_path>" to assign a branch.');
          break;
        }

        // Check if spec is completed - if so, warn and offer to resurrect
        if (specFile.status === 'completed') {
          const confirmed = await tui.showConfirmation(
            'Resurrect Completed Spec?',
            `Spec "${specFile.title}" is marked as completed.\n\n` +
            'Selecting it will move the spec back to the roadmap\n' +
            'and you will need to mark it completed again when done.\n\n' +
            'Both docs and roadmap indexes will be updated.'
          );

          if (!confirmed) {
            tui.log('Spec selection cancelled');
            break;
          }

          // Resurrect the spec using the ah command (handles reindexing)
          tui.log('Resurrecting spec to roadmap...');
          try {
            execSync(`ah specs resurrect "${specFile.id}"`, { stdio: 'pipe', cwd });
            tui.log('Spec resurrected and indexes updated ✓');

            // Re-find the spec since its path has changed
            specFile = findSpecById(specId, cwd);
            if (!specFile) {
              tui.log(`Error: Spec file not found after resurrection: ${specId}`);
              break;
            }
          } catch (resErr) {
            const message = resErr instanceof Error ? resErr.message : String(resErr);
            tui.log(`Error resurrecting spec: ${message}`);
            logTuiError('resurrect-spec', resErr instanceof Error ? resErr : message, {
              specId,
              spec: currentSpec?.id,
              branch,
            }, cwd);
            break;
          }
        }

        // Checkout the spec's branch (we already validated it exists above)
        const specBranch = specFile.branch!;
        tui.log(`Checking out branch: ${specBranch}`);

        try {
          execSync(`git checkout ${specBranch}`, { stdio: 'pipe', cwd });
        } catch (gitErr) {
          const message = gitErr instanceof Error ? gitErr.message : String(gitErr);
          tui.log(`Error checking out branch: ${message}`);
          logTuiError('checkout-branch', gitErr instanceof Error ? gitErr : message, {
            specId,
            specBranch,
            branch,
          }, cwd);
          break;
        }

        // Get planning key for the new branch
        const newPlanningKey = sanitizeBranchForDir(specBranch);

        // Ensure planning directory exists
        if (!planningDirExists(newPlanningKey, cwd)) {
          tui.log(`Creating .planning/${newPlanningKey}/`);
          ensurePlanningDir(newPlanningKey, cwd);
          initializeStatus(newPlanningKey, specFile.path, specBranch, cwd);
        }

        // Update TUI state
        const newStatus = readStatus(newPlanningKey, cwd);
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

    case 'toggle-emergent': {
      const enabled = data?.enabled as boolean;
      if (planningKey && status) {
        updateStatus({ loop: { ...status.loop, emergent: enabled } }, planningKey, cwd);
      }
      tui.log(`Emergent: ${enabled ? 'Enabled' : 'Disabled'}`);
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

    case 'branch-changed': {
      // Branch changes update the spec context in the branch-keyed model
      const newBranch = data?.branch as string;
      const newSpec = data?.spec as SpecFile | null | undefined;

      if (!newBranch) break;

      tui.log(`Branch changed to: ${newBranch}`);

      // Update state based on new branch's spec
      const newPlanningKey = sanitizeBranchForDir(newBranch);
      const newStatus = planningDirExists(newPlanningKey, cwd) ? readStatus(newPlanningKey, cwd) : null;
      const newPrompts = newStatus ? loadAllPrompts(newPlanningKey, cwd) : [];

      tui.updateState({
        branch: newBranch,
        spec: newSpec?.id,
        prompts: newPrompts.map((p) => ({
          number: p.frontmatter.number,
          title: p.frontmatter.title,
          status: p.frontmatter.status as 'pending' | 'in_progress' | 'done',
          path: p.path,
        })),
      });

      if (newSpec) {
        tui.log(`Spec: ${newSpec.id}`);
      } else {
        tui.log('No spec for this branch');
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

    case 'clear-spec': {
      // Check for uncommitted changes before proceeding
      try {
        const statusOut = execSync('git status --porcelain', { encoding: 'utf-8', cwd }).trim();
        if (statusOut.length > 0) {
          await tui.showConfirmation(
            'Uncommitted Changes',
            'You have uncommitted changes in your working tree. Please commit or discard them before clearing the spec.'
          );
          break;
        }
      } catch {
        tui.log('Error: Could not check git status.');
        break;
      }

      const localBase = getLocalBaseBranch();
      tui.log(`Checking out local base branch: ${localBase}`);

      try {
        execSync(`git checkout ${localBase}`, { stdio: 'pipe', cwd });

        tui.updateState({
          spec: undefined,
          branch: localBase,
          prompts: [],
        });

        // Sync EventLoop state to prevent stale branch detection
        tui.syncBranchContext(localBase, null);

        tui.log(`Now on branch: ${localBase} (no spec)`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        tui.log(`Error: ${message}`);
        logTuiError('clear-spec', e instanceof Error ? e : message, {
          spec: currentSpec?.id,
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

function spawnEmergentForPrompt(tui: TUI, prompt: PromptFile, branch: string, specId: string): void {
  const cwd = process.cwd();
  const planningKey = sanitizeBranchForDir(branch);

  // Get next available prompt number for the emergent agent to create
  const nextPromptNumber = getNextPromptNumber(planningKey, cwd);

  tui.log(`Spawning emergent (will create prompt ${nextPromptNumber}) after: ${prompt.frontmatter.title}`);

  try {
    // Build context with the NEXT prompt number (emergent will create this prompt)
    const context = buildTemplateContext(
      planningKey,
      specId,
      nextPromptNumber,
      undefined,  // No prompt path yet - emergent will create it
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

    tui.log(`Spawned emergent in ${result.sessionName}:${result.windowName}`);
    updateRunningAgents(tui, branch);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    tui.log(`Error spawning emergent: ${message}`);
    logTuiError('spawn-emergent', e instanceof Error ? e : message, {
      promptNumber: nextPromptNumber,
      promptTitle: `emergent-${nextPromptNumber}`,
      branch,
    }, cwd);
  }
}
