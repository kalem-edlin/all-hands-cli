<goal>
Add a new MCP server integration to the harness. Per **Agentic Validation Tooling**, MCP servers extend the harness with external tool capabilities that enable programmatic validation.
</goal>

<inputs>
- MCP package name or npmjs/GitHub URL
- Purpose: what capability this MCP enables (e.g., "Supabase database validation")
</inputs>

<outputs>
- Config file at `.allhands/harness/src/mcp/<server-name>.ts`
- Environment requirements documentation
- Validation status report
</outputs>

<constraints>
- MUST research package before building config
- MUST NOT add environment variable values - only document requirements
- MUST validate server discovery after config creation
- MUST run as sub-agent to avoid blocking main thread
</constraints>

## Phase 1: Research

Investigate the MCP package requirements:

**Find the package**:
- Run `ah tavily search "<mcp_name> MCP server npm"` for package details

**Read documentation**:
- Run `ah context7 search "<mcp_name>"` for official docs
- Run `ah tavily extract "<doc_url>"` for specific pages

**Identify requirements**:
- Transport type (stdio, http, sse)
- Command/args for stdio
- URL for http/sse
- Environment variables needed
- Authentication method (API key, OAuth, etc.)

## Phase 2: Build Config

- Copy template: `cp .allhands/harness/src/mcp/_template.ts .allhands/harness/src/mcp/<server-name>.ts`

Edit the config file with researched values:
- `name`: Short identifier (used in `ah tools <name>:tool`)
- `description`: What the server does
- `type`: Transport type ('stdio', 'http', 'sse')
- `command`/`args`: For stdio transport
- `url`: For http/sse transport
- `env`: Environment variables (use `${VAR_NAME}` syntax)
- `stateful`: Set to `true` if server maintains session state
- `toolHints`: Add helpful hints for key tools

Add comment with source URL (npm/GitHub).

## Phase 3: Environment Setup

If MCP requires authentication or API keys:

- Check if env var exists: `grep "VAR_NAME" .env.ai 2>/dev/null || echo "Not found"`
- Document required variables (do NOT add values):
  - Variable name
  - Where to obtain (signup URL, dashboard location)
  - Expected format (API key, bearer token, etc.)

## Phase 4: Validation

- Build harness: `cd .allhands/harness && npm run build`
- List servers: `ah tools --list` (verify new server appears)
- List tools: `ah tools <server-name>` (verify tools discovered)
- Test a tool call (choose read-only/safe tool): `ah tools <server-name>:<tool> --<param>=<value>`

If call fails due to missing auth, document and proceed.

## Completion

Report back with:
- Config file created: `.allhands/harness/src/mcp/<server-name>.ts`
- Available tools: List with brief descriptions
- Environment requirements (if any)
- Validation status: "Ready to use" or "Pending auth setup"

Main thread can proceed knowing MCP is (or will be) available.
