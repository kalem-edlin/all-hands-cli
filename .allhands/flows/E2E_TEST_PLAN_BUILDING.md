<goal>
Build an E2E test plan that convinces the engineer of milestone implementation efficacy. Per **Agentic Validation Tooling**, engineers are excluded from prompt-by-prompt validation - this plan provides comprehensive proof the milestone works as expected through deterministic tests, infrastructure setup, and manual verification flows.
</goal>

<inputs>
- Alignment doc path
- E2E test plan output path
</inputs>

<outputs>
- E2E test plan document at specified output path (with `last_commit` frontmatter for incremental updates)
</outputs>

<constraints>
- MUST derive infrastructure setup from implementation artifacts (commits, summaries, code, existing docs)
- MUST prioritize manual verification flows over reiterating already-run automated tests
- NEVER duplicate step-by-step test cases that deterministic suites already cover
</constraints>

## Update Mode (if test plan exists)

If the E2E test plan already exists:
- Read existing test plan and extract `last_commit` from frontmatter
- Run `git log --oneline <last_commit>..HEAD` to see commits since last update
- Run `git diff <last_commit>..HEAD --stat` to see affected files
- Compare alignment doc prompt summaries against test plan's covered prompts
- Focus context gathering on delta changes only
- Append new scenarios rather than rewriting existing coverage

## Context Gathering

- Read the alignment doc for goal, objectives, acceptance criteria, and prompt execution summaries
- Review changed files from base branch (avoid information overload on full diffs)
- Run `ah validation-tools list` to identify available validation suites
- Examine implementation artifacts for infrastructure setup information:
  - Commit messages describing setup/configuration changes
  - Prompt summaries mentioning services, dependencies, or environment setup
  - Existing documentation (recognize it may be outdated if implementation changed it)
  - Code comments, READMEs, and configuration files

## E2E Test Plan Structure

Per **Context is Precious**, structure the plan as progressive sections - each building on the previous.

### Section 1: Deterministic Test Summary

Per **Context is Precious**, present as a concise command list with inline comments:

```bash
# API endpoint tests (CRUD, validation, 404s)
cd backend && pytest -v

# Component tests (Vitest + SolidJS)
cd frontend && npm test

# Playwright E2E (task flows, filtering, search)
cd frontend && npm run test:e2e
```

- Comment above each command, separated by blank lines
- Group related commands if logical (e.g., backend, frontend, E2E)
- NO detailed breakdowns, file listings, or coverage percentages
- Engineer can run individual commands or chain them all

### Section 2: Infrastructure Setup

Per **Knowledge Compounding**, derive setup from implementation artifacts (commits, summaries, code, existing docs).

```bash
# Install dependencies
npm install && cd backend && pip install -r requirements.txt

# Set up environment (copy and configure)
cp .env.example .env

# Start database (if applicable)
docker-compose up -d postgres

# Start backend service
cd backend && python main.py

# Start frontend dev server
cd frontend && npm run dev
```

- Comment above each command, separated by blank lines
- Cover: dependencies, environment, database, services, dev servers
- Include cloud branch tooling if available (e.g., Supabase branches, preview deployments)

**Variant Awareness**: Per **Quality Engineering**, if implementation introduced disposable variants (A/B implementations, backend alternatives, experimental features):
- Document how to switch between variants (feature flags, env vars, infrastructure flags)
- Show setup commands for each variant that needs testing
- Example: `BACKEND=flask npm run dev` vs `BACKEND=fastapi npm run dev`

This section validates documentation quality - if setup cannot be derived from implementation artifacts, it signals inadequate documentation. The subsequent documentation phase will face the same challenge.

### Section 3: AI-Coordinated Validation (Conditional)

**Only include if validation tooling supports agentic testing.** Types of tooling that qualify:
- UI automation (Playwright MCP, simulator automation, browser MCPs)
- Load testing tools (k6, artillery, locust with agent coordination)
- Performance profiling (flamegraphs, memory profilers, bundle analyzers)
- Database inspection/scripting (query tools, migration validators, data generators)
- API testing tools (curl automation, Postman/Insomnia MCPs)

Provide example prompts engineers can give to agent sessions:
- "Use Playwright MCP to complete checkout with expired card, then retry with valid payment"
- "Run load test against /api/tasks with 100 concurrent users, report p95 latency"
- "Profile the task list render with 1000 items, identify components over 16ms"
- "Inspect database after bulk import, verify foreign key integrity and index usage"

Purpose: Engineers spin up agents to test flows based on concerns they describe - agent coordinates the tooling.

If no such tooling exists for this project, skip this section entirely and note which tooling categories would be valuable.

### Section 4: Manual E2E Flows

The core "convince the engineer" section with real product behavior:
- Define explicit user flows to walk through with spun-up infrastructure
- Cover happy paths, edge cases, and regression scenarios
- Include tooling for inspection (profiling, network inspection, logs)
- Reference specific UI paths, API endpoints, CLI commands to exercise
- Cover domains that automated testing cannot adequately verify

This section provides broad product coverage through direct engineer interaction - the final proof that implementation meets expectations.

## Completion

Write the E2E test plan to the output path with frontmatter:
```yaml
---
last_commit: <current HEAD SHA>
covered_prompts: [<prompt numbers included>]
updated: <ISO date>
---
```