/**
 * Modal - Overlay modal component for TUI
 *
 * Used for:
 * - Switch Spec selection
 * - Activity Log view
 * - Custom Flow selection
 *
 * Navigation:
 * - j/k: Navigate items
 * - u/d: Page up/down
 * - Space/Enter: Select item
 * - Esc: Close modal
 */

import blessed from 'blessed';

export interface ModalItem {
  id: string;
  label: string;
  type: 'header' | 'item';
}

export interface ModalOptions {
  title: string;
  items: ModalItem[];
  onSelect: (id: string) => void;
  onCancel: () => void;
  onClear?: () => void;
  scrollable?: boolean;
}

export interface Modal {
  box: blessed.Widgets.BoxElement;
  selectedIndex: number;
  destroy: () => void;
  navigate: (delta: number) => void;
  select: () => void;
}

export function createModal(
  screen: blessed.Widgets.Screen,
  options: ModalOptions
): Modal {
  const { title, items, onSelect, onCancel, onClear, scrollable = false } = options;

  // Calculate modal size
  const width = 50;
  const height = Math.min(items.length + 6, Math.floor(screen.height as number * 0.8));

  // Create outer container (non-scrollable, holds border and help text)
  const container = blessed.box({
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
    style: {
      border: {
        fg: 'yellow',
      },
      bg: 'black',
    },
  });

  // Height available for content (container height minus borders minus help text line)
  const contentHeight = height - 4; // 2 for borders, 2 for help text area

  // Create scrollable list inside the container
  const list = blessed.list({
    parent: container,
    top: 0,
    left: 0,
    width: width - 4, // Account for container borders and padding
    height: contentHeight,
    tags: true,
    scrollable: scrollable,
    alwaysScroll: scrollable,
    scrollbar: scrollable
      ? {
          ch: '│',
          track: {
            bg: 'gray',
          },
          style: {
            inverse: true,
          },
        }
      : {
          ch: ' ',
        },
    style: {
      bg: 'black',
      selected: {
        bg: 'black',
      },
    },
    keys: false, // We handle keys ourselves
    mouse: false,
  });

  // Add help text (fixed at bottom of container, outside scrollable area)
  const helpText = onClear
    ? '{gray-fg}[Space] Select  [x] Close  [Esc] Cancel{/gray-fg}'
    : '{gray-fg}[Space] Select  [Esc] Cancel{/gray-fg}';
  blessed.text({
    parent: container,
    bottom: 0,
    left: 1,
    content: helpText,
    tags: true,
  });

  // Focus the container for key events
  container.focus();

  // Track selection state
  let selectedIndex = 0;

  // Find first selectable item
  const selectableIndices = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'item')
    .map(({ index }) => index);

  if (selectableIndices.length > 0) {
    selectedIndex = selectableIndices[0];
  }

  // Track current scroll position manually since setItems resets it
  let currentScrollPos = 0;

  // Render items to the list
  function renderItems(): void {
    const lines: string[] = [];

    items.forEach((item, index) => {
      if (item.type === 'header') {
        lines.push(`{cyan-fg}${item.label}{/cyan-fg}`);
      } else {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? '{inverse}> ' : '  ';
        const suffix = isSelected ? '{/inverse}' : '';
        lines.push(`${prefix}${item.label}${suffix}`);
      }
    });

    // setItems resets scroll, so we need to restore it after
    list.setItems(lines);
    if (scrollable && currentScrollPos > 0) {
      list.scrollTo(currentScrollPos);
    }
  }

  // Scroll to ensure selected item is visible
  function scrollToSelected(): void {
    if (!scrollable || contentHeight <= 0) return;

    // Calculate where selected item should be visible
    // If selected item is below visible area, scroll down
    if (selectedIndex >= currentScrollPos + contentHeight) {
      currentScrollPos = selectedIndex - contentHeight + 1;
    }
    // If selected item is above visible area, scroll up
    else if (selectedIndex < currentScrollPos) {
      // If this is the first selectable item, scroll to top to show headers
      if (selectedIndex === selectableIndices[0]) {
        currentScrollPos = 0;
      } else {
        currentScrollPos = selectedIndex;
      }
    }

    // Clamp scroll position
    const maxScroll = Math.max(0, items.length - contentHeight);
    currentScrollPos = Math.max(0, Math.min(currentScrollPos, maxScroll));

    list.scrollTo(currentScrollPos);
  }

  // Navigation
  function navigate(delta: number): void {
    if (selectableIndices.length === 0) return;

    const currentPos = selectableIndices.indexOf(selectedIndex);
    let newPos = currentPos + delta;

    // Clamp
    newPos = Math.max(0, Math.min(selectableIndices.length - 1, newPos));
    selectedIndex = selectableIndices[newPos];

    renderItems();
    scrollToSelected();
    screen.render();
  }

  function select(): void {
    const item = items[selectedIndex];
    if (item && item.type === 'item') {
      onSelect(item.id);
    }
  }

  // Set up key bindings on container
  container.key(['j', 'down'], () => navigate(1));
  container.key(['k', 'up'], () => navigate(-1));
  container.key(['u'], () => navigate(-5));
  container.key(['d'], () => navigate(5));
  container.key(['space', 'enter'], () => select());
  container.key(['escape'], () => onCancel());
  if (onClear) {
    container.key(['x'], () => onClear());
  }

  // Initial render
  renderItems();
  scrollToSelected();
  screen.render();

  return {
    box: container,
    selectedIndex,
    destroy: () => container.destroy(),
    navigate,
    select,
  };
}
