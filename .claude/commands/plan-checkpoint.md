---
description: Trigger this when the plan file requests its use WITHOUT USER INPUT
argument-hint: [--last-commit]
---

Delegate checkpoint review to planner agent.

Provide planner:
- Current branch name
- `--last-commit` if reviewing incremental changes

Planner handles full checkpoint workflow and returns status.
