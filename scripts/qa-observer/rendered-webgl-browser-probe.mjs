import { spawn } from 'node:child_process';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseRenderedWebglQaObservation,
  RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS,
  RENDERED_WEBGL_QA_ROUTE,
  renderedWebglQaUrl,
} from './rendered-webgl-qa-contract.mjs';

export const RENDERED_WEBGL_QA_CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const CHROME_STARTUP_TIMEOUT_MILLISECONDS = 15_000;
const CASE_TIMEOUT_MILLISECONDS = RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS + 5_000;
const CDP_COMMAND_TIMEOUT_MILLISECONDS = 10_000;
const HTTP_RESPONSE_MAXIMUM_BYTES = 256 * 1_024;
const TERMINATION_GRACE_MILLISECONDS = 2_000;

function exactPort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError('Invalid rendered WebGL QA loopback port.');
  }
  return value;
}

function exactPrivateDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new TypeError('Invalid private Chrome profile directory.');
  }
  return value;
}

/**
 * The fourth case deliberately uses a rejected fixture query. The browser page
 * must fail it closed to balanced; no caller can supply a route, origin, or
 * arbitrary query string.
 */
export function renderedWebglBrowserProbeCases(port) {
  const selectedPort = exactPort(port);
  const origin = `http://127.0.0.1:${selectedPort}`;
  return Object.freeze([
    Object.freeze({
      id: 'high',
      expectedQuality: 'high',
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'high' }),
    }),
    Object.freeze({
      id: 'balanced',
      expectedQuality: 'balanced',
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
    }),
    Object.freeze({
      id: 'reduced',
      expectedQuality: 'reduced',
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'reduced' }),
    }),
    Object.freeze({
      id: 'invalid-fallback',
      expectedQuality: 'balanced',
      url: `${origin}${RENDERED_WEBGL_QA_ROUTE}?quality=invalid`,
    }),
  ]);
}

/**
 * A fixed executable and fresh explicit profile keep this process independent
 * of the signed-in browser, extensions, saved credentials, Keychain, and user
 * preferences. Flags suppress Chrome-owned background network features; CDP
 * additionally blocks every page request outside the exact loopback origin.
 */
export function headlessChromeProbeContract(profileDirectory) {
  const profile = exactPrivateDirectory(profileDirectory);
  return Object.freeze({
    executable: RENDERED_WEBGL_QA_CHROME,
    args: Object.freeze([
      '--headless=new',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--disable-background-networking',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-extensions',
      '--disable-field-trial-config',
      '--disable-features=AutofillServerCommunication,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions,MediaRouter,OptimizationHints,Translate',
      '--disable-search-engine-choice-screen',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-proxy-server',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--password-store=basic',
      '--safebrowsing-disable-auto-update',
      '--use-mock-keychain',
      '--window-size=1440,900',
      'about:blank',
    ]),
    options: Object.freeze({
      cwd: REPOSITORY_ROOT,
      detached: true,
      env: Object.freeze({
        HOME: profile,
        LANG: 'en_US.UTF-8',
        PATH: '/usr/bin:/bin',
        TMPDIR: profile,
      }),
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    }),
  });
}

export function spawnHeadlessChromeProbe(profileDirectory, options = {}) {
  const contract = headlessChromeProbeContract(profileDirectory);
  const spawnProcess = options.spawnProcess ?? spawn;
  return spawnProcess(contract.executable, [...contract.args], { ...contract.options });
}

export function parseDevtoolsActivePort(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1_024) {
    throw new TypeError('Invalid Chrome DevTools endpoint.');
  }
  const lines = value.trimEnd().split('\n');
  if (
    lines.length !== 2
    || !/^\d{1,5}$/.test(lines[0] ?? '')
    || !/^\/devtools\/browser\/[A-Za-z0-9-]{1,128}$/.test(lines[1] ?? '')
  ) throw new TypeError('Invalid Chrome DevTools endpoint.');
  return Object.freeze({
    port: exactPort(Number(lines[0])),
    browserPath: lines[1],
  });
}

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(message);
  return value;
}

export function selectBlankPageTarget(value, devtoolsPort) {
  const selectedPort = exactPort(devtoolsPort);
  if (!Array.isArray(value) || value.length > 16) {
    throw new TypeError('Invalid Chrome DevTools target list.');
  }
  const candidates = value.filter((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
    return entry.type === 'page' && entry.url === 'about:blank';
  });
  if (candidates.length !== 1) throw new TypeError('Invalid Chrome DevTools target list.');
  const candidate = exactRecord(candidates[0], 'Invalid Chrome DevTools page target.');
  if (
    typeof candidate.id !== 'string'
    || !/^[A-Za-z0-9-]{1,256}$/.test(candidate.id)
    || typeof candidate.webSocketDebuggerUrl !== 'string'
  ) {
    throw new TypeError('Invalid Chrome DevTools page target.');
  }
  const endpoint = new URL(candidate.webSocketDebuggerUrl);
  if (
    endpoint.protocol !== 'ws:'
    || !['127.0.0.1', 'localhost'].includes(endpoint.hostname)
    || Number(endpoint.port) !== selectedPort
    || !/^\/devtools\/page\/[A-Za-z0-9-]{1,256}$/.test(endpoint.pathname)
    || endpoint.search
    || endpoint.hash
    || endpoint.username
    || endpoint.password
    || endpoint.pathname !== `/devtools/page/${candidate.id}`
  ) throw new TypeError('Invalid Chrome DevTools page target.');
  endpoint.hostname = '127.0.0.1';
  return Object.freeze({
    targetId: candidate.id,
    webSocketDebuggerUrl: endpoint.toString(),
  });
}

export function isAllowedRenderedWebglPageUrl(value, loopbackOrigin) {
  if (typeof value !== 'string') return false;
  let url;
  let origin;
  try {
    url = new URL(value);
    origin = new URL(loopbackOrigin);
  } catch {
    return false;
  }
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port) return false;
  if (url.protocol === 'blob:') return url.origin === loopbackOrigin;
  return !url.username
    && !url.password
    && url.hostname === '127.0.0.1'
    && url.port === origin.port
    && (url.protocol === 'http:' || url.protocol === 'ws:');
}

export function parseRenderedWebglBrowserDom(value, expected) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL browser DOM.');
  const keys = Object.keys(candidate).sort();
  const expectedKeys = [
    'castleCount',
    'fixture',
    'href',
    'mapRenderer',
    'quality',
    'readyAfterMilliseconds',
    'renderer',
    'status',
  ];
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || candidate.href !== expected.url
    || candidate.status !== 'ready'
    || candidate.mapRenderer !== 'webgl'
    || candidate.quality !== expected.expectedQuality
  ) throw new TypeError('Invalid rendered WebGL browser DOM.');
  return parseRenderedWebglQaObservation({
    version: 1,
    fixture: candidate.fixture,
    renderer: candidate.renderer,
    quality: candidate.quality,
    castleCount: candidate.castleCount,
    readyAfterMilliseconds: candidate.readyAfterMilliseconds,
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function readBoundedHttpJson(port, path, timeoutMilliseconds = 2_000) {
  exactPort(port);
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError('Invalid Chrome DevTools path.');
  }
  return new Promise((resolveJson, rejectJson) => {
    let settled = false;
    let response;
    let timeout;
    let total = 0;
    const chunks = [];
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { Accept: 'application/json' },
      agent: false,
    }, (incoming) => {
      response = incoming;
      if (incoming.statusCode !== 200) {
        incoming.destroy();
        finish(() => rejectJson(new Error('Chrome DevTools endpoint rejected the request.')));
        return;
      }
      incoming.on('data', (chunk) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > HTTP_RESPONSE_MAXIMUM_BYTES) {
          incoming.destroy();
          finish(() => rejectJson(new Error('Chrome DevTools response exceeded its bound.')));
          return;
        }
        chunks.push(bytes);
      });
      incoming.once('error', () => finish(() => rejectJson(new Error('Chrome DevTools response failed.'))));
      incoming.once('end', () => finish(() => {
        try {
          resolveJson(JSON.parse(Buffer.concat(chunks, total).toString('utf8')));
        } catch {
          rejectJson(new Error('Chrome DevTools returned invalid JSON.'));
        }
      }));
    });
    timeout = setTimeout(() => {
      request.destroy();
      response?.destroy();
      finish(() => rejectJson(new Error('Chrome DevTools request timed out.')));
    }, timeoutMilliseconds);
    request.once('error', () => finish(() => rejectJson(new Error('Chrome DevTools is unavailable.'))));
    request.end();
  });
}

async function waitForDevtoolsEndpoint(profileDirectory, child) {
  const endpointPath = join(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + CHROME_STARTUP_TIMEOUT_MILLISECONDS;
  let spawnFailed = false;
  const recordSpawnFailure = () => {
    spawnFailed = true;
  };
  child.once('error', recordSpawnFailure);
  try {
    while (Date.now() < deadline) {
      if (spawnFailed || child.exitCode !== null || child.signalCode !== null) {
        throw new Error('Headless Chrome exited before its private endpoint was ready.');
      }
      try {
        return parseDevtoolsActivePort(await readFile(endpointPath, 'utf8'));
      } catch (error) {
        if (error?.code !== 'ENOENT' && !(error instanceof TypeError)) throw error;
      }
      await delay(50);
    }
  } finally {
    child.off('error', recordSpawnFailure);
  }
  throw new Error('Headless Chrome startup timed out.');
}

class DevtoolsSession {
  #nextId = 1;
  #pending = new Map();
  #socket;
  #eventHandler;

  constructor(endpoint, eventHandler) {
    this.#eventHandler = eventHandler;
    this.#socket = new WebSocket(endpoint);
  }

  async open(timeoutMilliseconds = CDP_COMMAND_TIMEOUT_MILLISECONDS) {
    if (this.#socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(() => {
        cleanup();
        rejectOpen(new Error('Chrome DevTools WebSocket timed out.'));
      }, timeoutMilliseconds);
      const cleanup = () => {
        clearTimeout(timeout);
        this.#socket.removeEventListener('open', opened);
        this.#socket.removeEventListener('error', failed);
      };
      const opened = () => {
        cleanup();
        this.#socket.addEventListener('message', (event) => this.#receive(event.data));
        this.#socket.addEventListener('close', () => this.#rejectPending());
        resolveOpen();
      };
      const failed = () => {
        cleanup();
        rejectOpen(new Error('Chrome DevTools WebSocket failed.'));
      };
      this.#socket.addEventListener('open', opened);
      this.#socket.addEventListener('error', failed);
    });
  }

  #rejectPending() {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Chrome DevTools WebSocket closed.'));
    }
    this.#pending.clear();
  }

  #receive(data) {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      this.#rejectPending();
      this.close();
      return;
    }
    if (Number.isSafeInteger(message?.id)) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error('Chrome DevTools command failed.'));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (typeof message?.method === 'string') {
      try {
        this.#eventHandler(message.method, message.params ?? {}, this);
      } catch {
        this.close();
      }
    }
  }

  command(method, params = {}, timeoutMilliseconds = CDP_COMMAND_TIMEOUT_MILLISECONDS) {
    if (this.#socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Chrome DevTools WebSocket is unavailable.'));
    }
    const id = this.#nextId++;
    return new Promise((resolveCommand, rejectCommand) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        rejectCommand(new Error('Chrome DevTools command timed out.'));
      }, timeoutMilliseconds);
      this.#pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timeout });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.#socket.close();
    } catch {
      // A closed disposable endpoint needs no further action.
    }
    this.#rejectPending();
  }
}

function terminateProcessGroup(child, signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // An exited disposable browser needs no further action.
    }
  }
}

async function terminateChrome(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolveClose) => child.once('close', resolveClose));
  terminateProcessGroup(child, 'SIGTERM');
  await Promise.race([closed, delay(TERMINATION_GRACE_MILLISECONDS)]);
  if (child.exitCode === null && child.signalCode === null) {
    terminateProcessGroup(child, 'SIGKILL');
    await Promise.race([closed, delay(TERMINATION_GRACE_MILLISECONDS)]);
  }
}

async function createLoopbackViteServer() {
  let vite;
  let expectedHost;
  const httpServer = createHttpServer((request, response) => {
    const remoteAddress = request.socket.remoteAddress;
    if (
      !['127.0.0.1', '::ffff:127.0.0.1'].includes(remoteAddress ?? '')
      || request.headers.host !== expectedHost
      || !['GET', 'HEAD'].includes(request.method ?? '')
      || typeof request.url !== 'string'
      || request.url.startsWith('//')
    ) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden\n');
      return;
    }
    if (!vite) {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Unavailable\n');
      return;
    }
    vite.middlewares(request, response, () => {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not Found\n');
    });
  });
  httpServer.on('upgrade', (request, socket) => {
    if (
      !['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
      || request.headers.host !== expectedHost
    ) socket.destroy();
  });
  httpServer.maxHeadersCount = 32;
  httpServer.headersTimeout = 5_000;
  httpServer.requestTimeout = CASE_TIMEOUT_MILLISECONDS;
  await new Promise((resolveListen, rejectListen) => {
    const failed = (error) => {
      httpServer.off('listening', listening);
      rejectListen(error);
    };
    const listening = () => {
      httpServer.off('error', failed);
      resolveListen();
    };
    httpServer.once('error', failed);
    httpServer.once('listening', listening);
    httpServer.listen({ host: '127.0.0.1', port: 0, exclusive: true });
  });
  const address = httpServer.address();
  if (address === null || typeof address === 'string' || address.address !== '127.0.0.1') {
    httpServer.closeAllConnections();
    await new Promise((resolveClose) => httpServer.close(() => resolveClose()));
    throw new Error('Vite did not bind the exact loopback interface.');
  }
  expectedHost = `127.0.0.1:${exactPort(address.port)}`;
  try {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      root: REPOSITORY_ROOT,
      appType: 'spa',
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        middlewareMode: true,
        port: address.port,
        strictPort: true,
        hmr: {
          clientPort: address.port,
          host: '127.0.0.1',
          port: address.port,
          server: httpServer,
        },
      },
    });
  } catch (error) {
    httpServer.closeAllConnections();
    await new Promise((resolveClose) => httpServer.close(() => resolveClose()));
    throw error;
  }
  return Object.freeze({
    port: address.port,
    async close() {
      httpServer.closeAllConnections();
      await Promise.allSettled([
        new Promise((resolveClose) => httpServer.close(() => resolveClose())),
        vite.close(),
      ]);
    },
  });
}

const READ_DOM_EXPRESSION = `(() => {
  const overlay = document.querySelector('[data-rendered-webgl-status]');
  const map = document.querySelector('.realm-map-screen');
  const integer = (value) => /^\\d+$/.test(value ?? '') ? Number(value) : null;
  return {
    href: location.href,
    status: overlay?.getAttribute('data-rendered-webgl-status') ?? null,
    renderer: overlay?.getAttribute('data-renderer') ?? null,
    mapRenderer: map?.getAttribute('data-renderer') ?? null,
    fixture: overlay?.getAttribute('data-fixture') ?? null,
    quality: overlay?.getAttribute('data-quality') ?? null,
    castleCount: integer(overlay?.getAttribute('data-castle-count')),
    readyAfterMilliseconds: integer(overlay?.getAttribute('data-ready-after-ms')),
  };
})()`;

async function waitForRenderedCase(session, probeCase, state) {
  await session.command('Page.navigate', { url: probeCase.url });
  const deadline = Date.now() + CASE_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    if (state.violation) throw new Error('Headless browser left the local QA boundary.');
    const evaluation = await session.command('Runtime.evaluate', {
      expression: READ_DOM_EXPRESSION,
      returnByValue: true,
    });
    if (evaluation?.exceptionDetails || !evaluation?.result || evaluation.result.type !== 'object') {
      throw new Error('Headless browser DOM evaluation failed.');
    }
    const value = evaluation.result.value;
    if (value?.href === probeCase.url) {
      if (['fallback', 'error', 'closed'].includes(value.status)) {
        throw new Error('Rendered WebGL QA failed closed.');
      }
      if (value.status === 'ready') {
        parseRenderedWebglBrowserDom(value, probeCase);
        return;
      }
    }
    await delay(100);
  }
  throw new Error('Rendered WebGL QA case timed out.');
}

export async function runRenderedWebglBrowserProbe() {
  const chromeMetadata = await lstat(RENDERED_WEBGL_QA_CHROME);
  if (!chromeMetadata.isFile() || chromeMetadata.isSymbolicLink()) {
    throw new Error('The reviewed Google Chrome executable is unavailable.');
  }
  const temporaryProfileDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-webgl-qa-'));

  let chrome;
  let devtools;
  let vite;
  try {
    const profileMetadata = await lstat(temporaryProfileDirectory);
    const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    if (
      !profileMetadata.isDirectory()
      || profileMetadata.isSymbolicLink()
      || (expectedUid !== undefined && profileMetadata.uid !== expectedUid)
    ) throw new Error('The disposable Chrome profile path is unsafe.');
    const profileDirectory = await realpath(temporaryProfileDirectory);
    await chmod(profileDirectory, 0o700);
    vite = await createLoopbackViteServer();
    const cases = renderedWebglBrowserProbeCases(vite.port);
    const loopbackOrigin = `http://127.0.0.1:${vite.port}`;
    chrome = spawnHeadlessChromeProbe(profileDirectory);
    const endpoint = await waitForDevtoolsEndpoint(profileDirectory, chrome);
    const targets = await readBoundedHttpJson(endpoint.port, '/json/list');
    const target = selectBlankPageTarget(targets, endpoint.port);
    const state = {
      violation: '',
      allowedUrls: new Set(cases.map((probeCase) => probeCase.url)),
      targetId: target.targetId,
    };
    devtools = new DevtoolsSession(target.webSocketDebuggerUrl, (method, params, session) => {
      if (method === 'Fetch.requestPaused') {
        const requestUrl = params?.request?.url;
        if (isAllowedRenderedWebglPageUrl(requestUrl, loopbackOrigin)) {
          void session.command('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {
            state.violation = 'fetch-continue';
          });
        } else {
          state.violation = 'fetch';
          void session.command('Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'BlockedByClient',
          }).catch(() => {});
        }
        return;
      }
      if (method === 'Page.frameNavigated' && !params?.frame?.parentId) {
        const url = params?.frame?.url;
        if (url !== 'about:blank' && !state.allowedUrls.has(url)) {
          state.violation = 'navigation';
        }
        return;
      }
      if (method === 'Page.windowOpen' || method === 'Page.downloadWillBegin') {
        state.violation = 'page-side-effect';
        return;
      }
      if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
        const targetInfo = params?.targetInfo;
        if (
          targetInfo?.targetId !== state.targetId
          || targetInfo?.type !== 'page'
          || (
            targetInfo.url !== 'about:blank'
            && !state.allowedUrls.has(targetInfo.url)
          )
        ) state.violation = 'target';
        return;
      }
      if (method === 'Network.requestWillBeSent') {
        const url = params?.request?.url;
        if (!isAllowedRenderedWebglPageUrl(url, loopbackOrigin)) {
          state.violation = 'network';
        }
        return;
      }
      if (method === 'Network.webSocketCreated') {
        if (!isAllowedRenderedWebglPageUrl(params?.url, loopbackOrigin)) {
          state.violation = 'websocket';
        }
      }
    });
    await devtools.open();
    await Promise.all([
      devtools.command('Page.enable'),
      devtools.command('Runtime.enable'),
      devtools.command('Network.enable'),
      devtools.command('Page.setDownloadBehavior', { behavior: 'deny' }),
      devtools.command('Target.setDiscoverTargets', {
        discover: true,
        filter: [{ type: 'page', exclude: false }, { exclude: true }],
      }),
      devtools.command('Fetch.enable', {
        patterns: [{ urlPattern: '*', requestStage: 'Request' }],
      }),
    ]);
    for (const probeCase of cases) {
      await waitForRenderedCase(devtools, probeCase, state);
    }
    if (state.violation) throw new Error('Headless browser left the local QA boundary.');
  } finally {
    devtools?.close();
    await terminateChrome(chrome);
    await vite?.close();
    await rm(temporaryProfileDirectory, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.length !== 2) {
    process.stderr.write('Usage: rendered-webgl-browser-probe\n');
    process.exitCode = 64;
    return;
  }
  try {
    await runRenderedWebglBrowserProbe();
    process.stdout.write('Warpkeep rendered WebGL QA passed: 4 synthetic loopback cases.\n');
  } catch {
    process.stderr.write('Warpkeep rendered WebGL QA failed closed.\n');
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) void main();
