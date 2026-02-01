export const SYNC_CONFIG_FILENAME = '.allhands-sync-config.json';
export const SYNC_STATE_FILENAME = '.allhands/.sync-state.json';

// Files that should never be pushed back to upstream
export const PUSH_BLOCKLIST = ['CLAUDE.project.md', '.allhands-sync-config.json', '.allhands/.sync-state.json'];

export const SYNC_CONFIG_TEMPLATE = {
  $comment: 'Customization for claude-all-hands push command',
  includes: [],
  excludes: [],
};
