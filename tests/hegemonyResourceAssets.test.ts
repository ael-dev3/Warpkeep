import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const resourceNames = ['food', 'gold', 'stone', 'wood'] as const;
const manifestPaths = Object.freeze({
  food: 'docs/reference/resources/2026-07-17-hegemony-food-icon/manifest.json',
  gold: 'docs/reference/resources/2026-07-17-hegemony-gold-icon/manifest.json',
  stone: 'docs/reference/resources/2026-07-17-hegemony-stone-icon/manifest.json',
  wood: 'docs/reference/resources/2026-07-17-hegemony-wood-icon/manifest.json'
});

type RuntimeOutput = Readonly<{
  path: string;
  format: 'png' | 'webp';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  decodedRgbaSha256: string;
  alpha: Readonly<{
    transparentPixels: number;
    partiallyTransparentPixels: number;
    opaquePixels: number;
  }>;
}>;

type ResourceManifest = Readonly<{
  schemaVersion: number;
  purpose: string;
  referenceAsset: Readonly<{
    path: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    delivery: string;
  }>;
  runtimeDerivative: Readonly<{
    command: string;
    sourceFetch: boolean;
    sourceOverride: boolean;
    immutablePathSha256PrefixLength: number;
    pipeline: Readonly<{
      tool: string;
      toolVersion: string;
      libvipsVersion: string;
      cache: boolean;
      decoder: Readonly<{ failOn: string; limitInputPixels: number }>;
      resize: Readonly<{ width: number; height: number; kernel: string; simd: boolean; concurrency: number }>;
      webp: Readonly<{ lossless: boolean; exactTransparentRgb: boolean }>;
    }>;
    installation: Readonly<{
      family: string;
      staging: string;
      unexpectedDirectoryEntries: string;
      broadDeletion: boolean;
    }>;
    outputs: readonly RuntimeOutput[];
    pngAndLosslessWebpDecodeToIdenticalRgba: boolean;
  }>;
}>;

const manifests = resourceNames.map((name) => ({
  name,
  manifest: JSON.parse(readFileSync(resolve(root, manifestPaths[name]), 'utf8')) as ResourceManifest
}));

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function alphaProfile(raw: Buffer) {
  const profile = { transparentPixels: 0, partiallyTransparentPixels: 0, opaquePixels: 0 };
  for (let index = 3; index < raw.length; index += 4) {
    if (raw[index] === 0) profile.transparentPixels += 1;
    else if (raw[index] === 255) profile.opaquePixels += 1;
    else profile.partiallyTransparentPixels += 1;
  }
  return profile;
}

describe('Hegemony resource runtime assets', () => {
  it('records a local-only pinned and rollback-safe preparation boundary', () => {
    const script = readFileSync(resolve(root, 'scripts/prepare-hegemony-resource-icons.mjs'), 'utf8');
    expect(script).toContain('readContainedRegularFile');
    expect(script).toContain('installAtomicFileFamily');
    expect(script).toContain('assertNoStaleAtomicFamilyTransactions');
    expect(script).not.toContain('process.env');
    expect(script).not.toMatch(/\bfetch\s*\(/u);
    expect(script).not.toContain('child_process');
    expect(script).not.toMatch(/\brm(?:Sync)?\s*\(/u);

    for (const { manifest } of manifests) {
      expect(manifest.schemaVersion).toBe(2);
      expect(manifest.purpose).toContain('Alpha 0.3.7 shared-world resource authority');
      expect(manifest.referenceAsset).toMatchObject({ width: 1_254, height: 1_254 });
      expect(manifest.referenceAsset.path).toMatch(/^docs\/reference\/resources\//u);
      expect(manifest.referenceAsset.delivery).toContain('outside public/');
      expect(manifest.runtimeDerivative).toMatchObject({
        command: 'node scripts/prepare-hegemony-resource-icons.mjs',
        sourceFetch: false,
        sourceOverride: false,
        immutablePathSha256PrefixLength: 16,
        pipeline: {
          tool: 'sharp',
          toolVersion: '0.35.3',
          libvipsVersion: '8.18.3',
          cache: false,
          decoder: { failOn: 'warning', limitInputPixels: 1_572_516 },
          resize: { width: 64, height: 64, kernel: 'lanczos3', simd: false, concurrency: 1 },
          webp: { lossless: true, exactTransparentRgb: true }
        },
        installation: {
          family: 'all eight Hegemony resource runtime outputs',
          unexpectedDirectoryEntries: 'reject',
          broadDeletion: false
        },
        pngAndLosslessWebpDecodeToIdenticalRgba: true
      });
    }
  });

  it('ships exactly four transparent hash-addressed PNG/lossless-WebP pairs', async () => {
    const outputs = manifests.flatMap(({ name, manifest }) => (
      manifest.runtimeDerivative.outputs.map((output) => ({ name, output }))
    ));
    expect(outputs).toHaveLength(8);
    expect(readdirSync(resolve(root, 'public/images/resources')).sort()).toEqual(
      outputs.map(({ output }) => basename(output.path)).sort()
    );

    for (const { name, manifest } of manifests) {
      expect(manifest.runtimeDerivative.outputs.map(({ format }) => format).sort())
        .toEqual(['png', 'webp']);
      const decoded = new Map<string, Buffer>();
      for (const output of manifest.runtimeDerivative.outputs) {
        const bytes = readFileSync(resolve(root, output.path));
        expect(bytes.byteLength, output.path).toBe(output.bytes);
        expect(sha256(bytes), output.path).toBe(output.sha256);
        expect(basename(output.path), output.path)
          .toBe(`hegemony-${name}-${output.sha256.slice(0, 16)}.${output.format}`);
        expect(bytes.byteLength).toBeLessThan(manifest.referenceAsset.bytes);
        expect(output.sha256).not.toBe(manifest.referenceAsset.sha256);

        const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 64 * 64 });
        expect(await image.metadata(), output.path).toMatchObject({
          format: output.format,
          width: 64,
          height: 64,
          channels: 4,
          depth: 'uchar',
          hasAlpha: true
        });
        const raw = await image.ensureAlpha().raw().toBuffer();
        expect(sha256(raw), `${output.path} decoded pixels`).toBe(output.decodedRgbaSha256);
        expect(alphaProfile(raw), `${output.path} alpha profile`).toEqual(output.alpha);
        decoded.set(output.format, raw);
      }
      expect(decoded.get('webp'), `${name} lossless equivalence`).toEqual(decoded.get('png'));
    }
  });

  it('records every exact public coordinate and hash in the asset notice', () => {
    const notice = readFileSync(resolve(root, 'ASSETS-LICENSE.md'), 'utf8');
    expect(notice).toContain('node scripts/prepare-hegemony-resource-icons.mjs');
    expect(notice).toContain('LicenseRef-Warpkeep-Provenance-Required');
    for (const { manifest } of manifests) {
      for (const output of manifest.runtimeDerivative.outputs) {
        expect(notice).toContain(output.path);
        expect(notice).toContain(output.sha256);
        expect(notice).toContain(output.decodedRgbaSha256);
      }
    }
  });
});
