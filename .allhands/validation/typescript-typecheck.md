---
name: typescript-typecheck
description: "TypeScript type checking - verify type safety, catch type errors before runtime - usually a baseline for acceptance criteria - not deep enough to prove useful implementation - but necessary"
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "!**/*.test.ts"
  - "!**/node_modules/**"
---

# TypeScript Type Check

## Purpose

Validates type safety across the codebase. Catches type errors, missing properties, incorrect function signatures, and other static analysis issues before runtime.

## When to Use

- Any change to TypeScript files (`.ts`, `.tsx`)
- After modifying interfaces, types, or function signatures
- When adding new dependencies with type definitions
- Before committing any TypeScript changes

## Validation Commands

```bash
# Full type check (no emit)
npx tsc --noEmit

# Type check specific project
npx tsc --noEmit -p tsconfig.json

# Type check with verbose output
npx tsc --noEmit --extendedDiagnostics
```

## Interpreting Results

**Success**: No output means all types are valid.

**Failure patterns**:
- `TS2322: Type 'X' is not assignable to type 'Y'` - Type mismatch
- `TS2339: Property 'X' does not exist on type 'Y'` - Missing property
- `TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'` - Function argument type error
- `TS7006: Parameter 'X' implicitly has an 'any' type` - Missing type annotation (if strict)

**Resolution**: Fix the type error at the source. Avoid `any` casts unless absolutely necessary.

## CICD Integration

```yaml
# .github/workflows/ci.yaml
typecheck:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npx tsc --noEmit
```
