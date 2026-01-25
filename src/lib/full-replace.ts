import { copyFileSync, cpSync, existsSync, renameSync, rmSync } from 'fs';
import { join } from 'path';
import { restoreDotfiles } from './dotfiles.js';
import { syncMarkerSection, ensureLineInFile } from './marker-sync.js';

const CLAUDE_MD_REFERENCE = '@.allhands/flows/CORE.md';

interface FullReplaceOptions {
  sourceRoot: string;      // all-hands source directory
  targetRoot: string;      // target project directory
  verbose?: boolean;
}

interface FullReplaceResult {
  backupPath: string | null;
  filesRestored: string[];
  claudeMdUpdated: boolean;
  envExampleCopied: boolean;
  gitignoreSynced: boolean;
  tldrignoreSynced: boolean;
}

/**
 * Files/directories to preserve from the target's existing .allhands
 * These are restored after the wholesale copy.
 */
const PRESERVE_IN_ALLHANDS = [
  'node_modules',  // target's local dependencies
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
function getBackupDirName(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `.allhands-${ts}.backup`;
}

/**
 * Perform full replace of .allhands directory.
 *
 * 1. Backup existing .allhands to .allhands-[timestamp].backup
 * 2. Copy entire .allhands from source
 * 3. Restore preserved items from backup (node_modules, etc.)
 * 4. Handle CLAUDE.md reference
 * 5. Copy .env.example files
 * 6. Restore dotfiles
 */
export async function fullReplace(options: FullReplaceOptions): Promise<FullReplaceResult> {
  const { sourceRoot, targetRoot, verbose = false } = options;

  const sourceAllhands = join(sourceRoot, '.allhands');
  const targetAllhands = join(targetRoot, '.allhands');

  const result: FullReplaceResult = {
    backupPath: null,
    filesRestored: [],
    claudeMdUpdated: false,
    envExampleCopied: false,
    gitignoreSynced: false,
    tldrignoreSynced: false,
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

  // 4. Handle CLAUDE.md - ensure it has the reference line
  const claudeMdPath = join(targetRoot, 'CLAUDE.md');
  if (verbose) console.log('Ensuring CLAUDE.md has CORE.md reference...');
  result.claudeMdUpdated = ensureLineInFile(claudeMdPath, CLAUDE_MD_REFERENCE, verbose);

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

  // 7. Sync .gitignore (lines after # ALLHANDS_SYNC)
  const sourceGitignore = join(sourceRoot, '.gitignore');
  const targetGitignore = join(targetRoot, '.gitignore');
  if (verbose) console.log('Syncing .gitignore...');
  result.gitignoreSynced = syncMarkerSection(sourceGitignore, targetGitignore, verbose);

  // 8. Sync .tldrignore (lines after # ALLHANDS_SYNC)
  const sourceTldrignore = join(sourceRoot, '.tldrignore');
  const targetTldrignore = join(targetRoot, '.tldrignore');
  if (verbose) console.log('Syncing .tldrignore...');
  result.tldrignoreSynced = syncMarkerSection(sourceTldrignore, targetTldrignore, verbose);

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
