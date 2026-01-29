/**
 * Custom Assertion Helpers for Harness Testing
 *
 * Provides domain-specific assertions for CLI and hook testing.
 */

import { expect } from 'vitest';
import type { RunResult } from './cli-runner.js';
import type { HookResult } from './hook-runner.js';
import type { TestFixture } from './fixture.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// CLI Result Assertions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert that a CLI command succeeded.
 */
export function assertSuccess(result: RunResult, message?: string): void {
  expect(result.success, message ?? `Expected success but got exit code ${result.exitCode}: ${result.stderr}`).toBe(true);
}

/**
 * Assert that a CLI command failed.
 */
export function assertFailure(result: RunResult, message?: string): void {
  expect(result.success, message ?? `Expected failure but command succeeded`).toBe(false);
}

/**
 * Assert stdout contains expected text.
 */
export function assertStdoutContains(result: RunResult, expected: string, message?: string): void {
  expect(
    result.stdout.includes(expected),
    message ?? `Expected stdout to contain "${expected}"\nActual stdout:\n${result.stdout}`
  ).toBe(true);
}

/**
 * Assert stderr contains expected text.
 */
export function assertStderrContains(result: RunResult, expected: string, message?: string): void {
  expect(
    result.stderr.includes(expected),
    message ?? `Expected stderr to contain "${expected}"\nActual stderr:\n${result.stderr}`
  ).toBe(true);
}

/**
 * Assert stdout matches a regex.
 */
export function assertStdoutMatches(result: RunResult, pattern: RegExp, message?: string): void {
  expect(
    pattern.test(result.stdout),
    message ?? `Expected stdout to match ${pattern}\nActual stdout:\n${result.stdout}`
  ).toBe(true);
}

/**
 * Assert JSON output has expected structure.
 */
export function assertJsonOutput<T>(
  result: RunResult,
  validator: (json: T) => boolean,
  message?: string
): void {
  expect(result.json, 'Expected JSON output but none was parsed').toBeDefined();
  expect(
    validator(result.json as T),
    message ?? `JSON output validation failed: ${JSON.stringify(result.json, null, 2)}`
  ).toBe(true);
}

/**
 * Assert command completed within time limit.
 */
export function assertTimedWithin(result: RunResult, maxMs: number, message?: string): void {
  expect(
    result.duration <= maxMs,
    message ?? `Expected completion within ${maxMs}ms but took ${result.duration}ms`
  ).toBe(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Result Assertions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert that a hook allowed the tool.
 */
export function assertHookAllowed(result: HookResult, message?: string): void {
  expect(
    result.allowed,
    message ?? `Expected hook to allow tool but it was ${result.denied ? 'denied' : 'blocked'}: ${result.denialReason ?? result.stderr}`
  ).toBe(true);
}

/**
 * Assert that a hook denied the tool.
 */
export function assertHookDenied(result: HookResult, message?: string): void {
  expect(
    result.denied,
    message ?? `Expected hook to deny tool but it was allowed`
  ).toBe(true);
}

/**
 * Assert that a hook blocked the tool (PostToolUse).
 */
export function assertHookBlocked(result: HookResult, message?: string): void {
  expect(
    result.blocked,
    message ?? `Expected hook to block tool but it was allowed`
  ).toBe(true);
}

/**
 * Assert that a hook injected context.
 */
export function assertHookInjectedContext(result: HookResult, message?: string): void {
  expect(
    result.systemMessage,
    message ?? `Expected hook to inject context (systemMessage) but none was found`
  ).toBeDefined();
  expect(result.systemMessage!.length).toBeGreaterThan(0);
}

/**
 * Assert that hook context contains expected text.
 */
export function assertHookContextContains(result: HookResult, expected: string, message?: string): void {
  assertHookInjectedContext(result);
  expect(
    result.systemMessage!.includes(expected),
    message ?? `Expected systemMessage to contain "${expected}"\nActual:\n${result.systemMessage!.substring(0, 500)}`
  ).toBe(true);
}

/**
 * Assert denial reason contains expected text.
 */
export function assertDenialReasonContains(result: HookResult, expected: string, message?: string): void {
  assertHookDenied(result);
  expect(
    result.denialReason?.includes(expected),
    message ?? `Expected denial reason to contain "${expected}"\nActual: ${result.denialReason}`
  ).toBe(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture Assertions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert that a file exists in the fixture.
 */
export function assertFileExists(fixture: TestFixture, relativePath: string, message?: string): void {
  const fullPath = join(fixture.root, relativePath);
  expect(
    existsSync(fullPath),
    message ?? `Expected file to exist: ${relativePath}`
  ).toBe(true);
}

/**
 * Assert that a file does not exist in the fixture.
 */
export function assertFileNotExists(fixture: TestFixture, relativePath: string, message?: string): void {
  const fullPath = join(fixture.root, relativePath);
  expect(
    existsSync(fullPath),
    message ?? `Expected file to not exist: ${relativePath}`
  ).toBe(false);
}

/**
 * Assert file content contains expected text.
 */
export function assertFileContains(
  fixture: TestFixture,
  relativePath: string,
  expected: string,
  message?: string
): void {
  assertFileExists(fixture, relativePath);
  const content = readFileSync(join(fixture.root, relativePath), 'utf-8');
  expect(
    content.includes(expected),
    message ?? `Expected ${relativePath} to contain "${expected}"\nActual:\n${content.substring(0, 500)}`
  ).toBe(true);
}

/**
 * Assert file content matches regex.
 */
export function assertFileMatches(
  fixture: TestFixture,
  relativePath: string,
  pattern: RegExp,
  message?: string
): void {
  assertFileExists(fixture, relativePath);
  const content = readFileSync(join(fixture.root, relativePath), 'utf-8');
  expect(
    pattern.test(content),
    message ?? `Expected ${relativePath} to match ${pattern}`
  ).toBe(true);
}

/**
 * Assert file has valid YAML frontmatter.
 */
export function assertValidFrontmatter(
  fixture: TestFixture,
  relativePath: string,
  requiredFields: string[] = []
): void {
  assertFileExists(fixture, relativePath);
  const content = readFileSync(join(fixture.root, relativePath), 'utf-8');

  // Check frontmatter exists
  expect(content.startsWith('---'), `Expected ${relativePath} to start with frontmatter`).toBe(true);

  const endIndex = content.indexOf('---', 3);
  expect(endIndex > 3, `Expected ${relativePath} to have closing frontmatter delimiter`).toBe(true);

  const frontmatter = content.substring(3, endIndex).trim();

  // Check required fields
  for (const field of requiredFields) {
    expect(
      frontmatter.includes(`${field}:`),
      `Expected frontmatter to contain "${field}" field`
    ).toBe(true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Git Assertions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert file is tracked by git.
 */
export async function assertGitTracked(
  fixture: TestFixture,
  relativePath: string,
  message?: string
): Promise<void> {
  const { execSync } = await import('child_process');
  try {
    execSync(`git ls-files --error-unmatch "${relativePath}"`, {
      cwd: fixture.root,
      stdio: 'pipe',
    });
  } catch {
    expect.fail(message ?? `Expected ${relativePath} to be tracked by git`);
  }
}

/**
 * Assert file has uncommitted changes.
 */
export async function assertGitDirty(
  fixture: TestFixture,
  relativePath: string,
  message?: string
): Promise<void> {
  const { execSync } = await import('child_process');
  const status = execSync(`git status --porcelain "${relativePath}"`, {
    cwd: fixture.root,
    encoding: 'utf-8',
  });
  expect(
    status.trim().length > 0,
    message ?? `Expected ${relativePath} to have uncommitted changes`
  ).toBe(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite Assertions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert a complete command workflow succeeded.
 */
export function assertWorkflowSuccess(
  results: { name: string; result: RunResult }[],
  message?: string
): void {
  const failures = results.filter((r) => !r.result.success);
  if (failures.length > 0) {
    const details = failures
      .map((f) => `  ${f.name}: exit ${f.result.exitCode}, stderr: ${f.result.stderr}`)
      .join('\n');
    expect.fail(message ?? `Workflow had ${failures.length} failures:\n${details}`);
  }
}

/**
 * Assert all hook contracts passed.
 */
export function assertContractsPassed(
  results: { contract: { name: string }; passed: boolean; failures: string[] }[],
  message?: string
): void {
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    const details = failed
      .map((f) => `  ${f.contract.name}:\n    ${f.failures.join('\n    ')}`)
      .join('\n');
    expect.fail(message ?? `${failed.length} contracts failed:\n${details}`);
  }
}
