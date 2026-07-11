import { describe, expect, it } from 'vitest';

import {
  FARCASTER_QR_OPTIONS,
  encodeFarcasterQrCode
} from '../src/farcaster/farcasterQrCode';

describe('Farcaster QR encoding', () => {
  it('uses a crisp high-contrast SVG with a standards-sized quiet zone', async () => {
    expect(FARCASTER_QR_OPTIONS).toMatchObject({
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 512,
      color: {
        dark: '#120f17ff',
        light: '#fffdf4ff'
      }
    });

    const dataUrl = await encodeFarcasterQrCode(
      'https://farcaster.xyz/~/siwf?channelToken=test-token'
    );
    expect(dataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(dataUrl)).toContain('<svg');
  });

  it('rejects an empty payload instead of rendering an invalid QR', async () => {
    await expect(encodeFarcasterQrCode('   ')).rejects.toThrow(/URL is required/i);
  });
});
