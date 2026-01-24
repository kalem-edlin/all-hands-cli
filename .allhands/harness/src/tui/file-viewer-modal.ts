/**
 * File Viewer Modal - Scrollable modal for viewing markdown files
 *
 * Used for viewing:
 * - Spec files
 * - Alignment documents
 * - E2E test plans
 * - Prompt files
 *
 * Navigation:
 * - j/k: Scroll one line up/down
 * - u/d: Page up/down
 * - g: Jump to top
 * - G: Jump to bottom
 * - Esc: Close modal
 */

import blessed from 'blessed';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface FileViewerOptions {
  title: string;
  filePath: string;
  onClose: () => void;
}

export interface FileViewer {
  box: blessed.Widgets.BoxElement;
  destroy: () => void;
  scrollUp: (lines?: number) => void;
  scrollDown: (lines?: number) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

export function createFileViewer(
  screen: blessed.Widgets.Screen,
  options: FileViewerOptions
): FileViewer | null {
  const { title, filePath, onClose } = options;

  // Check if file exists
  if (!existsSync(filePath)) {
    return null;
  }

  // Read file content
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  // Calculate modal size (80% of screen)
  const width = Math.floor((screen.width as number) * 0.8);
  const height = Math.floor((screen.height as number) * 0.8);

  // Create scrollable box
  const box = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width,
    height,
    border: {
      type: 'line',
    },
    label: ` ${title} `,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: false, // We handle keys manually
    vi: false,
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
        fg: 'yellow',
      },
      bg: 'black',
      fg: 'white',
    },
  });

  // Set content
  box.setContent(content);

  // Focus this element
  box.focus();

  // Track scroll position
  let scrollPosition = 0;
  const contentLines = content.split('\n').length;
  const visibleLines = height - 2; // Account for border
  const maxScroll = Math.max(0, contentLines - visibleLines);

  function updateScroll(): void {
    box.scrollTo(scrollPosition);
    screen.render();
  }

  function scrollUp(lines: number = 1): void {
    scrollPosition = Math.max(0, scrollPosition - lines);
    updateScroll();
  }

  function scrollDown(lines: number = 1): void {
    scrollPosition = Math.min(maxScroll, scrollPosition + lines);
    updateScroll();
  }

  function scrollToTop(): void {
    scrollPosition = 0;
    updateScroll();
  }

  function scrollToBottom(): void {
    scrollPosition = maxScroll;
    updateScroll();
  }

  // Set up key bindings
  box.key(['j'], () => scrollDown(1));
  box.key(['k'], () => scrollUp(1));
  box.key(['u'], () => scrollUp(Math.floor(visibleLines / 2)));
  box.key(['d'], () => scrollDown(Math.floor(visibleLines / 2)));
  box.key(['g'], () => scrollToTop());
  box.key(['S-g'], () => scrollToBottom()); // Shift+G
  box.key(['escape'], () => onClose());

  // Add help text at bottom
  blessed.text({
    parent: box,
    bottom: 0,
    left: 1,
    content: '{gray-fg}j/k:scroll  u/d:page  g/G:top/bottom  Esc:close{/gray-fg}',
    tags: true,
  });

  // Initial render
  screen.render();

  return {
    box,
    destroy: () => box.destroy(),
    scrollUp,
    scrollDown,
    scrollToTop,
    scrollToBottom,
  };
}

/**
 * Check if a planning file exists for the given branch and file type
 */
export function getPlanningFilePath(
  cwd: string,
  branch: string,
  fileType: 'alignment' | 'e2e_test_plan'
): string | null {
  const filename = fileType === 'alignment' ? 'alignment.md' : 'e2e_test_plan.md';
  const filePath = join(cwd, '.planning', branch, filename);
  return existsSync(filePath) ? filePath : null;
}

/**
 * Get the spec file path for a milestone
 */
export function getSpecFilePath(cwd: string, specId: string): string | null {
  // Check common spec locations
  const locations = [
    join(cwd, 'specs', `${specId}.spec.md`),
    join(cwd, 'specs', `${specId}.md`),
    join(cwd, '.specs', `${specId}.spec.md`),
    join(cwd, '.specs', `${specId}.md`),
  ];

  for (const filePath of locations) {
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}
