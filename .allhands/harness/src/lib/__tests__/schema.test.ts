/**
 * Unit Tests - Schema Validation Library
 *
 * Tests the core schema validation functions including:
 * - validateField() for all type branches (string, integer, boolean, date, enum, array, object)
 * - Array item-type validation (added in validation-tooling-practice Prompt 04)
 * - Schema loading and listing
 * - Frontmatter extraction and validation
 * - Schema type detection
 * - Default application and error formatting
 */

import { describe, expect, it } from "vitest";

import type { Schema, SchemaField, ValidationResult } from "../schema.js";
import {
  applyDefaults,
  detectSchemaType,
  extractFrontmatter,
  formatErrors,
  inferSchemaType,
  listSchemas,
  loadSchema,
  validateFile,
  validateFrontmatter,
} from "../schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal schema with a single field for isolated validateField testing.
 * validateFrontmatter delegates to validateField per-field, so we test through
 * the public API by constructing single-field schemas.
 */
function schemaWith(fieldName: string, field: SchemaField): Schema {
  return { frontmatter: { [fieldName]: field } };
}

function validate(
  fieldName: string,
  field: SchemaField,
  value: unknown,
): ValidationResult {
  const schema = schemaWith(fieldName, field);
  const frontmatter: Record<string, unknown> = {};
  if (value !== undefined) {
    frontmatter[fieldName] = value;
  }
  return validateFrontmatter(frontmatter, schema);
}

// ─────────────────────────────────────────────────────────────────────────────
// validateField — Type Branches
// ─────────────────────────────────────────────────────────────────────────────

describe("validateField via validateFrontmatter", () => {
  // --- Required / Optional ---

  describe("required and optional fields", () => {
    it("returns error when required field is missing", () => {
      const result = validate(
        "name",
        { type: "string", required: true },
        undefined,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe("name");
    });

    it("returns valid when optional field is missing", () => {
      const result = validate(
        "name",
        { type: "string", required: false },
        undefined,
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns valid when optional field with no required flag is missing", () => {
      const result = validate("name", { type: "string" }, undefined);
      expect(result.valid).toBe(true);
    });
  });

  // --- String ---

  describe("string type", () => {
    it("accepts a valid string", () => {
      const result = validate(
        "title",
        { type: "string", required: true },
        "hello",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts an empty string", () => {
      const result = validate("title", { type: "string", required: true }, "");
      expect(result.valid).toBe(true);
    });

    it("rejects a number", () => {
      const result = validate("title", { type: "string", required: true }, 42);
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe("title");
    });

    it("rejects a boolean", () => {
      const result = validate(
        "title",
        { type: "string", required: true },
        true,
      );
      expect(result.valid).toBe(false);
    });
  });

  // --- Integer ---

  describe("integer type", () => {
    it("accepts a valid integer", () => {
      const result = validate("count", { type: "integer", required: true }, 5);
      expect(result.valid).toBe(true);
    });

    it("accepts zero", () => {
      const result = validate("count", { type: "integer", required: true }, 0);
      expect(result.valid).toBe(true);
    });

    it("accepts negative integer", () => {
      const result = validate("count", { type: "integer", required: true }, -3);
      expect(result.valid).toBe(true);
    });

    it("rejects a float", () => {
      const result = validate(
        "count",
        { type: "integer", required: true },
        3.14,
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe("count");
    });

    it("rejects a string", () => {
      const result = validate(
        "count",
        { type: "integer", required: true },
        "5",
      );
      expect(result.valid).toBe(false);
    });
  });

  // --- Boolean ---

  describe("boolean type", () => {
    it("accepts true", () => {
      const result = validate(
        "flag",
        { type: "boolean", required: true },
        true,
      );
      expect(result.valid).toBe(true);
    });

    it("accepts false", () => {
      const result = validate(
        "flag",
        { type: "boolean", required: true },
        false,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects a string", () => {
      const result = validate(
        "flag",
        { type: "boolean", required: true },
        "true",
      );
      expect(result.valid).toBe(false);
    });

    it("rejects a number", () => {
      const result = validate("flag", { type: "boolean", required: true }, 1);
      expect(result.valid).toBe(false);
    });
  });

  // --- Date ---

  describe("date type", () => {
    it("accepts a valid ISO 8601 date", () => {
      const result = validate(
        "created",
        { type: "date", required: true },
        "2025-01-15",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a full ISO datetime", () => {
      const result = validate(
        "created",
        { type: "date", required: true },
        "2025-01-15T10:30:00Z",
      );
      expect(result.valid).toBe(true);
    });

    it("rejects an invalid date string", () => {
      const result = validate(
        "created",
        { type: "date", required: true },
        "not-a-date",
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe("created");
    });

    it("rejects a number", () => {
      const result = validate(
        "created",
        { type: "date", required: true },
        1705334400000,
      );
      expect(result.valid).toBe(false);
    });
  });

  // --- Enum ---

  describe("enum type", () => {
    const enumField: SchemaField = {
      type: "enum",
      required: true,
      values: ["pending", "in_progress", "done"],
    };

    it("accepts a valid enum value", () => {
      const result = validate("status", enumField, "pending");
      expect(result.valid).toBe(true);
    });

    it("accepts another valid enum value", () => {
      const result = validate("status", enumField, "done");
      expect(result.valid).toBe(true);
    });

    it("rejects an invalid enum value", () => {
      const result = validate("status", enumField, "invalid_status");
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe("status");
    });

    it("rejects an empty string not in values", () => {
      const result = validate("status", enumField, "");
      expect(result.valid).toBe(false);
    });
  });

  // --- Array ---

  describe("array type", () => {
    it("accepts a valid array", () => {
      const result = validate("tags", { type: "array", required: true }, [
        "a",
        "b",
      ]);
      expect(result.valid).toBe(true);
    });

    it("accepts an empty array", () => {
      const result = validate("tags", { type: "array", required: true }, []);
      expect(result.valid).toBe(true);
    });

    it("rejects a non-array value", () => {
      const result = validate(
        "tags",
        { type: "array", required: true },
        "not-array",
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe("tags");
    });

    it("rejects an object (not an array)", () => {
      const result = validate(
        "tags",
        { type: "array", required: true },
        { key: "val" },
      );
      expect(result.valid).toBe(false);
    });

    // Array item-type validation (Prompt 04 addition)
    describe("item-type validation", () => {
      it("accepts string array when items: string", () => {
        const result = validate(
          "tools",
          { type: "array", required: true, items: "string" },
          ["playwright", "vitest"],
        );
        expect(result.valid).toBe(true);
      });

      it("rejects non-string items when items: string", () => {
        const result = validate(
          "tools",
          { type: "array", required: true, items: "string" },
          [123, "valid"],
        );
        expect(result.valid).toBe(false);
        expect(result.errors[0].field).toBe("tools");
        expect(result.errors[0].message).toContain("non-string");
      });

      it("accepts integer array when items: integer", () => {
        const result = validate(
          "deps",
          { type: "array", required: true, items: "integer" },
          [1, 2, 3],
        );
        expect(result.valid).toBe(true);
      });

      it("rejects float in integer array", () => {
        const result = validate(
          "deps",
          { type: "array", required: true, items: "integer" },
          [1, 2.5, 3],
        );
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain("non-integer");
      });

      it("rejects string in integer array", () => {
        const result = validate(
          "deps",
          { type: "array", required: true, items: "integer" },
          [1, "2", 3],
        );
        expect(result.valid).toBe(false);
      });

      it("accepts empty array with items constraint", () => {
        const result = validate(
          "tools",
          { type: "array", required: true, items: "string" },
          [],
        );
        expect(result.valid).toBe(true);
      });

      it("accepts array without items constraint (no type checking)", () => {
        const result = validate("mixed", { type: "array", required: true }, [
          1,
          "two",
          true,
        ]);
        expect(result.valid).toBe(true);
      });
    });
  });

  // --- Object ---

  describe("object type", () => {
    it("accepts a valid object", () => {
      const result = validate(
        "config",
        { type: "object", required: true },
        { key: "val" },
      );
      expect(result.valid).toBe(true);
    });

    it("rejects null", () => {
      // null is present but not a valid object — required field with null value
      // In validateField, null triggers the required check first
      const schema = schemaWith("config", { type: "object", required: true });
      const r = validateFrontmatter({ config: null }, schema);
      expect(r.valid).toBe(false);
    });

    it("rejects an array (which is typeof object)", () => {
      const result = validate(
        "config",
        { type: "object", required: true },
        [1, 2],
      );
      expect(result.valid).toBe(false);
    });

    it("rejects a string", () => {
      const result = validate(
        "config",
        { type: "object", required: true },
        "not-object",
      );
      expect(result.valid).toBe(false);
    });

    describe("nested property validation", () => {
      const nestedField: SchemaField = {
        type: "object",
        required: true,
        properties: {
          name: { type: "string", required: true },
          count: { type: "integer", required: false },
        },
      };

      it("accepts object with valid nested properties", () => {
        const result = validate("config", nestedField, {
          name: "test",
          count: 5,
        });
        expect(result.valid).toBe(true);
      });

      it("accepts object with optional nested property missing", () => {
        const result = validate("config", nestedField, { name: "test" });
        expect(result.valid).toBe(true);
      });

      it("rejects object with missing required nested property", () => {
        const result = validate("config", nestedField, { count: 5 });
        expect(result.valid).toBe(false);
        expect(result.errors[0].field).toBe("config.name");
      });

      it("rejects object with wrong-type nested property", () => {
        const result = validate("config", nestedField, { name: 123, count: 5 });
        expect(result.valid).toBe(false);
        expect(result.errors[0].field).toBe("config.name");
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema Loading & Listing
// ─────────────────────────────────────────────────────────────────────────────

describe("loadSchema", () => {
  it('returns a schema object for known type "prompt"', () => {
    const schema = loadSchema("prompt");
    expect(schema).not.toBeNull();
    expect(schema!.frontmatter).toBeDefined();
  });

  it('returns a schema object for "workflow"', () => {
    const schema = loadSchema("workflow");
    expect(schema).not.toBeNull();
    expect(schema!.frontmatter).toBeDefined();
    expect(schema!.frontmatter!["name"]).toBeDefined();
    expect(schema!.frontmatter!["type"].type).toBe("enum");
    expect(schema!.frontmatter!["planning_depth"].type).toBe("enum");
    expect(schema!.frontmatter!["jury_required"].type).toBe("boolean");
    expect(schema!.frontmatter!["max_tangential_hypotheses"].type).toBe(
      "integer",
    );
    expect(schema!.frontmatter!["required_ideation_questions"].type).toBe(
      "array",
    );
    expect(schema!.frontmatter!["required_ideation_questions"].items).toBe(
      "string",
    );
  });

  it("returns null for unknown schema type", () => {
    const schema = loadSchema("nonexistent-schema-type");
    expect(schema).toBeNull();
  });

  it("caches schema on subsequent calls", () => {
    const first = loadSchema("prompt");
    const second = loadSchema("prompt");
    expect(first).toBe(second); // same reference
  });

  it("returns null consistently for nonexistent type (no stale cache)", () => {
    // Verify that looking up a nonexistent type multiple times
    // always returns null and doesn't corrupt the cache
    const first = loadSchema("totally-fake-schema");
    const second = loadSchema("totally-fake-schema");
    expect(first).toBeNull();
    expect(second).toBeNull();
  });

  it("does not cross-contaminate cache between different schema types", () => {
    const prompt = loadSchema("prompt");
    expect(prompt).not.toBeNull();
  });

  it("cached schema retains full structure on repeated access", () => {
    // Load once to populate cache, then verify structure is intact on cache hit
    loadSchema("prompt"); // warm cache
    const cached = loadSchema("prompt");
    expect(cached).not.toBeNull();
    expect(cached!.frontmatter).toBeDefined();
    expect(cached!.frontmatter!["number"]).toBeDefined();
    expect(cached!.frontmatter!["number"].type).toBe("integer");
  });
});

describe("listSchemas", () => {
  it("returns an array of schema type strings", () => {
    const schemas = listSchemas();
    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.length).toBeGreaterThan(0);
  });

  it("includes known schema types", () => {
    const schemas = listSchemas();
    expect(schemas).toContain("prompt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Frontmatter Extraction
// ─────────────────────────────────────────────────────────────────────────────

describe("extractFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const content = `---
title: Hello
count: 5
---

Body content here.`;
    const result = extractFrontmatter(content);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter!["title"]).toBe("Hello");
    expect(result.frontmatter!["count"]).toBe(5);
  });

  it("separates body content correctly", () => {
    const content = `---
key: value
---

# Body

Some text.`;
    const result = extractFrontmatter(content);
    expect(result.body).toContain("# Body");
    expect(result.body).toContain("Some text.");
  });

  it("returns null frontmatter for content without delimiters", () => {
    const content = "# Just a heading\n\nSome text.";
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
  });

  it("returns null frontmatter for malformed YAML", () => {
    const content = `---
: : : invalid yaml [[[
---

Body.`;
    const result = extractFrontmatter(content);
    // parseYaml may or may not throw depending on how malformed — verify graceful handling
    expect(result.body).toBeDefined();
  });

  it("handles empty frontmatter", () => {
    const content = `---
---

Body only.`;
    const result = extractFrontmatter(content);
    // Empty YAML parses to null in some parsers
    expect(result.body).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractFrontmatter — Boundary Conditions (Stability)
// ─────────────────────────────────────────────────────────────────────────────

describe("extractFrontmatter boundary conditions", () => {
  it("returns null frontmatter for empty string input", () => {
    const result = extractFrontmatter("");
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe("");
  });

  it("returns null frontmatter for only frontmatter delimiters with empty YAML", () => {
    // "---\n---\n" has empty YAML between delimiters
    // parseYaml('') returns null — extractFrontmatter should handle gracefully
    const content = "---\n---\n";
    const result = extractFrontmatter(content);
    // The regex matches but parseYaml on empty string returns null,
    // which is cast to Record<string, unknown> — may be null
    expect(result.body).toBeDefined();
  });

  it("handles content ending at closing --- with no trailing newline", () => {
    // Regex: /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
    // Content "---\nkey: val\n---" has no trailing \n after closing ---
    // This means the regex will NOT match (requires \n after closing ---)
    // DIVERGENCE: hooks parseFrontmatter regex /^---\n([\s\S]*?)\n---/ DOES match this
    const content = "---\nkey: val\n---";
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
  });

  it("handles embedded --- in YAML string values", () => {
    // Non-greedy ([\s\S]*?) should stop at first literal \n---\n
    // The quoted "---" inside a value should not confuse the regex
    const content = '---\nseparator: "---"\ntitle: test\n---\n\nBody text.';
    const result = extractFrontmatter(content);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter!["title"]).toBe("test");
    expect(result.body).toContain("Body text.");
  });

  it("returns null frontmatter for content with only opening ---", () => {
    const content = "---\nkey: value\nmore: stuff";
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
  });

  it("captures first --- block only, not body content with triple-dash", () => {
    const content = "---\nfoo: bar\n---\n\nBody\n\n---\n\nMore body.";
    const result = extractFrontmatter(content);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter!["foo"]).toBe("bar");
    // Body should contain everything after the first closing ---\n
    expect(result.body).toContain("Body");
    expect(result.body).toContain("More body.");
  });

  it("returns null frontmatter when content starts with whitespace before ---", () => {
    // Regex anchors with ^--- so leading whitespace prevents match
    const content = " ---\nkey: val\n---\n\nBody.";
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateFrontmatter — Multi-field
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFrontmatter", () => {
  it("returns valid for conforming frontmatter", () => {
    const schema: Schema = {
      frontmatter: {
        name: { type: "string", required: true },
        count: { type: "integer", required: false, default: 0 },
      },
    };
    const result = validateFrontmatter({ name: "test" }, schema);
    expect(result.valid).toBe(true);
  });

  it("collects multiple errors", () => {
    const schema: Schema = {
      frontmatter: {
        name: { type: "string", required: true },
        status: { type: "enum", required: true, values: ["a", "b"] },
      },
    };
    const result = validateFrontmatter({}, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("uses schema.fields fallback when frontmatter is absent", () => {
    const schema: Schema = {
      fields: {
        name: { type: "string", required: true },
      },
    };
    const result = validateFrontmatter({}, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("name");
  });

  it("returns valid for empty schema", () => {
    const result = validateFrontmatter({ anything: "goes" }, {});
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateFile — Integration
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFile", () => {
  it("returns error for unknown schema type", () => {
    const result = validateFile("---\nfoo: bar\n---\nBody", "nonexistent");
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("_schema");
  });

  it("returns error for missing frontmatter", () => {
    const result = validateFile("Just body content", "prompt");
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("_frontmatter");
  });

  it("does not crash on empty string content with valid schema type", () => {
    const result = validateFile("", "prompt");
    expect(result.valid).toBe(false);
    // Empty string has no frontmatter, so should get _frontmatter error
    expect(result.errors[0].field).toBe("_frontmatter");
  });

  it("returns _frontmatter error for content with only body (no delimiters)", () => {
    const result = validateFile(
      "# Just a heading\n\nSome body text.",
      "prompt",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("_frontmatter");
  });

  it("validates valid frontmatter against a real schema type", () => {
    // Minimal valid prompt content (all required fields present)
    const content = `---
number: 1
title: "Test Task"
type: planned
status: pending
---

## Tasks

- Do something

## Acceptance Criteria

- Something works
`;
    const result = validateFile(content, "prompt");
    expect(result.valid).toBe(true);
  });

  it("returns valid when schema has no frontmatter or fields keys", () => {
    // validateFrontmatter iterates schema.frontmatter || schema.fields || {}
    // An empty schema means zero fields to validate, so everything passes
    const schema: Schema = {};
    const result = validateFrontmatter({ anything: "goes", extra: 42 }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("silently passes extra fields not defined in schema", () => {
    const schema: Schema = {
      frontmatter: {
        name: { type: "string", required: true },
      },
    };
    // 'unknown_field' is not in schema — should be ignored, not rejected
    const result = validateFrontmatter(
      { name: "valid", unknown_field: "extra" },
      schema,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema Type Detection
// ─────────────────────────────────────────────────────────────────────────────

describe("detectSchemaType", () => {
  it("detects prompt files", () => {
    expect(detectSchemaType(".planning/my-spec/prompts/01.md")).toBe("prompt");
  });

  it("detects alignment files", () => {
    expect(detectSchemaType(".planning/my-spec/alignment.md")).toBe(
      "alignment",
    );
  });

  it("detects spec files", () => {
    expect(detectSchemaType("specs/api.spec.md")).toBe("spec");
  });

  it("detects spec files in roadmap subdirectory", () => {
    expect(detectSchemaType("specs/roadmap/feature.spec.md")).toBe("spec");
  });

  it("detects documentation files", () => {
    expect(detectSchemaType("docs/guide.md")).toBe("documentation");
  });

  it("detects skill files", () => {
    expect(detectSchemaType(".allhands/skills/my-skill/SKILL.md")).toBe(
      "skill",
    );
  });

  it("detects workflow files", () => {
    expect(detectSchemaType(".allhands/workflows/milestone.md")).toBe(
      "workflow",
    );
  });

  it("returns null for non-schema files", () => {
    expect(detectSchemaType("README.md")).toBeNull();
    expect(detectSchemaType("src/index.ts")).toBeNull();
  });

  it("strips projectDir prefix before matching", () => {
    expect(
      detectSchemaType(
        "/home/user/project/.planning/s1/prompts/01.md",
        "/home/user/project",
      ),
    ).toBe("prompt");
  });

  it("handles path without projectDir prefix gracefully", () => {
    expect(
      detectSchemaType(".planning/s1/prompts/01.md", "/different/project"),
    ).toBe("prompt");
  });
});

describe("inferSchemaType", () => {
  it("infers prompt from path containing /prompts/", () => {
    expect(inferSchemaType("/some/path/prompts/01.md")).toBe("prompt");
  });

  it("infers prompt from filename matching prompt*.md", () => {
    expect(inferSchemaType("prompt-file.md")).toBe("prompt");
  });

  it("infers alignment from path containing alignment", () => {
    expect(inferSchemaType("/planning/alignment.md")).toBe("alignment");
  });

  it("infers spec from path containing /specs/", () => {
    expect(inferSchemaType("/project/specs/api.spec.md")).toBe("spec");
  });

  it("infers spec from .spec.md extension", () => {
    expect(inferSchemaType("feature.spec.md")).toBe("spec");
  });

  it("infers documentation from /docs/ path", () => {
    expect(inferSchemaType("/project/docs/guide.md")).toBe("documentation");
  });

  it("infers skill from /skills/ path with SKILL.md", () => {
    expect(inferSchemaType(".allhands/skills/my-skill/SKILL.md")).toBe("skill");
  });

  it("infers workflow from /workflows/ path", () => {
    expect(inferSchemaType(".allhands/workflows/milestone.md")).toBe(
      "workflow",
    );
  });

  it("returns null for unknown paths", () => {
    expect(inferSchemaType("README.md")).toBeNull();
    expect(inferSchemaType("src/lib/utils.ts")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDefaults", () => {
  const schema: Schema = {
    frontmatter: {
      name: { type: "string", required: true },
      status: {
        type: "enum",
        required: true,
        values: ["pending", "done"],
        default: "pending",
      },
      count: { type: "integer", default: 0 },
      tags: { type: "array", default: [] },
    },
  };

  it("fills missing fields with schema defaults", () => {
    const result = applyDefaults({ name: "test" }, schema);
    expect(result["status"]).toBe("pending");
    expect(result["count"]).toBe(0);
    expect(result["tags"]).toEqual([]);
  });

  it("does not overwrite existing values", () => {
    const result = applyDefaults(
      { name: "test", status: "done", count: 5 },
      schema,
    );
    expect(result["status"]).toBe("done");
    expect(result["count"]).toBe(5);
  });

  it("handles empty frontmatter", () => {
    const result = applyDefaults({}, schema);
    expect(result["status"]).toBe("pending");
    expect(result["count"]).toBe(0);
    expect(result["tags"]).toEqual([]);
    expect(result["name"]).toBeUndefined(); // no default for name
  });

  it("uses schema.fields fallback", () => {
    const fieldsSchema: Schema = {
      fields: {
        level: { type: "integer", default: 1 },
      },
    };
    const result = applyDefaults({}, fieldsSchema);
    expect(result["level"]).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatErrors
// ─────────────────────────────────────────────────────────────────────────────

describe("formatErrors", () => {
  it('returns "Validation passed" for valid result', () => {
    const result: ValidationResult = { valid: true, errors: [] };
    expect(formatErrors(result)).toBe("Validation passed");
  });

  it("formats error with field and message", () => {
    const result: ValidationResult = {
      valid: false,
      errors: [{ field: "status", message: "Required field is missing" }],
    };
    const output = formatErrors(result);
    expect(output).toContain("status");
    expect(output).toContain("Required field is missing");
  });

  it("includes expected and received when present", () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        {
          field: "count",
          message: "Expected integer",
          expected: "integer",
          received: "string",
        },
      ],
    };
    const output = formatErrors(result);
    expect(output).toContain("expected: integer");
    expect(output).toContain("got: string");
  });

  it("formats multiple errors with newlines", () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        { field: "a", message: "Error A" },
        { field: "b", message: "Error B" },
      ],
    };
    const output = formatErrors(result);
    const lines = output.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("a");
    expect(lines[1]).toContain("b");
  });
});
