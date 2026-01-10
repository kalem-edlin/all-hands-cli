/**
 * Type declarations for tree-sitter and language grammars.
 * These packages don't have bundled types, so we declare them here.
 */

declare module "tree-sitter" {
  export interface SyntaxNode {
    type: string;
    text: string;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
    children: SyntaxNode[];
    namedChildren: SyntaxNode[];
    childForFieldName(fieldName: string): SyntaxNode | null;
    parent: SyntaxNode | null;
  }

  export interface Tree {
    rootNode: SyntaxNode;
  }

  export interface Language {}

  export default class Parser {
    setLanguage(language: Language): void;
    parse(input: string): Tree;
  }
}

declare module "tree-sitter-typescript" {
  import { Language } from "tree-sitter";
  const grammar: { typescript: Language; tsx: Language };
  export default grammar;
}

declare module "tree-sitter-javascript" {
  import { Language } from "tree-sitter";
  const grammar: Language;
  export default grammar;
}

declare module "tree-sitter-python" {
  import { Language } from "tree-sitter";
  const grammar: Language;
  export default grammar;
}

declare module "tree-sitter-go" {
  import { Language } from "tree-sitter";
  const grammar: Language;
  export default grammar;
}

declare module "tree-sitter-rust" {
  import { Language } from "tree-sitter";
  const grammar: Language;
  export default grammar;
}

declare module "tree-sitter-java" {
  import { Language } from "tree-sitter";
  const grammar: Language;
  export default grammar;
}

declare module "tree-sitter-ruby" {
  import { Language } from "tree-sitter";
  const grammar: Language;
  export default grammar;
}

declare module "tree-sitter-swift" {
  import { Language } from "tree-sitter";
  const grammar: Language;
  export default grammar;
}
