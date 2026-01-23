/**
 * TUI Command - Launch the terminal user interface
 *
 * The TUI provides a dashboard for:
 * - Starting/stopping the execution loop
 * - Spawning agent sessions (ideate, coordinator, planner, etc.)
 * - Monitoring loop progress and agent activity
 * - Managing milestones and PR workflows
 *
 * Usage: ah tui [--branch <branch>]
 */

import { Command } from 'commander';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { TUI } from '../tui/index.js';
import type { TUIState, PRActionState, PromptItem, AgentInfo } from '../tui/index.js';
import { readStatus, getCurrentBranch, updateStatus, getPlanningPaths, initializeStatus } from '../lib/planning.js';
import { loadAllPrompts } from '../lib/prompts.js';
import {
  isTmuxInstalled,
  spawnAgent,
  getRunningAgents,
  killWindow,
  getSessionName,
  sessionExists,
  attachSession,
  renameCurrentWindow,
} from '../lib/tmux.js';
import { loadAgentProfile, buildAgentInvocation } from '../lib/agents.js';
import { suggestBranchName, generatePRDescription } from '../lib/oracle.js';
import type { PromptFile } from '../lib/prompts.js';
import { findSpecById } from '../lib/specs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function register(program: Command): void {
  program
    .command('tui')
    .description('Launch the terminal user interface')
    .option('--branch <branch>', 'Branch to use (defaults to current)')
    .action(async (options: { branch?: string }) => {
      const branch = options.branch || getCurrentBranch();

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
    });
}

function getFlowsDir(): string {
  return join(__dirname, '..', '..', 'flows');
}

async function handleAction(
  tui: TUI,
  action: string,
  branch: string,
  data?: Record<string, unknown>
): Promise<void> {
  // Check tmux for spawn actions
  const spawnActions = ['ideation', 'coordinator', 'planner', 'review-jury', 'address-pr'];
  if (spawnActions.includes(action) && !isTmuxInstalled()) {
    tui.log('Error: tmux is required for agent spawning');
    return;
  }

  const status = readStatus(branch);
  const flowsDir = getFlowsDir();

  switch (action) {
    case 'ideation': {
      tui.log('Spawning ideation session...');
      try {
        const result = spawnAgent({
          name: 'ideation',
          agentType: 'ideation',
          flowPath: join(flowsDir, 'IDEATION_SESSION.md'),
          preamble: 'Starting ideation session. Explore ideas and draft specs.',
          milestoneName: status?.milestone,
          singleton: true,
        }, branch);
        tui.log(`Spawned ideation in ${result.sessionName}:${result.windowName}`);
        updateRunningAgents(tui, branch);
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'coordinator': {
      tui.log('Spawning coordinator chat...');
      try {
        const result = spawnAgent({
          name: 'coordinator',
          agentType: 'coordinator',
          flowPath: join(flowsDir, 'COORDINATION.md'),
          preamble: 'Starting coordinator session. You can inspect agents and manage the loop.',
          milestoneName: status?.milestone,
          nonCoding: true,
          singleton: true,
        }, branch);
        tui.log(`Spawned coordinator in ${result.sessionName}:${result.windowName}`);
        updateRunningAgents(tui, branch);
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'planner': {
      if (!status?.milestone) {
        tui.log('Error: No milestone initialized. Use Switch Milestone first.');
        return;
      }
      tui.log('Spawning planner...');
      try {
        const result = spawnAgent({
          name: 'planner',
          agentType: 'planner',
          flowPath: join(flowsDir, 'MILESTONE_PLANNING.md'),
          preamble: 'Plan the milestone. Create prompts and set up the alignment doc.',
          milestoneName: status.milestone,
          singleton: true,
        }, branch);
        tui.log(`Spawned planner in ${result.sessionName}:${result.windowName}`);
        updateRunningAgents(tui, branch);
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'review-jury': {
      tui.log('Spawning judge for milestone review...');
      try {
        const result = spawnAgent({
          name: 'judge',
          agentType: 'judge',
          flowPath: join(flowsDir, 'JUDGE_REVIEWING.md'),
          preamble: 'Review the current milestone work. Spawn jury sub-agents as needed.',
          milestoneName: status?.milestone,
          nonCoding: true,
          singleton: true,
        }, branch);
        tui.log(`Spawned judge in ${result.sessionName}:${result.windowName}`);
        updateRunningAgents(tui, branch);
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'create-pr': {
      if (!status?.milestone) {
        tui.log('Error: No milestone initialized. Use Switch Milestone first.');
        return;
      }

      tui.log('Building PR description via oracle...');

      try {
        // Load prompts and alignment doc
        const prompts = loadAllPrompts(branch);
        const promptData = prompts.map((p) => ({
          number: p.frontmatter.number,
          title: p.frontmatter.title,
          status: p.frontmatter.status,
        }));

        // Read alignment doc if it exists
        const paths = getPlanningPaths(branch);
        let alignmentContent = '';
        if (existsSync(paths.alignment)) {
          alignmentContent = readFileSync(paths.alignment, 'utf-8');
        }

        // Generate PR description via oracle
        const prContent = await generatePRDescription(promptData, alignmentContent, status.milestone);

        tui.log(`PR Title: ${prContent.title}`);
        tui.log('Creating PR via gh CLI...');

        // Create PR using gh CLI
        const prBody = `${prContent.body}\n\n---\n🤖 Generated with [All Hands Agentic Harness](https://github.com/kalem-edlin/all-hands)`;

        try {
          const prUrl = execSync(
            `gh pr create --title "${prContent.title.replace(/"/g, '\\"')}" --body "${prBody.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
            { encoding: 'utf-8', cwd: process.cwd() }
          ).trim();

          tui.log(`PR created: ${prUrl}`);
          tui.setPRUrl(prUrl);
        } catch (ghError) {
          tui.log(`Error creating PR: ${ghError instanceof Error ? ghError.message : String(ghError)}`);
          tui.log('You may need to push your branch first or check gh auth status.');
        }
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'address-pr': {
      tui.log('Spawning PR reviewer...');
      try {
        const result = spawnAgent({
          name: 'pr-reviewer',
          agentType: 'pr-reviewer',
          flowPath: join(flowsDir, 'PR_REVIEWING.md'),
          preamble: 'Review and address PR feedback.',
          milestoneName: status?.milestone,
          singleton: true,
        }, branch);
        tui.log(`Spawned pr-reviewer in ${result.sessionName}:${result.windowName}`);
        updateRunningAgents(tui, branch);
      } catch (e) {
        tui.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'compound': {
      tui.log('Spawning documentor for compound phase...');
      try {
        const result = spawnAgent({
          name: 'documentor',
          agentType: 'documentor',
          flowPath: join(flowsDir, 'DOCUMENTATION_TAXONOMY.md'),
          preamble: 'Run compound phase: documentation and post-mortem.',
          milestoneName: status?.milestone,
          singleton: true,
        }, branch);
        tui.log(`Spawned documentor in ${result.sessionName}:${result.windowName}`);
        updateRunningAgents(tui, branch);
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
        const spec = findSpecById(specId, cwd);

        if (!spec) {
          tui.log(`Error: Spec file not found: ${specId}`);
          break;
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
  const flowsDir = getFlowsDir();
  const promptNumber = prompt.frontmatter.number;

  tui.log(`Spawning executor for: ${prompt.frontmatter.title}`);

  const result = spawnAgent(
    {
      name: 'executor', // buildWindowName will create "executor-NN"
      agentType: 'executor',
      flowPath: join(flowsDir, 'EXECUTOR.md'),
      preamble: `Execute prompt ${promptNumber}: ${prompt.frontmatter.title}\n\nPrompt file: ${prompt.path}`,
      promptNumber,
      milestoneName: prompt.frontmatter.title,
      focusWindow: false, // Don't steal focus from TUI
      singleton: false, // Multiple executors can run (one per prompt)
    },
    branch
  );

  tui.log(`Spawned executor in ${result.sessionName}:${result.windowName}`);
  updateRunningAgents(tui, branch);
}
