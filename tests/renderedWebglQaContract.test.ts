import { describe, expect, it } from 'vitest';

import {
  parseRenderedWebglQaObservation,
  renderedWebglQaUrl
} from '../scripts/qa-observer/rendered-webgl-qa-contract.mjs';

describe('rendered WebGL QA contract', () => {
  it('formats only the exact loopback fixture route', () => {
    expect(renderedWebglQaUrl()).toBe(
      'http://127.0.0.1:5173/dev/realm-rendered-webgl-qa.html?quality=balanced'
    );
    expect(renderedWebglQaUrl({ quality: 'high', port: 41_732 })).toBe(
      'http://127.0.0.1:41732/dev/realm-rendered-webgl-qa.html?quality=high'
    );
    expect(renderedWebglQaUrl({ mode: 'player', quality: 'balanced', port: 41_732 })).toBe(
      'http://127.0.0.1:41732/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player'
    );
    expect(renderedWebglQaUrl({
      fixture: 'occupancy-stress',
      quality: 'balanced',
      port: 41_732
    })).toBe(
      'http://127.0.0.1:41732/dev/realm-rendered-webgl-qa.html?quality=balanced&fixture=occupancy-stress'
    );
    expect(renderedWebglQaUrl({
      fixture: 'worker-active',
      mode: 'player',
      quality: 'balanced',
      port: 41_732
    })).toBe(
      'http://127.0.0.1:41732/dev/realm-rendered-webgl-qa.html'
        + '?quality=balanced&mode=player&fixture=worker-active'
    );
    expect(() => renderedWebglQaUrl({ quality: 'unknown' as never })).toThrow(/quality/i);
    expect(() => renderedWebglQaUrl({ mode: 'unknown' as never })).toThrow(/mode/i);
    expect(() => renderedWebglQaUrl({ fixture: 'unknown' as never })).toThrow(/fixture/i);
    expect(() => renderedWebglQaUrl({ port: 0 })).toThrow(/port/i);
  });

  it('allows only bounded aggregate success observations', () => {
    const observation = {
      version: 1,
      fixture: 'synthetic-canonical-100',
      renderer: 'webgl',
      presentationMode: 'observer',
      quality: 'balanced',
      castleCount: 100,
      readyAfterMilliseconds: 1_245
    } as const;

    expect(parseRenderedWebglQaObservation(observation)).toEqual(observation);
    expect(() => parseRenderedWebglQaObservation({
      ...observation,
      renderer: 'fallback'
    })).toThrow(/observation/i);
    expect(() => parseRenderedWebglQaObservation({
      ...observation,
      presentationMode: 'admin'
    })).toThrow(/observation/i);
    expect(() => parseRenderedWebglQaObservation({
      ...observation,
      fid: 123
    })).toThrow(/observation/i);
    expect(() => parseRenderedWebglQaObservation({
      ...observation,
      readyAfterMilliseconds: 120_001
    })).toThrow(/observation/i);
  });
});
