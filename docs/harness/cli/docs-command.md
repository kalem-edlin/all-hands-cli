---
description: "Documentation integrity system that validates file references and symbol lookups via ctags, detects stale hashes, and finalizes placeholder refs into versioned references with git commit hashes."
---

## Intent

Documentation in this codebase uses file-reference markers (with file path, symbol name, and git hash components) instead of code snippets. This solves the staleness problem -- when code changes, refs become stale rather than silently incorrect. The docs command provides the validation and finalization pipeline that makes this reference system work.

The core trade-off: **references add maintenance overhead but eliminate silent drift**. A stale ref is a known problem; a stale code snippet is an unknown one.

## Reference Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Placeholder: Writer creates ref marker
    Placeholder --> Finalized: ah docs finalize
    Finalized --> Valid: Hash matches current file
    Valid --> Stale: Source file modified
    Stale --> Finalized: ah docs finalize (re-run)
    Finalized --> Invalid: Symbol removed or file deleted
    Invalid --> [*]: Manual fix required
```

Writers create placeholder refs during authoring (file path and symbol name, without a hash). The finalize command resolves these into versioned refs by appending the git commit hash of the referenced file. Validation then checks that hashes still match and symbols still exist.

## Validation Pipeline

[ref:.allhands/harness/src/commands/docs.ts:validate:79b9873] orchestrates the full validation pass:

1. Check ctags availability ([ref:.allhands/harness/src/lib/ctags.ts:checkCtagsAvailable:79b9873])
2. Generate a ctags index for the project ([ref:.allhands/harness/src/lib/ctags.ts:generateCtagsIndex:79b9873])
3. Find all markdown files in the docs path ([ref:.allhands/harness/src/lib/docs-validation.ts:findMarkdownFiles:79b9873])
4. For each file, run [ref:.allhands/harness/src/lib/docs-validation.ts:validateDocs:79b9873] which:
   - Validates frontmatter (requires `description` field) via [ref:.allhands/harness/src/lib/docs-validation.ts:validateFrontMatter:79b9873]
   - Extracts all ref patterns via [ref:.allhands/harness/src/lib/docs-validation.ts:extractRefs:79b9873]
   - Validates each ref via [ref:.allhands/harness/src/lib/docs-validation.ts:validateRef:79b9873]
   - Detects placeholder hashes via [ref:.allhands/harness/src/lib/docs-validation.ts:detectPlaceholders:79b9873]
   - Detects unfinalized refs via [ref:.allhands/harness/src/lib/docs-validation.ts:detectUnfinalizedRefs:79b9873]

### Ref Validation Logic

[ref:.allhands/harness/src/lib/docs-validation.ts:validateRef:79b9873] classifies each reference into three states:

| State | Condition | Meaning |
|-------|-----------|---------|
| **valid** | File exists, hash matches, symbol found (if code file) | Reference is current |
| **stale** | File exists but hash differs from ref | Source has been modified since ref was created |
| **invalid** | File missing, git hash lookup failed, or symbol not found | Reference is broken |

For non-code files (markdown, YAML, JSON), the symbol portion is treated as a label -- only the file hash is verified. For code files, [ref:.allhands/harness/src/lib/ctags.ts:lookupSymbol:79b9873] checks that the symbol exists in the ctags index.

## Finalization

[ref:.allhands/harness/src/commands/docs.ts:finalize:79b9873] converts placeholder refs into finalized refs:

1. Scan all markdown files for ref patterns without existing hash
2. Batch-collect all referenced files and compute their git hashes via [ref:.allhands/harness/src/lib/docs-validation.ts:batchGetFileHashes:79b9873]
3. For each placeholder in [ref:.allhands/harness/src/commands/docs.ts:finalizeSingleFile:79b9873]:
   - Verify the file exists
   - Look up the git hash
   - For code files with symbols, verify the symbol exists via [ref:.allhands/harness/src/lib/ctags.ts:findSymbolInFile:79b9873]
   - Append the resolved git hash to each placeholder ref
4. Write modified content back to disk

Supports both single-file and directory (batch) operation. Certain paths are excluded from processing (e.g., `docs/memories.md`, `docs/solutions`).

## Ctags Integration

The ctags layer ([ref:.allhands/harness/src/lib/ctags.ts::79b9873]) provides symbol lookup without requiring language-specific AST parsers:

- [ref:.allhands/harness/src/lib/ctags.ts:generateCtagsIndex:79b9873] runs Universal Ctags to build an index mapping files to their symbols
- [ref:.allhands/harness/src/lib/ctags.ts:lookupSymbol:79b9873] finds symbols by name within a specific file
- [ref:.allhands/harness/src/lib/ctags.ts:findSymbolInFile:79b9873] is the single-file variant used during finalization
- [ref:.allhands/harness/src/lib/ctags.ts:searchSymbol:79b9873] searches across all files for a symbol name
- [ref:.allhands/harness/src/lib/ctags.ts:getFileSymbols:79b9873] returns all symbols in a file (used by the complexity command)

This design choice (ctags over AST parsing) trades precision for breadth -- ctags supports TypeScript, Python, Go, Rust, Java, and Ruby with a single tool.

## Doc Tree Coverage

[ref:.allhands/harness/src/commands/docs.ts:tree:79b9873] generates a source tree annotated with documentation coverage. For each source file, it checks whether a corresponding doc exists at predictable paths (`docs/{path}.md`, `docs/{dir}/{name}.md`, `docs/{path}/index.md`). The output includes coverage statistics (total files, covered files, percentage).
