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
  // Create outer container (non-scrollable, holds border and help text)
  const container = blessed.box({
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
    style: {
      border: {
        fg: '#4A34C5',
      },
    },
  });

  // Calculate content area height (container minus borders minus help text line)
  const containerHeight = typeof container.height === 'number' ? container.height : (screen.height as number) - HEADER_HEIGHT;
  const contentHeight = containerHeight - 3; // 2 for borders, 1 for help text

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

  // Sort prompts by status then number
  const sorted = sortPrompts(prompts);
  const { content, selectedLineNumber } = formatPromptsContentWithLineInfo(sorted, selectedIndex);

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
    bottom: 0,
    left: 1,
    content: '{#5c6370-fg}u/d: Page Up/Down{/#5c6370-fg}',
    tags: true,
  });

  return container;
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

interface PromptsContentResult {
  content: string;
  selectedLineNumber?: number;
}

function formatPromptsContentWithLineInfo(prompts: PromptItem[], selectedIndex?: number): PromptsContentResult {
  if (prompts.length === 0) {
    return { content: '{#5c6370-fg}  No prompts found{/#5c6370-fg}' };
  }

  const lines: string[] = [];
  let currentStatus: string | null = null;
  let itemIndex = 0;
  let selectedLineNumber: number | undefined;

  for (const prompt of prompts) {
    // Add section separator when status changes
    if (prompt.status !== currentStatus) {
      if (currentStatus !== null) {
        lines.push('{#3a3f5c-fg}━━━━━━━━━━━━━━━━━━━━━━━━{/#3a3f5c-fg}');
      }
      currentStatus = prompt.status;
    }

    const isSelected = selectedIndex === itemIndex;
    if (isSelected) {
      selectedLineNumber = lines.length; // Track the line number (0-indexed)
    }
    const line = formatPromptLine(prompt, isSelected);
    lines.push(line);
    itemIndex++;
  }

  return { content: lines.join('\n'), selectedLineNumber };
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
