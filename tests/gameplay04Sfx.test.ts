import { describe, expect, it } from 'vitest';
import { gameplay04SfxEvents, GAMEPLAY04_SFX_BUILDING } from '../src/ptr/gameplay04/gameplay04Sfx';
import type { View04 } from '../src/ptr/gameplay04/gameplay04Presentation';

type WorkerFixture = { ordinal: number; assignmentRevision: bigint; assignment?: { phase: string; recalledAt?: bigint }; lastReturn?: { assignmentRevision: bigint; resource: string; credited: bigint } };

function view(revision: bigint, options: { workers?: WorkerFixture[]; project?: { projectRevision: bigint }; buildings?: { kind: string; completedLevel: number }[] } = {}) {
  const workers = options.workers ?? [0, 1, 2, 3].map(ordinal => ({ ordinal, assignmentRevision: 0n }));
  return { state: { revision, workers, project: options.project, buildings: options.buildings ?? [] } } as unknown as View04;
}
const idle = (ordinal: number, revision = 0n): WorkerFixture => ({ ordinal, assignmentRevision: revision });

describe('gameplay04 sound projection', () => {
  it('is silent for the first view, a repeated view and an older read', () => {
    const first = view(5n);
    expect(gameplay04SfxEvents(null, first)).toEqual([]);
    expect(gameplay04SfxEvents(first, first)).toEqual([]);
    expect(gameplay04SfxEvents(first, view(4n, { project: { projectRevision: 1n } }))).toEqual([]);
  });

  it('announces confirmed dispatches, recalls, arrivals and returns, clustered by count', () => {
    const before = view(1n, { workers: [
      idle(0), idle(1), { ordinal: 2, assignmentRevision: 3n, assignment: { phase: 'outbound' } },
      { ordinal: 3, assignmentRevision: 4n, assignment: { phase: 'outbound' } },
    ] });
    const after = view(2n, { workers: [
      { ordinal: 0, assignmentRevision: 1n, assignment: { phase: 'outbound' } },
      { ordinal: 1, assignmentRevision: 1n, assignment: { phase: 'outbound' } },
      { ordinal: 2, assignmentRevision: 3n, assignment: { phase: 'gathering' } },
      { ordinal: 3, assignmentRevision: 4n, assignment: { phase: 'returning', recalledAt: 9n } },
    ] });
    expect(gameplay04SfxEvents(before, after)).toEqual([
      { kind: 'worker-dispatch-confirmed', count: 2 },
      { kind: 'worker-recall-confirmed', count: 1 },
      { kind: 'worker-arrived', count: 1 },
    ]);
  });

  it('plays a credited return with its resource, but not an empty recalled cart', () => {
    const before = view(7n, { workers: [
      { ordinal: 0, assignmentRevision: 2n, assignment: { phase: 'returning' } },
      { ordinal: 1, assignmentRevision: 3n, assignment: { phase: 'returning', recalledAt: 4n } }, idle(2), idle(3),
    ] });
    const after = view(8n, { workers: [
      { ordinal: 0, assignmentRevision: 2n, lastReturn: { assignmentRevision: 2n, resource: 'wood', credited: 40n } },
      { ordinal: 1, assignmentRevision: 3n, lastReturn: { assignmentRevision: 3n, resource: 'gold', credited: 0n } }, idle(2), idle(3),
    ] });
    expect(gameplay04SfxEvents(before, after)).toEqual([
      { kind: 'worker-returned', count: 2 },
      { kind: 'keep-resources-credited', resource: 'wood', count: 1 },
    ]);
    // The same outcome on a later read is not announced again.
    expect(gameplay04SfxEvents(after, view(9n, { workers: (after.state.workers as unknown as WorkerFixture[]) }))).toEqual([]);
  });

  it('announces a new construction project and a completed level once each', () => {
    const before = view(1n, { buildings: [{ kind: 'city-mill', completedLevel: 1 }] });
    const started = view(2n, { project: { projectRevision: 1n }, buildings: [{ kind: 'city-mill', completedLevel: 1 }] });
    expect(gameplay04SfxEvents(before, started)).toEqual([{ kind: 'keep-construction-started' }]);
    const completed = view(3n, { buildings: [{ kind: 'city-mill', completedLevel: 2 }] });
    expect(gameplay04SfxEvents(started, completed)).toEqual([{ kind: 'keep-construction-completed' }]);
    // A brand-new building at level one also counts as an improvement.
    expect(gameplay04SfxEvents(view(1n), view(2n, { buildings: [{ kind: 'lumber-camp', completedLevel: 1 }] }))).toEqual([{ kind: 'keep-construction-completed' }]);
  });

  it('names a material voice for every keep building', () => {
    expect(Object.values(GAMEPLAY04_SFX_BUILDING).sort()).toEqual(['barracks', 'cathedral', 'gold', 'lumber', 'mill', 'stone']);
  });
});
