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
import { parse as parseYaml } from 'yaml';

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

  // Create outer container (non-scrollable, holds border and help text)
  const container = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width,
    height,
    border: 'line',
    label: ` ${title} `,
    tags: true,
    style: {
      border: {
        fg: '#c4b5fd',
        bold: true,
      },
      fg: '#e0e7ff',
    },
  });

  // Calculate content area height (container minus borders minus help text)
  // Container inner area = height - 2 (borders), minus 1 for help text = height - 3
  const contentHeight = height - 4; // Be more conservative to ensure we don't clip

  // Create scrollable content area inside the container
  const scrollArea = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: '100%-2', // Fill width minus scrollbar space
    height: contentHeight,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: false,
    vi: false,
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
      fg: '#e0e7ff',
    },
  });

  // Set content
  scrollArea.setContent(content);

  // Focus the container for key events
  container.focus();

  // Track scroll position
  let scrollPosition = 0;
  const contentLines = content.split('\n').length;
  const visibleLines = contentHeight;
  // Allow scrolling to show the last line at the top of the view
  // This ensures we can always reach the true bottom of the file
  const maxScroll = Math.max(0, contentLines);

  function updateScroll(): void {
    scrollArea.scrollTo(scrollPosition);
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

  // Set up key bindings on container
  container.key(['j'], () => scrollDown(1));
  container.key(['k'], () => scrollUp(1));
  container.key(['u'], () => scrollUp(Math.floor(visibleLines / 2)));
  container.key(['d'], () => scrollDown(Math.floor(visibleLines / 2)));
  container.key(['g'], () => scrollToTop());
  container.key(['S-g'], () => scrollToBottom()); // Shift+G
  container.key(['escape'], () => onClose());

  // Add help text at bottom of container (fixed position, outside scroll area)
  blessed.text({
    parent: container,
    bottom: 0,
    left: 1,
    content: '{#5c6370-fg}j/k:scroll  u/d:page  g/G:top/bottom  Esc:close{/#5c6370-fg}',
    tags: true,
  });

  // Initial render
  screen.render();

  return {
    box: container,
    destroy: () => container.destroy(),
    scrollUp,
    scrollDown,
    scrollToTop,
    scrollToBottom,
  };
}

/**
 * Check if a planning file exists for the given spec and file type
 * Tries multiple folder name formats to handle branch name variations
 */
export function getPlanningFilePath(
  cwd: string,
  spec: string,
  fileType: 'alignment' | 'e2e_test_plan'
): string | null {
  // Try multiple filename variations (underscore vs hyphen)
  const filenames = fileType === 'alignment'
    ? ['alignment.md']
    : ['e2e-test-plan.md', 'e2e_test_plan.md'];

  // Try multiple folder name variations to handle branch naming differences
  // e.g., "feature/core-taskflow" might be stored as "feature-core-taskflow"
  const folderVariations = [
    spec,                                    // Original: feature/core-taskflow
    spec.replace(/\//g, '-'),               // Slashes to hyphens: feature-core-taskflow
    spec.replace(/[/\\]/g, '-'),            // All path separators to hyphens
  ];

  for (const folderName of folderVariations) {
    for (const filename of filenames) {
      const filePath = join(cwd, '.planning', folderName, filename);
      if (existsSync(filePath)) {
        return filePath;
      }
    }
  }

  return null;
}

/**
 * Get the spec file path for a spec
 * First tries to read from status.yaml, then falls back to common locations
 */
export function getSpecFilePath(cwd: string, specId: string): string | null {
  // Try variations of the spec ID (slashes to hyphens, etc.)
  const specIdVariations = [
    specId,
    specId.replace(/\//g, '-'),
    specId.replace(/[/\\]/g, '-'),
  ];

  // First, try to read the spec path from status.yaml in the planning directory
  for (const id of specIdVariations) {
    const statusPath = join(cwd, '.planning', id, 'status.yaml');
    if (existsSync(statusPath)) {
      try {
        const content = readFileSync(statusPath, 'utf-8');
        const status = parseYaml(content) as { spec?: string };
        if (status?.spec) {
          // The spec path in status.yaml might be relative or absolute
          const specPath = status.spec.startsWith('/')
            ? status.spec
            : join(cwd, status.spec);
          if (existsSync(specPath)) {
            return specPath;
          }
        }
      } catch {
        // Ignore parse errors, continue to fallback
      }
    }
  }

  // Fallback: try common spec file locations
  const locations: string[] = [];

  for (const id of specIdVariations) {
    // Check specs/ folder
    locations.push(join(cwd, 'specs', `${id}.spec.md`));
    locations.push(join(cwd, 'specs', `${id}.md`));
    // Check .specs/ folder
    locations.push(join(cwd, '.specs', `${id}.spec.md`));
    locations.push(join(cwd, '.specs', `${id}.md`));
    // Check .planning/ folder (spec.md inside the planning dir)
    locations.push(join(cwd, '.planning', id, 'spec.md'));
    locations.push(join(cwd, '.planning', id, `${id}.spec.md`));
  }

  for (const filePath of locations) {
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}
