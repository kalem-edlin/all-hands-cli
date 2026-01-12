import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { minimatch } from 'minimatch';
import * as readline from 'readline';
import { git, isGitRepo } from '../lib/git.js';
import { checkGhAuth, checkGhInstalled, getGhUser, gh } from '../lib/gh.js';
import { Manifest, filesAreDifferent } from '../lib/manifest.js';
import { getAllhandsRoot, UPSTREAM_REPO } from '../lib/paths.js';
import { askQuestion, confirm } from '../lib/ui.js';
import { SYNC_CONFIG_FILENAME } from '../lib/constants.js';
import { walkDir } from '../lib/fs-utils.js';

interface SyncConfig {
  includes?: string[];
  excludes?: string[];
}

interface FileEntry {
  path: string;
  type: 'M' | 'A';
}

interface PrerequisiteResult {
  success: boolean;
  ghUser?: string;
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
    console.error(`Error: Failed to parse ${SYNC_CONFIG_FILENAME}`);
    process.exit(1);
  }
}

function expandGlob(pattern: string, baseDir: string): string[] {
  const results: string[] = [];
  walkDir(baseDir, (filePath) => {
    const relPath = relative(baseDir, filePath);
    if (minimatch(relPath, pattern, { dot: true })) {
      results.push(relPath);
    }
  });
  return results;
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

function checkPrerequisites(cwd: string): PrerequisiteResult {
  if (!checkGhInstalled()) {
    console.error('Error: gh CLI required. Install: https://cli.github.com');
    return { success: false };
  }

  if (!checkGhAuth()) {
    console.error('Error: Not authenticated. Run: gh auth login');
    return { success: false };
  }

  if (!isGitRepo(cwd)) {
    console.error('Error: Not in a git repository');
    return { success: false };
  }

  const ghUser = getGhUser();
  if (!ghUser) {
    console.error('Error: Could not determine GitHub username');
    return { success: false };
  }

  return { success: true, ghUser };
}

function collectFilesToPush(
  cwd: string,
  finalIncludes: string[],
  finalExcludes: string[]
): FileEntry[] {
  const allhandsRoot = getAllhandsRoot();
  const manifest = new Manifest(allhandsRoot);
  const upstreamFiles = manifest.getDistributableFiles();
  const filesToPush: FileEntry[] = [];

  for (const relPath of upstreamFiles) {
    if (finalExcludes.some((pattern) => minimatch(relPath, pattern, { dot: true }))) {
      continue;
    }

    const localFile = join(cwd, relPath);
    const upstreamFile = join(allhandsRoot, relPath);

    if (existsSync(localFile) && filesAreDifferent(localFile, upstreamFile)) {
      filesToPush.push({ path: relPath, type: 'M' });
    }
  }

  for (const pattern of finalIncludes) {
    const matchedFiles = expandGlob(pattern, cwd);
    for (const relPath of matchedFiles) {
      if (filesToPush.some((f) => f.path === relPath)) continue;
      filesToPush.push({ path: relPath, type: 'A' });
    }
  }

  return filesToPush;
}

async function waitForFork(ghUser: string, repoName: string): Promise<boolean> {
  console.log('Waiting for fork to be ready...');
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    if (gh(['repo', 'view', `${ghUser}/${repoName}`, '--json', 'name']).success) {
      return true;
    }
  }
  return false;
}

async function createPullRequest(
  cwd: string,
  ghUser: string,
  filesToPush: FileEntry[],
  title: string,
  body: string
): Promise<number> {
  const repoName = UPSTREAM_REPO.split('/')[1];
  const forkCheck = gh(['repo', 'view', `${ghUser}/${repoName}`, '--json', 'name']);

  if (!forkCheck.success) {
    console.log('Creating fork...');
    const forkResult = gh(['repo', 'fork', UPSTREAM_REPO, '--clone=false']);
    if (!forkResult.success) {
      console.error('Error creating fork:', forkResult.stderr);
      return 1;
    }
    if (!(await waitForFork(ghUser, repoName))) {
      console.error('Error: Timed out waiting for fork to be ready.');
      return 1;
    }
  }

  const tempDir = join(tmpdir(), `allhands-push-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    console.log('Cloning fork...');
    const cloneResult = gh(['repo', 'clone', `${ghUser}/${repoName}`, tempDir, '--', '--depth=1']);
    if (!cloneResult.success) {
      console.error('Error cloning fork:', cloneResult.stderr);
      return 1;
    }

    console.log('Fetching upstream...');
    const addRemoteResult = git(['remote', 'add', 'upstream', `https://github.com/${UPSTREAM_REPO}`], tempDir);
    if (!addRemoteResult.success) {
      console.error('Error adding upstream remote:', addRemoteResult.stderr);
      return 1;
    }

    const fetchResult = git(['fetch', 'upstream', 'main', '--depth=1'], tempDir);
    if (!fetchResult.success) {
      console.error('Error fetching upstream:', fetchResult.stderr);
      return 1;
    }

    const branchName = `contrib/${ghUser}/${Date.now()}`;
    console.log(`Creating branch: ${branchName}`);

    const checkoutResult = git(['checkout', '-b', branchName, 'upstream/main'], tempDir);
    if (!checkoutResult.success) {
      console.error('Error creating branch:', checkoutResult.stderr);
      return 1;
    }

    console.log('Copying files...');
    for (const file of filesToPush) {
      const src = join(cwd, file.path);
      const dest = join(tempDir, file.path);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }

    const addResult = git(['add', '.'], tempDir);
    if (!addResult.success) {
      console.error('Error staging files:', addResult.stderr);
      return 1;
    }

    const commitResult = git(['commit', '-m', title], tempDir);
    if (!commitResult.success) {
      console.error('Error committing:', commitResult.stderr);
      return 1;
    }

    console.log('Pushing to fork...');
    const pushResult = git(['push', '-u', 'origin', branchName], tempDir);
    if (!pushResult.success) {
      console.error('Error pushing:', pushResult.stderr);
      return 1;
    }

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

    console.log('\nPR created successfully!');
    console.log(prResult.stdout);

    return 0;
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function cmdPush(
  include: string[],
  exclude: string[],
  dryRun: boolean,
  titleArg?: string,
  bodyArg?: string
): Promise<number> {
  const cwd = process.cwd();

  const prereqs = checkPrerequisites(cwd);
  if (!prereqs.success) {
    return 1;
  }
  const ghUser = prereqs.ghUser!;

  const syncConfig = loadSyncConfig(cwd);
  const finalIncludes = include.length > 0 ? include : (syncConfig?.includes || []);
  const finalExcludes = exclude.length > 0 ? exclude : (syncConfig?.excludes || []);

  const filesToPush = collectFilesToPush(cwd, finalIncludes, finalExcludes);

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

  const title = titleArg || await askQuestion('PR title: ');
  if (!title.trim()) {
    console.error('Error: Title cannot be empty');
    return 1;
  }

  const body = bodyArg !== undefined ? bodyArg : await askMultiLineInput('\nPR body:');

  if (!titleArg) {
    console.log();
    if (!(await confirm(`Create PR with title "${title}"?`))) {
      console.log('Aborted');
      return 0;
    }
  } else {
    console.log(`\nCreating PR: "${title}"`);
  }

  console.log(`\nUsing GitHub account: ${ghUser}`);

  return createPullRequest(cwd, ghUser, filesToPush, title, body);
}
