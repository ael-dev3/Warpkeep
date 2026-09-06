// @vitest-environment node
import { expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { validateChromeIdentity, sameChromeIdentity, windowsChromeLaunchContract, createKeep04NetworkGuard, runKeep04WindowsCapture } from '../scripts/qa-observer/keep04-windows-capture.mjs';

const identity = () => ({ path: 'C:/Program Files/Google/Chrome/Application/chrome.exe', realPath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', regular: true, dev: '1', ino: '2', size: 1024, mtimeMs: 1234, sha256: 'a'.repeat(64), status: 'Valid', subject: 'CN=Google LLC, O=Google LLC, C=US', thumbprint: 'b'.repeat(40), version: '151.0.7922.174' });

it.each([{ status: 'NotSigned' }, { subject: 'CN=Untrusted, O=Other, C=US' }, { regular: false }, { sha256: 'bad' }, { realPath: 'C:/other/chrome.exe' }])('rejects untrusted or malformed Chrome executable identity %j', change => {
  expect(() => validateChromeIdentity({ ...identity(), ...change })).toThrow();
});
it('detects a replaced executable even if its signature remains valid', () => {
  expect(sameChromeIdentity(validateChromeIdentity(identity()), validateChromeIdentity({ ...identity(), ino: '3' }))).toBe(false);
});

it('creates a hidden pipe-only launch with fresh profile paths and no inherited credentials or forced renderer', () => {
  const contract = windowsChromeLaunchContract('C:/workspace/.cache/keep04-qa/profile-ABC123');
  expect(contract.executable).toBe('C:/Program Files/Google/Chrome/Application/chrome.exe');
  expect(contract.options).toMatchObject({ shell: false, windowsHide: true, detached: false, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  expect(contract.args).toContain('--remote-debugging-pipe');
  expect(contract.args.join(' ')).not.toMatch(/no-sandbox|disable-gpu|use-angle|use-gl|remote-debugging-port|use-mock-keychain/);
  expect(Object.keys(contract.options.env).sort()).toEqual(['APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'TEMP', 'TMP', 'WINDIR'].sort());
  expect(contract.options.env.TEMP).toBe('C:/workspace/.cache/keep04-qa/profile-ABC123');
});

it('allows exact origin resources and Vite socket, blocks redirects/external requests and records bounded diagnostic classes only', async () => {
  const guard = createKeep04NetworkGuard(); guard.expectNavigation('http://127.0.0.1:4176/dev/keep04-qa.html?scenario=empty&quality=high');
  const commands: unknown[] = []; const session = { command: async (method: string, params: unknown) => { commands.push([method, params]); return {}; }, browserCommand: async () => ({}) };
  guard.event('Fetch.requestPaused', { requestId: 'local', request: { url: 'http://127.0.0.1:4176/assets/model.glb' }, resourceType: 'Fetch' }, session);
  guard.event('Fetch.requestPaused', { requestId: 'external', request: { url: 'https://example.com/?secret=must-not-serialize' }, resourceType: 'Fetch' }, session);
  await guard.drain();
  expect(commands).toEqual([['Fetch.continueRequest', { requestId: 'local' }], ['Fetch.failRequest', { requestId: 'external', errorReason: 'BlockedByClient' }]]);
  expect(() => guard.assert()).toThrow(/network boundary/);
  expect(JSON.stringify(guard.snapshot())).not.toMatch(/example.com|secret|must-not/);
  const socket = createKeep04NetworkGuard(); socket.event('Network.webSocketCreated', { url: 'ws://127.0.0.1:4176/?token=local' }, session); expect(() => socket.assert()).not.toThrow();
  socket.event('Network.webSocketCreated', { url: 'ws://127.0.0.1:4177/' }, session); expect(() => socket.assert()).toThrow();
});

it.each(['Page.windowOpen', 'Page.downloadWillBegin', 'Target.targetCreated'])('rejects unexpected browser side effect %s', method => {
  const guard = createKeep04NetworkGuard(); guard.setTarget('owned');
  guard.event(method, { targetInfo: { targetId: 'other', type: 'page', url: 'about:blank' } }, { command: async () => ({}), browserCommand: async () => ({}) });
  expect(() => guard.assert()).toThrow();
});

function fixture() {
  const history: string[] = []; const child = new EventEmitter() as EventEmitter & { pid: number; stderr: EventEmitter }; child.pid = 45; child.stderr = new EventEmitter();
  let event: (method: string, params: unknown, session: unknown) => void = () => {};
  let published: unknown;
  let processes = [{ pid: 45, created: '100' }]; let afterIdentity = identity();
  const session = { open: async () => { history.push('open'); }, close: () => { history.push('transport-close'); }, attachToPage: async () => { history.push('attach'); },
    command: async (method: string) => { history.push(method); return {}; },
    browserCommand: async (method: string) => {
      history.push(method);
      if (method === 'Target.getTargets') return { targetInfos: [{ targetId: 'owned', type: 'page', url: 'about:blank', title: '', attached: false, canAccessOpener: false }] };
      if (method === 'Browser.close') { processes = []; child.emit('close', 0, null); }
      if (method === 'Browser.getVersion') return { product: 'Chrome/151.0.7922.174', protocolVersion: '1.3', userAgent: 'fixture', jsVersion: 'fixture', revision: 'fixture' };
      return { gpu: { devices: [{ vendorId: 1, deviceId: 2, vendorString: 'test GPU', deviceString: 'test GPU' }], auxAttributes: { glRenderer: 'hardware fixture' } } };
    } };
  let identityReads = 0;
  const ops = {
    platform: 'win32', identity: async () => validateChromeIdentity(++identityReads === 1 ? identity() : afterIdentity),
    createRun: async () => ({ id: 'windows-run-ABC123', directory: 'artifacts/keep04-qa/windows-run-ABC123' }),
    createProfile: async () => 'C:/workspace/.cache/keep04-qa/profile-ABC123',
    source: async () => ({ commit: '1'.repeat(40), tree: '2'.repeat(40), substantiveDirty: false, untrackedRelevantCount: 0 }),
    spawn: () => { history.push('spawn'); return child; }, transport: (_child?: unknown, handler?: typeof event) => { if (handler) event = handler; return session; },
    inspectOwned: async () => [...processes], terminateOwned: async () => { history.push('terminate-owned'); processes = []; child.emit('close', null, 'SIGTERM'); },
    waitForExit: async () => processes.length === 0,
    capture: async () => { history.push('capture'); return { status: 'captured; uninspected', observations: Array(36).fill({ imageInspected: false }) }; },
    writeReport: async (_run: unknown, report: unknown) => { history.push('write-report'); published = report; return report; },
  };
  return { ops, history, child, emit: (method: string, params: unknown) => event(method, params, session), report: () => published, changeIdentity: () => { afterIdentity = { ...identity(), sha256: 'c'.repeat(64) }; } };
}
it.each([[], ['--base-url=https://example.com'], ['--base-url=http://127.0.0.1:4176', '--browser=C:/other.exe']].map(args => ({ args })))('rejects launcher argument scope before any OS work: $args', async ({ args }) => {
  const f = fixture(); await expect(runKeep04WindowsCapture(args, f.ops)).rejects.toThrow(/Only --base-url/); expect(f.history).toEqual([]);
});
it('still closes the browser if process inspection fails, and reports cleanup as uncertain', async () => {
  const f = fixture(); f.ops.inspectOwned = async () => { throw new Error('inspection unavailable'); };
  await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toThrow(/inspection unavailable/);
  expect(f.history).toContain('Browser.close'); expect(f.history).toContain('transport-close');
});
it('never claims cleanup verified without an observed child exit', async () => {
  const f = fixture(); f.ops.waitForExit = async () => false;
  await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toThrow(/exit|remain/i);
});
it('rejects an unexpected blank top-level navigation after the requested document', () => {
  const guard = createKeep04NetworkGuard(); guard.expectNavigation('http://127.0.0.1:4176/dev/keep04-qa.html?scenario=empty&quality=high');
  guard.event('Page.frameNavigated', { frame: { url: 'about:blank' } }, {});
  expect(() => guard.assert()).toThrow(/navigation/);
});
it('enables interception before captures and closes only the owned browser after success', async () => {
  const f = fixture(); const report = await runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops);
  expect(f.history.indexOf('Fetch.enable')).toBeLessThan(f.history.indexOf('capture'));
  expect(f.history).toContain('Browser.close'); expect(f.history).not.toContain('terminate-owned');
  expect(report).toMatchObject({ synthetic: true, cleanup: { verified: true, remaining: 0, profileRetained: true }, stableSource: true });
});
it('rejects changed executable after launch and still performs owned cleanup', async () => {
  const f = fixture(); f.changeIdentity(); await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toThrow(/executable changed/);
  expect(f.history).not.toContain('capture'); expect(f.history).toContain('Browser.close');
});
it.each(['navigation', 'timeout', 'output'])('retains original %s failure while closing the owned browser', async kind => {
  const f = fixture(); const failure = new Error(`${kind} failed`); f.ops.capture = async () => { throw failure; };
  await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toBe(failure);
  expect(f.history).toContain('Browser.close'); expect(f.history).toContain('write-report');
});
it('falls back to verified owned termination when Browser.close fails', async () => {
  const f = fixture(); const session = f.ops.transport(); const original = session.browserCommand;
  session.browserCommand = async method => { if (method === 'Browser.close') throw new Error('close failed'); return original(method); };
  const report = await runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops);
  expect(f.history).toContain('terminate-owned'); expect(report).toMatchObject({ cleanup: { verified: true, forced: true, closeFailed: true } });
});
it('preserves capture and cleanup failures together and never terminates without verified records', async () => {
  const f = fixture(); const original = new Error('capture failure'); f.ops.capture = async () => { throw original; };
  f.ops.inspectOwned = async () => { throw new Error('inspection failure'); };
  await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toMatchObject({ cause: original, errors: [original, expect.any(Error)] });
  expect(f.history).toContain('Browser.close'); expect(f.history).not.toContain('terminate-owned');
});
it('reports dirty source, software rendering and warnings without pretending pristine evidence', async () => {
  const f = fixture(); f.ops.source = async () => ({ commit: '1'.repeat(40), tree: '2'.repeat(40), substantiveDirty: true, untrackedRelevantCount: 1 });
  const session = f.ops.transport(); const original = session.browserCommand;
  session.browserCommand = async method => method === 'SystemInfo.getInfo' ? { gpu: { devices: [], auxAttributes: { glRenderer: 'SwiftShader software' } } } : original(method);
  const capture = f.ops.capture; f.ops.capture = async () => { f.child.stderr.emit('data', Buffer.from('WARNING private-output-not-retained')); return capture(); };
  const report = await runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops);
  expect(report).toMatchObject({ stableSource: false, gpu: { softwareRendering: true }, stderr: { warningChunks: 1 } });
  expect(JSON.stringify(report)).not.toContain('private-output-not-retained');
});
it('bounds diagnostics and rejects HMR contamination without serializing payloads', () => {
  const guard = createKeep04NetworkGuard();
  for (let index = 0; index < 140; index++) guard.event('Runtime.exceptionThrown', { privateState: 'secret' }, {});
  guard.event('Network.webSocketFrameReceived', { response: { payloadData: JSON.stringify({ type: 'update', privateState: 'secret' }) } }, {});
  expect(guard.snapshot()).toMatchObject({ dropped: 13, violation: 'hmr-during-capture' });
  expect(JSON.stringify(guard.snapshot())).not.toContain('secret'); expect(() => guard.assert()).toThrow(/hmr/);
});

const qaDocument = 'http://127.0.0.1:4176/dev/keep04-qa.html?scenario=empty&quality=high';
it('installs an enforced native popup/worker denial before releasing the exact Document response', async () => {
  const guard = createKeep04NetworkGuard(); guard.expectNavigation(qaDocument);
  const commands: [string, unknown][] = []; let acknowledge: () => void = () => {};
  const session = { command: async (method: string, params: unknown) => { commands.push([method, params]); if (method === 'Fetch.continueResponse') await new Promise<void>(done => { acknowledge = done; }); return {}; } };
  const request = { requestId: 'document', frameId: 'main', request: { url: qaDocument }, resourceType: 'Document' };
  guard.event('Fetch.requestPaused', request, session); await guard.drain();
  const originalHeaders = [{ name: 'Content-Type', value: 'text/html' }, { name: 'Content-Security-Policy', value: "img-src 'self'" }, { name: 'X-Test', value: 'preserved' }];
  guard.event('Fetch.requestPaused', { ...request, responseStatusCode: 200, responseStatusText: 'OK', responseHeaders: originalHeaders }, session);
  expect(() => guard.assertDocumentReady()).toThrow();
  expect(commands[1]).toEqual(['Fetch.continueResponse', { requestId: 'document', responseCode: 200, responsePhrase: 'OK', responseHeaders: [...originalHeaders,
    { name: 'Content-Security-Policy', value: "sandbox allow-scripts allow-same-origin; worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; form-action 'none'" }] }]);
  // No new-target creation/closure is needed for policy installation. Chrome enforces
  // sandbox and worker-src before creation/fetch; the controller separately tests it.
  expect(commands.map(([method]) => method)).not.toContain('Target.closeTarget');
  acknowledge(); await guard.drain(); expect(() => guard.assertDocumentReady()).not.toThrow();
  guard.expectNavigation(qaDocument); expect(() => guard.assertDocumentReady()).toThrow();
});
it.each([
  { responseStatusCode: 302 }, { responseErrorReason: 'Failed' },
  { responseHeaders: [{ name: 'X-Test', value: 'bad\r\nInjected: value' }] },
  { responseHeaders: [{ name: 'X-Test', value: 'x'.repeat(65537) }] },
  { requestId: 'stale-document' }, { request: { url: 'http://127.0.0.1:4176/other' } },
])('never releases an unguarded or invalid Document response case %#', async change => {
  const guard = createKeep04NetworkGuard(); guard.expectNavigation(qaDocument);
  const commands: string[] = []; const session = { command: async (method: string) => { commands.push(method); return {}; } };
  const request = { requestId: 'document', frameId: 'main', request: { url: qaDocument }, resourceType: 'Document' };
  guard.event('Fetch.requestPaused', request, session); await guard.drain();
  guard.event('Fetch.requestPaused', { ...request, responseStatusCode: 200, responseHeaders: [], ...change }, session); await guard.drain();
  expect(commands).toEqual(['Fetch.continueRequest', 'Fetch.failRequest']); expect(() => guard.assert()).toThrow();
});
it('rejects a required resource blocked by policy instead of accepting altered fallback rendering', () => {
  const guard = createKeep04NetworkGuard();
  guard.event('Log.entryAdded', { entry: { source: 'security', level: 'error', text: 'private CSP diagnostic must not be retained' } }, {});
  expect(() => guard.assert()).toThrow(); expect(JSON.stringify(guard.snapshot())).not.toContain('private CSP');
});
it.each(['Runtime.evaluate', 'Page.captureScreenshot'])('does not send %s before a guarded exact Document response', async method => {
  const f = fixture();
  f.ops.capture = async (session?: { command: (method: string, params?: object) => Promise<unknown> }) => {
    await session!.command('Page.navigate', { url: qaDocument }); await session!.command(method); throw new Error('Unreachable');
  };
  await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toThrow(/Document response policy/);
  expect(f.history).not.toContain(method); expect(f.history).toContain('Browser.close');
});

it('records exact owned target_closed detach as teardown only after acknowledged close and verified normal exit', async () => {
  const f = fixture(); const session = f.ops.transport(); const original = session.browserCommand;
  session.browserCommand = async method => { if (method === 'Browser.close') f.emit('Inspector.detached', { reason: 'target_closed' }); return original(method); };
  const capture = f.ops.capture; f.ops.capture = async () => { f.emit('Log.entryAdded', { entry: { source: 'network', level: 'error', text: 'unresolved private diagnostic' } }); return capture(); };
  const report = await runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops);
  expect(report).toMatchObject({ stableSource: true, failure: null, diagnostics: { violation: null, reviewRequired: true, diagnostics: expect.arrayContaining([
    { kind: 'browser-log-network', severity: 'error', phase: 'capture' },
    { kind: 'inspector-detached-target-closed', severity: 'info', phase: 'owned-close' },
  ]), ownedClose: { requested: true, acknowledged: true, verified: true, detachCount: 1 } } });
  expect(JSON.stringify(report)).not.toContain('unresolved private');
});

it.each(['Inspector.detached', 'Target.targetCrashed'])('fails a late pre-close %s after the last capture guard check', async method => {
  const f = fixture(); const source = f.ops.source; let reads = 0;
  f.ops.source = async () => { if (++reads === 2) f.emit(method, { reason: 'target_closed', targetId: 'owned', status: 'crashed', errorCode: 1 }); return source(); };
  await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toThrow();
  expect(f.report()).toMatchObject({ status: 'failed; no acceptance claimed', stableSource: false, failure: expect.objectContaining({ kind: 'guard-failed' }), diagnostics: { violation: expect.any(String), diagnostics: expect.arrayContaining([expect.objectContaining({ phase: 'capture', severity: 'error' })]) } });
  expect(f.history).toContain('Browser.close');
});

it.each([
  { event: 'Inspector.detached', reason: 'replaced_with_devtools', closeFails: false },
  { event: 'Inspector.detached', reason: 'target_closed', closeFails: true },
  { event: 'Target.targetCrashed', reason: 'target_closed', closeFails: false },
  { event: 'Target.targetCrashed', reason: 'target_closed', closeFails: true },
])('does not forgive unexpected close-time event case %#', async entry => {
  const f = fixture(); const session = f.ops.transport(); const original = session.browserCommand;
  session.browserCommand = async method => {
    if (method === 'Browser.close') { f.emit(entry.event, { reason: entry.reason, targetId: 'owned', status: 'crashed', errorCode: 1 }); if (entry.closeFails) throw new Error('close failed'); }
    return original(method);
  };
  await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toThrow();
  expect(f.report()).toMatchObject({ status: 'failed; no acceptance claimed', stableSource: false, failure: expect.objectContaining({ kind: 'guard-failed' }), diagnostics: { violation: expect.any(String) } });
});

it('retains a real late network-boundary violation emitted during transport cleanup', async () => {
  const f = fixture(); const session = f.ops.transport(); const original = session.close;
  session.close = () => { f.emit('Network.requestWillBeSent', { request: { url: 'https://example.invalid/private' } }); original(); };
  await expect(runKeep04WindowsCapture(['--base-url=http://127.0.0.1:4176'], f.ops)).rejects.toThrow();
  expect(f.report()).toMatchObject({ status: 'failed; no acceptance claimed', stableSource: false, failure: expect.objectContaining({ kind: 'guard-failed' }), diagnostics: { violation: 'network' } });
});
