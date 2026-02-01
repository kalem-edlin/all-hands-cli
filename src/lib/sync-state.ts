import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { getFileBlobHash } from './git.js';
import { getHeadCommit, hasUncommittedChanges } from './git.js';
import { SYNC_STATE_FILENAME } from './constants.js';

export interface SyncState {
  version: 1;
  syncedAt: string;
  sourceCommit: string | null;
  dirty: boolean;
  files: Record<string, string>;
}

/**
 * Write a sync-state manifest recording the blob hash of each synced file.
 * This allows push to detect whether a target file was modified locally
 * without relying on git history (which fails for uncommitted working-tree copies).
 */
export function writeSyncState(
  targetRoot: string,
  allhandsRoot: string,
  syncedFiles: Set<string>
): void {
  const files: Record<string, string> = {};

  for (const relPath of [...syncedFiles].sort()) {
    const sourceFile = join(allhandsRoot, relPath);
    if (!existsSync(sourceFile)) continue;
    const hash = getFileBlobHash(sourceFile, allhandsRoot);
    if (hash) {
      files[relPath] = hash;
    }
  }

  const state: SyncState = {
    version: 1,
    syncedAt: new Date().toISOString(),
    sourceCommit: getHeadCommit(allhandsRoot),
    dirty: hasUncommittedChanges(allhandsRoot),
    files,
  };

  const outPath = join(targetRoot, SYNC_STATE_FILENAME);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(state, null, 2) + '\n');
}

/**
 * Read the sync-state manifest from a target repo.
 * Returns null if the manifest does not exist or cannot be parsed.
 */
export function readSyncState(targetRoot: string): SyncState | null {
  const stateFile = join(targetRoot, SYNC_STATE_FILENAME);
  if (!existsSync(stateFile)) return null;
  try {
    const content = readFileSync(stateFile, 'utf-8');
    const parsed = JSON.parse(content);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== 1 ||
      !parsed.files ||
      typeof parsed.files !== 'object'
    ) {
      return null;
    }
    return parsed as SyncState;
  } catch {
    return null;
  }
}

/**
 * Check whether a target file was modified since the last sync.
 * Returns null if the file is not in the manifest (caller should fall back).
 * Returns true if the target's hash differs from the manifest.
 * Returns false if the target's hash matches the manifest.
 */
export function wasModifiedSinceSync(
  targetFilePath: string,
  relPath: string,
  syncState: SyncState,
  repoPath: string
): boolean | null {
  const manifestHash = syncState.files[relPath];
  if (!manifestHash) return null;

  const targetHash = getFileBlobHash(targetFilePath, repoPath);
  if (!targetHash) return true; // safe default: assume modified on error

  return targetHash !== manifestHash;
}
