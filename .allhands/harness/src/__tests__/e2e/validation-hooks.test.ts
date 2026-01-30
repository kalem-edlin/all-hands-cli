/**
 * E2E Tests - Validation Hook Contracts
 *
 * Integration tests for the validation hook pipeline:
 *   schema-pre (PreToolUse) → deny/allow before write
 *   schema (PostToolUse)    → block/allow after write
 *   validation-tools list   → CLI command output contract
 *
 * These tests exercise the full hook→schema→response pipeline using the
 * hook-runner test harness, verifying that the actual enforcement mechanism
 * agents encounter behaves correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createFixture,
  runHook,
  runInFixture,
  testHookContracts,
  assertHookAllowed,
  assertHookDenied,
  assertDenialReasonContains,
  assertContractsPassed,
  assertJsonOutput,
  PROMPT_TEMPLATE,
  type TestFixture,
  type HookContract,
} from '../harness/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const VALID_PROMPT_CONTENT = PROMPT_TEMPLATE('pending', 'Hook Test Task', 1);

const VALID_PROMPT_IN_PROGRESS = PROMPT_TEMPLATE('in_progress', 'Active Task', 2);

const INVALID_PROMPT_BAD_STATUS = `---
number: 1
title: "Bad Status Task"
type: planned
status: garbage_value
dependencies: []
---

# Tasks

- This has an invalid status

# Acceptance Criteria

- N/A
`;

const INVALID_PROMPT_MISSING_STATUS = `---
number: 1
title: "Missing Status"
type: planned
dependencies: []
---

# Tasks

- Missing required status field

# Acceptance Criteria

- N/A
`;

const INVALID_PROMPT_NO_FRONTMATTER = `# No Frontmatter

This file has no YAML frontmatter at all.
`;

// ─────────────────────────────────────────────────────────────────────────────
// schema-pre (PreToolUse) Hook Contracts
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation Hook Contracts E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({
      name: 'validation-hook-contracts',
      files: {
        // Seed valid prompt for Edit tests
        '.planning/test/prompts/01.md': PROMPT_TEMPLATE('pending', 'Seeded Task', 1),
        '.planning/test/prompts/02.md': PROMPT_TEMPLATE('in_progress', 'Active Seeded', 2),
        // Non-schema file
        'src/app.ts': 'export const x = 1;\n',
      },
    });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // schema-pre: PreToolUse (deny/allow before write)
  // ───────────────────────────────────────────────────────────────────────────

  describe('schema-pre hook (PreToolUse)', () => {
    describe('Write tool', () => {
      it('allows valid prompt Write', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/new-valid.md`,
              content: VALID_PROMPT_CONTENT,
            },
          },
          fixture
        );
        assertHookAllowed(result);
      });

      it('denies Write with invalid status enum', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/bad-enum.md`,
              content: INVALID_PROMPT_BAD_STATUS,
            },
          },
          fixture
        );
        assertHookDenied(result);
      });

      it('denies Write with invalid status enum and reason contains Schema Validation', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/bad-enum-2.md`,
              content: INVALID_PROMPT_BAD_STATUS,
            },
          },
          fixture
        );
        assertDenialReasonContains(result, 'Schema Validation');
      });

      it('denies Write missing required status field', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/no-status.md`,
              content: INVALID_PROMPT_MISSING_STATUS,
            },
          },
          fixture
        );
        assertHookDenied(result);
      });

      it('denies Write without frontmatter', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/no-fm.md`,
              content: INVALID_PROMPT_NO_FRONTMATTER,
            },
          },
          fixture
        );
        assertHookDenied(result);
      });

      it('denies Write without frontmatter and reason mentions frontmatter', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/no-fm-2.md`,
              content: INVALID_PROMPT_NO_FRONTMATTER,
            },
          },
          fixture
        );
        assertDenialReasonContains(result, 'frontmatter');
      });

      it('allows Write to non-schema-managed file', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {
              file_path: `${fixture.root}/src/new-file.ts`,
              content: 'export const y = 2;\n',
            },
          },
          fixture
        );
        assertHookAllowed(result);
      });

      it('allows when file_path is missing from tool_input', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Write',
            tool_input: {},
          },
          fixture
        );
        assertHookAllowed(result);
      });
    });

    describe('Edit tool', () => {
      it('allows Edit that produces valid schema result', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Edit',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/01.md`,
              old_string: 'status: pending',
              new_string: 'status: in_progress',
            },
          },
          fixture
        );
        assertHookAllowed(result);
      });

      it('denies Edit that breaks schema (invalid status enum)', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Edit',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/01.md`,
              old_string: 'status: pending',
              new_string: 'status: garbage_value',
            },
          },
          fixture
        );
        assertHookDenied(result);
      });

      it('allows Edit on nonexistent file (early return)', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Edit',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/ghost.md`,
              old_string: 'status: pending',
              new_string: 'status: done',
            },
          },
          fixture
        );
        assertHookAllowed(result);
      });

      it('allows Edit when old_string/new_string missing (early return)', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Edit',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/01.md`,
            },
          },
          fixture
        );
        assertHookAllowed(result);
      });

      it('allows Edit with replace_all that produces valid result', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Edit',
            tool_input: {
              file_path: `${fixture.root}/.planning/test/prompts/01.md`,
              old_string: 'pending',
              new_string: 'in_progress',
              replace_all: true,
            },
          },
          fixture
        );
        assertHookAllowed(result);
      });

      it('allows Edit on non-schema-managed file', async () => {
        const result = await runHook(
          'validation',
          'schema-pre',
          {
            tool_name: 'Edit',
            tool_input: {
              file_path: `${fixture.root}/src/app.ts`,
              old_string: 'export const x = 1;',
              new_string: 'export const x = 2;',
            },
          },
          fixture
        );
        assertHookAllowed(result);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // schema: PostToolUse (block/allow after write)
  // ───────────────────────────────────────────────────────────────────────────

  describe('schema hook (PostToolUse)', () => {
    it('allows after valid prompt file exists', async () => {
      // Seed valid file
      fixture.writeFile('.planning/post/prompts/valid.md', VALID_PROMPT_CONTENT);

      const result = await runHook(
        'validation',
        'schema',
        {
          tool_name: 'Write',
          tool_input: {
            file_path: `${fixture.root}/.planning/post/prompts/valid.md`,
          },
        },
        fixture
      );
      assertHookAllowed(result);
    });

    it('allows after valid in_progress prompt file exists', async () => {
      fixture.writeFile('.planning/post/prompts/active.md', VALID_PROMPT_IN_PROGRESS);

      const result = await runHook(
        'validation',
        'schema',
        {
          tool_name: 'Write',
          tool_input: {
            file_path: `${fixture.root}/.planning/post/prompts/active.md`,
          },
        },
        fixture
      );
      assertHookAllowed(result);
    });

    it('blocks after invalid prompt file exists (bad enum)', async () => {
      fixture.writeFile('.planning/post/prompts/bad-status.md', INVALID_PROMPT_BAD_STATUS);

      const result = await runHook(
        'validation',
        'schema',
        {
          tool_name: 'Write',
          tool_input: {
            file_path: `${fixture.root}/.planning/post/prompts/bad-status.md`,
          },
        },
        fixture
      );
      // blockTool outputs { decision: 'block', reason } format
      const json = result.json as { decision?: string; reason?: string } | undefined;
      expect(json?.decision).toBe('block');
      expect(json?.reason).toContain('Schema Validation');
    });

    it('blocks after prompt file missing frontmatter', async () => {
      fixture.writeFile('.planning/post/prompts/no-fm.md', INVALID_PROMPT_NO_FRONTMATTER);

      const result = await runHook(
        'validation',
        'schema',
        {
          tool_name: 'Write',
          tool_input: {
            file_path: `${fixture.root}/.planning/post/prompts/no-fm.md`,
          },
        },
        fixture
      );
      // blockTool outputs { decision: 'block', reason } format
      const json = result.json as { decision?: string; reason?: string } | undefined;
      expect(json?.decision).toBe('block');
      expect(json?.reason).toContain('frontmatter');
    });

    it('allows for non-schema-managed file', async () => {
      const result = await runHook(
        'validation',
        'schema',
        {
          tool_name: 'Write',
          tool_input: {
            file_path: `${fixture.root}/src/app.ts`,
          },
        },
        fixture
      );
      assertHookAllowed(result);
    });

    it('allows when file_path is missing from tool_input', async () => {
      const result = await runHook(
        'validation',
        'schema',
        {
          tool_name: 'Write',
          tool_input: {},
        },
        fixture
      );
      assertHookAllowed(result);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Declarative Contract Compliance Suite
  // ───────────────────────────────────────────────────────────────────────────

  describe('validation hook contract compliance', () => {
    let contractFixture: TestFixture;

    beforeAll(() => {
      contractFixture = createFixture({
        name: 'validation-contracts',
        files: {
          '.planning/c/prompts/01.md': PROMPT_TEMPLATE('pending', 'Contract Task', 1),
          '.planning/c/prompts/bad.md': INVALID_PROMPT_BAD_STATUS,
        },
      });
    });

    afterAll(() => {
      contractFixture.cleanup();
    });

    it('all schema-pre contracts pass', async () => {
      const contracts: HookContract[] = [
        {
          name: 'schema-pre allows valid prompt Write',
          hookType: 'validation',
          hookName: 'schema-pre',
          input: {
            tool_name: 'Write',
            tool_input: {
              file_path: `${contractFixture.root}/.planning/c/prompts/new.md`,
              content: VALID_PROMPT_CONTENT,
            },
          },
          expect: {
            success: true,
            allowed: true,
          },
        },
        {
          name: 'schema-pre denies invalid enum Write',
          hookType: 'validation',
          hookName: 'schema-pre',
          input: {
            tool_name: 'Write',
            tool_input: {
              file_path: `${contractFixture.root}/.planning/c/prompts/bad-write.md`,
              content: INVALID_PROMPT_BAD_STATUS,
            },
          },
          expect: {
            denied: true,
            denialReasonContains: 'Schema Validation',
          },
        },
        {
          name: 'schema-pre allows non-schema Write',
          hookType: 'validation',
          hookName: 'schema-pre',
          input: {
            tool_name: 'Write',
            tool_input: {
              file_path: `${contractFixture.root}/src/utils.ts`,
              content: 'export const z = 3;\n',
            },
          },
          expect: {
            success: true,
            allowed: true,
          },
        },
      ];

      const results = await testHookContracts(contracts, contractFixture);
      assertContractsPassed(results);
    });

    it('schema allows valid prompt file (PostToolUse)', async () => {
      const result = await runHook(
        'validation',
        'schema',
        {
          tool_name: 'Write',
          tool_input: {
            file_path: `${contractFixture.root}/.planning/c/prompts/01.md`,
          },
        },
        contractFixture
      );
      assertHookAllowed(result);
    });

    it('schema blocks invalid prompt file (PostToolUse)', async () => {
      const result = await runHook(
        'validation',
        'schema',
        {
          tool_name: 'Write',
          tool_input: {
            file_path: `${contractFixture.root}/.planning/c/prompts/bad.md`,
          },
        },
        contractFixture
      );
      // blockTool uses { decision: 'block', reason } format
      const json = result.json as { decision?: string } | undefined;
      expect(json?.decision).toBe('block');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validation-tools list Command Output Contract
// ─────────────────────────────────────────────────────────────────────────────

describe('validation-tools list E2E', () => {
  describe('with validation suites present', () => {
    let fixture: TestFixture;

    beforeAll(() => {
      fixture = createFixture({
        name: 'validation-tools-list-populated',
        copyHarness: true,
      });
    });

    afterAll(() => {
      fixture.cleanup();
    });

    it('returns JSON with success and suites array', async () => {
      const result = await runInFixture(
        fixture,
        ['validation-tools', 'list'],
        { expectJson: true }
      );

      assertJsonOutput(result, (json: { success: boolean; suites: unknown[] }) => {
        return json.success === true && Array.isArray(json.suites);
      });
    });

    it('suite entries contain required fields', async () => {
      const result = await runInFixture(
        fixture,
        ['validation-tools', 'list'],
        { expectJson: true }
      );

      if (result.json) {
        const data = result.json as { suites: Record<string, unknown>[] };
        for (const suite of data.suites) {
          expect(suite).toHaveProperty('name');
          expect(suite).toHaveProperty('description');
          expect(suite).toHaveProperty('globs');
          expect(suite).toHaveProperty('tools');
          expect(suite).toHaveProperty('file');
        }
      }
    });

    it('tools field is a string array on each suite', async () => {
      const result = await runInFixture(
        fixture,
        ['validation-tools', 'list'],
        { expectJson: true }
      );

      if (result.json) {
        const data = result.json as { suites: { tools: unknown }[] };
        for (const suite of data.suites) {
          expect(Array.isArray(suite.tools)).toBe(true);
          for (const tool of suite.tools as unknown[]) {
            expect(typeof tool).toBe('string');
          }
        }
      }
    });
  });

  describe('output structure invariants', () => {
    let fixture: TestFixture;

    beforeAll(() => {
      fixture = createFixture({
        name: 'validation-tools-list-structure',
        copyHarness: true,
      });
    });

    afterAll(() => {
      fixture.cleanup();
    });

    it('count field matches suites array length', async () => {
      const result = await runInFixture(
        fixture,
        ['validation-tools', 'list'],
        { expectJson: true }
      );

      if (result.json) {
        const data = result.json as { suites: unknown[]; count?: number };
        if (data.count !== undefined) {
          expect(data.count).toBe(data.suites.length);
        }
      }
    });

    it('file field follows .allhands/validation/ path pattern', async () => {
      const result = await runInFixture(
        fixture,
        ['validation-tools', 'list'],
        { expectJson: true }
      );

      if (result.json) {
        const data = result.json as { suites: { file: string }[] };
        for (const suite of data.suites) {
          expect(suite.file).toMatch(/^\.allhands\/validation\/.*\.md$/);
        }
      }
    });
  });
});
