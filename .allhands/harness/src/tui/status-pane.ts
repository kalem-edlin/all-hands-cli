/**
 * Status Pane - Right area showing spec info, active agents, and log stream
 *
 * Layout:
 * ┌─ Status ─────────────────────┐
 * │ Spec: my-feature-spec        │  <- Current spec (green) or "No spec selected" (yellow)
 * │ Branch: feature/my-branch    │  <- Current branch (cyan)
 * │ Base: main                   │  <- Base branch (gray)
 * │                              │
 * │ [View Spec] [Alignment]      │  <- View buttons (if spec selected)
 * │ [E2E Test Plan]              │
 * │ ── Active Agents ────────────│
 * │  ┌────────┐  ┌────────┐      │  <- Agent grid
 * │  │ coord  │  │ planner│      │
 * │  │ ●      │  │ ●      │      │
 * │  └────────┘  └────────┘      │
 * │ ── Recent Activity ──────────│
 * │ [12:34] Agent spawned        │  <- Log stream
 * │ [12:35] Prompt 03 started    │
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
  spec?: string;
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

  let currentY = 0;

  // Current spec indicator (always shown at top)
  if (spec) {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: `{bold}{#a78bfa-fg}Spec:{/#a78bfa-fg} {#e0e7ff-fg}${truncate(spec, 25)}{/#e0e7ff-fg}{/bold}`,
      tags: true,
    });
  } else {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: '{bold}{#f59e0b-fg}No spec selected{/#f59e0b-fg}{/bold}',
      tags: true,
    });
  }
  currentY += 1;

  // Branch indicators
  if (branch) {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: `{#818cf8-fg}Branch:{/#818cf8-fg} {#c7d2fe-fg}${truncate(branch, 22)}{/#c7d2fe-fg}`,
      tags: true,
    });
    currentY += 1;
  }
  if (baseBranch) {
    blessed.text({
      parent: pane,
      top: currentY,
      left: 1,
      content: `{#5c6370-fg}Base: ${truncate(baseBranch, 24)}{/#5c6370-fg}`,
      tags: true,
    });
    currentY += 1;
  }

  currentY += 1; // spacing

  // View buttons row (only show if spec is selected)
  if (spec) {
    let buttonX = 1;

    // View Spec button (if spec exists)
    if (fileStates?.spec && options?.onViewSpec) {
      const specButton = blessed.button({
        parent: pane,
        top: currentY,
        left: buttonX,
        width: truncate(`[View ${spec}]`, 18).length,
        height: 1,
        content: `{#818cf8-fg}[View ${truncate(spec, 12)}]{/#818cf8-fg}`,
        tags: true,
        mouse: true,
        style: {
          fg: '#818cf8',
          hover: {
            fg: '#a78bfa',
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
        content: '{#818cf8-fg}[Alignment]{/#818cf8-fg}',
        tags: true,
        mouse: true,
        style: {
          fg: '#818cf8',
          hover: {
            fg: '#a78bfa',
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
        content: '{#818cf8-fg}[E2E Test Plan]{/#818cf8-fg}',
        tags: true,
        mouse: true,
        style: {
          fg: '#818cf8',
          hover: {
            fg: '#a78bfa',
          },
        },
      });
      e2eButton.on('click', () => options.onViewE2ETestPlan?.());
      currentY += 1;
    }
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

  // Agent list (vertical)
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
    const boxHeight = 3;
    const padding = 1;

    agents.forEach((agent, index) => {
      const top = currentY + index * (boxHeight + padding);

      const isSelected = selectedIndex === index;
      // Use purple (#4A34C5 ≈ 63) for selected, muted gray-blue for unselected
      const boxStyle = isSelected
        ? { border: { fg: '#4A34C5' }, fg: 'white' }
        : { border: { fg: '#3a3f5c' }, fg: 'white' };

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
    content: '{#6366f1-fg}━━ Recent Activity ━━{/#6366f1-fg}',
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

  // Help text at bottom
  blessed.text({
    parent: pane,
    bottom: 0,
    left: 1,
    content: '{#5c6370-fg}Ctrl-L: Full Log{/#5c6370-fg}',
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
