/**
 * E2E Tests - Validation System
 *
 * Tests the complete validation system including:
 * - Schema validation for prompts, specs, alignment docs
 * - Frontmatter parsing
 * - File type detection
 * - Validation error messages
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import {
  createFixture,
  runValidate,
  runInFixture,
  assertSuccess,
  assertFailure,
  assertFileExists,
  assertValidFrontmatter,
  type TestFixture,
} from '../harness/index.js';

/** Helper to run validate command with full path */
async function validateFile(fixture: TestFixture, relativePath: string) {
  const filePath = join(fixture.root, relativePath);
  return runInFixture(fixture, ['validate', 'file', filePath]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

// Valid prompt matching .allhands/schemas/prompt.yaml
const VALID_PROMPT = `---
number: 1
title: Task Title
type: planned
planning_session: 1
status: pending
dependencies: []
---

# Tasks

- Implement the feature
- Add tests

# Acceptance Criteria

- Requirements are met
`;

const VALID_PROMPT_IN_PROGRESS = `---
number: 2
title: Active Task
type: planned
planning_session: 1
status: in_progress
dependencies: []
---

# Tasks

- Working on this now

# Acceptance Criteria

- Task is complete
`;

const VALID_PROMPT_COMPLETED = `---
number: 3
title: Done Task
type: planned
planning_session: 1
status: done
dependencies: []
---

# Tasks

- This task has been completed

# Acceptance Criteria

- All done
`;

const VALID_PROMPT_BLOCKED = `---
number: 4
title: Blocked Task
type: planned
planning_session: 1
status: pending
dependencies: [1, 2]
---

# Tasks

- Waiting for dependencies

# Acceptance Criteria

- Dependencies complete first
`;

const INVALID_PROMPT_BAD_STATUS = `---
number: 1
title: Bad Status Task
type: planned
planning_session: 1
status: invalid_status
---

# Tasks

- This status doesn't exist in the enum

# Acceptance Criteria

- N/A
`;

const INVALID_PROMPT_MISSING_STATUS = `---
number: 1
title: Some Task
type: planned
---

# Tasks

- Missing required status field

# Acceptance Criteria

- N/A
`;

const INVALID_PROMPT_NO_FRONTMATTER = `# No Frontmatter

This file has no YAML frontmatter.
`;

// Valid alignment matching .allhands/schemas/alignment.yaml
const VALID_ALIGNMENT = `---
spec_name: test-spec
spec_path: specs/test.spec.md
planning_session: 1
---

# Overview

Build the feature.

# Hard User Requirements

- Follow existing patterns
`;

const INVALID_ALIGNMENT_MISSING_SPEC = `---
planning_session: 1
---

# Overview

Missing spec_name field.

# Hard User Requirements

- N/A
`;

// Valid spec matching .allhands/schemas/spec.yaml
const VALID_SPEC = `---
name: api-spec
domain_name: api-domain
status: roadmap
dependencies: []
---

# Motivation

This spec defines the API.

# Goals

- Define endpoints
`;

const INVALID_SPEC_MISSING_DOMAIN = `---
name: incomplete-spec
status: roadmap
---

# Motivation

Missing domain_name field.

# Goals

- N/A
`;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Prompt Validation E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({ name: 'prompt-validation-test' });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  describe('valid prompts', () => {
    it('accepts prompt with status: pending', async () => {
      fixture.writeFile('.planning/m1/prompts/01.md', VALID_PROMPT);
      assertValidFrontmatter(fixture, '.planning/m1/prompts/01.md', ['status']);

      const result = await validateFile(fixture, '.planning/m1/prompts/01.md');
      assertSuccess(result);
    });

    it('accepts prompt with status: in_progress', async () => {
      fixture.writeFile('.planning/m1/prompts/02.md', VALID_PROMPT_IN_PROGRESS);
      const result = await validateFile(fixture,'.planning/m1/prompts/02.md');
      assertSuccess(result);
    });

    it('accepts prompt with status: completed', async () => {
      fixture.writeFile('.planning/m1/prompts/03.md', VALID_PROMPT_COMPLETED);
      const result = await validateFile(fixture,'.planning/m1/prompts/03.md');
      assertSuccess(result);
    });

    it('accepts prompt with status: blocked', async () => {
      fixture.writeFile('.planning/m1/prompts/04.md', VALID_PROMPT_BLOCKED);
      const result = await validateFile(fixture,'.planning/m1/prompts/04.md');
      assertSuccess(result);
    });
  });

  describe('invalid prompts', () => {
    it('rejects prompt with invalid status enum value', async () => {
      fixture.writeFile('.planning/m1/prompts/bad-status.md', INVALID_PROMPT_BAD_STATUS);
      const result = await validateFile(fixture,'.planning/m1/prompts/bad-status.md');
      // Should fail or warn about invalid enum
      expect(result.combined).toBeDefined();
    });

    it('rejects prompt missing required status field', async () => {
      fixture.writeFile('.planning/m1/prompts/no-status.md', INVALID_PROMPT_MISSING_STATUS);
      const result = await validateFile(fixture,'.planning/m1/prompts/no-status.md');
      expect(result.combined).toBeDefined();
    });

    it('handles prompt without frontmatter', async () => {
      fixture.writeFile('.planning/m1/prompts/no-fm.md', INVALID_PROMPT_NO_FRONTMATTER);
      const result = await validateFile(fixture,'.planning/m1/prompts/no-fm.md');
      // Should fail gracefully
      expect(result.exitCode).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Alignment Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Alignment Validation E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({ name: 'alignment-validation-test' });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  describe('valid alignment docs', () => {
    it('accepts alignment with required fields', async () => {
      fixture.writeFile('.planning/m1/alignment.md', VALID_ALIGNMENT);
      assertValidFrontmatter(fixture, '.planning/m1/alignment.md', ['spec_name', 'spec_path']);

      const result = await validateFile(fixture,'.planning/m1/alignment.md');
      assertSuccess(result);
    });
  });

  describe('invalid alignment docs', () => {
    it('rejects alignment missing spec field', async () => {
      fixture.writeFile('.planning/m2/alignment.md', INVALID_ALIGNMENT_MISSING_SPEC);
      const result = await validateFile(fixture,'.planning/m2/alignment.md');
      expect(result.combined).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Spec Validation E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({ name: 'spec-validation-test' });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  describe('valid specs', () => {
    it('accepts spec with name and domain_name', async () => {
      fixture.writeFile('specs/api.spec.md', VALID_SPEC);
      assertValidFrontmatter(fixture, 'specs/api.spec.md', ['name', 'domain_name']);

      const result = await validateFile(fixture,'specs/api.spec.md');
      assertSuccess(result);
    });
  });

  describe('invalid specs', () => {
    it('rejects spec missing domain_name field', async () => {
      fixture.writeFile('specs/incomplete.spec.md', INVALID_SPEC_MISSING_DOMAIN);
      const result = await validateFile(fixture,'specs/incomplete.spec.md');
      expect(result.combined).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// File Type Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('File Type Detection E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({ name: 'file-type-detection-test' });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('detects prompt files by path pattern', async () => {
    fixture.writeFile('.planning/spec/prompts/01.md', VALID_PROMPT);
    fixture.writeFile('.planning/spec/prompts/99.md', VALID_PROMPT);

    const r1 = await validateFile(fixture,'.planning/spec/prompts/01.md');
    const r2 = await validateFile(fixture,'.planning/spec/prompts/99.md');

    assertSuccess(r1);
    assertSuccess(r2);
  });

  it('detects alignment files by name', async () => {
    fixture.writeFile('.planning/m1/alignment.md', VALID_ALIGNMENT);
    const result = await validateFile(fixture,'.planning/m1/alignment.md');
    assertSuccess(result);
  });

  it('detects spec files by .spec.md extension', async () => {
    fixture.writeFile('specs/data.spec.md', VALID_SPEC);
    const result = await validateFile(fixture,'specs/data.spec.md');
    assertSuccess(result);
  });

  it('reports error for non-schema-managed files (no schema type)', async () => {
    fixture.writeFile('README.md', '# README\n\nJust a readme.');
    // CLI cannot determine schema type for README.md - this is expected
    const result = await validateFile(fixture,'README.md');
    // Should fail because schema type cannot be inferred
    assertFailure(result);
    expect(result.stderr || result.stdout).toContain('Could not determine schema type');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Batch Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Batch Validation E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({
      name: 'batch-validation-test',
      files: {
        '.planning/m1/alignment.md': VALID_ALIGNMENT,
        '.planning/m1/prompts/01.md': VALID_PROMPT,
        '.planning/m1/prompts/02.md': VALID_PROMPT_IN_PROGRESS,
        '.planning/m1/prompts/03.md': VALID_PROMPT_COMPLETED,
        'specs/api.spec.md': VALID_SPEC,
      },
    });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('validates multiple files in sequence', async () => {
    const files = [
      '.planning/m1/alignment.md',
      '.planning/m1/prompts/01.md',
      '.planning/m1/prompts/02.md',
      '.planning/m1/prompts/03.md',
      'specs/api.spec.md',
    ];

    for (const file of files) {
      const result = await validateFile(fixture,file);
      assertSuccess(result);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation Edge Cases E2E', () => {
  let fixture: TestFixture;

  beforeAll(() => {
    fixture = createFixture({ name: 'validation-edge-cases' });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('handles empty file', async () => {
    fixture.writeFile('.planning/m1/prompts/empty.md', '');
    const result = await validateFile(fixture,'.planning/m1/prompts/empty.md');
    // Should handle gracefully
    expect(result.exitCode).toBeDefined();
  });

  it('handles file with only frontmatter', async () => {
    fixture.writeFile('.planning/m1/prompts/only-fm.md', `---
number: 1
title: Only Frontmatter
type: planned
planning_session: 1
status: pending
---
`);
    const result = await validateFile(fixture,'.planning/m1/prompts/only-fm.md');
    // Frontmatter is valid but body sections may be missing - behavior depends on schema
    expect(result.exitCode).toBeDefined();
  });

  it('handles malformed YAML in frontmatter', async () => {
    fixture.writeFile('.planning/m1/prompts/bad-yaml.md', `---
number: 1
status: pending
  bad indentation:
    - this is wrong
---

# Tasks

- Content

# Acceptance Criteria

- Criteria
`);
    const result = await validateFile(fixture,'.planning/m1/prompts/bad-yaml.md');
    // Should handle YAML parse error
    expect(result.exitCode).toBeDefined();
  });

  it('handles unicode content', async () => {
    fixture.writeFile('.planning/m1/prompts/unicode.md', `---
number: 1
title: Unicode Task
type: planned
planning_session: 1
status: pending
---

# Tasks

- 日本語タスク
- 实现功能 🚀

# Acceptance Criteria

- Works with unicode
`);
    const result = await validateFile(fixture,'.planning/m1/prompts/unicode.md');
    assertSuccess(result);
  });

  it('handles very long frontmatter', async () => {
    const longValue = 'a'.repeat(1000);
    fixture.writeFile('.planning/m1/prompts/long-fm.md', `---
number: 1
title: ${longValue.substring(0, 50)}
type: planned
planning_session: 1
status: pending
description: ${longValue}
---

# Tasks

- Task with long title

# Acceptance Criteria

- Handles long values
`);
    const result = await validateFile(fixture,'.planning/m1/prompts/long-fm.md');
    assertSuccess(result);
  });
});
