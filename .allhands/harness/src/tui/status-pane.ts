/**
 * Status Pane - Right area showing spec info, active agents, and log stream
 *
 * Layout:
 * ┌─ Status ─────────────────────┐
 * │ Branch: feature/my-branch    │
 * │ Base: main                   │
 * │                              │
 * │ ┌──────────────────────────┐ │  <- Selectable spec box (full width)
 * │ │ ▸ my-feature-spec        │ │
 * │ └──────────────────────────┘ │
 * │ ┌──────────────────────────┐ │  <- Selectable alignment box (if exists)
 * │ │ ▸ Alignment Doc          │ │
 * │ └──────────────────────────┘ │
 * │ ┌──────────────────────────┐ │  <- Selectable e2e box (if exists)
 * │ │ ▸ E2E Test Plan          │ │
 * │ └──────────────────────────┘ │
 * │                              │
 * │ ── Active Agents ────────────│
 * │ ┌──────────────────────────┐ │  <- Selectable agent box
 * │ │ coordinator      ● #01   │ │
 * │ └──────────────────────────┘ │
 * │                              │
 * │ ── Recent Activity ──────────│
 * │ [12:34] Agent spawned        │
 * └──────────────────────────────┘
 *
 * Selection:
 * - j/k navigates through docs + agents
 * - Enter/Space on doc opens file viewer
 * - x on agent deletes it
 */

import blessed from 'blessed';

export interface AgentInfo {
  name: string;
  agentType: string;
  promptNumber?: string;
  isRunning: boolean;
}

export interface FileStates {
  spec: boolean;
  alignment: boolean;
  e2eTestPlan: boolean;
}

export interface StatusPaneOptions {
  onViewSpec?: () => void;
  onViewAlignment?: () => void;
  onViewE2ETestPlan?: () => void;
  onDeleteAgent?: (agentName: string) => void;
}

export interface StatusPaneData {
  spec?: string;
  branch?: string;
  agents: AgentInfo[];
  logEntries?: string[];
  fileStates?: FileStates;
  options?: StatusPaneOptions;
}

/**
 * Item types for selection tracking
 */
export type SelectableItemType = 'spec' | 'alignment' | 'e2e' | 'agent';

export interface SelectableItem {
  type: SelectableItemType;
  agentName?: string; // Only for agent type
}

const HEADER_HEIGHT = 3;

/**
 * Calculate the list of selectable items based on current state
 */
export function getSelectableItems(
  spec?: string,
  fileStates?: FileStates,
  agents: AgentInfo[] = []
): SelectableItem[] {
  const items: SelectableItem[] = [];

  // Document items (only if they exist/are viewable)
  if (spec) {
    items.push({ type: 'spec' });
  }
  if (fileStates?.alignment) {
    items.push({ type: 'alignment' });
  }
  if (fileStates?.e2eTestPlan) {
    items.push({ type: 'e2e' });
  }

  // Agent items
  for (const agent of agents) {
    items.push({ type: 'agent', agentName: agent.name });
  }

  return items;
}

export function createStatusPane(
  screen: blessed.Widgets.Screen,
  agents: AgentInfo[],
  selectedIndex?: number,
  spec?: string,
  branch?: string,
  baseBranch?: string,
  logEntries: string[] = [],
  fileStates?: FileStates,
  options?: StatusPaneOptions
): blessed.Widgets.BoxElement {
  const pane = blessed.box({
    parent: screen,
    top: HEADER_HEIGHT,
    left: '50%+12',
    width: '50%-12',
    height: `100%-${HEADER_HEIGHT}`,
    border: {
      type: 'line',
    },
    label: ' Status ',
    tags: true,
    style: {
      border: {
        fg: '#4A34C5',
      },
    },
  });

  // Get the inner width for full-width boxes
  const paneWidth = typeof pane.width === 'number' ? pane.width : 40;
  const innerWidth = paneWidth - 4; // Account for pane borders and padding

  let currentY = 0;

  // Build selectable items list to track what index corresponds to what
  const selectableItems = getSelectableItems(spec, fileStates, agents);
  let currentSelectableIndex = 0;

  // Branch line and base branch on separate lines for clarity
  if (branch || baseBranch) {
    if (branch) {
      blessed.text({
        parent: pane,
        top: currentY,
        left: 1,
        content: `{#818cf8-fg}Branch:{/#818cf8-fg} {#c7d2fe-fg}${truncate(branch, 24)}{/#c7d2fe-fg}`,
        tags: true,
      });
      currentY += 1;
    }
    if (baseBranch) {
      blessed.text({
        parent: pane,
        top: currentY,
        left: 1,
        content: `{#5c6370-fg}Base: ${truncate(baseBranch, 26)}{/#5c6370-fg}`,
        tags: true,
      });
      currentY += 1;
    }
  }

  currentY += 1; // spacing before document links

  // Document boxes section - full width, selectable
  const DOC_BOX_HEIGHT = 3;

  // Spec box - ALWAYS shows when spec is selected
  if (spec) {
    const isSelected = selectedIndex === currentSelectableIndex;
    const specBox = blessed.box({
      parent: pane,
      top: currentY,
      left: 1,
      width: innerWidth,
      height: DOC_BOX_HEIGHT,
      border: { type: 'line' },
      tags: true,
      mouse: true,
      style: {
        border: { fg: isSelected ? '#a78bfa' : '#4A34C5' },
        hover: { border: { fg: '#a78bfa' } },
      },
    });
    const specLabel = isSelected
      ? `{#a78bfa-fg}{bold}▸{/bold}{/#a78bfa-fg} {#e0e7ff-fg}{bold}${truncate(spec, innerWidth - 6)}{/bold}{/#e0e7ff-fg}`
      : `{#a78bfa-fg}▸{/#a78bfa-fg} {#e0e7ff-fg}${truncate(spec, innerWidth - 6)}{/#e0e7ff-fg}`;
    blessed.text({
      parent: specBox,
      top: 0,
      left: 1,
      content: specLabel,
      tags: true,
    });
    specBox.on('click', () => options?.onViewSpec?.());
    currentY += DOC_BOX_HEIGHT;
    currentSelectableIndex++;
  } else if (fileStates?.alignment) {
    // Specless planning dir (quick-loop) — show mode indicator instead of warning
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: '{#818cf8-fg}Quick Loop{/#818cf8-fg} {#5c6370-fg}(specless){/#5c6370-fg}',
      tags: true,
    });
    currentY += 1;
  } else {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: '{#f59e0b-fg}No spec selected{/#f59e0b-fg}',
      tags: true,
    });
    currentY += 1;
  }

  // Alignment Doc box (only if file exists)
  if (fileStates?.alignment) {
    const isSelected = selectedIndex === currentSelectableIndex;
    const alignBox = blessed.box({
      parent: pane,
      top: currentY,
      left: 1,
      width: innerWidth,
      height: DOC_BOX_HEIGHT,
      border: { type: 'line' },
      tags: true,
      mouse: true,
      style: {
        border: { fg: isSelected ? '#a78bfa' : '#4A34C5' },
        hover: { border: { fg: '#a78bfa' } },
      },
    });
    const alignLabel = isSelected
      ? '{#a78bfa-fg}{bold}▸{/bold}{/#a78bfa-fg} {#e0e7ff-fg}{bold}Alignment Doc{/bold}{/#e0e7ff-fg}'
      : '{#a78bfa-fg}▸{/#a78bfa-fg} {#e0e7ff-fg}Alignment Doc{/#e0e7ff-fg}';
    blessed.text({
      parent: alignBox,
      top: 0,
      left: 1,
      content: alignLabel,
      tags: true,
    });
    alignBox.on('click', () => options?.onViewAlignment?.());
    currentY += DOC_BOX_HEIGHT;
    currentSelectableIndex++;
  }

  // E2E Test Plan box (only if file exists)
  if (fileStates?.e2eTestPlan) {
    const isSelected = selectedIndex === currentSelectableIndex;
    const e2eBox = blessed.box({
      parent: pane,
      top: currentY,
      left: 1,
      width: innerWidth,
      height: DOC_BOX_HEIGHT,
      border: { type: 'line' },
      tags: true,
      mouse: true,
      style: {
        border: { fg: isSelected ? '#a78bfa' : '#4A34C5' },
        hover: { border: { fg: '#a78bfa' } },
      },
    });
    const e2eLabel = isSelected
      ? '{#a78bfa-fg}{bold}▸{/bold}{/#a78bfa-fg} {#e0e7ff-fg}{bold}E2E Test Plan{/bold}{/#e0e7ff-fg}'
      : '{#a78bfa-fg}▸{/#a78bfa-fg} {#e0e7ff-fg}E2E Test Plan{/#e0e7ff-fg}';
    blessed.text({
      parent: e2eBox,
      top: 0,
      left: 1,
      content: e2eLabel,
      tags: true,
    });
    e2eBox.on('click', () => options?.onViewE2ETestPlan?.());
    currentY += DOC_BOX_HEIGHT;
    currentSelectableIndex++;
  }

  currentY += 1;

  // Separator
  blessed.text({
    parent: pane,
    top: currentY,
    left: 1,
    content: '{#6366f1-fg}━━ Active Agents ━━{/#6366f1-fg}',
    tags: true,
  });
  currentY += 1;

  // Agent list (vertical, full width, selectable)
  if (agents.length === 0) {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: '{239-fg}No active agents{/239-fg}',
      tags: true,
    });
    currentY += 2;
  } else {
    const AGENT_BOX_HEIGHT = 3;

    agents.forEach((agent, index) => {
      const isSelected = selectedIndex === currentSelectableIndex;
      const boxStyle = isSelected
        ? { border: { fg: '#a78bfa' }, fg: 'white' }
        : { border: { fg: '#3a3f5c' }, fg: 'white' };

      const agentBox = blessed.box({
        parent: pane,
        top: currentY,
        left: 1,
        width: innerWidth,
        height: AGENT_BOX_HEIGHT,
        border: { type: 'line' },
        tags: true,
        mouse: true,
        style: boxStyle,
      });

      // Agent name on the left, status indicator on the right
      const displayName = truncate(agent.name, innerWidth - 12);
      const nameStyle = isSelected ? '{bold}' : '';
      const nameEndStyle = isSelected ? '{/bold}' : '';
      blessed.text({
        parent: agentBox,
        top: 0,
        left: 0,
        content: `${nameStyle}${displayName}${nameEndStyle}`,
        tags: true,
      });

      const statusLine = formatAgentStatus(agent);
      blessed.text({
        parent: agentBox,
        top: 0,
        right: 1,
        content: statusLine,
        tags: true,
      });

      // Click to select (could expand to show details)
      agentBox.on('click', () => {
        // For now, clicking just selects - x key will delete
      });

      currentY += AGENT_BOX_HEIGHT;
      currentSelectableIndex++;
    });

    currentY += 1;
  }

  // Log stream section - calculate available space
  // Pane inner height = pane height - 2 (borders) - 1 (help text at bottom)
  const paneHeight = typeof pane.height === 'number' ? pane.height : 30;
  const availableForLogs = paneHeight - 2 - 1 - currentY - 1; // -1 for "Recent Activity" header

  // Only show logs section if there's space
  if (availableForLogs > 1) {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: '{#6366f1-fg}━━ Recent Activity ━━{/#6366f1-fg}',
      tags: true,
    });
    currentY += 1;

    // Show as many log entries as will fit (newest first)
    const maxLogLines = Math.max(0, availableForLogs - 1); // -1 for header already added
    const recentLogs = logEntries.slice(-maxLogLines).reverse();

    if (recentLogs.length === 0) {
      blessed.text({
        parent: pane,
        top: currentY,
        left: 1,
        content: '{#5c6370-fg}No recent activity{/#5c6370-fg}',
        tags: true,
      });
    } else {
      recentLogs.forEach((entry, i) => {
        // Truncate long entries
        const truncatedEntry = entry.length > 35 ? entry.substring(0, 32) + '...' : entry;
        blessed.text({
          parent: pane,
          top: currentY + i,
          left: 1,
          content: `{#8b92a8-fg}${truncatedEntry}{/#8b92a8-fg}`,
          tags: true,
        });
      });
    }
  }

  // Help text at bottom - show context-sensitive hint
  const selectedItem = selectableItems[selectedIndex ?? -1];
  let helpText = '{#5c6370-fg}[v] Full Log{/#5c6370-fg}';
  if (selectedItem?.type === 'agent') {
    helpText = '{#5c6370-fg}[x] Delete | [v] Log{/#5c6370-fg}';
  } else if (selectedItem?.type === 'spec' || selectedItem?.type === 'alignment' || selectedItem?.type === 'e2e') {
    helpText = '{#5c6370-fg}[Enter] View | [v] Log{/#5c6370-fg}';
  }

  blessed.text({
    parent: pane,
    bottom: 0,
    left: 1,
    content: helpText,
    tags: true,
  });

  return pane;
}

function formatAgentStatus(agent: AgentInfo): string {
  const indicator = agent.isRunning
    ? '{green-fg}●{/green-fg}'
    : '{red-fg}●{/red-fg}';

  let info = indicator;
  if (agent.promptNumber) {
    info += ` #${agent.promptNumber}`;
  }

  return info;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 2) + '..';
}
