/**
 * Event Loop Decision Logic Tests
 *
 * Exercises the unified checkPromptLoop() decision branches via the public
 * forceTick() method, testing:
 * - 4 unified decision branches (spawn executor, spawn emergent planner, wait, disabled)
 * - Parallel execution capacity enforcement
 * - Spawn cooldown timer (10s SPAWN_COOLDOWN_MS)
 * - Emergent planner singleton blocking
 * - activeExecutorPrompts reconciliation on agent exit
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { PromptFile, PickerResult } from '../../lib/prompts.js';
import type { EventLoopCallbacks } from '../../lib/event-loop.js';
import { createFixture, type TestFixture } from '../harness/index.js';

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

vi.mock('../../lib/tmux.js', () => ({
  listWindows: vi.fn(() => [{ index: 0, name: 'hub', id: '@0' }]),
  sessionExists: vi.fn(() => true),
  getSpawnedAgentRegistry: vi.fn(() => new Set<string>()),
  getCurrentSession: vi.fn(() => 'test-session'),
  SESSION_NAME: 'all-hands',
  unregisterSpawnedAgent: vi.fn(),
}));

vi.mock('../../lib/prompts.js', () => ({
  pickNextPrompt: vi.fn(() => ({
    prompt: null,
    reason: 'No prompt files found',
    stats: { total: 0, pending: 0, inProgress: 0, done: 0, blocked: 0 },
  })),
  loadAllPrompts: vi.fn(() => []),
  markPromptInProgress: vi.fn(),
}));

vi.mock('../../hooks/shared.js', () => ({
  loadProjectSettings: vi.fn(() => ({
    spawn: { maxParallelPrompts: 3 },
    eventLoop: { tickIntervalMs: 1000 },
  })),
}));

vi.mock('../../lib/planning.js', () => ({
  getCurrentBranch: vi.fn(() => 'feature/test-branch'),
  sanitizeBranchForDir: vi.fn(() => 'feature-test-branch'),
  readStatus: vi.fn(() => ({ stage: 'executing' })),
  updatePRReviewStatus: vi.fn(),
}));

vi.mock('../../lib/specs.js', () => ({
  getSpecForBranch: vi.fn(() => null),
}));

vi.mock('../../lib/mcp-client.js', () => ({
  shutdownDaemon: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/pr-review.js', () => ({
  checkPRReviewStatus: vi.fn(() =>
    Promise.resolve({ status: 'none', lastCommentId: null, lastCommentTime: null, reviewCycle: 0 })
  ),
  hasNewReview: vi.fn(() => false),
  parsePRUrl: vi.fn(() => null),
}));

// Imports after mocks (vi.mock calls are hoisted)
import { EventLoop } from '../../lib/event-loop.js';
import { pickNextPrompt, markPromptInProgress, loadAllPrompts } from '../../lib/prompts.js';
import { listWindows, getSpawnedAgentRegistry } from '../../lib/tmux.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrompt(
  number: number,
  status: 'pending' | 'in_progress' | 'done' = 'pending',
): PromptFile {
  return {
    path: `/tmp/prompts/${number.toString().padStart(2, '0')}-test.prompt.md`,
    filename: `${number.toString().padStart(2, '0')}-test.prompt.md`,
    frontmatter: {
      number,
      title: `Test Prompt ${number}`,
      status,
      dependencies: [],
      priority: 'medium',
      attempts: 0,
      commits: [],
      created: '2026-01-30T00:00:00.000Z',
      updated: '2026-01-30T00:00:00.000Z',
    },
    body: '## Tasks\n\n- Test task',
    rawContent: '',
  };
}

function pickerResult(
  prompt: PromptFile | null,
  stats: PickerResult['stats'],
  reason = '',
): PickerResult {
  return { prompt, reason, stats };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EventLoop Decision Logic', () => {
  let fixture: TestFixture;
  let loop: EventLoop;
  let callbacks: Required<EventLoopCallbacks>;

  beforeAll(() => {
    fixture = createFixture({ name: 'event-loop-test' });
  });

  afterAll(() => {
    fixture.cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mocks that individual tests may override
    vi.mocked(listWindows).mockReturnValue([{ index: 0, name: 'hub', id: '@0' }]);
    vi.mocked(getSpawnedAgentRegistry).mockReturnValue(new Set());
    vi.mocked(pickNextPrompt).mockReturnValue({
      prompt: null,
      reason: 'No prompt files found',
      stats: { total: 0, pending: 0, inProgress: 0, done: 0, blocked: 0 },
    });

    callbacks = {
      onPRReviewFeedback: vi.fn(),
      onBranchChange: vi.fn(),
      onAgentsChange: vi.fn(),
      onSpawnExecutor: vi.fn(),
      onSpawnEmergentPlanning: vi.fn(),
      onLoopStatus: vi.fn(),
      onPromptsChange: vi.fn(),
    };

    loop = new EventLoop(fixture.root, callbacks);
    loop.setLoopEnabled(true);
  });

  // ─── 4 Unified Decision Branches ─────────────────────────────────────

  describe('unified decision branches', () => {
    it('spawns executor when pending prompt available', async () => {
      const prompt = makePrompt(1);
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(prompt, { total: 3, pending: 1, inProgress: 1, done: 1, blocked: 0 }),
      );

      await loop.forceTick();

      expect(callbacks.onSpawnExecutor).toHaveBeenCalledWith(prompt);
      expect(callbacks.onSpawnEmergentPlanning).not.toHaveBeenCalled();
      expect(markPromptInProgress).toHaveBeenCalledWith(prompt.path);
      expect(loop.getState().activeExecutorPrompts).toContain(1);
      expect(loop.getState().lastExecutorSpawnTime).not.toBeNull();
    });

    it('spawns emergent planner when no pending and no in_progress', async () => {
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(null, { total: 5, pending: 0, inProgress: 0, done: 5, blocked: 0 }),
      );

      await loop.forceTick();

      expect(callbacks.onSpawnEmergentPlanning).toHaveBeenCalledOnce();
      expect(callbacks.onSpawnExecutor).not.toHaveBeenCalled();
      expect(loop.getState().lastExecutorSpawnTime).not.toBeNull();
    });

    it('waits when no pending but in_progress exist', async () => {
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(null, { total: 5, pending: 0, inProgress: 2, done: 3, blocked: 0 }, 'Executors still working'),
      );

      await loop.forceTick();

      expect(callbacks.onSpawnExecutor).not.toHaveBeenCalled();
      expect(callbacks.onSpawnEmergentPlanning).not.toHaveBeenCalled();
      expect(callbacks.onLoopStatus).toHaveBeenCalledWith('Executors still working');
    });

    it('does nothing when loop disabled', async () => {
      loop.setLoopEnabled(false);
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(1), { total: 3, pending: 1, inProgress: 0, done: 2, blocked: 0 }),
      );

      await loop.forceTick();

      expect(callbacks.onSpawnExecutor).not.toHaveBeenCalled();
      expect(callbacks.onSpawnEmergentPlanning).not.toHaveBeenCalled();
      expect(pickNextPrompt).not.toHaveBeenCalled();
    });
  });

  // ─── Parallel Execution Capacity ──────────────────────────────────────

  describe('parallel execution capacity', () => {
    it('blocks spawn at max parallel capacity', async () => {
      loop.setParallelEnabled(true);

      // 3 active executors = maxParallelPrompts (3)
      vi.mocked(listWindows).mockReturnValue([
        { index: 0, name: 'hub', id: '@0' },
        { index: 1, name: 'executor-01', id: '@1' },
        { index: 2, name: 'executor-02', id: '@2' },
        { index: 3, name: 'executor-03', id: '@3' },
      ]);
      vi.mocked(getSpawnedAgentRegistry).mockReturnValue(
        new Set(['executor-01', 'executor-02', 'executor-03']),
      );
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(4), { total: 6, pending: 1, inProgress: 3, done: 2, blocked: 0 }),
      );

      await loop.forceTick();

      expect(callbacks.onSpawnExecutor).not.toHaveBeenCalled();
    });

    it('allows spawn below max parallel capacity', async () => {
      loop.setParallelEnabled(true);

      // 2 active executors < maxParallelPrompts (3)
      vi.mocked(listWindows).mockReturnValue([
        { index: 0, name: 'hub', id: '@0' },
        { index: 1, name: 'executor-01', id: '@1' },
        { index: 2, name: 'executor-02', id: '@2' },
      ]);
      vi.mocked(getSpawnedAgentRegistry).mockReturnValue(
        new Set(['executor-01', 'executor-02']),
      );
      const prompt = makePrompt(3);
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(prompt, { total: 5, pending: 1, inProgress: 2, done: 2, blocked: 0 }),
      );

      await loop.forceTick();

      expect(callbacks.onSpawnExecutor).toHaveBeenCalledWith(prompt);
    });

    it('limits to 1 executor when parallel disabled', async () => {
      loop.setParallelEnabled(false);

      // 1 executor already running — parallel disabled means max=1
      vi.mocked(listWindows).mockReturnValue([
        { index: 0, name: 'hub', id: '@0' },
        { index: 1, name: 'executor-01', id: '@1' },
      ]);
      vi.mocked(getSpawnedAgentRegistry).mockReturnValue(new Set(['executor-01']));
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(2), { total: 4, pending: 1, inProgress: 1, done: 2, blocked: 0 }),
      );

      await loop.forceTick();

      expect(callbacks.onSpawnExecutor).not.toHaveBeenCalled();
    });
  });

  // ─── Spawn Cooldown Timer ─────────────────────────────────────────────

  describe('spawn cooldown timer', () => {
    it('suppresses spawn within 10s SPAWN_COOLDOWN_MS window', async () => {
      // Use parallel so capacity doesn't block before cooldown check
      loop.setParallelEnabled(true);

      // Tick 1: spawn executor (no executor windows yet)
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(1), { total: 3, pending: 2, inProgress: 0, done: 1, blocked: 0 }),
      );
      await loop.forceTick();
      expect(callbacks.onSpawnExecutor).toHaveBeenCalledTimes(1);

      // Tick 2: executor-01 window now visible (prevents reconciliation from
      // clearing the timestamp), but cooldown still active → blocks spawn
      vi.mocked(listWindows).mockReturnValue([
        { index: 0, name: 'hub', id: '@0' },
        { index: 1, name: 'executor-01', id: '@1' },
      ]);
      vi.mocked(getSpawnedAgentRegistry).mockReturnValue(new Set(['executor-01']));
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(2), { total: 3, pending: 1, inProgress: 1, done: 1, blocked: 0 }),
      );
      await loop.forceTick();
      expect(callbacks.onSpawnExecutor).toHaveBeenCalledTimes(1); // unchanged
    });

    it('allows spawn after cooldown expires', async () => {
      loop.setParallelEnabled(true);

      // Tick 1: spawn executor
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(1), { total: 3, pending: 2, inProgress: 0, done: 1, blocked: 0 }),
      );
      await loop.forceTick();
      expect(callbacks.onSpawnExecutor).toHaveBeenCalledTimes(1);

      // Tick 2: executor-01 visible, advance past cooldown
      vi.mocked(listWindows).mockReturnValue([
        { index: 0, name: 'hub', id: '@0' },
        { index: 1, name: 'executor-01', id: '@1' },
      ]);
      vi.mocked(getSpawnedAgentRegistry).mockReturnValue(new Set(['executor-01']));
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11000);

      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(2), { total: 3, pending: 1, inProgress: 1, done: 1, blocked: 0 }),
      );
      await loop.forceTick();
      expect(callbacks.onSpawnExecutor).toHaveBeenCalledTimes(2);

      dateNowSpy.mockRestore();
    });

    it('resets cooldown when agent window disappears', async () => {
      loop.setParallelEnabled(true);

      // Tick 1: executor-01 already visible, spawn executor for prompt 2
      vi.mocked(listWindows).mockReturnValue([
        { index: 0, name: 'hub', id: '@0' },
        { index: 1, name: 'executor-01', id: '@1' },
      ]);
      vi.mocked(getSpawnedAgentRegistry).mockReturnValue(new Set(['executor-01']));
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(2), { total: 3, pending: 2, inProgress: 1, done: 0, blocked: 0 }),
      );
      await loop.forceTick();
      expect(callbacks.onSpawnExecutor).toHaveBeenCalledTimes(1);
      expect(loop.getState().activeAgents).toContain('executor-01');

      // Tick 2: executor-01 disappears → checkAgentWindows clears cooldown
      // → new spawn succeeds immediately without waiting
      vi.mocked(listWindows).mockReturnValue([{ index: 0, name: 'hub', id: '@0' }]);
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(3), { total: 3, pending: 1, inProgress: 1, done: 1, blocked: 0 }),
      );
      await loop.forceTick();

      // Cooldown was cleared by executor disappearance detection
      expect(callbacks.onSpawnExecutor).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Emergent Planner Blocking ────────────────────────────────────────

  describe('emergent planner blocking', () => {
    it('blocks second emergent planner when one is already running', async () => {
      // Emergent planner window already active
      vi.mocked(listWindows).mockReturnValue([
        { index: 0, name: 'hub', id: '@0' },
        { index: 1, name: 'emergent-planner', id: '@1' },
      ]);
      vi.mocked(getSpawnedAgentRegistry).mockReturnValue(new Set(['emergent-planner']));

      // Would normally trigger emergent planner spawn (no pending, no in_progress)
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(null, { total: 5, pending: 0, inProgress: 0, done: 5, blocked: 0 }),
      );

      await loop.forceTick();

      expect(callbacks.onSpawnEmergentPlanning).not.toHaveBeenCalled();
      expect(callbacks.onSpawnExecutor).not.toHaveBeenCalled();
    });
  });

  // ─── activeExecutorPrompts Reconciliation ─────────────────────────────

  describe('activeExecutorPrompts reconciliation', () => {
    it('removes orphaned prompt numbers when executor window disappears', async () => {
      // Tick 1: spawn executor for prompt 1
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(makePrompt(1), { total: 3, pending: 1, inProgress: 0, done: 2, blocked: 0 }),
      );
      await loop.forceTick();
      expect(loop.getState().activeExecutorPrompts).toEqual([1]);
      expect(loop.getState().lastExecutorSpawnTime).not.toBeNull();

      // Tick 2: no executor-01 window (it died before tmux detected it)
      // Reconciliation in checkAgentWindows cleans up orphaned prompt number
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(null, { total: 3, pending: 0, inProgress: 1, done: 2, blocked: 0 }, 'Waiting'),
      );
      await loop.forceTick();

      expect(loop.getState().activeExecutorPrompts).toEqual([]);
      expect(loop.getState().lastExecutorSpawnTime).toBeNull();
    });
  });

  // ─── Emergent Planner Exponential Backoff ────────────────────────────

  describe('emergent planner exponential backoff', () => {
    /** Configure mocks for the emergent planner path (no pending, no in_progress) */
    function setupEmergentPath(doneCount: number) {
      const donePrompts = Array.from({ length: doneCount }, (_, i) => makePrompt(i + 1, 'done'));
      vi.mocked(loadAllPrompts).mockReturnValue(donePrompts);
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(null, { total: doneCount, pending: 0, inProgress: 0, done: doneCount, blocked: 0 }),
      );
    }

    it('increments emergentSpawnCount on unproductive spawn and applies 20s cooldown', async () => {
      setupEmergentPath(5);

      // Tick 1: first spawn — productive (snapshot count 5 > initial emergentLastPromptCount 0)
      await loop.forceTick();
      expect(callbacks.onSpawnEmergentPlanning).toHaveBeenCalledTimes(1);
      expect(loop.getState().emergentSpawnCount).toBe(0);

      // Fix time at 15s after spawn — past base 10s but under 20s backoff
      const spawnTime = loop.getState().lastExecutorSpawnTime!;
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(spawnTime + 15000);

      // Tick 2: unproductive (count still 5) → emergentSpawnCount = 1, cooldown = 20s
      await loop.forceTick();
      expect(callbacks.onSpawnEmergentPlanning).toHaveBeenCalledTimes(1); // blocked by backoff
      expect(loop.getState().emergentSpawnCount).toBe(1);
      expect(callbacks.onLoopStatus).toHaveBeenCalledWith(
        'Emergent planner backoff: waiting 20s (1 unproductive spawns)',
      );

      dateNowSpy.mockRestore();
    });

    it('doubles cooldown with each unproductive attempt: 20s, 40s, 80s, 160s, capped at 160s', async () => {
      setupEmergentPath(5);

      // Tick 1: first spawn (productive, emergentSpawnCount = 0)
      await loop.forceTick();
      expect(callbacks.onSpawnEmergentPlanning).toHaveBeenCalledTimes(1);

      // Advance time past base 10s cooldown but within each escalating backoff window
      const spawnTime = loop.getState().lastExecutorSpawnTime!;
      const dateNowSpy = vi.spyOn(Date, 'now');

      dateNowSpy.mockReturnValue(spawnTime + 11000); // 11s: past base 10s, within 20s
      await loop.forceTick(); // count → 1
      expect(callbacks.onLoopStatus).toHaveBeenCalledWith(
        'Emergent planner backoff: waiting 20s (1 unproductive spawns)',
      );

      dateNowSpy.mockReturnValue(spawnTime + 21000); // 21s: past base, within 40s
      await loop.forceTick(); // count → 2
      expect(callbacks.onLoopStatus).toHaveBeenCalledWith(
        'Emergent planner backoff: waiting 40s (2 unproductive spawns)',
      );

      dateNowSpy.mockReturnValue(spawnTime + 41000); // 41s: past base, within 80s
      await loop.forceTick(); // count → 3
      expect(callbacks.onLoopStatus).toHaveBeenCalledWith(
        'Emergent planner backoff: waiting 80s (3 unproductive spawns)',
      );

      dateNowSpy.mockReturnValue(spawnTime + 81000); // 81s: past base, within 160s
      await loop.forceTick(); // count → 4
      expect(callbacks.onLoopStatus).toHaveBeenCalledWith(
        'Emergent planner backoff: waiting 160s (4 unproductive spawns)',
      );

      // count → 5, Math.min(5, 4) = 4, cooldown still 160s (capped at same time offset)
      await loop.forceTick();
      expect(callbacks.onLoopStatus).toHaveBeenCalledWith(
        'Emergent planner backoff: waiting 160s (5 unproductive spawns)',
      );

      // Only the initial spawn succeeded — all subsequent ticks blocked
      expect(callbacks.onSpawnEmergentPlanning).toHaveBeenCalledTimes(1);

      dateNowSpy.mockRestore();
    });

    it('resets backoff when new pending prompts appear externally', async () => {
      setupEmergentPath(5);

      // Tick 1: spawn emergent (productive, count = 0)
      await loop.forceTick();
      expect(callbacks.onSpawnEmergentPlanning).toHaveBeenCalledTimes(1);

      // Tick 2 at +11s: unproductive → count = 1, backoff (cooldown 20s, 11s elapsed)
      const spawnTime = loop.getState().lastExecutorSpawnTime!;
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(spawnTime + 11000);
      await loop.forceTick();
      expect(loop.getState().emergentSpawnCount).toBe(1);

      // External prompt appears: pending count increases from 0 to 1
      const donePrompts = Array.from({ length: 5 }, (_, i) => makePrompt(i + 1, 'done'));
      const pendingPrompt = makePrompt(6, 'pending');
      vi.mocked(loadAllPrompts).mockReturnValue([...donePrompts, pendingPrompt]);
      vi.mocked(pickNextPrompt).mockReturnValue(
        pickerResult(pendingPrompt, { total: 6, pending: 1, inProgress: 0, done: 5, blocked: 0 }),
      );

      // Tick 3: checkPromptFiles detects pending increase → resets emergentSpawnCount
      // Then checkPromptLoop picks pending prompt → spawns executor
      await loop.forceTick();
      expect(loop.getState().emergentSpawnCount).toBe(0);
      expect(callbacks.onSpawnExecutor).toHaveBeenCalledWith(pendingPrompt);

      dateNowSpy.mockRestore();
    });

    it('resets backoff when emergent planner produces new prompts', async () => {
      setupEmergentPath(5);

      // Tick 1: spawn emergent (productive, count = 0)
      await loop.forceTick();
      expect(callbacks.onSpawnEmergentPlanning).toHaveBeenCalledTimes(1);

      // Tick 2 at +11s: past base cooldown, enters emergent path — unproductive → count = 1
      const spawnTime = loop.getState().lastExecutorSpawnTime!;
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(spawnTime + 11000);
      await loop.forceTick();
      expect(loop.getState().emergentSpawnCount).toBe(1);

      // Emergent planner produced a new prompt (total count increases 5 → 6)
      setupEmergentPath(6);

      // Tick 3 at +21s: past base cooldown, productive (count 6 > emergentLastPromptCount 5)
      // → count = 0, cooldown = 10s base, 21s elapsed → spawns
      dateNowSpy.mockReturnValue(spawnTime + 21000);
      await loop.forceTick();
      expect(loop.getState().emergentSpawnCount).toBe(0);
      expect(callbacks.onSpawnEmergentPlanning).toHaveBeenCalledTimes(2);

      dateNowSpy.mockRestore();
    });
  });
});
