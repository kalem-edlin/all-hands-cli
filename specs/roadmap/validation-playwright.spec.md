---
name: validation-playwright
domain_name: infrastructure
status: roadmap
dependencies: []
branch: feature/validation-playwright
---

# Browser Validation Tooling Suite

## Motivation

Front-end implementation tasks currently lack structured validation tooling. When agents implement UI/UX changes, there is no programmatic way to verify that browser-rendered outcomes match task goals, user expectations, or design intent. Per **Agentic Validation Tooling**, programmatic validation makes engineering supervision redundant for routine checks — but the tooling must exist first.

The existing Playwright MCP integration (`.allhands/harness/src/mcp/playwright.ts`) suffers from a well-documented token consumption problem: accessibility tree snapshots on every action eat through context limits rapidly ([microsoft/playwright-mcp#889](https://github.com/microsoft/playwright-mcp/issues/889)). Community consensus (HN, Reddit, practitioner reports) has converged on CLI-based approaches over MCP for agent-driven browser automation — they consume near-zero context compared to MCP tool schemas and snapshot payloads.

`vercel-labs/agent-browser` (11K+ stars, Apache-2.0, Vercel-backed, Rust+Node.js) is purpose-built for AI agents with filtered snapshots, cloud browser providers, session isolation, and a CLI-first design that aligns with the harness's command-driven architecture. No `playwright.config.ts` exists for deterministic test execution. No validation suite documentation exists to guide agents or CI pipelines.

This gap blocks any spec requiring browser-based validation of front-end changes: user flow verification, UX edge case testing, UI design validation, and automation testing for feature implementation.

## Goals

### Layer 1: agent-browser CLI for Agent-Driven Validation (Primary)

Agents use `agent-browser` CLI commands to perform human-like validation of front-end implementations. This replaces the Playwright MCP as the primary agent validation tool due to significantly lower context overhead.

- **Installation and harness integration**: Install `agent-browser` globally (`npm install -g agent-browser && agent-browser install`). Integrate as a harness command or skill so agents can invoke it naturally. Add `agent-browser --help` context to agent flows.
- **Agent validation flow**: A flow document (`.allhands/flows/shared/BROWSER_VALIDATION.md`) teaching agents how to validate front-end implementations using agent-browser — covering:
  - **End-user flow verification**: Navigate, snapshot, interact via refs, verify outcomes
  - **UX edge case testing**: Viewport emulation (`set viewport`, `set device "iPhone 14"`), offline simulation (`set offline on`), dark mode (`set media dark`), geolocation
  - **UI design validation**: Screenshots (`screenshot --full`), element-scoped screenshots, visual comparison
  - **Form/interaction testing**: Fill, select, check/uncheck, dialog handling, file upload
  - **Network inspection**: `network requests --filter api`, route mocking for API stubs
  - **Console/error monitoring**: `console`, `errors` for runtime issue detection
- **Snapshot filtering guidance**: Per **Context is Precious**, agents should use filtered snapshots to minimize context:
  - `snapshot -i` — interactive elements only (buttons, inputs, links)
  - `snapshot -c` — compact (remove empty structural elements)
  - `snapshot -d 3` — depth-limited
  - `snapshot -s "#main"` — scoped to specific region
- **Session isolation**: Use `--session` for parallel validation runs, `--profile` for authenticated state reuse across sessions
- **Cloud browser support**: Configure cloud providers (Browserbase, Browser Use, Kernel) for CI/CD and headless environments where local Chromium isn't feasible. Document environment variable setup for each provider.
- **Live observation**: Document WebSocket streaming (`AGENT_BROWSER_STREAM_PORT`) for engineer pair-browsing during agent validation sessions
- **Test script generation pattern**: Agents can generate permanent Playwright test scripts during exploratory validation that get committed as CI regression tests — the validation session produces reusable test artifacts

### Layer 2: Playwright Test Runner for Deterministic Regression

A standard `@playwright/test` setup for CI-gated, repeatable browser testing. This is what Playwright excels at — scripted, deterministic regression that runs identically every time.

- **Configuration**: `playwright.config.ts` with multi-device projects (Desktop Chrome, iPhone 15, iPad, Galaxy S21), parallel execution, appropriate timeouts, and artifact capture (traces, screenshots, video on failure)
- **Visual regression**: `toHaveScreenshot()` integration with threshold configuration (0.1-0.2 for anti-aliasing tolerance), snapshot baseline management in git, diff image generation on mismatch
- **Accessibility scanning**: `@axe-core/playwright` integration for automated WCAG 2.1 AA compliance checks with reusable fixtures
- **Test organization**: Page Object Model structure, custom fixtures, test tagging (`@smoke`, `@regression`, `@a11y`), recommended folder structure (`tests/smoke/`, `tests/regression/`, `tests/e2e/`, `tests/a11y/`)
- **Meta-testing**: Infrastructure smoke tests validating that the test setup itself works (browser launches, fixtures initialize, API mocking works)

### Layer 3: Playwright MCP (Optional, Secondary)

The existing Playwright MCP integration is retained but demoted to optional use for edge cases where persistent browser state across many chained tool calls is genuinely needed. It is NOT the default agent validation path.

- **Enhanced MCP configuration**: If used, enable `--caps=testing`, `--caps=tracing`, `--isolated`
- **Use cases**: Long-running multi-tab workflows, complex OAuth flows requiring persistent session state, scenarios where agent-browser CLI's command-per-action model is insufficient
- **Token budget awareness**: Flow documentation must warn agents about token consumption and recommend agent-browser CLI as the default

### CI/CD Integration

- GitHub Actions workflow with `--shard=x/y` parallelism (4 shards) for Playwright test runner
- Blob report merging into unified HTML report artifact
- Trace/screenshot/video artifacts retained on failure
- Visual snapshot baseline update workflow (PR-gated approval for visual changes)
- Separate jobs: smoke tests on PRs, full regression on main
- Cloud browser provider configuration for agent-browser in CI environments (Browserbase or Browser Use via env vars)

### Validation Suite Documentation

- `.allhands/validation/browser-e2e.md` — agent-browser CLI validation suite (primary agent validation)
- `.allhands/validation/playwright-regression.md` — Playwright test runner for CI regression
- `.allhands/validation/playwright-visual.md` — visual regression via `toHaveScreenshot()`
- `.allhands/validation/playwright-a11y.md` — accessibility checks via `@axe-core/playwright`

All following the existing pattern (frontmatter with name, description, globs; body with Purpose, When to Use, Validation Commands, Interpreting Results, CICD Integration).

## Non-Goals

- Replacing or duplicating existing unit test frameworks (Vitest, Jest) — browser validation handles browser-level concerns only
- Performance profiling or load testing — separate tooling domain
- Mobile native app testing (React Native, Expo) — targets web browsers
- Backend API testing without a browser context — use dedicated API testing tools
- Achieving 100% test coverage — focus on critical user flows and validation of agent-implemented changes
- Removing the Playwright MCP integration — it stays as an optional tool, just not the primary one

## Open Questions

- Which front-end framework(s) are in active use? This determines component testing setup (`@playwright/experimental-ct-react` vs `ct-vue` vs `ct-svelte`)
- Should visual regression baselines be stored in the main repo or a separate artifact store? Git storage is simple but increases repo size
- Which cloud browser provider to standardize on for CI? Browserbase is the most established; Browser Use offers free credits; Kernel has stealth mode
- What authentication flows exist? agent-browser supports `--headers` for token-based auth and `--profile` for session persistence — need to map existing auth patterns
- What is the base URL and local dev server setup for the primary front-end application?
- Should agent-browser be integrated as a harness command (`ah browser <args>`) or kept as a standalone CLI?

## Technical Considerations

- **agent-browser architecture**: Rust CLI + Node.js daemon managing Playwright underneath. Fast startup via native binary, falls back to Node.js. Browser session persists between commands via the daemon — no MCP server needed.
- **Token efficiency**: agent-browser commands consume only the stdout of each command (filtered snapshot text, screenshot paths, JSON results). Playwright MCP loads 26+ tool schemas into context plus full accessibility trees on every snapshot. Community reports indicate agent-browser uses "near zero context" by comparison.
- **Death spiral mitigation**: Practitioner reports note LLM death spirals with browser automation (getting stuck on element identification, OAuth flows, unfindable elements). The agent validation flow must include explicit escape hatches: max retry counts, fallback to screenshot-based debugging, and instructions to stop and report when stuck.
- **Existing MCP integration**: `.allhands/harness/src/mcp/playwright.ts` is retained but not enhanced as a priority. If used, add `--caps=testing`, `--caps=tracing`, `--isolated` to args.
- **Browser installation**: CI environments need `npx playwright install --with-deps` (for test runner) and `agent-browser install` (for CLI). Both are cacheable.
- **Snapshot determinism**: Visual regression screenshots vary across OS/browser rendering engines. CI must run on a consistent environment (Ubuntu + Chromium recommended) with pixel thresholds (0.1-0.2).
- **E2E test plan integration**: The existing `E2E_TEST_PLAN_BUILDING.md` flow's "AI-Coordinated Validation" section should reference agent-browser CLI as the primary tool, with Playwright MCP as a secondary option.
- **Validation suite discovery**: Once suite docs are created, `ah validation-tools list` will surface them for the `UTILIZE_VALIDATION_TOOLING.md` flow to match against front-end tasks.
- **Community evidence**: This architecture reflects convergent practitioner experience — HN discussion (189 points, 45 comments) on CLI vs MCP approaches, simonw's workflow of having LLMs write Playwright code directly, and the Vercel team's investment in agent-browser as the production-grade implementation of this pattern.
