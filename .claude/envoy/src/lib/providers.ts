/**
 * Provider abstraction layer for multi-LLM oracle commands.
 * Supports Gemini and OpenAI with standardized interface.
 */

export type ProviderName = "gemini" | "openai";

export interface ProviderConfig {
  name: ProviderName;
  apiKeyEnvVar: string;
  defaultModel: string;
  proModel: string;
}

export interface GenerateOptions {
  model?: string;
  usePro?: boolean;
}

export interface GenerateResult {
  text: string;
  model: string;
}

export type ContentPart = string | { inlineData: { mimeType: string; data: string } };

export interface LLMProvider {
  readonly config: ProviderConfig;
  getApiKey(): string | undefined;
  generate(
    contents: string | ContentPart[],
    options?: GenerateOptions
  ): Promise<GenerateResult>;
}

export const PROVIDER_CONFIGS: Record<ProviderName, ProviderConfig> = {
  gemini: {
    name: "gemini",
    apiKeyEnvVar: "VERTEX_API_KEY",
    defaultModel: "gemini-2.0-flash",
    proModel: "gemini-3-pro-preview",
  },
  openai: {
    name: "openai",
    apiKeyEnvVar: "OPENAI_API_KEY",
    defaultModel: "gpt-5.2",
    proModel: "gpt-5.2",
  },
};

export function getDefaultProvider(): ProviderName {
  const envProvider = process.env.ORACLE_DEFAULT_PROVIDER;
  if (envProvider === "openai" || envProvider === "gemini") {
    return envProvider;
  }
  return "gemini";
}

// Lazy imports to avoid loading unused SDKs
export async function createProvider(name: ProviderName): Promise<LLMProvider> {
  switch (name) {
    case "gemini": {
      const { GeminiProvider } = await import("./gemini-provider.js");
      return new GeminiProvider();
    }
    case "openai": {
      const { OpenAIProvider } = await import("./openai-provider.js");
      return new OpenAIProvider();
    }
  }
}
