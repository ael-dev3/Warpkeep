export const FARCASTER_MINI_APP_ORIGIN = 'https://warpkeep.com';
export const FARCASTER_MINI_APP_DOMAIN = 'warpkeep.com';
export const FARCASTER_MINI_APP_OWNER_FID = 539_854;
export const FARCASTER_MINI_APP_HOME_URL =
  `${FARCASTER_MINI_APP_ORIGIN}/?miniApp=true`;
export const FARCASTER_MINI_APP_ASSET_ROOT =
  `${FARCASTER_MINI_APP_ORIGIN}/images/miniapp`;
export const FARCASTER_MINI_APP_MANIFEST_PATH =
  '.well-known/farcaster.json';
export const FARCASTER_MINI_APP_MANIFEST_URL =
  `${FARCASTER_MINI_APP_ORIGIN}/${FARCASTER_MINI_APP_MANIFEST_PATH}`;

export const FARCASTER_MINI_APP_EMBED = Object.freeze({
  version: '1',
  imageUrl: `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-embed-1200x800.png`,
  button: Object.freeze({
    title: 'Enter the Realm',
    action: Object.freeze({
      type: 'launch_miniapp',
      url: FARCASTER_MINI_APP_HOME_URL,
      name: 'Warpkeep',
      splashImageUrl:
        `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-splash-200.png`,
      splashBackgroundColor: '#010207',
    }),
  }),
});

export const FARCASTER_MINI_APP_CONFIG = Object.freeze({
  version: '1',
  name: 'Warpkeep',
  homeUrl: FARCASTER_MINI_APP_HOME_URL,
  iconUrl: `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-icon-1024.png`,
  splashImageUrl:
    `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-splash-200.png`,
  splashBackgroundColor: '#010207',
  subtitle: 'A persistent strategy realm',
  description:
    'Explore Genesis 001 manage Workers gather resources and return to a persistent keep tied to your Farcaster identity',
  screenshotUrls: Object.freeze([
    `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-portrait-realm-1284x2778.png`,
    `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-portrait-keep-1284x2778.png`,
    `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-portrait-worker-1284x2778.png`,
  ]),
  primaryCategory: 'games',
  tags: Object.freeze([
    'strategy',
    'fantasy',
    'persistent',
    'farcaster',
    'game',
  ]),
  heroImageUrl:
    `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-hero-1200x630.png`,
  tagline: 'Every FID has a castle',
  ogTitle: 'Warpkeep',
  ogDescription:
    'A persistent Farcaster strategy realm where every admitted founder has a castle',
  ogImageUrl:
    `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-og-1200x630.png`,
  noindex: false,
  canonicalDomain: FARCASTER_MINI_APP_DOMAIN,
});

function imageSpecification(
  file,
  width,
  height,
  {
    maximumBytes = 10_000_000,
    opaque = true,
    screenshot = false,
  } = {},
) {
  return Object.freeze({
    file,
    path: `images/miniapp/${file}`,
    url: `${FARCASTER_MINI_APP_ASSET_ROOT}/${file}`,
    width,
    height,
    maximumBytes,
    opaque,
    screenshot,
  });
}

export const FARCASTER_MINI_APP_CORE_IMAGES = Object.freeze([
  imageSpecification('warpkeep-icon-1024.png', 1024, 1024, {
    maximumBytes: 1_000_000,
  }),
  imageSpecification('warpkeep-splash-200.png', 200, 200, {
    maximumBytes: 1_000_000,
  }),
  imageSpecification('warpkeep-hero-1200x630.png', 1200, 630),
  imageSpecification('warpkeep-og-1200x630.png', 1200, 630),
  imageSpecification('warpkeep-embed-1200x800.png', 1200, 800),
]);

export const FARCASTER_MINI_APP_SCREENSHOTS = Object.freeze([
  imageSpecification(
    'warpkeep-portrait-realm-1284x2778.png',
    1284,
    2778,
    { opaque: false, screenshot: true },
  ),
  imageSpecification(
    'warpkeep-portrait-keep-1284x2778.png',
    1284,
    2778,
    { opaque: false, screenshot: true },
  ),
  imageSpecification(
    'warpkeep-portrait-worker-1284x2778.png',
    1284,
    2778,
    { opaque: false, screenshot: true },
  ),
]);

export const FARCASTER_MINI_APP_IMAGES = Object.freeze([
  ...FARCASTER_MINI_APP_CORE_IMAGES,
  ...FARCASTER_MINI_APP_SCREENSHOTS,
]);

export function hasExactObjectKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

export function exactJsonValue(value, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(value)
      && value.length === expected.length
      && value.every((entry, index) => exactJsonValue(entry, expected[index]));
  }
  if (expected && typeof expected === 'object') {
    return hasExactObjectKeys(value, Object.keys(expected))
      && Object.entries(expected).every(
        ([key, expectedValue]) => exactJsonValue(value[key], expectedValue),
      );
  }
  return Object.is(value, expected);
}

function decodeCanonicalBase64Url(value, label) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error(`${label} is not unpadded base64url.`);
  }
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length === 0 || bytes.toString('base64url') !== value) {
    throw new Error(`${label} is not canonical base64url.`);
  }
  return bytes;
}

function decodeCanonicalJson(value, label) {
  const bytes = decodeCanonicalBase64Url(value, label);
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label} does not contain valid UTF-8 JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  return parsed;
}

export function inspectFarcasterAccountAssociation(accountAssociation) {
  if (
    !hasExactObjectKeys(
      accountAssociation,
      ['header', 'payload', 'signature'],
    )
  ) {
    throw new Error(
      'accountAssociation must contain only header, payload, and signature.',
    );
  }

  const header = decodeCanonicalJson(
    accountAssociation.header,
    'accountAssociation.header',
  );
  if (!hasExactObjectKeys(header, ['fid', 'type', 'key'])) {
    throw new Error(
      'accountAssociation header must contain only fid, type, and key.',
    );
  }
  if (header.fid !== FARCASTER_MINI_APP_OWNER_FID) {
    throw new Error(
      `accountAssociation header FID must be the reviewed owner FID ${FARCASTER_MINI_APP_OWNER_FID}.`,
    );
  }
  if (header.type !== 'custody' && header.type !== 'auth') {
    throw new Error(
      'accountAssociation header type must be custody or auth.',
    );
  }
  if (
    typeof header.key !== 'string'
    || !/^0x[0-9a-fA-F]{40}$/.test(header.key)
  ) {
    throw new Error(
      'accountAssociation header key must be an Ethereum address.',
    );
  }

  const payload = decodeCanonicalJson(
    accountAssociation.payload,
    'accountAssociation.payload',
  );
  if (
    !hasExactObjectKeys(payload, ['domain'])
    || payload.domain !== FARCASTER_MINI_APP_DOMAIN
  ) {
    throw new Error(
      `accountAssociation payload must contain only domain ${FARCASTER_MINI_APP_DOMAIN}.`,
    );
  }

  const encodedSignatureBytes = decodeCanonicalBase64Url(
    accountAssociation.signature,
    'accountAssociation.signature',
  );
  let signatureBytes = encodedSignatureBytes;
  let legacySignatureEncoding = false;
  const legacySignature = encodedSignatureBytes.toString('utf8');
  if (/^0x[0-9a-fA-F]{130}$/.test(legacySignature)) {
    signatureBytes = Buffer.from(legacySignature.slice(2), 'hex');
    legacySignatureEncoding = true;
  }
  if (signatureBytes.length !== 65) {
    throw new Error(
      'accountAssociation signature must contain a 65-byte ERC-191 signature.',
    );
  }

  return Object.freeze({
    header: Object.freeze({
      fid: header.fid,
      type: header.type,
      key: header.key,
    }),
    payload: Object.freeze({ domain: payload.domain }),
    signatureHex: `0x${signatureBytes.toString('hex')}`,
    signingInput:
      `${accountAssociation.header}.${accountAssociation.payload}`,
    legacySignatureEncoding,
  });
}

export function inspectPng(bytes) {
  if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1) {
    throw new Error('PNG input must be bytes.');
  }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 33
    || signature.some((value, index) => bytes[index] !== value)
  ) {
    throw new Error('asset is not a PNG.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width;
  let height;
  let colorType;
  let hasTransparencyChunk = false;
  let sawEnd = false;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (nextOffset > bytes.length) {
      throw new Error('PNG contains a truncated chunk.');
    }
    const type = String.fromCharCode(
      bytes[typeOffset],
      bytes[typeOffset + 1],
      bytes[typeOffset + 2],
      bytes[typeOffset + 3],
    );
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) {
        throw new Error('PNG is missing its leading IHDR chunk.');
      }
      width = view.getUint32(dataOffset);
      height = view.getUint32(dataOffset + 4);
      colorType = bytes[dataOffset + 9];
    } else if (type === 'IHDR') {
      throw new Error('PNG contains more than one IHDR chunk.');
    }
    if (type === 'tRNS') hasTransparencyChunk = true;
    if (type === 'IEND') {
      if (length !== 0 || nextOffset !== bytes.length) {
        throw new Error('PNG has an invalid terminal IEND chunk.');
      }
      sawEnd = true;
      break;
    }
    offset = nextOffset;
  }

  if (
    !sawEnd
    || !Number.isSafeInteger(width)
    || width <= 0
    || !Number.isSafeInteger(height)
    || height <= 0
    || ![0, 2, 3, 4, 6].includes(colorType)
  ) {
    throw new Error('PNG metadata is incomplete or invalid.');
  }
  return Object.freeze({
    width,
    height,
    hasAlpha: colorType === 4 || colorType === 6 || hasTransparencyChunk,
  });
}
