import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign as signBytes,
} from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cleanupMigrationProofResources,
  containServerProcessErrors,
} from './verify-spacetime-additive-migration.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const actualModule = resolve(repositoryRoot, 'spacetimedb');
// SQL inspection must stay table-identical to the current candidate. A
// predecessor fixture would make the safe publisher refuse a destructive
// downgrade before the rehearsal reaches its request-CAS checks.
const inspectionModule = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/current-candidate-inspection',
);
const actualArtifactPath = join(actualModule, 'dist', 'bundle.js');
const inspectionArtifactPath = join(inspectionModule, 'dist', 'bundle.js');
const command = process.env.SPACETIME_BIN || 'spacetime';
const expectedCliVersion = '2.6.1';
const expectedCliCommit = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const database = 'warpkeep-admission-cas-rehearsal';
const founderFid = 740_101;
const profilePolicyVersion = 'trusted-snapchain-profile-v3';
const expectedFrozenPolicy = Object.freeze({
  realmId: 'GENESIS_001',
  releaseVersion: '0.3.43',
  playerAccessEnabled: true,
  admissionStateMutationsEnabled: false,
  accessRequestSubmissionsEnabled: false,
  sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
  freezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
});
const maximumU64 = (1n << 64n) - 1n;
const maximumOutputBytes = 1_000_000;
const maximumResponseBytes = 16_384;
const commandTimeoutMilliseconds = 120_000;
const requestTimeoutMilliseconds = 10_000;
const rehearsalTimeoutMilliseconds = 300_000;
const rehearsalDeadline = Date.now() + rehearsalTimeoutMilliseconds;
const childEnvironmentKeys = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
]);
const graphQueries = Object.freeze({
  legacyPlayer: `SELECT * FROM player WHERE fid = ${founderFid}`,
  player: `SELECT * FROM player_v2 WHERE fid = ${founderFid}`,
  ownership: `SELECT * FROM player_ownership_v2 WHERE fid = ${founderFid}`,
  castle: `SELECT * FROM castle WHERE owner_fid = ${founderFid}`,
  claim: `SELECT * FROM castle_slot_claim_v1 WHERE owner_fid = ${founderFid}`,
  profile: `SELECT * FROM realm_profile_v1 WHERE fid = ${founderFid}`,
  marks: `SELECT * FROM mark_account_v1 WHERE fid = ${founderFid}`,
  resource: `SELECT * FROM resource_account_v1 WHERE fid = ${founderFid}`,
  workerSystem: 'SELECT * FROM realm_worker_system_v1',
  workers: 'SELECT * FROM castle_worker_v1',
  assignments: `SELECT * FROM worker_assignment_v1 WHERE fid = ${founderFid}`,
  occupations: 'SELECT * FROM worker_node_occupation_v1',
  workerReceipts: `SELECT * FROM worker_command_idempotency_v1 WHERE fid = ${founderFid}`,
  workerSchedules: 'SELECT * FROM worker_assignment_schedule_v_1',
});

class AdmissionCasRehearsalError extends Error {}

let disposableCliCredential = null;
let rehearsalStage = 'startup';

function fail(message) {
  throw new AdmissionCasRehearsalError(message);
}

function remainingTimeout(maximum = commandTimeoutMilliseconds) {
  const remaining = rehearsalDeadline - Date.now();
  if (remaining <= 0) fail('Admission request-CAS rehearsal exceeded its total deadline.');
  return Math.max(1, Math.min(maximum, remaining));
}

function childEnvironment(source = process.env) {
  return Object.fromEntries(childEnvironmentKeys
    .filter(key => typeof source[key] === 'string' && source[key].length > 0)
    .map(key => [key, source[key]]));
}

function collectBounded(stream, onOverflow) {
  const chunks = [];
  let bytes = 0;
  stream.on('data', chunk => {
    bytes += chunk.byteLength;
    if (bytes > maximumOutputBytes) {
      onOverflow();
      return;
    }
    chunks.push(chunk);
  });
  return () => Buffer.concat(chunks).toString('utf8');
}

async function runCommand(arguments_, { token, timeout = commandTimeoutMilliseconds } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let overflow = false;
    let timedOut = false;
    let forcedDeadline;
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: childEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const killForOverflow = () => {
      overflow = true;
      try { child.kill('SIGKILL'); } catch { /* The bounded failure is authoritative. */ }
    };
    const stdout = collectBounded(child.stdout, killForOverflow);
    const stderr = collectBounded(child.stderr, killForOverflow);
    const settle = callback => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (forcedDeadline !== undefined) clearTimeout(forcedDeadline);
      callback();
    };
    child.once('error', () => {
      if (!timedOut) settle(() => rejectPromise(new AdmissionCasRehearsalError(
        'SpacetimeDB CLI process could not start.',
      )));
    });
    child.once('close', code => settle(() => {
      if (timedOut) {
        rejectPromise(new AdmissionCasRehearsalError(
          'SpacetimeDB CLI command exceeded its hard deadline.',
        ));
        return;
      }
      const capturedStdout = stdout();
      const capturedStderr = stderr();
      if (overflow) {
        rejectPromise(new AdmissionCasRehearsalError(
          'SpacetimeDB CLI output exceeded its fixed bound.',
        ));
        return;
      }
      if (
        typeof token === 'string'
        && (capturedStdout.includes(token) || capturedStderr.includes(token))
      ) {
        rejectPromise(new AdmissionCasRehearsalError(
          'SpacetimeDB CLI exposed a disposable local credential.',
        ));
        return;
      }
      resolvePromise({ code: code ?? 1, stdout: capturedStdout, stderr: capturedStderr });
    }));
    const deadline = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* The bounded failure is authoritative. */ }
      forcedDeadline = setTimeout(() => settle(() => rejectPromise(
        new AdmissionCasRehearsalError('SpacetimeDB CLI command did not terminate.'),
      )), 5_000);
    }, remainingTimeout(timeout));
  });
}

async function verifyCliVersion() {
  const result = await runCommand(['--version'], { timeout: 10_000 });
  if (
    result.code !== 0
    || !result.stdout.includes(`spacetimedb tool version ${expectedCliVersion};`)
    || !result.stdout.includes(`Commit: ${expectedCliCommit}`)
  ) fail('Pinned SpacetimeDB CLI 2.6.1 was not active.');
}

async function configureDisposableCliCredential(token, dataDirectory) {
  if (disposableCliCredential !== null || typeof token !== 'string' || token.length < 32) {
    fail('Disposable local CLI credential setup was invalid.');
  }
  const configPath = join(dataDirectory, 'cli.toml');
  await writeFile(
    configPath,
    `spacetimedb_token = ${JSON.stringify(token)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
  const metadata = await stat(configPath);
  if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
    fail('Disposable local CLI credential permissions were invalid.');
  }
  disposableCliCredential = Object.freeze({ token, configPath });
}

function configArguments(token) {
  if (
    typeof token !== 'string'
    || token.length < 32
    || disposableCliCredential?.token !== token
    || typeof disposableCliCredential.configPath !== 'string'
  ) fail('Disposable local CLI credential was unavailable.');
  return [`--config-path=${disposableCliCredential.configPath}`];
}

async function buildModule(modulePath) {
  const result = await runCommand([
    'build',
    '--module-path', modulePath,
  ]);
  if (result.code !== 0) fail('Disposable rehearsal module build failed safely.');
}

function assertSafePublishArguments(arguments_) {
  if (
    arguments_.includes('--break-clients')
    || arguments_.some(value => value === '--yes' || value.startsWith('--yes='))
    || arguments_.filter(value => value === '--delete-data=never').length !== 1
    || arguments_.some(value => value.startsWith('--delete-data=') && value !== '--delete-data=never')
  ) fail('Disposable rehearsal constructed an unsafe publish command.');
}

async function publishArtifact(server, token, artifactPath) {
  const arguments_ = [
    ...configArguments(token),
    'publish',
    '--server', server,
    '--js-path', artifactPath,
    '--delete-data=never',
    '--no-config',
    database,
  ];
  assertSafePublishArguments(arguments_);
  const result = await runCommand(arguments_, { token });
  if (result.code !== 0) fail('Disposable loopback artifact publish failed safely.');
}

async function sql(server, token, query) {
  const result = await runCommand([
    ...configArguments(token),
    'sql',
    '--server', server,
    '--no-config',
    database,
    query,
  ], { token });
  if (result.code !== 0) {
    const operation = query.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? 'SQL';
    const table = query.match(/\b(?:FROM|INTO)\s+([a-z0-9_]+)/i)?.[1] ?? 'fixture';
    fail(`Disposable ${operation} inspection failed safely for ${table}.`);
  }
  return result.stdout;
}

function outputDigest(output) {
  return createHash('sha256').update(output.replace(/\r\n/g, '\n').trim()).digest('hex');
}

async function freeLoopbackPort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const portServer = createServer();
    const deadline = setTimeout(() => {
      try { portServer.close(); } catch { /* The bounded failure remains generic. */ }
      rejectPromise(new AdmissionCasRehearsalError('Could not reserve a loopback port.'));
    }, remainingTimeout(2_000));
    portServer.once('error', error => {
      clearTimeout(deadline);
      rejectPromise(error);
    });
    portServer.listen(0, '127.0.0.1', () => {
      const address = portServer.address();
      if (!address || typeof address === 'string') {
        clearTimeout(deadline);
        portServer.close();
        rejectPromise(new AdmissionCasRehearsalError('Could not reserve a loopback port.'));
        return;
      }
      portServer.close(error => {
        clearTimeout(deadline);
        if (error) rejectPromise(error);
        else resolvePromise(address.port);
      });
    });
  });
}

async function acquireDisposableIdentity(server) {
  const deadline = Date.now() + remainingTimeout(10_000);
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${server}/v1/identity`, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(1_000, remainingTimeout(1_000))),
      });
      const text = await readBoundedResponse(response, '');
      const value = JSON.parse(text);
      if (
        !response.ok
        || typeof value?.identity !== 'string'
        || !/^[0-9a-f]{64}$/.test(value.identity)
        || typeof value?.token !== 'string'
        || value.token.split('.').length !== 3
      ) throw new Error();
      return Object.freeze({ identity: value.identity, token: value.token });
    } catch {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    }
  }
  fail('Disposable loopback server did not become ready.');
}

function createEphemeralJwt(privateKey, claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = signBytes('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

function serviceClaims(subject, roles, lifetimeSeconds) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  return {
    iss: 'https://auth.warpkeep.com',
    sub: subject,
    aud: ['warpkeep-spacetimedb'],
    token_type: 'spacetime-access',
    roles,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + lifetimeSeconds,
    jti: randomBytes(18).toString('base64url'),
  };
}

function adminClaims() {
  return serviceClaims('service:hermes', ['warpkeep-admin'], 180);
}

function accessRequestClaims(operation) {
  if (operation !== 'status' && operation !== 'submit') {
    fail('Disposable access-request operation was invalid.');
  }
  return {
    ...serviceClaims(
      'service:access-request-resolver',
      ['warpkeep-access-request-resolver'],
      15,
    ),
    request_fid: String(founderFid),
    request_operation: operation,
  };
}

async function readBoundedResponse(response, credential) {
  if (!response.body) return '';
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > maximumResponseBytes)
  ) fail('Loopback response exceeded its fixed bound.');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumResponseBytes) {
      try { await reader.cancel(); } catch { /* The bounded failure is authoritative. */ }
      fail('Loopback response exceeded its fixed bound.');
    }
    chunks.push(value);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  if (credential.length > 0 && text.includes(credential)) {
    fail('Loopback response reflected a disposable local credential.');
  }
  return text;
}

async function callLoopback(
  server,
  procedure,
  credential,
  body,
  expectedStatus,
  expectJson = true,
  timeout = requestTimeoutMilliseconds,
) {
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(server)
    || !/^[a-z0-9_]+$/.test(procedure)
    || typeof credential !== 'string'
    || credential.length < 32
  ) fail('Loopback request coordinates were invalid.');
  let response;
  try {
    response = await fetch(`${server}/v1/database/${database}/call/${procedure}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential}`,
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(remainingTimeout(timeout)),
    });
  } catch {
    fail(`Loopback call ${procedure} failed within its fixed boundary.`);
  }
  const text = await readBoundedResponse(response, credential);
  if (response.status !== expectedStatus) {
    fail(`Loopback call ${procedure} returned ${response.status}; expected ${expectedStatus}.`);
  }
  if (
    expectedStatus === 200
    && expectJson
    && response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      !== 'application/json'
  ) fail(`Loopback call ${procedure} returned an unexpected media type.`);
  return text;
}

async function callReducer(server, reducer, credential, body, expectedStatus, timeout) {
  return callLoopback(
    server,
    reducer,
    credential,
    body,
    expectedStatus,
    false,
    timeout,
  );
}

function readCanonicalUnsigned(value, maximum, label) {
  let parsed;
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    parsed = BigInt(value);
  } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    parsed = BigInt(value);
  } else {
    fail(`Loopback ${label} was not a canonical unsigned integer.`);
  }
  if (parsed > maximum) fail(`Loopback ${label} exceeded its integer bound.`);
  return parsed;
}

function parseOption(value, label) {
  if (value === null) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.length === 1) return readCanonicalUnsigned(value[0], maximumU64, label);
    if (
      value.length === 2
      && (value[0] === 0 || String(value[0]).toLowerCase() === 'some')
    ) return readCanonicalUnsigned(value[1], maximumU64, label);
    if (
      value.length === 2
      && (value[0] === 1 || String(value[0]).toLowerCase() === 'none')
    ) return undefined;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Object.hasOwn(value, 'some') && Object.keys(value).length === 1) {
      return readCanonicalUnsigned(value.some, maximumU64, label);
    }
    if (Object.hasOwn(value, 'none') && Object.keys(value).length === 1) return undefined;
    if (String(value.tag).toLowerCase() === 'some' && Object.hasOwn(value, 'value')) {
      return readCanonicalUnsigned(value.value, maximumU64, label);
    }
    if (String(value.tag).toLowerCase() === 'none') return undefined;
  }
  return readCanonicalUnsigned(value, maximumU64, label);
}

function parseAccessRequestStatus(text) {
  let value;
  try { value = JSON.parse(text); } catch { fail('Access-request status was not JSON.'); }
  if (
    !Array.isArray(value)
    || value.length !== 2
    || !['not_requested', 'requested', 'already_admitted'].includes(value[0])
  ) fail('Access-request status contract was invalid.');
  const requestedAtMicros = parseOption(value[1], 'request timestamp');
  if ((value[0] === 'requested') !== (requestedAtMicros !== undefined)) {
    fail('Access-request status timestamp presence was invalid.');
  }
  return Object.freeze({ status: value[0], requestedAtMicros });
}

function parseAdmissionStatus(text) {
  let value;
  try { value = JSON.parse(text); } catch { fail('Admission status was not JSON.'); }
  if (
    !Array.isArray(value)
    || value.length !== 5
    || !['missing', 'disabled', 'enabled'].includes(value[0])
    || !['not_requested', 'pending', 'resolved'].includes(value[2])
  ) fail('Admission status contract was invalid.');
  const authEpoch = readCanonicalUnsigned(value[1], 0xffff_ffffn, 'auth epoch');
  const requestCycle = parseOption(value[3], 'request cycle');
  const requestedAtMicros = parseOption(value[4], 'request timestamp');
  if ((requestCycle === undefined) !== (requestedAtMicros === undefined)) {
    fail('Admission status returned a partial request tuple.');
  }
  return Object.freeze({
    admissionState: value[0],
    authEpoch,
    requestState: value[2],
    requestCycle,
    requestedAtMicros,
  });
}

function parseFrozenPolicy(text) {
  let value;
  try { value = JSON.parse(text); } catch { fail('Genesis 001 policy receipt was not JSON.'); }
  if (!Array.isArray(value) || value.length !== 7) {
    fail('Genesis 001 policy receipt contract was invalid.');
  }
  return Object.freeze({
    realmId: value[0],
    releaseVersion: value[1],
    playerAccessEnabled: value[2],
    admissionStateMutationsEnabled: value[3],
    accessRequestSubmissionsEnabled: value[4],
    sourceBaselineCommit: value[5],
    freezeReleaseNonce: value[6],
  });
}

function safeJsonUnsigned(value, label) {
  if (typeof value !== 'bigint' || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(`${label} was not safe for the loopback JSON wire.`);
  }
  return Number(value);
}

function firstAdmissionArguments(tuple) {
  return JSON.stringify([
    founderFid,
    'disposable request-CAS founding rehearsal',
    safeJsonUnsigned(tuple.requestCycle, 'First-admission request cycle'),
    safeJsonUnsigned(tuple.requestedAtMicros, 'First-admission request timestamp'),
    'rehearsal.founder',
    { some: 'Rehearsal Founder' },
    'https://profiles.example.com/rehearsal-founder.png',
    { some: 'Disposable loopback-only request-CAS founder' },
    profilePolicyVersion,
  ]);
}

function readmissionArguments(tuple) {
  return JSON.stringify([
    founderFid,
    'disposable request-CAS re-enable rehearsal',
    safeJsonUnsigned(tuple.requestCycle, 'Re-enable request cycle'),
    safeJsonUnsigned(tuple.requestedAtMicros, 'Re-enable request timestamp'),
  ]);
}

async function graphDigest(server, ownerToken) {
  const rows = {};
  for (const [label, query] of Object.entries(graphQueries)) {
    rows[label] = outputDigest(await sql(server, ownerToken, query));
  }
  return outputDigest(JSON.stringify(rows));
}

async function fullStateDigest(server, ownerToken) {
  return outputDigest(JSON.stringify({
    graph: await graphDigest(server, ownerToken),
    allowed: outputDigest(await sql(
      server,
      ownerToken,
      'SELECT * FROM allowed_fid',
    )),
    request: outputDigest(await sql(
      server,
      ownerToken,
      'SELECT * FROM access_request_v1',
    )),
    audits: outputDigest(await sql(server, ownerToken, 'SELECT * FROM admin_audit')),
  }));
}

async function main() {
  const startedAt = Date.now();
  rehearsalStage = 'cli-and-build';
  await verifyCliVersion();
  await buildModule(actualModule);
  await buildModule(inspectionModule);
  const expectedActualArtifactDigest = createHash('sha256')
    .update(await readFile(actualArtifactPath))
    .digest('hex');
  const expectedInspectionArtifactDigest = createHash('sha256')
    .update(await readFile(inspectionArtifactPath))
    .digest('hex');

  const port = await freeLoopbackPort();
  const server = `http://127.0.0.1:${port}`;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(server)) {
    fail('Admission request-CAS rehearsal was not loopback-only.');
  }
  let dataDirectory;
  let serverProcess;
  const cleanupOnSignal = signal => {
    disposableCliCredential = null;
    try {
      if (
        serverProcess !== undefined
        && serverProcess.exitCode === null
        && serverProcess.signalCode === null
      ) serverProcess.kill('SIGKILL');
    } catch { /* Continue to private-directory cleanup. */ }
    try {
      if (typeof dataDirectory === 'string') {
        rmSync(dataDirectory, { recursive: true, force: true });
      }
    } catch { /* The signal exit remains fail-closed. */ }
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  const onSigint = () => cleanupOnSignal('SIGINT');
  const onSigterm = () => cleanupOnSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    dataDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-admission-cas-'));
    const publicKeyPath = join(dataDirectory, 'jwt-public.pem');
    const privateKeyPath = join(dataDirectory, 'jwt-private.pem');
    const generated = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    await writeFile(
      publicKeyPath,
      generated.publicKey,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    await writeFile(
      privateKeyPath,
      generated.privateKey,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    for (const keyPath of [publicKeyPath, privateKeyPath]) {
      const metadata = await stat(keyPath);
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
        fail('Disposable signing-key permissions were invalid.');
      }
    }

    serverProcess = containServerProcessErrors(spawn(command, [
      'start',
      '--listen-addr', `127.0.0.1:${port}`,
      '--in-memory',
      '--data-dir', dataDirectory,
      '--jwt-pub-key-path', publicKeyPath,
      '--jwt-priv-key-path', privateKeyPath,
      '--non-interactive',
    ], {
      cwd: repositoryRoot,
      env: childEnvironment(),
      stdio: 'ignore',
    }));

    const owner = await acquireDisposableIdentity(server);
    await configureDisposableCliCredential(owner.token, dataDirectory);
    await publishArtifact(server, owner.token, actualArtifactPath);
    let activeModule = 'actual';
    const useActualModule = async () => {
      if (activeModule === 'actual') return;
      await publishArtifact(server, owner.token, actualArtifactPath);
      activeModule = 'actual';
    };
    const useInspectionModule = async () => {
      if (activeModule === 'inspection') return;
      await publishArtifact(server, owner.token, inspectionArtifactPath);
      activeModule = 'inspection';
    };
    const adminCredential = () => createEphemeralJwt(generated.privateKey, adminClaims());
    const requestCredential = operation => createEphemeralJwt(
      generated.privateKey,
      accessRequestClaims(operation),
    );
    const inspectState = async () => {
      await useInspectionModule();
      return fullStateDigest(server, owner.token);
    };
    const readFrozenPolicy = async () => {
      await useActualModule();
      return parseFrozenPolicy(await callLoopback(
        server,
        'genesis_001_access_policy_v1',
        adminCredential(),
        '[]',
        200,
      ));
    };
    const readRequestStatus = async () => {
      await useActualModule();
      return parseAccessRequestStatus(await callLoopback(
        server,
        'access_request_get_status_v1',
        requestCredential('status'),
        '[]',
        200,
      ));
    };
    const readAdmissionStatus = async () => {
      await useActualModule();
      return parseAdmissionStatus(await callLoopback(
        server,
        'admin_get_access_request_admission_status_v1',
        adminCredential(),
        JSON.stringify([founderFid]),
        200,
      ));
    };
    const readOnlyState = async () => Object.freeze({
      policy: await readFrozenPolicy(),
      request: await readRequestStatus(),
      admission: await readAdmissionStatus(),
    });

    rehearsalStage = 'frozen-policy-and-read-only-status';
    const readOnlyBaseline = await readOnlyState();
    assert.deepEqual(readOnlyBaseline, {
      policy: expectedFrozenPolicy,
      request: {
        status: 'not_requested',
        requestedAtMicros: undefined,
      },
      admission: {
        admissionState: 'missing',
        authEpoch: 0n,
        requestState: 'not_requested',
        requestCycle: undefined,
        requestedAtMicros: undefined,
      },
    });

    const sealedMutations = Object.freeze([
      {
        name: 'access_request_submit_v1',
        credential: () => requestCredential('submit'),
        body: '[]',
        expectedStatus: 500,
        expectedError: 'ACCESS_REQUESTS_SEALED',
      },
      {
        name: 'admin_allow_fid',
        credential: adminCredential,
        body: JSON.stringify([founderFid, 'sealed rehearsal']),
        expectedStatus: 530,
        expectedError: 'ADMISSIONS_SEALED',
      },
      {
        name: 'admin_admit_founder_v1',
        credential: adminCredential,
        body: JSON.stringify([
          founderFid,
          'sealed rehearsal',
          'rehearsal.founder',
          { some: 'Rehearsal Founder' },
          'https://profiles.example.com/rehearsal-founder.png',
          { some: 'Disposable sealed rehearsal' },
          profilePolicyVersion,
        ]),
        expectedStatus: 530,
        expectedError: 'ADMISSIONS_SEALED',
      },
      {
        name: 'admin_allow_fid_for_access_request_v1',
        credential: adminCredential,
        body: readmissionArguments({ requestCycle: 0n, requestedAtMicros: 1n }),
        expectedStatus: 530,
        expectedError: 'ADMISSIONS_SEALED',
      },
      {
        name: 'admin_admit_founder_for_access_request_v2',
        credential: adminCredential,
        body: firstAdmissionArguments({ requestCycle: 0n, requestedAtMicros: 1n }),
        expectedStatus: 530,
        expectedError: 'ADMISSIONS_SEALED',
      },
      {
        name: 'admin_disable_fid',
        credential: adminCredential,
        body: JSON.stringify([founderFid, 'sealed rehearsal']),
        expectedStatus: 530,
        expectedError: 'ADMISSIONS_SEALED',
      },
      {
        name: 'admin_bump_auth_epoch',
        credential: adminCredential,
        body: JSON.stringify([founderFid, 'sealed rehearsal']),
        expectedStatus: 530,
        expectedError: 'ADMISSIONS_SEALED',
      },
      {
        name: 'admin_reset_access_request_v1',
        credential: adminCredential,
        body: JSON.stringify([
          founderFid,
          false,
          1,
          { some: 0 },
          { some: 1 },
          'sealed rehearsal',
        ]),
        expectedStatus: 530,
        expectedError: 'ADMISSIONS_SEALED',
      },
    ]);
    if (
      sealedMutations.length !== 8
      || new Set(sealedMutations.map(mutation => mutation.name)).size !== 8
    ) fail('Admission suspension mutation surface list was not exact.');

    rehearsalStage = 'reject-all-admission-mutations';
    const baseline = await inspectState();
    let rejectedMutations = 0;
    for (const mutation of sealedMutations) {
      await useActualModule();
      const responseBody = (await callReducer(
        server,
        mutation.name,
        mutation.credential(),
        mutation.body,
        mutation.expectedStatus,
      )).trim();
      const expectedBody = mutation.expectedStatus === 500
        ? `The module instance encountered a fatal error: ${mutation.expectedError}`
        : mutation.expectedError;
      if (responseBody !== expectedBody) {
        fail(`Admission suspension rejection was not exact for ${mutation.name}.`);
      }
      const after = await inspectState();
      if (after !== baseline) {
        fail(`Admission suspension attempt mutated state for ${mutation.name}.`);
      }
      rejectedMutations += 1;
    }
    if (rejectedMutations !== 8) fail('Admission suspension proof was incomplete.');

    rehearsalStage = 'final-frozen-invariants';
    assert.deepEqual(await readOnlyState(), readOnlyBaseline);
    if (
      createHash('sha256').update(await readFile(actualArtifactPath)).digest('hex')
        !== expectedActualArtifactDigest
      || createHash('sha256').update(await readFile(inspectionArtifactPath)).digest('hex')
        !== expectedInspectionArtifactDigest
    ) fail('Rehearsal artifact changed during execution.');

    console.log(
      `admission suspension real-module rehearsal passed in ${Date.now() - startedAt}ms: `
      + '8/8 mutation surfaces rejected; frozen Genesis 001 policy and read-only '
      + 'statuses remained exact; complete admission, founder-graph, audit, and '
      + 'artifact digests held',
    );
  } finally {
    disposableCliCredential = null;
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    if (serverProcess !== undefined && typeof dataDirectory === 'string') {
      await cleanupMigrationProofResources(serverProcess, dataDirectory);
    } else if (typeof dataDirectory === 'string') {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error(error instanceof AdmissionCasRehearsalError
    ? error.message
    : `Admission request-CAS rehearsal failed closed at ${rehearsalStage}.`);
  process.exitCode = 1;
});
