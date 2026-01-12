/**
 * Plan commands barrel export.
 */

// Core commands
export { InitCommand, StatusCommand, CheckCommand, CleanupOrphanedCommand } from "./core.js";

// Plan file commands
export { WritePlanCommand, GetFullPlanCommand, AppendUserInputCommand } from "./plan-file.js";

// Prompt commands
export {
  WritePromptCommand,
  ClearPromptCommand,
  ReadPromptCommand,
  ValidateDependenciesCommand,
  UpdatePromptDependenciesCommand,
} from "./prompts.js";

// Findings commands
export {
  WriteFindingCommand,
  WriteApproachCommand,
  GetFindingApproachCommand,
  ClearApproachCommand,
  GetFindingsCommand,
  ReadDesignManifestCommand,
} from "./findings.js";

// Lifecycle commands
export {
  NextCommand,
  StartPromptCommand,
  RecordImplementationCommand,
  CompletePromptCommand,
  GetPromptWalkthroughCommand,
  MarkPromptExtractedCommand,
  GetAllWalkthroughsCommand,
  MarkAllDocumentedCommand,
  ReleaseAllPromptsCommand,
  CompleteCommand,
} from "./lifecycle.js";

// Gate commands
export {
  getBlockingGateTimeout,
  BlockFindingsGateCommand,
  BlockPlanGateCommand,
  BlockPromptTestingGateCommand,
  BlockPromptVariantsGateCommand,
  BlockDebuggingLoggingGateCommand,
} from "./gates.js";

// Protocol commands
export { ProtocolCommand, CleanupDebugLogsCommand } from "./protocols.js";

// Import all command classes for COMMANDS object
import { InitCommand, StatusCommand, CheckCommand, CleanupOrphanedCommand } from "./core.js";
import { WritePlanCommand, GetFullPlanCommand, AppendUserInputCommand } from "./plan-file.js";
import {
  WritePromptCommand,
  ClearPromptCommand,
  ReadPromptCommand,
  ValidateDependenciesCommand,
  UpdatePromptDependenciesCommand,
} from "./prompts.js";
import {
  WriteFindingCommand,
  WriteApproachCommand,
  GetFindingApproachCommand,
  ClearApproachCommand,
  GetFindingsCommand,
  ReadDesignManifestCommand,
} from "./findings.js";
import {
  NextCommand,
  StartPromptCommand,
  RecordImplementationCommand,
  CompletePromptCommand,
  GetPromptWalkthroughCommand,
  MarkPromptExtractedCommand,
  GetAllWalkthroughsCommand,
  MarkAllDocumentedCommand,
  ReleaseAllPromptsCommand,
  CompleteCommand,
} from "./lifecycle.js";
import {
  BlockFindingsGateCommand,
  BlockPlanGateCommand,
  BlockPromptTestingGateCommand,
  BlockPromptVariantsGateCommand,
  BlockDebuggingLoggingGateCommand,
} from "./gates.js";
import { ProtocolCommand, CleanupDebugLogsCommand } from "./protocols.js";

/**
 * All plan subcommands mapped by name.
 */
export const COMMANDS = {
  // Core
  init: InitCommand,
  status: StatusCommand,
  check: CheckCommand,
  "cleanup-orphaned": CleanupOrphanedCommand,
  // Plan file
  "write-plan": WritePlanCommand,
  "get-full-plan": GetFullPlanCommand,
  "append-user-input": AppendUserInputCommand,
  // Prompts
  "write-prompt": WritePromptCommand,
  "clear-prompt": ClearPromptCommand,
  "read-prompt": ReadPromptCommand,
  "validate-dependencies": ValidateDependenciesCommand,
  "update-prompt-dependencies": UpdatePromptDependenciesCommand,
  // Findings
  "write-finding": WriteFindingCommand,
  "write-approach": WriteApproachCommand,
  "get-finding-approach": GetFindingApproachCommand,
  "clear-approach": ClearApproachCommand,
  "get-findings": GetFindingsCommand,
  "read-design-manifest": ReadDesignManifestCommand,
  // Lifecycle
  next: NextCommand,
  "start-prompt": StartPromptCommand,
  "record-implementation": RecordImplementationCommand,
  "complete-prompt": CompletePromptCommand,
  "get-prompt-walkthrough": GetPromptWalkthroughCommand,
  "mark-prompt-extracted": MarkPromptExtractedCommand,
  "get-all-walkthroughs": GetAllWalkthroughsCommand,
  "mark-all-documented": MarkAllDocumentedCommand,
  "release-all-prompts": ReleaseAllPromptsCommand,
  complete: CompleteCommand,
  // Gates
  "block-findings-gate": BlockFindingsGateCommand,
  "block-plan-gate": BlockPlanGateCommand,
  "block-prompt-testing-gate": BlockPromptTestingGateCommand,
  "block-prompt-variants-gate": BlockPromptVariantsGateCommand,
  "block-debugging-logging-gate": BlockDebuggingLoggingGateCommand,
  // Protocols
  protocol: ProtocolCommand,
  "cleanup-debug-logs": CleanupDebugLogsCommand,
};
