import { existsSync, renameSync } from 'fs';
import { basename, dirname, join } from 'path';
import { walkDir } from './fs-utils.js';

// Files that npm hardcode-excludes and we rename for packaging
const DOTFILE_NAMES = ['gitignore', 'npmrc', 'npmignore'];

/**
 * Restore dotfiles after copying from npm package.
 * Renames `gitignore` → `.gitignore`, `npmrc` → `.npmrc`, etc.
 * Returns count of files renamed.
 */
export function restoreDotfiles(targetDir: string): { renamed: string[]; skipped: string[] } {
  const renamed: string[] = [];
  const skipped: string[] = [];

  walkDir(targetDir, (filePath) => {
    const name = basename(filePath);

    if (DOTFILE_NAMES.includes(name)) {
      const dir = dirname(filePath);
      const dotName = '.' + name;
      const dotPath = join(dir, dotName);

      if (existsSync(dotPath)) {
        // Target dotfile already exists - skip to avoid overwriting
        skipped.push(filePath);
      } else {
        renameSync(filePath, dotPath);
        renamed.push(filePath);
      }
    }
  });

  return { renamed, skipped };
}
