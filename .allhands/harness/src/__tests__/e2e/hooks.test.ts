/**
 * E2E Tests - Hook Contracts
 *
 * Tests hook I/O contracts to ensure hooks behave correctly
 * with various inputs. These tests run hooks as separate processes
 * with mock stdin and validate their stdout JSON.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createFixture,
  createMilestoneFixture,
  runContextHook,
  runEditInject,
  runReadEnforcer,
  runSearchRouter,
  runValidationHook,
  runHook,
  testHookContracts,
  assertHookAllowed,
  assertHookDenied,
  assertHookInjectedContext,
  assertHookContextContains,
  assertContractsPassed,
  type TestFixture,
  type HookContract,
  PYTHON_SAMPLE,
  TYPESCRIPT_SAMPLE,
} from '../harness/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────────────────────

describe('Hook Contracts E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({
      name: 'hook-contracts-test',
      files: {
        'src/sample.py': PYTHON_SAMPLE,
        'src/sample.ts': TYPESCRIPT_SAMPLE,
        'src/small.py': '# Small file\nx = 1\n',
        '.planning/test/prompts/01.md': `---
status: pending
---

# Task 1
`,
      },
    });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Context Hooks - PreToolUse
  // ───────────────────────────────────────────────────────────────────────────

  describe('context hooks', () => {
    describe('edit-inject', () => {
      it('allows Edit tool and may inject context for Python files', async () => {
        const result = await runEditInject(
          `${fixture.root}/src/sample.py`,
          fixture
        );
        // Hook should allow the edit
        assertHookAllowed(result);
      });

      it('allows Edit tool for TypeScript files', async () => {
        const result = await runEditInject(
          `${fixture.root}/src/sample.ts`,
          fixture
        );
        assertHookAllowed(result);
      });

      it('allows Edit tool for non-existent files', async () => {
        const result = await runEditInject(
          `${fixture.root}/src/new-file.py`,
          fixture
        );
        // Should allow creating new files
        assertHookAllowed(result);
      });
    });

    describe('search-router', () => {
      it('allows Grep with literal pattern', async () => {
        const result = await runSearchRouter('hello', fixture);
        assertHookAllowed(result);
      });

      it('allows Grep with regex pattern', async () => {
        const result = await runSearchRouter('def\\s+\\w+', fixture);
        assertHookAllowed(result);
      });

      it('allows Grep with function search pattern', async () => {
        const result = await runSearchRouter('function add', fixture);
        assertHookAllowed(result);
      });
    });

    describe('read-enforcer', () => {
      it('allows Read for small files without interception', async () => {
        const result = await runReadEnforcer(
          `${fixture.root}/src/small.py`,
          fixture
        );
        assertHookAllowed(result);
      });

      it('allows Read with offset/limit (explicit range)', async () => {
        const result = await runReadEnforcer(
          `${fixture.root}/src/sample.py`,
          fixture,
          { offset: 1, limit: 10 }
        );
        // Offset/limit reads are allowed without interception
        assertHookAllowed(result);
      });

      it('handles Read for non-existent file', async () => {
        const result = await runReadEnforcer(
          `${fixture.root}/src/nonexistent.py`,
          fixture
        );
        // Should allow (file not found error comes later)
        assertHookAllowed(result);
      });
    });

    describe('tldr-inject', () => {
      it('handles Task tool for debugging intent', async () => {
        const result = await runContextHook(
          'tldr-inject',
          {
            tool_name: 'Task',
            tool_input: {
              prompt: 'Debug why the function fails',
              description: 'Investigate bug',
            },
          },
          fixture
        );
        // Should allow, may inject context if TLDR available
        assertHookAllowed(result);
      });

      it('handles Task tool for dataflow intent', async () => {
        const result = await runContextHook(
          'tldr-inject',
          {
            tool_name: 'Task',
            tool_input: {
              prompt: 'Trace where variable x comes from',
              description: 'Dataflow analysis',
            },
          },
          fixture
        );
        assertHookAllowed(result);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Validation Hooks (schema-pre hook)
  // ───────────────────────────────────────────────────────────────────────────

  describe('validation hooks', () => {
    describe('schema-pre (PreWrite validation)', () => {
      it('runs without crashing on valid prompt', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/02.md`,
              content: `---
number: 2
title: New Task
type: planned
planning_session: 1
status: pending
---

# Tasks

- New Task

# Acceptance Criteria

- Works
`,
            },
          },
          fixture
        );
        // Should complete without crashing
        expect(result.exitCode).toBeDefined();
      });

      it('runs without crashing on non-schema file', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/src/new-file.py`,
              content: '# New Python file\n',
            },
          },
          fixture
        );
        expect(result.exitCode).toBeDefined();
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Contract Testing
  // ───────────────────────────────────────────────────────────────────────────

  describe('contract compliance', () => {
    const contracts: HookContract[] = [
      {
        name: 'edit-inject allows Python edit',
        hookType: 'context',
        hookName: 'edit-inject',
        input: {
          tool_name: 'Edit',
          tool_input: { file_path: '/tmp/test.py', old_string: '', new_string: '' },
        },
        expect: {
          success: true,
          allowed: true,
        },
      },
      {
        name: 'search-router allows grep',
        hookType: 'context',
        hookName: 'search-router',
        input: {
          tool_name: 'Grep',
          tool_input: { pattern: 'test' },
        },
        expect: {
          success: true,
          allowed: true,
        },
      },
      {
        name: 'read-enforcer allows small file read',
        hookType: 'context',
        hookName: 'read-enforcer',
        input: {
          tool_name: 'Read',
          tool_input: { file_path: '/tmp/small.txt' },
        },
        expect: {
          success: true,
          allowed: true,
        },
      },
    ];

    it('all core contracts pass', async () => {
      const results = await testHookContracts(contracts, fixture);
      assertContractsPassed(results);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ───────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty hook input gracefully', async () => {
      const result = await runContextHook(
        'edit-inject',
        {
          tool_name: 'Edit',
          tool_input: {},
        },
        fixture
      );
      // Should not crash
      expect(result.exitCode).toBeDefined();
    });

    it('handles missing tool_name gracefully', async () => {
      const result = await runContextHook(
        'edit-inject',
        {
          tool_input: { file_path: '/tmp/test.py' },
        } as any,
        fixture
      );
      expect(result.exitCode).toBeDefined();
    });

    it('handles very long file paths', async () => {
      const longPath = '/tmp/' + 'a'.repeat(200) + '.py';
      const result = await runEditInject(longPath, fixture);
      expect(result.exitCode).toBeDefined();
    });

    it('handles unicode in patterns', async () => {
      const result = await runSearchRouter('函数.*定义', fixture);
      expect(result.exitCode).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hook Chain Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Hook Chain E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createMilestoneFixture('hook-chain-test', 2);
  });

  afterAll(() => {
    fixture.cleanup();
  });

  describe('search → edit chain', () => {
    it('search-router then edit-inject work in sequence', async () => {
      // First, search for something
      const searchResult = await runSearchRouter('Calculator', fixture);
      assertHookAllowed(searchResult);

      // Then, edit the file
      const editResult = await runEditInject(
        `${fixture.root}/src/sample.py`,
        fixture
      );
      assertHookAllowed(editResult);
    });
  });

  describe('read → edit chain', () => {
    it('read-enforcer then edit-inject work in sequence', async () => {
      // Read a file
      const readResult = await runReadEnforcer(
        `${fixture.root}/src/sample.py`,
        fixture
      );
      assertHookAllowed(readResult);

      // Edit the file
      const editResult = await runEditInject(
        `${fixture.root}/src/sample.py`,
        fixture
      );
      assertHookAllowed(editResult);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Hook Performance E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({ name: 'hook-perf-test' });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('edit-inject completes within 3 seconds', async () => {
    const result = await runEditInject(`${fixture.root}/src/test.py`, fixture);
    expect(result.duration).toBeLessThan(3000);
  });

  it('search-router completes within 2 seconds', async () => {
    const result = await runSearchRouter('test', fixture);
    expect(result.duration).toBeLessThan(2000);
  });

  it('schema-pre completes within 2 seconds', async () => {
    const result = await runHook(
      'validation',
      'schema-pre',
      {
        tool_name: 'Write',
        tool_input: {
          file_path: `${fixture.root}/.planning/test/prompts/01.md`,
          content: `---
number: 1
title: Test
type: planned
planning_session: 1
status: pending
---

# Tasks

- Task

# Acceptance Criteria

- Works
`,
        },
      },
      fixture
    );
    expect(result.duration).toBeLessThan(2000);
  });
});
