/**
 * AgentRunner - Spawns and manages sub-agents via OpenCode SDK.
 * Each run spawns a fresh server instance, executes the agent, and cleans up.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { createOpencode } from "@opencode-ai/sdk";
import type { AgentConfig, AgentResult } from "./index.js";
import { logCommandComplete, logCommandStart } from "../observability.js";

const MAX_EXPANSIONS = 3;
const EXPANSION_PATTERN = /^EXPAND:\s*(.+)$/gm;
const DEFAULT_TIMEOUT_MS = 60000;

export class AgentRunner {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Execute an agent with given config and user message.
   * Spawns server, creates session, sends message, handles expansions, cleans up.
   */
  async run<T>(config: AgentConfig, userMessage: string): Promise<AgentResult<T>> {
    const startTime = Date.now();
    logCommandStart("agent.run", { agent: config.name });

    let server: { close: () => void } | null = null;

    try {
      const { client, server: srv } = await createOpencode({
        timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        config: config.model ? { model: config.model } : undefined,
      });
      server = srv;

      const session = await client.session.create({
        body: { title: config.name },
      });

      if (!session.data?.id) {
        throw new Error("Failed to create session");
      }

      // Send system prompt as context
      await client.session.prompt({
        path: { id: session.data.id },
        body: {
          noReply: true,
          parts: [{ type: "text", text: config.systemPrompt }],
        },
      });

      // Send user message and get response
      let response = await client.session.prompt({
        path: { id: session.data.id },
        body: {
          parts: [{ type: "text", text: userMessage }],
        },
      });

      let responseText = this.extractResponseText(response);
      let expansionCount = 0;

      // Handle expansion requests
      while (this.hasExpansionRequest(responseText) && expansionCount < MAX_EXPANSIONS) {
        const paths = this.extractExpansionPaths(responseText);
        const contents = this.readFiles(paths);
        const expansionMessage = this.formatExpansionResponse(contents);

        response = await client.session.prompt({
          path: { id: session.data.id },
          body: {
            parts: [{ type: "text", text: expansionMessage }],
          },
        });

        responseText = this.extractResponseText(response);
        expansionCount++;
      }

      const durationMs = Date.now() - startTime;
      const parsed = this.parseStructuredOutput<T>(responseText);

      if (!parsed) {
        // Retry once asking for JSON
        response = await client.session.prompt({
          path: { id: session.data.id },
          body: {
            parts: [{ type: "text", text: "Please format your response as valid JSON matching the required schema." }],
          },
        });

        responseText = this.extractResponseText(response);
        const retryParsed = this.parseStructuredOutput<T>(responseText);

        if (!retryParsed) {
          throw new Error("Failed to parse agent response as JSON");
        }

        logCommandComplete("agent.run", "success", Date.now() - startTime, {
          agent: config.name,
          expansions: expansionCount,
          retry: true,
        });

        return {
          success: true,
          data: retryParsed,
          metadata: {
            model: config.model ?? "default",
            duration_ms: Date.now() - startTime,
          },
        };
      }

      logCommandComplete("agent.run", "success", durationMs, {
        agent: config.name,
        expansions: expansionCount,
      });

      return {
        success: true,
        data: parsed,
        metadata: {
          model: config.model ?? "default",
          duration_ms: durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logCommandComplete("agent.run", "error", durationMs, {
        agent: config.name,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          model: config.model ?? "default",
          duration_ms: durationMs,
        },
      };
    } finally {
      if (server) {
        server.close();
      }
    }
  }

  private extractResponseText(response: unknown): string {
    // Navigate SDK response structure to get text content
    const resp = response as {
      data?: {
        parts?: Array<{ type: string; text?: string }>;
      };
    };

    if (!resp.data?.parts) {
      return "";
    }

    return resp.data.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("\n");
  }

  private hasExpansionRequest(text: string): boolean {
    const regex = new RegExp(EXPANSION_PATTERN.source, EXPANSION_PATTERN.flags);
    return regex.test(text);
  }

  private extractExpansionPaths(text: string): string[] {
    const paths: string[] = [];
    const regex = new RegExp(EXPANSION_PATTERN.source, "gm");
    let match;

    while ((match = regex.exec(text)) !== null) {
      paths.push(match[1].trim());
    }

    return paths;
  }

  private readFiles(paths: string[]): Map<string, string | null> {
    const contents = new Map<string, string | null>();
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB

    for (const path of paths) {
      const fullPath = join(this.projectRoot, path);
      if (existsSync(fullPath)) {
        try {
          const stats = statSync(fullPath);
          if (stats.size > MAX_FILE_SIZE) {
            const partial = readFileSync(fullPath, "utf-8").slice(0, MAX_FILE_SIZE);
            contents.set(path, `${partial}\n\n[TRUNCATED: file exceeds 1MB limit]`);
          } else {
            contents.set(path, readFileSync(fullPath, "utf-8"));
          }
        } catch {
          contents.set(path, null);
        }
      } else {
        contents.set(path, null);
      }
    }

    return contents;
  }

  private formatExpansionResponse(contents: Map<string, string | null>): string {
    const parts: string[] = ["Here are the expanded file contents:\n"];

    for (const [path, content] of contents) {
      if (content !== null) {
        parts.push(`## ${path}\n\`\`\`\n${content}\n\`\`\`\n`);
      } else {
        parts.push(`## ${path}\n[File not found or unreadable]\n`);
      }
    }

    parts.push("\nPlease continue your analysis and provide the final JSON response.");
    return parts.join("\n");
  }

  private parseStructuredOutput<T>(text: string): T | null {
    // Try to extract JSON from code block
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim()) as T;
      } catch {
        // Fall through to try raw parse
      }
    }

    // Try raw JSON parse
    try {
      return JSON.parse(text.trim()) as T;
    } catch {
      return null;
    }
  }
}
