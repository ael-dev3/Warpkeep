import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { EMPTY_WIRE04, SCOPE04, assignmentWire04, constructingWire04, expectDeepFrozen04, freshWire04, wireWithBuilding04 } from './fixtures/gameplay04Client';
import type { ReadWire04 } from '../src/ptr/gameplay04/ptrGameplay04Types';

it('rejects over-cap balances before presentation', () => {
  expect(() => decodeState04({ ...EMPTY_WIRE04, wood: 1_000_001n }, SCOPE04)).toThrow();
});

it('copies and recursively freezes genuine wire state, retaining undefined options', () => {
  const wire = constructingWire04();
  wire.workers[0].assignment = assignmentWire04();
  wire.workers[0].assignmentRevision = 1n;
  const state = decodeState04(wire, SCOPE04);
  expect(state).toEqual(wire);
  expect(state).not.toBe(wire);
  expect(expectDeepFrozen04(state)).toBe(true);
  wire.workers[0].assignment.route[0].q = 44;
  wire.project!.cost.food = 99n;
  expect(state.workers[0].assignment?.route[0].q).toBe(0);
  expect(state.project?.cost.food).toBe(20n);
  expect(state.workers[1].assignment).toBeUndefined();
});

describe('closed bounded state', () => {
  it.each([
    ['negative balance', (w: ReadWire04) => { w.food = -1n; }],
    ['u64 overflow', (w: ReadWire04) => { w.revision = 1n << 64n; }],
    ['zero keep revision', (w: ReadWire04) => { w.revision = 0n; }],
    ['zero accepted sequence', (w: ReadWire04) => { w.lastAcceptedSequence = 0n; }],
    ['fractional ordinal', (w: ReadWire04) => { w.workers[0].ordinal = 0.5; }],
    ['duplicate ordinal', (w: ReadWire04) => { w.workers[0].ordinal = 1; }],
    ['missing ordinal', (w: ReadWire04) => { w.workers.pop(); }],
    ['sparse workers', (w: ReadWire04) => { delete w.workers[0]; }],
    ['extra worker', (w: ReadWire04) => { w.workers.push(w.workers[0]); }],
    ['wrong policy', (w: ReadWire04) => { w.policyVersion = 'legacy'; }],
    ['wrong layout', (w: ReadWire04) => { w.layoutVersion = 'legacy'; }],
    ['wrong digest', (w: ReadWire04) => { w.layoutDigest = 'x'.repeat(64); }],
    ['invented completed level', (w: ReadWire04) => { w.completedLevels.mill = 1; }],
    ['invented effect', (w: ReadWire04) => { w.completedEffects.foodYieldPerQuantum = 12n; }],
    ['null option', (w: ReadWire04) => { Object.assign(w, { project: null }); }],
    ['unknown root field', (w: ReadWire04) => { Object.assign(w, { token: 'secret' }); }],
    ['unknown worker field', (w: ReadWire04) => { Object.assign(w.workers[0], { secret: true }); }],
    ['unknown array field', (w: ReadWire04) => { Object.assign(w.workers, { extra: true }); }],
  ])('rejects %s', (_name, mutate) => {
    const wire = freshWire04(); mutate(wire);
    expect(() => decodeState04(wire, SCOPE04)).toThrow();
  });

  it('does not invoke accessors and sanitizes proxy failures', () => {
    const getter = vi.fn(() => 1n);
    const wire = freshWire04();
    Object.defineProperty(wire, 'wood', { enumerable: true, get: getter });
    expect(() => decodeState04(wire, SCOPE04)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const proxy = new Proxy(freshWire04(), { ownKeys() { throw new Error('private credential'); } });
    expect(() => decodeState04(proxy, SCOPE04)).toThrow('PTR gameplay request is unavailable.');
    const revoked = Proxy.revocable(freshWire04(), {}); revoked.revoke();
    expect(() => decodeState04(revoked.proxy, SCOPE04)).toThrow('PTR gameplay request is unavailable.');
    const symbolField = freshWire04(); Object.assign(symbolField.completedEffects, { [Symbol('unexpected')]: true });
    expect(() => decodeState04(symbolField, SCOPE04)).toThrow();
  });
});

describe('captured assignments', () => {
  function active() {
    const w = freshWire04(); w.workers[0].assignmentRevision = 2n; w.workers[0].assignment = assignmentWire04(); return w;
  }
  it.each([
    ['outbound', 0n], ['gathering', 30n], ['returning', 60n],
  ])('accepts possible %s without consulting client time', (phase, earned) => {
    const w = active(); Object.assign(w.workers[0].assignment!, { phase, earned });
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('must not use clock'); });
    try { expect(decodeState04(w, SCOPE04).workers[0].assignment?.earned).toBe(earned); }
    finally { clock.mockRestore(); }
  });
  it.each([
    ['empty route', { route: [] }], ['too long route', { route: Array(8194).fill({ q: 0, r: 0 }) }],
    ['noncontiguous route', { route: [{ q: 0, r: 0 }, { q: 2, r: 0 }] }],
    ['wrong anchor', { route: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }],
    ['wrong edge count', { routeEdges: 2 }], ['bad captured yield', { yieldPerQuantum: 11n }],
    ['bad captured travel', { travelPerEdgeMicros: 1n }], ['bad duration', { gatheringDurationMicros: 1n }],
    ['bad arrival', { arrivesAt: 3n }], ['bad stop', { gatheringStopsAt: 3n }],
    ['bad return', { returnsAt: 3n }], ['negative timestamp', { dispatchedAt: -1n }],
    ['i64 overflow', { dispatchedAt: 1n << 63n }], ['derived overflow', { dispatchedAt: (1n << 63n) - 1n }],
    ['unknown phase', { phase: 'complete' }], ['outbound earnings', { earned: 10n }],
    ['fractional quantum', { phase: 'gathering', earned: 11n }],
    ['future quanta', { phase: 'gathering', earned: 60n }],
    ['wrong final earnings', { phase: 'returning', earned: 50n }],
    ['late recall', { recalledAt: 62_000_000n }], ['null recall', { recalledAt: null }],
    ['oversized text', { locationId: 'x'.repeat(257) }], ['unknown private field', { nodeId: 'private' }],
  ])('rejects %s', (_name, change) => {
    const w = active(); Object.assign(w.workers[0].assignment!, change);
    expect(() => decodeState04(w, SCOPE04)).toThrow();
  });
  it('accepts recalled outbound and gathering trips using captured return arithmetic', () => {
    const w = active();
    Object.assign(w.workers[0].assignment!, { recalledAt: 1_000_000n, phase: 'returning', gatheringStopsAt: 1_000_000n, returnsAt: 2_000_000n });
    expect(decodeState04(w, SCOPE04).workers[0].assignment?.earned).toBe(0n);
    Object.assign(w.workers[0].assignment!, { recalledAt: 17_000_000n, gatheringStopsAt: 17_000_000n, returnsAt: 19_000_000n, earned: 10n });
    expect(decodeState04(w, SCOPE04).workers[0].assignment?.earned).toBe(10n);
  });
  it('accepts the one-point and 8193-point route bounds without truncation', () => {
    const one = active();
    Object.assign(one.workers[0].assignment!, { route: [{ q: 0, r: 0 }], routeEdges: 0, destinationCellKey: 'CELL:0:0',
      phase: 'gathering', arrivesAt: 0n, gatheringStopsAt: 60_000_000n, returnsAt: 60_000_000n });
    expect(decodeState04(one, SCOPE04).workers[0].assignment?.route).toHaveLength(1);
    const max = active();
    Object.assign(max.workers[0].assignment!, { route: Array.from({ length: 8193 }, (_, q) => ({ q, r: 0 })),
      routeEdges: 8192, destinationCellKey: 'CELL:8192:0', arrivesAt: 16_384_000_000n,
      gatheringStopsAt: 16_444_000_000n, returnsAt: 32_828_000_000n });
    const state = decodeState04(max, SCOPE04);
    expect(state.workers[0].assignment?.route).toHaveLength(8193);
    expect(expectDeepFrozen04(state)).toBe(true);
  });
  it('preserves the wire worker ordering while enforcing the four distinct slots', () => {
    const wire = freshWire04(); wire.workers.reverse();
    expect(decodeState04(wire, SCOPE04).workers.map(worker => worker.ordinal)).toEqual([3, 2, 1, 0]);
  });
  it('validates sparse routes and route point accessors without calling them', () => {
    const w = active(); delete w.workers[0].assignment!.route[0];
    expect(() => decodeState04(w, SCOPE04)).toThrow();
    w.workers[0].assignment = assignmentWire04();
    const getter = vi.fn(() => 0);
    Object.defineProperty(w.workers[0].assignment.route[0], 'q', { enumerable: true, get: getter });
    expect(() => decodeState04(w, SCOPE04)).toThrow(); expect(getter).not.toHaveBeenCalled();
  });
  it('validates return credit arithmetic and assignment revision relations', () => {
    const w = active();
    w.workers[0].lastReturn = { assignmentRevision: 1n, resource: 'food', returnedAtMicros: 0n, earned: 60n, credited: 40n, overflow: 20n };
    expect(decodeState04(w, SCOPE04).workers[0].lastReturn?.overflow).toBe(20n);
    for (const change of [{ credited: 41n }, { credited: 1_000_001n, earned: 1_000_021n }, { assignmentRevision: 0n }, { assignmentRevision: 2n }, { assignmentRevision: 3n }, { returnedAtMicros: -1n }]) {
      const bad = structuredClone(w); Object.assign(bad.workers[0].lastReturn!, change);
      expect(() => decodeState04(bad, SCOPE04)).toThrow();
    }
    w.workers[0].assignmentRevision = 0n;
    expect(() => decodeState04(w, SCOPE04)).toThrow();
  });
  it('accepts idle completed return outcomes at the current assignment revision', () => {
    const wire = freshWire04(); wire.workers[0].assignmentRevision = 1n;
    wire.workers[0].lastReturn = { assignmentRevision: 1n, resource: 'gold', returnedAtMicros: 64_000_000n,
      earned: 60n, credited: 0n, overflow: 60n };
    expect(decodeState04(wire, SCOPE04).workers[0].lastReturn).toEqual(wire.workers[0].lastReturn);
  });
});

describe('construction consistency', () => {
  it('accepts one active project and rejects orphaned or multiple constructing interpretations', () => {
    const wire = constructingWire04(); expect(decodeState04(wire, SCOPE04).project?.targetLevel).toBe(1);
    wire.buildings = []; expect(() => decodeState04(wire, SCOPE04)).toThrow();
    const noProject = constructingWire04(); noProject.project = undefined;
    expect(() => decodeState04(noProject, SCOPE04)).toThrow();
    const two = constructingWire04(); two.buildings.push({ ...two.buildings[0], kind: 'lumber-camp', x: 24_000_000n });
    expect(() => decodeState04(two, SCOPE04)).toThrow();
  });
  it.each([
    { targetLevel: 2 }, { projectRevision: 2n }, { startedAtMicros: -1n },
    { completesAtMicros: 4n }, { durationMicros: 119_000_000n },
    { cost: { food: 21n, wood: 40n, stone: 20n, gold: 0n } }, { kind: 'lumber-camp' },
  ])('rejects inconsistent project %#', change => {
    const w = constructingWire04(); Object.assign(w.project!, change);
    expect(() => decodeState04(w, SCOPE04)).toThrow();
  });
  it('rejects duplicates, overlap, illegal sites, bad levels/revisions and excess buildings', () => {
    for (const change of [{ x: 0n, z: 0n }, { x: 0n, z: 20_000_000n }, { x: 1n }, { rotation: 1 }, { completedLevel: 6 }, { completedLevel: 1.5 }, { revision: 2n }]) {
      const w = wireWithBuilding04(); Object.assign(w.buildings[0], change); expect(() => decodeState04(w, SCOPE04)).toThrow();
    }
    for (const kind of ['city-mill', 'lumber-camp']) {
      const w = wireWithBuilding04(); w.buildings.push({ ...w.buildings[0], kind }); expect(() => decodeState04(w, SCOPE04)).toThrow();
    }
    const w = wireWithBuilding04(); w.buildings = Array(7).fill(w.buildings[0]); expect(() => decodeState04(w, SCOPE04)).toThrow();
  });
});

it('keeps the isolated client directory free of legacy G001 policy/presentation imports', () => {
  const root = resolve('src/ptr/gameplay04');
  for (const file of readdirSync(root).filter(name => /\.tsx?$/.test(name))) {
    const source = readFileSync(resolve(root, file), 'utf8');
    expect(source, file).not.toMatch(/(?:from\s*|import\s*\()['"][^'"]*(?:spacetimedb\/src\/|innerKeep[^'"]*(?:[Pp]olicy|[Pp]resentation))/);
  }
});
