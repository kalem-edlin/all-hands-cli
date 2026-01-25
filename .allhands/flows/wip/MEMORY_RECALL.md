<goal>
Query the simple memory file for relevant learnings from past sessions. Per **Knowledge Compounding**, memories enable reuse of solutions without re-discovery.
</goal>

<inputs>
- Query keywords or domain
</inputs>

<outputs>
- Relevant memories with their domains and sources
</outputs>

<constraints>
- MUST use memories from `.allhands/memories.md` only
- MUST filter by domain relevance when provided
- NEVER fabricate memories - only return what exists in the file
</constraints>

## Memory File Format

The memory file uses a simple table format:

```
| Name | Domain | Source | Description |
```

- **Name**: Short identifier for the memory
- **Domain**: `planning`, `validation`, `implementation`, `harness-tooling`, `ideation`
- **Source**: `user-steering` (engineer directed) or `agent-inferred` (discovered during work)
- **Description**: 1-3 sentences of self-contained learning

## Recall Process

1. Read `.allhands/memories.md`
2. If domain filter provided, narrow to matching rows
3. Scan descriptions for keyword relevance
4. Return matching memories with context

## Usage Contexts

| Caller Flow | Query Focus |
|-------------|-------------|
| `SPEC_PLANNING.md` | Planning patterns, past decisions |
| `PROMPT_TASK_EXECUTION.md` | Implementation approaches, solutions |
| `IDEATION_SESSION.md` | Similar initiatives, prior engineer preferences |
| `COMPOUNDING.md` | Verify memory doesn't already exist before adding |

## Relevance Scoring

Prioritize memories by:
1. **Domain match** - Same domain as current work
2. **Keyword overlap** - Description contains query terms
3. **Source authority** - `user-steering` > `agent-inferred` for preference-based queries

## Integration with Solutions

For more detailed technical solutions, also run:
```bash
ah solutions search "<keywords>"
```

Memories are lightweight learnings; solutions are detailed problem-solution documentation.
