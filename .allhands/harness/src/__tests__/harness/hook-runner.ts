/**
 * Hook Runner - Execute hooks with mock stdin and capture output
 *
 * Hooks communicate via stdin JSON and stdout JSON. This runner
 * provides utilities for testing hook I/O contracts.
 */

import { runCli, type RunOptions, type RunResult } from './cli-runner.js';
import type { TestFixture } from './fixture.js';
import type {
  HookInput,
  PreToolUseOutput,
  PostToolUseOutput,
  StopHookOutput,
  PreCompactOutput,
} from '../../hooks/shared.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HookType = 'context' | 'validation' | 'lifecycle';

export interface HookResult extends RunResult {
  /** Parsed hook output (PreToolUse, PostToolUse, Stop, or PreCompact format) */
  hookOutput?: PreToolUseOutput | PostToolUseOutput | StopHookOutput | PreCompactOutput;
  /** Whether the hook allowed the tool (for PreToolUse) */
  allowed?: boolean;
  /** Whether the hook denied the tool (for PreToolUse) */
  denied?: boolean;
  /** Whether the hook blocked the tool (for PostToolUse) */
  blocked?: boolean;
  /** The system message if present */
  systemMessage?: string;
  /** Denial reason if denied */
  denialReason?: string;
}

export interface PreToolUseInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface PostToolUseInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_result: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a hook with the given input.
 */
export async function runHook(
  hookType: HookType,
  hookName: string,
  input: HookInput,
  fixture?: TestFixture,
  options: Omit<RunOptions, 'stdin' | 'expectJson'> = {}
): Promise<HookResult> {
  const args = ['hooks', hookType, hookName];
  const stdin = JSON.stringify(input);

  const runOptions: RunOptions = {
    ...options,
    stdin,
    expectJson: true,
    cwd: fixture?.root ?? options.cwd,
    env: {
      ...fixture?.env,
      ...options.env,
    },
  };

  const result = await runCli(args, runOptions);
  const hookResult: HookResult = { ...result };

  // Parse hook output if present
  if (result.json) {
    hookResult.hookOutput = result.json as
      | PreToolUseOutput
      | PostToolUseOutput
      | StopHookOutput
      | PreCompactOutput;

    // Extract common fields
    const output = hookResult.hookOutput as Record<string, unknown>;

    if ('systemMessage' in output) {
      hookResult.systemMessage = output.systemMessage as string;
    }

    // PreToolUse output parsing
    if ('hookSpecificOutput' in output) {
      const specific = output.hookSpecificOutput as Record<string, unknown>;
      if (specific.permissionDecision === 'allow') {
        hookResult.allowed = true;
        hookResult.denied = false;
      } else if (specific.permissionDecision === 'deny') {
        hookResult.allowed = false;
        hookResult.denied = true;
        hookResult.denialReason = specific.permissionDecisionReason as string | undefined;
      }
    }

    // PostToolUse output parsing
    if ('continue' in output) {
      hookResult.blocked = output.continue === false;
    } else if ('decision' in output && output.decision === 'block') {
      hookResult.blocked = true;
    }
  } else if (result.success && !result.stdout.trim()) {
    // Empty output = allow (for PreToolUse hooks)
    hookResult.allowed = true;
    hookResult.denied = false;
  }

  return hookResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a context hook (PreToolUse).
 */
export async function runContextHook(
  hookName: string,
  input: PreToolUseInput,
  fixture?: TestFixture,
  options: Omit<RunOptions, 'stdin' | 'expectJson'> = {}
): Promise<HookResult> {
  return runHook('context', hookName, input, fixture, options);
}

/**
 * Test the edit-inject hook.
 */
export async function runEditInject(
  filePath: string,
  fixture?: TestFixture
): Promise<HookResult> {
  return runContextHook(
    'edit-inject',
    {
      tool_name: 'Edit',
      tool_input: { file_path: filePath, old_string: '', new_string: '' },
    },
    fixture
  );
}

/**
 * Test the read-enforcer hook.
 */
export async function runReadEnforcer(
  filePath: string,
  fixture?: TestFixture,
  options: { offset?: number; limit?: number } = {}
): Promise<HookResult> {
  return runContextHook(
    'read-enforcer',
    {
      tool_name: 'Read',
      tool_input: { file_path: filePath, ...options },
    },
    fixture,
    { timeout: 20000 } // read-enforcer has longer timeout
  );
}

/**
 * Test the search-router hook.
 */
export async function runSearchRouter(
  pattern: string,
  fixture?: TestFixture
): Promise<HookResult> {
  return runContextHook(
    'search-router',
    {
      tool_name: 'Grep',
      tool_input: { pattern },
    },
    fixture
  );
}

/**
 * Test the tldr-inject hook for Task tool.
 */
export async function runTldrInject(
  prompt: string,
  fixture?: TestFixture
): Promise<HookResult> {
  return runContextHook(
    'tldr-inject',
    {
      tool_name: 'Task',
      tool_input: { prompt, description: 'Test task' },
    },
    fixture
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a validation hook (PreWrite or PostWrite).
 */
export async function runValidationHook(
  hookName: string,
  input: PreToolUseInput | PostToolUseInput,
  fixture?: TestFixture
): Promise<HookResult> {
  return runHook('validation', hookName, input, fixture);
}

/**
 * Test the schema-check hook (PreWrite validation).
 */
export async function runSchemaCheck(
  filePath: string,
  content: string,
  fixture?: TestFixture
): Promise<HookResult> {
  return runValidationHook(
    'schema-check',
    {
      tool_name: 'Write',
      tool_input: { file_path: filePath, content },
    },
    fixture
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a lifecycle hook (Stop, PreCompact).
 */
export async function runLifecycleHook(
  hookName: string,
  input: HookInput,
  fixture?: TestFixture
): Promise<HookResult> {
  return runHook('lifecycle', hookName, input, fixture);
}

/**
 * Test the stop hook.
 */
export async function runStopHook(
  sessionId: string,
  fixture?: TestFixture
): Promise<HookResult> {
  return runLifecycleHook(
    'stop',
    {
      session_id: sessionId,
      stop_hook_active: true,
    },
    fixture
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Contract Testing
// ─────────────────────────────────────────────────────────────────────────────

export interface HookContract {
  name: string;
  hookType: HookType;
  hookName: string;
  input: HookInput;
  expect: {
    success?: boolean;
    allowed?: boolean;
    denied?: boolean;
    blocked?: boolean;
    hasSystemMessage?: boolean;
    systemMessageContains?: string[];
    denialReasonContains?: string;
  };
}

export interface ContractResult {
  contract: HookContract;
  result: HookResult;
  passed: boolean;
  failures: string[];
}

/**
 * Test a hook against its contract.
 */
export async function testHookContract(
  contract: HookContract,
  fixture?: TestFixture
): Promise<ContractResult> {
  const result = await runHook(
    contract.hookType,
    contract.hookName,
    contract.input,
    fixture
  );

  const failures: string[] = [];
  const { expect: exp } = contract;

  if (exp.success !== undefined && result.success !== exp.success) {
    failures.push(`Expected success=${exp.success}, got ${result.success}`);
  }

  if (exp.allowed !== undefined && result.allowed !== exp.allowed) {
    failures.push(`Expected allowed=${exp.allowed}, got ${result.allowed}`);
  }

  if (exp.denied !== undefined && result.denied !== exp.denied) {
    failures.push(`Expected denied=${exp.denied}, got ${result.denied}`);
  }

  if (exp.blocked !== undefined && result.blocked !== exp.blocked) {
    failures.push(`Expected blocked=${exp.blocked}, got ${result.blocked}`);
  }

  if (exp.hasSystemMessage !== undefined) {
    const hasMsg = !!result.systemMessage;
    if (hasMsg !== exp.hasSystemMessage) {
      failures.push(`Expected hasSystemMessage=${exp.hasSystemMessage}, got ${hasMsg}`);
    }
  }

  if (exp.systemMessageContains && result.systemMessage) {
    for (const expected of exp.systemMessageContains) {
      if (!result.systemMessage.includes(expected)) {
        failures.push(`Expected systemMessage to contain "${expected}"`);
      }
    }
  }

  if (exp.denialReasonContains && result.denialReason) {
    if (!result.denialReason.includes(exp.denialReasonContains)) {
      failures.push(`Expected denialReason to contain "${exp.denialReasonContains}"`);
    }
  }

  return {
    contract,
    result,
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Test multiple hook contracts.
 */
export async function testHookContracts(
  contracts: HookContract[],
  fixture?: TestFixture
): Promise<ContractResult[]> {
  const results: ContractResult[] = [];

  for (const contract of contracts) {
    results.push(await testHookContract(contract, fixture));
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print a hook result for debugging.
 */
export function debugHookResult(result: HookResult, label?: string): void {
  console.log('\n' + '='.repeat(60));
  if (label) {
    console.log(`HOOK DEBUG: ${label}`);
    console.log('-'.repeat(60));
  }
  console.log(`Exit Code: ${result.exitCode} (${result.success ? 'success' : 'failure'})`);
  console.log(`Allowed: ${result.allowed}, Denied: ${result.denied}, Blocked: ${result.blocked}`);
  if (result.denialReason) {
    console.log(`Denial Reason: ${result.denialReason}`);
  }
  if (result.systemMessage) {
    console.log(`\n--- SYSTEM MESSAGE ---`);
    console.log(result.systemMessage.substring(0, 500) + (result.systemMessage.length > 500 ? '...' : ''));
  }
  if (result.hookOutput) {
    console.log(`\n--- RAW HOOK OUTPUT ---`);
    console.log(JSON.stringify(result.hookOutput, null, 2).substring(0, 1000));
  }
  if (result.stderr) {
    console.log(`\n--- STDERR ---`);
    console.log(result.stderr);
  }
  console.log('='.repeat(60) + '\n');
}
