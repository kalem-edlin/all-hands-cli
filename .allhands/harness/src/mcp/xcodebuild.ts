import type { McpServerConfig } from '../lib/mcp-runtime.js';

export const config: McpServerConfig = {
  name: 'xcodebuild',
  description: 'Xcode build, test, deploy, UI automation, debugging, and simulator management',
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'xcodebuildmcp@latest'],
  stateful: true,
  stateful_session_timeout: 600000, // 10 min — builds are slow
  toolHints: {
    discover_projs: 'First step — find workspace/project files in a directory.',
    list_schemes: 'List available build schemes for a project.',
    'session-set-defaults': 'Set workspace, scheme, simulator for all subsequent calls. Use workspacePath for CocoaPods projects. Do this early.',
    build_sim: 'Build for iOS simulator.',
    build_run_sim: 'Build, install, and launch on simulator in one step.',
    list_sims: 'List available simulators with UDIDs.',
    boot_sim: 'Boot a simulator by name or UDID.',
    describe_ui: 'Get view hierarchy with precise frame coordinates for all visible elements. Use before UI interactions.',
    screenshot: 'Capture simulator screenshot as PNG.',
    tap: 'Tap an element by coordinates from describe_ui.',
    type_text: 'Type text into the focused element.',
    start_sim_log_cap: 'Start capturing simulator logs. Requires bundleId.',
    stop_sim_log_cap: 'Stop log capture and retrieve logs. Requires logSessionId.',
    record_sim_video: 'Record simulator screen video.',
    clean: 'Clean build products.',
    doctor: 'Check environment health (Xcode, simulators, tools).',
  },
};
