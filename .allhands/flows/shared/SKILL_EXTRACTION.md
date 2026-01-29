<goal>
Find and extract domain expertise from skills to embed in prompt instructions. Per **Knowledge Compounding**, skills are "how to do it right" - expertise that compounds across prompts.
</goal>

<inputs>
- Files/domains involved in the implementation task
- Nature of the changes (UI, native code, deployment, etc.)
</inputs>

<outputs>
- Extracted knowledge distilled for prompt embedding
- Sources consulted (skill file paths)
</outputs>

<constraints>
- MUST run `ah skills list` to discover available skills
- MUST match skills via both glob patterns AND description inference
- MUST extract task-relevant knowledge, not copy entire skill files
- MUST list sources consulted in output
</constraints>

## Step 1: Discover Available Skills

- Run `ah skills list`
- Returns JSON with: `name`, `description`, `globs`, `file` path

## Step 2: Identify Relevant Skills

Match skills using two approaches:

**Glob pattern matching** (programmatic):
- Compare files you're touching against each skill's `globs`
- Skills with matching patterns are likely relevant

**Description inference** (semantic):
- Read skill descriptions
- Match against task nature (UI, deployment, native modules, etc.)

Select all skills that apply to implementation scope.

## Step 3: Read Skill Documentation

For each relevant skill, read the full file:
- Read `.allhands/skills/<skill-name>/SKILL.md`

Extract:
- **Key patterns**: Code patterns, library preferences, common pitfalls
- **Best practices**: Guidelines specific to this domain
- **References**: Sub-documents within the skill folder

## Step 4: Extract Knowledge for Prompt

Synthesize skill content into actionable prompt guidance:
- Distill key instructions
- Include specific examples where relevant
- Reference sources
- Avoid duplication - extract what's task-relevant

## Step 5: Output with Sources

Provide:

```
## Skill-Derived Guidance

### From building-expo-ui:
- Use `<Link.Preview>` for context menus
- Prefer `contentInsetAdjustmentBehavior="automatic"` over SafeAreaView

### From react-native-best-practices:
- Profile with React DevTools before optimizing
- Use FlashList for lists with >50 items

## Sources Consulted
- .allhands/skills/building-expo-ui/SKILL.md
- .allhands/skills/react-native-best-practices/SKILL.md
```

## For Prompt Curation

When used via PROMPT_TASKS_CURATION:
- Add skill file paths to prompt's `skills` frontmatter
- Embed extracted guidance in prompt's Tasks section
- Makes domain expertise explicit and immediately available to executors
