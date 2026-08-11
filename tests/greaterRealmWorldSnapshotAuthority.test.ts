import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE
} from '../src/dev/greaterRealmSyntheticTierOneFixture';
import type {
  GreaterRealmClientSnapshot
} from '../src/greater-realm/greaterRealmClientRuntime';
import {
  greaterRealmWindowCastleTopologySignature,
  isCurrentGreaterRealmSceneSnapshot
} from '../src/components/realm/greaterRealmWorldSnapshotAuthority';

const OWN_CASTLE = Object.freeze({ castleId: 1, q: -2, r: 1 });
const VIEW = Object.freeze({ centerQ: -1, centerR: 0, radius: 3, lod: 1 });

function readySnapshot(mode = 'active') {
  const chunks = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks.map((chunk, index) => ({
    chunk: { ...chunk, lod: 1 as const },
    distanceChunks: index
  }));
  return {
    phase: 'ready',
    sessionGeneration: 17,
    deviceClass: 'desktop',
    graphicsProfile: 'balanced',
    cellSize: 1,
    bootstrap: {
      ...GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap,
      mode,
      myCastleId: 1n
    },
    window: {
      ...GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window,
      centerQ: VIEW.centerQ,
      centerR: VIEW.centerR,
      radius: VIEW.radius
    },
    view: VIEW,
    chunks,
    selectedChunkCount: chunks.length,
    stream: {}
  } as unknown as GreaterRealmClientSnapshot;
}

function current(snapshot: GreaterRealmClientSnapshot) {
  return isCurrentGreaterRealmSceneSnapshot({
    snapshot,
    sessionGeneration: 17,
    ownCastle: OWN_CASTLE,
    view: VIEW
  });
}

describe('Greater Realm scene snapshot authority', () => {
  it('accepts canary, active, and halted reads with caller-derived atlas coordinates', () => {
    expect(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.myCellKey)
      .not.toMatch(/:-2:1$/u);
    expect(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap).toMatchObject({
      myAtlasQ: OWN_CASTLE.q,
      myAtlasR: OWN_CASTLE.r
    });
    for (const mode of ['canary', 'active', 'halted']) {
      expect(current(readySnapshot(mode))).toBe(true);
    }
    expect(current(readySnapshot('draining'))).toBe(false);
  });

  it('rejects stale generation, atlas, caller castle, coordinates, elevation, view, and phase', () => {
    const valid = readySnapshot() as any;
    const mutations = [
      (row: any) => { row.sessionGeneration = 18; },
      (row: any) => { row.window.atlasId = 'greater.realm.other.v17'; },
      (row: any) => { row.bootstrap.myCastleId = 2n; },
      (row: any) => { row.bootstrap.myAtlasQ -= 1; },
      (row: any) => { row.bootstrap.myAtlasR += 1; },
      (row: any) => { row.bootstrap.myElevation += 1; },
      (row: any) => { row.window.castles[0].elevation += 1; },
      (row: any) => { row.view.radius = 2; },
      (row: any) => { row.phase = 'failed'; },
      (row: any) => { row.chunks[0].chunk.revision += 1n; }
    ];
    for (const mutate of mutations) {
      const hostile = structuredClone(valid);
      mutate(hostile);
      expect(current(hostile)).toBe(false);
    }
  });

  it('accepts reduced-LOD omission but rejects conflicting sampled own-cell authority', () => {
    const omitted = structuredClone(readySnapshot()) as any;
    for (const row of omitted.chunks) {
      row.chunk.coreCells = row.chunk.coreCells.filter(
        (cell: any) => cell.cellKey !== omitted.bootstrap.myCellKey
      );
      row.chunk.apronCells = row.chunk.apronCells.filter(
        (cell: any) => cell.cellKey !== omitted.bootstrap.myCellKey
      );
    }
    expect(current(omitted)).toBe(true);

    const conflictingCoordinate = structuredClone(omitted) as any;
    conflictingCoordinate.chunks[0].chunk.coreCells.push({
      ...conflictingCoordinate.chunks[0].chunk.coreCells[0],
      cellKey: 'T1_LOWLANDS:99:99',
      atlasQ: OWN_CASTLE.q,
      atlasR: OWN_CASTLE.r,
      elevation: conflictingCoordinate.bootstrap.myElevation
    });
    expect(current(conflictingCoordinate)).toBe(false);

    const duplicated = structuredClone(readySnapshot()) as any;
    const ownCell = duplicated.chunks
      .flatMap((row: any) => [...row.chunk.coreCells, ...row.chunk.apronCells])
      .find((cell: any) => cell.cellKey === duplicated.bootstrap.myCellKey);
    duplicated.chunks[1].chunk.apronCells.push(structuredClone(ownCell));
    expect(current(duplicated)).toBe(true);
    duplicated.chunks[1].chunk.apronCells.at(-1).elevation += 1;
    expect(current(duplicated)).toBe(false);
  });

  it('requires the authoritative own placement chunk in the selected render set', () => {
    const hostile = structuredClone(readySnapshot()) as any;
    const ownHandle = hostile.window.castles[0].chunkHandle;
    hostile.chunks = hostile.chunks.filter(
      (row: any) => row.chunk.chunkHandle !== ownHandle
    );
    hostile.selectedChunkCount = hostile.chunks.length;
    expect(hostile.window.chunks.some(
      (descriptor: any) => descriptor.chunkHandle === ownHandle
    )).toBe(true);
    expect(current(hostile)).toBe(false);
  });

  it('signs every public window-castle placement field', () => {
    const castles = readySnapshot().window!.castles;
    const signature = greaterRealmWindowCastleTopologySignature(castles);
    for (const key of ['chunkHandle', 'atlasQ', 'atlasR', 'level', 'elevation'] as const) {
      const changed = castles.map((castle, index) => index === 1
        ? { ...castle, [key]: typeof castle[key] === 'number'
            ? castle[key] + 1
            : `${castle[key]}-changed` }
        : castle);
      expect(greaterRealmWindowCastleTopologySignature(changed as typeof castles))
        .not.toBe(signature);
    }
  });
});
