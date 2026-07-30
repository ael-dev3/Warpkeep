import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  analyzeRenderedWebglPngScreenshot,
  applyNorthernReachRenderedEvidence,
  applyRegionalClimateRenderedEvidence,
  assertNorthernReachRepeatedReducedMotionEvidence,
  assertNorthernReachRenderedVisual,
  assertRegionalClimateRepeatedReducedMotionEvidence,
  assertRegionalClimateRenderedVisual,
  assertSunscouredSouthRenderedTarget,
  applyRenderedWebglActiveWorkerInteraction,
  applyRenderedWebglActiveWorkerReconnectInteraction,
  applyRenderedWebglWorkerLocomotionInteraction,
  applyRenderedWebglActiveForestCameraInteraction,
  applyRenderedWebglCaseInteraction,
  applyRenderedWebglLabelKeyboardInteraction,
  applyRenderedWebglOccupancyStressInteraction,
  applyRenderedWebglResourceOccupantInteraction,
  applyRenderedWebglSfxInteraction,
  applyRenderedWebglWaterOverviewInteraction,
  attestHeadlessChromeCodeSignature,
  closeRenderedWebglLoopbackServer,
  cleanupRenderedWebglProbeResources,
  controlledRendererRecoveryWarningKind,
  DevtoolsPipeSession,
  formatRenderedWebglLocalDiagnostic,
  headlessChromeProbeContract,
  isAllowedRenderedWebglPageUrl,
  isBenignStaleFetchInterceptionError,
  parseHeadlessChromeCodeSignature,
  parseRenderedWebglActiveForestDom,
  parseRenderedWebglActiveWorkerEvidence,
  parseRenderedWebglWorkerLocomotionEvidence,
  parseRenderedWebglBrowserDom,
  parseRenderedWebglInspectorLabelActivationEvidence,
  parseRenderedWebglLabelKeyboardEvidence,
  parseNorthernReachRenderedEvidence,
  parseRegionalClimateRenderedEvidence,
  parseRenderedWebglOccupancyStressEvidence,
  parseRenderedWebglQualityMetrics,
  parseRenderedWebglResourceOccupantEvidence,
  parseRenderedWebglSfxEvidence,
  parseRenderedWebglWaterOverviewEvidence,
  readNorthernReachStaticFrameSignature,
  SUNSCOURED_SOUTH_RENDERED_TARGET_MANIFEST,
  RENDERED_WEBGL_QA_CHROME,
  RENDERED_WEBGL_QA_CHROME_APP,
  RENDERED_WEBGL_QA_CASE_COUNT,
  RENDERED_WEBGL_QA_CHROME_TEAM_ID,
  RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT,
  RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_CONTROLS,
  RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_PRESENCES,
  RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_CELL_COUNT,
  RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_KIND_COUNT,
  RENDERED_WEBGL_QA_VITE_FS_DENY,
  renderedWebglLabelAnchorDistanceTelemetry,
  renderedWebglLabelDisplacementClassificationValid,
  renderedWebglActiveWorkerProbeCase,
  renderedWebglBrowserProbeCases,
  renderedWebglOccupancyStressProbeCase,
  renderedWebglWorkerLocomotionProbeCase,
  renderedWebglWorkerLocomotionProbeCases,
  selectBlankPageTarget,
  spawnHeadlessChromeProbe,
  terminateHeadlessChromeProcessGroup
} from '../scripts/qa-observer/rendered-webgl-browser-probe.mjs';

const EXPECTED_LOCAL_VITE_FS_DENY = Object.freeze([
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
  '**/.secrets/**'
]);

function renderedWebglSfxSession(options: Readonly<{
  failHiddenEmission?: boolean;
  failOfflineCorpus?: boolean;
}> = {}) {
  const snapshot = {
    acceptedLogicalVoiceCount: 0,
    activeVoices: 0,
    contextCreated: false,
    contextState: 'unavailable',
    hidden: false,
    muted: false,
    voiceCap: 16,
    waterAmbienceActive: false,
    waterAmbienceRegime: 'none'
  };
  let audioSwitchVisible = false;
  const actions: string[] = [];
  const command = vi.fn(async (
    method: string,
    parameters?: Readonly<Record<string, unknown>>
  ) => {
    if (method === 'Input.dispatchMouseEvent') {
      if (parameters?.type === 'mouseReleased') {
        snapshot.contextCreated = true;
        snapshot.contextState = 'running';
        snapshot.acceptedLogicalVoiceCount += 1;
        snapshot.activeVoices = 1;
      }
      return {};
    }
    if (method === 'Input.dispatchKeyEvent') {
      if (parameters?.type === 'keyDown') snapshot.contextState = 'running';
      return {};
    }
    if (method !== 'Runtime.evaluate' || typeof parameters?.expression !== 'string') {
      return {};
    }
    const expression = parameters.expression;
    if (expression.includes('getBoundingClientRect()')) {
      return { result: { type: 'object', value: { x: 720, y: 450 } } };
    }
    if (expression.startsWith('Promise.all([')) {
      actions.push('install');
      return { result: { type: 'object', value: { ...snapshot } } };
    }
    const bridgeCall = expression.match(/bridge\.([A-Za-z]+)\(\)/u)?.[1];
    if (!bridgeCall) {
      return { result: { type: 'object', value: null } };
    }
    actions.push(bridgeCall);
    let value: unknown = true;
    switch (bridgeCall) {
      case 'snapshot':
        value = { ...snapshot };
        break;
      case 'emitProbeVoice':
        if (snapshot.hidden && options.failHiddenEmission) {
          throw new Error('synthetic hidden emission failure');
        }
        if (!snapshot.hidden && !snapshot.muted && snapshot.contextState === 'running') {
          snapshot.acceptedLogicalVoiceCount += 1;
          snapshot.activeVoices += 1;
        }
        break;
      case 'renderOfflineCorpus':
        value = !options.failOfflineCorpus;
        break;
      case 'openSettings':
        audioSwitchVisible = true;
        break;
      case 'hasAudioSwitch':
        value = audioSwitchVisible;
        break;
      case 'toggleAudio':
        snapshot.muted = !snapshot.muted;
        break;
      case 'hideVisibility':
        snapshot.hidden = true;
        snapshot.activeVoices = 0;
        snapshot.contextState = 'suspended';
        break;
      case 'restoreVisibility':
        snapshot.hidden = false;
        break;
      case 'settingsClosed':
      case 'closeProfileMenuIfPresent':
      case 'profileMenuClosed':
        break;
      case 'destroy':
        break;
      default:
        value = false;
    }
    return {
      result: {
        type: value !== null && typeof value === 'object' ? 'object' : typeof value,
        value
      }
    };
  });
  return { actions, command, snapshot };
}

function cdpPipeFrame(value: unknown) {
  return Buffer.from(`${JSON.stringify(value)}\0`, 'utf8');
}

function renderedScreenshotPng(
  blank: boolean,
  palette: 'varied' | 'forest' = 'varied'
) {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.byteLength);
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const width = 320;
  const height = 320;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const forestTone = (Math.floor(x / 20) + Math.floor(y / 20)) % 16;
      rows[offset] = blank ? 0
        : palette === 'forest' ? 25 + forestTone * 6
          : (x * 7 + y * 3) & 0xff;
      rows[offset + 1] = blank ? 0
        : palette === 'forest' ? 75 + forestTone * 10
          : (x * 2 + y * 11) & 0xff;
      rows[offset + 2] = blank ? 0
        : palette === 'forest' ? 30 + forestTone * 5
          : (x * 13 + y * 5) & 0xff;
      rows[offset + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function fakeChromePipe() {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    pid: number;
    stdio: Array<PassThrough | null>;
  };
  child.exitCode = null;
  child.signalCode = null;
  child.pid = 4321;
  child.stdio = [null, null, null, new PassThrough(), new PassThrough()];
  return child;
}

const TEST_TARGET_ID = 'ABCDEF1234567890';
const TEST_SESSION_ID = '1234567890ABCDEF';
const TEST_BROWSER_CONTEXT_ID = 'FEDCBA0987654321';

function blankTargetInfo(attached: boolean) {
  return {
    attached,
    browserContextId: TEST_BROWSER_CONTEXT_ID,
    canAccessOpener: false,
    targetId: TEST_TARGET_ID,
    title: '',
    type: 'page',
    url: 'about:blank'
  };
}

async function attachedFakeChromePipe(
  eventHandler: (method: string) => void = () => undefined
) {
  const child = fakeChromePipe();
  const parentWrites = child.stdio[3]!;
  const chromeWrites = child.stdio[4]!;
  const commands: Array<Record<string, unknown>> = [];
  let inbound = Buffer.alloc(0);
  parentWrites.on('data', (chunk: Buffer) => {
    inbound = Buffer.concat([inbound, chunk]);
    for (let delimiter = inbound.indexOf(0); delimiter >= 0; delimiter = inbound.indexOf(0)) {
      const frame = inbound.subarray(0, delimiter);
      inbound = inbound.subarray(delimiter + 1);
      const command = JSON.parse(frame.toString('utf8')) as Record<string, unknown>;
      commands.push(command);
      if (command.method === 'Target.getTargets') {
        chromeWrites.write(cdpPipeFrame({
          id: command.id,
          result: { targetInfos: [blankTargetInfo(false)] }
        }));
      } else if (command.method === 'Target.attachToTarget') {
        chromeWrites.write(cdpPipeFrame({
          method: 'Target.attachedToTarget',
          params: {
            sessionId: TEST_SESSION_ID,
            targetInfo: blankTargetInfo(true),
            waitingForDebugger: false
          }
        }));
        chromeWrites.write(cdpPipeFrame({
          id: command.id,
          result: { sessionId: TEST_SESSION_ID }
        }));
      }
    }
  });
  const pipe = new DevtoolsPipeSession(child as never, eventHandler);
  await pipe.open();
  const target = selectBlankPageTarget(await pipe.browserCommand('Target.getTargets', {
    filter: [{ type: 'page', exclude: false }, { exclude: true }]
  }));
  await pipe.attachToPage(target.targetId);
  return { child, commands, pipe };
}

describe('rendered WebGL headless browser probe contract', () => {
  it('keeps opt-in local failure causes bounded and redacted', () => {
    const error = new Error(
      'Rendered case failed at wss://127.0.0.1:4173/private '
        + '/home/example/token /Volumes/Private/record '
        + 'C:\\Users\\example\\secret \\\\server\\share\\secret',
      {
      cause: new Error(
        'Source /Users/example/private/token.txt '
          + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      )
      }
    );
    const diagnostic = formatRenderedWebglLocalDiagnostic(error);
    expect(diagnostic).toContain('Rendered case failed at [url]');
    expect(diagnostic).toContain('Source [path] [opaque]');
    expect(diagnostic).not.toContain('127.0.0.1');
    expect(diagnostic).not.toContain('/home/');
    expect(diagnostic).not.toContain('/Volumes/');
    expect(diagnostic).not.toContain('/Users/');
    expect(diagnostic).not.toContain('C:\\');
    expect(diagnostic).not.toContain('server\\share');
    expect(diagnostic.length).toBeLessThanOrEqual(1_280);
    expect(formatRenderedWebglLocalDiagnostic('not-an-error')).toBe('unknown');

    const hostile = new Error('ordinary');
    Object.defineProperties(hostile, {
      message: { get: () => { throw new Error('private message getter'); } },
      name: { value: 'Error' },
      cause: { get: () => { throw new Error('private cause getter'); } }
    });
    expect(formatRenderedWebglLocalDiagnostic(hostile)).toBe('Error');

    const nonStringMessage = new Error();
    Object.defineProperty(nonStringMessage, 'message', {
      value: Object.freeze({ private: true })
    });
    expect(formatRenderedWebglLocalDiagnostic(nonStringMessage)).toBe('Error');
  });

  it('zeroizes the source and removes the private profile even if Vite shutdown rejects', async () => {
    const calls: string[] = [];
    const closeFailure = new Error('synthetic Vite close failure');
    const source = { private: true };

    await expect(cleanupRenderedWebglProbeResources({
      castleLodVisualSource: source,
      devtools: { close: () => { calls.push('devtools'); } },
      disposeCastleLodVisualEvidenceSource: (value) => {
        expect(value).toBe(source);
        calls.push('zeroize');
      },
      removeProfile: () => { calls.push('remove-profile'); },
      terminate: () => { calls.push('terminate'); },
      vite: { close: () => {
        calls.push('vite');
        throw closeFailure;
      } }
    })).rejects.toBe(closeFailure);

    expect(calls).toEqual([
      'devtools',
      'terminate',
      'vite',
      'zeroize',
      'remove-profile'
    ]);
  });

  it('closes every tracked loopback socket before awaiting Vite shutdown', async () => {
    const calls: string[] = [];
    const normalSocket = { destroy: () => { calls.push('normal-socket'); } };
    const upgradedSocket = { destroy: () => { calls.push('upgraded-socket'); } };
    const httpServer = {
      close: (callback: (error?: Error) => void) => {
        calls.push('http-close');
        callback();
      },
      closeAllConnections: () => { calls.push('http-connections'); }
    };
    const vite = { close: async () => { calls.push('vite-close'); } };

    await closeRenderedWebglLoopbackServer({
      httpServer,
      sockets: new Set([normalSocket, upgradedSocket]),
      vite
    });

    expect(calls).toEqual([
      'http-close',
      'http-connections',
      'normal-socket',
      'upgraded-socket',
      'vite-close'
    ]);
  });

  it('does not hide a loopback close failure after destroying tracked sockets', async () => {
    const calls: string[] = [];
    const failure = new Error('synthetic loopback close failure');
    const httpServer = {
      close: (callback: (error?: Error) => void) => {
        calls.push('http-close');
        callback(failure);
      },
      closeAllConnections: () => { calls.push('http-connections'); }
    };
    const socket = { destroy: () => { calls.push('socket'); } };
    const vite = { close: async () => { calls.push('vite-close'); } };

    await expect(closeRenderedWebglLoopbackServer({
      httpServer,
      sockets: new Set([socket]),
      vite
    })).rejects.toBe(failure);
    expect(calls).toEqual(['http-close', 'http-connections', 'socket', 'vite-close']);
  });

  it('resolves the complete Vite deny contract instead of replacing its defaults', async () => {
    const { isFileServingAllowed, resolveConfig } = await import('vite');
    const resolved = await resolveConfig({
      configFile: false,
      envFile: false,
      logLevel: 'silent',
      root: process.cwd(),
      server: {
        fs: {
          allow: [process.cwd()],
          deny: [...RENDERED_WEBGL_QA_VITE_FS_DENY],
          strict: true
        }
      }
    }, 'serve', 'development', 'development');

    expect(resolved.server.fs.deny).toEqual(EXPECTED_LOCAL_VITE_FS_DENY);
    for (const relativePath of [
      'services/auth-bridge/.dev.vars.production',
      'services/auth-bridge/signing-key.jwk',
      'services/auth-bridge/admin-secret.txt',
      'services/auth-bridge/credentials.json',
      'services/auth-bridge/.wrangler/state.sqlite',
      '.secrets/qa-observer.key'
    ]) {
      expect(
        isFileServingAllowed(resolved, resolve(process.cwd(), relativePath)),
        relativePath
      ).toBe(false);
    }
    expect(
      isFileServingAllowed(resolved, resolve(process.cwd(), 'src/main.tsx'))
    ).toBe(true);

    const manualDevelopment = await resolveConfig({
      configFile: resolve(process.cwd(), 'vite.config.ts'),
      logLevel: 'silent'
    }, 'serve', 'development', 'development');
    expect(manualDevelopment.server.fs.deny).toEqual(resolved.server.fs.deny);
    for (const relativePath of [
      'services/auth-bridge/.dev.vars.production',
      'services/auth-bridge/signing-key.jwk',
      'services/auth-bridge/.wrangler/state.sqlite'
    ]) {
      expect(
        isFileServingAllowed(manualDevelopment, resolve(process.cwd(), relativePath)),
        `manual:${relativePath}`
      ).toBe(false);
    }
  });

  it('uses an inline fail-closed Vite configuration and disposable cache', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain('configFile: false');
    expect(source).toContain('envFile: false');
    expect(source).toContain(
      'plugins: [warpkeepLocalPublicBoundaryPlugin(), reactPlugin(), ...localQaPlugins]'
    );
    expect(source).toContain('castleLodVisualEvidenceSourceVitePlugin(castleLodVisualSource)');
    expect(source).toContain('runCastleLodVisualEvidenceBrowserCase(devtools');
    expect(source).toContain('onCastleLodVisualEvidence?.(castleLodVisualEvidence)');
    expect(source).toContain('aggregate castle LOD fidelity ${JSON.stringify(lodMetrics)}');
    expect(source).toContain("__WARPKEEP_LOCAL_QA__: 'true'");
    expect(source).toContain('__WARPKEEP_PRODUCT_VERSION__: JSON.stringify(packageJson.version)');
    expect(source).toContain("cacheDir: join(privateRuntime, 'vite-cache')");
    expect(source).toContain('allow: [REPOSITORY_ROOT]');
    expect(source).toContain('deny: RENDERED_WEBGL_QA_VITE_FS_DENY');
    expect(source).toContain('assertCastleLodVisualEvidenceLoopbackBoundary(vite.port)');
    expect(source).toContain('cleanupRenderedWebglProbeResources({');
    expect(source).toContain(
      'options.disposeCastleLodVisualEvidenceSource(options.castleLodVisualSource)'
    );
    expect(source).toContain('await attempt(() => options.removeProfile?.());');
    expect(source).toContain('onCastleLodVisualBoundary?.(castleLodVisualBoundary)');
    expect(source).toContain("'desktop-high',");
    expect(source).toContain("'full-hd-balanced',");
    expect(source).toContain("'desktop-reduced',");
    expect(source).toContain('applyRenderedWebglActiveForestCameraInteraction(');
    expect(source).toContain('await waitForAcceptedActiveForestDom(session');
    expect(source).toContain(
      'observation.forestDecorativeModelReady !== true'
    );
    expect(source).toContain(
      '.realm-cell-navigator__castles[aria-label="Founded castles"] > li > button'
    );
    expect(source).toContain(
      "canvas[data-realm-canvas-active=\"true\"]"
    );
    expect(source).toContain(
      "map?.getAttribute('data-realm-camera-presentation-band')"
    );
    expect(source).toContain(
      "canvas?.getAttribute('data-realm-camera-presentation-band')"
    );
    expect(source).toContain(
      '.realm-cell-navigator__resource-site[data-resource-kind][data-resource-state]'
    );
    expect(source).toContain('exploreVisibleOpaqueCopyCount');
    expect(source).toContain('exploreVisibleCoordinateCopyCount');
    for (const attribute of [
      'data-forest-decorative-tree-count',
      'data-forest-decorative-triangle-count',
      'data-forest-decorative-draw-calls',
      'data-forest-decorative-cache-entries',
      'data-forest-decorative-cache-high-water-mark',
      'data-forest-decorative-model-ready',
      'data-forest-decorative-using-fallback',
      'data-forest-decorative-overview-hidden'
    ]) {
      expect(source).toContain(`map?.getAttribute('${attribute}')`);
    }
    expect(source).toContain(
      "const exactBoolean = (value) => value === 'true' ? true : value === 'false' ? false : null"
    );
    expect(source).not.toContain("'.realm-cell-navigator__castles button'");
    expect(RENDERED_WEBGL_QA_VITE_FS_DENY).toEqual(EXPECTED_LOCAL_VITE_FS_DENY);
    expect(source).toContain('attestStableHeadlessChromeExecutable(reviewedChromeIdentity)');
    expect(source).toContain('readReviewedChromeExecutableIdentity()');
    expect(source).toContain("'--remote-debugging-pipe'");
    expect(source).toContain("stdio: Object.freeze(['ignore', 'ignore', 'ignore', 'pipe', 'pipe'])");
    expect(source).not.toContain('DevToolsActivePort');
    expect(source).not.toContain("'/json/list'");
    expect(source).not.toContain('new WebSocket(');
    expect(source).not.toMatch(/--remote-debugging-(?:address|port)=/);
    expect(source).toContain("await devtools.browserCommand('Target.getTargets', {");
    expect(source).toContain("method === 'Target.targetDestroyed'");
    expect(source).toContain("method === 'Target.targetCrashed'");
    expect(source).toContain("method === 'Target.detachedFromTarget'");
    expect(source).toContain("method === 'Inspector.detached'");
  });

  it('requires a real trusted SFX lifecycle without exposing event payloads', () => {
    const evidence = {
      exactLogicalVoice: true,
      hiddenSuspended: true,
      hiddenSuppressed: true,
      mutedSuppressed: true,
      offlineCorpusRendered: true,
      pregestureAbsent: true,
      restoredTrustedResume: true,
      trustedActivation: true
    };
    expect(parseRenderedWebglSfxEvidence(evidence)).toEqual(evidence);
    expect(() => parseRenderedWebglSfxEvidence({
      ...evidence,
      exactLogicalVoice: false
    })).toThrow(/SFX evidence/i);
    expect(() => parseRenderedWebglSfxEvidence({
      ...evidence,
      eventKind: 'ui-open'
    })).toThrow(/SFX evidence/i);
    expect(() => parseRenderedWebglSfxEvidence({
      ...evidence,
      offlineCorpusRendered: false
    })).toThrow(/SFX evidence/i);

    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    const lifecycleSource = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-sfx-lifecycle.mjs'
    ), 'utf8');
    const harnessSource = readFileSync(resolve(
      process.cwd(),
      'src/dev/RenderedWebglQaHarness.tsx'
    ), 'utf8');
    expect(source).toContain(
      "const RENDERED_WEBGL_QA_SFX_CASE_ID = 'desktop-balanced-player'"
    );
    expect(source).toContain(
      "from './rendered-webgl-sfx-lifecycle.mjs'"
    );
    expect(source).toMatch(
      /probeCase\.id === RENDERED_WEBGL_QA_SFX_CASE_ID[\s\S]*applyRenderedWebglSfxInteraction/
    );
    expect(source).not.toContain('__warpkeepRenderedWebglSfxLifecycleV1');
    expect(source).not.toContain("import('/src/dev/RenderedWebglQaHarness.tsx')");
    expect(source).not.toContain('waitForRenderedWebglSfxSnapshot');
    expect(lifecycleSource).not.toContain(
      "from './rendered-webgl-browser-probe.mjs'"
    );
    expect(lifecycleSource).toContain(
      "import('/src/dev/RenderedWebglQaHarness.tsx')"
    );
    expect(lifecycleSource).not.toContain(
      "import('/src/components/audio/sfxEvents.ts')"
    );
    expect(lifecycleSource).toContain('harness.emitRenderedWebglQaProbeSfx()');
    expect(lifecycleSource).toContain(
      'harness.proveRenderedWebglQaOfflineSfxCorpus()'
    );
    expect(lifecycleSource).not.toContain("kind: 'command-failed'");
    expect(lifecycleSource).not.toContain('measureWarpkeepAudioBuffer');
    expect(lifecycleSource).not.toContain('renderWarpkeepSfxEventOffline');
    expect(lifecycleSource).not.toContain('spectralCentroidHz');
    expect(harnessSource).toContain('measureWarpkeepAudioBuffer(buffer)');
    expect(harnessSource).toContain('renderWarpkeepSfxEventOffline(event, 22_050)');
    expect(harnessSource).toContain(
      'WARPKEEP_SFX_EVENT_KINDS.every((kind) => renderedKinds.has(kind))'
    );
    expect(harnessSource).toContain(
      "{ kind: 'ui-press', emphasis: 'quiet' }"
    );
    expect(harnessSource).toContain(
      "{ kind: 'ui-press', emphasis: 'primary' }"
    );
    expect(harnessSource).toContain(
      "{ kind: 'select-water', regime: 'ocean', screenX: 400 }"
    );
    expect(lifecycleSource).not.toContain('new MessageChannel()');
    expect(lifecycleSource).not.toContain('const yieldTask =');
    expect(lifecycleSource).toContain('waitForRenderedWebglSfxSnapshot');
    expect(lifecycleSource).toContain(
      'await delay(Math.min(RENDERED_WEBGL_QA_SFX_POLL_INTERVAL_MILLISECONDS'
    );
    expect(lifecycleSource).toContain(
      "['restoreVisibility', 'final visibility restoration']"
    );
    expect(lifecycleSource).toContain("['destroy', 'bridge teardown']");
    expect(lifecycleSource).toMatch(
      /finally \{[\s\S]*cleanupRenderedWebglSfxBridge\(session\)/
    );
    expect(lifecycleSource).toMatch(
      /mousePressed[\s\S]*mouseReleased[\s\S]*applyRenderedWebglSfxInteraction/
    );
    expect(lifecycleSource).toContain(
      "document.dispatchEvent(new Event('visibilitychange'))"
    );
    expect(lifecycleSource).toContain("snapshot.contextState === 'suspended'");
    expect(lifecycleSource).toContain(
      "'.warpkeep-settings__actions button:last-child'"
    );
  });

  it('drives SFX lifecycle polling from the host and restores visibility before teardown', async () => {
    const session = renderedWebglSfxSession();

    await expect(applyRenderedWebglSfxInteraction(session)).resolves.toEqual({
      exactLogicalVoice: true,
      hiddenSuspended: true,
      hiddenSuppressed: true,
      mutedSuppressed: true,
      offlineCorpusRendered: true,
      pregestureAbsent: true,
      restoredTrustedResume: true,
      trustedActivation: true
    });

    const runtimeEvaluations = session.command.mock.calls.filter(([method]) => (
      method === 'Runtime.evaluate'
    ));
    expect(runtimeEvaluations.filter(([, parameters]) => (
      parameters?.awaitPromise === true
    ))).toHaveLength(2);
    expect(runtimeEvaluations.every(([, parameters]) => (
      typeof parameters?.expression !== 'string'
      || (
        !parameters.expression.includes('new MessageChannel()')
        && !parameters.expression.includes('requestAnimationFrame')
        && !parameters.expression.includes('setTimeout')
      )
    ))).toBe(true);
    expect(session.actions.filter((action) => action === 'restoreVisibility').length)
      .toBeGreaterThanOrEqual(2);
    expect(session.actions.at(-1)).toBe('destroy');
    expect(session.command.mock.calls.filter(([method]) => (
      method === 'Input.dispatchMouseEvent'
    ))).toHaveLength(6);
    expect(session.command.mock.calls.filter(([method]) => (
      method === 'Input.dispatchKeyEvent'
    ))).toHaveLength(0);
  });

  it('restores the visibility override when a hidden-phase SFX command fails', async () => {
    const session = renderedWebglSfxSession({ failHiddenEmission: true });

    await expect(applyRenderedWebglSfxInteraction(session)).rejects.toThrow(
      /hidden logical voice emission/i
    );
    expect(session.snapshot.hidden).toBe(false);
    expect(session.actions).toContain('restoreVisibility');
    expect(session.actions.at(-1)).toBe('destroy');
  });

  it('tears down before any live gesture when the anonymous offline corpus proof fails', async () => {
    const session = renderedWebglSfxSession({ failOfflineCorpus: true });

    await expect(applyRenderedWebglSfxInteraction(session)).rejects.toThrow(
      /offline corpus proof failed/i
    );
    expect(session.actions).toContain('renderOfflineCorpus');
    expect(session.actions.at(-1)).toBe('destroy');
    expect(session.command.mock.calls.filter(([method]) => (
      method === 'Input.dispatchMouseEvent'
    ))).toHaveLength(0);
  });

  it('enters the active forest range through deterministic keyboard focus and bounded canvas wheel input', async () => {
    const command = vi.fn(async (
      method: string,
      parameters?: Readonly<Record<string, unknown>>
    ) => method === 'Runtime.evaluate'
      && typeof parameters?.expression === 'string'
      && (
        parameters.expression.includes('document.activeElement === root')
        || parameters.expression.includes('data-realm-camera-settled')
      )
      ? {
          result: {
            type: 'boolean',
            value: true
          }
        }
      : method === 'Runtime.evaluate'
        ? {
          result: {
            type: 'object',
            value: { x: 720, y: 450 }
          }
        }
        : {});

    await expect(applyRenderedWebglActiveForestCameraInteraction({
      command
    })).resolves.toEqual({ wheelStepCount: 5 });

    const wheelCalls = command.mock.calls.filter(([method]) => (
      method === 'Input.dispatchMouseEvent'
    ));
    const keyCalls = command.mock.calls.filter(([method]) => (
      method === 'Input.dispatchKeyEvent'
    ));
    expect(keyCalls).toHaveLength(4);
    expect(wheelCalls).toHaveLength(5);
    wheelCalls.forEach(([, parameters]) => {
      expect(parameters).toEqual({
        type: 'mouseWheel',
        x: 720,
        y: 450,
        deltaX: 0,
        deltaY: -250,
        button: 'none',
        buttons: 0,
        pointerType: 'mouse'
      });
    });
  });

  it('records only structural inspector label activation evidence', async () => {
    expect(parseRenderedWebglInspectorLabelActivationEvidence({
      inspectorLabelActivated: true
    })).toEqual({ inspectorLabelActivated: true });
    expect(() => parseRenderedWebglInspectorLabelActivationEvidence({
      inspectorLabelActivated: false
    })).toThrow(/inspector label evidence/i);
    expect(() => parseRenderedWebglInspectorLabelActivationEvidence({
      castleId: 1,
      inspectorLabelActivated: true
    })).toThrow(/inspector label evidence/i);

    const command = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>
    ) => {
      if (method === 'Runtime.evaluate') {
        return {
          result: {
            type: 'object',
            value: { inspectorLabelActivated: true }
          }
        };
      }
      return {};
    });

    await expect(applyRenderedWebglCaseInteraction({ command }, 'inspector')).resolves.toEqual({
      inspectorLabelActivated: true
    });
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining('button.realm-castle-label'),
      returnByValue: true
    }));
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining('target.click()')
    }));
  });

  it('keeps occupied-node rendered proof boolean-only and camera neutral', async () => {
    const evidence = {
      cameraNeutral: true,
      cameraNeutralAfterClose: true,
      cameraAnchorPopulationValid: true,
      cameraIndependentAnchorCoverage: true,
      cameraNeutralWhileOpen: true,
      compactOverviewCullingValid: false,
      factsCorrect: true,
      focusedControlActivation: true,
      identityRecordCorrect: true,
      identityRoleCorrect: true,
      identityTitleCorrect: true,
      identityUsernameCorrect: true,
      keyboardControlCountBounded: true,
      layeringValid: true,
      markerControlVisible: true,
      markerGeometryValid: true,
      markerPortraitReady: true,
      markerPortraitElementPresent: true,
      markerPresent: true,
      markerProjectedVisible: true,
      markerHitTestable: true,
      overviewPresenceDirectHit: true,
      overviewRecordCorrect: true,
      overviewTargetPassiveOnly: true,
      presenceComputedVisible: true,
      presenceAvatarGeometryValid: true,
      presenceGeometryValid: true,
      presenceDelegatedActivation: true,
      presenceHitTestable: true,
      presencePointerActivatable: true,
      presencePortraitElementPresent: true,
      presencePortraitReady: true,
      presenceVisible: true,
      privacyBounded: true,
      recordHeaderCorrect: true,
      reducedMotionPreferenceCorrect: true,
      publicRecordCorrect: true,
      publicRecordOpened: true,
      rendererStable: true,
      workerRecordCorrect: true
    } as const;
    expect(parseRenderedWebglResourceOccupantEvidence(evidence)).toEqual(evidence);
    const compactEvidence = {
      ...evidence,
      cameraNeutral: false,
      cameraNeutralAfterClose: false,
      cameraAnchorPopulationValid: false,
      cameraIndependentAnchorCoverage: false,
      cameraNeutralWhileOpen: false,
      compactOverviewCullingValid: true,
      overviewPresenceDirectHit: false,
      overviewRecordCorrect: false,
      overviewTargetPassiveOnly: false,
      presenceComputedVisible: false,
      presenceAvatarGeometryValid: false,
      presenceGeometryValid: false,
      presenceDelegatedActivation: false,
      presenceHitTestable: false,
      presencePointerActivatable: false,
      presencePortraitElementPresent: false,
      presencePortraitReady: false,
      presenceVisible: false
    } as const;
    expect(parseRenderedWebglResourceOccupantEvidence(compactEvidence))
      .toEqual(compactEvidence);
    expect(() => parseRenderedWebglResourceOccupantEvidence({
      ...evidence,
      rendererStable: false
    })).toThrow(/resource occupant evidence/i);
    expect(() => parseRenderedWebglResourceOccupantEvidence({
      ...evidence,
      fid: 1
    })).toThrow(/resource occupant evidence/i);

    const command = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => method === 'Runtime.evaluate'
      ? { result: { type: 'object', value: evidence } }
      : {});
    await expect(applyRenderedWebglResourceOccupantInteraction(
      { command },
      'observer'
    )).resolves.toEqual(evidence);
    const evaluation = command.mock.calls.find(([method]) => method === 'Runtime.evaluate');
    expect(evaluation?.[1]).toMatchObject({
      awaitPromise: true,
      returnByValue: true
    });
    expect(evaluation?.[2]).toBe(60_000);
    const expression = String(evaluation?.[1]?.expression);
    expect(expression).toContain('gold:genesis-001-tier1-gold-03');
    expect(expression).toContain('gold:genesis-001-tier1-gold-11');
    expect(expression).toContain('navigateToOccupiedSite(target)');
    expect(expression).toContain(
      "'.realm-cell-navigator__resource-site'"
    );
    expect(expression).toContain(
      "button.getAttribute('data-resource-state') === 'occupied'"
    );
    expect(expression).toContain(
      "document.querySelector('.realm-cell-navigator__jump') !== null"
    );
    expect(expression).toContain('resourceButton.scrollIntoView({');
    expect(expression).toContain('const inspectorReady = await waitFor(() => {');
    expect(expression).toContain(
      'const inspector = document.querySelector(inspectorSelector);'
    );
    expect(expression).toContain(
      'if (!inspectorReady || !(inspector instanceof HTMLElement)) return false;'
    );
    expect(expression).toContain(
      "root.getAttribute('data-realm-camera-target-kind') === 'cell-location'"
    );
    expect(expression).toContain(
      "canvas.getAttribute('data-realm-camera-settled') === 'true'"
    );
    expect(expression).toContain(
      'cameraSettledAfter(previousCameraToken)'
    );
    expect(expression).toContain(
      'currentToken !== previousToken'
    );
    expect(expression).toContain("resource: 'gold'");
    expect(expression).toContain("resource: 'food'");
    expect(expression).toContain("resource: 'wood'");
    expect(expression).toContain("resource: 'stone'");
    expect(expression).toContain("'.realm-cell-navigator__presets button'");
    expect(expression).toContain("(button.textContent ?? '').trim() === 'Realm'");
    expect(expression).toContain('PUBLIC EXPEDITION RECORD');
    expect(expression).toContain(
      "expectedMode === 'observer'"
    );
    expect(expression).toContain("!overviewFacts.has('Castle location')");
    expect(expression).toMatch(
      /matchMedia\(\s*'\(prefers-reduced-motion: reduce\)'/
    );
    expect(expression).toContain(
      'const cameraNeutralWhileOpen = cameraProjectionStable('
    );
    expect(expression).toContain('const projectedPresence = overviewPresentation()');
    expect(expression).toMatch(/beforeProjection,\s+duringProjection/);
    expect(expression).toContain('beforeRenderer === duringRenderer');
    expect(expression).toContain('subtreePrivacyBounded(panel)');
    expect(expression).toContain('overviewPresenceBounds.width >= 43');
    expect(expression).toContain('overviewPresenceAvatarBounds.width >= 31');
    expect(expression).toContain(
      "getComputedStyle(overviewPresence).pointerEvents === 'auto'"
    );
    expect(expression).toContain("getComputedStyle(presenceLayer).pointerEvents === 'none'");
    expect(expression).toContain('focusedPresence === undefined');
    expect(expression).toContain('overviewMarker === undefined');
    expect(expression).toContain('overviewDirectHit.click()');
    expect(expression).toContain('independentStableAnchorCount(beforeProjection, duringProjection) >= 3');
    expect(expression).toContain('keyboardControls.length <= 24');
    expect(expression).toContain("'button.realm-castle-label'");
    expect(expression).toContain('Number.isFinite(entry[1])');
    expect(expression).not.toMatch(
      /button\.realm-castle-label[\s\S]{0,240}&& visible\(label\)/
    );
    expect(expression).toContain('presenceLayer.parentElement === map');
    expect(expression).toContain('Number.parseInt(getComputedStyle(castleLayer).zIndex, 10) === 4');
    expect(expression).toContain('document.elementFromPoint(');
    expect(expression).toContain(
      'canvas[data-profile-image-state="ready"]'
    );
    expect(expression).not.toContain('return {\\n        fid');

    await expect(applyRenderedWebglResourceOccupantInteraction(
      { command },
      'unreviewed' as never
    )).rejects.toThrow(/presentation mode/i);
    await expect(applyRenderedWebglResourceOccupantInteraction(
      { command },
      'observer',
      'reduce' as never
    )).rejects.toThrow(/reduced-motion expectation/i);

    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toMatch(
      /RENDERED_WEBGL_QA_RESOURCE_OCCUPANT_CASE_IDS[\s\S]*'desktop-reduced'[\s\S]*'mobile-reduced-inspector'/
    );
    expect(source).toContain("name: 'prefers-reduced-motion'");
    expect(source).toContain('probeCase.expectedReducedMotion === true');
    expect(source).toContain("probeCase.expectedQuality === 'reduced'");
    expect(source).toMatch(
      /if \(RENDERED_WEBGL_QA_MAP_GESTURE_CASES\.has\(probeCase\.id\)\) \{\s+await waitForRenderedWebglCameraSettled\(session\);\s+await applyRenderedWebglMapGestureInteraction/
    );
    expect(renderedWebglBrowserProbeCases(41_733)).toContainEqual(
      expect.objectContaining({
        id: 'mobile-balanced-persistent-labels',
        expectedQuality: 'balanced',
        expectedReducedMotion: true
      })
    );
  });

  it('accepts only complete privacy-safe rendered quality metrics', () => {
    const qualityMetrics = {
      cameraMode: 'approach',
      cameraProjectionCount: 12,
      cameraProjectionToken: '1a2b3c4d',
      cameraStateToken: '1a2b3c4d'.repeat(3),
      cameraSynchronized: true,
      cameraTargetKind: 'realm',
      cameraZoom: '1.250000',
      decorativeForestCacheEntries: 1,
      decorativeForestCacheHighWaterMark: 1,
      decorativeForestCacheLimit: 2,
      decorativeForestDrawCalls: 1,
      decorativeForestInstances: 10,
      decorativeForestMotionState: 'static',
      decorativeForestTriangles: 100,
      grassAnimated: true,
      grassTargetAnimationCadence: 30,
      grassCacheEntries: 1,
      grassCacheHighWaterMark: 1,
      grassCacheLimit: 2,
      grassDrawCalls: 1,
      grassInstances: 20,
      grassTriangles: 200,
      presentationBand: 'strategy',
      quality: 'high',
      routeDrawCalls: 1,
      routeSegments: 2,
      routeTriangles: 4,
      routeVisible: 1,
      sharedForestInstances: 210,
      sharedForestTriangles: 1_000,
      terrainDetailDrawCalls: 2,
      terrainDetailInstances: 100,
      terrainTriangles: 10_000,
      viewportHeight: 900,
      viewportWidth: 1_440,
      waterDrawCalls: 4,
      waterTriangles: 1_000,
      workerAnimated: 1,
      workerAnimationTransitions: 0,
      workerFallbackTriangles: 0,
      workerModels: 1,
      workerPresented: 1
    } as const;

    expect(parseRenderedWebglQualityMetrics(qualityMetrics)).toEqual(
      qualityMetrics
    );
    expect(() => parseRenderedWebglQualityMetrics({
      ...qualityMetrics,
      cameraSynchronized: false
    })).toThrow(/quality metrics/i);
    expect(() => parseRenderedWebglQualityMetrics({
      ...qualityMetrics,
      cameraZoom: '1.25'
    })).toThrow(/quality metrics/i);
    expect(() => parseRenderedWebglQualityMetrics({
      ...qualityMetrics,
      cameraProjectionToken: 'not-a-token'
    })).toThrow(/quality metrics/i);
    expect(() => parseRenderedWebglQualityMetrics({
      ...qualityMetrics,
      cameraStateToken: 'not-a-token'
    })).toThrow(/quality metrics/i);
    expect(() => parseRenderedWebglQualityMetrics({
      ...qualityMetrics,
      grassAnimated: null
    })).toThrow(/quality metrics/i);
    expect(() => parseRenderedWebglQualityMetrics({
      ...qualityMetrics,
      privateIdentity: 'must-not-cross-the-probe-boundary'
    })).toThrow(/quality metrics/i);
  });

  it('proves active generic Worker owner, foreign, mobile, reconnect, and recovery UX locally', async () => {
    const activeEvidence = {
      activeFixtureSelected: true,
      foreignMarkerGeneric: true,
      foreignPortraitReady: true,
      foreignRecordReadOnly: true,
      mobileBoundsSafe: true,
      ownerCommandCenterAvailable: true,
      ownerRecallControlsAvailable: true,
      ownerRosterExact: true,
      privacyBounded: true,
      rendererContextRecovered: true,
      rendererStable: true
    } as const;
    const completeEvidence = {
      ...activeEvidence,
      localReconnectRehydrated: true
    } as const;
    expect(parseRenderedWebglActiveWorkerEvidence(completeEvidence)).toEqual(
      completeEvidence
    );
    expect(() => parseRenderedWebglActiveWorkerEvidence({
      ...completeEvidence,
      foreignRecordReadOnly: false
    })).toThrow(/active Worker evidence/i);
    expect(() => parseRenderedWebglActiveWorkerEvidence({
      ...completeEvidence,
      workerId: 'private'
    })).toThrow(/active Worker evidence/i);

    const activeCommand = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => method === 'Runtime.evaluate'
      ? { result: { type: 'object', value: activeEvidence } }
      : {});
    await expect(applyRenderedWebglActiveWorkerInteraction({
      command: activeCommand
    })).resolves.toEqual(activeEvidence);
    const activeEvaluation = activeCommand.mock.calls.find(([method]) => (
      method === 'Runtime.evaluate'
    ));
    expect(activeEvaluation?.[1]).toMatchObject({
      awaitPromise: true,
      returnByValue: true
    });
    expect(activeEvaluation?.[2]).toBe(80_000);
    const activeExpression = String(activeEvaluation?.[1]?.expression);
    expect(activeExpression).toContain("overlay.dataset.fixtureVariant === 'worker-active'");
    expect(activeExpression).toContain("'1/4 deployed · manage workers'");
    expect(activeExpression).toContain("=== 'Worker 1|Worker 2|Worker 3|Worker 4'");
    expect(activeExpression).toContain("=== '5 Gold'");
    expect(activeExpression).toContain("=== 'PUBLIC WORKER RECORD'");
    expect(activeExpression).toContain("=== 'generic-worker'");
    expect(activeExpression).toContain(
      "'.realm-cell-navigator__resource-site'"
    );
    expect(activeExpression).toContain(
      '[data-resource-kind="gold"][data-resource-state="occupied"]'
    );
    expect(activeExpression).toContain(
      "navigator.querySelector('.realm-cell-navigator__jump') === null"
    );
    expect(activeExpression).toContain('semanticResourceBounds.width >= 44');
    expect(activeExpression).toContain('semanticResourceBounds.height >= 44');
    expect(activeExpression).toContain('semanticResourceNavigationSafe');
    expect(activeExpression).toContain("canvas[data-profile-image-state=\"ready\"]");
    expect(activeExpression).toContain("getExtension('WEBGL_lose_context')");
    expect(activeExpression).toContain('contextController.loseContext()');
    expect(activeExpression).toContain('contextController.restoreContext()');
    expect(activeExpression).toContain("map?.dataset.rendererFailure === 'none'");
    expect(activeExpression).not.toContain('return {\\n        workerId');
    expect(activeExpression).not.toContain('return {\\n        fid');

    const reconnectCommand = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => method === 'Runtime.evaluate'
      ? { result: { type: 'boolean', value: true } }
      : {});
    await expect(applyRenderedWebglActiveWorkerReconnectInteraction({
      command: reconnectCommand
    })).resolves.toEqual({ localReconnectRehydrated: true });
    const reconnectExpression = String(
      reconnectCommand.mock.calls.find(([method]) => method === 'Runtime.evaluate')?.[1]?.expression
    );
    expect(reconnectExpression).toContain("overlay.dataset.fixtureVariant !== 'worker-active'");
    expect(reconnectExpression).toContain(
      "document.querySelectorAll('.worker-command-center__roster > li').length === 4"
    );

    expect(renderedWebglActiveWorkerProbeCase(41_733)).toEqual({
      id: 'mobile-balanced-worker-active',
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 4,
      url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html'
        + '?quality=balanced&mode=player&fixture=worker-active',
      viewport: { width: 390, height: 844 }
    });
    expect(() => renderedWebglActiveWorkerProbeCase(0)).toThrow(/port/i);

    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain(
      'await runRenderedActiveWorkerCase(devtools, activeWorkerCase, state)'
    );
    expect(source).toContain('activeWorkerCase.url');
    expect(source).toContain('state.controlledRendererRecovery');
    expect(source).toContain('CONTROLLED_RENDERER_MAXIMUM_STALE_DELETE_WARNINGS');
    expect(source).toContain('state.controlledRendererWarningThrottleSeen');
    expect(source).toContain('one active generic ');
  });

  it('requires a strict six-case privacy-safe real-GLB Worker locomotion matrix', async () => {
    const cases = renderedWebglWorkerLocomotionProbeCases(41_733);
    const telemetryFor = (
      wheelDrivenCount: number,
      animatedCount: number,
      gatheringIdleCount: number,
      modelCount: number,
      movingCount: number
    ) => ({
      clipIdleCount: gatheringIdleCount,
      clipStartCount: 0,
      clipStopCount: 0,
      clipTurnLeftCount: 0,
      clipTurnRightCount: 0,
      clipWalkCount: movingCount,
      cruisingCount: movingCount,
      gatheringIdleCount,
      lateModelPhaseRestorationCount: modelCount,
      maximumHeadingError: 0.02,
      maximumPositionCorrection: 0.01,
      maximumSpeed: 0.25,
      modelPhaseRestorationCount: modelCount,
      movingCount,
      oneShotOverrunCount: 0,
      repeatedTurnSuppressionCount: 0,
      renderedClipIdleCount: animatedCount > 0 ? gatheringIdleCount : 0,
      renderedClipStartCount: 0,
      renderedClipStopCount: 0,
      renderedClipTurnLeftCount: 0,
      renderedClipTurnRightCount: 0,
      renderedClipWalkCount: animatedCount > 0 ? movingCount : 0,
      reversalCount: 0,
      startingCount: 0,
      stoppingCount: 0,
      turningCount: 0,
      wheelDistanceMismatchCount: 0,
      wheelDrivenCount
    });
    const evidenceFor = (probeCase: (typeof cases)[number]) => {
      const telemetry = telemetryFor(
        probeCase.workerLocomotion.expectedWheelDrivenCount,
        probeCase.workerLocomotion.expectedAnimatedCount,
        probeCase.workerLocomotion.expectedGatheringIdleCount,
        probeCase.workerLocomotion.expectedModelCount,
        probeCase.workerLocomotion.expectedMovingCount
      );
      const samples = Array.from({ length: 32 }, (_, index) => {
        const phase = index < 16 ? 'outbound' as const : 'returning' as const;
        const phaseIndex = index % 16;
        return {
          elapsedMilliseconds: 33 + index * 48,
          rootProjections: [{
            phase,
            x: phase === 'outbound'
              ? Math.min(probeCase.viewport.width - 1, 120 + phaseIndex * 0.2)
              : Math.min(probeCase.viewport.width - 1, 240 - phaseIndex * 0.25),
            y: Math.min(
              probeCase.viewport.height - 1,
              phase === 'outbound' ? 140 : 150
            )
          }],
          telemetry
        };
      });
      const phaseMovement = (phase: 'outbound' | 'returning') => {
        const positions = samples.flatMap((sample) => (
          sample.rootProjections.filter((root) => root.phase === phase)
        ));
        const first = positions[0]!;
        const last = positions.at(-1)!;
        return Math.hypot(last.x - first.x, last.y - first.y);
      };
      return {
        approvedAssetLoaded: true,
        animatedCount: probeCase.workerLocomotion.expectedAnimatedCount,
        assetProfile: probeCase.workerLocomotion.assetProfile,
        caseId: probeCase.id,
        fallbackCount: 0,
        fixtureSelected: true,
        modelCount: probeCase.workerLocomotion.expectedModelCount,
        movementPixels: {
          outbound: phaseMovement('outbound'),
          returning: phaseMovement('returning')
        },
        presentedCount: 400,
        quality: probeCase.expectedQuality,
        readinessSatisfied: true,
        reducedMotion: probeCase.expectedReducedMotion === true,
        rendererStable: true,
        samples,
        viewportHeight: probeCase.viewport.height,
        viewportWidth: probeCase.viewport.width,
        visibleProjectionCount: 1,
        wheelDrivenCount:
          probeCase.workerLocomotion.expectedWheelDrivenCount
      } as const;
    };
    const evidence = cases.map(evidenceFor);

    expect(cases.map((probeCase) => ({
      id: probeCase.id,
      fixtureVariant: probeCase.workerLocomotion.fixtureVariant,
      climate: probeCase.workerLocomotion.climate,
      quality: probeCase.expectedQuality,
      reducedMotion: probeCase.expectedReducedMotion === true,
      viewport: probeCase.viewport,
      assetProfile: probeCase.workerLocomotion.assetProfile,
      animatedCount: probeCase.workerLocomotion.expectedAnimatedCount,
      gatheringIdleCount:
        probeCase.workerLocomotion.expectedGatheringIdleCount,
      modelCount: probeCase.workerLocomotion.expectedModelCount,
      movingCount: probeCase.workerLocomotion.expectedMovingCount,
      wheelDrivenCount:
        probeCase.workerLocomotion.expectedWheelDrivenCount
    }))).toEqual([
      {
        id: 'full-hd-high-worker-locomotion',
        fixtureVariant: 'worker-locomotion',
        climate: 'center',
        quality: 'high',
        reducedMotion: false,
        viewport: { width: 1_920, height: 1_080 },
        assetProfile: 'high',
        animatedCount: 3,
        gatheringIdleCount: 1,
        modelCount: 3,
        movingCount: 2,
        wheelDrivenCount: 3
      },
      {
        id: 'desktop-balanced-worker-locomotion',
        fixtureVariant: 'worker-locomotion',
        climate: 'center',
        quality: 'balanced',
        reducedMotion: false,
        viewport: { width: 1_440, height: 900 },
        assetProfile: 'balanced',
        animatedCount: 3,
        gatheringIdleCount: 1,
        modelCount: 3,
        movingCount: 2,
        wheelDrivenCount: 3
      },
      {
        id: 'short-landscape-reduced-worker-locomotion',
        fixtureVariant: 'worker-locomotion',
        climate: 'center',
        quality: 'reduced',
        reducedMotion: false,
        viewport: { width: 667, height: 375 },
        assetProfile: 'compact',
        animatedCount: 0,
        gatheringIdleCount: 1,
        modelCount: 3,
        movingCount: 2,
        wheelDrivenCount: 3
      },
      {
        id: 'mobile-reduced-motion-worker-locomotion',
        fixtureVariant: 'worker-locomotion',
        climate: 'center',
        quality: 'reduced',
        reducedMotion: true,
        viewport: { width: 390, height: 844 },
        assetProfile: 'compact',
        animatedCount: 0,
        gatheringIdleCount: 1,
        modelCount: 3,
        movingCount: 2,
        wheelDrivenCount: 0
      },
      {
        id: 'desktop-balanced-northern-worker-locomotion',
        fixtureVariant: 'worker-locomotion-northern',
        climate: 'north',
        quality: 'balanced',
        reducedMotion: false,
        viewport: { width: 1_440, height: 900 },
        assetProfile: 'balanced',
        animatedCount: 4,
        gatheringIdleCount: 1,
        modelCount: 4,
        movingCount: 3,
        wheelDrivenCount: 4
      },
      {
        id: 'desktop-balanced-southern-worker-locomotion',
        fixtureVariant: 'worker-locomotion-southern',
        climate: 'south',
        quality: 'balanced',
        reducedMotion: false,
        viewport: { width: 1_440, height: 900 },
        assetProfile: 'balanced',
        animatedCount: 4,
        gatheringIdleCount: 1,
        modelCount: 4,
        movingCount: 3,
        wheelDrivenCount: 4
      }
    ]);
    evidence.forEach((candidate) => {
      expect(parseRenderedWebglWorkerLocomotionEvidence(candidate)).toEqual(
        candidate
      );
    });

    const balancedEvidence = evidence[1]!;
    expect(() => parseRenderedWebglWorkerLocomotionEvidence({
      ...balancedEvidence,
      privateWorkerId: 'must-not-cross-cdp'
    })).toThrow(/locomotion evidence/i);
    expect(() => parseRenderedWebglWorkerLocomotionEvidence({
      ...balancedEvidence,
      readinessSatisfied: false
    })).toThrow(/locomotion evidence/i);
    expect(() => parseRenderedWebglWorkerLocomotionEvidence({
      ...balancedEvidence,
      samples: balancedEvidence.samples.map((sample) => ({
        ...sample,
        telemetry: { ...sample.telemetry, maximumSpeed: null }
      }))
    })).toThrow(/locomotion telemetry/i);
    expect(() => parseRenderedWebglWorkerLocomotionEvidence({
      ...balancedEvidence,
      samples: balancedEvidence.samples.map((sample) => ({
        ...sample,
        telemetry: { ...sample.telemetry, wheelDistanceMismatchCount: 1 }
      }))
    })).toThrow(/locomotion telemetry contract/i);
    expect(() => parseRenderedWebglWorkerLocomotionEvidence({
      ...balancedEvidence,
      samples: balancedEvidence.samples.map((sample) => ({
        ...sample,
        rootProjections: sample.rootProjections.map((root) => ({
          ...root,
          phase: 'outbound'
        }))
      }))
    })).toThrow(/frame sample|phase coverage/i);
    expect(() => parseRenderedWebglWorkerLocomotionEvidence({
      ...balancedEvidence,
      movementPixels: { outbound: 0, returning: 0 },
      samples: balancedEvidence.samples.map((sample) => ({
        ...sample,
        rootProjections: sample.rootProjections.map((root) => ({
          ...root,
          x: root.phase === 'outbound' ? 120 : 240
        }))
      }))
    })).toThrow(/movement evidence/i);
    for (const frozenPhase of ['outbound', 'returning'] as const) {
      const first = balancedEvidence.samples
        .flatMap((sample) => sample.rootProjections)
        .find((root) => root.phase === frozenPhase)!;
      expect(() => parseRenderedWebglWorkerLocomotionEvidence({
        ...balancedEvidence,
        movementPixels: {
          ...balancedEvidence.movementPixels,
          [frozenPhase]: 0
        },
        samples: balancedEvidence.samples.map((sample) => ({
          ...sample,
          rootProjections: sample.rootProjections.map((root) => (
            root.phase === frozenPhase
              ? { ...root, x: first.x, y: first.y }
              : root
          ))
        }))
      })).toThrow(/movement evidence/i);
    }

    const command = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => method === 'Runtime.evaluate'
      ? { result: { type: 'object', value: balancedEvidence } }
      : {});
    await expect(applyRenderedWebglWorkerLocomotionInteraction(
      { command },
      cases[1]!
    )).resolves.toEqual(balancedEvidence);
    const evaluation = command.mock.calls.find(([method]) => (
      method === 'Runtime.evaluate'
    ));
    expect(evaluation?.[1]).toMatchObject({
      awaitPromise: true,
      returnByValue: true
    });
    expect(evaluation?.[2]).toBe(100_000);
    const expression = String(evaluation?.[1]?.expression);
    expect(expression).toContain(
      'overlay.dataset.fixtureVariant === expected.fixture'
    );
    expect(expression).toContain(
      '/models/hegemony/hegemony-supply-wagon-balanced-af0f8788eaaf9a32.glb'
    );
    expect(expression).toContain(
      'const baseReadinessSatisfied = await waitFor'
    );
    expect(expression).toContain('data-projected-visible="true"');
    expect(expression).toContain('realmLocalQaWorkerProjections');
    expect(expression).toContain("'data-realm-worker-locomotion-moving-count'");
    expect(expression).toContain("'data-realm-worker-clip-walk-count'");
    expect(expression).toContain(
      "'data-realm-worker-rendered-clip-walk-count'"
    );
    expect(expression).toContain("'data-realm-worker-wheel-driven-count'");
    expect(expression).toContain('--realm-worker-presence-x');
    expect(expression).toContain("'data-realm-camera-settled'");
    expect(expression).toContain("'data-realm-camera-state-token'");
    expect(expression).toContain("{ ordinal: 1, phase: 'outbound' }");
    expect(expression).toContain("{ ordinal: 2, phase: 'returning' }");
    expect(expression).toContain('let samplingElapsedMilliseconds = 0');
    expect(expression).toContain(
      'const phaseSamplingStartedAt = performance.now();'
    );
    expect(expression).not.toContain('const startedAt = performance.now();');
    expect(expression.indexOf(
      'const phaseSamplingStartedAt = performance.now();'
    )).toBeGreaterThan(expression.indexOf(
      'const settledCameraToken = await locateMovingWorker(target);'
    ));
    expect(expression.indexOf(
      'const elapsedMilliseconds = ('
    )).toBeGreaterThan(expression.indexOf(
      'const phaseSamplingStartedAt = performance.now();'
    ));
    expect(expression).toContain(
      ".realm-profile-menu__worker-actions button[aria-haspopup=\"dialog\"]"
    );
    expect(expression).toContain('.worker-command-center__worker');
    expect(expression).toContain('.worker-inspection__locate');
    expect(expression).toContain(
      '.realm-profile-menu__panel button[aria-label="Close Realm menu"]'
    );
    expect(expression).not.toContain('return {\\n        workerId');
    expect(expression).not.toContain('return {\\n        fid');

    const northernCommand = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => method === 'Runtime.evaluate'
      ? { result: { type: 'object', value: evidence[4] } }
      : {});
    await expect(applyRenderedWebglWorkerLocomotionInteraction(
      { command: northernCommand },
      cases[4]!
    )).resolves.toEqual(evidence[4]);
    const northernExpression = String(northernCommand.mock.calls.find(
      ([method]) => method === 'Runtime.evaluate'
    )?.[1]?.expression);
    expect(northernExpression).toContain(
      '"fixture":"worker-locomotion-northern"'
    );
    expect(northernExpression).toContain('"climate":"north"');
    expect(northernExpression).toContain(
      "'data-realm-worker-selected-route-count'"
    );
    expect(northernExpression).toContain(
      "'data-realm-worker-visible-route-segment-count'"
    );
    expect(northernExpression).toContain(
      "canvas.getAttribute('data-realm-camera-state-token')"
    );
    const southernCommand = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => method === 'Runtime.evaluate'
      ? { result: { type: 'object', value: evidence[5] } }
      : {});
    await expect(applyRenderedWebglWorkerLocomotionInteraction(
      { command: southernCommand },
      cases[5]!
    )).resolves.toEqual(evidence[5]);
    const southernExpression = String(southernCommand.mock.calls.find(
      ([method]) => method === 'Runtime.evaluate'
    )?.[1]?.expression);
    expect(southernExpression).toContain(
      '"fixture":"worker-locomotion-southern"'
    );
    expect(southernExpression).toContain('"climate":"south"');
    expect(southernExpression).toContain(
      "'data-realm-worker-selected-route-count'"
    );
    await expect(applyRenderedWebglWorkerLocomotionInteraction(
      { command },
      { ...cases[1]!, id: 'unreviewed-worker-locomotion' } as never
    )).rejects.toThrow(/probe case/i);

    expect(renderedWebglWorkerLocomotionProbeCase(41_733)).toEqual(cases[1]);
    expect(() => renderedWebglWorkerLocomotionProbeCases(0)).toThrow(/port/i);

    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain(
      'for (const workerLocomotionCase of workerLocomotionCases)'
    );
    expect(source).toContain(
      '...workerLocomotionCases.map((probeCase) => probeCase.url)'
    );
    expect(source).toContain('six Worker locomotion evidence checks');
  });

  it('locks the reported upper-right Water overview to the reviewed camera and scene', async () => {
    const overviewEvidence = {
      cameraMode: 'realm',
      cameraStateAttested: true,
      cameraSynchronized: true,
      cameraZoom: '0.280000',
      presentationBand: 'overview',
      riverBodyCount: 12,
      riverChannelBodyCount: 12,
      riverChannelSegmentCount: 1_200,
      riverFallbackBodyCount: 0,
      riverFallbackCellCount: 0,
      riverFullCellCount: 400,
      riverFullCellTriangleCount: 2_400,
      riverBankEdgeCount: 1_601,
      riverSharedEdgeCount: 388,
      riverMouthEdgeCount: 23,
      riverIncompleteCellCount: 0,
      riverOverlappingPhysicalTriangleCount: 0,
      riverMouthConnectionCount: 12,
      routeDrawCalls: 0,
      routeSegments: 0,
      routeTriangles: 0,
      routeVisible: 0,
      waterDrawCalls: 3,
      waterNavigationIssueCount: 0,
      waterNavigationNodeCount: 1_852,
      waterNavigationOceanNodeCount: 1_452,
      waterNavigationRiverNodeCount: 400,
      waterNavigationStatus: 'exact',
      waterPresentation: 'ready',
      waterShaderFallbackCount: 0,
      waterTriangles: 21_198
    } as const;
    expect(parseRenderedWebglWaterOverviewEvidence(overviewEvidence)).toEqual(
      overviewEvidence
    );
    for (const invalidEvidence of [
      { ...overviewEvidence, routeVisible: 1 },
      { ...overviewEvidence, riverFallbackBodyCount: 1 },
      { ...overviewEvidence, riverIncompleteCellCount: 1 },
      { ...overviewEvidence, riverOverlappingPhysicalTriangleCount: 1 },
      { ...overviewEvidence, waterNavigationIssueCount: 1 },
      { ...overviewEvidence, waterNavigationStatus: 'partial' },
      { ...overviewEvidence, cameraStateAttested: false },
      { ...overviewEvidence, privateRoutePoint: 'must-not-cross-the-boundary' }
    ]) {
      expect(() => parseRenderedWebglWaterOverviewEvidence(invalidEvidence))
        .toThrow(/Water overview evidence/i);
    }

    const runtimeResults = [
      { type: 'object', value: { x: 720, y: 450 } },
      { type: 'object', value: { band: 'overview' } },
      ...Array.from({ length: 4 }, () => ({ type: 'boolean', value: true })),
      { type: 'object', value: overviewEvidence }
    ];
    const command = vi.fn(async (
      method: string,
      _parameters?: Readonly<Record<string, unknown>>
    ) => (
      method === 'Runtime.evaluate'
        ? { result: runtimeResults.shift() }
        : {}
    ));
    await expect(applyRenderedWebglWaterOverviewInteraction({ command }))
      .resolves.toEqual(overviewEvidence);
    expect(runtimeResults).toHaveLength(0);
    const pointerCommands = command.mock.calls.filter(([method]) => (
      method === 'Input.dispatchMouseEvent'
    ));
    expect(pointerCommands.filter(([, parameters]) => (
      parameters?.type === 'mousePressed'
    ))).toHaveLength(4);
    expect(pointerCommands.filter(([, parameters]) => (
      parameters?.type === 'mouseReleased'
      && parameters.x === 220
      && parameters.y === 180
    ))).toHaveLength(4);

    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain('desktop-balanced-worker-water-overview');
    expect(source).toContain(
      'await applyRenderedWebglWaterOverviewInteraction(session)'
    );
    expect(source).toMatch(
      /applyRenderedWebglWaterOverviewInteraction\(session\)[\s\S]{0,160}captureRenderedCasePixels/
    );
  });

  it('accepts only bounded stale Three.js deletion warnings during controlled recovery', () => {
    const origin = 'http://127.0.0.1:41733';
    const profile = '/private/tmp/warpkeep-webgl-qa-exact';
    const sourceUrl = `${origin}/@fs${profile}/vite-cache/deps/`
      + 'three.module-CAG8sl-8.js?v=20fde660';
    const baseEntry = {
      level: 'warning',
      source: 'rendering',
      url: sourceUrl
    };

    expect(controlledRendererRecoveryWarningKind({
      ...baseEntry,
      text: 'WebGL: INVALID_OPERATION: delete: object does not belong to this context'
    }, origin, profile)).toBe('stale-context-object-delete');
    expect(controlledRendererRecoveryWarningKind({
      ...baseEntry,
      text: 'WebGL: INVALID_OPERATION: deleteVertexArray: object does not belong to this context'
    }, origin, profile)).toBe('stale-context-object-delete');
    expect(controlledRendererRecoveryWarningKind({
      ...baseEntry,
      text: 'WebGL: too many errors, no more errors will be reported to the console for this context.'
    }, origin, profile)).toBe('stale-context-warning-throttle');

    for (const entry of [
      { ...baseEntry, source: 'javascript', text: 'WebGL: INVALID_OPERATION: delete: object does not belong to this context' },
      { ...baseEntry, level: 'error', text: 'WebGL: INVALID_OPERATION: delete: object does not belong to this context' },
      { ...baseEntry, text: 'WebGL: INVALID_OPERATION: drawElements: bad state' },
      { ...baseEntry, url: `${origin}/src/components/realm/createRealmScene.ts`, text: 'WebGL: INVALID_OPERATION: delete: object does not belong to this context' },
      { ...baseEntry, url: 'https://example.com/three.module-test.js?v=20fde660', text: 'WebGL: INVALID_OPERATION: delete: object does not belong to this context' }
    ]) {
      expect(controlledRendererRecoveryWarningKind(entry, origin, profile)).toBeNull();
    }
    expect(controlledRendererRecoveryWarningKind({
      ...baseEntry,
      text: 'WebGL: INVALID_OPERATION: delete: object does not belong to this context'
    }, origin, '/private/tmp/another-profile')).toBeNull();
    expect(controlledRendererRecoveryWarningKind({
      ...baseEntry,
      text: 'WebGL: INVALID_OPERATION: delete: object does not belong to this context'
    }, `${origin}/`, profile)).toBeNull();

    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain(
      'state.controlledRendererWarningCount'
      + '\n            < CONTROLLED_RENDERER_MAXIMUM_STALE_DELETE_WARNINGS'
    );
    expect(source).toContain('state.controlledRendererWarningCount > 0');
    expect(source).toContain("controlledWarningKind === 'stale-context-warning-throttle'");
  });

  it('runs the exact all-node fixture through a bounded boolean-only browser stress lane', async () => {
    const evidence = {
      allNodeSourceCountExact: true,
      allResourceKindsExercised: true,
      controlBudgetBounded: true,
      fixtureSelected: true,
      legacySourceCorrect: true,
      portraitPipelineReady: true,
      presenceBudgetBounded: true,
      rendererStable: true,
      rovingTabStopBounded: true,
      uniqueVisibleKeys: true
    } as const;
    expect(parseRenderedWebglOccupancyStressEvidence(evidence)).toEqual(evidence);
    expect(() => parseRenderedWebglOccupancyStressEvidence({
      ...evidence,
      controlBudgetBounded: false
    })).toThrow(/occupancy stress evidence/i);
    expect(() => parseRenderedWebglOccupancyStressEvidence({
      ...evidence,
      fid: 1
    })).toThrow(/occupancy stress evidence/i);

    const command = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => method === 'Runtime.evaluate'
      ? { result: { type: 'object', value: evidence } }
      : {});
    await expect(applyRenderedWebglOccupancyStressInteraction({ command }))
      .resolves.toEqual(evidence);
    const evaluation = command.mock.calls.find(([method]) => method === 'Runtime.evaluate');
    expect(evaluation?.[1]).toMatchObject({
      awaitPromise: true,
      returnByValue: true
    });
    expect(evaluation?.[2]).toBe(80_000);
    const expression = String(evaluation?.[1]?.expression);
    expect(expression).toContain(`const expectedOccupationCount = ${
      RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT
    }`);
    expect(expression).toContain(String(RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_PRESENCES));
    expect(expression).toContain(String(RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_CONTROLS));
    for (const resource of ['gold', 'food', 'wood', 'stone']) {
      expect(expression).toContain(`resource: '${resource}'`);
    }
    expect(expression).toContain("overlay.dataset.fixtureVariant === 'occupancy-stress'");
    expect(expression).toContain("activeMap.dataset.rendererRecoveryAttempt === '0'");
    expect(expression).toContain("=== 'legacy-expedition'");
    expect(expression).toContain('portraitPipelineReady && targetReady');
    expect(expression).toContain(
      'new Set([...presenceKeys, ...controlKeys]).size'
    );
    expect(expression).toContain('controlSelector + \',\' + passiveSelector');
    expect(expression).toMatch(/tabIndex === 0\s*\)\)\.length <= 1/);
    expect(expression).not.toContain('.realm-resource-occupant-panel');
    expect(expression).not.toContain('projectionStable(');
    expect(expression).not.toContain('subtreePrivacyBounded(');
    expect(expression).not.toContain('return {\\n        fid');

    const stressCase = renderedWebglOccupancyStressProbeCase(41_733);
    expect(stressCase).toEqual({
      id: 'desktop-balanced-occupancy-stress',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 1,
      url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html'
        + '?quality=balanced&fixture=occupancy-stress',
      viewport: { width: 1440, height: 900 }
    });
    expect(() => renderedWebglOccupancyStressProbeCase(0)).toThrow(/port/i);

    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain(
      'await runRenderedOccupancyStressCase(devtools, occupancyStressCase, state)'
    );
    expect(source).toContain('occupancyStressCase.url');
    expect(source).toContain('one all-node ');
  });

  it('opens player Explore through the portrait menu without restoring a direct map control', async () => {
    const command = vi.fn(async (
      method: string,
      _parameters?: Readonly<Record<string, unknown>>
    ) => method === 'Runtime.evaluate'
      ? { result: { type: 'boolean', value: true } }
      : {});

    await expect(applyRenderedWebglCaseInteraction(
      { command },
      'explore',
      'player'
    )).resolves.toEqual({});
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining("document.querySelector('.realm-profile-trigger')"),
      returnByValue: true
    }));
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining(
        "(button.querySelector('strong')?.textContent ?? '').trim()"
      )
    }));
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining("=== 'EXPLORE'")
    }));
    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain("method === 'Page.lifecycleEvent'");
    expect(source).toContain("params?.name === 'load'");
    expect(source).toContain('state.loadedPageLoaderIds.has(loaderId)');
    expect(source).toContain(
      "devtools.command('Page.setLifecycleEventsEnabled'"
    );
    const navigationSource = source.slice(
      source.indexOf('async function navigateRenderedWebglCase'),
      source.indexOf('async function runRenderedOccupancyStressCase')
    );
    expect(navigationSource).not.toContain('await delay(150);');
    expect(command.mock.calls.filter(([method]) => method === 'Runtime.evaluate'))
      .toHaveLength(3);
    expect(command.mock.calls.every(([, parameters]) => (
      parameters?.awaitPromise !== true
    ))).toBe(true);
    await expect(applyRenderedWebglCaseInteraction(
      { command },
      'explore',
      'unreviewed' as never
    )).rejects.toThrow(/presentation mode/i);
  });

  it('uses page-local gesture aggregates across projection remounts without exporting identity', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain('labelStartPositions = Object.fromEntries');
    expect(source).toContain('state.wheelStartPositions = currentPositions');
    expect(source).toContain('maximumDisplacement(state.labelStartPositions, currentPositions)');
    expect(source).not.toContain('return { labelStartPositions');
    expect(source).not.toContain('return { wheelStartPositions');
  });

  it('records only structural world-label keyboard evidence', async () => {
    const evidence = {
      arrowMoved: true,
      endReached: true,
      homeReached: true,
      singleTabStop: true
    } as const;
    expect(parseRenderedWebglLabelKeyboardEvidence(evidence)).toEqual(evidence);
    expect(() => parseRenderedWebglLabelKeyboardEvidence({
      ...evidence,
      arrowMoved: false
    })).toThrow(/label keyboard evidence/i);
    expect(() => parseRenderedWebglLabelKeyboardEvidence({
      ...evidence,
      castleId: 1
    })).toThrow(/label keyboard evidence/i);

    const command = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>
    ) => {
      if (method === 'Runtime.evaluate') {
        return {
          result: {
            type: 'object',
            value: evidence
          }
        };
      }
      return {};
    });

    await expect(applyRenderedWebglLabelKeyboardInteraction({ command })).resolves.toEqual(
      evidence
    );
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining('dispatch(start.button, arrow.key)'),
      returnByValue: true
    }));
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining(
        "const start = points.find(({ button }) => button.tabIndex === 0)"
      )
    }));
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining("dispatch(arrowTarget, 'Home')")
    }));
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining("dispatch(document.activeElement, 'End')")
    }));
  });

  it('does not retain an automatic cluster interaction lane', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).not.toContain("if (interaction === 'cluster')");
    expect(renderedWebglBrowserProbeCases(41_733).every((probeCase) => (
      probeCase.maximumLabelOverflowCount === 0
    ))).toBe(true);
    expect(renderedWebglBrowserProbeCases(41_733).some((probeCase) => (
      probeCase.id === 'mobile-balanced-persistent-labels'
    ))).toBe(true);
  });

  it('tolerates only two-decimal serialization around the exact foundation anchor', () => {
    expect(renderedWebglLabelAnchorDistanceTelemetry(0.014)).toEqual({
      reportedDistance: 0,
      violation: false
    });
    expect(renderedWebglLabelAnchorDistanceTelemetry(0.016)).toEqual({
      reportedDistance: 1,
      violation: true
    });
    expect(renderedWebglLabelDisplacementClassificationValid(0, false)).toBe(true);
    expect(renderedWebglLabelDisplacementClassificationValid(0.014, false)).toBe(true);
    expect(renderedWebglLabelDisplacementClassificationValid(0.016, false)).toBe(false);
    expect(renderedWebglLabelDisplacementClassificationValid(0, true)).toBe(false);
  });

  it('fixes fifteen responsive, interaction, and presentation cases to one numeric loopback origin', () => {
    const cases = renderedWebglBrowserProbeCases(41_733);
    expect(cases).toHaveLength(RENDERED_WEBGL_QA_CASE_COUNT);
    expect(new Set(cases.map((probeCase) => probeCase.id)).size).toBe(
      RENDERED_WEBGL_QA_CASE_COUNT
    );
    expect(cases).toEqual([
      {
        id: 'desktop-high',
        expectedPresentationMode: 'observer',
        expectedQuality: 'high',
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=high',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-balanced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'full-hd-balanced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 16,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1920, height: 1080 }
      },
      {
        id: 'tablet-balanced-inspector',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'inspector',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 11,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1024, height: 768 }
      },
      {
        id: 'tablet-balanced-player-inspector',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'inspector',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 11,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player',
        viewport: { width: 1024, height: 768 }
      },
      {
        id: 'mobile-balanced-persistent-labels',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        expectedReducedMotion: true,
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 5,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'desktop-reduced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'reduced',
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-invalid-fallback',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=invalid',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'mobile-balanced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 5,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'mobile-reduced-inspector',
        expectedPresentationMode: 'observer',
        expectedQuality: 'reduced',
        interaction: 'inspector',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 4,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'short-landscape-explore',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'explore',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 1,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 667, height: 375 }
      },
      {
        id: 'short-landscape-balanced-player-explore',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'explore',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 1,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player',
        viewport: { width: 667, height: 375 }
      },
      {
        id: 'short-landscape-balanced-northern',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'explore',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 1,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 667, height: 375 }
      },
      {
        id: 'desktop-balanced-player',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'mobile-balanced-player',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 0,
        minimumLabelCount: 4,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player',
        viewport: { width: 390, height: 844 }
      }
    ]);
    expect(() => renderedWebglBrowserProbeCases(0)).toThrow(/port/i);
  });

  it('spawns only new headless Chrome with a disposable isolated profile', () => {
    const profile = '/private/tmp/warpkeep-webgl-test';
    const contract = headlessChromeProbeContract(profile);
    expect(contract.executable).toBe(RENDERED_WEBGL_QA_CHROME);
    expect(contract.args).toEqual(expect.arrayContaining([
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      '--disable-background-networking',
      '--disable-crash-reporter',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-field-trial-config',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--use-mock-keychain',
      'about:blank'
    ]));
    expect(contract.args).not.toContain(expect.stringMatching(/^https?:\/\/(?!127\.0\.0\.1)/));
    expect(contract.options).toMatchObject({
      detached: true,
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
      env: {
        BREAKPAD_DUMP_LOCATION: `${profile}/crash-dumps`,
        HOME: profile,
        TMPDIR: profile,
        PATH: '/usr/bin:/bin'
      }
    });
    expect(contract.args).not.toContain(expect.stringMatching(
      /^--remote-debugging-(?:address|port)=/
    ));

    const fakeChild = { pid: 1234 };
    const spawnProcess = vi.fn(() => fakeChild);
    expect(spawnHeadlessChromeProbe(profile, {
      spawnProcess: spawnProcess as never
    })).toBe(fakeChild);
    expect(spawnProcess).toHaveBeenCalledOnce();
    expect(spawnProcess).toHaveBeenCalledWith(
      RENDERED_WEBGL_QA_CHROME,
      [...contract.args],
      { ...contract.options }
    );
    expect(() => headlessChromeProbeContract('relative/profile')).toThrow(/profile/i);
  });

  it('sweeps the original Chrome process group after its leader has exited', async () => {
    const terminateProcessGroup = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    const assertProcessGroupStopped = vi.fn();

    await terminateHeadlessChromeProcessGroup({
      pid: 4321,
      exitCode: 0,
      signalCode: null
    } as never, { assertProcessGroupStopped, terminateProcessGroup, wait });

    expect(terminateProcessGroup.mock.calls).toEqual([
      [expect.objectContaining({ pid: 4321 }), 'SIGTERM'],
      [expect.objectContaining({ pid: 4321 }), 'SIGKILL']
    ]);
    expect(wait).not.toHaveBeenCalled();
    expect(assertProcessGroupStopped).toHaveBeenCalledWith(4321);
  });

  it('waits through a transient unverified Chrome helper before proving ESRCH', async () => {
    const terminateProcessGroup = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    const assertProcessGroupStopped = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('Disposable Chrome process group could not be verified as stopped.');
      })
      .mockReturnValueOnce(undefined);

    await terminateHeadlessChromeProcessGroup({
      pid: 4322,
      exitCode: 0,
      signalCode: null
    } as never, {
      assertProcessGroupStopped,
      terminateProcessGroup,
      verificationMilliseconds: 1_000,
      verificationPollMilliseconds: 1,
      wait
    });

    expect(assertProcessGroupStopped).toHaveBeenCalledTimes(2);
    expect(terminateProcessGroup.mock.calls).toEqual([
      [expect.objectContaining({ pid: 4322 }), 'SIGTERM'],
      [expect.objectContaining({ pid: 4322 }), 'SIGKILL'],
      [expect.objectContaining({ pid: 4322 }), 'SIGKILL']
    ]);
    expect(wait).toHaveBeenCalledWith(1);
  });

  it('attests the exact Google-signed Chrome application before launch', async () => {
    expect(parseHeadlessChromeCodeSignature([
      `Executable=${RENDERED_WEBGL_QA_CHROME}`,
      'Identifier=com.google.Chrome',
      `TeamIdentifier=${RENDERED_WEBGL_QA_CHROME_TEAM_ID}`,
      ''
    ].join('\n'))).toEqual({
      executable: RENDERED_WEBGL_QA_CHROME,
      identifier: 'com.google.Chrome',
      teamIdentifier: RENDERED_WEBGL_QA_CHROME_TEAM_ID
    });
    expect(() => parseHeadlessChromeCodeSignature([
      `Executable=${RENDERED_WEBGL_QA_CHROME}`,
      'Identifier=com.google.Chrome',
      'TeamIdentifier=UNREVIEWED'
    ].join('\n'))).toThrow(/signature/i);

    const execute = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: [
          `Executable=${RENDERED_WEBGL_QA_CHROME}`,
          'Identifier=com.google.Chrome',
          `TeamIdentifier=${RENDERED_WEBGL_QA_CHROME_TEAM_ID}`,
          ''
        ].join('\n')
      });
    await expect(attestHeadlessChromeCodeSignature({
      execFileAsync: execute
    })).resolves.toEqual({
      executable: RENDERED_WEBGL_QA_CHROME,
      identifier: 'com.google.Chrome',
      teamIdentifier: RENDERED_WEBGL_QA_CHROME_TEAM_ID
    });
    expect(execute).toHaveBeenNthCalledWith(
      1,
      '/usr/bin/codesign',
      ['--verify', '--deep', RENDERED_WEBGL_QA_CHROME_APP],
      expect.objectContaining({ timeout: 15_000, maxBuffer: 64 * 1024 })
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      '/usr/bin/codesign',
      ['-dv', '--verbose=4', RENDERED_WEBGL_QA_CHROME_APP],
      expect.objectContaining({ timeout: 15_000, maxBuffer: 64 * 1024 })
    );
  });

  it('accepts exactly one unattached about:blank page from browser-level discovery', () => {
    expect(selectBlankPageTarget({ targetInfos: [blankTargetInfo(false)] })).toEqual({
      targetId: TEST_TARGET_ID
    });
    expect(() => selectBlankPageTarget({ targetInfos: [{
      ...blankTargetInfo(false),
      url: 'https://warpkeep.com/',
    }] })).toThrow(/target/i);
    expect(() => selectBlankPageTarget({ targetInfos: [
      blankTargetInfo(false),
      { ...blankTargetInfo(false), targetId: '87654321-dcba' }
    ] })).toThrow(/target/i);
    expect(() => selectBlankPageTarget({ targetInfos: [{
      ...blankTargetInfo(false),
      subtype: 'prerender'
    }] })).toThrow(/target/i);
    expect(() => selectBlankPageTarget({ targetInfos: [{
      ...blankTargetInfo(false),
      openerId: 'unreviewed-opener'
    }] })).toThrow(/target/i);
    expect(() => selectBlankPageTarget({ targetInfos: [{
      ...blankTargetInfo(false),
      canAccessOpener: true
    }] })).toThrow(/target/i);
  });

  it('uses NUL-framed pipe commands and binds every page message to the flattened session', async () => {
    const child = fakeChromePipe();
    const parentWrites = child.stdio[3]!;
    const chromeWrites = child.stdio[4]!;
    const commands: Array<Record<string, unknown>> = [];
    const events: string[] = [];
    let inbound = Buffer.alloc(0);
    parentWrites.on('data', (chunk: Buffer) => {
      inbound = Buffer.concat([inbound, chunk]);
      for (let delimiter = inbound.indexOf(0); delimiter >= 0; delimiter = inbound.indexOf(0)) {
        const frame = inbound.subarray(0, delimiter);
        inbound = inbound.subarray(delimiter + 1);
        const command = JSON.parse(frame.toString('utf8')) as Record<string, unknown>;
        commands.push(command);
        if (command.method === 'Target.getTargets') {
          const response = cdpPipeFrame({
            id: command.id,
            result: { targetInfos: [blankTargetInfo(false)] }
          });
          chromeWrites.write(response.subarray(0, 7));
          chromeWrites.write(response.subarray(7));
        } else if (command.method === 'Target.attachToTarget') {
          chromeWrites.write(Buffer.concat([
            cdpPipeFrame({
              method: 'Target.attachedToTarget',
              params: {
                sessionId: TEST_SESSION_ID,
                targetInfo: {
                  ...blankTargetInfo(true),
                  url: ''
                },
                waitingForDebugger: false
              }
            }),
            cdpPipeFrame({ id: command.id, result: { sessionId: TEST_SESSION_ID } })
          ]));
        } else {
          chromeWrites.write(Buffer.concat([
            cdpPipeFrame({
              id: command.id,
              result: {},
              sessionId: TEST_SESSION_ID
            }),
            cdpPipeFrame({
              method: 'Page.loadEventFired',
              params: { timestamp: 1 },
              sessionId: TEST_SESSION_ID
            })
          ]));
        }
      }
    });

    const pipe = new DevtoolsPipeSession(child as never, (method) => events.push(method));
    await pipe.open();
    const targetFilter = [{ type: 'page', exclude: false }, { exclude: true }];
    const target = selectBlankPageTarget(await pipe.browserCommand('Target.getTargets', {
      filter: targetFilter
    }));
    await expect(pipe.attachToPage(target.targetId)).resolves.toBe(TEST_SESSION_ID);
    await expect(pipe.command('Page.enable')).resolves.toEqual({});
    await new Promise((resolveTick) => setImmediate(resolveTick));

    expect(events).toEqual(['Page.loadEventFired']);
    expect(commands.map(({ method }) => method)).toEqual([
      'Target.getTargets',
      'Target.attachToTarget',
      'Page.enable'
    ]);
    expect(commands[0]).not.toHaveProperty('sessionId');
    expect(commands[0]).toMatchObject({ params: { filter: targetFilter } });
    expect(commands[1]).not.toHaveProperty('sessionId');
    expect(commands[2]).toMatchObject({ sessionId: TEST_SESSION_ID });
    expect(parentWrites.readableEnded).toBe(false);
    pipe.close();
  });

  it('ignores only an exact stale Fetch interception while every adjacent CDP error fails closed', async () => {
    expect(isBenignStaleFetchInterceptionError(
      'Fetch.continueRequest',
      { code: -32602, message: 'Invalid InterceptionId.' }
    )).toBe(true);
    expect(isBenignStaleFetchInterceptionError(
      'Fetch.failRequest',
      { code: -32602, message: 'Invalid InterceptionId.' }
    )).toBe(true);
    expect(isBenignStaleFetchInterceptionError(
      'Fetch.fulfillRequest',
      { code: -32602, message: 'Invalid InterceptionId.' }
    )).toBe(true);
    for (const [method, error] of [
      ['Page.navigate', { code: -32602, message: 'Invalid InterceptionId.' }],
      ['Fetch.continueRequest', { code: -32000, message: 'Invalid InterceptionId.' }],
      ['Fetch.continueRequest', { code: -32602, message: 'Other failure.' }],
      ['Fetch.continueRequest', {
        code: -32602,
        message: 'Invalid InterceptionId.',
        data: 'unexpected'
      }],
      ['Fetch.continueRequest', null]
    ] as const) {
      expect(isBenignStaleFetchInterceptionError(method, error)).toBe(false);
    }

    const replyWithError = async (
      method: string,
      error: unknown
    ) => {
      const attached = await attachedFakeChromePipe();
      const command = attached.pipe.command(method, { requestId: 'local-fixture-request' });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      attached.child.stdio[4]!.write(cdpPipeFrame({
        id: attached.commands.at(-1)?.id,
        error,
        sessionId: TEST_SESSION_ID
      }));
      return { attached, command };
    };

    for (const method of ['Fetch.continueRequest', 'Fetch.failRequest']) {
      const benign = await replyWithError(
        method,
        { code: -32602, message: 'Invalid InterceptionId.' }
      );
      await expect(benign.command).resolves.toEqual({});
      await expect(benign.attached.pipe.command('Page.enable', {}, 20))
        .rejects.toThrow(/timed out/i);
      benign.attached.pipe.close();
    }

    for (const [method, error] of [
      ['Page.navigate', { code: -32602, message: 'Invalid InterceptionId.' }],
      ['Fetch.continueRequest', { code: -32000, message: 'Invalid InterceptionId.' }],
      ['Fetch.failRequest', { code: -32602, message: 'Other failure.' }],
      ['Fetch.continueRequest', null]
    ] as const) {
      const rejected = await replyWithError(method, error);
      const failure = await rejected.command.then(
        () => null,
        (reason: unknown) => reason
      );
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) throw new Error('missing CDP failure');
      expect(failure.message).toMatch(/command failed/i);
      if (
        error !== null
        && typeof error === 'object'
        && Number.isSafeInteger(error.code)
      ) {
        expect(failure.message).toContain(`(${String(error.code)})`);
      }
      if (
        error !== null
        && typeof error === 'object'
        && typeof error.message === 'string'
      ) {
        expect(failure.message).not.toContain(error.message);
      }
      await expect(rejected.attached.pipe.command('Page.enable'))
        .rejects.toThrow(/unavailable/i);
      rejected.attached.pipe.close();
    }
  });

  it('fails the whole private pipe on an unknown response, malformed UTF-8, or timeout', async () => {
    const unknownChild = fakeChromePipe();
    const unknownPipe = new DevtoolsPipeSession(unknownChild as never);
    await unknownPipe.open();
    const unknown = unknownPipe.browserCommand('Target.getTargets');
    unknownChild.stdio[4]!.write(cdpPipeFrame({ id: 2, result: {} }));
    await expect(unknown).rejects.toThrow(/unknown response/i);
    unknownPipe.close();

    const utfChild = fakeChromePipe();
    const utfPipe = new DevtoolsPipeSession(utfChild as never);
    await utfPipe.open();
    const malformed = utfPipe.browserCommand('Target.getTargets');
    utfChild.stdio[4]!.write(Buffer.from([0xc3, 0x28, 0]));
    await expect(malformed).rejects.toThrow(/invalid JSON/i);
    utfPipe.close();

    const timeoutChild = fakeChromePipe();
    const timeoutPipe = new DevtoolsPipeSession(timeoutChild as never);
    await timeoutPipe.open();
    await expect(timeoutPipe.browserCommand('Target.getTargets', {}, 20))
      .rejects.toThrow(/timed out/i);
    timeoutPipe.close();
  });

  it('fails closed on foreign responses, unscoped page events, and oversized frames', async () => {
    const foreign = await attachedFakeChromePipe();
    const foreignCommand = foreign.pipe.command('Page.enable');
    await new Promise((resolveTick) => setImmediate(resolveTick));
    const foreignId = foreign.commands.at(-1)?.id;
    foreign.child.stdio[4]!.write(cdpPipeFrame({
      id: foreignId,
      result: {},
      sessionId: 'FOREIGN-SESSION'
    }));
    await expect(foreignCommand).rejects.toThrow(/session mismatched/i);
    foreign.pipe.close();

    const unscoped = await attachedFakeChromePipe();
    const pending = unscoped.pipe.command('Page.enable');
    unscoped.child.stdio[4]!.write(cdpPipeFrame({
      method: 'Page.loadEventFired',
      params: { timestamp: 1 }
    }));
    await expect(pending).rejects.toThrow(/event session mismatched/i);
    unscoped.pipe.close();

    const oversizedChild = fakeChromePipe();
    const oversizedPipe = new DevtoolsPipeSession(oversizedChild as never);
    await oversizedPipe.open();
    const oversized = oversizedPipe.browserCommand('Target.getTargets');
    oversizedChild.stdio[4]!.write(Buffer.alloc(16 * 1_024 * 1_024 + 1, 0x61));
    await expect(oversized).rejects.toThrow(/frame exceeded/i);
    oversizedPipe.close();
  });

  it('honors write backpressure and closes idempotently without reopening', async () => {
    const reader = new PassThrough();
    const writer = new (class extends EventEmitter {
      write(chunk: Buffer, callback: (error?: Error) => void) {
        const command = JSON.parse(
          chunk.subarray(0, chunk.byteLength - 1).toString('utf8')
        ) as Record<string, unknown>;
        setImmediate(() => {
          callback();
          this.emit('drain');
          reader.write(cdpPipeFrame({ id: command.id, result: {} }));
        });
        return false;
      }

      end() {
        this.emit('close');
      }

      destroy() {
        this.emit('close');
      }
    })();
    const child = new EventEmitter() as EventEmitter & {
      stdio: Array<EventEmitter | PassThrough | null>;
    };
    child.stdio = [null, null, null, writer, reader];
    const pipe = new DevtoolsPipeSession(child as never);
    await pipe.open();
    await expect(pipe.browserCommand('Browser.getVersion')).resolves.toEqual({});
    pipe.close();
    expect(() => pipe.close()).not.toThrow();
    await expect(pipe.open()).rejects.toThrow(/cannot be reopened/i);
    await expect(pipe.browserCommand('Browser.getVersion')).rejects.toThrow(/unavailable/i);
  });

  it('blocks every page request outside the exact numeric loopback origin', () => {
    const origin = 'http://127.0.0.1:41733';
    expect(isAllowedRenderedWebglPageUrl(
      `${origin}/src/dev/realmRenderedWebglQaMain.tsx`,
      origin
    )).toBe(true);
    expect(isAllowedRenderedWebglPageUrl(
      'ws://127.0.0.1:41733/?token=local-vite-token',
      origin
    )).toBe(true);
    expect(isAllowedRenderedWebglPageUrl(
      'blob:http://127.0.0.1:41733/12345678-abcd',
      origin
    )).toBe(true);
    expect(isAllowedRenderedWebglPageUrl('http://localhost:41733/dev/test', origin)).toBe(false);
    expect(isAllowedRenderedWebglPageUrl('ws://127.0.0.1:41734/', origin)).toBe(false);
    expect(isAllowedRenderedWebglPageUrl('https://127.0.0.1:41733/dev/test', origin)).toBe(false);
    expect(isAllowedRenderedWebglPageUrl('https://warpkeep.com/', origin)).toBe(false);
    expect(isAllowedRenderedWebglPageUrl('data:text/plain,fixture', origin)).toBe(false);
  });

  it('attests exact ready DOM state and fails closed on fallback, mismatch, or excess data', () => {
    const expected = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'desktop-invalid-fallback')!;
    const ready = {
      href: expected.url,
      status: 'ready',
      renderer: 'webgl',
      mapRenderer: 'webgl',
      fixture: 'synthetic-canonical-100',
      presentationMode: 'observer',
      mapPresentationMode: 'observer',
      rootRealmCameraMode: 'realm',
      canvasRealmCameraMode: 'realm',
      rootRealmCameraPresentationBand: 'overview',
      canvasRealmCameraPresentationBand: 'overview',
      quality: 'balanced',
      castleCount: 100,
      readyAfterMilliseconds: 2_412,
      environmentLighting: 'procedural',
      forestDecorativeTreeCount: 0,
      forestDecorativeTriangleCount: 0,
      forestDecorativeDrawCalls: 0,
      forestDecorativeCacheEntries: 0,
      forestDecorativeCacheLimit: 1_024,
      forestDecorativeCacheHighWaterMark: 0,
      forestDecorativeRepackCount: 0,
      forestDecorativeModelReady: false,
      forestDecorativeUsingFallback: false,
      forestDecorativeFallbackType: 'none',
      forestDecorativeContactShadowCount: 0,
      forestDecorativeGroundingMode: 'none',
      forestDecorativeCanopyMotionState: 'static',
      forestDecorativeCoreCellCount: 0,
      forestDecorativeBodyCellCount: 0,
      forestDecorativeFringeCellCount: 0,
      forestDecorativeClearingCellCount: 0,
      forestDecorativeSilhouetteCoverageRatio: 0,
      forestDecorativeCanonicalTriangleCount: 0,
      forestDecorativeOverviewHidden: true,
      grassInstanceCount: 0,
      grassTriangleCount: 0,
      grassDrawCalls: 0,
      grassCacheEntries: 0,
      grassCacheLimit: 1_024,
      grassCacheHighWaterMark: 0,
      grassRepackCount: 0,
      grassPaletteDisplaySrgbSaturationMin: 0,
      grassPaletteDisplaySrgbSaturationMax: 0,
      grassShaderFallbackActive: false,
      terrainShaderEnhanced: true,
      terrainShaderFallbackActive: false,
      semanticTerrainCellCount: RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_CELL_COUNT,
      semanticTerrainKindCount: RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_KIND_COUNT,
      semanticTerrainFeatureCount: 700,
      semanticTerrainFeatureDrawCalls: 5,
      totalTerrainDetailInstanceCount: 5_000,
      totalTerrainDetailDrawCalls: 8,
      viewportWidth: 1440,
      viewportHeight: 900,
      documentWidth: 1440,
      mapViewportCovered: true,
      interactionState: 'default',
      inspectorProfileImageState: 'absent',
      individualCastleCount: 18,
      presentedModelCount: 18,
      presentedLandscapeBaseCount: 18,
      raycastTargetCount: 18,
      labelCount: 18,
      labelCullReasons: '',
      labelEligibleCount: 18,
      labelClusteredCount: 0,
      labelClusterOverflowCount: 0,
      labelAccountingValid: true,
      labelAttachmentViolationCount: 0,
      labelPlacementBindingViolationCount: 0,
      labelIdentityPresentationViolationCount: 0,
      labelHitTestViolationCount: 0,
      labelMissingIdentityCount: 0,
      labelMaximumAnchorDisplacement: 0,
      labelPlacedCount: 18,
      labelUnplacedCount: 0,
      labelsTextBearingCount: 18,
      focusedReadableLabelDomFocusCount: 0,
      focusedReadableLabelCount: 0,
      hiddenFocusedLabelCount: 0,
      tabbableLabelCount: 1,
      labelsWithinViewportCount: 18,
      labelCollisionCount: 0,
      labelLeaderMismatchCount: 0,
      labelReservedOverlapCount: 0,
      clusterButtonCount: 0,
      accessibleClusterButtonCount: 0,
      clusterRepresentativeAnchorViolationCount: 0,
      clusterCastleOverlapCount: 0,
      clusterMemberDistanceViolationCount: 0,
      clusterAttachmentViolationCount: 0,
      clusterPlacementBindingViolationCount: 0,
      clusterIdentityPresentationViolationCount: 0,
      clusterHitTestViolationCount: 0,
      clusterLeaderMismatchCount: 0,
      clusterMaximumAnchorDisplacement: 0,
      clusterMemberCount: 0,
      clustersWithinViewportCount: 0,
      clusterCollisionCount: 0,
      clusterReservedOverlapCount: 0,
      exploreCastleCount: 0,
      exploreAccessibleCastleCount: 0,
      exploreCoordinateJumpCount: 0,
      exploreResourceSiteCount: 0,
      exploreAccessibleResourceSiteCount: 0,
      exploreResourceKindCount: 0,
      exploreAvailableResourceSiteCount: 0,
      exploreVisibleCoordinateCopyCount: 0,
      exploreVisibleOpaqueCopyCount: 0,
      directExploreControlState: 'visible',
      legacyPlayerActionCount: 0,
      profileMenuState: 'absent',
      profileTriggerAvatarCount: 0,
      profileTriggerCount: 0,
      profileTriggerState: 'absent',
      profileTriggerTextBearingCount: 0,
      resourceIconCount: 0,
      resourceItemCount: 0,
      resourceRailCount: 0,
      resourceRailState: 'absent',
      resourceZeroValueCount: 0,
      observerBadgeState: 'visible',
      closeQaObserverControlState: 'visible',
      readyOverlayVisible: false,
      undersizedPrimaryControlCount: 0,
      undersizedPrimaryControlKinds: []
    } as const;
    expect(parseRenderedWebglBrowserDom(ready, expected)).toMatchObject({
      renderer: 'webgl',
      presentationMode: 'observer',
      quality: 'balanced',
      castleCount: 100,
      readyAfterMilliseconds: 2_412,
      environmentLighting: 'procedural',
      forestDecorativeTreeCount: 0,
      forestDecorativeTriangleCount: 0,
      forestDecorativeDrawCalls: 0,
      forestDecorativeCacheEntries: 0,
      forestDecorativeCacheHighWaterMark: 0,
      forestDecorativeModelReady: false,
      forestDecorativeUsingFallback: false,
      forestDecorativeOverviewHidden: true,
      semanticTerrainCellCount: RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_CELL_COUNT,
      semanticTerrainKindCount: RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_KIND_COUNT,
      semanticTerrainFeatureCount: 700,
      semanticTerrainFeatureDrawCalls: 5,
      totalTerrainDetailInstanceCount: 5_000,
      totalTerrainDetailDrawCalls: 8,
      rootRealmCameraMode: 'realm',
      canvasRealmCameraMode: 'realm',
      rootRealmCameraPresentationBand: 'overview',
      canvasRealmCameraPresentationBand: 'overview'
    });
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      canvasRealmCameraMode: 'approach'
    }, expected)).toThrow(/camera-presentation-synchronization/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      rootRealmCameraPresentationBand: 'strategy',
      canvasRealmCameraPresentationBand: 'strategy'
    }, expected)).toThrow(/camera-presentation-synchronization/i);
    expect(parseRenderedWebglBrowserDom({
      ...ready,
      labelCullReasons: 'reserved-ui:1',
      labelEligibleCount: 19,
      labelUnplacedCount: 1,
      presentedModelCount: 19,
      presentedLandscapeBaseCount: 19,
      raycastTargetCount: 19
    }, expected)).toMatchObject({
      labelEligibleCount: 19,
      labelPlacedCount: 18,
      labelUnplacedCount: 1
    });
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      status: 'fallback',
      renderer: 'fallback',
      mapRenderer: 'fallback'
    }, expected)).toThrow(/DOM/i);
    expect(() => parseRenderedWebglBrowserDom({ ...ready, quality: 'high' }, expected)).toThrow(/DOM/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      environmentLighting: 'direct-light-fallback'
    }, expected)).toThrow(/environment-lighting/i);
    for (const staleOrMixedTerrainCellCount of [1_261, 9_999, 10_001]) {
      expect(() => parseRenderedWebglBrowserDom({
        ...ready,
        semanticTerrainCellCount: staleOrMixedTerrainCellCount
      }, expected)).toThrow(/semantic-terrain-cell-count/i);
    }
    for (const staleKindCount of [5, 7]) {
      expect(() => parseRenderedWebglBrowserDom({
        ...ready,
        semanticTerrainKindCount: staleKindCount
      }, expected)).toThrow(/semantic-terrain-kind-count/i);
    }
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      semanticTerrainFeatureCount: 0
    }, expected)).toThrow(/semantic-terrain-feature-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      semanticTerrainFeatureCount: 1_101
    }, expected)).toThrow(/semantic-terrain-feature-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      semanticTerrainFeatureDrawCalls: 0
    }, expected)).toThrow(/semantic-terrain-feature-draw-calls/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      semanticTerrainFeatureDrawCalls: 6
    }, expected)).toThrow(/semantic-terrain-feature-draw-calls/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      totalTerrainDetailInstanceCount: 5_801
    }, expected)).toThrow(/total-terrain-detail-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      totalTerrainDetailDrawCalls: 9
    }, expected)).toThrow(/total-terrain-detail-draw-calls/i);
    const balancedForestFallback = {
      ...ready,
      forestDecorativeTreeCount: 600,
      forestDecorativeTriangleCount: 160_000,
      forestDecorativeDrawCalls: 1,
      forestDecorativeCacheEntries: 600,
      forestDecorativeCacheHighWaterMark: 1_024,
      forestDecorativeRepackCount: 1,
      forestDecorativeModelReady: false,
      forestDecorativeUsingFallback: true,
      forestDecorativeFallbackType: 'procedural-trunk-multi-canopy-v1',
      forestDecorativeGroundingMode:
        'terrain-canopy-procedural-root-contact',
      forestDecorativeCoreCellCount: 8,
      forestDecorativeBodyCellCount: 12,
      forestDecorativeFringeCellCount: 6,
      forestDecorativeClearingCellCount: 2,
      forestDecorativeSilhouetteCoverageRatio: 0.42,
      forestDecorativeOverviewHidden: false,
      semanticTerrainFeatureCount: 1_300,
      semanticTerrainFeatureDrawCalls: 6,
      totalTerrainDetailInstanceCount: 5_600,
      totalTerrainDetailDrawCalls: 9
    } as const;
    expect(parseRenderedWebglBrowserDom(
      balancedForestFallback,
      expected
    )).toMatchObject({
      forestDecorativeTreeCount: 600,
      forestDecorativeTriangleCount: 160_000,
      forestDecorativeDrawCalls: 1,
      forestDecorativeCacheEntries: 600,
      forestDecorativeCacheHighWaterMark: 1_024,
      forestDecorativeModelReady: false,
      forestDecorativeUsingFallback: true,
      forestDecorativeOverviewHidden: false
    });
    expect(() => parseRenderedWebglActiveForestDom(
      balancedForestFallback,
      expected
    )).toThrow(/active decorative forest/i);
    expect(parseRenderedWebglActiveForestDom({
      ...balancedForestFallback,
      rootRealmCameraMode: 'keep',
      canvasRealmCameraMode: 'keep',
      rootRealmCameraPresentationBand: 'close',
      canvasRealmCameraPresentationBand: 'close',
      forestDecorativeDrawCalls: 5,
      forestDecorativeModelReady: true,
      forestDecorativeUsingFallback: false,
      forestDecorativeFallbackType: 'none',
      forestDecorativeGroundingMode: 'terrain-canopy-baked-base',
      semanticTerrainFeatureDrawCalls: 10,
      totalTerrainDetailDrawCalls: 13
    }, expected)).toMatchObject({
      forestDecorativeTreeCount: 600,
      forestDecorativeModelReady: true,
      forestDecorativeUsingFallback: false,
      forestDecorativeOverviewHidden: false
    });
    expect(() => parseRenderedWebglActiveForestDom(
      ready,
      expected
    )).toThrow(/active decorative forest/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeTreeCount: 601,
      semanticTerrainFeatureCount: 1_301,
      totalTerrainDetailInstanceCount: 5_601
    }, expected)).toThrow(/forest-decorative-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeTriangleCount: 160_001
    }, expected)).toThrow(/forest-decorative-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeCacheHighWaterMark: 1_025
    }, expected)).toThrow(/forest-decorative-cache/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeCacheEntries: 700,
      forestDecorativeCacheHighWaterMark: 699
    }, expected)).toThrow(/forest-decorative-cache/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeFallbackType: 'none'
    }, expected)).toThrow(/forest-decorative-crafted-telemetry/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      grassCacheLimit: 1_025
    }, expected)).toThrow(/grass-crafted-telemetry/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      grassInstanceCount: 1,
      grassTriangleCount: 15,
      grassDrawCalls: 1,
      grassCacheEntries: 1,
      grassCacheHighWaterMark: 1,
      grassRepackCount: 1,
      grassPaletteDisplaySrgbSaturationMin: 0.1,
      grassPaletteDisplaySrgbSaturationMax: 0.7
    }, expected)).toThrow(/grass-crafted-telemetry/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      terrainShaderEnhanced: false,
      terrainShaderFallbackActive: true
    }, expected)).toThrow(/terrain-material-telemetry/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeModelReady: true
    }, expected)).toThrow(/forest-decorative-state/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeOverviewHidden: true
    }, expected)).toThrow(/forest-decorative-state/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      forestDecorativeModelReady: null
    }, expected)).toThrow(/forest-decorative-shape/i);
    // Keep ordinary and decorative categories independent: neither category
    // may borrow the other's unused allowance to conceal an overage.
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeTreeCount: 599,
      forestDecorativeTriangleCount: 159_000,
      forestDecorativeCacheEntries: 599,
      semanticTerrainFeatureCount: 1_610,
      totalTerrainDetailInstanceCount: 5_599
    }, expected)).toThrow(/semantic-terrain-feature-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeTreeCount: 599,
      forestDecorativeTriangleCount: 159_000,
      forestDecorativeCacheEntries: 599,
      semanticTerrainFeatureCount: 1_299,
      totalTerrainDetailInstanceCount: 6_310
    }, expected)).toThrow(/total-terrain-detail-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeDrawCalls: 4,
      forestDecorativeModelReady: true,
      forestDecorativeUsingFallback: false,
      semanticTerrainFeatureDrawCalls: 10,
      totalTerrainDetailDrawCalls: 12
    }, expected)).toThrow(/semantic-terrain-feature-draw-calls/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...balancedForestFallback,
      forestDecorativeDrawCalls: 6,
      forestDecorativeModelReady: true,
      forestDecorativeUsingFallback: false,
      semanticTerrainFeatureDrawCalls: 10,
      totalTerrainDetailDrawCalls: 12
    }, expected)).toThrow(/forest-decorative-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      presentedModelCount: 101,
      presentedLandscapeBaseCount: 101,
      raycastTargetCount: 101
    }, expected)).toThrow(/presented-model-mismatch/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      presentedLandscapeBaseCount: 17
    }, expected)).toThrow(/presented-landscape-base-mismatch/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      raycastTargetCount: 100
    }, expected)).toThrow(/raycast-target-mismatch/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      clusterLeaderMismatchCount: 1
    }, expected)).toThrow(/cluster-leader/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      readyOverlayVisible: true
    }, expected)).toThrow(/ready-overlay-visible/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelUnplacedCount: 1
    }, expected)).toThrow(/label-coverage-accounting|label-cull-accounting/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelEligibleCount: 19,
      labelUnplacedCount: 1,
      labelClusterOverflowCount: 1,
      presentedModelCount: 19,
      presentedLandscapeBaseCount: 19,
      raycastTargetCount: 19
    }, expected)).toThrow(/label-cluster-overflow|label-cull-accounting/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelClusteredCount: 1,
      clusterButtonCount: 1,
      accessibleClusterButtonCount: 1,
      clusterMemberCount: 1,
      clustersWithinViewportCount: 1
    }, expected)).toThrow(/label-clustered|label-cluster/i);
    expect(() => parseRenderedWebglBrowserDom(ready, {
      ...expected,
      maximumLabelOverflowCount: 1
    })).toThrow(/expected-label-overflow/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelLeaderMismatchCount: 1
    }, expected)).toThrow(/label-leader/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelMaximumAnchorDisplacement: 1
    }, expected)).toThrow(/label-anchor-displacement/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelAttachmentViolationCount: 1
    }, expected)).toThrow(/label-attachment/i);
    for (const [field, failure] of [
      ['labelPlacementBindingViolationCount', /label-placement-binding/i],
      ['labelIdentityPresentationViolationCount', /label-identity-presentation/i],
      ['clusterAttachmentViolationCount', /cluster-attachment/i],
      ['clusterRepresentativeAnchorViolationCount', /cluster-representative-anchor/i],
      ['clusterCastleOverlapCount', /cluster-castle-overlap/i],
      ['clusterMemberDistanceViolationCount', /cluster-member-distance/i],
      ['clusterPlacementBindingViolationCount', /cluster-placement-binding/i],
      ['clusterIdentityPresentationViolationCount', /cluster-identity-presentation/i],
      ['clusterHitTestViolationCount', /cluster-hit-test/i]
    ] as const) {
      expect(() => parseRenderedWebglBrowserDom({
        ...ready,
        [field]: 1
      }, expected)).toThrow(failure);
    }
    for (const [field, value, failure] of [
      ['labelsWithinViewportCount', 0, /label-viewport/i],
      ['labelHitTestViolationCount', 17, /label-hit-test/i],
      ['labelReservedOverlapCount', 5, /label-reserved-ui/i]
    ] as const) {
      expect(() => parseRenderedWebglBrowserDom({
        ...ready,
        [field]: value
      }, expected)).toThrow(failure);
    }
    expect(parseRenderedWebglBrowserDom({
      ...ready,
      labelCollisionCount: 20
    }, expected)).toMatchObject({ renderer: 'webgl' });
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelCollisionCount: 154
    }, expected)).toThrow(/label-collision-shape/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      tabbableLabelCount: 0
    }, expected)).toThrow(/label-roving-tab-stop/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      tabbableLabelCount: 2
    }, expected)).toThrow(/label-roving-tab-stop/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      hiddenFocusedLabelCount: 1
    }, expected)).toThrow(/label-hidden-focus/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      clusterMaximumAnchorDisplacement: 113
    }, expected)).toThrow(/cluster-anchor-displacement/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelAccountingValid: false
    }, expected)).toThrow(/label-accounting/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      legacyPlayerActionCount: 1
    }, expected)).toThrow(/legacy-player-actions/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      observerBadgeState: 'hidden'
    }, expected)).toThrow(/observer-observer-badge/i);
    expect(() => parseRenderedWebglBrowserDom({ ...ready, fid: 7 }, expected)).toThrow(/DOM/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelCullReasons: 'reserved-ui:1'
    }, expected)).toThrow(/label-cull-accounting/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelCullReasons: 'foreign-castle:1',
      labelEligibleCount: 19,
      labelUnplacedCount: 1,
      presentedModelCount: 19,
      presentedLandscapeBaseCount: 19,
      raycastTargetCount: 19
    }, expected)).toThrow(/label-cull-policy|label-cull-accounting/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelCullReasons: 'foreign-castle:1,private-id:7'
    }, expected)).toThrow(/label-cull-reasons-shape/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelCullReasons: 'reserved-ui:1,reserved-ui:2'
    }, expected)).toThrow(/label-cull-reasons-shape/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      readyAfterMilliseconds: 120_001
    }, expected)).toThrow(/observation/i);

    for (const [
      caseId,
      quality,
      semanticFeatureCount,
      totalDetailInstanceCount,
      forestTreeCount,
      forestTriangleCount,
      forestCacheLimit
    ] of [
      ['desktop-high', 'high', 2_510, 8_410, 1_200, 320_000, 2_048],
      ['desktop-balanced', 'balanced', 1_610, 6_310, 600, 160_000, 1_024],
      ['desktop-reduced', 'reduced', 790, 3_390, 180, 45_000, 512]
    ] as const) {
      const qualityCase = renderedWebglBrowserProbeCases(41_733)
        .find((probeCase) => probeCase.id === caseId)!;
      const qualityReady = {
        ...ready,
        href: qualityCase.url,
        quality,
        rootRealmCameraMode: 'keep',
        canvasRealmCameraMode: 'keep',
        rootRealmCameraPresentationBand: 'close',
        canvasRealmCameraPresentationBand: 'close',
        forestDecorativeTreeCount: forestTreeCount,
        forestDecorativeTriangleCount: forestTriangleCount,
        forestDecorativeDrawCalls: 5,
        forestDecorativeCacheEntries: forestCacheLimit,
        forestDecorativeCacheLimit: forestCacheLimit,
        forestDecorativeCacheHighWaterMark: forestCacheLimit,
        forestDecorativeRepackCount: 1,
        forestDecorativeModelReady: true,
        forestDecorativeUsingFallback: false,
        forestDecorativeFallbackType: 'none',
        forestDecorativeGroundingMode: 'terrain-canopy-baked-base',
        forestDecorativeCoreCellCount: 8,
        forestDecorativeBodyCellCount: 12,
        forestDecorativeFringeCellCount: 6,
        forestDecorativeClearingCellCount: 2,
        forestDecorativeSilhouetteCoverageRatio: 0.42,
        forestDecorativeOverviewHidden: false,
        grassCacheLimit: forestCacheLimit,
        semanticTerrainFeatureCount: semanticFeatureCount,
        semanticTerrainFeatureDrawCalls: 10,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount,
        totalTerrainDetailDrawCalls: 13
      };
      expect(parseRenderedWebglActiveForestDom(qualityReady, qualityCase)).toMatchObject({
        quality,
        forestDecorativeTreeCount: forestTreeCount,
        forestDecorativeTriangleCount: forestTriangleCount,
        forestDecorativeDrawCalls: 5,
        forestDecorativeCacheEntries: forestCacheLimit,
        forestDecorativeCacheHighWaterMark: forestCacheLimit,
        forestDecorativeModelReady: true,
        forestDecorativeUsingFallback: false,
        forestDecorativeOverviewHidden: false,
        semanticTerrainFeatureCount: semanticFeatureCount,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount
      });
      expect(() => parseRenderedWebglActiveForestDom({
        ...qualityReady,
        semanticTerrainFeatureCount: semanticFeatureCount + 1,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount
      }, qualityCase)).toThrow(/semantic-terrain-feature-budget/i);
      expect(() => parseRenderedWebglActiveForestDom({
        ...qualityReady,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount + 1
      }, qualityCase)).toThrow(/total-terrain-detail-budget/i);
      expect(() => parseRenderedWebglActiveForestDom({
        ...qualityReady,
        forestDecorativeTreeCount: forestTreeCount + 1,
        semanticTerrainFeatureCount: semanticFeatureCount + 1,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount + 1
      }, qualityCase)).toThrow(/forest-decorative-budget/i);
      expect(() => parseRenderedWebglActiveForestDom({
        ...qualityReady,
        forestDecorativeTriangleCount: forestTriangleCount + 1
      }, qualityCase)).toThrow(/forest-decorative-budget/i);
      expect(() => parseRenderedWebglActiveForestDom({
        ...qualityReady,
        forestDecorativeCacheHighWaterMark: forestCacheLimit + 1
      }, qualityCase)).toThrow(/forest-decorative-cache/i);
    }

    const playerCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'desktop-balanced-player')!;
    const playerReady = {
      ...ready,
      href: playerCase.url,
      presentationMode: 'player',
      mapPresentationMode: 'player',
      directExploreControlState: 'absent',
      profileTriggerAvatarCount: 1,
      profileTriggerCount: 1,
      profileTriggerState: 'visible',
      resourceIconCount: 5,
      resourceItemCount: 5,
      resourceRailCount: 1,
      resourceRailState: 'visible',
      resourceZeroValueCount: 5,
      observerBadgeState: 'absent',
      closeQaObserverControlState: 'absent'
    } as const;
    expect(parseRenderedWebglBrowserDom(playerReady, playerCase)).toMatchObject({
      presentationMode: 'player',
      quality: 'balanced'
    });
    expect(() => parseRenderedWebglBrowserDom({
      ...playerReady,
      profileTriggerState: 'hidden'
    }, playerCase)).toThrow(/player-profile-trigger/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...playerReady,
      resourceRailState: 'hidden'
    }, playerCase)).toThrow(/player-resource-rail/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...playerReady,
      profileTriggerTextBearingCount: 1
    }, playerCase)).toThrow(/profile-trigger-text/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...playerReady,
      resourceZeroValueCount: 4
    }, playerCase)).toThrow(/player-resource-zero-values/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...playerReady,
      observerBadgeState: 'visible'
    }, playerCase)).toThrow(/player-observer-badge/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...playerReady,
      closeQaObserverControlState: 'visible'
    }, playerCase)).toThrow(/player-observer-close/i);

    const tabletPlayerInspectorCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'tablet-balanced-player-inspector')!;
    const tabletPlayerInspectorExpected = {
      ...tabletPlayerInspectorCase,
      minimumLabelCount: 1
    };
    const tabletPlayerInspectorReady = {
      ...playerReady,
      href: tabletPlayerInspectorCase.url,
      viewportWidth: tabletPlayerInspectorCase.viewport.width,
      viewportHeight: tabletPlayerInspectorCase.viewport.height,
      documentWidth: tabletPlayerInspectorCase.viewport.width,
      interactionState: 'inspector',
      inspectorProfileImageState: 'ready',
      focusedReadableLabelCount: 1
    } as const;
    expect(parseRenderedWebglBrowserDom(
      tabletPlayerInspectorReady,
      tabletPlayerInspectorExpected
    )).toMatchObject({ presentationMode: 'player' });
    expect(() => parseRenderedWebglBrowserDom({
      ...tabletPlayerInspectorReady,
      inspectorProfileImageState: 'loading'
    }, tabletPlayerInspectorExpected)).toThrow(/inspector-profile-image-state/i);
    // An inspector can leave its source label in place and retain DOM focus,
    // or reserve tablet screen space and correctly cull it to avoid a
    // keep/UI overlap. Direct label-action evidence is asserted separately.
    expect(parseRenderedWebglBrowserDom({
      ...tabletPlayerInspectorReady,
      focusedReadableLabelCount: 1,
      focusedReadableLabelDomFocusCount: 1
    }, tabletPlayerInspectorExpected)).toMatchObject({ presentationMode: 'player' });
    expect(parseRenderedWebglBrowserDom({
      ...tabletPlayerInspectorReady,
      focusedReadableLabelCount: 0,
      focusedReadableLabelDomFocusCount: 0
    }, tabletPlayerInspectorExpected)).toMatchObject({ presentationMode: 'player' });
    expect(() => parseRenderedWebglBrowserDom({
      ...tabletPlayerInspectorReady,
      focusedReadableLabelCount: tabletPlayerInspectorReady.labelCount + 1
    }, tabletPlayerInspectorExpected)).toThrow(/focused-readable-label-shape/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...tabletPlayerInspectorReady,
      focusedReadableLabelCount: 0,
      focusedReadableLabelDomFocusCount: 1
    }, tabletPlayerInspectorExpected)).toThrow(/focused-readable-label-dom-focus-shape/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...tabletPlayerInspectorReady,
      profileTriggerState: 'hidden'
    }, tabletPlayerInspectorExpected)).toThrow(/player-profile-trigger/i);

    const shortLandscapePlayerExploreCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'short-landscape-balanced-player-explore')!;
    const shortLandscapePlayerExploreExpected = {
      ...shortLandscapePlayerExploreCase,
      minimumLabelCount: 0
    };
    const shortLandscapePlayerExploreReady = {
      ...playerReady,
      href: shortLandscapePlayerExploreCase.url,
      viewportWidth: shortLandscapePlayerExploreCase.viewport.width,
      viewportHeight: shortLandscapePlayerExploreCase.viewport.height,
      documentWidth: shortLandscapePlayerExploreCase.viewport.width,
      interactionState: 'explore',
      labelCount: 0,
      tabbableLabelCount: 0,
      labelEligibleCount: 0,
      labelPlacedCount: 0,
      labelUnplacedCount: 0,
      labelClusteredCount: 0,
      clusterButtonCount: 0,
      accessibleClusterButtonCount: 0,
      clusterMemberCount: 0,
      clustersWithinViewportCount: 0,
      individualCastleCount: 0,
      presentedModelCount: 0,
      presentedLandscapeBaseCount: 0,
      raycastTargetCount: 0,
      labelsTextBearingCount: 0,
      labelsWithinViewportCount: 0,
      exploreCastleCount: 100,
      exploreAccessibleCastleCount: 100,
      exploreCoordinateJumpCount: 0,
      exploreResourceSiteCount: 312,
      exploreAccessibleResourceSiteCount: 312,
      exploreResourceKindCount: 4,
      exploreAvailableResourceSiteCount: 307,
      exploreVisibleCoordinateCopyCount: 0
    } as const;
    expect(parseRenderedWebglBrowserDom(
      shortLandscapePlayerExploreReady,
      shortLandscapePlayerExploreExpected
    )).toMatchObject({
      presentationMode: 'player',
      exploreCoordinateJumpCount: 0,
      exploreResourceKindCount: 4,
      exploreResourceSiteCount: 312,
      exploreVisibleCoordinateCopyCount: 0,
      exploreVisibleOpaqueCopyCount: 0
    });
    expect(() => parseRenderedWebglBrowserDom({
      ...shortLandscapePlayerExploreReady,
      directExploreControlState: 'hidden'
    }, shortLandscapePlayerExploreExpected)).toThrow(/player-direct-explore/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...shortLandscapePlayerExploreReady,
      exploreCoordinateJumpCount: 1
    }, shortLandscapePlayerExploreExpected)).toThrow(/coordinate-jump-boundary/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...shortLandscapePlayerExploreReady,
      exploreAccessibleResourceSiteCount: 311
    }, shortLandscapePlayerExploreExpected)).toThrow(/resource-site-accessibility/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...shortLandscapePlayerExploreReady,
      exploreVisibleCoordinateCopyCount: 1
    }, shortLandscapePlayerExploreExpected)).toThrow(/visible-coordinate-copy/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...shortLandscapePlayerExploreReady,
      exploreVisibleOpaqueCopyCount: 1
    }, shortLandscapePlayerExploreExpected)).toThrow(/visible-opaque-copy/i);

    const inspectorCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'mobile-reduced-inspector')!;
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      href: inspectorCase.url,
      quality: inspectorCase.expectedQuality,
      viewportWidth: inspectorCase.viewport.width,
      viewportHeight: inspectorCase.viewport.height,
      documentWidth: inspectorCase.viewport.width,
      interactionState: 'inspector',
      inspectorProfileImageState: 'ready',
      labelCount: 0,
      tabbableLabelCount: 0,
      labelEligibleCount: 0,
      labelPlacedCount: 0,
      labelUnplacedCount: 0,
      individualCastleCount: 0,
      presentedModelCount: 0,
      presentedLandscapeBaseCount: 0,
      raycastTargetCount: 0,
      labelsTextBearingCount: 0,
      labelsWithinViewportCount: 0
    }, { ...inspectorCase, minimumLabelCount: 1 })).toThrow(/label-count/i);

    const exploreOnlyCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'short-landscape-explore')!;
    const exploreOnly = {
      ...ready,
      href: exploreOnlyCase.url,
      viewportWidth: exploreOnlyCase.viewport.width,
      viewportHeight: exploreOnlyCase.viewport.height,
      documentWidth: exploreOnlyCase.viewport.width,
      interactionState: 'explore',
      labelCount: 0,
      tabbableLabelCount: 0,
      labelEligibleCount: 0,
      labelPlacedCount: 0,
      labelUnplacedCount: 0,
      labelClusteredCount: 0,
      clusterButtonCount: 0,
      accessibleClusterButtonCount: 0,
      clusterMemberCount: 0,
      clustersWithinViewportCount: 0,
      individualCastleCount: 0,
      presentedModelCount: 0,
      presentedLandscapeBaseCount: 0,
      raycastTargetCount: 0,
      labelsTextBearingCount: 0,
      labelsWithinViewportCount: 0,
      exploreCastleCount: 100,
      exploreAccessibleCastleCount: 100,
      exploreCoordinateJumpCount: 1,
      exploreResourceSiteCount: 312,
      exploreAccessibleResourceSiteCount: 312,
      exploreResourceKindCount: 4,
      exploreAvailableResourceSiteCount: 307,
      exploreVisibleCoordinateCopyCount: 2
    } as const;
    expect(parseRenderedWebglBrowserDom(exploreOnly, {
      ...exploreOnlyCase,
      minimumLabelCount: 0
    })).toMatchObject({
      renderer: 'webgl',
      exploreCoordinateJumpCount: 1,
      exploreResourceKindCount: 4,
      exploreResourceSiteCount: 312
    });
    expect(() => parseRenderedWebglBrowserDom({
      ...exploreOnly,
      exploreCoordinateJumpCount: 0
    }, {
      ...exploreOnlyCase,
      minimumLabelCount: 0
    })).toThrow(/coordinate-jump-boundary/i);
    expect(() => parseRenderedWebglBrowserDom(exploreOnly, {
      ...exploreOnlyCase,
      minimumLabelCount: 1
    })).toThrow(/label-count/i);

    const persistentCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'mobile-balanced-persistent-labels')!;
    expect(parseRenderedWebglBrowserDom({
      ...ready,
      href: persistentCase.url,
      viewportWidth: persistentCase.viewport.width,
      viewportHeight: persistentCase.viewport.height,
      documentWidth: persistentCase.viewport.width
    }, persistentCase)).toMatchObject({ renderer: 'webgl' });
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      href: persistentCase.url,
      viewportWidth: persistentCase.viewport.width,
      viewportHeight: persistentCase.viewport.height,
      documentWidth: persistentCase.viewport.width,
      labelClusteredCount: 2,
      clusterButtonCount: 1,
      accessibleClusterButtonCount: 1,
      clusterMemberCount: 2,
      clustersWithinViewportCount: 1
    }, persistentCase)).toThrow(/label-clustered|label-cluster/i);

    const exploreCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'short-landscape-explore')!;
    expect(parseRenderedWebglBrowserDom({
      ...ready,
      href: exploreCase.url,
      viewportWidth: exploreCase.viewport.width,
      viewportHeight: exploreCase.viewport.height,
      documentWidth: exploreCase.viewport.width,
      interactionState: 'explore',
      exploreCastleCount: 100,
      exploreAccessibleCastleCount: 100,
      exploreCoordinateJumpCount: 1,
      exploreResourceSiteCount: 312,
      exploreAccessibleResourceSiteCount: 312,
      exploreResourceKindCount: 4,
      exploreAvailableResourceSiteCount: 307,
      exploreVisibleCoordinateCopyCount: 2
    }, { ...exploreCase, minimumLabelCount: 1 })).toMatchObject({ renderer: 'webgl' });
  });

  it('reduces an in-memory Chrome PNG to bounded visual evidence and rejects blank output', () => {
    expect(analyzeRenderedWebglPngScreenshot(
      renderedScreenshotPng(false),
      { width: 320, height: 320 }
    )).toMatchObject({
      sampleCount: 651,
      opaqueSamples: 651,
      averageSaturationBasisPoints: expect.any(Number),
      saturationP95BasisPoints: expect.any(Number),
      clippedBlackSamples: 0,
      clippedWhiteSamples: 0,
      coolHighAlbedoSamples: expect.any(Number),
      coolSpatialBuckets: expect.arrayContaining([expect.any(Number)]),
      warmLowGreenSamples: expect.any(Number),
      warmSpatialBuckets: expect.arrayContaining([expect.any(Number)]),
      hotYellowSamples: expect.any(Number)
    });
    expect(() => analyzeRenderedWebglPngScreenshot(
      renderedScreenshotPng(true),
      { width: 320, height: 320 }
    )).toThrow(/credible visual output/i);
    expect(() => analyzeRenderedWebglPngScreenshot(
      renderedScreenshotPng(false),
      { width: 321, height: 320 }
    )).toThrow(/screenshot/i);
  });

  it('keeps Northern Reach evidence bounded, anonymous, and fail-closed', async () => {
    const evidence = {
      band: 'close',
      coverage: [2_400, 1_000, 0.26, 0.12, 0, 0],
      material: [
        'genesis-001-northern-snow-presentation-v1',
        'one-band',
        true,
        false
      ],
      quality: 'balanced',
      recovered: true,
      recoveryExercised: true,
      region: 'deep',
      retained: [
        9_600,
        2_493,
        1_235,
        2_493 / 9_600,
        1_235 / 9_600,
        0.23,
        0,
        0,
        0.91
      ],
      selected: true,
      stable: true,
      vertices: [0, 0.91, 0.21, 200_000]
    } as const;
    expect(parseNorthernReachRenderedEvidence(evidence, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toEqual(evidence);
    expect(() => parseNorthernReachRenderedEvidence({
      ...evidence,
      q: 4
    }, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toThrow(/Northern Reach/i);
    expect(() => parseNorthernReachRenderedEvidence({
      ...evidence,
      vertices: [0, 0.91, Number.NaN, 200_000]
    }, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toThrow(/Northern Reach/i);
    expect(() => parseNorthernReachRenderedEvidence({
      ...evidence,
      coverage: [2_400, 1_000, 0.26, 0.12, 0, 1]
    }, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toThrow(/Northern Reach/i);

    const deepVisual = {
      clippedBlackSamples: 0,
      clippedWhiteSamples: 0,
      coolHighAlbedoSamples: 8,
      coolSpatialBuckets: [7, 0, 0, 0, 1, 0, 0, 0, 0],
      hotYellowSamples: 0
    } as const;
    expect(() => assertNorthernReachRenderedVisual(
      evidence,
      deepVisual
    )).not.toThrow();
    expect(() => assertNorthernReachRenderedVisual(evidence, {
      ...deepVisual,
      coolHighAlbedoSamples: 1,
      coolSpatialBuckets: [0, 0, 0, 0, 1, 0, 0, 0, 0]
    })).toThrow(/visual aggregate/i);
    expect(() => assertNorthernReachRenderedVisual(evidence, {
      ...deepVisual,
      coolSpatialBuckets: [8, 0, 0, 0, 0, 0, 0, 0, 0]
    })).toThrow(/visual aggregate/i);

    const ordinaryEvidence = {
      ...evidence,
      recovered: false,
      recoveryExercised: false
    } as const;
    expect(parseNorthernReachRenderedEvidence(ordinaryEvidence, {
      quality: 'balanced',
      recover: false,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toEqual(ordinaryEvidence);
    expect(() => parseNorthernReachRenderedEvidence(ordinaryEvidence, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toThrow(/Northern Reach/i);

    const transitionEvidence = {
      ...ordinaryEvidence,
      band: 'strategy',
      region: 'transition'
    } as const;
    expect(parseNorthernReachRenderedEvidence(transitionEvidence, {
      quality: 'balanced',
      recover: false,
      region: 'transition',
      viewport: { width: 1_440, height: 900 }
    })).toEqual(transitionEvidence);
    expect(() => assertNorthernReachRenderedVisual(
      transitionEvidence,
      deepVisual
    )).not.toThrow();
    expect(() => assertNorthernReachRenderedVisual(transitionEvidence, {
      ...deepVisual,
      coolHighAlbedoSamples: 1,
      coolSpatialBuckets: [0, 0, 0, 0, 1, 0, 0, 0, 0]
    })).toThrow(/visual aggregate/i);

    const overviewEvidence = {
      ...ordinaryEvidence,
      band: 'overview',
      region: 'overview'
    } as const;
    expect(parseNorthernReachRenderedEvidence(overviewEvidence, {
      quality: 'balanced',
      recover: false,
      region: 'overview',
      viewport: { width: 1_440, height: 900 }
    })).toEqual(overviewEvidence);
    expect(() => assertNorthernReachRenderedVisual(overviewEvidence, {
      ...deepVisual,
      coolHighAlbedoSamples: 8,
      coolSpatialBuckets: [8, 0, 0, 0, 0, 0, 0, 0, 0]
    })).not.toThrow();
    expect(() => assertNorthernReachRenderedVisual(overviewEvidence, {
      ...deepVisual,
      coolHighAlbedoSamples: 1,
      coolSpatialBuckets: [1, 0, 0, 0, 0, 0, 0, 0, 0]
    })).toThrow(/visual aggregate/i);
    const forestVisual = analyzeRenderedWebglPngScreenshot(
      renderedScreenshotPng(false, 'forest'),
      { width: 320, height: 320 }
    );
    expect(forestVisual.coolHighAlbedoSamples).toBe(0);
    expect(() => assertNorthernReachRenderedVisual(
      evidence,
      forestVisual
    )).toThrow(/visual aggregate/i);

    const reducedEvidence = {
      ...ordinaryEvidence,
      material: [
        'genesis-001-northern-snow-presentation-v1',
        'none',
        true,
        false
      ],
      quality: 'reduced'
    } as const;
    const frameSignature = {
      cameraMode: 'keep',
      cameraPresentationBand: 'close',
      cameraStateToken: '1a2b3c4d'.repeat(3),
      cameraTargetKind: 'cell-location',
      canvasLastSuccessfulGeneration: 4,
      canvasRendererGeneration: 4,
      rendererGeneration: 4,
      rendererLastSuccessfulGeneration: 4
    } as const;
    expect(() => assertNorthernReachRepeatedReducedMotionEvidence(
      {
        evidence: reducedEvidence,
        signature: frameSignature,
        visual: deepVisual
      },
      {
        evidence: {
          ...reducedEvidence,
          coverage: [2_400, 1_000, 0.260_000_4, 0.120_000_4, 0, 0],
          vertices: [0, 0.910_000_4, 0.210_000_4, 200_000]
        },
        signature: frameSignature,
        visual: {
          ...deepVisual,
          coolHighAlbedoSamples: 9,
          coolSpatialBuckets: [7, 1, 0, 0, 1, 0, 0, 0, 0]
        }
      }
    )).not.toThrow();
    expect(() => assertNorthernReachRepeatedReducedMotionEvidence(
      {
        evidence: reducedEvidence,
        signature: frameSignature,
        visual: deepVisual
      },
      {
        evidence: {
          ...reducedEvidence,
          coverage: [2_400, 1_000, 0.260_002, 0.12, 0, 0]
        },
        signature: frameSignature,
        visual: deepVisual
      }
    )).toThrow(/repeated reduced-motion/i);
    expect(() => assertNorthernReachRepeatedReducedMotionEvidence(
      {
        evidence: reducedEvidence,
        signature: frameSignature,
        visual: deepVisual
      },
      {
        evidence: reducedEvidence,
        signature: frameSignature,
        visual: {
          ...deepVisual,
          coolHighAlbedoSamples: 11,
          coolSpatialBuckets: [10, 0, 0, 0, 1, 0, 0, 0, 0]
        }
      }
    )).toThrow(/repeated reduced-motion/i);
    expect(() => assertNorthernReachRepeatedReducedMotionEvidence(
      {
        evidence: reducedEvidence,
        signature: frameSignature,
        visual: deepVisual
      },
      {
        evidence: {
          ...reducedEvidence,
          material: [
            'genesis-001-northern-snow-presentation-v1',
            'one-band',
            true,
            false
          ]
        },
        signature: frameSignature,
        visual: deepVisual
      }
    )).toThrow(/repeated reduced-motion/i);
    expect(() => assertNorthernReachRepeatedReducedMotionEvidence(
      {
        evidence: reducedEvidence,
        signature: frameSignature,
        visual: deepVisual
      },
      {
        evidence: reducedEvidence,
        signature: {
          ...frameSignature,
          cameraStateToken: '4d3c2b1a'.repeat(3)
        },
        visual: deepVisual
      }
    )).toThrow(/repeated reduced-motion/i);

    const source = readFileSync(resolve(
      import.meta.dirname,
      '../scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toMatch(
      /RENDERED_WEBGL_QA_NORTHERN_REACH_CASE_IDS[\s\S]*'short-landscape-balanced-northern'/
    );
    expect(source).toMatch(
      /navigateRenderedWebglCase\(session, 'about:blank', state\)[\s\S]*waitForAcceptedRenderedDom\(session, baseline, state\)/
    );
    expect(source).toContain(
      "region === 'transition' && evidence.band !== 'strategy'"
    );
    expect(source.match(
      /delay\(NORTHERN_REACH_REDUCED_MOTION_HOST_WAIT_MILLISECONDS\)/g
    )).toHaveLength(4);
    expect(source).toContain(
      '[data-owned-by-viewer="true"][data-phase="returning"]'
    );
    expect(source).toMatch(
      /inspectionMounted[\s\S]*dispatchEvent\(new PointerEvent\('pointerover'/
    );
    expect(source).toContain('WARPKEEP_QA_NORTHERN_ARTIFACT_DIR');
    expect(source).toContain("flag: 'wx'");
    expect(source).toContain(
      'const realDestinationDirectory = await realpath(destinationDirectory)'
    );

    const signatureCommand = vi.fn(async (
      _method: string,
      _params?: Readonly<Record<string, unknown>>
    ) => ({
      result: { type: 'object', value: frameSignature }
    }));
    await expect(readNorthernReachStaticFrameSignature({
      command: signatureCommand
    })).resolves.toEqual(frameSignature);
    expect(String(signatureCommand.mock.calls[0]?.[1]?.expression))
      .toContain('realmCameraStateToken');

    const command = vi.fn(async (
      _method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => ({
      result: { type: 'object', value: evidence }
    }));
    await expect(applyNorthernReachRenderedEvidence({ command }, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).resolves.toEqual(evidence);
    const expression = String(command.mock.calls[0]?.[1]?.expression);
    expect(expression).toContain("import('/src/game/map/realmNorthernSnow.ts')");
    expect(expression).toContain("'.realm-cell-navigator__jump'");
    expect(expression).toContain("getExtension('WEBGL_lose_context')");
    expect(expression).toContain("let recovered=false");
    expect(expression).toContain("recoveryExercised:recover");
    expect(expression).toContain("number('snowSouthernLeakCount')");
    expect(expression).toContain(
      'root.dataset.realmSelectedCellKey===selectedTargetKey'
    );
    expect(expression).toContain('cameraToken()===beforeCameraToken');
    expect(expression).not.toContain('return target');

    const ordinaryCommand = vi.fn(async () => ({
      result: { type: 'object', value: ordinaryEvidence }
    }));
    await expect(applyNorthernReachRenderedEvidence({ command: ordinaryCommand }, {
      quality: 'balanced',
      recover: false,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).resolves.toEqual(ordinaryEvidence);
  });

  it('keeps Sunscoured South targets and rendered evidence exact and fail-closed', async () => {
    const evidence = {
      band: 'close',
      climate: 'south',
      compositionBucket: 4,
      coverage: [2_400, 1_000, 0.25, 1_000 / 9_600, 0, 0],
      material: [
        'genesis-001-southern-desert-presentation-v1',
        'one-band',
        true,
        false
      ],
      quality: 'balanced',
      recovered: true,
      recoveryExercised: true,
      region: 'deep',
      retained: [
        9_600,
        2_400,
        1_000,
        0.25,
        1_000 / 9_600,
        0.22,
        0,
        0,
        0.9
      ],
      selected: true,
      separation: [0, 0],
      stable: true,
      vertices: [0, 0.94, 0.2, 200_000]
    } as const;
    expect(parseRegionalClimateRenderedEvidence(evidence, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toEqual(evidence);
    expect(() => parseRegionalClimateRenderedEvidence({
      ...evidence,
      desertTarget: '-43,48'
    }, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toThrow(/Sunscoured South/i);
    expect(() => parseRegionalClimateRenderedEvidence({
      ...evidence,
      retained: [
        9_599,
        2_400,
        1_000,
        0.25,
        1_000 / 9_600,
        0.22,
        0,
        0,
        0.9
      ]
    }, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).toThrow(/Sunscoured South/i);

    const deepVisual = {
      clippedBlackSamples: 0,
      clippedWhiteSamples: 0,
      coolHighAlbedoSamples: 10,
      coolSpatialBuckets: [5, 0, 0, 0, 5, 0, 0, 0, 0],
      warmLowGreenSamples: 80,
      warmSpatialBuckets: [10, 5, 5, 5, 30, 5, 5, 5, 10],
      hotYellowSamples: 0
    } as const;
    expect(() => assertRegionalClimateRenderedVisual(
      evidence,
      deepVisual
    )).not.toThrow();
    expect(() => assertRegionalClimateRenderedVisual(evidence, {
      ...deepVisual,
      warmLowGreenSamples: 40,
      warmSpatialBuckets: [5, 5, 5, 5, 10, 5, 0, 0, 5]
    })).toThrow(/Sunscoured South/i);
    expect(() => assertRegionalClimateRenderedVisual(evidence, {
      ...deepVisual,
      warmSpatialBuckets: [40, 5, 5, 5, 0, 5, 5, 5, 10]
    })).toThrow(/Sunscoured South/i);

    const transitionTarget =
      SUNSCOURED_SOUTH_RENDERED_TARGET_MANIFEST.transition;
    expect(() => assertSunscouredSouthRenderedTarget(
      transitionTarget,
      {
        coverage: transitionTarget.expectedCoverage,
        terrainKind: transitionTarget.expectedTerrainKind,
        passable: true,
        staticContentKind: 'empty',
        water: false,
        resourceKind: 'food',
        resourceSiteId: 'genesis-001-tier1-food-077',
        resourceQ: 25,
        resourceR: 32,
        resourceTier: 1,
        resourceActive: true
      }
    )).not.toThrow();
    const waterTarget =
      SUNSCOURED_SOUTH_RENDERED_TARGET_MANIFEST['water-edge'];
    expect(() => assertSunscouredSouthRenderedTarget(
      waterTarget,
      {
        coverage: waterTarget.expectedCoverage,
        terrainKind: waterTarget.expectedTerrainKind,
        passable: true,
        staticContentKind: 'empty',
        water: false,
        waterBodyId:
          'genesis-001-canonical-water-v1:river:genesis-001-river-06',
        waterCellKey: '-35,35',
        waterQ: -35,
        waterR: 35,
        waterRegime: 'river'
      }
    )).not.toThrow();
    expect(() => assertSunscouredSouthRenderedTarget(
      transitionTarget,
      {
        coverage: transitionTarget.expectedCoverage + 0.000_001,
        terrainKind: transitionTarget.expectedTerrainKind,
        passable: true,
        staticContentKind: 'empty',
        water: false
      }
    )).toThrow(/Sunscoured South/i);

    const reducedEvidence = {
      ...evidence,
      material: [
        'genesis-001-southern-desert-presentation-v1',
        'none',
        true,
        false
      ],
      quality: 'reduced',
      recovered: false,
      recoveryExercised: false
    } as const;
    const signature = {
      cameraMode: 'keep',
      cameraPresentationBand: 'close',
      cameraStateToken: '1a2b3c4d'.repeat(3),
      cameraTargetKind: 'cell-location',
      canvasLastSuccessfulGeneration: 4,
      canvasRendererGeneration: 4,
      rendererGeneration: 4,
      rendererLastSuccessfulGeneration: 4
    } as const;
    expect(() => assertRegionalClimateRepeatedReducedMotionEvidence(
      {
        evidence: reducedEvidence,
        signature,
        visual: deepVisual
      },
      {
        evidence: {
          ...reducedEvidence,
          coverage: [2_400, 1_000, 0.250_000_4, 1_000 / 9_600, 0, 0],
          vertices: [0, 0.940_000_4, 0.200_000_4, 200_000]
        },
        signature,
        visual: {
          ...deepVisual,
          warmLowGreenSamples: 81,
          warmSpatialBuckets: [10, 5, 5, 5, 31, 5, 5, 5, 10]
        }
      }
    )).not.toThrow();
    expect(() => assertRegionalClimateRepeatedReducedMotionEvidence(
      {
        evidence: reducedEvidence,
        signature,
        visual: deepVisual
      },
      {
        evidence: reducedEvidence,
        signature: {
          ...signature,
          cameraStateToken: '4d3c2b1a'.repeat(3)
        },
        visual: deepVisual
      }
    )).toThrow(/repeated reduced-motion/i);

    const command = vi.fn(async (
      _method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => ({
      result: { type: 'object', value: evidence }
    }));
    await expect(applyRegionalClimateRenderedEvidence({ command }, {
      quality: 'balanced',
      recover: true,
      region: 'deep',
      viewport: { width: 1_440, height: 900 }
    })).resolves.toEqual(evidence);
    const expression = String(command.mock.calls[0]?.[1]?.expression);
    expect(expression).toContain(
      "import('/src/game/map/realmSouthernDesert.ts')"
    );
    expect(expression).toContain('"q":-43,"r":48');
    expect(expression).toContain(
      "number('desertSampledPlayableLandCellCenterCount')"
    );
    expect(expression).toContain(
      'root.dataset.realmSelectedCellKey===selectedTargetKey'
    );
    expect(expression).toContain('cameraToken()===beforeCameraToken');
    expect(expression).not.toContain('for(const tile of CANONICAL_WORLD_TILES)');

    const source = readFileSync(resolve(
      import.meta.dirname,
      '../scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toMatch(
      /RENDERED_WEBGL_QA_SUNSCOURED_SOUTH_CASE_IDS[\s\S]*'short-landscape-explore'/
    );
    expect(source).toContain('WARPKEEP_QA_SOUTHERN_ARTIFACT_DIR');
    expect(source).toContain("artifactRegion: 'southern'");
    expect(source).toContain(
      'assertRegionalClimateRepeatedReducedMotionEvidence'
    );
  });

});
