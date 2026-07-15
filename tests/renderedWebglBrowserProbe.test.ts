import { describe, expect, it, vi } from 'vitest';

import {
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
  it('fixes the four reviewed cases to one numeric loopback origin', () => {
    expect(renderedWebglBrowserProbeCases(41_733)).toEqual([
      {
        id: 'high',
        expectedQuality: 'high',
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=high'
      },
      {
        id: 'balanced',
        expectedQuality: 'balanced',
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=balanced'
      },
      {
        id: 'reduced',
        expectedQuality: 'reduced',
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=reduced'
      },
      {
        id: 'invalid-fallback',
        expectedQuality: 'balanced',
        url: 'http://127.0.0.1:41733/dev/realm-rendered-webgl-qa.html?quality=invalid'
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
      readyAfterMilliseconds: 2_412
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
    expect(() => parseRenderedWebglBrowserDom({ ...ready, fid: 539_854 }, expected)).toThrow(/DOM/i);
    expect(() => parseRenderedWebglBrowserDom({
      ...ready,
      readyAfterMilliseconds: 120_001
    }, expected)).toThrow(/observation/i);
  });
});
