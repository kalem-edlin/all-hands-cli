<goal>
Find and extract domain expertise from skills to embed in prompt instructions. This flow teaches agents how to discover relevant skills and integrate their knowledge into task guidance.
</goal>

<inputs>
- Files/domains involved in the implementation task
- The nature of the changes (UI, native code, deployment, etc.)
</inputs>

<motivations>
- Skills are "how to do it right" - domain expertise that should guide implementation
- Knowledge should be embedded in prompt instructions, not discovered during execution
- Executors already have enough cognitive load; baked-in guidance is more effective
- Fallback: Executors can still read skill files if stuck (referenced in frontmatter)
</motivations>

## Step 1: Discover Available Skills

Run the list command to see all skills:
```bash
ah skills list
```

This returns JSON with each skill's:
- `name`: Skill identifier
- `description`: Use case (when/why to use)
- `globs`: File patterns it applies to
- `file`: Path to the full skill documentation

## Step 2: Identify Relevant Skills

Match skills to your task using two approaches:

**A. Glob pattern matching** (programmatic hint):
- Compare files you're touching against each skill's `globs`
- Skills with matching patterns are likely relevant

**B. Description inference** (semantic understanding):
- Read skill descriptions
- Match against the nature of your task (UI changes, deployment, native modules, etc.)

Select all skills that apply to your implementation scope.

## Step 3: Read Skill Documentation

For each relevant skill, read the full file:
```bash
# Path from the list output
cat .allhands/skills/<skill-name>/SKILL.md
```

Extract:
- **Key patterns**: Code patterns, library preferences, common pitfalls
- **Best practices**: Guidelines specific to this domain
- **References**: Sub-documents within the skill folder for deeper context

## Step 4: Extract Knowledge for Prompt

Synthesize skill content into actionable prompt guidance:

1. **Distill key instructions** - Extract the most important patterns and rules
2. **Include specific examples** - Use code snippets from skills where relevant
3. **Reference sources** - Note which skill files informed the guidance
4. **Avoid duplication** - Don't copy entire skill files; extract what's task-relevant

## Step 5: Output with Sources

When completing this flow, output:

1. **Extracted knowledge**: The distilled guidance to embed in the prompt
2. **Sources consulted**: List of skill file paths that informed the extraction

Example output:
```
## Skill-Derived Guidance

### From building-expo-ui:
- Use `<Link.Preview>` for context menus
- Prefer `contentInsetAdjustmentBehavior="automatic"` over SafeAreaView
- Use inline styles, not StyleSheet.create

### From react-native-best-practices:
- Profile with React DevTools before optimizing
- Use FlashList for lists with >50 items

## Sources Consulted
- .allhands/skills/building-expo-ui/SKILL.md
- .allhands/skills/react-native-best-practices/SKILL.md
```

## For Prompt Curation

When using this flow during prompt creation (via PROMPT_TASKS_CURATION):
- Add matched skill file paths to the prompt's `skills` frontmatter
- Embed extracted guidance directly in the prompt's Tasks section
- This makes the domain expertise explicit and immediately available to executors
