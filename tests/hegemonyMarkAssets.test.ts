import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = resolve(
  ROOT,
  'docs/reference/factions/hegemony/2026-07-13-hegemony-mark/runtime-manifest.json'
);

type AlphaProfile = Readonly<{
  transparentPixels: number;
  partiallyTransparentPixels: number;
  opaquePixels: number;
}>;

type RuntimeAsset = Readonly<{
  path: string;
  format: 'png' | 'webp';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  decodedRgbaSha256: string;
  alpha: AlphaProfile;
  visibleBoundsAlpha16: Readonly<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>;
}>;

type RuntimeManifest = Readonly<{
  schemaVersion: number;
  id: string;
  sourceRelease: Readonly<{
    repository: string;
    tag: string;
    tagCommit: string;
    releaseUrl: string;
    publishedAt: string;
    draft: boolean;
    prerelease: boolean;
    provenance: Readonly<{
      suppliedBy: string;
      authorization: string;
      privateWorkflowMetadata: string;
      embeddedContentCredentials: null;
    }>;
    attachment: Readonly<{
      githubAssetId: number;
      name: string;
      url: string;
      bytes: number;
      sha256: string;
      image: Readonly<{
        width: number;
        height: number;
        bitDepth: number;
        colorType: number;
        alpha: boolean;
      }>;
    }>;
    releaseManifest: Readonly<{ bytes: number; sha256: string }>;
    releaseChecksums: Readonly<{ bytes: number; sha256: string }>;
  }>;
  license: Readonly<{
    spdx: string;
    attribution: string;
    licenseFile: string;
    licenseFileSha256: string;
    scope: string;
  }>;
  pipeline: Readonly<{
    sourceRetainedInWarpkeep: boolean;
    runtimeUsesReleaseAsCdn: boolean;
    tool: string;
    toolVersion: string;
    libvipsVersion: string;
  }>;
  runtimeAssets: readonly RuntimeAsset[];
  visualQa: Readonly<{
    pngAndWebpDecodeToIdenticalRgba: boolean;
    manualInspection: string;
  }>;
}>;

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as RuntimeManifest;

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function alphaProfile(raw: Buffer): AlphaProfile {
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
      if (raw[(y * width + x) * 4 + 3] < 16) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
  });
}

describe('Hegemony Mark runtime asset pipeline', () => {
  it('pins the immutable release provenance and narrow CC BY 4.0 scope', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.id).toBe('hegemony-mark-runtime-v1');
    expect(manifest.sourceRelease).toMatchObject({
      repository: 'ael-dev3/Warpkeep-Assets',
      tag: 'hegemony-mark-2026-07-13',
      tagCommit: '23795ce671fa2c7c98e188887b7a444a194a8a1e',
      publishedAt: '2026-07-13T17:25:19Z',
      draft: false,
      prerelease: false,
      provenance: {
        suppliedBy: 'Ael',
        authorization: 'Ael explicitly authorized the public deposit in Warpkeep-Assets.',
        privateWorkflowMetadata: 'intentionally omitted from the public archive',
        embeddedContentCredentials: null
      },
      attachment: {
        githubAssetId: 475719579,
        name: 'hegemony-mark-main-currency-transparent.png',
        bytes: 407_560,
        sha256: '059a61fb40d9e04fdaf27327a921ed5a3174ec48c1549512a71fbbb71aeb2b86',
        image: { width: 500, height: 500, bitDepth: 8, colorType: 6, alpha: true }
      },
      releaseManifest: {
        bytes: 3_592,
        sha256: 'e0ebd51598853574c710352dbc2b9c640f1dd2c020675de9d664966ee76afed8'
      },
      releaseChecksums: {
        bytes: 288,
        sha256: '3aed83545ad491a350407020609aa441e2187392d9ae11905c6dae37aae02167'
      }
    });
    expect(manifest.sourceRelease.releaseUrl).toContain('/hegemony-mark-2026-07-13');
    expect(manifest.sourceRelease.attachment.url).toContain(
      '/releases/download/hegemony-mark-2026-07-13/'
    );
    expect(manifest.license).toMatchObject({
      spdx: 'CC-BY-4.0',
      attribution: 'Warpkeep Hegemony Mark currency artwork by the Warpkeep project, licensed under CC BY 4.0.',
      licenseFile: 'LICENSE-CC-BY-4.0',
      licenseFileSha256: '9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411'
    });
    expect(manifest.license.scope).toContain('does not license OpenAI services');
    expect(manifest.license.scope).toContain('Warpkeep trademarks and canonical identity');
    expect(manifest.pipeline).toMatchObject({
      sourceRetainedInWarpkeep: false,
      runtimeUsesReleaseAsCdn: false,
      tool: 'sharp',
      toolVersion: '0.35.3',
      libvipsVersion: '8.18.3'
    });

    const ccByBytes = readFileSync(resolve(ROOT, manifest.license.licenseFile));
    expect(sha256(ccByBytes)).toBe(manifest.license.licenseFileSha256);
    const attribution = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    const notice = readFileSync(resolve(ROOT, 'NOTICE'), 'utf8');
    const dep5 = readFileSync(resolve(ROOT, '.reuse/dep5'), 'utf8');
    expect(attribution).toContain('Warpkeep Hegemony Mark currency artwork by the Warpkeep project');
    expect(attribution).toContain(manifest.sourceRelease.releaseUrl);
    expect(notice).toContain('Hegemony Mark currency artwork by the Warpkeep project');
    const markMapping = dep5.split(/\n\s*\n/).find((paragraph) => (
      paragraph.includes('public/images/factions/hegemony/marks/**')
    ));
    expect(markMapping).toContain('License: CC-BY-4.0');
    expect(dep5.indexOf('Files: public/** docs/reference/**')).toBeLessThan(
      dep5.indexOf('Files: public/images/factions/hegemony/marks/**')
    );
  });

  it('keeps the 500 px source/master outside Warpkeep', () => {
    const inspectedFiles = [
      ...filesUnder(resolve(ROOT, 'public/images/factions/hegemony')),
      ...filesUnder(resolve(ROOT, 'docs/reference/factions/hegemony'))
    ];
    expect(inspectedFiles.map((path) => basename(path)))
      .not.toContain(manifest.sourceRelease.attachment.name);
    for (const path of inspectedFiles) {
      if (statSync(path).size !== manifest.sourceRelease.attachment.bytes) continue;
      expect(sha256(readFileSync(path))).not.toBe(manifest.sourceRelease.attachment.sha256);
    }
  });

  it('ships exact transparent PNG and lossless WebP pairs at every runtime size', async () => {
    expect(manifest.runtimeAssets).toHaveLength(8);
    expect(new Set(manifest.runtimeAssets.map((asset) => asset.width))).toEqual(
      new Set([32, 64, 128, 256])
    );
    const decodedBySize = new Map<number, Map<string, Buffer>>();

    for (const asset of manifest.runtimeAssets) {
      const path = resolve(ROOT, asset.path);
      const bytes = readFileSync(path);
      expect(bytes.byteLength, asset.path).toBe(asset.bytes);
      expect(sha256(bytes), asset.path).toBe(asset.sha256);

      const image = sharp(path, { failOn: 'warning', limitInputPixels: asset.width * asset.height });
      const metadata = await image.metadata();
      expect(metadata, asset.path).toMatchObject({
        format: asset.format,
        width: asset.width,
        height: asset.height,
        channels: 4,
        depth: 'uchar',
        hasAlpha: true
      });
      const raw = await image.ensureAlpha().raw().toBuffer();
      expect(sha256(raw), `${asset.path} decoded pixels`).toBe(asset.decodedRgbaSha256);
      expect(alphaProfile(raw), `${asset.path} alpha`).toEqual(asset.alpha);
      expect(visibleBounds(raw, asset.width, asset.height), `${asset.path} visible bounds`)
        .toEqual(asset.visibleBoundsAlpha16);
      const formats = decodedBySize.get(asset.width) ?? new Map<string, Buffer>();
      formats.set(asset.format, raw);
      decodedBySize.set(asset.width, formats);
    }

    for (const [size, formats] of decodedBySize) {
      expect(formats.size, `${size}px formats`).toBe(2);
      expect(formats.get('webp'), `${size}px lossless pixel equivalence`)
        .toEqual(formats.get('png'));
    }
    expect(manifest.visualQa.pngAndWebpDecodeToIdenticalRgba).toBe(true);
  });

  it('retains a readable 32 px silhouette and full alpha range', async () => {
    const asset = manifest.runtimeAssets.find((entry) => entry.width === 32 && entry.format === 'png');
    expect(asset).toBeDefined();
    const width = asset!.visibleBoundsAlpha16.maxX - asset!.visibleBoundsAlpha16.minX + 1;
    const height = asset!.visibleBoundsAlpha16.maxY - asset!.visibleBoundsAlpha16.minY + 1;
    expect(width).toBeGreaterThanOrEqual(28);
    expect(height).toBeGreaterThanOrEqual(29);
    expect(asset!.alpha.opaquePixels).toBeGreaterThanOrEqual(450);
    expect(asset!.alpha.partiallyTransparentPixels).toBeGreaterThan(0);
    expect(asset!.alpha.transparentPixels).toBeGreaterThan(0);
    expect(manifest.visualQa.manualInspection).toContain('no new dark fringe');

    const raw = await sharp(resolve(ROOT, asset!.path)).ensureAlpha().raw().toBuffer();
    const centerAlpha = raw[((16 * 32 + 16) * 4) + 3];
    expect(centerAlpha).toBe(255);
  });
});
