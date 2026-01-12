import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { cmdInit } from './commands/init.js';
import { cmdUpdate } from './commands/update.js';
import { checkGitInstalled } from './lib/git.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version;

async function main() {
  // Check dependencies
  if (!checkGitInstalled()) {
    console.error('Error: git is not installed. Please install git first.');
    process.exit(1);
  }

  const argv = await yargs(hideBin(process.argv))
    .scriptName('claude-all-hands')
    .version(VERSION)
    .usage('$0 <command> [options]')
    .command(
      'init <target>',
      'Initialize allhands in target repo',
      (yargs) => {
        return yargs
          .positional('target', {
            describe: 'Target repository path',
            type: 'string',
            demandOption: true,
          })
          .option('yes', {
            alias: 'y',
            type: 'boolean',
            describe: 'Skip confirmation prompts',
            default: false,
          });
      },
      async (argv) => {
        const code = await cmdInit(argv.target as string, argv.yes as boolean);
        process.exit(code);
      }
    )
    .command(
      'update',
      'Pull latest from allhands',
      (yargs) => {
        return yargs.option('yes', {
          alias: 'y',
          type: 'boolean',
          describe: 'Skip confirmation prompts',
          default: false,
        });
      },
      async (argv) => {
        const code = await cmdUpdate(argv.yes as boolean);
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
