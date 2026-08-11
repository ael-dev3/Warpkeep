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
const inspectionModule = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v16-schema',
);
const actualArtifactPath = join(actualModule, 'dist', 'bundle.js');
const inspectionArtifactPath = join(inspectionModule, 'dist', 'bundle.js');
const command = process.env.SPACETIME_BIN || 'spacetime';
const expectedCliVersion = '2.6.1';
const expectedCliCommit = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const database = 'warpkeep-admission-cas-rehearsal';
const founderFid = 740_101;
const profilePolicyVersion = 'trusted-snapchain-profile-v3';
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

function countFromSql(output) {
  const normalized = output.replace(/\u001b\[[0-9;]*m/g, '').trim();
  const match = normalized.match(/(?:^|\n)\s*(\d+)\s*$/);
  if (!match) fail('Disposable aggregate count response was invalid.');
  return BigInt(match[1]);
}

async function countWhere(server, token, table, predicate = 'true') {
  if (!/^[a-z0-9_]+$/.test(table) || !/^[a-z0-9_ ='._:-]+$/i.test(predicate)) {
    fail('Disposable aggregate coordinates were invalid.');
  }
  return countFromSql(await sql(
    server,
    token,
    `SELECT COUNT(*) AS warpkeep_count FROM ${table} WHERE ${predicate}`,
  ));
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
      `SELECT * FROM allowed_fid WHERE fid = ${founderFid}`,
    )),
    request: outputDigest(await sql(
      server,
      ownerToken,
      `SELECT * FROM access_request_v1 WHERE fid = ${founderFid}`,
    )),
    audits: {
      admit: String(await exactAuditCount(
        server,
        ownerToken,
        'admit_founder_for_access_request_v2',
      )),
      disable: String(await exactAuditCount(server, ownerToken, 'disable_fid')),
      reenable: String(await exactAuditCount(
        server,
        ownerToken,
        'allow_fid_for_access_request_v1',
      )),
    },
  }));
}

async function exactGraphCounts(server, ownerToken, expected) {
  const counts = {
    allowed: await countWhere(server, ownerToken, 'allowed_fid', `fid = ${founderFid}`),
    castle: await countWhere(server, ownerToken, 'castle', `owner_fid = ${founderFid}`),
    claim: await countWhere(
      server,
      ownerToken,
      'castle_slot_claim_v1',
      `owner_fid = ${founderFid}`,
    ),
    profile: await countWhere(server, ownerToken, 'realm_profile_v1', `fid = ${founderFid}`),
    marks: await countWhere(server, ownerToken, 'mark_account_v1', `fid = ${founderFid}`),
    resource: await countWhere(server, ownerToken, 'resource_account_v1', `fid = ${founderFid}`),
    workerSystem: await countWhere(server, ownerToken, 'realm_worker_system_v1'),
    workers: await countWhere(server, ownerToken, 'castle_worker_v1'),
    assignments: await countWhere(server, ownerToken, 'worker_assignment_v1', `fid = ${founderFid}`),
    occupations: await countWhere(server, ownerToken, 'worker_node_occupation_v1'),
    workerReceipts: await countWhere(
      server,
      ownerToken,
      'worker_command_idempotency_v1',
      `fid = ${founderFid}`,
    ),
    workerSchedules: await countWhere(server, ownerToken, 'worker_assignment_schedule_v_1'),
  };
  for (const [label, expectedCount] of Object.entries(expected)) {
    if (counts[label] !== expectedCount) {
      fail(`Exact graph count was invalid for ${label}.`);
    }
  }
}

async function exactAuditCount(server, ownerToken, action) {
  if (!/^[a-z0-9_]+$/.test(action)) fail('Audit action fixture was invalid.');
  return countWhere(
    server,
    ownerToken,
    'admin_audit',
    `action = '${action}'`,
  );
}

async function assertAuditProjection(server, ownerToken, action) {
  if (!/^[a-z0-9_]+$/.test(action)) fail('Audit action fixture was invalid.');
  const projection = (await sql(
    server,
    ownerToken,
    `SELECT action, target_fid, actor_subject FROM admin_audit WHERE action = '${action}'`,
  )).replace(/\u001b\[[0-9;]*m/g, '');
  if (
    !projection.includes(action)
    || !projection.includes(String(founderFid))
    || !projection.includes('service:hermes')
  ) fail('Request-CAS audit projection was not actor/target exact.');
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
    const inspectGraph = async () => {
      await useInspectionModule();
      return graphDigest(server, owner.token);
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
    const submitRequest = async () => {
      await useActualModule();
      return parseAccessRequestStatus(await callLoopback(
        server,
        'access_request_submit_v1',
        requestCredential('submit'),
        '[]',
        200,
      ));
    };

    rehearsalStage = 'seed-and-stage-workers';
    await callReducer(
      server,
      'admin_seed_world',
      adminCredential(),
      '[]',
      200,
      120_000,
    );
    await callReducer(
      server,
      'admin_stage_worker_system_v1',
      adminCredential(),
      '[]',
      200,
    );
    await useInspectionModule();
    await exactGraphCounts(server, owner.token, {
      allowed: 0n,
      castle: 0n,
      claim: 0n,
      profile: 0n,
      marks: 0n,
      resource: 0n,
      workerSystem: 1n,
      workers: 0n,
      assignments: 0n,
      occupations: 0n,
      workerReceipts: 0n,
      workerSchedules: 0n,
    });

    rehearsalStage = 'missing-request';
    const firstSubmitted = await submitRequest();
    if (firstSubmitted.status !== 'requested' || firstSubmitted.requestedAtMicros === undefined) {
      fail('Missing FID did not create its first request.');
    }
    const firstTuple = await readAdmissionStatus();
    assert.deepEqual(firstTuple, {
      admissionState: 'missing',
      authEpoch: 0n,
      requestState: 'pending',
      requestCycle: 0n,
      requestedAtMicros: firstSubmitted.requestedAtMicros,
    });

    rehearsalStage = 'missing-wrong-tuples';
    const firstBaseline = await inspectState();
    await useActualModule();
    await callReducer(
      server,
      'admin_admit_founder_for_access_request_v2',
      adminCredential(),
      firstAdmissionArguments({ ...firstTuple, requestCycle: 1n }),
      530,
    );
    if (await inspectState() !== firstBaseline) {
      fail('Wrong missing-FID request cycle mutated state.');
    }
    await useActualModule();
    await callReducer(
      server,
      'admin_admit_founder_for_access_request_v2',
      adminCredential(),
      firstAdmissionArguments({
        ...firstTuple,
        requestedAtMicros: firstTuple.requestedAtMicros + 1n,
      }),
      530,
    );
    if (await inspectState() !== firstBaseline) {
      fail('Wrong missing-FID request timestamp mutated state.');
    }

    // Replace only the disposable cycle-zero request, then have real module
    // code create the successor timestamp. This models an operator holding an
    // exact tuple after the underlying application was independently replaced.
    rehearsalStage = 'missing-replaced-request';
    await sql(
      server,
      owner.token,
      `DELETE FROM access_request_v1 WHERE fid = ${founderFid}`,
    );
    if (await countWhere(
      server,
      owner.token,
      'access_request_v1',
      `fid = ${founderFid}`,
    ) !== 0n) fail('Disposable request replacement setup failed.');
    const secondSubmitted = await submitRequest();
    if (
      secondSubmitted.status !== 'requested'
      || secondSubmitted.requestedAtMicros === undefined
      || secondSubmitted.requestedAtMicros === firstTuple.requestedAtMicros
    ) fail('Real module did not create a distinct replacement request.');
    const secondTuple = await readAdmissionStatus();
    assert.deepEqual(secondTuple, {
      admissionState: 'missing',
      authEpoch: 0n,
      requestState: 'pending',
      requestCycle: 0n,
      requestedAtMicros: secondSubmitted.requestedAtMicros,
    });
    const replacedBaseline = await inspectState();
    rehearsalStage = 'missing-stale-replaced-tuple';
    await useActualModule();
    await callReducer(
      server,
      'admin_admit_founder_for_access_request_v2',
      adminCredential(),
      firstAdmissionArguments(firstTuple),
      530,
    );
    if (await inspectState() !== replacedBaseline) {
      fail('Stale replaced missing-FID request tuple mutated state.');
    }

    rehearsalStage = 'first-exact-admission';
    await useActualModule();
    await callReducer(
      server,
      'admin_admit_founder_for_access_request_v2',
      adminCredential(),
      firstAdmissionArguments(secondTuple),
      200,
    );
    const admittedStatus = await readAdmissionStatus();
    assert.deepEqual(admittedStatus, {
      admissionState: 'enabled',
      authEpoch: 1n,
      requestState: 'resolved',
      requestCycle: 0n,
      requestedAtMicros: secondTuple.requestedAtMicros,
    });
    await useInspectionModule();
    await exactGraphCounts(server, owner.token, {
      allowed: 1n,
      castle: 1n,
      claim: 1n,
      profile: 1n,
      marks: 1n,
      resource: 1n,
      workerSystem: 1n,
      workers: 4n,
      assignments: 0n,
      occupations: 0n,
      workerReceipts: 0n,
      workerSchedules: 0n,
    });
    if (
      await countWhere(
        server,
        owner.token,
        'allowed_fid',
        `fid = ${founderFid} AND enabled = true AND auth_epoch = 1`,
      ) !== 1n
      || await exactAuditCount(
        server,
        owner.token,
        'admit_founder_for_access_request_v2',
      ) !== 1n
    ) fail('First request-CAS admission did not preserve exact epoch/audit invariants.');
    const foundedGraphDigest = await graphDigest(server, owner.token);
    const admittedBaseline = await fullStateDigest(server, owner.token);
    rehearsalStage = 'first-admission-retry';
    await useActualModule();
    await callReducer(
      server,
      'admin_admit_founder_for_access_request_v2',
      adminCredential(),
      firstAdmissionArguments(secondTuple),
      530,
    );
    if (await inspectState() !== admittedBaseline) {
      fail('First request-CAS admission retry duplicated founder state.');
    }

    rehearsalStage = 'disable-founder';
    await useActualModule();
    await callReducer(
      server,
      'admin_disable_fid',
      adminCredential(),
      JSON.stringify([founderFid, 'disposable request-CAS re-enable setup']),
      200,
    );
    const disabledStatusBeforeRequest = await readAdmissionStatus();
    assert.deepEqual(disabledStatusBeforeRequest, {
      admissionState: 'disabled',
      authEpoch: 1n,
      requestState: 'resolved',
      requestCycle: 0n,
      requestedAtMicros: secondTuple.requestedAtMicros,
    });
    if (await inspectGraph() !== foundedGraphDigest) {
      fail('Disabling a founder changed its permanent gameplay graph.');
    }
    await useInspectionModule();
    if (
      await countWhere(
        server,
        owner.token,
        'allowed_fid',
        `fid = ${founderFid} AND enabled = false AND auth_epoch = 1`,
      ) !== 1n
      || await exactAuditCount(server, owner.token, 'disable_fid') !== 1n
    ) fail('Disable transition changed the auth epoch or duplicated its audit.');

    rehearsalStage = 'disabled-request';
    const disabledSubmitted = await submitRequest();
    if (
      disabledSubmitted.status !== 'requested'
      || disabledSubmitted.requestedAtMicros === undefined
    ) fail('Disabled founder did not create an authEpoch+1 request.');
    const disabledTuple = await readAdmissionStatus();
    assert.deepEqual(disabledTuple, {
      admissionState: 'disabled',
      authEpoch: 1n,
      requestState: 'pending',
      requestCycle: 2n,
      requestedAtMicros: disabledSubmitted.requestedAtMicros,
    });
    if (await inspectGraph() !== foundedGraphDigest) {
      fail('Disabled-founder request changed its permanent gameplay graph.');
    }

    rehearsalStage = 'disabled-wrong-tuples';
    const disabledBaseline = await inspectState();
    await useActualModule();
    await callReducer(
      server,
      'admin_allow_fid_for_access_request_v1',
      adminCredential(),
      readmissionArguments({ ...disabledTuple, requestCycle: 1n }),
      530,
    );
    if (await inspectState() !== disabledBaseline) {
      fail('Wrong disabled-founder request cycle mutated state.');
    }
    await useActualModule();
    await callReducer(
      server,
      'admin_allow_fid_for_access_request_v1',
      adminCredential(),
      readmissionArguments(firstTuple),
      530,
    );
    if (await inspectState() !== disabledBaseline) {
      fail('Stale disabled-founder request tuple mutated state.');
    }
    await useActualModule();
    await callReducer(
      server,
      'admin_allow_fid_for_access_request_v1',
      adminCredential(),
      readmissionArguments({
        ...disabledTuple,
        requestedAtMicros: disabledTuple.requestedAtMicros + 1n,
      }),
      530,
    );
    if (await inspectState() !== disabledBaseline) {
      fail('Wrong disabled-founder request timestamp mutated state.');
    }

    rehearsalStage = 'exact-reenable';
    await useActualModule();
    await callReducer(
      server,
      'admin_allow_fid_for_access_request_v1',
      adminCredential(),
      readmissionArguments(disabledTuple),
      200,
    );
    const reenabledStatus = await readAdmissionStatus();
    assert.deepEqual(reenabledStatus, {
      admissionState: 'enabled',
      authEpoch: 2n,
      requestState: 'resolved',
      requestCycle: 2n,
      requestedAtMicros: disabledTuple.requestedAtMicros,
    });
    if (await inspectGraph() !== foundedGraphDigest) {
      fail('Request-CAS re-enable changed the permanent gameplay graph.');
    }
    await useInspectionModule();
    if (
      await countWhere(
        server,
        owner.token,
        'allowed_fid',
        `fid = ${founderFid} AND enabled = true AND auth_epoch = 2`,
      ) !== 1n
      || await exactAuditCount(
        server,
        owner.token,
        'allow_fid_for_access_request_v1',
      ) !== 1n
      || await exactAuditCount(
        server,
        owner.token,
        'admit_founder_for_access_request_v2',
      ) !== 1n
      || await exactAuditCount(server, owner.token, 'disable_fid') !== 1n
    ) fail('Re-enable transition did not preserve exact epoch/audit invariants.');
    await assertAuditProjection(
      server,
      owner.token,
      'admit_founder_for_access_request_v2',
    );
    await assertAuditProjection(
      server,
      owner.token,
      'allow_fid_for_access_request_v1',
    );
    await assertAuditProjection(server, owner.token, 'disable_fid');

    rehearsalStage = 'reenable-retry-and-final-invariants';
    const reenabledBaseline = await fullStateDigest(server, owner.token);
    await useActualModule();
    await callReducer(
      server,
      'admin_allow_fid_for_access_request_v1',
      adminCredential(),
      readmissionArguments(disabledTuple),
      530,
    );
    if (await inspectState() !== reenabledBaseline) {
      fail('Request-CAS re-enable retry duplicated or changed state.');
    }
    await useInspectionModule();
    await exactGraphCounts(server, owner.token, {
      allowed: 1n,
      castle: 1n,
      claim: 1n,
      profile: 1n,
      marks: 1n,
      resource: 1n,
      workerSystem: 1n,
      workers: 4n,
      assignments: 0n,
      occupations: 0n,
      workerReceipts: 0n,
      workerSchedules: 0n,
    });
    if (
      createHash('sha256').update(await readFile(actualArtifactPath)).digest('hex')
        !== expectedActualArtifactDigest
      || createHash('sha256').update(await readFile(inspectionArtifactPath)).digest('hex')
        !== expectedInspectionArtifactDigest
    ) fail('Rehearsal artifact changed during execution.');

    console.log(
      `admission request-CAS real-module rehearsal passed in ${Date.now() - startedAt}ms: `
      + 'missing cycle-0 request admitted once after wrong/replaced tuples failed; '
      + 'disabled authEpoch+1 request re-enabled once; exact founder, castle, claim, '
      + 'resource, four-worker, audit, and auth-epoch invariants held',
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
