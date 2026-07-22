import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
]);

const SENSITIVE_PUBLIC_EXACT_NAMES = new Set([
  '.env',
  '.envrc',
  '.npmrc',
  'credentials.json',
  'secret.json',
  'secrets.json',
]);
const SENSITIVE_PUBLIC_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.wrangler',
  '.secrets',
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
    || SENSITIVE_PUBLIC_SUFFIXES.some((suffix) => lower.endsWith(suffix));
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
    throw new Error('Warpkeep could not attest the public directory boundary.');
  }
}

function unsafePublicEntry(stats) {
  return stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile());
}

function assertSafePublicTree(directory, allowMissing = true) {
  const directoryStats = readPublicEntryStats(directory, allowMissing);
  if (directoryStats === undefined) return;
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error('Warpkeep public directory contains a prohibited local artifact.');
  }
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    throw new Error('Warpkeep could not attest the public directory boundary.');
  }
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    const entryStats = readPublicEntryStats(entryPath, false);
    if (sensitivePublicEntryName(entry.name) || unsafePublicEntry(entryStats)) {
      throw new Error('Warpkeep public directory contains a prohibited local artifact.');
    }
    if (entryStats.isDirectory()) assertSafePublicTree(entryPath, false);
  }
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

function requestTargetsUnsafePublicEntry(publicDirectory, requestUrl, base) {
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
  return {
    name: 'warpkeep-local-public-boundary',
    enforce: 'pre',
    configResolved(config) {
      publicDirectory = config.publicDir || undefined;
      base = config.base;
      if (publicDirectory) assertSafePublicTree(publicDirectory);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          request.url
          && (!publicDirectory || !requestTargetsUnsafePublicEntry(publicDirectory, request.url, base))
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
