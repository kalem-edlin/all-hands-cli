---
description: "Pull-manifest command that scaffolds the sync config file for customizing which files are included or excluded during push operations"
---

# Pull-Manifest Command

[ref:src/commands/pull-manifest.ts:cmdPullManifest:92ad739] is the simplest command in the CLI -- it writes a template configuration file that lets repositories customize their push behavior.

## Intent

The push command needs to know which additional files to include and which to exclude when creating upstream PRs. Rather than requiring users to always pass `--include` and `--exclude` flags, the sync config file persists these preferences in version control.

## Guard Rails

The command enforces two preconditions:
- Must be in a git repository (checked via [ref:src/lib/git.ts:isGitRepo:70a743c])
- Config file must not already exist (prevents accidental overwrite of user customizations)

If the file exists, the user is told to remove it first and re-run. This is intentional -- there's no merge logic for config files, so regeneration should be a conscious choice.

## Config File Shape

The template is defined as [ref:src/lib/constants.ts:SYNC_CONFIG_TEMPLATE:61d6025] and written to the path defined by [ref:src/lib/constants.ts:SYNC_CONFIG_FILENAME:61d6025] (`.allhands-sync-config.json`):

```
{
  "$comment": "Customization for claude-all-hands push command",
  "includes": [],
  "excludes": []
}
```

- **includes** -- Glob patterns for additional files to push beyond the standard distributable set
- **excludes** -- Glob patterns for files to skip, even if they differ from upstream

The config file itself is in [ref:src/lib/constants.ts:PUSH_BLOCKLIST:61d6025], so it is never pushed back upstream -- it's purely a local customization mechanism.
