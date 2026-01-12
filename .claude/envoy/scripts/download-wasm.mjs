#!/usr/bin/env node
/**
 * Downloads tree-sitter WASM grammars needed for AST parsing.
 * Run automatically via npm postinstall.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmDir = join(__dirname, "..", "wasm");

const WASM_FILES = [
  {
    name: "tree-sitter-swift.wasm",
    url: "https://github.com/alex-pinkus/tree-sitter-swift/releases/download/0.7.1-pypi/tree-sitter-swift.wasm",
  },
];

async function downloadFile(url, destPath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(destPath, buffer);
}

async function main() {
  // Create wasm directory if needed
  if (!existsSync(wasmDir)) {
    mkdirSync(wasmDir, { recursive: true });
  }

  for (const { name, url } of WASM_FILES) {
    const destPath = join(wasmDir, name);

    if (existsSync(destPath)) {
      console.log(`[wasm] ${name} already exists, skipping`);
      continue;
    }

    console.log(`[wasm] Downloading ${name}...`);
    try {
      await downloadFile(url, destPath);
      console.log(`[wasm] Downloaded ${name}`);
    } catch (err) {
      console.error(`[wasm] Failed to download ${name}:`, err.message);
      process.exit(1);
    }
  }
}

main();
