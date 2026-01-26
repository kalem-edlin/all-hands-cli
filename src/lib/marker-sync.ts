import { existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * Ensure a line exists somewhere in a file.
 * If file doesn't exist, create it with just that line.
 * Appends to end of file if line doesn't already exist.
 * Returns true if changes were made.
 */
export function ensureLineInFile(filePath: string, line: string, verbose: boolean = false): boolean {
  let content = '';
  let existed = false;

  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
    existed = true;

    // Already has the line?
    if (content.includes(line)) {
      if (verbose) console.log(`  ${filePath} already contains: ${line}`);
      return false;
    }
  }

  // Append the line
  const lineWithNewline = line + '\n';

  if (existed && content.trim()) {
    // Ensure newline separation before appending
    const separator = content.endsWith('\n') ? '' : '\n';
    content = content + separator + lineWithNewline;
  } else {
    content = lineWithNewline;
  }

  writeFileSync(filePath, content);
  if (verbose) console.log(existed ? `  Updated ${filePath}` : `  Created ${filePath}`);

  return true;
}
