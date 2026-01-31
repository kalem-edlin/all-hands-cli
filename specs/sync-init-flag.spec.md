---
name: sync-init-flag
domain_name: infrastructure
type: milestone
status: completed
dependencies: []
branch: feature/sync-init-flag
---

# Sync CLI `--init` Flag

## Motivation

The sync command currently treats all distributable files identically — every sync overwrites the target repo's copies. This works for harness internals (flows, agents, schemas) that should always match the source, but is destructive for files that target repos are expected to customize: project settings, hook configuration, validation suites, and non-core skills.

Engineers syncing harness updates to a target repo lose their repo-specific `.allhands/settings.json`, `.claude/settings.json` (all hooks), `.tldr/config.json`, validation suites, and any custom skills. The only workaround is manual backup and restore after every sync.

The harness needs a clean separation between "always ship" files (harness internals) and "init-only" files (target-repo-owned configuration seeded once as defaults).

## Goals

### 1. `--init` Flag on the `sync` Command

Engineer expects a `--init` flag on the sync command (`src/commands/sync.ts`). Behavior:

- **Without `--init`**: Init-only files are withheld from sync. Target repo customizations are preserved. This is the common-case operation.
- **With `--init`**: Init-only files are included in sync, following the existing replace flow (conflict detection, backup, overwrite). This is for first-time setup or resetting to defaults.

The `push` command never ships init-only files regardless of flags — PRs contain only always-shipped files.

### 2. `.internal.json` Restructure

Engineer expects `.internal.json` to move from a flat glob list to a two-key structure:

```json
{
  "internal": ["src/**", "bin/**", "...existing patterns..."],
  "initOnly": [
    ".allhands/skills/**",
    "!.allhands/skills/claude-code-patterns/**",
    "!.allhands/skills/harness-maintenance/**",
    ".allhands/validation/**",
    ".allhands/settings.json",
    ".allhands/docs.json",
    ".tldr/config.json",
    ".claude/settings.json"
  ]
}
```

Resolution logic:
1. Matches `internal` → never ship
2. Matches `initOnly` → ship only with `--init` on `sync`, never on `push`
3. Everything else → always ship

The `initOnly` list supports negation patterns (`!` prefix) to carve out exceptions. Skills use this: `.allhands/skills/**` makes all skills init-only, while `!.allhands/skills/claude-code-patterns/**` and `!.allhands/skills/harness-maintenance/**` exempt the two core skills so they always ship.

New skills added to `.allhands/skills/` automatically become init-only without manual configuration.

### 3. `docs.json` Moves to Init-Only

Engineer expects `docs.json` to move from the `internal` list (never distributed) to the `initOnly` list. This means target repos receive it on first `--init` sync as a default, then own it independently. The existing JSON schema at `harness/src/schemas/docs.schema.json` is sufficient — no schema changes needed.

### 4. Manifest System Updates

The `Manifest` class (`src/lib/manifest.ts`) needs to understand the new `.internal.json` structure. Engineer expects:

- Parsing of the two-key format with negation pattern support in `initOnly`
- An API surface that distinguishes "not distributable" (internal), "init-only", and "always distributable"
- The `push` command's `collectFilesToPush` uses the manifest to exclude both `internal` and `initOnly` files
- The `sync` command conditionally includes `initOnly` files based on the `--init` flag

### 5. Remove Dead `fullReplace` Code

`src/lib/full-replace.ts` exports `fullReplace()` but it is not imported or called anywhere in the codebase. Engineer expects it removed as dead code cleanup.

### 6. README Documentation

Engineer expects the README to document the `--init` flag: its purpose, when to use it (first-time setup), and that regular syncs preserve target-repo configuration.

## Non-Goals

- **Auto-detection of first-time setup** — The sync command does not infer whether `--init` is needed. Documentation guides the engineer.
- **Merge strategies for config files** — No partial merging of settings or hooks. Init-only files are all-or-nothing per the existing replace flow.
- **Changes to the `pull-manifest` command** — The pull-manifest scaffolding is unaffected.
- **New validation suites or skills** — This milestone establishes the init-only gate, not new content.

## Open Questions

- **Manifest class API design** — How should the Manifest class expose the init-only concept? Options include a new `isInitOnly(path)` method alongside `isDistributable(path)`, or a single method returning a tri-state (`internal | initOnly | distributable`). Architect should determine the cleanest API that serves both `sync` and `push` consumers.
- **Negation pattern implementation** — The `initOnly` list needs gitignore-style negation. The codebase already uses `GitignoreFilter` (from `src/lib/gitignore.ts`) for gitignore parsing. Architect should determine whether to reuse that infrastructure or use a lighter pattern matcher for the `initOnly` patterns.
- **Backward compatibility of `.internal.json`** — Existing consumer repos may have tooling that reads `.internal.json` as a flat array. Architect should assess whether a migration path is needed or if the restructure is safe given the file's internal-only nature.

## Technical Considerations

- The sync command (`src/commands/sync.ts`) currently calls `manifest.getDistributableFiles()` which returns all non-internal, non-gitignored files. The `--init` flag adds a conditional filter step on the returned set based on `initOnly` patterns.
- The push command (`src/commands/push.ts`) uses `collectFilesToPush()` which already has a multi-stage filtering pipeline (distributable set → blocklist → include/exclude → gitignore → byte-diff). Adding `initOnly` exclusion is an additional filter stage.
- `fullReplace` in `src/lib/full-replace.ts` is dead code — exported but never imported. Safe removal with no downstream impact.
- The `GitignoreFilter` class in `src/lib/gitignore.ts` already handles glob pattern matching with the `ignore` npm package, which natively supports negation patterns. This may be reusable for `initOnly` pattern resolution.
- `.internal.json` is itself listed in the `internal` array (self-referencing to prevent distribution). This must be preserved in the restructured format.

## Implementation Reality

**What was implemented**: All 6 goals delivered as specified. No deviations from the original plan.

**Open Questions resolved**:
- **Manifest API**: `isInitOnly(path)` method alongside existing `isDistributable()` — simpler two-method approach over tri-state, since consumers (sync/push) only need a boolean gate
- **Negation patterns**: Standalone minimatch loop with last-match-wins semantics, not `GitignoreFilter` — appropriate for small, simple root-relative pattern set
- **Backward compatibility**: Non-issue — `.internal.json` is in its own `internal` list and never distributed to consumer repos

**Execution profile**: 4 planned prompts + 1 review-fix (Gemini Code Assist feedback to pre-compile minimatch patterns). All first-attempt. No emergent prompts, no reverts. Prompts 02/03 parallelized successfully after 01 completed.

**Key technical decisions**:
- `getDistributableFiles()` unchanged — still returns init-only files. Filtering happens downstream in sync/push consumers
- Sync filters by mutating the distributable `Set` in-place before conflict detection
- Push places init-only guard as the first filter in both Phase 1 and Phase 2 loops, unconditionally excluding init-only files even from `--include` patterns
- `docs.json` moved from `internal` to `initOnly`, enabling first-time distribution to target repos
