<goal>
Create, edit, and maintain Prompt Task files - the atomic unit of work in this harness. Prompts are distributed to workers for parallel execution with strict validation gates.
</goal>

<inputs>
- The path to the prompts directory
- The planning session number
</inputs>

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
- Map `dependencies: [X, Y]` so prompts execute in correct succession (may need to read other open prompts (if exists) to confirm)
- Minimize blocking chains - parallelize where possible
- Each prompt should be completable once dependencies are met

## Skills Integration

**This embeds domain expertise into prompts.** Skills are "how to do it right."

Follow `.allhands/flows/shared/SKILL_EXTRACTION.md` to:
1. Run `ah skills list` to discover available skills
2. Match skills to the prompt's domain (by globs and description)
3. Read matched skill files for patterns, best practices, and guidelines
4. Extract relevant knowledge and embed in the prompt's Tasks section
5. Add matched skill file paths to the prompt's `skills` frontmatter

Skills provide:
- Code patterns and library preferences
- Common pitfalls to avoid
- Domain-specific best practices
- Reference sub-documents for deeper context

If no skill matches the prompt's domain:
- Proceed without skill-derived guidance
- Note the gap for potential skill creation follow-up

## Validation Tooling Integration

**This is the crux of the harness.** Each prompt needs explicit validation tooling.

Follow `.allhands/flows/shared/UTILIZE_VALIDATION_TOOLING.md` to:
1. Run `ah validation-tools list` to discover available suites
2. Match suites to the prompt's domain (by globs and description)
3. Read matched suite files for specific commands and success criteria
4. Add matched suite file paths to the prompt's `validation_suites` frontmatter

Acceptance criteria must be:
- Specific enough for programmatic validation
- Written with the same rigor a human tester would apply
- Achievable without human intervention until final E2E
- Derived from the validation commands in referenced suites

If no suite matches the prompt's domain:
- Note the gap in the prompt
- Flag for potential CREATE_VALIDATION_TOOLING follow-up
- Use basic validation (compiles, type checks)

## Task Breakdown Guidelines
- 2-6 tasks per prompt (validatable as a unit)
- Each prompt ends with meaningful validation checkpoint
- Order tasks to derisk critical paths first
- Compound refinement: each prompt builds on prior validated work

## Writing / Editing the prompt file
- Use the prompts directory path to write the prompt file to
- Naming convention: `<two_digit_number>-<prompt_type>-<title>["-DONE"].prompt.md`
- Include `skills: [.allhands/skills/skill-1/SKILL.md, .allhands/skills/skill-2/SKILL.md]` in frontmatter
- Include `validation_suites: [.allhands/validation-tooling/suite-1.md, .allhands/validation-tooling/suite-2.md]` in frontmatter
- For user-patch prompts, include `patches_prompts: [X, Y]` referencing which prompts this patch addresses
