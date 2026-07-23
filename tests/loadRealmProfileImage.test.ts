import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  REALM_PROFILE_IMAGE_MAX_BYTES,
  REALM_PROFILE_IMAGE_MAX_DIMENSION,
  REVIEWED_REALM_PROFILE_IMAGE_HOSTS,
  loadBoundedRealmProfileImage,
  parseRealmProfileImageDimensions,
  readBoundedRealmProfileImageBody,
  reviewedRealmProfileImageUrl
} from '../src/components/realm/loadRealmProfileImage';
import { WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH } from '../src/security/publicImageUrl';

const CURRENT_PFP_URL =
  'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/bc698287-5adc-4cc5-a503-de16963ed900/original';
const ANIMATED_ARWEAVE_PFP_URL =
  `https://${'a'.repeat(52)}.arweave.net/${'B'.repeat(43)}/`;
const STATIC_ARWEAVE_PFP_URL =
  `https://wrpcd.net/cdn-cgi/image/anim=false,fit=contain,f=auto,w=384/${encodeURIComponent(ANIMATED_ARWEAVE_PFP_URL)}`;

function pngHeader(width = 256, height = 256) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

function jpegHeader(width = 256, height = 256, startOfFrame = 0xc0) {
  return Uint8Array.of(
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, startOfFrame, 0x00, 0x0b, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xff, 0xd9
  );
}

function webpChunk(type: string, payload: Uint8Array) {
  const bytes = new Uint8Array(8 + payload.byteLength + (payload.byteLength & 1));
  bytes.set([...type].map((value) => value.charCodeAt(0)), 0);
  new DataView(bytes.buffer).setUint32(4, payload.byteLength, true);
  bytes.set(payload, 8);
  return bytes;
}

function webpContainer(chunks: readonly Uint8Array[]) {
  const totalBytes = 12 + chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(totalBytes);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(bytes.buffer).setUint32(4, totalBytes - 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  let offset = 12;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function vp8Payload(width: number, height: number) {
  const bytes = new Uint8Array(10);
  bytes[0] = 0x10;
  bytes.set([0x9d, 0x01, 0x2a], 3);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

function webpVp8Header(width = 256, height = 256) {
  return webpContainer([webpChunk('VP8 ', vp8Payload(width, height))]);
}

function webpVp8LosslessHeader(width = 256, height = 256) {
  const packed = ((width - 1) | ((height - 1) << 14)) >>> 0;
  const payload = Uint8Array.of(
    0x2f,
    packed & 0xff,
    (packed >>> 8) & 0xff,
    (packed >>> 16) & 0xff,
    (packed >>> 24) & 0xff
  );
  return webpContainer([webpChunk('VP8L', payload)]);
}

function webpVp8ExtendedHeader(width = 256, height = 256) {
  const canvas = new Uint8Array(10);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  canvas.set([
    encodedWidth & 0xff,
    (encodedWidth >>> 8) & 0xff,
    (encodedWidth >>> 16) & 0xff,
    encodedHeight & 0xff,
    (encodedHeight >>> 8) & 0xff,
    (encodedHeight >>> 16) & 0xff
  ], 4);
  return webpContainer([
    webpChunk('VP8X', canvas),
    webpChunk('VP8 ', vp8Payload(width, height))
  ]);
}

function animatedWebpHeader(width = 256, height = 256) {
  const canvas = new Uint8Array(10);
  canvas[0] = 0x02;
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  canvas.set([
    encodedWidth & 0xff,
    (encodedWidth >>> 8) & 0xff,
    (encodedWidth >>> 16) & 0xff,
    encodedHeight & 0xff,
    (encodedHeight >>> 8) & 0xff,
    (encodedHeight >>> 16) & 0xff
  ], 4);
  return webpContainer([
    webpChunk('VP8X', canvas),
    webpChunk('ANIM', new Uint8Array(6))
  ]);
}

const PNG_HEADER = pngHeader();

function streamedResponse(
  chunks: readonly Uint8Array[],
  headers: Readonly<Record<string, string>> = { 'content-type': 'image/png' }
) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    }
  }), { status: 200, headers });
}

class AutoLoadingImage {
  decoding = 'auto';
  naturalHeight: number;
  naturalWidth: number;
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  referrerPolicy = '';
  removedSourceCount = 0;
  requestedUrl = '';

  constructor(width = 256, height = 256) {
    this.naturalWidth = width;
    this.naturalHeight = height;
  }

  set src(value: string) {
    this.requestedUrl = value;
    queueMicrotask(() => this.onload?.(new Event('load')));
  }

  get src() {
    return this.requestedUrl;
  }

  removeAttribute(name: string) {
    if (name !== 'src') return;
    this.removedSourceCount += 1;
    this.requestedUrl = '';
  }
}

function successfulEnvironment(image = new AutoLoadingImage()) {
  const fetchImplementation = vi.fn(async () => streamedResponse([PNG_HEADER]));
  const createObjectUrl = vi.fn((_blob: Blob) => 'blob:warpkeep-realm-profile');
  const revokeObjectUrl = vi.fn((_url: string) => undefined);
  const createImage = vi.fn(() => image as unknown as HTMLImageElement);
  return {
    image,
    fetchImplementation: fetchImplementation as unknown as typeof fetch,
    createImage,
    createObjectUrl,
    revokeObjectUrl
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('reviewed Realm profile image delivery', () => {
  it('allows only the exact Warpcast/Neynar delivery hosts and fixed local placeholder', () => {
    expect(REVIEWED_REALM_PROFILE_IMAGE_HOSTS).toEqual([
      'imagedelivery.net',
      'wrpcd.net',
      'res.cloudinary.com',
      'i.imgur.com',
      'lh3.googleusercontent.com',
      'i.seadn.io'
    ]);
    const reviewed = [
      CURRENT_PFP_URL,
      'https://wrpcd.net/cdn-cgi/imagedelivery/BXluQx4ige9GuW0Ia56BHw/8e0beac1-d714-49d3-9bbf-f68324cdbc00/rectcontain1',
      'https://res.cloudinary.com/merkle-manufactory/image/fetch/c_fill,f_png,w_256/https://lh3.googleusercontent.com/profile',
      'https://i.imgur.com/3d6fFAI.png',
      'https://lh3.googleusercontent.com/profile-image',
      'https://i.seadn.io/gae/profile-image?w=500&auto=format'
    ];
    for (const value of reviewed) {
      expect(reviewedRealmProfileImageUrl(value)).toBe(value);
    }

    expect(reviewedRealmProfileImageUrl(WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH))
      .toBe(new URL(
        WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH,
        window.location.origin
      ).toString());
  });

  it('accepts only the exact absolute current-origin placeholder on local HTTP QA', () => {
    const localPlaceholder = new URL(
      WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH,
      window.location.origin
    );
    expect(reviewedRealmProfileImageUrl(localPlaceholder.toString()))
      .toBe(localPlaceholder.toString());

    const credentialed = new URL(localPlaceholder);
    credentialed.username = 'observer';
    credentialed.password = 'private';
    expect(reviewedRealmProfileImageUrl(credentialed.toString())).toBeUndefined();

    const queried = new URL(localPlaceholder);
    queried.search = '?variant=tracking';
    expect(reviewedRealmProfileImageUrl(queried.toString())).toBeUndefined();

    const fragmented = new URL(localPlaceholder);
    fragmented.hash = '#tracking';
    expect(reviewedRealmProfileImageUrl(fragmented.toString())).toBeUndefined();

    const otherPath = new URL('/assets/marks/other.png', window.location.origin);
    expect(reviewedRealmProfileImageUrl(otherPath.toString())).toBeUndefined();
  });

  it('derives and re-reviews one exact static rendition for a canonical Arweave PFP', () => {
    expect(reviewedRealmProfileImageUrl(ANIMATED_ARWEAVE_PFP_URL))
      .toBe(STATIC_ARWEAVE_PFP_URL);
    expect(reviewedRealmProfileImageUrl(STATIC_ARWEAVE_PFP_URL))
      .toBe(STATIC_ARWEAVE_PFP_URL);

    const rootGatewaySource = `https://arweave.net/${'C'.repeat(43)}`;
    expect(reviewedRealmProfileImageUrl(rootGatewaySource)).toBe(
      `https://wrpcd.net/cdn-cgi/image/anim=false,fit=contain,f=auto,w=384/${encodeURIComponent(rootGatewaySource)}`
    );
  });

  it.each([
    'https://tracking.example/avatar.png',
    'https://attacker.imagedelivery.net/account/image/original',
    'https://imagedelivery.net/AttackerCloudflareAccount/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original',
    'https://imagedelivery.net/short/image/original',
    'https://wrpcd.net/unreviewed/avatar.png',
    'https://wrpcd.net/cdn-cgi/imagedelivery/AttackerCloudflareAccount/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original',
    'https://res.cloudinary.com/unreviewed/image/fetch/avatar.png',
    'https://i.imgur.com/',
    'https://127.0.0.1/avatar.png',
    `https://${'a'.repeat(51)}.arweave.net/${'b'.repeat(43)}/`,
    `https://${'a'.repeat(52)}.arweave.net/${'b'.repeat(42)}/`,
    `https://${'a'.repeat(52)}.arweave.net/${'b'.repeat(43)}/extra`,
    `https://${'a'.repeat(52)}.arweave.net.evil/${'b'.repeat(43)}/`,
    `https://user:pass@${'a'.repeat(52)}.arweave.net/${'b'.repeat(43)}/`,
    `https://${'a'.repeat(52)}.arweave.net/${'b'.repeat(43)}/?tracking=1`,
    `https://wrpcd.net/cdn-cgi/image/anim=true,fit=contain,f=auto,w=384/${encodeURIComponent(ANIMATED_ARWEAVE_PFP_URL)}`,
    `https://wrpcd.net/cdn-cgi/image/fit=contain,f=auto,w=384/${encodeURIComponent(ANIMATED_ARWEAVE_PFP_URL)}`,
    `https://wrpcd.net/cdn-cgi/image/anim=false,fit=contain,f=auto,w=512/${encodeURIComponent(ANIMATED_ARWEAVE_PFP_URL)}`,
    `https://wrpcd.net/cdn-cgi/image/f=auto,anim=false,fit=contain,w=384/${encodeURIComponent(ANIMATED_ARWEAVE_PFP_URL)}`,
    `https://wrpcd.net/cdn-cgi/image/anim=false,fit=contain,f=auto,w=384/${encodeURIComponent(encodeURIComponent(ANIMATED_ARWEAVE_PFP_URL))}`,
    `https://wrpcd.net/cdn-cgi/image/anim=false,fit=contain,f=auto,w=384/${encodeURIComponent('https://tracking.example/avatar.png')}`,
    `https://wrpcd.net/cdn-cgi/image/anim=false,fit=contain,f=auto,w=384/${encodeURIComponent(`https://127.0.0.1/${'B'.repeat(43)}`)}`,
    `https://wrpcd.net/cdn-cgi/image/anim=false,fit=contain,f=auto,w=384/${encodeURIComponent(`https://user:pass@${'a'.repeat(52)}.arweave.net/${'B'.repeat(43)}/`)}`
  ])('falls back before requesting an unreviewed delivery URL: %s', (value) => {
    expect(reviewedRealmProfileImageUrl(value)).toBeUndefined();
  });

  it('streams with credential-free, no-referrer, redirect-failing request options', async () => {
    const environment = successfulEnvironment();
    const loaded = await loadBoundedRealmProfileImage(CURRENT_PFP_URL, environment);

    expect(environment.fetchImplementation).toHaveBeenCalledOnce();
    const [requestedUrl, request] = vi.mocked(environment.fetchImplementation).mock.calls[0];
    expect(requestedUrl).toBe(CURRENT_PFP_URL);
    expect(request).toMatchObject({
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'image/webp,image/png,image/jpeg' }
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(environment.image.decoding).toBe('async');
    expect(environment.image.referrerPolicy).toBe('no-referrer');
    expect(environment.createObjectUrl).toHaveBeenCalledOnce();
    const blob = environment.createObjectUrl.mock.calls[0][0];
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(PNG_HEADER.byteLength);

    loaded.dispose();
    loaded.dispose();
    expect(environment.image.removedSourceCount).toBe(1);
    expect(environment.revokeObjectUrl).toHaveBeenCalledOnce();
    expect(environment.revokeObjectUrl)
      .toHaveBeenCalledWith('blob:warpkeep-realm-profile');
  });

  it('fetches only the bounded static rendition for an animated Arweave source', async () => {
    const environment = successfulEnvironment(new AutoLoadingImage(384, 384));
    environment.fetchImplementation = vi.fn(async () => streamedResponse(
      [webpVp8Header(384, 384)],
      { 'content-type': 'image/webp' }
    )) as unknown as typeof fetch;

    const loaded = await loadBoundedRealmProfileImage(
      ANIMATED_ARWEAVE_PFP_URL,
      environment
    );

    expect(environment.fetchImplementation).toHaveBeenCalledOnce();
    const [requestedUrl, request] = vi.mocked(environment.fetchImplementation).mock.calls[0];
    expect(requestedUrl).toBe(STATIC_ARWEAVE_PFP_URL);
    expect(requestedUrl).not.toBe(ANIMATED_ARWEAVE_PFP_URL);
    expect(request).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'image/webp,image/png,image/jpeg' }
    });
    const blob = environment.createObjectUrl.mock.calls[0][0];
    expect(blob.type).toBe('image/webp');
    expect(blob.size).toBe(webpVp8Header(384, 384).byteLength);

    loaded.dispose();
  });

  it.each([
    ['GIF', 'image/gif', Uint8Array.of(
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
      0x80, 0x01, 0x80, 0x01
    )],
    ['animated WebP', 'image/webp', animatedWebpHeader(384, 384)]
  ])('rejects a transformed %s response before image decode', async (
    _label,
    mimeType,
    bytes
  ) => {
    const environment = successfulEnvironment(new AutoLoadingImage(384, 384));
    environment.fetchImplementation = vi.fn(async () => streamedResponse(
      [bytes],
      { 'content-type': mimeType }
    )) as unknown as typeof fetch;

    await expect(loadBoundedRealmProfileImage(
      ANIMATED_ARWEAVE_PFP_URL,
      environment
    )).rejects.toThrow('Realm profile image is unavailable.');
    expect(environment.fetchImplementation).toHaveBeenCalledWith(
      STATIC_ARWEAVE_PFP_URL,
      expect.anything()
    );
    expect(environment.createImage).not.toHaveBeenCalled();
    expect(environment.createObjectUrl).not.toHaveBeenCalled();
  });

  it('enforces the streamed byte boundary even when Content-Length is absent or false', async () => {
    await expect(readBoundedRealmProfileImageBody(
      streamedResponse([Uint8Array.of(1, 2), Uint8Array.of(3, 4)]),
      { maximumBytes: 4 }
    )).resolves.toEqual(Uint8Array.of(1, 2, 3, 4));

    await expect(readBoundedRealmProfileImageBody(
      streamedResponse([Uint8Array.of(1, 2, 3, 4), Uint8Array.of(5)]),
      { maximumBytes: 4 }
    )).rejects.toThrow('Realm profile image is unavailable.');

    await expect(readBoundedRealmProfileImageBody(
      streamedResponse([Uint8Array.of(1)], {
        'content-type': 'image/png',
        'content-length': '5'
      }),
      { maximumBytes: 4 }
    )).rejects.toThrow('Realm profile image is unavailable.');
  });

  it.each([
    ['PNG IHDR', 'image/png', pngHeader(320, 180)],
    ['JPEG baseline SOF', 'image/jpeg', jpegHeader(320, 180, 0xc0)],
    ['JPEG progressive SOF', 'image/jpeg', jpegHeader(320, 180, 0xc2)],
    ['WebP VP8', 'image/webp', webpVp8Header(320, 180)],
    ['WebP VP8L', 'image/webp', webpVp8LosslessHeader(320, 180)],
    ['WebP VP8X', 'image/webp', webpVp8ExtendedHeader(320, 180)]
  ])('parses a recognized, complete %s before decode', (_label, mimeType, bytes) => {
    expect(parseRealmProfileImageDimensions(bytes, mimeType)).toEqual({
      width: 320,
      height: 180
    });
  });

  it.each([
    ['truncated PNG IHDR', 'image/png', pngHeader().subarray(0, 28)],
    ['truncated JPEG SOF', 'image/jpeg', jpegHeader().subarray(0, 16)],
    ['unknown WebP primary chunk', 'image/webp', webpContainer([
      webpChunk('VP8Z', Uint8Array.of(0, 0, 0, 0))
    ])],
    ['truncated WebP chunk', 'image/webp', (() => {
      const bytes = webpVp8Header();
      new DataView(bytes.buffer).setUint32(16, 64, true);
      return bytes;
    })()]
  ])('rejects an unknown or structurally incomplete %s', (_label, mimeType, bytes) => {
    expect(parseRealmProfileImageDimensions(bytes, mimeType)).toBeUndefined();
  });

  it.each([
    ['PNG axis', 'image/png', pngHeader(REALM_PROFILE_IMAGE_MAX_DIMENSION + 1, 1)],
    ['JPEG pixels', 'image/jpeg', jpegHeader(3_000, 2_000)],
    ['WebP VP8X axis', 'image/webp', webpVp8ExtendedHeader(
      REALM_PROFILE_IMAGE_MAX_DIMENSION + 1,
      1
    )]
  ])('rejects a tiny oversized %s header before Blob/Image creation', async (
    _label,
    mimeType,
    bytes
  ) => {
    const environment = successfulEnvironment();
    environment.fetchImplementation = vi.fn(async () => streamedResponse(
      [bytes],
      { 'content-type': mimeType }
    )) as unknown as typeof fetch;

    await expect(loadBoundedRealmProfileImage(CURRENT_PFP_URL, environment))
      .rejects.toThrow('Realm profile image is unavailable.');
    expect(environment.createImage).not.toHaveBeenCalled();
    expect(environment.createObjectUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['image/svg+xml', PNG_HEADER],
    ['text/html', PNG_HEADER],
    ['image/png', Uint8Array.of(0xff, 0xd8, 0xff, 0x00)]
  ])('rejects a non-raster or signature-mismatched response (%s)', async (mimeType, bytes) => {
    const environment = successfulEnvironment();
    environment.fetchImplementation = vi.fn(async () => streamedResponse(
      [bytes],
      { 'content-type': mimeType }
    )) as unknown as typeof fetch;

    await expect(loadBoundedRealmProfileImage(CURRENT_PFP_URL, environment))
      .rejects.toThrow('Realm profile image is unavailable.');
    expect(environment.createObjectUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['rejected status', new Response(new Uint8Array([1]), {
      status: 429,
      headers: { 'content-type': 'image/png' }
    })],
    ['unrecognized MIME', streamedResponse([PNG_HEADER], {
      'content-type': 'application/octet-stream'
    })],
    ['oversized declared body', streamedResponse([PNG_HEADER], {
      'content-type': 'image/png',
      'content-length': String(REALM_PROFILE_IMAGE_MAX_BYTES + 1)
    })]
  ])('aborts unread transport after a %s rejection', async (_label, response) => {
    let requestSignal: AbortSignal | undefined;
    const fetchImplementation = vi.fn(async (
      _url: RequestInfo | URL,
      request?: RequestInit
    ) => {
      requestSignal = request?.signal ?? undefined;
      return response;
    }) as unknown as typeof fetch;

    await expect(loadBoundedRealmProfileImage(CURRENT_PFP_URL, {
      fetchImplementation
    })).rejects.toThrow('Realm profile image is unavailable.');
    expect(requestSignal?.aborted).toBe(true);
  });

  it('rejects a decoded image outside the dimension cap and revokes its blob URL', async () => {
    const image = new AutoLoadingImage(REALM_PROFILE_IMAGE_MAX_DIMENSION + 1, 64);
    const environment = successfulEnvironment(image);

    await expect(loadBoundedRealmProfileImage(CURRENT_PFP_URL, environment))
      .rejects.toThrow('Realm profile image is unavailable.');
    expect(image.removedSourceCount).toBe(1);
    expect(environment.revokeObjectUrl).toHaveBeenCalledOnce();
    expect(environment.revokeObjectUrl)
      .toHaveBeenCalledWith('blob:warpkeep-realm-profile');
  });

  it('rejects a decoded image outside the independent pixel cap', async () => {
    const image = new AutoLoadingImage(3_000, 2_000);
    const environment = successfulEnvironment(image);

    await expect(loadBoundedRealmProfileImage(CURRENT_PFP_URL, environment))
      .rejects.toThrow('Realm profile image is unavailable.');
    expect(image.removedSourceCount).toBe(1);
    expect(environment.revokeObjectUrl).toHaveBeenCalledOnce();
  });

  it('aborts a request that exceeds the bounded lifecycle timeout', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchImplementation = vi.fn((_url: RequestInfo | URL, request?: RequestInit) => {
      requestSignal = request?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }) as unknown as typeof fetch;
    const loading = loadBoundedRealmProfileImage(CURRENT_PFP_URL, {
      fetchImplementation,
      timeoutMs: 5
    });
    const rejection = expect(loading)
      .rejects.toThrow('Realm profile image is unavailable.');

    await vi.advanceTimersByTimeAsync(5);
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
  });
});
