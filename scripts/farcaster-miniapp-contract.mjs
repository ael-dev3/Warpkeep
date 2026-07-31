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

export const FARCASTER_MINI_APP_EMBED_SOURCE = Object.freeze({
  path:
    'docs/reference/miniapp/2026-07-31-hegemony-realm-embed/warpkeep-hegemony-realm-embed-source.png',
  width: 1402,
  height: 1122,
  bytes: 2_008_823,
  sha256: '26378fdcdb9dfccfdbcf5f25f9a70df1238ac494ab7ed89762ab06b6e2c46771',
});

export const FARCASTER_MINI_APP_ICON_SOURCE = Object.freeze({
  path:
    'docs/reference/miniapp/2026-07-31-hegemony-crest-icon/warpkeep-hegemony-crest-source.png',
  width: 1254,
  height: 1254,
  bytes: 2_297_825,
  sha256: 'd826fefc276f61490f152293aa80f0c266e9d986760e956eeb7837d00e0affe8',
});

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
  iconUrl:
    `${FARCASTER_MINI_APP_ASSET_ROOT}/warpkeep-icon-1024-d1b42d20f03c2905.png`,
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
    sha256,
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
    ...(sha256 === undefined ? {} : { sha256 }),
  });
}

export const FARCASTER_MINI_APP_CORE_IMAGES = Object.freeze([
  imageSpecification('warpkeep-icon-1024-d1b42d20f03c2905.png', 1024, 1024, {
    maximumBytes: 1_000_000,
    sha256: 'd1b42d20f03c29058f0450e82ecffb92f756033314c55468eb23ea9b1c6e78ed',
  }),
  imageSpecification('warpkeep-splash-200.png', 200, 200, {
    maximumBytes: 1_000_000,
  }),
  imageSpecification('warpkeep-hero-1200x630.png', 1200, 630),
  imageSpecification('warpkeep-og-1200x630.png', 1200, 630),
  imageSpecification('warpkeep-embed-1200x800.png', 1200, 800, {
    sha256: '53071821f4a2cd1bd6d71cd53f02e78331582a9fef88c9931833b459e25d5596',
  }),
]);

function siteIconSpecification(file, width, sha256) {
  return Object.freeze({
    file,
    path: file,
    url: `${FARCASTER_MINI_APP_ORIGIN}/${file}`,
    width,
    height: width,
    maximumBytes: 1_000_000,
    opaque: true,
    sha256,
  });
}

export const WARPKEEP_SITE_ICONS = Object.freeze([
  siteIconSpecification(
    'favicon-64-7b82ca973fe757f5.png',
    64,
    '7b82ca973fe757f54a37e256ac8a0e6f8fe2ed4e4ed6bfaa1c5472fc71fbe5f2',
  ),
  siteIconSpecification(
    'apple-touch-icon-180-fe27e8dc1c97cc36.png',
    180,
    'fe27e8dc1c97cc367274c9c786042b2d615b9af1dcd025c2c351c63dae4fdfb5',
  ),
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

function decodeCanonicalSignature(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is not a canonical Base64 signature.`);
  }

  if (/^[A-Za-z0-9_-]+$/.test(value)) {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length > 0 && bytes.toString('base64url') === value) {
      return bytes;
    }
  }

  if (
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
      .test(value)
  ) {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length > 0 && bytes.toString('base64') === value) {
      return bytes;
    }
  }

  throw new Error(
    `${label} must be canonical unpadded Base64URL or padded Base64.`,
  );
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

  const encodedSignatureBytes = decodeCanonicalSignature(
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
