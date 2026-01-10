/**
 * Generic retry utility with exponential backoff for external API calls.
 * Works with Gemini, Perplexity, Tavily, Grok, and any other external service.
 */

import { logWarn } from "./observability.js";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export type RetryResult<T> = {
  success: true;
  data: T;
  retries: number;
} | {
  success: false;
  error: string;
  retries: number;
  fallback_suggestion?: string;
};

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};

/**
 * Check if an error is retryable (network errors, 5xx, rate limits).
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors
    if (message.includes("network") || message.includes("econnreset") ||
        message.includes("etimedout") || message.includes("enotfound") ||
        message.includes("socket hang up") || message.includes("fetch failed")) {
      return true;
    }
    // Rate limits (429)
    if (message.includes("429") || message.includes("rate limit") ||
        message.includes("quota") || message.includes("too many requests")) {
      return true;
    }
    // Server errors (5xx)
    if (message.includes("500") || message.includes("502") ||
        message.includes("503") || message.includes("504") ||
        message.includes("internal server error") ||
        message.includes("service unavailable") ||
        message.includes("bad gateway")) {
      return true;
    }
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry and exponential backoff.
 *
 * @param fn - The async function to execute
 * @param context - Context for logging (e.g., "gemini.audit", "tavily.search")
 * @param options - Retry options
 * @param fallbackSuggestion - Optional suggestion if all retries fail
 * @returns RetryResult with either success data or error
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  options: RetryOptions = {},
  fallbackSuggestion?: string
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await fn();
      return { success: true, data: result, retries: attempt };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      // Only retry on retryable errors
      if (!isRetryableError(e) || attempt === opts.maxRetries) {
        break;
      }

      // Log retry attempt
      logWarn("api.retry", {
        context,
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay,
        error: lastError.message,
      });

      // Wait before retrying
      await sleep(delay);

      // Exponential backoff with cap
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  // All retries exhausted
  const result: RetryResult<T> = {
    success: false,
    error: lastError?.message ?? "unknown_error",
    retries: opts.maxRetries,
  };

  if (fallbackSuggestion) {
    result.fallback_suggestion = fallbackSuggestion;
  }

  return result;
}

/**
 * Pre-defined fallback suggestions for oracle endpoints (provider-agnostic).
 */
export const ORACLE_FALLBACKS: Record<string, string> = {
  audit: "Skip audit and proceed with user review only",
  review: "Mark prompt as needs_manual_review for user verification",
  ask: "Proceed without LLM response, use agent judgment",
  validate: "Skip validation and proceed with user review only",
  architect: "Proceed without architect analysis",
};

/**
 * @deprecated Use ORACLE_FALLBACKS instead
 */
export const GEMINI_FALLBACKS = ORACLE_FALLBACKS;
