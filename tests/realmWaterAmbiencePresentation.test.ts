import { describe, expect, it } from 'vitest';

import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1
} from '../spacetimedb/src/waterRevision';
import { axialToWorld, hexDistance } from '../src/game/map/hexCoordinates';
import {
  createRealmWaterAmbienceSampler
} from '../src/components/realm/realmWaterAmbiencePresentation';

const sampler = createRealmWaterAmbienceSampler(
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1
);

describe('Realm Water ambience presentation', () => {
  it('gates to true silence at an inland focus', () => {
    const state = sampler.sample({
      active: true,
      cameraBand: 'close',
      focus: axialToWorld({ q: 0, r: 0 }, 1)
    });
    expect(state).toEqual({
      regime: 'none',
      relevance: 0,
      character: 0,
      selected: false
    });
  });

  it('resolves a nearby river without exposing its identity', () => {
    const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'river'
    )!;
    const state = sampler.sample({
      active: true,
      cameraBand: 'close',
      focus: axialToWorld(river, 1)
    });
    expect(state.regime).toBe('river');
    expect(state.relevance).toBe(1);
    expect(state.character).toBeGreaterThanOrEqual(0);
    expect(state.character).toBeLessThanOrEqual(1);
    expect(Object.keys(state).sort()).toEqual([
      'character',
      'regime',
      'relevance',
      'selected'
    ]);
  });

  it('keeps ocean ambience coastal and excludes full-fog records', () => {
    const visibleOcean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'ocean' && cell.fogBand === 'clear'
    )!;
    const fullFogOcean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => (
        cell.regime === 'ocean'
        && cell.fogBand === 'full'
        && GENESIS_WATER_REVISION_ENABLED_CELLS_V1
          .filter((candidate) => candidate.regime !== 'ocean')
          .every((candidate) => hexDistance(cell, candidate) > 4)
      )
    )!;
    expect(sampler.sample({
      active: true,
      cameraBand: 'strategy',
      focus: axialToWorld(visibleOcean, 1)
    }).regime).toBe('ocean');
    const baselineAtFog = sampler.sample({
      active: true,
      cameraBand: 'close',
      focus: axialToWorld(fullFogOcean, 1)
    });
    expect(sampler.sample({
      active: true,
      cameraBand: 'close',
      focus: axialToWorld(fullFogOcean, 1),
      selectedCellKey: fullFogOcean.cellKey
    })).toBe(baselineAtFog);
  });

  it('lets an explicit published selection remain quietly relevant at overview', () => {
    const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'river'
    )!;
    const state = sampler.sample({
      active: true,
      cameraBand: 'overview',
      focus: axialToWorld({ q: 0, r: 0 }, 1),
      selectedCellKey: river.cellKey
    });
    expect(state).toMatchObject({
      regime: 'river',
      selected: true
    });
    expect(state.relevance).toBeGreaterThan(0);
    expect(state.relevance).toBeLessThan(0.6);
    expect(sampler.sample({
      active: false,
      cameraBand: 'close',
      focus: axialToWorld(river, 1),
      selectedCellKey: river.cellKey
    }).regime).toBe('none');
  });
});
