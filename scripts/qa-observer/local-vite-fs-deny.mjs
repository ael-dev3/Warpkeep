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
  '*.{zip,tar,tar.gz,tgz,7z}',
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
  '.zip',
  '.tar',
  '.tar.gz',
  '.tgz',
  '.7z',
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
          window = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
          if (containsGreaterRealmPrivateMarker(window)) publicBoundaryProhibited();
          nextCarry = Buffer.from(window.subarray(Math.max(
            0,
            window.length - GREATER_REALM_PRIVATE_MARKER_OVERLAP_BYTES,
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
