/**
 * Tree-sitter query patterns for symbol resolution across languages.
 * Used by docs commands to find symbols for reference formatting.
 */

export type SymbolType = "function" | "class" | "variable" | "type" | "export" | "method" | "struct";

export interface SymbolQuery {
  query: string;
  nameCapture: string;
  defCapture?: string; // Capture for full definition range (optional, falls back to name)
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
      query: `(function_declaration name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    class: {
      query: `(class_declaration name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    variable: {
      query: `(variable_declarator name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    type: {
      query: `(type_alias_declaration name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    interface: {
      query: `(interface_declaration name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    method: {
      query: `(method_definition name: (property_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    export: {
      query: `(export_statement declaration: (function_declaration name: (identifier) @name)) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    arrowFunction: {
      query: `(lexical_declaration
        (variable_declarator
          name: (identifier) @name
          value: (arrow_function))) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
  },

  javascript: {
    function: {
      query: `(function_declaration name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    class: {
      query: `(class_declaration name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    variable: {
      query: `(variable_declarator name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    method: {
      query: `(method_definition name: (property_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    arrowFunction: {
      query: `(lexical_declaration
        (variable_declarator
          name: (identifier) @name
          value: (arrow_function))) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
  },

  python: {
    function: {
      query: `(function_definition name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    class: {
      query: `(class_definition name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    variable: {
      query: `(assignment left: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    method: {
      query: `(function_definition name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
  },

  go: {
    function: {
      query: `(function_declaration name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    type: {
      query: `(type_declaration (type_spec name: (type_identifier) @name)) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    method: {
      query: `(method_declaration name: (field_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    variable: {
      query: `(var_declaration (var_spec name: (identifier) @name)) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    const: {
      query: `(const_declaration (const_spec name: (identifier) @name)) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
  },

  rust: {
    function: {
      query: `(function_item name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    struct: {
      query: `(struct_item name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    enum: {
      query: `(enum_item name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    impl: {
      query: `(impl_item type: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    trait: {
      query: `(trait_item name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    const: {
      query: `(const_item name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
  },

  java: {
    class: {
      query: `(class_declaration name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    interface: {
      query: `(interface_declaration name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    method: {
      query: `(method_declaration name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    field: {
      query: `(field_declaration declarator: (variable_declarator name: (identifier) @name)) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    enum: {
      query: `(enum_declaration name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
  },

  ruby: {
    function: {
      query: `(method name: (identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    class: {
      query: `(class name: (constant) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    module: {
      query: `(module name: (constant) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
  },

  swift: {
    function: {
      query: `(function_declaration name: (simple_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    class: {
      query: `(class_declaration name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    struct: {
      query: `(struct_declaration name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    enum: {
      query: `(enum_declaration name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
    },
    protocol: {
      query: `(protocol_declaration name: (type_identifier) @name) @def`,
      nameCapture: "name",
      defCapture: "def",
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
