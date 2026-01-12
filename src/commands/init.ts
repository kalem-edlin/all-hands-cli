import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, extname, join, resolve } from 'path';
import * as readline from 'readline';
import { isGitRepo } from '../lib/git.js';
import { Manifest, filesAreDifferent } from '../lib/manifest.js';
import { getAllhandsRoot } from '../lib/paths.js';

const ENVOY_SHELL_FUNCTION = `
# AllHands envoy command - resolves to .claude/envoy/envoy from current directory
envoy() {
  "$PWD/.claude/envoy/envoy" "$@"
}
`;

type ConflictResolution = 'backup' | 'overwrite' | 'cancel';

function syncGitignore(allhandsRoot: string, target: string): { added: string[]; unchanged: boolean } {
  const sourceGitignore = join(allhandsRoot, '.gitignore');
  const targetGitignore = join(target, '.gitignore');

  if (!existsSync(sourceGitignore)) {
    return { added: [], unchanged: true };
  }

  const sourceContent = readFileSync(sourceGitignore, 'utf-8');
  const sourceLines = sourceContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  let targetLines: string[] = [];
  let targetContent = '';

  if (existsSync(targetGitignore)) {
    targetContent = readFileSync(targetGitignore, 'utf-8');
    targetLines = targetContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  }

  const targetSet = new Set(targetLines);
  const linesToAdd = sourceLines.filter((line) => !targetSet.has(line));

  if (linesToAdd.length === 0) {
    return { added: [], unchanged: true };
  }

  // Add missing lines with a header comment
  const additions = [
    '',
    '# AllHands framework ignores',
    ...linesToAdd,
  ].join('\n');

  const newContent = targetContent.trimEnd() + additions + '\n';
  writeFileSync(targetGitignore, newContent);

  return { added: linesToAdd, unchanged: false };
}

async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(message: string): Promise<boolean> {
  const answer = await askQuestion(`${message} [y/N]: `);
  return answer.toLowerCase() === 'y';
}

async function askConflictResolution(conflicts: string[]): Promise<ConflictResolution> {
  console.log(`\n${'!'.repeat(60)}`);
  console.log('CONFLICTS DETECTED - The following files differ from source:');
  console.log(`${'!'.repeat(60)}`);
  for (const f of conflicts.sort()) {
    console.log(`  → ${f}`);
  }
  console.log();
  console.log('How would you like to handle these conflicts?');
  console.log('  [b] Create backups (file.backup_N.ext) and overwrite');
  console.log('  [o] Overwrite all (lose local changes)');
  console.log('  [c] Cancel (make no changes)');
  console.log();

  while (true) {
    const answer = await askQuestion('Choice [b/o/c]: ');
    switch (answer.toLowerCase()) {
      case 'b':
        return 'backup';
      case 'o':
        return 'overwrite';
      case 'c':
        return 'cancel';
      default:
        console.log('Please enter b, o, or c');
    }
  }
}

function getNextBackupPath(filePath: string): string {
  const dir = dirname(filePath);
  const ext = extname(filePath);
  const base = basename(filePath, ext);

  // Find existing backups
  let n = 1;
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    const backupPattern = new RegExp(`^${base}\\.backup_(\\d+)${ext.replace('.', '\\.')}$`);
    for (const file of files) {
      const match = file.match(backupPattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= n) n = num + 1;
      }
    }
  }

  return join(dir, `${base}.backup_${n}${ext}`);
}

function setupEnvoyShellFunction(): { added: boolean; shellRc: string | null } {
  const shell = process.env.SHELL || '';
  let shellRc: string | null = null;

  if (shell.includes('zsh')) {
    shellRc = join(homedir(), '.zshrc');
  } else if (shell.includes('bash')) {
    const bashProfile = join(homedir(), '.bash_profile');
    const bashRc = join(homedir(), '.bashrc');
    shellRc = existsSync(bashProfile) ? bashProfile : bashRc;
  }

  if (!shellRc) {
    return { added: false, shellRc: null };
  }

  if (existsSync(shellRc)) {
    const content = readFileSync(shellRc, 'utf-8');
    if (content.includes('envoy()') || content.includes('.claude/envoy/envoy')) {
      return { added: false, shellRc };
    }
  }

  appendFileSync(shellRc, ENVOY_SHELL_FUNCTION);
  return { added: true, shellRc };
}

export async function cmdInit(target: string, autoYes: boolean = false): Promise<number> {
  const resolvedTarget = resolve(process.cwd(), target);

  const allhandsRoot = getAllhandsRoot();
  const manifest = new Manifest(allhandsRoot);

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

  // CLAUDE.md handling
  const targetClaudeMd = join(resolvedTarget, 'CLAUDE.md');
  const targetProjectMd = join(resolvedTarget, 'CLAUDE.project.md');
  const sourceClaudeMd = join(allhandsRoot, 'CLAUDE.md');

  let claudeMdMigrated = false;

  if (existsSync(targetClaudeMd) && !existsSync(targetProjectMd)) {
    // User has CLAUDE.md but no CLAUDE.project.md → migrate
    console.log('\nMigrating CLAUDE.md → CLAUDE.project.md...');
    renameSync(targetClaudeMd, targetProjectMd);
    claudeMdMigrated = true;
    console.log('  Done - your instructions preserved in CLAUDE.project.md');
  }

  // Get distributable files
  const distributable = manifest.getDistributableFiles();

  // Detect conflicts (files that exist and differ)
  const conflicts: string[] = [];

  for (const relPath of distributable) {
    // Skip CLAUDE.md if we just migrated (it won't exist anymore)
    if (relPath === 'CLAUDE.md' && claudeMdMigrated) continue;
    // Skip CLAUDE.project.md if we just migrated (preserve user's content)
    if (relPath === 'CLAUDE.project.md' && claudeMdMigrated) continue;

    const sourceFile = join(allhandsRoot, relPath);
    const targetFile = join(resolvedTarget, relPath);

    if (existsSync(targetFile) && existsSync(sourceFile)) {
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
        const targetFile = join(resolvedTarget, relPath);
        const backupPath = getNextBackupPath(targetFile);
        copyFileSync(targetFile, backupPath);
        console.log(`  ${relPath} → ${basename(backupPath)}`);
      }
    }
  }

  // Copy files
  console.log('\nCopying allhands files...');
  console.log(`Found ${distributable.size} files to distribute`);

  let copied = 0;
  let skipped = 0;

  for (const relPath of [...distributable].sort()) {
    // Skip CLAUDE.project.md if we migrated user's CLAUDE.md to it
    if (relPath === 'CLAUDE.project.md' && claudeMdMigrated) {
      skipped++;
      continue;
    }

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

  // Sync .gitignore entries
  console.log('\nSyncing .gitignore entries...');
  const gitignoreResult = syncGitignore(allhandsRoot, resolvedTarget);
  if (gitignoreResult.unchanged) {
    console.log('  .gitignore already contains all required entries');
  } else {
    console.log(`  Added ${gitignoreResult.added.length} entries to .gitignore:`);
    for (const entry of gitignoreResult.added) {
      console.log(`    + ${entry}`);
    }
  }

  // Setup envoy shell function
  console.log('\nSetting up envoy shell command...');
  const envoyResult = setupEnvoyShellFunction();
  if (envoyResult.added && envoyResult.shellRc) {
    console.log(`  Added envoy function to ${envoyResult.shellRc}`);
    console.log('  Run `source ' + envoyResult.shellRc + '` or restart terminal to use');
  } else if (envoyResult.shellRc) {
    console.log('  envoy function already configured');
  } else {
    console.log('  Could not detect shell config (add manually to your shell rc):');
    console.log('    envoy() { "$PWD/.claude/envoy/envoy" "$@"; }');
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done: ${copied} copied, ${skipped} unchanged`);
  if (claudeMdMigrated) {
    console.log('Migrated CLAUDE.md → CLAUDE.project.md');
  }
  if (resolution === 'backup' && conflicts.length > 0) {
    console.log(`Created ${conflicts.length} backup file(s)`);
  }
  console.log(`${'='.repeat(60)}`);

  console.log('\nNext steps:');
  console.log('  1. Review CLAUDE.project.md for your project-specific instructions');
  console.log('  2. Commit the changes');

  return 0;
}
