import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { isAbsolute, join, relative, sep } from 'node:path';

import {
  assertFrozenDescriptorPreservesBaseline,
  assertGenesis001BaselineDescriptor,
  canonicalGenesis001FrozenPolicyReceipt,
  descriptorDigest,
} from './genesis001-frozen-publisher-core';

const DATABASE = 'genesis-001-local-upgrade-proof';
const ADMIN_ISSUER = 'https://auth.warpkeep.com';
const MAX_DESCRIPTOR_BYTES = 16 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_SERVER_OUTPUT_BYTES = 4 * 1024 * 1024;
const COMMAND_TIMEOUT = 2 * 60_000;
const TOTAL_TIMEOUT = 12 * 60_000;
const CONTAINMENT_GRACE = 5_000;
const WRITERS = Object.freeze([
  Object.freeze({ name: 'admin_allow_fid', kind: 'reducer', body: '[1,""]', reason: 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED' }),
  Object.freeze({
    name: 'admin_admit_founder_v1', kind: 'reducer',
    body: '[1,"","g001-local-proof",null,"https://example.invalid/g001.png",null,"trusted-snapchain-profile-v3"]',
    reason: 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED',
  }),
  Object.freeze({ name: 'admin_disable_fid', kind: 'reducer', body: '[1,""]', reason: 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED' }),
  Object.freeze({ name: 'admin_bump_auth_epoch', kind: 'reducer', body: '[1,""]', reason: 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED' }),
  Object.freeze({ name: 'access_request_submit_v1', kind: 'procedure', body: '[]', reason: 'GENESIS_001_ACCESS_REQUEST_SUBMISSIONS_DISABLED' }),
  Object.freeze({
    name: 'admin_reset_access_request_v1', kind: 'reducer', body: '[1,false,0,null,null,""]',
    reason: 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED',
  }),
]);

export const GENESIS001_CHECKED_FROZEN_WRITERS = Object.freeze(WRITERS.map(writer => writer.name));

export class Genesis001LocalUpgradeProofError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'Genesis001LocalUpgradeProofError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new Genesis001LocalUpgradeProofError(code, cause === undefined ? undefined : { cause });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

export function decodeGenesis001BoundedJson(body, maximumBytes, code = 'GENESIS001_LOCAL_PROOF_JSON_INVALID') {
  if (!(body instanceof Uint8Array) || !Number.isSafeInteger(maximumBytes)
      || maximumBytes < 1 || body.byteLength < 1 || body.byteLength > maximumBytes) fail(code);
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch (error) { return fail(code, error); }
  let value;
  try { value = JSON.parse(source); } catch (error) { return fail(code, error); }
  return value;
}

export function decodeGenesis001ProcedureResponse(status, body, maximumBytes, credential) {
  if (!Number.isSafeInteger(status) || status < 100 || status > 599
      || !(body instanceof Uint8Array) || !Number.isSafeInteger(maximumBytes)
      || maximumBytes < 1 || body.byteLength < 1 || body.byteLength > maximumBytes
      || typeof credential !== 'string' || credential.length < 1) {
    fail('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
  }
  if (status >= 300 && status < 400) fail('GENESIS001_LOCAL_PROOF_REDIRECT_DENIED');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch (error) {
    return fail('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID', error);
  }
  if (text.includes(credential)) fail('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
  let value;
  try { value = JSON.parse(text); } catch (error) {
    if (status < 400) fail('GENESIS001_LOCAL_PROOF_JSON_INVALID', error);
  }
  return Object.freeze({ status, text, value });
}

export async function readGenesis001BoundedResponseBody(response, maximumBytes) {
  if (response === null || typeof response !== 'object' || response.body === null
      || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    fail('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(declared)
      || Number(declared) > maximumBytes)) {
    fail('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    if (!(item.value instanceof Uint8Array) || total + item.value.byteLength > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      fail('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
    }
    chunks.push(item.value);
    total += item.value.byteLength;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export function assertGenesis001FrozenWriterObservation(value) {
  if (!exactKeys(value, ['writer', 'status', 'text', 'serverText', 'before', 'after'])) {
    fail('GENESIS001_LOCAL_PROOF_WRITER_INVALID');
  }
  const expected = WRITERS.find(writer => writer.name === value.writer);
  if (expected === undefined || !Number.isSafeInteger(value.status)
      || value.status < 400 || value.status > 599 || typeof value.text !== 'string'
      || Buffer.byteLength(value.text) > MAX_RESPONSE_BYTES || typeof value.serverText !== 'string'
      || Buffer.byteLength(value.serverText) > MAX_SERVER_OUTPUT_BYTES
      || !value.serverText.includes(
        `${expected.kind} "${expected.name}" runtime error: Uncaught Error: ${expected.reason}`,
      )
      || canonicalJson(value.before) !== canonicalJson(value.after)) {
    fail('GENESIS001_LOCAL_PROOF_WRITER_INVALID');
  }
}

function contained(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (difference !== '..' && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function privateDirectory(path) {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
  const state = lstatSync(path);
  if (!state.isDirectory() || state.isSymbolicLink() || (state.mode & 0o777) !== 0o700
      || (process.getuid !== undefined && state.uid !== process.getuid())) {
    fail('GENESIS001_LOCAL_PROOF_PRIVATE_PATH_INVALID');
  }
}

function privateFile(path, value) {
  writeFileSync(path, value, { flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
  const state = lstatSync(path);
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1
      || (state.mode & 0o777) !== 0o600
      || (process.getuid !== undefined && state.uid !== process.getuid())) {
    fail('GENESIS001_LOCAL_PROOF_PRIVATE_PATH_INVALID');
  }
}

function remaining(deadline, cap) {
  const value = Math.min(cap, deadline - Date.now());
  if (value < 1) fail('GENESIS001_LOCAL_PROOF_TIMEOUT');
  return value;
}

function boundedCommand(executable, arguments_, cwd, environment, deadline, maximum = MAX_COMMAND_OUTPUT_BYTES) {
  const result = spawnSync(executable, arguments_, {
    cwd, env: environment, encoding: 'buffer', input: Buffer.alloc(0), shell: false,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: remaining(deadline, COMMAND_TIMEOUT),
    maxBuffer: maximum, killSignal: 'SIGKILL',
  });
  if (result.error !== undefined || result.status !== 0 || result.signal !== null
      || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)
      || result.stdout.byteLength > maximum || result.stderr.byteLength > maximum) {
    fail(result.error?.code === 'ETIMEDOUT'
      ? 'GENESIS001_LOCAL_PROOF_COMMAND_TIMEOUT' : 'GENESIS001_LOCAL_PROOF_COMMAND_FAILED', result.error);
  }
  return result.stdout;
}

async function freeLoopbackPort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        rejectPromise(new Error('loopback reservation failed'));
        return;
      }
      server.close(error => error === undefined ? resolvePromise(address.port) : rejectPromise(error));
    });
  });
}

function processGroupExists(pid) {
  try { process.kill(-pid, 0); return true; } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

const delay = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

export async function terminateGenesis001LocalProofProcessGroup(child, grace = CONTAINMENT_GRACE) {
  const pid = child?.pid;
  if (!Number.isSafeInteger(pid) || pid < 2) fail('GENESIS001_LOCAL_PROOF_PROCESS_INVALID');
  if (!processGroupExists(pid)) return;
  try { process.kill(-pid, 'SIGTERM'); } catch (error) {
    if (!processGroupExists(pid)) return;
    fail('GENESIS001_LOCAL_PROOF_CONTAINMENT_FAILED', error);
  }
  const soft = Date.now() + grace;
  while (processGroupExists(pid) && Date.now() < soft) await delay(20);
  if (processGroupExists(pid)) process.kill(-pid, 'SIGKILL');
  const hard = Date.now() + grace;
  while (processGroupExists(pid) && Date.now() < hard) await delay(20);
  if (processGroupExists(pid)) fail('GENESIS001_LOCAL_PROOF_CONTAINMENT_FAILED');
}

async function boundedFetchJson(url, options, deadline, maximum = MAX_RESPONSE_BYTES) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1'
      || parsed.username !== '' || parsed.password !== '') fail('GENESIS001_LOCAL_PROOF_URL_INVALID');
  const response = await fetch(parsed, {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(remaining(deadline, 5_000)),
  });
  if (response.status >= 300 && response.status < 400) fail('GENESIS001_LOCAL_PROOF_REDIRECT_DENIED');
  const body = await readGenesis001BoundedResponseBody(response, maximum);
  return Object.freeze({ status: response.status, body, value: decodeGenesis001BoundedJson(body, maximum) });
}

function adminJwt(privateKey) {
  const now = Math.floor(Date.now() / 1_000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: ADMIN_ISSUER, sub: 'service:hermes', aud: ['warpkeep-spacetimedb'],
    token_type: 'spacetime-access', roles: ['warpkeep-admin'],
    iat: now, nbf: now, exp: now + 240, jti: randomUUID(),
  })).toString('base64url');
  const signed = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signed), {
    key: privateKey, dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signed}.${signature}`;
}

async function call(server, procedure, credential, body, deadline) {
  const parsed = new URL(`${server}/v1/database/${DATABASE}/call/${procedure}`);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') {
    fail('GENESIS001_LOCAL_PROOF_URL_INVALID');
  }
  const response = await fetch(parsed, {
    method: 'POST', headers: Object.freeze({
      authorization: `Bearer ${credential}`, 'cache-control': 'no-store',
      'content-type': 'application/json',
    }), body, redirect: 'manual', signal: AbortSignal.timeout(remaining(deadline, 5_000)),
  });
  const bytes = await readGenesis001BoundedResponseBody(response, MAX_RESPONSE_BYTES);
  return decodeGenesis001ProcedureResponse(response.status, bytes, MAX_RESPONSE_BYTES, credential);
}

async function awaitIdentity(server, deadline) {
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await boundedFetchJson(`${server}/v1/identity`, { method: 'POST' }, deadline, 4_096);
      if (response.status !== 200 || !exactKeys(response.value, ['identity', 'token'])
          || !/^[0-9a-f]{64}$/u.test(response.value.identity ?? '')
          || typeof response.value.token !== 'string' || response.value.token.split('.').length !== 3) {
        fail('GENESIS001_LOCAL_PROOF_IDENTITY_INVALID');
      }
      return response.value;
    } catch (error) { lastError = error; await delay(100); }
  }
  fail('GENESIS001_LOCAL_PROOF_STARTUP_TIMEOUT', lastError);
}

export async function runGenesis001LocalUpgradeProof(input) {
  if (!exactKeys(input, [
    'cliPath', 'baselineArtifactPath', 'frozenArtifactPath', 'operationRoot',
    'environment', 'verifyExecutables',
  ]) || typeof input.cliPath !== 'string' || !isAbsolute(input.cliPath)
      || typeof input.baselineArtifactPath !== 'string' || !isAbsolute(input.baselineArtifactPath)
      || typeof input.frozenArtifactPath !== 'string' || !isAbsolute(input.frozenArtifactPath)
      || typeof input.operationRoot !== 'string' || !isAbsolute(input.operationRoot)
      || typeof input.verifyExecutables !== 'function'
      || !contained(input.operationRoot, input.baselineArtifactPath)
      || !contained(input.operationRoot, input.frozenArtifactPath)) {
    fail('GENESIS001_LOCAL_PROOF_INPUT_INVALID');
  }
  const deadline = Date.now() + TOTAL_TIMEOUT;
  const proofRoot = join(input.operationRoot, 'proof');
  privateDirectory(proofRoot);
  const keys = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const publicKeyPath = join(proofRoot, 'jwt-public.pem');
  const privateKeyPath = join(proofRoot, 'jwt-private.pem');
  privateFile(publicKeyPath, keys.publicKey);
  privateFile(privateKeyPath, keys.privateKey);
  const port = await freeLoopbackPort();
  const server = `http://127.0.0.1:${port}`;
  input.verifyExecutables();
  const child = spawn(input.cliPath, [
    'start', '--listen-addr', `127.0.0.1:${port}`, '--in-memory', '--data-dir', proofRoot,
    '--jwt-pub-key-path', publicKeyPath, '--jwt-priv-key-path', privateKeyPath, '--non-interactive',
  ], {
    cwd: input.operationRoot, detached: true, env: input.environment,
    stdio: ['ignore', 'pipe', 'pipe'], shell: false,
  });
  let serverOutputBytes = 0;
  const serverOutputChunks = [];
  let outputOverflow = false;
  const drain = chunk => {
    serverOutputBytes += chunk.byteLength;
    if (serverOutputBytes > MAX_SERVER_OUTPUT_BYTES) {
      outputOverflow = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* containment reports the outcome */ }
      return;
    }
    serverOutputChunks.push(Buffer.from(chunk));
  };
  child.stdout.on('data', drain);
  child.stderr.on('data', drain);
  let succeeded = false;
  let primary;
  let evidence;
  try {
    const identity = await awaitIdentity(server, Math.min(deadline, Date.now() + 50_000));
    if (outputOverflow) fail('GENESIS001_LOCAL_PROOF_SERVER_OUTPUT_INVALID');
    const configPath = join(proofRoot, 'cli.toml');
    privateFile(configPath, `spacetimedb_token = ${JSON.stringify(identity.token)}\n`);
    const config = `--config-path=${configPath}`;
    const publish = artifact => {
      input.verifyExecutables();
      boundedCommand(input.cliPath, [config, 'publish', '--server', server, '--js-path', artifact,
        '--delete-data=never', '--no-config', DATABASE], input.operationRoot, input.environment, deadline);
      input.verifyExecutables();
    };
    const describe = () => {
      input.verifyExecutables();
      const body = boundedCommand(input.cliPath, [config, 'describe', '--json', '--server', server,
        '--no-config', DATABASE], input.operationRoot, input.environment, deadline, MAX_DESCRIPTOR_BYTES);
      input.verifyExecutables();
      return decodeGenesis001BoundedJson(body, MAX_DESCRIPTOR_BYTES, 'GENESIS001_LOCAL_PROOF_DESCRIPTOR_INVALID');
    };
    publish(input.baselineArtifactPath);
    const baseline = describe();
    assertGenesis001BaselineDescriptor(baseline);
    publish(input.frozenArtifactPath);
    const frozen = describe();
    assertFrozenDescriptorPreservesBaseline(baseline, frozen);

    const policyResponse = await call(server, 'genesis_001_access_policy_v1', adminJwt(keys.privateKey), '[]', deadline);
    if (policyResponse.status !== 200 || !Array.isArray(policyResponse.value) || policyResponse.value.length !== 7) {
      fail('GENESIS001_LOCAL_PROOF_POLICY_INVALID');
    }
    const expectedPolicy = canonicalGenesis001FrozenPolicyReceipt();
    const policy = Object.freeze({
      realmId: policyResponse.value[0], releaseVersion: policyResponse.value[1],
      playerAccessEnabled: policyResponse.value[2], admissionStateMutationsEnabled: policyResponse.value[3],
      accessRequestSubmissionsEnabled: policyResponse.value[4], sourceBaselineCommit: policyResponse.value[5],
      freezeReleaseNonce: policyResponse.value[6],
    });
    if (canonicalJson(policy) !== canonicalJson(expectedPolicy)) fail('GENESIS001_LOCAL_PROOF_POLICY_INVALID');

    const state = async () => {
      const credential = adminJwt(keys.privateKey);
      const status = await call(server, 'admin_get_alpha_status_v3', credential, '[]', deadline);
      const requests = await call(server, 'admin_list_access_requests_v1', credential, '[0,0,100,true]', deadline);
      const currentPolicy = await call(server, 'genesis_001_access_policy_v1', credential, '[]', deadline);
      if (status.status !== 200 || requests.status !== 200 || currentPolicy.status !== 200) {
        fail('GENESIS001_LOCAL_PROOF_STATE_INVALID');
      }
      return Object.freeze([status.value, requests.value, currentPolicy.value]);
    };
    const serverTextSince = async (offset, writer) => {
      const expected = `${writer.kind} "${writer.name}" runtime error: Uncaught Error: ${writer.reason}`;
      const limit = Date.now() + remaining(deadline, 5_000);
      let text = '';
      while (Date.now() < limit) {
        if (outputOverflow) fail('GENESIS001_LOCAL_PROOF_SERVER_OUTPUT_INVALID');
        const bytes = Buffer.concat(serverOutputChunks, serverOutputBytes).subarray(offset);
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (error) {
          return fail('GENESIS001_LOCAL_PROOF_SERVER_OUTPUT_INVALID', error);
        }
        if (text.includes(expected)) return text;
        await delay(20);
      }
      return text;
    };
    for (const writer of WRITERS) {
      const before = await state();
      const serverOffset = serverOutputBytes;
      const response = await call(server, writer.name, adminJwt(keys.privateKey), writer.body, deadline);
      const after = await state();
      const serverText = await serverTextSince(serverOffset, writer);
      assertGenesis001FrozenWriterObservation({
        writer: writer.name, status: response.status, text: response.text, serverText, before, after,
      });
    }
    if (outputOverflow) fail('GENESIS001_LOCAL_PROOF_SERVER_OUTPUT_INVALID');
    evidence = Object.freeze({
      baselineDescriptorSha256: descriptorDigest(baseline),
      frozenDescriptorSha256: descriptorDigest(frozen),
      checkedFrozenWriters: GENESIS001_CHECKED_FROZEN_WRITERS,
    });
    succeeded = true;
  } catch (error) { primary = error; }
  let containment;
  try { await terminateGenesis001LocalProofProcessGroup(child); } catch (error) { containment = error; }
  if (primary !== undefined || containment !== undefined) {
    if (primary !== undefined && containment === undefined) throw primary;
    throw new AggregateError([primary, containment].filter(Boolean), 'GENESIS001_LOCAL_PROOF_FAILED', { cause: primary });
  }
  if (!succeeded || evidence === undefined) fail('GENESIS001_LOCAL_PROOF_FAILED');
  rmSync(proofRoot, { recursive: true, force: false });
  return evidence;
}
