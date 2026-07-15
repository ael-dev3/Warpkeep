import { spawn } from 'node:child_process';
import { chmodSync, lstatSync, realpathSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseQaObserverSnapshot } from './observer-snapshot.mjs';

const OBSERVATORY_DIRECTORY = join(
  homedir(),
  'Library',
  'Application Support',
  'Warpkeep',
  'qa-observatory',
);
const SOCKET_PATH = join(OBSERVATORY_DIRECTORY, 'broker.sock');
// Keep safely below Darwin's short sockaddr_un path ceiling.
const MAX_UNIX_SOCKET_PATH_BYTES = 90;
const MAX_HELPER_BYTES = 16 * 1024;
const MAX_HEADER_BYTES = 8 * 1024;
const MAX_CONNECTIONS = 8;
const HEADER_TIMEOUT_MILLISECONDS = 2_000;
const REQUEST_TIMEOUT_MILLISECONDS = 2_000;
const RESPONSE_TIMEOUT_MILLISECONDS = 30_000;
// The helper performs two bounded HTTPS exchanges (challenge, then snapshot).
// Keep the broker above their combined 20-second ceiling without making it
// unbounded or changing the 60-second challenge lifetime.
const HELPER_TIMEOUT_MILLISECONDS = 25_000;
const CACHE_TTL_MILLISECONDS = 30_000;
const helperPath = join(
  OBSERVATORY_DIRECTORY,
  'bin',
  'warpkeep-qa-device',
);

let cachedSnapshot;
let cachedAt = 0;
let cacheExpiryTimer;
let activeRead;
let shuttingDown = false;
let boundSocketIdentity;

function clearSnapshotCache() {
  cachedSnapshot = undefined;
  cachedAt = 0;
  clearTimeout(cacheExpiryTimer);
  cacheExpiryTimer = undefined;
}

function retainSnapshotBriefly(snapshot) {
  clearSnapshotCache();
  cachedSnapshot = snapshot;
  cachedAt = Date.now();
  cacheExpiryTimer = setTimeout(clearSnapshotCache, CACHE_TTL_MILLISECONDS);
  cacheExpiryTimer.unref?.();
}

function requireOwnerOnlyPath(path, directory = false) {
  const metadata = lstatSync(path);
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    metadata.isSymbolicLink()
    || (directory ? !metadata.isDirectory() : !metadata.isFile())
    || (expectedUid !== undefined && metadata.uid !== expectedUid)
    || (metadata.mode & 0o077) !== 0
    || (!directory && metadata.nlink !== 1)
    || realpathSync(path) !== path
  ) throw new Error('QA helper boundary is unavailable.');
}

function requireHelperBoundary() {
  requireOwnerOnlyPath(OBSERVATORY_DIRECTORY, true);
  requireOwnerOnlyPath(dirname(helperPath), true);
  requireOwnerOnlyPath(helperPath);
  const metadata = lstatSync(helperPath, { bigint: true });
  return [
    metadata.dev,
    metadata.ino,
    metadata.uid,
    metadata.gid,
    metadata.mode,
    metadata.nlink,
    metadata.size,
    metadata.mtimeNs,
    metadata.ctimeNs,
  ].join(':');
}

function requireAbsentSocket() {
  try {
    const metadata = lstatSync(SOCKET_PATH);
    const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    if (
      metadata.isSymbolicLink()
      || !metadata.isSocket()
      || (expectedUid !== undefined && metadata.uid !== expectedUid)
      || (metadata.mode & 0o077) !== 0
    ) throw new Error('Unsafe existing QA broker socket.');
    throw new Error('QA broker socket is already active or requires operator cleanup.');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return;
    throw error;
  }
}

function requireSocketPathFits() {
  if (Buffer.byteLength(SOCKET_PATH, 'utf8') > MAX_UNIX_SOCKET_PATH_BYTES) {
    throw new Error('QA broker socket path is too long.');
  }
}

function requireSocketBoundary(expectedIdentity) {
  const metadata = lstatSync(SOCKET_PATH, { bigint: true });
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    metadata.isSymbolicLink()
    || !metadata.isSocket()
    || (expectedUid !== undefined && metadata.uid !== BigInt(expectedUid))
    || (metadata.mode & 0o077n) !== 0n
    || metadata.nlink !== 1n
  ) throw new Error('QA broker socket boundary is unavailable.');
  const identity = [
    metadata.dev,
    metadata.ino,
    metadata.uid,
    metadata.gid,
    metadata.mode,
    metadata.nlink,
    metadata.ctimeNs,
  ].join(':');
  if (expectedIdentity !== undefined && identity !== expectedIdentity) {
    throw new Error('QA broker socket boundary changed.');
  }
  return identity;
}

function removeOwnedSocket() {
  try {
    requireSocketBoundary(boundSocketIdentity);
    unlinkSync(SOCKET_PATH);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return;
  }
}

function safeHeaders() {
  return {
    'cache-control': 'no-store',
    connection: 'close',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  };
}

function sendJson(response, status, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    ...safeHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(bytes.byteLength),
  });
  response.end(bytes);
}

function runHelper() {
  return new Promise((resolve, reject) => {
    let expectedHelperIdentity;
    try {
      expectedHelperIdentity = requireHelperBoundary();
    } catch {
      reject(new Error('QA helper unavailable.'));
      return;
    }
    const child = spawn(helperPath, ['snapshot'], {
      cwd: '/',
      env: {
        HOME: homedir(),
        PATH: '/usr/bin:/bin',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const chunks = [];
    let total = 0;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new Error('QA helper timed out.')));
    }, HELPER_TIMEOUT_MILLISECONDS);
    child.stdout.on('data', (chunk) => {
      total += chunk.byteLength;
      if (total > MAX_HELPER_BYTES) {
        child.kill('SIGKILL');
        finish(() => reject(new Error('QA helper response exceeded its bound.')));
        return;
      }
      chunks.push(chunk);
    });
    child.once('error', () => finish(() => reject(new Error('QA helper unavailable.'))));
    child.once('close', (code) => {
      if (settled) return;
      try {
        if (requireHelperBoundary() !== expectedHelperIdentity) {
          throw new Error('QA helper boundary changed.');
        }
      } catch {
        finish(() => reject(new Error('QA helper boundary changed.')));
        return;
      }
      if (code !== 0) {
        finish(() => reject(new Error('QA helper rejected the request.')));
        return;
      }
      finish(() => {
        try {
          const snapshot = parseQaObserverSnapshot(
            JSON.parse(Buffer.concat(chunks).toString('utf8')),
          );
          if (!snapshot) throw new Error('Invalid QA observer snapshot.');
          resolve(snapshot);
        } catch {
          reject(new Error('QA helper returned invalid JSON.'));
        }
      });
    });
  });
}

async function readSnapshot() {
  const now = Date.now();
  if (cachedSnapshot && now - cachedAt <= CACHE_TTL_MILLISECONDS) return cachedSnapshot;
  clearSnapshotCache();
  if (!activeRead) {
    activeRead = runHelper().then((snapshot) => {
      retainSnapshotBriefly(snapshot);
      return snapshot;
    }).finally(() => {
      activeRead = undefined;
    });
  }
  return activeRead;
}

const server = createServer({ maxHeaderSize: MAX_HEADER_BYTES }, async (request, response) => {
  try {
    requireSocketBoundary(boundSocketIdentity);
  } catch {
    sendJson(response, 503, { error: 'broker_unavailable' });
    return;
  }
  const requestPath = request.url;
  if (
    request.httpVersion !== '1.1'
    || request.method !== 'GET'
    || request.headers['content-length'] !== undefined
    || request.headers['transfer-encoding'] !== undefined
    || request.headers.upgrade !== undefined
    || request.headers.expect !== undefined
    || (requestPath !== '/healthz' && requestPath !== '/snapshot')
  ) {
    sendJson(response, 404, { error: 'not_found' });
    return;
  }
  if (requestPath === '/healthz') {
    sendJson(response, 200, { ok: true, mode: 'read-only' });
    return;
  }
  try {
    sendJson(response, 200, await readSnapshot());
  } catch {
    sendJson(response, 503, { error: 'snapshot_unavailable' });
  }
});

server.maxConnections = MAX_CONNECTIONS;
server.maxHeadersCount = 16;
server.headersTimeout = HEADER_TIMEOUT_MILLISECONDS;
server.requestTimeout = REQUEST_TIMEOUT_MILLISECONDS;
server.timeout = RESPONSE_TIMEOUT_MILLISECONDS;
server.keepAliveTimeout = 1;
server.maxRequestsPerSocket = 1;

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearSnapshotCache();
  server.close(() => {
    removeOwnedSocket();
    boundSocketIdentity = undefined;
    process.exit(exitCode);
  });
}

server.once('error', () => {
  clearSnapshotCache();
  removeOwnedSocket();
  process.exitCode = 1;
});

function start() {
  process.umask(0o077);
  try {
    requireOwnerOnlyPath(OBSERVATORY_DIRECTORY, true);
    requireSocketPathFits();
    requireAbsentSocket();
  } catch {
    process.stderr.write('Warpkeep QA broker failed closed.\n');
    process.exitCode = 1;
    return;
  }
  server.listen(SOCKET_PATH, () => {
    try {
      chmodSync(SOCKET_PATH, 0o600);
      boundSocketIdentity = requireSocketBoundary();
      process.stdout.write('Warpkeep QA broker listening on an owner-private local socket.\n');
    } catch {
      shutdown(1);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

start();
