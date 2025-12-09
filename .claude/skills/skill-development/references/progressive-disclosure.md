# Progressive Disclosure in Skills

Design principle for managing context efficiently through three-level loading.

## Core Concept

Progressive disclosure means information loads only when needed:

1. **Metadata** - Always in context (description triggers skill)
2. **Body** - Loads when skill triggers (core instructions)
3. **Resources** - Loads as Claude needs them (detailed content)

## Directory Structure Pattern

```
skill-name/
├── SKILL.md              # Always loaded when skill triggers
├── references/           # Loaded as Claude consults them
│   ├── patterns.md
│   ├── advanced.md
│   └── api-reference.md
├── examples/             # Loaded when Claude needs examples
│   ├── basic-example.sh
│   └── advanced-example.py
└── scripts/              # Executed without loading into context
    ├── validate.sh
    └── helper.py
```

## When to Use Each Level

### SKILL.md (Body)

**Include**:
- Core concepts and overview
- Essential workflows and procedures
- Quick reference tables
- Pointers to references/examples/scripts
- Most common use cases

**Size target**: 1,500-2,000 words (max 3,000)

**Rule**: If in doubt, move it to references/

### references/

**Move here**:
- Detailed patterns and advanced techniques
- Comprehensive API documentation
- Migration guides and edge cases
- Extensive troubleshooting

**Size**: Each file can be 2,000-5,000+ words

**Naming conventions**:
- `patterns.md` - Common patterns
- `advanced.md` - Advanced use cases
- `api-reference.md` - API documentation
- `troubleshooting.md` - Problems and solutions

### examples/

**Include**:
- Complete, runnable code
- Configuration files that work
- Template files users can copy

**Characteristics**:
- Self-contained and functional
- Well-commented
- Cover different use cases (basic, intermediate, advanced)

### scripts/

**Include**:
- Validation utilities
- Testing helpers
- Automation scripts

**Key benefit**: Scripts execute without loading into context window.

## Example Directory Layouts

### API Integration Skill

```
api-integration/
├── SKILL.md                    # Quick start, core endpoints
├── references/
│   ├── authentication.md       # Auth patterns, token handling
│   └── rate-limiting.md        # Rate limit handling
├── examples/
│   ├── basic-request.py
│   └── batch-operations.py
└── scripts/
    └── validate-credentials.sh
```

### Database Migration Skill

```
db-migration/
├── SKILL.md                    # Migration workflow, safety checks
├── references/
│   ├── rollback-procedures.md
│   └── schema-patterns.md
├── examples/
│   ├── simple-migration.sql
│   └── data-migration.py
└── scripts/
    └── validate-migration.sh
```

## Anti-Patterns

### Everything in SKILL.md

**Problem**: 8,000 word SKILL.md file

**Solution**: Extract detailed sections to references/, keep SKILL.md under 2,000 words

### Unreferenced Resources

**Problem**: Files in references/ but no mention in SKILL.md

**Solution**: Always reference supporting files in SKILL.md body

### Scripts That Need Reading

**Problem**: Script requires Claude to read and understand before execution

**Solution**: If Claude must read it, it's documentation (put in references/)

## Context Budget Guidelines

| Component | Target | Max |
|-----------|--------|-----|
| Description | ~100 chars | 1024 chars |
| SKILL.md body | 1,500-2,000 words | 3,000 words |
| Single reference file | 2,000-3,000 words | 5,000+ words |
| Total references/ | N/A | No limit (loaded as needed) |
