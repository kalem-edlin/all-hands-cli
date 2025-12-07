---
description: Review implementation against plan
args: [branch-name]
---

If the branch name is not provided, you MUST use AskUserQuestion to ask for the branch name.

Create a new branch with the given name and switch to it.

If the branch name is not one of "main", "master", "develop", "staging", "production", or starts with "quick/" (ie not in direct mode), run `/plan` to start planning.

