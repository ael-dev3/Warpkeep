import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = resolve(
  ROOT,
  'docs/reference/resources/2026-07-18-hegemony-wheat-farm/record-art/manifest.json'
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

describe('Hegemony Wheat Farm record art', () => {
  it('pins the narrow visual authorization without granting Food authority', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.projectAuthorization.scope).toContain('PR #57');
    expect(manifest.projectAuthorization.scope).toContain('public Warpkeep GitHub repository');
    expect(manifest.projectAuthorization.scope).toContain('official warpkeep.com Pages runtime');
    expect(manifest.projectAuthorization.notGranted.join(' ')).toMatch(
      /copyright ownership|public open-content licence|browser-derived/i
    );
    expect(manifest.projectAuthorization.notGranted.join(' ')).toMatch(
      /Food.*(?:placement|renderer|server|balance|reward|entitlement).*authority/i
    );
    expect(manifest.licence.spdx).toBe('LicenseRef-Warpkeep-Provenance-Required');
    expect(manifest.sourceInputs.every((source) => source.repositoryRetained === false)).toBe(true);
    expect(manifest.presentationBoundary.currentRealmMount)
      .toBe('src/components/realm/RealmMapScreen.tsx');
    expect(manifest.presentationBoundary.currentNodePlacement)
      .toBe('validated public Food-site inspector only');
    expect(manifest.presentationBoundary.forbiddenClaims)
      .toContain('browser-derived gathering authority');

    const attribution = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    expect(attribution).toContain('Hegemony Wheat Farm inspection artwork');
    expect(attribution).toContain(manifest.runtimeAsset.sha256);
  });

  it('ships one exact bounded alpha WebP with transparent corners and clean margins', async () => {
    const assetPath = resolve(ROOT, manifest.runtimeAsset.path);
    const bytes = readFileSync(assetPath);
    expect(bytes.byteLength).toBe(224806);
    expect(sha256(bytes)).toBe('466c80380a8d23de043731a7c386e78c9b36a2d2e69fa175db4b87efc3f43eb0');
    expect(manifest.runtimeAsset).toMatchObject({
      path: 'public/images/realm/hegemony-wheat-farm-record.webp',
      width: 1254,
      height: 1254,
      bytes: 224806,
      sha256: '466c80380a8d23de043731a7c386e78c9b36a2d2e69fa175db4b87efc3f43eb0',
      decodedRgbaSha256: '63b83f46aca05903828f90a22551c3d93acabd4855c3ef3ccb18a5a2b11f6d8a',
      alpha: {
        transparentPixels: 853604,
        partiallyTransparentPixels: 0,
        opaquePixels: 718912
      },
      visibleBoundsAlpha16: { minX: 23, minY: 70, maxX: 1181, maxY: 1142 }
    });
    expect(manifest.sourceInputs.map((source) => source.sha256)).not.toContain(sha256(bytes));

    const image = sharp(assetPath, {
      failOn: 'warning',
      limitInputPixels: manifest.runtimeAsset.width * manifest.runtimeAsset.height
    });
    expect(await image.metadata()).toMatchObject({
      format: 'webp',
      width: 1254,
      height: 1254,
      channels: 4,
      depth: 'uchar',
      hasAlpha: true
    });
    const raw = await image.ensureAlpha().raw().toBuffer();
    expect(sha256(raw)).toBe('63b83f46aca05903828f90a22551c3d93acabd4855c3ef3ccb18a5a2b11f6d8a');
    expect(alphaProfile(raw)).toEqual({
      transparentPixels: 853604,
      partiallyTransparentPixels: 0,
      opaquePixels: 718912
    });
    expect(visibleBounds(raw, 1254, 1254)).toEqual({
      minX: 23,
      minY: 70,
      maxX: 1181,
      maxY: 1142
    });

    const alphaAt = (x: number, y: number) => raw[(y * 1254 + x) * 4 + 3];
    expect([
      alphaAt(0, 0),
      alphaAt(1253, 0),
      alphaAt(0, 1253),
      alphaAt(1253, 1253)
    ]).toEqual([0, 0, 0, 0]);
    expect(manifest.runtimeAsset.alpha.transparentPixels)
      .toBeGreaterThan(manifest.runtimeAsset.width * manifest.runtimeAsset.height * 0.5);
  });

  it('keeps the asset local and decorative in the validated Food inspection panel', () => {
    const component = readFileSync(
      resolve(ROOT, manifest.presentationBoundary.component),
      'utf8'
    );
    const map = readFileSync(resolve(ROOT, 'src/components/realm/RealmMapScreen.tsx'), 'utf8');
    expect(component).toContain("publicAssetUrl('images/realm/hegemony-wheat-farm-record.webp')");
    expect(component).toContain('food-farm-inspection__art-stage');
    expect(component).toContain('food-farm-inspection__hero-art');
    expect(component).toContain('alt=""');
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain('decoding="async"');
    expect(component).toContain('draggable={false}');
    expect(component).toContain('height="1254"');
    expect(component).toContain('width="1254"');
    expect(component).not.toMatch(/https?:\/\//i);
    expect(map).toContain('FoodFarmInspectionPanel');
    expect(map).toContain('privateExpedition={observerMode ? undefined : foodExpedition}');
    expect(map).toContain('onDispatchFoodExpedition={observerMode ? undefined : onDispatchFoodExpedition}');
  });
});
