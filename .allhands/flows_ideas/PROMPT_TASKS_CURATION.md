IMPORTANT: Will do something similar to this, but MUCH less context, and using the correct `ah` cli commands.


I need you to look at @.planning/plan.md and understand it. Your task is going to be as a solutions planning architect, to break apart the plan into test+validation iterations (each one will be its own prompt file). Think about how a human would approach the giant task. What would they test first and quickly in order to validate that they are building something that works and is worth it? For example setting up something to get a hello world, that could be a prompt file in this context. We want to break up the plan into many prompt files, each with 2 - 5 small tasks (not limited to this) that end with some kind of validation that is logical to run for work validation / confirmation of working, after the amount of changes you chose. Essentially you are pulling in small tasks into files that are validatable in a meaningful way that shows meaningful progess (eg compiles, builds, tests pass, dry run succeeds, proper run shows signs of life, logs are correct, sub agent validated that it looks good, etc). You are a solutions architect expert and product manager, so you should know the best steps to derisk important things first, compounding on refinement after ach subsqueent task. We could end up with many tasks for this, so dont hold back / try to stick under a limit of task files

  You Must Ask Yourself:
  * What human blockers are there for this task (manual setup tasks, api_keys, passwords, domain knowledge required, a need for an authoritative human test set (for TRUE validation) (EG visual, emotional, sentiment information / data), validation tools need launching / configuring etc) that any prompts in this plan will rely on?
  * Any of these human blockers for implementation work planned MUST be prepared as the FIRST prompt, where the agent is prompted to figure out exactly what is needed for these blockers, and to ask the human to complete the tasks using the AskUserQuestion tool as waiting gates.
  * You must only assign allowed_to_ask_user_for_input to true for the first prompt file, IF it needs it.
  * The last prompt created MUST instruct the agent to consider all of the implementation work done, the wider goals of the plan in .planning/plan.md, and individual prompt file summairies + added capabilities, to create a human followable test plan for the final task, that is a full E2E test of the plan. It must also ensure that the testable capabilities are runnable via existing scripts / commands / tools that the human dev would use (eg pnpm scripts wrapping python scripts, or pnpm scripts that launches a dev server etc).

  So rememebr that is:
  * Consistent NUMBERED prompt file naming
  * An indication of whether it is done or not in the name of the file AND in the files header
  * 2 - 5 tasks, and relevant codebase files / technlogical pseudocode / resources for further research that may have been
  included in the full plan - essentially the detail per task can be as verbose as you like, so long as the tasks will be
  deterministic to achieve, and broken down into granular actions (not too small) (some may require some intense thought /
  deepdiving / trial and error - so factor that in, that kind of emergent complexity is acceptable.
  * Acceptance criteria, EG what does it take for this prompt to be validated and marked as complete. Must be validation
  techniques that at some point in the process add up to prove out a full E2E test of this. Remember human validation is not
  going to be avialble until the very last task, so leverage whatever you can programatically to allow for validation
  * any thing else unstructed in this file that is relevant to the task is fine for you to include - there is no important
  structue- you are the planning solutions architect / product manager expert after all - I am not.


Prompt file front matter:

```markdown
---
number: [number of prompt file]
goal: [goal of prompt file]
status: [done, draft]
allowed_to_ask_user_for_input: [true, false]
---
```