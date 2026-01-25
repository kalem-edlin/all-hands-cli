import { existsSync, readFileSync, writeFileSync } from 'fs';

const SYNC_MARKER = '# ALLHANDS_SYNC';

/**
 * Sync lines after # ALLHANDS_SYNC marker from source to target file.
 *
 * - If target doesn't exist, copy the entire source file
 * - If target exists but has no marker, append marker + source lines
 * - If target has marker, replace everything after marker with source lines
 *
 * Returns true if changes were made.
 */
export function syncMarkerSection(sourcePath: string, targetPath: string, verbose: boolean = false): boolean {
  if (!existsSync(sourcePath)) {
    if (verbose) console.log(`  Source file not found: ${sourcePath}`);
    return false;
  }

  const sourceContent = readFileSync(sourcePath, 'utf-8');
  const sourceMarkerIndex = sourceContent.indexOf(SYNC_MARKER);

  if (sourceMarkerIndex === -1) {
    if (verbose) console.log(`  No ${SYNC_MARKER} marker in source`);
    return false;
  }

  // Get everything from marker onwards in source
  const sourceMarkerSection = sourceContent.slice(sourceMarkerIndex);

  if (!existsSync(targetPath)) {
    // Target doesn't exist - copy entire source
    if (verbose) console.log(`  Creating ${targetPath}`);
    writeFileSync(targetPath, sourceContent);
    return true;
  }

  const targetContent = readFileSync(targetPath, 'utf-8');
  const targetMarkerIndex = targetContent.indexOf(SYNC_MARKER);

  let newContent: string;

  if (targetMarkerIndex === -1) {
    // Target exists but has no marker - append marker section
    const separator = targetContent.endsWith('\n') ? '\n' : '\n\n';
    newContent = targetContent + separator + sourceMarkerSection;
    if (verbose) console.log(`  Appending ${SYNC_MARKER} section`);
  } else {
    // Target has marker - replace everything after it
    const beforeMarker = targetContent.slice(0, targetMarkerIndex);
    newContent = beforeMarker + sourceMarkerSection;
    if (verbose) console.log(`  Updating ${SYNC_MARKER} section`);
  }

  // Only write if changed
  if (newContent !== targetContent) {
    writeFileSync(targetPath, newContent);
    return true;
  }

  return false;
}

/**
 * Ensure a line exists somewhere in a file.
 * If file doesn't exist, create it with just that line.
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

  // Add the line
  const lineWithNewline = line + '\n';

  if (existed && content.trim()) {
    // Prepend to existing content
    content = lineWithNewline + '\n' + content;
  } else {
    content = lineWithNewline;
  }

  writeFileSync(filePath, content);
  if (verbose) console.log(existed ? `  Updated ${filePath}` : `  Created ${filePath}`);

  return true;
}
