---
name: browser-automation
description: "Browser-based validation for front-end web implementations — exploratory UX testing, visual regression, accessibility scanning, and end-to-end flow verification"
globs:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.html"
  - "**/*.css"
  - "**/*.scss"
  - "**/*.astro"
  - "**/pages/**"
  - "**/app/**"
  - "**/components/**"
  - "**/layouts/**"
  - "**/views/**"
tools:
  - "agent-browser"
  - "playwright"
  - "@axe-core/playwright"
---

## Purpose

This suite validates browser-based quality across a unified domain: end-to-end flow verification, visual regression, UX quality, and accessibility. These are sub-concerns within a single validation domain — the browser — not separate suites.

The stochastic dimension uses agent-driven browser exploration to probe edge cases, test responsive behavior, verify interaction flows, and discover regressions that scripted tests miss. The deterministic dimension uses Playwright directly for CI-gated visual regression, accessibility scanning, and scripted e2e flows.

Per **Agentic Validation Tooling**, this suite meets the existence threshold: the stochastic dimension (exploratory UX testing, interaction probing, visual state exploration) provides meaningful agent-driven validation beyond what deterministic tests alone can cover.

## Tooling

### agent-browser (stochastic dimension)

- **Installation**: `npm install -g agent-browser && agent-browser install`
- Rust CLI + Node.js daemon built on Playwright. Discrete CLI commands, not a persistent API.
- **Snapshot+Refs model**: Accessibility tree with compact element refs (`@e1`). Refs invalidate on state change — always re-snapshot after navigation or DOM mutation.
- **Session isolation**: Named sessions for parallel exploration. Auth state persists across sessions.
- **Command reference first**: Run `agent-browser --help` and `agent-browser <command> --help` before any exploration — command vocabulary shapes what you attempt. Prerequisite, not afterthought.

### Playwright (deterministic dimension)

- **Installation**: `npm install -D @playwright/test @axe-core/playwright && npx playwright install chromium --with-deps`
- **Command reference first**: `npx playwright --help` and Playwright docs for the full API surface.
- Scripted CI tests — visual regression (`toHaveScreenshot()`), accessibility (`@axe-core/playwright`, WCAG 2.1 AA), e2e flows. Not via MCP; no LLM reasoning needed.

## Stochastic Validation

Agent-driven exploratory browser validation. This section teaches WHAT to validate and WHY — the CLI teaches HOW.

### Core Loop

**Prerequisite**: `agent-browser --help` — internalize the full command vocabulary before exploring. Every subcommand has its own `--help`. Command awareness shapes exploration quality.

Navigate → snapshot → identify targets → interact → wait for result → verify outcome → check errors.

This is the thinking pattern to internalize, not a command sequence:

- Always re-snapshot after state changes — navigation, form submission, modal appearance, any DOM mutation. Stale refs cause cascading failures.
- Wait for async results before verifying — element appearance, text change, URL update, network settlement
- Verify outcomes before proceeding — never assume an interaction succeeded
- Check console errors after interactions — bugs are often invisible in the visual state

### Use Cases

These seed categories guide exploration. Per **Frontier Models are Capable**, the agent extrapolates deeper investigation from these starting points.

- **Flow verification**: `navigate` to entry point, `snapshot` to orient, interact via refs — `click @e3`, `type @e5 "user@test.com"` — then re-snapshot to verify: URL changed, success state appeared, no console errors. Walk full critical paths (registration, checkout, settings). Exercise redirects and back/forward navigation.
- **Responsive testing**: `resize` viewport across breakpoints (e.g., 375px mobile, 768px tablet, 1280px desktop), `snapshot` at each to inspect layout changes. Test media preferences with `emulate-media` (dark mode, reduced motion). Layout bugs at specific widths are among the most common front-end regressions.
- **Edge case probing**: `click` submit without filling fields, `type` overlong strings and special characters into inputs. Verify error handling surfaces appropriate messages in the next `snapshot`. Test keyboard-only navigation — `press Tab`, `press Enter`, `press Escape` — can a user complete flows without a mouse?
- **Accessibility exploration**: `snapshot` IS the assistive technology view — the accessibility tree reveals semantic structure directly. Verify Tab order (`press Tab` sequences), Enter/Space activation (`press Enter` on focused element), Escape dismissal (`press Escape`), focus management on modals.
- **Evidence capture**: `screenshot` before/after interactions for visual comparison. Capture console output tied to specific flows as bug evidence. Screenshots are opportunistic — capture what's interesting, not on a schedule.
- **Video recording**: Explore first (discover flows, find issues), then `record` a clean replay for engineer review. Recording creates a fresh context but preserves session state — focused evidence, not noisy exploration footage.

### Resilience

Stochastic exploration is inherently unpredictable. These patterns prevent death spirals:

- Max 3 retries on any interaction, then report failure and move on
- `screenshot` on failure — capture full-page state before recovery attempts
- Session restart if page becomes unresponsive — fresh named session + alternative path
- Auth bail-out — OAuth, MFA, or CAPTCHA blockers: save state, report, move on
- Dialog/frame handling — accept or dismiss dialogs to unblock; switch into iframes for embedded content
- Self-healing pattern — when an element disappears, re-snapshot the entire page rather than retrying the same selector (Stagehand reference)

Use `agent-browser --help` and `agent-browser <command> --help` for all available commands and options. This suite teaches what to validate and why — the CLI teaches how.

## Deterministic Integration

CI-gated browser regression testing using Playwright directly. Scripted assertions — no LLM reasoning needed.

- **Visual regression**: `await expect(page).toHaveScreenshot('dashboard.png')` — baseline screenshots committed to repo, fail CI on drift. Mask dynamic content (`{ mask: [page.locator('.timestamp')] }`) to avoid false positives. Single OS + browser in CI for font rendering consistency.
- **Accessibility**: `const results = await new AxeBuilder({ page }).analyze()` — WCAG 2.1 AA scanning via `@axe-core/playwright`. Reusable fixture for consistent config. Scope to components (`.include('.component')`) for feature tests, full-page for integration.
- **Multi-device**: `projects: [{ use: devices['iPhone 14'] }]` — Chromium-only, desktop/mobile/tablet viewport projects. Responsive regression is a viewport concern, not a browser concern.
- **CI artifacts**: `use: { trace: 'on-first-retry', screenshot: 'only-on-failure' }` — traces + screenshots on failure for remote debugging. Upload artifacts to survive ephemeral runners.

## ENV Configuration

| Variable | Required | Dimension | Purpose |
|----------|----------|-----------|---------|
| `BASE_URL` | Yes | Both | Dev server URL (e.g., `http://localhost:3000`) |
| `AGENT_BROWSER_SESSION` | No | Stochastic | Named session for isolation |
| `AGENT_BROWSER_PROFILE` | No | Stochastic | Persistent browser profile path for auth state |
| `BROWSERBASE_API_KEY` | No | Both (CI) | Cloud browser provider API key |
| `BROWSERBASE_PROJECT_ID` | No | Both (CI) | Cloud browser provider project ID |
| `CI` | Auto | Deterministic | Set by CI environment; controls retries, reporter |

`BASE_URL` must be configured per-target-project. This suite is framework-agnostic — the agent should discover the target project's dev server configuration at execution time.
