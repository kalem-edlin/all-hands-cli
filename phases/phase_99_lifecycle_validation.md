# Phase 99: Programmatic Lifecycle Validation (Deferred)

## Status: UNLIKELY TO IMPLEMENT

This phase documents a hypothetical approach to programmatic enforcement of command lifecycle order-of-operations. After discussion, we concluded that **AI orchestration via protocols is sufficient** - agents follow well-defined protocols and programmatic enforcement adds maintenance burden without proportional benefit.

This document exists for reference if the approach is ever reconsidered.

---

## The Problem (If We Had One)

Envoy commands have implicit ordering requirements:
- Can't complete a prompt that wasn't started
- Can't run testing gate without implementation
- Debug prompts need logging gate before implementation
- Variant prompts need variant resolution before completion

Currently, these are enforced by **protocol definitions** that agents follow. If we wanted **programmatic enforcement**, this is how we'd do it.

---

## Arguments Against (Why This Is Deferred)

1. **Double maintenance** - Lifecycle logic in protocols AND code will drift
2. **Rigidity** - Code can't reason about valid edge cases
3. **AI handles it** - Well-prompted agents follow protocols correctly
4. **Error UX** - Static errors less helpful than contextual AI guidance
5. **Still evolving** - Workflow changes require code refactors

---

## Hypothetical Design: Declarative State Machine

### Single source of truth: `lifecycle.ts`

```typescript
// .claude/envoy/src/lib/lifecycle.ts

/**
 * PROMPT LIFECYCLE STATE MACHINE
 *
 * Maintainers: When adding/modifying commands that affect prompt state,
 * update the transitions here. Commands validate against this definition.
 *
 * Flow: unimplemented → implemented → reviewed → tested → merged
 *       (with gates based on prompt kind and flags)
 */

import { PromptFrontmatter } from './schemas';

export type PromptStatus = 'unimplemented' | 'implemented' | 'reviewed' | 'tested' | 'merged';
export type PromptKind = 'feature' | 'debug';

// ============================================
// GATE DEFINITIONS (reusable building blocks)
// ============================================

interface Gate {
  name: string;
  check: (prompt: PromptFrontmatter) => boolean;
  error: string;
}

const GATES = {
  isStarted: {
    name: 'started',
    check: (p) => p.in_progress === true,
    error: 'Prompt must be started first (envoy plan start-prompt)',
  },

  hasImplementation: {
    name: 'implementation',
    check: (p) => (p.walkthrough?.length ?? 0) > 0,
    error: 'Implementation must be recorded (envoy plan record-implementation)',
  },

  debugLoggingComplete: {
    name: 'debug_logging',
    check: (p) => p.kind !== 'debug' || p.completed_debug_logging === true,
    error: 'Debug prompts require logging gate (envoy plan block-debugging-logging-gate)',
  },

  testingPassed: {
    name: 'testing',
    check: (p) => !p.requires_manual_testing || p.testing_passed === true,
    error: 'Manual testing required (envoy plan block-prompt-testing-gate)',
  },

  variantResolved: {
    name: 'variant',
    check: (p) => !p.variant || p.variant_solution !== null,
    error: 'Variant must be resolved (envoy plan block-prompt-variants-gate)',
  },
} as const;

// ============================================
// STATE TRANSITIONS (the lifecycle)
// ============================================

interface Transition {
  from: PromptStatus;
  to: PromptStatus;
  gates: Gate[];
}

const TRANSITIONS: Transition[] = [
  {
    from: 'unimplemented',
    to: 'implemented',
    gates: [GATES.isStarted, GATES.debugLoggingComplete],
  },
  {
    from: 'implemented',
    to: 'reviewed',
    gates: [GATES.hasImplementation],
  },
  {
    from: 'reviewed',
    to: 'tested',
    gates: [GATES.testingPassed],
  },
  {
    from: 'tested',
    to: 'merged',
    gates: [GATES.variantResolved],
  },
];

// ============================================
// COMMAND REQUIREMENTS (what each command needs)
// ============================================

const COMMAND_REQUIREMENTS: Record<string, Gate[]> = {
  'start-prompt': [],  // always allowed on unimplemented
  'record-implementation': [GATES.isStarted],
  'block-debugging-logging-gate': [GATES.isStarted],
  'block-prompt-testing-gate': [GATES.hasImplementation],
  'block-prompt-variants-gate': [GATES.testingPassed],
  'complete-prompt': [GATES.hasImplementation, GATES.testingPassed, GATES.variantResolved],
};

// ============================================
// VALIDATION API (what commands call)
// ============================================

export interface ValidationSuccess { valid: true }
export interface ValidationFailure { valid: false; errors: string[] }
export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validate a state transition is allowed
 */
export function validateTransition(
  prompt: PromptFrontmatter,
  targetStatus: PromptStatus
): ValidationResult {
  const transition = TRANSITIONS.find(
    t => t.from === prompt.status && t.to === targetStatus
  );

  if (!transition) {
    return {
      valid: false,
      errors: [`Invalid transition: ${prompt.status} → ${targetStatus}`],
    };
  }

  const errors = transition.gates
    .filter(gate => !gate.check(prompt))
    .map(gate => gate.error);

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Check if a specific command can run given current prompt state
 */
export function canRunCommand(
  command: string,
  prompt: PromptFrontmatter
): { allowed: true } | { allowed: false; reason: string } {
  const requirements = COMMAND_REQUIREMENTS[command];
  if (!requirements) return { allowed: true };

  for (const req of requirements) {
    if (!req.check(prompt)) {
      return { allowed: false, reason: req.error };
    }
  }
  return { allowed: true };
}

/**
 * Get human-readable lifecycle status for debugging
 */
export function describePromptState(prompt: PromptFrontmatter): string {
  const checks = Object.entries(GATES).map(([name, gate]) => ({
    name,
    passed: gate.check(prompt),
  }));

  return checks
    .map(c => `${c.passed ? '✓' : '✗'} ${c.name}`)
    .join('\n');
}
```

---

## Usage in Commands

Each command calls one function at the top:

```typescript
// In plan.ts - complete-prompt command
import { canRunCommand } from '../lib/lifecycle';

async completePrompt(num: number, variant?: string) {
  const prompt = await this.readPromptFrontmatter(num, variant);

  const check = canRunCommand('complete-prompt', prompt);
  if (!check.allowed) {
    return this.error(check.reason);
  }

  // ... rest of command
}
```

---

## Extending for Other Entity Types

If needed, same pattern extends to findings and plan-level validation:

```typescript
// Findings lifecycle (if ever needed)
const FINDINGS_GATES = {
  hasApproaches: {
    name: 'approaches',
    check: (f) => f.approaches?.length > 0,
    error: 'Findings must have at least one approach',
  },
  questionsAnswered: {
    name: 'questions',
    check: (f) => f.approaches.every(a =>
      !a.required_clarifying_questions?.length ||
      a.user_addressed_questions?.length > 0
    ),
    error: 'All clarifying questions must be answered',
  },
};

// Plan lifecycle (if ever needed)
const PLAN_GATES = {
  hasFindingsGatePassed: {
    name: 'findings_gate',
    check: (p) => p.findings_archived === true,
    error: 'Findings gate must complete before implementation',
  },
};
```

---

## Design Properties

| Property | How Achieved |
|----------|--------------|
| Single location | All lifecycle logic in `lifecycle.ts` |
| Obvious to maintainers | Gates named, transitions declarative |
| Self-documenting | Error messages explain what to do |
| Reusable | Commands call `canRunCommand()` |
| Easy to modify | Add gate → add to GATES → add to transition |
| Composable | Gates combine for complex requirements |

---

## What It Intentionally Doesn't Do

- No implicit state changes (commands still do that explicitly)
- No enforcement of protocol flow (that's still AI orchestration)
- No blocking - just validation before proceeding
- No automatic remediation - errors are informational

---

## If We Ever Implement This

**Prerequisites:**
1. Observed pattern of agents skipping required steps
2. Plan state corruption causing user-facing bugs
3. Stable lifecycle design (not actively changing)

**Implementation steps:**
1. Create `lifecycle.ts` with state machine
2. Add `completed_debug_logging` field to prompt schema
3. Add `testing_passed` field to prompt schema (or derive from status)
4. Update each command to call `canRunCommand()` at entry
5. Add `envoy plan validate-state` command for debugging

---

## Success Criteria (If Implemented)

- [ ] All lifecycle transitions defined in single file
- [ ] Commands fail fast with actionable errors
- [ ] No duplicate validation logic across commands
- [ ] Error messages reference correct remediation command
- [ ] `envoy plan validate-state` shows current prompt state
- [ ] No regression in valid workflows
