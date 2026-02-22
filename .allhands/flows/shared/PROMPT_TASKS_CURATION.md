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
- MUST include `skills` in frontmatter
- MUST include `patches_prompts: [X, Y]` for user-patch prompts
- NEVER modify `status: done` prompts unless explicitly requested
- NEVER create prompt summary entries in the alignment doc's `## Prompt Summaries` section. Per **Prompt Files as Units of Work**, those entries are written exclusively by executor agents after prompt completion — they document decisions made and work done, which don't exist yet at creation time.
- - Testing should NOT be a its own prompt 
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

Run `ah skills search` with the prompt's domain and files being touched:

- Embed returned skill guidance in the prompt's Tasks section
- Add matched skill file paths to `skills` frontmatter
- Read skill reference files if deeper detail is needed

Skills provide: code patterns, library preferences, common pitfalls, domain-specific best practices.

If no skill matches: proceed without skill-derived guidance, note the gap.

## Context Budget (Critical)

Per **Context is Precious**, agents degrade with context. Hard limits:

| Context Usage | Quality   | Claude's State          |
| ------------- | --------- | ----------------------- |
| 0-30%         | PEAK      | Thorough, comprehensive |
| 30-50%        | GOOD      | Solid work              |
| 50-70%        | DEGRADING | Efficiency mode         |
| 70%+          | POOR      | Rushed, minimal         |

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
- For user-patch prompts, include `patches_prompts: [X, Y]`
