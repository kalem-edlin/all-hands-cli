/**
 * Gemini provider implementation using @google/genai SDK.
 */

import { GoogleGenAI } from "@google/genai";
import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  ProviderConfig,
  ContentPart,
} from "./providers.js";
import { PROVIDER_CONFIGS } from "./providers.js";

export class GeminiProvider implements LLMProvider {
  readonly config: ProviderConfig = PROVIDER_CONFIGS.gemini;

  getApiKey(): string | undefined {
    return process.env.VERTEX_API_KEY;
  }

  async generate(
    contents: string | ContentPart[],
    options?: GenerateOptions
  ): Promise<GenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(`${this.config.apiKeyEnvVar} not set`);
    }

    const model =
      options?.model ?? (options?.usePro ? this.config.proModel : this.config.defaultModel);
    const client = new GoogleGenAI({ vertexai: true, apiKey });

    const result = await client.models.generateContent({ model, contents });
    return { text: result.text ?? "", model };
  }
}
