---
description: Parallel discovery - run multiple subagents simultaneously for read-only exploration
---

# Parallel Discovery Mode

Execute parallel subagent discovery for: $ARGUMENTS

## 1. Analyze Task

Identify 2-4 independent discovery streams. Consider:
- **Explorer**: Code structure, file relationships, implementation details
- **Curator**: Patterns, best practices, .claude/ infrastructure relevance
- **Researcher**: External docs, APIs, recent developments
- **Relevant specialist**: Domain-specific expertise (if exists)

## 2. Spawn Parallel Tasks

In your NEXT response, invoke multiple Task tool calls simultaneously.

**Rules:**
- Each task has explicit, non-overlapping scope
- Request CONCISE findings (10-20% of raw analysis)
- Use `run_in_background: true` for all tasks
- Max 4 parallel streams

**Template:**
```
Task 1: subagent_type=Explore, "Analyze [specific code aspect] for: $ARGUMENTS"
Task 2: subagent_type=curator, "Research [patterns/practices] relevant to: $ARGUMENTS"
Task 3: subagent_type=researcher, "Find [external info] about: $ARGUMENTS" (if needed)
```

## 3. Aggregate Results

After all subagents complete (use AgentOutputTool):
- Synthesize key findings from each stream
- Note conflicts or contradictions
- Recommend approach based on combined analysis

## 4. Return to User

Present unified analysis. Cite which subagent contributed what finding.

---

**Anti-patterns:**
- ❌ Overlapping scopes between subagents
- ❌ Verbose subagent prompts (defeats context preservation)
- ❌ Using for simple tasks (only when multi-perspective valuable)
- ❌ Write operations (this is READ-ONLY discovery)
