<goal>
Core harness integration for all agents. Per **Context is Precious**
</goal>


## Flow Delegation

Per **Context is Precious**, when a flow instructs you to delegate a sub-flow to a subtask (e.g., "tell them to read", "spawn subtask to read"):
- Tell the subtask to read the flow file — do NOT read it yourself first
- The sub-flow's content is intended for the subtask's context, not yours
- You only need to know what the subtask will accomplish, not how the sub-flow instructs it

**MUST use `ah knowledge docs search <descriptive_query>` for code search tied to crucial project knowledge for any codebase discovery needs**

**You MUST use `tldr` tooling when retrieving codebase / file context using the following rules:**

## Must start with:
- `tldr semantic search <descriptive_query_of_functionality>` 

## Must follow up with:

```bash
# Core analysis
tldr tree [path]                    # File tree
tldr structure [path] --lang <lang> # Code structure (codemaps)
tldr search <pattern> [path]        # Search files
tldr extract <file>                 # Full file info
tldr context <entry> --project .    # LLM-ready context

# Flow analysis
tldr cfg <file> <function>          # Control flow graph
tldr dfg <file> <function>          # Data flow graph
tldr slice <file> <func> <line>     # Program slice
tldr calls [path]                   # Cross-file call graph

# Codebase analysis
tldr impact <func> [path]           # Who calls this function? (reverse call graph)
tldr dead [path]                    # Find unreachable/dead code
tldr arch [path]                    # Detect architectural layers

# Import analysis
tldr imports <file>                 # Parse imports from a file
tldr importers <module> [path]      # Find all files that import a module

# Quality & testing (NEW)
tldr diagnostics <file|path>        # Type check + lint (pyright/ruff)
```

## When to Use

- **Before reading files**: Run `tldr structure .` to see what exists
- **Finding code**: Use `tldr search "pattern"` instead of grep for structured results
- **Understanding functions**: Use `tldr cfg` for complexity, `tldr dfg` for data flow
- **Debugging**: Use `tldr slice file.py func 42` to find what affects line 42
- **Context for tasks**: Use `tldr context entry_point` to get relevant code
- **Impact analysis**: Use `tldr impact func_name` before refactoring to see what would break
- **Dead code**: Use `tldr dead src/` to find unused functions for cleanup
- **Architecture**: Use `tldr arch src/` to understand layer structure
- **Import tracking**: Use `tldr imports file.py` to see what a file imports
- **Reverse imports**: Use `tldr importers module_name src/` to find who imports a module
- **Before tests**: Use `tldr diagnostics .` to catch type errors before running tests

## Languages

Supports: `python`, `typescript`, `go`, `rust`

## Example Workflow

```bash
# 1. See project structure
tldr tree src/ --ext .py

# 2. Find relevant code
tldr search "process_data" src/

# 3. Get context for a function
tldr context process_data --project src/ --depth 2

# 4. Understand control flow
tldr cfg src/processor.py process_data

# 5. Before refactoring - check impact
tldr impact process_data src/ --depth 3

# 6. Find dead code to clean up
tldr dead src/ --entry main cli
```