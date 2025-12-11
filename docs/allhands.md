# AllHands Distribution System

Bidirectional sync for distributing Claude Code framework across repos.

## Commands

| Command | Description |
|---------|-------------|
| `allhands init <target> [-y]` | Initialize framework in target repo |
| `allhands update [-y]` | Pull latest from source |
| `allhands sync-back [--auto]` | Sync improvements back as PR |
| `allhands check-ignored <files>` | Filter files through .allhandsignore |

## Manifest (`.allhands-manifest.json`)

```json
{
  "distribute": [".claude/**", ".husky/**", "CLAUDE.md"],
  "exclude": ["**/.venv/**", "pnpm-lock.yaml"],
  "internal": ["scripts/allhands/**", ".github/**", "README.md"]
}
```

- **distribute**: Copied to target repos
- **exclude**: Never synced (venv, cache, locks)
- **internal**: Source-only (scripts, CI, docs)

## File Migration (init)

| Existing Target File | Migrated To |
|---------------------|-------------|
| `CLAUDE.md` | `CLAUDE.project.md` |
| `.claude/settings.json` | `.claude/settings.local.json` |
| `.husky/pre-commit` | `.husky/project/pre-commit` |

## .allhandsignore

Target repos exclude project-specific files from sync-back:

```gitignore
CLAUDE.project.md
.claude/settings.local.json
.husky/project/**
.claude/agents/my-specialist.md
```

## Sync-Back Flow

```
Target (feature branch)
    │
    └─ Merge to protected branch (main/master/develop)
         │
         └─ post-merge hook triggers sync-back
              │
              └─ Creates PR: <repo-name>/<branch>
                   │
                   └─ Review & merge in source repo
```

**Protected branches**: main, master, develop, staging, production

## Environment

| Variable | Purpose |
|----------|---------|
| `ALLHANDS_PATH` | Path to source repo (for update/sync-back) |
| `PROTECTED_BRANCHES` | Override default protected branch list |
