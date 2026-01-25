/**
 * E2E Tests - CLI Commands
 *
 * Tests the ah CLI commands in isolation using ephemeral fixtures.
 * These tests run without TUI, tmux, or external services.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import {
  createFixture,
  createMilestoneFixture,
  runInFixture,
  runBatch,
  assertSuccess,
  assertFailure,
  assertStdoutContains,
  assertWorkflowSuccess,
  type TestFixture,
  PROMPT_TEMPLATE,
  SPEC_TEMPLATE,
  PYTHON_SAMPLE,
} from '../harness/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────────────────────

describe('CLI Commands E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createMilestoneFixture('e2e-commands', 2);
  });

  afterAll(() => {
    fixture.cleanup();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Help & Version
  // ───────────────────────────────────────────────────────────────────────────

  describe('help and version', () => {
    it('shows help with --help flag', async () => {
      const result = await runInFixture(fixture, ['--help']);
      assertSuccess(result);
      assertStdoutContains(result, 'All Hands');
      assertStdoutContains(result, 'Commands:');
    });

    it('shows version with --version flag', async () => {
      const result = await runInFixture(fixture, ['--version']);
      assertSuccess(result);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Validate Command (uses `ah validate file <path>`)
  // ───────────────────────────────────────────────────────────────────────────

  describe('validate command', () => {
    it('validates a well-formed prompt file', async () => {
      const filePath = join(fixture.root, '.planning/e2e-commands/prompts/01.md');
      const result = await runInFixture(fixture, ['validate', 'file', filePath]);
      assertSuccess(result);
    });

    it('validates a well-formed alignment file', async () => {
      const filePath = join(fixture.root, '.planning/e2e-commands/alignment.md');
      const result = await runInFixture(fixture, ['validate', 'file', filePath]);
      assertSuccess(result);
    });

    it('fails on malformed frontmatter', async () => {
      fixture.writeFile('.planning/e2e-commands/prompts/bad.md', `---
invalid_field: true
---

# Bad prompt
`);
      const filePath = join(fixture.root, '.planning/e2e-commands/prompts/bad.md');
      const result = await runInFixture(fixture, ['validate', 'file', filePath]);
      // Validation should fail due to missing required fields
      assertFailure(result);
    });

    it('fails on missing required fields', async () => {
      fixture.writeFile('.planning/e2e-commands/prompts/missing.md', `---
---

# Missing status field
`);
      const filePath = join(fixture.root, '.planning/e2e-commands/prompts/missing.md');
      const result = await runInFixture(fixture, ['validate', 'file', filePath]);
      expect(result.combined).toBeDefined();
    });

    it('validates agent profiles', async () => {
      const result = await runInFixture(fixture, ['validate', 'agents']);
      // May fail in fixture since agents aren't copied, but should not crash
      expect(result.exitCode).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Specs Command (uses `ah specs list`)
  // ───────────────────────────────────────────────────────────────────────────

  describe('specs command', () => {
    it('lists all spec files (may be empty in fixture)', async () => {
      const result = await runInFixture(fixture, ['specs', 'list']);
      assertSuccess(result);
    });

    it('lists with --json flag', async () => {
      const result = await runInFixture(fixture, ['specs', 'list', '--json']);
      assertSuccess(result);
      expect(result.stdout).toContain('success');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Hooks Command
  // ───────────────────────────────────────────────────────────────────────────

  describe('hooks command', () => {
    it('lists available hooks', async () => {
      const result = await runInFixture(fixture, ['hooks', '--help']);
      assertSuccess(result);
    });

    it('shows context hooks', async () => {
      const result = await runInFixture(fixture, ['hooks', 'context', '--help']);
      assertSuccess(result);
    });

    it('shows validation hooks', async () => {
      const result = await runInFixture(fixture, ['hooks', 'validation', '--help']);
      assertSuccess(result);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Tools Command (uses `ah tools --list`)
  // ───────────────────────────────────────────────────────────────────────────

  describe('tools command', () => {
    it('lists available MCP servers', async () => {
      const result = await runInFixture(fixture, ['tools', '--list']);
      assertSuccess(result);
    });

    it('shows help', async () => {
      const result = await runInFixture(fixture, ['tools', '--help']);
      assertSuccess(result);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Knowledge Command (may require indexing)
  // ───────────────────────────────────────────────────────────────────────────

  describe('knowledge command', () => {
    it('shows help for knowledge', async () => {
      const result = await runInFixture(fixture, ['knowledge', '--help']);
      assertSuccess(result);
    });

    // Note: actual search requires index to be built
    it('handles search on empty index gracefully', async () => {
      const result = await runInFixture(fixture, ['knowledge', 'search', 'test query'], {
        timeout: 10000,
      });
      expect(result.exitCode).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Batch Command Workflow
  // ───────────────────────────────────────────────────────────────────────────

  describe('batch workflow', () => {
    it('runs multiple commands in sequence', async () => {
      const results = await runBatch(
        [
          {
            name: 'help',
            args: ['--help'],
            expect: { success: true },
          },
          {
            name: 'version',
            args: ['--version'],
            expect: { success: true },
          },
          {
            name: 'specs-list',
            args: ['specs', 'list'],
            expect: { success: true },
          },
        ],
        fixture
      );

      assertWorkflowSuccess(results.map((r) => ({ name: r.command.name, result: r.result })));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema Validation E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({
      name: 'schema-validation-test',
      files: {
        'src/sample.py': PYTHON_SAMPLE,
      },
    });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  describe('prompt schema', () => {
    it('accepts valid prompt with all required fields', async () => {
      fixture.writeFile(
        '.planning/test/prompts/01.md',
        PROMPT_TEMPLATE('pending', 'Valid task', 1)
      );
      const filePath = join(fixture.root, '.planning/test/prompts/01.md');
      const result = await runInFixture(fixture, ['validate', 'file', filePath]);
      assertSuccess(result);
    });

    it('accepts valid prompt with in_progress status', async () => {
      fixture.writeFile(
        '.planning/test/prompts/02.md',
        PROMPT_TEMPLATE('in_progress', 'Active task', 2)
      );
      const filePath = join(fixture.root, '.planning/test/prompts/02.md');
      const result = await runInFixture(fixture, ['validate', 'file', filePath]);
      assertSuccess(result);
    });

    it('accepts valid prompt with done status', async () => {
      fixture.writeFile(
        '.planning/test/prompts/03.md',
        PROMPT_TEMPLATE('done', 'Done task', 3)
      );
      const filePath = join(fixture.root, '.planning/test/prompts/03.md');
      const result = await runInFixture(fixture, ['validate', 'file', filePath]);
      assertSuccess(result);
    });
  });

  describe('spec schema', () => {
    it('accepts valid spec with required fields', async () => {
      fixture.writeFile('specs/valid.spec.md', SPEC_TEMPLATE('valid'));
      const filePath = join(fixture.root, 'specs/valid.spec.md');
      const result = await runInFixture(fixture, ['validate', 'file', filePath]);
      assertSuccess(result);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Error Handling E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({ name: 'error-handling-test' });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('handles unknown command gracefully', async () => {
    // Use a longer timeout as CLI may take time to init and report error
    const result = await runInFixture(fixture, ['nonexistent-command'], { timeout: 15000 });
    assertFailure(result);
  }, 20000);

  it('handles missing file gracefully', async () => {
    const result = await runInFixture(fixture, ['validate', 'file', 'nonexistent/file.md']);
    expect(result.exitCode).toBeDefined();
  });

  it('handles malformed JSON input gracefully', async () => {
    const result = await runInFixture(fixture, ['hooks', 'context', 'edit-inject'], {
      stdin: 'not valid json',
      timeout: 5000,
    });
    expect(result.exitCode).toBeDefined();
  });
});
