import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Greater Realm browser QA contract', () => {
  it('keeps the synthetic Tier-I scene on an explicit local-only entry', () => {
    const html = readFileSync(resolve('dev/greater-realm-qa.html'), 'utf8');
    const main = readFileSync(resolve('src/dev/greaterRealmQaMain.ts'), 'utf8');
    expect(html).toContain('noindex,nofollow,noarchive');
    expect(html).toContain('/src/dev/greaterRealmQaMain.ts');
    expect(main).toContain('assertLocalQaRuntime()');
    expect(main).toContain('createGreaterRealmSyntheticTransport');
    expect(main).toContain('data-greater-realm-qa-canvas');
    expect(main).toContain('runtime.isCoordinatePassable({ atlasQ: 0, atlasR: 0 })');
    expect(main).toContain('assertGreaterRealmChunkMatchesDescriptor');
    expect(main).not.toMatch(/scripts\/atlas|greater-realm-private/u);
  });

  it('publishes bounded desktop/mobile telemetry hooks', () => {
    const main = readFileSync(resolve('src/dev/greaterRealmQaMain.ts'), 'utf8');
    for (const marker of [
      'greaterRealmQaDeviceClass',
      'greaterRealmQaGraphicsProfile',
      'greaterRealmQaLod',
      'greaterRealmQaChunkCount',
      'greaterRealmQaDrawCalls',
      'greaterRealmQaInstances',
      'greaterRealmQaBoats',
      'greaterRealmQaResources',
      'greaterRealmQaBlockedCells',
      'greaterRealmQaFordPassable',
      'greaterRealmQaRouteCells',
      'greaterRealmQaReducedMotion',
      'greaterRealmQaContextLost',
      'greaterRealmQaUploadCount',
      'greaterRealmQaUploadBytes'
    ]) expect(main).toContain(marker);
  });
});
