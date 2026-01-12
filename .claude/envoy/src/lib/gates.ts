/**
 * User feedback gate operations (blocking gates).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { ensurePlanDir, getPlanPaths, getUserFeedbackPath, getPromptId } from "./paths.js";
import { readMarkdownFile, writeMarkdownWithFrontMatter, stripLogPlaceholder } from "./markdown.js";
import { logInfo } from "./observability.js";
import { sendGateNotification } from "./notification.js";
import {
  FindingsGateSchema,
  PlanGateSchema,
  TestingGateSchema,
  VariantsGateSchema,
  LoggingGateSchema,
  AuditQuestionsSchema,
  ReviewQuestionsSchema,
  safeParseFeedback,
  type FindingsGateFeedback,
  type PlanGateFeedback,
  type TestingGateFeedback,
  type VariantsGateFeedback,
  type LoggingGateFeedback,
  type AuditQuestionsFeedback,
  type ReviewQuestionsFeedback,
} from "./feedback-schemas.js";
import { readPlan, type PlanFrontMatter } from "./plan-io.js";
import { readPrompt, writePrompt, type PromptFrontMatter } from "./prompts.js";

// Re-export feedback types for convenience
export type {
  FindingsGateFeedback,
  PlanGateFeedback,
  TestingGateFeedback,
  VariantsGateFeedback,
  LoggingGateFeedback,
  AuditQuestionsFeedback,
  ReviewQuestionsFeedback,
};

/**
 * Write a findings gate feedback file.
 */
export function writeFindingsGateFeedback(
  approachFeedback: Record<string, { user_required_changes: string; rejected?: boolean; question_answers?: Array<{ question: string; answer: string }> }>
): string {
  const paths = getPlanPaths();
  ensurePlanDir();

  // Ensure user_feedback directory exists
  if (!existsSync(paths.userFeedback)) {
    mkdirSync(paths.userFeedback, { recursive: true });
  }

  const filePath = getUserFeedbackPath("findings_gate");
  const content: FindingsGateFeedback = {
    done: false,
    thoughts: "",
    approach_feedback: approachFeedback,
  };

  const yaml = stringifyYaml(content, { lineWidth: 0 });
  writeFileSync(filePath, yaml, "utf-8");
  logInfo("feedback.write", { type: "findings_gate", path: filePath });
  sendGateNotification("Findings", "Findings ready for review");
  return filePath;
}

/**
 * Read and validate findings gate feedback file.
 */
export function readFindingsGateFeedback(): { success: true; data: FindingsGateFeedback } | { success: false; error: string } {
  const filePath = getUserFeedbackPath("findings_gate");
  if (!existsSync(filePath)) {
    return { success: false, error: "Feedback file not found" };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(content);
    return safeParseFeedback(FindingsGateSchema, parsed);
  } catch (e) {
    return { success: false, error: `Failed to parse YAML: ${e}` };
  }
}

/**
 * Write a plan gate feedback file.
 */
export function writePlanGateFeedback(
  promptIds: string[]
): string {
  const paths = getPlanPaths();
  ensurePlanDir();

  if (!existsSync(paths.userFeedback)) {
    mkdirSync(paths.userFeedback, { recursive: true });
  }

  const filePath = getUserFeedbackPath("plan_gate");
  const promptFeedback: Record<string, { user_required_changes: string }> = {};
  for (const id of promptIds) {
    promptFeedback[id] = { user_required_changes: "" };
  }

  const content: PlanGateFeedback = {
    done: false,
    thoughts: "",
    user_required_plan_changes: "",
    prompt_feedback: promptFeedback,
  };

  const yaml = stringifyYaml(content, { lineWidth: 0 });
  writeFileSync(filePath, yaml, "utf-8");
  logInfo("feedback.write", { type: "plan_gate", path: filePath });
  sendGateNotification("Plan", "Plan ready for review");
  return filePath;
}

/**
 * Read and validate plan gate feedback file.
 */
export function readPlanGateFeedback(): { success: true; data: PlanGateFeedback } | { success: false; error: string } {
  const filePath = getUserFeedbackPath("plan_gate");
  if (!existsSync(filePath)) {
    return { success: false, error: "Feedback file not found" };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(content);
    return safeParseFeedback(PlanGateSchema, parsed);
  } catch (e) {
    return { success: false, error: `Failed to parse YAML: ${e}` };
  }
}

/**
 * Write a testing gate feedback file.
 */
export function writeTestingGateFeedback(
  promptNum: number,
  variant: string | null
): { yamlPath: string; logsPath: string } {
  const paths = getPlanPaths();
  ensurePlanDir();

  if (!existsSync(paths.userFeedback)) {
    mkdirSync(paths.userFeedback, { recursive: true });
  }

  const id = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  const yamlPath = getUserFeedbackPath(`${id}_testing`);
  const logsPath = getUserFeedbackPath(`${id}_testing_logs`, ".md");

  // YAML file (no logs field - logs go in sibling file)
  const content = {
    done: false,
    thoughts: "",
    test_passed: true, // Default true for minimal friction
    user_required_changes: "",
  };

  const yaml = stringifyYaml(content, { lineWidth: 0 });
  writeFileSync(yamlPath, yaml, "utf-8");

  // Sibling log file
  writeFileSync(logsPath, "<!-- Paste test logs here -->\n", "utf-8");

  logInfo("feedback.write", { type: "testing_gate", yamlPath, logsPath, promptNum, variant });
  sendGateNotification("Testing", `Testing gate ready for prompt ${getPromptId(promptNum, variant)}`);
  return { yamlPath, logsPath };
}

/**
 * Read and validate testing gate feedback file + sibling logs.
 */
export function readTestingGateFeedback(
  promptNum: number,
  variant: string | null
): { success: true; data: TestingGateFeedback } | { success: false; error: string } {
  const id = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  const yamlPath = getUserFeedbackPath(`${id}_testing`);
  const logsPath = getUserFeedbackPath(`${id}_testing_logs`, ".md");

  if (!existsSync(yamlPath)) {
    return { success: false, error: "Feedback file not found" };
  }

  try {
    const content = readFileSync(yamlPath, "utf-8");
    const parsed = parseYaml(content);
    const result = safeParseFeedback(TestingGateSchema, parsed);

    if (!result.success) {
      return result;
    }

    // Read sibling log file, stripping placeholder if no real content
    let logs = "";
    if (existsSync(logsPath)) {
      logs = stripLogPlaceholder(readFileSync(logsPath, "utf-8"));
    }

    return { success: true, data: { ...result.data, logs } };
  } catch (e) {
    return { success: false, error: `Failed to parse YAML: ${e}` };
  }
}

/**
 * Get testing gate log file path.
 */
export function getTestingGateLogsPath(promptNum: number, variant: string | null): string {
  const id = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  return getUserFeedbackPath(`${id}_testing_logs`, ".md");
}

/**
 * Reset testing gate done flag to false (for retry after token limit exceeded).
 */
export function resetTestingGateDone(promptNum: number, variant: string | null): void {
  const id = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  const yamlPath = getUserFeedbackPath(`${id}_testing`);

  if (!existsSync(yamlPath)) return;

  const content = readFileSync(yamlPath, "utf-8");
  const parsed = parseYaml(content) as Record<string, unknown>;
  parsed.done = false;

  const yaml = stringifyYaml(parsed, { lineWidth: 0 });
  writeFileSync(yamlPath, yaml, "utf-8");
}

/**
 * Write a variants gate feedback file.
 * Only creates if doesn't exist (first variant to call creates it).
 */
export function writeVariantsGateFeedback(
  promptNum: number,
  variantLetters: string[]
): string {
  const paths = getPlanPaths();
  ensurePlanDir();

  if (!existsSync(paths.userFeedback)) {
    mkdirSync(paths.userFeedback, { recursive: true });
  }

  const filePath = getUserFeedbackPath(`${promptNum}_variants`);

  // Only create if doesn't exist
  if (existsSync(filePath)) {
    logInfo("feedback.exists", { type: "variants_gate", path: filePath });
    return filePath;
  }

  const variants: Record<string, { decision: null; reason: string }> = {};
  for (const letter of variantLetters) {
    variants[letter] = { decision: null, reason: "" };
  }

  const content: VariantsGateFeedback = {
    done: false,
    thoughts: "",
    variants,
  };

  const yaml = stringifyYaml(content, { lineWidth: 0 });
  writeFileSync(filePath, yaml, "utf-8");
  logInfo("feedback.write", { type: "variants_gate", path: filePath, promptNum, variants: variantLetters });
  sendGateNotification("Variants", `Variant selection ready for prompt ${promptNum}`);
  return filePath;
}

/**
 * Read and validate variants gate feedback file.
 */
export function readVariantsGateFeedback(
  promptNum: number
): { success: true; data: VariantsGateFeedback } | { success: false; error: string } {
  const filePath = getUserFeedbackPath(`${promptNum}_variants`);
  if (!existsSync(filePath)) {
    return { success: false, error: "Feedback file not found" };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(content);
    return safeParseFeedback(VariantsGateSchema, parsed);
  } catch (e) {
    return { success: false, error: `Failed to parse YAML: ${e}` };
  }
}

/**
 * Write a logging gate feedback file.
 */
export function writeLoggingGateFeedback(
  promptNum: number,
  variant: string | null
): { yamlPath: string; logsPath: string } {
  const paths = getPlanPaths();
  ensurePlanDir();

  if (!existsSync(paths.userFeedback)) {
    mkdirSync(paths.userFeedback, { recursive: true });
  }

  const id = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  const yamlPath = getUserFeedbackPath(`${id}_logging`);
  const logsPath = getUserFeedbackPath(`${id}_logging_logs`, ".md");

  // YAML file (no logs field - logs go in sibling file)
  const content = {
    done: false,
    thoughts: "",
  };

  const yaml = stringifyYaml(content, { lineWidth: 0 });
  writeFileSync(yamlPath, yaml, "utf-8");

  // Sibling log file
  writeFileSync(logsPath, "<!-- Paste debug logs here -->\n", "utf-8");

  logInfo("feedback.write", { type: "logging_gate", yamlPath, logsPath, promptNum, variant });
  const logPromptId = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  sendGateNotification("Logging", `Debug logging gate ready for prompt ${logPromptId}`);
  return { yamlPath, logsPath };
}

/**
 * Read and validate logging gate feedback file + sibling logs.
 */
export function readLoggingGateFeedback(
  promptNum: number,
  variant: string | null
): { success: true; data: LoggingGateFeedback } | { success: false; error: string } {
  const id = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  const yamlPath = getUserFeedbackPath(`${id}_logging`);
  const logsPath = getUserFeedbackPath(`${id}_logging_logs`, ".md");

  if (!existsSync(yamlPath)) {
    return { success: false, error: "Feedback file not found" };
  }

  try {
    const content = readFileSync(yamlPath, "utf-8");
    const parsed = parseYaml(content);
    const result = safeParseFeedback(LoggingGateSchema, parsed);

    if (!result.success) {
      return result;
    }

    // Read sibling log file, stripping placeholder if no real content
    let logs = "";
    if (existsSync(logsPath)) {
      logs = stripLogPlaceholder(readFileSync(logsPath, "utf-8"));
    }

    return { success: true, data: { ...result.data, logs } };
  } catch (e) {
    return { success: false, error: `Failed to parse YAML: ${e}` };
  }
}

/**
 * Get logging gate log file path.
 */
export function getLoggingGateLogsPath(promptNum: number, variant: string | null): string {
  const id = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  return getUserFeedbackPath(`${id}_logging_logs`, ".md");
}

/**
 * Reset logging gate done flag to false (for retry after token limit exceeded).
 */
export function resetLoggingGateDone(promptNum: number, variant: string | null): void {
  const id = variant ? `${promptNum}_${variant}` : `${promptNum}`;
  const yamlPath = getUserFeedbackPath(`${id}_logging`);

  if (!existsSync(yamlPath)) return;

  const content = readFileSync(yamlPath, "utf-8");
  const parsed = parseYaml(content) as Record<string, unknown>;
  parsed.done = false;

  const yaml = stringifyYaml(parsed, { lineWidth: 0 });
  writeFileSync(yamlPath, yaml, "utf-8");
}

/**
 * Delete a feedback file and its sibling log file if exists.
 */
export function deleteFeedbackFile(id: string): boolean {
  const yamlPath = getUserFeedbackPath(id);
  const logsPath = getUserFeedbackPath(`${id}_logs`, ".md");

  let deleted = false;

  if (existsSync(yamlPath)) {
    unlinkSync(yamlPath);
    logInfo("feedback.delete", { path: yamlPath });
    deleted = true;
  }

  // Also delete sibling log file if exists
  if (existsSync(logsPath)) {
    unlinkSync(logsPath);
    logInfo("feedback.delete", { path: logsPath });
  }

  return deleted;
}

/**
 * Check if a feedback file exists.
 */
export function feedbackFileExists(id: string): boolean {
  return existsSync(getUserFeedbackPath(id));
}

// ============================================================================
// Gemini Audit/Review Feedback Operations
// ============================================================================

/**
 * Write an audit questions feedback file.
 * Created when Gemini audit needs clarifying questions answered.
 */
export function writeAuditQuestionsFeedback(
  questions: string[]
): string {
  const paths = getPlanPaths();
  ensurePlanDir();

  if (!existsSync(paths.userFeedback)) {
    mkdirSync(paths.userFeedback, { recursive: true });
  }

  const filePath = getUserFeedbackPath("audit_questions");
  const content: AuditQuestionsFeedback = {
    done: false,
    thoughts: "",
    questions: questions.map((q) => ({ question: q, answer: "" })),
  };

  const yaml = stringifyYaml(content, { lineWidth: 0 });
  writeFileSync(filePath, yaml, "utf-8");
  logInfo("feedback.write", { type: "audit_questions", path: filePath, questionCount: questions.length });
  sendGateNotification("Audit", `${questions.length} audit questions need answers`);
  return filePath;
}

/**
 * Read and validate audit questions feedback file.
 */
export function readAuditQuestionsFeedback(): { success: true; data: AuditQuestionsFeedback } | { success: false; error: string } {
  const filePath = getUserFeedbackPath("audit_questions");
  if (!existsSync(filePath)) {
    return { success: false, error: "Feedback file not found" };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(content);
    return safeParseFeedback(AuditQuestionsSchema, parsed);
  } catch (e) {
    return { success: false, error: `Failed to parse YAML: ${e}` };
  }
}

/**
 * Write a review questions feedback file.
 * Created when Gemini review needs clarifying questions answered.
 *
 * @param promptId - Prompt ID (e.g., "1", "2_A") or "full" for full plan review
 * @param questions - Array of clarifying questions
 */
export function writeReviewQuestionsFeedback(
  promptId: string,
  questions: string[]
): string {
  const paths = getPlanPaths();
  ensurePlanDir();

  if (!existsSync(paths.userFeedback)) {
    mkdirSync(paths.userFeedback, { recursive: true });
  }

  const fileId = promptId === "full" ? "full_review_questions" : `${promptId}_review_questions`;
  const filePath = getUserFeedbackPath(fileId);
  const content: ReviewQuestionsFeedback = {
    done: false,
    thoughts: "",
    questions: questions.map((q) => ({ question: q, answer: "" })),
    suggested_changes: "",
  };

  const yaml = stringifyYaml(content, { lineWidth: 0 });
  writeFileSync(filePath, yaml, "utf-8");
  logInfo("feedback.write", { type: "review_questions", path: filePath, promptId, questionCount: questions.length });
  sendGateNotification("Review", `${questions.length} review questions for ${promptId}`);
  return filePath;
}

/**
 * Read and validate review questions feedback file.
 *
 * @param promptId - Prompt ID (e.g., "1", "2_A") or "full" for full plan review
 */
export function readReviewQuestionsFeedback(
  promptId: string
): { success: true; data: ReviewQuestionsFeedback } | { success: false; error: string } {
  const fileId = promptId === "full" ? "full_review_questions" : `${promptId}_review_questions`;
  const filePath = getUserFeedbackPath(fileId);
  if (!existsSync(filePath)) {
    return { success: false, error: "Feedback file not found" };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(content);
    return safeParseFeedback(ReviewQuestionsSchema, parsed);
  } catch (e) {
    return { success: false, error: `Failed to parse YAML: ${e}` };
  }
}

/**
 * Append an audit entry to plan.md front matter.
 */
export function appendPlanAudit(audit: PlanFrontMatter["audits"][0]): boolean {
  const plan = readPlan();
  if (!plan) return false;

  const audits = plan.frontMatter.audits ?? [];
  audits.push(audit);

  const updatedFrontMatter = { ...plan.frontMatter, audits };
  const paths = getPlanPaths();
  writeMarkdownWithFrontMatter(paths.plan, updatedFrontMatter, plan.content);
  logInfo("plan.append_audit", { decision: audit.decision, totalQuestions: audit.total_questions });
  return true;
}

/**
 * Append a review entry to plan.md front matter (for full reviews).
 */
export function appendPlanReview(review: PlanFrontMatter["reviews"][0]): boolean {
  const plan = readPlan();
  if (!plan) return false;

  const reviews = plan.frontMatter.reviews ?? [];
  reviews.push(review);

  const updatedFrontMatter = { ...plan.frontMatter, reviews };
  const paths = getPlanPaths();
  writeMarkdownWithFrontMatter(paths.plan, updatedFrontMatter, plan.content);
  logInfo("plan.append_review", { decision: review.decision, totalQuestions: review.total_questions });
  return true;
}

/**
 * Append a review entry to a prompt file's front matter.
 */
export function appendPromptReview(
  number: number,
  variant: string | null,
  review: PromptFrontMatter["reviews"][0]
): boolean {
  const prompt = readPrompt(number, variant);
  if (!prompt) return false;

  const reviews = prompt.frontMatter.reviews ?? [];
  reviews.push(review);

  const updatedFrontMatter: PromptFrontMatter = { ...prompt.frontMatter, reviews };
  writePrompt(number, variant, updatedFrontMatter, prompt.content);
  const promptId = getPromptId(number, variant);
  logInfo("prompt.append_review", { promptId, decision: review.decision, totalQuestions: review.total_questions });
  return true;
}
