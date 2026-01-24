/**
 * Actions Pane - Left sidebar with agent spawners, toggles, and controls
 *
 * Layout (vertical):
 * [1] Coordinator
 * [2] Ideation
 * [3] Planner
 * [4] Build E2E Test
 * [5] Review Jury
 * [6] Create PR / Greptile Reviewing / Address PR Review
 * [7] Compound
 * [8] Switch Milestone
 * ─ Toggles ─
 * [ ] Loop
 * [ ] Emergent
 * ─────────
 * [Q] Quit
 * [R] Refresh
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
  checked?: boolean;
}

export interface ToggleState {
  loopEnabled: boolean;
  emergentEnabled: boolean;
  prActionState: PRActionState;
}

const PANE_WIDTH = 24;
const HEADER_HEIGHT = 3;

export function createActionsPane(
  screen: blessed.Widgets.Screen,
  toggleState: ToggleState,
  selectedIndex?: number
): blessed.Widgets.BoxElement {
  const pane = blessed.box({
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
        fg: 'cyan',
      },
    },
  });

  const items = buildActionItems(toggleState);
  let y = 0;
  let selectableIndex = 0;

  for (const item of items) {
    if (item.type === 'separator') {
      // Separator line
      blessed.text({
        parent: pane,
        top: y,
        left: 1,
        width: PANE_WIDTH - 4,
        content: `{gray-fg}${item.label}{/gray-fg}`,
        tags: true,
      });
      y += 1;
    } else {
      // Selectable item
      const isSelected = selectedIndex === selectableIndex;
      const content = formatItemContent(item, isSelected);

      blessed.text({
        parent: pane,
        top: y,
        left: 1,
        width: PANE_WIDTH - 4,
        content,
        tags: true,
      });

      y += 1;
      selectableIndex++;
    }
  }

  // Add help text at bottom
  blessed.text({
    parent: pane,
    bottom: 1,
    left: 1,
    content: '{gray-fg}Tab: Switch Pane{/gray-fg}',
    tags: true,
  });
  blessed.text({
    parent: pane,
    bottom: 0,
    left: 1,
    content: '{gray-fg}j/k: Navigate{/gray-fg}',
    tags: true,
  });

  return pane;
}

function buildActionItems(toggleState: ToggleState): ActionItem[] {
  const prLabel = getPRActionLabel(toggleState.prActionState);
  const prDisabled = toggleState.prActionState === 'greptile-reviewing';

  return [
    // Agent spawners
    { id: 'coordinator', label: 'Coordinator', key: '1', type: 'action' },
    { id: 'ideation', label: 'Ideation', key: '2', type: 'action' },
    { id: 'planner', label: 'Planner', key: '3', type: 'action' },
    { id: 'e2e-test-planner', label: 'Build E2E Test', key: '4', type: 'action' },
    { id: 'review-jury', label: 'Review Jury', key: '5', type: 'action' },
    { id: 'pr-action', label: prLabel, key: '6', type: 'action', disabled: prDisabled },
    { id: 'compound', label: 'Compound', key: '7', type: 'action' },
    { id: 'switch-milestone', label: 'Switch Milestone', key: '8', type: 'action' },
    // Spacing before toggles
    { id: 'spacer-1', label: '', type: 'separator' },
    { id: 'separator-toggles', label: '─── Toggles ───', type: 'separator' },
    { id: 'toggle-loop', label: 'Loop', key: 'O', type: 'toggle', checked: toggleState.loopEnabled },
    { id: 'toggle-emergent', label: 'Emergent', key: 'E', type: 'toggle', checked: toggleState.emergentEnabled },
    // Spacing before controls
    { id: 'spacer-2', label: '', type: 'separator' },
    { id: 'separator-bottom', label: '─── Controls ───', type: 'separator' },
    { id: 'quit', label: 'Quit', key: 'Q', type: 'action' },
    { id: 'refresh', label: 'Refresh', key: 'R', type: 'action' },
  ];
}

function getPRActionLabel(state: PRActionState): string {
  switch (state) {
    case 'create-pr':
      return 'Create PR';
    case 'greptile-reviewing':
      return 'Greptile Reviewing';
    case 'address-pr':
      return 'Address PR Review';
  }
}

function formatItemContent(item: ActionItem, isSelected: boolean): string {
  const prefix = item.key ? `[${item.key}] ` : '    ';
  let label = item.label;

  // Toggle checkbox
  if (item.type === 'toggle') {
    const checkbox = item.checked ? '[x]' : '[ ]';
    label = `${checkbox} ${label}`;
  }

  // Apply styling
  let style = '';
  let endStyle = '';

  if (item.disabled) {
    style = '{gray-fg}';
    endStyle = '{/gray-fg}';
  } else if (isSelected) {
    style = '{inverse}';
    endStyle = '{/inverse}';
  } else if (item.highlight) {
    style = '{yellow-fg}';
    endStyle = '{/yellow-fg}';
  }

  return `${style}${prefix}${label}${endStyle}`;
}

export function getSelectableItems(toggleState: ToggleState): ActionItem[] {
  return buildActionItems(toggleState).filter(
    (item) => item.type !== 'separator' && !item.disabled
  );
}
