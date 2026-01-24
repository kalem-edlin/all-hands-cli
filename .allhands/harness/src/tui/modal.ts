/**
 * Modal - Overlay modal component for TUI
 *
 * Used for:
 * - Switch Milestone selection
 * - Activity Log view
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
  const { title, items, onSelect, onCancel, scrollable = false } = options;

  // Calculate modal size
  const width = 50;
  const height = Math.min(items.length + 6, Math.floor(screen.height as number * 0.8));

  // Create overlay box
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
    scrollable,
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
      border: {
        fg: 'yellow',
      },
      bg: 'black',
    },
  });

  // Focus this element
  box.focus();

  // Track selection state
  let selectedIndex = 0;

  // Find first selectable item
  const selectableItems = items.filter((item) => item.type === 'item');
  if (selectableItems.length > 0) {
    selectedIndex = items.findIndex((item) => item.type === 'item');
  }

  // Render items
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

    box.setContent(lines.join('\n'));
  }

  // Add help text
  blessed.text({
    parent: box,
    bottom: 0,
    left: 1,
    content: '{gray-fg}[Space] Select  [Esc] Cancel{/gray-fg}',
    tags: true,
  });

  // Navigation
  function navigate(delta: number): void {
    const selectableIndices = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.type === 'item')
      .map(({ index }) => index);

    if (selectableIndices.length === 0) return;

    const currentPos = selectableIndices.indexOf(selectedIndex);
    let newPos = currentPos + delta;

    // Clamp
    newPos = Math.max(0, Math.min(selectableIndices.length - 1, newPos));
    selectedIndex = selectableIndices[newPos];

    renderItems();
    screen.render();
  }

  function select(): void {
    const item = items[selectedIndex];
    if (item && item.type === 'item') {
      onSelect(item.id);
    }
  }

  // Set up modal-specific key bindings
  box.key(['j'], () => navigate(1));
  box.key(['k'], () => navigate(-1));
  box.key(['u'], () => navigate(-5));
  box.key(['d'], () => navigate(5));
  box.key(['space', 'enter'], () => select());
  box.key(['escape'], () => onCancel());

  // Initial render
  renderItems();
  screen.render();

  return {
    box,
    selectedIndex,
    destroy: () => box.destroy(),
    navigate,
    select,
  };
}
