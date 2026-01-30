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
- **Command reference**: `agent-browser --help` for all commands; `agent-browser <command> --help` for detailed usage. The CLI is the authoritative reference — this suite documents motivation, not syntax.
- **Architecture**: Rust CLI + Node.js daemon built on Playwright. The daemon persists between commands, making subsequent operations fast. This architecture means the agent interacts through discrete CLI commands rather than a persistent API — each command is a self-contained action.
- **Snapshot+Refs**: The tool provides an accessibility tree snapshot that assigns compact element references (like `@e1`). These refs are how the agent targets elements for interaction. Refs invalidate when page state changes — this is why re-snapshotting after any navigation or significant DOM change is fundamental to reliable stochastic exploration.
- **Session isolation**: The tool supports named sessions for running parallel explorations without interference. Auth state can be persisted and reloaded across sessions — useful when exploration requires authenticated access without re-authenticating each time.

### Playwright (deterministic dimension)

- **Installation**: `npm install -D @playwright/test @axe-core/playwright && npx playwright install chromium --with-deps`
- Used directly for scripted tests — not via MCP. Token efficiency for CI; no LLM reasoning needed for deterministic tests.
- Playwright provides visual regression (`toHaveScreenshot()`), accessibility scanning (`@axe-core/playwright` with WCAG 2.1 AA), and scripted e2e flows as deterministic assertions.

## Stochastic Validation

Agent-driven exploratory validation. Per **Frontier Models are Capable**, this section teaches the agent HOW TO THINK about browser exploration — the tool's `--help` system teaches specific commands.

### Core Loop

The fundamental stochastic cycle for browser automation:

**Navigate → Snapshot → Identify targets → Interact → Wait for result → Verify outcome → Check for errors**

This is the thinking pattern to internalize, not a command sequence. Key principles:

- **Always snapshot before interacting** — the accessibility tree is how the agent sees the page. Without a current snapshot, the agent is operating blind.
- **Re-snapshot after any state change** — navigation, form submission, modal appearance, tab switch, or any interaction that modifies the DOM. Stale refs cause cascading failures.
- **Wait before verifying** — page state changes are asynchronous. The agent must wait for expected outcomes (element appearance, text change, URL update, network settlement) before checking results.
- **Verify before proceeding** — confirm the expected outcome actually occurred. Did the form submit? Did the URL change? Did the error message appear? Never assume an interaction succeeded.
- **Check for errors after interactions** — console errors and network failures surface bugs that are invisible in the visual state. Checking the error state is part of every loop iteration.

### Verification Primitives

How the agent programmatically confirms outcomes during exploration. The tool provides primitives for:

- **Reading element content** — confirm text changed after an interaction, verify success/error messages appeared, check that dynamic content loaded correctly
- **Checking element state** — determine if elements are visible, enabled, or checked. Essential for verifying that UI responded to interaction (button disabled after submit, checkbox toggled, modal became visible)
- **Reading input values** — confirm form fields contain expected data after fill operations, verify that programmatic changes took effect
- **Monitoring URL changes** — verify navigation succeeded, redirects landed correctly, deep links resolved to expected pages
- **Detecting console errors** — surface JavaScript exceptions that indicate broken functionality. An interaction may appear to succeed visually while throwing errors underneath
- **Inspecting network activity** — verify API calls were made, check for failed requests, confirm expected data exchanges between client and server

Per **Frontier Models are Capable**, the agent discovers specific verification commands via `--help`. These motivations tell the agent WHEN and WHY to verify — the tool tells it HOW.

### Evidence Capture

Artifacts the agent collects DURING exploration to inform its own decision-making. These are in-loop tools for the agent's reasoning — not deliverables for human review.

- **Screenshots at key states** — capture before/after an interaction to compare visual changes, screenshot across different viewports to spot responsive breakpoints, save error states for reference when documenting findings
- **Console log snapshots** — when errors appear, capture the console state to inform the agent's next exploration decision. A console error after clicking a button changes what the agent should investigate next.
- **Network request logs** — when investigating API behavior, capture request/response patterns to understand what the frontend expects from the backend

Evidence capture is opportunistic — the agent screenshots and logs when something interesting happens, not on a predetermined schedule. Per **Frontier Models are Capable**, model intuition decides what constitutes an interesting state worth capturing.

This subsection explicitly excludes video recording. Video is an **Evidence for Engineer** artifact (see subsection 6), not an in-loop decision tool.

### Exploration Patterns

Open-ended categories of stochastic exploration. Per **Frontier Models are Capable**, these are starting points — the agent's intuition drives deeper exploration based on what it discovers.

- **Flow verification** — navigate critical user paths end-to-end: registration, login, checkout, settings changes. Test form submissions with valid data and verify success states. Follow redirects and confirm they land correctly. Exercise back/forward navigation. The goal is confirming that the happy path works before probing edges.

- **Responsive & device testing** — explore across viewports and device emulations to reveal layout breakpoints and responsive design failures that only appear at specific screen sizes. Test media preferences (dark mode, reduced motion) to verify the application respects user settings. Layout bugs at mobile widths are among the most common front-end regressions.

- **Edge case probing** — test with invalid input to verify error handling (empty fields, too-long strings, special characters, SQL injection patterns). Simulate degraded network conditions to check graceful degradation. Explore keyboard navigation and focus management — can a user complete the flow without a mouse? These edge cases reveal robustness gaps that happy-path testing misses.

- **UX quality assessment** — evaluate the quality of transitional and boundary states: loading indicators during async operations, empty states when no data exists, error states when operations fail, hover and focus visual feedback on interactive elements. These states are where polish separates production-quality UI from prototypes.

- **Accessibility exploration** — probe keyboard navigability (Tab order, Enter/Space activation, Escape dismissal), focus management (does focus move to modals? return after closing?), and semantic structure via the accessibility tree snapshot. The snapshot is inherently an accessibility tool — it reveals how assistive technology would perceive the page.

### Resilience

Stochastic exploration is inherently unpredictable. These patterns prevent the agent from getting stuck.

- **Wait as the core reliability primitive** — the agent must wait for expected outcomes before proceeding. Elements appearing, text changing, URLs updating, network settling — without explicit waiting, stochastic exploration is flaky. Every interaction that triggers async behavior needs a corresponding wait. The tool provides primitives for waiting on elements, text, URLs, network state, and JavaScript conditions.

- **Maximum 3 retries** on any single interaction before reporting failure. Retrying the same action that failed 3 times is a death spiral — report the failure and move on.

- **Screenshot on failure** — when an interaction fails, capture a full-page screenshot before attempting recovery. This provides context for understanding what went wrong, whether the agent recovers or not.

- **Session restart** — if a page becomes completely unresponsive, close the browser and start a fresh session. Try an alternative path to the same destination rather than repeating the failed route.

- **Auth bail-out** — if stuck on an OAuth flow, complex multi-factor authentication, or CAPTCHA, save the browser state, report the blocker, and move on to other exploration. Auth flows often require human credentials that the agent cannot fabricate.

- **Dialog handling** — real applications surface confirmation dialogs, alerts, and permission prompts. The agent must accept or dismiss dialogs to avoid blocking the exploration loop. Unhandled dialogs freeze all page interaction.

- **Frame handling** — iframes exist in real applications (embedded content, third-party widgets, payment forms). The agent must switch context into frames when exploration targets embedded content, and return to the main frame afterward.

- **Reference architecture**: Stagehand's "multidimensional self-healing" pattern — when an element disappears entirely, fall back to full-page analysis (re-snapshot the entire page) rather than retrying the same selector. The page may have changed in a way that invalidates the original approach.

### Evidence for Engineer

Artifacts produced specifically for human review after stochastic exploration is complete. Per **Quality Engineering**, these close the trust gap — proof the agent validated what it claims.

- **Video recording** — the primary evidence artifact. The agent explores stochastically first (discovering flows, finding issues, verifying behavior), then starts recording and replays discovered flows cleanly for human consumption. Pattern: **explore first (no recording), record second (clean evidence)**. Recording creates a fresh browser context but preserves session state, so the agent can replay a clean walkthrough of any flow it discovered during exploration. This two-phase approach produces focused, watchable recordings rather than noisy exploration footage.

- **Curated screenshots** — screenshots captured during exploration (subsection 3) that document specific findings: before/after comparisons showing a bug, responsive breakpoints where layout breaks, error states that surfaced during probing. Include these in findings with context about what they show.

- **Console error exports** — when exploration discovers JavaScript errors, export the console log as evidence. Console errors tied to specific user flows are high-value bug reports.

- **Trace recordings** — detailed execution traces for post-mortem analysis when exploration reveals complex interaction bugs. Traces capture network activity, DOM changes, and screenshots at each step — useful when a bug report needs more context than a video provides.

## Deterministic Integration

CI-gated browser regression testing using Playwright directly. Deterministic tests don't need LLM reasoning — they run as scripted assertions. Per **Frontier Models are Capable**, this section teaches the agent WHAT to validate deterministically — Playwright's documentation and `npx playwright --help` teach specific APIs.

### Visual Regression

Catch unintended visual changes before they reach production. The core idea: capture baseline screenshots of known-good states, then fail CI when screenshots drift beyond acceptable thresholds.

- **Baseline management** — commit baselines to the repo so changes are code-reviewed. Update baselines explicitly when visual changes are intentional.
- **Dynamic content masking** — timestamps, ads, avatars, and other non-deterministic content must be masked to avoid false positives. Masking is the primary source of flaky visual tests.
- **Environment consistency** — visual comparison is OS-sensitive (font rendering, anti-aliasing). Run on a single OS + browser combination in CI to avoid cross-platform drift.

### Multi-Device Execution

Responsive regressions are among the most common front-end bugs. Test across viewport breakpoints to catch layout issues that only appear at specific screen sizes.

- Configure Playwright projects for desktop, mobile, and tablet viewports
- Use a single browser engine (Chromium) for consistency — cross-browser testing is a separate concern from responsive testing

### Accessibility Scanning

Automated accessibility scanning catches low-hanging WCAG violations that manual review misses. Per **Quality Engineering**, accessibility is a quality dimension, not a feature.

- Integrate `@axe-core/playwright` for WCAG 2.1 AA scanning
- Create a reusable fixture so every test file gets consistent accessibility configuration
- Scope scans to individual components when testing feature changes — full-page scans for integration tests

### Artifact Capture

CI artifacts close the debugging gap when tests fail remotely. Capture enough context to diagnose failures without reproducing locally.

- **Traces on failure** — full execution traces (network, DOM, screenshots) for post-mortem debugging
- **Screenshots on failure** — full-page captures for visual comparison
- **Video on retry** — captures the retry attempt to show what the test saw during failure recovery
- Upload all artifacts so they survive ephemeral CI runners

### Test Organization

Organize tests by validation concern so CI can run subsets independently. Separate visual regression, accessibility, and e2e flow tests into distinct directories. Configure retries for CI (flaky network, slow rendering) but not locally (fast feedback).

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
