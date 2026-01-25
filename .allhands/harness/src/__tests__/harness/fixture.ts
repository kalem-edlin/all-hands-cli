/**
 * Ephemeral Test Fixture Creation
 *
 * Creates temporary project directories with the proper structure
 * for testing harness functionality in isolation.
 */

import { mkdirSync, writeFileSync, rmSync, cpSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FixtureOptions {
  /** Unique name for the fixture (auto-generated if not provided) */
  name?: string;
  /** Whether to copy the real harness from .allhands/ */
  copyHarness?: boolean;
  /** Whether to initialize as a git repo */
  initGit?: boolean;
  /** Initial files to create (path -> content) */
  files?: Record<string, string>;
  /** Environment variables to set when running commands */
  env?: Record<string, string>;
}

export interface TestFixture {
  /** Root directory of the fixture */
  root: string;
  /** Path to .allhands directory */
  allhands: string;
  /** Path to .planning directory */
  planning: string;
  /** Path to specs directory */
  specs: string;
  /** Path to src directory */
  src: string;
  /** Environment variables for this fixture */
  env: Record<string, string>;
  /** Write a file relative to fixture root */
  writeFile: (relativePath: string, content: string) => void;
  /** Read a file relative to fixture root */
  readFile: (relativePath: string) => string;
  /** Check if file exists relative to fixture root */
  exists: (relativePath: string) => boolean;
  /** Clean up the fixture */
  cleanup: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture Templates
// ─────────────────────────────────────────────────────────────────────────────

/** Prompt file template matching .allhands/schemas/prompt.yaml */
export const PROMPT_TEMPLATE = (
  status: 'pending' | 'in_progress' | 'done' = 'pending',
  title: string = 'Test Task',
  number: number = 1
) => `---
number: ${number}
title: "${title.replace(/"/g, '\\"')}"
type: planned
planning_session: 1
status: ${status}
dependencies: []
attempts: 0
commits: []
validation_suites: []
skills: []
---

# Tasks

- Implement the feature
- Add tests

# Acceptance Criteria

- Feature works as expected
- Tests pass
`;

/** Alignment doc template matching .allhands/schemas/alignment.yaml */
export const ALIGNMENT_TEMPLATE = (
  specName: string = 'test-spec',
  specPath: string = 'specs/test.spec.md'
) => `---
spec_name: ${specName}
spec_path: ${specPath}
planning_session: 1
---

# Overview

Test alignment document.

# Hard User Requirements

- Must follow existing patterns
`;

/** Spec file template matching .allhands/schemas/spec.yaml */
export const SPEC_TEMPLATE = (
  name: string = 'test-spec',
  domainName: string = 'test-domain'
) => `---
name: ${name}
domain_name: ${domainName}
status: roadmap
dependencies: []
---

# Motivation

Test specification motivation.

# Goals

- Goal 1
- Goal 2
`;

/** Sample Python file for edit/validation tests */
export const PYTHON_SAMPLE = `"""Sample Python module for testing."""

def hello(name: str) -> str:
    """Return a greeting."""
    return f"Hello, {name}!"

class Calculator:
    """Simple calculator class."""

    def add(self, a: int, b: int) -> int:
        """Add two numbers."""
        return a + b

    def subtract(self, a: int, b: int) -> int:
        """Subtract b from a."""
        return a - b
`;

/** Sample TypeScript file */
export const TYPESCRIPT_SAMPLE = `/**
 * Sample TypeScript module for testing.
 */

export interface User {
  id: string;
  name: string;
  email: string;
}

export function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}

export class UserService {
  private users: Map<string, User> = new Map();

  add(user: User): void {
    this.users.set(user.id, user);
  }

  get(id: string): User | undefined {
    return this.users.get(id);
  }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Fixture Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the real harness directory (for copying to fixtures).
 */
function getRealHarnessDir(): string {
  // Navigate from this file to the harness root
  return join(dirname(dirname(dirname(__dirname))));
}

/**
 * Get the real .allhands directory.
 */
function getRealAllhandsDir(): string {
  return join(getRealHarnessDir(), '..');
}

/**
 * Create an ephemeral test fixture.
 */
export function createFixture(options: FixtureOptions = {}): TestFixture {
  const {
    name = `ah-test-${randomBytes(4).toString('hex')}`,
    copyHarness = false,
    initGit = true,
    files = {},
    env = {},
  } = options;

  // Create temp directory
  const root = join(tmpdir(), name);

  // Clean up if exists from previous failed run
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }

  mkdirSync(root, { recursive: true });

  // Create standard directories
  const allhands = join(root, '.allhands');
  const planning = join(root, '.planning');
  const specs = join(root, 'specs');
  const src = join(root, 'src');

  mkdirSync(allhands, { recursive: true });
  mkdirSync(planning, { recursive: true });
  mkdirSync(specs, { recursive: true });
  mkdirSync(src, { recursive: true });

  // Copy real harness if requested
  if (copyHarness) {
    const realAllhands = getRealAllhandsDir();
    cpSync(realAllhands, allhands, { recursive: true });
  } else {
    // Create minimal harness structure
    mkdirSync(join(allhands, 'harness'), { recursive: true });
    mkdirSync(join(allhands, 'flows'), { recursive: true });
    mkdirSync(join(allhands, 'schemas'), { recursive: true });
    mkdirSync(join(allhands, 'validation'), { recursive: true });

    // Create minimal schema files
    writeFileSync(
      join(allhands, 'schemas', 'prompt.yaml'),
      `# Prompt schema\nrequired:\n  - status\nproperties:\n  status:\n    type: string\n    enum: [pending, in_progress, completed, blocked]\n`
    );

    writeFileSync(
      join(allhands, 'schemas', 'alignment.yaml'),
      `# Alignment schema\nrequired:\n  - spec_name\nproperties:\n  spec_name:\n    type: string\n`
    );

    writeFileSync(
      join(allhands, 'schemas', 'spec.yaml'),
      `# Spec schema\nrequired:\n  - name\n  - version\nproperties:\n  name:\n    type: string\n  version:\n    type: integer\n`
    );
  }

  // Initialize git repo if requested
  if (initGit) {
    execSync('git init', { cwd: root, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: root, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: root, stdio: 'pipe' });
  }

  // Write initial files
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

  // Build fixture object
  const fixture: TestFixture = {
    root,
    allhands,
    planning,
    specs,
    src,
    env: {
      CLAUDE_PROJECT_DIR: root,
      ...env,
    },
    writeFile: (relativePath: string, content: string) => {
      const fullPath = join(root, relativePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    },
    readFile: (relativePath: string) => {
      return readFileSync(join(root, relativePath), 'utf-8');
    },
    exists: (relativePath: string) => {
      return existsSync(join(root, relativePath));
    },
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };

  return fixture;
}

/**
 * Create a fixture with a complete spec structure.
 */
export function createSpecFixture(
  specName: string = 'test-spec',
  promptCount: number = 3
): TestFixture {
  const files: Record<string, string> = {
    // Spec file
    [`specs/${specName}.spec.md`]: SPEC_TEMPLATE(specName, 'test-domain'),
    // Alignment doc
    [`.planning/${specName}/alignment.md`]: ALIGNMENT_TEMPLATE(
      specName,
      `specs/${specName}.spec.md`
    ),
    // Sample source files
    ['src/sample.py']: PYTHON_SAMPLE,
    ['src/sample.ts']: TYPESCRIPT_SAMPLE,
  };

  // Add prompts
  for (let i = 1; i <= promptCount; i++) {
    const num = i.toString().padStart(2, '0');
    files[`.planning/${specName}/prompts/${num}.md`] = PROMPT_TEMPLATE(
      i === 1 ? 'in_progress' : 'pending',
      `Task ${i}: Implement feature ${i}`,
      i
    );
  }

  return createFixture({
    name: `ah-spec-${specName}`,
    files,
    env: {
      SPEC_NAME: specName,
    },
  });
}

/**
 * Create a fixture with spec files.
 */
export function createSpecFixture(specs: string[] = ['api', 'data-model']): TestFixture {
  const files: Record<string, string> = {};

  for (const spec of specs) {
    files[`specs/${spec}.spec.md`] = SPEC_TEMPLATE(spec, 'test-domain');
  }

  return createFixture({
    name: 'ah-specs-test',
    files,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture Pool (for reuse across tests)
// ─────────────────────────────────────────────────────────────────────────────

const fixturePool: Map<string, TestFixture> = new Map();

/**
 * Get or create a named fixture from the pool.
 * Useful for sharing fixtures across tests in the same file.
 */
export function getPooledFixture(name: string, factory: () => TestFixture): TestFixture {
  if (!fixturePool.has(name)) {
    fixturePool.set(name, factory());
  }
  return fixturePool.get(name)!;
}

/**
 * Clean up all pooled fixtures.
 * Call this in afterAll() hooks.
 */
export function cleanupPool(): void {
  for (const fixture of fixturePool.values()) {
    fixture.cleanup();
  }
  fixturePool.clear();
}
