/**
 * Harness Test Utilities - Main Export
 *
 * Provides everything needed for headless E2E testing of the ah CLI.
 *
 * @example
 * ```typescript
 * import {
 *   createFixture,
 *   createMilestoneFixture,
 *   runInFixture,
 *   runHook,
 *   assertSuccess,
 *   assertHookAllowed,
 * } from '../harness/index.js';
 *
 * describe('My E2E Tests', () => {
 *   let fixture: TestFixture;
 *
 *   beforeAll(() => {
 *     fixture = createMilestoneFixture('test-milestone');
 *   });
 *
 *   afterAll(() => {
 *     fixture.cleanup();
 *   });
 *
 *   it('runs a command', async () => {
 *     const result = await runInFixture(fixture, ['validate', 'file.md']);
 *     assertSuccess(result);
 *   });
 * });
 * ```
 */

// Fixture creation and management
export {
  createFixture,
  createMilestoneFixture,
  createSpecFixture,
  getPooledFixture,
  cleanupPool,
  PROMPT_TEMPLATE,
  ALIGNMENT_TEMPLATE,
  SPEC_TEMPLATE,
  PYTHON_SAMPLE,
  TYPESCRIPT_SAMPLE,
  type TestFixture,
  type FixtureOptions,
} from './fixture.js';

// CLI runner
export {
  runCli,
  runInFixture,
  runKnowledgeSearch,
  runValidate,
  runCodeSearch,
  runToolsList,
  runSpecsList,
  runBatch,
  debugResult,
  type RunOptions,
  type RunResult,
  type BatchCommand,
  type BatchResult,
} from './cli-runner.js';

// Hook runner
export {
  runHook,
  runContextHook,
  runEditInject,
  runReadEnforcer,
  runSearchRouter,
  runTldrInject,
  runValidationHook,
  runSchemaCheck,
  runLifecycleHook,
  runStopHook,
  testHookContract,
  testHookContracts,
  debugHookResult,
  type HookType,
  type HookResult,
  type PreToolUseInput,
  type PostToolUseInput,
  type HookContract,
  type ContractResult,
} from './hook-runner.js';

// Assertions
export {
  // CLI assertions
  assertSuccess,
  assertFailure,
  assertStdoutContains,
  assertStderrContains,
  assertStdoutMatches,
  assertJsonOutput,
  assertTimedWithin,
  // Hook assertions
  assertHookAllowed,
  assertHookDenied,
  assertHookBlocked,
  assertHookInjectedContext,
  assertHookContextContains,
  assertDenialReasonContains,
  // Fixture assertions
  assertFileExists,
  assertFileNotExists,
  assertFileContains,
  assertFileMatches,
  assertValidFrontmatter,
  // Git assertions
  assertGitTracked,
  assertGitDirty,
  // Composite assertions
  assertWorkflowSuccess,
  assertContractsPassed,
} from './assertions.js';
