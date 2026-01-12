import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isGitRepo } from '../lib/git.js';

const SYNC_CONFIG_FILENAME = '.allhands-sync-config.json';

const TEMPLATE_CONFIG = {
  $comment: 'Customization for claude-all-hands push command',
  includes: [],
  excludes: [],
};

export async function cmdPullManifest(): Promise<number> {
  const cwd = process.cwd();

  if (!isGitRepo(cwd)) {
    console.error('Error: Not in a git repository');
    return 1;
  }

  const configPath = join(cwd, SYNC_CONFIG_FILENAME);

  if (existsSync(configPath)) {
    console.error(`Error: ${SYNC_CONFIG_FILENAME} already exists`);
    console.error('Remove it first if you want to regenerate');
    return 1;
  }

  writeFileSync(configPath, JSON.stringify(TEMPLATE_CONFIG, null, 2) + '\n');

  console.log(`Created ${SYNC_CONFIG_FILENAME}`);
  console.log('\nUsage:');
  console.log('  - Add file paths to "includes" to push additional files');
  console.log('  - Add file paths to "excludes" to skip tracking changes');
  console.log('  - Commit this file to persist your push configuration');

  return 0;
}
