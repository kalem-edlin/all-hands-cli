# Solutions

Documented solutions to problems encountered during development. Per **Knowledge Compounding**, these learnings prevent repeating mistakes and surface relevant patterns during planning.

## Structure

Solutions are organized by `problem_type`:

```
docs/solutions/
├── agentic-issues/       # Hallucinations, duplications, miscommunications
├── best-practices/       # Patterns and conventions worth following
├── build-errors/         # Compilation and build failures
├── database-issues/      # Schema, migration, query problems
├── documentation-gaps/   # Missing or inadequate docs
├── integration-issues/   # External service and API problems
├── logic-errors/         # Incorrect business logic
├── performance-issues/   # Slow queries, memory leaks, etc.
├── runtime-errors/       # Crashes and exceptions
├── security-issues/      # Vulnerabilities and security fixes
├── test-failures/        # Flaky tests, test isolation
├── ui-bugs/              # Frontend issues
└── workflow-issues/      # Process and tooling problems
```

## Usage

### Search Solutions

```bash
# Search by keywords (searches title, tags, component, symptoms)
ah solutions search "performance database"

# Include full content
ah solutions search "n-plus-one" --full

# List all categories
ah solutions list

# List solutions in a category
ah solutions list performance-issues
```

### Creating Solutions

Solutions are created automatically by the COMPOUNDING flow after milestone completion. See `.allhands/schemas/solution.yaml` for the frontmatter schema.

## Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Searchable problem/solution title |
| `date` | string | ISO date (YYYY-MM-DD) |
| `milestone` | string | Branch name where discovered |
| `problem_type` | enum | Category (determines directory) |
| `component` | string | Technical component affected |
| `symptoms` | array | Observable symptoms (1-5 items) |
| `root_cause` | enum | Root cause category |
| `severity` | enum | critical, high, medium, low |
| `tags` | array | Searchable keywords |
| `source` | enum | user-steering, agent-inferred, review-fix |
