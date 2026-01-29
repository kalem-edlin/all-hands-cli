import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { cmdSync } from './commands/sync.js';
import { cmdPullManifest } from './commands/pull-manifest.js';
import { cmdPush } from './commands/push.js';
import { checkGitInstalled } from './lib/git.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version;

// Sync command handler for reuse
const syncHandler = async (argv: { target?: string; yes?: boolean }) => {
  const code = await cmdSync(argv.target || '.', argv.yes || false);
  process.exit(code);
};

// Sync command builder for reuse
const syncBuilder = (yargs: yargs.Argv) => {
  return yargs
    .positional('target', {
      describe: 'Target repository path (defaults to current directory)',
      type: 'string',
      default: '.',
    })
    .option('yes', {
      alias: 'y',
      type: 'boolean',
      describe: 'Skip confirmation prompts',
      default: false,
    });
};

async function main() {
  // Check dependencies
  if (!checkGitInstalled()) {
    console.error('Error: git is not installed. Please install git first.');
    process.exit(1);
  }

  const argv = await yargs(hideBin(process.argv))
    .scriptName('all-hands')
    .version(VERSION)
    .usage('$0 <command> [options]')
    .command(
      'sync [target]',
      'Initialize or update allhands in target repo',
      syncBuilder,
      syncHandler
    )
    .command(
      'pull-manifest',
      'Create sync config for push customization',
      () => {},
      async () => {
        const code = await cmdPullManifest();
        process.exit(code);
      }
    )
    .command(
      'push',
      'Create PR to upstream with local changes',
      (yargs) => {
        return yargs
          .option('include', {
            alias: 'i',
            type: 'array',
            describe: 'Additional files/patterns to include',
            default: [],
          })
          .option('exclude', {
            alias: 'e',
            type: 'array',
            describe: 'Files/patterns to exclude',
            default: [],
          })
          .option('dry-run', {
            type: 'boolean',
            describe: 'Preview without creating PR',
            default: false,
          })
          .option('title', {
            alias: 't',
            type: 'string',
            describe: 'PR title (skips prompt)',
          })
          .option('body', {
            alias: 'b',
            type: 'string',
            describe: 'PR body (skips prompt)',
          });
      },
      async (argv) => {
        const code = await cmdPush(
          argv.include as string[],
          argv.exclude as string[],
          argv.dryRun as boolean,
          argv.title as string | undefined,
          argv.body as string | undefined
        );
        process.exit(code);
      }
    )
    .demandCommand(1, 'Please specify a command')
    .strict()
    .help()
    .alias('h', 'help')
    .parse();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
