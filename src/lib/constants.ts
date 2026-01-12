export const SYNC_CONFIG_FILENAME = '.allhands-sync-config.json';

// Files that should never be pushed back to upstream
export const PUSH_BLOCKLIST = ['CLAUDE.project.md', '.allhands-sync-config.json'];

export const SYNC_CONFIG_TEMPLATE = {
  $comment: 'Customization for claude-all-hands push command',
  includes: [],
  excludes: [],
};
