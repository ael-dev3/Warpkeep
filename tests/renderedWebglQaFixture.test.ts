import { describe, expect, it } from 'vitest';

import { CANONICAL_CASTLE_SLOTS } from '../spacetimedb/src/world';
import {
  createRenderedWebglQaFixtureRealm,
  renderedWebglQaFixtureSnapshot
} from '../src/dev/renderedWebglQaFixture';
import {
  boundedRenderedWebglQaReadyMilliseconds,
  RENDERED_WEBGL_QA_CASTLE_COUNT,
  RENDERED_WEBGL_QA_DEFAULT_QUALITY,
  RENDERED_WEBGL_QA_FIXTURE_ID,
  readRenderedWebglQaOptions,
  renderedWebglQaRendererForReadyTiming,
  renderedWebglQaStatusForRenderer
} from '../src/dev/renderedWebglQa';

describe('rendered WebGL local QA fixture', () => {
  it('uses every canonical slot with deterministic synthetic-only public presentation', () => {
    const snapshot = renderedWebglQaFixtureSnapshot();

    expect(snapshot.castles).toHaveLength(RENDERED_WEBGL_QA_CASTLE_COUNT);
    expect(snapshot.castles.map((castle) => castle.tileKey))
      .toEqual(CANONICAL_CASTLE_SLOTS.map((slot) => slot.tileKey));
    expect(snapshot.castles.map((castle) => castle.canonicalUsername))
      .toEqual(Array.from({ length: 100 }, (_, index) => `qa-keep-${String(index + 1).padStart(3, '0')}`));
    expect(snapshot.castles.every((castle) => castle.portraitAvailable === false)).toBe(true);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/(?:https?:|pfp|wallet|token|terms|farcaster|\bfid\b)/i);
    expect(serialized).toContain('Synthetic Keep 001');
    expect(serialized).toContain('Synthetic Keep 100');
  });

  it('adapts the local fixture through the observer-only presentation path', () => {
    const realm = createRenderedWebglQaFixtureRealm();

    expect(realm.snapshot.castles).toHaveLength(RENDERED_WEBGL_QA_CASTLE_COUNT);
    expect(realm.snapshot.profiles).toHaveLength(RENDERED_WEBGL_QA_CASTLE_COUNT);
    expect(realm.snapshot.profiles.every((profile) => profile.pfpUrl === undefined)).toBe(true);
    expect(realm.snapshot.profiles.every((profile) => profile.communityStatsVisible === false)).toBe(true);
    expect(realm.snapshot.ownCastle.castleId).toBe(900_000);
  });

  it('accepts only the three reviewed quality modes and bounds local timing', () => {
    expect(readRenderedWebglQaOptions('?quality=high')).toEqual({ quality: 'high' });
    expect(readRenderedWebglQaOptions('?quality=balanced')).toEqual({ quality: 'balanced' });
    expect(readRenderedWebglQaOptions('?quality=reduced')).toEqual({ quality: 'reduced' });
    expect(readRenderedWebglQaOptions('?quality=high&host=example.invalid')).toEqual({
      quality: RENDERED_WEBGL_QA_DEFAULT_QUALITY
    });
    expect(readRenderedWebglQaOptions('?quality=unsafe')).toEqual({
      quality: RENDERED_WEBGL_QA_DEFAULT_QUALITY
    });
    expect(readRenderedWebglQaOptions('?quality=high&quality=reduced')).toEqual({
      quality: RENDERED_WEBGL_QA_DEFAULT_QUALITY
    });
    expect(boundedRenderedWebglQaReadyMilliseconds(100, 1_700)).toBe(1_600);
    expect(boundedRenderedWebglQaReadyMilliseconds(100, 120_101)).toBeUndefined();
    expect(renderedWebglQaRendererForReadyTiming('webgl', 1_600)).toBe('webgl');
    expect(renderedWebglQaRendererForReadyTiming('webgl', undefined)).toBe('error');
    expect(renderedWebglQaRendererForReadyTiming('fallback', undefined)).toBe('fallback');
    expect(renderedWebglQaStatusForRenderer('webgl')).toBe('ready');
    expect(renderedWebglQaStatusForRenderer('fallback')).toBe('fallback');
    expect(RENDERED_WEBGL_QA_FIXTURE_ID).toBe('synthetic-canonical-100');
  });
});
