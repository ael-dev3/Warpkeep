import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';

import { resolveAttestedSystemUnzip } from '../system-unzip.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const SOURCE_ARCHIVE = resolve(
  REPOSITORY_ROOT,
  '.cache/warpkeep-assets/hegemony-frontier-keep-3d-2026-07-14',
  'hegemony-frontier-keep-3d-sources-v1.zip'
);
const SOURCE_ARCHIVE_BYTES = 10_672_929;
const SOURCE_ARCHIVE_SHA256 = 'c029a636ee0a791ca54072d5f32fcf68263677951fd59c338dfe242264335d5f';
const SOURCE_MEMBER = 'hegemony-frontier-keep-3d-sources-v1/HegemonyMainCastle.glb';
const SOURCE_MEMBER_BYTES = 2_233_564;
const SOURCE_MEMBER_SHA256 = 'b33755f14bbed0855cf738ba8fb2dbdde9cf56e976b7f108a2259dd478a9b580';
const ARCHIVE_ROOT = 'hegemony-frontier-keep-3d-sources-v1';
const SOURCE_ROUTE = '/_warpkeep-local-qa/hegemony-main-castle-source.glb';
const CASE_ROUTE = '/dev/castle-lod-visual-evidence.html';
const CASE_TIMEOUT_MILLISECONDS = 120_000;
const LOOPBACK_BOUNDARY_TIMEOUT_MILLISECONDS = 5_000;
const LOOPBACK_BOUNDARY_MAXIMUM_HEADER_BYTES = 16 * 1_024;
const VISUAL_TARGET_PIXELS = 384;
const VISUAL_LODS = Object.freeze(['high', 'balanced', 'compact']);
// The 2026-07-16 GameReady family deliberately adds and reshapes silhouette
// detail relative to the superseded public-source mesh. Preserve the much
// tighter coverage and colour gates while allowing that owner-approved outline
// change; these floors still reject total silhouette-overlap loss beyond
// roughly 12-13% against that historical reference.
const VISUAL_LIMITS = Object.freeze({
  high: Object.freeze({
    maximumCoverageDeltaBasisPoints: 250,
    maximumMeanColorDelta: 48,
    minimumSilhouetteIouBasisPoints: 8_800,
  }),
  balanced: Object.freeze({
    maximumCoverageDeltaBasisPoints: 500,
    maximumMeanColorDelta: 84,
    minimumSilhouetteIouBasisPoints: 8_750,
  }),
  compact: Object.freeze({
    maximumCoverageDeltaBasisPoints: 1_100,
    maximumMeanColorDelta: 112,
    minimumSilhouetteIouBasisPoints: 8_700,
  }),
});

export const CASTLE_LOD_VISUAL_EVIDENCE_ROUTE = CASE_ROUTE;
export const CASTLE_LOD_VISUAL_EVIDENCE_SOURCE_ROUTE = SOURCE_ROUTE;
export const CASTLE_LOD_VISUAL_EVIDENCE_PROFILE_COUNT = VISUAL_LODS.length;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactPort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError('Invalid castle LOD visual evidence loopback port.');
  }
  return value;
}

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(message);
  return value;
}

function exactKeys(value, expected, message) {
  const actual = Object.keys(value).sort();
  const contract = [...expected].sort();
  if (actual.length !== contract.length || actual.some((key, index) => key !== contract[index])) {
    throw new TypeError(message);
  }
}

function safeArchiveEntry(entry) {
  if (
    typeof entry !== 'string'
    || !entry
    || entry.includes('\\')
    || entry.includes('\0')
    || entry.startsWith('/')
    || /^[A-Za-z]:/u.test(entry)
  ) return false;
  const parts = entry.split('/').filter(Boolean);
  return parts.length > 1
    && parts[0] === ARCHIVE_ROOT
    && parts.every((part) => part !== '.' && part !== '..');
}

function assertExactSourceArchive() {
  const metadata = lstatSync(SOURCE_ARCHIVE, { throwIfNoEntry: false });
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    !metadata?.isFile()
    || metadata.isSymbolicLink()
    || metadata.nlink !== 1
    || metadata.size !== SOURCE_ARCHIVE_BYTES
    || (metadata.mode & 0o022) !== 0
    || (expectedUid !== undefined && metadata.uid !== 0 && metadata.uid !== expectedUid)
  ) throw new Error('The local authorized castle source archive is unavailable.');
  const archive = readFileSync(SOURCE_ARCHIVE);
  try {
    if (archive.byteLength !== SOURCE_ARCHIVE_BYTES || sha256(archive) !== SOURCE_ARCHIVE_SHA256) {
      throw new Error('The local authorized castle source archive did not match its recorded hash.');
    }
  } finally {
    archive.fill(0);
  }
}

function unzip(args, encoding = 'buffer') {
  const result = spawnSync(resolveAttestedSystemUnzip(), args, {
    cwd: REPOSITORY_ROOT,
    encoding,
    env: Object.freeze({ LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' }),
    maxBuffer: 4 * 1_024 * 1_024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error('The local authorized castle source archive could not be read safely.');
  }
  return result.stdout;
}

/**
 * Reads only the hash-pinned GLB member into memory. The source package is
 * never unpacked into the checkout, made part of a browser build, or written
 * to a report. The caller must zero this buffer after the temporary server is
 * closed.
 */
export function loadCastleLodVisualEvidenceSource() {
  assertExactSourceArchive();
  const listing = String(unzip(['-Z1', SOURCE_ARCHIVE], 'utf8'))
    .split(/\r?\n/u)
    .filter(Boolean);
  if (
    listing.length < 1
    || new Set(listing).size !== listing.length
    || !listing.every(safeArchiveEntry)
    || !listing.includes(SOURCE_MEMBER)
  ) throw new Error('The local authorized castle source archive has an unsafe member list.');
  const source = unzip(['-p', SOURCE_ARCHIVE, SOURCE_MEMBER]);
  if (!Buffer.isBuffer(source)) {
    throw new Error('The local authorized castle source member is invalid.');
  }
  if (
    source.byteLength !== SOURCE_MEMBER_BYTES
    || sha256(source) !== SOURCE_MEMBER_SHA256
    || source.subarray(0, 4).toString('ascii') !== 'glTF'
    || source.readUInt32LE(4) !== 2
    || source.readUInt32LE(8) !== source.byteLength
  ) {
    source.fill(0);
    throw new Error('The local authorized castle source member did not match its recorded identity.');
  }
  return source;
}

export function disposeCastleLodVisualEvidenceSource(source) {
  if (Buffer.isBuffer(source)) source.fill(0);
}

/**
 * Adds a single no-store, same-origin source endpoint to the already isolated
 * loopback Vite server. It accepts no query, method, path, or caller-provided
 * file parameter, and it retains no source bytes once the browser lane ends.
 */
export function castleLodVisualEvidenceSourceVitePlugin(source) {
  if (
    !Buffer.isBuffer(source)
    || source.byteLength !== SOURCE_MEMBER_BYTES
    || sha256(source) !== SOURCE_MEMBER_SHA256
  ) {
    throw new TypeError('Invalid local castle LOD source bytes.');
  }
  return Object.freeze({
    name: 'warpkeep-local-castle-lod-source',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== SOURCE_ROUTE) {
          next();
          return;
        }
        if (!['GET', 'HEAD'].includes(request.method ?? '')) {
          response.writeHead(405, {
            'allow': 'GET, HEAD',
            'cache-control': 'no-store',
            'content-length': '0',
            'x-content-type-options': 'nosniff',
          });
          response.end();
          return;
        }
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-length': String(source.byteLength),
          'content-type': 'model/gltf-binary',
          'cross-origin-resource-policy': 'same-origin',
          'x-content-type-options': 'nosniff',
        });
        response.end(request.method === 'HEAD' ? undefined : source);
      });
    },
  });
}

function loopbackHead(port, path) {
  const selectedPort = exactPort(port);
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return Promise.reject(new TypeError('Invalid local castle LOD boundary path.'));
  }
  return new Promise((resolveHead, rejectHead) => {
    let settled = false;
    let response;
    let request;
    let deadline;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      // This probes only headers, so no socket has a reason to outlive the
      // assertion. Explicitly tear down both ends even when a Node runtime
      // changes its default client-agent keep-alive policy.
      response?.destroy();
      request?.destroy();
      callback(value);
    };
    deadline = setTimeout(() => {
      settle(rejectHead, new Error('Local castle LOD boundary request deadline exceeded.'));
    }, LOOPBACK_BOUNDARY_TIMEOUT_MILLISECONDS);
    try {
      request = httpRequest({
        agent: false,
        headers: Object.freeze({
          connection: 'close',
          host: `127.0.0.1:${selectedPort}`,
        }),
        host: '127.0.0.1',
        maxHeaderSize: LOOPBACK_BOUNDARY_MAXIMUM_HEADER_BYTES,
        method: 'HEAD',
        path,
        port: selectedPort,
        protocol: 'http:',
        setHost: false,
      }, (nextResponse) => {
        response = nextResponse;
        const statusCode = response.statusCode;
        const headers = Object.freeze({ ...response.headers });
        response.once('error', () => settle(rejectHead, new Error('Local castle LOD boundary response failed.')));
        // This assertion consumes only status and headers. Settling immediately
        // avoids coupling the local boundary to Vite/Node zero-body stream-end
        // timing; `settle` deterministically destroys both request and response.
        settle(resolveHead, Object.freeze({ headers, statusCode }));
      });
      request.setTimeout(LOOPBACK_BOUNDARY_TIMEOUT_MILLISECONDS, () => {
        settle(rejectHead, new Error('Local castle LOD boundary request timed out.'));
      });
      request.once('error', () => settle(rejectHead, new Error('Local castle LOD boundary request failed.')));
      request.end();
    } catch {
      settle(rejectHead, new Error('Local castle LOD boundary request failed.'));
    }
  });
}

function exactHeader(value) {
  if (Array.isArray(value)) return value.length === 1 && typeof value[0] === 'string'
    ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

/**
 * Proves the live, hardened loopback server exposes only the exact source
 * endpoint. Vite's `fs.deny` applies to absolute `/@fs` URLs, so exercise the
 * actual cached archive path rather than relying on glob intuition. HEAD
 * responses keep all source/archive bytes out of this assertion.
 */
export async function assertCastleLodVisualEvidenceLoopbackBoundary(port) {
  const selectedPort = exactPort(port);
  const archiveFsPath = `/@fs${encodeURI(SOURCE_ARCHIVE)}`;
  const boundaryHead = async (category, path) => {
    try {
      return await loopbackHead(selectedPort, path);
    } catch {
      throw new Error(`Local castle LOD boundary ${category} check failed.`);
    }
  };
  const [exact, archive, query] = await Promise.all([
    boundaryHead('exact', SOURCE_ROUTE),
    boundaryHead('archive', archiveFsPath),
    boundaryHead('query', `${SOURCE_ROUTE}?probe=1`),
  ]);
  if (
    exact.statusCode !== 200
    || exactHeader(exact.headers['content-type']) !== 'model/gltf-binary'
    || exactHeader(exact.headers['content-length']) !== String(SOURCE_MEMBER_BYTES)
    || exactHeader(exact.headers['cache-control']) !== 'no-store'
    || exactHeader(exact.headers['cross-origin-resource-policy']) !== 'same-origin'
  ) throw new Error('The exact local castle LOD source route did not meet its boundary contract.');
  if (archive.statusCode !== 403) {
    throw new Error('The cached castle source archive escaped the local Vite boundary.');
  }
  // A Vite SPA fallback may validly answer the query with HTML. It must never
  // become an alias for the source bytes or their GLB content type/length.
  if (
    exactHeader(query.headers['content-type']) === 'model/gltf-binary'
    || exactHeader(query.headers['content-length']) === String(SOURCE_MEMBER_BYTES)
  ) throw new Error('A queried local castle source route exposed source bytes.');
  return Object.freeze({
    archiveStatus: archive.statusCode ?? 0,
    exactStatus: exact.statusCode ?? 0,
    queryStatus: query.statusCode ?? 0,
  });
}

export function castleLodVisualEvidenceUrl(port) {
  return new URL(CASE_ROUTE, `http://127.0.0.1:${exactPort(port)}`).toString();
}

function parseMetric(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new TypeError(`Invalid castle LOD visual evidence ${label}.`);
  }
  return value;
}

function parseProfile(value, lod) {
  const candidate = exactRecord(value, 'Invalid castle LOD visual evidence profile.');
  exactKeys(candidate, [
    'coverageDeltaBasisPoints',
    'meanColorDelta',
    'silhouetteIouBasisPoints',
  ], 'Invalid castle LOD visual evidence profile shape.');
  const parsed = Object.freeze({
    coverageDeltaBasisPoints: parseMetric(candidate.coverageDeltaBasisPoints, `${lod} coverage`),
    meanColorDelta: parseMetric(candidate.meanColorDelta, `${lod} colour`),
    silhouetteIouBasisPoints: parseMetric(candidate.silhouetteIouBasisPoints, `${lod} silhouette`),
  });
  return parsed;
}

function profileOutsideLimits(profile, limits) {
  return profile.coverageDeltaBasisPoints > limits.maximumCoverageDeltaBasisPoints
    || profile.meanColorDelta > limits.maximumMeanColorDelta
    || profile.silhouetteIouBasisPoints < limits.minimumSilhouetteIouBasisPoints;
}

/**
 * Accepts only closed aggregate render evidence. It deliberately excludes
 * screenshots, model bytes, source paths, image URLs, names, and raw pixels.
 */
export function parseCastleLodVisualEvidence(value, expectedUrl) {
  const candidate = exactRecord(value, 'Invalid castle LOD visual evidence.');
  exactKeys(candidate, [
    'href',
    'profiles',
    'renderer',
    'status',
    'targetPixels',
  ], 'Invalid castle LOD visual evidence shape.');
  const profiles = exactRecord(candidate.profiles, 'Invalid castle LOD visual evidence profiles.');
  exactKeys(profiles, VISUAL_LODS, 'Invalid castle LOD visual evidence profiles shape.');
  if (
    candidate.href !== expectedUrl
    || candidate.status !== 'ready'
    || candidate.renderer !== 'webgl'
    || candidate.targetPixels !== VISUAL_TARGET_PIXELS
  ) throw new TypeError('Invalid castle LOD visual evidence state.');
  const parsedProfiles = Object.freeze(Object.fromEntries(VISUAL_LODS.map((lod) => [
      lod,
      parseProfile(profiles[lod], lod),
    ])));
  const failedProfiles = VISUAL_LODS.filter((lod) => (
    profileOutsideLimits(parsedProfiles[lod], VISUAL_LIMITS[lod])
  ));
  if (failedProfiles.length > 0) {
    const labels = failedProfiles.length === 1
      ? failedProfiles[0]
      : `${failedProfiles.slice(0, -1).join(', ')} and ${failedProfiles.at(-1)}`;
    throw new TypeError(
      `Castle LOD visual evidence failed the ${labels} fidelity `
      + `${failedProfiles.length === 1 ? 'floor' : 'floors'}: `
      + `${JSON.stringify(parsedProfiles)} against ${JSON.stringify(VISUAL_LIMITS)}.`
    );
  }
  return Object.freeze({
    profiles: parsedProfiles,
    renderer: 'webgl',
    targetPixels: VISUAL_TARGET_PIXELS,
  });
}

const READ_VISUAL_EVIDENCE_EXPRESSION = `(() => {
  const root = document.querySelector('main[data-castle-lod-visual-status]');
  const integer = (value) => /^\\d+$/.test(value ?? '') ? Number(value) : null;
  const profile = (prefix) => ({
    coverageDeltaBasisPoints: integer(root?.dataset[\`castleLodVisual\${prefix}CoverageDeltaBasisPoints\`]),
    meanColorDelta: integer(root?.dataset[\`castleLodVisual\${prefix}MeanColorDelta\`]),
    silhouetteIouBasisPoints: integer(root?.dataset[\`castleLodVisual\${prefix}SilhouetteIouBasisPoints\`]),
  });
  return {
    href: location.href,
    profiles: {
      high: profile('High'),
      balanced: profile('Balanced'),
      compact: profile('Compact'),
    },
    renderer: root?.dataset.castleLodVisualRenderer ?? '',
    status: root?.dataset.castleLodVisualStatus ?? '',
    targetPixels: integer(root?.dataset.castleLodVisualTargetPixels),
  };
})()`;

async function readCastleLodVisualEvidence(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: READ_VISUAL_EVIDENCE_EXPRESSION,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Local castle LOD visual browser evaluation failed.');
  }
  return evaluation.result.value;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

/** Runs one fixed WebGL source-versus-runtime render comparison on loopback. */
export async function runCastleLodVisualEvidenceBrowserCase(session, options) {
  const port = exactPort(options?.port);
  const expectedUrl = castleLodVisualEvidenceUrl(port);
  const state = options?.state;
  if (!state || typeof state !== 'object') throw new TypeError('Invalid castle LOD visual browser state.');
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: 1_024,
    height: 720,
    screenWidth: 1_024,
    screenHeight: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.command('Page.navigate', { url: expectedUrl });
  const deadline = Date.now() + CASE_TIMEOUT_MILLISECONDS;
  let lastFailure;
  while (Date.now() < deadline) {
    if (state.violation) {
      throw new Error(`Headless browser left the local QA boundary: ${state.violation}.`);
    }
    const observation = await readCastleLodVisualEvidence(session);
    if (observation?.href === expectedUrl) {
      if (observation.status === 'error') {
        throw new Error('Local castle LOD visual page failed closed.');
      }
      try {
        return parseCastleLodVisualEvidence(observation, expectedUrl);
      } catch (error) {
        if (observation.status === 'ready') {
          throw new Error('Local castle LOD visual evidence was outside its reviewed floors.', {
            cause: error
          });
        }
        lastFailure = error;
      }
    }
    await delay(100);
  }
  throw new Error(
    `Local castle LOD visual evidence timed out${lastFailure instanceof Error ? '.' : ''}`
  );
}
