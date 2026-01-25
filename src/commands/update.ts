import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { Manifest, filesAreDifferent } from '../lib/manifest.js';
import { isGitRepo, getStagedFiles } from '../lib/git.js';
import { getAllhandsRoot } from '../lib/paths.js';
import { ConflictResolution, askConflictResolution, confirm, getNextBackupPath } from '../lib/ui.js';
import { restoreDotfiles } from '../lib/dotfiles.js';
import { syncMarkerSection, ensureLineInFile } from '../lib/marker-sync.js';

const CLAUDE_MD_REFERENCE = '@.allhands/flows/CORE.md';

export async function cmdUpdate(autoYes: boolean = false): Promise<number> {
  const targetRoot = process.cwd();

  if (!isGitRepo(targetRoot)) {
    console.error('Error: Not in a git repository');
    return 1;
  }

  const allhandsRoot = getAllhandsRoot();

  if (!existsSync(join(allhandsRoot, '.internal.json'))) {
    console.error(`Error: Internal config not found at ${allhandsRoot}`);
    console.error('Set ALLHANDS_PATH to your claude-all-hands directory');
    return 1;
  }

  console.log(`Updating from: ${allhandsRoot}`);
  console.log(`Target: ${targetRoot}`);

  // Load manifest for file-by-file sync
  const manifest = new Manifest(allhandsRoot);
  const distributable = manifest.getDistributableFiles();

  // Check for staged changes to managed files
  const staged = getStagedFiles(targetRoot);
  const managedPaths = new Set(distributable);

  const stagedConflicts = [...staged].filter(f => managedPaths.has(f));
  if (stagedConflicts.length > 0) {
    console.error('Error: Staged changes detected in managed files:');
    for (const f of stagedConflicts.sort()) {
      console.error(`  - ${f}`);
    }
    console.error("\nRun 'git stash' or commit first.");
    return 1;
  }

  console.log(`Found ${distributable.size} distributable files`);

  let updated = 0;
  let created = 0;
  let resolution: ConflictResolution = 'overwrite';
  const conflicts: string[] = [];
  const deletedInSource: string[] = [];

  // Detect conflicts and deleted files
  for (const relPath of distributable) {
    const sourceFile = join(allhandsRoot, relPath);
    const targetFile = join(targetRoot, relPath);

    if (!existsSync(sourceFile)) {
      if (existsSync(targetFile)) {
        deletedInSource.push(relPath);
      }
      continue;
    }

    if (existsSync(targetFile)) {
      if (filesAreDifferent(sourceFile, targetFile)) {
        conflicts.push(relPath);
      }
    }
  }

  // Handle conflicts
  if (conflicts.length > 0) {
    if (autoYes) {
      resolution = 'overwrite';
      console.log(`\nAuto-overwriting ${conflicts.length} conflicting files (--yes mode)`);
    } else {
      resolution = await askConflictResolution(conflicts);
      if (resolution === 'cancel') {
        console.log('Aborted. No changes made.');
        return 1;
      }
    }

    if (resolution === 'backup') {
      console.log('\nCreating backups...');
      for (const relPath of conflicts) {
        const targetFile = join(targetRoot, relPath);
        const bkPath = getNextBackupPath(targetFile);
        copyFileSync(targetFile, bkPath);
        console.log(`  ${relPath} → ${basename(bkPath)}`);
      }
    }
  }

  // Copy updated files
  for (const relPath of [...distributable].sort()) {
    const sourceFile = join(allhandsRoot, relPath);
    const targetFile = join(targetRoot, relPath);

    if (!existsSync(sourceFile)) continue;

    mkdirSync(dirname(targetFile), { recursive: true });

    if (existsSync(targetFile)) {
      if (filesAreDifferent(sourceFile, targetFile)) {
        copyFileSync(sourceFile, targetFile);
        updated++;
      }
    } else {
      copyFileSync(sourceFile, targetFile);
      created++;
    }
  }

  // Restore dotfiles
  restoreDotfiles(targetRoot);

  // Handle deleted files
  if (deletedInSource.length > 0) {
    console.log(`\n${deletedInSource.length} files removed from allhands source:`);
    for (const f of deletedInSource) {
      console.log(`  - ${f}`);
    }
    const shouldDelete = autoYes || (await confirm('Delete these from target?'));
    if (shouldDelete) {
      for (const f of deletedInSource) {
        const targetFile = join(targetRoot, f);
        if (existsSync(targetFile)) {
          unlinkSync(targetFile);
          console.log(`  Deleted: ${f}`);
        }
      }
    }
  }

  // Ensure CLAUDE.md has the reference line
  console.log('\nEnsuring CLAUDE.md has CORE.md reference...');
  const claudeMdPath = join(targetRoot, 'CLAUDE.md');
  const claudeMdUpdated = ensureLineInFile(claudeMdPath, CLAUDE_MD_REFERENCE, true);

  // Sync .gitignore (lines after # ALLHANDS_SYNC)
  console.log('Syncing .gitignore...');
  const sourceGitignore = join(allhandsRoot, '.gitignore');
  const targetGitignore = join(targetRoot, '.gitignore');
  syncMarkerSection(sourceGitignore, targetGitignore, true);

  // Sync .tldrignore (lines after # ALLHANDS_SYNC)
  console.log('Syncing .tldrignore...');
  const sourceTldrignore = join(allhandsRoot, '.tldrignore');
  const targetTldrignore = join(targetRoot, '.tldrignore');
  syncMarkerSection(sourceTldrignore, targetTldrignore, true);

  // Copy .env.ai.example
  const envExamples = ['.env.example', '.env.ai.example'];
  for (const envExample of envExamples) {
    const sourceEnv = join(allhandsRoot, envExample);
    const targetEnv = join(targetRoot, envExample);

    if (existsSync(sourceEnv)) {
      console.log(`Copying ${envExample}`);
      copyFileSync(sourceEnv, targetEnv);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Updated: ${updated}, Created: ${created}`);
  if (resolution === 'backup' && conflicts.length > 0) {
    console.log(`Created ${conflicts.length} backup file(s)`);
  }
  if (claudeMdUpdated) {
    console.log('CLAUDE.md updated with CORE.md reference');
  }
  console.log(`${'='.repeat(60)}`);

  return 0;
}
