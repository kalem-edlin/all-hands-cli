import { existsSync, mkdirSync, copyFileSync, unlinkSync, renameSync } from 'fs';
import { join, dirname, basename } from 'path';
import { Manifest, filesAreDifferent } from '../lib/manifest.js';
import { isGitRepo, getStagedFiles } from '../lib/git.js';
import { getAllhandsRoot } from '../lib/paths.js';
import { ConflictResolution, askConflictResolution, confirm, getNextBackupPath } from '../lib/ui.js';
import { restoreDotfiles } from '../lib/dotfiles.js';

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

  const manifest = new Manifest(allhandsRoot);

  console.log(`Updating from: ${allhandsRoot}`);
  console.log(`Target: ${targetRoot}`);

  // Check for staged changes to managed files
  const staged = getStagedFiles(targetRoot);
  const distributable = manifest.getDistributableFiles();
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

  // CLAUDE.md handling
  const targetClaudeMd = join(targetRoot, 'CLAUDE.md');
  const targetProjectMd = join(targetRoot, 'CLAUDE.project.md');

  let claudeMdMigrated = false;

  if (existsSync(targetClaudeMd) && !existsSync(targetProjectMd)) {
    // User has CLAUDE.md but no CLAUDE.project.md → migrate
    console.log('\nMigrating CLAUDE.md → CLAUDE.project.md...');
    renameSync(targetClaudeMd, targetProjectMd);
    claudeMdMigrated = true;
    console.log('  Done - your instructions preserved in CLAUDE.project.md');
  }

  console.log(`Found ${distributable.size} distributable files`);

  // Detect conflicts and deleted files
  const conflicts: string[] = [];
  const deletedInSource: string[] = [];

  // Project-specific files to always preserve
  const projectSpecificFiles = new Set(['CLAUDE.project.md', '.claude/settings.local.json']);

  for (const relPath of distributable) {
    // Skip CLAUDE.md if we just migrated
    if (relPath === 'CLAUDE.md' && claudeMdMigrated) continue;
    // Skip project-specific files (always preserve user's version)
    if (projectSpecificFiles.has(relPath)) continue;

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
  let resolution: ConflictResolution = 'overwrite';

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

    // Create backups if requested
    if (resolution === 'backup') {
      console.log('\nCreating backups...');
      for (const relPath of conflicts) {
        const targetFile = join(targetRoot, relPath);
        const backupPath = getNextBackupPath(targetFile);
        copyFileSync(targetFile, backupPath);
        console.log(`  ${relPath} → ${basename(backupPath)}`);
      }
    }
  }

  // Copy updated files
  let updated = 0;
  let created = 0;

  for (const relPath of [...distributable].sort()) {
    // Skip project-specific files
    if (projectSpecificFiles.has(relPath)) continue;

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

  // Restore dotfiles (gitignore → .gitignore, etc.)
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

  console.log(`\nUpdated: ${updated}, Created: ${created}`);
  if (claudeMdMigrated) {
    console.log('Migrated CLAUDE.md → CLAUDE.project.md');
  }
  if (resolution === 'backup' && conflicts.length > 0) {
    console.log(`Created ${conflicts.length} backup file(s)`);
  }
  console.log('\nUpdate complete!');
  console.log('\nNote: Project-specific files preserved:');
  console.log('  - CLAUDE.project.md');
  console.log('  - .claude/settings.local.json');

  return 0;
}
