import { spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseQaObserverSnapshot } from './observer-snapshot.mjs';

const HOST = '127.0.0.1';
const PORT = 41731;
const MAX_HELPER_BYTES = 256 * 1024;
// The helper performs two bounded HTTPS exchanges (challenge, then snapshot).
// Keep the broker above their combined 20-second ceiling without making it
// unbounded or changing the 60-second challenge lifetime.
const HELPER_TIMEOUT_MILLISECONDS = 25_000;
const CACHE_TTL_MILLISECONDS = 30_000;
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
const helperPath = join(
  homedir(),
  'Library',
  'Application Support',
  'Warpkeep',
  'qa-observatory',
  'bin',
  'warpkeep-qa-device',
);

let cachedSnapshot;
let cachedAt = 0;
let cacheExpiryTimer;
let activeRead;

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
  requireOwnerOnlyPath(dirname(helperPath), true);
  requireOwnerOnlyPath(helperPath);
}

function safeHeaders(origin) {
  return {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'cross-origin-resource-policy': 'same-site',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    ...(origin ? {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET',
      vary: 'Origin',
    } : {}),
  };
}

function sendJson(response, status, value, origin) {
  const bytes = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    ...safeHeaders(origin),
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(bytes.byteLength),
  });
  response.end(bytes);
}

function validOrigin(request) {
  const origin = request.headers.origin;
  return typeof origin === 'string' && ALLOWED_ORIGINS.has(origin) ? origin : undefined;
}

function runHelper() {
  return new Promise((resolve, reject) => {
    try {
      requireHelperBoundary();
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

const server = createServer(async (request, response) => {
  const origin = validOrigin(request);
  let url;
  try {
    url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);
  } catch {
    sendJson(response, 400, { error: 'invalid_request' }, undefined);
    return;
  }
  if (
    request.headers.host !== `${HOST}:${PORT}`
    || request.method !== 'GET'
    || url.search !== ''
    || url.hash !== ''
    || (url.pathname !== '/healthz' && url.pathname !== '/snapshot')
  ) {
    sendJson(response, 404, { error: 'not_found' }, undefined);
    return;
  }
  if (url.pathname === '/healthz') {
    sendJson(response, 200, { ok: true, mode: 'read-only' }, origin);
    return;
  }
  if (!origin) {
    sendJson(response, 403, { error: 'origin_not_allowed' }, undefined);
    return;
  }
  try {
    sendJson(response, 200, await readSnapshot(), origin);
  } catch {
    sendJson(response, 503, { error: 'snapshot_unavailable' }, origin);
  }
});

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  if (!address || typeof address === 'string' || address.address !== HOST || address.port !== PORT) {
    server.close();
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Warpkeep QA broker listening on http://${HOST}:${PORT}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearSnapshotCache();
    server.close(() => process.exit(0));
  });
}
