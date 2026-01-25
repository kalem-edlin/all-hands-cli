import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { isGitRepo } from '../lib/git.js';
import { Manifest, filesAreDifferent } from '../lib/manifest.js';
import { getAllhandsRoot } from '../lib/paths.js';
import { ConflictResolution, askConflictResolution, confirm, getNextBackupPath } from '../lib/ui.js';
import { SYNC_CONFIG_FILENAME, SYNC_CONFIG_TEMPLATE } from '../lib/constants.js';
import { restoreDotfiles } from '../lib/dotfiles.js';
import { syncMarkerSection, ensureLineInFile } from '../lib/marker-sync.js';

const CLAUDE_MD_REFERENCE = '@.allhands/flows/CORE.md';

const AH_SHIM_SCRIPT = `#!/bin/bash
# AllHands CLI shim - finds and executes project-local .allhands/harness/ah
# Installed by: npx all-hands init

dir="$PWD"
while [ "$dir" != "/" ]; do
  if [ -x "$dir/.allhands/harness/ah" ]; then
    exec "$dir/.allhands/harness/ah" "$@"
  fi
  dir="$(dirname "$dir")"
done

echo "error: not in an all-hands project (no .allhands/harness/ah found)" >&2
echo "hint: run 'npx all-hands init .' to initialize this project" >&2
exit 1
`;

function setupAhShim(): { installed: boolean; path: string | null; inPath: boolean } {
  const localBin = join(homedir(), '.local', 'bin');
  const shimPath = join(localBin, 'ah');

  // Check if ~/.local/bin is in PATH
  const pathEnv = process.env.PATH || '';
  const inPath = pathEnv.split(':').some(p =>
    p === localBin || p === join(homedir(), '.local/bin')
  );

  // Check if shim already exists and is current
  if (existsSync(shimPath)) {
    const existing = readFileSync(shimPath, 'utf-8');
    if (existing.includes('.allhands/harness/ah')) {
      return { installed: false, path: shimPath, inPath };
    }
  }

  // Create ~/.local/bin if needed
  mkdirSync(localBin, { recursive: true });

  // Write the shim
  writeFileSync(shimPath, AH_SHIM_SCRIPT, { mode: 0o755 });

  return { installed: true, path: shimPath, inPath };
}

export async function cmdInit(target: string, autoYes: boolean = false): Promise<number> {
  const resolvedTarget = resolve(process.cwd(), target);
  const allhandsRoot = getAllhandsRoot();

  console.log(`Initializing allhands in: ${resolvedTarget}`);
  console.log(`Source: ${allhandsRoot}`);

  if (!existsSync(resolvedTarget)) {
    console.error(`Error: Target directory does not exist: ${resolvedTarget}`);
    return 1;
  }

  if (!isGitRepo(resolvedTarget)) {
    console.error(`Warning: Target is not a git repository: ${resolvedTarget}`);
    if (!autoYes) {
      if (!(await confirm('Continue anyway?'))) {
        console.log('Aborted.');
        return 1;
      }
    }
  }

  // Load manifest for file-by-file sync
  const manifest = new Manifest(allhandsRoot);
  const distributable = manifest.getDistributableFiles();

  let copied = 0;
  let skipped = 0;
  let resolution: ConflictResolution = 'overwrite';
  const conflicts: string[] = [];

  // Detect conflicts (files that exist and differ)
  for (const relPath of distributable) {
    const sourceFile = join(allhandsRoot, relPath);
    const targetFile = join(resolvedTarget, relPath);

    if (existsSync(targetFile) && existsSync(sourceFile)) {
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
        const targetFile = join(resolvedTarget, relPath);
        const bkPath = getNextBackupPath(targetFile);
        copyFileSync(targetFile, bkPath);
        console.log(`  ${relPath} → ${basename(bkPath)}`);
      }
    }
  }

  // Copy files
  console.log('\nCopying allhands files...');
  console.log(`Found ${distributable.size} files to distribute`);

  for (const relPath of [...distributable].sort()) {
    const sourceFile = join(allhandsRoot, relPath);
    const targetFile = join(resolvedTarget, relPath);

    if (!existsSync(sourceFile)) continue;

    mkdirSync(dirname(targetFile), { recursive: true });

    if (existsSync(targetFile)) {
      if (!filesAreDifferent(sourceFile, targetFile)) {
        skipped++;
        continue;
      }
    }

    copyFileSync(sourceFile, targetFile);
    copied++;
  }

  // Restore dotfiles (gitignore → .gitignore, etc.)
  restoreDotfiles(resolvedTarget);

  // Ensure CLAUDE.md has the reference line
  console.log('\nEnsuring CLAUDE.md has CORE.md reference...');
  const claudeMdPath = join(resolvedTarget, 'CLAUDE.md');
  const claudeMdUpdated = ensureLineInFile(claudeMdPath, CLAUDE_MD_REFERENCE, true);

  // Sync .gitignore (lines after # ALLHANDS_SYNC)
  console.log('Syncing .gitignore...');
  const sourceGitignore = join(allhandsRoot, '.gitignore');
  const targetGitignore = join(resolvedTarget, '.gitignore');
  syncMarkerSection(sourceGitignore, targetGitignore, true);

  // Sync .tldrignore (lines after # ALLHANDS_SYNC)
  console.log('Syncing .tldrignore...');
  const sourceTldrignore = join(allhandsRoot, '.tldrignore');
  const targetTldrignore = join(resolvedTarget, '.tldrignore');
  syncMarkerSection(sourceTldrignore, targetTldrignore, true);

  // Copy .env.ai.example
  const envExamples = ['.env.example', '.env.ai.example'];
  for (const envExample of envExamples) {
    const sourceEnv = join(allhandsRoot, envExample);
    const targetEnv = join(resolvedTarget, envExample);

    if (existsSync(sourceEnv)) {
      console.log(`Copying ${envExample}`);
      copyFileSync(sourceEnv, targetEnv);
    }
  }

  // Setup ah CLI shim in ~/.local/bin
  console.log('\nSetting up `ah` command...');
  const shimResult = setupAhShim();
  if (shimResult.installed) {
    console.log(`  Installed shim to ${shimResult.path}`);
  } else {
    console.log(`  Shim already installed at ${shimResult.path}`);
  }
  if (!shimResult.inPath) {
    console.log('  Warning: ~/.local/bin is not in your PATH');
    console.log('  Add this to your shell config (.zshrc/.bashrc):');
    console.log('    export PATH="$HOME/.local/bin:$PATH"');
  }

  // Offer to create sync config for push command
  const syncConfigPath = join(resolvedTarget, SYNC_CONFIG_FILENAME);
  let syncConfigCreated = false;

  if (existsSync(syncConfigPath)) {
    console.log(`\n${SYNC_CONFIG_FILENAME} already exists - skipping`);
  } else if (!autoYes) {
    console.log('\nThe push command lets you contribute changes back to all-hands.');
    console.log('A sync config file lets you customize which files to include/exclude.');
    if (await confirm(`Create ${SYNC_CONFIG_FILENAME}?`)) {
      writeFileSync(syncConfigPath, JSON.stringify(SYNC_CONFIG_TEMPLATE, null, 2) + '\n');
      syncConfigCreated = true;
      console.log(`  Created ${SYNC_CONFIG_FILENAME}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done: ${copied} copied, ${skipped} unchanged`);
  if (resolution === 'backup' && conflicts.length > 0) {
    console.log(`Created ${conflicts.length} backup file(s)`);
  }
  if (claudeMdUpdated) {
    console.log('CLAUDE.md updated with CORE.md reference');
  }
  if (syncConfigCreated) {
    console.log(`Created ${SYNC_CONFIG_FILENAME} for push customization`);
  }
  console.log(`${'='.repeat(60)}`);

  console.log('\nNext steps:');
  console.log('  1. Commit the changes');

  return 0;
}
