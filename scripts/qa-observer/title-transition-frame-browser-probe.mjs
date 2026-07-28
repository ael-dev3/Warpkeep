import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import {
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DevtoolsPipeSession,
  attestStableHeadlessChromeExecutable,
  cleanupRenderedWebglProbeResources,
  exactChromeExecutableIdentity,
  readReviewedChromeExecutableIdentity,
  selectBlankPageTarget,
  spawnHeadlessChromeProbe,
} from './rendered-webgl-browser-probe.mjs';
import {
  TITLE_TRANSITION_FRAME_MAXIMUM_BYTES,
  analyzeTitleGatewayVisualFrame,
  analyzeTitleTransitionFirstVisibleFrame,
  analyzeTitleTransitionFramePair,
  readTitleTransitionPngDimensions,
} from './title-transition-frame-analysis.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const PRODUCTION_DIST_DIRECTORY = join(REPOSITORY_ROOT, 'dist');
const TITLE_TRANSITION_ARTIFACT_ROOT = join(
  REPOSITORY_ROOT,
  '.cache',
  'warpkeep-qa',
  'title-transition',
);
const TITLE_TRANSITION_TIMEOUT_MILLISECONDS = 125_000;
const TITLE_TRANSITION_STABLE_TIMEOUT_MILLISECONDS = 15_000;
const TITLE_TRANSITION_SCREENSHOT_OFFSETS = Object.freeze([
  Object.freeze({ label: 'activation', milliseconds: 0 }),
  Object.freeze({ label: 'plus-100ms', milliseconds: 100 }),
  Object.freeze({ label: 'plus-300ms', milliseconds: 300 }),
  Object.freeze({ label: 'plus-700ms', milliseconds: 700 }),
  Object.freeze({ label: 'plus-1200ms', milliseconds: 1_200 }),
]);
const TITLE_TRANSITION_OWNER_CYCLE_INPUTS = Object.freeze([
  'pointer',
  'pointer',
]);
const MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const OWNER_HALF_RENDERER_STRESS = Object.freeze({
  heightFraction: 0.5,
  left: 0,
  scaleX: 2,
  scaleY: 2,
  top: 0,
  widthFraction: 0.5,
});

const OWNER_HALF_OVERLAY_STRESS = Object.freeze({
  heightViewportPercent: 200,
  scaleX: 0.5,
  scaleY: 0.5,
  widthViewportPercent: 200,
});

export const TITLE_TRANSITION_FRAME_CASES = Object.freeze([
  Object.freeze({
    cycles: 3,
    deviceScaleFactor: 1,
    id: 'owner-full-hd-half-renderer-repeated',
    input: 'pointer',
    mobile: false,
    overlayStress: OWNER_HALF_OVERLAY_STRESS,
    reducedMotion: false,
    shellStress: OWNER_HALF_RENDERER_STRESS,
    viewport: Object.freeze({ height: 1_080, width: 1_920 }),
    zoomPercent: 100,
  }),
  Object.freeze({
    cycles: 1,
    deviceScaleFactor: 1.5,
    id: 'desktop-offset-scaled-keyboard',
    input: 'keyboard',
    mobile: false,
    reducedMotion: false,
    shellStress: Object.freeze({
      heightFraction: 0.72,
      left: 72,
      scaleX: 1.22,
      scaleY: 1.18,
      top: 42,
      widthFraction: 0.72,
    }),
    viewport: Object.freeze({ height: 900, width: 1_440 }),
    zoomPercent: 80,
  }),
  Object.freeze({
    cycles: 1,
    deviceScaleFactor: 3,
    id: 'mobile-portrait-touch',
    input: 'touch',
    mobile: true,
    reducedMotion: false,
    viewport: Object.freeze({ height: 844, width: 390 }),
    zoomPercent: 100,
  }),
  Object.freeze({
    cycles: 1,
    deviceScaleFactor: 2,
    id: 'short-landscape-touch',
    input: 'touch',
    mobile: true,
    reducedMotion: false,
    viewport: Object.freeze({ height: 375, width: 667 }),
    zoomPercent: 100,
  }),
  Object.freeze({
    cycles: 1,
    deviceScaleFactor: 1,
    id: 'desktop-mid-transition-resize-pointer',
    input: 'pointer',
    midTransitionViewport: Object.freeze({ height: 768, width: 1_024 }),
    mobile: false,
    reducedMotion: false,
    viewport: Object.freeze({ height: 900, width: 1_440 }),
    zoomPercent: 125,
  }),
  Object.freeze({
    cycles: 1,
    deviceScaleFactor: 1,
    id: 'desktop-reduced-keyboard',
    input: 'keyboard',
    mobile: false,
    reducedMotion: true,
    viewport: Object.freeze({ height: 900, width: 1_440 }),
    zoomPercent: 150,
  }),
]);

export class TitleTransitionFrameBrowserError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'TitleTransitionFrameBrowserError';
  }
}

export function titleTransitionBrowserZoomLevel(zoomPercent) {
  if (
    ![80, 100, 125, 150].includes(zoomPercent)
    || !Number.isSafeInteger(zoomPercent)
  ) throw new TypeError('Invalid title transition browser zoom.');
  return Math.log(zoomPercent / 100) / Math.log(1.2);
}

export function titleTransitionCssViewport(viewport, zoomPercent) {
  if (
    viewport === null
    || typeof viewport !== 'object'
    || Array.isArray(viewport)
    || !Number.isSafeInteger(viewport.width)
    || viewport.width <= 0
    || !Number.isSafeInteger(viewport.height)
    || viewport.height <= 0
  ) throw new TypeError('Invalid title transition device viewport.');
  const zoom = zoomPercent / 100;
  if (
    ![80, 100, 125, 150].includes(zoomPercent)
    || !Number.isFinite(zoom)
  ) throw new TypeError('Invalid title transition browser zoom.');
  return Object.freeze({
    height: viewport.height / zoom,
    width: viewport.width / zoom,
  });
}

async function prepareChromeProfile(profileDirectory, zoomPercent) {
  const profileMetadata = await lstat(profileDirectory);
  if (!isPrivateDirectoryMetadata(profileMetadata)) {
    throw new TitleTransitionFrameBrowserError(
      'Title transition Chrome profile was unsafe.',
    );
  }
  const defaultProfile = join(profileDirectory, 'Default');
  await mkdir(defaultProfile, { mode: 0o700 });
  const preferences = Object.freeze({
    partition: Object.freeze({
      default_zoom_level: Object.freeze({
        // Chromium's current empty/default StoragePartition key. The value is
        // a browser page-zoom level, not a DevTools pinch/page-scale override.
        x: titleTransitionBrowserZoomLevel(zoomPercent),
      }),
    }),
  });
  await writeFile(
    join(defaultProfile, 'Preferences'),
    `${JSON.stringify(preferences)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isPrivateDirectoryMetadata(metadata) {
  const expectedUid = typeof process.getuid === 'function'
    ? process.getuid()
    : undefined;
  return metadata.isDirectory()
    && !metadata.isSymbolicLink()
    && (expectedUid === undefined || metadata.uid === expectedUid);
}

async function ensurePrivateDirectory(directory) {
  let metadata;
  try {
    metadata = await lstat(directory);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(directory, { mode: 0o700 });
    metadata = await lstat(directory);
  }
  if (!isPrivateDirectoryMetadata(metadata)) {
    throw new TitleTransitionFrameBrowserError(
      'Title transition artifact directory was unsafe.',
    );
  }
  await chmod(directory, 0o700);
  return realpath(directory);
}

export async function createTitleTransitionArtifactDirectory(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('Invalid title transition artifact time.');
  }
  const cacheDirectory = await ensurePrivateDirectory(join(REPOSITORY_ROOT, '.cache'));
  const warpkeepQaDirectory = await ensurePrivateDirectory(
    join(cacheDirectory, 'warpkeep-qa'),
  );
  const transitionDirectory = await ensurePrivateDirectory(
    join(warpkeepQaDirectory, 'title-transition'),
  );
  if (transitionDirectory !== await realpath(TITLE_TRANSITION_ARTIFACT_ROOT)) {
    throw new TitleTransitionFrameBrowserError(
      'Title transition artifact root mismatched.',
    );
  }
  const runId = `${now.toISOString().replaceAll(/[^0-9A-Za-z]/g, '')}-${process.pid}`;
  if (!/^[0-9A-Za-z-]{12,64}$/u.test(runId)) {
    throw new TitleTransitionFrameBrowserError(
      'Title transition artifact identifier was invalid.',
    );
  }
  const runDirectory = join(transitionDirectory, runId);
  await mkdir(runDirectory, { mode: 0o700 });
  const metadata = await lstat(runDirectory);
  if (!isPrivateDirectoryMetadata(metadata)) {
    throw new TitleTransitionFrameBrowserError(
      'Title transition artifact run directory was unsafe.',
    );
  }
  await chmod(runDirectory, 0o700);
  return realpath(runDirectory);
}

function exactLoopbackOrigin(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:'
      && url.hostname === '127.0.0.1'
      && url.port !== ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
      && url.username === ''
      && url.password === ''
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

export function isAllowedTitleTransitionBrowserUrl(value, loopbackOrigin) {
  const expectedOrigin = exactLoopbackOrigin(loopbackOrigin);
  if (!expectedOrigin || typeof value !== 'string') return false;
  if (value === 'about:blank') return true;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'data:') {
    return value.startsWith('data:image/') || value.startsWith('data:font/');
  }
  if (url.protocol === 'blob:') return url.origin === expectedOrigin;
  return url.protocol === 'http:'
    && url.origin === expectedOrigin
    && url.hostname === '127.0.0.1'
    && url.username === ''
    && url.password === '';
}

export function productionAssetRelativePath(requestUrl) {
  if (
    typeof requestUrl !== 'string'
    || requestUrl.startsWith('//')
    || requestUrl.includes('%')
    || requestUrl.includes('\\')
  ) return undefined;
  let url;
  try {
    url = new URL(requestUrl, 'http://127.0.0.1');
  } catch {
    return undefined;
  }
  if (
    url.origin !== 'http://127.0.0.1'
    || url.search !== ''
    || url.hash !== ''
    || url.pathname.includes('%')
    || url.pathname.includes('\\')
  ) return undefined;
  if (url.pathname === '/') return 'index.html';
  const segments = url.pathname.split('/').slice(1);
  if (
    segments.length === 0
    || segments.some((segment) => (
      segment === ''
      || segment === '.'
      || segment === '..'
      || !/^[0-9A-Za-z._~-]+$/u.test(segment)
    ))
  ) return undefined;
  return segments.join('/');
}

export async function createProductionDistLoopbackServer(
  distDirectory = PRODUCTION_DIST_DIRECTORY,
) {
  const requestedDist = resolve(distDirectory);
  const distMetadata = await lstat(requestedDist);
  if (!isPrivateDirectoryMetadata(distMetadata)) {
    throw new TitleTransitionFrameBrowserError(
      'Production dist directory was unsafe.',
    );
  }
  const distRoot = await realpath(requestedDist);
  let expectedHost;
  const sockets = new Set();
  const httpServer = createHttpServer((request, response) => {
    void (async () => {
      const remoteAddress = request.socket.remoteAddress;
      if (
        !['127.0.0.1', '::ffff:127.0.0.1'].includes(remoteAddress ?? '')
        || request.headers.host !== expectedHost
        || !['GET', 'HEAD'].includes(request.method ?? '')
      ) {
        response.writeHead(403, {
          'content-type': 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
        });
        response.end('Forbidden\n');
        return;
      }
      const relativeAsset = productionAssetRelativePath(request.url);
      if (!relativeAsset) {
        response.writeHead(404, {
          'content-type': 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
        });
        response.end('Not Found\n');
        return;
      }
      const candidate = resolve(distRoot, relativeAsset);
      const relativeCandidate = relative(distRoot, candidate);
      if (
        relativeCandidate === ''
        || relativeCandidate.startsWith(`..${sep}`)
        || relativeCandidate === '..'
      ) {
        response.writeHead(404, {
          'content-type': 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
        });
        response.end('Not Found\n');
        return;
      }
      let metadata;
      let assetPath;
      try {
        metadata = await lstat(candidate);
        if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error();
        assetPath = await realpath(candidate);
        const assetRelative = relative(distRoot, assetPath);
        if (
          assetRelative.startsWith(`..${sep}`)
          || assetRelative === '..'
          || assetRelative === ''
        ) throw new Error();
      } catch {
        response.writeHead(404, {
          'content-type': 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
        });
        response.end('Not Found\n');
        return;
      }
      const contentType = MIME_TYPES.get(extname(assetPath).toLowerCase())
        ?? 'application/octet-stream';
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': metadata.size,
        'content-type': contentType,
        'cross-origin-resource-policy': 'same-origin',
        'x-content-type-options': 'nosniff',
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(assetPath);
      stream.once('error', () => response.destroy());
      stream.pipe(response);
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  httpServer.maxHeadersCount = 32;
  httpServer.headersTimeout = 5_000;
  httpServer.requestTimeout = TITLE_TRANSITION_TIMEOUT_MILLISECONDS;
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
    httpServer.listen({ exclusive: true, host: '127.0.0.1', port: 0 });
  });
  const address = httpServer.address();
  if (
    address === null
    || typeof address === 'string'
    || address.address !== '127.0.0.1'
    || !Number.isSafeInteger(address.port)
    || address.port < 1
    || address.port > 65_535
  ) throw new TitleTransitionFrameBrowserError(
    'Production dist server did not bind exact loopback.',
  );
  expectedHost = `127.0.0.1:${address.port}`;
  let closed = false;
  return Object.freeze({
    close: async () => {
      if (closed) return;
      closed = true;
      const completion = new Promise((resolveClose, rejectClose) => {
        httpServer.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
      httpServer.closeAllConnections();
      for (const socket of sockets) socket.destroy();
      await completion;
    },
    origin: `http://${expectedHost}`,
    port: address.port,
  });
}

function titleStressInjectionSource(probeCase) {
  const stress = probeCase.shellStress;
  const shellCss = stress
    ? `.warpkeep-title-canvas-shell{left:${stress.left}px!important;top:${stress.top}px!important;right:auto!important;bottom:auto!important;width:${stress.widthFraction * 100}%!important;height:${stress.heightFraction * 100}%!important;transform-origin:0 0!important;transform:scale(${stress.scaleX},${stress.scaleY})!important;}`
    : '';
  const overlayStress = probeCase.overlayStress;
  const overlayCss = overlayStress
    ? `.warp-transition-overlay{inset:auto!important;left:0!important;top:0!important;width:${overlayStress.widthViewportPercent}vw!important;height:${overlayStress.heightViewportPercent}vh!important;transform-origin:0 0!important;transform:scale(${overlayStress.scaleX},${overlayStress.scaleY})!important;}`
    : '';
  const isolationCss = 'html.warpkeep-title-transition-pixel-isolation body::before{content:"";position:fixed;inset:0;z-index:99;background:#010207;pointer-events:none;}';
  const css = `${shellCss}${overlayCss}${isolationCss}`;
  return `(() => {
    const css = ${JSON.stringify(css)};
    const install = () => {
      if (document.getElementById('warpkeep-title-transition-stress')) return;
      const style = document.createElement('style');
      style.id = 'warpkeep-title-transition-stress';
      style.textContent = css;
      (document.head || document.documentElement).append(style);
    };
    if (document.documentElement) install();
    else document.addEventListener('DOMContentLoaded', install, { once: true });
  })();`;
}

const PAGE_OBSERVATION_EXPRESSION = `(() => {
  const finite = (value) => {
    const selected = Number(value);
    return Number.isFinite(selected) ? selected : null;
  };
  const rect = (element) => {
    if (!(element instanceof Element)) return null;
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      height: bounds.height,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      width: bounds.width
    };
  };
  const experience = document.querySelector('.warpkeep-experience');
  const root = document.querySelector('#root');
  const titleScreen = document.querySelector('.warpkeep-title-screen');
  const titleLayer = document.querySelector('.warpkeep-experience__screen--title');
  const menuLayer = document.querySelector('.warpkeep-experience__screen--menu');
  const gateway = document.querySelector('.warpkeep-gateway');
  const button = document.querySelector('.warpkeep-gateway-button');
  const shell = document.querySelector('.warpkeep-title-canvas-shell');
  const canvas = document.querySelector('.warpkeep-title-canvas');
  const overlay = document.querySelector('.warp-transition-overlay');
  const overlayStyle = overlay instanceof HTMLElement
    ? getComputedStyle(overlay)
    : null;
  const visualViewport = window.visualViewport;
  const isolationStyle = getComputedStyle(document.body, '::before');
  const buttonBounds = rect(button);
  const active = document.activeElement;
  return {
    activeTarget:
      active === button
        ? 'gateway'
        : active instanceof HTMLButtonElement && active.matches('button[data-command]')
          ? 'menu-command'
          : active instanceof HTMLButtonElement && active.getAttribute('aria-label') === 'Return to Title'
            ? 'return-title'
            : active instanceof HTMLElement
              ? active.tagName.toLowerCase()
              : 'none',
    devicePixelRatio,
    documentReadyState: document.readyState,
    gateway: gateway instanceof HTMLElement ? {
      acceptedPointerX: finite(gateway.dataset.acceptedPointerX),
      acceptedPointerY: finite(gateway.dataset.acceptedPointerY),
      alignmentError: finite(gateway.dataset.alignmentError),
      buttonCenterX: finite(gateway.dataset.buttonCenterX),
      buttonCenterY: finite(gateway.dataset.buttonCenterY),
      buttonRect: buttonBounds,
      clientX: finite(gateway.dataset.clientX),
      clientY: finite(gateway.dataset.clientY),
      frozenClientX: finite(gateway.dataset.frozenClientX),
      frozenClientY: finite(gateway.dataset.frozenClientY),
      interactive: gateway.dataset.interactive === 'true',
      measurementGeneration: finite(gateway.dataset.measurementGeneration),
      ready: gateway.dataset.ready === 'true',
      rendererViewportHeight: finite(gateway.dataset.rendererViewportHeight),
      rendererViewportWidth: finite(gateway.dataset.rendererViewportWidth),
      rendererX: finite(gateway.dataset.rendererX),
      rendererY: finite(gateway.dataset.rendererY),
      sourceHeight: finite(gateway.dataset.sourceHeight),
      sourceLeft: finite(gateway.dataset.sourceLeft),
      sourceTop: finite(gateway.dataset.sourceTop),
      sourceWidth: finite(gateway.dataset.sourceWidth),
      visible: gateway.dataset.visible === 'true'
    } : null,
    hash: location.hash,
    historyLength: history.length,
    menuPresented:
      menuLayer instanceof HTMLElement
      && menuLayer.dataset.presented === 'true'
      && menuLayer.getAttribute('aria-hidden') === 'false'
      && !menuLayer.inert,
    overlay: overlay instanceof HTMLElement ? {
      clientHeight: overlay.clientHeight,
      clientWidth: overlay.clientWidth,
      clientX: finite(overlay.dataset.gatewayClientX),
      clientY: finite(overlay.dataset.gatewayClientY),
      count: document.querySelectorAll('.warp-transition-overlay').length,
      direction: overlay.dataset.direction || '',
      input: overlay.dataset.input || '',
      localX: finite(overlay.dataset.overlayOriginX),
      localY: finite(overlay.dataset.overlayOriginY),
      normalizedU: finite(overlay.dataset.overlayOriginU),
      normalizedV: finite(overlay.dataset.overlayOriginV),
      motion: overlay.dataset.motion || '',
      originReady: overlay.dataset.originReady === 'true',
      originCssX: overlayStyle?.getPropertyValue('--warp-origin-x') || '',
      originCssY: overlayStyle?.getPropertyValue('--warp-origin-y') || '',
      parentBody: overlay.parentElement === document.body,
      rect: rect(overlay),
      sequence: finite(overlay.dataset.transitionSequence),
      visualViewportHeight: finite(overlay.dataset.visualViewportHeight),
      visualViewportOffsetLeft: finite(
        overlay.dataset.visualViewportOffsetLeft
      ),
      visualViewportOffsetTop: finite(
        overlay.dataset.visualViewportOffsetTop
      ),
      visualViewportScale: finite(overlay.dataset.visualViewportScale),
      visualViewportWidth: finite(overlay.dataset.visualViewportWidth),
      visible: overlayStyle?.visibility === 'visible',
      clipPath: overlayStyle?.clipPath || ''
    } : null,
    phase: experience?.getAttribute('data-phase') || '',
    pixelIsolation: {
      active: document.documentElement.classList.contains(
        'warpkeep-title-transition-pixel-isolation'
      ),
      backgroundColor: isolationStyle.backgroundColor,
      content: isolationStyle.content,
      pointerEvents: isolationStyle.pointerEvents,
      position: isolationStyle.position,
      zIndex: isolationStyle.zIndex
    },
    presentedScreen: experience?.getAttribute('data-presented-screen') || '',
    returnPreparing: experience?.getAttribute('data-return-preparing') === 'true',
    sequence: finite(experience?.getAttribute('data-transition-sequence')),
    shell: shell instanceof HTMLElement ? {
      clientHeight: shell.clientHeight,
      clientWidth: shell.clientWidth,
      rect: rect(shell)
    } : null,
    root: root instanceof HTMLElement ? {
      clientHeight: root.clientHeight,
      clientWidth: root.clientWidth,
      rect: rect(root)
    } : null,
    experience: experience instanceof HTMLElement ? {
      clientHeight: experience.clientHeight,
      clientWidth: experience.clientWidth,
      rect: rect(experience)
    } : null,
    canvas: canvas instanceof HTMLCanvasElement ? {
      clientHeight: canvas.clientHeight,
      clientWidth: canvas.clientWidth,
      height: canvas.height,
      rect: rect(canvas),
      webgl: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')),
      width: canvas.width
    } : null,
    titlePhase: titleScreen?.getAttribute('data-title-phase') || '',
    titlePresented:
      titleLayer instanceof HTMLElement
      && titleLayer.dataset.presented === 'true'
      && titleLayer.getAttribute('aria-hidden') === 'false'
      && !titleLayer.inert,
    viewport: { height: innerHeight, width: innerWidth },
    visualViewport: visualViewport ? {
      height: visualViewport.height,
      offsetLeft: visualViewport.offsetLeft,
      offsetTop: visualViewport.offsetTop,
      pageLeft: visualViewport.pageLeft,
      pageTop: visualViewport.pageTop,
      scale: visualViewport.scale,
      width: visualViewport.width
    } : null
  };
})()`;

async function readPageObservation(session) {
  const result = await session.command('Runtime.evaluate', {
    expression: PAGE_OBSERVATION_EXPRESSION,
    returnByValue: true,
  });
  const value = result?.result?.value;
  if (
    result?.exceptionDetails
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) throw new TitleTransitionFrameBrowserError(
    'Title transition page observation failed.',
  );
  return value;
}

async function waitForPageObservation(session, state, predicate, stage) {
  const deadline = Date.now() + TITLE_TRANSITION_STABLE_TIMEOUT_MILLISECONDS;
  let lastObservation;
  while (Date.now() <= deadline) {
    if (state.violation) {
      throw new TitleTransitionFrameBrowserError(
        `Title transition browser boundary failed at ${state.violation}.`,
      );
    }
    lastObservation = await readPageObservation(session);
    if (predicate(lastObservation)) return lastObservation;
    await delay(16);
  }
  throw new TitleTransitionFrameBrowserError(
    `Title transition browser timed out at ${stage}.`,
    { cause: lastObservation },
  );
}

function exactFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TitleTransitionFrameBrowserError(
      `Title transition geometry lacked ${name}.`,
    );
  }
  return value;
}

export function validateTitleGatewayGeometry(observation, probeCase) {
  if (
    observation === null
    || typeof observation !== 'object'
    || Array.isArray(observation)
    || probeCase === null
    || typeof probeCase !== 'object'
    || Array.isArray(probeCase)
  ) throw new TypeError('Invalid title gateway geometry observation.');
  const gateway = observation.gateway;
  const shell = observation.shell;
  const canvas = observation.canvas;
  const requiresInteractiveGateway = observation.phase === 'title'
    && observation.titlePresented === true;
  if (
    !gateway
    || !shell
    || !canvas
    || canvas.webgl !== true
    || gateway.ready !== true
    || (
      requiresInteractiveGateway
      && (
        gateway.interactive !== true
        || gateway.visible !== true
      )
    )
  ) throw new TitleTransitionFrameBrowserError(
    `Title gateway was not rendered and interactive at ${probeCase.id}.`,
  );
  const rendererWidth = exactFiniteNumber(
    gateway.rendererViewportWidth,
    'renderer viewport width',
  );
  const rendererHeight = exactFiniteNumber(
    gateway.rendererViewportHeight,
    'renderer viewport height',
  );
  const rendererX = exactFiniteNumber(gateway.rendererX, 'renderer x');
  const rendererY = exactFiniteNumber(gateway.rendererY, 'renderer y');
  const sourceLeft = exactFiniteNumber(gateway.sourceLeft, 'source left');
  const sourceTop = exactFiniteNumber(gateway.sourceTop, 'source top');
  const sourceWidth = exactFiniteNumber(gateway.sourceWidth, 'source width');
  const sourceHeight = exactFiniteNumber(gateway.sourceHeight, 'source height');
  const gatewayClientX = exactFiniteNumber(gateway.clientX, 'gateway client x');
  const gatewayClientY = exactFiniteNumber(gateway.clientY, 'gateway client y');
  const buttonClientX = exactFiniteNumber(
    gateway.buttonCenterX,
    'button client x',
  );
  const buttonClientY = exactFiniteNumber(
    gateway.buttonCenterY,
    'button client y',
  );
  if (
    rendererWidth <= 0
    || rendererHeight <= 0
    || sourceWidth <= 0
    || sourceHeight <= 0
  ) throw new TitleTransitionFrameBrowserError(
    `Title gateway geometry dimensions were invalid at ${probeCase.id}.`,
  );
  const projectedClientX = sourceLeft + rendererX / rendererWidth * sourceWidth;
  const projectedClientY = sourceTop + rendererY / rendererHeight * sourceHeight;
  const tolerance = probeCase.mobile ? 3 : 2;
  const projectionError = Math.hypot(
    projectedClientX - gatewayClientX,
    projectedClientY - gatewayClientY,
  );
  const buttonError = Math.hypot(
    buttonClientX - gatewayClientX,
    buttonClientY - gatewayClientY,
  );
  if (
    projectionError > 0.5
    || (
      requiresInteractiveGateway
      && (
        buttonError > tolerance
        || exactFiniteNumber(gateway.alignmentError, 'alignment error') > tolerance
      )
    )
  ) throw new TitleTransitionFrameBrowserError(
    `Title gateway client conversion mismatched at ${probeCase.id}.`,
  );
  if (probeCase.id === 'owner-full-hd-half-renderer-repeated') {
    if (
      Math.abs(rendererWidth - 960) > 2
      || Math.abs(rendererHeight - 540) > 2
      || Math.abs(shell.clientWidth - 960) > 2
      || Math.abs(shell.clientHeight - 540) > 2
      || Math.abs(shell.rect?.width - 1_920) > 3
      || Math.abs(shell.rect?.height - 1_080) > 3
    ) throw new TitleTransitionFrameBrowserError(
      'Owner-shaped half-renderer reproduction was not active.',
    );
  }
  return Object.freeze({
    alignmentErrorCssPixels: buttonError,
    clientX: gatewayClientX,
    clientY: gatewayClientY,
    generation: gateway.measurementGeneration,
    projectionErrorCssPixels: projectionError,
    rendererHeight,
    rendererWidth,
    sourceHeight,
    sourceLeft,
    sourceTop,
    sourceWidth,
  });
}

export function validateTitleTransitionOverlayGeometry(
  observation,
  expected,
  probeCase,
) {
  const overlay = observation?.overlay;
  if (
    !overlay
    || overlay.count !== 1
    || overlay.originReady !== true
    || overlay.visible !== true
    || overlay.direction !== expected.direction
    || overlay.input !== expected.input
    || overlay.sequence !== expected.sequence
    || overlay.rect === null
  ) throw new TitleTransitionFrameBrowserError(
    `Title transition overlay lifecycle mismatched at ${probeCase.id}.`,
  );
  const clientX = exactFiniteNumber(overlay.clientX, 'overlay client x');
  const clientY = exactFiniteNumber(overlay.clientY, 'overlay client y');
  const localX = exactFiniteNumber(overlay.localX, 'overlay local x');
  const localY = exactFiniteNumber(overlay.localY, 'overlay local y');
  const normalizedU = exactFiniteNumber(
    overlay.normalizedU,
    'overlay normalized u',
  );
  const normalizedV = exactFiniteNumber(
    overlay.normalizedV,
    'overlay normalized v',
  );
  const clientWidth = exactFiniteNumber(
    overlay.clientWidth,
    'overlay client width',
  );
  const clientHeight = exactFiniteNumber(
    overlay.clientHeight,
    'overlay client height',
  );
  if (
    clientWidth <= 0
    || clientHeight <= 0
    || overlay.parentBody !== true
    || !String(overlay.originCssX).trim().endsWith('%')
    || !String(overlay.originCssY).trim().endsWith('%')
  ) throw new TitleTransitionFrameBrowserError(
    `Title transition overlay coordinate boundary mismatched at ${probeCase.id}.`,
  );
  const tolerance = probeCase.mobile ? 3 : 2;
  const clientError = Math.hypot(
    clientX - expected.gatewayClientPoint.x,
    clientY - expected.gatewayClientPoint.y,
  );
  const expectedU = (
    expected.gatewayClientPoint.x - overlay.rect.left
  ) / overlay.rect.width;
  const expectedV = (
    expected.gatewayClientPoint.y - overlay.rect.top
  ) / overlay.rect.height;
  const reprojectedClientX = overlay.rect.left
    + localX / clientWidth * overlay.rect.width;
  const reprojectedClientY = overlay.rect.top
    + localY / clientHeight * overlay.rect.height;
  const localError = Math.hypot(
    reprojectedClientX - expected.gatewayClientPoint.x,
    reprojectedClientY - expected.gatewayClientPoint.y,
  );
  const normalizedError = Math.hypot(
    (normalizedU - expectedU) * overlay.rect.width,
    (normalizedV - expectedV) * overlay.rect.height,
  );
  const cssPercentageError = Math.hypot(
    (
      Number.parseFloat(overlay.originCssX) / 100 - expectedU
    ) * overlay.rect.width,
    (
      Number.parseFloat(overlay.originCssY) / 100 - expectedV
    ) * overlay.rect.height,
  );
  if (
    clientError > tolerance
    || localError > tolerance
    || normalizedError > tolerance
    || cssPercentageError > tolerance
  ) {
    throw new TitleTransitionFrameBrowserError(
      `Title transition overlay origin mismatched at ${probeCase.id}.`,
    );
  }
  const visualViewport = observation.visualViewport;
  if (
    !visualViewport
    || !Number.isFinite(visualViewport.offsetLeft)
    || !Number.isFinite(visualViewport.offsetTop)
    || !Number.isFinite(visualViewport.pageLeft)
    || !Number.isFinite(visualViewport.pageTop)
    || !Number.isFinite(visualViewport.width)
    || visualViewport.width <= 0
    || !Number.isFinite(visualViewport.height)
    || visualViewport.height <= 0
    || !Number.isFinite(visualViewport.scale)
    || visualViewport.scale <= 0
  ) throw new TitleTransitionFrameBrowserError(
    `Title transition visual viewport telemetry was invalid at ${probeCase.id}.`,
  );
  if (
    Math.abs(
      exactFiniteNumber(
        overlay.visualViewportOffsetLeft,
        'overlay visual viewport offset left',
      ) - visualViewport.offsetLeft
    ) > 0.01
    || Math.abs(
      exactFiniteNumber(
        overlay.visualViewportOffsetTop,
        'overlay visual viewport offset top',
      ) - visualViewport.offsetTop
    ) > 0.01
    || Math.abs(
      exactFiniteNumber(
        overlay.visualViewportWidth,
        'overlay visual viewport width',
      ) - visualViewport.width
    ) > 0.01
    || Math.abs(
      exactFiniteNumber(
        overlay.visualViewportHeight,
        'overlay visual viewport height',
      ) - visualViewport.height
    ) > 0.01
    || Math.abs(
      exactFiniteNumber(
        overlay.visualViewportScale,
        'overlay visual viewport scale',
      ) - visualViewport.scale
    ) > 0.01
  ) throw new TitleTransitionFrameBrowserError(
    `Title transition visual viewport snapshot mismatched at ${probeCase.id}.`,
  );
  if (probeCase.id === 'owner-full-hd-half-renderer-repeated') {
    if (
      Math.abs(clientWidth - 3_840) > 4
      || Math.abs(clientHeight - 2_160) > 4
      || Math.abs(overlay.rect.width - 1_920) > 3
      || Math.abs(overlay.rect.height - 1_080) > 3
    ) throw new TitleTransitionFrameBrowserError(
      'Owner-shaped half-overlay reproduction was not active.',
    );
  }
  if (
    expected.input === 'pointer'
    || expected.input === 'touch'
  ) {
    const pointerX = observation.gateway?.acceptedPointerX;
    const pointerY = observation.gateway?.acceptedPointerY;
    if (
      !Number.isFinite(pointerX)
      || !Number.isFinite(pointerY)
      || Math.hypot(
        pointerX - expected.gatewayClientPoint.x,
        pointerY - expected.gatewayClientPoint.y,
      ) < 8
    ) throw new TitleTransitionFrameBrowserError(
      `Title transition hit-validation point was not independent at ${probeCase.id}.`,
    );
  }
  return Object.freeze({
    clientErrorCssPixels: clientError,
    clientX,
    clientY,
    clientHeight,
    clientWidth,
    cssPercentageErrorCssPixels: cssPercentageError,
    localErrorCssPixels: localError,
    localX,
    localY,
    normalizedErrorCssPixels: normalizedError,
    normalizedU,
    normalizedV,
    visualViewport,
  });
}

async function captureFrame(
  session,
  artifactDirectory,
  fileStem,
  viewport,
  transitionStartMilliseconds,
  requestedOffsetMilliseconds,
) {
  const commandStarted = Date.now();
  const result = await session.command('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
    fromSurface: true,
  }, 20_000);
  const commandCompleted = Date.now();
  if (
    typeof result?.data !== 'string'
    || result.data.length < 64
    || result.data.length > Math.ceil(
      TITLE_TRANSITION_FRAME_MAXIMUM_BYTES * 4 / 3,
    ) + 8
  ) throw new TitleTransitionFrameBrowserError(
    'Title transition screenshot exceeded its bound.',
  );
  const screenshot = Buffer.from(result.data, 'base64');
  if (
    screenshot.byteLength < 64
    || screenshot.byteLength > TITLE_TRANSITION_FRAME_MAXIMUM_BYTES
  ) {
    screenshot.fill(0);
    throw new TitleTransitionFrameBrowserError(
      'Title transition screenshot was invalid.',
    );
  }
  const dimensions = readTitleTransitionPngDimensions(screenshot);
  const filename = `${fileStem}.png`;
  if (!/^[a-z0-9-]{8,160}\.png$/u.test(filename)) {
    screenshot.fill(0);
    throw new TitleTransitionFrameBrowserError(
      'Title transition screenshot name was invalid.',
    );
  }
  await writeFile(join(artifactDirectory, filename), screenshot, {
    flag: 'wx',
    mode: 0o600,
  });
  return {
    actualOffsetMilliseconds:
      (commandStarted + commandCompleted) / 2 - transitionStartMilliseconds,
    bytes: screenshot.byteLength,
    commandDurationMilliseconds: commandCompleted - commandStarted,
    dimensions,
    filename,
    requestedOffsetMilliseconds,
    screenshot,
    sha256: createHash('sha256').update(screenshot).digest('hex'),
    viewport,
  };
}

async function captureTransitionFrames(
  session,
  artifactDirectory,
  filePrefix,
  viewport,
  transitionStartMilliseconds,
  offsets = TITLE_TRANSITION_SCREENSHOT_OFFSETS,
) {
  const frames = [];
  for (const offset of offsets) {
    const remaining = transitionStartMilliseconds
      + offset.milliseconds
      - Date.now();
    if (remaining > 0) await delay(remaining);
    frames.push(await captureFrame(
      session,
      artifactDirectory,
      `${filePrefix}-${offset.label}`,
      viewport,
      transitionStartMilliseconds,
      offset.milliseconds,
    ));
  }
  return frames;
}

function acceptTitleScreencastFrame(state, params, session) {
  const screencast = state.screencast;
  const sessionId = params?.sessionId;
  void session.command('Page.screencastFrameAck', { sessionId }).catch(() => {
    state.violation = 'screencast-ack';
  });
  if (
    !screencast?.active
    || !Number.isSafeInteger(sessionId)
    || typeof params?.data !== 'string'
    || params.data.length < 64
    || params.data.length > Math.ceil(
      TITLE_TRANSITION_FRAME_MAXIMUM_BYTES * 4 / 3,
    ) + 8
    || !Number.isFinite(params?.metadata?.timestamp)
  ) {
    if (screencast?.active) state.violation = 'screencast-frame';
    return;
  }
  const timestampMilliseconds = params.metadata.timestamp * 1_000;
  screencast.timestamps.push(timestampMilliseconds);
  if (screencast.timestamps.length > 240) screencast.timestamps.shift();
  if (!Number.isFinite(screencast.transitionStartMilliseconds)) {
    screencast.preframes.push({
      data: params.data,
      timestampMilliseconds,
    });
    if (screencast.preframes.length > 4) screencast.preframes.shift();
    return;
  }
  const actualOffsetMilliseconds = timestampMilliseconds
    - screencast.transitionStartMilliseconds;
  if (
    actualOffsetMilliseconds >= 0
    && actualOffsetMilliseconds <= 400
    && screencast.earlyFrames.length < 32
  ) {
    screencast.earlyFrames.push({
      actualOffsetMilliseconds,
      data: params.data,
      timestampMilliseconds,
    });
  }
  for (const target of TITLE_TRANSITION_SCREENSHOT_OFFSETS) {
    if (target.milliseconds === 0 && actualOffsetMilliseconds < 0) continue;
    const distance = Math.abs(actualOffsetMilliseconds - target.milliseconds);
    const current = screencast.selected.get(target.milliseconds);
    const maximumDistance = target.milliseconds === 0 ? 200 : 80;
    if (distance <= maximumDistance && (!current || distance < current.distance)) {
      screencast.selected.set(target.milliseconds, {
        actualOffsetMilliseconds,
        data: params.data,
        distance,
        timestampMilliseconds,
      });
    }
  }
}

async function beginTitleTransitionScreencast(session, state, viewport) {
  if (state.screencast?.active) {
    throw new TitleTransitionFrameBrowserError(
      'Title transition screencast was already active.',
    );
  }
  state.screencast = {
    active: true,
    earlyFrames: [],
    preframes: [],
    selected: new Map(),
    timestamps: [],
    transitionStartMilliseconds: null,
  };
  await session.command('Page.startScreencast', {
    everyNthFrame: 1,
    format: 'png',
    maxHeight: viewport.height,
    maxWidth: viewport.width,
  });
  await delay(32);
}

async function finishTitleTransitionScreencast(
  session,
  state,
  artifactDirectory,
  filePrefix,
  viewport,
) {
  const screencast = state.screencast;
  if (
    !screencast?.active
    || !Number.isFinite(screencast.transitionStartMilliseconds)
  ) throw new TitleTransitionFrameBrowserError(
    'Title transition screencast was not armed.',
  );
  const remaining = screencast.transitionStartMilliseconds + 1_280 - Date.now();
  if (remaining > 0) await delay(remaining);
  await session.command('Page.stopScreencast');
  screencast.active = false;
  await delay(32);
  const frames = [];
  for (const target of TITLE_TRANSITION_SCREENSHOT_OFFSETS) {
    const selected = screencast.selected.get(target.milliseconds);
    const maximumDistance = target.milliseconds === 0 ? 200 : 80;
    if (!selected || selected.distance > maximumDistance) {
      throw new TitleTransitionFrameBrowserError(
        `Title transition screencast missed ${target.label}.`,
      );
    }
    const screenshot = Buffer.from(selected.data, 'base64');
    if (
      screenshot.byteLength < 64
      || screenshot.byteLength > TITLE_TRANSITION_FRAME_MAXIMUM_BYTES
    ) {
      screenshot.fill(0);
      throw new TitleTransitionFrameBrowserError(
        'Title transition screencast screenshot was invalid.',
      );
    }
    const dimensions = readTitleTransitionPngDimensions(screenshot);
    const filename = `${filePrefix}-${target.label}.png`;
    await writeFile(join(artifactDirectory, filename), screenshot, {
      flag: 'wx',
      mode: 0o600,
    });
    frames.push({
      actualOffsetMilliseconds: selected.actualOffsetMilliseconds,
      bytes: screenshot.byteLength,
      commandDurationMilliseconds: 0,
      dimensions,
      filename,
      requestedOffsetMilliseconds: target.milliseconds,
      screenshot,
      sha256: createHash('sha256').update(screenshot).digest('hex'),
      viewport,
    });
  }
  const timestamps = screencast.timestamps.filter((timestamp) => (
    timestamp >= screencast.transitionStartMilliseconds
    && timestamp <= screencast.transitionStartMilliseconds + 1_250
  ));
  const frameIntervals = timestamps.slice(1).map(
    (timestamp, index) => timestamp - timestamps[index],
  );
  const cadence = Object.freeze({
    frameCount: timestamps.length,
    maximumIntervalMilliseconds:
      frameIntervals.length > 0 ? Math.max(...frameIntervals) : null,
    medianIntervalMilliseconds:
      frameIntervals.length > 0
        ? [...frameIntervals].sort((left, right) => left - right)[
            Math.floor(frameIntervals.length / 2)
          ]
        : null,
  });
  state.screencast = null;
  return Object.freeze({
    cadence,
    earlyFrames: screencast.earlyFrames,
    frames,
  });
}

async function dispatchGatewayActivation(session, input, gateway) {
  if (input === 'history') {
    await session.command('Runtime.evaluate', {
      expression: 'history.forward(); true',
      returnByValue: true,
    });
    return;
  }
  if (input === 'keyboard') {
    await session.command('Runtime.evaluate', {
      expression: `(() => {
        const button = document.querySelector('.warpkeep-gateway-button');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.focus();
        return document.activeElement === button;
      })()`,
      returnByValue: true,
    });
    for (let repetition = 0; repetition < 2; repetition += 1) {
      await session.command('Input.dispatchKeyEvent', {
        code: 'Enter',
        key: 'Enter',
        nativeVirtualKeyCode: 13,
        text: '\r',
        type: 'keyDown',
        unmodifiedText: '\r',
        windowsVirtualKeyCode: 13,
      });
      await session.command('Input.dispatchKeyEvent', {
        code: 'Enter',
        key: 'Enter',
        nativeVirtualKeyCode: 13,
        type: 'keyUp',
        windowsVirtualKeyCode: 13,
      });
    }
    return;
  }
  const bounds = gateway.buttonRect;
  const x = bounds.left + bounds.width * 0.76;
  const y = bounds.top + bounds.height * 0.28;
  if (input === 'touch') {
    for (let repetition = 0; repetition < 2; repetition += 1) {
      await session.command('Input.dispatchTouchEvent', {
        touchPoints: [{ x, y }],
        type: 'touchStart',
      });
      await session.command('Input.dispatchTouchEvent', {
        touchPoints: [],
        type: 'touchEnd',
      });
    }
    return;
  }
  await session.command('Input.dispatchMouseEvent', {
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
    type: 'mouseMoved',
    x,
    y,
  });
  for (let repetition = 0; repetition < 2; repetition += 1) {
    await session.command('Input.dispatchMouseEvent', {
      button: 'left',
      buttons: 1,
      clickCount: 1,
      pointerType: 'mouse',
      type: 'mousePressed',
      x,
      y,
    });
    await session.command('Input.dispatchMouseEvent', {
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'mouse',
      type: 'mouseReleased',
      x,
      y,
    });
  }
}

async function dispatchReturnToTitle(session) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const button = document.querySelector('button[aria-label="Return to Title"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return null;
      const rect = button.getBoundingClientRect();
      return {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.5
      };
    })()`,
    returnByValue: true,
  });
  const target = result?.result?.value;
  if (!Number.isFinite(target?.x) || !Number.isFinite(target?.y)) {
    throw new TitleTransitionFrameBrowserError(
      'Title transition return control was unavailable.',
    );
  }
  await session.command('Input.dispatchMouseEvent', {
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
    type: 'mouseMoved',
    x: target.x,
    y: target.y,
  });
  await session.command('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
    type: 'mousePressed',
    x: target.x,
    y: target.y,
  });
  await session.command('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
    type: 'mouseReleased',
    x: target.x,
    y: target.y,
  });
}

async function setTitleTransitionPixelIsolation(session, enabled) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.classList.toggle(
        'warpkeep-title-transition-pixel-isolation',
        ${enabled ? 'true' : 'false'}
      );
      return new Promise((resolve) => requestAnimationFrame(
        () => requestAnimationFrame(() => resolve(
          document.documentElement.classList.contains(
            'warpkeep-title-transition-pixel-isolation'
          )
        ))
      ));
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (
    result?.exceptionDetails
    || result?.result?.value !== enabled
  ) throw new TitleTransitionFrameBrowserError(
    'Title transition pixel-isolation boundary failed.',
  );
}

function publicFrameRecord(frame) {
  return Object.freeze({
    actualOffsetMilliseconds: Math.round(frame.actualOffsetMilliseconds),
    bytes: frame.bytes,
    commandDurationMilliseconds: frame.commandDurationMilliseconds,
    dimensions: frame.dimensions,
    filename: frame.filename,
    requestedOffsetMilliseconds: frame.requestedOffsetMilliseconds,
    sha256: frame.sha256,
  });
}

async function runTransitionPass({
  artifactDirectory,
  baselineFrame,
  cssViewport,
  direction,
  expectedGateway,
  filePrefix,
  input,
  probeCase,
  sequence,
  session,
  state,
}) {
  const usesScreencast =
    probeCase.id === 'owner-full-hd-half-renderer-repeated'
    || probeCase.midTransitionViewport !== undefined;
  if (usesScreencast) {
    await beginTitleTransitionScreencast(session, state, cssViewport);
  }
  const transitionStartBeforeInput = Date.now();
  if (direction === 'to-menu') {
    await dispatchGatewayActivation(session, input, expectedGateway.buttonRect
      ? { buttonRect: expectedGateway.buttonRect }
      : expectedGateway);
  } else {
    await dispatchReturnToTitle(session);
  }
  let preparationGeometry = expectedGateway;
  if (direction === 'to-title') {
    const prepared = await waitForPageObservation(
      session,
      state,
      (observation) => (
        observation.gateway?.ready === true
        && (
          observation.returnPreparing
          || observation.overlay?.direction === 'to-title'
        )
      ),
      `${filePrefix}-reverse-measurement`,
    );
    preparationGeometry = validateTitleGatewayGeometry(prepared, probeCase);
  }
  const overlayObservation = await waitForPageObservation(
    session,
    state,
    (observation) => (
      observation.overlay?.originReady === true
      && observation.overlay?.direction === direction
      && observation.overlay?.sequence === sequence
    ),
    `${filePrefix}-overlay`,
  );
  const transitionStart = Date.now();
  if (usesScreencast && state.screencast) {
    state.screencast.transitionStartMilliseconds = transitionStart;
    state.screencast.preframes = [];
  }
  const overlayEvidence = validateTitleTransitionOverlayGeometry(
    overlayObservation,
    {
      direction,
      gatewayClientPoint: {
        x: preparationGeometry.clientX,
        y: preparationGeometry.clientY,
      },
      input: direction === 'to-title' ? 'history' : input,
      sequence,
    },
    probeCase,
  );
  if (
    direction === 'to-menu'
    && transitionStart - transitionStartBeforeInput > 500
  ) throw new TitleTransitionFrameBrowserError(
    `Title transition acceptance was delayed at ${probeCase.id}.`,
  );
  const resizePromise = probeCase.midTransitionViewport
    ? (async () => {
        const expectedCssViewport = titleTransitionCssViewport(
          probeCase.midTransitionViewport,
          probeCase.zoomPercent,
        );
        const remaining = transitionStart + 450 - Date.now();
        if (remaining > 0) await delay(remaining);
        await setCaseDeviceMetrics(
          session,
          probeCase,
          probeCase.midTransitionViewport,
        );
        const resized = await waitForPageObservation(
          session,
          state,
          (observation) => (
            Math.abs(
              observation.viewport.width - expectedCssViewport.width,
            ) <= 1
            && Math.abs(
              observation.viewport.height - expectedCssViewport.height,
            ) <= 1
            && observation.overlay?.sequence === sequence
            && observation.overlay.rect !== null
            && Math.abs(
              observation.overlay.rect.width - expectedCssViewport.width,
            ) <= 1
            && Math.abs(
              observation.overlay.rect.height - expectedCssViewport.height,
            ) <= 1
            && Number.isFinite(observation.overlay.normalizedU)
            && Number.isFinite(observation.overlay.normalizedV)
            && Math.abs(
              observation.overlay.rect.left
              + observation.overlay.normalizedU * observation.overlay.rect.width
              - preparationGeometry.clientX
            ) <= 1
            && Math.abs(
              observation.overlay.rect.top
              + observation.overlay.normalizedV * observation.overlay.rect.height
              - preparationGeometry.clientY
            ) <= 1
          ),
          `${filePrefix}-mid-transition-resize`,
        );
        return Object.freeze({
          overlay: validateTitleTransitionOverlayGeometry(
            resized,
            {
              direction,
              gatewayClientPoint: {
                x: preparationGeometry.clientX,
                y: preparationGeometry.clientY,
              },
              input,
              sequence,
            },
            probeCase,
          ),
          viewport: resized.viewport,
        });
      })()
    : Promise.resolve(null);
  const offsets = probeCase.id === 'owner-full-hd-half-renderer-repeated'
    ? TITLE_TRANSITION_SCREENSHOT_OFFSETS
    : TITLE_TRANSITION_SCREENSHOT_OFFSETS.slice(0, 3);
  const captured = usesScreencast
    ? await finishTitleTransitionScreencast(
        session,
        state,
        artifactDirectory,
        filePrefix,
        cssViewport,
      )
    : Object.freeze({
        cadence: null,
        earlyFrames: [],
        frames: await captureTransitionFrames(
          session,
          artifactDirectory,
          filePrefix,
          cssViewport,
          transitionStart,
          offsets,
        ),
      });
  const frames = captured.frames;
  const resizeEvidence = await resizePromise;
  let pixelEvidence;
  if (
    !probeCase.reducedMotion
    && probeCase.id === 'owner-full-hd-half-renderer-repeated'
  ) {
    let firstVisible;
    let firstVisibleEvidence;
    for (const encodedCandidate of captured.earlyFrames) {
      const screenshot = Buffer.from(encodedCandidate.data, 'base64');
      try {
        const evidence = analyzeTitleTransitionFirstVisibleFrame(
          baselineFrame.screenshot,
          screenshot,
          cssViewport,
          {
            x: preparationGeometry.clientX,
            y: preparationGeometry.clientY,
          },
        );
        if (evidence.deltaPhysicalPixels <= 3) {
          const dimensions = readTitleTransitionPngDimensions(screenshot);
          const filename = `${filePrefix}-first-visible.png`;
          await writeFile(join(artifactDirectory, filename), screenshot, {
            flag: 'wx',
            mode: 0o600,
          });
          firstVisible = {
            actualOffsetMilliseconds:
              encodedCandidate.actualOffsetMilliseconds,
            bytes: screenshot.byteLength,
            commandDurationMilliseconds: 0,
            dimensions,
            filename,
            requestedOffsetMilliseconds: null,
            screenshot,
            sha256: createHash('sha256').update(screenshot).digest('hex'),
          };
          firstVisibleEvidence = evidence;
          break;
        }
      } catch {
        // Continue until a compositor frame contains independently measurable
        // veil pixels at the frozen gateway.
      } finally {
        if (firstVisible?.screenshot !== screenshot) screenshot.fill(0);
      }
    }
    if (!firstVisible || !firstVisibleEvidence) {
      throw new TitleTransitionFrameBrowserError(
        `Title transition frame offsets were incomplete at ${probeCase.id}.`,
      );
    }
    let boundaryEvidence;
    let boundaryFrame;
    for (const candidate of frames) {
      try {
        const evidence = analyzeTitleTransitionFramePair(
          baselineFrame.screenshot,
          candidate.screenshot,
          cssViewport,
          {
            x: preparationGeometry.clientX,
            y: preparationGeometry.clientY,
          },
        );
        if (evidence.deltaPhysicalPixels <= 12) {
          boundaryEvidence = evidence;
          boundaryFrame = publicFrameRecord(candidate);
          break;
        }
      } catch {
        // Early fixed offsets can precede a measurable boundary on a busy
        // compositor. Later required offsets remain independently available.
      }
    }
    if (!boundaryEvidence || !boundaryFrame) {
      throw new TitleTransitionFrameBrowserError(
        `Title transition pixel centroid mismatched at ${probeCase.id}.`,
      );
    }
    pixelEvidence = Object.freeze({
      boundary: boundaryEvidence,
      boundaryFrame,
      firstVisibleFrame: publicFrameRecord(firstVisible),
      firstVisible: firstVisibleEvidence,
    });
    firstVisible.screenshot.fill(0);
  }
  const stableObservation = await waitForPageObservation(
    session,
    state,
    direction === 'to-menu'
      ? (observation) => observation.phase === 'menu' && observation.menuPresented
      : (observation) => (
          observation.phase === 'title'
          && observation.titlePresented
          && observation.gateway?.ready === true
        ),
    `${filePrefix}-stable`,
  );
  for (const frame of frames) frame.screenshot.fill(0);
  return Object.freeze({
    baseline: publicFrameRecord(baselineFrame),
    cadence: captured.cadence,
    direction,
    frames: frames.map(publicFrameRecord),
    input: direction === 'to-title' ? 'history' : input,
    overlayEvidence,
    pixelEvidence,
    preparationGeneration: preparationGeometry.generation,
    resizeEvidence,
    sequence,
    stablePhase: stableObservation.phase,
  });
}

async function setCaseDeviceMetrics(session, probeCase, viewport) {
  await session.command('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: probeCase.deviceScaleFactor,
    height: viewport.height,
    mobile: probeCase.mobile,
    screenHeight: viewport.height,
    screenWidth: viewport.width,
    width: viewport.width,
  });
}

async function configureCaseEnvironment(session, probeCase) {
  await setCaseDeviceMetrics(session, probeCase, probeCase.viewport);
  await session.command('Emulation.setTouchEmulationEnabled', {
    enabled: probeCase.input === 'touch',
    ...(probeCase.input === 'touch' ? { maxTouchPoints: 1 } : {}),
  });
  await session.command('Emulation.setEmulatedMedia', {
    features: [{
      name: 'prefers-reduced-motion',
      value: probeCase.reducedMotion ? 'reduce' : 'no-preference',
    }],
  });
}

async function runTitleTransitionCase(
  session,
  state,
  origin,
  artifactDirectory,
  probeCase,
) {
  await configureCaseEnvironment(session, probeCase);
  const injection = await session.command(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: titleStressInjectionSource(probeCase) },
  );
  if (typeof injection?.identifier !== 'string') {
    throw new TitleTransitionFrameBrowserError(
      `Title transition stress setup failed at ${probeCase.id}.`,
    );
  }
  state.allowedNavigationUrls.add(`${origin}/`);
  await session.command('Page.navigate', { url: `${origin}/` });
  const initial = await waitForPageObservation(
    session,
    state,
    (observation) => (
      observation.documentReadyState === 'complete'
      && observation.phase === 'title'
      && observation.titlePresented
      && observation.titlePhase === 'active'
      && observation.gateway?.ready === true
      && observation.canvas?.webgl === true
    ),
    `${probeCase.id}-gateway-ready`,
  );
  const initialGeometry = validateTitleGatewayGeometry(initial, probeCase);
  const layoutMetrics = await session.command('Page.getLayoutMetrics');
  const cdpVisualViewport = layoutMetrics?.cssVisualViewport
    ?? layoutMetrics?.visualViewport;
  const observedBrowserZoom = cdpVisualViewport?.zoom;
  const expectedBrowserZoom = probeCase.zoomPercent / 100;
  if (
    !Number.isFinite(observedBrowserZoom)
    || Math.abs(observedBrowserZoom - expectedBrowserZoom) > 0.015
  ) throw new TitleTransitionFrameBrowserError(
    `True browser zoom mismatched at ${probeCase.id}: expected `
    + `${expectedBrowserZoom}, observed ${String(observedBrowserZoom)}.`,
  );
  const visualViewportTelemetry = Object.freeze({
    clientHeight: exactFiniteNumber(
      cdpVisualViewport?.clientHeight,
      'CDP visual viewport height',
    ),
    clientWidth: exactFiniteNumber(
      cdpVisualViewport?.clientWidth,
      'CDP visual viewport width',
    ),
    offsetX: exactFiniteNumber(
      cdpVisualViewport?.offsetX,
      'CDP visual viewport offset x',
    ),
    offsetY: exactFiniteNumber(
      cdpVisualViewport?.offsetY,
      'CDP visual viewport offset y',
    ),
    pageX: exactFiniteNumber(
      cdpVisualViewport?.pageX,
      'CDP visual viewport page x',
    ),
    pageY: exactFiniteNumber(
      cdpVisualViewport?.pageY,
      'CDP visual viewport page y',
    ),
    scale: exactFiniteNumber(
      cdpVisualViewport?.scale,
      'CDP visual viewport scale',
    ),
    zoom: observedBrowserZoom,
  });
  const cssViewport = Object.freeze({
    height: initial.viewport.height,
    width: initial.viewport.width,
  });
  const initialVisualFrame = await captureFrame(
    session,
    artifactDirectory,
    `${probeCase.id}-initial-last-active`,
    cssViewport,
    Date.now(),
    0,
  );
  let gatewayVisualEvidence = null;
  if (probeCase.id === 'owner-full-hd-half-renderer-repeated') {
    gatewayVisualEvidence = analyzeTitleGatewayVisualFrame(
      initialVisualFrame.screenshot,
      cssViewport,
      { x: initialGeometry.clientX, y: initialGeometry.clientY },
    );
    if (gatewayVisualEvidence.deltaPhysicalPixels > 12) {
      initialVisualFrame.screenshot.fill(0);
      throw new TitleTransitionFrameBrowserError(
        `Title gateway visual centroid mismatched at ${probeCase.id}.`,
      );
    }
  }
  initialVisualFrame.screenshot.fill(0);

  const ownerRegression =
    probeCase.id === 'owner-full-hd-half-renderer-repeated';
  if (ownerRegression) {
    await setTitleTransitionPixelIsolation(session, true);
    const isolated = await readPageObservation(session);
    if (
      isolated.pixelIsolation?.active !== true
      || isolated.pixelIsolation.position !== 'fixed'
      || isolated.pixelIsolation.zIndex !== '99'
      || isolated.pixelIsolation.pointerEvents !== 'none'
      || !isolated.pixelIsolation.content
      || isolated.pixelIsolation.content === 'none'
    ) throw new TitleTransitionFrameBrowserError(
      'Title transition pixel-isolation underlay was not active.',
    );
  }

  const passes = [];
  let previousGeometry = initialGeometry;
  const cycleInputs = ownerRegression
    ? TITLE_TRANSITION_OWNER_CYCLE_INPUTS
    : [probeCase.input];
  const toMenuPassCount = ownerRegression ? 2 : 1;
  for (let cycle = 0; cycle < toMenuPassCount; cycle += 1) {
    const input = cycleInputs[cycle];
    const toMenuBaseline = await captureFrame(
      session,
      artifactDirectory,
      `${probeCase.id}-cycle-${cycle + 1}-to-menu-last-active`,
      cssViewport,
      Date.now(),
      0,
    );
    passes.push(await runTransitionPass({
      artifactDirectory,
      baselineFrame: toMenuBaseline,
      cssViewport,
      direction: 'to-menu',
      expectedGateway: {
        ...previousGeometry,
        buttonRect: initial.gateway.buttonRect,
      },
      filePrefix: `${probeCase.id}-cycle-${cycle + 1}-to-menu`,
      input,
      probeCase,
      sequence: passes.length + 1,
      session,
      state,
    }));
    toMenuBaseline.screenshot.fill(0);

    if (!ownerRegression || cycle === toMenuPassCount - 1) break;
    const toTitleBaseline = await captureFrame(
      session,
      artifactDirectory,
      `${probeCase.id}-cycle-${cycle + 1}-to-title-last-active`,
      cssViewport,
      Date.now(),
      0,
    );
    const reversePass = await runTransitionPass({
      artifactDirectory,
      baselineFrame: toTitleBaseline,
      cssViewport,
      direction: 'to-title',
      expectedGateway: previousGeometry,
      filePrefix: `${probeCase.id}-cycle-${cycle + 1}-to-title`,
      input: 'history',
      probeCase,
      sequence: passes.length + 1,
      session,
      state,
    });
    passes.push(reversePass);
    toTitleBaseline.screenshot.fill(0);
    const returned = await readPageObservation(session);
    previousGeometry = validateTitleGatewayGeometry(returned, probeCase);
    if (
      Math.hypot(
        previousGeometry.clientX - initialGeometry.clientX,
        previousGeometry.clientY - initialGeometry.clientY,
      ) > (probeCase.mobile ? 3 : 2)
    ) throw new TitleTransitionFrameBrowserError(
      `Title gateway accumulated drift at ${probeCase.id}.`,
    );
  }
  if (ownerRegression) {
    if (
      passes.length !== 3
      || passes.map(pass => pass.direction).join(',') !==
        'to-menu,to-title,to-menu'
      || passes.map(pass => pass.sequence).join(',') !== '1,2,3'
      || passes[0]?.input !== 'pointer'
      || passes[1]?.input !== 'history'
      || passes[2]?.input !== 'pointer'
      || passes.some(pass => (
        pass.pixelEvidence?.firstVisible?.deltaPhysicalPixels > 3
      ))
    ) throw new TitleTransitionFrameBrowserError(
      'Owner title transition regression sequence mismatched.',
    );
    await setTitleTransitionPixelIsolation(session, false);
  }
  await session.command('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: injection.identifier,
  });
  return Object.freeze({
    browserZoom: observedBrowserZoom,
    cdpVisualViewport: visualViewportTelemetry,
    cssViewport,
    deviceScaleFactor: probeCase.deviceScaleFactor,
    gatewayVisualEvidence,
    id: probeCase.id,
    initialFrame: publicFrameRecord(initialVisualFrame),
    initialGeometry,
    passes,
    reducedMotion: probeCase.reducedMotion,
    viewport: probeCase.viewport,
    zoomPercent: probeCase.zoomPercent,
  });
}

function browserViolationCategory(method, params, origin) {
  if (method === 'Page.windowOpen' || method === 'Page.downloadWillBegin') {
    return 'page-side-effect';
  }
  if (method === 'Runtime.exceptionThrown') return 'runtime-exception';
  if (
    method === 'Runtime.consoleAPICalled'
    && ['assert', 'error'].includes(params?.type)
  ) return 'console-error';
  if (method === 'Log.entryAdded' && params?.entry?.level === 'error') {
    return 'log-error';
  }
  if (method === 'Network.webSocketCreated') {
    return isAllowedTitleTransitionBrowserUrl(params?.url, origin)
      ? ''
      : 'websocket';
  }
  if (method === 'Network.requestWillBeSent') {
    return isAllowedTitleTransitionBrowserUrl(params?.request?.url, origin)
      ? ''
      : 'network';
  }
  return '';
}

async function runTitleTransitionCaseInFreshChrome({
  artifactDirectory,
  origin,
  probeCase,
  reviewedChromeIdentity,
}) {
  const temporaryProfileDirectory = await mkdtemp(
    join(tmpdir(), 'warpkeep-title-transition-qa-'),
  );
  await chmod(temporaryProfileDirectory, 0o700);
  const profileDirectory = await realpath(temporaryProfileDirectory);
  await prepareChromeProfile(profileDirectory, probeCase.zoomPercent);
  let chrome;
  let devtools;
  try {
    await attestStableHeadlessChromeExecutable(reviewedChromeIdentity);
    chrome = spawnHeadlessChromeProbe(profileDirectory);
    const launchedChromeIdentity = await readReviewedChromeExecutableIdentity();
    if (!exactChromeExecutableIdentity(
      reviewedChromeIdentity,
      launchedChromeIdentity,
    )) throw new TitleTransitionFrameBrowserError(
      'Reviewed Chrome executable changed at launch.',
    );
    const state = {
      allowedNavigationUrls: new Set(),
      screencast: null,
      targetId: '',
      violation: '',
    };
    devtools = new DevtoolsPipeSession(chrome, (method, params, session) => {
      if (method === 'Page.screencastFrame') {
        acceptTitleScreencastFrame(state, params, session);
        return;
      }
      if (method === 'Fetch.requestPaused') {
        const requestUrl = params?.request?.url;
        if (isAllowedTitleTransitionBrowserUrl(requestUrl, origin)) {
          void session.command('Fetch.continueRequest', {
            requestId: params.requestId,
          }).catch(() => {
            state.violation = 'fetch-continue';
          });
        } else {
          state.violation = 'fetch';
          void session.command('Fetch.failRequest', {
            errorReason: 'BlockedByClient',
            requestId: params.requestId,
          }).catch(() => {});
        }
        return;
      }
      if (method === 'Page.frameNavigated' && !params?.frame?.parentId) {
        const url = params?.frame?.url;
        if (
          url !== 'about:blank'
          && !state.allowedNavigationUrls.has(url)
        ) state.violation = 'navigation';
        return;
      }
      const violation = browserViolationCategory(method, params, origin);
      if (violation) state.violation = violation;
    });
    await devtools.open();
    const target = selectBlankPageTarget(await devtools.browserCommand(
      'Target.getTargets',
      { filter: [{ exclude: false, type: 'page' }, { exclude: true }] },
    ));
    state.targetId = target.targetId;
    await devtools.attachToPage(target.targetId);
    await Promise.all([
      devtools.command('Page.enable'),
      devtools.command('Runtime.enable'),
      devtools.command('Log.enable'),
      devtools.command('Network.enable'),
      devtools.command('Page.setDownloadBehavior', { behavior: 'deny' }),
      devtools.command('Fetch.enable', {
        patterns: [{ requestStage: 'Request', urlPattern: '*' }],
      }),
    ]);
    return await runTitleTransitionCase(
      devtools,
      state,
      origin,
      artifactDirectory,
      probeCase,
    );
  } finally {
    await cleanupRenderedWebglProbeResources({
      chrome,
      devtools,
      removeProfile: () => rm(temporaryProfileDirectory, {
        force: true,
        recursive: true,
      }),
    });
  }
}

export async function runTitleTransitionFrameBrowserProbe(options = {}) {
  if (
    options !== null
    && (
      typeof options !== 'object'
      || Array.isArray(options)
      || Object.keys(options).some((key) => key !== 'ownerOnly')
      || (
        options.ownerOnly !== undefined
        && typeof options.ownerOnly !== 'boolean'
      )
    )
  ) throw new TypeError('Invalid title transition browser probe options.');
  const packageJson = JSON.parse(
    await readFile(join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  if (
    packageJson?.name !== 'warpkeep'
    || typeof packageJson.version !== 'string'
    || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u
      .test(packageJson.version)
  ) throw new TitleTransitionFrameBrowserError(
    'Title transition package contract was invalid.',
  );
  const distIndex = await readFile(join(PRODUCTION_DIST_DIRECTORY, 'index.html'));
  const distIndexSha256 = createHash('sha256').update(distIndex).digest('hex');
  distIndex.fill(0);
  const artifactDirectory = await createTitleTransitionArtifactDirectory();
  const reviewedChromeIdentity = await attestStableHeadlessChromeExecutable();
  let productionServer;
  try {
    productionServer = await createProductionDistLoopbackServer();
    const cases = options.ownerOnly
      ? TITLE_TRANSITION_FRAME_CASES.slice(0, 1)
      : TITLE_TRANSITION_FRAME_CASES;
    const observations = [];
    for (const probeCase of cases) {
      try {
        observations.push(await runTitleTransitionCaseInFreshChrome({
          artifactDirectory,
          origin: productionServer.origin,
          probeCase,
          reviewedChromeIdentity,
        }));
      } catch (error) {
        throw new TitleTransitionFrameBrowserError(
          `Title transition case ${probeCase.id} failed.`,
          { cause: error },
        );
      }
    }
    const manifest = Object.freeze({
      artifactSchema: 1,
      caseCount: observations.length,
      cases: observations,
      chromeIdentity: reviewedChromeIdentity,
      distIndexSha256,
      packageVersion: packageJson.version,
    });
    await writeFile(
      join(artifactDirectory, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    return Object.freeze({
      artifactDirectory,
      caseCount: observations.length,
      passCount: observations.reduce(
        (count, observation) => count + observation.passes.length,
        0,
      ),
    });
  } finally {
    await productionServer?.close();
  }
}

async function main() {
  if (
    process.argv.length > 3
    || (
      process.argv.length === 3
      && process.argv[2] !== '--owner-only'
    )
  ) {
    process.stderr.write(
      'Usage: title-transition-frame-browser-probe [--owner-only]\n',
    );
    process.exitCode = 64;
    return;
  }
  try {
    const result = await runTitleTransitionFrameBrowserProbe({
      ownerOnly: process.argv[2] === '--owner-only',
    });
    process.stdout.write(
      `Warpkeep production title transition QA passed: ${result.caseCount} cases, `
      + `${result.passCount} transition passes; evidence ${result.artifactDirectory}.\n`,
    );
  } catch {
    process.stderr.write('Warpkeep production title transition QA failed closed.\n');
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
