import { describe, expect, it, vi } from 'vitest';

import {
  WARPKEEP_WATER_AMBIENCE_OFF,
  createWarpkeepWaterAmbiencePublisher,
  normalizeWarpkeepWaterAmbience,
  subscribeWarpkeepWaterAmbience
} from '../src/components/audio/waterAmbience';

describe('Water ambience presentation channel', () => {
  it('normalizes malformed input without carrying world identity', () => {
    expect(normalizeWarpkeepWaterAmbience({
      regime: 'river',
      relevance: 8,
      character: Number.NaN,
      selected: true
    })).toEqual({
      regime: 'river',
      relevance: 1,
      character: 0,
      selected: true
    });
    expect(normalizeWarpkeepWaterAmbience({
      regime: 'none',
      relevance: 1,
      character: 1,
      selected: true
    })).toBe(WARPKEEP_WATER_AMBIENCE_OFF);
  });

  it('keeps overlapping renderer publishers independent during recovery', () => {
    const observed: unknown[] = [];
    const unsubscribe = subscribeWarpkeepWaterAmbience((state) => {
      observed.push(state);
    });
    const oldScene = createWarpkeepWaterAmbiencePublisher();
    const newScene = createWarpkeepWaterAmbiencePublisher();

    oldScene.publish({
      regime: 'river',
      relevance: 0.5,
      character: 0.3,
      selected: false
    });
    newScene.publish({
      regime: 'ocean',
      relevance: 0.8,
      character: 0.7,
      selected: false
    });
    oldScene.dispose();
    expect(observed.at(-1)).toMatchObject({
      regime: 'ocean',
      relevance: 0.8
    });

    newScene.dispose();
    expect(observed.at(-1)).toBe(WARPKEEP_WATER_AMBIENCE_OFF);
    unsubscribe();
  });

  it('does not notify when a scene republishes the same bounded state', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWarpkeepWaterAmbience(listener);
    const publisher = createWarpkeepWaterAmbiencePublisher();
    const state = {
      regime: 'river' as const,
      relevance: 0.45,
      character: 0.25,
      selected: false
    };
    publisher.publish(state);
    const count = listener.mock.calls.length;
    publisher.publish(state);
    expect(listener).toHaveBeenCalledTimes(count);
    publisher.dispose();
    unsubscribe();
  });
});
