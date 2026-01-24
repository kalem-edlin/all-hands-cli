/**
 * Skills Command (Agent-Facing)
 *
 * Lists and discovers skills for domain expertise.
 * Agents use this to find relevant skills for their tasks.
 *
 * Usage: ah skills list
 */

import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SkillFrontmatter {
  name: string;
  description: string;
  globs: string[];
  version?: string;
  license?: string;
}

interface SkillEntry {
  name: string;
  description: string;
  globs: string[];
  file: string;
}

/**
 * Extract frontmatter from markdown content
 */
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Get the skills directory path
 */
function getSkillsDir(): string {
  return join(__dirname, '..', '..', 'skills');
}

/**
 * List all skills by reading SKILL.md files and extracting frontmatter
 */
function listSkills(): SkillEntry[] {
  const dir = getSkillsDir();

  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir);
  const skills: SkillEntry[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    const stat = statSync(entryPath);

    // Skip non-directories
    if (!stat.isDirectory()) continue;

    // Look for SKILL.md in the directory
    const skillFile = join(entryPath, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const content = readFileSync(skillFile, 'utf-8');
    const frontmatter = extractFrontmatter(content) as SkillFrontmatter | null;

    if (frontmatter && frontmatter.name && frontmatter.description && frontmatter.globs) {
      skills.push({
        name: frontmatter.name,
        description: frontmatter.description,
        globs: frontmatter.globs,
        file: `.allhands/skills/${entry}/SKILL.md`,
      });
    }
  }

  return skills;
}

export function register(program: Command): void {
  const cmd = program
    .command('skills')
    .description('Discover and list skills for domain expertise');

  cmd
    .command('list')
    .description('List all skills with their descriptions and glob patterns')
    .option('--json', 'Output as JSON (default)')
    .action(async () => {
      const skills = listSkills();

      if (skills.length === 0) {
        console.log(JSON.stringify({
          success: true,
          skills: [],
          message: 'No skills found. Create skills in .allhands/skills/<name>/SKILL.md using `ah schema skill` for the file structure.',
        }, null, 2));
        return;
      }

      console.log(JSON.stringify({
        success: true,
        skills,
        count: skills.length,
      }, null, 2));
    });
}
