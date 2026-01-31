/**
 * Tests for docs validation utilities.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  REF_PATTERN,
  PLACEHOLDER_PATTERN,
  extractRefs,
  validateFrontMatter,
  detectPlaceholders,
  countCodeBlocks,
  hasCapabilityList,
  getBlobHashForFile,
  batchGetBlobHashes,
} from "../docs-validation.js";

describe("REF_PATTERN", () => {
  beforeEach(() => {
    REF_PATTERN.lastIndex = 0;
  });

  it("matches symbol reference", () => {
    const match = REF_PATTERN.exec("[ref:src/lib/foo.ts:MyClass:abc1234]");
    expect(match).not.toBeNull();
    expect(match![1]).toBe("src/lib/foo.ts");
    expect(match![2]).toBe("MyClass");
    expect(match![3]).toBe("abc1234");
  });

  it("matches file-only reference", () => {
    const match = REF_PATTERN.exec("[ref:src/lib/foo.ts::def5678]");
    expect(match).not.toBeNull();
    expect(match![1]).toBe("src/lib/foo.ts");
    expect(match![2]).toBe("");
    expect(match![3]).toBe("def5678");
  });

  it("matches multiple refs", () => {
    const content = `
      See [ref:src/a.ts:foo:abc1234] for implementation.
      Also [ref:src/b.ts::def5678] is relevant.
    `;
    const matches: string[] = [];
    let match;
    while ((match = REF_PATTERN.exec(content)) !== null) {
      matches.push(match[0]);
    }
    expect(matches).toHaveLength(2);
  });

  it("does not match invalid hash (too short)", () => {
    const match = REF_PATTERN.exec("[ref:src/foo.ts:bar:abc]");
    expect(match).toBeNull();
  });
});

describe("extractRefs", () => {
  it("extracts symbol refs", () => {
    const content = "See [ref:src/foo.ts:MyClass:abc1234] for details.";
    const refs = extractRefs(content, "docs/test.md");

    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      reference: "[ref:src/foo.ts:MyClass:abc1234]",
      file: "src/foo.ts",
      symbol: "MyClass",
      hash: "abc1234",
      isFileOnly: false,
      docFile: "docs/test.md",
    });
  });

  it("extracts file-only refs", () => {
    const content = "See [ref:src/foo.ts::abc1234] for details.";
    const refs = extractRefs(content, "docs/test.md");

    expect(refs).toHaveLength(1);
    expect(refs[0].isFileOnly).toBe(true);
    expect(refs[0].symbol).toBeNull();
  });

  it("extracts multiple refs", () => {
    const content = `
      [ref:a.ts:foo:1111111]
      [ref:b.ts::2222222]
      [ref:c.ts:bar:3333333]
    `;
    const refs = extractRefs(content, "test.md");
    expect(refs).toHaveLength(3);
  });

  it("returns empty array for no refs", () => {
    const content = "No references here.";
    const refs = extractRefs(content, "test.md");
    expect(refs).toHaveLength(0);
  });
});

describe("validateFrontMatter", () => {
  it("validates correct front matter", () => {
    const content = `---
description: This is a test document
relevant_files:
  - src/foo.ts
---

Content here.`;

    const result = validateFrontMatter(content);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("fails if missing front matter", () => {
    const content = "No front matter here.";
    const result = validateFrontMatter(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing front matter");
  });

  it("fails if missing description", () => {
    const content = `---
title: Test
---

Content.`;

    const result = validateFrontMatter(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("description");
  });

  it("fails if description is empty", () => {
    const content = `---
description: ""
---

Content.`;

    const result = validateFrontMatter(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Empty");
  });

  it("fails if relevant_files is not array", () => {
    const content = `---
description: Test
relevant_files: "not-an-array"
---

Content.`;

    const result = validateFrontMatter(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("array");
  });
});

describe("detectPlaceholders", () => {
  beforeEach(() => {
    PLACEHOLDER_PATTERN.lastIndex = 0;
  });

  it("detects abc123 placeholder", () => {
    const content = "[ref:foo.ts:bar:abc123]";
    const placeholders = detectPlaceholders(content);
    expect(placeholders).toHaveLength(1);
  });

  it("detects 000000 placeholder", () => {
    const content = "[ref:foo.ts:bar:000000]";
    const placeholders = detectPlaceholders(content);
    expect(placeholders).toHaveLength(1);
  });

  it("detects hash prefix placeholder", () => {
    const content = "[ref:foo.ts:bar:hash12]";
    const placeholders = detectPlaceholders(content);
    expect(placeholders).toHaveLength(1);
  });

  it("detects test prefix placeholder", () => {
    const content = "[ref:foo.ts:bar:test99]";
    const placeholders = detectPlaceholders(content);
    expect(placeholders).toHaveLength(1);
  });

  it("does not flag valid hashes", () => {
    const content = "[ref:foo.ts:bar:a1b2c3d]";
    const placeholders = detectPlaceholders(content);
    expect(placeholders).toHaveLength(0);
  });

  it("detects multiple placeholders", () => {
    const content = `
      [ref:a.ts:x:abc123]
      [ref:b.ts:y:test00]
    `;
    const placeholders = detectPlaceholders(content);
    expect(placeholders).toHaveLength(2);
  });
});

describe("countCodeBlocks", () => {
  it("counts single code block", () => {
    const content = "```typescript\nconst x = 1;\n```";
    expect(countCodeBlocks(content)).toBe(1);
  });

  it("counts multiple code blocks", () => {
    const content = `
\`\`\`typescript
const x = 1;
\`\`\`

Some text.

\`\`\`bash
echo "hello"
\`\`\`
`;
    expect(countCodeBlocks(content)).toBe(2);
  });

  it("counts plain code blocks", () => {
    const content = "```\nplain code\n```";
    expect(countCodeBlocks(content)).toBe(1);
  });

  it("returns 0 for no code blocks", () => {
    const content = "Just some text.";
    expect(countCodeBlocks(content)).toBe(0);
  });
});

describe("hasCapabilityList", () => {
  it("detects Command/Purpose table", () => {
    const content = `
| Command | Purpose |
|---------|---------|
| foo     | Does X  |
`;
    expect(hasCapabilityList(content)).toBe(true);
  });

  it("detects Option/Description table", () => {
    const content = `
| Option | Description |
|--------|-------------|
| --foo  | Enables X   |
`;
    expect(hasCapabilityList(content)).toBe(true);
  });

  it("detects Flag/Purpose table", () => {
    const content = `
| Flag | Purpose |
|------|---------|
| -v   | Verbose |
`;
    expect(hasCapabilityList(content)).toBe(true);
  });

  it("does not flag regular tables", () => {
    const content = `
| Name | Age |
|------|-----|
| John | 30  |
`;
    expect(hasCapabilityList(content)).toBe(false);
  });

  it("does not flag plain text", () => {
    const content = "Just some text about Command and Purpose.";
    expect(hasCapabilityList(content)).toBe(false);
  });
});

describe("getBlobHashForFile", () => {
  // These tests require running inside a git repo with committed files.
  // They use the project's own files as fixtures.
  const projectRoot = process.cwd();

  it("returns a 7-char hex hash for a committed file", () => {
    const result = getBlobHashForFile("package.json", projectRoot);
    expect(result.success).toBe(true);
    expect(result.hash).toMatch(/^[a-f0-9]{7}$/);
  });

  it("handles absolute paths by normalizing to relative", () => {
    const absPath = `${projectRoot}/package.json`;
    const result = getBlobHashForFile(absPath, projectRoot);
    expect(result.success).toBe(true);
    expect(result.hash).toMatch(/^[a-f0-9]{7}$/);
  });

  it("returns failure for non-existent file", () => {
    const result = getBlobHashForFile("this-file-does-not-exist.xyz", projectRoot);
    expect(result.success).toBe(false);
    expect(result.hash).toBe("0000000");
  });

  it("returns consistent hash for the same file content", () => {
    const result1 = getBlobHashForFile("package.json", projectRoot);
    const result2 = getBlobHashForFile("package.json", projectRoot);
    expect(result1.hash).toBe(result2.hash);
  });
});

describe("batchGetBlobHashes", () => {
  const projectRoot = process.cwd();

  it("returns hashes for multiple files", () => {
    const files = ["package.json", "tsconfig.json"];
    const results = batchGetBlobHashes(files, projectRoot);
    expect(results.size).toBe(2);
    for (const file of files) {
      const result = results.get(file);
      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      expect(result!.hash).toMatch(/^[a-f0-9]{7}$/);
    }
  });

  it("returns same hash as individual getBlobHashForFile", () => {
    const file = "package.json";
    const individual = getBlobHashForFile(file, projectRoot);
    const batch = batchGetBlobHashes([file], projectRoot);
    expect(batch.get(file)!.hash).toBe(individual.hash);
  });

  it("handles empty file list", () => {
    const results = batchGetBlobHashes([], projectRoot);
    expect(results.size).toBe(0);
  });

  it("handles mix of existing and non-existing files", () => {
    const files = ["package.json", "nonexistent-file.xyz"];
    const results = batchGetBlobHashes(files, projectRoot);
    expect(results.get("package.json")!.success).toBe(true);
    expect(results.get("nonexistent-file.xyz")!.success).toBe(false);
  });
});
