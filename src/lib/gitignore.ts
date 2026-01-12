import { existsSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { minimatch } from 'minimatch';
import { walkDir } from './fs-utils.js';

interface GitignoreRule {
  pattern: string;
  negated: boolean;
  directory: string; // Directory where the .gitignore lives (relative to root)
}

/**
 * Parse a single .gitignore file and return rules.
 */
function parseGitignoreFile(content: string, directory: string): GitignoreRule[] {
  const rules: GitignoreRule[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    let pattern = trimmed;
    let negated = false;

    // Handle negation
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }

    // Remove trailing spaces (unless escaped)
    pattern = pattern.replace(/(?<!\\)\s+$/, '');

    // Skip empty patterns after processing
    if (!pattern) continue;

    rules.push({ pattern, negated, directory });
  }

  return rules;
}

/**
 * Check if a file path matches a gitignore pattern.
 * Handles directory-relative patterns correctly.
 */
function matchesPattern(filePath: string, rule: GitignoreRule): boolean {
  const { pattern, directory } = rule;

  // Get the path relative to the gitignore's directory
  let relativePath = filePath;
  if (directory) {
    if (!filePath.startsWith(directory + '/') && filePath !== directory) {
      // File is not under this gitignore's directory
      return false;
    }
    relativePath = filePath.slice(directory.length + 1);
  }

  // Handle patterns that should only match from root of gitignore dir
  let matchPattern = pattern;

  // Pattern starting with / means root-relative
  if (pattern.startsWith('/')) {
    matchPattern = pattern.slice(1);
  }

  // Pattern ending with / means directory only (we treat all as potential matches)
  if (matchPattern.endsWith('/')) {
    matchPattern = matchPattern.slice(0, -1) + '/**';
  }

  // If pattern has no slash, it can match at any level
  // If pattern has slash (not just trailing), it's relative to gitignore location
  const hasSlash = pattern.includes('/') && !pattern.endsWith('/');

  if (!hasSlash && !pattern.startsWith('/')) {
    // Match at any level: foo matches a/b/foo and foo
    matchPattern = '**/' + matchPattern;
  }

  // Try matching
  const opts = { dot: true, matchBase: false };

  if (minimatch(relativePath, matchPattern, opts)) {
    return true;
  }

  // Also try with ** suffix for directories
  if (minimatch(relativePath, matchPattern + '/**', opts)) {
    return true;
  }

  return false;
}

/**
 * Collector class that gathers all .gitignore rules from a directory tree.
 */
export class GitignoreFilter {
  private rules: GitignoreRule[] = [];
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.loadGitignoreFiles();
  }

  /**
   * Walk the directory tree and load all .gitignore files.
   */
  private loadGitignoreFiles(): void {
    // Check root .gitignore
    const rootGitignore = join(this.rootDir, '.gitignore');
    if (existsSync(rootGitignore)) {
      const content = readFileSync(rootGitignore, 'utf-8');
      this.rules.push(...parseGitignoreFile(content, ''));
    }

    // Walk and find nested .gitignore files
    walkDir(this.rootDir, (filePath) => {
      const relativePath = relative(this.rootDir, filePath);
      if (relativePath.endsWith('.gitignore') && relativePath !== '.gitignore') {
        const content = readFileSync(filePath, 'utf-8');
        const directory = dirname(relativePath);
        this.rules.push(...parseGitignoreFile(content, directory));
      }
    });
  }

  /**
   * Check if a file should be ignored based on all gitignore rules.
   */
  isIgnored(filePath: string): boolean {
    let ignored = false;

    // Process rules in order - later rules can override earlier ones
    for (const rule of this.rules) {
      if (matchesPattern(filePath, rule)) {
        ignored = !rule.negated;
      }
    }

    return ignored;
  }

  /**
   * Get all non-ignored files from the directory tree.
   */
  getNonIgnoredFiles(): string[] {
    const files: string[] = [];

    walkDir(this.rootDir, (filePath) => {
      const relativePath = relative(this.rootDir, filePath);
      if (!this.isIgnored(relativePath)) {
        files.push(relativePath);
      }
    });

    return files;
  }
}
