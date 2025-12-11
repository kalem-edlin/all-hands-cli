---
description: Parse plan dependencies and spawn parallel workers for independent streams
argument-hint: [optional-prompt]
---

# Parallel Orchestration

Analyze plan for parallelization opportunities.

## Step 1: Check Plan Status

Run: `.claude/envoy/envoy plans frontmatter`

- **{exists: false}** or **status != active** → Go to Step 4 (Fallback)
- **active** → Continue to Step 2

## Step 2: Parse Plan Dependencies

Read `.claude/plans/<branch>/plan.md`

Extract remaining steps (unchecked `- [ ]` items, excluding `/plan-checkpoint`).

**Dependency analysis:**
- Steps are sequential by default (each depends on previous)
- Independent steps = no code/file overlap with earlier unchecked steps
- Group: independent step + all subsequent steps that depend on it = **work stream**

**Heuristics for independence:**
- Different files/directories mentioned
- Different subsystems (tests vs implementation vs docs)
- Explicit "no dependencies" or "parallel-safe" markers
- TEST steps often independent from each other

## Step 3: Spawn Workers or Continue

**If multiple independent streams found:**

1. Main agent takes Stream 1 (first/largest stream)
2. For each additional stream, spawn parallel-worker:
   ```
   Task(subagent_type="parallel-worker", run_in_background=true)
   Prompt:
   Tasks: [list of tasks in this stream]
   Feature: <feature-name from branch>
   Plan branch: <current branch>
   ```
3. Continue implementing Stream 1
4. When workers complete (AgentOutputTool), run `/plan-checkpoint`

**If single stream only:**
- Report: "Plan has single sequential stream. No parallelization possible."
- Go to Step 4 (Fallback)

## Step 4: Fallback to Prompt

If $ARGUMENTS provided:
- Execute the prompt as a parallel task alongside main work
- Spawn single parallel-worker with prompt as task

If no $ARGUMENTS:
- Report: "No parallelization opportunities found and no fallback prompt provided."
- Workflow cannot run - continue normal sequential implementation

## Output

After analysis, report:
```
Streams identified: N
- Stream 1 (main): [task summary]
- Stream 2 (worker): [task summary]
...
Workers spawned: N-1
Action: [implementing stream 1 | fallback to prompt | no action]
```

---

**Anti-patterns:**
- ❌ Spawning workers for dependent tasks (will cause conflicts)
- ❌ More than 3 parallel workers (diminishing returns)
- ❌ Parallelizing single-file changes (merge conflicts)
