/**
 * Memories Command (Agent-Facing)
 *
 * Keyword-based search for memories in docs/memories.md.
 * Parses markdown tables and searches across name, domain, source, description fields.
 *
 * Usage:
 *   ah memories search <query>                  Search memories by keywords
 *   ah memories search <query> --domain planning  Filter by domain
 *   ah memories search <query> --source user-steering  Filter by source
 *   ah memories list                            List memory sections with counts
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tracedAction } from '../lib/base-command.js';

const getProjectRoot = (): string => {
  return process.env.PROJECT_ROOT || process.cwd();
};

const getMemoriesPath = (): string => {
  return join(getProjectRoot(), 'docs', 'memories.md');
};

interface MemoryEntry {
  name: string;
  domain: string;
  source: string;
  description: string;
  specSection: string;
}

interface MemoryMatch extends MemoryEntry {
  score: number;
  matchedFields: string[];
}

interface MemorySection {
  name: string;
  count: number;
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
 * Parse markdown tables from memories.md into structured entries.
 * Expects tables with columns: Name, Domain, Source, Description
 * grouped under ## section headers.
 */
function parseMemories(filePath: string): MemoryEntry[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries: MemoryEntry[] = [];
  let currentSection = 'unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track section headers
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim();
      continue;
    }

    // Skip non-table lines, header rows, and separator rows
    if (!line.startsWith('|') || line.includes('---') || /\|\s*Name\s*\|/i.test(line)) {
      continue;
    }

    // Parse table row
    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length >= 4) {
      entries.push({
        name: cells[0],
        domain: cells[1],
        source: cells[2],
        description: cells[3],
        specSection: currentSection,
      });
    }
  }

  return entries;
}

/**
 * Get section names and entry counts from memories file.
 */
function getMemorySections(filePath: string): MemorySection[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const sections: MemorySection[] = [];
  let currentSection = '';
  let currentCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      if (currentSection) {
        sections.push({ name: currentSection, count: currentCount });
      }
      currentSection = trimmed.replace('## ', '').trim();
      currentCount = 0;
      continue;
    }

    // Count data rows (not headers or separators)
    if (currentSection && trimmed.startsWith('|') && !trimmed.includes('---') && !/\|\s*Name\s*\|/i.test(trimmed)) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 4) {
        currentCount++;
      }
    }
  }

  // Push final section
  if (currentSection) {
    sections.push({ name: currentSection, count: currentCount });
  }

  return sections;
}

/**
 * Score how well a memory matches the search keywords.
 */
function scoreMemory(entry: MemoryEntry, keywords: string[]): { score: number; matchedFields: string[] } {
  let score = 0;
  const matchedFields: string[] = [];

  for (const keyword of keywords) {
    // Name match (high weight)
    if (entry.name.toLowerCase().includes(keyword)) {
      score += 3;
      if (!matchedFields.includes('name')) matchedFields.push('name');
    }

    // Description match (medium weight)
    if (entry.description.toLowerCase().includes(keyword)) {
      score += 2;
      if (!matchedFields.includes('description')) matchedFields.push('description');
    }

    // Domain match (medium weight)
    if (entry.domain.toLowerCase().includes(keyword)) {
      score += 2;
      if (!matchedFields.includes('domain')) matchedFields.push('domain');
    }

    // Source match (low weight)
    if (entry.source.toLowerCase().includes(keyword)) {
      score += 1;
      if (!matchedFields.includes('source')) matchedFields.push('source');
    }
  }

  return { score, matchedFields };
}

/**
 * Search memories matching a query with optional filters.
 */
function searchMemories(
  query: string,
  options: { domain?: string; source?: string; limit?: number }
): MemoryMatch[] {
  const memoriesPath = getMemoriesPath();
  const keywords = extractKeywords(query);
  const limit = options.limit ?? 10;

  if (keywords.length === 0) return [];

  let entries = parseMemories(memoriesPath);

  // Apply filters
  if (options.domain) {
    entries = entries.filter(e => e.domain.toLowerCase() === options.domain!.toLowerCase());
  }
  if (options.source) {
    entries = entries.filter(e => e.source.toLowerCase() === options.source!.toLowerCase());
  }

  const matches: MemoryMatch[] = [];

  for (const entry of entries) {
    const { score, matchedFields } = scoreMemory(entry, keywords);
    if (score > 0) {
      matches.push({ ...entry, score, matchedFields });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, limit);
}

export function register(program: Command): void {
  const memoriesCmd = program
    .command('memories')
    .description('Search and browse project memories');

  // Search command
  memoriesCmd
    .command('search <query>')
    .description('Search memories by keywords (searches name, domain, source, description)')
    .option('--domain <domain>', 'Filter by domain (planning, validation, implementation, harness-tooling, ideation)')
    .option('--source <source>', 'Filter by source (user-steering, agent-inferred)')
    .option('--limit <n>', 'Maximum number of results', '10')
    .action(tracedAction('memories search', async (query: string, options: { domain?: string; source?: string; limit?: string }) => {
      const limit = parseInt(options.limit || '10', 10);
      const matches = searchMemories(query, {
        domain: options.domain,
        source: options.source,
        limit,
      });

      if (matches.length === 0) {
        console.log(JSON.stringify({
          success: true,
          query,
          keywords: extractKeywords(query),
          results: [],
          message: 'No matching memories found',
        }, null, 2));
        return;
      }

      const results = matches.map(match => ({
        name: match.name,
        domain: match.domain,
        source: match.source,
        description: match.description,
        spec_section: match.specSection,
        score: match.score,
        matched_fields: match.matchedFields,
      }));

      console.log(JSON.stringify({
        success: true,
        query,
        keywords: extractKeywords(query),
        result_count: results.length,
        results,
      }, null, 2));
    }));

  // List command
  memoriesCmd
    .command('list')
    .description('List memory sections with entry counts')
    .action(tracedAction('memories list', async () => {
      const memoriesPath = getMemoriesPath();

      if (!existsSync(memoriesPath)) {
        console.log(JSON.stringify({
          success: true,
          message: 'No memories file found. Create docs/memories.md to start capturing learnings.',
          sections: [],
          total_entries: 0,
        }, null, 2));
        return;
      }

      const sections = getMemorySections(memoriesPath);
      const totalEntries = sections.reduce((sum, s) => sum + s.count, 0);

      console.log(JSON.stringify({
        success: true,
        sections,
        total_entries: totalEntries,
      }, null, 2));
    }));
}
