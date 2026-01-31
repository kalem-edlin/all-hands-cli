import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { minimatch } from 'minimatch';
import { GitignoreFilter } from './gitignore.js';

interface InternalData {
  internal?: string[];
  initOnly?: string[];
}

const INTERNAL_FILENAME = '.internal.json';

export class Manifest {
  private allhandsRoot: string;
  private internalPath: string;
  private data: InternalData;
  private gitignoreFilter: GitignoreFilter;

  constructor(allhandsRoot: string) {
    this.allhandsRoot = allhandsRoot;
    this.internalPath = join(allhandsRoot, INTERNAL_FILENAME);
    this.data = this.load();
    this.gitignoreFilter = new GitignoreFilter(allhandsRoot);
  }

  private load(): InternalData {
    if (!existsSync(this.internalPath)) {
      throw new Error(`Internal config not found: ${this.internalPath}`);
    }
    const content = readFileSync(this.internalPath, 'utf-8');
    return JSON.parse(content);
  }

  get internalPatterns(): string[] {
    return this.data.internal || [];
  }

  get initOnlyPatterns(): string[] {
    return this.data.initOnly || [];
  }

  /**
   * Check if a file is marked as internal (should not be distributed).
   */
  isInternal(path: string): boolean {
    return this.internalPatterns.some(pattern => minimatch(path, pattern, { dot: true }));
  }

  /**
   * Check if a file is init-only using last-match-wins semantics with negation support.
   * Patterns starting with `!` exempt matching files from being init-only.
   */
  isInitOnly(path: string): boolean {
    let initOnly = false;
    for (const pattern of this.initOnlyPatterns) {
      if (pattern.startsWith('!')) {
        if (minimatch(path, pattern.slice(1), { dot: true })) {
          initOnly = false;
        }
      } else {
        if (minimatch(path, pattern, { dot: true })) {
          initOnly = true;
        }
      }
    }
    return initOnly;
  }

  /**
   * Check if a file is gitignored.
   */
  isGitignored(path: string): boolean {
    return this.gitignoreFilter.isIgnored(path);
  }

  /**
   * Check if a file should be distributed.
   * A file is distributable if it's NOT internal AND NOT gitignored.
   */
  isDistributable(path: string): boolean {
    return !this.isInternal(path) && !this.isGitignored(path);
  }

  /**
   * Get all distributable files from the allhands root.
   * Returns files that are NOT internal AND NOT gitignored.
   */
  getDistributableFiles(): Set<string> {
    const allFiles = this.gitignoreFilter.getNonIgnoredFiles();
    const filtered = new Set<string>();

    for (const file of allFiles) {
      if (!this.isInternal(file)) {
        filtered.add(file);
      }
    }

    return filtered;
  }
}

/**
 * Compare two files byte-by-byte.
 */
export function filesAreDifferent(file1: string, file2: string): boolean {
  if (!existsSync(file1) || !existsSync(file2)) {
    return true;
  }

  const stat1 = statSync(file1);
  const stat2 = statSync(file2);

  if (stat1.size !== stat2.size) {
    return true;
  }

  const content1 = readFileSync(file1);
  const content2 = readFileSync(file2);

  return !content1.equals(content2);
}
