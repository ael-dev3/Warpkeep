import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fstatSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { types } from 'node:util';
import { attestPinnedSpacetimeCli } from './spacetime-cli-attestation.mjs';

// Each fixed facade owns an independent capability registry and target.
// Neither policy nor destination is accepted from callers.
function createFixedUpdateProvider(target, errorCode, readQueries = Object.freeze({}), resolvePageQuery = () => undefined) {
  const states = new WeakMap();
  const fail = () => { throw Object.assign(new Error(errorCode), { code: errorCode }); };
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
    state.assertSource();
    state.profile.assertCliConfig();
    state.cli.verify();
  }
  /** Credential transport only: the factory authenticates artifact ownership and provider permissions. */
  function createCredentials(input) {
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
      const state = { profile: artifact, assertSource: () => artifact.assertSourceAndArtifact(), cli, readOnly: false, busy: false, disposed: false };
      check(state);
      const capability = Object.freeze({}); states.set(capability, state); return capability;
    } catch {
      try { cli?.cleanup(); } catch { /* Fixed diagnostics only. */ }
      fail();
    }
  }
  // Read-only credentials authenticate the existing CLI/config/source, not a fake module artifact.
  function createReadCredentials(input) {
    let cli;
    try {
      if (arguments.length !== 1) fail();
      const { credentials: original } = data(input, ['credentials']);
      const profile = data(original, ['spacetimeExecutable', 'spacetimeExecutableSha256',
        'spacetimeCliRootDirectory', 'spacetimeCliConfigPath', 'spacetimeCliConfigSha256',
        'assertSource', 'assertCliConfig']);
      if (['spacetimeExecutableSha256', 'spacetimeCliConfigSha256'].some(key => typeof profile[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(profile[key]))
        || ['spacetimeExecutable', 'spacetimeCliRootDirectory', 'spacetimeCliConfigPath'].some(key => typeof profile[key] !== 'string' || !isAbsolute(profile[key]))
        || typeof profile.assertSource !== 'function' || typeof profile.assertCliConfig !== 'function') fail();
      profile.assertSource(); profile.assertCliConfig();
      cli = attestPinnedSpacetimeCli(profile.spacetimeExecutable, spawnSync, Object.freeze({}));
      if (cli.digest !== profile.spacetimeExecutableSha256) fail();
      const state = { profile, assertSource: () => profile.assertSource(), cli, readOnly: true, busy: false, disposed: false };
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
      const fd = state.profile.artifactDescriptor;
      const before = fstatSync(fd, { bigint: true });
      if (!before.isFile() || before.nlink !== 1n || before.size < 1n || before.size > 256n * 1024n * 1024n) fail();
      body = Buffer.alloc(Number(before.size));
      for (let offset = 0; offset < body.length;) {
        const count = readSync(fd, body, offset, Math.min(1024 * 1024, body.length - offset), offset);
        if (count < 1) fail(); offset += count;
      }
      const after = fstatSync(fd, { bigint: true });
      if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'uid', 'nlink'].some(key => before[key] !== after[key])
        || hash(body) !== state.profile.moduleSha256) fail();
      check(state); return body;
    } catch { body?.fill(0); fail(); }
  }
  function extract(state) {
    let result;
    try {
      check(state);
      result = spawnSync(state.cli.path, ['--root-dir', state.profile.spacetimeCliRootDirectory,
        '--config-path', state.profile.spacetimeCliConfigPath, 'login', 'show', '--token'], {
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
  async function requestFixed(capability, input) {
    let state, body, credential, tokenBytes, timer, reader, output, ownsBusy = false;
    const chunks = []; const abort = new AbortController();
    try {
      if (arguments.length !== 2) fail();
      state = states.get(capability);
      if (!state || state.disposed || state.busy) fail();
      // Capture data descriptors before touching any caller-selected property.
      const { operation } = data(input, ['operation'], false);
      const options = data(input, operation === 'apply' ? ['operation', 'migrationToken', 'beforeSend'] : ['operation']);
      const readQuery = typeof operation === 'string' && Object.hasOwn(readQueries, operation)
        ? readQueries[operation] : resolvePageQuery(operation);
      const fixedRead = readQuery !== undefined;
      if ((!['metadata', 'schema', 'health', 'plan', 'apply'].includes(operation) && !fixedRead)
        || (state.readOnly && !fixedRead)
        || (operation === 'apply' && (typeof options.migrationToken !== 'string'
          || !/^0x[a-f0-9]{1,64}$/u.test(options.migrationToken) || typeof options.beforeSend !== 'function'))) fail();
      state.busy = true;
      ownsBusy = true;
      check(state);
      if (operation === 'plan' || operation === 'apply') body = candidate(state);
      else if (fixedRead && !['schema-v9', 'schema-v10'].includes(operation)) body = Buffer.from(readQuery);
      credential = extract(state);
      tokenBytes = Buffer.from(credential.token);
      let rejectTimeout;
      const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
      timer = setTimeout(() => { abort.abort(); rejectTimeout(new Error(errorCode)); }, 30000);
      const bounded = promise => Promise.race([promise, timeout]);
      if (operation === 'apply') await bounded(Promise.resolve().then(() => options.beforeSend()));
      check(state); if (abort.signal.aborted) fail();
      const suffix = fixedRead ? operation === 'schema-v9' ? '/schema?version=9' : operation === 'schema-v10' ? '/schema?version=10' : '/sql' : operation === 'metadata' || operation === 'health' ? '' : operation === 'schema' ? '/schema?version=10'
        : operation === 'plan' ? '/pre_publish?host_type=Js&style=NoColor'
          : `?host_type=Js&policy=BreakClients&token=${options.migrationToken}`;
      const url = operation === 'health' ? 'https://maincloud.spacetimedb.com/v1/health' : target + suffix;
      const response = await bounded(fetch(url, { method: operation === 'apply' ? 'PUT' : operation === 'plan' || (fixedRead && !['schema-v9', 'schema-v10'].includes(operation)) ? 'POST' : 'GET',
        headers: { ...(operation === 'health' ? {} : { Authorization: `Bearer ${credential.token}` }), ...(body ? { 'Content-Type': fixedRead ? 'text/plain' : 'application/octet-stream' } : {}) },
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
  function disposeCredentials(capability) {
    try {
      if (arguments.length !== 1) fail();
      const state = states.get(capability); if (!state) fail();
      if (state.disposed) return;
      state.disposed = true; state.cli.cleanup();
    } catch { fail(); }
  }
  async function requestProvider(capability, input) {
    if (arguments.length !== 2) fail();
    const { operation } = data(input, ['operation'], false);
    if (!['metadata', 'schema', 'health', 'plan', 'apply'].includes(operation)) fail();
    return requestFixed(capability, input);
  }
  async function requestRead(capability, input) {
    if (arguments.length !== 2) fail();
    const { operation } = data(input, ['operation']);
    if (typeof operation !== 'string' || (!Object.hasOwn(readQueries, operation) && resolvePageQuery(operation) === undefined)) fail();
    return requestFixed(capability, input);
  }
  return Object.freeze({ createCredentials, createReadCredentials, requestProvider, requestRead, disposeCredentials });
}

// Fixed installed-table read inventory. Unknown future tables require a source review.
export const PTR_INSPECTION_TABLES = Object.freeze([
  'access_request_v1',
  'admin_audit',
  'allowed_fid',
  'alpha_terms_acceptance_v1',
  'castle',
  'greater_realm_activation_v1',
  'greater_realm_castle_claim_v1',
  'greater_realm_castle_slot_v1',
  'greater_realm_cell_occupancy_v1',
  'greater_realm_cell_v1',
  'greater_realm_chunk_v1',
  'greater_realm_navigation_component_v1',
  'greater_realm_release_v1',
  'greater_realm_resource_node_v1',
  'mark_account_v1',
  'player',
  'player_ownership_v2',
  'player_v2',
  'ptr_owner_anchor_v1',
  'realm_atlas_v1',
  'realm_atlas_visible_region_v1',
  'realm_profile_v1',
  'realm_worker_system_v2',
  'resource_account_v1',
  'gameplay04_keep_v1',
  'gameplay04_worker_v1',
  'gameplay04_receipt_v1',
  'gameplay04_reservation_v1',
  'gameplay04_building_v1',
  'gameplay04_project_v1',
  'gameplay04_schedule_v1',
]);
// Page keys are globally unique unsigned ordinals, independent of atlas identity.
// The inspector proves full coverage against complete before/after key inventories.
export const PTR_INSPECTION_PAGING = Object.freeze({
  greater_realm_chunk_v1: Object.freeze({ column: 'import_ordinal', width: 16 }),
  greater_realm_cell_v1: Object.freeze({ column: 'release_ordinal', width: 512 }),
});
function resolvePtrPageQuery(operation) {
  if (typeof operation !== 'string') return undefined;
  const match = /^page:(greater_realm_chunk_v1|greater_realm_cell_v1):(0|[1-9][0-9]{0,9})$/u.exec(operation);
  if (!match) return undefined;
  const start = Number(match[2]), policy = PTR_INSPECTION_PAGING[match[1]];
  if (!Number.isSafeInteger(start) || start > 0xffffffff || start % policy.width !== 0) return undefined;
  return `SELECT * FROM ${match[1]} WHERE ${policy.column} >= ${start} AND ${policy.column} <= ${Math.min(start + policy.width - 1, 0xffffffff)}`;
}
const ptrReadQueries = Object.freeze({
  'schema-v9': '', 'schema-v10': '',
  program: 'SELECT program_hash FROM st_module',
  ...Object.fromEntries(PTR_INSPECTION_TABLES.map(name => [`rows:${name}`, `SELECT * FROM ${name}`])),
  ...Object.fromEntries(Object.entries(PTR_INSPECTION_PAGING).map(([name, policy]) =>
    [`ordinals:${name}`, `SELECT ${policy.column} FROM ${name}`])),
});

const ptr = createFixedUpdateProvider(
  'https://maincloud.spacetimedb.com/v1/database/c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
  'PTR_UPDATE_PROVIDER_CREDENTIALS_INVALID',
  ptrReadQueries,
  resolvePtrPageQuery,
);
const g002 = createFixedUpdateProvider(
  'https://maincloud.spacetimedb.com/v1/database/c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
  'G002_UPDATE_PROVIDER_CREDENTIALS_INVALID',
);

export function createPtrInspectionProviderCredentials(input) { return ptr.createReadCredentials(...arguments); }
export function requestPtrInspectionProvider(capability, input) { return ptr.requestRead(...arguments); }
export function createPtrUpdateProviderCredentials(input) { return ptr.createCredentials(...arguments); }
export function requestPtrUpdateProvider(capability, input) { return ptr.requestProvider(...arguments); }
export function disposePtrUpdateProviderCredentials(capability) { return ptr.disposeCredentials(...arguments); }
export function createG002UpdateProviderCredentials(input) { return g002.createCredentials(...arguments); }
export function requestG002UpdateProvider(capability, input) { return g002.requestProvider(...arguments); }
export function disposeG002UpdateProviderCredentials(capability) { return g002.disposeCredentials(...arguments); }
