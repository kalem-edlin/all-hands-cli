import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAllhandsRoot } from './paths.js';
import { ensureLineInFile } from './marker-sync.js';

export interface TargetLinesConfig {
  [filename: string]: string[];
}

/**
 * Load the target-lines.json config from the allhands root.
 */
export function loadTargetLines(): TargetLinesConfig {
  const configPath = join(getAllhandsRoot(), 'target-lines.json');
  const content = readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as TargetLinesConfig;
}

/**
 * Ensure all lines from target-lines.json exist in the target files.
 * Lines are appended if they don't already exist.
 *
 * Special handling for .tldrignore:
 * - First copies target's ORIGINAL .gitignore as base (hard replace)
 * - Then appends target-lines
 *
 * Returns true if any changes were made.
 */
export function ensureTargetLines(targetRoot: string, verbose: boolean = false): boolean {
  const config = loadTargetLines();
  let anyChanged = false;

  // Capture original .gitignore content BEFORE any modifications
  const gitignorePath = join(targetRoot, '.gitignore');
  const originalGitignore = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8')
    : '';

  for (const [filename, lines] of Object.entries(config)) {
    const targetPath = join(targetRoot, filename);

    if (verbose) console.log(`Ensuring ${filename} has required lines...`);

    // Special handling for .tldrignore - hard replace with original .gitignore content first
    if (filename === '.tldrignore') {
      if (verbose && originalGitignore) {
        console.log('  Copying original .gitignore content to .tldrignore');
      }
      let baseContent = originalGitignore;
      if (baseContent && !baseContent.endsWith('\n')) {
        baseContent += '\n';
      }
      writeFileSync(targetPath, baseContent);
      anyChanged = true;
    }

    for (const line of lines) {
      const updated = ensureLineInFile(targetPath, line, verbose);
      if (updated) {
        anyChanged = true;
      }
    }
  }

  return anyChanged;
}
