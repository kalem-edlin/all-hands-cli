---
name: xcode-automation
description: "Xcode-based validation for iOS/macOS native implementations — exploratory build verification, performance profiling, UI automation, and runtime analysis"
globs:
  - "**/*.swift"
  - "**/*.m"
  - "**/*.h"
  - "**/*.xib"
  - "**/*.storyboard"
  - "**/*.xcodeproj/**"
  - "**/*.xcworkspace/**"
  - "**/ios/**"
  - "**/macos/**"
  - "**/Podfile"
  - "**/Package.swift"
  - "**/*.entitlements"
  - "**/*.plist"
tools:
  - "xcodebuildmcp"
  - "xctrace"
---

## Purpose

This suite validates native Apple platform quality across a unified domain: build integrity, runtime performance, UI interaction correctness, and resource profiling. These are sub-concerns within a single validation domain — the Xcode build and runtime environment — not separate suites.

The stochastic dimension uses agent-driven Xcode automation to build projects, deploy to simulators, explore UI via accessibility-based interaction, capture logs, and probe performance characteristics using profiling instruments. The deterministic dimension (unit tests, snapshot tests via `xcodebuild test`) is planned but not yet implemented.

Per **Agentic Validation Tooling**, this suite meets the existence threshold: the stochastic dimension (exploratory build verification, UI automation, performance profiling, memory analysis) provides meaningful agent-driven validation beyond what deterministic tests alone can cover.

## Tooling

### XcodeBuildMCP (stochastic dimension)

- **Harness integration**: Registered as MCP server `xcodebuild` — access via `ah tools xcodebuild`. Run `ah tools xcodebuild --help-tool` for full parameter schemas before exploration.
- MCP server wrapping `xcodebuild`, `simctl`, and AXe (accessibility-based UI automation). 63+ tools across workflow groups — exposed as MCP tool calls via `ah tools xcodebuild:<tool>`.
- **Workflow groups**: Only `simulator` is enabled by default. Enable additional groups (`ui-automation`, `logging`, `project-discovery`, `session-management`, `simulator-management`) via `.xcodebuildmcp/config.yaml` in the target project.
- **Session defaults model**: `session-set-defaults` (hyphenated) persists workspace path, scheme, simulator, and configuration across subsequent calls — reduces token overhead significantly. Use `workspacePath` for CocoaPods projects (`.xcworkspace`), `projectPath` for standalone `.xcodeproj`. Always set session defaults before exploration.
- **Tool discovery first**: Run `ah tools xcodebuild` to see all available tools, then `ah tools xcodebuild --help-tool` for parameter schemas. Tool awareness shapes what you attempt. Prerequisite, not afterthought.

### xctrace (stochastic dimension — profiling)

- **Installation**: Ships with Xcode. Verify with `xcrun xctrace version`.
- CLI for Instruments profiling — not an MCP tool; invoked directly via shell. Run `xcrun xctrace help` and `xcrun xctrace record --help` before any profiling — the subcommand vocabulary (record, export, list, symbolicate) determines what analysis is possible.
- **Template-based recording**: `xctrace list templates` reveals available profiling templates. Templates define what instruments are active during a recording session.
- **Attachment by PID**: `--attach` requires a numeric PID, not a process name. For simulator apps, `xcrun simctl spawn <UDID> launchctl list | grep <bundle_id>` returns the simulator-internal PID, which xctrace cannot use. Instead, find the **host PID** via `pgrep -f "appname.app/appname"`. For `--launch` mode, all flags (`--time-limit`, `--output`, `--no-prompt`) must come **before** the `--launch -- <bundle_id>` terminator — flags after `--` are passed to the launched app, not xctrace.

## Stochastic Validation

Agent-driven exploratory Xcode validation. This section teaches WHAT to validate and WHY — MCP tool discovery and `xctrace --help` teach HOW.

### Core Loop

**Prerequisite**: Run `ah tools xcodebuild --help-tool` for parameter schemas, then `session-set-defaults` with the target project. Run `xcrun xctrace help` to internalize profiling vocabulary.

Discover project → build → deploy to simulator → explore UI → capture logs → profile performance → analyze results.

This is the thinking pattern to internalize, not a command sequence:

- Always discover before building — `discover_projs` reveals workspace/project structure, `list_schemes` shows available build targets. Never assume scheme names.
- Set session defaults early — `workspacePath` (for CocoaPods projects) or `projectPath`, scheme, simulator name, and configuration persist across calls. This eliminates repetitive parameter passing and reduces token cost.
- **Visible simulator preferred** — call `open_sim` before `boot_sim` to make the simulator visible. Headless mode (`boot_sim` without `open_sim`) provides no visual feedback on what the agent is doing. Visible simulators let engineers observe agent-driven UI interactions in real time. Default to visible; use headless only in CI environments.
- Verify build success before deployment — build failures surface dependency issues, missing signing, or configuration problems that must be resolved before any runtime validation. For React Native / Expo projects, `npx expo prebuild --platform ios --clean` must run before the first build to ensure all XCFramework slices are downloaded.
- Use `preferXcodebuild=true` for clean builds — the incremental build system (`xcodemake`) can produce incomplete `.app` bundles (missing Info.plist, executables). Always use `--preferXcodebuild=true` on the first build after `clean` or `expo prebuild`.
- Check logs after interactions — native logs via `start_sim_log_cap` (requires `bundleId`), JS logs via direct `log stream` with `subsystem == "com.facebook.react.log"` for RN/Expo apps (see Log capture and analysis use case). Runtime crashes, constraint violations, and warnings appear in logs, not the UI.
- Profile after functional verification — profiling a broken app wastes time. Confirm the app runs correctly first, then measure performance.

### Use Cases

These seed categories guide exploration. Per **Frontier Models are Capable**, the agent extrapolates deeper investigation from these starting points.

- **Build verification**: `discover_projs` to find workspace, `list_schemes` to enumerate targets, `build_sim --preferXcodebuild=true` to compile for simulator. Verify clean builds succeed. Exercise `clean` then rebuild to catch incremental build artifacts masking errors. Check `show_build_settings` for unexpected configuration (wrong SDK, missing preprocessor flags, incorrect deployment target).
- **Deploy and run**: For reliable deploy, use the multi-step sequence: `build_sim` → `get_sim_app_path` → `get_app_bundle_id` → `install_app_sim` → `launch_app_sim`. The composite `build_run_sim` is convenient but can timeout on long builds. Verify the app launches without crashes — `launch_app_logs_sim` captures stdout/stderr from launch. Boot specific simulator devices via `list_sims` and `boot_sim` to test across device classes (iPhone SE, iPhone 16 Pro Max, iPad).
- **UI automation and verification**: Enable the `ui-automation` workflow group. Verification uses two complementary methods — both are required, not interchangeable:
  - **Programmatic verification** (`describe_ui`): Captures the full accessibility hierarchy with precise frame coordinates. Use for asserting specific state changes: element labels, button presence/absence, text content. Call `describe_ui` after each interaction to confirm the expected state change occurred (e.g., "Like count: 0" → "Like count: 3"). This is the primary method for **semantic state verification** — did the right data appear?
  - **Visual verification** (`screenshot` + read the image): Captures a screenshot and the agent MUST visually inspect it to verify layout correctness, rendering quality, and visual state. This catches issues invisible to the accessibility hierarchy: clipped text, overlapping elements, incorrect colors, broken layouts, missing images, compressed frames. This is the primary method for **visual/layout verification** — does it look right?
  - Per **Agentic Validation Tooling**, the agent is the observer — it must use both its programmatic and visual senses. Taking a screenshot without reading it provides no validation value. `describe_ui` alone misses rendering bugs. Use `describe_ui` for "is the state correct?" and `screenshot` (visually inspected) for "does it render correctly?"
  - Interact via `tap`, `swipe`, `type_text`, `key_press` using accessibility labels from `describe_ui` (preferred) or coordinates. Walk critical user flows: onboarding, navigation between screens, form submission, back navigation.
- **Log capture and analysis**: Two log channels exist for native and JS respectively:
  - **Native logs** (`start_sim_log_cap`): Requires `bundleId`. Captures structured `os_log` messages filtered by `subsystem == "<bundleId>"`. Surfaces: constraint ambiguity warnings (Auto Layout issues), main thread violations, memory warnings, unhandled exceptions, API deprecation notices, missing `UIBackgroundModes` entries. Use `captureConsole=true` to additionally capture the app process's stdout/stderr (note: this relaunches the app on start and **terminates it on stop** — plan the lifecycle accordingly).
  - **JS logs for React Native / Expo**: JavaScript `console.log` output routes through Hermes JSI → `RCTLog` → Apple's `os_log` under subsystem `com.facebook.react.log` (category `javascript`) — NOT the app's bundle ID subsystem and NOT stdout/stderr. This means `start_sim_log_cap` will **not** capture JS console.log messages, because it filters by the app's bundle ID subsystem. Two approaches to capture JS logs:
    1. **Direct `log stream`** (preferred for automation): `xcrun simctl spawn <UDID> log stream --level=debug --predicate 'subsystem == "com.facebook.react.log"'` — captures JS `console.log` output in real time via the simulator's unified log system. Run in background, exercise the app, then inspect the output.
    2. **Metro terminal output**: When Metro is running (`expo start`), JS logs also appear in Metro's stdout as `LOG  [message]`. If Metro is running as a background task, its output file contains all JS logs.
  - For comprehensive validation, use both channels: `start_sim_log_cap` for native-level diagnostics and direct `log stream` (or Metro output) for JS-level state change verification. The JS log channel is essential for verifying that UI automation interactions produce the expected application-level state changes.
- **Performance profiling**: Use `xctrace` after confirming the app runs correctly. Find the **host PID** via `pgrep -f "appname.app/appname"` (not `launchctl list`, which returns the simulator-internal PID). Then: `xcrun xctrace record --template 'Time Profiler' --device '<UDID>' --attach '<PID>' --time-limit 30s --output /tmp/profile.trace --no-prompt`. Export with `xcrun xctrace export --input /tmp/profile.trace --toc` to understand trace structure (schemas, tables), then XPath queries for specific tables. For Expo/RN apps, look for `com.facebook.react.runtime.JavaScript` (Hermes JS thread) and `hades` (Hermes GC) in thread samples.
- **Memory analysis**: Same host PID discovery, then `xcrun xctrace record --template 'Leaks' --device '<UDID>' --attach '<PID>' --time-limit 60s --output /tmp/leaks.trace --no-prompt`. The `Leaks` template includes the `Allocations` instrument — a single recording provides both leak detection and heap allocation statistics. Export leak results via `xcrun xctrace export --input /tmp/leaks.trace --xpath '/trace-toc/run[@number="1"]/tracks/track[@name="Leaks"]/details/detail[@name="Leaks"]'` and allocation statistics via the `Allocations` track. The standalone `Allocations` template uses deferred recording mode, making CLI export less straightforward — prefer `Leaks` for combined analysis. Exercise flows repeatedly and check for monotonic heap growth indicating retain cycles.
- **Combined profiling + UI automation**: Run `xctrace record` in the background (long `--time-limit` or no limit), then exercise the app via xcodebuild MCP UI automation (`describe_ui`, `tap`, `gesture`) while profiling captures the runtime behavior. This surfaces memory leaks, performance regressions, and hangs in actual user flows, not just idle state. **Ordering matters**: `xctrace --attach` sessions end when the target process exits. If `stop_sim_log_cap` (console mode) terminates the app while xctrace is recording, the trace ends early. Always let xctrace reach its `--time-limit` or stop it explicitly before terminating the app or stopping console log capture.
- **Animation quality**: `xcrun xctrace record --template 'Animation Hitches' --device '<UDID>' --attach '<PID>' --time-limit 30s --output /tmp/hitches.trace --no-prompt` while scrolling, navigating, and animating. Hitch duration > 33ms (2 frames) indicates dropped frames visible to users. **Note**: Animation Hitches is **not supported on simulator** — requires a physical device.
- **Additional profiling templates**: Beyond the core three, `App Launch` measures startup time (critical for RN/Expo apps with large JS bundles), `Network` captures HTTP request timing and payload sizes, `SwiftUI` profiles SwiftUI-specific rendering (not relevant for RN), `Swift Concurrency` profiles async/await patterns, `CPU Counters` provides low-level CPU performance data, and `Power Profiler` measures battery impact.
- **Evidence capture**: Per **Agentic Validation Tooling**, two audiences require different artifacts. Agent self-verification (real-time `describe_ui` checks, screenshot visual inspection, log stream monitoring) happens during the observe-act-verify loop. Engineer review artifacts (`screenshot` images, `record_sim_video` recordings, xctrace `.trace` files, captured log output) are produced after exploration. Pattern: explore first, then capture review evidence — but the agent MUST visually read screenshots it takes during exploration, not just save them.

### Resilience

Stochastic exploration in the Xcode environment has unique failure modes. These patterns prevent death spirals:

- Max 3 retries on any build or interaction, then report failure and move on
- `screenshot` on failure — capture simulator state before recovery attempts
- Simulator reset if app becomes unresponsive — `stop_app_sim`, then re-launch. If simulator itself hangs, `erase_sims` for a clean slate
- Code signing bail-out — provisioning profile or certificate errors: report the exact error and move on. These require human intervention.
- CocoaPods/SPM resolution — dependency resolution failures: check `Podfile.lock` freshness, try `clean` and rebuild. Report if unresolvable.
- Stale session defaults — if switching between projects or schemes, always call `session-set-defaults` again. Stale defaults cause confusing errors.
- xctrace attachment failures — `--attach` requires the **host PID** (via `pgrep -f "appname.app/appname"`), not the simulator-internal PID from `launchctl list`. If the app exits before profiling starts, use `--launch` mode — but note that `--launch` does not pass URL scheme arguments, so Expo/RN apps may fail to connect to the Metro bundler. For Expo apps, prefer `--attach` after launching the app via xcodebuild MCP or `expo start`.
- Incomplete `.app` bundles — if `install_app_sim` fails with "Missing bundle ID", the build produced a partial bundle. Run `clean` then `build_sim --preferXcodebuild=true` (the incremental builder can produce incomplete output).
- React Native / Expo setup — `npx expo prebuild --platform ios --clean` must run before first build to download XCFramework simulator slices. Without this, the `[CP] Copy XCFrameworks` build phase fails with rsync errors.

Use `ah tools xcodebuild --help-tool` and `xcrun xctrace help` for all available operations. This suite teaches what to validate and why — the tools teach how.

### Simulator Visibility

Per **Agentic Validation Tooling**, programmatic validation replaces human supervision — but engineer trust requires observability. **Visible simulators are preferred** over headless for local development and validation:

- Call `open_sim` before `boot_sim` to make the Simulator.app window visible
- Visible mode lets engineers observe agent-driven UI interactions, verify screenshot quality, and spot issues the agent might miss
- `boot_sim` alone boots headless (no window) — appropriate for CI but not for interactive validation sessions
- The `.xcodebuildmcp/config.yaml` `sessionDefaults.simulatorName` targets the device; visibility is controlled by whether Simulator.app is open

### Simulator Isolation (Multi-Worktree)

When running validation across multiple worktrees simultaneously, each needs an isolated simulator, derived data path, and Metro port to prevent contention:

- **Dedicated simulator**: `xcrun simctl create "<worktree>-iPhone16Pro" "iPhone 16 Pro"` creates a named clone. Target by UDID via `session-set-defaults --simulatorId=<UDID>`.
- **Derived data isolation**: `build_sim --derivedDataPath=<path>` or `-derivedDataPath` on any build tool keeps build products separate per worktree.
- **AGENT_ID isolation**: The harness MCP daemon already isolates sessions by `AGENT_ID` — parallel agents get independent XcodeBuildMCP sessions automatically.
- **Expo Metro port isolation**: Each worktree's Metro bundler must run on a unique port. Use `expo start --port <port>` (e.g., 8081, 8082, 8083). The built app connects to the port specified at launch time — if switching ports, the app must be rebuilt with `expo run:ios` targeting the new port, or the `RCT_METRO_PORT` environment variable must be set before build. The `--port` flag on `expo start` only controls where Metro listens; the app's compiled bundler URL must match.

### Test Target Setup (Expo / React Native)

For Expo projects used as validation targets:

1. `npm install` in the project root
2. `npx expo prebuild --platform ios --clean` — generates `ios/` directory with proper XCFramework slices. CocoaPods install is handled automatically.
3. **Build using preconfigured package.json scripts when they exist** — check for `"ios"` script (typically `expo run:ios`). Use `npm run ios -- --device "<SimulatorName>"` to target a specific simulator. Fall back to `expo run:ios` directly if no script exists. For already-built apps testing JS-only changes, use `expo start` instead.
4. `expo run:ios` handles the full pipeline: build → install → launch. However, in non-interactive environments it may log `"Skipping dev server"` — the Metro bundler won't start automatically. Start `expo start --port 8081` separately to serve the JS bundle, then reload the app via UI automation (`tap --label "Reload"` on the red box).
5. First build after `expo prebuild --clean` should use `--preferXcodebuild=true` if building via xcodebuild MCP tools directly.

The workspace path for session defaults is `./ios/<project>.xcworkspace` (not `.xcodeproj`) when CocoaPods are in use. Use `simulatorId` (UDID) rather than `simulatorName` — the two parameters are **mutually exclusive** in `session-set-defaults`, and many tools require the UDID. Prefer `simulatorId` for reliable targeting.

### Expo Dev Server and HMR

For JS-only change validation (no native code changes):

- `expo start --port <port>` starts the Metro bundler for Hot Module Replacement. JS file changes propagate to the running app automatically without rebuild.
- Verify HMR changes via `describe_ui` — check that `AXLabel` values reflect the updated text after file save.
- The Metro bundler must be running on the port the app expects (default 8081). The app connects to the bundler URL passed at launch time.
- For native code changes, a full rebuild via `expo run:ios` or `build_sim` is required.

### Deterministic Teardown

Teardown in reverse order of setup to prevent orphaned processes. **Ordering is critical** — stopping log capture (console mode) terminates the app, which terminates any attached xctrace session:

1. **Wait for / stop xctrace**: If profiling is active, either let it reach `--time-limit` or terminate it first. An attached xctrace session will end when the app process exits, so stopping it before step 2 ensures a clean trace file.
2. **Stop the app**: `stop_app_sim --bundleId "<bundle_id>"` — terminates the app in the simulator
3. **Stop active log captures**: `stop_sim_log_cap --logSessionId "<id>"` for any active sessions. Console capture mode terminates the app on stop — skip step 2 if using console capture.
4. **Kill JS log stream**: If a background `log stream` process was started for JS log capture (subsystem `com.facebook.react.log`), terminate it.
5. **Clear session defaults**: `session-clear-defaults --all true` — prevents stale defaults from affecting the next session
6. **Kill the Metro dev server**: Terminate the `expo start` process (background task or PID)
7. **Clean trace artifacts**: Remove `.trace` bundles from `/tmp` or working directory
8. **Simulator**: Leave running for potential reuse by other worktrees. Only shut down via `xcrun simctl shutdown <UDID>` if explicitly cleaning up.

### Bad State Detection

Detect app failures by comparing `describe_ui` output against expected state:

- **Red box / error screen**: UI hierarchy contains `redbox-dismiss`, `redbox-reload`, `redbox-copy` buttons — the app hit a JS error or couldn't connect to the dev server
- **Home screen instead of app**: `AXLabel` shows system app names (Safari, Messages, etc.) with `pid` belonging to SpringBoard — the app crashed or was terminated
- **Empty view hierarchy**: Single `Application` node with no children — the app is loading or hung during initialization
- **Stale PID**: `describe_ui` returns elements with a different `pid` than expected — the app was relaunched (possibly by `captureConsole` or xctrace `--launch`)

On bad state detection: `screenshot` for evidence, then attempt recovery via `stop_app_sim` → `launch_app_sim`. If the simulator itself is unresponsive, `erase_sims` for a clean slate.

## Deterministic Integration

**Planned — not yet implemented.**

The deterministic dimension for this suite will use `xcodebuild test` for CI-gated binary pass/fail validation:

- **Unit tests**: XCTest suites validating business logic, model layer, and service interfaces. Run via `xcodebuild test -scheme <scheme> -destination 'platform=iOS Simulator,name=<device>'`.
- **Snapshot tests**: Point-free swift-snapshot-testing or similar for visual regression of individual views/components. Baseline images committed to repo, fail CI on drift.
- **Performance tests**: XCTest `measure {}` blocks with baselines for critical code paths. Fail on regression beyond configured deviation.

These will be implemented as the suite matures through the crystallization lifecycle — current stochastic exploration patterns will inform which deterministic gates are most valuable.

## ENV Configuration

| Variable | Required | Dimension | Purpose |
|----------|----------|-----------|---------|
| `XCODE_WORKSPACE` | No | Both | Path to `.xcworkspace` (discovered automatically if not set) |
| `XCODE_SCHEME` | No | Both | Build scheme name (discovered via `list_schemes` if not set) |
| `SIMULATOR_NAME` | No | Stochastic | Target simulator device (e.g., `iPhone 16 Pro`) |
| `XCODEBUILDMCP_WORKFLOWS` | No | Stochastic | Comma-separated workflow groups to enable beyond `simulator` |
| `DERIVED_DATA_PATH` | No | Both | Custom DerivedData location for build isolation |
| `RCT_METRO_PORT` | No | Stochastic | Metro bundler port for Expo/RN apps (default 8081). Must match `expo start --port` |
| `CI` | Auto | Deterministic | Set by CI environment; controls test retry and reporter behavior |

Project-specific configuration should be committed as `.xcodebuildmcp/config.yaml` in the target project root. This file controls which workflow groups are enabled and sets session defaults (workspace path, scheme, simulator, configuration). The agent should still discover the target project's workspace structure at execution time via `discover_projs` — the config file provides defaults, not overrides.
