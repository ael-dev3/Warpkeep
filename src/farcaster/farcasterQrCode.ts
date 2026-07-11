import { toString } from 'qrcode';

export const FARCASTER_QR_OPTIONS = Object.freeze({
  type: 'svg' as const,
  errorCorrectionLevel: 'M' as const,
  margin: 4,
  width: 512,
  color: Object.freeze({
    dark: '#120f17ff',
    light: '#fffdf4ff'
  })
});

/**
 * Encode the relay-returned sign-in URL once for the current request. This
 * module is imported only after ENTER REALM so qrcode stays off the title and
 * passive menu paths.
 */
export async function encodeFarcasterQrCode(channelUrl: string) {
  if (!channelUrl.trim()) {
    throw new Error('A Farcaster sign-in URL is required to generate a QR code.');
  }

  const svg = await toString(channelUrl, FARCASTER_QR_OPTIONS);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
