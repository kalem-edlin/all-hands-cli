/**
 * LLM - Multi-Provider Large Language Model Integration
 *
 * Generic LLM calling infrastructure supporting multiple providers.
 * This is the foundation layer - provider configs and raw inference.
 *
 * Supported Providers:
 * - Gemini (Google) - GEMINI_API_KEY (uses @google/genai SDK)
 * - OpenAI (GPT) - OPENAI_API_KEY
 */

import { existsSync, readFileSync } from 'fs';
import { GoogleGenAI } from '@google/genai';
import { loadProjectSettings } from '../hooks/shared.js';

// ============================================================================
// Types
// ============================================================================

export type ProviderName = 'gemini' | 'openai';

export interface ProviderConfig {
  name: ProviderName;
  apiKeyEnvVar: string;
  defaultModel: string;
}

export interface LLMResult {
  text: string;
  model: string;
  provider: ProviderName;
  durationMs: number;
}

export interface AskOptions {
  provider?: ProviderName;
  model?: string;
  files?: string[];
  context?: string;
  timeout?: number;
}

// ============================================================================
// Configuration
// ============================================================================

export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  gemini: {
    name: 'gemini',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    defaultModel: 'gemini-3-pro-preview',
  },
  openai: {
    name: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-5.2',
  },
};

const DEFAULT_TIMEOUT = 120000;

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the default provider from settings or fallback
 */
export function getDefaultProvider(): ProviderName {
  const settings = loadProjectSettings();
  const provider = settings?.oracle?.defaultProvider;
  if (provider === 'openai' || provider === 'gemini') {
    return provider;
  }
  return 'gemini';
}

/**
 * Get the compaction provider from settings or fallback to gemini.
 * Compaction uses gemini by default due to its large context window (1M+ tokens).
 */
export function getCompactionProvider(): ProviderName {
  const settings = loadProjectSettings();
  const provider = settings?.oracle?.compactionProvider;
  if (provider === 'openai' || provider === 'gemini') {
    return provider;
  }
  return 'gemini'; // Default to gemini for large context handling
}

/**
 * Generic LLM inference
 *
 * @param query - The prompt/question to send
 * @param options - Provider, model, file context, etc.
 * @returns LLM response with metadata
 */
export async function ask(query: string, options: AskOptions = {}): Promise<LLMResult> {
  const providerName = options.provider ?? getDefaultProvider();
  const provider = PROVIDERS[providerName];

  if (!provider) {
    throw new Error(`Invalid provider: ${providerName}. Use: gemini, openai`);
  }

  const apiKey = process.env[provider.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(`${provider.apiKeyEnvVar} not set in environment`);
  }

  // Build prompt with context
  const parts: string[] = [];

  if (options.context) {
    parts.push(options.context);
  }

  if (options.files && options.files.length > 0) {
    const fileContents = readFiles(options.files);
    if (Object.keys(fileContents).length > 0) {
      const fileContext = Object.entries(fileContents)
        .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');
      parts.push(fileContext);
    }
  }

  parts.push(query);
  const prompt = parts.join('\n\n');

  const model = options.model ?? provider.defaultModel;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const start = performance.now();
  const result = await callProvider(providerName, apiKey, prompt, model, timeout);
  const durationMs = Math.round(performance.now() - start);

  return {
    text: result.text,
    model: result.model,
    provider: providerName,
    durationMs,
  };
}

// ============================================================================
// Provider Implementations
// ============================================================================

interface ProviderResult {
  text: string;
  model: string;
}

async function callProvider(
  provider: ProviderName,
  apiKey: string,
  prompt: string,
  model: string,
  timeout: number
): Promise<ProviderResult> {
  switch (provider) {
    case 'gemini':
      return callGemini(apiKey, prompt, model, timeout);
    case 'openai':
      return callOpenAI(apiKey, prompt, model, timeout);
  }
}

/**
 * Call Gemini API using the official @google/genai SDK.
 * Uses API key authentication (Gemini Developer API, not Vertex AI).
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  model: string,
  timeout: number
): Promise<ProviderResult> {
  // Initialize with API key only - this uses Gemini Developer API, not Vertex AI
  const ai = new GoogleGenAI({ apiKey });

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    const text = response.text ?? '';
    return { text, model };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAI(
  apiKey: string,
  prompt: string,
  model: string,
  timeout: number
): Promise<ProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const text = data.choices?.[0]?.message?.content ?? '';

    return { text, model: data.model ?? model };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Utilities
// ============================================================================

function readFiles(paths: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const path of paths) {
    if (existsSync(path)) {
      try {
        result[path] = readFileSync(path, 'utf-8');
      } catch {
        // Skip unreadable files
      }
    }
  }
  return result;
}
