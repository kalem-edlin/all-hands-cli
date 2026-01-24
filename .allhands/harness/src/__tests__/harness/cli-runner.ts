/**
 * CLI Runner - Execute ah commands and capture output
 *
 * Provides utilities for running the CLI headlessly and asserting on results.
 */

import { spawn, SpawnOptions, ChildProcess } from 'child_process';
import { join } from 'path';
import type { TestFixture } from './fixture.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RunOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Input to send to stdin */
  stdin?: string;
  /** Whether to expect JSON output */
  expectJson?: boolean;
}

export interface RunResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Stdout as string */
  stdout: string;
  /** Stderr as string */
  stderr: string;
  /** Combined stdout + stderr in order received */
  combined: string;
  /** Whether the command succeeded (exit code 0) */
  success: boolean;
  /** Parsed JSON if expectJson was true and output is valid JSON */
  json?: unknown;
  /** Duration in milliseconds */
  duration: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Paths
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the path to the ah CLI entry point.
 */
function getCliPath(): string {
  // From src/__tests__/harness/ go up to harness root
  return join(__dirname, '..', '..', 'cli.ts');
}

/**
 * Get the tsx executable path.
 */
function getTsxPath(): string {
  // Use npx tsx to run TypeScript directly
  return 'npx';
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run an ah CLI command and capture output.
 */
export async function runCli(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const {
    cwd = process.cwd(),
    env = {},
    timeout = 30000,
    stdin,
    expectJson = false,
  } = options;

  const startTime = Date.now();
  const cliPath = getCliPath();

  return new Promise((resolve) => {
    const spawnEnv: Record<string, string> = {
      ...process.env,
      ...env,
      // Disable color output for consistent parsing
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    } as Record<string, string>;

    const spawnOptions: SpawnOptions = {
      cwd,
      env: spawnEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    // Use tsx to run the CLI TypeScript directly
    const child: ChildProcess = spawn('npx', ['tsx', cliPath, ...args], spawnOptions);

    let stdout = '';
    let stderr = '';
    let combined = '';
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      combined += text;
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      combined += text;
    });

    if (stdin) {
      child.stdin?.write(stdin);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      const result: RunResult = {
        exitCode: timedOut ? -1 : (code ?? 1),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        combined: combined.trim(),
        success: !timedOut && code === 0,
        duration,
      };

      // Try to parse JSON if requested
      if (expectJson && stdout.trim()) {
        try {
          result.json = JSON.parse(stdout.trim());
        } catch {
          // Leave json undefined if parsing fails
        }
      }

      resolve(result);
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      resolve({
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        combined: err.message,
        success: false,
        duration,
      });
    });
  });
}

/**
 * Run a command in the context of a test fixture.
 */
export async function runInFixture(
  fixture: TestFixture,
  args: string[],
  options: Omit<RunOptions, 'cwd'> = {}
): Promise<RunResult> {
  return runCli(args, {
    ...options,
    cwd: fixture.root,
    env: {
      ...fixture.env,
      ...options.env,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a knowledge search command.
 */
export async function runKnowledgeSearch(
  query: string,
  fixture: TestFixture,
  options: { path?: string; k?: number } = {}
): Promise<RunResult> {
  const args = ['knowledge', 'search', query];

  if (options.path) {
    args.push('--path', options.path);
  }
  if (options.k) {
    args.push('--k', options.k.toString());
  }

  return runInFixture(fixture, args);
}

/**
 * Run a validation command.
 * Uses `ah validate file <path>` syntax.
 */
export async function runValidate(
  filePath: string,
  fixture: TestFixture
): Promise<RunResult> {
  // If path is relative, make it absolute relative to fixture
  const { isAbsolute } = await import('path');
  const absPath = isAbsolute(filePath) ? filePath : join(fixture.root, filePath);
  return runInFixture(fixture, ['validate', 'file', absPath], { expectJson: true });
}

/**
 * Run a spawn codesearch command.
 */
export async function runCodeSearch(
  query: string,
  fixture: TestFixture,
  options: { budget?: number } = {}
): Promise<RunResult> {
  const args = ['spawn', 'codesearch', query];

  if (options.budget) {
    args.push('--budget', options.budget.toString());
  }

  return runInFixture(fixture, args, { timeout: 60000 });
}

/**
 * Run a tools list command.
 */
export async function runToolsList(fixture: TestFixture): Promise<RunResult> {
  return runInFixture(fixture, ['tools', 'list'], { expectJson: true });
}

/**
 * Run a specs list command.
 */
export async function runSpecsList(fixture: TestFixture): Promise<RunResult> {
  return runInFixture(fixture, ['specs', 'list']);
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Runner
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchCommand {
  name: string;
  args: string[];
  options?: RunOptions;
  /** Expected outcome for assertions */
  expect?: {
    success?: boolean;
    exitCode?: number;
    stdoutContains?: string[];
    stderrContains?: string[];
  };
}

export interface BatchResult {
  command: BatchCommand;
  result: RunResult;
  passed: boolean;
  failures: string[];
}

/**
 * Run multiple commands in sequence and collect results.
 */
export async function runBatch(
  commands: BatchCommand[],
  fixture: TestFixture
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  for (const command of commands) {
    const result = await runInFixture(fixture, command.args, command.options);
    const failures: string[] = [];

    if (command.expect) {
      const { expect: exp } = command;

      if (exp.success !== undefined && result.success !== exp.success) {
        failures.push(`Expected success=${exp.success}, got ${result.success}`);
      }

      if (exp.exitCode !== undefined && result.exitCode !== exp.exitCode) {
        failures.push(`Expected exitCode=${exp.exitCode}, got ${result.exitCode}`);
      }

      if (exp.stdoutContains) {
        for (const expected of exp.stdoutContains) {
          if (!result.stdout.includes(expected)) {
            failures.push(`Expected stdout to contain "${expected}"`);
          }
        }
      }

      if (exp.stderrContains) {
        for (const expected of exp.stderrContains) {
          if (!result.stderr.includes(expected)) {
            failures.push(`Expected stderr to contain "${expected}"`);
          }
        }
      }
    }

    results.push({
      command,
      result,
      passed: failures.length === 0,
      failures,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print a run result for debugging.
 */
export function debugResult(result: RunResult, label?: string): void {
  console.log('\n' + '='.repeat(60));
  if (label) {
    console.log(`DEBUG: ${label}`);
    console.log('-'.repeat(60));
  }
  console.log(`Exit Code: ${result.exitCode} (${result.success ? 'success' : 'failure'})`);
  console.log(`Duration: ${result.duration}ms`);
  console.log('\n--- STDOUT ---');
  console.log(result.stdout || '(empty)');
  console.log('\n--- STDERR ---');
  console.log(result.stderr || '(empty)');
  if (result.json) {
    console.log('\n--- PARSED JSON ---');
    console.log(JSON.stringify(result.json, null, 2));
  }
  console.log('='.repeat(60) + '\n');
}
