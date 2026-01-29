<goal>
Ground ideation in state-of-the-world codebase reality. Per **Ideation First**, understand both what is implemented AND what is planned for implementation to inform the ideation interview.
</goal>

<inputs>
- Collection of seed information/queries from engineer's initial ideation prompt
</inputs>

<outputs>
- Relevant codebase files with details, use cases, and engineering knowledge
- List of milestone dependencies by name
- Per dependency: key features to ASSUME EXISTS, or open decisions to ASSUME AT LEAST ONE OF EXISTS
</outputs>

<constraints>
- MUST search roadmap first to identify planned dependencies
- MUST overlay codebase findings against roadmap to account for future changes
- MUST use LSP before file reads for referenced symbols
</constraints>

## Roadmap Search

Run roadmap queries in parallel first:
- Run `ah knowledge roadmap search "<query>"` for each input query
- Identify planned work that ideation will build on top of
- These become milestone dependencies

## Codebase Search

For existing implementation understanding:
- Run `ah knowledge docs search "<query>"` for each input query (parallel)
- Extract patterns, solutions, and engineer reasoning
- Use LSP to navigate referenced symbols FIRST
- Only read files if LSP not possible

## Synthesis

Combine roadmap and codebase findings:
- Account for codebase patterns that may change when dependencies are implemented
- Identify which current patterns will remain vs. be superseded

## Output Formatting

Provide:
- Codebase files with most relevant details for ideation interview
- Milestone dependencies by name
- Per dependency:
  - Features to ASSUME EXISTS (definite implementations)
  - Features to ASSUME AT LEAST ONE OF EXISTS (open approach decisions)