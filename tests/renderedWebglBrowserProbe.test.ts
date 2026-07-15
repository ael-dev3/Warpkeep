import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';

import {
  analyzeRenderedWebglPngScreenshot,
  headlessChromeProbeContract,
  isAllowedRenderedWebglPageUrl,
  parseDevtoolsActivePort,
  parseRenderedWebglBrowserDom,
  RENDERED_WEBGL_QA_CHROME,
  renderedWebglBrowserProbeCases,
  selectBlankPageTarget,
  spawnHeadlessChromeProbe
} from '../scripts/qa-observer/rendered-webgl-browser-probe.mjs';

describe('rendered WebGL headless browser probe contract', () => {
  it('fixes seven responsive and interaction cases to one numeric loopback origin', () => {
    expect(renderedWebglBrowserProbeCases(41_733)).toEqual([
      {
        id: 'desktop-high',
        expectedQuality: 'high',
        interaction: 'default',
        minimumLabelCount: 14,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=high',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-balanced',
        expectedQuality: 'balanced',
        interaction: 'default',
        minimumLabelCount: 14,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-reduced',
        expectedQuality: 'reduced',
        interaction: 'default',
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'desktop-invalid-fallback',
        expectedQuality: 'balanced',
        interaction: 'default',
        minimumLabelCount: 14,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=invalid',
        viewport: { width: 1440, height: 900 }
      },
      {
        id: 'mobile-balanced',
        expectedQuality: 'balanced',
        interaction: 'default',
        minimumLabelCount: 10,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'mobile-reduced-inspector',
        expectedQuality: 'reduced',
        interaction: 'inspector',
        minimumLabelCount: 8,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced',
        viewport: { width: 390, height: 844 }
      },
      {
        id: 'short-landscape-explore',
        expectedQuality: 'balanced',
        interaction: 'explore',
        minimumLabelCount: 6,
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced',
        viewport: { width: 667, height: 375 }
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
    const expected = renderedWebglBrowserProbeCases(41_733)[3]!;
    const ready = {
      href: expected.url,
      status: 'ready',
      renderer: 'webgl',
      mapRenderer: 'webgl',
      fixture: 'synthetic-canonical-100',
      quality: 'balanced',
      castleCount: 100,
      readyAfterMilliseconds: 2_412,
      viewportWidth: 1440,
      viewportHeight: 900,
      documentWidth: 1440,
      mapViewportCovered: true,
      interactionState: 'default',
      labelCount: 18,
      labelsTextBearingCount: 18,
      labelsWithinViewportCount: 18,
      labelCollisionCount: 0,
      labelLeaderMismatchCount: 0,
      labelReservedOverlapCount: 0,
      undersizedPrimaryControlCount: 0,
      undersizedPrimaryControlKinds: []
    } as const;
    expect(parseRenderedWebglBrowserDom(ready, expected)).toMatchObject({
      renderer: 'webgl',
      quality: 'balanced',
      castleCount: 100,
      readyAfterMilliseconds: 2_412
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
      labelLeaderMismatchCount: 1
    }, expected)).toThrow(/label-leader/i);
    expect(() => parseRenderedWebglBrowserDom({ ...ready, fid: 539_854 }, expected)).toThrow(/DOM/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      readyAfterMilliseconds: 120_001
    }, expected)).toThrow(/observation/i);
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
