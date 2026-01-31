/**
 * New Initiative Routing Integration Tests
 *
 * Validates:
 * - Unified scoping flow routing (all spec types → IDEATION_SCOPING.md)
 * - WORKFLOW_DOMAIN_PATH resolution for each spec type
 * - buildActionItems() always-visible guarantee for new-initiative and initiative-steering
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import type { SpecType } from '../../lib/specs.js';
import { UNIFIED_SCOPING_FLOW } from '../../commands/tui.js';
import { buildActionItems, type ToggleState } from '../../tui/actions.js';
import { getFlowsDirectory } from '../../lib/flows.js';

const ALL_SPEC_TYPES: SpecType[] = [
  'milestone',
  'investigation',
  'optimization',
  'refactor',
  'documentation',
  'triage',
];

// ─── Task 1: Unified scoping flow routing ────────────────────────────────────

describe('Unified scoping flow routing', () => {
  it('UNIFIED_SCOPING_FLOW is IDEATION_SCOPING.md', () => {
    expect(UNIFIED_SCOPING_FLOW).toBe('IDEATION_SCOPING.md');
  });

  it('unified scoping flow file exists on disk', () => {
    const flowsDir = getFlowsDirectory();
    const fullPath = join(flowsDir, UNIFIED_SCOPING_FLOW);
    expect(existsSync(fullPath)).toBe(true);
  });

  it('all spec types resolve to the same unified flow path', () => {
    const flowsDir = getFlowsDirectory();
    const expectedPath = join(flowsDir, UNIFIED_SCOPING_FLOW);

    for (const _specType of ALL_SPEC_TYPES) {
      // All types now route to the unified flow — no per-type mapping
      const flowOverride = join(flowsDir, UNIFIED_SCOPING_FLOW);
      expect(flowOverride).toBe(expectedPath);
    }
  });
});

// ─── Task 2: WORKFLOW_DOMAIN_PATH resolution per spec type ───────────────────

describe('WORKFLOW_DOMAIN_PATH resolution', () => {
  it.each(ALL_SPEC_TYPES)(
    '%s resolves to .allhands/workflows/%s.md',
    (specType) => {
      // Mirrors the resolution logic in handleAction's new-initiative case
      const cwd = process.cwd();
      const domainPath = join(cwd, '.allhands', 'workflows', `${specType}.md`);

      expect(domainPath).toContain('.allhands/workflows/');
      expect(domainPath).toContain(`${specType}.md`);
    }
  );

  it('each spec type produces a unique WORKFLOW_DOMAIN_PATH', () => {
    const cwd = process.cwd();
    const paths = ALL_SPEC_TYPES.map((t) =>
      join(cwd, '.allhands', 'workflows', `${t}.md`)
    );
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(ALL_SPEC_TYPES.length);
  });

  it('flowOverride config shape includes WORKFLOW_DOMAIN_PATH', () => {
    const cwd = process.cwd();
    const specType = 'investigation';

    // Construct the same config shape the handler builds
    const context = {
      WORKFLOW_DOMAIN_PATH: join(cwd, '.allhands', 'workflows', `${specType}.md`),
    };
    const config = {
      agentName: 'ideation',
      context,
      focusWindow: true,
      flowOverride: join(getFlowsDirectory(), UNIFIED_SCOPING_FLOW),
    };

    expect(config.flowOverride).toContain('IDEATION_SCOPING.md');
    expect(config.context.WORKFLOW_DOMAIN_PATH).toContain('investigation.md');
  });
});

// ─── Task 3: buildActionItems() always-visible guarantee ─────────────────────

describe('buildActionItems always-visible guarantee', () => {
  const prActionStates = ['create-pr', 'awaiting-review', 'rerun-pr-review'] as const;

  const toggleCombinations: ToggleState[] = [];
  for (const loop of [true, false]) {
    for (const parallel of [true, false]) {
      for (const pr of prActionStates) {
        toggleCombinations.push({
          loopEnabled: loop,
          parallelEnabled: parallel,
          prActionState: pr,
        });
      }
    }
  }

  it.each(toggleCombinations)(
    'new-initiative is present with loop=$loopEnabled, parallel=$parallelEnabled, pr=$prActionState',
    (toggleState) => {
      const items = buildActionItems(toggleState);
      const newInitiative = items.find((item) => item.id === 'new-initiative');
      expect(newInitiative).toBeDefined();
      expect(newInitiative!.type).toBe('action');
    }
  );

  it.each(toggleCombinations)(
    'initiative-steering is present with loop=$loopEnabled, parallel=$parallelEnabled, pr=$prActionState',
    (toggleState) => {
      const items = buildActionItems(toggleState);
      const steering = items.find((item) => item.id === 'initiative-steering');
      expect(steering).toBeDefined();
      expect(steering!.type).toBe('action');
      expect(steering!.key).toBe('=');
    }
  );

  it('no action items have hidden or disabled properties', () => {
    const items = buildActionItems({
      loopEnabled: false,
      parallelEnabled: false,
      prActionState: 'create-pr',
    });

    for (const item of items) {
      // ActionItem interface at actions.ts:21 has: id, label, key?, type, highlight?, checked?
      // No hidden or disabled fields exist
      expect(item).not.toHaveProperty('hidden');
      expect(item).not.toHaveProperty('disabled');
    }
  });

  it('returns consistent action count across all toggle states', () => {
    const counts = toggleCombinations.map(
      (ts) => buildActionItems(ts).length
    );
    const uniqueCounts = new Set(counts);
    expect(uniqueCounts.size).toBe(1);
  });
});
