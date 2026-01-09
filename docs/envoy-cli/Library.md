---
description: Reference documentation for envoy library utilities exported from lib/index.ts. Covers git helpers, observability, file I/O, path utilities, and specialized subsystems.
---

# Library Reference

## Overview

The `lib/` directory contains shared utilities used by commands. All exports are re-exported from `lib/index.ts`.

## Git Utilities

**Module:** `lib/git.ts`

```typescript
// Get current branch name
getBranch(): string

// Sanitize branch for directory names (feat/auth -> feat-auth)
sanitizeBranch(branch: string): string

// Check if branch skips planning (main, quick/*, curator/*)
isDirectModeBranch(branch: string): boolean

// Auto-detect base branch using merge-base
getBaseBranch(): string

// Get git diff against reference
getDiff(ref: string): string

// Get project root (where .git is)
getProjectRoot(): string

// Get plan directory for current branch
getPlanDir(cwd?: string): string
```

## Observability

**Module:** `lib/observability.ts`

Dual logging system: `envoy.log` (detailed traces) and `metrics.jsonl` (analytics).

```typescript
// Derive plan name from branch
getPlanName(branch?: string | null): string | undefined

// General logging
log(entry: LogEntry): void
logInfo(command: string, context?, args?): void
logWarn(command: string, context?, args?): void
logError(command: string, context?, args?): void

// Command lifecycle
logCommandStart(command: string, args?): void
logCommandComplete(command: string, result: "success"|"error", duration_ms: number, context?): void

// Metrics recording
recordMetric(event: MetricEvent): void
recordPlanCreated(data): void
recordPlanCompleted(data): void
recordPromptStarted(data): void
recordPromptCompleted(data): void
recordGateCompleted(data): void
recordGeminiCall(data): void
recordDiscoveryCompleted(data): void
recordDocumentationExtracted(data): void
```

## Path Utilities

**Module:** `lib/paths.ts`

```typescript
// Initialize plan directory structure
ensurePlanDir(): void

// Get all plan-related paths
getPlanPaths(): {
  root: string;
  plan: string;
  userInput: string;
  summary: string;
  curator: string;
  prompts: string;
  findings: string;
  archivedFindings: string;
  design: string;
  feedback: string;
}

// Get prompt file path
getPromptPath(number: number, variant: string | null): string

// Get findings file path
getFindingsPath(specialistName: string): string

// Get feedback file path
getUserFeedbackPath(feedbackType: string): string

// Check if plan exists
planExists(): boolean

// Format prompt ID (e.g., 2 + "A" -> "2_A")
getPromptId(number: number, variant: string | null): string

// Parse prompt ID (e.g., "2_A" -> { number: 2, variant: "A" })
parsePromptId(id: string): { number: number; variant: string | null }

// Format approach ID
getApproachId(number: number, variant: string | null): string
```

## Markdown Utilities

**Module:** `lib/markdown.ts`

```typescript
// Parse markdown with YAML front-matter
parseMarkdownWithFrontMatter<T>(content: string): {
  frontMatter: T;
  content: string;
}

// Write markdown with front-matter
writeMarkdownWithFrontMatter(frontMatter: Record<string, unknown>, content: string): string

// Read and parse markdown file
readMarkdownFile<T>(filePath: string): { frontMatter: T; content: string } | null

// Strip log placeholder from content
stripLogPlaceholder(content: string): string
```

## Plan I/O

**Module:** `lib/plan-io.ts`

```typescript
interface PlanFrontMatter {
  stage: "draft" | "in_progress" | "completed";
  branch_name?: string;
}

// Read plan.md
readPlan(): { frontMatter: PlanFrontMatter; content: string } | null

// Write plan.md
writePlan(frontMatter: Partial<PlanFrontMatter>, content: string): void

// Update plan stage
updatePlanStage(stage: PlanFrontMatter["stage"]): void

// Read user_input.md
readUserInput(): string | null

// Append to user_input.md
appendUserInput(content: string): void

// Read summary.md
readSummary(): string | null

// Write summary.md
writeSummary(content: string): void
```

## Prompt Operations

**Module:** `lib/prompts.ts`

```typescript
interface PromptFrontMatter {
  number: number;
  variant: string | null;
  description: string;
  success_criteria: string;
  depends_on: number[];
  kind: "feature" | "debug";
  relevant_files: string[];
  status: "pending" | "implemented" | "reviewed" | "tested" | "merged";
  in_progress: boolean;
  requires_manual_testing: boolean;
  delegated_to: string | null;
  worktree_branch_name: string | null;
  current_iteration: number;
  planned_at: string;
  documentation_extracted?: boolean;
  merge_commit_hash?: string;
  variant_solution?: "accept" | "discard" | "feature-flag" | null;
  walkthrough: Array<{
    iteration: number;
    type: "initial" | "review-refinement";
    refinement_reason: string | null;
    approach: string;
    changes: string[];
    decisions: string[];
  }>;
}

// Create default front-matter
createDefaultPromptFrontMatter(number: number, variant?: string): PromptFrontMatter

// Read prompt
readPrompt(number: number, variant: string | null): { frontMatter: PromptFrontMatter; content: string } | null

// Write prompt
writePrompt(number: number, variant: string | null, frontMatter: Partial<PromptFrontMatter>, content: string): void

// Delete prompt
deletePrompt(number: number, variant: string | null): boolean

// List prompts (metadata only)
listPrompts(): Array<{ number: number; variant: string | null }>

// Read all prompts with content
readAllPrompts(): Array<{ number: number; variant: string | null; frontMatter: PromptFrontMatter; content: string }>

// Update status
updatePromptStatus(number: number, variant: string | null, status: PromptFrontMatter["status"]): void

// Update variant solution
updatePromptVariantSolution(number: number, variant: string, solution: PromptFrontMatter["variant_solution"]): void
```

## Findings Operations

**Module:** `lib/findings.ts`

```typescript
interface FindingApproach {
  number: number;
  variant: string | null;
  description: string;
  relevant_files: string[];
  required_clarifying_questions: Array<{ question: string }>;
  user_addressed_questions?: Array<{ question: string; answer: string }>;
  user_requested_changes: string;
  approach_detail: string;
}

interface FindingsFile {
  specialist_name: string;
  notes: string;
  approaches: FindingApproach[];
}

// CRUD operations
readFindings(specialistName: string): FindingsFile | null
writeFindings(specialistName: string, findings: FindingsFile): void
listFindings(): string[]
readAllFindings(): FindingsFile[]

// Archive findings (after plan approval)
archiveFindings(): { archived: string[]; error?: string }

// Update approach with user feedback
updateApproachFeedback(
  specialist: string,
  number: number,
  variant: string | null,
  feedback: {
    userRequestedChanges?: string;
    questionAnswers?: Array<{ question: string; answer: string }>;
  }
): void

// Delete approach
deleteApproach(specialist: string, number: number, variant: string | null): boolean
```

## Gate Operations

**Module:** `lib/gates.ts`

```typescript
// Findings gate
writeFindingsGateFeedback(approachFeedback: Record<string, unknown>): string
readFindingsGateFeedback(): { success: boolean; data?: FindingsGateFeedback; error?: string }

// Plan gate
writePlanGateFeedback(promptIds: string[]): string
readPlanGateFeedback(): { success: boolean; data?: PlanGateFeedback; error?: string }

// Testing gate
writeTestingGateFeedback(promptNum: number, variant: string | null): { yamlPath: string; logsPath: string }
readTestingGateFeedback(promptNum: number, variant: string | null): { success: boolean; data?: TestingGateFeedback; error?: string }
resetTestingGateDone(promptNum: number, variant: string | null): void
getTestingGateLogsPath(promptNum: number, variant: string | null): string

// Variants gate
writeVariantsGateFeedback(promptNum: number, variants: string[]): string
readVariantsGateFeedback(promptNum: number): { success: boolean; data?: VariantsGateFeedback; error?: string }

// Logging gate (debug prompts)
writeLoggingGateFeedback(promptNum: number, variant: string | null): { yamlPath: string; logsPath: string }
readLoggingGateFeedback(promptNum: number, variant: string | null): { success: boolean; data?: LoggingGateFeedback; error?: string }

// Audit/review questions (Gemini)
writeAuditQuestionsFeedback(questions: string[]): string
readAuditQuestionsFeedback(): { success: boolean; data?: AuditQuestionsFeedback; error?: string }
writeReviewQuestionsFeedback(promptId: string, questions: string[]): string
readReviewQuestionsFeedback(promptId: string): { success: boolean; data?: ReviewQuestionsFeedback; error?: string }

// Audit trail
appendPlanAudit(entry: { review_context: string; decision: string; total_questions: number; were_changes_suggested: boolean }): void
appendPlanReview(entry: { review_context: string; decision: string; total_questions: number; were_changes_suggested: boolean }): void
appendPromptReview(promptNum: number, variant: string | null, entry: {...}): void

// Utilities
deleteFeedbackFile(feedbackId: string): void
feedbackFileExists(feedbackId: string): boolean
```

## File Watcher

**Module:** `lib/watcher.ts`

```typescript
interface WatchResult {
  done: boolean;
  timed_out: boolean;
  duration_ms: number;
}

// Watch single file for done: true
watchForDone(filePath: string, timeoutMs: number): Promise<WatchResult>

// Watch multiple files, return when any is done
watchForAnyDone(filePaths: string[], timeoutMs: number): Promise<{ index: number; result: WatchResult }>
```

## Retry Utilities

**Module:** `lib/retry.ts`

```typescript
interface RetryOptions {
  maxRetries?: number;      // default: 3
  initialDelayMs?: number;  // default: 1000
  maxDelayMs?: number;      // default: 8000
  backoffMultiplier?: number; // default: 2
}

type RetryResult<T> =
  | { success: true; data: T; retries: number }
  | { success: false; error: string; retries: number; fallback_suggestion?: string }

// Execute with exponential backoff retry
withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  options?: RetryOptions,
  fallbackSuggestion?: string
): Promise<RetryResult<T>>

// Pre-defined Gemini fallbacks
GEMINI_FALLBACKS: Record<string, string>
```

## Repomix Utilities

**Module:** `lib/repomix.ts`

```typescript
interface RepomixResult {
  success: boolean;
  output: string;
  tokenCount: number;
  tree?: string;
}

// Run repomix for paths
runRepomix(paths: string[], estimateOnly: boolean): RepomixResult

// Get token count for file
getFileTokenCount(filePath: string): { success: boolean; tokenCount: number }

// Get max log tokens (env-configurable)
getMaxLogTokens(): number
```

## Knowledge Service

**Module:** `lib/knowledge.ts`

See [Knowledge Search](./Knowledge.md) for detailed documentation.

## Protocol Utilities

**Module:** `lib/protocols.ts`

```typescript
interface Protocol {
  name: string;
  description: string;
  extends?: string;
  inputs: ProtocolInput[];
  outputs: ProtocolOutput[];
  steps: string[];
}

interface ResolvedProtocol extends Protocol {
  steps: ResolvedStep[];
}

// Read raw protocol YAML
readProtocol(name: string): Protocol | null

// Resolve with inheritance
resolveProtocol(name: string): ResolvedProtocol | null

// Format for agent consumption
formatProtocol(protocol: ResolvedProtocol): string

// List available protocols
listProtocols(): string[]
```

## Tree-Sitter Utilities

**Module:** `lib/tree-sitter-utils.ts`

```typescript
interface SymbolLocation {
  name: string;
  startLine: number;
  endLine: number;
  type: string;
}

// Parse file and extract symbols
parseFile(filePath: string): Promise<ParseResult>

// Find specific symbol
findSymbol(filePath: string, symbolName: string): Promise<SymbolLocation | null>

// Check symbol exists
symbolExists(filePath: string, symbolName: string): Promise<boolean>

// Get complexity metrics
getFileComplexity(filePath: string): Promise<{
  lines: number;
  imports: number;
  exports: number;
  functions: number;
  classes: number;
} | null>
```

Supported languages: TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, Swift.
