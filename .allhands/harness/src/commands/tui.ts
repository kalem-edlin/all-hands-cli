/**
 * TUI Command - Launch the terminal user interface
 *
 * The TUI provides a dashboard for:
 * - Starting/stopping the execution loop
 * - Spawning agent sessions (ideate, coordinator, planner, etc.)
 * - Monitoring loop progress and agent activity
 * - Managing milestones and PR workflows
 *
 * Usage: ah [--branch <branch>]
 */

import { Command } from 'commander';
import { join, basename } from 'path';
import { existsSync, readFileSync, mkdirSync, renameSync } from 'fs';
import { execSync } from 'child_process';
import { TUI } from '../tui/index.js';
import type { TUIState, PRActionState, PromptItem, AgentInfo } from '../tui/index.js';
import { readStatus, getCurrentBranch, updateStatus, initializeStatus } from '../lib/planning.js';
import { getBaseBranch } from '../lib/git.js';
import { loadAllPrompts } from '../lib/prompts.js';
import {
  isTmuxInstalled,
  spawnAgentFromProfile,
  buildTemplateContext,
  getRunningAgents,
  renameCurrentWindow,
} from '../lib/tmux.js';
import { getProfilesByTuiAction } from '../lib/opencode/index.js';
import { suggestBranchName, buildPR } from '../lib/oracle.js';
import type { PromptFile } from '../lib/prompts.js';
import { findSpecById } from '../lib/specs.js';
import { isTldrInstalled, hasSemanticIndex, buildSemanticIndex, needsSemanticRebuild } from '../lib/tldr.js';

/**
 * Launch the TUI - can be called directly or via command
 */
export async function launchTUI(options: { branch?: string } = {}): Promise<void> {
  const branch = options.branch || getCurrentBranch();
  const cwd = process.cwd();

  // Build semantic index if missing or stale (branch switch)
  if (isTldrInstalled()) {
    if (!hasSemanticIndex(cwd)) {
      console.log('Building semantic index for first run...');
      buildSemanticIndex(cwd, 'typescript');
    } else if (needsSemanticRebuild(cwd)) {
      console.log('Rebuilding semantic index (branch changed)...');
      buildSemanticIndex(cwd, 'typescript');
    }
  }

  // Load initial state
  const status = readStatus(branch);
  const prompts = loadAllPrompts(branch);

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

  const initialState: Partial<TUIState> = {
    loopEnabled: status?.loop.enabled ?? false,
    emergentEnabled: status?.loop.emergent ?? false,
    prompts: promptItems,
    activeAgents,
    milestone: status?.milestone,
    branch,
    prActionState: 'create-pr' as PRActionState,
    compoundRun: status?.compound_run ?? false,
    customFlowCounter: 0,
  };

  // Rename current tmux window to 'hub'
  renameCurrentWindow('hub');

  const tui = new TUI({
    onAction: (action: string, data) => {
      handleAction(tui, action, branch, data);
    },
    onExit: () => {
      console.log('\nExiting All Hands TUI...');
      process.exit(0);
    },
    onSpawnExecutor: (prompt, executorBranch) => {
      spawnExecutorForPrompt(tui, prompt, executorBranch);
    },
    cwd: process.cwd(),
  });

  // Set initial state
  tui.updateState(initialState);
  tui.log(`Loaded branch: ${branch}`);
  if (status) {
    tui.log(`Milestone: ${status.milestone} (${status.stage})`);
  } else {
    tui.log('No active milestone. Use Switch Milestone to begin.');
  }

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
  branch: string,
  status: ReturnType<typeof readStatus>,
  cwd?: string
): Promise<boolean> {
  const profileMap = getProfilesByTuiAction();
  const profiles = profileMap.get(action);

  if (!profiles || profiles.length === 0) {
    return false; // No profiles for this action
  }

  // Check if any profile requires milestone
  const requiresMilestone = profiles.some((p) => p.tuiRequiresMilestone);
  if (requiresMilestone && !status?.milestone) {
    tui.log('Error: No milestone initialized. Use Switch Milestone first.');
    return true; // Handled, but with error
  }

  // Check tmux availability
  if (!isTmuxInstalled()) {
    tui.log('Error: tmux is required for agent spawning');
    return true;
  }

  // Build template context once for all agents
  const context = buildTemplateContext(
    branch,
    status?.milestone,
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
      tui.log(`Error spawning ${profile.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Track compound_run in status when compound action is triggered
  if (action === 'compound' && status) {
    updateStatus({ compound_run: true }, branch, cwd);
    tui.updateState({ compoundRun: true });
  }

  updateRunningAgents(tui, branch);
  return true;
}

async function handleAction(
  tui: TUI,
  action: string,
  branch: string,
  data?: Record<string, unknown>
): Promise<void> {
  const status = readStatus(branch);
  const cwd = process.cwd();

  // Try to handle as a profile-based agent spawn
  const handledByProfile = await spawnAgentsForAction(tui, action, branch, status, cwd);
  if (handledByProfile) {
    return;
  }

  // Handle non-agent actions
  switch (action) {
    case 'create-pr': {
      if (!status?.milestone) {
        tui.log('Error: No milestone initialized. Use Switch Milestone first.');
        return;
      }

      tui.log('Creating PR via oracle...');

      try {
        const result = await buildPR(branch);

        if (result.success && result.prUrl) {
          tui.log(`PR created: ${result.prUrl}`);
          tui.setPRUrl(result.prUrl);
        } else {
          tui.log(`Error: ${result.body}`);
          tui.log('You may need to push your branch first or check gh auth status.');
        }
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'mark-completed': {
      if (!status?.milestone) {
        tui.log('Error: No milestone initialized. Use Switch Milestone first.');
        return;
      }

      tui.log(`Marking milestone as completed: ${status.milestone}`);

      try {
        // Find the current spec file
        const spec = findSpecById(status.milestone, cwd);
        if (!spec) {
          tui.log(`Error: Spec file not found: ${status.milestone}`);
          break;
        }

        // Move spec from roadmap to completed
        const completedDir = join(cwd, 'specs', 'completed');
        if (!existsSync(completedDir)) {
          mkdirSync(completedDir, { recursive: true });
        }

        const destPath = join(completedDir, spec.filename);
        if (existsSync(destPath)) {
          tui.log(`Error: Destination already exists: ${destPath}`);
          break;
        }

        renameSync(spec.path, destPath);
        tui.log(`Moved spec to: specs/completed/${spec.filename}`);

        // Checkout base branch
        const baseBranch = getBaseBranch();
        tui.log(`Checking out base branch: ${baseBranch}`);
        execSync(`git checkout ${baseBranch}`, { stdio: 'pipe', cwd });

        // Update TUI state
        tui.updateState({
          milestone: undefined,
          branch: baseBranch,
          prompts: [],
        });

        tui.log(`Milestone completed. Now on branch: ${baseBranch}`);
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'switch-milestone': {
      const specId = data?.specId as string | undefined;
      if (!specId || specId.startsWith('header-') || specId === 'info') {
        // Header or info item selected, ignore
        break;
      }

      tui.log(`Switching to milestone: ${specId}`);

      try {
        // Find spec file using specs library
        const cwd = process.cwd();
        let spec = findSpecById(specId, cwd);

        if (!spec) {
          tui.log(`Error: Spec file not found: ${specId}`);
          break;
        }

        // Check if spec is completed - if so, warn and offer to resurrect
        if (spec.status === 'completed') {
          const confirmed = await tui.showConfirmation(
            'Resurrect Completed Milestone?',
            `Milestone "${spec.title}" is marked as completed.\n\n` +
            'Selecting it will move the spec back to the roadmap\n' +
            'and you will need to mark it completed again when done.\n\n' +
            'Both docs and roadmap indexes will be updated.'
          );

          if (!confirmed) {
            tui.log('Milestone selection cancelled');
            break;
          }

          // Resurrect the spec using the ah command (handles reindexing)
          tui.log('Resurrecting milestone to roadmap...');
          try {
            execSync(`ah specs resurrect "${spec.id}"`, { stdio: 'pipe', cwd });
            tui.log('Milestone resurrected and indexes updated ✓');

            // Re-find the spec since its path has changed
            spec = findSpecById(specId, cwd);
            if (!spec) {
              tui.log(`Error: Spec file not found after resurrection: ${specId}`);
              break;
            }
          } catch (resErr) {
            tui.log(`Error resurrecting spec: ${resErr instanceof Error ? resErr.message : String(resErr)}`);
            break;
          }
        }

        const specPath = spec.path;
        const specContent = readFileSync(specPath, 'utf-8');
        const milestoneName = spec.id;

        // Check if we have existing status for this milestone
        // Look for any branch that has this milestone in its status
        let targetBranch: string | null = null;

        // For now, we'll check if there's a .planning/{branch} that matches
        // In a full implementation, we'd scan all branches

        // Suggest branch name via oracle if we need a new branch
        tui.log('Determining branch name...');
        const branchSuggestion = await suggestBranchName(specContent, basename(specPath));
        targetBranch = branchSuggestion.fullName;

        tui.log(`Suggested branch: ${targetBranch} (${branchSuggestion.reasoning})`);

        // Check if branch already exists
        let branchExists = false;
        try {
          execSync(`git rev-parse --verify ${targetBranch}`, {
            stdio: 'pipe',
            cwd,
          });
          branchExists = true;
          tui.log(`Branch ${targetBranch} exists, checking out...`);
        } catch {
          tui.log(`Creating new branch: ${targetBranch}`);
        }

        // Checkout or create branch
        if (branchExists) {
          execSync(`git checkout ${targetBranch}`, { stdio: 'pipe', cwd });
        } else {
          execSync(`git checkout -b ${targetBranch}`, { stdio: 'pipe', cwd });
        }

        // Ensure .planning directory exists for this branch
        const planningDir = join(cwd, '.planning', targetBranch);
        const promptsDir = join(planningDir, 'prompts');

        if (!existsSync(planningDir)) {
          mkdirSync(planningDir, { recursive: true });
          mkdirSync(promptsDir, { recursive: true });
          tui.log(`Created .planning/${targetBranch}/`);
        }

        // Initialize or update status
        initializeStatus(milestoneName, specPath, targetBranch);

        tui.log(`Switched to milestone: ${milestoneName} on branch ${targetBranch}`);

        // Update TUI state
        const newStatus = readStatus(targetBranch);
        const newPrompts = loadAllPrompts(targetBranch);
        tui.updateState({
          milestone: newStatus?.milestone,
          branch: targetBranch,
          prompts: newPrompts.map((p) => ({
            number: p.frontmatter.number,
            title: p.frontmatter.title,
            status: p.frontmatter.status as 'pending' | 'in_progress' | 'done',
          })),
        });
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'toggle-loop': {
      const enabled = data?.enabled as boolean;
      if (status) {
        updateStatus({ loop: { ...status.loop, enabled } }, branch);
      }
      tui.log(`Loop: ${enabled ? 'Started' : 'Stopped'}`);
      break;
    }

    case 'toggle-emergent': {
      const enabled = data?.enabled as boolean;
      if (status) {
        updateStatus({ loop: { ...status.loop, emergent: enabled } }, branch);
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
      // Reload state for the new branch
      const newBranch = data?.branch as string;
      if (!newBranch) break;

      tui.log(`Reloading state for branch: ${newBranch}`);

      try {
        const newStatus = readStatus(newBranch, cwd);
        const newPrompts = loadAllPrompts(newBranch);

        const promptItems: PromptItem[] = newPrompts.map((p) => ({
          number: p.frontmatter.number,
          title: p.frontmatter.title,
          status: p.frontmatter.status as 'pending' | 'in_progress' | 'done',
        }));

        tui.updateState({
          milestone: newStatus?.milestone,
          branch: newBranch,
          prompts: promptItems,
          loopEnabled: newStatus?.loop.enabled ?? false,
          emergentEnabled: newStatus?.loop.emergent ?? false,
          compoundRun: newStatus?.compound_run ?? false,
        });

        if (newStatus?.milestone) {
          tui.log(`Milestone: ${newStatus.milestone} (${newStatus.stage})`);
        } else {
          tui.log('No milestone on this branch.');
        }
      } catch (e) {
        tui.log(`Error reloading state: ${e instanceof Error ? e.message : String(e)}`);
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
    tui.log(`Error spawning executor: ${e instanceof Error ? e.message : String(e)}`);
  }
}
