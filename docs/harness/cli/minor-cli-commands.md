---
description: "Smaller CLI utilities: skills discovery from YAML frontmatter, desktop notifications via jamf/Notifier with gate/hook variants, and ctags-based complexity metrics for files and directories."
---

## Skills Discovery

[ref:.allhands/harness/src/commands/skills.ts:listSkills:79b9873] scans `.allhands/skills/*/SKILL.md` for skill definitions. Each skill file must have YAML frontmatter with `name`, `description`, and `globs` fields. The command outputs a JSON array of discovered skills with their glob patterns, enabling agents to find domain-specific expertise.

Skills are organized as directories under `.allhands/skills/`, where each directory contains a `SKILL.md` file. The frontmatter schema:

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Skill identifier |
| `description` | Yes | What the skill provides |
| `globs` | Yes | File patterns the skill is relevant for |
| `version` | No | Skill version |
| `license` | No | License information |

## Desktop Notifications

The notification system uses jamf/Notifier (macOS) for system-level desktop notifications. This is designed for situations where agents need human attention -- gate approvals, idle detection, or completion signals.

### Notification Layout

[ref:.allhands/harness/src/lib/notification.ts:sendNotification:79b9873] constructs notifications with three parts:
- **Title**: Event type (e.g., "Agent Stopped", "Plan Gate")
- **Subtitle**: Auto-detected from `repo + branch` context
- **Message**: Specific details for the user

### Notification Variants

| Function | Type | Behavior |
|----------|------|----------|
| [ref:.allhands/harness/src/lib/notification.ts:sendNotification:79b9873] | Configurable | Base function, supports banner or alert |
| [ref:.allhands/harness/src/lib/notification.ts:sendGateNotification:79b9873] | `alert` | Persists until dismissed. Used for decisions requiring human input |
| `sendHookNotification` | `banner` | Auto-dismisses. Used for informational hook events |

Banners auto-dismiss after the system default; alerts persist until the user interacts with them. The `--sound` option triggers a macOS system sound.

The notifier binary is located at `/Applications/Utilities/Notifier.app/Contents/MacOS/Notifier` or via PATH lookup. If not installed, notifications silently fail (no error propagation) -- this is intentional so agents don't break on systems without the notifier.

## Complexity Analysis

[ref:.allhands/harness/src/commands/complexity.ts:complexity:79b9873] provides complexity metrics for files and directories using ctags for symbol counting rather than language-specific AST parsers.

### File Metrics

For a single file, the output includes:

| Metric | Source |
|--------|--------|
| lines | Line count |
| functions | ctags `function` + `method` kinds |
| classes | ctags `class` kind |
| interfaces | ctags `interface` + `type` kinds |
| imports | Regex match on `^import\s` |
| exports | Regex match on `^export\s` |
| total_symbols | Total ctags entries |
| estimated_tokens | `lines * 10` (rough heuristic) |

### Directory Metrics

For directories, the command recursively scans source files (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`), generates a ctags index for the subtree, and aggregates line counts and symbol counts across all files. The output includes `file_count` alongside the aggregated metrics.

Both modes require Universal Ctags to be installed ([ref:.allhands/harness/src/lib/ctags.ts:checkCtagsAvailable:79b9873]).
