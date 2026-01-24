/**
 * Schema Validation Library
 *
 * Loads YAML schema definitions and validates frontmatter/content against them.
 * Schemas are the single source of truth for file structure requirements.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SchemaField {
  type: 'string' | 'integer' | 'boolean' | 'date' | 'enum' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  description?: string;
  values?: string[]; // for enum type
  items?: string; // for array type (item type)
  properties?: Record<string, SchemaField>; // for object type
}

export interface BodySection {
  name: string;
  required: boolean;
  description?: string;
}

export interface Schema {
  frontmatter?: Record<string, SchemaField>;
  fields?: Record<string, SchemaField>; // alternative to frontmatter for status.yaml
  body?: {
    description?: string;
    sections?: BodySection[];
  };
}

export interface ValidationError {
  field: string;
  message: string;
  expected?: string;
  received?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const schemaCache = new Map<string, Schema>();

/**
 * Get the schema directory path
 * Path: harness/src/lib/ -> harness/src/ -> harness/ -> .allhands/ -> schemas/
 */
function getSchemaDir(): string {
  return join(__dirname, '..', '..', '..', 'schemas');
}

/**
 * Load a schema by type name
 */
export function loadSchema(type: string): Schema | null {
  if (schemaCache.has(type)) {
    return schemaCache.get(type)!;
  }

  const schemaPath = join(getSchemaDir(), `${type}.yaml`);
  if (!existsSync(schemaPath)) {
    return null;
  }

  try {
    const content = readFileSync(schemaPath, 'utf-8');
    const schema = parseYaml(content) as Schema;
    schemaCache.set(type, schema);
    return schema;
  } catch {
    return null;
  }
}

/**
 * List available schema types
 */
export function listSchemas(): string[] {
  const schemaDir = getSchemaDir();
  if (!existsSync(schemaDir)) {
    return [];
  }

  const { readdirSync } = require('fs');
  return readdirSync(schemaDir)
    .filter((f: string) => f.endsWith('.yaml'))
    .map((f: string) => f.replace('.yaml', ''));
}

/**
 * Validate a value against a field schema
 */
function validateField(
  value: unknown,
  field: SchemaField,
  fieldName: string
): ValidationError | null {
  // Check required
  if (field.required && (value === undefined || value === null)) {
    return {
      field: fieldName,
      message: `Required field is missing`,
      expected: field.type,
      received: 'undefined',
    };
  }

  // If not required and not present, use default or skip
  if (value === undefined || value === null) {
    return null;
  }

  // Type validation
  switch (field.type) {
    case 'string':
      if (typeof value !== 'string') {
        return {
          field: fieldName,
          message: `Expected string`,
          expected: 'string',
          received: typeof value,
        };
      }
      break;

    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return {
          field: fieldName,
          message: `Expected integer`,
          expected: 'integer',
          received: typeof value,
        };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return {
          field: fieldName,
          message: `Expected boolean`,
          expected: 'boolean',
          received: typeof value,
        };
      }
      break;

    case 'date':
      if (typeof value !== 'string' || isNaN(Date.parse(value))) {
        return {
          field: fieldName,
          message: `Expected ISO 8601 date string`,
          expected: 'date (ISO 8601)',
          received: String(value),
        };
      }
      break;

    case 'enum':
      if (!field.values?.includes(String(value))) {
        return {
          field: fieldName,
          message: `Value must be one of: ${field.values?.join(', ')}`,
          expected: field.values?.join(' | '),
          received: String(value),
        };
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return {
          field: fieldName,
          message: `Expected array`,
          expected: 'array',
          received: typeof value,
        };
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {
          field: fieldName,
          message: `Expected object`,
          expected: 'object',
          received: typeof value,
        };
      }
      // Validate nested properties if defined
      if (field.properties) {
        for (const [propName, propSchema] of Object.entries(field.properties)) {
          const propValue = (value as Record<string, unknown>)[propName];
          const error = validateField(propValue, propSchema, `${fieldName}.${propName}`);
          if (error) {
            return error;
          }
        }
      }
      break;
  }

  return null;
}

/**
 * Validate frontmatter against a schema
 */
export function validateFrontmatter(
  frontmatter: Record<string, unknown>,
  schema: Schema
): ValidationResult {
  const errors: ValidationError[] = [];
  const fields = schema.frontmatter || schema.fields || {};

  for (const [fieldName, fieldSchema] of Object.entries(fields)) {
    const error = validateField(frontmatter[fieldName], fieldSchema, fieldName);
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract frontmatter from markdown content
 */
export function extractFrontmatter(content: string): {
  frontmatter: Record<string, unknown> | null;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    return { frontmatter, body: match[2] };
  } catch {
    return { frontmatter: null, body: content };
  }
}

/**
 * Validate a file's content against its schema type
 */
export function validateFile(
  content: string,
  schemaType: string
): ValidationResult {
  const schema = loadSchema(schemaType);
  if (!schema) {
    return {
      valid: false,
      errors: [{ field: '_schema', message: `Unknown schema type: ${schemaType}` }],
    };
  }

  const { frontmatter } = extractFrontmatter(content);
  if (!frontmatter) {
    return {
      valid: false,
      errors: [{ field: '_frontmatter', message: 'Missing or invalid frontmatter' }],
    };
  }

  return validateFrontmatter(frontmatter, schema);
}

/**
 * Apply defaults from schema to frontmatter
 */
export function applyDefaults(
  frontmatter: Record<string, unknown>,
  schema: Schema
): Record<string, unknown> {
  const result = { ...frontmatter };
  const fields = schema.frontmatter || schema.fields || {};

  for (const [fieldName, fieldSchema] of Object.entries(fields)) {
    if (result[fieldName] === undefined && fieldSchema.default !== undefined) {
      result[fieldName] = fieldSchema.default;
    }
  }

  return result;
}

/**
 * Format validation errors for display
 */
export function formatErrors(result: ValidationResult): string {
  if (result.valid) {
    return 'Validation passed';
  }

  return result.errors
    .map((e) => {
      let msg = `• ${e.field}: ${e.message}`;
      if (e.expected) msg += ` (expected: ${e.expected})`;
      if (e.received) msg += ` (got: ${e.received})`;
      return msg;
    })
    .join('\n');
}
