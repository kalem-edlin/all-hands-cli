/**
 * Solutions Command (Agent-Facing)
 *
 * Grep-based search for documented solutions in docs/solutions/.
 * Uses frontmatter fields (tags, module, component, symptoms) for precise matching.
 *
 * Usage:
 *   ah solutions search <query>           Search solutions by keywords
 *   ah solutions search <query> --full    Include full content of matches
 *   ah solutions list                     List all solution categories
 *   ah solutions list <category>          List solutions in a category
 */

import { Command } from 'commander';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import { parse } from 'yaml';

const getProjectRoot = (): string => {
  return process.env.PROJECT_ROOT || process.cwd();
};

const getSolutionsDir = (): string => {
  return join(getProjectRoot(), 'docs', 'solutions');
};

interface SolutionFrontmatter {
  title: string;
  date: string;
  milestone?: string;
  problem_type: string;
  component: string;
  symptoms: string[];
  root_cause: string;
  severity: string;
  tags: string[];
  source?: string;
}

interface SolutionMatch {
  path: string;
  frontmatter: SolutionFrontmatter;
  score: number;
  matchedFields: string[];
}

/**
 * Extract keywords from a search query.
 * Handles quoted phrases and splits on whitespace.
 */
function extractKeywords(query: string): string[] {
  const keywords: string[] = [];

  // Extract quoted phrases first
  const quotedRegex = /"([^"]+)"/g;
  let match;
  while ((match = quotedRegex.exec(query)) !== null) {
    keywords.push(match[1].toLowerCase());
  }

  // Remove quoted phrases and split remaining on whitespace
  const remaining = query.replace(quotedRegex, '').trim();
  if (remaining) {
    keywords.push(...remaining.toLowerCase().split(/\s+/).filter(k => k.length > 0));
  }

  return keywords;
}

/**
 * Parse YAML frontmatter from a markdown file.
 */
function parseFrontmatter(filePath: string): SolutionFrontmatter | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const parsed = parse(fmMatch[1]) as SolutionFrontmatter;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Score how well a solution matches the search keywords.
 */
function scoreSolution(fm: SolutionFrontmatter, keywords: string[]): { score: number; matchedFields: string[] } {
  let score = 0;
  const matchedFields: string[] = [];

  for (const keyword of keywords) {
    // Title match (high weight)
    if (fm.title?.toLowerCase().includes(keyword)) {
      score += 3;
      if (!matchedFields.includes('title')) matchedFields.push('title');
    }

    // Tags match (high weight)
    if (fm.tags?.some(t => t.toLowerCase().includes(keyword))) {
      score += 3;
      if (!matchedFields.includes('tags')) matchedFields.push('tags');
    }

    // Component match (medium weight)
    if (fm.component?.toLowerCase().includes(keyword)) {
      score += 2;
      if (!matchedFields.includes('component')) matchedFields.push('component');
    }

    // Symptoms match (medium weight)
    if (fm.symptoms?.some(s => s.toLowerCase().includes(keyword))) {
      score += 2;
      if (!matchedFields.includes('symptoms')) matchedFields.push('symptoms');
    }

    // Problem type match (low weight)
    if (fm.problem_type?.toLowerCase().includes(keyword)) {
      score += 1;
      if (!matchedFields.includes('problem_type')) matchedFields.push('problem_type');
    }

    // Root cause match (low weight)
    if (fm.root_cause?.toLowerCase().replace(/_/g, ' ').includes(keyword)) {
      score += 1;
      if (!matchedFields.includes('root_cause')) matchedFields.push('root_cause');
    }
  }

  return { score, matchedFields };
}

/**
 * Find all solution files in the solutions directory.
 */
function findSolutionFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findSolutionFiles(fullPath));
    } else if (entry.endsWith('.md') && !entry.startsWith('README')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Get all category directories.
 */
function getCategories(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(entry => {
      const fullPath = join(dir, entry);
      return statSync(fullPath).isDirectory();
    })
    .sort();
}

/**
 * Search for solutions matching the query.
 */
function searchSolutions(query: string, limit: number = 10): SolutionMatch[] {
  const solutionsDir = getSolutionsDir();
  const keywords = extractKeywords(query);

  if (keywords.length === 0) {
    return [];
  }

  const files = findSolutionFiles(solutionsDir);
  const matches: SolutionMatch[] = [];

  for (const file of files) {
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    const { score, matchedFields } = scoreSolution(frontmatter, keywords);

    if (score > 0) {
      // Make path relative to project root
      const relativePath = file.replace(getProjectRoot() + '/', '');
      matches.push({
        path: relativePath,
        frontmatter,
        score,
        matchedFields,
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, limit);
}

/**
 * Get full content of a solution file (without frontmatter).
 */
function getSolutionContent(filePath: string): string | null {
  try {
    const fullPath = filePath.startsWith('/') ? filePath : join(getProjectRoot(), filePath);
    const content = readFileSync(fullPath, 'utf-8');
    // Remove frontmatter
    return content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  } catch {
    return null;
  }
}

export function register(program: Command): void {
  const solutionsCmd = program
    .command('solutions')
    .description('Search and browse documented solutions');

  // Search command
  solutionsCmd
    .command('search <query>')
    .description('Search solutions by keywords (searches title, tags, component, symptoms)')
    .option('--full', 'Include full content of matched solutions')
    .option('--limit <n>', 'Maximum number of results', '10')
    .action(async (query: string, options: { full?: boolean; limit?: string }) => {
      const limit = parseInt(options.limit || '10', 10);
      const matches = searchSolutions(query, limit);

      if (matches.length === 0) {
        console.log(JSON.stringify({
          success: true,
          query,
          keywords: extractKeywords(query),
          results: [],
          message: 'No matching solutions found',
        }, null, 2));
        return;
      }

      // Format output
      const results = matches.map(match => {
        const result: Record<string, unknown> = {
          path: match.path,
          title: match.frontmatter.title,
          score: match.score,
          matched_fields: match.matchedFields,
          severity: match.frontmatter.severity,
          problem_type: match.frontmatter.problem_type,
          component: match.frontmatter.component,
          tags: match.frontmatter.tags,
        };

        if (options.full) {
          result.content = getSolutionContent(match.path);
        }

        return result;
      });

      console.log(JSON.stringify({
        success: true,
        query,
        keywords: extractKeywords(query),
        result_count: results.length,
        results,
      }, null, 2));
    });

  // List command
  solutionsCmd
    .command('list [category]')
    .description('List solution categories or solutions in a category')
    .action(async (category?: string) => {
      const solutionsDir = getSolutionsDir();

      if (!category) {
        // List all categories
        const categories = getCategories(solutionsDir);

        if (categories.length === 0) {
          console.log(JSON.stringify({
            success: true,
            message: 'No solution categories found. Create docs/solutions/<category>/ directories.',
            categories: [],
          }, null, 2));
          return;
        }

        // Count solutions in each category
        const categoryCounts = categories.map(cat => {
          const catDir = join(solutionsDir, cat);
          const files = findSolutionFiles(catDir);
          return { category: cat, count: files.length };
        });

        console.log(JSON.stringify({
          success: true,
          categories: categoryCounts,
        }, null, 2));
        return;
      }

      // List solutions in specific category
      const categoryDir = join(solutionsDir, category);

      if (!existsSync(categoryDir)) {
        const available = getCategories(solutionsDir);
        console.log(JSON.stringify({
          success: false,
          error: `Category not found: ${category}`,
          available_categories: available,
        }, null, 2));
        process.exit(1);
      }

      const files = findSolutionFiles(categoryDir);
      const solutions = files.map(file => {
        const fm = parseFrontmatter(file);
        const relativePath = file.replace(getProjectRoot() + '/', '');
        return {
          path: relativePath,
          title: fm?.title || basename(file, '.md'),
          date: fm?.date,
          severity: fm?.severity,
          tags: fm?.tags || [],
        };
      });

      // Sort by date descending
      solutions.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.localeCompare(a.date);
      });

      console.log(JSON.stringify({
        success: true,
        category,
        solution_count: solutions.length,
        solutions,
      }, null, 2));
    });
}
