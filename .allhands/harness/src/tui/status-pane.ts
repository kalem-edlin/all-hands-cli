/**
 * Status Pane - Right area showing view buttons, active agents, and log stream
 *
 * Layout:
 * ┌─ Status ─────────────────────┐
 * │ [View Milestone] [Alignment] │  <- View buttons
 * │ [E2E Test Plan]              │
 * │ ─────────────────────────────│
 * │  ┌────────┐  ┌────────┐      │  <- Agent grid
 * │  │ coord  │  │ planner│      │
 * │  │ ●      │  │ ●      │      │
 * │  └────────┘  └────────┘      │
 * │ ─────────────────────────────│
 * │ [12:34] Agent spawned        │  <- Log stream
 * │ [12:35] Prompt 03 started    │
 * │ [12:36] Loop iteration 4     │
 * └──────────────────────────────┘
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
}

export interface StatusPaneData {
  milestone?: string;
  branch?: string;
  agents: AgentInfo[];
  logEntries?: string[];
  fileStates?: FileStates;
  options?: StatusPaneOptions;
}

const ACTIONS_WIDTH = 24;
const HEADER_HEIGHT = 3;

export function createStatusPane(
  screen: blessed.Widgets.Screen,
  agents: AgentInfo[],
  selectedIndex?: number,
  milestone?: string,
  branch?: string,
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
        fg: 'cyan',
      },
    },
  });

  let currentY = 0;

  // View buttons row (only show if milestone is selected)
  if (milestone) {
    let buttonX = 1;

    // View Milestone button (if spec exists)
    if (fileStates?.spec && options?.onViewSpec) {
      const specButton = blessed.button({
        parent: pane,
        top: currentY,
        left: buttonX,
        width: truncate(`[View ${milestone}]`, 18).length,
        height: 1,
        content: `{cyan-fg}[View ${truncate(milestone, 12)}]{/cyan-fg}`,
        tags: true,
        mouse: true,
        style: {
          fg: 'cyan',
          hover: {
            fg: 'yellow',
          },
        },
      });
      specButton.on('click', () => options.onViewSpec?.());
      buttonX += specButton.width as number + 1;
    }

    // View Alignment button (if alignment.md exists)
    if (fileStates?.alignment && options?.onViewAlignment) {
      const alignButton = blessed.button({
        parent: pane,
        top: currentY,
        left: buttonX,
        width: 13,
        height: 1,
        content: '{cyan-fg}[Alignment]{/cyan-fg}',
        tags: true,
        mouse: true,
        style: {
          fg: 'cyan',
          hover: {
            fg: 'yellow',
          },
        },
      });
      alignButton.on('click', () => options.onViewAlignment?.());
      buttonX += 14;
    }

    currentY += 1;

    // Second row for E2E Test Plan button
    if (fileStates?.e2eTestPlan && options?.onViewE2ETestPlan) {
      const e2eButton = blessed.button({
        parent: pane,
        top: currentY,
        left: 1,
        width: 16,
        height: 1,
        content: '{cyan-fg}[E2E Test Plan]{/cyan-fg}',
        tags: true,
        mouse: true,
        style: {
          fg: 'cyan',
          hover: {
            fg: 'yellow',
          },
        },
      });
      e2eButton.on('click', () => options.onViewE2ETestPlan?.());
      currentY += 1;
    }
  } else {
    // No milestone selected
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: '{gray-fg}No milestone selected{/gray-fg}',
      tags: true,
    });
    currentY += 1;
  }

  currentY += 1;

  // Separator
  blessed.text({
    parent: pane,
    top: currentY,
    left: 1,
    content: '{gray-fg}── Active Agents ──{/gray-fg}',
    tags: true,
  });
  currentY += 1;

  // Agent list (vertical)
  if (agents.length === 0) {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: '{gray-fg}No active agents{/gray-fg}',
      tags: true,
    });
    currentY += 2;
  } else {
    const boxHeight = 4;
    const padding = 1;

    agents.forEach((agent, index) => {
      const top = currentY + index * (boxHeight + padding);

      const isSelected = selectedIndex === index;
      const boxStyle = isSelected
        ? { border: { fg: 'yellow' }, fg: 'white' }
        : { border: { fg: 'gray' }, fg: 'white' };

      const agentBox = blessed.box({
        parent: pane,
        top,
        left: 1,
        right: 1,
        height: boxHeight,
        border: {
          type: 'line',
        },
        tags: true,
        style: boxStyle,
      });

      // Agent name on the left, status indicator on the right
      const displayName = truncate(agent.name, 20);
      blessed.text({
        parent: agentBox,
        top: 0,
        left: 0,
        content: displayName,
        tags: true,
      });

      const statusLine = formatAgentStatus(agent);
      blessed.text({
        parent: agentBox,
        top: 1,
        left: 0,
        content: statusLine,
        tags: true,
      });
    });

    currentY += agents.length * (boxHeight + padding) + 1;
  }

  // Log stream section (bottom half)
  blessed.text({
    parent: pane,
    top: currentY,
    left: 1,
    content: '{gray-fg}── Recent Activity ──{/gray-fg}',
    tags: true,
  });
  currentY += 1;

  // Show last N log entries that fit
  const maxLogLines = 8;
  const recentLogs = logEntries.slice(-maxLogLines);

  if (recentLogs.length === 0) {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: '{gray-fg}No recent activity{/gray-fg}',
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
        content: `{gray-fg}${truncatedEntry}{/gray-fg}`,
        tags: true,
      });
    });
  }

  // Help text at bottom
  blessed.text({
    parent: pane,
    bottom: 0,
    left: 1,
    content: '{gray-fg}Ctrl-L: Full Log{/gray-fg}',
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
