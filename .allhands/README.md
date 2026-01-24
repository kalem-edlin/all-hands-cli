# All Hands CLI

Internal CLI for the All Hands agentic harness.

## Installation

```bash
cd .allhands/harness
npm install
```

The `ah` command is automatically installed to `~/.local/bin/ah` when you run `npx all-hands init`. This shim finds and executes the project-local `.allhands/harness/ah` from any subdirectory.

For local development, copy the shim to your PATH:
```bash
cp .allhands/harness/ah ~/.local/bin/ah
```

## Usage

```bash
ah <command>
```

The `ah` command works from any directory within an all-hands project.

## Commands Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `ah context7` | Library documentation search and context retrieval |
| `ah docs` | Documentation management and validation |
| `ah git` | Git utilities with automatic base branch detection |
| `ah grok` | X/Twitter search for technology research |
| `ah hooks` | Hook commands (internal use) |
| `ah knowledge` | Semantic search and indexing for docs and specs |
| `ah specs` | Spec management |
| `ah notify` | Desktop notifications |
| `ah oracle` | Multi-provider LLM inference |
| `ah perplexity` | Deep research with citations |
| `ah schema` | Output schema for a file type |
| `ah spawn` | Spawn sub-agents for specialized tasks |
| `ah tavily` | Web search and content extraction |
| `ah tools` | MCP tool integrations with session management |
| `ah tui` | Launch the terminal user interface |
| `ah validate` | Validate a file against its schema |

### context7 - Library Documentation

```bash
ah context7 search <library> [query]     # Search for libraries by name
ah context7 context <libraryId> <query>  # Get documentation context
```

Options: `--limit <n>`, `--json`, `--text`

### docs - Documentation Management

```bash
ah docs format-reference <file> [symbol]  # Format a symbol/file reference with git hash
ah docs validate                          # Validate all documentation references
ah docs complexity <path>                 # Get complexity metrics
ah docs tree <path>                       # Get tree structure with doc coverage
```

Options: `--path`, `--depth`, `--json`

### git - Git Utilities

```bash
ah git base             # Show detected base branch (main, master, etc.)
ah git diff-base        # Show diff from base branch to HEAD
ah git diff-base-files  # List file names changed from base to HEAD
```

Options: `--json`

### grok - X/Twitter Search

```bash
ah grok search <query>     # Search X for tech opinions and insights
ah grok challenge <query>  # Challenge research findings with X search
```

Options: `--json`

### knowledge - Semantic Search

```bash
ah knowledge docs      # Project documentation operations
ah knowledge specs     # Product specifications operations
ah knowledge reindex   # Rebuild all indexes
ah knowledge status    # Check status of all indexes
```

### specs - Spec Management

```bash
ah specs list                    # List all specs grouped by domain
ah specs list --domains-only     # List only domain names
ah specs list --domain <name>    # List specs for a specific domain
ah specs complete <name>         # Mark spec completed
ah specs resurrect <name>        # Mark spec incomplete
```

Options: `--json`, `--domains-only`, `--domain <name>`

### skills - Domain Expertise Discovery

```bash
ah skills list                   # List all skills with descriptions and globs
```

Skills provide domain expertise that agents use during prompt curation. Each skill is a folder in `.allhands/skills/` containing a `SKILL.md` file with:
- `name`: Skill identifier (must match folder name)
- `description`: When/why to use this skill
- `globs`: File patterns this skill applies to

Skills are "how to do it right" - patterns, best practices, and domain knowledge that gets embedded into prompt instructions.

### validation-tools - Validation Suite Discovery

```bash
ah validation-tools list         # List all validation suites with descriptions and globs
```

Validation tooling provides deterministic acceptance criteria. Each suite is a file in `.allhands/validation/` with:
- `name`: Suite identifier
- `description`: When/why to use this suite
- `globs`: File patterns this suite validates
- Validation commands and interpreting results

Validation suites are "how to prove it's right" - specific commands and success criteria that ensure quality gates are met.

### notify - Desktop Notifications

```bash
ah notify send <title> <message>  # Send a system notification
```

Options: `--json`

### oracle - LLM Inference

```bash
ah oracle ask <query>                              # Raw LLM inference
ah oracle compaction <logs> <prompt>               # Post-agent analysis
ah oracle pr-build                                 # Create PR with generated description
```

Options: `--provider`, `--model`, `--file`, `--json`

### perplexity - Deep Research

```bash
ah perplexity research <query>  # Deep research with citations
```

Options: `--json`

### spawn - Sub-agents

```bash
ah spawn codesearch <query>  # AI code search with structural/text/semantic tools
```

Options: `--json`

### tavily - Web Search

```bash
ah tavily search <query>      # Web search with optional LLM answer
ah tavily extract <urls...>   # Extract full content from URLs (max 20)
```

Options: `--answer`, `--depth`, `--json`

### tools - MCP Integrations

```bash
ah tools [target]       # Run MCP tool
ah tools --list         # List all available MCP servers
ah tools --sessions     # List all active sessions
ah tools --restart      # Restart server session
ah tools --shutdown-daemon  # Shutdown the daemon
```

Options: `--json`, `--help-tool`

## Hooks Reference

Hooks are internal commands used by Claude Code's hook system. They're configured in `.allhands/harness/src/platforms/claude/settings.json`.

### Context Hooks (PreToolUse)

| Hook | Trigger | Description |
|------|---------|-------------|
| `ah hooks context tldr-inject` | PreToolUse:Task | Inject TLDR context for Task |
| `ah hooks context edit-inject` | PreToolUse:Edit | Inject file structure before edits |
| `ah hooks context arch-inject` | PreToolUse:Task | Inject architecture layers for planning |
| `ah hooks context signature` | PreToolUse:Edit | Inject function signatures for Edit |
| `ah hooks context read-enforcer` | PreToolUse:Read | Enforce TLDR for large code files |
| `ah hooks context search-router` | PreToolUse:Grep | Route searches to optimal tool |

### Context Hooks (PostToolUse)

| Hook | Trigger | Description |
|------|---------|-------------|
| `ah hooks context diagnostics` | PostToolUse:Edit\|Write | Run TLDR diagnostics after edits |
| `ah hooks context import-validate` | PostToolUse:Edit\|Write | Validate imports after edits |
| `ah hooks context edit-notify` | PostToolUse:Edit\|Write | Notify TLDR daemon of file changes |

### Enforcement Hooks (PreToolUse)

| Hook | Trigger | Description |
|------|---------|-------------|
| `ah hooks enforcement github-url` | PreToolUse:Bash | Block GitHub URLs in fetch commands |
| `ah hooks enforcement research-fetch` | PreToolUse:WebFetch | Block WebFetch, suggest research tools |
| `ah hooks enforcement research-search` | PreToolUse:WebSearch | Block WebSearch, suggest delegation |

### Lifecycle Hooks

| Hook | Trigger | Description |
|------|---------|-------------|
| `ah hooks lifecycle agent-stop` | Stop:* | Handle agent stop event |
| `ah hooks lifecycle agent-compact` | PreCompact:* | Handle pre-compaction event |

### Notification Hooks

| Hook | Trigger | Description |
|------|---------|-------------|
| `ah hooks notification elicitation` | PreToolUse:AskUserQuestion | Desktop alert for questions |
| `ah hooks notification stop` | Stop:* | Desktop alert when agent stops |
| `ah hooks notification compact` | PreCompact:* | Desktop alert before compaction |

### Session Hooks

| Hook | Trigger | Description |
|------|---------|-------------|
| `ah hooks session tldr-warm` | SessionStart | Warm TLDR cache on session start |

### Validation Hooks (PostToolUse)

| Hook | Trigger | Description |
|------|---------|-------------|
| `ah hooks validation diagnostics` | PostToolUse:Edit\|Write | Run diagnostics on edited files |
| `ah hooks validation schema` | PostToolUse:Edit\|Write | Validate schema-managed markdown |

## Optional Dependencies

### Universal Ctags (for `ah docs` command)

```bash
# macOS
brew install universal-ctags

# Ubuntu/Debian
sudo apt install universal-ctags
```

### AST-grep (for advanced code search)

```bash
# macOS
brew install ast-grep

# cargo
cargo install ast-grep --locked
```

### MCP Tools (for `ah tools` command)

```bash
# macOS
brew tap f/mcptools && brew install mcp

# Go
go install github.com/f/mcptools/cmd/mcptools@latest
```

### Desktop Notifications (macOS)

```bash
brew install --cask notifier
```

## Documentation Reference Format

Documentation uses validated references to link to source code:

```
[ref:file:symbol:hash]   - Symbol reference (validated via ctags)
[ref:file::hash]         - File-only reference (no symbol validation)
```

Where `hash` is the git commit hash (7 chars) of the file when the reference was created.

### Validation States

| State | Condition | Action |
|-------|-----------|--------|
| VALID | File exists, symbol exists, hash matches | None |
| STALE | File exists, symbol exists, hash differs | Review and update |
| INVALID | File missing OR symbol missing | Fix documentation |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CONTEXT7_API_KEY` | API key for Context7 library docs |
| `TAVILY_API_KEY` | API key for Tavily web search |
| `PERPLEXITY_API_KEY` | API key for Perplexity research |
| `XAI_API_KEY` | API key for Grok/X search |
| `OPENAI_API_KEY` | API key for OpenAI (oracle) |
| `ANTHROPIC_API_KEY` | API key for Anthropic (oracle) |
| `GEMINI_API_KEY` | API key for Gemini (oracle) |
| `BASE_BRANCH` | Override auto-detected base branch |
| `AGENT_ID` | Agent identifier for session management |

## Schema Architecture

Two types of schemas serve different purposes:

### Agent-Facing Schemas (`schemas/*.yaml`)

YAML schemas exposed to agents via `ah schema <type>`. Define frontmatter structure for markdown files:

| Schema | Purpose |
|--------|---------|
| `prompt.yaml` | Prompt file frontmatter |
| `alignment.yaml` | Alignment doc frontmatter |
| `spec.yaml` | Milestone spec frontmatter |
| `documentation.yaml` | Documentation file frontmatter |
| `validation-suite.yaml` | Validation tooling frontmatter |
| `skill.yaml` | Skill manifest frontmatter |

Agents reference these when creating or modifying files to ensure correct structure.

### Internal Schemas (`harness/src/lib/schemas/*.ts`)

Zod schemas for harness configuration. NOT exposed to agents:

| Schema | Purpose |
|--------|---------|
| `template-vars.ts` | Registry of valid template variables for agent message templates |
| `agent-profile.ts` | Schema for agent profile YAML files in `agents/` |

Why Zod instead of YAML for internal schemas:
- **Type safety** - Compile-time checks, IDE autocomplete
- **Runtime validation** - Catches misconfigurations at spawn time
- **Pattern validation** - e.g., `PROMPT_NUMBER` must match `\d{2}`

## Agent Profiles

Agent profiles in `agents/*.yaml` define how agents are spawned. Key fields:

```yaml
name: my-agent              # Agent identifier
flow: MY_FLOW.md            # Flow file in flows/
tui_action: my-action       # TUI button that spawns this agent
tui_label: My Agent         # Display label in TUI
tui_requires_milestone: true
template_vars:              # Required context variables
  - MILESTONE_NAME
  - ALIGNMENT_PATH
message_template: |         # Preamble injected before flow
  Working on: ${MILESTONE_NAME}
```

### Valid Template Variables

| Variable | Description |
|----------|-------------|
| `SPEC_PATH` | Path to milestone spec file |
| `ALIGNMENT_PATH` | Path to alignment doc |
| `PROMPTS_FOLDER` | Path to prompts directory |
| `PROMPT_PATH` | Path to specific prompt file |
| `OUTPUT_PATH` | Output file path |
| `PLANNING_FOLDER` | Path to `.planning/{branch}` directory |
| `MILESTONE_NAME` | Current milestone name |
| `PROMPT_NUMBER` | Prompt number as two digits (01, 02) |
| `BRANCH` | Current git branch name |

### Validation

```bash
ah validate agents  # Validate all agent profiles
```

Catches: missing flow files, invalid template variables, unused/undeclared vars
