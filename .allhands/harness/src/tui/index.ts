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
import { KnowledgeService } from '../lib/knowledge.js';
import { validateDocs } from '../lib/docs-validation.js';
import type { PromptFile } from '../lib/prompts.js';
import { loadAllSpecs, specsToModalItems } from '../lib/specs.js';
import { join } from 'path';

export type PaneId = 'actions' | 'prompts' | 'status';

export type PRActionState = 'create-pr' | 'greptile-reviewing' | 'address-pr';

export interface TUIOptions {
  onAction: (action: string, data?: Record<string, unknown>) => void;
  onExit: () => void;
  onSpawnExecutor?: (prompt: PromptFile, branch: string) => void;
  cwd?: string;
}

export interface TUIState {
  loopEnabled: boolean;
  emergentEnabled: boolean;
  prompts: PromptItem[];
  activeAgents: AgentInfo[];
  milestone?: string;
  branch?: string;
  prActionState: PRActionState;
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

  constructor(options: TUIOptions) {
    this.options = options;
    this.state = {
      loopEnabled: false,
      emergentEnabled: false,
      prompts: [],
      activeAgents: [],
      prActionState: 'create-pr',
    };

    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'All Hands - Agentic Harness',
    });

    // Create header
    this.header = this.createHeader();

    // Create panes
    this.actionsPane = createActionsPane(this.screen, this.getToggleState());
    this.promptsPane = createPromptsPane(this.screen, this.state.prompts);
    this.statusPane = createStatusPane(
      this.screen,
      this.state.activeAgents,
      undefined,
      this.state.milestone,
      this.state.branch,
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
        onBranchChange: (newBranch) => {
          this.log(`Branch changed to: ${newBranch}`);
          this.state.branch = newBranch;
          this.options.onAction('branch-changed', { branch: newBranch });
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
          if (this.state.branch && this.options.onSpawnExecutor) {
            this.options.onSpawnExecutor(prompt, this.state.branch);
          }
        },
        onLoopStatus: (message) => {
          this.log(`Loop: ${message}`);
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
      const service = new KnowledgeService(this.options.cwd, { quiet: true });

      // Reindex roadmap
      this.log('Indexing roadmap specs...');
      this.render();
      await service.reindexAll('roadmap');

      // Reindex docs (includes specs)
      this.log('Indexing documentation...');
      this.render();
      await service.reindexAll('docs');

      // Run validation
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
      content: '{center}{bold}ALL HANDS AGENTIC HARNESS{/bold}{/center}',
      tags: true,
      style: {
        fg: 'cyan',
        bg: 'black',
        border: {
          fg: 'cyan',
        },
      },
      border: {
        type: 'line',
      },
    });
  }

  private getToggleState(): ToggleState {
    return {
      loopEnabled: this.state.loopEnabled,
      emergentEnabled: this.state.emergentEnabled,
      prActionState: this.state.prActionState,
    };
  }

  private buildActionItems(): void {
    this.actionItems = [
      { id: 'coordinator', label: 'Coordinator', key: '1', type: 'action' },
      { id: 'ideation', label: 'Ideation', key: '2', type: 'action' },
      { id: 'planner', label: 'Planner', key: '3', type: 'action' },
      { id: 'e2e-test-planner', label: 'Build E2E Test', key: '4', type: 'action' },
      { id: 'review-jury', label: 'Review Jury', key: '5', type: 'action' },
      { id: 'pr-action', label: this.getPRActionLabel(), key: '6', type: 'action',
        disabled: this.state.prActionState === 'greptile-reviewing' },
      { id: 'compound', label: 'Compound', key: '7', type: 'action' },
      { id: 'switch-milestone', label: 'Switch Milestone', key: '8', type: 'action' },
      { id: 'separator-toggles', label: '─ Toggles ─', type: 'separator' },
      { id: 'toggle-loop', label: 'Loop', key: 'L', type: 'toggle', checked: this.state.loopEnabled },
      { id: 'toggle-emergent', label: 'Emergent', key: 'E', type: 'toggle', checked: this.state.emergentEnabled },
      { id: 'separator-bottom', label: '─────────', type: 'separator' },
      { id: 'quit', label: 'Quit', key: 'Q', type: 'action' },
      { id: 'refresh', label: 'Refresh', key: 'R', type: 'action' },
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
      item.type !== 'separator' && !item.disabled
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
    const hotkeys = ['1', '2', '3', '4', '5', '6', '7', '8'];
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

    // Toggle hotkeys (O for lOop, E for Emergent)
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

    // Q for quit, R for refresh
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

    // Log modal toggle (Ctrl-L)
    this.screen.key(['C-l'], () => {
      if (this.activeModal) {
        this.closeModal();
      } else {
        this.openLogModal();
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
      const prompt = this.state.prompts[this.selectedIndex.prompts];
      if (prompt) {
        this.options.onAction('select-prompt', { prompt });
      }
    }
    // Status pane selection - could show agent details
  }

  private handleAction(actionId: string): void {
    switch (actionId) {
      case 'quit':
        this.options.onExit();
        this.destroy();
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
        this.options.onAction('toggle-emergent', { enabled: this.state.emergentEnabled });
        this.render();
        break;
      case 'switch-milestone':
        this.openMilestoneModal();
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

  private openMilestoneModal(): void {
    // Load specs dynamically from filesystem
    const specGroups = loadAllSpecs(this.options.cwd);
    const items = specsToModalItems(specGroups);

    this.activeModal = createModal(this.screen, {
      title: 'Select Milestone',
      items,
      onSelect: (id: string) => {
        this.closeModal();
        this.options.onAction('switch-milestone', { specId: id });
      },
      onCancel: () => {
        this.closeModal();
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

  private closeModal(): void {
    if (this.activeModal) {
      this.activeModal.destroy();
      this.activeModal = null;
      this.render();
    }
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
   * Get planning file paths for current milestone
   */
  public getFileStates(): { spec: boolean; alignment: boolean; e2eTestPlan: boolean } {
    if (!this.state.branch || !this.options.cwd) {
      return { spec: false, alignment: false, e2eTestPlan: false };
    }

    return {
      spec: this.state.milestone ? getSpecFilePath(this.options.cwd, this.state.milestone) !== null : false,
      alignment: getPlanningFilePath(this.options.cwd, this.state.branch, 'alignment') !== null,
      e2eTestPlan: getPlanningFilePath(this.options.cwd, this.state.branch, 'e2e_test_plan') !== null,
    };
  }

  public updateState(updates: Partial<TUIState>): void {
    this.state = { ...this.state, ...updates };
    this.buildActionItems();
    this.render();
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
      this.state.milestone,
      this.state.branch,
      this.logEntries,
      fileStates,
      {
        onViewSpec: () => {
          if (this.state.milestone && this.options.cwd) {
            const specPath = getSpecFilePath(this.options.cwd, this.state.milestone);
            if (specPath) {
              this.openFileViewer(`Spec: ${this.state.milestone}`, specPath);
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
        pane.style.border.fg = isFocused ? 'yellow' : 'cyan';
      }
    }
  }

  public destroy(): void {
    // Stop event loop daemon
    if (this.eventLoop) {
      this.eventLoop.stop();
    }
    this.screen.destroy();
  }

  public start(): void {
    this.screen.render();
  }
}

export type { ActionItem } from './actions.js';
export type { PromptItem } from './prompts-pane.js';
export type { AgentInfo } from './status-pane.js';
