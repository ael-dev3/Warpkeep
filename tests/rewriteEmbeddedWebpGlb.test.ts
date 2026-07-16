import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  inspectEmbeddedWebpGlb,
  rewriteEmbeddedWebpGlb,
  SHARP_TOOLCHAIN
} from '../scripts/rewrite-embedded-webp-glb.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const HIGH_CASTLE = resolve(
  ROOT,
  'public/models/hegemony/hegemony-main-castle-high.glb'
);

describe('embedded WebP GLB rewrite', () => {
  it('preserves image and geometry payloads when only matching metadata is normalized', async () => {
    const source = readFileSync(HIGH_CASTLE);
    const rewritten = await rewriteEmbeddedWebpGlb(source, { targetSize: 2_048 });

    expect(rewritten.bytes.equals(source)).toBe(false);
    expect(rewritten.preservedRanges).toHaveLength(5);
    expect(rewritten.preservedRanges).toEqual([
      expect.objectContaining({ bytes: 86_022, sha256: '76d363c90be2fc589adb6a66e79f438bbe1256951a807a744269a9b41b513f1d' }),
      expect.objectContaining({ bytes: 327_766, sha256: '3ad1e70027e549e6b4b4c0f881791457a3073c3f34a3138f5fa104f76eb4f60e' }),
      expect.objectContaining({ bytes: 340_430, sha256: '831b9a4a0e2d4dbadeedd1a2802754c7bc0b6faa8be9d4ac6d1c4b9e8a50f3be' }),
      expect.objectContaining({ bytes: 738_579, sha256: 'b3352e19e4da13b5501446dd7f47eaa9a25379d3a3210b8910f201b30a991c7a' }),
      expect.objectContaining({ bytes: 570_726, sha256: '4c6588480af9f2d44b6d3dafbfffbc357c069b2eaeb8bcb277f76ef8b2eb45ca' })
    ]);
    expect(rewritten.images.map(({ bytes, sha256 }) => ({ bytes, sha256 }))).toEqual(
      rewritten.originalImages.map(({ bytes, sha256 }) => ({ bytes, sha256 }))
    );
    expect(rewritten.images.map(({ width, height }) => [width, height])).toEqual([
      [2_048, 2_048],
      [2_048, 2_048]
    ]);
    expect(rewritten.toolchain).toEqual(SHARP_TOOLCHAIN);
  });

  it('resizes normal and base-color atlases while preserving every geometry payload', async () => {
    const source = readFileSync(HIGH_CASTLE);
    const rewritten = await rewriteEmbeddedWebpGlb(source, { targetSize: 512 });
    const inspected = await inspectEmbeddedWebpGlb(rewritten.bytes);

    expect(rewritten.preservedRanges).toEqual([
      expect.objectContaining({ bytes: 86_022, sha256: '76d363c90be2fc589adb6a66e79f438bbe1256951a807a744269a9b41b513f1d' }),
      expect.objectContaining({ bytes: 327_766, sha256: '3ad1e70027e549e6b4b4c0f881791457a3073c3f34a3138f5fa104f76eb4f60e' }),
      expect.objectContaining({ bytes: 340_430, sha256: '831b9a4a0e2d4dbadeedd1a2802754c7bc0b6faa8be9d4ac6d1c4b9e8a50f3be' }),
      expect.objectContaining({ bytes: 738_579, sha256: 'b3352e19e4da13b5501446dd7f47eaa9a25379d3a3210b8910f201b30a991c7a' }),
      expect.objectContaining({ bytes: 570_726, sha256: '4c6588480af9f2d44b6d3dafbfffbc357c069b2eaeb8bcb277f76ef8b2eb45ca' })
    ]);
    expect(inspected.images).toEqual([
      expect.objectContaining({
        name: 'WK_HeroCastle_NormalAtlas',
        role: 'normal',
        width: 512,
        height: 512,
        bytes: 82_498,
        sha256: '712b27a1f21435c8f232dddc0e7122cedd93553eb17b4e5b6370417d3e437ba3'
      }),
      expect.objectContaining({
        name: 'WK_HeroCastle_BaseColorAtlas',
        role: 'baseColor',
        width: 512,
        height: 512,
        bytes: 22_098,
        sha256: '7465d0ffebd3e7da60831bda33d240f3b9d6516d71922a5b5df920b930568c75'
      })
    ]);
  });

  it('rejects nonzero bytes outside every declared physical range', async () => {
    const corrupted = Buffer.from(readFileSync(HIGH_CASTLE));
    const jsonLength = corrupted.readUInt32LE(12);
    const binaryStart = 20 + jsonLength + 8;
    const json = JSON.parse(corrupted.subarray(20, 20 + jsonLength).toString('utf8').trim());
    const firstImageView = json.bufferViews[json.images[0].bufferView];
    const gapByte = binaryStart + firstImageView.byteOffset + firstImageView.byteLength;
    corrupted[gapByte] = 1;

    await expect(rewriteEmbeddedWebpGlb(corrupted, { targetSize: 512 }))
      .rejects.toThrow(/unreferenced physical-buffer bytes/i);
  });

  it('refuses atlas upscaling', async () => {
    const source = readFileSync(HIGH_CASTLE);
    await expect(rewriteEmbeddedWebpGlb(source, { targetSize: 4_096 }))
      .rejects.toThrow(/unsafe upscale/i);
  });
});
