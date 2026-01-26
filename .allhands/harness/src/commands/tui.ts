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
  initializeStatus,
  getPlanningPaths,
  ensurePlanningDir,
  sanitizeBranchForDir,
  planningDirExists,
} from '../lib/planning.js';
import { findSpecForPath, extractSpecNameFromFile } from '../lib/planning-utils.js';
import { getBaseBranch } from '../lib/git.js';
import { loadAllPrompts } from '../lib/prompts.js';
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
  }));

  // Get active agents from tmux
  const runningAgents = getRunningAgents(branch);
  const activeAgents: AgentInfo[] = runningAgents.map((a) => ({
    name: a.windowName,
    agentType: a.agentType || 'unknown',
    isRunning: true,
  }));

  const baseBranch = getBaseBranch();

  const initialState: Partial<TUIState> = {
    loopEnabled: false, // Always start disabled, regardless of saved status
    emergentEnabled: status?.loop.emergent ?? false,
    prompts: promptItems,
    activeAgents,
    spec: currentSpec?.id,
    branch,
    baseBranch,
    prActionState: 'create-pr' as PRActionState,
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
    onSpawnExecutor: (prompt, executorBranch) => {
      spawnExecutorForPrompt(tui, prompt, executorBranch);
    },
    onSpawnEmergent: (prompt, emergentBranch) => {
      spawnEmergentForPrompt(tui, prompt, emergentBranch);
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

      tui.log('Creating PR via oracle...');

      try {
        // buildPR uses planning key for reading prompts/alignment
        const result = await buildPR(planningKey, cwd);

        if (result.success && result.prUrl) {
          tui.log(`PR created: ${result.prUrl}`);
          tui.setPRUrl(result.prUrl);
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

    case 'mark-completed': {
      if (!currentSpec) {
        tui.log('Error: No spec for this branch. Checkout a spec branch first.');
        return;
      }

      tui.log(`Marking spec as completed: ${currentSpec.id}`);

      try {
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

        // Checkout base branch
        const baseBranch = getBaseBranch();
        tui.log(`Checking out base branch: ${baseBranch}`);
        execSync(`git checkout ${baseBranch}`, { stdio: 'pipe', cwd });

        // Update TUI state
        tui.updateState({
          spec: undefined,
          branch: baseBranch,
          prompts: [],
        });

        // Sync EventLoop state to prevent stale branch detection
        tui.syncBranchContext(baseBranch, null);

        tui.log(`Spec completed. Now on branch: ${baseBranch}`);
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
          })),
        });
        tui.log(`Refreshed: ${refreshedPrompts.length} prompts`);
      } else {
        tui.log('No planning directory for this branch');
      }
      break;
    }

    case 'clear-spec': {
      const baseBranch = getBaseBranch();
      tui.log(`Checking out base branch: ${baseBranch}`);

      try {
        execSync(`git checkout ${baseBranch}`, { stdio: 'pipe', cwd });
        tui.updateState({
          spec: undefined,
          branch: baseBranch,
          prompts: [],
        });

        // Sync EventLoop state to prevent stale branch detection
        tui.syncBranchContext(baseBranch, null);

        tui.log(`Now on branch: ${baseBranch} (no spec)`);
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

function spawnExecutorForPrompt(tui: TUI, prompt: PromptFile, branch: string): void {
  const promptNumber = prompt.frontmatter.number;
  const cwd = process.cwd();

  tui.log(`Spawning executor for: ${prompt.frontmatter.title}`);

  try {
    // Build context with prompt-specific info
    const context = buildTemplateContext(
      branch,
      prompt.frontmatter.title,
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

function spawnEmergentForPrompt(tui: TUI, prompt: PromptFile, branch: string): void {
  const promptNumber = prompt.frontmatter.number;
  const cwd = process.cwd();

  tui.log(`Spawning emergent for: ${prompt.frontmatter.title}`);

  try {
    // Build context with prompt-specific info
    const context = buildTemplateContext(
      branch,
      prompt.frontmatter.title,
      promptNumber,
      prompt.path,
      cwd
    );

    const result = spawnAgentFromProfile(
      {
        agentName: 'emergent',
        context,
        promptNumber,
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
      promptNumber,
      promptTitle: prompt.frontmatter.title,
      branch,
    }, cwd);
  }
}
