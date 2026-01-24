<goal>
Create validation tooling documentation for a new or underserved domain. This flow guides a mini ideation session to research, evaluate, and document validation tools that enable deterministic acceptance criteria.
</goal>

<inputs>
- Domain/technology needing validation coverage (e.g., "Supabase migrations", "Expo native UI")
- Pain points or gaps identified in current validation capabilities
</inputs>

<motivations>
- Validation tooling enables agents to prove their work meets acceptance criteria without human intervention
- Well-documented tooling becomes reusable across prompts AND in CICD pipelines
- Once a suite exists, it's tunable and deterministic - agents know exactly how to validate
- Humans should only test PRODUCT QUALITY, not SOFTWARE STABILITY (that's what validation tooling solves)
</motivations>

## Phase 1: Discovery

Check existing coverage:
```bash
ah validation-tools list
```

Review the output to understand:
- What suites already exist
- Whether any partially cover the needed domain
- Gaps that require new tooling

## Phase 2: Research

Use `.allhands/flows/shared/RESEARCH_GUIDANCE.md` to investigate:

1. **Best practices** - How do humans typically validate this technology?
   - `ah perplexity research "best practices for testing <technology>"`

2. **Available tools** - What MCP servers, CLI tools, SDKs exist?
   - `ah tavily search "<technology> testing tools CLI"`
   - `ah grok search "what tools do developers use to test <technology>"`

3. **Community insights** - What's working well for others?
   - `ah perplexity research "<technology> validation automation" --grok-challenge`

If external documentation is needed, use `.allhands/flows/shared/EXTERNAL_TECH_GUIDANCE.md`:
- `ah context7 search "<tool_name>"` for official docs
- `ah tavily extract "<doc_url>"` for specific pages

### MCP Gap Assessment

Check if discovered tools are available as MCP integrations:
```bash
ah tools --list
```

If research identifies a valuable MCP that isn't currently integrated:

1. **Document the gap**: Note the MCP package name and purpose
2. **Spin up sub-agent** to add the MCP (runs in parallel, non-blocking):
   ```
   Invoke sub-agent with:
   - Flow: .allhands/flows/shared/HARNESS_MCP.md
   - Inputs: MCP package name, purpose for validation
   ```
3. **Continue to Phase 3** - Don't block on MCP setup; the sub-agent handles it
4. **In Phase 3**, inform user that MCP integration is in progress and may require credentials

## Phase 3: User Interview

Present findings to the user:

1. **Summarize discovered tools** with pros/cons
2. **Recommend a primary approach** with reasoning
3. **Identify CICD integration opportunities** - can this run in pipelines?
4. **Confirm scope** - what validation scenarios should this suite cover?
5. **MCP status** (if sub-agent was spawned):
   - Which MCP is being integrated
   - Any credentials/env vars that will be needed
   - Expected tools that will become available

Get user confirmation before proceeding to creation.

## Phase 4: Suite Creation

1. Get the schema structure:
```bash
ah schema validation-suite
```

2. Write the suite file to `.allhands/validation-tooling/<suite-name>.md`

Required frontmatter:
- `name`: Unique identifier (matches filename)
- `description`: Use case description (when/why to use)
- `globs`: File patterns this validates

Required body sections:
- **Purpose**: What quality aspects this validates
- **When to Use**: Task patterns needing this validation
- **Validation Commands**: CLI commands and invocations
- **Interpreting Results**: How to read output, what failures mean

Optional body section:
- **CICD Integration**: Pipeline config to add (if automated validation makes sense)

3. Validation hook runs automatically on file save - fix any schema errors.

## Phase 5: CICD Integration (If Applicable)

If the suite includes CICD integration:
1. Document the pipeline configuration in the suite file
2. Discuss with user whether to add it now or defer
3. If adding now, modify the appropriate workflow files (e.g., `.github/workflows/`)

## Completion

Once the suite file passes validation:
- The suite is now discoverable via `ah validation-tools list`
- Future prompts can reference it in `validation_suites` frontmatter
- The UTILIZE flow will find it when agents work on matching file patterns
