/**
 * Prompts Pane - Center area showing prompt list by status
 *
 * Order:
 * 1. Active (in_progress) at top
 * 2. Unimplemented (pending) next
 * 3. Implemented (done) at bottom
 *
 * Each section sorted by prompt number.
 */

import blessed from 'blessed';

export interface PromptItem {
  number: number;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
}

const ACTIONS_WIDTH = 24;
const HEADER_HEIGHT = 3;

export function createPromptsPane(
  screen: blessed.Widgets.Screen,
  prompts: PromptItem[],
  selectedIndex?: number
): blessed.Widgets.BoxElement {
  const pane = blessed.box({
    parent: screen,
    top: HEADER_HEIGHT,
    left: ACTIONS_WIDTH,
    width: '50%-12',
    height: `100%-${HEADER_HEIGHT}`,
    border: {
      type: 'line',
    },
    label: ' Prompts ',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '│',
      track: {
        bg: 'gray',
      },
      style: {
        inverse: true,
      },
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
  });

  // Sort prompts by status then number
  const sorted = sortPrompts(prompts);
  const content = formatPromptsContent(sorted, selectedIndex);

  pane.setContent(content);

  // Add help text at bottom
  blessed.text({
    parent: pane,
    bottom: 0,
    left: 1,
    content: '{gray-fg}u/d: Page Up/Down{/gray-fg}',
    tags: true,
  });

  return pane;
}

function sortPrompts(prompts: PromptItem[]): PromptItem[] {
  const inProgress = prompts
    .filter((p) => p.status === 'in_progress')
    .sort((a, b) => a.number - b.number);

  const pending = prompts
    .filter((p) => p.status === 'pending')
    .sort((a, b) => a.number - b.number);

  const done = prompts
    .filter((p) => p.status === 'done')
    .sort((a, b) => a.number - b.number);

  return [...inProgress, ...pending, ...done];
}

function formatPromptsContent(prompts: PromptItem[], selectedIndex?: number): string {
  if (prompts.length === 0) {
    return '{gray-fg}  No prompts found{/gray-fg}';
  }

  const lines: string[] = [];
  let currentStatus: string | null = null;
  let itemIndex = 0;

  for (const prompt of prompts) {
    // Add section separator when status changes
    if (prompt.status !== currentStatus) {
      if (currentStatus !== null) {
        lines.push('{gray-fg}────────────────────────{/gray-fg}');
      }
      currentStatus = prompt.status;
    }

    const isSelected = selectedIndex === itemIndex;
    const line = formatPromptLine(prompt, isSelected);
    lines.push(line);
    itemIndex++;
  }

  return lines.join('\n');
}

function formatPromptLine(prompt: PromptItem, isSelected: boolean): string {
  const icon = getStatusIcon(prompt.status);
  const numStr = String(prompt.number).padStart(2, '0');

  // Truncate title if too long
  const maxTitleLen = 30;
  let title = prompt.title;
  if (title.length > maxTitleLen) {
    title = title.substring(0, maxTitleLen - 3) + '...';
  }

  const content = `${icon} ${numStr}. ${title}`;

  if (isSelected) {
    return `{inverse}${content}{/inverse}`;
  }

  return content;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'done':
      return '{green-fg}✓{/green-fg}';
    case 'in_progress':
      return '{yellow-fg}▶{/yellow-fg}';
    case 'pending':
      return '{gray-fg}○{/gray-fg}';
    default:
      return '?';
  }
}
