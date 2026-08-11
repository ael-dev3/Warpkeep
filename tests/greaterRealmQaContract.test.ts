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

  it('keeps the integrated retired-host fixture local, synthetic, and gate-sealed', () => {
    const html = readFileSync(resolve('dev/greater-realm-host-qa.html'), 'utf8');
    const main = readFileSync(resolve('src/dev/greaterRealmHostQaMain.tsx'), 'utf8');
    const scene = readFileSync(
      resolve('src/components/realm/GreaterRealmWorldScene.tsx'),
      'utf8'
    );
    const providerBridge = readFileSync(
      resolve('src/spacetime/greaterRealmProviderBridge.ts'),
      'utf8'
    );
    const transport = readFileSync(resolve('src/greater-realm/greaterRealmTransport.ts'), 'utf8');
    expect(html).toContain('noindex,nofollow,noarchive');
    expect(html).toContain('/src/dev/greaterRealmHostQaMain.tsx');
    expect(main).toContain('assertLocalQaRuntime()');
    expect(main).toContain('<RealmMapScreen');
    expect(main).toContain('localQaGreaterRealmPresentationAllowed');
    expect(main).toContain('createGreaterRealmSyntheticTransport');
    expect(main).toContain('getResourceLocations: source.getResourceLocations');
    expect(main).not.toMatch(/scripts\/atlas|greater-realm-private|nodeId|componentKey/u);
    expect(scene).toContain('snapshotCurrent.resourceLocations');
    expect(scene).not.toContain('chunk.resourceLocations');
    expect(providerBridge).toMatch(
      /GREATER_REALM_CLIENT_PRESENTATION_ALLOWED\s*=\s*false\s+as\s+const/u
    );
    expect(transport).toMatch(
      /GREATER_REALM_SERVER_PRESENTATION_ALLOWED\s*=\s*false\s+as\s+const/u
    );
  });
});
