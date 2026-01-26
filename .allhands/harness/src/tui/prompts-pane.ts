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
  path: string;
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
      ch: '┃',
      track: {
        bg: 'black',
      },
      style: {
        fg: '#4A34C5',
      },
    },
    style: {
      border: {
        fg: '#4A34C5',
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
    content: '{#5c6370-fg}u/d: Page Up/Down{/#5c6370-fg}',
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
    return '{#5c6370-fg}  No prompts found{/#5c6370-fg}';
  }

  const lines: string[] = [];
  let currentStatus: string | null = null;
  let itemIndex = 0;

  for (const prompt of prompts) {
    // Add section separator when status changes
    if (prompt.status !== currentStatus) {
      if (currentStatus !== null) {
        lines.push('{#3a3f5c-fg}━━━━━━━━━━━━━━━━━━━━━━━━{/#3a3f5c-fg}');
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
      return '{#10b981-fg}✓{/#10b981-fg}';
    case 'in_progress':
      return '{#a78bfa-fg}▶{/#a78bfa-fg}';
    case 'pending':
      return '{#5c6370-fg}○{/#5c6370-fg}';
    default:
      return '?';
  }
}
