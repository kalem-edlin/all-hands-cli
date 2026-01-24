NOTES:
* Reads:
  * alignment docs
  * spec doc
  * all prompt files
  * commit message history
* Focuses on:
  * Design decisions given limitations, constraints, and codebase realities
  * Recorded user decisions + user rejections + user frustrations
  * Failed prompts and why they failed (multiple times)
  * Patch prompts and why they were invoked by the user - was it conflicting with their expecations (bad ideation -> plan), or bug fixing / errors (bad prompt creation / execution)
  * Emergent refinement prompts and why they were included / excluded give great signals into user intent / goals knowledge that can persist along side changes from this milestone.
  * Review prompts and how many were needed (bad prompt creation / prompt creation review)
* **Skills/Validation Tooling Feedback Analysis**:
  * For each user-patch prompt, check its `patches_prompts` field
  * Cross-reference those original prompts' `skills` and `validation_suites` frontmatter
  * Identify which tooling files may be problematic (skills that led to bad guidance, validation suites that missed issues)
  * Fix problematic tooling files directly when patterns are clear
  * Document findings in compounding_summary.md
* Harness Maintainance application of learnings (compounding!!):
  * Some kind of Decision Tree:
    * Were initial user ideas perpetuated, or were they forgotten? -> MILESTONE_PLANNING
    * Did it take more prompts than expected to solve the ideation? -> PROMPT_TASK_CURATION
  * Read `.allhands/flows/HARNESS_FUNCTIONALITY.md` to understand the harness and improving /tuning its funcitonality  execute `.allhands/flows/HARNESS_FLOWS.md` and  with all of your harness efficacy deductions from this milestone's resources being sure to ASK USER QUESTION before you make changes to the hanress itself - making sure to make adequate updates to the .allhands/flows/HARNESS_FUNCTIONALITY.md file itself upon core changes
  * This shouldactually be like mini `./ideation_session.md` but for the harness itself where the initial ideas come from the refelctions done above - AND allowing the user to contribute some ideas / paintpoints they themselve realised throughout the harness use for this active branch via  interview style ideation of further hanress improvements than already proposed initially. Ensure questinos / concerns are asked with referneces / in regards to the `.allhands/principles.md` document to ensure everything aligns with the goals of the harness.
* There will be a rule to write memories (things worth remembering as self contained brief descirptions of learnings / knowledge (1 - 3 sentences)).
  * This is a temporary solution to memories (1 way - writing only for now, until we find a better way to store / retrieve them as needed). We are doing this now so as not to lose any valuable infromation regarding these potential memories 
  * Write to the `.allhands/memories.md` file:
    * A single line per memory:
    * [Memory Name] | [Harness Domain: "planning", "validation", "implementation" or "harness-tooling", "ideation"] | [Source: "user-steering", "agent-infered"] [Memory Description (1 - 3 sentences)]
* Must cleanup the current milestone spec file with all the relevant learnings from implementation / user planning / discussion, by ammending spec expecataions, documenting what changed based on necesssary and overall using it as a historical document of decisions made and epxecations outlined for a specific feature!:
* **Compounding Summary Output**: At end of compounding, write `.planning/<milestone>/compounding_summary.md`:
  ```markdown
  # Compounding Summary

  ## Detected Issues
  - [List patterns detected from user patches, failed prompts, user feedback]

  ## Tooling Fixes
  - [Skill file changes made]
  - [Validation suite changes made]

  ## Flow Updates
  - [Any flow file adjustments]

  ## Memories Added
  - [References to new entries in .allhands/memories.md]

  ## User Feedback Addressed
  - [Specific user concerns that were resolved through compounding]
  ```
* This should be fairly idempotent. IE if the compounding is run again straght agter it was already run and the HARNESS MAINTAINED FILES have not changed, or the codebase  implementation has not changed either, then comopunding should have nothing to do. Not sure how to maintain this.
* other misc notes:
  - [ ] Compounding
      - [ ] All contain user decisions, Agentic compromise, limitations and key learnings for future iteration to remember. For now place the MEMORY ASSETS in a simple file, line separated
      - [ ] The rest get engrained into docs + completed spec file user intent touch ups / (reduction of code to file references? Is this worth it?)
      - [ ] Also obviously running an audit on the harness itself with the perspective of these learnings + painpoints / extra prompt steps the user had to take to debug, adjust, and have refined for their workflow experience - all of this SHOUOD be tracked

