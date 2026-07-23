import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = resolve(
  ROOT,
  'docs/reference/resources/2026-07-19-hegemony-worker/record-art/manifest.json'
);
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  schemaVersion: number;
  projectAuthorization: {
    scope: string;
    notGranted: string[];
  };
  sourceInputs: Array<{ sha256: string; repositoryRetained: boolean }>;
  processing: {
    runtimeAsset: {
      path: string;
      format: string;
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
    pngDerivative: {
      path: string;
      format: string;
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
    };
  };
  presentationBoundary: {
    component: string;
    runtimeUse: string;
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

describe('Hegemony Worker record art', () => {
  it('pins the narrow Worker UI authorization and provenance-required licence', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.projectAuthorization.scope).toContain('Worker UI slice');
    expect(manifest.projectAuthorization.notGranted.join(' ')).toMatch(
      /copyright ownership|public open-content licence|worker ownership/i
    );
    expect(manifest.licence.spdx).toBe('LicenseRef-Warpkeep-Provenance-Required');
    expect(manifest.sourceInputs.every((source) => source.repositoryRetained === false)).toBe(true);
    expect(manifest.presentationBoundary.runtimeUse).toMatch(/same-origin decorative hero art/i);
    expect(manifest.presentationBoundary.forbiddenClaims).toContain(
      'browser-derived dispatch or recall authority'
    );

    const attribution = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    expect(attribution).toContain('Hegemony Worker inspection artwork');
    expect(attribution).toContain(manifest.processing.runtimeAsset.sha256);
  });

  it('ships the exact bounded 1024-square alpha WebP', async () => {
    const asset = manifest.processing.runtimeAsset;
    const assetPath = resolve(ROOT, asset.path);
    const bytes = readFileSync(assetPath);
    expect(bytes.byteLength).toBe(asset.bytes);
    expect(sha256(bytes)).toBe(asset.sha256);
    expect(manifest.sourceInputs.map((source) => source.sha256)).not.toContain(asset.sha256);

    const image = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: asset.width * asset.height
    });
    expect(await image.metadata()).toMatchObject({
      format: asset.format,
      width: asset.width,
      height: asset.height,
      channels: 4,
      depth: 'uchar',
      hasAlpha: true
    });
    const raw = await image.ensureAlpha().raw().toBuffer();
    expect(sha256(raw)).toBe(asset.decodedRgbaSha256);
    expect(alphaProfile(raw)).toEqual(asset.alpha);
    expect(visibleBounds(raw, asset.width, asset.height)).toEqual(asset.visibleBoundsAlpha16);
  });

  it('loads only as same-origin decorative art in the Worker inspector', () => {
    const component = readFileSync(
      resolve(ROOT, manifest.presentationBoundary.component),
      'utf8'
    );
    expect(component).toContain("publicAssetUrl('images/realm/hegemony-worker-record.webp')");
    expect(component).toContain('className="worker-inspection__art-stage"');
    expect(component).toContain('className="worker-inspection__hero-art"');
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain('alt=""');
    expect(component).toContain('decoding="async"');
    expect(component).toContain('draggable={false}');
    expect(component).toContain('height="1024"');
    expect(component).toContain('width="1024"');
    expect(component).not.toMatch(/https?:\/\//i);

    const occupantComponent = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmResourceOccupantMarkers.tsx'),
      'utf8'
    );
    expect(occupantComponent).toContain("publicAssetUrl('images/realm/hegemony-worker-record.webp')");
    expect(occupantComponent).toContain('className="realm-resource-occupant-panel__worker-art"');
    expect(occupantComponent).toContain('aria-hidden="true"');
    expect(occupantComponent).toContain('alt=""');
    expect(occupantComponent).not.toMatch(/Command authority|Owning keeper/i);
    expect(occupantComponent).not.toContain('Recall worker home');
  });
});
