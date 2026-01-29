<goal>
Orchestrate documentation creation and maintenance. Per **Knowledge Compounding**, docs expose engineering knowledge via file references and LSP symbols for semantic discovery. Per **Context is Precious**, delegate discovery and writing to sub-agents.

Engineering knowledge comes from prompts, commit messages, and alignment docs when available (Incremental mode), otherwise inferred from the code itself (Fill-the-Gaps mode).

**Execute immediately** - detect mode and proceed. Do not ask for clarification unless domain confirmation is needed.
</goal>

<constraints>
- MUST verify clean working tree before proceeding (see Pre-flight Check)
- MUST confirm domains with user before spawning discovery agents
- MUST run `ah docs validate --json` at start of both modes to identify gaps
- MUST run `ah knowledge docs reindex` on completion
- NEVER spawn more than 10 writer agents per run
- NEVER write command/installation guides - those belong in README.md files
- NEVER write code snippets or examples - use `[ref:file:Symbol]` file references instead
- NEVER write to `docs/solutions/` or `docs/memories.md` - those are owned by the Compounding flow
</constraints>

## Pre-flight Check

Before any documentation work, verify the git working tree is clean:

```bash
git status --porcelain
```

If output is non-empty, **abort with error**:
> "Uncommitted changes detected. Documentation requires a clean working tree because file references use git commit hashes. Please commit or stash your changes before running documentation."

**Why this matters:**
- File references use `[ref:file:symbol:hash]` format where hash comes from git
- Uncommitted files have no git hash → finalize fails
- Modified files get stale hashes → refs become invalid immediately after commit

## Mode Detection

Check the message for template variables passed by the documentor agent:

```
├─ ALIGNMENT_PATH + PROMPTS_FOLDER provided? → Incremental Mode (feature branch)
└─ Variables empty or not provided? → Fill-the-Gaps Mode (cold start or refresh)
```

The documentor agent passes `SPEC_PATH`, `ALIGNMENT_PATH`, and `PROMPTS_FOLDER` when invoked from a spec context. Empty values mean no spec is selected.

**Default behavior**: If no message/prompt is provided and no context variables are set, proceed directly with Fill-the-Gaps mode. Do not ask the user what to do - just start documenting.

---

## Fill-the-Gaps Mode

Full documentation effort for new repos or out-of-sync docs.

### Initialization

1. **Initial Validation** - Run `ah docs validate --json` to identify:
   - Invalid refs (gaps in documentation)
   - Stale refs (out-of-sync with code)
   - Missing frontmatter

2. **Domain Detection**
   - Read `docs.json` at project root for declared domains (optional - projects don't need this file)
   - If not declared, infer:
     - Run `tldr structure .` or `ah complexity .` on project root
     - Check for monorepo markers: `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`
     - If monorepo: each workspace package is a domain, plus root-level coordination docs
     - Otherwise: identify main product areas from directory structure
   - Present detected domains to user for confirmation
   - Persist confirmed domains to `docs.json` at project root (using the schema from `ah schema docs-config`). Always write this file, whether user adjusted or accepted defaults — it codifies the domain map for future incremental runs.

3. **Proceed to Core Flow** with:
   ```yaml
   mode: "fill-gaps"
   domains: [<confirmed domains>]
   validation_issues: <from initial validation>
   existing_docs: []
   session_knowledge: null
   ```

---

## Incremental Mode

Feature branch documentation with session knowledge.

### Initialization

1. **Context Gathering**
   - Read alignment doc at `ALIGNMENT_PATH` for milestone context and key decisions
   - Read prompt files in `PROMPTS_FOLDER` for task details and learnings
   - Run `git diff $(git merge-base HEAD main)..HEAD --name-only` for changed files

2. **Initial Validation** - Run `ah docs validate --json` to identify current staleness

3. **Impact Analysis**
   - Run `ah knowledge docs search` with changed file paths to find related docs
   - Categorize changes:
     - **Edit**: existing docs reference changed code
     - **Create**: new functionality without doc coverage
     - **Stale**: validation found outdated refs

4. **Proceed to Core Flow** with:
   ```yaml
   mode: "incremental"
   domains: [<affected domains only>]
   validation_issues: <from initial validation>
   existing_docs: [<docs needing edits>]
   session_knowledge:
     commit_messages: "<relevant commits>"
     alignment_summary: "<key decisions>"
     prompt_learnings: "<deviations and discoveries>"
   ```

---

## Core Flow

Shared pipeline for both modes after initialization.

### 1. Discovery Phase

Per **Context is Precious**, spawn discovery sub-agents:

- One sub-agent per domain
- Instruct each to read `.allhands/flows/shared/DOCUMENTATION_DISCOVERY.md`
- Provide each:
  ```yaml
  domain: "<domain-name>"
  source_paths: ["<path/to/domain>"]  # or changed files in incremental
  mode: "<fill-gaps|incremental>"
  session_context: "<summary from alignment doc>"  # incremental only
  ```
- Await all discovery results

### 2. Aggregate and Plan

- Merge approach lists from all discovery agents
- Filter out approaches with `existing_coverage: "full"`
- Group approaches into writer assignments:
  - Each writer handles **5-15 approaches** (one domain or related subset)
  - Group by domain and subdirectory
- Use `ah knowledge docs search` to verify no redundant coverage
- Target 5-10 writers total; if discovery returned too many approaches, push back

### 3. Writing Phase

- Spawn writer sub-agents per assignment (each handles **multiple approaches**)
- Instruct each to read `.allhands/flows/shared/DOCUMENTATION_WRITER.md`
- Provide each:
  ```yaml
  domain: "<domain-name>"
  approaches:  # Multiple approaches per writer
    - { name: "<approach>", group: "<subdir or null>", files: [...], symbols: [...] }
  doc_directory: "docs/<domain>/"
  existing_docs: [<paths to edit>]  # from initialization
  session_knowledge: <from initialization>  # null in fill-gaps
  ```
- Use `group` field to determine file paths:
  - `group: "cli"` → `docs/<domain>/cli/<approach>.md`
  - `group: null` → `docs/<domain>/<approach>.md`

### 4. Post-Processing

#### README Generation

Per **Knowledge Compounding**, write README.md files that expose cross-domain relationships for semantic discovery. The orchestrator writes these directly — writers lack cross-domain context.

- Write `docs/README.md` — top-level overview:
  - List all domains with one-line descriptions
  - Explain cross-domain relationships (e.g., type pipeline from backend → frontend)
  - Link to domain READMEs via backtick paths (e.g., `docs/<domain>/README.md`)
- Write `docs/<domain>/README.md` for each domain:
  - Overview of the domain's purpose and scope
  - List approaches grouped by subdirectory
  - Cross-references to related domains
  - Link to approach docs via backtick paths (e.g., `docs/<domain>/<approach>.md`)
- Write `docs/<domain>/<group>/README.md` for each subdirectory with 3+ docs:
  - Brief overview of the group's scope
  - List contained approach docs

README.md files MUST use plain backtick relative paths (e.g., `docs/harness/README.md`) instead of `[ref:...]` references when linking to other docs. Per **Knowledge Compounding**, the knowledge index would recursively include referenced docs inside READMEs, inflating search results with duplicate content.

All README.md files MUST have frontmatter with `description` (per `ah schema documentation`) for semantic indexing.

#### Finalize and Validate

- Run `ah docs finalize` (finalizes all docs in docs/)
- Run `ah docs validate --json`
- If issues exist:
  - Spawn writer sub-agents to fix (provide stale/invalid refs)
  - Re-run finalize and validate until clean
- Run `ah knowledge docs reindex`

---

## Completion

- Verify `ah docs validate` returns clean
- Run `ah knowledge docs reindex`
- Report summary: docs created, edited, domains covered
