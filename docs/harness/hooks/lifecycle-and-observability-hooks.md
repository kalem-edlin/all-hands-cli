---
description: "Agent lifecycle management (stop, compact, session start), observability tracing across all hook events, enforcement rules for tool access, notification delivery, hook discovery/registration, and shared utilities underpinning the hook system."
---

# Lifecycle, Observability, and Infrastructure Hooks

This document covers the hooks that manage agent lifecycles, record observability data, enforce access policies, handle notifications, and provide the shared infrastructure that all hooks depend on.

## Agent Lifecycle

### Stop Handler

[ref:.allhands/harness/src/hooks/lifecycle.ts:handleAgentStop:d7e4a93] runs when an agent signals completion. It:
1. Checks if the agent's tmux window exists via the tmux library
2. Sends a notification that the agent has stopped
3. Retrieves the prompt associated with the agent via [ref:.allhands/harness/src/lib/prompts.ts:getPromptByNumber:79b9873]
4. Kills the tmux window to free resources

The stop handler uses [ref:.allhands/harness/src/hooks/shared.ts:outputStopHook:d7e4a93] with `decision: 'approve'` to confirm the agent should terminate.

### Compaction Handler

[ref:.allhands/harness/src/hooks/lifecycle.ts:handleAgentCompact:d7e4a93] intercepts the PreCompact event -- triggered when an agent's context window fills up. Instead of losing context, it:
1. Delegates to [ref:.allhands/harness/src/lib/compaction.ts:runCompaction:79b9873] which analyzes the conversation state
2. The compaction system uses an oracle to analyze what the agent accomplished and recommend next actions
3. Generates a progress update via [ref:.allhands/harness/src/lib/compaction.ts:formatProgressUpdate:79b9873]
4. Appends the progress to the prompt file via [ref:.allhands/harness/src/lib/prompts.ts:appendToProgressSection:79b9873]
5. Executes the recommendation (commit, continue, or stop) via [ref:.allhands/harness/src/lib/compaction.ts:executeRecommendation:79b9873]
6. Outputs a system message via [ref:.allhands/harness/src/hooks/shared.ts:outputPreCompact:d7e4a93] that survives the compaction

The compaction pipeline captures git diff state through [ref:.allhands/harness/src/lib/compaction.ts:getGitDiffSummary:79b9873] and [ref:.allhands/harness/src/lib/compaction.ts:getGitDiffFull:79b9873] to give the oracle full visibility into what changed.

### Session Start

[ref:.allhands/harness/src/hooks/session.ts:tldrWarm:d7e4a93] runs on SessionStart. It warms the TLDR daemon cache by calling [ref:.allhands/harness/src/lib/tldr.ts:warmIndex:79b9873]. The hook is entirely non-blocking -- if TLDR is not installed or the daemon is already running, it exits silently. Errors are swallowed to never block session initialization.

## Observability

[ref:.allhands/harness/src/hooks/observability.ts::d7e4a93] provides structured logging across every hook event type. Each handler logs to the trace store via [ref:.allhands/harness/src/lib/trace-store.ts:logEvent:79b9873].

### Event Coverage

| Event | Handler | What Gets Logged |
|-------|---------|-----------------|
| SessionStart | [ref:.allhands/harness/src/hooks/observability.ts:handleSessionStart:d7e4a93] | Session ID, timestamp |
| PromptSubmit | [ref:.allhands/harness/src/hooks/observability.ts:handlePromptSubmit:d7e4a93] | Prompt content summary |
| PreToolUse | [ref:.allhands/harness/src/hooks/observability.ts:handleToolPre:d7e4a93] | Tool name, input summary |
| PostToolUse | [ref:.allhands/harness/src/hooks/observability.ts:handleToolPost:d7e4a93] | Tool result, error detection |
| ToolFailure | [ref:.allhands/harness/src/hooks/observability.ts:handleToolFailure:d7e4a93] | Error details, stderr |
| ToolDenied | [ref:.allhands/harness/src/hooks/observability.ts:handleToolDenied:d7e4a93] | Denial reason |
| TaskSpawn | [ref:.allhands/harness/src/hooks/observability.ts:handleTaskSpawn:d7e4a93] | Sub-agent metadata |
| AgentStop | [ref:.allhands/harness/src/hooks/observability.ts:handleAgentStop:d7e4a93] | Completion status |
| AgentCompact | [ref:.allhands/harness/src/hooks/observability.ts:handleAgentCompact:d7e4a93] | Compaction trigger reason |

[ref:.allhands/harness/src/hooks/observability.ts:shouldLogTool:d7e4a93] filters noise by skipping high-frequency, low-value tool calls. [ref:.allhands/harness/src/hooks/observability.ts:summarizeBashCommand:d7e4a93] truncates long shell commands to keep log entries readable. [ref:.allhands/harness/src/hooks/observability.ts:isBashError:d7e4a93] parses Bash tool results to detect non-zero exit codes and stderr output.

[ref:.allhands/harness/src/hooks/observability.ts:handleToolPreWithTaskRouting:d7e4a93] extends the base PreToolUse handler with task-aware routing logic, tracking sub-agent spawns alongside regular tool usage.

## Enforcement Rules

[ref:.allhands/harness/src/hooks/enforcement.ts::d7e4a93] contains PreToolUse hooks that enforce access policies:

- [ref:.allhands/harness/src/hooks/enforcement.ts:enforceGitHubUrl:d7e4a93] -- Intercepts WebFetch/WebSearch for GitHub URLs and redirects agents to use `gh` CLI instead, which has authenticated access and richer output
- [ref:.allhands/harness/src/hooks/enforcement.ts:enforceResearchFetch:d7e4a93] -- Controls web fetch operations during research phases, ensuring agents use approved research channels
- [ref:.allhands/harness/src/hooks/enforcement.ts:enforceResearchSearch:d7e4a93] -- Controls web search operations, applying similar research-phase policies

Enforcement hooks use [ref:.allhands/harness/src/hooks/shared.ts:denyTool:d7e4a93] with specific guidance messages, redirecting agents to better alternatives rather than simply blocking.

## Notifications

[ref:.allhands/harness/src/hooks/notification.ts:handleStopNotification:d7e4a93] and [ref:.allhands/harness/src/hooks/notification.ts:handleCompactNotification:d7e4a93] send system notifications when agents stop or compact. They use [ref:.allhands/harness/src/lib/notification.ts:sendGateNotification:79b9873] to deliver alerts, keeping operators informed of agent lifecycle events without requiring TUI visibility.

## Transcript Parsing

[ref:.allhands/harness/src/hooks/transcript-parser.ts:parseTranscript:d7e4a93] is a utility that processes Claude Code JSONL transcript files into structured summaries (`TranscriptSummary`). It streams the file line-by-line via readline for memory efficiency.

[ref:.allhands/harness/src/hooks/transcript-parser.ts:summarizeToolInput:d7e4a93] condenses verbose tool inputs into one-line summaries. [ref:.allhands/harness/src/hooks/transcript-parser.ts:buildCompactionMessage:d7e4a93] transforms a parsed transcript summary into a system message suitable for compaction injection.

## Hook Registration Infrastructure

### Auto-Discovery

[ref:.allhands/harness/src/hooks/index.ts:discoverAndRegisterHooks:d7e4a93] scans the hooks directory at runtime, dynamically importing every `.ts` file (except `index.ts`, `shared.ts`, and `transcript-parser.ts`). Each module must export a `register(parent: Command)` function that attaches its subcommands to the CLI.

This pattern means adding a new hook category requires only creating the file -- no manual registration.

### Category-Based Registration

[ref:.allhands/harness/src/hooks/shared.ts:registerCategory:d7e4a93] provides declarative hook registration. A `HookCategory` object describes all hooks in a category with their names, event types, matchers, and handler functions. The function generates Commander subcommands for CLI execution.

[ref:.allhands/harness/src/hooks/shared.ts:registerCategoryForDaemon:d7e4a93] does the same registration but targets the CLI daemon's in-process handler registry instead of Commander, enabling the same hook definitions to work in both CLI and daemon modes.

### Shared I/O Protocol

All hooks communicate through a JSON stdin/stdout protocol defined in [ref:.allhands/harness/src/hooks/shared.ts::d7e4a93]:

```mermaid
stateDiagram-v2
    [*] --> ReadInput: stdin JSON
    ReadInput --> ProcessHook: HookInput parsed
    ProcessHook --> AllowTool: No action needed
    ProcessHook --> DenyTool: Block with reason
    ProcessHook --> InjectContext: Add context
    ProcessHook --> OutputContext: Post-tool info
    ProcessHook --> BlockTool: Post-tool block
    ProcessHook --> OutputStopHook: Lifecycle decision
    ProcessHook --> OutputPreCompact: Compaction message
    AllowTool --> [*]: exit(0), no output
    DenyTool --> [*]: JSON + exit(0)
    InjectContext --> [*]: JSON + exit(0)
    OutputContext --> [*]: JSON + exit(0)
    BlockTool --> [*]: JSON + exit(0)
    OutputStopHook --> [*]: JSON + exit(0)
    OutputPreCompact --> [*]: JSON + exit(0)
```

Key I/O functions:
- [ref:.allhands/harness/src/hooks/shared.ts:readHookInput:d7e4a93] -- Reads and parses stdin JSON, normalizing `tool_response` to `tool_result`
- [ref:.allhands/harness/src/hooks/shared.ts:allowTool:d7e4a93] -- Silent exit (no output = allow)
- [ref:.allhands/harness/src/hooks/shared.ts:denyTool:d7e4a93] -- Outputs deny decision with reason
- [ref:.allhands/harness/src/hooks/shared.ts:blockTool:d7e4a93] -- Outputs block decision with message
- [ref:.allhands/harness/src/hooks/shared.ts:injectContext:d7e4a93] -- Modifies tool input to add context
- [ref:.allhands/harness/src/hooks/shared.ts:preToolContext:d7e4a93] -- Adds pre-tool context
- [ref:.allhands/harness/src/hooks/shared.ts:outputContext:d7e4a93] -- Adds post-tool context
- [ref:.allhands/harness/src/hooks/shared.ts:outputStopHook:d7e4a93] -- Approve or block agent stop
- [ref:.allhands/harness/src/hooks/shared.ts:outputPreCompact:d7e4a93] -- Inject compaction system message

### Utility Functions

- [ref:.allhands/harness/src/hooks/shared.ts:getProjectDir:d7e4a93] -- Resolves the project root directory
- [ref:.allhands/harness/src/hooks/shared.ts:loadProjectSettings:d7e4a93] -- Reads `.allhands/settings.json` for project-level configuration
- [ref:.allhands/harness/src/hooks/shared.ts:getBaseBranch:d7e4a93] -- Determines the base branch for git operations
- [ref:.allhands/harness/src/hooks/shared.ts:detectLanguage:d7e4a93] -- Infers programming language from file extension, glob pattern, or type hints
- [ref:.allhands/harness/src/hooks/shared.ts:getCacheDir:d7e4a93] / [ref:.allhands/harness/src/hooks/shared.ts:getCacheSubdir:d7e4a93] -- Manage per-project cache directories
- [ref:.allhands/harness/src/hooks/shared.ts:saveSearchContext:d7e4a93] / [ref:.allhands/harness/src/hooks/shared.ts:loadSearchContext:d7e4a93] -- Persist search state between hooks within a session
