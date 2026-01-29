/**
 * Flow File Management
 *
 * Loads flow files from .allhands/flows/ directory and converts them
 * to modal items for the TUI custom flow selection.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ModalItem } from '../tui/modal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface FlowFile {
  /** Display name (filename without .md) */
  name: string;
  /** Relative path from flows directory (e.g., "shared/jury/BEST_PRACTICES_REVIEW.md") */
  relativePath: string;
  /** Absolute path to the flow file */
  absolutePath: string;
  /** Directory group (e.g., "", "shared", "shared/jury") */
  directory: string;
}

export interface FlowGroup {
  /** Directory path (empty string for root) */
  directory: string;
  /** Display label for the group */
  label: string;
  /** Flow files in this group */
  flows: FlowFile[];
}

/**
 * Get the flows directory path
 */
function getFlowsDir(): string {
  // Path: harness/src/lib/ -> harness/src/ -> harness/ -> .allhands/ -> flows/
  return join(__dirname, '..', '..', '..', 'flows');
}

/**
 * Recursively collect all .md files from a directory
 */
function collectFlowFiles(baseDir: string, currentDir: string, relativePath: string = ''): FlowFile[] {
  const flows: FlowFile[] = [];

  if (!existsSync(currentDir)) {
    return flows;
  }

  const entries = readdirSync(currentDir);

  for (const entry of entries) {
    const fullPath = join(currentDir, entry);
    const relPath = relativePath ? join(relativePath, entry) : entry;
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Recurse into subdirectories
      flows.push(...collectFlowFiles(baseDir, fullPath, relPath));
    } else if (entry.endsWith('.md')) {
      flows.push({
        name: entry.replace('.md', ''),
        relativePath: relPath,
        absolutePath: fullPath,
        directory: relativePath,
      });
    }
  }

  return flows;
}

/**
 * Load all flow files from the flows directory
 *
 * Returns flows grouped by their directory structure.
 */
export function loadAllFlows(): FlowGroup[] {
  const flowsDir = getFlowsDir();
  const allFlows = collectFlowFiles(flowsDir, flowsDir);

  // Group flows by directory
  const groupMap = new Map<string, FlowFile[]>();

  for (const flow of allFlows) {
    const dir = flow.directory;
    const existing = groupMap.get(dir) ?? [];
    existing.push(flow);
    groupMap.set(dir, existing);
  }

  // Convert to FlowGroup array, sorted by directory depth then name
  const groups: FlowGroup[] = [];
  const sortedDirs = Array.from(groupMap.keys()).sort((a, b) => {
    // Root first, then by depth, then alphabetically
    if (a === '' && b !== '') return -1;
    if (b === '' && a !== '') return 1;
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });

  for (const dir of sortedDirs) {
    const flows = groupMap.get(dir) ?? [];
    // Sort flows by name within each group
    flows.sort((a, b) => a.name.localeCompare(b.name));

    groups.push({
      directory: dir,
      label: dir === '' ? 'Root Flows' : dir.replace(/\//g, ' / '),
      flows,
    });
  }

  return groups;
}

/**
 * Convert flow groups to modal items for display
 */
export function flowsToModalItems(groups: FlowGroup[]): ModalItem[] {
  const items: ModalItem[] = [];

  for (const group of groups) {
    // Add header for this group
    items.push({
      id: `header-${group.directory || 'root'}`,
      label: group.label,
      type: 'header',
    });

    // Add flow items
    for (const flow of group.flows) {
      items.push({
        id: flow.absolutePath, // Use absolute path as ID for easy lookup
        label: flow.name,
        type: 'item',
      });
    }
  }

  return items;
}

/**
 * Get the absolute path to the flows directory
 */
export function getFlowsDirectory(): string {
  return getFlowsDir();
}
