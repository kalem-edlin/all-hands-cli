import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export const UPSTREAM_REPO = 'kalem-edlin/all-hands';
export const UPSTREAM_OWNER = 'kalem-edlin';

export function getAllhandsRoot(): string {
  // 1. Check ALLHANDS_PATH env var (for local dev testing)
  const envPath = process.env.ALLHANDS_PATH;
  if (envPath) {
    const resolved = resolve(envPath);
    if (existsSync(resolved) && existsSync(resolve(resolved, '.internal.json'))) {
      return resolved;
    }
  }

  // 2. Fallback: package location (npx usage)
  // When bundled with esbuild, this resolves to bin/cli.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // bin/cli.js -> package root (go up one level from bin/)
  let packageRoot = resolve(__dirname, '..');
  if (existsSync(resolve(packageRoot, '.internal.json'))) {
    return packageRoot;
  }

  // Try going up two levels (in case of dist/lib/paths.js structure)
  packageRoot = resolve(__dirname, '../..');
  if (existsSync(resolve(packageRoot, '.internal.json'))) {
    return packageRoot;
  }

  throw new Error(
    'Could not locate allhands package. Ensure you are running via npx or set ALLHANDS_PATH for local dev.'
  );
}
