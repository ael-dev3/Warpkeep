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
  it('is byte-stable when the atlases already match the requested profile', async () => {
    const source = readFileSync(HIGH_CASTLE);
    const rewritten = await rewriteEmbeddedWebpGlb(source, { targetSize: 2_048 });

    expect(rewritten.bytes.equals(source)).toBe(true);
    expect(rewritten.preservedRanges).toHaveLength(5);
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
      expect.objectContaining({ bytes: 417_914, sha256: '507989a5ee628c855a79055bd283f485118d2faec673b506147b010f3ac7dcfe' }),
      expect.objectContaining({ bytes: 306_299, sha256: 'ec4f30fbc3b9fd39ba213830ce64932f4cf0bf3b2c7a484e2c1b59ff2020f840' }),
      expect.objectContaining({ bytes: 582_741, sha256: '1b9a29a27004ddaefa926ddcc33695d89a6519d56b021cb01cd1cacfacd047ee' }),
      expect.objectContaining({ bytes: 384_698, sha256: '2ba46242c326cd71dbfaa564565187df2a719bc9e4dcf2c53ad3b4bc4ae97c54' }),
      expect.objectContaining({ bytes: 90_640, sha256: '49f129037b280faf7044bb26025afb1f4a61ae791e4ab28d040caa2e5721324f' })
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
