/**
 * Library exports for claude-envoy.
 */

// Git utilities
export {
  getBranch,
  sanitizeBranch,
  isDirectModeBranch,
  getBaseBranch,
  getDiff,
  getProjectRoot,
  getPlanDir,
} from "./git.js";

// Observability
export {
  getPlanName,
  log,
  logInfo,
  logWarn,
  logError,
  logCommandStart,
  logCommandComplete,
  recordMetric,
  recordPlanCreated,
  recordPlanCompleted,
  recordPromptStarted,
  recordPromptCompleted,
  recordGateCompleted,
  recordGeminiCall,
  recordOracleCall,
  recordDiscoveryCompleted,
  recordDocumentationExtracted,
} from "./observability.js";
export type { LogLevel, LogEntry, MetricEvent } from "./observability.js";

// File watching
export { watchForDone, watchForAnyDone } from "./watcher.js";
export type { WatchResult } from "./watcher.js";

// Path utilities
export {
  ensurePlanDir,
  getPlanPaths,
  getPromptPath,
  getFindingsPath,
  getUserFeedbackPath,
  planExists,
  getPromptId,
  parsePromptId,
  getApproachId,
} from "./paths.js";

// Markdown utilities
export {
  parseMarkdownWithFrontMatter,
  writeMarkdownWithFrontMatter,
  readMarkdownFile,
  stripLogPlaceholder,
} from "./markdown.js";

// Plan file I/O
export {
  readPlan,
  writePlan,
  updatePlanStage,
  readUserInput,
  appendUserInput,
  readSummary,
  writeSummary,
} from "./plan-io.js";
export type { PlanFrontMatter } from "./plan-io.js";

// Prompt operations
export {
  createDefaultPromptFrontMatter,
  readPrompt,
  writePrompt,
  deletePrompt,
  listPrompts,
  readAllPrompts,
  updatePromptStatus,
  updatePromptVariantSolution,
} from "./prompts.js";
export type { PromptFrontMatter } from "./prompts.js";

// Findings operations
export {
  createDefaultApproach,
  readFindings,
  writeFindings,
  listFindings,
  readAllFindings,
  archiveFindings,
  updateApproachFeedback,
  setApproachRefinement,
  deleteApproach,
} from "./findings.js";
export type { FindingApproach, FindingsFile } from "./findings.js";

// Design manifest operations
export {
  getDesignManifestPath,
  readDesignManifest,
} from "./design.js";
export type { DesignEntry, DesignManifest } from "./design.js";

// Gate feedback operations
export {
  writeFindingsGateFeedback,
  readFindingsGateFeedback,
  writePlanGateFeedback,
  readPlanGateFeedback,
  writeTestingGateFeedback,
  readTestingGateFeedback,
  writeVariantsGateFeedback,
  readVariantsGateFeedback,
  writeLoggingGateFeedback,
  readLoggingGateFeedback,
  deleteFeedbackFile,
  feedbackFileExists,
  getTestingGateLogsPath,
  resetTestingGateDone,
  getLoggingGateLogsPath,
  resetLoggingGateDone,
  writeAuditQuestionsFeedback,
  readAuditQuestionsFeedback,
  writeReviewQuestionsFeedback,
  readReviewQuestionsFeedback,
  appendPlanAudit,
  appendPlanReview,
  appendPromptReview,
} from "./gates.js";
export type {
  FindingsGateFeedback,
  PlanGateFeedback,
  TestingGateFeedback,
  VariantsGateFeedback,
  LoggingGateFeedback,
  AuditQuestionsFeedback,
  ReviewQuestionsFeedback,
} from "./gates.js";

// Feedback schemas (for validation)
export {
  FindingsGateSchema,
  PlanGateSchema,
  TestingGateSchema,
  VariantsGateSchema,
  LoggingGateSchema,
  AuditQuestionsSchema,
  ReviewQuestionsSchema,
  safeParseFeedback,
} from "./feedback-schemas.js";
export type {
  TestingGateYaml,
  LoggingGateYaml,
} from "./feedback-schemas.js";

// Repomix utilities
export {
  runRepomix,
  getFileTokenCount,
  getMaxLogTokens,
  parseTokenTree,
} from "./repomix.js";
export type { TreeEntry, RepomixResult } from "./repomix.js";

// Retry utilities
export { withRetry, ORACLE_FALLBACKS, GEMINI_FALLBACKS } from "./retry.js";
export type { RetryOptions, RetryResult } from "./retry.js";

// Provider utilities
export {
  createProvider,
  getDefaultProvider,
  PROVIDER_CONFIGS,
} from "./providers.js";
export type {
  ProviderName,
  ProviderConfig,
  GenerateOptions,
  GenerateResult,
  ContentPart,
  LLMProvider,
} from "./providers.js";

// Protocol utilities (Phase 9)
export {
  getProtocolsDir,
  getProtocolPath,
  readProtocol,
  resolveProtocol,
  formatProtocol,
  listProtocols,
} from "./protocols.js";
export type {
  Protocol,
  ProtocolInput,
  ProtocolOutput,
  ResolvedStep,
  ResolvedProtocol,
} from "./protocols.js";
