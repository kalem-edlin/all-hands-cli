<goal>
Create, edit, and maintain Prompt Task files - the atomic unit of work. Per **Prompt Files as Units of Work**, prompts ARE the tasks, distributed for parallel execution with strict validation gates.
</goal>

<inputs>
- Path to the prompts directory
- Planning session number
</inputs>

<outputs>
- Prompt file(s) at specified path following naming convention
</outputs>

<constraints>
- MUST run `ah schema prompt` for frontmatter and body structure
- MUST include `skills` and `validation_suites` in frontmatter
- MUST include `patches_prompts: [X, Y]` for user-patch prompts
- NEVER modify `status: done` prompts unless explicitly requested
</constraints>

## Schema Reference

- Run `ah schema prompt` for frontmatter and body structure
- Run `ah schema prompt body` for success/failure summary formats

## Core Principles

### Never Modify Completed Prompts
- `status: done` prompts are immutable unless explicitly requested
- Create new prompts to extend or fix completed work

### Write Implementation-Ready Prompts
- Include specific file paths, function names, and code references
- Provide enough detail that implementors don't waste context searching
- Reference relevant existing patterns in the codebase

### Design Intuitive Dependencies
- Map `dependencies: [X, Y]` so prompts execute in correct succession
- Minimize blocking chains - parallelize where possible
- Each prompt should be completable once dependencies are met

## Skills Integration

Skills embed domain expertise into prompts - "how to do it right."

Read `.allhands/flows/shared/SKILL_EXTRACTION.md` and:
- Run `ah skills list` to discover available skills
- Match skills to the prompt's domain (by globs and description)
- Read matched skill files for patterns, best practices, guidelines
- Extract relevant knowledge and embed in Tasks section
- Add matched skill file paths to `skills` frontmatter

Skills provide: code patterns, library preferences, common pitfalls, domain-specific best practices.

If no skill matches: proceed without skill-derived guidance, note the gap.

## Validation Tooling Integration

Per **Agentic Validation Tooling**, each prompt needs explicit validation.

Read `.allhands/flows/shared/UTILIZE_VALIDATION_TOOLING.md` and:
- Run `ah validation-tools list` to discover available suites
- Match suites to the prompt's domain (by globs and description)
- Read matched suite files for specific commands and success criteria
- Add matched suite file paths to `validation_suites` frontmatter

Acceptance criteria must be:
- Specific enough for programmatic validation
- Written with the same rigor a test engineer would apply
- Achievable without human intervention until final E2E
- Derived from validation commands in referenced suites

If no suite matches: note gap, flag for CREATE_VALIDATION_TOOLING follow-up, use basic validation.

**Testing is validation, not prompts**:
- Do NOT create standalone "E2E testing" or "write tests" prompts
- Tests are created as part of feature prompts OR via validation suite setup
- Validation suites (Playwright, pytest, etc.) are attached to prompts via `validation_suites` field
- If no validation suite exists, prompt should create test infrastructure as part of feature work

## Context Budget (Critical)

Per **Context is Precious**, agents degrade with context. Hard limits:

| Context Usage | Quality | Claude's State |
|---------------|---------|----------------|
| 0-30% | PEAK | Thorough, comprehensive |
| 30-50% | GOOD | Solid work |
| 50-70% | DEGRADING | Efficiency mode |
| 70%+ | POOR | Rushed, minimal |

**Scope Limits:**
- **Target ~50% context max**
- 0-3 files modified = small (~15%)
- 4-6 files modified = medium (~25%)
- 7+ files modified = large - SPLIT the prompt

## Task Breakdown Guidelines

- 2-6 tasks per prompt (validatable as a unit)
- Each prompt ends with meaningful validation checkpoint
- Order tasks to derisk critical paths first
- Compound refinement: each prompt builds on prior validated work
- **Plan wiring, not just artifacts** - ensure tasks connect components (API calls, imports, state flow), not just create files in isolation

## Writing the Prompt File

- Write to the prompts directory path
- Naming convention: `<two_digit_number>-<prompt_type>-<title>["-DONE"].prompt.md`
- Include `skills: [.allhands/skills/skill-1/SKILL.md, ...]` in frontmatter
- Include `validation_suites: [.allhands/validation/suite-1.md, ...]` in frontmatter
- For user-patch prompts, include `patches_prompts: [X, Y]`
