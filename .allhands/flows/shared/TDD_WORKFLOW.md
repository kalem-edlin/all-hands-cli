<goal>
Apply test-driven development principles to prompt execution. Per **Agentic Validation Tooling**, tests written first create clear acceptance criteria and prevent scope creep.
</goal>

<inputs>
- Prompt file with tasks and acceptance criteria
- Validation tooling reference (if any)
</inputs>

<outputs>
- Failing tests that define success
- Implementation that passes tests
- No production code without corresponding test
</outputs>

<constraints>
- MUST write failing tests before implementation
- MUST implement minimal code to pass tests
- NEVER add untested functionality
</constraints>

## TDD Cycle

```
RED → GREEN → REFACTOR
 │      │        │
 │      │        └─ Improve code quality (tests still pass)
 │      └─ Write minimal code to pass tests
 └─ Write failing tests from acceptance criteria
```

## When to Apply TDD

| Context | TDD Approach |
|---------|--------------|
| High-risk domains (auth, payments, data) | Full TDD - every acceptance criterion tested first |
| Core business logic | Full TDD - tests define behavior |
| UI components | Light TDD - key interactions tested |
| Integration glue code | Light TDD - happy path + error cases |
| Scripts/utilities | Optional - judgment call |

## TDD for Prompts

### Phase 1: RED (Write Failing Tests)

From prompt acceptance criteria, write tests that:
- Define expected behavior precisely
- Cover edge cases mentioned in criteria
- Fail meaningfully (not just "not implemented")

```
Acceptance Criteria: "User can reset password via email"
→ Test: "sends reset email when valid email provided"
→ Test: "returns error for unknown email"
→ Test: "rate limits reset requests"
→ Test: "token expires after 1 hour"
```

### Phase 2: GREEN (Minimal Implementation)

Implement only what's needed to pass tests:
- No extra features
- No "while I'm here" improvements
- No premature optimization

### Phase 3: REFACTOR (Improve Quality)

With passing tests as safety net:
- Extract common code
- Improve naming
- Simplify logic
- Tests must still pass

## Integration with Prompt Execution

When executing prompts with TDD approach:

1. Read acceptance criteria from prompt
2. Generate test cases that prove criteria met
3. Run tests (should fail - RED)
4. Implement minimal code (GREEN)
5. Refactor if needed
6. Run validation review with test evidence

## Test Evidence for Validation

Include in prompt summary:
```markdown
## Test Evidence

| Acceptance Criterion | Test | Status |
|---------------------|------|--------|
| User can reset password | `test_password_reset_happy_path` | PASS |
| Invalid email rejected | `test_password_reset_invalid_email` | PASS |
| Rate limited | `test_password_reset_rate_limit` | PASS |
```

## When NOT to Use Full TDD

- Exploratory/spike work (write tests after if keeping)
- Pure UI layout changes (visual review sufficient)
- Configuration changes (integration test coverage)
- Documentation only

## TDD Philosophy

> "No production code without a failing test first."

The test defines the contract. The implementation fulfills it. The refactor improves it. Never reverse this order.
