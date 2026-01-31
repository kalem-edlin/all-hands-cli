# Xcode Automation Validation Notes

Findings from end-to-end testing of `.allhands/validation/xcode-automation.md` against this Expo project.

## Test Environment

- **Project**: expo-tailwind (Expo SDK 54, React Native 0.81.5, NativeWind 5.0)
- **Simulator**: iPhone 16 Pro (iOS 18.6) — UDID `9B015541-5197-459F-BECD-1A884C80ACBB`
- **Xcode**: xctrace 26.0 (17B100)
- **XcodeBuildMCP**: 63 tools, workflow groups: simulator, ui-automation, logging, project-discovery, utilities, session-management, simulator-management
- **Bundle ID**: `com.anonymous.expo-tailwind`
- **Metro Port**: 8081

## Build from Scratch

### Sequence

```
npm install
npx expo prebuild --platform ios --clean
npm run ios -- --device "iPhone 16 Pro"
```

### Findings

- `expo prebuild --clean` regenerates `ios/` directory and runs CocoaPods automatically — no manual `pod install` needed
- `npm run ios` invokes `expo run:ios` from package.json — **always use preconfigured scripts when they exist**
- Build produced 0 errors, 2 warnings (benign duplicate `-lc++` linker warning)
- Full clean build compiled all native modules: hermes-engine, ReactNativeDependencies, SDWebImage stack, libdav1d, libwebp, libavif, react-native-screens, react-native-reanimated, react-native-worklets, react-native-safe-area-context, expo-modules-core, expo-image, expo-router, expo-constants, etc.
- Build artifacts at: `~/Library/Developer/Xcode/DerivedData/expotailwind-*/Build/Products/Debug-iphonesimulator/expotailwind.app`

### Critical Issue: Dev Server in Non-Interactive Mode

`expo run:ios` logged `"Skipping dev server"` — the Metro bundler did not start. The app was installed and launched but showed the **React Native red box**: "Could not connect to development server."

**Resolution**: Start Metro separately with `expo start --port 8081`, then reload the app. The red box has a "Reload" button accessible via UI automation (`tap --label "Reload"`).

**Doc impact**: This is documented in the updated Test Target Setup section. Agents must detect this failure pattern and start Metro separately.

## Session Defaults

### What Worked

```
session-set-defaults --workspacePath ./ios/expotailwind.xcworkspace --scheme expotailwind --simulatorName "iPhone 16 Pro" --configuration Debug
```

### What Required Correction

- `simulatorName` alone is insufficient for many tools — `simulatorId` (UDID) is also required
- Must set both: `--simulatorName "iPhone 16 Pro" --simulatorId "9B015541-5197-459F-BECD-1A884C80ACBB"`

## Log Capture

### Structured Logs (default)

- `start_sim_log_cap --bundleId "com.anonymous.expo-tailwind"` — captures structured OS subsystem logs
- **Result**: Empty for RN/Expo apps. React Native logging uses console output, not structured `os_log` subsystem

### Console Logs (`captureConsole=true`)

- `start_sim_log_cap --bundleId "com.anonymous.expo-tailwind" --captureConsole true`
- **Behavior**: Relaunches the app to capture console output
- **Result**: Captured meaningful logs:
  - `You've implemented -[<UIApplicationDelegate> application:performFetchWithCompletionHandler:]` — missing UIBackgroundModes for "fetch"
  - `You've implemented -[<UIApplicationDelegate> application:didReceiveRemoteNotification:fetchCompletionHandler:]` — missing UIBackgroundModes for "remote-notification"
  - `_setUpFeatureFlags called with release level 2`
- **Critical behavior**: `stop_sim_log_cap` with console capture **terminates the app process**. The UI returns to the home screen.

## UI Automation

### Tools Validated

| Tool | Parameters | Result |
|---|---|---|
| `describe_ui` | (none) | Full AX hierarchy with frame coords |
| `tap` | `--label "About"` | Tap by accessibility label |
| `tap` | `--x 241 --y 87` | Tap by coordinates |
| `gesture` | `--preset scroll-down` | Preset gesture |
| `gesture` | `--preset scroll-up` | Preset gesture |
| `swipe` | `--x1 --y1 --x2 --y2` | Custom swipe (note: NOT startX/endX) |
| `screenshot` | (none) | Returns base64 JPEG |

### Key Observations

- `describe_ui` returns precise frame coordinates — always call before interacting by coordinates
- `tap --label` is more reliable than coordinate-based tapping for accessibility-labeled elements
- The accessibility hierarchy for this Expo/NativeWind app showed compressed frame heights (heading 2px, body 3.3px) — the visual rendering differs from the AX frame sizes. This doesn't affect tap targeting since the touch area encompasses the full visible element.
- All navigation links in this app point to `/` (single-page demo) — navigation didn't produce view changes, but the automation tools themselves worked correctly

## Profiling

### PID Discovery

- **Wrong approach**: `xcrun simctl spawn <UDID> launchctl list | grep <bundle_id>` — returns simulator-internal PID (e.g., 14975). xctrace **cannot** attach to this PID (`"Cannot find process for provided pid"`).
- **Correct approach**: `pgrep -f "expotailwind.app/expotailwind"` — returns host PID (e.g., 30741). xctrace attaches successfully.

### Time Profiler

```
xcrun xctrace record --template 'Time Profiler' --device '<UDID>' --time-limit 10s --output /tmp/profile.trace --no-prompt --launch -- com.anonymous.expo-tailwind
```

- **Result**: Recorded 10.3s of data
- **Threads observed**:
  - Main Thread (blocked during idle)
  - `com.apple.uikit.eventfetch-thread`
  - `com.facebook.react.runtime.JavaScript` — Hermes JS runtime thread
  - `hades` — Hermes garbage collector thread
  - Multiple expotailwind worker threads
- **Export**: `xcrun xctrace export --input /tmp/profile.trace --toc` reveals schemas: `time-sample`, `time-profile`, `potential-hangs`, `runloop-events`, `hang-risks`

### Leaks

```
xcrun xctrace record --template 'Leaks' --device '<UDID>' --time-limit 15s --output /tmp/leaks.trace --no-prompt --launch -- com.anonymous.expo-tailwind
```

- **Result**: No leaks detected (`leak` schema returned empty result set)
- **Allocations instrument** was active (records heap allocations, reference counts, virtual C++ objects)

### Animation Hitches

```
xcrun xctrace record --template 'Animation Hitches' --device '<UDID>' --time-limit 10s --output /tmp/hitches.trace --no-prompt --launch -- com.anonymous.expo-tailwind
```

- **Result**: `[Error] Hitches is not supported on this platform.`
- **Physical device required** — cannot profile animation hitches on simulator

### Allocations

```
xcrun xctrace record --template 'Allocations' --device '<UDID>' --time-limit 10s --output /tmp/allocations.trace --no-prompt --launch -- com.anonymous.expo-tailwind
```

- **Result**: Recorded successfully. Deferred recording mode — allocation data available in trace but not as a simple exportable table via CLI XPath.

### Combined Profiling + UI Automation

**This is the key pattern for meaningful profiling:**

1. Launch app via xcodebuild MCP (`launch_app_sim`)
2. Find host PID: `pgrep -f "expotailwind.app/expotailwind"` → 30741
3. Start profiler in background: `xcrun xctrace record --template 'Leaks' --attach '30741' --time-limit 20s --output /tmp/combined.trace --no-prompt &`
4. Do UI automation while profiler records:
   ```
   tap --label "About"
   tap --label "Product"
   gesture --preset scroll-down
   gesture --preset scroll-up
   tap --label "Pricing"
   tap --label "ACME"
   ```
5. Wait for profiler to complete
6. Analyze trace

**Result**: Successfully captured memory behavior during actual user interaction flows. This is more valuable than profiling the app in idle state.

### xctrace `--launch` Mode Limitations for Expo

- `--launch -- com.anonymous.expo-tailwind` starts the app process but does NOT pass the Metro bundler URL scheme (`expo-development-client://...`)
- The app launches, fails to fetch the JS bundle from localhost:8081 (or crashes), and returns to the home screen
- **Workaround**: Use `--attach` mode with the host PID after launching the app via xcodebuild MCP or `expo start`
- For non-Expo native apps, `--launch` mode works correctly since there's no external bundler dependency

### xctrace `--output` Flag Ordering

- All flags must come **before** `--launch -- <bundle_id>`
- Flags after `--` are passed to the launched app as arguments
- Incorrect: `xcrun xctrace record --template 'X' --launch -- bundle.id --time-limit 10s --output /tmp/out.trace`
- Correct: `xcrun xctrace record --template 'X' --time-limit 10s --output /tmp/out.trace --no-prompt --launch -- bundle.id`

### Additional Profiling Templates Worth Exploring

| Template | Purpose | Simulator Support |
|---|---|---|
| Time Profiler | CPU sampling, thread analysis, hang detection | Yes |
| Leaks | Memory leak detection via reference counting | Yes |
| Allocations | Heap growth, retain cycle detection | Yes |
| Animation Hitches | Dropped frame detection | **No — physical device only** |
| App Launch | Startup time analysis (critical for large JS bundles) | Yes |
| Network | HTTP request timing, payload sizes | Yes |
| CPU Counters | Low-level CPU performance data | Device-dependent |
| Power Profiler | Battery impact analysis | **No — physical device only** |
| Swift Concurrency | async/await profiling | Yes |
| System Trace | Context switches, thread scheduling | Yes |
| SwiftUI | SwiftUI rendering profiling (not relevant for RN) | Yes |

## HMR (Hot Module Replacement)

### Test

1. App running with Metro on port 8081
2. Edited `src/app/index.tsx`: changed `"Welcome to Project ACME"` → `"Welcome to Project ACME - HMR Test"`
3. `describe_ui` after 3s showed `"AXLabel": "Welcome to Project ACME - HMR Test"` — **change propagated without rebuild**
4. Reverted the change — HMR propagated the revert as well

### Implications

- For JS-only changes, no native rebuild needed — `expo start` + file edits is sufficient
- UI automation can verify HMR changes by polling `describe_ui` for expected `AXLabel` values
- Native code changes (Swift/ObjC, CocoaPods, new native modules) require full `expo run:ios` rebuild

## Bad State Detection

### Patterns Observed

| State | Detection Method |
|---|---|
| Red box (dev error) | `describe_ui` contains elements with `AXUniqueId`: `redbox-dismiss`, `redbox-reload`, `redbox-copy`, `redbox-extra` |
| Home screen (app crashed) | `describe_ui` shows system app labels (Fitness, Watch, Safari, etc.) with SpringBoard PID |
| App loaded correctly | `describe_ui` shows app-specific elements (ACME, About, Product, Pricing) with app PID |
| Empty/loading state | Single Application node with no children |

### Recovery Sequence

1. `screenshot` — capture evidence of the bad state
2. `stop_app_sim --bundleId "com.anonymous.expo-tailwind"` — force terminate
3. Verify Metro is running (`curl -s http://localhost:8081/status` or check background task)
4. `launch_app_sim --bundleId "com.anonymous.expo-tailwind"` — relaunch
5. `describe_ui` — verify recovery

## Deterministic Teardown

### Sequence Executed

1. `stop_app_sim --bundleId "com.anonymous.expo-tailwind"` — app terminated
2. `session-clear-defaults --all true` — session state cleared
3. Stopped Metro background task (expo start process)
4. Cleaned up `.trace` bundles from /tmp
5. Left simulator running (available for other worktrees)

### Notes

- `stop_app_sim` after xctrace `--launch` mode returns "found nothing to terminate" — xctrace already terminated the app. This is expected; handle gracefully.
- Console log capture's `stop_sim_log_cap` also terminates the app — ordering matters to avoid double-stop errors.

## Open Questions for Multi-Worktree

### Port Isolation

Each worktree needs a unique Metro port. The app's compiled bundler URL must match the running Metro port. Options:

1. **Build-time port binding**: `RCT_METRO_PORT=<port>` before `expo run:ios` — embeds the port in the native build
2. **Port registry**: Deterministic mapping of worktree name → port number (e.g., hash-based or index-based)
3. **Dynamic port detection**: Not currently supported by Expo — the port is fixed at build time

### Resource Constraints

- Each booted simulator: ~2-4GB RAM
- Each Metro bundler: ~300-500MB (node process + workers)
- Practical limit on 32GB machine: ~4 concurrent worktree validations
- Consider sequential validation across worktrees if memory is constrained
