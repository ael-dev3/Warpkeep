// @vitest-environment node

import { describe, expect, it } from 'vitest';

describe('fixed Genesis 002 local-binding cache bootstrap', () => {
  it('exposes one no-argument bootstrap and rejects explicit undefined', async () => {
    const module = await import('../scripts/bootstrap-genesis002-local-binding-cache.mjs');
    expect(Object.keys(module).sort()).toEqual([
      'Genesis002LocalBindingCacheError',
      'bootstrapGenesis002LocalBindingCache',
    ]);
    await expect((module.bootstrapGenesis002LocalBindingCache as unknown as
      (value: unknown) => Promise<unknown>)(undefined))
      .rejects.toMatchObject({ code: 'GENESIS002_LOCAL_BINDING_CACHE_ARGUMENTS_INVALID' });
  });
});
