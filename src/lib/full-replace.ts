import { copyFileSync, cpSync, existsSync, renameSync, rmSync } from 'fs';
import { join } from 'path';
import { restoreDotfiles } from './dotfiles.js';
import { ensureTargetLines } from './target-lines.js';

interface FullReplaceOptions {
  sourceRoot: string;      // all-hands source directory
  targetRoot: string;      // target project directory
  verbose?: boolean;
}

interface FullReplaceResult {
  backupPath: string | null;
  claudeBackupPath: string | null;
  filesRestored: string[];
  claudeFilesRestored: string[];
  targetLinesUpdated: boolean;
  envExampleCopied: boolean;
}

/**
 * Files/directories to preserve from the target's existing .allhands
 * These are restored after the wholesale copy.
 */
const PRESERVE_IN_ALLHANDS = [
  'node_modules',  // target's local dependencies
];

/**
 * Files/directories to preserve from the target's existing .claude
 * These are restored after the wholesale copy.
 */
const PRESERVE_IN_CLAUDE = [
  'settings.local.json',  // target's local settings
];

/**
 * Files at project root to preserve (never overwritten)
 */
const PRESERVE_AT_ROOT = [
  '.claude/settings.local.json',
  '.env',
  '.env.ai',
  '.env.local',
];

/**
 * Generate timestamp-based backup directory name
 */
function getBackupDirName(prefix: string = '.allhands'): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}-${ts}.backup`;
}

/**
 * Perform full replace of .allhands and .claude directories.
 *
 * 1. Backup existing .allhands to .allhands-[timestamp].backup
 * 2. Copy entire .allhands from source
 * 3. Restore preserved items from backup (node_modules, etc.)
 * 4. Backup existing .claude to .claude-[timestamp].backup
 * 5. Copy entire .claude from source (if exists)
 * 6. Restore preserved items from .claude backup (settings.local.json)
 * 7. Copy .env.example files
 * 8. Restore dotfiles
 * 9. Sync target-lines (CLAUDE.md, .gitignore, .tldrignore)
 */
export async function fullReplace(options: FullReplaceOptions): Promise<FullReplaceResult> {
  const { sourceRoot, targetRoot, verbose = false } = options;

  const sourceAllhands = join(sourceRoot, '.allhands');
  const targetAllhands = join(targetRoot, '.allhands');

  const result: FullReplaceResult = {
    backupPath: null,
    claudeBackupPath: null,
    filesRestored: [],
    claudeFilesRestored: [],
    targetLinesUpdated: false,
    envExampleCopied: false,
  };

  // 1. Backup existing .allhands if it exists
  if (existsSync(targetAllhands)) {
    const backupName = getBackupDirName();
    const backupPath = join(targetRoot, backupName);

    if (verbose) console.log(`Backing up .allhands → ${backupName}`);
    renameSync(targetAllhands, backupPath);
    result.backupPath = backupPath;
  }

  // 2. Copy entire .allhands from source
  if (verbose) console.log('Copying .allhands from source...');
  cpSync(sourceAllhands, targetAllhands, { recursive: true });

  // 3. Restore preserved items from backup
  if (result.backupPath) {
    for (const item of PRESERVE_IN_ALLHANDS) {
      const backupItem = join(result.backupPath, item);
      const targetItem = join(targetAllhands, item);

      if (existsSync(backupItem)) {
        // Remove what we just copied (if exists)
        if (existsSync(targetItem)) {
          rmSync(targetItem, { recursive: true, force: true });
        }

        // Restore from backup
        if (verbose) console.log(`  Restoring ${item} from backup`);
        cpSync(backupItem, targetItem, { recursive: true });
        result.filesRestored.push(item);
      }
    }
  }

  // 4. Handle .claude directory (if source has it)
  const sourceClaude = join(sourceRoot, '.claude');
  const targetClaude = join(targetRoot, '.claude');

  if (existsSync(sourceClaude)) {
    // 4a. Backup existing .claude if it exists
    if (existsSync(targetClaude)) {
      const claudeBackupName = getBackupDirName('.claude');
      const claudeBackupPath = join(targetRoot, claudeBackupName);

      if (verbose) console.log(`Backing up .claude → ${claudeBackupName}`);
      renameSync(targetClaude, claudeBackupPath);
      result.claudeBackupPath = claudeBackupPath;
    }

    // 4b. Copy entire .claude from source
    if (verbose) console.log('Copying .claude from source...');
    cpSync(sourceClaude, targetClaude, { recursive: true });

    // 4c. Restore preserved items from .claude backup
    if (result.claudeBackupPath) {
      for (const item of PRESERVE_IN_CLAUDE) {
        const backupItem = join(result.claudeBackupPath, item);
        const targetItem = join(targetClaude, item);

        if (existsSync(backupItem)) {
          // Remove what we just copied (if exists)
          if (existsSync(targetItem)) {
            rmSync(targetItem, { recursive: true, force: true });
          }

          // Restore from backup
          if (verbose) console.log(`  Restoring .claude/${item} from backup`);
          cpSync(backupItem, targetItem, { recursive: true });
          result.claudeFilesRestored.push(item);
        }
      }
    }
  }

  // 5. Copy .env.example files (but don't overwrite actual .env files)
  const envExamples = ['.env.example', '.env.ai.example'];
  for (const envExample of envExamples) {
    const sourceEnv = join(sourceRoot, envExample);
    const targetEnv = join(targetRoot, envExample);

    if (existsSync(sourceEnv)) {
      if (verbose) console.log(`Copying ${envExample}`);
      copyFileSync(sourceEnv, targetEnv);
      result.envExampleCopied = true;
    }
  }

  // 6. Restore dotfiles (gitignore → .gitignore, etc.)
  if (verbose) console.log('Restoring dotfiles...');
  restoreDotfiles(targetAllhands);

  // 7. Ensure target files have required lines (CLAUDE.md, .gitignore, .tldrignore)
  if (verbose) console.log('Syncing target-lines...');
  result.targetLinesUpdated = ensureTargetLines(targetRoot, verbose);

  return result;
}

/**
 * Check if any files at root should be preserved and warn if they'd be affected.
 * Returns list of files that exist and should be preserved.
 */
export function checkPreservedFiles(targetRoot: string): string[] {
  const preserved: string[] = [];

  for (const file of PRESERVE_AT_ROOT) {
    const fullPath = join(targetRoot, file);
    if (existsSync(fullPath)) {
      preserved.push(file);
    }
  }

  return preserved;
}
