import { describe, expect, it } from 'vitest';

import { allowsSpeculativeMenuMediaPreload } from '../src/settings/networkPreloadPolicy';

describe('speculative menu media preload policy', () => {
  it('allows preload when the browser has no connection-quality signal', () => {
    expect(allowsSpeculativeMenuMediaPreload()).toBe(true);
    expect(allowsSpeculativeMenuMediaPreload({})).toBe(true);
  });

  it('honors explicit data saving even on a nominally fast connection', () => {
    expect(allowsSpeculativeMenuMediaPreload({
      connection: { effectiveType: '4g', saveData: true }
    })).toBe(false);
  });

  it.each(['slow-2g', '2g', '3g', 'unknown-future-tier'])(
    'defers optional media on %s',
    effectiveType => {
      expect(allowsSpeculativeMenuMediaPreload({
        connection: { effectiveType, saveData: false }
      })).toBe(false);
    }
  );

  it('allows optional preload on a normalized 4G signal', () => {
    expect(allowsSpeculativeMenuMediaPreload({
      connection: { effectiveType: ' 4G ', saveData: false }
    })).toBe(true);
  });
});
