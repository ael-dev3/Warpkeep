import { deflateSync } from 'node:zlib';
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TITLE_TRANSITION_FRAME_CASES,
  TitleTransitionFrameBrowserError,
  createProductionDistLoopbackServer,
  isAllowedTitleTransitionBrowserUrl,
  productionAssetRelativePath,
  runTitleTransitionFrameBrowserProbe,
  titleTransitionBrowserZoomLevel,
  titleTransitionCssViewport,
  validateTitleGatewayGeometry,
  validateTitleTransitionOverlayGeometry
} from '../scripts/qa-observer/title-transition-frame-browser-probe.mjs';
import {
  analyzeTitleGatewayVisualFrame,
  analyzeTitleTransitionFirstVisibleFrame,
  analyzeTitleTransitionFramePair
} from '../scripts/qa-observer/title-transition-frame-analysis.mjs';

const entryProbe = vi.hoisted(() => ({
  fixtureDist: '',
  createdRuns: [] as string[],
  methods: [] as string[],
  navigations: [] as string[],
  viewports: [] as { width: number; height: number }[],
  viewport: { width: 1440, height: 900 },
  screenshot: undefined as undefined | ((width: number, height: number) => string),
  beforeObservation: undefined as undefined | (() => void),
  observations: 0,
  cleaned: 0
}));

// Drive the public production runner without starting Chrome or reading the
// current build. Only its fixed dist input is replaced by this test's fixture.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const normal = (path: unknown) => String(path).replaceAll('\\', '/');
  const dist = () => `${normal(process.cwd())}/dist`;
  const mocked = {
    ...actual,
    lstat: (path: Parameters<typeof actual.lstat>[0], ...args: unknown[]) => actual.lstat(
      entryProbe.fixtureDist && normal(path) === dist() ? entryProbe.fixtureDist : path,
      ...args as []
    ),
    realpath: (path: Parameters<typeof actual.realpath>[0], ...args: unknown[]) => actual.realpath(
      entryProbe.fixtureDist && normal(path) === dist() ? entryProbe.fixtureDist : path,
      ...args as []
    ),
    readFile: (path: Parameters<typeof actual.readFile>[0], ...args: unknown[]) => {
      return actual.readFile(
        entryProbe.fixtureDist && normal(path) === `${dist()}/index.html`
          ? `${entryProbe.fixtureDist}/index.html` : path,
        ...args as [BufferEncoding]
      );
    },
    mkdir: async (path: Parameters<typeof actual.mkdir>[0], ...args: unknown[]) => {
      const result = await actual.mkdir(path, ...args as []);
      if (entryProbe.fixtureDist && /\/title-transition\/[0-9A-Za-z-]+$/.test(normal(path))) {
        entryProbe.createdRuns.push(String(path));
      }
      return result;
    }
  };
  return { ...mocked, default: mocked };
});

vi.mock('../scripts/qa-observer/rendered-webgl-browser-probe.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scripts/qa-observer/rendered-webgl-browser-probe.mjs')>();
  const identity = { fixture: 'reviewed-chrome' };
  class FixtureSession {
    async open() {}
    async attachToPage() {}
    async browserCommand() { return { targetInfos: [{ targetId: 'fixture-page', type: 'page', url: 'about:blank', title: '', attached: false }] }; }
    async command(method: string, params: any = {}) {
      entryProbe.methods.push(method);
      if (method === 'Page.navigate') entryProbe.navigations.push(params.url);
      if (method === 'Emulation.setDeviceMetricsOverride') {
        entryProbe.viewport = { width: params.width, height: params.height };
        entryProbe.viewports.push(entryProbe.viewport);
        vi.stubGlobal('innerWidth', params.width); vi.stubGlobal('innerHeight', params.height);
      }
      if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: 'fixture-injection' };
      if (method === 'Runtime.evaluate') {
        entryProbe.observations++;
        entryProbe.beforeObservation?.();
        return { result: { value: Function(`return ${params.expression}`)() } };
      }
      if (method === 'Page.captureScreenshot') return {
        data: entryProbe.screenshot!(entryProbe.viewport.width, entryProbe.viewport.height)
      };
      return {};
    }
  }
  return { ...actual, DevtoolsPipeSession: FixtureSession,
    attestStableHeadlessChromeExecutable: async () => identity,
    readReviewedChromeExecutableIdentity: async () => identity,
    exactChromeExecutableIdentity: () => true,
    spawnHeadlessChromeProbe: () => ({ fixture: true }),
    cleanupRenderedWebglProbeResources: async ({ removeProfile }: { removeProfile: () => Promise<void> }) => {
      entryProbe.cleaned++; await removeProfile();
    }
  };
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

function crc32(value: Buffer) {
  let crc = 0xffff_ffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, data])),
    8 + data.byteLength
  );
  return chunk;
}

function syntheticPng(
  width: number,
  height: number,
  colourAt: (x: number, y: number) => readonly [number, number, number]
) {
  const rows = Buffer.allocUnsafe((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    rows[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      const colour = colourAt(x, y);
      rows[offset++] = colour[0];
      rows[offset++] = colour[1];
      rows[offset++] = colour[2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
  rows.fill(0);
  return png;
}

const ownerCase = TITLE_TRANSITION_FRAME_CASES[0]!;

function ownerGeometryObservation() {
  return {
    canvas: { webgl: true },
    gateway: {
      alignmentError: 0,
      buttonCenterX: 960,
      buttonCenterY: 320,
      clientX: 960,
      clientY: 320,
      interactive: true,
      measurementGeneration: 11,
      ready: true,
      rendererViewportHeight: 540,
      rendererViewportWidth: 960,
      rendererX: 480,
      rendererY: 160,
      sourceHeight: 1080,
      sourceLeft: 0,
      sourceTop: 0,
      sourceWidth: 1920,
      visible: true
    },
    shell: {
      clientHeight: 540,
      clientWidth: 960,
      rect: { height: 1080, width: 1920 }
    }
  };
}

async function withDirectMenuFixture(run: () => Promise<void>, base = '/') {
  const fixtureDist = await mkdtemp(join(tmpdir(), 'warpkeep-menu-entry-test-'));
  entryProbe.fixtureDist = fixtureDist;
  entryProbe.createdRuns = []; entryProbe.methods = []; entryProbe.navigations = []; entryProbe.viewports = []; entryProbe.cleaned = 0;
  entryProbe.beforeObservation = undefined; entryProbe.observations = 0;
  entryProbe.screenshot = (width, height) => syntheticPng(width, height, () => [32, 68, 61]).toString('base64');
  await writeFile(join(fixtureDist, 'index.html'), `<!doctype html><div id="root"></div><script type="module" src="${base}assets/menu-entry.js"></script>\n`);
  document.body.innerHTML = `<div id="root"><div class="warpkeep-experience" data-phase="menu" data-presented-screen="menu">
    <section class="warpkeep-experience__screen--menu" data-presented="true" aria-hidden="false">
      <main class="warpkeep-menu" data-visible="true" data-active="true" aria-hidden="false">
        <h1 id="warpkeep-menu-title">WARPKEEP</h1>
        <div class="warpkeep-menu-world-3d" data-model-ready="true"><canvas width="320" height="844"></canvas></div>
        <button data-command="enter-realm" tabindex="0">Enter Realm</button>
      </main>
    </section></div></div>`;
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ isContextLost: () => false } as WebGLRenderingContext);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 20, y: 120, left: 20, top: 120, right: 300, bottom: 164, width: 280, height: 44, toJSON() {}
  }));
  const previousElementFromPoint = document.elementFromPoint;
  document.elementFromPoint = () => document.querySelector('button[data-command="enter-realm"]');
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    display: 'block', visibility: 'visible', opacity: '1', getPropertyValue: () => ''
  } as unknown as CSSStyleDeclaration);
  let clock = 0; vi.spyOn(Date, 'now').mockImplementation(() => clock += 1000);
  try { await run(); }
  finally {
    entryProbe.fixtureDist = ''; document.elementFromPoint = previousElementFromPoint;
    const artifactRoot = resolve(process.cwd(), '.cache', 'warpkeep-qa', 'title-transition');
    for (const path of entryProbe.createdRuns) {
      if (!resolve(path).startsWith(`${artifactRoot}\\`) && !resolve(path).startsWith(`${artifactRoot}/`)) {
        throw new Error('Test artifact escaped its owned root');
      }
      await rm(path, { recursive: true, force: true });
    }
    await rm(fixtureDist, { recursive: true, force: true });
  }
}

describe('current production menu entry caller', () => {
  it('selects the direct-menu path and includes the reachable 320px profile', async () => {
    await withDirectMenuFixture(async () => {
      const result = await runTitleTransitionFrameBrowserProbe();
      expect(result.caseCount).toBe(4); expect(result.passCount).toBe(4);
      expect(entryProbe.viewports).toContainEqual({ width: 320, height: 844 });
      expect(entryProbe.methods).toContain('Page.captureScreenshot');
      expect(entryProbe.methods).not.toContain('Page.addScriptToEvaluateOnNewDocument');
      expect(entryProbe.methods).not.toContain('Page.startScreencast');
      expect(entryProbe.cleaned).toBe(4);
      expect(entryProbe.navigations).toHaveLength(4);
      expect(entryProbe.navigations.map((url) => new URL(url).pathname)).toEqual(['/ptr/', '/ptr/', '/ptr/', '/ptr/']);
      const manifest = JSON.parse(readFileSync(join(result.artifactDirectory, 'manifest.json'), 'utf8'));
      expect(manifest.scope).toBe('production direct-menu entry; images require inspection; performance not measured');
      expect(manifest).toMatchObject({ deploymentBase: '/ptr/', stableDistIndex: true, distInput: 'repository-dist' });
      expect(manifest.cases.every((entry: any) => entry.passes[0]?.kind === 'direct-menu-entry')).toBe(true);
      expect(manifest.cases.every((entry: any) => entry.transitionMeasured === false)).toBe(true);
    }, '/ptr/');
  });

  it('rejects a disabled primary control instead of treating a menu node as usable', async () => {
    await withDirectMenuFixture(async () => {
      document.querySelector<HTMLButtonElement>('button[data-command="enter-realm"]')!.disabled = true;
      await expect(runTitleTransitionFrameBrowserProbe({ ownerOnly: true })).rejects.toMatchObject({
        message: 'Production menu entry case desktop-menu-entry failed.',
        cause: { message: 'Production menu entry remained unusable.' }
      });
      expect(entryProbe.methods).not.toContain('Page.captureScreenshot');
      expect(entryProbe.cleaned).toBe(1);
    });
  });

  it('rejects a lost WebGL context even when the castle and primary control are ready', async () => {
    await withDirectMenuFixture(async () => {
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({ isContextLost: () => true } as WebGLRenderingContext);
      await expect(runTitleTransitionFrameBrowserProbe({ ownerOnly: true })).rejects.toMatchObject({
        message: 'Production menu entry case desktop-menu-entry failed.',
        cause: { message: 'Production menu entry remained unusable.' }
      });
      expect(entryProbe.methods).not.toContain('Page.captureScreenshot');
      expect(entryProbe.cleaned).toBe(1);
    });
  });

  it('waits for the existing castle readiness signal before capturing a WebGL entry', async () => {
    await withDirectMenuFixture(async () => {
      const mount = document.querySelector<HTMLElement>('.warpkeep-menu-world-3d')!;
      delete mount.dataset.modelReady;
      entryProbe.beforeObservation = () => {
        if (entryProbe.observations === 3) mount.dataset.modelReady = 'true';
      };
      const capture = vi.fn(entryProbe.screenshot!);
      entryProbe.screenshot = (...args) => {
        expect(entryProbe.observations).toBe(3);
        return capture(...args);
      };
      const result = await runTitleTransitionFrameBrowserProbe({ ownerOnly: true });
      expect(entryProbe.observations).toBe(3); expect(capture).toHaveBeenCalledOnce();
      const manifest = JSON.parse(readFileSync(join(result.artifactDirectory, 'manifest.json'), 'utf8'));
      expect(manifest.cases[0].passes[0]).toMatchObject({ modelReady: true, modelState: '' });
      expect(manifest.modelReadinessScope).toBe('castle and guardian ready; optional scenery settlement not measured');
      expect(entryProbe.cleaned).toBe(1);
    });
  });

  it('rejects a failed castle model even when canvas and primary control remain usable', async () => {
    await withDirectMenuFixture(async () => {
      document.querySelector<HTMLElement>('.warpkeep-menu-world-3d')!.dataset.modelState = 'castle-unavailable';
      await expect(runTitleTransitionFrameBrowserProbe({ ownerOnly: true })).rejects.toMatchObject({
        message: 'Production menu entry case desktop-menu-entry failed.',
        cause: { message: 'Production menu model unavailable.', cause: 'castle-unavailable' }
      });
      expect(entryProbe.methods).not.toContain('Page.captureScreenshot');
      expect(entryProbe.cleaned).toBe(1);
    });
  });

  it('serves a PTR build at its generated prefix without leaking root aliases or symlinks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'warpkeep-menu-ptr-dist-test-'));
    let server: Awaited<ReturnType<typeof createProductionDistLoopbackServer>> | undefined;
    try {
      await mkdir(join(directory, 'assets'));
      await writeFile(join(directory, 'index.html'), '<script type="module" src="/ptr/assets/app.js"></script>');
      await writeFile(join(directory, 'assets', 'app.js'), 'export {};\n');
      await symlink(join(directory, 'assets', 'app.js'), join(directory, 'assets', 'linked.js'));
      server = await createProductionDistLoopbackServer(directory);
      expect((await fetch(`${server.origin}/ptr/`)).status).toBe(200);
      const asset = await fetch(`${server.origin}/ptr/assets/app.js`);
      expect(asset.status).toBe(200); expect(asset.headers.get('content-type')).toContain('javascript');
      expect((await fetch(`${server.origin}/`)).status).toBe(404);
      expect((await fetch(`${server.origin}/assets/app.js`)).status).toBe(404);
      expect((await fetch(`${server.origin}/ptr/assets/linked.js`)).status).toBe(404);
      expect((await fetch(`${server.origin}/ptr/assets/app.js?cache=1`)).status).toBe(404);
    } finally { await server?.close(); await rm(directory, { force: true, recursive: true }); }
  });

  it('rejects an ambiguous mixed-root/PTR entry instead of silently serving the wrong base', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'warpkeep-menu-base-dist-test-'));
    try {
      await writeFile(join(directory, 'index.html'), '<script src="/assets/app.js"></script><link href="/ptr/assets/app.css">');
      await expect(createProductionDistLoopbackServer(directory)).rejects.toThrow('deployment bases disagreed');
    } finally { await rm(directory, { force: true, recursive: true }); }
  });
});

describe('production title transition frame browser lane', () => {
  it('contains the release-blocking owner case and pairwise matrix axes', () => {
    expect(ownerCase).toMatchObject({
      cycles: 3,
      deviceScaleFactor: 1,
      id: 'owner-full-hd-half-renderer-repeated',
      viewport: { height: 1080, width: 1920 },
      zoomPercent: 100
    });
    expect(ownerCase.shellStress).toMatchObject({
      heightFraction: 0.5,
      scaleX: 2,
      scaleY: 2,
      widthFraction: 0.5
    });
    expect(ownerCase.overlayStress).toMatchObject({
      heightViewportPercent: 200,
      scaleX: 0.5,
      scaleY: 0.5,
      widthViewportPercent: 200
    });
    expect(new Set(
      TITLE_TRANSITION_FRAME_CASES.map((probeCase) => probeCase.deviceScaleFactor)
    )).toEqual(new Set([1, 1.5, 2, 3]));
    expect(new Set(
      TITLE_TRANSITION_FRAME_CASES.map((probeCase) => probeCase.zoomPercent)
    )).toEqual(new Set([80, 100, 125, 150]));
    expect(TITLE_TRANSITION_FRAME_CASES.filter(
      (probeCase) => probeCase.mobile
    ).every((probeCase) => probeCase.zoomPercent === 100)).toBe(true);
    expect(new Set(TITLE_TRANSITION_FRAME_CASES.filter(
      (probeCase) => !probeCase.mobile
    ).map((probeCase) => probeCase.zoomPercent))).toEqual(
      new Set([80, 100, 125, 150])
    );
    expect(new Set(
      TITLE_TRANSITION_FRAME_CASES.map((probeCase) => probeCase.input)
    )).toEqual(new Set(['pointer', 'keyboard', 'touch']));
    expect(TITLE_TRANSITION_FRAME_CASES.some(
      (probeCase) => probeCase.reducedMotion
    )).toBe(true);
    expect(TITLE_TRANSITION_FRAME_CASES).toContainEqual(expect.objectContaining({
      id: 'desktop-mid-transition-resize-pointer',
      midTransitionViewport: { height: 768, width: 1024 }
    }));
  });

  it('uses Chromium browser zoom levels rather than a pinch scale', () => {
    for (const zoomPercent of [80, 100, 125, 150] as const) {
      expect(
        1.2 ** titleTransitionBrowserZoomLevel(zoomPercent)
      ).toBeCloseTo(zoomPercent / 100, 10);
    }
    expect(() => titleTransitionBrowserZoomLevel(90 as 80)).toThrow(TypeError);

    const source = readFileSync(
      resolve(
        process.cwd(),
        'scripts/qa-observer/title-transition-frame-browser-probe.mjs'
      ),
      'utf8'
    );
    expect(source).toContain('default_zoom_level');
    expect(source).toContain("x: titleTransitionBrowserZoomLevel(zoomPercent)");
    expect(source).toContain("session.command('Page.getLayoutMetrics')");
    expect(source).toContain('const cdpVisualViewport = layoutMetrics?.cssVisualViewport');
    expect(source).toContain('initialFrame: publicFrameRecord(initialVisualFrame)');
    expect(source).not.toContain('Emulation.setPageScaleFactor');
  });

  it('derives post-resize CSS viewport dimensions from true browser zoom', () => {
    expect(titleTransitionCssViewport(
      { height: 768, width: 1024 },
      125
    )).toEqual({
      height: 614.4,
      width: 819.2
    });
    expect(() => titleTransitionCssViewport(
      { height: 0, width: 1024 },
      125
    )).toThrow(TypeError);
  });

  it('converts renderer-local gateway coordinates to the client surface', () => {
    expect(
      validateTitleGatewayGeometry(ownerGeometryObservation(), ownerCase)
    ).toMatchObject({
      alignmentErrorCssPixels: 0,
      clientX: 960,
      clientY: 320,
      projectionErrorCssPixels: 0,
      rendererHeight: 540,
      rendererWidth: 960
    });

    const wrong = ownerGeometryObservation();
    wrong.gateway.clientX = 480;
    wrong.gateway.buttonCenterX = 480;
    expect(() => validateTitleGatewayGeometry(wrong, ownerCase)).toThrow(
      TitleTransitionFrameBrowserError
    );
  });

  it('keeps pointer evidence separate from the overlay-local origin', () => {
    const observation = {
      gateway: {
        acceptedPointerX: 1010,
        acceptedPointerY: 345
      },
      overlay: {
        clientHeight: 2160,
        clientWidth: 3840,
        clientX: 960,
        clientY: 320,
        count: 1,
        direction: 'to-menu',
        input: 'pointer',
        localX: 1920,
        localY: 640,
        normalizedU: 0.5,
        normalizedV: 320 / 1080,
        originReady: true,
        originCssX: '50%',
        originCssY: `${320 / 1080 * 100}%`,
        parentBody: true,
        rect: {
          height: 1080,
          left: 0,
          top: 0,
          width: 1920
        },
        sequence: 1,
        visualViewportHeight: 1080,
        visualViewportOffsetLeft: 0,
        visualViewportOffsetTop: 0,
        visualViewportScale: 1,
        visualViewportWidth: 1920,
        visible: true
      },
      viewport: { height: 1080, width: 1920 },
      visualViewport: {
        height: 1080,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        width: 1920
      }
    };
    expect(validateTitleTransitionOverlayGeometry(
      observation,
      {
        direction: 'to-menu',
        gatewayClientPoint: { x: 960, y: 320 },
        input: 'pointer',
        sequence: 1
      },
      ownerCase
    )).toMatchObject({
      clientErrorCssPixels: 0,
      localErrorCssPixels: 0
    });

    observation.overlay.clientX = 1010;
    observation.overlay.localX = 2020;
    expect(() => validateTitleTransitionOverlayGeometry(
      observation,
      {
        direction: 'to-menu',
        gatewayClientPoint: { x: 960, y: 320 },
        input: 'pointer',
        sequence: 1
      },
      ownerCase
    )).toThrow(TitleTransitionFrameBrowserError);
  });

  it('preserves touch as the accepted overlay input contract', () => {
    const touchCase = TITLE_TRANSITION_FRAME_CASES.find(
      (probeCase) => probeCase.input === 'touch'
    )!;
    const observation = {
      gateway: {
        acceptedPointerX: 210,
        acceptedPointerY: 420
      },
      overlay: {
        clientHeight: 844,
        clientWidth: 390,
        clientX: 195,
        clientY: 410,
        count: 1,
        direction: 'to-menu',
        input: 'touch',
        localX: 195,
        localY: 410,
        normalizedU: 0.5,
        normalizedV: 410 / 844,
        originReady: true,
        originCssX: '50%',
        originCssY: `${410 / 844 * 100}%`,
        parentBody: true,
        rect: {
          height: 844,
          left: 0,
          top: 0,
          width: 390
        },
        sequence: 1,
        visualViewportHeight: 844,
        visualViewportOffsetLeft: 0,
        visualViewportOffsetTop: 0,
        visualViewportScale: 1,
        visualViewportWidth: 390,
        visible: true
      },
      viewport: { height: 844, width: 390 },
      visualViewport: {
        height: 844,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        width: 390
      }
    };
    const expected = {
      direction: 'to-menu' as const,
      gatewayClientPoint: { x: 195, y: 410 },
      input: 'touch' as const,
      sequence: 1
    };

    expect(validateTitleTransitionOverlayGeometry(
      observation,
      expected,
      touchCase
    )).toMatchObject({
      clientErrorCssPixels: 0,
      localErrorCssPixels: 0
    });

    observation.overlay.input = 'pointer';
    expect(() => validateTitleTransitionOverlayGeometry(
      observation,
      expected,
      touchCase
    )).toThrow(TitleTransitionFrameBrowserError);
  });

  it('extracts independent gateway and veil centroids from PNG pixels', () => {
    const viewport = { height: 320, width: 320 };
    const center = { x: 160, y: 132 };
    const gateway = syntheticPng(320, 320, (x, y) => {
      const radius = Math.hypot(x - center.x, y - center.y);
      if (radius >= 18 && radius <= 42) return [112, 28, 148];
      return [3, 4, 12];
    });
    const early = syntheticPng(320, 320, (x, y) => (
      Math.hypot(x - center.x, y - center.y) <= 12
        ? [88, 26, 120]
        : [3, 4, 12]
    ));
    const inactive = syntheticPng(320, 320, () => [3, 4, 12]);
    const expanded = syntheticPng(320, 320, (x, y) => (
      Math.hypot(x - center.x, y - center.y) <= 54
        ? [88, 26, 120]
        : [3, 4, 12]
    ));
    try {
      expect(
        analyzeTitleGatewayVisualFrame(gateway, viewport, center)
          .deltaPhysicalPixels
      ).toBeLessThanOrEqual(1);
      const veil = analyzeTitleTransitionFramePair(
        early,
        expanded,
        viewport,
        center
      );
      expect(veil.acceptedDirections).toBeGreaterThanOrEqual(24);
      expect(veil.boundaryRadiusCssPixels).toBeGreaterThan(45);
      expect(veil.deltaPhysicalPixels).toBeLessThanOrEqual(3);
      const firstVisibleEvidence = analyzeTitleTransitionFirstVisibleFrame(
        inactive,
        early,
        viewport,
        center
      );
      expect(firstVisibleEvidence.deltaPhysicalPixels).toBeLessThanOrEqual(1);
      expect(firstVisibleEvidence.searchScope).toBe('full-frame');
    } finally {
      gateway.fill(0);
      inactive.fill(0);
      early.fill(0);
      expanded.fill(0);
    }
  });

  it('finds a displaced transition disk globally instead of accepting an expected-point decoy', () => {
    const viewport = { height: 320, width: 320 };
    const expected = { x: 80, y: 80 };
    const actual = { x: 230, y: 220 };
    const inactive = syntheticPng(320, 320, () => [3, 4, 12]);
    const firstVisible = syntheticPng(320, 320, (x, y) => {
      if (Math.hypot(x - actual.x, y - actual.y) <= 18) return [88, 26, 120];
      if (Math.hypot(x - expected.x, y - expected.y) <= 2) return [112, 28, 148];
      return [3, 4, 12];
    });
    const expanded = syntheticPng(320, 320, (x, y) => {
      if (Math.hypot(x - actual.x, y - actual.y) <= 54) return [88, 26, 120];
      if (Math.hypot(x - expected.x, y - expected.y) <= 2) return [112, 28, 148];
      return [3, 4, 12];
    });
    try {
      const first = analyzeTitleTransitionFirstVisibleFrame(
        inactive,
        firstVisible,
        viewport,
        expected
      );
      expect(first.searchScope).toBe('full-frame');
      expect(Math.hypot(
        first.clientX - actual.x,
        first.clientY - actual.y
      )).toBeLessThanOrEqual(3);
      expect(first.deltaPhysicalPixels).toBeGreaterThan(180);

      const boundary = analyzeTitleTransitionFramePair(
        inactive,
        expanded,
        viewport,
        expected
      );
      expect(boundary.searchScope).toBe('full-frame');
      expect(boundary.clientX).toBeCloseTo(actual.x, 0);
      expect(boundary.clientY).toBeCloseTo(actual.y, 0);
      expect(boundary.deltaPhysicalPixels).toBeGreaterThan(180);
    } finally {
      inactive.fill(0);
      firstVisible.fill(0);
      expanded.fill(0);
    }
  });

  it('serves only canonical regular files from exact loopback', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'warpkeep-title-dist-test-'));
    let server: Awaited<ReturnType<typeof createProductionDistLoopbackServer>>
      | undefined;
    try {
      await writeFile(join(directory, 'index.html'), '<!doctype html>ok\n');
      await writeFile(join(directory, 'app.js'), 'export {};\n');
      await symlink(join(directory, 'app.js'), join(directory, 'linked.js'));
      server = await createProductionDistLoopbackServer(directory);
      const index = await fetch(`${server.origin}/`);
      expect(index.status).toBe(200);
      expect(await index.text()).toContain('doctype');
      expect((await fetch(`${server.origin}/app.js`, {
        method: 'HEAD'
      })).status).toBe(200);
      expect((await fetch(`${server.origin}/linked.js`)).status).toBe(404);
      expect((await fetch(`${server.origin}/app.js?cache=1`)).status).toBe(404);
    } finally {
      await server?.close();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('rejects traversal, alternate hosts, and external browser resources', () => {
    expect(productionAssetRelativePath('/')).toBe('index.html');
    expect(productionAssetRelativePath('/assets/app-123.js')).toBe(
      'assets/app-123.js'
    );
    for (const path of [
      '//outside.test/app.js',
      '/assets/%2e%2e/private',
      '/assets/app.js?debug=1',
      '/assets//app.js',
      '/assets/app%2ejs'
    ]) expect(productionAssetRelativePath(path), path).toBeUndefined();

    const origin = 'http://127.0.0.1:4173';
    for (const url of [
      'about:blank',
      `${origin}/`,
      `${origin}/assets/app.js`,
      `blob:${origin}/00000000-0000-4000-8000-000000000001`,
      'data:image/svg+xml,%3Csvg%2F%3E'
    ]) expect(
      isAllowedTitleTransitionBrowserUrl(url, origin),
      url
    ).toBe(true);
    for (const url of [
      'http://localhost:4173/',
      'http://127.0.0.1:3000/',
      'https://maincloud.spacetimedb.com/',
      'wss://127.0.0.1:4173/',
      'data:text/html,unsafe'
    ]) expect(
      isAllowedTitleTransitionBrowserUrl(url, origin),
      url
    ).toBe(false);
  });

  it('captures the required inspectable frames and repeated directions', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'scripts/qa-observer/title-transition-frame-browser-probe.mjs'
      ),
      'utf8'
    );
    for (const marker of [
      "'activation'",
      "'plus-100ms'",
      "'plus-300ms'",
      "'plus-700ms'",
      "'plus-1200ms'",
      "'pointer'",
      "'keyboard'",
      "'history'",
      "direction: 'to-menu'",
      "direction: 'to-title'",
      "Page.captureScreenshot",
      "'.cache'",
      "'manifest.json'",
      "mode: 0o600",
      'Page.startScreencast',
      'Page.screencastFrameAck',
      'mid-transition-resize'
    ]) expect(source).toContain(marker);
    expect(source).toContain('analyzeTitleGatewayVisualFrame');
    expect(source).toContain('analyzeTitleTransitionFirstVisibleFrame');
    expect(source).toContain('analyzeTitleTransitionFramePair');
    expect(source).toContain(
      "id: 'owner-full-hd-half-renderer-repeated'"
    );
    expect(source).not.toContain('createLoopbackViteServer');
    expect(source).not.toContain("import('vite')");
  });
});
