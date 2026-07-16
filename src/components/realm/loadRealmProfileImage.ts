import {
  WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH,
  safeWarpkeepProfileImageUrl
} from '../../security/publicImageUrl';

export const REALM_PROFILE_IMAGE_MAX_BYTES = 2 * 1_024 * 1_024;
export const REALM_PROFILE_IMAGE_MAX_DIMENSION = 4_096;
export const REALM_PROFILE_IMAGE_MAX_PIXELS = 4_194_304;
export const REALM_PROFILE_IMAGE_REQUEST_TIMEOUT_MS = 8_000;

const REALM_PROFILE_IMAGE_MAX_TIMEOUT_MS = 15_000;
const WARPCAST_CLOUDFLARE_IMAGE_ACCOUNT = 'BXluQx4ige9GuW0Ia56BHw';
const WARPCAST_IMAGE_DELIVERY_PATH = new RegExp(
  `^/${WARPCAST_CLOUDFLARE_IMAGE_ACCOUNT}/[A-Za-z0-9_-]{8,128}/[A-Za-z0-9_-]{1,64}$`
);
const WARPCAST_CDN_IMAGE_DELIVERY_PATH = new RegExp(
  `^/cdn-cgi/imagedelivery/${WARPCAST_CLOUDFLARE_IMAGE_ACCOUNT}/[A-Za-z0-9_-]{8,128}/[A-Za-z0-9_-]{1,64}$`
);
const REALM_PROFILE_IMAGE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp'
] as const);

type RealmProfileImageMimeType = typeof REALM_PROFILE_IMAGE_MIME_TYPES[number];

/**
 * Exact public delivery hosts observed in current or legacy Warpcast/Neynar
 * profile responses. This is intentionally not a general-purpose remote image
 * policy: unknown Farcaster PFP origins retain the local monogram fallback.
 */
export const REVIEWED_REALM_PROFILE_IMAGE_HOSTS = Object.freeze([
  'imagedelivery.net',
  'wrpcd.net',
  'res.cloudinary.com',
  'i.imgur.com',
  'lh3.googleusercontent.com',
  'i.seadn.io'
] as const);

type RealmProfileImageLoadOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
  createImage?: () => HTMLImageElement;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}>;

export type LoadedRealmProfileImage = Readonly<{
  image: HTMLImageElement;
  dispose: () => void;
}>;

function unavailableRealmProfileImage() {
  return new Error('Realm profile image is unavailable.');
}

function reviewedProviderPath(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (!REVIEWED_REALM_PROFILE_IMAGE_HOSTS.some((candidate) => candidate === hostname)) {
    return false;
  }
  switch (hostname) {
    case 'imagedelivery.net':
      return WARPCAST_IMAGE_DELIVERY_PATH.test(url.pathname);
    case 'wrpcd.net':
      return WARPCAST_CDN_IMAGE_DELIVERY_PATH.test(url.pathname);
    case 'res.cloudinary.com':
      return url.pathname.startsWith('/merkle-manufactory/image/');
    case 'i.imgur.com':
    case 'lh3.googleusercontent.com':
    case 'i.seadn.io':
      return url.pathname.length > 1;
    default:
      return false;
  }
}

/**
 * Narrows the broader public-profile URL sanitizer to reviewed image delivery
 * providers. The only same-origin exception is Warpkeep's fixed observer
 * placeholder; arbitrary local paths cannot become image requests.
 */
export function reviewedRealmProfileImageUrl(value: string | undefined) {
  if (typeof window !== 'undefined' && value) {
    try {
      const localPlaceholder = new URL(value);
      if (
        localPlaceholder.origin === window.location.origin
        && localPlaceholder.username === ''
        && localPlaceholder.password === ''
        && localPlaceholder.pathname === WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH
        && localPlaceholder.search === ''
        && localPlaceholder.hash === ''
      ) return localPlaceholder.toString();
    } catch {
      // Relative placeholders still pass through the narrower shared sanitizer.
    }
  }
  const safeUrl = safeWarpkeepProfileImageUrl(value);
  if (!safeUrl) return undefined;
  try {
    const parsed = new URL(safeUrl);
    if (
      typeof window !== 'undefined'
      && parsed.origin === window.location.origin
      && parsed.username === ''
      && parsed.password === ''
      && parsed.pathname === WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH
      && parsed.search === ''
      && parsed.hash === ''
    ) return parsed.toString();
    return reviewedProviderPath(parsed) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizedTimeout(value: number | undefined) {
  if (!Number.isFinite(value)) return REALM_PROFILE_IMAGE_REQUEST_TIMEOUT_MS;
  return Math.max(1, Math.min(
    REALM_PROFILE_IMAGE_MAX_TIMEOUT_MS,
    Math.trunc(value ?? REALM_PROFILE_IMAGE_REQUEST_TIMEOUT_MS)
  ));
}

function responseMimeType(response: Response): RealmProfileImageMimeType | undefined {
  const value = response.headers.get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  return REALM_PROFILE_IMAGE_MIME_TYPES.find((candidate) => candidate === value);
}

export type RealmProfileImageDimensions = Readonly<{
  width: number;
  height: number;
}>;

function dimensions(width: number, height: number): RealmProfileImageDimensions | undefined {
  return Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    ? Object.freeze({ width, height })
    : undefined;
}

function bytesMatch(bytes: Uint8Array, offset: number, expected: readonly number[]) {
  return offset >= 0
    && offset + expected.length <= bytes.length
    && expected.every((value, index) => bytes[offset + index] === value);
}

function fourCc(bytes: Uint8Array, offset: number) {
  return offset >= 0 && offset + 4 <= bytes.length
    ? String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    : undefined;
}

function parsePngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 33
    || !bytesMatch(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    || fourCc(bytes, 12) !== 'IHDR'
  ) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8, false) !== 13) return undefined;
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const validBitDepths = new Map<number, readonly number[]>([
    [0, [1, 2, 4, 8, 16]],
    [2, [8, 16]],
    [3, [1, 2, 4, 8]],
    [4, [8, 16]],
    [6, [8, 16]]
  ]);
  if (
    !validBitDepths.get(colorType)?.includes(bitDepth)
    || bytes[26] !== 0
    || bytes[27] !== 0
    || (bytes[28] !== 0 && bytes[28] !== 1)
  ) return undefined;
  return dimensions(view.getUint32(16, false), view.getUint32(20, false));
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf
]);

function parseJpegDimensions(bytes: Uint8Array) {
  if (!bytesMatch(bytes, 0, [0xff, 0xd8])) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let parsed: RealmProfileImageDimensions | undefined;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return undefined;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0xd9) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) return undefined;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return undefined;
    if (marker === 0xda) return parsed;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (parsed || segmentLength < 11) return undefined;
      const componentCount = bytes[offset + 7];
      if (componentCount <= 0 || segmentLength !== 8 + componentCount * 3) return undefined;
      parsed = dimensions(
        view.getUint16(offset + 5, false),
        view.getUint16(offset + 3, false)
      );
      if (!parsed) return undefined;
    }
    offset += segmentLength;
  }
  return undefined;
}

function parseVp8Dimensions(bytes: Uint8Array, offset: number, chunkBytes: number) {
  if (
    chunkBytes < 10
    || offset + 10 > bytes.length
    || (bytes[offset] & 0x11) !== 0x10
    || ((bytes[offset] >>> 1) & 0x07) > 3
    || !bytesMatch(bytes, offset + 3, [0x9d, 0x01, 0x2a])
  ) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dimensions(
    view.getUint16(offset + 6, true) & 0x3fff,
    view.getUint16(offset + 8, true) & 0x3fff
  );
}

function parseVp8LosslessDimensions(bytes: Uint8Array, offset: number, chunkBytes: number) {
  if (chunkBytes < 5 || offset + 5 > bytes.length || bytes[offset] !== 0x2f) return undefined;
  const packed = (
    bytes[offset + 1]
    | (bytes[offset + 2] << 8)
    | (bytes[offset + 3] << 16)
    | (bytes[offset + 4] << 24)
  ) >>> 0;
  if ((packed >>> 29) !== 0) return undefined;
  return dimensions(
    (packed & 0x3fff) + 1,
    ((packed >>> 14) & 0x3fff) + 1
  );
}

function parseVp8ExtendedDimensions(bytes: Uint8Array, offset: number, chunkBytes: number) {
  if (
    chunkBytes !== 10
    || offset + 10 > bytes.length
    || (bytes[offset] & 0xc1) !== 0
    || (bytes[offset] & 0x02) !== 0
    || bytes[offset + 1] !== 0
    || bytes[offset + 2] !== 0
    || bytes[offset + 3] !== 0
  ) return undefined;
  const width = bytes[offset + 4]
    | (bytes[offset + 5] << 8)
    | (bytes[offset + 6] << 16);
  const height = bytes[offset + 7]
    | (bytes[offset + 8] << 8)
    | (bytes[offset + 9] << 16);
  return dimensions(width + 1, height + 1);
}

function parseWebpDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 20
    || fourCc(bytes, 0) !== 'RIFF'
    || fourCc(bytes, 8) !== 'WEBP'
  ) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) return undefined;

  let offset = 12;
  let extended: RealmProfileImageDimensions | undefined;
  let primary: RealmProfileImageDimensions | undefined;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return undefined;
    const chunkType = fourCc(bytes, offset);
    const chunkBytes = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkBytes;
    const nextOffset = dataEnd + (chunkBytes & 1);
    if (dataEnd > bytes.length || nextOffset > bytes.length) return undefined;

    if (chunkType === 'VP8X') {
      if (offset !== 12 || extended) return undefined;
      extended = parseVp8ExtendedDimensions(bytes, dataOffset, chunkBytes);
      if (!extended) return undefined;
    } else if (chunkType === 'VP8 ') {
      if (primary) return undefined;
      primary = parseVp8Dimensions(bytes, dataOffset, chunkBytes);
      if (!primary) return undefined;
    } else if (chunkType === 'VP8L') {
      if (primary) return undefined;
      primary = parseVp8LosslessDimensions(bytes, dataOffset, chunkBytes);
      if (!primary) return undefined;
    } else if (chunkType === 'ANIM' || chunkType === 'ANMF') {
      return undefined;
    }
    offset = nextOffset;
  }
  if (offset !== bytes.length || !primary) return undefined;
  if (
    extended
    && (primary.width > extended.width || primary.height > extended.height)
  ) return undefined;
  return extended ?? primary;
}

/** Reads only recognized, structurally complete raster headers before decode allocation. */
export function parseRealmProfileImageDimensions(
  bytes: Uint8Array,
  mimeType: string
): RealmProfileImageDimensions | undefined {
  try {
    if (mimeType === 'image/png') return parsePngDimensions(bytes);
    if (mimeType === 'image/jpeg') return parseJpegDimensions(bytes);
    if (mimeType === 'image/webp') return parseWebpDimensions(bytes);
    return undefined;
  } catch {
    return undefined;
  }
}

export async function readBoundedRealmProfileImageBody(
  response: Response,
  options: Readonly<{ signal?: AbortSignal; maximumBytes?: number }> = {}
) {
  const maximumBytes = options.maximumBytes ?? REALM_PROFILE_IMAGE_MAX_BYTES;
  if (
    !Number.isSafeInteger(maximumBytes)
    || maximumBytes <= 0
    || maximumBytes > REALM_PROFILE_IMAGE_MAX_BYTES
  ) throw unavailableRealmProfileImage();

  const declared = response.headers.get('content-length');
  if (
    declared !== null
    && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)
  ) throw unavailableRealmProfileImage();

  if (options.signal?.aborted) throw unavailableRealmProfileImage();
  const reader = response.body?.getReader();
  if (!reader) throw unavailableRealmProfileImage();

  let rejectAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(unavailableRealmProfileImage());
  });
  const onAbort = () => rejectAbort?.();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let cancelled = false;
  const cancel = async () => {
    if (cancelled) return;
    cancelled = true;
    try {
      await reader.cancel();
    } catch {
      // Preserve the bounded-delivery failure if stream cancellation fails.
    }
  };

  try {
    for (;;) {
      const result = options.signal
        ? await Promise.race([reader.read(), abortPromise])
        : await reader.read();
      if (options.signal?.aborted) throw unavailableRealmProfileImage();
      if (result.done) break;
      const value = result.value;
      if (
        !ArrayBuffer.isView(value)
        || value.BYTES_PER_ELEMENT !== 1
        || totalBytes + value.byteLength > maximumBytes
      ) {
        await cancel();
        throw unavailableRealmProfileImage();
      }
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
  } catch {
    await cancel();
    throw unavailableRealmProfileImage();
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }

  if (totalBytes <= 0) throw unavailableRealmProfileImage();
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function imageDimensionsAreBounded(value: RealmProfileImageDimensions) {
  return value.width <= REALM_PROFILE_IMAGE_MAX_DIMENSION
    && value.height <= REALM_PROFILE_IMAGE_MAX_DIMENSION
    && value.width * value.height <= REALM_PROFILE_IMAGE_MAX_PIXELS;
}

function decodedImageIsBounded(image: HTMLImageElement) {
  const decoded = dimensions(image.naturalWidth, image.naturalHeight);
  return decoded !== undefined && imageDimensionsAreBounded(decoded);
}

/**
 * Fetches and decodes one static avatar source under hard network and decode
 * limits. Callers must dispose the returned image after drawing it.
 */
export async function loadBoundedRealmProfileImage(
  value: string,
  options: RealmProfileImageLoadOptions = {}
): Promise<LoadedRealmProfileImage> {
  const safeUrl = reviewedRealmProfileImageUrl(value);
  if (!safeUrl || options.signal?.aborted) throw unavailableRealmProfileImage();

  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const createImage = options.createImage ?? (() => new Image());
  const createObjectUrl = options.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = options.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let disposeImage: (() => void) | undefined;

  options.signal?.addEventListener('abort', abort, { once: true });
  timeout = setTimeout(abort, normalizedTimeout(options.timeoutMs));
  try {
    const response = await fetchImplementation(safeUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'image/webp,image/png,image/jpeg' },
      signal: controller.signal
    });
    const mimeType = responseMimeType(response);
    if (
      controller.signal.aborted
      || !response.ok
      || response.redirected
      || !mimeType
    ) throw unavailableRealmProfileImage();

    const bytes = await readBoundedRealmProfileImageBody(response, {
      signal: controller.signal
    });
    const encoded = parseRealmProfileImageDimensions(bytes, mimeType);
    if (
      !encoded
      || !imageDimensionsAreBounded(encoded)
      || controller.signal.aborted
    ) {
      throw unavailableRealmProfileImage();
    }

    const image = createImage();
    const blob = new Blob([bytes], { type: mimeType });
    const objectUrl = createObjectUrl(blob);
    let disposed = false;
    let onDecodeAbort: (() => void) | undefined;
    disposeImage = () => {
      if (disposed) return;
      disposed = true;
      image.onload = null;
      image.onerror = null;
      if (onDecodeAbort) controller.signal.removeEventListener('abort', onDecodeAbort);
      try {
        image.removeAttribute('src');
      } catch {
        // Continue to revoke the bounded blob even if image teardown is unavailable.
      }
      try {
        revokeObjectUrl(objectUrl);
      } catch {
        // Cleanup is best-effort and must not strand the caller's fallback state.
      }
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        disposeImage?.();
        reject(unavailableRealmProfileImage());
      };
      onDecodeAbort = fail;
      controller.signal.addEventListener('abort', onDecodeAbort, { once: true });
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.onerror = fail;
      image.onload = () => {
        if (settled) return;
        if (controller.signal.aborted || !decodedImageIsBounded(image)) {
          fail();
          return;
        }
        settled = true;
        image.onload = null;
        image.onerror = null;
        controller.signal.removeEventListener('abort', onDecodeAbort!);
        resolve();
      };
      image.src = objectUrl;
    });

    return Object.freeze({ image, dispose: disposeImage });
  } catch {
    // A response can fail closed before its body reader is acquired (for
    // example on status, MIME, or declared-length validation). Explicitly
    // abort the fetch lifecycle so the browser cancels any unread transport
    // instead of allowing an approved provider to keep streaming in the
    // background after the portrait has already fallen back.
    controller.abort();
    disposeImage?.();
    throw unavailableRealmProfileImage();
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
