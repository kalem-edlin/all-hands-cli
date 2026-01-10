/**
 * Tree-sitter query patterns for symbol resolution across languages.
 * Used by docs commands to find symbols for reference formatting.
 */

export type SymbolType = "function" | "class" | "variable" | "type" | "export" | "method" | "struct";

export interface SymbolQuery {
  query: string;
  nameCapture: string;
}

export interface LanguageQueries {
  [key: string]: SymbolQuery;
}

/**
 * Language-specific tree-sitter queries for finding symbol definitions.
 * Each query captures the symbol name via @name capture group.
 */
export const languageQueries: Record<string, LanguageQueries> = {
  typescript: {
    function: {
      query: `(function_declaration name: (identifier) @name)`,
      nameCapture: "name",
    },
    class: {
      query: `(class_declaration name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    variable: {
      query: `(variable_declarator name: (identifier) @name)`,
      nameCapture: "name",
    },
    type: {
      query: `(type_alias_declaration name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    interface: {
      query: `(interface_declaration name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    method: {
      query: `(method_definition name: (property_identifier) @name)`,
      nameCapture: "name",
    },
    export: {
      query: `(export_statement declaration: (function_declaration name: (identifier) @name))`,
      nameCapture: "name",
    },
    arrowFunction: {
      query: `(lexical_declaration
        (variable_declarator
          name: (identifier) @name
          value: (arrow_function)))`,
      nameCapture: "name",
    },
  },

  javascript: {
    function: {
      query: `(function_declaration name: (identifier) @name)`,
      nameCapture: "name",
    },
    class: {
      query: `(class_declaration name: (identifier) @name)`,
      nameCapture: "name",
    },
    variable: {
      query: `(variable_declarator name: (identifier) @name)`,
      nameCapture: "name",
    },
    method: {
      query: `(method_definition name: (property_identifier) @name)`,
      nameCapture: "name",
    },
    arrowFunction: {
      query: `(lexical_declaration
        (variable_declarator
          name: (identifier) @name
          value: (arrow_function)))`,
      nameCapture: "name",
    },
  },

  python: {
    function: {
      query: `(function_definition name: (identifier) @name)`,
      nameCapture: "name",
    },
    class: {
      query: `(class_definition name: (identifier) @name)`,
      nameCapture: "name",
    },
    variable: {
      query: `(assignment left: (identifier) @name)`,
      nameCapture: "name",
    },
    method: {
      query: `(function_definition name: (identifier) @name)`,
      nameCapture: "name",
    },
  },

  go: {
    function: {
      query: `(function_declaration name: (identifier) @name)`,
      nameCapture: "name",
    },
    type: {
      query: `(type_declaration (type_spec name: (type_identifier) @name))`,
      nameCapture: "name",
    },
    method: {
      query: `(method_declaration name: (field_identifier) @name)`,
      nameCapture: "name",
    },
    variable: {
      query: `(var_declaration (var_spec name: (identifier) @name))`,
      nameCapture: "name",
    },
    const: {
      query: `(const_declaration (const_spec name: (identifier) @name))`,
      nameCapture: "name",
    },
  },

  rust: {
    function: {
      query: `(function_item name: (identifier) @name)`,
      nameCapture: "name",
    },
    struct: {
      query: `(struct_item name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    enum: {
      query: `(enum_item name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    impl: {
      query: `(impl_item type: (type_identifier) @name)`,
      nameCapture: "name",
    },
    trait: {
      query: `(trait_item name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    const: {
      query: `(const_item name: (identifier) @name)`,
      nameCapture: "name",
    },
  },

  java: {
    class: {
      query: `(class_declaration name: (identifier) @name)`,
      nameCapture: "name",
    },
    interface: {
      query: `(interface_declaration name: (identifier) @name)`,
      nameCapture: "name",
    },
    method: {
      query: `(method_declaration name: (identifier) @name)`,
      nameCapture: "name",
    },
    field: {
      query: `(field_declaration declarator: (variable_declarator name: (identifier) @name))`,
      nameCapture: "name",
    },
    enum: {
      query: `(enum_declaration name: (identifier) @name)`,
      nameCapture: "name",
    },
  },

  ruby: {
    function: {
      query: `(method name: (identifier) @name)`,
      nameCapture: "name",
    },
    class: {
      query: `(class name: (constant) @name)`,
      nameCapture: "name",
    },
    module: {
      query: `(module name: (constant) @name)`,
      nameCapture: "name",
    },
  },

  swift: {
    function: {
      query: `(function_declaration name: (simple_identifier) @name)`,
      nameCapture: "name",
    },
    class: {
      query: `(class_declaration name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    struct: {
      query: `(struct_declaration name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    enum: {
      query: `(enum_declaration name: (type_identifier) @name)`,
      nameCapture: "name",
    },
    protocol: {
      query: `(protocol_declaration name: (type_identifier) @name)`,
      nameCapture: "name",
    },
  },
};

/**
 * Extension to language mapping
 */
export const extensionToLanguage: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".rb": "ruby",
  ".swift": "swift",
};

/**
 * Get the language for a file extension
 */
export function getLanguageForExtension(ext: string): string | null {
  return extensionToLanguage[ext] || null;
}

/**
 * Get queries for a language
 */
export function getQueriesForLanguage(language: string): LanguageQueries | null {
  return languageQueries[language] || null;
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): boolean {
  return language in languageQueries;
}

/**
 * Get all supported extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(extensionToLanguage);
}
