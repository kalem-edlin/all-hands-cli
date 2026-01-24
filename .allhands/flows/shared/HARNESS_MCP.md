<goal>
Add a new MCP server integration to the harness. This flow researches the MCP package, builds the config file, validates it works, and reports any authentication/environment requirements to the user.
</goal>

<inputs>
- MCP package name or npmjs/GitHub URL
- Purpose: what capability this MCP enables (e.g., "Supabase database validation")
</inputs>

<motivations>
- MCP servers extend the harness with external tool capabilities
- Once integrated, tools become available via `ah tools <server>:<tool>`
- Proper config setup ensures reliable, repeatable tool invocation
- This flow runs as a sub-agent so it doesn't block the main thread
</motivations>

## Phase 1: Research

Investigate the MCP package to understand its requirements:

1. **Find the package**:
   - `ah tavily search "<mcp_name> MCP server npm"` for package details
   - `ah grok search "<mcp_name> MCP configuration"` for setup patterns

2. **Read documentation**:
   - `ah context7 search "<mcp_name>"` for official docs
   - `ah tavily extract "<doc_url>"` for specific pages

3. **Identify requirements**:
   - Transport type (stdio, http, sse)
   - Command/args for stdio
   - URL for http/sse
   - Environment variables needed
   - Authentication method (API key, OAuth, etc.)

## Phase 2: Build Config

1. **Copy template**:
```bash
cp .allhands/harness/src/mcp/_template.ts .allhands/harness/src/mcp/<server-name>.ts
```

2. **Edit the config file** with researched values:
   - `name`: Short identifier (used in `ah tools <name>:tool`)
   - `description`: What the server does
   - `type`: Transport type ('stdio', 'http', 'sse')
   - `command`/`args`: For stdio transport
   - `url`: For http/sse transport
   - `env`: Environment variables (use `${VAR_NAME}` syntax)
   - `stateful`: Set to `true` if server maintains session state
   - `toolHints`: Add helpful hints for key tools

3. **Document source**: Add comment with source URL (npm/GitHub)

## Phase 3: Environment Setup

If the MCP requires authentication or API keys:

1. **Check if env var exists**:
```bash
grep "VAR_NAME" .env.ai 2>/dev/null || echo "Not found"
```

2. **Document required variables** - do NOT add values yourself:
   - Variable name
   - Where to obtain (signup URL, dashboard location)
   - Expected format (API key, bearer token, etc.)

## Phase 4: Validation

1. **Build the harness** to compile the new config:
```bash
cd .allhands/harness && npm run build
```

2. **List servers** to confirm discovery:
```bash
ah tools --list
```
Verify the new server appears in the list.

3. **List tools** on the server:
```bash
ah tools <server-name>
```
Verify tools are discovered.

4. **Test a tool call** (choose a read-only/safe tool):
```bash
ah tools <server-name>:<tool> --<param>=<value>
```

If the call fails due to missing auth, that's expected - document and proceed.

## Completion

Report back with:

1. **Config file created**: `.allhands/harness/src/mcp/<server-name>.ts`

2. **Available tools**: List of tools with brief descriptions

3. **Environment requirements** (if any):
   ```
   Required in .env.ai:
   - VAR_NAME: <description> (obtain from <url>)
   ```

4. **Validation status**:
   - "Ready to use" if test call succeeded
   - "Pending auth setup" if missing credentials

The main thread can now proceed with validation tooling creation knowing the MCP is (or will be) available.
