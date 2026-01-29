/**
 * Actions Pane - Left sidebar with agent spawners, toggles, and controls
 *
 * Layout (vertical):
 * [1] Coordinator
 * [2] Ideation
 * [3] Planner
 * [4] Build E2E Test
 * [5] Review Jury
 * [6] Create PR / Awaiting Review... / Rerun PR Review
 * [7] Review PR (appears after first review detected)
 * [8] Compound
 * [9] Mark Completed
 * [0] Switch Spec
 * [-] Custom Flow
 * ─ Toggles ─
 * [ ] Loop
 * [ ] Emergent
 * ─ Controls ─
 * [V] View Logs
 * [C] Clear Logs
 * [R] Refresh
 * [Q] Quit
 */

import blessed from 'blessed';
import type { PRActionState } from './index.js';

export interface ActionItem {
  id: string;
  label: string;
  key?: string;
  type: 'action' | 'toggle' | 'separator';
  highlight?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  checked?: boolean;
}

export interface ToggleState {
  loopEnabled: boolean;
  emergentEnabled: boolean;
  parallelEnabled: boolean;
  prActionState: PRActionState;
  prReviewUnlocked: boolean;  // true after first PR review detected
  hasSpec: boolean;
  hasCompletedPrompts: boolean;
  compoundRun: boolean;
}

const PANE_WIDTH = 24;
const HEADER_HEIGHT = 3;

export function createActionsPane(
  screen: blessed.Widgets.Screen,
  toggleState: ToggleState,
  selectedIndex?: number
): blessed.Widgets.BoxElement {
  // Create outer container (non-scrollable, holds border and help text)
  const container = blessed.box({
    parent: screen,
    top: HEADER_HEIGHT,
    left: 0,
    width: PANE_WIDTH,
    height: `100%-${HEADER_HEIGHT}`,
    border: {
      type: 'line',
    },
    label: ' Actions ',
    tags: true,
    style: {
      border: {
        fg: '#4A34C5',
      },
    },
  });

  // Calculate content area height (container minus borders minus help text lines)
  const containerHeight = typeof container.height === 'number' ? container.height : (screen.height as number) - HEADER_HEIGHT;
  const contentHeight = containerHeight - 4; // 2 for borders, 2 for help text lines

  // Create scrollable content area inside the container
  const scrollArea = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: '100%-2',
    height: contentHeight,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '┃',
      track: {
        bg: 'black',
      },
      style: {
        fg: '#4A34C5',
      },
    },
  });

  const items = buildActionItems(toggleState);
  const { content, selectedLineNumber } = formatActionsContent(items, selectedIndex);

  scrollArea.setContent(content);

  // Scroll to ensure selected item is visible
  if (selectedLineNumber !== undefined && selectedLineNumber >= 0) {
    const visibleHeight = contentHeight;

    // Only scroll if selected line would be outside visible area
    if (selectedLineNumber >= visibleHeight) {
      // Scroll to put selected line in the middle of visible area when possible
      const scrollOffset = Math.max(0, selectedLineNumber - Math.floor(visibleHeight / 2));
      scrollArea.scrollTo(scrollOffset);
    }
  }

  // Add help text at bottom of container (fixed position, outside scroll area)
  blessed.text({
    parent: container,
    bottom: 1,
    left: 1,
    content: '{#5c6370-fg}Tab: Switch Pane{/#5c6370-fg}',
    tags: true,
  });
  blessed.text({
    parent: container,
    bottom: 0,
    left: 1,
    content: '{#5c6370-fg}j/k: Navigate{/#5c6370-fg}',
    tags: true,
  });

  return container;
}

interface ActionsContentResult {
  content: string;
  selectedLineNumber?: number;
}

function formatActionsContent(items: ActionItem[], selectedIndex?: number): ActionsContentResult {
  const lines: string[] = [];
  let selectableIndex = 0;
  let selectedLineNumber: number | undefined;

  for (const item of items) {
    // Skip hidden items entirely
    if (item.hidden) {
      continue;
    }

    if (item.type === 'separator') {
      lines.push(`{#6366f1-fg}${item.label}{/#6366f1-fg}`);
    } else {
      // Selectable item - only count non-disabled items for selection index
      const isSelectable = !item.disabled;
      const isSelected = isSelectable && selectedIndex === selectableIndex;

      if (isSelected) {
        selectedLineNumber = lines.length;
      }

      const content = formatItemContent(item, isSelected);
      lines.push(content);

      // Only increment selectableIndex for non-disabled items
      if (isSelectable) {
        selectableIndex++;
      }
    }
  }

  return { content: lines.join('\n'), selectedLineNumber };
}

function buildActionItems(toggleState: ToggleState): ActionItem[] {
  const prLabel = getPRActionLabel(toggleState.prActionState);
  const prDisabled = toggleState.prActionState === 'awaiting-review';

  const { hasSpec, hasCompletedPrompts, compoundRun, prReviewUnlocked } = toggleState;

  // Dynamic label for switch/choose spec
  const specLabel = hasSpec ? 'Switch Spec' : 'Choose Spec';

  return [
    // Agent spawners - coordinator and ideation always available
    { id: 'coordinator', label: 'Coordinator', key: '1', type: 'action' },
    { id: 'ideation', label: 'Ideation', key: '2', type: 'action' },
    // Planner requires spec
    { id: 'planner', label: 'Planner', key: '3', type: 'action', disabled: !hasSpec },
    // These require at least 1 completed prompt
    { id: 'e2e-test-planner', label: 'Build E2E Test', key: '4', type: 'action', hidden: !hasCompletedPrompts },
    { id: 'review-jury', label: 'Review Jury', key: '5', type: 'action', hidden: !hasCompletedPrompts },
    // PR action row (Create PR / Awaiting Review... / Rerun PR Review)
    { id: 'pr-action', label: prLabel, key: '6', type: 'action', disabled: prDisabled, hidden: !hasCompletedPrompts },
    // Review PR - only visible after first PR review detected
    { id: 'review-pr', label: 'Review PR', key: '7', type: 'action', hidden: !prReviewUnlocked },
    // Compound (shifted from 7 to 8)
    { id: 'compound', label: 'Compound', key: '8', type: 'action', hidden: !hasCompletedPrompts },
    // Mark completed - only visible if compound has been run (shifted from 8 to 9)
    { id: 'mark-completed', label: 'Mark Completed', key: '9', type: 'action', hidden: !compoundRun },
    // Switch/Choose spec - always visible, label changes (shifted from 9 to 0)
    { id: 'switch-spec', label: specLabel, key: '0', type: 'action' },
    // Custom Flow - always visible, allows running any flow with custom message
    { id: 'custom-flow', label: 'Custom Flow', key: '-', type: 'action' },
    // Spacing before toggles
    { id: 'spacer-1', label: '', type: 'separator' },
    { id: 'separator-toggles', label: '━━ Toggles ━━', type: 'separator' },
    { id: 'toggle-loop', label: 'Loop', key: 'O', type: 'toggle', checked: toggleState.loopEnabled },
    { id: 'toggle-emergent', label: 'Emergent', key: 'E', type: 'toggle', checked: toggleState.emergentEnabled },
    { id: 'toggle-parallel', label: 'Parallel', key: 'P', type: 'toggle', checked: toggleState.parallelEnabled },
    // Spacing before controls
    { id: 'spacer-2', label: '', type: 'separator' },
    { id: 'separator-bottom', label: '━━ Controls ━━', type: 'separator' },
    { id: 'view-logs', label: 'View Logs', key: 'V', type: 'action' },
    { id: 'clear-logs', label: 'Clear Logs', key: 'C', type: 'action' },
    { id: 'refresh', label: 'Refresh', key: 'R', type: 'action' },
    { id: 'quit', label: 'Quit', key: 'Q', type: 'action' },
  ];
}

function getPRActionLabel(state: PRActionState): string {
  switch (state) {
    case 'create-pr':
      return 'Create PR';
    case 'awaiting-review':
      return 'Awaiting Review...';
    case 'rerun-pr-review':
      return 'Rerun PR Review';
  }
}

function formatItemContent(item: ActionItem, isSelected: boolean): string {
  const prefix = item.key ? `{#818cf8-fg}[${item.key}]{/#818cf8-fg} ` : '    ';
  let label = item.label;

  // Toggle checkbox
  if (item.type === 'toggle') {
    const checkbox = item.checked ? '{#10b981-fg}[x]{/#10b981-fg}' : '{#5c6370-fg}[ ]{/#5c6370-fg}';
    label = `${checkbox} ${label}`;
  }

  // Apply styling
  let style = '';
  let endStyle = '';

  if (item.disabled) {
    style = '{#3a3f5c-fg}';
    endStyle = '{/#3a3f5c-fg}';
  } else if (isSelected) {
    style = '{#a78bfa-fg}{bold}▸ ';
    endStyle = '{/bold}{/#a78bfa-fg}';
    // For selected items, use plain prefix without colors
    return `${style}${item.key ? `[${item.key}] ` : ''}${label}${endStyle}`;
  } else if (item.highlight) {
    style = '{#f59e0b-fg}';
    endStyle = '{/#f59e0b-fg}';
  }

  return `${style}${prefix}${label}${endStyle}`;
}

export function getSelectableItems(toggleState: ToggleState): ActionItem[] {
  return buildActionItems(toggleState).filter(
    (item) => item.type !== 'separator' && !item.disabled && !item.hidden
  );
}
