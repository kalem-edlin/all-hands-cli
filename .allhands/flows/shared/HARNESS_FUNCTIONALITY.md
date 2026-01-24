NOTES:
* Serves as rules on how to maintain / improve / tune the harness itself
* SPECIFIC First principles motivation: 
  * Context is Precious (saving context by processing infromation behind commands) 
  * Agentic Validation Tooling (mcp, and other commands are critical to using external validation tools that fit the workflow)
  * This flow espeically requires the reading of the full principles.md document to understand how to maintain commands / improve the support and consistency of the harness whilst upholding its first principles.
* Must detail the core rules of command usage to not break:
  * EG schema command reveals the exact structure and infriamtion required to write to HARNESSS MANAGED FILES (specs, documentation, prompts, alignment, etc) and fits the first principles of Models are Capable as it has an agent read the schema and write freely to these files as part of their flows.
  * EG validation runs on any HARNESS MANAGED FILE is  edited / written via a hook in order to validate and immediately report to the agent when their contribution is incorrectly formatted.
  * Hooks are used for context injection, enforcement of specific tool use, notifiactions, core hanress lifecylce like killing / compaction, etc and play on MULTIPLE first principles
  * knowledge: commands to enable search across project knowledge and codebase understanding
  * oracle: a mechanism with optinionated commands to interface with direct LLM inferencing for quick answers given the command fetches managed file information itself (saving the caller's context window)
  * git: commands to enable git operations within the harness that provide quick commands relative to whatever the repo's base branch is
* Must explain the TUI and its lifecylce. HAving maintainers of the harness functionality MUST have a deep understanding of the lifecycle and the core purpose of it and how it meets EVERY SINGLE FIRST PRINCIPLE. eg looping, prompts as units of work, agent coordination and orchestration for specific tasks, milestone focus etc.
  * Be sure to explian that the harness is ever changing and this file itself must be updated to reflect the latest changes and improvements giveen the `./HARNESS_FLOWS.md` file.
  * For example right now the hanress functionality lifecylce is best suited for milestone / ideation development. Not bug fixing, problem investations, performance improvements, etc.
* Must outline motications and rules for the agents/ directory (agent profiles and how they are used), schema/ (the standards of how HARNESS MANGED FILES pass infromation around the lifecycle of the harness)
* How the Harness is run and plugs into the coding agent (only claude code for now) via spawning a claude code instance with a specific `.allhands/harness/src/platforms/claude/settings.json` file so its hooks are correctly configured.
  * This is importnat to have loaded into context, because otherwise the coding agent will assume the settings file is broken / non exsiting, even though it will be CLI loaded with the corresponding settings file in teh @.allhands directory
* Explain how flows are progressivley disclosed, inherit to specific agents, and are the vessel used to inform agents on how to USE THE HARNESS via commands etc (a very valid and progressibly disclosing replacement of traditional MCP, Commands, Skills etc)
* This file just needs to provide one resource / knowledge base for all of the reponsibliities of this .allhands harness, and how to maintain / refine it. It is a strong overview / lookup map and it should be documented here that this will often go out of data, and the caller MUST be aware about updating this file whenever tuning/cahnges are being made to the harness


