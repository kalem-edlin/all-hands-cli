---
description: Implementation details for hooks and commands including validation logic, JSON protocols, and workflow patterns.
---

# Implementation Details

## Hook Implementation Patterns

### JSON Communication Protocol

All hooks read from stdin and write to stdout. The input structure varies by hook event:

**PreToolUse input:**
```json
{
  "tool_name": "WebFetch",
  "tool_input": { "url": "https://..." }
}
```

**SessionStart input:**
Standard environment - no stdin typically used.

### Validation Hook Pattern

All validation scripts share a common structure:

```python
# 1. Parse frontmatter from markdown files
def parse_frontmatter(content: str) -> Optional[dict]:
    if not content.startswith("---"):
        return None
    match = re.search(r"^---\n(.*?)\n---", content, re.DOTALL)
    # Parse YAML-like key: value pairs

# 2. Iterate directories and validate
errors = []
for f in DIR.glob("*.md"):
    fm = parse_frontmatter(f.read_text())
    if not fm:
        errors.append(f"missing frontmatter")
    if "description" not in fm:
        errors.append(f"missing description")

# 3. Output JSON for agent
if errors:
    print(json.dumps({"systemMessage": "\n".join(errors)}))
```

### Interception Hook Pattern

PreToolUse hooks block/redirect tool usage:

```python
# 1. Read tool context
data = json.load(sys.stdin)
tool_name = data.get("tool_name", "")
tool_input = data.get("tool_input", {})

# 2. Check conditions
if matches_blocked_pattern(tool_input):
    # 3a. Block with guidance
    print(json.dumps({
        "continue": False,
        "additionalContext": "Blocked. Use alternative: ..."
    }))
else:
    # 3b. Allow through
    sys.exit(0)
```

**Permission decision variant (for deny):**
```python
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "Use gh CLI instead"
    }
}))
```

## Key Validation Rules

### Agent Validation

| Check | Requirement |
|-------|-------------|
| Frontmatter | Must start with `---` |
| Description | Required in frontmatter |
| Name match | `name` field must match filename |
| Skills | Referenced skills must exist in `.claude/skills/` |

### Skill Validation

| Check | Requirement |
|-------|-------------|
| Directory | Must contain `SKILL.md` |
| Name field | Must match directory name |
| Description | Required in frontmatter |

### Command Validation

| Check | Requirement |
|-------|-------------|
| Frontmatter | Must start with `---` |
| Description | Required in frontmatter |

## Command Workflow Patterns

### Mode Selection

Most workflow commands support multiple modes via arguments:

```
--quick   : Skip questions, minimal inference
--create  : New workflow (default if no existing state)
--refine  : Amend existing workflow
```

### Progressive Disclosure

Commands gather input progressively:
1. Ask type/category question
2. Ask constraints question
3. Domain-specific questions (3 at a time)
4. Offer "continue with current context" option

### Delegation Pattern

Commands delegate to specialist agents using INPUTS/OUTPUTS format:

```markdown
Delegate to **specialist agent**:
* "Run protocol. INPUTS: `{ key: value }`"
* OUTPUTS: `{ success: true }`
```

### Knowledge Banks

Commands embed domain expertise as knowledge banks:

```markdown
<knowledge_bank name="debugging_input_gate">
**Bug characterization:**
- Exact observed behavior
- Expected behavior
- Reproduction steps
...
</knowledge_bank>
```

## Startup Sequence

The startup hook (`startup.sh`) executes in order:

1. Initialize envoy CLI (creates venv if needed)
2. Run artifact validation (show errors to agent)
3. Release stale in_progress prompts
4. Cleanup orphaned git worktrees
5. Sync claude-code-docs repository
6. Report plan status based on branch type

### Branch Type Detection

| Branch Pattern | Mode |
|----------------|------|
| main, master, develop, etc. | Direct (no planning) |
| quick/*, curator/*, docs/* | Direct (no planning) |
| Other feature branches | Planning mode |
