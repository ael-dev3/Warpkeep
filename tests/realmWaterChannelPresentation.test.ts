import { describe, expect, it } from 'vitest';

import {
  createRealmWaterChannelPlan,
  realmWaterChannelHalfWidth,
  type RealmWaterChannelCell
} from '../src/components/realm/realmWaterChannelPresentation';
import { axialToWorld } from '../src/game/map/hexCoordinates';

const riverBody: readonly RealmWaterChannelCell[] = Object.freeze([
  Object.freeze({
    cellKey: '0,0',
    q: 0,
    r: 0,
    regime: 'river',
    bodyId: 'river:a',
    riverOrder: 0,
    downstreamWaterCellKey: '1,0',
    flowAccumulation: 1,
    depthClass: 1,
    surfaceLevelMilli: 1_080,
    bankSeed: 1
  }),
  Object.freeze({
    cellKey: '1,0',
    q: 1,
    r: 0,
    regime: 'river',
    bodyId: 'river:a',
    riverOrder: 1,
    downstreamWaterCellKey: '2,0',
    flowAccumulation: 4,
    depthClass: 1,
    surfaceLevelMilli: 1_060,
    bankSeed: 2
  }),
  Object.freeze({
    cellKey: '2,0',
    q: 2,
    r: 0,
    regime: 'river',
    bodyId: 'river:a',
    riverOrder: 2,
    downstreamWaterCellKey: '2,1',
    flowAccumulation: 16,
    depthClass: 2,
    surfaceLevelMilli: 1_030,
    bankSeed: 3
  }),
  Object.freeze({
    cellKey: '2,1',
    q: 2,
    r: 1,
    regime: 'river',
    bodyId: 'river:a',
    riverOrder: 3,
    flowAccumulation: 64,
    depthClass: 3,
    surfaceLevelMilli: 1_000,
    bankSeed: 4
  })
]);

const mouthOcean: RealmWaterChannelCell = Object.freeze({
  cellKey: '2,2',
  q: 2,
  r: 2,
  regime: 'ocean',
  bodyId: 'ocean'
});

describe('Realm Water channel presentation', () => {
  it('builds continuous source, straight, bend, and ocean-mouth sections', () => {
    const plan = createRealmWaterChannelPlan([...riverBody, mouthOcean], 1);
    expect(plan).toMatchObject({
      riverCellCount: 4,
      channelBodyCount: 1,
      fallbackBodyCount: 0,
      fallbackCellCount: 0,
      mouthConnectionCount: 1
    });
    const body = plan.bodies[0]!;
    expect(body.mode).toBe('channel');
    expect(body.sections.map((section) => section.kind)).toEqual([
      'source-cap',
      'cell',
      'cell',
      'cell',
      'cell',
      'mouth-edge'
    ]);
    expect(body.sections.slice(1, -1).map((section) => section.world)).toEqual(
      riverBody.map((cell) => axialToWorld(cell, 1))
    );

    const sourceCenter = axialToWorld(riverBody[0]!, 1);
    const firstDownstream = axialToWorld(riverBody[1]!, 1);
    expect(body.sections[0]!.world.x).toBeLessThan(sourceCenter.x);
    expect(body.sections[0]!.world.z).toBeCloseTo(sourceCenter.z, 8);
    expect(firstDownstream.x).toBeGreaterThan(sourceCenter.x);

    const mouthCenter = axialToWorld(riverBody.at(-1)!, 1);
    const oceanCenter = axialToWorld(mouthOcean, 1);
    expect(body.sections.at(-1)!.world).toEqual({
      x: (mouthCenter.x + oceanCenter.x) * 0.5,
      z: (mouthCenter.z + oceanCenter.z) * 0.5
    });
    expect(body.sections.at(-1)!.foam).toBeGreaterThan(
      body.sections[2]!.foam
    );
    const cellWidths = riverBody.map((cell) => realmWaterChannelHalfWidth(cell, 1));
    expect(cellWidths).toEqual([...cellWidths].sort((left, right) => left - right));
    expect(Math.max(...cellWidths)).toBeLessThan(0.5);
  });

  it('is stable under input permutations', () => {
    const first = createRealmWaterChannelPlan([...riverBody, mouthOcean], 1);
    const reversed = createRealmWaterChannelPlan(
      [mouthOcean, ...[...riverBody].reverse()],
      1
    );
    expect(reversed).toEqual(first);
  });

  it('contains one malformed body without suppressing a valid peer body', () => {
    const malformed = riverBody.map((cell, index) => Object.freeze({
      ...cell,
      q: cell.q + 10,
      cellKey: `${cell.q + 10},${cell.r}`,
      bodyId: 'river:broken',
      downstreamWaterCellKey: index === 0
        ? 'wrong'
        : index < riverBody.length - 1
          ? `${riverBody[index + 1]!.q + 10},${riverBody[index + 1]!.r}`
          : undefined
    }));
    const plan = createRealmWaterChannelPlan([
      ...riverBody,
      ...malformed,
      mouthOcean
    ], 1);

    expect(plan).toMatchObject({
      riverCellCount: 8,
      channelBodyCount: 1,
      fallbackBodyCount: 1,
      fallbackCellCount: 4
    });
    expect(plan.bodies.find((body) => body.bodyId === 'river:a')?.mode)
      .toBe('channel');
    expect(plan.bodies.find((body) => body.bodyId === 'river:broken'))
      .toMatchObject({
        mode: 'full-cell-fallback',
        fallbackReason: 'downstream-mismatch'
      });
  });
});
