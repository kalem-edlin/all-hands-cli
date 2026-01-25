# Planning Directory Refactor: Spec-Based Model

## Core Principle

**Harness = filing cabinet. Agents = judgment.**

The harness code is intentionally dumb - it just manages directories and data. All branching decisions (checkout, merge, create new) are delegated to agent flows that can reason about context.

## Current State

- `.planning/{branch}/` - directories named after git branches
- Branch <-> spec link stored in `status.yaml`
- TUI detects branch changes and loads corresponding planning dir
- Reverse lookup needed to find branch for a spec
- Complex logic to infer branch names, detect changes, auto-create dirs

## Proposed State

- `.planning/{spec}/` - directories named after spec (from spec `name` field)
- `status.yaml` contains `last_known_branch` as a hint, not a hard link
- TUI tracks active spec via `.planning/.active`
- **All branch management delegated to agent flows**

## Separation of Concerns

### Harness Code Does (simple, mechanical):
- Create `.planning/{spec.name}/` directory
- Read/write `status.yaml` with `last_known_branch` field
- Track active spec (`.planning/.active`)
- List available specs

### Agent Flows Do (judgment, context-aware):
- `.allhands/flows/shared/ENABLE_SPEC.md` - reads `last_known_branch`, decides: use existing? merge main? create new branch?
- `.allhands/flows/SPEC_PLANNING.md` - checks branch state before planning, handles conflicts
- Agents update `last_known_branch` after making branch decisions

## Key Changes

### 1. Directory Naming

```
# Before
.planning/feat-taskflow-api/
.planning/fix-auth-bug/

# After
.planning/taskflow-mvp/
.planning/auth-fix/
```

Directory name = `spec.name` from frontmatter, not git branch.

### 2. Status File

```yaml
# Before
name: taskflow-mvp
spec: specs/roadmap/taskflow-mvp.spec.md
branch: feat/taskflow-api  # hard link

# After
name: taskflow-mvp
spec: specs/roadmap/taskflow-mvp.spec.md
last_known_branch: feat/taskflow-api  # hint for agents, nullable
```

### 3. Active Spec Tracking

Option A: File-based
```
.planning/.active  # contains spec name
```

Option B: TUI memory only
- No persistence, user selects each session

Option C: Per-session file
```
.planning/.session-{pid}  # cleaned up on exit
```

**Recommendation**: Option A with fallback. Simple, persistent, easy for agents to read.

### 4. Command Changes (minimal harness commands)

```bash
# Setup: creates .planning/{spec.name}/ with status.yaml
ah planning setup --spec <path>

# Activate: sets .planning/.active to this spec
ah planning activate <spec>

# Status: shows active spec + last_known_branch
ah planning status

# Update branch hint: agents call this after making branch decisions
ah planning update-branch --spec <name> --branch <branch>

# List: shows all specs
ah planning list
```

No branch inference, no auto-checkout, no merge logic. Just data management.

### 5. Agent Branch Management (in flows, not harness code)

This logic lives in `.allhands/flows/shared/ENABLE_SPEC.md`, not in harness code:

1. Read `last_known_branch` from status.yaml
2. If branch exists:
   - Check if behind main → offer merge/rebase
   - Check for uncommitted changes → warn
   - Checkout the branch
3. If branch doesn't exist or is null:
   - Create new branch with sensible name
   - Update `last_known_branch` via `ah planning update-branch`
4. If on wrong branch:
   - Stash or warn about uncommitted work
   - Switch to correct branch

**Key insight**: This is agent judgment, not harness logic. The harness just exposes the data.

### 6. TUI Flow

```
User selects "Switch Spec"
  → List specs from .planning/*/status.yaml
  → User picks one
  → Set .planning/.active
  → Agent handles branch (or TUI spawns branch-manager agent)
```

### 7. Functions to Update (minimal changes)

| Function | Change |
|----------|--------|
| `getPlanningDir(spec)` | Takes spec name, returns `.planning/{spec}/` |
| `getPlanningPaths(spec)` | Same, uses spec not branch |
| `readStatus(spec)` | Same |
| `writeStatus(status, spec)` | Same |
| `initializeStatus(spec, specPath)` | Creates dir, sets `last_known_branch: null` |

### 8. New Functions (simple data access)

```typescript
// Active spec tracking
getActiveSpec(cwd?: string): string | null
setActiveSpec(spec: string, cwd?: string): void

// Branch hint (called by agent flows after they decide on a branch)
updateLastKnownBranch(spec: string, branch: string, cwd?: string): void

// Listing
listSpecs(cwd?: string): SpecInfo[]
```

### 9. Functions to Remove

- `findBranchForSpec()` - no longer needed, no branch<->spec linking
- Branch change detection in event loop - specs are explicit, not inferred
- `suggestBranchName()` oracle calls from TUI - agents handle this in flows

### 10. Migration

For existing `.planning/{branch}/` directories:
- Read `status.yaml` to get spec name
- Rename directory to spec name
- Or: leave as-is, new model only applies to new specs

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Two specs, same branch | Allowed - branch is just a hint |
| Spec with no branch yet | `last_known_branch: null`, agent creates on first use |
| Branch deleted externally | Agent detects, creates new branch |
| User on wrong branch | Agent warns/switches |
| Merge conflicts | Agent surfaces to user |

## Open Questions

1. Should `.planning/.active` be gitignored? (Probably yes - per-machine state)
2. Should agents auto-switch branches or always ask? (Configurable?)
3. How to handle multiple specs in flight? (One active at a time?)
