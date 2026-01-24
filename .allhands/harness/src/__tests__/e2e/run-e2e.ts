#!/usr/bin/env tsx
/**
 * E2E Test Runner
 *
 * Standalone script to run E2E tests with proper setup.
 * Can be run directly: npx tsx src/__tests__/e2e/run-e2e.ts
 *
 * Options:
 *   --verbose    Show detailed output
 *   --filter     Filter tests by name pattern
 *   --list       List available test suites without running
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const harnessRoot = join(__dirname, '..', '..', '..');

interface RunOptions {
  verbose: boolean;
  filter?: string;
  list: boolean;
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  return {
    verbose: args.includes('--verbose') || args.includes('-v'),
    filter: args.find((a) => a.startsWith('--filter='))?.split('=')[1],
    list: args.includes('--list'),
  };
}

function listTestSuites(): void {
  console.log('\nAvailable E2E Test Suites:\n');

  const e2eDir = __dirname;
  const files = readdirSync(e2eDir).filter((f) => f.endsWith('.test.ts'));

  for (const file of files) {
    console.log(`  • ${file.replace('.test.ts', '')}`);
  }

  console.log('\nRun with: npm run test:e2e');
  console.log('Or:       npx vitest run src/__tests__/e2e/');
  console.log('Filter:   npx vitest run src/__tests__/e2e/ -t "pattern"');
}

async function runTests(options: RunOptions): Promise<number> {
  console.log('\n🧪 Running E2E Tests\n');
  console.log('━'.repeat(60));

  const args = ['vitest', 'run', 'src/__tests__/e2e/'];

  if (options.verbose) {
    args.push('--reporter=verbose');
  }

  if (options.filter) {
    args.push('-t', options.filter);
  }

  return new Promise((resolve) => {
    const child = spawn('npx', args, {
      cwd: harnessRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Ensure consistent output
        FORCE_COLOR: '1',
      },
    });

    child.on('close', (code) => {
      console.log('\n' + '━'.repeat(60));
      if (code === 0) {
        console.log('✅ All E2E tests passed\n');
      } else {
        console.log(`❌ E2E tests failed with code ${code}\n`);
      }
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      console.error('Failed to run tests:', err);
      resolve(1);
    });
  });
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.list) {
    listTestSuites();
    process.exit(0);
  }

  const exitCode = await runTests(options);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
