import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  analyzeRenderedWebglPngScreenshot,
  attestHeadlessChromeCodeSignature,
  headlessChromeProbeContract,
  isAllowedRenderedWebglPageUrl,
  parseDevtoolsActivePort,
  parseHeadlessChromeCodeSignature,
  parseRenderedWebglBrowserDom,
  RENDERED_WEBGL_QA_CHROME,
  RENDERED_WEBGL_QA_CHROME_APP,
  RENDERED_WEBGL_QA_CASE_COUNT,
  RENDERED_WEBGL_QA_CHROME_TEAM_ID,
  renderedWebglLabelAnchorDistanceTelemetry,
  renderedWebglLabelDisplacementClassificationValid,
  renderedWebglBrowserProbeCases,
  selectBlankPageTarget,
  spawnHeadlessChromeProbe,
  terminateHeadlessChromeProcessGroup
} from '../scripts/qa-observer/rendered-webgl-browser-probe.mjs';

describe('rendered WebGL headless browser probe contract', () => {
  it('uses an inline fail-closed Vite configuration and disposable cache', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain('configFile: false');
    expect(source).toContain('envFile: false');
    expect(source).toContain('plugins: [reactPlugin()]');
    expect(source).toContain("__WARPKEEP_LOCAL_QA__: 'true'");
    expect(source).toContain('__WARPKEEP_PRODUCT_VERSION__: JSON.stringify(packageJson.version)');
    expect(source).toContain("cacheDir: join(privateRuntime, 'vite-cache')");
    expect(source).toContain('allow: [REPOSITORY_ROOT]');
    expect(source).toContain('attestStableHeadlessChromeExecutable(reviewedChromeIdentity)');
    expect(source).toContain('readReviewedChromeExecutableIdentity()');
  });

  it('tolerates only two-decimal coordinate serialization at attachment boundaries', () => {
    expect(renderedWebglLabelAnchorDistanceTelemetry(112.014)).toEqual({
      reportedDistance: 112,
      violation: false
    });
    expect(renderedWebglLabelAnchorDistanceTelemetry(112.016)).toEqual({
      reportedDistance: 113,
      violation: true
    });
    expect(renderedWebglLabelDisplacementClassificationValid(11.986, true)).toBe(true);
    expect(renderedWebglLabelDisplacementClassificationValid(11.984, true)).toBe(false);
    expect(renderedWebglLabelDisplacementClassificationValid(12.014, false)).toBe(true);
    expect(renderedWebglLabelDisplacementClassificationValid(12.015, false)).toBe(false);
  });

  it('fixes nine responsive, interaction, and presentation cases to one numeric loopback origin', () => {
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
        minimumLabelCount: 14,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=high',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-balanced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        minimumLabelCount: 14,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-balanced-cluster',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'cluster',
        minimumLabelCount: 14,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-reduced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'reduced',
        interaction: 'default',
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-invalid-fallback',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        minimumLabelCount: 14,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=invalid',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'mobile-balanced',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'default',
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'mobile-reduced-inspector',
        expectedPresentationMode: 'observer',
        expectedQuality: 'reduced',
        interaction: 'inspector',
        minimumLabelCount: 8,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'short-landscape-explore',
        expectedPresentationMode: 'observer',
        expectedQuality: 'balanced',
        interaction: 'explore',
        minimumLabelCount: 6,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 667, height: 375 }
      },
      {
        id: 'desktop-balanced-player',
        expectedPresentationMode: 'player',
        expectedQuality: 'balanced',
        interaction: 'default',
        minimumLabelCount: 14,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced&mode=player',
        viewport: { width: 1440, height: 900 }
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
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
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
      stdio: 'ignore',
      env: {
        BREAKPAD_DUMP_LOCATION: `${profile}/crash-dumps`,
        HOME: profile,
        TMPDIR: profile,
        PATH: '/usr/bin:/bin'
      }
    });

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

  it('accepts only a strict owner-local DevTools endpoint and blank page target', () => {
    expect(parseDevtoolsActivePort('41321\n/devtools/browser/12345678-abcd\n')).toEqual({
      port: 41_321,
      browserPath: '/devtools/browser/12345678-abcd'
    });
    expect(() => parseDevtoolsActivePort('41321\nhttp://example.com\n')).toThrow(/endpoint/i);
    expect(() => parseDevtoolsActivePort('0\n/devtools/browser/12345678\n')).toThrow(/port/i);

    expect(selectBlankPageTarget([{
      id: '12345678-abcd',
      type: 'page',
      url: 'about:blank',
      webSocketDebuggerUrl: 'ws://localhost:41321/devtools/page/12345678-abcd'
    }], 41_321)).toEqual({
      targetId: '12345678-abcd',
      webSocketDebuggerUrl: 'ws://127.0.0.1:41321/devtools/page/12345678-abcd'
    });
    expect(() => selectBlankPageTarget([{
      type: 'page',
      url: 'https://warpkeep.com/',
      webSocketDebuggerUrl: 'ws://localhost:41321/devtools/page/12345678'
    }], 41_321)).toThrow(/target/i);
    expect(() => selectBlankPageTarget([{
      type: 'page',
      url: 'about:blank',
      webSocketDebuggerUrl: 'ws://example.com:41321/devtools/page/12345678'
    }], 41_321)).toThrow(/target/i);
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
    const expected = renderedWebglBrowserProbeCases(41_733)[4]!;
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
      individualCastleCount: 18,
      presentedModelCount: 18,
      raycastTargetCount: 18,
      labelCount: 18,
      labelEligibleCount: 18,
      labelClusteredCount: 0,
      labelClusterOverflowCount: 0,
      labelAccountingValid: true,
      labelAttachmentViolationCount: 0,
      labelMissingIdentityCount: 0,
      labelMaximumAnchorDisplacement: 96,
      labelPlacedCount: 18,
      labelUnplacedCount: 0,
      labelsTextBearingCount: 18,
      focusedReadableLabelDomFocusCount: 0,
      focusedReadableLabelCount: 0,
      labelsWithinViewportCount: 18,
      labelCollisionCount: 0,
      labelLeaderMismatchCount: 0,
      labelReservedOverlapCount: 0,
      clusterButtonCount: 0,
      accessibleClusterButtonCount: 0,
      clusterLeaderMismatchCount: 0,
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
      raycastTargetCount: 101
    }, expected)).toThrow(/presented-model-mismatch/i);
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
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelEligibleCount: 19,
      labelUnplacedCount: 1,
      labelClusterOverflowCount: 1
    }, expected)).toThrow(/label-cluster-overflow/i);
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
      labelMaximumAnchorDisplacement: 113
    }, expected)).toThrow(/label-anchor-displacement/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      labelAttachmentViolationCount: 1
    }, expected)).toThrow(/label-attachment/i);
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
      readyAfterMilliseconds: 120_001
    }, expected)).toThrow(/observation/i);

    for (const [caseIndex, quality, semanticFeatureCount, totalDetailInstanceCount] of [
      [0, 'high', 1_100, 7_000],
      [3, 'reduced', 400, 3_000]
    ] as const) {
      const qualityCase = renderedWebglBrowserProbeCases(41_733)[caseIndex]!;
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

    const playerCase = renderedWebglBrowserProbeCases(41_733)[8]!;
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

    const inspectorCase = renderedWebglBrowserProbeCases(41_733)[6]!;
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      href: inspectorCase.url,
      quality: inspectorCase.expectedQuality,
      viewportWidth: inspectorCase.viewport.width,
      viewportHeight: inspectorCase.viewport.height,
      documentWidth: inspectorCase.viewport.width,
      interactionState: 'inspector',
      labelCount: 0,
      labelEligibleCount: 0,
      labelPlacedCount: 0,
      labelUnplacedCount: 0,
      individualCastleCount: 0,
      presentedModelCount: 0,
      raycastTargetCount: 0,
      labelsTextBearingCount: 0,
      labelsWithinViewportCount: 0
    }, { ...inspectorCase, minimumLabelCount: 1 })).toThrow(/label-count|focused-readable-label/i);

    const clusterCase = renderedWebglBrowserProbeCases(41_733)[2]!;
    const clustered = {
      ...ready,
      href: clusterCase.url,
      interactionState: 'cluster',
      focusedReadableLabelDomFocusCount: 1,
      focusedReadableLabelCount: 1,
      labelEligibleCount: 20,
      labelUnplacedCount: 2,
      labelClusteredCount: 2,
      presentedModelCount: 20,
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
    expect(parseRenderedWebglBrowserDom(clustered, {
      ...clusterCase,
      minimumLabelCount: 1,
      clusterButtonCountBefore: 1,
      clusterMemberCountBefore: 2
    })).toMatchObject({ renderer: 'webgl' });

    const exploreCase = renderedWebglBrowserProbeCases(41_733)[7]!;
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
