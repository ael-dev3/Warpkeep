import { spawn, execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DevtoolsPipeSession, selectBlankPageTarget } from './rendered-webgl-browser-probe.mjs';
import { KEEP04_QA_ORIGIN, keep04ProbePlan, runKeep04BrowserProbe } from './keep04-browser-probe.mjs';
import { createKeep04CaptureRun, createKeep04WindowsProfile, writeKeep04RunFile } from './keep04-capture-output.mjs';
import { KEEP04_DOCUMENT_POLICY } from './keep04-document-policy.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const POWERSHELL = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const GIT = 'C:/Program Files/Git/cmd/git.exe';
const ROOT = resolve(import.meta.dirname, '../..');
const SYSTEM_ENV = Object.freeze({ SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' });
const identityFields = ['path', 'realPath', 'regular', 'dev', 'ino', 'size', 'mtimeMs', 'sha256', 'status', 'subject', 'thumbprint', 'version'];
const localPath = value => typeof value === 'string' ? value.replaceAll('\\', '/').toLowerCase() : '';

export function validateChromeIdentity(value) {
  if (!value || identityFields.some(key => !Object.hasOwn(value, key)) || localPath(value.path) !== localPath(CHROME) || localPath(value.realPath) !== localPath(CHROME)
    || value.regular !== true || value.status !== 'Valid' || typeof value.subject !== 'string' || !/(?:^|,\s*)O=Google LLC(?:,|$)/.test(value.subject)
    || !/^[a-f\d]{64}$/i.test(value.sha256) || !/^[a-f\d]{40,64}$/i.test(value.thumbprint) || !/^\d+\.\d+\.\d+\.\d+$/.test(value.version)
    || !['dev', 'ino'].every(key => typeof value[key] === 'string' && /^\d+$/.test(value[key]))
    || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 64 * 1024 * 1024 || !Number.isFinite(value.mtimeMs)) throw new Error('Windows Chrome signature or file identity was invalid.');
  return Object.freeze(Object.fromEntries(identityFields.map(key => [key, value[key]])));
}
export function sameChromeIdentity(left, right) { return identityFields.every(key => left?.[key] === right?.[key]); }

function boundedExec(executable, args, input = '') {
  return new Promise((done, fail) => {
    const child = execFile(executable, args, { cwd: ROOT, shell: false, windowsHide: true, env: SYSTEM_ENV, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) { const failure = new Error('Bounded Windows QA OS query failed.'); failure.code = error.code; fail(failure); }
      else if (stderr.trim()) fail(new Error('Windows QA OS query reported diagnostics.'));
      else done(stdout.trim());
    });
    child.stdin?.on('error', error => {
      const failure = new Error('Bounded Windows QA OS input failed.');
      failure.code = error.code;
      fail(failure);
    });
    // Avoid writing an empty chunk to commands that do not consume stdin.
    child.stdin?.end(input || undefined);
  });
}
const powershell = (script, input) => boundedExec(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; ${script}`], input === undefined ? '' : JSON.stringify(input));
export async function readWindowsChromeIdentity() {
  const before = await lstat(CHROME, { bigint: true }); const canonical = await realpath(CHROME);
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(64 * 1024 * 1024)) throw new Error('Windows Chrome must be a bounded regular file.');
  const metadata = JSON.parse(await powershell("$p='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; $s=Get-AuthenticodeSignature -LiteralPath $p; [pscustomobject]@{status=$s.Status.ToString();subject=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint;version=(Get-Item -LiteralPath $p).VersionInfo.FileVersion} | ConvertTo-Json -Compress"));
  const sha256 = createHash('sha256').update(await readFile(CHROME)).digest('hex'); const after = await lstat(CHROME, { bigint: true });
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeNs !== after.mtimeNs) throw new Error('Windows Chrome executable changed during identity check.');
  return validateChromeIdentity({ path: CHROME, realPath: canonical.replaceAll('\\', '/'), regular: true, dev: String(after.dev), ino: String(after.ino), size: Number(after.size), mtimeMs: Number(after.mtimeNs) / 1e6, sha256, ...metadata });
}

export function windowsChromeLaunchContract(profile) {
  if (!win32.isAbsolute(profile) || !/\/\.cache\/keep04-qa\/profile-[a-z\d]+$/i.test(profile.replaceAll('\\', '/')) || /[\r\n\0"]/.test(profile)) throw new Error('Invalid fresh Windows QA profile path.');
  return { executable: CHROME, args: ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
    '--disable-background-networking', '--disable-breakpad', '--disable-crash-reporter', '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
    '--disable-extensions', '--disable-field-trial-config', '--disable-sync', '--disable-search-engine-choice-screen',
    '--disable-features=AutofillServerCommunication,CertificateTransparencyComponentUpdater,FirstPartySets,InterestFeedContentSuggestions,MediaRouter,OptimizationHints,Translate',
    '--metrics-recording-only', '--mute-audio', '--no-default-browser-check', '--no-first-run', '--no-proxy-server',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--password-store=basic', '--safebrowsing-disable-auto-update', '--window-size=1440,900', 'about:blank'],
    options: { cwd: ROOT, shell: false, windowsHide: true, detached: false, env: { ...SYSTEM_ENV, TEMP: profile, TMP: profile, APPDATA: profile, LOCALAPPDATA: profile }, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] } };
}

function allowedResource(value, websocket = false) {
  try {
    const url = new URL(value);
    if (websocket) return url.origin === 'ws://127.0.0.1:4176' && url.pathname === '/' && !url.username && !url.password;
    if (url.protocol === 'blob:') return url.origin === KEEP04_QA_ORIGIN;
    return url.origin === KEEP04_QA_ORIGIN && !url.username && !url.password;
  } catch { return false; }
}
export function createKeep04NetworkGuard() {
  let expected = 'about:blank'; let target = ''; let violation = ''; let dropped = 0;
  let phase = 'capture'; let reviewRequired = false;
  const ownedClose = { requested: false, acknowledged: false, verified: false, detachCount: 0 };
  let documentRequest; let documentGuarded = false; let guardedDocuments = 0;
  const diagnostics = []; const pending = new Set();
  const record = (kind, severity = 'error') => { if (severity !== 'info') reviewRequired = true; if (diagnostics.length < 128) diagnostics.push({ kind, severity, phase }); else dropped++; };
  const reject = kind => { violation ||= kind; record(kind); };
  const track = promise => { if (pending.size >= 256) { reject('interception-overflow'); void promise.catch(() => {}); return; } pending.add(promise); promise.catch(() => reject('interception-command')).finally(() => pending.delete(promise)); };
  return {
    expectNavigation(url) { if (!keep04ProbePlan([`--base-url=${KEEP04_QA_ORIGIN}`]).cases.some(entry => entry.url === url)) throw new Error('Unexpected keep QA navigation request.'); expected = url; documentRequest = undefined; documentGuarded = false; },
    setTarget(id) { target = id; },
    beginOwnedClose() { ownedClose.requested = true; phase = 'owned-close'; record('owned-close-requested', 'info'); },
    acknowledgeOwnedClose() { ownedClose.acknowledged = true; record('owned-close-acknowledged', 'info'); },
    finishOwnedClose(verified) {
      ownedClose.verified = ownedClose.requested && ownedClose.acknowledged && verified === true;
      if (ownedClose.detachCount && !ownedClose.verified) reject('unverified-close-detach');
      if (ownedClose.requested) record(ownedClose.verified ? 'owned-close-verified' : 'owned-close-unverified', ownedClose.verified ? 'info' : 'warning');
      phase = 'closed';
    },
    event(method, params, session) {
      if (method === 'Fetch.requestPaused') {
        if (typeof params?.requestId !== 'string') { reject('fetch-shape'); return; }
        const permitted = !violation && allowedResource(params?.request?.url) && (params.resourceType !== 'Document' || (params.request.url === expected && params.request.method === 'GET'));
        if ('responseStatusCode' in params || 'responseErrorReason' in params) {
          const headers = params.responseHeaders;
          const validHeaders = Array.isArray(headers) && headers.length <= 128 && headers.every(header => header && typeof header.name === 'string' && /^[!#$%&'*+.^_`|~\da-z-]+$/i.test(header.name)
            && typeof header.value === 'string' && !/[\r\n\0]/.test(header.value)) && Buffer.byteLength(JSON.stringify(headers)) <= 65536;
          const validPhrase = params.responseStatusText === undefined || (typeof params.responseStatusText === 'string' && params.responseStatusText.length <= 128 && !/[\r\n\0]/.test(params.responseStatusText));
          const contentTypes = validHeaders ? headers.filter(header => header.name.toLowerCase() === 'content-type') : [];
          const validPolicy = validHeaders && headers.filter(header => header.name.toLowerCase() === 'content-security-policy' && header.value === KEEP04_DOCUMENT_POLICY).length === 1;
          if (!permitted || params.resourceType !== 'Document' || params.responseStatusCode !== 200 || params.responseErrorReason !== undefined || !validHeaders || !validPhrase
            || !validPolicy || contentTypes.length !== 1 || !/^text\/html(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentTypes[0].value)
            || !documentRequest || params.requestId !== documentRequest.requestId || params.frameId !== documentRequest.frameId || documentRequest.responsePending || documentGuarded) {
            reject('document-response-blocked'); track(session.command('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' })); return;
          }
          const request = documentRequest;
          request.responsePending = true;
          // Validate the server-origin policy, then leave response/body/network
          // metadata untouched. Header-only CDP replacement did not enforce
          // worker-src; body fulfillment changed local-network behavior.
          track(session.command('Fetch.continueResponse', { requestId: params.requestId }).then(() => {
            if (!violation && documentRequest === request) { documentGuarded = true; guardedDocuments++; }
          })); return;
        }
        if (!permitted) reject('request-blocked');
        if (permitted && params.resourceType === 'Document') {
          if (documentRequest || typeof params.frameId !== 'string' || !params.frameId) { reject('document-request-shape'); track(session.command('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' })); return; }
          documentRequest = { requestId: params.requestId, frameId: params.frameId };
        }
        track(session.command(permitted ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: params.requestId, ...(!permitted ? { errorReason: 'BlockedByClient' } : {}) }));
      } else if (method === 'Page.frameNavigated' && !params?.frame?.parentId && params?.frame?.url !== expected) reject('navigation');
      else if (method === 'Network.requestWillBeSent' && !allowedResource(params?.request?.url)) reject('network');
      else if (method === 'Network.webSocketCreated' && !allowedResource(params?.url, true)) reject('websocket');
      else if (method === 'Network.webSocketFrameReceived') {
        try { if (['update', 'full-reload', 'error'].includes(JSON.parse(params?.response?.payloadData).type)) reject('hmr-during-capture'); } catch { /* No payload content is retained. */ }
      } else if (method === 'Page.windowOpen' || method === 'Page.downloadWillBegin') reject('page-side-effect');
      else if (method === 'Target.targetCreated' && params?.targetInfo?.type === 'page' && params.targetInfo.targetId !== target) {
        reject('popup'); if (typeof params.targetInfo.targetId === 'string') track(session.browserCommand('Target.closeTarget', { targetId: params.targetInfo.targetId }));
      } else if (method === 'Target.targetCrashed') reject('target-crashed');
      else if (method === 'Inspector.detached') {
        const teardownKind = params?.reason === 'target_closed' ? 'inspector-detached-target-closed'
          : params?.reason === 'Render process gone.' ? 'inspector-detached-render-process-gone' : null;
        if (phase === 'owned-close' && target && teardownKind) {
          ownedClose.detachCount = Math.min(129, ownedClose.detachCount + 1);
          record(teardownKind, 'info');
          if (ownedClose.detachCount > 128) reject('teardown-overflow');
        } else reject(params?.reason === 'target_closed' ? 'unexpected-target-closed' : 'unexpected-inspector-detach');
      }
      else if (method === 'Log.entryAdded' && params?.entry?.source === 'security' && params.entry.level === 'error') reject('security-policy-error');
      else if (method === 'Runtime.exceptionThrown') record('runtime-exception');
      else if (method === 'Runtime.consoleAPICalled' && ['warning', 'error', 'assert'].includes(params?.type)) record('browser-console', params.type === 'warning' ? 'warning' : 'error');
      else if (method === 'Log.entryAdded' && ['warning', 'error'].includes(params?.entry?.level)) record(`browser-log-${['network', 'security', 'deprecation', 'rendering', 'javascript'].includes(params.entry.source) ? params.entry.source : 'other'}`, params.entry.level);
    },
    async drain() { await Promise.allSettled([...pending]); },
    assert() { if (violation) throw new Error(`Keep QA network boundary failed: ${violation}.`); },
    assertDocumentReady() { if (violation || !documentGuarded) throw new Error('Exact QA Document response policy is not confirmed.'); },
    snapshot() { return { violation: violation || null, diagnostics: [...diagnostics], dropped, guardedDocuments, reviewRequired, ownedClose: { ...ownedClose } }; },
  };
}

const PROCESS_INSPECT = String.raw`$q=([Console]::In.ReadToEnd() | ConvertFrom-Json); $rows=@(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"); $owned=@{}; $escaped=[regex]::Escape([string]$q.profile); foreach($r in $rows){ $creation=$r.CreationDate.ToUniversalTime().Ticks.ToString(); $match=$r.CommandLine -match ('(?:^|\s)"?--user-data-dir="?'+$escaped+'"?(?:\s|$)'); $known=@($q.known | Where-Object { $_.pid -eq $r.ProcessId -and $_.created -eq $creation }).Count -gt 0; if($match -or $known){$owned[[string]$r.ProcessId]=$r} }; do{$changed=$false;foreach($r in $rows){if(-not $owned.ContainsKey([string]$r.ProcessId) -and $owned.ContainsKey([string]$r.ParentProcessId)){ $parent=$owned[[string]$r.ParentProcessId]; if($r.CreationDate -ge $parent.CreationDate){$owned[[string]$r.ProcessId]=$r;$changed=$true}}}}while($changed); $result=@($owned.Values | ForEach-Object { [pscustomobject]@{pid=[int]$_.ProcessId;created=$_.CreationDate.ToUniversalTime().Ticks.ToString()} }); ConvertTo-Json -InputObject $result -Compress`;
const PROCESS_TERMINATE = String.raw`$q=([Console]::In.ReadToEnd() | ConvertFrom-Json); foreach($entry in $q){ $r=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$entry.pid); if($r -and $r.Name -eq 'chrome.exe' -and $r.CreationDate.ToUniversalTime().Ticks.ToString() -eq [string]$entry.created){$p=[System.Diagnostics.Process]::GetProcessById([int]$entry.pid); try{$null=$p.Handle;if([Math]::Abs($p.StartTime.ToUniversalTime().Ticks-$r.CreationDate.ToUniversalTime().Ticks) -lt 10000){$p.Kill()}}finally{$p.Dispose()}} }; 'terminated-owned-only'`;
function processRecords(value) {
  if (!Array.isArray(value) || value.length > 128 || value.some(row => !Number.isSafeInteger(row.pid) || row.pid <= 0 || typeof row.created !== 'string' || !/^\d{1,20}$/.test(row.created))) throw new Error('Windows owned-process inspection was invalid.');
  return value.map(({ pid, created }) => ({ pid, created }));
}
export async function readWindowsCaptureSource() {
  // Preflight attributes before a worktree diff: do not execute clean filters or
  // permit ident/encoding transformations to hide byte changes. These queries
  // inspect metadata only, in two bounded processes regardless of path count.
  const paths = await boundedExec(GIT, ['ls-files', '-z']);
  if (!paths.endsWith('\0') || paths.split('\0').length > 4097) throw new Error('Source path inventory exceeded its bound.');
  const attributes = (await boundedExec(GIT, ['check-attr', '-z', '--all', '--stdin'], paths)).split('\0');
  if (attributes.pop() !== '' || attributes.length % 3 !== 0) throw new Error('Source attribute inventory invalid.');
  for (let index = 0; index < attributes.length; index += 3) {
    // --all omits unspecified attributes, distinguishing them from a filter
    // driver literally named "unspecified" or "unset". Reject even disabled ones.
    if (['filter', 'ident', 'working-tree-encoding'].includes(attributes[index + 1])) throw new Error('Unsupported source conversion attribute; source cleanliness unverified.');
  }
  const [revision, differences, untracked] = await Promise.all([
    boundedExec(GIT, ['log', '-1', '--format=%H%n%T']),
    // Read-only CRLF input normalization, not xdiff whitespace equivalence:
    // trailing spaces/tabs and final-newline removal remain substantive.
    boundedExec(GIT, ['-c', 'core.autocrlf=input', '-c', 'core.safecrlf=false', 'diff', '--no-ext-diff', '--no-textconv', '--numstat', 'HEAD']),
    boundedExec(GIT, ['ls-files', '--others', '--exclude-standard', '--', ':!artifacts/**', ':!.cache/**', ':!.superpowers/**', ':!**/__pycache__/**']),
  ]);
  const [commit, tree] = revision.split(/\r?\n/); if (![commit, tree].every(value => /^[a-f\d]{40}$/.test(value))) throw new Error('Keep QA source identity invalid.');
  const untrackedRelevantCount = untracked.split(/\r?\n/).filter(Boolean).length;
  return { commit, tree, substantiveDirty: differences.length > 0 || untrackedRelevantCount > 0, untrackedRelevantCount };
}
function defaultOperations() {
  return {
    platform: process.platform, identity: readWindowsChromeIdentity, createRun: createKeep04CaptureRun, createProfile: createKeep04WindowsProfile, source: readWindowsCaptureSource,
    spawn: contract => spawn(contract.executable, contract.args, contract.options), transport: (child, event) => new DevtoolsPipeSession(child, event),
    inspectOwned: async (profile, known = []) => processRecords(JSON.parse(await powershell(PROCESS_INSPECT, { profile, known }))),
    terminateOwned: async records => { await powershell(PROCESS_TERMINATE, processRecords(records)); },
    waitForExit: async closed => {
      let timer; try { return await Promise.race([closed.then(() => true), new Promise(done => { timer = setTimeout(() => done(false), 5000); })]); } finally { clearTimeout(timer); }
    },
    capture: runKeep04BrowserProbe, writeReport: (run, report) => writeKeep04RunFile(run, 'run-provenance.json', `${JSON.stringify(report, null, 2)}\n`),
  };
}

export async function runKeep04WindowsCapture(args, operations = defaultOperations()) {
  keep04ProbePlan(args); if (operations.platform !== 'win32') throw new Error('This local capture launcher requires Windows.');
  let run, profile, child, session, closed, childExit, originalError, cleanupError;
  let failureKind = 'operation-failed';
  let stage = 'create-run'; let baseline, launched, finalIdentity, beforeSource, afterSource, captured, browser, gpu;
  const guard = createKeep04NetworkGuard(); const stderr = { bytes: 0, chunks: 0, warningChunks: 0, errorChunks: 0, droppedBytes: 0 };
  let cleanup = { verified: false, remaining: null, forced: false, closeFailed: false, profileRetained: true };
  try {
    run = await operations.createRun(); stage = 'identity-before'; baseline = await operations.identity();
    beforeSource = await operations.source(); stage = 'create-profile'; profile = await operations.createProfile();
    stage = 'launch'; child = operations.spawn(windowsChromeLaunchContract(profile));
    closed = new Promise(done => {
      child.once('close', (code, signal) => { childExit = { code: Number.isSafeInteger(code) ? code : null, signal: signal === null ? null : ['SIGTERM', 'SIGKILL'].includes(signal) ? signal : 'other', spawnError: false }; done(childExit); });
      child.once('error', () => { childExit = { code: null, signal: null, spawnError: true }; done(childExit); });
    });
    child.stderr?.on('data', bytes => { const buffer = Buffer.from(bytes); stderr.chunks++; stderr.bytes += buffer.length;
      if (stderr.bytes <= 65536) { const text = buffer.toString(); if (/warning/i.test(text)) stderr.warningChunks++; if (/error/i.test(text)) stderr.errorChunks++; } else stderr.droppedBytes += buffer.length;
    });
    session = operations.transport(child, guard.event); await session.open();
    stage = 'identity-after-launch'; launched = await operations.identity(); if (!sameChromeIdentity(baseline, launched)) throw new Error('Windows Chrome executable changed at launch.');
    browser = await session.browserCommand('Browser.getVersion');
    const info = await session.browserCommand('SystemInfo.getInfo'); const renderer = info?.gpu?.auxAttributes?.glRenderer;
    gpu = { renderer: typeof renderer === 'string' ? renderer.slice(0, 256) : null, softwareRendering: typeof renderer === 'string' ? /swiftshader|llvmpipe|software/i.test(renderer) : null };
    const target = selectBlankPageTarget(await session.browserCommand('Target.getTargets', { filter: [{ type: 'page', exclude: false }, { exclude: true }] })); guard.setTarget(target.targetId);
    stage = 'attach'; await session.attachToPage(target.targetId);
    await session.browserCommand('Target.setDiscoverTargets', { discover: true });
    for (const method of ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']) await session.command(method);
    await session.command('Page.setDownloadBehavior', { behavior: 'deny' });
    await session.command('Network.setBypassServiceWorker', { bypass: true });
    await session.command('Network.setCacheDisabled', { cacheDisabled: true });
    // Chrome151 ordered URLPattern allow rules precede the network-wide block.
    // Fetch interception below additionally rejects unexpected same-origin documents.
    await session.command('Network.setBlockedURLs', { urlPatterns: [
      { urlPattern: 'http://127.0.0.1:4176/*', block: false }, { urlPattern: 'ws://127.0.0.1:4176/', block: false }, { urlPattern: '*://*:*/*', block: true },
    ] });
    await session.command('Fetch.enable', { patterns: [{ requestStage: 'Request', urlPattern: '*' }, { requestStage: 'Response', resourceType: 'Document', urlPattern: '*' }] });
    const guardedSession = { command: async (method, parameters) => {
      guard.assert(); if (method === 'Page.navigate') guard.expectNavigation(parameters.url);
      if (method === 'Runtime.evaluate' || method === 'Page.captureScreenshot') { await guard.drain(); guard.assert(); guard.assertDocumentReady(); }
      const result = await session.command(method, parameters); guard.assert(); return result;
    } };
    stage = 'capture'; captured = await operations.capture(guardedSession, run); await guard.drain(); guard.assert();
    stage = 'identity-after-capture'; finalIdentity = await operations.identity(); if (!sameChromeIdentity(baseline, finalIdentity)) throw new Error('Windows Chrome executable changed during capture.');
    afterSource = await operations.source();
  } catch (error) { originalError = error; }
  finally {
    if (child) {
      try {
        let known = []; let inspectionError;
        try { known = await operations.inspectOwned(profile); } catch (error) { inspectionError = error; }
        // Always attempt normal close, even when the pre-close ownership query failed.
        guard.beginOwnedClose();
        try { if (session) { await session.browserCommand('Browser.close', {}, 5000); guard.acknowledgeOwnedClose(); } } catch { cleanup.closeFailed = true; /* Only verified owned processes below. */ }
        let exited = await operations.waitForExit(closed);
        let remaining = await operations.inspectOwned(profile, known);
        if (remaining.length) { cleanup.forced = true; await operations.terminateOwned(remaining); exited = await operations.waitForExit(closed); remaining = await operations.inspectOwned(profile, known); }
        cleanup = { ...cleanup, verified: exited && remaining.length === 0 && !inspectionError, remaining: remaining.length };
        if (inspectionError) throw inspectionError;
        if (!cleanup.verified) throw new Error('Owned Windows Chrome exit or descendants remain unverified; profile retained.');
        if (childExit?.spawnError || (!cleanup.forced && childExit?.code !== 0)) throw new Error('Owned Windows Chrome reported an unsuccessful exit.');
      } catch (error) { cleanupError = error; }
      finally { session?.close(); }
    } else cleanup = { ...cleanup, verified: true, remaining: 0 };
  }
  // Only a requested, acknowledged, normal owned close can explain either exact
  // observed detach reason; "Render process gone." was observed on Chrome151.
  // Never clear prior capture violations; crashes/other detach reasons stay fatal.
  guard.finishOwnedClose(cleanup.verified && !cleanup.forced && !cleanup.closeFailed && childExit?.code === 0 && childExit.signal === null && !childExit.spawnError);
  await guard.drain();
  try { guard.assert(); } catch (error) {
    if (!originalError) { originalError = error; stage = 'final-guard'; failureKind = 'guard-failed'; }
  }
  const diagnostics = guard.snapshot();
  const report = { synthetic: true, scope: 'Windows local DEV keep-only capture; not production or phone attestation', status: originalError || cleanupError ? 'failed; no acceptance claimed' : 'captured; images uninspected; performance not measured',
    run: run?.id ?? null, profile: profile ?? null, sourceBefore: beforeSource ?? null, sourceAfter: afterSource ?? null,
    stableSource: Boolean(beforeSource && afterSource && !beforeSource.substantiveDirty && !afterSource.substantiveDirty && beforeSource.commit === afterSource.commit && beforeSource.tree === afterSource.tree && !diagnostics.violation),
    executableBefore: baseline ?? null, executableAfterLaunch: launched ?? null, executableAfterCapture: finalIdentity ?? null,
    serverDocumentPolicy: { scope: 'synthetic keep-only; not production gameplay or performance', delivery: 'server-origin; unmodified CDP continuation', enforcedResponseHeader: KEEP04_DOCUMENT_POLICY, cacheDisabled: true },
    browser: browser ? { product: String(browser.product).slice(0, 128), protocolVersion: String(browser.protocolVersion).slice(0, 32) } : null, gpu: gpu ?? null,
    diagnosticPolicy: 'Bounded phase/severity/event classes and stderr counts only; no URLs, console arguments, request bodies or profile content retained. reviewRequired is not asset or visual acceptance.', diagnostics, stderr,
    captureCount: Array.isArray(captured?.observations) ? captured.observations.length : null, failure: originalError ? { stage, kind: failureKind } : cleanupError ? { stage: 'cleanup', kind: 'cleanup-failed' } : null, cleanup: { ...cleanup, exit: childExit ?? null } };
  if (run) { try { await operations.writeReport(run, report); } catch (error) { cleanupError = cleanupError ? new AggregateError([cleanupError, error], 'Cleanup/report failures.') : error; } }
  if (originalError && cleanupError) throw new AggregateError([originalError, cleanupError], 'Windows keep capture and cleanup/report failed.', { cause: originalError });
  if (originalError) throw originalError; if (cleanupError) throw cleanupError; return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const report = await runKeep04WindowsCapture(process.argv.slice(2)); console.log(JSON.stringify({ status: report.status, run: report.run, stableSource: report.stableSource, cleanup: report.cleanup })); }
  catch { console.error('Windows keep QA capture failed; inspect the fresh run provenance if created. No acceptance claimed.'); process.exitCode = 1; }
}
