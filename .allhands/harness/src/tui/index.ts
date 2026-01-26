/**
 * TUI - Terminal User Interface for All Hands
 *
 * Three-pane layout:
 * - Actions Pane (left): Agent spawners, toggles, quit/refresh
 * - Prompt List Pane (center): Prompts by status
 * - Status Pane (right): Active agents grid
 *
 * Navigation:
 * - Tab/Shift-Tab: Cycle panes
 * - j/k: Navigate within pane
 * - u/d: Page up/down
 * - Space: Toggle/select
 * - Esc: Close modals
 */

import blessed from 'blessed';
import { createActionsPane, ActionItem, ToggleState } from './actions.js';
import { createPromptsPane, PromptItem } from './prompts-pane.js';
import { createStatusPane, AgentInfo, FileStates, StatusPaneOptions } from './status-pane.js';
import { createModal, Modal } from './modal.js';
import { createFileViewer, FileViewer, getPlanningFilePath, getSpecFilePath } from './file-viewer-modal.js';
import { EventLoop } from '../lib/event-loop.js';
import { killWindow, listWindows, getCurrentSession, spawnCustomFlow, getSpawnedAgentRegistry } from '../lib/tmux.js';
import { getHubWindowId, clearTuiSession, getSpawnedWindows } from '../lib/session.js';
import { KnowledgeService } from '../lib/knowledge.js';
import { validateDocs } from '../lib/docs-validation.js';
import { loadAllProfiles } from '../lib/opencode/index.js';
import { logTuiError, clearLogs } from '../lib/trace-store.js';
import { loadAllPrompts, type PromptFile } from '../lib/prompts.js';
import { readStatus, sanitizeBranchForDir, planningDirExists } from '../lib/planning.js';
import { loadAllSpecs, specsToModalItems, type SpecFile } from '../lib/specs.js';
import { loadAllFlows, flowsToModalItems } from '../lib/flows.js';
import { isTldrInstalled, hasSemanticIndex, needsSemanticRebuild, buildSemanticIndexAsync } from '../lib/tldr.js';
import { loadProjectSettings } from '../hooks/shared.js';
import { join } from 'path';

export type PaneId = 'actions' | 'prompts' | 'status';

export type PRActionState = 'create-pr' | 'greptile-reviewing' | 'address-pr';

export interface TUIOptions {
  onAction: (action: string, data?: Record<string, unknown>) => void;
  onExit: () => void;
  onSpawnExecutor?: (prompt: PromptFile, branch: string, specId: string) => void;
  onSpawnEmergent?: (prompt: PromptFile, branch: string, specId: string) => void;
  cwd?: string;
}

export interface TUIState {
  loopEnabled: boolean;
  emergentEnabled: boolean;
  parallelEnabled: boolean;
  prompts: PromptItem[];
  activeAgents: AgentInfo[];
  spec?: string;
  branch?: string;
  baseBranch?: string;
  prActionState: PRActionState;
  compoundRun: boolean;
  customFlowCounter: number;
}

export class TUI {
  private screen: blessed.Widgets.Screen;
  private header: blessed.Widgets.BoxElement;
  private actionsPane: blessed.Widgets.BoxElement;
  private promptsPane: blessed.Widgets.BoxElement;
  private statusPane: blessed.Widgets.BoxElement;

  private state: TUIState;
  private options: TUIOptions;

  // Navigation state
  private focusedPane: PaneId = 'actions';
  private paneOrder: PaneId[] = ['actions', 'prompts', 'status'];
  private selectedIndex: Record<PaneId, number> = {
    actions: 0,
    prompts: 0,
    status: 0,
  };

  // Modals
  private activeModal: Modal | null = null;
  private activeFileViewer: FileViewer | null = null;
  private logEntries: string[] = [];

  // Action items (for selection tracking)
  private actionItems: ActionItem[] = [];

  // Event loop daemon
  private eventLoop: EventLoop | null = null;

  // Original output functions for restoration on destroy
  private originalStdoutWrite: typeof process.stdout.write | null = null;
  private originalStderrWrite: typeof process.stderr.write | null = null;
  private originalConsoleLog: typeof console.log | null = null;
  private originalConsoleError: typeof console.error | null = null;

  constructor(options: TUIOptions) {
    this.options = options;
    this.state = {
      loopEnabled: false,
      emergentEnabled: false,
      parallelEnabled: false,
      prompts: [],
      activeAgents: [],
      prActionState: 'create-pr',
      compoundRun: false,
      customFlowCounter: 0,
    };

    // Suppress terminal capability errors (e.g., xterm-ghostty.Setulc) during screen creation
    // These errors come from blessed parsing terminfo and can go to stdout/stderr/console
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const originalConsoleLog = console.log.bind(console);
    const originalConsoleError = console.error.bind(console);

    const isTerminfoNoise = (str: string): boolean => {
      return (
        str.includes('Setulc') ||
        str.includes('Error on xterm') ||
        str.includes('stack.push') ||
        str.includes('out.push') ||
        str.includes('stack.pop') ||
        str.includes('stack = []') ||
        str.includes('var v,') ||
        str.includes('return out.join') ||
        /^"\s*\\u001b\[/.test(str) ||
        /^\s*out = \[/.test(str)
      );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      if (isTerminfoNoise(str)) return true;
      return originalStdoutWrite(chunk, ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      if (isTerminfoNoise(str)) return true;
      return originalStderrWrite(chunk, ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log = (...args: any[]): void => {
      const str = args.map(a => String(a)).join(' ');
      if (isTerminfoNoise(str)) return;
      originalConsoleLog(...args);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error = (...args: any[]): void => {
      const str = args.map(a => String(a)).join(' ');
      if (isTerminfoNoise(str)) return;
      originalConsoleError(...args);
    };

    // Create screen with terminal compatibility options
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'All Hands - Agentic Harness',
      fullUnicode: true,
      warnings: false, // Suppress terminal capability warnings
    });

    // Store originals for restore on destroy
    this.originalStdoutWrite = originalStdoutWrite;
    this.originalStderrWrite = originalStderrWrite;
    this.originalConsoleLog = originalConsoleLog;
    this.originalConsoleError = originalConsoleError;

    // Create header
    this.header = this.createHeader();

    // Create panes
    this.actionsPane = createActionsPane(this.screen, this.getToggleState());
    this.promptsPane = createPromptsPane(this.screen, this.state.prompts);
    this.statusPane = createStatusPane(
      this.screen,
      this.state.activeAgents,
      undefined,
      this.state.spec,
      this.state.branch,
      this.state.baseBranch,
      this.logEntries,
      undefined, // fileStates - will be set on render
      undefined  // options - will be set on render
    );

    // Build action items list for navigation
    this.buildActionItems();

    // Setup navigation
    this.setupKeyBindings();

    // Initialize event loop daemon
    if (options.cwd) {
      this.eventLoop = new EventLoop(options.cwd, {
        onGreptileFeedback: (available) => {
          if (available && this.state.prActionState === 'greptile-reviewing') {
            this.state.prActionState = 'address-pr';
            this.buildActionItems();
            this.log('Greptile feedback available - ready to address PR review');
            this.render();
          }
        },
        onBranchChange: (newBranch, newSpec) => {
          this.log(`Branch changed to: ${newBranch}`);
          this.state.branch = newBranch;

          // Update spec context when branch changes (branch-keyed model)
          const newSpecId = newSpec?.id;
          if (newSpecId !== this.state.spec) {
            this.state.spec = newSpecId;

            // Reload prompts for new branch's planning directory
            if (this.options.cwd) {
              const planningKey = sanitizeBranchForDir(newBranch);
              if (planningDirExists(planningKey, this.options.cwd)) {
                const prompts = loadAllPrompts(planningKey, this.options.cwd);
                const status = readStatus(planningKey, this.options.cwd);

                this.state.prompts = prompts.map((p: { path: string; frontmatter: { number: number; title: string; status: string } }) => ({
                  number: p.frontmatter.number,
                  title: p.frontmatter.title,
                  status: p.frontmatter.status as 'pending' | 'in_progress' | 'done',
                  path: p.path,
                }));
                // Don't restore loopEnabled from status - always requires manual enable
                this.state.emergentEnabled = status?.loop?.emergent ?? false;
                this.state.parallelEnabled = status?.loop?.parallel ?? false;
                this.state.compoundRun = status?.compound_run ?? false;
              } else {
                this.state.prompts = [];
                this.state.loopEnabled = false;
                this.state.emergentEnabled = false;
                this.state.parallelEnabled = false;
                this.state.compoundRun = false;
              }

              // Sync toggle states to event loop
              this.eventLoop?.setEmergentEnabled(this.state.emergentEnabled);
              this.eventLoop?.setParallelEnabled(this.state.parallelEnabled);
            }

            this.buildActionItems();
          }

          this.options.onAction('branch-changed', { branch: newBranch, spec: newSpec });
          this.render();
        },
        onAgentsChange: (agents) => {
          this.state.activeAgents = agents.map((name) => ({
            name,
            agentType: name,
            isRunning: true,
          }));
          this.render();
        },
        onSpawnExecutor: (prompt) => {
          this.log(`Loop: Spawning executor for prompt ${prompt.frontmatter.number}`);
          if (this.state.branch && this.state.spec && this.options.onSpawnExecutor) {
            this.options.onSpawnExecutor(prompt, this.state.branch, this.state.spec);
          }
        },
        onSpawnEmergent: (prompt) => {
          this.log(`Loop: Spawning emergent for prompt ${prompt.frontmatter.number}`);
          if (this.state.branch && this.state.spec && this.options.onSpawnEmergent) {
            this.options.onSpawnEmergent(prompt, this.state.branch, this.state.spec);
          }
        },
        onLoopStatus: (message) => {
          this.log(`Loop: ${message}`);
        },
        onPromptsChange: (prompts, snapshot) => {
          // Update TUI state when prompts are added, removed, or status changes
          const prevCount = this.state.prompts.length;
          this.state.prompts = prompts.map((p) => ({
            number: p.frontmatter.number,
            title: p.frontmatter.title,
            status: p.frontmatter.status as 'pending' | 'in_progress' | 'done',
            path: p.path,
          }));

          // Log meaningful changes
          if (snapshot.count !== prevCount) {
            this.log(`Prompts: ${snapshot.count} (${snapshot.pending} pending, ${snapshot.inProgress} in progress, ${snapshot.done} done)`);
          }

          this.buildActionItems();
          this.render();
        },
      });
      this.eventLoop.start();

      // Start background indexing (non-blocking)
      this.startBackgroundIndexing();
    }

    // Initial render
    this.render();
  }

  /**
   * Start background indexing of knowledge bases and validation.
   * Non-blocking - progress is logged to status pane.
   */
  private async startBackgroundIndexing(): Promise<void> {
    if (!this.options.cwd) return;

    this.log('Starting background index...');
    this.render();

    try {
      // Build TLDR semantic index if missing or stale (non-blocking with progress)
      if (isTldrInstalled()) {
        const needsIndex = !hasSemanticIndex(this.options.cwd);
        const needsRebuild = needsSemanticRebuild(this.options.cwd);

        if (needsIndex || needsRebuild) {
          this.log(needsIndex ? 'Building semantic index for first run...' : 'Rebuilding semantic index (branch changed)...');
          this.render();
          const result = await buildSemanticIndexAsync(this.options.cwd, (msg) => {
            this.log(msg);
            this.render();
          });
          if (result.success) {
            const langInfo = result.languages.length > 0 ? ` (${result.languages.join(', ')})` : '';
            const countInfo = result.filesIndexed > 0 ? `${result.filesIndexed} files` : '';
            this.log(`Semantic index ready${countInfo ? `: ${countInfo}` : ''}${langInfo} ✓`);
          } else {
            this.log('Semantic index failed');
          }
          this.render();
        }

        // Also index .allhands directory if enabled in settings (for harness development)
        const settings = loadProjectSettings();
        if (settings?.tldr?.enableForHarness) {
          const allhandsDir = join(this.options.cwd, '.allhands');
          const needsHarnessIndex = !hasSemanticIndex(allhandsDir);
          const needsHarnessRebuild = needsSemanticRebuild(allhandsDir);

          if (needsHarnessIndex || needsHarnessRebuild) {
            this.log('Building semantic index for .allhands...');
            this.render();
            const harnessResult = await buildSemanticIndexAsync(allhandsDir, (msg) => {
              this.log(msg);
              this.render();
            });
            if (harnessResult.success) {
              const langInfo = harnessResult.languages.length > 0 ? ` (${harnessResult.languages.join(', ')})` : '';
              const countInfo = harnessResult.filesIndexed > 0 ? `${harnessResult.filesIndexed} files` : '';
              this.log(`Harness index ready${countInfo ? `: ${countInfo}` : ''}${langInfo} ✓`);
            } else {
              this.log('Harness index failed');
            }
            this.render();
          }
        }
      }

      // Validate agent profiles first
      this.log('Validating agent profiles...');
      this.render();
      const { profiles, errors: profileErrors } = loadAllProfiles();
      if (profileErrors.length > 0) {
        for (const err of profileErrors) {
          for (const e of err.errors) {
            this.log(`⚠ Agent ${err.name}: ${e}`);
          }
          for (const w of err.warnings) {
            this.log(`⚠ Agent ${err.name}: ${w}`);
          }
        }
      } else {
        this.log(`${profiles.length} agent profiles valid ✓`);
      }
      this.render();

      const service = new KnowledgeService(this.options.cwd, { quiet: true });

      // Smart incremental indexing: check if indexes exist before deciding strategy
      const roadmapExists = service.indexExists('roadmap');
      const docsExists = service.indexExists('docs');

      if (!roadmapExists || !docsExists) {
        // Cold start: full index required
        if (!roadmapExists) {
          this.log('Building roadmap index (first run)...');
          this.render();
          await service.reindexAll('roadmap');
        }
        if (!docsExists) {
          this.log('Building docs index (first run)...');
          this.render();
          await service.reindexAll('docs');
        }
      } else {
        // Warm start: incremental update from git changes
        const roadmapChanges = service.getChangesFromGit('roadmap');
        const docsChanges = service.getChangesFromGit('docs');

        if (roadmapChanges.length > 0) {
          this.log(`Updating roadmap index (${roadmapChanges.length} changes)...`);
          this.render();
          await service.reindexFromChanges('roadmap', roadmapChanges);
        } else {
          this.log('Roadmap index up to date ✓');
        }

        if (docsChanges.length > 0) {
          this.log(`Updating docs index (${docsChanges.length} changes)...`);
          this.render();
          await service.reindexFromChanges('docs', docsChanges);
        } else {
          this.log('Docs index up to date ✓');
        }
      }

      // Run docs validation
      this.log('Validating documentation...');
      this.render();
      const docsPath = join(this.options.cwd, 'docs');
      const validation = validateDocs(docsPath, this.options.cwd);

      if (validation.frontmatter_error_count > 0) {
        this.log(`⚠ ${validation.frontmatter_error_count} frontmatter errors`);
      }
      if (validation.stale_count > 0) {
        this.log(`⚠ ${validation.stale_count} stale references`);
      }
      if (validation.invalid_count > 0) {
        this.log(`⚠ ${validation.invalid_count} invalid references`);
      }

      this.log('Index ready ✓');
      this.render();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(`Index error: ${message}`);
      logTuiError('backgroundIndexing', err instanceof Error ? err : message, {
        spec: this.state.spec,
        branch: this.state.branch,
      }, this.options.cwd);
      this.render();
    }
  }

  private createHeader(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold}{#a78bfa-fg}ALL HANDS{/#a78bfa-fg} {#e0e7ff-fg}AGENTIC HARNESS{/#e0e7ff-fg}{/bold}{/center}',
      tags: true,
      style: {
        fg: '#e0e7ff',
        border: {
          fg: '#4A34C5',
        },
      },
      border: {
        type: 'line',
      },
    });
  }

  private getToggleState(): ToggleState {
    // Check if any prompts are completed
    const hasCompletedPrompts = this.state.prompts.some(p => p.status === 'done');

    return {
      loopEnabled: this.state.loopEnabled,
      emergentEnabled: this.state.emergentEnabled,
      parallelEnabled: this.state.parallelEnabled,
      prActionState: this.state.prActionState,
      hasSpec: !!this.state.spec,
      hasCompletedPrompts,
      compoundRun: this.state.compoundRun,
    };
  }

  private buildActionItems(): void {
    const hasSpec = !!this.state.spec;
    const hasCompletedPrompts = this.state.prompts.some(p => p.status === 'done');
    const prDisabled = this.state.prActionState === 'greptile-reviewing';

    // Dynamic label for switch/choose spec
    const specLabel = hasSpec ? 'Switch Spec' : 'Choose Spec';

    this.actionItems = [
      // Agent spawners - coordinator and ideation always available
      { id: 'coordinator', label: 'Coordinator', key: '1', type: 'action' },
      { id: 'ideation', label: 'Ideation', key: '2', type: 'action' },
      // Planner requires spec
      { id: 'planner', label: 'Planner', key: '3', type: 'action', disabled: !hasSpec },
      // These require at least 1 completed prompt
      { id: 'e2e-test-planner', label: 'Build E2E Test', key: '4', type: 'action', hidden: !hasCompletedPrompts },
      { id: 'review-jury', label: 'Review Jury', key: '5', type: 'action', hidden: !hasCompletedPrompts },
      { id: 'pr-action', label: this.getPRActionLabel(), key: '6', type: 'action', disabled: prDisabled, hidden: !hasCompletedPrompts },
      { id: 'compound', label: 'Compound', key: '7', type: 'action', hidden: !hasCompletedPrompts },
      // Mark completed - only visible if compound has been run
      { id: 'mark-completed', label: 'Mark Completed', key: '8', type: 'action', hidden: !this.state.compoundRun },
      // Switch/Choose spec - always visible, label changes
      { id: 'switch-spec', label: specLabel, key: '9', type: 'action' },
      // Custom Flow - always visible, allows running any flow with custom message
      { id: 'custom-flow', label: 'Custom Flow', key: '0', type: 'action' },
      { id: 'separator-toggles', label: '─ Toggles ─', type: 'separator' },
      { id: 'toggle-loop', label: 'Loop', key: 'O', type: 'toggle', checked: this.state.loopEnabled },
      { id: 'toggle-emergent', label: 'Emergent', key: 'E', type: 'toggle', checked: this.state.emergentEnabled },
      { id: 'toggle-parallel', label: 'Parallel', key: 'P', type: 'toggle', checked: this.state.parallelEnabled },
      { id: 'separator-controls', label: '─ Controls ─', type: 'separator' },
      { id: 'view-logs', label: 'View Logs', key: 'V', type: 'action' },
      { id: 'clear-logs', label: 'Clear Logs', key: 'C', type: 'action' },
      { id: 'refresh', label: 'Refresh', key: 'R', type: 'action' },
      { id: 'quit', label: 'Quit', key: 'Q', type: 'action' },
    ];
  }

  private getPRActionLabel(): string {
    switch (this.state.prActionState) {
      case 'create-pr': return 'Create PR';
      case 'greptile-reviewing': return 'Greptile Reviewing';
      case 'address-pr': return 'Address PR Review';
    }
  }

  private getSelectableActionItems(): ActionItem[] {
    return this.actionItems.filter(item =>
      item.type !== 'separator' && !item.disabled && !item.hidden
    );
  }

  private setupKeyBindings(): void {
    // Quit on Ctrl-C
    this.screen.key(['C-c'], () => {
      this.handleAction('quit');
    });

    // Tab/Shift-Tab for pane cycling
    this.screen.key(['tab'], () => {
      this.cyclePane(1);
    });
    this.screen.key(['S-tab'], () => {
      this.cyclePane(-1);
    });

    // Vim navigation within panes
    this.screen.key(['j'], () => {
      if (!this.activeModal) {
        this.navigatePane(1);
      }
    });
    this.screen.key(['k'], () => {
      if (!this.activeModal) {
        this.navigatePane(-1);
      }
    });
    this.screen.key(['u'], () => {
      if (!this.activeModal) {
        this.navigatePane(-10); // Page up
      }
    });
    this.screen.key(['d'], () => {
      if (!this.activeModal) {
        this.navigatePane(10); // Page down
      }
    });

    // Space to select/toggle
    this.screen.key(['space'], () => {
      if (!this.activeModal) {
        this.selectCurrentItem();
      }
    });

    // Enter to activate
    this.screen.key(['enter'], () => {
      if (!this.activeModal) {
        this.selectCurrentItem();
      }
    });

    // Escape to close modals
    this.screen.key(['escape'], () => {
      if (this.activeFileViewer) {
        this.closeFileViewer();
      } else if (this.activeModal) {
        this.closeModal();
      }
    });

    // Number hotkeys for actions (work globally, not just in actions pane)
    const hotkeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    hotkeys.forEach((key, index) => {
      this.screen.key([key], () => {
        if (!this.activeModal && !this.activeFileViewer) {
          const selectableItems = this.getSelectableActionItems();
          const actionItems = selectableItems.filter(i => i.type === 'action');
          if (index < actionItems.length) {
            this.handleAction(actionItems[index].id);
          }
        }
      });
    });

    // Toggle hotkeys (O for lOop, E for Emergent, P for Parallel)
    this.screen.key(['o'], () => {
      if (!this.activeModal) {
        this.handleAction('toggle-loop');
      }
    });
    this.screen.key(['e'], () => {
      if (!this.activeModal) {
        this.handleAction('toggle-emergent');
      }
    });
    this.screen.key(['p'], () => {
      if (!this.activeModal) {
        this.handleAction('toggle-parallel');
      }
    });

    // Q for quit, R for refresh, L for view logs, C for clear logs
    this.screen.key(['q'], () => {
      if (!this.activeModal) {
        this.handleAction('quit');
      }
    });
    this.screen.key(['r'], () => {
      if (!this.activeModal) {
        this.handleAction('refresh');
      }
    });
    this.screen.key(['v'], () => {
      if (!this.activeModal) {
        this.handleAction('view-logs');
      }
    });
    this.screen.key(['c'], () => {
      if (!this.activeModal) {
        this.handleAction('clear-logs');
      }
    });

  }

  private cyclePane(direction: number): void {
    const currentIndex = this.paneOrder.indexOf(this.focusedPane);
    const newIndex = (currentIndex + direction + this.paneOrder.length) % this.paneOrder.length;
    this.focusedPane = this.paneOrder[newIndex];
    this.render();
  }

  private navigatePane(delta: number): void {
    const maxIndex = this.getMaxIndexForPane(this.focusedPane);
    if (maxIndex < 0) return;

    const currentIndex = this.selectedIndex[this.focusedPane];
    let newIndex = currentIndex + delta;

    // Clamp to valid range
    newIndex = Math.max(0, Math.min(maxIndex, newIndex));
    this.selectedIndex[this.focusedPane] = newIndex;

    this.render();
  }

  private getMaxIndexForPane(pane: PaneId): number {
    switch (pane) {
      case 'actions':
        return this.getSelectableActionItems().length - 1;
      case 'prompts':
        return Math.max(0, this.state.prompts.length - 1);
      case 'status':
        return Math.max(0, this.state.activeAgents.length - 1);
    }
  }

  private selectCurrentItem(): void {
    if (this.focusedPane === 'actions') {
      const selectableItems = this.getSelectableActionItems();
      const item = selectableItems[this.selectedIndex.actions];
      if (item) {
        this.handleAction(item.id);
      }
    } else if (this.focusedPane === 'prompts') {
      const sortedPrompts = this.getSortedPrompts();
      const prompt = sortedPrompts[this.selectedIndex.prompts];
      if (prompt && prompt.path) {
        // Open the prompt file in the file viewer
        const title = `Prompt ${String(prompt.number).padStart(2, '0')}: ${prompt.title}`;
        this.openFileViewer(title, prompt.path);
      }
    }
    // Status pane selection - could show agent details
  }

  /**
   * Get prompts sorted the same way they appear in the prompts pane.
   * Order: in_progress first, then pending, then done (each sorted by number).
   */
  private getSortedPrompts(): PromptItem[] {
    const inProgress = this.state.prompts
      .filter((p) => p.status === 'in_progress')
      .sort((a, b) => a.number - b.number);

    const pending = this.state.prompts
      .filter((p) => p.status === 'pending')
      .sort((a, b) => a.number - b.number);

    const done = this.state.prompts
      .filter((p) => p.status === 'done')
      .sort((a, b) => a.number - b.number);

    return [...inProgress, ...pending, ...done];
  }

  private handleAction(actionId: string): void {
    switch (actionId) {
      case 'quit':
        this.destroy();  // Kill spawned agents and cleanup first
        this.options.onExit();
        break;
      case 'refresh':
        this.render();
        break;
      case 'toggle-loop':
        this.state.loopEnabled = !this.state.loopEnabled;
        this.buildActionItems();
        if (this.eventLoop) {
          this.eventLoop.setLoopEnabled(this.state.loopEnabled);
        }
        this.options.onAction('toggle-loop', { enabled: this.state.loopEnabled });
        this.render();
        break;
      case 'toggle-emergent':
        this.state.emergentEnabled = !this.state.emergentEnabled;
        this.buildActionItems();
        if (this.eventLoop) {
          this.eventLoop.setEmergentEnabled(this.state.emergentEnabled);
        }
        this.options.onAction('toggle-emergent', { enabled: this.state.emergentEnabled });
        this.render();
        break;
      case 'toggle-parallel':
        this.state.parallelEnabled = !this.state.parallelEnabled;
        this.buildActionItems();
        if (this.eventLoop) {
          this.eventLoop.setParallelEnabled(this.state.parallelEnabled);
          // Force tick when enabling to spawn immediately
          if (this.state.parallelEnabled) {
            this.eventLoop.forceTick();
          }
        }
        this.options.onAction('toggle-parallel', { enabled: this.state.parallelEnabled });
        this.render();
        break;
      case 'view-logs':
        this.openLogModal();
        break;
      case 'clear-logs':
        this.clearAllLogs();
        break;
      case 'switch-spec':
        this.openSpecModal();
        break;
      case 'custom-flow':
        this.openCustomFlowModal();
        break;
      case 'pr-action':
        if (this.state.prActionState === 'create-pr') {
          this.options.onAction('create-pr');
        } else if (this.state.prActionState === 'address-pr') {
          this.options.onAction('address-pr');
        }
        break;
      default:
        this.options.onAction(actionId);
    }
  }

  private openSpecModal(): void {
    // Load specs dynamically from filesystem
    const specGroups = loadAllSpecs(this.options.cwd);
    const items = specsToModalItems(specGroups);

    this.activeModal = createModal(this.screen, {
      title: this.state.spec ? `Select Spec (current: ${this.state.spec})` : 'Select Spec',
      items,
      onSelect: (id: string) => {
        this.closeModal();
        this.options.onAction('switch-spec', { specId: id });
      },
      onCancel: () => {
        this.closeModal();
      },
      onClear: () => {
        this.closeModal();
        this.options.onAction('clear-spec');
      },
    });
    this.screen.render();
  }

  private openLogModal(): void {
    this.activeModal = createModal(this.screen, {
      title: 'Activity Log',
      items: this.logEntries.map((entry, i) => ({
        id: `log-${i}`,
        label: entry,
        type: 'item' as const,
      })),
      onSelect: () => {}, // Log items not selectable
      onCancel: () => {
        this.closeModal();
      },
      scrollable: true,
    });
    this.screen.render();
  }

  private openCustomFlowModal(): void {
    // Load flows from filesystem
    const flowGroups = loadAllFlows();
    const items = flowsToModalItems(flowGroups);

    this.activeModal = createModal(this.screen, {
      title: 'Select Flow',
      items,
      onSelect: (flowPath: string) => {
        this.closeModal();
        // flowPath is the absolute path to the selected flow file
        if (!flowPath.startsWith('header-')) {
          this.openCustomMessageInput(flowPath);
        }
      },
      onCancel: () => {
        this.closeModal();
      },
      scrollable: true,
    });
    this.screen.render();
  }

  private openCustomMessageInput(flowPath: string): void {
    // Create an input modal for the custom message
    const width = 60;
    const height = 12;

    const box = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width,
      height,
      border: {
        type: 'line',
      },
      label: ' Custom Message (optional) ',
      tags: true,
      style: {
        border: {
          fg: '#a78bfa',
        },
      },
    });

    // Add description text
    blessed.text({
      parent: box,
      top: 1,
      left: 1,
      content: '{#c7d2fe-fg}Enter a custom message (system prompt).\nLeave empty to skip. Press Enter to confirm.{/#c7d2fe-fg}',
      tags: true,
    });

    // Create textarea for input
    const textarea = blessed.textarea({
      parent: box,
      top: 4,
      left: 1,
      width: width - 4,
      height: 4,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: '#4A34C5',
        },
        focus: {
          border: {
            fg: '#a78bfa',
          },
        },
      },
      inputOnFocus: true,
    });

    // Help text
    blessed.text({
      parent: box,
      bottom: 0,
      left: 1,
      content: '{#5c6370-fg}[Enter] Confirm  [Esc] Cancel{/#5c6370-fg}',
      tags: true,
    });

    // Store modal reference for cleanup (conform to Modal interface)
    const modalRef: Modal = {
      box,
      selectedIndex: 0,
      destroy: () => {
        box.destroy();
      },
      navigate: () => {}, // Not used for input modal
      select: () => {}, // Not used for input modal
    };
    this.activeModal = modalRef;

    // Focus textarea
    textarea.focus();

    // Handle Enter key - submit
    textarea.key(['enter'], () => {
      const customMessage = textarea.getValue().trim();
      textarea.cancel(); // Exit input mode before destroying
      modalRef.destroy();
      this.activeModal = null;
      this.screen.focusPop(); // Restore focus to screen
      this.spawnCustomFlowAgent(flowPath, customMessage);
      this.render();
    });

    // Handle Escape key - cancel
    textarea.key(['escape'], () => {
      textarea.cancel(); // Exit input mode before destroying
      modalRef.destroy();
      this.activeModal = null;
      this.screen.focusPop(); // Restore focus to screen
      this.render();
    });

    this.screen.render();
  }

  private spawnCustomFlowAgent(flowPath: string, customMessage: string): void {
    // Increment counter and generate window name
    this.state.customFlowCounter++;
    const windowName = `custom-flow-${this.state.customFlowCounter}`;
    const branch = this.state.branch || 'main';

    this.log(`Spawning custom flow: ${windowName}`);
    this.log(`Flow: ${flowPath.split('/').slice(-2).join('/')}`);

    try {
      const result = spawnCustomFlow(
        {
          flowPath,
          customMessage,
          windowName,
          focusWindow: true,
          specName: this.state.spec,
        },
        branch,
        this.options.cwd
      );

      this.log(`Spawned ${windowName} in ${result.sessionName}:${result.windowName}`);

      // Update running agents display
      this.state.activeAgents = [
        ...this.state.activeAgents,
        {
          name: windowName,
          agentType: 'custom-flow',
          isRunning: true,
        },
      ];
      this.render();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log(`Error spawning custom flow: ${message}`);
      logTuiError('spawnCustomFlow', e instanceof Error ? e : message, {
        flowPath,
        windowName,
        customMessage: customMessage || undefined,
        spec: this.state.spec,
        branch: this.state.branch,
      }, this.options.cwd);
    }
  }

  private closeModal(): void {
    if (this.activeModal) {
      this.activeModal.destroy();
      this.activeModal = null;
      this.render();
    }
  }

  /**
   * Show a confirmation dialog and wait for user response.
   * Returns true if user confirms, false if cancelled.
   */
  public showConfirmation(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.activeModal) {
        this.closeModal();
      }

      const width = 60;
      const lines = message.split('\n');
      const height = Math.min(lines.length + 6, 20);

      const box = blessed.box({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width,
        height,
        border: {
          type: 'line',
        },
        label: ` ${title} `,
        tags: true,
        style: {
          border: {
            fg: '#a78bfa',
          },
        },
      });

      // Add message text
      blessed.text({
        parent: box,
        top: 1,
        left: 2,
        right: 2,
        content: `{#c7d2fe-fg}${message}{/#c7d2fe-fg}`,
        tags: true,
      });

      // Add button hints
      blessed.text({
        parent: box,
        bottom: 0,
        left: 1,
        content: '{#10b981-fg}[Enter]{/#10b981-fg} Proceed  {#ef4444-fg}[Esc]{/#ef4444-fg} Cancel',
        tags: true,
      });

      // Focus the box for key events
      box.focus();

      // Store modal reference
      const modalRef: Modal = {
        box,
        selectedIndex: 0,
        destroy: () => box.destroy(),
        navigate: () => {},
        select: () => {},
      };
      this.activeModal = modalRef;

      // Handle Enter - confirm
      box.key(['enter'], () => {
        modalRef.destroy();
        this.activeModal = null;
        this.screen.focusPop();
        this.render();
        resolve(true);
      });

      // Handle Escape - cancel
      box.key(['escape'], () => {
        modalRef.destroy();
        this.activeModal = null;
        this.screen.focusPop();
        this.render();
        resolve(false);
      });

      this.screen.render();
    });
  }

  public openFileViewer(title: string, filePath: string): void {
    if (this.activeFileViewer) {
      this.closeFileViewer();
    }
    if (this.activeModal) {
      this.closeModal();
    }

    this.activeFileViewer = createFileViewer(this.screen, {
      title,
      filePath,
      onClose: () => {
        this.closeFileViewer();
      },
    });

    if (!this.activeFileViewer) {
      this.log(`File not found: ${filePath}`);
    }
  }

  private closeFileViewer(): void {
    if (this.activeFileViewer) {
      this.activeFileViewer.destroy();
      this.activeFileViewer = null;
      this.render();
    }
  }

  /**
   * Get planning file paths for current spec
   */
  public getFileStates(): { spec: boolean; alignment: boolean; e2eTestPlan: boolean } {
    if (!this.state.branch || !this.options.cwd) {
      return { spec: false, alignment: false, e2eTestPlan: false };
    }

    return {
      spec: this.state.spec ? getSpecFilePath(this.options.cwd, this.state.spec) !== null : false,
      alignment: getPlanningFilePath(this.options.cwd, this.state.branch, 'alignment') !== null,
      e2eTestPlan: getPlanningFilePath(this.options.cwd, this.state.branch, 'e2e_test_plan') !== null,
    };
  }

  public updateState(updates: Partial<TUIState>): void {
    this.state = { ...this.state, ...updates };

    // Sync toggle states to event loop if they were updated
    if ('emergentEnabled' in updates && this.eventLoop) {
      this.eventLoop.setEmergentEnabled(this.state.emergentEnabled);
    }
    if ('parallelEnabled' in updates && this.eventLoop) {
      this.eventLoop.setParallelEnabled(this.state.parallelEnabled);
    }

    this.buildActionItems();
    this.render();
  }

  public getState(): TUIState {
    return { ...this.state };
  }

  public log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.logEntries.push(`[${timestamp}] ${message}`);
    // Keep last 100 entries
    while (this.logEntries.length > 100) {
      this.logEntries.shift();
    }
  }

  /**
   * Clear all logs: both trace store (SQLite + JSONL) and in-memory TUI logs
   */
  private clearAllLogs(): void {
    // Clear trace store logs
    clearLogs(this.options.cwd);

    // Clear in-memory TUI logs
    this.logEntries = [];

    this.log('Logs cleared');
    this.render();
  }

  /**
   * Set PR URL for Greptile feedback monitoring
   */
  public setPRUrl(url: string | null): void {
    if (this.eventLoop) {
      this.eventLoop.setPRUrl(url);
    }
    if (url) {
      this.state.prActionState = 'greptile-reviewing';
      this.buildActionItems();
      this.render();
    }
  }

  /**
   * Sync EventLoop's branch context after TUI-initiated branch changes.
   *
   * Call this after switch-spec, clear-spec, or mark-completed to prevent
   * the EventLoop from detecting a "stale" branch change and overwriting
   * the TUI's correct state with incorrect data from findSpecByBranch().
   *
   * @param branch - The new branch name
   * @param spec - The spec for this branch (or null if no spec)
   */
  public syncBranchContext(branch: string, spec: SpecFile | null): void {
    if (this.eventLoop) {
      this.eventLoop.setBranchContext(branch, spec);
    }
  }

  private render(): void {
    // Update actions pane
    this.actionsPane.destroy();
    this.actionsPane = createActionsPane(
      this.screen,
      this.getToggleState(),
      this.focusedPane === 'actions' ? this.selectedIndex.actions : undefined
    );

    // Update prompts pane
    this.promptsPane.destroy();
    this.promptsPane = createPromptsPane(
      this.screen,
      this.state.prompts,
      this.focusedPane === 'prompts' ? this.selectedIndex.prompts : undefined
    );

    // Update status pane
    this.statusPane.destroy();
    const fileStates = this.getFileStates();
    this.statusPane = createStatusPane(
      this.screen,
      this.state.activeAgents,
      this.focusedPane === 'status' ? this.selectedIndex.status : undefined,
      this.state.spec,
      this.state.branch,
      this.state.baseBranch,
      this.logEntries,
      fileStates,
      {
        onViewSpec: () => {
          if (this.state.spec && this.options.cwd) {
            const specPath = getSpecFilePath(this.options.cwd, this.state.spec);
            if (specPath) {
              this.openFileViewer(`Spec: ${this.state.spec}`, specPath);
            }
          }
        },
        onViewAlignment: () => {
          if (this.state.branch && this.options.cwd) {
            const alignPath = getPlanningFilePath(this.options.cwd, this.state.branch, 'alignment');
            if (alignPath) {
              this.openFileViewer('Alignment Document', alignPath);
            }
          }
        },
        onViewE2ETestPlan: () => {
          if (this.state.branch && this.options.cwd) {
            const e2ePath = getPlanningFilePath(this.options.cwd, this.state.branch, 'e2e_test_plan');
            if (e2ePath) {
              this.openFileViewer('E2E Test Plan', e2ePath);
            }
          }
        },
      }
    );

    // Apply focus styling
    this.applyFocusStyles();

    this.screen.render();
  }

  private applyFocusStyles(): void {
    // Highlight focused pane border
    const panes: Record<PaneId, blessed.Widgets.BoxElement> = {
      actions: this.actionsPane,
      prompts: this.promptsPane,
      status: this.statusPane,
    };

    for (const [paneId, pane] of Object.entries(panes)) {
      const isFocused = paneId === this.focusedPane;
      if (pane.style && pane.style.border) {
        // Focused: bright purple, Unfocused: muted purple
        pane.style.border.fg = isFocused ? '#a78bfa' : '#4A34C5';
      }
    }
  }

  public destroy(): void {
    // Stop event loop daemon
    if (this.eventLoop) {
      this.eventLoop.stop();
    }

    // Only kill windows that were spawned by this TUI session
    const currentSession = getCurrentSession();
    if (currentSession) {
      const hubWindowId = getHubWindowId(this.options.cwd);
      const spawnedWindows = getSpawnedWindows(this.options.cwd);
      const windows = listWindows(currentSession);

      for (const window of windows) {
        // Skip the hub window - check by ID (stable) or name (fallback)
        if (window.id === hubWindowId || window.name === 'hub') continue;

        // Only kill windows that were spawned by this TUI session
        if (!spawnedWindows.includes(window.name)) continue;

        try {
          killWindow(currentSession, window.name);
        } catch (e) {
          // Log but don't fail - window might already be closed
          logTuiError('killWindow', e instanceof Error ? e : String(e), {
            session: currentSession,
            window: window.name,
          }, this.options.cwd);
        }
      }
    }

    // Clear the TUI session state
    clearTuiSession(this.options.cwd);

    try {
      this.screen.destroy();
    } finally {
      // Restore original output functions after cleanup
      // Delay restoration to catch any deferred terminal output
      const savedStdout = this.originalStdoutWrite;
      const savedStderr = this.originalStderrWrite;
      const savedConsoleLog = this.originalConsoleLog;
      const savedConsoleError = this.originalConsoleError;

      setTimeout(() => {
        if (savedStdout) process.stdout.write = savedStdout;
        if (savedStderr) process.stderr.write = savedStderr;
        if (savedConsoleLog) console.log = savedConsoleLog;
        if (savedConsoleError) console.error = savedConsoleError;
      }, 100);
    }
  }

  public start(): void {
    this.screen.render();
  }
}

export type { ActionItem } from './actions.js';
export type { PromptItem } from './prompts-pane.js';
export type { AgentInfo } from './status-pane.js';
