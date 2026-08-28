import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_PREEXISTING_SECRET_BINDING_NAMES,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION,
} from './auth-bridge-notification-prepared-deploy-adapter.mjs';

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_CLOUDFLARE_API_ORIGIN =
  'https://api.cloudflare.com';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_SOURCE_DIGEST_PROFILE =
  'warpkeep-auth-bridge-wrangler-multipart-v1';

const API_PREFIX = '/client/v4';
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_BYTES = 64 * 1024;
const MAX_VERSION_PAGES = 20;
const RECOVERY_SETTLE_ATTEMPTS = 5;
const RECOVERY_SETTLE_MILLISECONDS = 1_000;
const ACCOUNT_ID = /^[a-f0-9]{32}$/u;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const VERSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const CLOUDFLARE_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/u;
const SECRET_TOKEN = /^[A-Za-z0-9._~+\-/=]{20,4096}$/u;
const POSITIVE_FID = /^[1-9][0-9]{0,15}$/u;
const FORBIDDEN_AMBIENT_FILES = Object.freeze([
  '.env',
  '.env.local',
  '.dev.vars',
  '.dev.vars.production',
  join('.wrangler', 'deploy', 'config.json'),
]);
const ALLOWED_MODULE_CONTENT_TYPES = new Set([
  'application/javascript',
  'application/javascript+module',
  'application/octet-stream',
  'application/source-map',
  'application/wasm',
  'text/javascript',
  'text/javascript+module',
  'text/plain',
  'text/x-python',
  'text/x-python-requirement',
]);
const REVIEWED_V5_DURABLE_OBJECT_BINDINGS = Object.freeze([
  Object.freeze({
    name: 'ADMISSION_NOTIFICATIONS',
    className: 'AdmissionNotification',
    namespaceId: '01d53045d07a4f79ab21646de395d82c',
  }),
  Object.freeze({
    name: 'AUTH_RATE_LIMITER',
    className: 'AuthRateLimiter',
    namespaceId: 'd800d603256f4a0f9907ba0b9267bc89',
  }),
  Object.freeze({
    name: 'CHALLENGE_REPLAY_GUARD',
    className: 'ChallengeReplayGuard',
    namespaceId: 'bbda3461bd4c4caf91478705d65374fc',
  }),
  Object.freeze({
    name: 'QA_CHALLENGE_REPLAY_GUARD',
    className: 'QaChallengeReplayGuard',
    namespaceId: '28d55581e3124399b8cfbc2bd4019bef',
  }),
  Object.freeze({
    name: 'SESSION_FAMILIES',
    className: 'SessionFamily',
    namespaceId: 'b4525a7a374743deb3666471fe2ae06c',
  }),
]);
const REVIEWED_V5_API_NAMED_HANDLER_NAMES = Object.freeze([
  'AdmissionNotification',
  'AuthRateLimiter',
  'ChallengeReplayGuard',
  'DurableObjectAdmissionNotificationStore',
  'DurableObjectChallengeStore',
  'DurableObjectQaObserverChallengeStore',
  'DurableObjectSessionFamilyStore',
  'MemoryChallengeStore',
  'MemoryQaObserverChallengeStore',
  'MemorySessionFamilyStore',
  'MiniAppWebhookInvalidError',
  'MiniAppWebhookVerifierUnavailableError',
  'QaChallengeReplayGuard',
  'SessionFamily',
  'SpacetimeHttpAccessRequestResolver',
  'SpacetimeHttpAuthEpochResolver',
  'SpacetimeHttpQaObserverResolver',
  'admissionNotificationDeliveryContractDigest',
  'admissionNotificationDeliveryContractVector',
  'createAuthBridge',
  'createMiniAppWebhookVerifier',
  'serializeAdmissionNotificationDeliveryContract',
]);

export class AuthBridgeNotificationPreparedCloudflareRuntimeError extends Error {
  constructor(code, deploymentMayHaveChanged = false) {
    super(code);
    this.name = 'AuthBridgeNotificationPreparedCloudflareRuntimeError';
    this.code = code;
    this.deploymentMayHaveChanged = deploymentMayHaveChanged;
  }
}

function fail(code, deploymentMayHaveChanged = false) {
  throw new AuthBridgeNotificationPreparedCloudflareRuntimeError(
    code,
    deploymentMayHaveChanged,
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(keys);
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactEmptyApiMessages(value) {
  return value === null || (Array.isArray(value) && value.length === 0);
}

function containsForbiddenResponseValue(value, forbidden) {
  const pending = [value];
  let inspected = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    inspected += 1;
    if (inspected > MAX_JSON_BYTES) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_JSON_INVALID');
    }
    if (typeof current === 'string') {
      if (current.includes(forbidden)) return true;
      continue;
    }
    if (
      typeof current === 'number'
      && Number.isSafeInteger(current)
      && String(current) === forbidden
    ) return true;
    if (current === null || typeof current !== 'object') continue;
    for (const [key, nested] of Object.entries(current)) {
      if (key.includes(forbidden)) return true;
      pending.push(nested);
    }
  }
  return false;
}

function defaultSettleDelay(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function cloudflareUtc(value, code) {
  if (
    typeof value !== 'string'
    || !CLOUDFLARE_UTC.test(value)
    || Number.isNaN(Date.parse(value))
  ) fail(code);
  return new Date(Date.parse(value)).toISOString();
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function canonicalPath(path, kind, code) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(code);
  let canonical;
  let metadata;
  try {
    canonical = realpathSync(resolve(path));
    metadata = lstatSync(resolve(path));
  } catch {
    fail(code);
  }
  if (
    canonical !== resolve(path)
    || metadata.isSymbolicLink()
    || (kind === 'directory' && !metadata.isDirectory())
    || (kind === 'file' && !metadata.isFile())
  ) fail(code);
  return canonical;
}

function assertContract(contract) {
  if (
    !isRecord(contract)
    || contract.schemaVersion !== 1
    || contract.profile !== AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE
    || contract.wranglerVersion !== AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION
    || !ACCOUNT_ID.test(contract.accountId ?? '')
    || !ACCOUNT_ID.test(contract.zoneId ?? '')
    || contract.workerName !== 'warpkeep-auth-bridge'
    || contract.entrypoint !== 'src/index.ts'
    || contract.workersDev !== false
    || !exactJson(contract.route, {
      pattern: 'auth.warpkeep.com',
      customDomain: true,
    })
    || contract.predecessorSourceCommit
      !== AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT
    || !SOURCE_COMMIT.test(contract.sourceCommit ?? '')
    || !SHA256_HEX.test(contract.sourceDigest ?? '')
    || contract.versionTag !== `notification-prepared-${contract.sourceCommit}`
    || contract.versionMessage
      !== `Warpkeep notification preparation ${contract.sourceCommit}`
    || contract.compatibilityDate !== '2026-07-11'
    || !exactJson(contract.compatibilityFlags, ['nodejs_compat'])
    || !isRecord(contract.variables)
    || !exactJson(contract.secretBindingNames, [
      ...AUTH_BRIDGE_NOTIFICATION_PREPARED_PREEXISTING_SECRET_BINDING_NAMES
        .slice(0, 4),
      AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING,
      ...AUTH_BRIDGE_NOTIFICATION_PREPARED_PREEXISTING_SECRET_BINDING_NAMES
        .slice(4),
    ])
    || !Array.isArray(contract.durableObjectBindings)
    || !Array.isArray(contract.migrations)
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_CONTRACT_INVALID');
  return contract;
}

function canonicalModule(module) {
  const field = module?.field ?? module?.name;
  if (
    !isRecord(module)
    || typeof field !== 'string'
    || field.length < 1
    || field.length > 512
    || field.includes('\0')
    || typeof module.name !== 'string'
    || module.name.length < 1
    || module.name.length > 512
    || module.name.includes('\0')
    || typeof module.contentType !== 'string'
    || !ALLOWED_MODULE_CONTENT_TYPES.has(module.contentType)
    || !Buffer.isBuffer(module.bytes)
    || module.bytes.byteLength > MAX_MULTIPART_BYTES
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MODULE_INVALID');
  return Object.freeze({
    field,
    name: module.name,
    contentType: module.contentType,
    size: module.bytes.byteLength,
    sha256: createHash('sha256').update(module.bytes).digest('hex'),
  });
}

/** Multipart boundaries are excluded, while every named byte-bearing part is bound. */
export function authBridgeNotificationPreparedSourceDigest(modules) {
  if (!Array.isArray(modules) || modules.length < 1 || modules.length > 256) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MODULE_INVALID');
  }
  const manifest = modules.map(canonicalModule).sort((left, right) => {
    const byField = left.field.localeCompare(right.field, 'en');
    if (byField !== 0) return byField;
    const byName = left.name.localeCompare(right.name, 'en');
    return byName === 0
      ? left.contentType.localeCompare(right.contentType, 'en')
      : byName;
  });
  for (let index = 1; index < manifest.length; index += 1) {
    if (
      manifest[index - 1].name === manifest[index].name
      && manifest[index - 1].field === manifest[index].field
      && manifest[index - 1].contentType === manifest[index].contentType
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MODULE_DUPLICATE');
  }
  const hash = createHash('sha256');
  hash.update(`${AUTH_BRIDGE_NOTIFICATION_PREPARED_SOURCE_DIGEST_PROFILE}\n`);
  for (const item of manifest) {
    hash.update(`${JSON.stringify(item)}\n`);
  }
  return hash.digest('hex');
}

function quotedDisposition(value) {
  const match = /(?:^|;)\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?$/u.exec(value);
  if (match === null) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
  return Object.freeze({ field: match[1], filename: match[2] });
}

/** Strict parser for Wrangler/Cloudflare multipart; no boundary-dependent digest. */
function parseAuthBridgeNotificationPreparedMultipartParts(body, contentType) {
  if (
    !Buffer.isBuffer(body)
    || body.byteLength < 1
    || body.byteLength > MAX_MULTIPART_BYTES
    || typeof contentType !== 'string'
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
  const boundaryMatch = /^multipart\/form-data;\s*boundary=(?:"([!#$%&'*+.^_`|~0-9A-Za-z-]{1,70})"|([!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}))$/u
    .exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (boundary === undefined) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
  }
  const delimiter = Buffer.from(`--${boundary}`, 'ascii');
  const headerSeparator = Buffer.from('\r\n\r\n', 'ascii');
  const modules = [];
  let offset = 0;
  if (!body.subarray(0, delimiter.length).equals(delimiter)) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
  }
  while (true) {
    offset += delimiter.length;
    if (body.subarray(offset, offset + 4).equals(Buffer.from('--\r\n'))) {
      offset += 4;
      if (offset !== body.byteLength) {
        fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
      }
      break;
    }
    if (!body.subarray(offset, offset + 2).equals(Buffer.from('\r\n'))) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
    }
    offset += 2;
    const headerEnd = body.indexOf(headerSeparator, offset);
    if (headerEnd < 0 || headerEnd - offset > 8 * 1024) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
    }
    const rawHeaders = body.subarray(offset, headerEnd).toString('latin1');
    const headers = new Map();
    for (const line of rawHeaders.split('\r\n')) {
      const split = line.indexOf(':');
      if (split < 1) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
      const name = line.slice(0, split).toLowerCase();
      const value = line.slice(split + 1).trim();
      if (headers.has(name)) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
      headers.set(name, value);
    }
    if (!headers.has('content-disposition')) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
    }
    const disposition = quotedDisposition(headers.get('content-disposition'));
    let type;
    if (
      headers.size === 1
      && disposition.field === 'metadata'
      && disposition.filename === undefined
    ) type = 'application/json';
    else if (headers.size === 2 && headers.has('content-type')) {
      type = headers.get('content-type').toLowerCase();
    } else fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
    offset = headerEnd + headerSeparator.length;
    const next = body.indexOf(Buffer.from(`\r\n--${boundary}`, 'ascii'), offset);
    if (next < 0) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
    const byteStart = offset;
    const byteEnd = next;
    const bytes = Buffer.from(body.subarray(byteStart, byteEnd));
    modules.push(Object.freeze({
      name: disposition.filename ?? disposition.field,
      field: disposition.field,
      contentType: type,
      bytes,
      byteStart,
      byteEnd,
    }));
    offset = next + 2;
    if (modules.length > 256) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
  }
  return Object.freeze(modules);
}

export function parseAuthBridgeNotificationPreparedMultipart(body, contentType) {
  return Object.freeze(parseAuthBridgeNotificationPreparedMultipartParts(
    body,
    contentType,
  ).map(({
    name,
    field,
    contentType: partContentType,
    bytes,
  }) => Object.freeze({
    name,
    field,
    contentType: partContentType,
    bytes,
  })));
}

export function inspectAuthBridgeNotificationPreparedMultipart(body, contentType) {
  const parts = parseAuthBridgeNotificationPreparedMultipart(body, contentType);
  const metadataParts = parts.filter(part => part.field === 'metadata');
  if (metadataParts.length !== 1 || metadataParts[0].contentType !== 'application/json') {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_INVALID');
  }
  let metadata;
  try { metadata = JSON.parse(metadataParts[0].bytes.toString('utf8')); } catch {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_INVALID');
  }
  if (!isRecord(metadata) || typeof metadata.main_module !== 'string') {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_INVALID');
  }
  const modules = parts.filter(part => part.field !== 'metadata');
  if (!modules.some(module => module.name === metadata.main_module)) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_INVALID');
  }
  return Object.freeze({
    metadata,
    sourceDigest: authBridgeNotificationPreparedSourceDigest(modules),
    modules,
  });
}

function contentTypeFromBody(body) {
  const lineEnd = body.indexOf(Buffer.from('\r\n'));
  if (lineEnd < 3 || lineEnd > 74) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
  }
  const first = body.subarray(0, lineEnd).toString('ascii');
  if (!/^--[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}$/u.test(first)) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
  }
  return `multipart/form-data; boundary=${first.slice(2)}`;
}

function exactMultipartMetadata(
  metadata,
  contract,
  candidate,
) {
  const candidateExpected = candidate !== undefined;
  if (
    !isRecord(metadata)
    || typeof metadata.main_module !== 'string'
    || !Array.isArray(metadata.bindings)
    || metadata.compatibility_date !== contract.compatibilityDate
    || !exactJson(metadata.compatibility_flags, contract.compatibilityFlags)
    || !exactJson(metadata.annotations, {
      'workers/message': contract.versionMessage,
      'workers/tag': contract.versionTag,
    })
    || !exactJson(metadata.keep_bindings, ['secret_text', 'secret_key'])
    || metadata.migrations !== undefined
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_MISMATCH');
  const projected = metadata.bindings.map(binding => {
    if (binding?.type === 'secret_text') {
      if (
        !candidateExpected
        || !isRecord(binding)
        || Object.keys(binding).sort().join(',') !== 'name,text,type'
        || binding.name
          !== AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING
        || binding.text !== candidate.playerCanaryOwnerFid
      ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_MISMATCH');
      return Object.freeze({
        name: binding.name,
        type: binding.type,
        text: binding.text,
      });
    }
    return bindingProjection(binding);
  })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const expected = [
    ...Object.entries(contract.variables).map(([name, text]) => ({
      name,
      type: 'plain_text',
      text,
    })),
    ...contract.durableObjectBindings.map(binding => ({
      name: binding.name,
      type: 'durable_object_namespace',
      className: binding.className,
    })),
    ...(candidateExpected ? [{
      name: AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING,
      type: 'secret_text',
      text: candidate.playerCanaryOwnerFid,
    }] : []),
  ].sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (!exactJson(projected, expected)) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_MISMATCH');
  }
}

/** Test seam for the predecessor-attested keep-bindings projection. */
export function attestAuthBridgeNotificationPreparedCandidateMultipartMetadata({
  metadata,
  contract,
  playerCanaryOwnerFid,
} = {}) {
  if (
    !POSITIVE_FID.test(playerCanaryOwnerFid ?? '')
    || BigInt(playerCanaryOwnerFid) > BigInt(Number.MAX_SAFE_INTEGER)
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_MISMATCH');
  exactMultipartMetadata(metadata, assertContract(contract), Object.freeze({
    playerCanaryOwnerFid,
  }));
  return true;
}

function multipartWithMetadata(body, contentType, metadata) {
  const parts = parseAuthBridgeNotificationPreparedMultipartParts(body, contentType);
  const matches = parts.filter(part => part.field === 'metadata');
  if (matches.length !== 1) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_INVALID');
  }
  const replacement = Buffer.from(JSON.stringify(metadata), 'utf8');
  const match = matches[0];
  const rewritten = Buffer.concat([
    body.subarray(0, match.byteStart),
    replacement,
    body.subarray(match.byteEnd),
  ]);
  replacement.fill(0);
  return rewritten;
}

function assertNoAmbientFiles(serviceRoot) {
  for (const name of FORBIDDEN_AMBIENT_FILES) {
    if (existsSync(join(serviceRoot, name))) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_AMBIENT_FILE_FORBIDDEN');
    }
  }
}

function exactWrangler({ serviceRoot, wranglerEntrypoint }) {
  if (typeof wranglerEntrypoint !== 'string' || !isAbsolute(wranglerEntrypoint)) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID');
  }
  let path;
  try {
    path = realpathSync(resolve(wranglerEntrypoint));
    const status = lstatSync(path);
    if (status.isSymbolicLink() || !status.isFile()) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID');
    }
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedCloudflareRuntimeError) {
      throw error;
    }
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID');
  }
  const nodeModules = canonicalPath(
    join(serviceRoot, 'node_modules'),
    'directory',
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID',
  );
  const pnpmStore = canonicalPath(
    join(nodeModules, '.pnpm'),
    'directory',
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID',
  );
  const packageRoot = canonicalPath(
    resolve(dirname(path), '..'),
    'directory',
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID',
  );
  if (
    !inside(pnpmStore, packageRoot)
    || !relative(pnpmStore, packageRoot).startsWith(
      `wrangler@${AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION}_`,
    )
  ) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID');
  }
  let packageMetadata;
  let projectMetadata;
  let lockfile;
  try {
    packageMetadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    projectMetadata = JSON.parse(readFileSync(join(serviceRoot, 'package.json'), 'utf8'));
    lockfile = readFileSync(join(serviceRoot, 'pnpm-lock.yaml'), 'utf8');
  } catch {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID');
  }
  if (
    packageMetadata.name !== 'wrangler'
    || packageMetadata.version !== AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION
    || projectMetadata.devDependencies?.wrangler
      !== AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION
    || !new RegExp(
      `\\n\\s{6}wrangler:\\n\\s{8}specifier: ${AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION.replaceAll('.', '\\.')}\\n\\s{8}version: ${AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION.replaceAll('.', '\\.')}(?:\\(|\\n)`,
      'u',
    ).test(`\n${lockfile}`)
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID');
  return path;
}

function exactNodeExecutable(nodeExecutable) {
  const path = canonicalPath(
    nodeExecutable,
    'file',
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_NODE_INVALID',
  );
  const metadata = statSync(path);
  if ((metadata.mode & 0o111) === 0) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_NODE_INVALID');
  }
  return path;
}

function wranglerArguments(contract, output, dryRun) {
  const args = [
    'versions',
    'upload',
    contract.entrypoint,
    '--config',
    'wrangler.toml',
    '--name',
    contract.workerName,
    '--tag',
    contract.versionTag,
    '--message',
    contract.versionMessage,
    '--outfile',
    output,
    '--strict',
  ];
  if (dryRun) args.push('--dry-run');
  for (const [name, value] of Object.entries(contract.variables).sort()) {
    args.push('--var', `${name}:${value}`);
  }
  return Object.freeze(args);
}

async function defaultCommandRunner({ executable, args, cwd, env }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    const collect = name => chunk => {
      sizes[name] += chunk.byteLength;
      if (sizes[name] > MAX_COMMAND_BYTES) child.kill('SIGKILL');
      else chunks[name].push(Buffer.from(chunk));
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.once('error', error => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise(Object.freeze({
        code,
        signal,
        stdout: Buffer.concat(chunks.stdout),
        stderr: Buffer.concat(chunks.stderr),
      }));
    });
  });
}

function fixedChildEnvironment({ accountId, privateHome, outputPath }) {
  return Object.freeze({
    CI: 'true',
    CLOUDFLARE_ACCOUNT_ID: accountId,
    HOME: privateHome,
    LANG: 'C',
    LC_ALL: 'C',
    LOGNAME: 'warpkeep-deploy',
    NO_COLOR: '1',
    TZ: 'UTC',
    USER: 'warpkeep-deploy',
    WRANGLER_CI_GENERATE_PREVIEW_ALIAS: 'false',
    WRANGLER_LOG: 'error',
    WRANGLER_LOG_SANITIZE: 'true',
    WRANGLER_OUTPUT_FILE_PATH: outputPath,
    WRANGLER_SEND_METRICS: 'false',
  });
}

/** Builds the exact upload body without providing Wrangler any credential. */
export async function buildAuthBridgeNotificationPreparedWranglerMultipart({
  contract: contractInput,
  repositoryRoot,
  serviceRoot,
  nodeExecutable,
  wranglerEntrypoint,
  commandRunner = defaultCommandRunner,
} = {}) {
  const contract = assertContract(contractInput);
  const repository = canonicalPath(
    repositoryRoot,
    'directory',
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_REPOSITORY_INVALID',
  );
  const service = canonicalPath(
    serviceRoot,
    'directory',
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_SERVICE_INVALID',
  );
  if (!inside(repository, service) || basename(service) !== 'auth-bridge') {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_SERVICE_INVALID');
  }
  assertNoAmbientFiles(service);
  if (typeof commandRunner !== 'function') {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RUNTIME_INVALID');
  }
  const privateRoot = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-cf-bundle-'));
  chmodSync(privateRoot, 0o700);
  const output = join(privateRoot, 'worker.multipart');
  const resultOutput = join(privateRoot, 'wrangler-output.ndjson');
  try {
    const node = exactNodeExecutable(nodeExecutable);
    const wrangler = exactWrangler({ serviceRoot: service, wranglerEntrypoint });
    const result = await commandRunner({
      executable: node,
      args: Object.freeze([
        wrangler,
        ...wranglerArguments(contract, output, true),
      ]),
      cwd: service,
      env: fixedChildEnvironment({
        accountId: contract.accountId,
        privateHome: privateRoot,
        outputPath: resultOutput,
      }),
    });
    if (
      !isRecord(result)
      || result.code !== 0
      || result.signal !== null
      || !Buffer.isBuffer(result.stdout)
      || !Buffer.isBuffer(result.stderr)
      || result.stdout.byteLength > MAX_COMMAND_BYTES
      || result.stderr.byteLength > MAX_COMMAND_BYTES
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_FAILED');
    const body = readFileSync(output);
    const contentType = contentTypeFromBody(body);
    const inspected = inspectAuthBridgeNotificationPreparedMultipart(body, contentType);
    exactMultipartMetadata(inspected.metadata, contract);
    return Object.freeze({
      body,
      contentType,
      metadata: inspected.metadata,
      sourceDigest: inspected.sourceDigest,
    });
  } finally {
    rmSync(privateRoot, { recursive: true, force: true });
  }
}

async function boundedBody(response, maximum) {
  const length = response.headers.get('content-length');
  if (
    length !== null
    && (!/^[0-9]+$/u.test(length) || Number(length) > maximum)
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_TOO_LARGE');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maximum) {
    body.fill(0);
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_TOO_LARGE');
  }
  return body;
}

function validateResponse(response) {
  if (
    !(response instanceof Response)
    || response.redirected
    || new URL(response.url).origin !== AUTH_BRIDGE_NOTIFICATION_PREPARED_CLOUDFLARE_API_ORIGIN
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_INVALID');
}

function validatedForbiddenResponseSubstring(value) {
  if (
    value !== undefined
    && (
      typeof value !== 'string'
      || value.length < 1
      || value.length > 512
      || value.includes('\0')
    )
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_REQUEST_INVALID');
  return value;
}

async function sanitizedMutationRejectionCode(
  response,
  forbiddenResponseSubstring,
) {
  let body;
  try {
    body = await boundedBody(response, 64 * 1024);
    if (forbiddenResponseSubstring !== undefined) {
      const forbiddenBytes = Buffer.from(forbiddenResponseSubstring, 'utf8');
      try {
        if (body.includes(forbiddenBytes)) return 'UNAVAILABLE';
      } finally {
        forbiddenBytes.fill(0);
      }
    }
    const envelope = JSON.parse(body.toString('utf8'));
    const codes = Array.isArray(envelope?.errors)
      ? [...new Set(envelope.errors.map(error => error?.code).filter(code => (
        Number.isSafeInteger(code) && code >= 1_000 && code <= 999_999_999
      )))].sort((left, right) => left - right)
      : [];
    return codes.length === 1 ? String(codes[0]) : 'UNAVAILABLE';
  } catch {
    return 'UNAVAILABLE';
  } finally {
    body?.fill(0);
  }
}

function createApi({ apiToken, fetchImpl, requestTimeoutMilliseconds }) {
  if (!SECRET_TOKEN.test(apiToken ?? '') || typeof fetchImpl !== 'function') {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_CREDENTIALS_INVALID');
  }
  const request = async (path, options = {}) => {
    if (
      typeof path !== 'string'
      || !path.startsWith(`${API_PREFIX}/`)
      || path.includes('\\')
      || path.includes('..')
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_REQUEST_INVALID');
    const forbiddenResponseSubstring = validatedForbiddenResponseSubstring(
      options.forbiddenResponseSubstring,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
    let response;
    try {
      response = await fetchImpl(
        `${AUTH_BRIDGE_NOTIFICATION_PREPARED_CLOUDFLARE_API_ORIGIN}${path}`,
        {
          method: options.method ?? 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${apiToken}`,
            ...options.headers,
          },
          body: options.body,
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        },
      );
    } catch {
      fail(
        options.mutation
          ? 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_OUTCOME_AMBIGUOUS'
          : 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_REQUEST_FAILED',
        options.mutation === true,
      );
    } finally {
      clearTimeout(timer);
    }
    validateResponse(response);
    if (response.status !== 200) {
      if (
        options.mutation === true
        && response.status >= 400
        && response.status <= 499
      ) {
        const providerCode = await sanitizedMutationRejectionCode(
          response,
          forbiddenResponseSubstring,
        );
        fail(
          `AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_${response.status}_CODE_${providerCode}`,
        );
      }
      fail(
        options.mutation
          ? 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_OUTCOME_AMBIGUOUS'
          : 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_STATUS_INVALID',
        options.mutation === true,
      );
    }
    return response;
  };
  const json = async (path, options = {}) => {
    const response = await request(path, options);
    if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
      response.headers.get('content-type') ?? '',
    )) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_TYPE_INVALID');
    const maximumBytes = options.maximumBytes ?? MAX_JSON_BYTES;
    if (
      !Number.isSafeInteger(maximumBytes)
      || maximumBytes < 1
      || maximumBytes > 2 * MAX_MULTIPART_BYTES
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_REQUEST_INVALID');
    const forbiddenResponseSubstring = validatedForbiddenResponseSubstring(
      options.forbiddenResponseSubstring,
    );
    const body = await boundedBody(response, maximumBytes);
    let containsForbiddenBytes = false;
    if (forbiddenResponseSubstring !== undefined) {
      const forbiddenBytes = Buffer.from(forbiddenResponseSubstring, 'utf8');
      try {
        containsForbiddenBytes = body.includes(forbiddenBytes);
      } finally {
        forbiddenBytes.fill(0);
      }
    }
    if (containsForbiddenBytes) {
      body.fill(0);
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID');
    }
    let envelope;
    try { envelope = JSON.parse(body.toString('utf8')); } catch {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_JSON_INVALID');
    } finally {
      body.fill(0);
    }
    if (
      !isRecord(envelope)
      || envelope.success !== true
      || !exactEmptyApiMessages(envelope.errors)
      || !exactEmptyApiMessages(envelope.messages)
      || !Object.hasOwn(envelope, 'result')
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_ENVELOPE_INVALID');
    if (
      forbiddenResponseSubstring !== undefined
      && containsForbiddenResponseValue(envelope, forbiddenResponseSubstring)
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID');
    return Object.freeze({
      result: envelope.result,
      resultInfo: envelope.result_info,
    });
  };
  const multipart = async path => {
    const response = await request(path, { headers: { accept: '*/*' } });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('multipart/form-data;')) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RESPONSE_TYPE_INVALID');
    }
    const body = await boundedBody(response, MAX_MULTIPART_BYTES);
    const entrypoint = response.headers.get('cf-entrypoint');
    if (
      typeof entrypoint !== 'string'
      || entrypoint.length < 1
      || entrypoint.length > 512
      || entrypoint.includes('\0')
    ) {
      body.fill(0);
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_SOURCE_UNVERIFIED');
    }
    return Object.freeze({ body, contentType, entrypoint });
  };
  return Object.freeze({ request, json, multipart });
}

function exactVersionNumber(value, expectedVersionId, code) {
  if (
    !isRecord(value)
    || value.id !== expectedVersionId
    || !VERSION_ID.test(value.id ?? '')
    || !Number.isSafeInteger(value.number)
    || value.number < 1
  ) fail(code);
  return value.number;
}

function expectedSuccessorVersionNumber(predecessorVersionNumber, code) {
  if (
    !Number.isSafeInteger(predecessorVersionNumber)
    || predecessorVersionNumber < 1
    || predecessorVersionNumber >= Number.MAX_SAFE_INTEGER
  ) fail(code);
  return predecessorVersionNumber + 1;
}

function exactVersionUploadResult(result, predecessorVersionNumber) {
  const allowedKeys = new Set([
    'exports_reconciliation',
    'id',
    'metadata',
    'number',
    'resources',
    'startup_time_ms',
  ]);
  if (
    !isRecord(result)
    || !VERSION_ID.test(result.id ?? '')
    || Object.keys(result).some(key => !allowedKeys.has(key))
    || (result.resources !== undefined && !isRecord(result.resources))
    || (result.exports_reconciliation !== undefined
      && !isRecord(result.exports_reconciliation))
    || (result.metadata !== undefined && !isRecord(result.metadata))
    || (result.startup_time_ms !== undefined
      && (!Number.isFinite(result.startup_time_ms)
        || result.startup_time_ms < 0))
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID');
  if (
    exactVersionNumber(
      result,
      result.id,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID',
    ) !== expectedSuccessorVersionNumber(
      predecessorVersionNumber,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID',
    )
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH');
  return result.id;
}

function bindingProjection(binding) {
  if (!isRecord(binding) || typeof binding.name !== 'string') {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_INVALID');
  }
  if (binding.type === 'plain_text' && typeof binding.text === 'string') {
    return Object.freeze({ name: binding.name, type: binding.type, text: binding.text });
  }
  if (
    binding.type === 'secret_text'
    && Object.keys(binding).sort().join(',') === 'name,type'
  ) {
    return Object.freeze({ name: binding.name, type: binding.type });
  }
  if (
    binding.type === 'durable_object_namespace'
    && typeof binding.class_name === 'string'
    && (binding.script_name === undefined || binding.script_name === null)
  ) return Object.freeze({
    name: binding.name,
    type: binding.type,
    className: binding.class_name,
  });
  fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_BINDING_UNEXPECTED');
}

function detailBindingProjection(binding) {
  if (!isRecord(binding) || typeof binding.name !== 'string') {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_INVALID');
  }
  const keys = Object.keys(binding).sort().join(',');
  if (
    binding.type === 'plain_text'
    && keys === 'name,text,type'
    && typeof binding.text === 'string'
  ) return Object.freeze({
    name: binding.name,
    type: binding.type,
    text: binding.text,
  });
  if (binding.type === 'secret_text' && keys === 'name,type') {
    return Object.freeze({ name: binding.name, type: binding.type });
  }
  if (
    binding.type === 'durable_object_namespace'
    && keys === 'class_name,name,namespace_id,type'
    && typeof binding.class_name === 'string'
    && ACCOUNT_ID.test(binding.namespace_id ?? '')
  ) return Object.freeze({
    name: binding.name,
    type: binding.type,
    className: binding.class_name,
    namespaceId: binding.namespace_id,
  });
  fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_BINDING_UNEXPECTED');
}

function exactApiScriptAttestation(script, code) {
  if (
    !isRecord(script)
    || Object.keys(script).sort().join(',')
      !== 'etag,handlers,last_deployed_from,named_handlers'
    || !SHA256_HEX.test(script.etag ?? '')
    || !exactJson(script.handlers, ['fetch'])
    || script.last_deployed_from !== 'api'
    || !Array.isArray(script.named_handlers)
  ) fail(code);
  const namedHandlers = script.named_handlers.map(namedHandler => {
    if (
      !isRecord(namedHandler)
      || Object.keys(namedHandler).sort().join(',') !== 'handlers,name'
      || typeof namedHandler.name !== 'string'
      || !exactJson(namedHandler.handlers, ['class'])
    ) fail(code);
    return namedHandler.name;
  }).sort();
  if (!exactJson(namedHandlers, [...REVIEWED_V5_API_NAMED_HANDLER_NAMES].sort())) {
    fail(code);
  }
}

function exactApiVersionShape(value, contract, expectedTag, expectedMessage, code) {
  const metadata = value.metadata;
  const annotations = value.annotations;
  const resources = value.resources;
  const runtime = resources.script_runtime;
  if (
    Object.keys(value).sort().join(',')
      !== 'annotations,id,metadata,number,resources'
    || !Number.isSafeInteger(value.number)
    || value.number < 1
    || Object.keys(metadata).sort().join(',')
      !== 'author_email,author_id,created_on,has_preview,source'
    || metadata.author_email !== ''
    || !ACCOUNT_ID.test(metadata.author_id ?? '')
    || metadata.source !== 'api'
    || metadata.has_preview !== false
    || typeof metadata.created_on !== 'string'
    || !CLOUDFLARE_UTC.test(metadata.created_on)
    || Number.isNaN(Date.parse(metadata.created_on))
    || !isRecord(annotations)
    || Object.keys(annotations).sort().join(',')
      !== 'workers/message,workers/tag,workers/triggered_by'
    || annotations['workers/message'] !== expectedMessage
    || annotations['workers/tag'] !== expectedTag
    || annotations['workers/triggered_by'] !== 'version_upload'
    || Object.keys(resources).sort().join(',')
      !== 'bindings,script,script_runtime'
    || Object.keys(runtime).sort().join(',')
      !== 'compatibility_date,compatibility_flags,migration_tag,usage_model'
    || runtime.compatibility_date !== contract.compatibilityDate
    || !exactJson(runtime.compatibility_flags, contract.compatibilityFlags)
    || runtime.migration_tag !== contract.migrations.at(-1).tag
    || runtime.usage_model !== 'standard'
  ) fail(code);
  exactApiScriptAttestation(resources.script, code);
}

function expectedReviewedDurableObjectBindings(contract, code) {
  const contracted = contract.durableObjectBindings
    .map(({ name, className }) => ({ name, className }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const reviewed = REVIEWED_V5_DURABLE_OBJECT_BINDINGS
    .map(({ name, className }) => ({ name, className }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (!exactJson(contracted, reviewed)) fail(code);
  return REVIEWED_V5_DURABLE_OBJECT_BINDINGS.map(binding => ({
    name: binding.name,
    type: 'durable_object_namespace',
    className: binding.className,
    namespaceId: binding.namespaceId,
  }));
}

function exactExportsOrApiScript(
  value,
  contract,
  expectedTag,
  expectedMessage,
  code,
) {
  const exports = value.resources.script_runtime.exports;
  if (exports === undefined) {
    exactApiVersionShape(
      value,
      contract,
      expectedTag,
      expectedMessage,
      code,
    );
    return;
  }
  if (!isRecord(exports)) fail(code);
  const durableExports = Object.entries(exports)
    .filter(([, exported]) => exported?.type === 'durable-object')
    .map(([name, exported]) => {
      if (
        !isRecord(exported)
        || exported.type !== 'durable-object'
        || exported.storage !== 'sqlite'
        || exported.container !== undefined
        || ![undefined, 'created'].includes(exported.state)
        || Object.keys(exported).some(key => ![
          'state', 'storage', 'type',
        ].includes(key))
      ) fail(code);
      return name;
    })
    .sort((left, right) => left.localeCompare(right, 'en'));
  const expectedExports = contract.durableObjectBindings
    .map(binding => binding.className)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const nonDurableExports = Object.entries(exports)
    .filter(([, exported]) => exported?.type !== 'durable-object');
  const defaultExport = nonDurableExports[0]?.[1];
  if (
    !exactJson(durableExports, expectedExports)
    || nonDurableExports.length !== 1
    || nonDurableExports[0][0] !== 'default'
    || !isRecord(defaultExport)
    || defaultExport.type !== 'worker'
    || ![undefined, 'created'].includes(defaultExport.state)
    || (defaultExport.cache !== undefined
      && !exactJson(defaultExport.cache, { enabled: false }))
    || Object.keys(defaultExport).some(key => ![
      'cache', 'state', 'type',
    ].includes(key))
  ) fail(code);
}

function projectVersion(value, contract, sourceDigest) {
  if (
    !isRecord(value)
    || !VERSION_ID.test(value.id ?? '')
    || !isRecord(value.metadata)
    || !isRecord(value.resources)
    || !isRecord(value.resources.script_runtime)
    || !Array.isArray(value.resources.bindings)
    || Object.keys(value.resources).some(key => ![
      'bindings', 'script', 'script_runtime',
    ].includes(key))
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_INVALID');
  exactVersionNumber(
    value,
    value.id,
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_INVALID',
  );
  const runtime = value.resources.script_runtime;
  if (
    Object.keys(runtime).some(key => ![
      'compatibility_date',
      'compatibility_flags',
      'exports',
      'limits',
      'migration_tag',
      'usage_model',
    ].includes(key))
    || (runtime.limits !== undefined && !exactJson(runtime.limits, {}))
    || ![undefined, 'standard'].includes(runtime.usage_model)
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_RUNTIME_MISMATCH');
  const createdAt = cloudflareUtc(
    value.metadata.created_on,
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_INVALID',
  );
  if (
    value.metadata.source !== 'api'
    || value.annotations?.['workers/tag'] !== contract.versionTag
    || value.annotations?.['workers/message'] !== contract.versionMessage
    || runtime.compatibility_date !== contract.compatibilityDate
    || !exactJson(runtime.compatibility_flags, contract.compatibilityFlags)
    || runtime.migration_tag !== contract.migrations.at(-1).tag
    || sourceDigest !== contract.sourceDigest
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_MISMATCH');
  const bindings = value.resources.bindings.map(detailBindingProjection)
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const expected = [
    ...Object.entries(contract.variables).map(([name, text]) => ({
      name,
      type: 'plain_text',
      text,
    })),
    ...contract.secretBindingNames.map(name => ({ name, type: 'secret_text' })),
    ...expectedReviewedDurableObjectBindings(
      contract,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_BINDING_MISMATCH',
    ),
  ].sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (!exactJson(bindings, expected)) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_BINDING_MISMATCH');
  }
  exactExportsOrApiScript(
    value,
    contract,
    contract.versionTag,
    contract.versionMessage,
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_EXPORT_MISMATCH',
  );
  return Object.freeze({
    ...contract,
    versionId: value.id,
    createdAt,
  });
}

function exactDeployment(result) {
  const deployments = Array.isArray(result) ? result : result?.deployments;
  if (!Array.isArray(deployments) || deployments.length < 1) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_INVALID');
  }
  const latest = deployments[0];
  const message = latest?.annotations?.['workers/message'];
  const triggeredBy = latest?.annotations?.['workers/triggered_by'];
  if (
    !isRecord(latest)
    || !VERSION_ID.test(latest.id ?? '')
    || latest.strategy !== 'percentage'
    || !Array.isArray(latest.versions)
    || latest.versions.length !== 1
    || !VERSION_ID.test(latest.versions[0]?.version_id ?? '')
    || latest.versions[0]?.percentage !== 100
    || (message !== undefined
      && (typeof message !== 'string' || message.length > 256))
    || (triggeredBy !== undefined
      && (typeof triggeredBy !== 'string' || triggeredBy.length > 128))
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_INVALID');
  return Object.freeze({
    deploymentId: latest.id,
    versionId: latest.versions[0].version_id,
    message: message ?? null,
    triggeredBy: triggeredBy ?? null,
    createdAt: cloudflareUtc(
      latest.created_on,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_INVALID',
    ),
  });
}

function exactDeployedVersion(result, deployment) {
  const annotations = result?.annotations ?? {};
  const tag = annotations?.['workers/tag'];
  const message = annotations?.['workers/message'];
  if (
    !isRecord(result)
    || result.id !== deployment.versionId
    || !isRecord(result.metadata)
    || typeof result.metadata.source !== 'string'
    || result.metadata.source.length < 1
    || result.metadata.source.length > 128
    || !isRecord(annotations)
    || (tag !== undefined
      && (typeof tag !== 'string' || tag.length < 1 || tag.length > 100))
    || (message !== undefined
      && (typeof message !== 'string' || message.length > 256))
    || Date.parse(cloudflareUtc(
      result.metadata.created_on,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_VERSION_INVALID',
    )) > Date.parse(deployment.createdAt)
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_VERSION_INVALID');
  const sourceBindings = Array.isArray(result.resources?.bindings)
    ? result.resources.bindings.filter(
      binding => binding?.name === 'WARPKEEP_BRIDGE_SOURCE_COMMIT',
    )
    : [];
  if (
    sourceBindings.length > 1
    || (sourceBindings.length === 1
      && (sourceBindings[0]?.type !== 'plain_text'
        || !SOURCE_COMMIT.test(sourceBindings[0]?.text ?? '')))
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_VERSION_INVALID');
  const tagMatch = /^notification-prepared-([a-f0-9]{40})$/u.exec(tag ?? '');
  const annotatedCommit = tagMatch?.[1];
  if (
    (tagMatch !== null
      && message !== `Warpkeep notification preparation ${annotatedCommit}`)
    || (tagMatch === null
      && typeof message === 'string'
      && message.startsWith('Warpkeep notification preparation '))
    || (annotatedCommit !== undefined
      && sourceBindings[0]?.text !== undefined
      && sourceBindings[0].text !== annotatedCommit)
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_VERSION_INVALID');
  return Object.freeze({
    versionId: result.id,
    versionTag: tag ?? null,
    versionMessage: message ?? null,
    sourceCommit: sourceBindings[0]?.text ?? annotatedCommit ?? null,
  });
}

function exactPredecessorVersion(result, deployment, contract, sourceDigest) {
  const deployed = exactDeployedVersion(result, deployment);
  const versionNumber = exactVersionNumber(
    result,
    deployed.versionId,
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_VERSION_NUMBER_INVALID',
  );
  expectedSuccessorVersionNumber(
    versionNumber,
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_VERSION_NUMBER_INVALID',
  );
  if (
    !isRecord(result.resources)
    || !Array.isArray(result.resources.bindings)
    || !SHA256_HEX.test(result.resources.script?.etag ?? '')
    || !isRecord(result.resources.script_runtime)
    || Object.keys(result.resources).some(key => ![
      'bindings', 'script', 'script_runtime',
    ].includes(key))
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_V5_PREREQUISITE_REQUIRED');
  const runtime = result.resources.script_runtime;
  if (
    Object.keys(runtime).some(key => ![
      'compatibility_date',
      'compatibility_flags',
      'exports',
      'limits',
      'migration_tag',
      'usage_model',
    ].includes(key))
    || (runtime.limits !== undefined && !exactJson(runtime.limits, {}))
    || ![undefined, 'standard'].includes(runtime.usage_model)
    || runtime.compatibility_date !== contract.compatibilityDate
    || !exactJson(runtime.compatibility_flags, contract.compatibilityFlags)
    || runtime.migration_tag !== contract.migrations.at(-1).tag
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_V5_PREREQUISITE_REQUIRED');
  if (sourceDigest !== contract.sourceDigest) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_SOURCE_MISMATCH');
  }
  const bindings = result.resources.bindings
    .map(detailBindingProjection)
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const expected = [
    ...Object.entries(contract.variables).map(([name, text]) => ({
      name,
      type: 'plain_text',
      text: name === 'WARPKEEP_BRIDGE_SOURCE_COMMIT'
        ? contract.predecessorSourceCommit
        : text,
    })),
    ...AUTH_BRIDGE_NOTIFICATION_PREPARED_PREEXISTING_SECRET_BINDING_NAMES
      .map(name => ({ name, type: 'secret_text' })),
    ...expectedReviewedDurableObjectBindings(
      contract,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_BINDING_MISMATCH',
    ),
  ].sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (!exactJson(bindings, expected)) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_BINDING_MISMATCH');
  }
  exactExportsOrApiScript(
    result,
    contract,
    `notification-b0-${contract.predecessorSourceCommit}`,
    `Warpkeep notification B0 ${contract.predecessorSourceCommit}`,
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_EXPORT_MISMATCH',
  );
  if (deployed.versionId !== deployment.versionId) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_MISMATCH');
  }
  return Object.freeze({
    deploymentId: deployment.deploymentId,
    versionId: deployed.versionId,
    versionNumber,
  });
}

function exactDomain(response, contract) {
  const result = response.result;
  const info = response.resultInfo;
  if (
    !Array.isArray(result)
    || result.length !== 1
    || !isRecord(result[0])
    || Object.keys(result[0]).some(key => ![
      'id', 'zone_id', 'zone_name', 'hostname', 'service', 'environment',
      'cert_id', 'enabled', 'previews_enabled',
    ].includes(key))
    || typeof result[0].id !== 'string'
    || typeof result[0].zone_name !== 'string'
    || typeof result[0].cert_id !== 'string'
    || result[0].zone_id !== contract.zoneId
    || result[0].hostname !== contract.route.pattern
    || result[0].service !== contract.workerName
    || ![undefined, null, 'production'].includes(result[0].environment)
    || result[0].enabled !== true
    || result[0].previews_enabled !== false
    || !isRecord(info)
    || info.count !== 1
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_DOMAIN_MISMATCH');
}

function exactRoutes(result) {
  if (!Array.isArray(result) || result.length !== 0) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_ROUTE_MISMATCH');
  }
}

function exactDisabledObservability(value) {
  if (value === undefined || value === null) return true;
  return isRecord(value)
    && value.enabled === false
    && Object.keys(value).every(key => key === 'enabled');
}

function exactScriptSettings(result) {
  if (
    !isRecord(result)
    || Object.keys(result).some(key => ![
      'logpush', 'observability', 'tags', 'tail_consumers',
    ].includes(key))
    || ![undefined, false].includes(result.logpush)
    || !exactDisabledObservability(result.observability)
    || (result.tags !== undefined
      && result.tags !== null
      && (!Array.isArray(result.tags) || result.tags.length !== 0))
    || (result.tail_consumers !== undefined
      && result.tail_consumers !== null
      && (!Array.isArray(result.tail_consumers)
        || result.tail_consumers.length !== 0))
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_SCRIPT_SETTINGS_MISMATCH');
}

function exactWorkerScript(result, contract) {
  if (!Array.isArray(result)) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_PREREQUISITES_INVALID');
  }
  const matches = result.filter(script => script?.id === contract.workerName);
  if (matches.length !== 1) {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MIGRATION_MISMATCH');
  }
  const script = matches[0];
  if (
    script.cache_options !== undefined
    && (!isRecord(script.cache_options)
      || script.cache_options.enabled !== false
      || (script.cache_options.cross_version_cache !== undefined
        && typeof script.cache_options.cross_version_cache !== 'boolean')
      || Object.keys(script.cache_options).some(key => ![
        'cross_version_cache', 'enabled',
      ].includes(key)))
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_CACHE_MISMATCH');
  return script;
}

/**
 * Concrete Cloudflare read/write adapter. Wrangler is invoked only with
 * `--dry-run` to serialize the exact multipart body. Each write below is one
 * direct fetch call; this runtime never retries a mutation.
 */
export function createAuthBridgeNotificationPreparedCloudflareRuntime({
  contract: contractInput,
  apiToken,
  playerCanaryOwnerFid,
  repositoryRoot,
  serviceRoot,
  nodeExecutable,
  wranglerEntrypoint,
  multipartBody,
  multipartContentType,
  fetchImpl = fetch,
  commandRunner = defaultCommandRunner,
  clock = () => new Date(),
  requestTimeoutMilliseconds = REQUEST_TIMEOUT_MILLISECONDS,
  settleDelayImpl = defaultSettleDelay,
  journal,
} = {}) {
  const contract = assertContract(contractInput);
  const repository = canonicalPath(
    repositoryRoot,
    'directory',
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_REPOSITORY_INVALID',
  );
  const service = canonicalPath(
    serviceRoot,
    'directory',
    'AUTH_BRIDGE_PREPARED_CLOUDFLARE_SERVICE_INVALID',
  );
  if (!inside(repository, service) || basename(service) !== 'auth-bridge') {
    fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_SERVICE_INVALID');
  }
  assertNoAmbientFiles(service);
  if (
    typeof commandRunner !== 'function'
    || typeof clock !== 'function'
    || typeof settleDelayImpl !== 'function'
    || !POSITIVE_FID.test(playerCanaryOwnerFid ?? '')
    || BigInt(playerCanaryOwnerFid) > BigInt(Number.MAX_SAFE_INTEGER)
    || !Number.isSafeInteger(requestTimeoutMilliseconds)
    || requestTimeoutMilliseconds < 1_000
    || requestTimeoutMilliseconds > 30_000
    || !isRecord(journal)
    || typeof journal.inspect !== 'function'
  ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RUNTIME_INVALID');
  const api = createApi({ apiToken, fetchImpl, requestTimeoutMilliseconds });
  let preparedMultipart;
  let preparedPredecessorDeploymentId;
  let preparedPredecessorVersionId;
  let preparedPredecessorVersionNumber;
  let sameRuntimeUploadReconciliationAuthorized = false;
  if (multipartBody !== undefined) {
    if (!Buffer.isBuffer(multipartBody)) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_INVALID');
    }
    preparedMultipart = Object.freeze({
      body: Buffer.from(multipartBody),
      contentType: multipartContentType,
    });
    const inspected = inspectAuthBridgeNotificationPreparedMultipart(
      preparedMultipart.body,
      preparedMultipart.contentType,
    );
    exactMultipartMetadata(inspected.metadata, contract);
    if (inspected.sourceDigest !== contract.sourceDigest) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_SOURCE_DIGEST_MISMATCH');
    }
  }
  const basePath = `${API_PREFIX}/accounts/${contract.accountId}/workers/scripts/${contract.workerName}`;

  const attestInfrastructure = async () => {
    const [scriptsResponse, domainResponse, subdomainResponse, routeResponse,
      settingsResponse] =
      await Promise.all([
        api.json(`${API_PREFIX}/accounts/${contract.accountId}/workers/scripts`),
        api.json(
          `${API_PREFIX}/accounts/${contract.accountId}/workers/domains?service=${encodeURIComponent(contract.workerName)}`,
        ),
        api.json(`${basePath}/subdomain`),
        api.json(
          `${API_PREFIX}/accounts/${contract.accountId}/workers/services/${contract.workerName}/environments/production/routes?show_zonename=true`,
        ),
        api.json(`${basePath}/script-settings`),
      ]);
    const script = exactWorkerScript(scriptsResponse.result, contract);
    exactDomain(domainResponse, contract);
    exactRoutes(routeResponse.result);
    exactScriptSettings(settingsResponse.result);
    if (
      !exactKeys(subdomainResponse.result, ['enabled', 'previews_enabled'])
      || subdomainResponse.result.enabled !== false
      || subdomainResponse.result.previews_enabled !== false
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_SUBDOMAIN_MISMATCH');
    return script;
  };

  const prepareMultipart = async () => {
    if (preparedMultipart !== undefined) return preparedMultipart;
    const built = await buildAuthBridgeNotificationPreparedWranglerMultipart({
      contract,
      repositoryRoot: repository,
      serviceRoot: service,
      nodeExecutable,
      wranglerEntrypoint,
      commandRunner,
    });
    if (built.sourceDigest !== contract.sourceDigest) {
      built.body.fill(0);
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_SOURCE_DIGEST_MISMATCH');
    }
    preparedMultipart = Object.freeze({
      body: built.body,
      contentType: built.contentType,
    });
    return preparedMultipart;
  };

  const inspectVersionSourceDigest = async versionId => {
    if (!VERSION_ID.test(versionId ?? '')) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_ID_INVALID');
    }
    const source = await prepareMultipart();
    const local = inspectAuthBridgeNotificationPreparedMultipart(
      source.body,
      source.contentType,
    );
    exactMultipartMetadata(local.metadata, contract);
    const remote = await api.multipart(
      `${basePath}/content/v2?version=${versionId}`,
    );
    let remoteDigest;
    try {
      const remoteParts = parseAuthBridgeNotificationPreparedMultipart(
        remote.body,
        remote.contentType,
      );
      const remoteModules = remoteParts.filter(part => part.field !== 'metadata');
      remoteDigest = authBridgeNotificationPreparedSourceDigest(remoteModules);
      if (
        remote.entrypoint !== local.metadata.main_module
        || !remoteModules.some(module => (
          module.field === remote.entrypoint
          && module.name === remote.entrypoint
        ))
      ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_SOURCE_UNVERIFIED');
    } finally {
      remote.body.fill(0);
    }
    if (
      local.sourceDigest !== contract.sourceDigest
      || remoteDigest !== contract.sourceDigest
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_SOURCE_UNVERIFIED');
    return remoteDigest;
  };

  const inspectDeployedPredecessor = async () => {
    const [deploymentResponse, script] = await Promise.all([
      api.json(`${basePath}/deployments`),
      attestInfrastructure(),
    ]);
    if (script.migration_tag !== 'v5') {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_V5_PREREQUISITE_REQUIRED');
    }
    const latest = exactDeployment(deploymentResponse.result);
    const [detail, sourceDigest] = await Promise.all([
      api.json(`${basePath}/versions/${latest.versionId}`),
      inspectVersionSourceDigest(latest.versionId),
    ]);
    return exactPredecessorVersion(
      detail.result,
      latest,
      contract,
      sourceDigest,
    );
  };

  const inspectLatestUploadedVersion = async () => {
    const response = await api.json(`${basePath}/versions?page=1&per_page=1`);
    const items = Array.isArray(response.result)
      ? response.result
      : (exactKeys(response.result, ['items'])
        && Array.isArray(response.result.items)
        ? response.result.items
        : undefined);
    if (
      items === undefined
      || items.length !== 1
      || !isRecord(items[0])
      || !VERSION_ID.test(items[0].id ?? '')
      || !Number.isSafeInteger(items[0].number)
      || items[0].number < 1
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LIST_INVALID');
    if (response.resultInfo !== undefined) {
      const info = response.resultInfo;
      if (
        !exactKeys(info, [
          'count', 'page', 'per_page', 'total_count', 'total_pages',
        ])
        || info.page !== 1
        || info.per_page !== 1
        || info.count !== 1
        || !Number.isSafeInteger(info.total_count)
        || info.total_count < 1
        || !Number.isSafeInteger(info.total_pages)
        || info.total_pages < 1
        || info.total_pages !== Math.ceil(info.total_count / info.per_page)
      ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LIST_INVALID');
    }
    return Object.freeze({
      versionId: items[0].id,
      versionNumber: items[0].number,
    });
  };

  const assertLatestUploadIsPredecessor = async predecessor => {
    if (
      !exactKeys(predecessor, ['versionId', 'versionNumber'])
      || !VERSION_ID.test(predecessor.versionId ?? '')
      || !Number.isSafeInteger(predecessor.versionNumber)
    ) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_LATEST_UPLOAD_MISMATCH', true);
    }
    const latest = await inspectLatestUploadedVersion();
    if (
      latest.versionId !== predecessor.versionId
      || latest.versionNumber !== predecessor.versionNumber
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_LATEST_UPLOAD_MISMATCH', true);
  };

  const prepareUpload = async () => {
    const predecessor = await inspectDeployedPredecessor();
    await assertLatestUploadIsPredecessor(Object.freeze({
      versionId: predecessor.versionId,
      versionNumber: predecessor.versionNumber,
    }));
    await prepareMultipart();
    preparedPredecessorDeploymentId = predecessor.deploymentId;
    preparedPredecessorVersionId = predecessor.versionId;
    preparedPredecessorVersionNumber = predecessor.versionNumber;
    return Object.freeze({
      mode: 'version',
      predecessorDeploymentId: predecessor.deploymentId,
      predecessorVersionId: predecessor.versionId,
    });
  };

  const assertPredecessorStable = async predecessor => {
    if (
      !exactKeys(predecessor, ['deploymentId', 'versionId'])
      || !VERSION_ID.test(predecessor.deploymentId ?? '')
      || !VERSION_ID.test(predecessor.versionId ?? '')
      || (preparedPredecessorDeploymentId !== undefined
        && predecessor.deploymentId !== preparedPredecessorDeploymentId)
      || (preparedPredecessorVersionId !== undefined
        && predecessor.versionId !== preparedPredecessorVersionId)
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_MISMATCH');
    const observed = await inspectDeployedPredecessor();
    if (
      observed.deploymentId !== predecessor.deploymentId
      || observed.versionId !== predecessor.versionId
      || (preparedPredecessorVersionNumber !== undefined
        && observed.versionNumber !== preparedPredecessorVersionNumber)
    ) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_DRIFT', true);
    }
  };

  const inspectVersionRecord = async versionId => {
    if (!VERSION_ID.test(versionId ?? '')) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_ID_INVALID');
    }
    const [detail, remoteDigest] = await Promise.all([
      api.json(`${basePath}/versions/${versionId}`),
      inspectVersionSourceDigest(versionId),
    ]);
    if (!SHA256_HEX.test(detail.result?.resources?.script?.etag ?? '')) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_SOURCE_UNVERIFIED');
    }
    return Object.freeze({
      detail: detail.result,
      version: projectVersion(detail.result, contract, remoteDigest),
    });
  };

  const inspectVersion = async versionId => {
    const inspected = await inspectVersionRecord(versionId);
    await assertCandidateVersionLineage(versionId, inspected.detail);
    return inspected.version;
  };

  const pinnedPredecessor = () => {
    const state = journal.inspect();
    const deploymentId = preparedPredecessorDeploymentId
      ?? state.predecessorDeploymentId;
    const versionId = preparedPredecessorVersionId
      ?? state.predecessorVersionId;
    if (
      [undefined, null].includes(deploymentId)
      && [undefined, null].includes(versionId)
    ) return undefined;
    if (!VERSION_ID.test(deploymentId ?? '') || !VERSION_ID.test(versionId ?? '')) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_MISMATCH');
    }
    return Object.freeze({ deploymentId, versionId });
  };

  const assertCandidateVersionLineage = async (
    versionId,
    candidateDetailInput,
  ) => {
    const predecessor = pinnedPredecessor();
    if (
      predecessor === undefined
      || !VERSION_ID.test(versionId ?? '')
      || versionId === predecessor.versionId
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH');
    const [candidateDetail, predecessorDetail] = await Promise.all([
      candidateDetailInput === undefined
        ? api.json(`${basePath}/versions/${versionId}`)
        : Promise.resolve(Object.freeze({ result: candidateDetailInput })),
      api.json(`${basePath}/versions/${predecessor.versionId}`),
    ]);
    const predecessorVersionNumber = exactVersionNumber(
      predecessorDetail.result,
      predecessor.versionId,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_VERSION_NUMBER_INVALID',
    );
    const candidateVersionNumber = exactVersionNumber(
      candidateDetail.result,
      versionId,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_INVALID',
    );
    if (candidateVersionNumber !== expectedSuccessorVersionNumber(
      predecessorVersionNumber,
      'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_VERSION_NUMBER_INVALID',
    )) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH');
    return candidateVersionNumber;
  };

  const listCandidates = async () => {
    const candidates = [];
    const candidateVersionNumbers = new Map();
    const predecessor = pinnedPredecessor();
    for (let page = 1; page <= MAX_VERSION_PAGES; page += 1) {
      const response = await api.json(
        `${basePath}/versions?deployable=true&page=${page}&per_page=100`,
      );
      const items = Array.isArray(response.result)
        ? response.result
        : (exactKeys(response.result, ['items'])
          && Array.isArray(response.result.items)
          ? response.result.items
          : undefined);
      if (items === undefined) {
        fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LIST_INVALID');
      }
      for (const item of items) {
        if (
          !isRecord(item)
          || !VERSION_ID.test(item.id ?? '')
          || !Number.isSafeInteger(item.number)
          || item.number < 1
        ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LIST_INVALID');
        if (
          item?.annotations?.['workers/tag'] === contract.versionTag
          || item?.annotations?.['workers/message'] === contract.versionMessage
        ) {
          if (item.id === predecessor?.versionId) continue;
          try {
            const inspected = await inspectVersionRecord(item.id);
            if (inspected.version.versionTag === contract.versionTag) {
              const versionNumber = await assertCandidateVersionLineage(
                item.id,
                inspected.detail,
              );
              if (item.number !== versionNumber) {
                fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH');
              }
              candidateVersionNumbers.set(item.id, versionNumber);
              candidates.push(item.id);
            }
          } catch (error) {
            if (
              error instanceof AuthBridgeNotificationPreparedCloudflareRuntimeError
              && error.code === 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_MISMATCH'
            ) continue;
            throw error;
          }
        }
      }
      const pages = response.resultInfo?.total_pages;
      if (pages === undefined || page >= pages) break;
      if (!Number.isSafeInteger(pages) || pages > MAX_VERSION_PAGES) {
        fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LIST_UNBOUNDED');
      }
    }
    if (candidates.length > 1) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_DUPLICATE_VERSION');
    }
    if (candidates.length === 1) {
      const latest = await inspectLatestUploadedVersion();
      if (
        latest.versionId !== candidates[0]
        || latest.versionNumber !== candidateVersionNumbers.get(candidates[0])
      ) {
        fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_LATEST_UPLOAD_MISMATCH', true);
      }
    }
    return Object.freeze(candidates);
  };

  const reconcileVersion = async () => {
    const state = journal.inspect();
    const phase = state.phase;
    if (phase === 'upload-adjudication-required') {
      fail(
        'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
        true,
      );
    }
    if (phase === 'upload-invoked') {
      if (sameRuntimeUploadReconciliationAuthorized !== true) {
        fail(
          'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
          true,
        );
      }
      sameRuntimeUploadReconciliationAuthorized = false;
    }
    if (phase === 'remote-reconcile-started') {
      await assertPredecessorStable(Object.freeze({
        deploymentId: state.predecessorDeploymentId,
        versionId: state.predecessorVersionId,
      }));
    }
    let candidates = await listCandidates();
    if (phase === 'remote-reconcile-started' && candidates.length !== 0) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_UNINVOKED_CANDIDATE');
    }
    if (candidates.length === 0 && phase === 'upload-invoked') {
      for (let attempt = 1;
        attempt < RECOVERY_SETTLE_ATTEMPTS && candidates.length === 0;
        attempt += 1) {
        await settleDelayImpl(RECOVERY_SETTLE_MILLISECONDS);
        candidates = await listCandidates();
      }
      if (candidates.length === 0) {
        fail(
          'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
          true,
        );
      }
    }
    return candidates;
  };

  const uploadVersion = async (_canonicalContract, plan) => {
    if (
      !exactKeys(plan, [
        'mode', 'predecessorDeploymentId', 'predecessorVersionId',
      ])
      || plan.mode !== 'version'
      || !VERSION_ID.test(plan.predecessorDeploymentId ?? '')
      || !VERSION_ID.test(plan.predecessorVersionId ?? '')
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_PLAN_INVALID');
    const source = await prepareMultipart();
    if (
      plan.predecessorDeploymentId !== preparedPredecessorDeploymentId
      || plan.predecessorVersionId !== preparedPredecessorVersionId
      || !Number.isSafeInteger(preparedPredecessorVersionNumber)
    ) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_PLAN_STALE');
    }
    const local = inspectAuthBridgeNotificationPreparedMultipart(
      source.body,
      source.contentType,
    );
    const metadata = Object.freeze({
      ...local.metadata,
      bindings: Object.freeze([
        ...local.metadata.bindings,
        Object.freeze({
          name: AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING,
          text: playerCanaryOwnerFid,
          type: 'secret_text',
        }),
      ]),
    });
    exactMultipartMetadata(metadata, contract, Object.freeze({
      playerCanaryOwnerFid,
    }));
    const body = multipartWithMetadata(source.body, source.contentType, metadata);
    try {
      // keep_bindings resolves against the latest upload. Re-attest both the
      // live predecessor and that exact latest-upload identity immediately
      // before the mutation is sent.
      await assertPredecessorStable(Object.freeze({
        deploymentId: plan.predecessorDeploymentId,
        versionId: plan.predecessorVersionId,
      }));
      await assertLatestUploadIsPredecessor(Object.freeze({
        versionId: plan.predecessorVersionId,
        versionNumber: preparedPredecessorVersionNumber,
      }));
      sameRuntimeUploadReconciliationAuthorized = true;
      const response = await api.json(
        `${basePath}/versions`,
        {
          method: 'POST',
          headers: { 'content-type': source.contentType },
          body,
          mutation: true,
          forbiddenResponseSubstring: playerCanaryOwnerFid,
        },
      );
      if (response.resultInfo !== undefined) {
        fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID');
      }
      return Object.freeze({
        versionId: exactVersionUploadResult(
          response.result,
          preparedPredecessorVersionNumber,
        ),
      });
    } finally {
      body.fill(0);
    }
  };

  const releaseVersion = async input => {
    if (
      !exactKeys(input, [
        'versionId', 'predecessorDeploymentId', 'predecessorVersionId',
        'percentage', 'message',
      ])
      || !VERSION_ID.test(input.versionId ?? '')
      || !VERSION_ID.test(input.predecessorDeploymentId ?? '')
      || !VERSION_ID.test(input.predecessorVersionId ?? '')
      || input.percentage !== 100
      || input.message !== contract.versionMessage
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_RELEASE_INPUT_INVALID');
    const candidateVersionNumber = await assertCandidateVersionLineage(
      input.versionId,
    );
    await assertPredecessorStable(Object.freeze({
      deploymentId: input.predecessorDeploymentId,
      versionId: input.predecessorVersionId,
    }));
    const latest = await inspectLatestUploadedVersion();
    if (
      latest.versionId !== input.versionId
      || latest.versionNumber !== candidateVersionNumber
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_LATEST_UPLOAD_MISMATCH', true);
    await api.json(`${basePath}/deployments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        strategy: 'percentage',
        versions: [{ percentage: 100, version_id: input.versionId }],
        annotations: {
          'workers/message': input.message,
        },
      }),
      mutation: true,
    });
  };

  const inspectDeploymentOnce = async () => {
    const [deploymentResponse] = await Promise.all([
      api.json(`${basePath}/deployments`),
      attestInfrastructure(),
    ]);
    const latest = exactDeployment(deploymentResponse.result);
    const deployedVersion = exactDeployedVersion(
      (await api.json(`${basePath}/versions/${latest.versionId}`)).result,
      latest,
    );
    const predecessor = pinnedPredecessor();
    const isPinnedPredecessor = predecessor !== undefined
      && latest.deploymentId === predecessor.deploymentId
      && deployedVersion.versionId === predecessor.versionId;
    if (
      deployedVersion.versionTag === contract.versionTag
      && !isPinnedPredecessor
      && (deployedVersion.sourceCommit !== contract.sourceCommit
        || deployedVersion.versionMessage !== contract.versionMessage
        || latest.message !== contract.versionMessage
        || latest.triggeredBy !== 'deployment')
    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_INVALID');
    const now = clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_CLOCK_INVALID');
    }
    return Object.freeze({
      schemaVersion: 1,
      profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
      accountId: contract.accountId,
      zoneId: contract.zoneId,
      workerName: contract.workerName,
      route: contract.route,
      versionId: deployedVersion.versionId,
      versionTag: deployedVersion.versionTag,
      sourceCommit: deployedVersion.sourceCommit,
      trafficPercentage: 100,
      observedAt: now.toISOString(),
    });
  };

  const inspectDeployment = inspectDeploymentOnce;

  return Object.freeze({
    prepareUpload,
    uploadVersion,
    reconcileVersion,
    inspectVersion,
    assertPredecessorStable,
    releaseVersion,
    inspectDeployment,
    dispose() {
      preparedMultipart?.body.fill(0);
      preparedPredecessorDeploymentId = undefined;
      preparedPredecessorVersionId = undefined;
      preparedPredecessorVersionNumber = undefined;
      sameRuntimeUploadReconciliationAuthorized = false;
    },
  });
}

/** Test seam for the strict raw-to-canonical control-plane projection. */
export function projectAuthBridgeNotificationPreparedCloudflareVersion({
  value,
  contract,
  sourceDigest,
} = {}) {
  return projectVersion(value, assertContract(contract), sourceDigest);
}
