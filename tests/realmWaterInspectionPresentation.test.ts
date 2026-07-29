import { describe, expect, it } from 'vitest';

import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1
} from '../spacetimedb/src/waterWorld';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../spacetimedb/src/waterRevision';
import {
  realmWaterInspectionNavigation,
  realmWaterNavigatorBodies,
  resolveRealmWaterInspectionRecords
} from '../src/components/realm/realmWaterInspectionPresentation';
import {
  createCanonicalWaterNavigationGraph
} from '../src/game/map/canonicalWaterNavigation';

describe('public water inspection presentation', () => {
  it('creates bounded river records with source, mouth, flow, and fog facts', () => {
    const records = resolveRealmWaterInspectionRecords(GENESIS_WATER_REVISION_ENABLED_CELLS_V1);
    const rivers = records.filter((record) => record.regime === 'river');
    expect(rivers).toHaveLength(400);
    expect(rivers[0]).toMatchObject({
      displayType: 'river',
      displayName: expect.stringMatching(/^Genesis River /),
      sourceCellKey: expect.any(String),
      mouthCellKey: expect.any(String),
      riverCellCount: expect.any(Number),
      riverPosition: expect.any(String),
      flowClass: expect.any(String),
      gameplayBoundary: expect.stringContaining('does not add')
    });
  });

  it('shows clear and haze public ocean cells but never full-fog ocean cells', () => {
    const records = resolveRealmWaterInspectionRecords(GENESIS_WATER_REVISION_ENABLED_CELLS_V1);
    expect(records.some((record) => record.regime === 'ocean' && record.fogBand === 'clear')).toBe(true);
    expect(records.some((record) => record.regime === 'ocean' && record.fogBand === 'haze')).toBe(true);
  });

  it('creates one navigator entry per river body rather than one row per cell', () => {
    const records = resolveRealmWaterInspectionRecords(GENESIS_WATER_REVISION_ENABLED_CELLS_V1);
    const bodies = realmWaterNavigatorBodies(records);
    expect(bodies).toHaveLength(GENESIS_WATER_BODIES_V1.filter((body) => body.regime === 'river').length);
    expect(new Set(bodies.map((body) => body.bodyId)).size).toBe(bodies.length);
    expect(bodies[0]).toMatchObject({
      label: expect.stringMatching(/^Genesis River /),
      sourceCellKey: expect.any(String),
      mouthCellKey: expect.any(String)
    });
  });

  it('fails closed for lake rows or malformed body identity', () => {
    expect(resolveRealmWaterInspectionRecords(GENESIS_WATER_CELLS_V1)).toEqual([]);
    const lake = GENESIS_WATER_CELLS_V1.find((cell) => cell.regime === 'lake');
    expect(lake).toBeDefined();
    expect(resolveRealmWaterInspectionRecords([lake!])).toEqual([]);
    const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find((cell) => cell.regime === 'river');
    expect(river).toBeDefined();
    expect(resolveRealmWaterInspectionRecords([
      { ...river!, bodyId: 'unexpected-body' }
    ])).toEqual([]);
  });

  it('fails closed when a river body points at an unavailable endpoint', () => {
    const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'river'
    )!;
    const malformedBodies = GENESIS_WATER_BODIES_V1.map((body) => (
      body.bodyId === river.bodyId
        ? { ...body, mouthCellKey: 'missing-water-endpoint' }
        : body
    ));

    expect(resolveRealmWaterInspectionRecords(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      [],
      malformedBodies
    )).toEqual([]);
  });

  it('normalizes the preserved underlying terrain metadata for river records', () => {
    const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'river' && cell.underlyingTileKey
    )!;
    const record = resolveRealmWaterInspectionRecords(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      [{
        tileKey: river.underlyingTileKey!,
        terrainKind: 'forest',
        staticContentKind: 'empty',
        passable: true
      }]
    ).find((candidate) => candidate.cellKey === river.cellKey);

    expect(record).toMatchObject({
      underlyingTileKey: river.underlyingTileKey,
      underlyingTerrainKind: 'forest',
      underlyingTerrainLabel: 'Lowland Forest',
      underlyingPassable: true
    });
  });

  it('joins each river record to exact graph routes without renderer inference', () => {
    const graph = createCanonicalWaterNavigationGraph(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      GENESIS_WATER_BODIES_V1
    );
    const records = resolveRealmWaterInspectionRecords(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1
    );
    const riverRecords = records.filter((record) => record.regime === 'river');

    for (const record of riverRecords) {
      const navigation = realmWaterInspectionNavigation(graph, record);
      expect(navigation, record.cellKey).toBeDefined();
      expect(navigation?.cellKey).toBe(record.cellKey);
      expect(navigation?.sourceCellKey).toBe(record.sourceCellKey);
      expect(navigation?.mouthCellKey).toBe(record.mouthCellKey);
      expect(navigation?.sourceDistance).toBe(record.riverOrder);
      expect(navigation?.mouthDistance).toBe(
        record.riverCellCount! - record.riverOrder! - 1
      );
      expect(Object.isFrozen(navigation)).toBe(true);
      expect(Object.isFrozen(navigation?.previousCellKeys)).toBe(true);
    }
  });

  it('fails one record navigation join closed when graph identity is unavailable', () => {
    const graph = createCanonicalWaterNavigationGraph(undefined, undefined);
    const record = resolveRealmWaterInspectionRecords(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1
    ).find((candidate) => candidate.regime === 'river')!;

    expect(realmWaterInspectionNavigation(graph, record)).toBeUndefined();
    expect(realmWaterInspectionNavigation(
      createCanonicalWaterNavigationGraph(
        GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
        GENESIS_WATER_BODIES_V1
      ),
      { ...record, bodyId: 'different-public-body' }
    )).toBeUndefined();
  });
});
