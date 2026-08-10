import { Buffer } from 'node:buffer';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  GREATER_REALM_PRIVATE_MARKER_OVERLAP_BYTES,
  containsGreaterRealmPrivateMarker,
} from '../atlas/greater-realm-private-markers.mjs';

const MAXIMUM_PUBLIC_TREE_ENTRIES = 250_000;
const MAXIMUM_PUBLIC_FILE_BYTES = 128 * 1024 * 1024;
const PUBLIC_SCAN_CHUNK_BYTES = 64 * 1024;
const OPAQUE_ARCHIVE_PREFIXES = Object.freeze([
  Buffer.from([0x1f, 0x8b, 0x08]),
  Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
  Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  Buffer.from([0x42, 0x5a, 0x68]),
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]),
  Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]),
]);
const ZIP_LOCAL_FILE_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_CENTRAL_DIRECTORY_MAGIC = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ZIP_LOCAL_FILE_EVIDENCE = 1;
const ZIP_CENTRAL_DIRECTORY_EVIDENCE = 2;
const ZIP_END_OF_CENTRAL_DIRECTORY_EVIDENCE = 4;
const COMPLETE_ZIP_EVIDENCE = ZIP_LOCAL_FILE_EVIDENCE
  | ZIP_CENTRAL_DIRECTORY_EVIDENCE
  | ZIP_END_OF_CENTRAL_DIRECTORY_EVIDENCE;
const TAR_USTAR_MAGIC = Buffer.from('ustar', 'ascii');
const TAR_USTAR_OFFSET = 257;
const PRIVATE_LIVING_WORLD_AUTHORITY_KEYS = new Set([
  'ambient-life-class',
  'ambientlifeclass',
  'dressing-excluded',
  'dressingexcluded',
  'ecology-class',
  'ecologyclass',
  'groundcover-density',
  'groundcoverdensity',
  'landmark-class',
  'landmarkclass',
  'route-class',
  'routeclass',
  'vegetation-density',
  'vegetationdensity',
  'wildflower-density',
  'wildflowerdensity',
  'water-body-id',
  'waterbodyid',
  'water-depth-class',
  'waterdepthclass',
  'water-surface-level',
  'watersurfacelevel',
  'water-downstream',
  'waterdownstream',
  'water-bank-seed',
  'waterbankseed',
  'water-generation-version',
  'watergenerationversion',
  'base-thickness',
  'basethickness',
  'rock-family',
  'rockfamily',
  'paircountsbylagandaxis',
  'paircoveragebasispointsbylagandaxis',
  'meansquareddifferencebylagandaxis',
  'lagonetofourgrowthbasispointsbyaxis',
  'lagfourtwelvegrowthbasispointsbyaxis',
  'axialanisotropybasispointsbylag',
  'paircoverageproof',
  'scalegrowthproof',
  'axialanisotropyproof',
  'eligiblecellcount',
  'privateseedhex',
  'seedmaterial',
  'seedbytes',
  'hiddencellpayload',
  'privatecanvasdescriptor',
  'topographicqa',
  'hydrologyauthority',
  'geologyauthority',
  'strategicaudits',
  'topographypatchsupport',
  'chunkbenchmark',
  'minimumbasethickness',
  'maximumbasethickness',
  'rockfamilycounts',
  'watercellcountsbyregime',
  'waterbodycountsbyregime',
  'watercellcountsbydepthclass',
  'regionboundaryalignment',
  'tierpotentialdensity',
  'castlesuitability',
  'innergatethrone',
  'regionalhydrogeomorphology',
  'selectedaxisspan',
  'reviewedpopulationcellsharebasispoints',
  'lodsamplecounts',
  'ridgeorvalleysupportcellcount',
  'localnormalgenerationproof',
  'lodsimplificationproof',
  'featuresupportproof',
]);
function utf16BigEndianBytes(text) {
  const bytes = Buffer.from(text, 'utf16le');
  bytes.swap16();
  return bytes;
}
function utf32Bytes(text, bigEndian) {
  const bytes = Buffer.allocUnsafe([...text].length * 4);
  [...text].forEach((character, index) => {
    const value = character.codePointAt(0);
    if (bigEndian) bytes.writeUInt32BE(value, index * 4);
    else bytes.writeUInt32LE(value, index * 4);
  });
  return bytes;
}
const PRIVATE_LIVING_WORLD_AUTHORITY_PATTERNS = Object.freeze(
  [...PRIVATE_LIVING_WORLD_AUTHORITY_KEYS].flatMap(key => Object.freeze([
    Buffer.from(key, 'ascii'),
    Buffer.from(key, 'utf16le'),
    utf16BigEndianBytes(key),
    utf32Bytes(key, false),
    utf32Bytes(key, true),
  ])),
);
const PRIVATE_LIVING_WORLD_AUTHORITY_KEY_MAXIMUM_BYTES = Math.max(
  ...PRIVATE_LIVING_WORLD_AUTHORITY_PATTERNS.map(pattern => pattern.length),
);
const LOCAL_PRIVATE_SCAN_OVERLAP_BYTES = Math.max(
  GREATER_REALM_PRIVATE_MARKER_OVERLAP_BYTES,
  PRIVATE_LIVING_WORLD_AUTHORITY_KEY_MAXIMUM_BYTES - 1,
  ZIP_LOCAL_FILE_MAGIC.length - 1,
  ZIP_CENTRAL_DIRECTORY_MAGIC.length - 1,
  ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC.length - 1,
);
const PUBLIC_BOUNDARY_PROHIBITED =
  'Warpkeep public directory contains a prohibited local artifact.';
const PUBLIC_BOUNDARY_ATTESTATION_FAILED =
  'Warpkeep could not attest the public directory boundary.';

/**
 * Vite replaces, rather than extends, its default deny list when `server.fs.deny`
 * is configured. Keep one shared contract for manual and automated local QA.
 */
export const WARPKEEP_LOCAL_VITE_FS_DENY = Object.freeze([
  '.env',
  '.env.*',
  '.dev.vars*',
  '.envrc',
  '.npmrc',
  'credentials.json',
  'admin-secret*',
  'secret.json',
  'secrets.json',
  'id_rsa*',
  'id_ed25519*',
  '*.{crt,pem}',
  '*.{cer,key,p12,pfx,jks,keystore,jwk,token}',
  '*.local',
  '*.{log,har,trace}',
  '*.{bak,backup,tmp}',
  '*.{sqlite,sqlite3,db,dump}',
  '*.{7z,bz2,gz,rar,tar,tar.gz,tgz,xz,zip,zst}',
  '**/.git/**',
  '**/.cache/**',
  '**/.wrangler/**',
  '**/.secrets/**',
  '**/.warpkeep-private/**',
  '**/greater-realm-private/**',
  'seed.bin',
  'batch-seed.bin',
  'manifest.private.json',
  'batch.private.json',
  'selection.private.json',
  'shortlist.private.json',
  '*private-preview*',
  '*.{wkgr-atlas,wkgr-checkpoint,wkgr-private}',
]);

const SENSITIVE_PUBLIC_EXACT_NAMES = new Set([
  '.env',
  '.envrc',
  '.npmrc',
  'credentials.json',
  'secret.json',
  'secrets.json',
  'seed.bin',
  'batch-seed.bin',
  'manifest.private.json',
  'batch.private.json',
  'selection.private.json',
  'shortlist.private.json',
]);
const SENSITIVE_PUBLIC_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.wrangler',
  '.secrets',
  '.warpkeep-private',
  'greater-realm-private',
]);
const SENSITIVE_PUBLIC_SUFFIXES = Object.freeze([
  '.crt',
  '.pem',
  '.cer',
  '.key',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
  '.jwk',
  '.token',
  '.local',
  '.log',
  '.har',
  '.trace',
  '.bak',
  '.backup',
  '.tmp',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.dump',
  '.bz2',
  '.gz',
  '.rar',
  '.zip',
  '.tar',
  '.tar.gz',
  '.tgz',
  '.7z',
  '.xz',
  '.zst',
  '.wkgr-atlas',
  '.wkgr-checkpoint',
  '.wkgr-private',
]);

function sensitivePublicEntryName(name) {
  const lower = name.toLowerCase();
  return SENSITIVE_PUBLIC_EXACT_NAMES.has(lower)
    || SENSITIVE_PUBLIC_DIRECTORIES.has(lower)
    || lower.startsWith('.env.')
    || lower.startsWith('.dev.vars')
    || lower.startsWith('admin-secret')
    || lower.startsWith('id_rsa')
    || lower.startsWith('id_ed25519')
    || /(?:^|[._-])private-preview(?:[._-]|$)/u.test(lower)
    || SENSITIVE_PUBLIC_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function publicBoundaryProhibited() {
  throw new Error(PUBLIC_BOUNDARY_PROHIBITED);
}

function publicBoundaryAttestationFailed() {
  throw new Error(PUBLIC_BOUNDARY_ATTESTATION_FAILED);
}

function recognizedPublicBoundaryError(error) {
  return error instanceof Error && (
    error.message === PUBLIC_BOUNDARY_PROHIBITED
    || error.message === PUBLIC_BOUNDARY_ATTESTATION_FAILED
  );
}

function readPublicEntryStats(path, allowMissing) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (
      allowMissing
      && error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ENOENT'
    ) return undefined;
    publicBoundaryAttestationFailed();
  }
}

function unsafePublicEntry(stats) {
  return stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile());
}

function publicFileFingerprint(stats) {
  return Object.freeze({
    ctimeMs: stats.ctimeMs,
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  });
}

function samePublicFileFingerprint(left, right) {
  return Object.keys(left).every(key => left[key] === right[key]);
}

function startsWithBytes(bytes, prefix) {
  return bytes.length >= prefix.length
    && bytes.subarray(0, prefix.length).equals(prefix);
}

function containsOpaqueArchiveMagic(bytes) {
  return OPAQUE_ARCHIVE_PREFIXES.some(prefix => startsWithBytes(bytes, prefix))
    || (
      bytes.length >= TAR_USTAR_OFFSET + TAR_USTAR_MAGIC.length
      && bytes.subarray(
        TAR_USTAR_OFFSET,
        TAR_USTAR_OFFSET + TAR_USTAR_MAGIC.length,
      ).equals(TAR_USTAR_MAGIC)
    );
}

function asciiLowercaseByte(value) {
  return value >= 0x41 && value <= 0x5a ? value + 0x20 : value;
}

function jsonWhitespaceByte(value) {
  return value === 0x20 || value === 0x09 || value === 0x0a || value === 0x0d;
}

function hexadecimalNibble(value) {
  if (value >= 0x30 && value <= 0x39) return value - 0x30;
  const casefolded = asciiLowercaseByte(value);
  return casefolded >= 0x61 && casefolded <= 0x66
    ? casefolded - 0x61 + 10
    : -1;
}

function containsPrivateLivingWorldAuthority(bytes) {
  const casefolded = Buffer.allocUnsafe(bytes.length);
  try {
    for (let offset = 0; offset < bytes.length; offset += 1) {
      casefolded[offset] = asciiLowercaseByte(bytes[offset]);
    }
    return PRIVATE_LIVING_WORLD_AUTHORITY_PATTERNS.some(pattern => (
      casefolded.indexOf(pattern) !== -1
    ));
  } finally {
    casefolded.fill(0);
  }
}

function createPrivateLivingWorldJsonScanner() {
  const key = Buffer.alloc(PRIVATE_LIVING_WORLD_AUTHORITY_KEY_MAXIMUM_BYTES);
  let keyLength = 0;
  let mode = 0;
  let candidatePossible = true;
  let unicodeDigits = 0;
  let unicodeValue = 0;
  const resetCandidate = () => {
    key.fill(0);
    keyLength = 0;
    candidatePossible = true;
    unicodeDigits = 0;
    unicodeValue = 0;
  };
  const appendCandidateByte = value => {
    if (!candidatePossible || keyLength >= key.length) {
      candidatePossible = false;
      return;
    }
    key[keyLength] = asciiLowercaseByte(value);
    keyLength += 1;
  };
  return Object.freeze({
    scan(bytes) {
      for (const value of bytes) {
        if (mode === 0) {
          if (value === 0x22) {
            resetCandidate();
            mode = 1;
          }
          continue;
        }
        if (mode === 1) {
          if (value === 0x22) {
            const candidate = candidatePossible
              ? key.subarray(0, keyLength).toString('ascii')
              : '';
            key.fill(0);
            keyLength = 0;
            mode = PRIVATE_LIVING_WORLD_AUTHORITY_KEYS.has(candidate) ? 2 : 0;
          } else if (value === 0x5c) {
            mode = 3;
          } else if (
            value < 0x20
            || value > 0x7e
          ) {
            candidatePossible = false;
          } else {
            appendCandidateByte(value);
          }
          continue;
        }
        if (mode === 3) {
          if (value === 0x75) {
            unicodeDigits = 0;
            unicodeValue = 0;
            mode = 4;
          } else {
            candidatePossible = false;
            mode = 1;
          }
          continue;
        }
        if (mode === 4) {
          const nibble = hexadecimalNibble(value);
          if (nibble < 0) {
            candidatePossible = false;
            mode = 1;
            continue;
          }
          unicodeValue = unicodeValue * 16 + nibble;
          unicodeDigits += 1;
          if (unicodeDigits === 4) {
            if (unicodeValue >= 0x20 && unicodeValue <= 0x7e) {
              appendCandidateByte(unicodeValue);
            } else {
              candidatePossible = false;
            }
            unicodeDigits = 0;
            unicodeValue = 0;
            mode = 1;
          }
          continue;
        }
        if (jsonWhitespaceByte(value)) continue;
        if (value === 0x3a) publicBoundaryProhibited();
        resetCandidate();
        mode = value === 0x22 ? 1 : 0;
      }
    },
    clear() {
      resetCandidate();
      mode = 0;
    },
  });
}

function zipEvidenceInBytes(bytes, initialEvidence) {
  let evidence = initialEvidence;
  if (bytes.indexOf(ZIP_LOCAL_FILE_MAGIC) !== -1) evidence |= ZIP_LOCAL_FILE_EVIDENCE;
  if (bytes.indexOf(ZIP_CENTRAL_DIRECTORY_MAGIC) !== -1) {
    evidence |= ZIP_CENTRAL_DIRECTORY_EVIDENCE;
  }
  if (bytes.indexOf(ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC) !== -1) {
    evidence |= ZIP_END_OF_CENTRAL_DIRECTORY_EVIDENCE;
  }
  return evidence;
}

function scanRegularPublicFile(path, expectedStats) {
  if (
    !expectedStats.isFile()
    || expectedStats.isSymbolicLink()
    || !Number.isSafeInteger(expectedStats.size)
    || expectedStats.size < 0
    || expectedStats.size > MAXIMUM_PUBLIC_FILE_BYTES
  ) publicBoundaryProhibited();
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile()
      || opened.dev !== expectedStats.dev
      || opened.ino !== expectedStats.ino
      || opened.size !== expectedStats.size
    ) publicBoundaryProhibited();

    let carry = Buffer.alloc(0);
    let remaining = opened.size;
    let firstChunk = true;
    let zipEvidence = 0;
    const livingWorldJsonScanner = createPrivateLivingWorldJsonScanner();
    try {
      while (remaining > 0) {
        const chunk = Buffer.alloc(Math.min(PUBLIC_SCAN_CHUNK_BYTES, remaining));
        let window;
        let nextCarry = Buffer.alloc(0);
        try {
          let offset = 0;
          while (offset < chunk.length) {
            const count = readSync(descriptor, chunk, offset, chunk.length - offset, null);
            if (count <= 0) publicBoundaryAttestationFailed();
            offset += count;
          }
          remaining -= chunk.length;
          if (firstChunk) {
            firstChunk = false;
            if (containsOpaqueArchiveMagic(chunk)) publicBoundaryProhibited();
          }
          livingWorldJsonScanner.scan(chunk);
          window = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
          zipEvidence = zipEvidenceInBytes(window, zipEvidence);
          if (zipEvidence === COMPLETE_ZIP_EVIDENCE) publicBoundaryProhibited();
          if (containsPrivateLivingWorldAuthority(window)) publicBoundaryProhibited();
          if (containsGreaterRealmPrivateMarker(window)) publicBoundaryProhibited();
          nextCarry = Buffer.from(window.subarray(Math.max(
            0,
            window.length - LOCAL_PRIVATE_SCAN_OVERLAP_BYTES,
          )));
        } finally {
          carry.fill(0);
          chunk.fill(0);
          if (window !== undefined && window !== chunk) window.fill(0);
        }
        carry = nextCarry;
      }
    } finally {
      carry.fill(0);
      livingWorldJsonScanner.clear();
    }

    const after = fstatSync(descriptor);
    const current = readPublicEntryStats(path, false);
    if (
      !current.isFile()
      || current.isSymbolicLink()
      || !samePublicFileFingerprint(
        publicFileFingerprint(opened),
        publicFileFingerprint(after),
      )
      || !samePublicFileFingerprint(
        publicFileFingerprint(after),
        publicFileFingerprint(current),
      )
    ) publicBoundaryProhibited();
    closeSync(descriptor);
    descriptor = undefined;
    return publicFileFingerprint(after);
  } catch (error) {
    if (recognizedPublicBoundaryError(error)) throw error;
    return publicBoundaryAttestationFailed();
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the fixed boundary diagnostic. */ }
    }
  }
}

function assertSafePublicTree(
  directory,
  allowMissing = true,
  state = { entryCount: 0, fileFingerprints: new Map() },
) {
  const directoryStats = readPublicEntryStats(directory, allowMissing);
  if (directoryStats === undefined) return state.fileFingerprints;
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    publicBoundaryProhibited();
  }
  const directoryFingerprint = publicFileFingerprint(directoryStats);
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    publicBoundaryAttestationFailed();
  }
  for (const entry of entries) {
    state.entryCount += 1;
    if (state.entryCount > MAXIMUM_PUBLIC_TREE_ENTRIES) publicBoundaryProhibited();
    const entryPath = join(directory, entry.name);
    const entryStats = readPublicEntryStats(entryPath, false);
    if (sensitivePublicEntryName(entry.name) || unsafePublicEntry(entryStats)) {
      publicBoundaryProhibited();
    }
    if (entryStats.isDirectory()) assertSafePublicTree(entryPath, false, state);
    else state.fileFingerprints.set(entryPath, scanRegularPublicFile(entryPath, entryStats));
  }
  const currentDirectoryStats = readPublicEntryStats(directory, false);
  if (
    !currentDirectoryStats.isDirectory()
    || currentDirectoryStats.isSymbolicLink()
    || !samePublicFileFingerprint(
      directoryFingerprint,
      publicFileFingerprint(currentDirectoryStats),
    )
  ) publicBoundaryProhibited();
  return state.fileFingerprints;
}

function requestPublicSegments(requestUrl, base) {
  try {
    let pathname = decodeURIComponent(new URL(requestUrl, 'http://warpkeep.local').pathname)
      .replaceAll('\\', '/');
    const decodedBase = decodeURIComponent(new URL(base, 'http://warpkeep.local').pathname);
    if (decodedBase !== '/' && pathname.startsWith(decodedBase)) {
      pathname = `/${pathname.slice(decodedBase.length)}`;
    }
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))) {
      return undefined;
    }
    return segments;
  } catch {
    return undefined;
  }
}

function requestTargetsUnsafePublicEntry(
  publicDirectory,
  requestUrl,
  base,
  fileFingerprints,
) {
  try {
    const segments = requestPublicSegments(requestUrl, base);
    if (segments === undefined || segments.some(sensitivePublicEntryName)) return true;
    const rootStats = readPublicEntryStats(publicDirectory, true);
    if (rootStats === undefined) return false;
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return true;

    let current = publicDirectory;
    for (const [index, segment] of segments.entries()) {
      current = join(current, segment);
      const stats = readPublicEntryStats(current, true);
      if (stats === undefined) return false;
      if (unsafePublicEntry(stats)) return true;
      if (index < segments.length - 1 && !stats.isDirectory()) return false;
      if (index === segments.length - 1 && stats.isFile()) {
        const fingerprint = publicFileFingerprint(stats);
        const attested = fileFingerprints.get(current);
        if (
          attested === undefined
          || !samePublicFileFingerprint(attested, fingerprint)
        ) {
          fileFingerprints.set(current, scanRegularPublicFile(current, stats));
        }
      }
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Vite's public middleware bypasses `server.fs.deny`. Refuse startup/build if
 * that copy-through surface contains a credential, private capture, local
 * database, recovery archive, special file, or symlink.
 */
export function warpkeepLocalPublicBoundaryPlugin() {
  let publicDirectory;
  let base = '/';
  let fileFingerprints = new Map();
  return {
    name: 'warpkeep-local-public-boundary',
    enforce: 'pre',
    configResolved(config) {
      publicDirectory = config.publicDir || undefined;
      base = config.base;
      fileFingerprints = publicDirectory
        ? assertSafePublicTree(publicDirectory)
        : new Map();
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          request.url
          && (
            !publicDirectory
            || !requestTargetsUnsafePublicEntry(
              publicDirectory,
              request.url,
              base,
              fileFingerprints,
            )
          )
        ) {
          next();
          return;
        }
        response.statusCode = 404;
        response.setHeader('cache-control', 'no-store');
        response.setHeader('content-type', 'text/plain; charset=utf-8');
        response.end('Not Found\n');
      });
    },
  };
}
