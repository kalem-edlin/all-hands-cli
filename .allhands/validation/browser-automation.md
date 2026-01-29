---
name: browser-automation
description: "Browser-based validation for front-end implementations — exploratory UX testing, visual regression, accessibility scanning, and end-to-end flow verification"
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
- **Architecture**: Rust CLI + Node.js daemon on Playwright. Daemon persists between commands for fast subsequent operations.
- **Snapshot+Refs system**: `agent-browser snapshot -i` returns compact element references (`@e1`, `@e2`). Subsequent commands use refs directly (`agent-browser click @e1`). Refs invalidate on page changes — always re-snapshot after navigation.
- **Session management**: `--session <name>` for isolated parallel sessions. `agent-browser state save/load <path>` for auth state persistence.

### Playwright (deterministic dimension)

- **Installation**: `npm install -D @playwright/test @axe-core/playwright && npx playwright install chromium --with-deps`
- Used directly for scripted tests — not via MCP. Token efficiency for CI; no LLM reasoning needed for deterministic tests.
- **Visual regression**: `toHaveScreenshot()` with pixel thresholds
- **Accessibility**: `@axe-core/playwright` with WCAG 2.1 AA tags

## Stochastic Validation

Agent-driven exploratory validation playbook. The agent uses model intuition to explore and validate browser-based implementations. All commands use the `agent-browser` CLI.

### Navigation & Flow Verification

- Navigate end-user flows: `agent-browser open <url>`, snapshot, interact through critical paths
- Verify navigation works: back/forward, deep links, redirects
- Test form submissions: fill, submit, verify success/error states
- Pattern: snapshot → interact → wait → re-snapshot → verify state change

### UX Edge Cases & Quality

- Viewport emulation: `agent-browser set device "iPhone 14"` / `agent-browser set viewport 375 667`
- Dark mode testing: `agent-browser set media dark`
- Reduced motion: `agent-browser set media light reduced-motion`
- Offline simulation: `agent-browser network route "**" --abort` then test graceful degradation
- Geolocation: via `agent-browser eval` to set navigator.geolocation

### Visual State Exploration

- Screenshot key states: `agent-browser screenshot <path>`
- Compare across breakpoints: set different viewports, screenshot each
- Check loading states, empty states, error states
- Verify responsive layouts at mobile (375px), tablet (768px), desktop (1280px), wide (1920px)

### Interaction Testing

- Form validation: fill invalid data, verify error messages
- Keyboard navigation: `agent-browser press Tab`, verify focus order
- Click targets: verify interactive elements are reachable
- Hover states: `agent-browser hover @ref`, screenshot to verify

### Console & Network Monitoring

- Check for JS errors: `agent-browser errors` — fail if unexpected errors
- Monitor console warnings: `agent-browser console`
- Verify API calls: `agent-browser network requests --filter api`
- Check for failed network requests

### Death-Spiral Escape Hatches

- Maximum 3 retries on any single interaction before reporting failure
- If element not found after re-snapshot, take a full-page screenshot for debugging: `agent-browser screenshot --full debug-state.png`
- If stuck on OAuth/complex auth flow: save state (`agent-browser state save`), report the blocker, move on
- If page is completely unresponsive: `agent-browser close`, restart session, try alternative path
- Reference architecture: Stagehand's "multidimensional self-healing" pattern — when an element disappears entirely, fall back to full-page analysis rather than retrying the same selector

## Deterministic Integration

CI-gated browser regression testing using Playwright directly. Deterministic tests don't need LLM reasoning — they run as scripted assertions.

### Visual Regression

- Use `toHaveScreenshot()` with configuration: `threshold: 0.2`, `maxDiffPixelRatio: 0.1`, `animations: 'disabled'`, `caret: 'hide'`
- Mask dynamic content (timestamps, ads) with `mask: [locator]`
- Baseline storage: committed to repo at `__screenshots__/{projectName}/{testFilePath}/{arg}{ext}`
- Update baselines: `npx playwright test --update-snapshots`
- Run on consistent environment (Ubuntu + Chromium in CI) to avoid OS-level rendering differences

### Multi-Device Execution

- Playwright projects configuration for desktop (`Desktop Chrome`), mobile (`Pixel 5`), tablet (custom 768x1024 viewport)
- All projects use Chromium for consistency (cross-browser testing is a separate concern)

### Accessibility Scanning

- Use `@axe-core/playwright` with `AxeBuilder`
- Target WCAG 2.1 AA: `.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])`
- Create reusable fixture for consistent configuration across test files
- Scope scans to specific components when testing individual features

### Artifact Capture

- Trace: `trace: 'on-first-retry'` — captures full trace on first retry for debugging
- Screenshot: `screenshot: 'only-on-failure'` with `fullPage: true`
- Video: `video: 'on-first-retry'`
- Upload artifacts in CI: `actions/upload-artifact@v4` with `playwright-report/`

### CI Configuration (GitHub Actions pattern)

```yaml
- npx playwright install chromium --with-deps
- npx playwright test
- Upload playwright-report/ as artifact (if: !cancelled())
```

### Test Organization

- `tests/visual/*.visual.spec.ts` — visual regression tests
- `tests/accessibility/*.a11y.spec.ts` — accessibility scans
- `tests/e2e/*.e2e.spec.ts` — end-to-end flow tests
- `tests/fixtures/axe-fixture.ts` — shared accessibility fixture
- Retries: `retries: process.env.CI ? 2 : 0`

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
