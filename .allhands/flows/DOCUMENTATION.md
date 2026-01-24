<goal>
Analyze codebase, design documentation structure, delegate writers, and finalize with READMEs. Per **Context is Precious**, view code as products with purpose, not paths to document.
</goal>

<constraints>
- MUST name docs by PURPOSE ("all-hands-cli") NOT path ("src-lib")
- MUST create directories BEFORE delegating to writers
- MUST determine mode (Init vs Adjust) before any documentation work
- NEVER document excluded paths (node_modules, dist, build, .next, .expo, .git, *.generated.ts, vendor)
- NEVER assign more than 15 writer agents per run
</constraints>

## Mode Decision

Determine documentation intensity before proceeding:

```
├─ Run `ls docs/` - no docs directory, empty, or lacking based on top level scan of codebase? → Init Mode (brownfield)
└─ Existing docs with coverage? → Adjust Mode (incremental)
```

If Init Mode - read **Init Mode** section below
If Adjust Mode - skip to **Adjust Mode** section below

---

## Init Mode

Full documentation effort for brownfield codebases.

### Detect Workspaces
- Run `ls pnpm-workspace.yaml lerna.json package.json 2>/dev/null`
- Parse workspace members as candidate main domains

### Analyze Each Domain
- Run `ah docs tree <domain_path> --depth 3`
- Run `ah docs complexity <domain_path>`
- Run `ah knowledge docs search "<domain>" --metadata-only`

### Classify Complexity

| Type | Lines | Areas | Agents | Target Files |
|------|-------|-------|--------|--------------|
| Simple | <2k | few | 1 | 3-10 |
| Medium | 2-10k | 2-4 | 1-2 | 10-30 |
| Complex | >10k | 5+ | 2-3 | 30-60 |

### Identify Subdomains
Candidate subdomain if:
- 5+ source files in directory
- High complexity score
- Distinct responsibility

### Group by Feature, Not Path
Before creating subdomain structure, identify cross-cutting features:

1. **Detect feature clusters**
   - Run `ah knowledge search "<feature-name>"` to find all related files
   - A feature often spans: `commands/` (CLI surface) + `lib/` (implementation) + `hooks/` (lifecycle)
   - These should become ONE subdomain, not three

2. **Subdomain = Feature boundary**
   - ❌ `docs/harness/commands/`, `docs/harness/lib/` (mirrors source paths)
   - ✅ `docs/harness/semantic-search/`, `docs/harness/notifications/` (mirrors features)

3. **Example clustering**
   ```
   Feature: "semantic-search"
   Sources: commands/knowledge.ts, lib/semantic-search/, lib/embeddings/
   → Subdomain: docs/harness/semantic-search/

   Feature: "notifications"
   Sources: commands/notify.ts, lib/system-notifications.ts, hooks/notifications/
   → Subdomain: docs/harness/notifications/
   ```

4. **Within each feature subdomain**, writers create focused docs per aspect:
   - `overview.md` - what problem this feature solves
   - `architecture.md` - how components interact
   - `patterns.md` - common usage patterns (if complex)

### Flag Critical Tech
Check `package.json`. Flag if imported in 10+ files, defines architecture, is platform-specific, or is non-obvious choice.

### Create Structure
- Run `mkdir -p docs/<domain>/<subdomain>`

### Delegate Writers
- Spawn subtask per assignment
- Instruct each to read `.allhands/flows/shared/DOCUMENTATION_WRITING.md`
- Track `uncovered_domains` if exceeding 15 agents

Provide each writer:
```yaml
domain: "<product-name>"
feature: "<feature-name>"  # the cross-cutting feature this covers
doc_directory: "docs/<domain>/<feature>/"
source_directories: ["<path/to/src>", "<related/lib>", "<hooks/if-any>"]  # all sources for this feature
critical_technologies: ["<tech>"]
target_file_count: 2-4
notes: "<what knowledge to capture about this feature>"
```

### Validate
After all writers complete:
- Run `ah docs validate --json` to check all references
- If validation returns `stale_refs` or `invalid_refs`:
  - Spawn fix tasks for affected docs
  - Instruct fixers to read `.allhands/flows/shared/DOCUMENTATION_WRITING.md` **Fix Mode** section
  - Provide each fixer: `{ mode: "fix", doc_path: "<path>", stale_refs: [...], invalid_refs: [...] }`
- Re-run validation until clean

### Finalize
After validation passes:
- Read all produced docs
- Write README.md per main domain with overview, mermaid diagram, navigation table, and entry points
- Run `ah knowledge docs reindex` to update the docs knowledge index

---

## Adjust Mode

Incremental documentation for changes only.

### Scope Changes
- Run `ah git diff-base-files` to identify affected files
- Run `ah docs tree <affected-path> --depth 4`
- Run `ah docs complexity <affected-path>`

### Check Existing Coverage
- Run `ah knowledge docs search "<changed-feature>" --metadata-only`

### Delegate
- Follow Init Mode delegation but only for affected areas

### Validate & Finalize
- Follow Init Mode **Validate** and **Finalize** steps

---

## Allowed vs Excluded

| Document | Never Document |
|----------|----------------|
| `.github/workflows/` | `node_modules/`, `dist/`, `build/` |
| Root config files | `.next/`, `.expo/`, `.git/` |
| DX artifacts | `*.generated.ts`, `*.d.ts`, `vendor/` |
