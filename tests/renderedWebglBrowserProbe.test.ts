import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  analyzeRenderedWebglPngScreenshot,
  applyRenderedWebglCaseInteraction,
  attestHeadlessChromeCodeSignature,
  closeRenderedWebglLoopbackServer,
  cleanupRenderedWebglProbeResources,
  DevtoolsPipeSession,
  headlessChromeProbeContract,
  isAllowedRenderedWebglPageUrl,
  parseHeadlessChromeCodeSignature,
  parseRenderedWebglBrowserDom,
  parseRenderedWebglInspectorLabelActivationEvidence,
  RENDERED_WEBGL_QA_CHROME,
  RENDERED_WEBGL_QA_CHROME_APP,
  RENDERED_WEBGL_QA_CASE_COUNT,
  RENDERED_WEBGL_QA_CHROME_TEAM_ID,
  RENDERED_WEBGL_QA_VITE_FS_DENY,
  renderedWebglLabelAnchorDistanceTelemetry,
  renderedWebglLabelDisplacementClassificationValid,
  renderedWebglBrowserProbeCases,
  selectBlankPageTarget,
  spawnHeadlessChromeProbe,
  terminateHeadlessChromeProcessGroup
} from '../scripts/qa-observer/rendered-webgl-browser-probe.mjs';

function cdpPipeFrame(value: unknown) {
  return Buffer.from(`${JSON.stringify(value)}\0`, 'utf8');
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
    const { resolveConfig } = await import('vite');
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

    expect(resolved.server.fs.deny).toEqual([
      '.env',
      '.env.*',
      '*.{crt,pem}',
      '**/.git/**',
      '**/.cache/**'
    ]);
  });

  it('uses an inline fail-closed Vite configuration and disposable cache', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain('configFile: false');
    expect(source).toContain('envFile: false');
    expect(source).toContain('plugins: [reactPlugin(), ...localQaPlugins]');
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
    expect(RENDERED_WEBGL_QA_VITE_FS_DENY).toEqual([
      '.env',
      '.env.*',
      '*.{crt,pem}',
      '**/.git/**',
      '**/.cache/**'
    ]);
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

  it('activates the accepted baseline cluster without an intermediary camera transition', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain('const target = accessibleClusters[0]');
    expect(source).not.toContain("button.getAttribute('aria-label') === 'Show Full Realm'");
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

  it('fixes fourteen responsive, interaction, and presentation cases to one numeric loopback origin', () => {
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
        maximumLabelOverflowCount: 13,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=high',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-balanced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 13,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'full-hd-balanced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 8,
        minimumLabelCount: 16,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1920, height: 1080 }
      },
      {
        id: 'tablet-balanced-inspector',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'inspector',
        maximumLabelOverflowCount: 9,
        minimumLabelCount: 11,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1024, height: 768 }
      },
      {
        id: 'tablet-balanced-player-inspector',
        expectedPlayerActionControlState: 'visible',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'inspector',
        maximumLabelOverflowCount: 9,
        minimumLabelCount: 11,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player',
        viewport: { width: 1024, height: 768 }
      },
      {
        id: 'mobile-balanced-cluster',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'cluster',
        maximumLabelOverflowCount: 10,
        minimumLabelCount: 5,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'desktop-reduced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'reduced',
        interaction: 'default',
        maximumLabelOverflowCount: 13,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-invalid-fallback',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 13,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=invalid',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'mobile-balanced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 10,
        minimumLabelCount: 5,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'mobile-reduced-inspector',
        expectedPresentationMode: 'observer',
        expectedQuality: 'reduced',
        interaction: 'inspector',
        maximumLabelOverflowCount: 8,
        minimumLabelCount: 4,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'short-landscape-explore',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'explore',
        maximumLabelOverflowCount: 17,
        minimumLabelCount: 1,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 667, height: 375 }
      },
      {
        id: 'short-landscape-balanced-player-explore',
        expectedPlayerActionControlState: 'visible',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'explore',
        maximumLabelOverflowCount: 17,
        minimumLabelCount: 1,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player',
        viewport: { width: 667, height: 375 }
      },
      {
        id: 'desktop-balanced-player',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 13,
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'mobile-balanced-player',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'default',
        maximumLabelOverflowCount: 10,
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

    await terminateHeadlessChromeProcessGroup({
      pid: 4321,
      exitCode: 0,
      signalCode: null
    } as never, { terminateProcessGroup, wait });

    expect(terminateProcessGroup.mock.calls).toEqual([
      [expect.objectContaining({ pid: 4321 }), 'SIGTERM'],
      [expect.objectContaining({ pid: 4321 }), 'SIGKILL']
    ]);
    expect(wait).not.toHaveBeenCalled();
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
                targetInfo: blankTargetInfo(true),
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
      quality: 'balanced',
      castleCount: 100,
      readyAfterMilliseconds: 2_412,
      environmentLighting: 'procedural',
      semanticTerrainCellCount: 1_261,
      semanticTerrainKindCount: 7,
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
      labelsWithinViewportCount: 18,
      labelCollisionCount: 0,
      labelCastleOverlapCount: 0,
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
      recenterKeepControlState: 'absent',
      returnToMenuControlState: 'absent',
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
      semanticTerrainCellCount: 1_261,
      semanticTerrainKindCount: 7,
      semanticTerrainFeatureCount: 700,
      semanticTerrainFeatureDrawCalls: 5,
      totalTerrainDetailInstanceCount: 5_000,
      totalTerrainDetailDrawCalls: 8
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
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      semanticTerrainCellCount: 1_260
    }, expected)).toThrow(/semantic-terrain-cell-count/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      semanticTerrainKindCount: 6
    }, expected)).toThrow(/semantic-terrain-kind-count/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      semanticTerrainFeatureCount: 0
    }, expected)).toThrow(/semantic-terrain-feature-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      semanticTerrainFeatureCount: 801
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
      totalTerrainDetailInstanceCount: 5_501
    }, expected)).toThrow(/total-terrain-detail-budget/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      totalTerrainDetailDrawCalls: 9
    }, expected)).toThrow(/total-terrain-detail-draw-calls/i);
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
    }, expected)).toThrow(/label-coverage-total/i);
    expect(parseRenderedWebglBrowserDom({
      ...ready,
      labelEligibleCount: 19,
      labelUnplacedCount: 1,
      labelClusterOverflowCount: 1,
      presentedModelCount: 19,
      presentedLandscapeBaseCount: 19,
      raycastTargetCount: 19
    }, expected)).toMatchObject({ renderer: 'webgl' });
    expect(parseRenderedWebglBrowserDom({
      ...ready,
      labelEligibleCount: 31,
      labelUnplacedCount: expected.maximumLabelOverflowCount,
      labelClusterOverflowCount: expected.maximumLabelOverflowCount,
      presentedModelCount: 31,
      presentedLandscapeBaseCount: 31,
      raycastTargetCount: 31
    }, expected)).toMatchObject({ renderer: 'webgl' });
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelEligibleCount: 32,
      labelUnplacedCount: expected.maximumLabelOverflowCount + 1,
      labelClusterOverflowCount: expected.maximumLabelOverflowCount + 1,
      presentedModelCount: 32,
      presentedLandscapeBaseCount: 32,
      raycastTargetCount: 32
    }, expected)).toThrow(/label-cluster-overflow-cap/i);
    expect(() => parseRenderedWebglBrowserDom(ready, {
      ...expected,
      maximumLabelOverflowCount: 101
    })).toThrow(/expected-label-cluster-overflow-cap/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelEligibleCount: 19,
      labelUnplacedCount: 1,
      labelClusteredCount: 1,
      clusterButtonCount: 1
    }, expected)).toThrow(/label-cluster-membership/i);
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
      ['labelHitTestViolationCount', /label-hit-test/i],
      ['labelCastleOverlapCount', /label-castle-overlap/i],
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
      recenterKeepControlState: 'visible'
    }, expected)).toThrow(/observer-recenter-control/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      observerBadgeState: 'hidden'
    }, expected)).toThrow(/observer-observer-badge/i);
    expect(() => parseRenderedWebglBrowserDom({ ...ready, fid: 7 }, expected)).toThrow(/DOM/i);
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

    for (const [caseId, quality, semanticFeatureCount, totalDetailInstanceCount] of [
      ['desktop-high', 'high', 1_100, 7_000],
      ['desktop-reduced', 'reduced', 400, 3_000]
    ] as const) {
      const qualityCase = renderedWebglBrowserProbeCases(41_733)
        .find((probeCase) => probeCase.id === caseId)!;
      const qualityReady = {
        ...ready,
        href: qualityCase.url,
        quality,
        semanticTerrainFeatureCount: semanticFeatureCount,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount
      };
      expect(parseRenderedWebglBrowserDom(qualityReady, qualityCase)).toMatchObject({
        quality,
        semanticTerrainFeatureCount: semanticFeatureCount,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount
      });
      expect(() => parseRenderedWebglBrowserDom({
        ...qualityReady,
        semanticTerrainFeatureCount: semanticFeatureCount + 1,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount
      }, qualityCase)).toThrow(/semantic-terrain-feature-budget/i);
      expect(() => parseRenderedWebglBrowserDom({
        ...qualityReady,
        totalTerrainDetailInstanceCount: totalDetailInstanceCount + 1
      }, qualityCase)).toThrow(/total-terrain-detail-budget/i);
    }

    const playerCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'desktop-balanced-player')!;
    const playerReady = {
      ...ready,
      href: playerCase.url,
      presentationMode: 'player',
      mapPresentationMode: 'player',
      recenterKeepControlState: 'visible',
      returnToMenuControlState: 'visible',
      observerBadgeState: 'absent',
      closeQaObserverControlState: 'absent'
    } as const;
    expect(parseRenderedWebglBrowserDom(playerReady, playerCase)).toMatchObject({
      presentationMode: 'player',
      quality: 'balanced'
    });
    expect(() => parseRenderedWebglBrowserDom({
      ...playerReady,
      recenterKeepControlState: 'hidden'
    }, playerCase)).toThrow(/player-recenter-control/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...playerReady,
      returnToMenuControlState: 'hidden'
    }, playerCase)).toThrow(/player-return-control/i);
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
      recenterKeepControlState: 'hidden'
    }, tabletPlayerInspectorExpected)).toThrow(/player-recenter-control/i);

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
      exploreAccessibleCastleCount: 100
    } as const;
    expect(parseRenderedWebglBrowserDom(
      shortLandscapePlayerExploreReady,
      shortLandscapePlayerExploreExpected
    )).toMatchObject({ presentationMode: 'player' });
    expect(() => parseRenderedWebglBrowserDom({
      ...shortLandscapePlayerExploreReady,
      returnToMenuControlState: 'hidden'
    }, shortLandscapePlayerExploreExpected)).toThrow(/player-return-control/i);

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
      exploreAccessibleCastleCount: 100
    } as const;
    expect(parseRenderedWebglBrowserDom(exploreOnly, {
      ...exploreOnlyCase,
      minimumLabelCount: 0
    })).toMatchObject({ renderer: 'webgl' });
    expect(() => parseRenderedWebglBrowserDom(exploreOnly, {
      ...exploreOnlyCase,
      minimumLabelCount: 1
    })).toThrow(/label-count/i);

    const clusterCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'mobile-balanced-cluster')!;
    const clustered = {
      ...ready,
      href: clusterCase.url,
      viewportWidth: clusterCase.viewport.width,
      viewportHeight: clusterCase.viewport.height,
      documentWidth: clusterCase.viewport.width,
      interactionState: 'cluster',
      focusedReadableLabelDomFocusCount: 1,
      focusedReadableLabelCount: 1,
      labelEligibleCount: 20,
      labelUnplacedCount: 2,
      labelClusteredCount: 2,
      presentedModelCount: 20,
      presentedLandscapeBaseCount: 20,
      raycastTargetCount: 20,
      clusterButtonCount: 1,
      accessibleClusterButtonCount: 1,
      clusterMemberCount: 2,
      clustersWithinViewportCount: 1
    } as const;
    expect(parseRenderedWebglBrowserDom(clustered, {
      ...clusterCase,
      minimumLabelCount: 1,
      clusterButtonCountBefore: 2,
      clusterMemberCountBefore: 5
    })).toMatchObject({ renderer: 'webgl' });
    expect(() => parseRenderedWebglBrowserDom({
      ...clustered,
      accessibleClusterButtonCount: 0
    }, {
      ...clusterCase,
      minimumLabelCount: 1,
      clusterButtonCountBefore: 2,
      clusterMemberCountBefore: 5
    })).toThrow(/cluster-accessibility/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...clustered,
      focusedReadableLabelDomFocusCount: 0
    }, {
      ...clusterCase,
      minimumLabelCount: 1,
      clusterButtonCountBefore: 2,
      clusterMemberCountBefore: 5
    })).toThrow(/focused-readable-label-dom-focus/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...clustered,
      focusedReadableLabelCount: 0,
      focusedReadableLabelDomFocusCount: 0
    }, {
      ...clusterCase,
      minimumLabelCount: 1,
      clusterButtonCountBefore: 2,
      clusterMemberCountBefore: 5
    })).toThrow(/focused-readable-label/i);
    expect(parseRenderedWebglBrowserDom(clustered, {
      ...clusterCase,
      minimumLabelCount: 1,
      clusterButtonCountBefore: 1,
      clusterMemberCountBefore: 2
    })).toMatchObject({ renderer: 'webgl' });

    const exploreCase = renderedWebglBrowserProbeCases(41_733)
      .find((probeCase) => probeCase.id === 'short-landscape-explore')!;
    expect(parseRenderedWebglBrowserDom({
      ...ready,
      href: exploreCase.url,
      viewportWidth: exploreCase.viewport.width,
      viewportHeight: exploreCase.viewport.height,
      documentWidth: exploreCase.viewport.width,
      interactionState: 'explore',
      labelEligibleCount: 19,
      labelUnplacedCount: 1,
      labelClusterOverflowCount: 1,
      presentedModelCount: 19,
      presentedLandscapeBaseCount: 19,
      raycastTargetCount: 19,
      exploreCastleCount: 100,
      exploreAccessibleCastleCount: 100
    }, { ...exploreCase, minimumLabelCount: 1 })).toMatchObject({ renderer: 'webgl' });
  });

  it('reduces an in-memory Chrome PNG to bounded visual evidence and rejects blank output', () => {
    const chunk = (type: string, data: Buffer) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.byteLength);
      return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
    };
    const createPng = (blank: boolean) => {
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
          rows[offset] = blank ? 0 : (x * 7 + y * 3) & 0xff;
          rows[offset + 1] = blank ? 0 : (x * 2 + y * 11) & 0xff;
          rows[offset + 2] = blank ? 0 : (x * 13 + y * 5) & 0xff;
          rows[offset + 3] = 255;
        }
      }
      return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(rows)),
        chunk('IEND', Buffer.alloc(0))
      ]);
    };

    expect(analyzeRenderedWebglPngScreenshot(
      createPng(false),
      { width: 320, height: 320 }
    )).toMatchObject({
      sampleCount: 117,
      opaqueSamples: 117
    });
    expect(() => analyzeRenderedWebglPngScreenshot(
      createPng(true),
      { width: 320, height: 320 }
    )).toThrow(/credible visual output/i);
    expect(() => analyzeRenderedWebglPngScreenshot(
      createPng(false),
      { width: 321, height: 320 }
    )).toThrow(/screenshot/i);
  });
});
