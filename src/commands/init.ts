import { spawnSync } from 'child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import * as readline from 'readline';
import { git, isGitRepo } from '../lib/git.js';
import { Manifest } from '../lib/manifest.js';
import { getAllhandsRoot } from '../lib/paths.js';

const ENVOY_SHELL_FUNCTION = `
# AllHands envoy command - resolves to .claude/envoy/envoy from current directory
envoy() {
  "$PWD/.claude/envoy/envoy" "$@"
}
`;

const MIGRATION_MAP: Record<string, string> = {
  'CLAUDE.md': 'CLAUDE.project.md',
  '.claude/settings.json': '.claude/settings.local.json',
};

const HUSKY_HOOKS = [
  'pre-commit',
  'post-merge',
  'commit-msg',
  'pre-push',
  'pre-rebase',
  'post-checkout',
  'post-rewrite',
];

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

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N]: `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

function setupEnvoyShellFunction(): { added: boolean; shellRc: string | null } {
  const shell = process.env.SHELL || '';
  let shellRc: string | null = null;

  if (shell.includes('zsh')) {
    shellRc = join(homedir(), '.zshrc');
  } else if (shell.includes('bash')) {
    // macOS uses .bash_profile, Linux uses .bashrc
    const bashProfile = join(homedir(), '.bash_profile');
    const bashRc = join(homedir(), '.bashrc');
    shellRc = existsSync(bashProfile) ? bashProfile : bashRc;
  }

  if (!shellRc) {
    return { added: false, shellRc: null };
  }

  // Check if already present
  if (existsSync(shellRc)) {
    const content = readFileSync(shellRc, 'utf-8');
    if (content.includes('envoy()') || content.includes('.claude/envoy/envoy')) {
      return { added: false, shellRc };
    }
  }

  // Append the function
  appendFileSync(shellRc, ENVOY_SHELL_FUNCTION);
  return { added: true, shellRc };
}

function migrateExistingFiles(target: string): Record<string, string> {
  const migrated: Record<string, string> = {};

  // Migrate standard files
  for (const [orig, dest] of Object.entries(MIGRATION_MAP)) {
    const origPath = join(target, orig);
    const destPath = join(target, dest);

    if (existsSync(origPath) && !existsSync(destPath)) {
      mkdirSync(dirname(destPath), { recursive: true });
      renameSync(origPath, destPath);
      migrated[orig] = dest;
      console.log(`  Migrated: ${orig} → ${dest}`);
    }
  }

  // Migrate husky hooks to project/
  const huskyDir = join(target, '.husky');
  const projectDir = join(huskyDir, 'project');

  if (existsSync(huskyDir)) {
    for (const hook of HUSKY_HOOKS) {
      const hookPath = join(huskyDir, hook);
      const projectHook = join(projectDir, hook);

      if (existsSync(hookPath) && !existsSync(projectHook)) {
        const content = readFileSync(hookPath, 'utf-8');
        // Skip if it's an allhands hook
        if (content.includes('claude/') || content.includes('project/')) {
          continue;
        }

        mkdirSync(projectDir, { recursive: true });
        renameSync(hookPath, projectHook);
        migrated[`.husky/${hook}`] = `.husky/project/${hook}`;
        console.log(`  Migrated: .husky/${hook} → .husky/project/${hook}`);
      }
    }
  }

  return migrated;
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

  // Step 1: Migrate existing files
  console.log('\nMigrating existing files...');
  const migrated = migrateExistingFiles(resolvedTarget);
  if (Object.keys(migrated).length === 0) {
    console.log('  No files to migrate');
  }

  const migratedDestinations = new Set(Object.values(migrated));

  // Step 2: Check for overwrites
  const distributable = manifest.getDistributableFiles();
  const willOverwrite: string[] = [];

  for (const relPath of distributable) {
    if (migratedDestinations.has(relPath)) continue;

    const sourceFile = join(allhandsRoot, relPath);
    const targetFile = join(resolvedTarget, relPath);

    if (existsSync(targetFile) && existsSync(sourceFile)) {
      const sourceContent = readFileSync(sourceFile);
      const targetContent = readFileSync(targetFile);
      if (!sourceContent.equals(targetContent)) {
        willOverwrite.push(relPath);
      }
    }
  }

  if (willOverwrite.length > 0) {
    console.log(`\n${'!'.repeat(60)}`);
    console.log('WARNING: The following files will be OVERWRITTEN:');
    console.log('(These files exist in target but have no migration path)');
    console.log(`${'!'.repeat(60)}`);
    for (const f of willOverwrite.sort()) {
      console.log(`  → ${f}`);
    }
    console.log();

    if (!autoYes) {
      if (!(await confirm('Continue and overwrite these files?'))) {
        console.log('Aborted. No changes made.');
        return 1;
      }
    }
  }

  // Step 3: Copy files
  console.log('\nCopying allhands files...');
  console.log(`Found ${distributable.size} files to distribute`);

  let copied = 0;
  let skipped = 0;

  for (const relPath of [...distributable].sort()) {
    if (migratedDestinations.has(relPath)) {
      skipped++;
      continue;
    }

    const sourceFile = join(allhandsRoot, relPath);
    const targetFile = join(resolvedTarget, relPath);

    if (!existsSync(sourceFile)) continue;

    mkdirSync(dirname(targetFile), { recursive: true });

    if (existsSync(targetFile)) {
      const sourceContent = readFileSync(sourceFile);
      const targetContent = readFileSync(targetFile);
      if (sourceContent.equals(targetContent)) {
        skipped++;
        continue;
      }
    }

    copyFileSync(sourceFile, targetFile);
    copied++;
  }

  // Step 4: Sync .gitignore entries
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

  // Step 5: Create .allhandsignore template
  const ignoreFile = join(resolvedTarget, '.allhandsignore');
  if (!existsSync(ignoreFile)) {
    const ignoreContent = `# AllHands Ignore - Exclude files from sync-back to claude-all-hands
# Uses gitignore-style patterns (globs supported)
#
# ┌─────────────────────────────────────────────────────────────────┐
# │ PROJECT-SPECIFIC (add here - stays in THIS repo only):         │
# │   • Project-specific agents, skills, commands                   │
# │   • Local configurations and settings                           │
# │   • Domain-specific hooks                                       │
# │   • Any file that only makes sense for THIS project             │
# ├─────────────────────────────────────────────────────────────────┤
# │ SYNC BACK (do NOT add here - benefits ALL repos):              │
# │   • Bug fixes to existing framework files                       │
# │   • New reusable patterns/skills discovered during development  │
# │   • Documentation improvements                                  │
# │   • Hook/envoy enhancements                                     │
# └─────────────────────────────────────────────────────────────────┘

# Project-specific files (auto-added)
CLAUDE.project.md
.claude/settings.local.json
.husky/project/**

# Project-specific agents
# .claude/agents/my-project-specialist.md

# Project-specific skills
# .claude/skills/my-domain-skill/**

# Project-specific commands
# .claude/commands/my-project-command.md
`;
    writeFileSync(ignoreFile, ignoreContent);
    console.log('Created .allhandsignore template');
  }

  // Step 6: Setup husky
  console.log('\nSetting up husky...');
  const result = spawnSync('npx', ['husky', 'install'], {
    cwd: resolvedTarget,
    encoding: 'utf-8',
  });
  if (result.status === 0) {
    console.log('  Husky installed');
  } else {
    console.log('  Husky install skipped (may already be configured)');
    if (result.stderr) {
      console.log(`  Details: ${result.stderr.trim()}`);
    }
  }

  // Step 7: Setup envoy shell function
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

  // Step 8: Offer auto-sync setup (if GitHub repo)
  if (!autoYes) {
    const remoteResult = git(['remote', 'get-url', 'origin'], resolvedTarget);
    const hasGitHubRemote = remoteResult.success && remoteResult.stdout.includes('github.com');

    if (hasGitHubRemote) {
      console.log('\n─────────────────────────────────────────────────────');
      console.log('📦 Auto-sync setup (optional)');
      console.log('─────────────────────────────────────────────────────');
      console.log('Enable automatic sync-back to claude-all-hands on merge?');
      console.log('This requires a GitHub PAT with repo scope.\n');

      if (await confirm('Set up auto-sync now?')) {
        // Extract repo from remote URL
        const repoMatch = remoteResult.stdout.match(/github\.com[:/](.+?)(?:\.git)?$/);
        const repoName = repoMatch ? repoMatch[1].replace('.git', '') : null;

        if (repoName) {
          console.log(`\nSetting secret for ${repoName}...`);
          console.log('You will be prompted to enter your PAT:\n');

          // Use gh secret set which handles secure input
          const secretResult = spawnSync('gh', ['secret', 'set', 'ALL_HANDS_SYNC_TOKEN', '--repo', repoName], {
            cwd: resolvedTarget,
            stdio: 'inherit', // Pass through stdin/stdout for secure input
          });

          if (secretResult.status === 0) {
            console.log('\n✅ Auto-sync configured! PRs will sync on merge to protected branches.');
          } else {
            console.log('\n⚠️  Secret setup failed. You can set it manually later:');
            console.log(`   gh secret set ALL_HANDS_SYNC_TOKEN --repo ${repoName}`);
          }
        }
      } else {
        console.log('Skipped. You can set up auto-sync later with:');
        console.log('  gh secret set ALL_HANDS_SYNC_TOKEN --repo <your-repo>');
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done: ${copied} copied, ${skipped} unchanged`);
  if (Object.keys(migrated).length > 0) {
    console.log(`Migrated ${Object.keys(migrated).length} existing files to project-specific locations`);
  }
  console.log(`${'='.repeat(60)}`);

  console.log('\nNext steps:');
  console.log('  1. Review CLAUDE.project.md for your project-specific instructions');
  console.log('  2. Review .husky/project/ for your project-specific hooks');
  console.log('  3. Add project-specific files to .allhandsignore');
  console.log('  4. Commit the changes');

  return 0;
}
