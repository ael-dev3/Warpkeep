import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = resolve(
  ROOT,
  'docs/reference/resources/2026-07-18-hegemony-stone-quarry/record-art/manifest.json'
);
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  schemaVersion: number;
  projectAuthorization: {
    scope: string;
    notGranted: string[];
  };
  sourceInputs: Array<{ sha256: string; repositoryRetained: boolean }>;
  runtimeAsset: {
    path: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    decodedRgbaSha256: string;
    alpha: {
      transparentPixels: number;
      partiallyTransparentPixels: number;
      opaquePixels: number;
    };
    visibleBoundsAlpha16: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
  };
  presentationBoundary: {
    component: string;
    currentRealmMount: string;
    currentNodePlacement: string;
    forbiddenClaims: string[];
  };
  licence: { spdx: string };
};

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function alphaProfile(raw: Buffer) {
  const profile = {
    transparentPixels: 0,
    partiallyTransparentPixels: 0,
    opaquePixels: 0
  };
  for (let index = 3; index < raw.length; index += 4) {
    if (raw[index] === 0) profile.transparentPixels += 1;
    else if (raw[index] === 255) profile.opaquePixels += 1;
    else profile.partiallyTransparentPixels += 1;
  }
  return profile;
}

function visibleBounds(raw: Buffer, width: number, height: number) {
  const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (raw[(y * width + x) * 4 + 3]! < 16) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

describe('Hegemony Stone Quarry record art', () => {
  it('pins the narrow UI authorization while keeping gameplay server-owned', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.projectAuthorization.scope).toContain('PR #65');
    expect(manifest.projectAuthorization.scope).toContain('public Warpkeep GitHub repository');
    expect(manifest.projectAuthorization.scope).toContain('official warpkeep.com Pages runtime');
    expect(manifest.projectAuthorization.notGranted.join(' ')).toMatch(
      /copyright ownership|public open-content licence|Stone-site/i
    );
    expect(manifest.licence.spdx).toBe('LicenseRef-Warpkeep-Provenance-Required');
    expect(manifest.sourceInputs.every((source) => source.repositoryRetained === false)).toBe(true);
    expect(manifest.presentationBoundary.currentRealmMount)
      .toContain('canonical public Stone-site validation');
    expect(manifest.presentationBoundary.currentNodePlacement)
      .toContain('server-governed');
    expect(manifest.presentationBoundary.forbiddenClaims)
      .toContain('browser-derived gathering authority');

    const attribution = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    expect(attribution).toContain('Hegemony Stone Quarry inspection artwork');
    expect(attribution).toContain(manifest.runtimeAsset.sha256);
  });

  it('ships one exact bounded alpha WebP with transparent corners and clean margins', async () => {
    const assetPath = resolve(ROOT, manifest.runtimeAsset.path);
    const bytes = readFileSync(assetPath);
    expect(bytes.byteLength).toBe(manifest.runtimeAsset.bytes);
    expect(sha256(bytes)).toBe(manifest.runtimeAsset.sha256);
    expect(manifest.sourceInputs.map((source) => source.sha256)).not.toContain(sha256(bytes));

    const image = sharp(assetPath, {
      failOn: 'warning',
      limitInputPixels: manifest.runtimeAsset.width * manifest.runtimeAsset.height
    });
    expect(await image.metadata()).toMatchObject({
      format: 'webp',
      width: manifest.runtimeAsset.width,
      height: manifest.runtimeAsset.height,
      channels: 4,
      depth: 'uchar',
      hasAlpha: true
    });
    const raw = await image.ensureAlpha().raw().toBuffer();
    expect(sha256(raw)).toBe(manifest.runtimeAsset.decodedRgbaSha256);
    expect(alphaProfile(raw)).toEqual(manifest.runtimeAsset.alpha);
    expect(visibleBounds(raw, manifest.runtimeAsset.width, manifest.runtimeAsset.height))
      .toEqual(manifest.runtimeAsset.visibleBoundsAlpha16);

    const alphaAt = (x: number, y: number) => (
      raw[(y * manifest.runtimeAsset.width + x) * 4 + 3]
    );
    expect([
      alphaAt(0, 0),
      alphaAt(manifest.runtimeAsset.width - 1, 0),
      alphaAt(0, manifest.runtimeAsset.height - 1),
      alphaAt(manifest.runtimeAsset.width - 1, manifest.runtimeAsset.height - 1)
    ]).toEqual([0, 0, 0, 0]);
    expect(manifest.runtimeAsset.alpha.transparentPixels)
      .toBeGreaterThan(manifest.runtimeAsset.width * manifest.runtimeAsset.height * 0.5);
  });

  it('keeps the panel decorative while wiring actions through the server boundary', () => {
    const component = readFileSync(
      resolve(ROOT, manifest.presentationBoundary.component),
      'utf8'
    );
    const css = readFileSync(resolve(ROOT, 'src/components/realm/StoneQuarryInspectionPanel.css'), 'utf8');
    const map = readFileSync(resolve(ROOT, 'src/components/realm/RealmMapScreen.tsx'), 'utf8');
    expect(component).toContain("publicAssetUrl('images/realm/hegemony-stone-quarry-record.webp')");
    expect(component).toContain('className="gold-mine-inspection__hero-art stone-quarry-inspection__hero-art"');
    expect(component).toContain('alt=""');
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain('decoding="async"');
    expect(component).toContain('draggable={false}');
    expect(component).toContain('onDispatchStoneExpedition');
    expect(component).toContain('onClaimStoneExpedition');
    expect(component).toContain('pendingStone');
    expect(component).not.toMatch(/https?:\/\//i);
    expect(css).toContain('scale(1.055)');
    expect(map).toContain('StoneQuarryInspectionPanel');
  });
});
