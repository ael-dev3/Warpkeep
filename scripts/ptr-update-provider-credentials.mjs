import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fstatSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { types } from 'node:util';
import { attestPinnedSpacetimeCli } from './spacetime-cli-attestation.mjs';

const TARGET = 'https://maincloud.spacetimedb.com/v1/database/c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
const states = new WeakMap();
const fail = () => { throw new Error('PTR_UPDATE_PROVIDER_CREDENTIALS_INVALID'); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function data(value, keys, exact = true) {
  if (types.isProxy(value) || !value || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (exact && Reflect.ownKeys(descriptors).length !== keys.length) fail();
  return Object.fromEntries(keys.map(key => {
    const property = descriptors[key];
    if (!property?.enumerable || !Object.hasOwn(property, 'value')) fail();
    return [key, property.value];
  }));
}
function check(state) {
  if (state.disposed) fail();
  state.artifact.assertSourceAndArtifact();
  state.artifact.assertCliConfig();
  state.cli.verify();
}
/** Credential transport only: the factory authenticates artifact ownership and provider permissions. */
export function createPtrUpdateProviderCredentials(input) {
  let cli;
  try {
    if (arguments.length !== 1) fail();
    const { artifact: original } = data(input, ['artifact']);
    const artifact = data(original, ['artifactDescriptor', 'moduleSha256', 'spacetimeExecutable',
      'spacetimeExecutableSha256', 'spacetimeCliRootDirectory', 'spacetimeCliConfigPath',
      'spacetimeCliConfigSha256', 'assertSourceAndArtifact', 'assertCliConfig'], false);
    if (!Number.isSafeInteger(artifact.artifactDescriptor) || artifact.artifactDescriptor < 0
      || ['moduleSha256', 'spacetimeExecutableSha256', 'spacetimeCliConfigSha256'].some(key => typeof artifact[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(artifact[key]))
      || ['spacetimeExecutable', 'spacetimeCliRootDirectory', 'spacetimeCliConfigPath'].some(key => typeof artifact[key] !== 'string' || !isAbsolute(artifact[key]))
      || typeof artifact.assertSourceAndArtifact !== 'function' || typeof artifact.assertCliConfig !== 'function') fail();
    artifact.assertSourceAndArtifact(); artifact.assertCliConfig();
    cli = attestPinnedSpacetimeCli(artifact.spacetimeExecutable, spawnSync, Object.freeze({}));
    if (cli.digest !== artifact.spacetimeExecutableSha256) fail();
    const state = { artifact, cli, busy: false, disposed: false };
    check(state);
    const capability = Object.freeze({}); states.set(capability, state); return capability;
  } catch {
    try { cli?.cleanup(); } catch { /* Fixed diagnostics only. */ }
    fail();
  }
}
function candidate(state) {
  let body;
  try {
    check(state);
    const fd = state.artifact.artifactDescriptor;
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size < 1n || before.size > 256n * 1024n * 1024n) fail();
    body = Buffer.alloc(Number(before.size));
    for (let offset = 0; offset < body.length;) {
      const count = readSync(fd, body, offset, Math.min(1024 * 1024, body.length - offset), offset);
      if (count < 1) fail(); offset += count;
    }
    const after = fstatSync(fd, { bigint: true });
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'uid', 'nlink'].some(key => before[key] !== after[key])
      || hash(body) !== state.artifact.moduleSha256) fail();
    check(state); return body;
  } catch { body?.fill(0); fail(); }
}
function extract(state) {
  let result;
  try {
    check(state);
    result = spawnSync(state.cli.path, ['--root-dir', state.artifact.spacetimeCliRootDirectory,
      '--config-path', state.artifact.spacetimeCliConfigPath, 'login', 'show', '--token'], {
      env: Object.freeze({}), shell: false, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 32768, windowsHide: true,
    });
    if (result.error || result.status !== 0 || result.signal || !Buffer.isBuffer(result.stdout)
      || !Buffer.isBuffer(result.stderr) || result.stderr.length !== 0 || result.stdout.length > 32768) fail();
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(result.stdout);
    const match = /^You are logged in as ([a-f0-9]{64})\nYour auth token \(don't share this!\) is ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\n$/u.exec(text);
    if (!match || match[2].length < 20 || match[2].length > 16384) fail();
    check(state); return { identity: match[1], token: match[2] };
  } finally { if (Buffer.isBuffer(result?.stdout)) result.stdout.fill(0); if (Buffer.isBuffer(result?.stderr)) result.stderr.fill(0); }
}
/** Returns an unverified CLI identity assertion and raw protocol bytes, never an owner proof. */
export async function requestPtrUpdateProvider(capability, input) {
  let state, body, credential, tokenBytes, timer, reader, output, ownsBusy = false;
  const chunks = []; const abort = new AbortController();
  try {
    if (arguments.length !== 2) fail();
    state = states.get(capability);
    if (!state || state.disposed || state.busy) fail();
    // Capture data descriptors before touching any caller-selected property.
    const { operation } = data(input, ['operation'], false);
    const options = data(input, operation === 'apply' ? ['operation', 'migrationToken', 'beforeSend'] : ['operation']);
    if (!['metadata', 'schema', 'health', 'plan', 'apply'].includes(operation)
      || (operation === 'apply' && (typeof options.migrationToken !== 'string'
        || !/^0x[a-f0-9]{1,64}$/u.test(options.migrationToken) || typeof options.beforeSend !== 'function'))) fail();
    state.busy = true;
    ownsBusy = true;
    check(state);
    if (operation === 'plan' || operation === 'apply') body = candidate(state);
    credential = extract(state);
    tokenBytes = Buffer.from(credential.token);
    let rejectTimeout;
    const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
    timer = setTimeout(() => { abort.abort(); rejectTimeout(new Error('PTR_UPDATE_PROVIDER_CREDENTIALS_INVALID')); }, 30000);
    const bounded = promise => Promise.race([promise, timeout]);
    if (operation === 'apply') await bounded(Promise.resolve().then(() => options.beforeSend()));
    check(state); if (abort.signal.aborted) fail();
    const suffix = operation === 'metadata' || operation === 'health' ? '' : operation === 'schema' ? '/schema?version=10'
      : operation === 'plan' ? '/pre_publish?host_type=Js&style=NoColor'
        : `?host_type=Js&policy=BreakClients&token=${options.migrationToken}`;
    const url = operation === 'health' ? 'https://maincloud.spacetimedb.com/v1/health' : TARGET + suffix;
    const response = await bounded(fetch(url, { method: operation === 'apply' ? 'PUT' : operation === 'plan' ? 'POST' : 'GET',
      headers: { ...(operation === 'health' ? {} : { Authorization: `Bearer ${credential.token}` }), ...(body ? { 'Content-Type': 'application/octet-stream' } : {}) },
      ...(body ? { body } : {}), redirect: 'error', signal: abort.signal }));
    check(state);
    if (response.status !== 200 || response.redirected || response.url !== url || !response.body) fail();
    reader = response.body.getReader(); let length = 0;
    for (;;) {
      const entry = await bounded(reader.read());
      if (entry.done) break;
      length += entry.value.byteLength; if (length > 32 * 1024 * 1024) fail();
      chunks.push(Buffer.from(entry.value));
    }
    output = Buffer.concat(chunks);
    if (output.includes(tokenBytes)) fail();
    check(state);
    const result = Object.freeze({ bytes: output, claimedProviderIdentity: credential.identity }); output = undefined; return result;
  } catch { fail(); }
  finally {
    clearTimeout(timer); abort.abort();
    // Do not await an untrusted cancellation promise or retain secret diagnostics.
    try { const canceled = reader?.cancel(); canceled?.catch(() => {}); } catch { /* No raw errors. */ }
    body?.fill(0); tokenBytes?.fill(0); output?.fill(0); for (const chunk of chunks) chunk.fill(0);
    credential = undefined;
    if (ownsBusy) state.busy = false;
  }
}
export function disposePtrUpdateProviderCredentials(capability) {
  try {
    if (arguments.length !== 1) fail();
    const state = states.get(capability); if (!state) fail();
    if (state.disposed) return;
    state.disposed = true; state.cli.cleanup();
  } catch { fail(); }
}
