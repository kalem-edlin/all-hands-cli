import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { minimatch } from 'minimatch';
import * as readline from 'readline';
import { git, isGitRepo } from '../lib/git.js';
import { checkGhAuth, checkGhInstalled, getGhUser, gh } from '../lib/gh.js';
import { Manifest, filesAreDifferent } from '../lib/manifest.js';
import { getAllhandsRoot, UPSTREAM_REPO } from '../lib/paths.js';
import { askQuestion, confirm } from '../lib/ui.js';

const SYNC_CONFIG_FILENAME = '.allhands-sync-config.json';

interface SyncConfig {
  includes?: string[];
  excludes?: string[];
}

interface FileEntry {
  path: string;
  type: 'M' | 'A'; // Modified or Added
}

function loadSyncConfig(cwd: string): SyncConfig | null {
  const configPath = join(cwd, SYNC_CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function expandGlob(pattern: string, baseDir: string): string[] {
  const results: string[] = [];
  walkDir(baseDir, (filePath) => {
    const relPath = filePath.substring(baseDir.length + 1);
    if (minimatch(relPath, pattern, { dot: true })) {
      results.push(relPath);
    }
  });
  return results;
}

function walkDir(dir: string, callback: (filePath: string) => void): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

async function askMultiLineInput(prompt: string): Promise<string> {
  console.log(prompt);
  console.log('(Enter an empty line to finish)');

  const lines: string[] = [];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const askLine = () => {
      rl.question('', (line: string) => {
        if (line === '') {
          rl.close();
          resolve(lines.join('\n'));
        } else {
          lines.push(line);
          askLine();
        }
      });
    };
    askLine();
  });
}

export async function cmdPush(
  include: string[],
  exclude: string[],
  dryRun: boolean,
  titleArg?: string,
  bodyArg?: string
): Promise<number> {
  const cwd = process.cwd();

  // Step 1: Prerequisites
  if (!checkGhInstalled()) {
    console.error('Error: gh CLI required. Install: https://cli.github.com');
    return 1;
  }

  if (!checkGhAuth()) {
    console.error('Error: Not authenticated. Run: gh auth login');
    return 1;
  }

  if (!isGitRepo(cwd)) {
    console.error('Error: Not in a git repository');
    return 1;
  }

  // Step 2: Load config
  const syncConfig = loadSyncConfig(cwd);
  const finalIncludes = include.length > 0 ? include : (syncConfig?.includes || []);
  const finalExcludes = exclude.length > 0 ? exclude : (syncConfig?.excludes || []);

  // Step 3: Get upstream file list
  const allhandsRoot = getAllhandsRoot();
  const manifest = new Manifest(allhandsRoot);
  const upstreamFiles = manifest.getDistributableFiles();

  // Step 4: Identify changed files
  const filesToPush: FileEntry[] = [];

  // Check tracked upstream files for modifications
  for (const relPath of upstreamFiles) {
    // Skip if excluded
    if (finalExcludes.some((pattern) => minimatch(relPath, pattern, { dot: true }))) {
      continue;
    }

    const localFile = join(cwd, relPath);
    const upstreamFile = join(allhandsRoot, relPath);

    if (existsSync(localFile) && filesAreDifferent(localFile, upstreamFile)) {
      filesToPush.push({ path: relPath, type: 'M' });
    }
  }

  // Add included files (excludes don't apply to explicit includes)
  for (const pattern of finalIncludes) {
    const matchedFiles = expandGlob(pattern, cwd);
    for (const relPath of matchedFiles) {
      // Skip if already in list
      if (filesToPush.some((f) => f.path === relPath)) continue;

      filesToPush.push({ path: relPath, type: 'A' });
    }
  }

  // Step 5: Show preview
  if (filesToPush.length === 0) {
    console.log('No changes to push');
    return 0;
  }

  console.log('\nFiles to be included in PR:');
  for (const file of filesToPush.sort((a, b) => a.path.localeCompare(b.path))) {
    const marker = file.type === 'M' ? 'M' : 'A';
    const label = file.type === 'M' ? 'modified' : 'included';
    console.log(`  ${marker} ${file.path} (${label})`);
  }
  console.log();

  if (dryRun) {
    console.log('Dry run - no PR created');
    return 0;
  }

  // Step 6: Get PR details (from args or prompt)
  const title = titleArg || await askQuestion('PR title: ');
  if (!title.trim()) {
    console.error('Error: Title cannot be empty');
    return 1;
  }

  const body = bodyArg !== undefined ? bodyArg : await askMultiLineInput('\nPR body:');

  // Step 7: Confirm (skip if title/body provided via args)
  if (!titleArg) {
    console.log();
    if (!(await confirm(`Create PR with title "${title}"?`))) {
      console.log('Aborted');
      return 0;
    }
  } else {
    console.log(`\nCreating PR: "${title}"`);
  }


  // Step 8: Fork workflow
  const ghUser = getGhUser();
  if (!ghUser) {
    console.error('Error: Could not determine GitHub username');
    return 1;
  }

  console.log(`\nUsing GitHub account: ${ghUser}`);

  // Check if fork exists
  const repoName = UPSTREAM_REPO.split('/')[1];
  const forkCheck = gh(['repo', 'view', `${ghUser}/${repoName}`, '--json', 'name']);

  if (!forkCheck.success) {
    console.log('Creating fork...');
    const forkResult = gh(['repo', 'fork', UPSTREAM_REPO, '--clone=false']);
    if (!forkResult.success) {
      console.error('Error creating fork:', forkResult.stderr);
      return 1;
    }
    // Wait a moment for fork to be ready
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Create temp directory
  const tempDir = join(tmpdir(), `allhands-push-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    // Clone fork (shallow)
    console.log('Cloning fork...');
    const cloneResult = gh(['repo', 'clone', `${ghUser}/${repoName}`, tempDir, '--', '--depth=1']);
    if (!cloneResult.success) {
      console.error('Error cloning fork:', cloneResult.stderr);
      return 1;
    }

    // Add upstream and fetch
    console.log('Fetching upstream...');
    git(['remote', 'add', 'upstream', `https://github.com/${UPSTREAM_REPO}`], tempDir);
    const fetchResult = git(['fetch', 'upstream', 'main', '--depth=1'], tempDir);
    if (!fetchResult.success) {
      console.error('Error fetching upstream:', fetchResult.stderr);
      return 1;
    }

    // Create branch from upstream/main
    const branchName = `contrib/${ghUser}/${Date.now()}`;
    console.log(`Creating branch: ${branchName}`);

    const checkoutResult = git(['checkout', '-b', branchName, 'upstream/main'], tempDir);
    if (!checkoutResult.success) {
      console.error('Error creating branch:', checkoutResult.stderr);
      return 1;
    }

    // Copy files
    console.log('Copying files...');
    for (const file of filesToPush) {
      const src = join(cwd, file.path);
      const dest = join(tempDir, file.path);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }

    // Stage and commit
    git(['add', '.'], tempDir);
    const commitResult = git(['commit', '-m', title], tempDir);
    if (!commitResult.success) {
      console.error('Error committing:', commitResult.stderr);
      return 1;
    }

    // Push to fork
    console.log('Pushing to fork...');
    const pushResult = git(['push', '-u', 'origin', branchName], tempDir);
    if (!pushResult.success) {
      console.error('Error pushing:', pushResult.stderr);
      return 1;
    }

    // Create PR
    console.log('Creating PR...');
    const prArgs = [
      'pr', 'create',
      '--repo', UPSTREAM_REPO,
      '--head', `${ghUser}:${branchName}`,
      '--title', title,
      '--body', body || 'Contribution via claude-all-hands push',
    ];

    const prResult = gh(prArgs);
    if (!prResult.success) {
      console.error('Error creating PR:', prResult.stderr);
      return 1;
    }

    // Step 9: Output
    console.log('\nPR created successfully!');
    console.log(prResult.stdout);

    return 0;
  } finally {
    // Cleanup
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
