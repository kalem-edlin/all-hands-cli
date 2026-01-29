/**
 * TLDR Daemon Client
 *
 * Core library for communicating with the llm-tldr daemon.
 * Provides token-efficient code analysis via AST/call-graph/DFG queries.
 *
 * All functions gracefully degrade if TLDR is not installed or daemon is unavailable.
 */

import { execSync, spawnSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DaemonResponse {
  status: 'ok' | 'error' | 'indexing';
  result?: unknown;
  indexing?: boolean;
  message?: string;
  error?: string;
  callers?: unknown[];  // For impact analysis responses
  // Notify command response fields (dirty file tracking)
  dirty_count?: number;
  threshold?: number;
  reindex_triggered?: boolean;
}

export interface SearchResult {
  file: string;
  name: string;
  type: string;
  line: number;
  signature?: string;
}

export interface ExtractSymbol {
  name: string;
  line_number: number;
  signature?: string;
  docstring?: string;
  is_async?: boolean;
  params?: string[];
  return_type?: string;
  decorators?: string[];
}

export interface ExtractResult {
  file_path: string;
  language: string;
  docstring?: string;
  imports: Array<{ module: string; names: string[]; is_from: boolean }>;
  classes: ExtractSymbol[];
  functions: ExtractSymbol[];
  call_graph?: {
    calls: Record<string, string[]>;
    called_by: Record<string, string[]>;
  };
}

export interface ContextResult {
  entry: string;
  callees: string[];
  callers: string[];
  depth: number;
}

export interface CFGResult {
  file: string;
  function: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    line?: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
  }>;
}

export interface DFGResult {
  file: string;
  function: string;
  variables: Array<{
    name: string;
    definitions: number[];
    uses: number[];
  }>;
  flows: Array<{
    from: string;
    to: string;
    line: number;
  }>;
}

export interface ArchResult {
  layers: Array<{
    name: string;
    files: string[];
    description?: string;
  }>;
  dependencies: Array<{
    from: string;
    to: string;
  }>;
}

export interface DiagnosticsResult {
  file: string;
  errors: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    source: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection & Availability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if llm-tldr is installed.
 */
export function isTldrInstalled(): boolean {
  try {
    execSync('which tldr', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the socket path for the TLDR daemon.
 * Format: {tmpdir}/tldr-{md5(projectDir).slice(0,8)}.sock
 * Uses system tmpdir to match TLDR daemon behavior on macOS.
 */
export function getTldrSocketPath(projectDir: string): string {
  const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
  return join(tmpdir(), `tldr-${hash}.sock`);
}

/**
 * Check if the TLDR daemon is running for a project.
 * Checks both socket-based daemon and status file.
 */
export function isTldrDaemonRunning(projectDir: string): boolean {
  // Check socket-based daemon first
  const socketPath = getTldrSocketPath(projectDir);
  if (existsSync(socketPath)) {
    return true;
  }

  // Fall back to status file check (used by newer TLDR versions)
  const statusPath = join(projectDir, '.tldr', 'status');
  if (existsSync(statusPath)) {
    try {
      const status = readFileSync(statusPath, 'utf-8').trim();
      return status === 'ready';
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Start the TLDR daemon if not already running.
 * Returns true if daemon is running (started or already was).
 */
export async function ensureTldrDaemon(projectDir: string): Promise<boolean> {
  if (!isTldrInstalled()) {
    return false;
  }

  if (isTldrDaemonRunning(projectDir)) {
    return true;
  }

  try {
    execSync(`tldr daemon start --project "${projectDir}"`, {
      stdio: 'ignore',
      timeout: 5000,
    });
    // Give daemon a moment to start accepting connections
    await new Promise((resolve) => setTimeout(resolve, 500));
    return isTldrDaemonRunning(projectDir);
  } catch {
    return false;
  }
}

/**
 * Check if semantic index exists for a project.
 */
export function hasSemanticIndex(projectDir: string): boolean {
  const indexPath = join(projectDir, '.tldr', 'cache', 'semantic', 'index.faiss');
  return existsSync(indexPath);
}

/**
 * Build semantic index for a project.
 * This can take a while for large projects - runs synchronously with progress output.
 * Returns true if index was built successfully.
 */
export function buildSemanticIndex(
  projectDir: string,
  lang: string = 'all'
): boolean {
  if (!isTldrInstalled()) {
    return false;
  }

  try {
    execSync(`tldr semantic index "${projectDir}" --lang ${lang}`, {
      stdio: 'inherit', // Show progress to user
      timeout: 300000, // 5 min timeout for large projects
    });
    // Track the branch that was indexed
    trackIndexedBranch(projectDir);
    return true;
  } catch {
    return false;
  }
}

export interface SemanticIndexResult {
  success: boolean;
  filesIndexed: number;
  languages: string[];
}

/**
 * Build semantic index asynchronously with progress reporting.
 * Returns result object with success status, file count, and languages.
 *
 * @param projectDir - Project directory to index
 * @param onProgress - Callback for progress messages (each line of output)
 * @param lang - Language to index (default 'all')
 */
export async function buildSemanticIndexAsync(
  projectDir: string,
  onProgress?: (message: string) => void,
  lang: string = 'all'
): Promise<SemanticIndexResult> {
  if (!isTldrInstalled()) {
    return { success: false, filesIndexed: 0, languages: [] };
  }

  return new Promise((resolve) => {
    const child = spawn('tldr', ['semantic', 'index', projectDir, '--lang', lang], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Buffer for partial lines
    let stdoutBuffer = '';
    let stderrBuffer = '';

    // Track file counts and languages from output
    let totalFilesIndexed = 0;
    const detectedLanguages: string[] = [];

    const processLine = (line: string) => {
      if (!line.trim()) return;

      // Parse "Detected languages: javascript, typescript"
      const langMatch = line.match(/Detected languages?:\s*(.+)/i);
      if (langMatch) {
        const langs = langMatch[1].split(',').map(l => l.trim());
        detectedLanguages.push(...langs);
      }

      // Parse "Indexed N files" or "Extracted N code units" patterns
      const indexedMatch = line.match(/(?:Indexed|Extracted|Processed)\s+(\d+)\s+(?:files?|code units?)/i);
      if (indexedMatch) {
        totalFilesIndexed += parseInt(indexedMatch[1], 10);
      }

      // Also check for patterns like "✓ 123 files indexed"
      const filesMatch = line.match(/(\d+)\s+files?\s+indexed/i);
      if (filesMatch) {
        totalFilesIndexed = parseInt(filesMatch[1], 10); // Use this as the total
      }

      if (onProgress) {
        onProgress(line.trim());
      }
    };

    child.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      // Keep incomplete last line in buffer
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        processLine(line);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        processLine(line);
      }
    });

    child.on('close', (code) => {
      // Flush any remaining content in buffers
      if (stdoutBuffer.trim()) {
        processLine(stdoutBuffer);
      }
      if (stderrBuffer.trim()) {
        processLine(stderrBuffer);
      }

      if (code === 0) {
        trackIndexedBranch(projectDir);
        resolve({
          success: true,
          filesIndexed: totalFilesIndexed,
          languages: detectedLanguages,
        });
      } else {
        resolve({
          success: false,
          filesIndexed: totalFilesIndexed,
          languages: detectedLanguages,
        });
      }
    });

    child.on('error', () => {
      resolve({ success: false, filesIndexed: 0, languages: [] });
    });

    // Set timeout (5 minutes)
    setTimeout(() => {
      child.kill();
      resolve({ success: false, filesIndexed: totalFilesIndexed, languages: detectedLanguages });
    }, 300000);
  });
}

/**
 * Get the path to the branch tracking file.
 */
function getBranchTrackingPath(projectDir: string): string {
  return join(projectDir, '.tldr', 'cache', 'semantic', 'indexed_branch');
}

/**
 * Track which branch the semantic index was built for.
 */
export function trackIndexedBranch(projectDir: string): void {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const trackingPath = getBranchTrackingPath(projectDir);
    const { writeFileSync, mkdirSync } = require('fs');
    const { dirname } = require('path');
    mkdirSync(dirname(trackingPath), { recursive: true });
    writeFileSync(trackingPath, branch);
  } catch {
    // Ignore errors - best effort tracking
  }
}

/**
 * Get the branch the semantic index was last built for.
 */
export function getIndexedBranch(projectDir: string): string | null {
  try {
    const trackingPath = getBranchTrackingPath(projectDir);
    const { readFileSync } = require('fs');
    return readFileSync(trackingPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Check if semantic index needs rebuild due to branch switch.
 */
export function needsSemanticRebuild(projectDir: string): boolean {
  if (!hasSemanticIndex(projectDir)) {
    return true;
  }

  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const indexedBranch = getIndexedBranch(projectDir);
    return indexedBranch !== null && indexedBranch !== currentBranch;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daemon Communication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query the TLDR daemon synchronously using netcat.
 * Returns null if daemon is unavailable or times out.
 *
 * @param cmd - Command object to send to daemon
 * @param projectDir - Project directory for socket path
 * @param timeoutMs - Timeout in milliseconds (default 5000)
 */
export function queryDaemonSync(
  cmd: object,
  projectDir: string,
  timeoutMs: number = 5000
): DaemonResponse | null {
  if (!isTldrInstalled()) {
    return null;
  }

  const socketPath = getTldrSocketPath(projectDir);
  if (!existsSync(socketPath)) {
    return null;
  }

  try {
    const cmdJson = JSON.stringify(cmd);
    const timeoutSec = Math.ceil(timeoutMs / 1000);

    // Use netcat for synchronous socket query
    const result = spawnSync('nc', ['-U', '-w', String(timeoutSec), socketPath], {
      input: cmdJson,
      encoding: 'utf-8',
      timeout: timeoutMs + 1000, // Buffer for nc startup
    });

    if (result.status !== 0 || !result.stdout) {
      return null;
    }

    const response = JSON.parse(result.stdout.trim()) as DaemonResponse;

    // Check if daemon is indexing
    if (response.indexing) {
      return { status: 'indexing', indexing: true, message: 'Index in progress' };
    }

    return response;
  } catch {
    return null;
  }
}

/**
 * Query the TLDR daemon asynchronously.
 * Uses the same netcat approach but wrapped in a promise.
 */
export async function queryDaemon(
  cmd: object,
  projectDir: string,
  timeoutMs: number = 5000
): Promise<DaemonResponse | null> {
  // For now, use sync version wrapped in promise
  // Could be optimized with proper async socket handling
  return new Promise((resolve) => {
    const result = queryDaemonSync(cmd, projectDir, timeoutMs);
    resolve(result);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fallback search using ripgrep when daemon is unavailable or indexing.
 */
function ripgrepFallback(pattern: string, projectDir: string): SearchResult[] {
  try {
    const escaped = pattern.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const result = spawnSync(
      'rg',
      ['--json', '-m', '20', '--no-heading', escaped, projectDir],
      { encoding: 'utf-8', timeout: 5000 }
    );

    if (result.status !== 0 || !result.stdout) {
      return [];
    }

    const results: SearchResult[] = [];
    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.type === 'match') {
          results.push({
            file: json.data.path.text,
            name: pattern,
            type: 'match',
            line: json.data.line_number,
          });
        }
      } catch {
        // Skip non-JSON lines
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Search for symbols matching a pattern.
 * Falls back to ripgrep when daemon is indexing or unavailable.
 */
export function searchDaemon(pattern: string, projectDir: string): SearchResult[] {
  const response = queryDaemonSync({ cmd: 'search', pattern }, projectDir);

  // If daemon is indexing or unavailable, fall back to ripgrep
  if (!response || response.indexing || response.status === 'indexing') {
    return ripgrepFallback(pattern, projectDir);
  }

  // Daemon returns 'results' (plural) not 'result'
  const results = (response as unknown as { results?: unknown[] }).results;
  if (response.status !== 'ok' || !results) {
    return ripgrepFallback(pattern, projectDir);
  }

  return results as SearchResult[];
}

/**
 * Extract symbols from a file.
 */
export function extractDaemon(filePath: string, projectDir: string): ExtractResult | null {
  const response = queryDaemonSync({ cmd: 'extract', file: filePath }, projectDir);
  if (!response || response.status !== 'ok' || !response.result) {
    return null;
  }
  return response.result as ExtractResult;
}

/**
 * Get call graph context for an entry point.
 */
export function contextDaemon(entry: string, projectDir: string): ContextResult | null {
  const response = queryDaemonSync({ cmd: 'context', entry }, projectDir);
  if (!response || response.status !== 'ok' || !response.result) {
    return null;
  }
  return response.result as ContextResult;
}

/**
 * Get control flow graph for a function.
 */
export function cfgDaemon(file: string, fn: string, projectDir: string): CFGResult | null {
  const response = queryDaemonSync({ cmd: 'cfg', file, function: fn }, projectDir);
  if (!response || response.status !== 'ok' || !response.result) {
    return null;
  }
  return response.result as CFGResult;
}

/**
 * Get data flow graph for a function.
 */
export function dfgDaemon(file: string, fn: string, projectDir: string): DFGResult | null {
  const response = queryDaemonSync({ cmd: 'dfg', file, function: fn }, projectDir);
  if (!response || response.status !== 'ok' || !response.result) {
    return null;
  }
  return response.result as DFGResult;
}

/**
 * Get architecture layers for the project.
 */
export function archDaemon(projectDir: string): ArchResult | null {
  const response = queryDaemonSync({ cmd: 'arch' }, projectDir);
  if (!response || response.status !== 'ok' || !response.result) {
    return null;
  }
  return response.result as ArchResult;
}

/**
 * Get diagnostics for a file (pyright + ruff).
 */
export function diagnosticsDaemon(file: string, projectDir: string): DiagnosticsResult | null {
  const response = queryDaemonSync({ cmd: 'diagnostics', file }, projectDir);
  if (!response || response.status !== 'ok' || !response.result) {
    return null;
  }
  return response.result as DiagnosticsResult;
}

/** Caller location for impact analysis */
export interface ImpactCaller {
  file: string;
  function: string;
  line: number;
}

/** Impact analysis result */
export interface ImpactResult {
  target: string;
  callers: ImpactCaller[];
}

/**
 * Get impact analysis for a function (reverse call graph).
 * Returns all functions that call the target function.
 */
export function impactDaemon(funcName: string, projectDir: string): ImpactResult | null {
  const response = queryDaemonSync({ cmd: 'impact', func: funcName }, projectDir);

  // If daemon is indexing, return null (caller should handle gracefully)
  if (!response || response.indexing || response.status === 'indexing') {
    return null;
  }

  if (response.status !== 'ok') {
    return null;
  }

  // Handle both response formats: { callers: [...] } or { result: { callers: [...] } }
  const callers = (response.callers ?? (response.result as { callers?: ImpactCaller[] })?.callers ?? []) as ImpactCaller[];

  return {
    target: funcName,
    callers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TUI Integration Points
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Warm the TLDR index for a project.
 * Starts the daemon and builds semantic index if missing.
 * Returns true if warming was initiated, false if unavailable.
 */
export async function warmIndex(projectDir: string): Promise<boolean> {
  if (!isTldrInstalled()) {
    return false;
  }

  try {
    // Start daemon in background
    execSync(`tldr daemon start --project "${projectDir}" &`, {
      stdio: 'ignore',
      timeout: 2000,
    });

    // Build semantic index if missing (run in background)
    if (!hasSemanticIndex(projectDir)) {
      execSync(`tldr semantic index "${projectDir}" --lang all &`, {
        stdio: 'ignore',
        timeout: 2000,
      });
    }

    return true;
  } catch {
    return false;
  }
}

export interface WarmResult {
  success: boolean;
  files: number;
  edges: number;
}

/**
 * Run tldr warm to build call graph cache.
 * Uses config default language from .tldr/config.json.
 * Returns result with file and edge counts.
 */
export async function warmCallGraph(
  projectDir: string,
  onProgress?: (message: string) => void
): Promise<WarmResult> {
  if (!isTldrInstalled()) {
    return { success: false, files: 0, edges: 0 };
  }

  try {
    const { spawn } = await import('child_process');

    return new Promise((resolve) => {
      // Run tldr warm (uses config default language)
      const proc = spawn('tldr', ['warm', projectDir], {
        cwd: projectDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        stdout += line + '\n';
        if (onProgress && line) {
          onProgress(line);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Parse output for stats (e.g., "Total: Indexed 123 files, found 456 edges")
          const match = stdout.match(/Indexed (\d+) files.*?(\d+) edges/);
          const files = match ? parseInt(match[1], 10) : 0;
          const edges = match ? parseInt(match[2], 10) : 0;
          resolve({ success: true, files, edges });
        } else {
          resolve({ success: false, files: 0, edges: 0 });
        }
      });

      proc.on('error', () => {
        resolve({ success: false, files: 0, edges: 0 });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        proc.kill();
        resolve({ success: false, files: 0, edges: 0 });
      }, 300000);
    });
  } catch {
    return { success: false, files: 0, edges: 0 };
  }
}

/**
 * Notify daemon of a file change for incremental updates.
 */
export async function notifyFileChanged(
  projectDir: string,
  filePath: string
): Promise<DaemonResponse | null> {
  return queryDaemon({ cmd: 'notify', file: filePath, event: 'change' }, projectDir);
}


/**
 * Initialize TLDR on spec start.
 */
export async function onSpecInit(projectDir: string): Promise<void> {
  if (!isTldrInstalled()) {
    return;
  }

  // Ensure daemon is running
  if (!isTldrDaemonRunning(projectDir)) {
    await warmIndex(projectDir);
  }
}

/**
 * Handle merge completion - re-index affected files.
 */
export async function onMergeComplete(targetDir: string): Promise<void> {
  if (!isTldrInstalled() || !isTldrDaemonRunning(targetDir)) {
    return;
  }

  // Trigger full re-index after merge
  await queryDaemon({ cmd: 'reindex' }, targetDir);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Activity Tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Track hook activity for observability.
 * Synchronous to avoid blocking hook execution.
 */
export function trackHookActivitySync(
  hookName: string,
  projectDir: string,
  success: boolean,
  metrics?: object
): void {
  // Best-effort tracking - don't block on failures
  try {
    queryDaemonSync(
      {
        cmd: 'track',
        hook: hookName,
        success,
        metrics,
        timestamp: new Date().toISOString(),
      },
      projectDir,
      1000 // Short timeout for tracking
    );
  } catch {
    // Ignore tracking failures
  }
}
