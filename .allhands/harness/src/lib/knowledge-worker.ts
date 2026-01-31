#!/usr/bin/env tsx
/**
 * Knowledge Worker - standalone child process for embedding operations.
 *
 * Isolates the ONNX Runtime + gtr-t5-quant model (~300-600MB) from the
 * main TUI process. The model loads, runs, and dies entirely within this
 * child process, preventing heap pressure in the TUI.
 *
 * Usage:
 *   npx tsx knowledge-worker.ts reindexAll <indexName> <projectRoot>
 *   npx tsx knowledge-worker.ts reindexFromChanges <indexName> <projectRoot>
 *     (reads changes JSON from stdin for reindexFromChanges)
 *
 * Output:
 *   stderr: Progress messages (line-buffered)
 *   stdout: Final JSON result { success, files_indexed, total_tokens } or
 *           { success, message, files }
 */

import { KnowledgeService, type IndexName } from "./knowledge.js";

async function main(): Promise<void> {
  const [command, indexName, projectRoot] = process.argv.slice(2);

  if (!command || !indexName || !projectRoot) {
    process.stderr.write("Usage: knowledge-worker.ts <reindexAll|reindexFromChanges> <indexName> <projectRoot>\n");
    process.exit(1);
  }

  // Create service with quiet=false so log() writes to stderr
  const service = new KnowledgeService(projectRoot, { quiet: false });

  try {
    if (command === "reindexAll") {
      const result = await service.reindexAll(indexName as IndexName);
      // Write final result to stdout
      process.stdout.write(JSON.stringify({
        success: true,
        files_indexed: result.files_indexed,
        total_tokens: result.total_tokens,
      }) + "\n");
    } else if (command === "reindexFromChanges") {
      // Read changes from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const changesJson = Buffer.concat(chunks).toString("utf-8");
      const changes = JSON.parse(changesJson);

      const result = await service.reindexFromChanges(indexName as IndexName, changes);
      process.stdout.write(JSON.stringify({
        success: result.success,
        message: result.message,
        files: result.files,
      }) + "\n");
    } else {
      process.stderr.write(`Unknown command: ${command}\n`);
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[knowledge-worker] Error: ${message}\n`);
    process.stdout.write(JSON.stringify({ success: false, error: message }) + "\n");
    process.exit(1);
  }

  // Clean exit to release ONNX thread pools
  process.exit(0);
}

main();
