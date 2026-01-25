/**
 * TUI Command - Launch the terminal user interface
 *
 * The TUI provides a dashboard for:
 * - Starting/stopping the execution loop
 * - Spawning agent sessions (ideate, coordinator, planner, etc.)
 * - Monitoring loop progress and agent activity
 * - Managing specs and PR workflows
 *
 * Usage: ah [--spec <spec>]
 */

import { Command } from 'commander';
import { join, basename } from 'path';
import { existsSync, readFileSync, mkdirSync, renameSync } from 'fs';
import { execSync } from 'child_process';
import { TUI } from '../tui/index.js';
import type { TUIState, PRActionState, PromptItem, AgentInfo } from '../tui/index.js';
import {
  readStatus,
  getCurrentBranch,
  updateStatus,
  initializeStatus,
  getActiveSpec,
  setActiveSpec,
  clearActiveSpec,
  updateLastKnownBranch,
  getPlanningPaths,
  ensurePlanningDir,
} from '../lib/planning.js';
import { findSpecForPath, extractSpecNameFromFile } from '../lib/planning-utils.js';
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
import { buildPR } from '../lib/oracle.js';
import type { PromptFile } from '../lib/prompts.js';
import { findSpecById } from '../lib/specs.js';
import { isTldrInstalled, hasSemanticIndex, buildSemanticIndex, needsSemanticRebuild } from '../lib/tldr.js';

/**
 * Launch the TUI - can be called directly or via command
 */
export async function launchTUI(options: { spec?: string } = {}): Promise<void> {
  const cwd = process.cwd();
  const branch = getCurrentBranch();

  // Determine active spec (from option or .active file)
  const activeSpecName = options.spec || getActiveSpec(cwd);

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

  // Load initial state from active spec
  const status = activeSpecName ? readStatus(activeSpecName, cwd) : null;
  const prompts = activeSpecName ? loadAllPrompts(activeSpecName, cwd) : [];

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
    spec: activeSpecName ?? undefined,
    branch,
    prActionState: 'create-pr' as PRActionState,
    compoundRun: status?.compound_run ?? false,
    customFlowCounter: 0,
  };

  // Rename current tmux window to 'hub'
  renameCurrentWindow('hub');

  const tui = new TUI({
    onAction: (action: string, data) => {
      // Pass active spec for spec-based operations
      handleAction(tui, action, activeSpecName, branch, data);
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
  tui.log(`Branch: ${branch}`);
  if (activeSpecName && status) {
    tui.log(`Active spec: ${status.name} (${status.stage})`);
  } else {
    tui.log('No active spec. Use Switch Spec to select one.');
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
  spec: string | null,
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
  if (requiresSpec && !spec) {
    tui.log('Error: No spec initialized. Use Switch Spec first.');
    return true; // Handled, but with error
  }

  // Check tmux availability
  if (!isTmuxInstalled()) {
    tui.log('Error: tmux is required for agent spawning');
    return true;
  }

  // Build template context once for all agents
  const context = buildTemplateContext(
    spec || 'default', // Use spec for paths, fallback for when no spec
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
      tui.log(`Error spawning ${profile.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Track compound_run in status when compound action is triggered
  if (action === 'compound' && spec && status) {
    updateStatus({ compound_run: true }, spec, cwd);
    tui.updateState({ compoundRun: true });
  }

  updateRunningAgents(tui, branch);
  return true;
}

async function handleAction(
  tui: TUI,
  action: string,
  spec: string | null,
  branch: string,
  data?: Record<string, unknown>
): Promise<void> {
  const cwd = process.cwd();
  // Read status from spec, not branch
  const status = spec ? readStatus(spec, cwd) : null;

  // Try to handle as a profile-based agent spawn
  const handledByProfile = await spawnAgentsForAction(tui, action, spec, branch, status, cwd);
  if (handledByProfile) {
    return;
  }

  // Handle non-agent actions
  switch (action) {
    case 'create-pr': {
      if (!spec || !status?.name) {
        tui.log('Error: No spec initialized. Use Switch Spec first.');
        return;
      }

      tui.log('Creating PR via oracle...');

      try {
        // buildPR uses spec for reading prompts/alignment
        const result = await buildPR(spec, cwd);

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
      if (!spec || !status?.name) {
        tui.log('Error: No spec initialized. Use Switch Spec first.');
        return;
      }

      tui.log(`Marking spec as completed: ${status.name}`);

      try {
        // Find the current spec file
        const specFile = findSpecById(status.name, cwd);
        if (!specFile) {
          tui.log(`Error: Spec file not found: ${status.name}`);
          break;
        }

        // Move spec from roadmap to completed
        const completedDir = join(cwd, 'specs', 'completed');
        if (!existsSync(completedDir)) {
          mkdirSync(completedDir, { recursive: true });
        }

        const destPath = join(completedDir, specFile.filename);
        if (existsSync(destPath)) {
          tui.log(`Error: Destination already exists: ${destPath}`);
          break;
        }

        renameSync(specFile.path, destPath);
        tui.log(`Moved spec to: specs/completed/${specFile.filename}`);

        // Clear active spec
        clearActiveSpec(cwd);

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

        tui.log(`Spec completed. Now on branch: ${baseBranch}`);
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
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
            tui.log(`Error resurrecting spec: ${resErr instanceof Error ? resErr.message : String(resErr)}`);
            break;
          }
        }

        const specPath = specFile.path;
        const specName = extractSpecNameFromFile(specPath) || specFile.id;

        // Check if this spec already has a planning directory
        const existingSpec = findSpecForPath(specPath, cwd);

        if (existingSpec) {
          tui.log(`Found existing planning for spec: ${existingSpec}`);
        } else {
          // Create planning directory for this spec
          tui.log(`Creating .planning/${specName}/`);
          const paths = getPlanningPaths(specName, cwd);
          ensurePlanningDir(specName, cwd);

          // Initialize status with null branch (agent flows handle branching)
          const gitRoot = require('path').dirname(specPath).replace(/\/specs\/.*$/, '');
          const relativeSpecPath = specPath.replace(gitRoot + '/', '');
          initializeStatus(specName, relativeSpecPath, null, cwd);
        }

        // Set as active spec
        setActiveSpec(specName, cwd);

        tui.log(`Activated spec: ${specName}`);
        tui.log(`Note: Branch management is handled by agent flows, not the TUI.`);

        // Update TUI state
        const newStatus = readStatus(specName, cwd);
        const newPrompts = loadAllPrompts(specName, cwd);
        tui.updateState({
          spec: specName,
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
      if (spec && status) {
        updateStatus({ loop: { ...status.loop, enabled } }, spec, cwd);
      }
      tui.log(`Loop: ${enabled ? 'Started' : 'Stopped'}`);
      break;
    }

    case 'toggle-emergent': {
      const enabled = data?.enabled as boolean;
      if (spec && status) {
        updateStatus({ loop: { ...status.loop, emergent: enabled } }, spec, cwd);
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
      // Branch changes are informational only in the new model
      // The active spec is independent of the git branch
      const newBranch = data?.branch as string;
      if (!newBranch) break;

      tui.log(`Branch changed to: ${newBranch}`);

      // Optionally update last_known_branch hint if we have an active spec
      const activeSpec = getActiveSpec(cwd);
      if (activeSpec) {
        updateLastKnownBranch(activeSpec, newBranch, cwd);
        tui.log(`Updated last_known_branch for ${activeSpec}`);
      }

      // Update branch in TUI state (but don't reload prompts - they're spec-based)
      tui.updateState({ branch: newBranch });
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
