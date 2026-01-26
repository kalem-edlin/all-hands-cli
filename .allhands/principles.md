## First Principles Driving This Architecture

### 1. Context is Precious
**Problem**: Agents degrade with large context windows. Too much information = worse decisions.

**Solution**:
- Isolated units of work (prompt files) with minimal scope (3-5 tasks)
- Shared information is concise and intentional (alignment docs, not full history)
- Progressive disclosure - agents only see what they need, when they need it
- Loop architecture naturally bounds context per execution

### 2. Prompt Files as Units of Work
**Why this structure**:
- **Language of implementation**: Prompts ARE the tasks, not descriptions of tasks
- **Tokens of coordination**: Other agents (planners, reviewers) speak in prompt files
- **Iterative refinement**: Same prompt can be re-run with accumulated learnings
- **Record of decisions**: Completed prompts document what was decided, not just done

### 3. Ideation First
**Why front-load exploration**:
- Prevents low-level decision fatigue during implementation
- Discovers limitations early (before they block progress)
- Allows engineers to go as deep as desired during ideation
- Compounds on roadmap dependencies regardless of implementation order
- Consolidates user expectations, desires, concerns upfront

### 4. Quality Engineering (Not Quantity Engineering)
**The shift**:
- With cheap software, the question isn't "can we build it?" but "which variant is best?"
- Plan agents turn open questions into **variant prompt files with validation requirements**
- Engineering effort goes to **quality control of variants**, not implementation
- Decision points: consolidate to convention, kill, or ship for A/B testing

### 5. Frontier Models are Capable
**What agents need**:
- Control flows as core direction (not micromanagement)
- Critical motivations for their allocated responsibility
- Knowledge of how/when to call harness tooling
- They turn **why** and **what** into **how**

### 6. Agentic Validation Tooling
**Why tight validation**:
- Programmatic validation > human supervision
- Strict acceptance criteria make prompt work verifiable
- Types of validation: tests, UI automation, profiling, script results
- Makes engineering supervision redundant for routine checks
- Validation tooling is infrastructure - assess gaps before planning, create via specs

### 7. Knowledge Compounding
**Everything feeds forward**:
- Decisions, pivots, limitations, disagreements
- Realizations, best practices, preferences
- The harness implementation itself improves with use
- Future tasks benefit from all past work


---

## Core Philosophy: This Harness Enables The Model-First Company 

The harness exists to facilitate a fundamental shift in how software organizations operate:

### 1. Software is Cheap, Expertise is Valuable
- AI has made code generation nearly free
- The bottleneck is now **ideation** and **quality judgment**
- The harness optimizes for capturing human expertise and translating it to agent-executable work

### 2. Product is Centralized
- Single source of truth: codebase + connected services + compounded validation
- Anyone can "talk to the product" through the harness
- Removes knowledge silos between teams

### 3. New Organizational Roles
| Traditional | Model-First |
|------------|-------------|
| Developers write code | **Product Stakeholders** test, ideate, design |
| Managers coordinate | **Product Engineers** scope, orchestrate, release |
| Hierarchies gatekeep | Hierarchies become redundant |

### 4. Ship Fast, Hide Uncertainty
- Push frequently to main
- Feature flags hide incomplete work
- Convention is safe; experimentation is cheap

