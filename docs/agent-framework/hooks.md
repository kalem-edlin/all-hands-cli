---
description: Hook system providing startup initialization, artifact validation, and workflow-specific checks that run automatically without agent involvement.
---

# Hook System

## Overview

Hooks address the gap between conversation start and agent readiness. Before the main agent receives any prompt, the environment needs initialization: plan state checked, worktrees cleaned up, artifacts validated. Hooks run automatically at defined trigger points (startup, pre-commit, etc.), establishing invariants the rest of the framework depends on. Unlike agents, hooks run without Claude involvement - they're scripts that execute and provide results.

## Key Decisions

**Startup hook for session initialization**: The startup hook [ref:.claude/hooks/startup.sh::e12e962] runs before every conversation. It initializes envoy, validates artifacts, releases stale prompts from previous sessions, cleans up orphaned worktrees, and syncs external documentation. This ensures each session starts with a consistent state regardless of how the previous session ended.

**Branch-aware mode detection**: The startup hook examines the current git branch to determine workflow mode. Main/master/develop branches trigger "Direct" mode (no planning required). Feature branches trigger plan initialization and status reporting. Quick/curator/docs prefixed branches bypass planning for their specific workflows. This contextual awareness means users don't need to specify mode - the framework infers it from branch conventions.

**Artifact validation as early feedback**: The validate_artifacts script [ref:.claude/hooks/scripts/validate_artifacts.py::c15ff37] checks agent files for structural issues before the conversation begins. Missing frontmatter, name mismatches, and missing skill references surface as systemMessage JSON, alerting the user immediately rather than failing mid-workflow.

**Agent scanning for configuration integrity**: The scan_agents script [ref:.claude/hooks/scripts/scan_agents.py::c15ff37] parses agent frontmatter to verify structure. It catches issues like skills referencing non-existent directories, ensuring agents won't fail at invocation time.

**Background sync for external resources**: The startup hook clones or pulls claude-code-docs in the background. This keeps official Claude Code documentation current without blocking session start. The docs directory (~/.claude-code-docs) provides authoritative reference for the claude-code-patterns skill.

## Patterns

**systemMessage for user-visible errors**: Validation hooks output JSON with a systemMessage field when errors are found. This message appears to the user at session start, providing immediate awareness of configuration issues without agent interpretation. The format is simple: list of warnings with file and issue description.

**Silent success for expected state**: Hooks that complete successfully typically produce no output. The startup hook's plan status messages are an exception - they provide useful context about where the session should focus. But validation hooks follow the Unix convention of silence on success.

**Worktree cleanup as garbage collection**: The cleanup-worktrees envoy command runs at startup to remove orphaned worktrees. These can accumulate when sessions crash or users switch branches without cleanup. Automatic garbage collection prevents disk accumulation and git confusion.

**Prompt release for session recovery**: The release-all-prompts envoy command unsticks any prompts marked as in_progress from previous sessions. This handles the case where a session died mid-implementation, leaving prompts locked. The next session releases them so work can resume.

## Use Cases

**Session start on feature branch**: User opens Claude Code on a feature branch. The startup hook runs, initializes envoy, validates artifacts. Since it's a feature branch, the hook initializes the plan directory, checks plan status, and reports whether planning is required, in progress, or completed. The main agent receives this context in the session preamble.

**Session start with invalid agent**: User has a typo in an agent's skill reference. The validate_artifacts script catches this and outputs a systemMessage warning. The user sees the warning at session start and can fix the configuration before attempting workflows that depend on that agent.

**Recovery from crashed session**: A previous session crashed during implementation, leaving a prompt in in_progress state. The startup hook's release-all-prompts call frees the prompt. The user can now invoke /continue to resume implementation without manual intervention.

**External docs update**: Claude Code released new documentation. On session start, the startup hook's background sync pulls the latest docs. The claude-code-patterns skill now references current information without user action.
