/**
 * Tests for ctags utilities.
 *
 * Note: These tests require universal-ctags to be installed.
 * Tests are skipped if ctags is not available.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { join } from "path";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import {
  checkCtagsAvailable,
  generateCtagsIndex,
  lookupSymbol,
  searchSymbol,
  getFileSymbols,
  generateFileCtags,
  findSymbolInFile,
  CtagsIndex,
} from "../ctags.js";

// Check if ctags is available for tests
const ctagsCheck = checkCtagsAvailable();
const hasCtagsInstalled = ctagsCheck.available;

describe("checkCtagsAvailable", () => {
  it("returns availability status", () => {
    const result = checkCtagsAvailable();
    expect(result).toHaveProperty("available");

    if (result.available) {
      expect(result.version).toBeDefined();
    } else {
      expect(result.error).toBeDefined();
    }
  });
});

// Skip remaining tests if ctags not installed
describe.skipIf(!hasCtagsInstalled)("ctags with installed ctags", () => {
  const testDir = join(process.cwd(), ".test-ctags-temp");
  const testFile = join(testDir, "test-sample.ts");

  const sampleCode = `
// Test TypeScript file for ctags tests

export class MyClass {
  private value: number;

  constructor(value: number) {
    this.value = value;
  }

  getValue(): number {
    return this.value;
  }

  setValue(newValue: number): void {
    this.value = newValue;
  }
}

export interface MyInterface {
  name: string;
  age: number;
}

export function myFunction(arg: string): string {
  return arg.toUpperCase();
}

export const MY_CONSTANT = 42;

type MyType = string | number;
`;

  beforeAll(() => {
    // Create test directory and file
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, sampleCode, "utf-8");

    return () => {
      // Cleanup
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    };
  });

  describe("generateFileCtags", () => {
    it("generates ctags for a single file", () => {
      const result = generateFileCtags(testFile, testDir);

      expect(result.success).toBe(true);
      expect(result.entries.length).toBeGreaterThan(0);

      // Should find known symbols
      const symbolNames = result.entries.map((e) => e.name);
      expect(symbolNames).toContain("MyClass");
      expect(symbolNames).toContain("myFunction");
    });

    it("returns error for non-existent file", () => {
      const result = generateFileCtags(join(testDir, "nonexistent.ts"), testDir);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("includes symbol metadata", () => {
      const result = generateFileCtags(testFile, testDir);
      expect(result.success).toBe(true);

      const classEntry = result.entries.find((e) => e.name === "MyClass");
      expect(classEntry).toBeDefined();
      expect(classEntry!.kind).toBe("class");
      expect(classEntry!.line).toBeGreaterThan(0);
    });
  });

  describe("generateCtagsIndex", () => {
    it("generates index for directory", () => {
      const result = generateCtagsIndex(testDir);

      expect(result.success).toBe(true);
      expect(result.entryCount).toBeGreaterThan(0);
      expect(result.index.size).toBeGreaterThan(0);
    });

    it("indexes symbols by file and name", () => {
      const { index, success } = generateCtagsIndex(testDir);
      expect(success).toBe(true);

      // The file path should be relative to cwd
      const relPath = "test-sample.ts";
      const fileMap = index.get(relPath);
      expect(fileMap).toBeDefined();

      // Should have MyClass
      const myClass = fileMap!.get("MyClass");
      expect(myClass).toBeDefined();
      expect(myClass!.length).toBeGreaterThan(0);
    });
  });

  describe("lookupSymbol", () => {
    let index: CtagsIndex;

    beforeAll(() => {
      const result = generateCtagsIndex(testDir);
      index = result.index;
    });

    it("finds symbol in specific file", () => {
      const entries = lookupSymbol(index, "test-sample.ts", "MyClass");

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].name).toBe("MyClass");
    });

    it("returns empty array for non-existent symbol", () => {
      const entries = lookupSymbol(index, "test-sample.ts", "NonExistent");
      expect(entries).toHaveLength(0);
    });

    it("returns empty array for non-existent file", () => {
      const entries = lookupSymbol(index, "nonexistent.ts", "MyClass");
      expect(entries).toHaveLength(0);
    });
  });

  describe("searchSymbol", () => {
    let index: CtagsIndex;

    beforeAll(() => {
      const result = generateCtagsIndex(testDir);
      index = result.index;
    });

    it("finds symbol across all files", () => {
      const results = searchSymbol(index, "MyClass");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("MyClass");
      expect(results[0].file).toBeDefined();
    });

    it("returns empty for non-existent symbol", () => {
      const results = searchSymbol(index, "NonExistent");
      expect(results).toHaveLength(0);
    });
  });

  describe("getFileSymbols", () => {
    let index: CtagsIndex;

    beforeAll(() => {
      const result = generateCtagsIndex(testDir);
      index = result.index;
    });

    it("returns all symbols in a file", () => {
      const symbols = getFileSymbols(index, "test-sample.ts");

      expect(symbols.length).toBeGreaterThan(0);

      // Should include class, function, interface
      const names = symbols.map((s) => s.name);
      expect(names).toContain("MyClass");
      expect(names).toContain("myFunction");
    });

    it("returns symbols sorted by line number", () => {
      const symbols = getFileSymbols(index, "test-sample.ts");

      for (let i = 1; i < symbols.length; i++) {
        expect(symbols[i].line).toBeGreaterThanOrEqual(symbols[i - 1].line);
      }
    });

    it("returns empty for non-existent file", () => {
      const symbols = getFileSymbols(index, "nonexistent.ts");
      expect(symbols).toHaveLength(0);
    });
  });

  describe("findSymbolInFile", () => {
    it("finds symbol in file", () => {
      const entry = findSymbolInFile(testFile, "MyClass", testDir);

      expect(entry).not.toBeNull();
      expect(entry!.name).toBe("MyClass");
      expect(entry!.kind).toBe("class");
    });

    it("returns null for non-existent symbol", () => {
      const entry = findSymbolInFile(testFile, "NonExistent", testDir);
      expect(entry).toBeNull();
    });
  });
});
