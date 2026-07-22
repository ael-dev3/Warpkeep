import { describe, expect, it } from 'vitest';

import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1
} from '../spacetimedb/src/waterWorld';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../spacetimedb/src/waterRevision';
import {
  realmWaterNavigatorBodies,
  resolveRealmWaterInspectionRecords
} from '../src/components/realm/realmWaterInspectionPresentation';

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
});
