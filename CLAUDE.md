## General Rules

- Never leave comments that mark a update in code given a user prompt to change code.
- When deleting files/functions, use Grep tool to find and update all references.

## Human Checkpoints

Use AskUserQuestion before:
- Creating/modifying agents, skills, hooks → delegate to curator for implementation
- External API calls, architectural decisions

## Main Agent: Specialist Routing

When delegating to specialists:
1. **Task relevance**: Match task domain to specialist's declared capabilities
2. **Scope narrowness**: Prefer specialists whose domain_files overlap most with task files

Fallback to surveyor (discovery) or worker (implementation) when no domain specialist matches.

## Context Budget (50% Rule)

Claude quality degrades at ~50% context usage. Agents MUST self-monitor:

**Self-estimation required:**
- Before large reads: estimate tokens (1 token ≈ 4 chars)
- At ~50% capacity: return early with partial results, request re-delegation
- Discovery agents: return findings in batches via envoy
- Implementation agents: commit incrementally

## Envoy Error Handling

Envoy commands fail in two ways:
1. **stderr/non-zero exit**: Command crashed
2. **{ success: false, error: "...", ... }**: Command ran but operation failed

On failure, agent should infer recovery based on workflow context:
- **Timeout errors**: Return exit, wait for human instructions
- **Recoverable errors**: Re-delegate, retry with different params, or skip non-critical step
- **Ambiguous situations**: Use AskUserQuestion with options

## Documentation-First Implementation

Before implementation tasks, call `envoy knowledge search docs "<task focus as descriptive request>"` (semantic search - use full phrases, not keywords) to find existing patterns. Applies even when planning workflow is bypassed.