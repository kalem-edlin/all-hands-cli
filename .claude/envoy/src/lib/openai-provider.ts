/**
 * OpenAI provider implementation using direct fetch (no SDK dependency).
 */

import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  ProviderConfig,
  ContentPart,
} from "./providers.js";
import { PROVIDER_CONFIGS } from "./providers.js";

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  error?: { message?: string };
}

interface OpenAIMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export class OpenAIProvider implements LLMProvider {
  readonly config: ProviderConfig = PROVIDER_CONFIGS.openai;

  getApiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
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
    const messages = this.formatMessages(contents);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    if (data.error) {
      throw new Error(data.error.message ?? "OpenAI API error");
    }

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      model: data.model ?? model,
    };
  }

  private formatMessages(contents: string | ContentPart[]): OpenAIMessage[] {
    if (typeof contents === "string") {
      return [{ role: "user", content: contents }];
    }

    const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    for (const item of contents) {
      if (typeof item === "string") {
        parts.push({ type: "text", text: item });
      } else if (item.inlineData) {
        parts.push({
          type: "image_url",
          image_url: {
            url: `data:${item.inlineData.mimeType};base64,${item.inlineData.data}`,
          },
        });
      }
    }
    return [{ role: "user", content: parts }];
  }
}
