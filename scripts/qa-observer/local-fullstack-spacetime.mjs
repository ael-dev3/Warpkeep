import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign as signBytes } from 'node:crypto';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
} from '../entry-agreement-policy.mjs';
import { attestPinnedSpacetimeCli } from '../spacetime-cli-attestation.mjs';

export const LOCAL_FULLSTACK_DATABASE = 'warpkeep-local-fullstack';
export const LOCAL_FULLSTACK_ISSUER = 'http://127.0.0.1';
export const LOCAL_FULLSTACK_AUDIENCE = 'warpkeep-spacetimedb';
export const LOCAL_FULLSTACK_FID = 9_900_001;
export const LOCAL_FULLSTACK_PROFILE_URL =
  'https://i.imgur.com/warpkeep-local-keeper.png';
export const LOCAL_FULLSTACK_FOUNDER_COUNT = 7;
export const LOCAL_FULLSTACK_WORKER_COUNT = LOCAL_FULLSTACK_FOUNDER_COUNT * 4;
export const LOCAL_FULLSTACK_INNER_KEEP_RESOURCES = Object.freeze({
  food: 10_000n,
  wood: 10_000n,
  stone: 10_000n,
  gold: 10_000n,
});

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_MODULE = join(REPOSITORY_ROOT, 'spacetimedb');
const MAXIMUM_OUTPUT_BYTES = 512 * 1_024;
const MAXIMUM_RESPONSE_BYTES = 32 * 1_024;
const COMMAND_TIMEOUT_MILLISECONDS = 120_000;
const SERVER_STOP_TIMEOUT_MILLISECONDS = 5_000;
const PROFILE_POLICY_VERSION = 'trusted-snapchain-profile-v3';
const RESOURCE_POLICY_VERSION = 'genesis-resource-yield-v1';
const WORKER_PROTOCOL_CAPABILITY = 'generic-castle-workers-v1';
const INNER_KEEP_PROTOCOL_CAPABILITY = 'inner-keep-construction-v1';
const INNER_KEEP_POLICY_VERSION = 'genesis-001-inner-keep-construction-v1';
const INNER_KEEP_POLICY_DIGEST =
  'b3ca0d7ce3a30d3f89e0fe295864dc9c7237fbf5dedc3d8e8c2ed45586d2355e';
const INNER_KEEP_LAYOUT_POLICY_VERSION = 'genesis-001-inner-keep-layout-v1';
const INNER_KEEP_LAYOUT_DIGEST =
  'dec272175dc96085b26d2bc96125e77c6433331c698f150d80dfbbb4881ee3d7';
const INNER_KEEP_ASSET_CATALOG_DIGEST =
  '00304c5dbf819cec6cb656996c1105f64efcf36acf8099c431f5b04b822679f0';
const LOCAL_INNER_KEEP_FIRST_COMPLETION_DELAY_MICROS = 15_000_000n;
const LOCAL_FULLSTACK_FOUNDERS = Object.freeze(Array.from(
  { length: LOCAL_FULLSTACK_FOUNDER_COUNT },
  (_, index) => Object.freeze({
    fid: LOCAL_FULLSTACK_FID + index,
    username: index === 0 ? 'qa.warpkeeper' : `qa.warpkeeper.${index + 1}`,
    displayName: index === 0
      ? 'Synthetic QA Keeper'
      : `Synthetic QA Keeper ${index + 1}`,
  })
));
const LOCAL_FULLSTACK_DISPATCH_TARGETS = Object.freeze([
  Object.freeze({
    ordinal: 1,
    resourceKind: 'gold',
    siteId: 'genesis-001-tier1-gold-02',
  }),
  Object.freeze({
    ordinal: 2,
    resourceKind: 'food',
    siteId: 'genesis-001-tier1-food-002',
  }),
  Object.freeze({
    ordinal: 3,
    resourceKind: 'wood',
    siteId: 'genesis-001-tier1-wood-012',
  }),
  Object.freeze({
    ordinal: 4,
    resourceKind: 'stone',
    siteId: 'genesis-001-tier1-stone-002',
  }),
]);
const PRODUCTION_OIDC_ISSUER = 'https://auth.warpkeep.com';
const PRODUCTION_OIDC_SOURCE_DECLARATION =
  `export const WARPKEEP_OIDC_ISSUER = '${PRODUCTION_OIDC_ISSUER}';`;
const PRODUCTION_OIDC_ISSUER_BYTES = Buffer.from(PRODUCTION_OIDC_ISSUER, 'utf8');
const LOCAL_WORKER_TRAVEL_SOURCE_DECLARATION =
  'export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 30_000_000n;';
const LOCAL_WORKER_TRAVEL_QA_DECLARATION =
  'export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 1_000_000n;';
const LOCAL_WORKER_QUANTUM_SOURCE_DECLARATIONS = Object.freeze([
  Object.freeze({
    file: 'castleWorkerPolicy.ts',
    source: 'export const CASTLE_WORKER_GATHER_QUANTUM_MICROS = 60_000_000n;',
    qa: 'export const CASTLE_WORKER_GATHER_QUANTUM_MICROS = 1_000_000n;',
  }),
  ...['gold', 'food', 'wood', 'stone'].map((resource) => {
    const symbol = `${resource.toUpperCase()}_GATHER_QUANTUM_MICROS`;
    return Object.freeze({
      file: `${resource}ExpeditionPolicy.ts`,
      source: `export const ${symbol} = 60_000_000n;`,
      qa: `export const ${symbol} = 1_000_000n;`,
    });
  }),
]);
const LOCAL_WORKER_GATHERING_DURATION_SOURCE_DECLARATIONS = Object.freeze(
  ['gold', 'food', 'wood', 'stone'].map((resource) => {
    const symbol = `${resource.toUpperCase()}_GATHERING_DURATION_MICROS`;
    return Object.freeze({
      file: `${resource}ExpeditionPolicy.ts`,
      source:
        `export const ${symbol} = 30n * 24n * 60n * 60n * 1_000_000n;`,
      qa: `export const ${symbol} = 60_000_000n;`,
    });
  })
);
const LOCAL_INNER_KEEP_RESOURCE_SOURCE_DECLARATION = `export const GENESIS_STARTING_RESOURCE_BALANCES: ResourceBalances = Object.freeze({
  food: 0n,
  wood: 0n,
  stone: 0n,
  gold: 0n,
});`;
const LOCAL_INNER_KEEP_RESOURCE_QA_DECLARATION = `export const GENESIS_STARTING_RESOURCE_BALANCES: ResourceBalances = Object.freeze({
  food: ${LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.food}n,
  wood: ${LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.wood}n,
  stone: ${LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.stone}n,
  gold: ${LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.gold}n,
});`;
const LOCAL_INNER_KEEP_COMPLETION_SOURCE_DECLARATION =
  "  if (now < building.completesAtMicros) fail('INNER_KEEP_COMPLETION_EARLY');";
const LOCAL_INNER_KEEP_COMPLETION_QA_DECLARATION = `  // warpkeep-disposable-inner-keep-completion-v1
  const completionAuthorityMicros = (
    building.buildingKind === 'city-mill'
    && building.targetLevel === 1
  )
    ? safeAddU64(
        building.startedAtMicros,
        ${LOCAL_INNER_KEEP_FIRST_COMPLETION_DELAY_MICROS}n,
        'INNER_KEEP_TIME_OVERFLOW',
      )
    : building.completesAtMicros;
  if (now < completionAuthorityMicros) fail('INNER_KEEP_COMPLETION_EARLY');`;
const LOCAL_INNER_KEEP_SCHEDULE_SOURCE_DECLARATION =
  '    scheduledAt: ScheduleAt.time(project.completesAtMicros),';
const LOCAL_INNER_KEEP_SCHEDULE_QA_DECLARATION = `    scheduledAt: ScheduleAt.time(
      project.buildingKind === 'city-mill' && project.targetLevel === 1
        ? safeAddU64(
            startedAtMicros,
            ${LOCAL_INNER_KEEP_FIRST_COMPLETION_DELAY_MICROS}n,
            'INNER_KEEP_TIME_OVERFLOW',
          )
        : project.completesAtMicros
    ),`;
const LOCAL_INNER_KEEP_SCHEDULE_MATCH_SOURCE_DECLARATION =
  '    && scheduledAtMicros === building.completesAtMicros';
const LOCAL_INNER_KEEP_SCHEDULE_MATCH_QA_DECLARATION = `    && scheduledAtMicros === (
      building.buildingKind === 'city-mill' && building.targetLevel === 1
        ? safeAddU64(
            building.startedAtMicros,
            ${LOCAL_INNER_KEEP_FIRST_COMPLETION_DELAY_MICROS}n,
            'INNER_KEEP_TIME_OVERFLOW',
          )
        : building.completesAtMicros
    )`;
const LOCAL_CLIENT_ARTIFACT_DIGEST = createHash('sha256')
  .update('warpkeep-disposable-local-fullstack-client-v1')
  .digest('hex');
const LOCAL_SOURCE_COMMIT = '0'.repeat(40);
const SAFE_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
]);
const COPIED_MODULE_FILES = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
]);

export class LocalFullstackRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocalFullstackRuntimeError';
  }
}

function fail(message) {
  throw new LocalFullstackRuntimeError(message);
}

function exactPrivateDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    fail('Disposable runtime directory was invalid.');
  }
  return value;
}

function childEnvironment(runtimeDirectory, source = process.env) {
  const environment = Object.fromEntries(SAFE_CHILD_ENVIRONMENT_KEYS
    .filter((key) => typeof source[key] === 'string' && source[key].length > 0)
    .map((key) => [key, source[key]]));
  return Object.freeze({
    ...environment,
    CI: '1',
    HOME: runtimeDirectory,
    LANG: 'C',
    NO_COLOR: '1',
    TMPDIR: runtimeDirectory,
    XDG_CACHE_HOME: join(runtimeDirectory, 'xdg-cache'),
    XDG_CONFIG_HOME: join(runtimeDirectory, 'xdg-config'),
    XDG_DATA_HOME: join(runtimeDirectory, 'xdg-data'),
  });
}

async function freeLoopbackPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
        server.close();
        rejectPort(new LocalFullstackRuntimeError('Loopback port reservation failed.'));
        return;
      }
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
    });
  });
}

function collectBounded(stream, terminate) {
  const chunks = [];
  let byteLength = 0;
  stream.on('data', (chunk) => {
    byteLength += chunk.byteLength;
    if (byteLength > MAXIMUM_OUTPUT_BYTES) {
      terminate();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  return () => {
    if (byteLength > MAXIMUM_OUTPUT_BYTES) fail('Local CLI output exceeded its bound.');
    return Buffer.concat(chunks).toString('utf8');
  };
}

export async function runDisposableLocalFullstackCli(executable, arguments_, options) {
  return new Promise((resolveRun, rejectRun) => {
    let settled = false;
    let timedOut = false;
    let deadline;
    const child = spawn(executable, arguments_, {
      cwd: REPOSITORY_ROOT,
      detached: true,
      env: options.environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    options.onProcess?.(child);
    const terminate = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {
        try { child.kill('SIGKILL'); } catch {
          // The bounded failure remains authoritative.
        }
      }
    };
    const stdout = collectBounded(child.stdout, terminate);
    const stderr = collectBounded(child.stderr, terminate);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      options.onProcess?.(undefined, child);
      callback();
    };
    child.once('error', () => finish(() => rejectRun(
      new LocalFullstackRuntimeError('Local CLI process could not start.')
    )));
    child.once('close', (code) => finish(() => {
      try {
        if (timedOut) {
          rejectRun(new LocalFullstackRuntimeError('Local CLI command exceeded its deadline.'));
          return;
        }
        const output = `${stdout()}\n${stderr()}`;
        for (const secret of options.secrets ?? []) {
          if (typeof secret === 'string' && secret.length > 0 && output.includes(secret)) {
            rejectRun(new LocalFullstackRuntimeError('Local CLI exposed disposable authority.'));
            return;
          }
        }
        resolveRun(Object.freeze({ code: code ?? 1 }));
      } catch (error) {
        rejectRun(error instanceof LocalFullstackRuntimeError
          ? error
          : new LocalFullstackRuntimeError('Local CLI output could not be contained.'));
      }
    }));
    deadline = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeout ?? COMMAND_TIMEOUT_MILLISECONDS);
  });
}

async function readBoundedResponse(response, credential) {
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAXIMUM_RESPONSE_BYTES)
  ) fail('Local SpacetimeDB response exceeded its bound.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAXIMUM_RESPONSE_BYTES) {
      try { await reader.cancel(); } catch { /* The bounded rejection remains authoritative. */ }
      fail('Local SpacetimeDB response exceeded its bound.');
    }
    chunks.push(value);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  if (text.includes(credential)) fail('Local SpacetimeDB reflected disposable authority.');
  return text;
}

async function callLocalProcedure({
  server,
  database,
  name,
  credential,
  body = '[]',
  expectedStatus = 200,
  timeout = 30_000,
}) {
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(server)
    || database !== LOCAL_FULLSTACK_DATABASE
    || !/^[a-z0-9_]+$/.test(name)
    || typeof credential !== 'string'
    || !/^\[/.test(body)
  ) fail('Local SpacetimeDB call coordinates were invalid.');
  let response;
  try {
    response = await fetch(`${server}/v1/database/${database}/call/${name}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential}`,
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    fail('Local SpacetimeDB call failed within its boundary.');
  }
  const text = await readBoundedResponse(response, credential);
  if (response.status !== expectedStatus) {
    const innerKeepCode = /\b(INNER_KEEP_[A-Z0-9_]{1,80})\b/.exec(text)?.[1];
    fail(`Local SpacetimeDB call ${name} failed safely${
      innerKeepCode ? ` (${innerKeepCode})` : ''
    }.`);
  }
  return text;
}

async function acquireDisposableIdentity(server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${server}/v1/identity`, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(1_000),
      });
      const text = await readBoundedResponse(response, 'credential-not-yet-issued');
      const value = JSON.parse(text);
      if (
        response.status !== 200
        || typeof value?.identity !== 'string'
        || !/^[0-9a-f]{64}$/.test(value.identity)
        || typeof value?.token !== 'string'
        || value.token.split('.').length !== 3
      ) throw new Error();
      return Object.freeze({ identity: value.identity, token: value.token });
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  fail('Disposable SpacetimeDB did not become ready.');
}

function createEphemeralJwt(privateKey, claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = signBytes('sha256', Buffer.from(input), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${input}.${signature}`;
}

function localServiceClaims(subject, roles, lifetimeSeconds) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  return {
    iss: LOCAL_FULLSTACK_ISSUER,
    sub: subject,
    aud: [LOCAL_FULLSTACK_AUDIENCE],
    token_type: 'spacetime-access',
    roles,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + lifetimeSeconds,
    jti: randomBytes(18).toString('base64url'),
  };
}

function localAdminClaims() {
  return localServiceClaims('service:hermes', ['warpkeep-admin'], 240);
}

function localPlayerClaims(fid = LOCAL_FULLSTACK_FID, lifetimeSeconds = 600) {
  const base = localServiceClaims(`farcaster:${fid}`, [], lifetimeSeconds);
  return {
    ...base,
    auth_version: 2,
    fid: String(fid),
    auth_epoch: 1,
    session_iat: base.iat,
    session_exp: base.exp,
  };
}

async function createLocalModule(runtimeDirectory) {
  const moduleDirectory = join(runtimeDirectory, 'module');
  await mkdir(moduleDirectory, { mode: 0o700 });
  await cp(join(SOURCE_MODULE, 'src'), join(moduleDirectory, 'src'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  for (const file of COPIED_MODULE_FILES) {
    await cp(join(SOURCE_MODULE, file), join(moduleDirectory, file), {
      errorOnExist: true,
      force: false,
    });
  }
  const sourceNodeModules = await realpath(join(SOURCE_MODULE, 'node_modules'));
  const nodeModulesMetadata = await stat(sourceNodeModules);
  if (!nodeModulesMetadata.isDirectory()) fail('Pinned module dependencies are unavailable.');
  await symlink(sourceNodeModules, join(moduleDirectory, 'node_modules'), 'dir');

  const configPath = join(moduleDirectory, 'src', 'config.ts');
  const productionConfig = await readFile(configPath, 'utf8');
  const localConfig = productionConfig
    .replace(
      PRODUCTION_OIDC_SOURCE_DECLARATION,
      `export const WARPKEEP_OIDC_ISSUER = '${LOCAL_FULLSTACK_ISSUER}';`
    );
  if (localConfig === productionConfig) {
    fail('Disposable module authority separation failed.');
  }
  await writeFile(configPath, localConfig, { encoding: 'utf8', mode: 0o600 });

  const rewriteCopiedConstant = async (file, source, replacement) => {
    const path = join(moduleDirectory, 'src', file);
    const copiedSource = await readFile(path, 'utf8');
    if (
      copiedSource.split(source).length !== 2
      || copiedSource.includes(replacement)
    ) fail('Disposable Worker timing separation failed.');
    const qaSource = copiedSource.replace(source, replacement);
    if (
      qaSource === copiedSource
      || qaSource.includes(source)
      || qaSource.split(replacement).length !== 2
    ) fail('Disposable Worker timing separation failed.');
    await writeFile(path, qaSource, { encoding: 'utf8', mode: 0o600 });
  };
  await rewriteCopiedConstant(
    'castleWorkerPolicy.ts',
    LOCAL_WORKER_TRAVEL_SOURCE_DECLARATION,
    LOCAL_WORKER_TRAVEL_QA_DECLARATION
  );
  for (const declaration of LOCAL_WORKER_QUANTUM_SOURCE_DECLARATIONS) {
    await rewriteCopiedConstant(
      declaration.file,
      declaration.source,
      declaration.qa
    );
  }
  for (
    const declaration
    of LOCAL_WORKER_GATHERING_DURATION_SOURCE_DECLARATIONS
  ) {
    await rewriteCopiedConstant(
      declaration.file,
      declaration.source,
      declaration.qa
    );
  }
  await rewriteCopiedConstant(
    'resourceAuthorityPolicy.ts',
    LOCAL_INNER_KEEP_RESOURCE_SOURCE_DECLARATION,
    LOCAL_INNER_KEEP_RESOURCE_QA_DECLARATION
  );
  await rewriteCopiedConstant(
    'innerKeepAuthority.ts',
    LOCAL_INNER_KEEP_COMPLETION_SOURCE_DECLARATION,
    LOCAL_INNER_KEEP_COMPLETION_QA_DECLARATION
  );
  await rewriteCopiedConstant(
    'innerKeepAuthority.ts',
    LOCAL_INNER_KEEP_SCHEDULE_SOURCE_DECLARATION,
    LOCAL_INNER_KEEP_SCHEDULE_QA_DECLARATION
  );
  await rewriteCopiedConstant(
    'innerKeepAuthority.ts',
    LOCAL_INNER_KEEP_SCHEDULE_MATCH_SOURCE_DECLARATION,
    LOCAL_INNER_KEEP_SCHEDULE_MATCH_QA_DECLARATION
  );
  return moduleDirectory;
}

function readUnsigned(value) {
  const parsed = typeof value === 'number' && Number.isSafeInteger(value)
    ? BigInt(value)
    : typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)
      ? BigInt(value)
      : undefined;
  if (parsed === undefined || parsed < 0n) fail('Worker aggregate was invalid.');
  return parsed;
}

function parseWorkerRollout(
  text,
  expectedCastleCount = BigInt(LOCAL_FULLSTACK_FOUNDER_COUNT),
) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Worker aggregate was invalid.');
  }
  if (!Array.isArray(value) || value.length !== 36) fail('Worker aggregate was invalid.');
  const status = Object.freeze({
    phase: value[0],
    expectedCastleCount: readUnsigned(value[3]),
    expectedWorkerCount: readUnsigned(value[4]),
    actualCastleCount: readUnsigned(value[5]),
    actualWorkerCount: readUnsigned(value[6]),
    rosterDigest: value[7],
    malformedWorkerGraphRows: readUnsigned(value[9]),
    resourceAccounts: readUnsigned(value[10]),
    missingResourceAccounts: readUnsigned(value[11]),
    orphanedResourceAccounts: readUnsigned(value[12]),
    resourceInvariantViolations: readUnsigned(value[13]),
    resourceRosterDigest: value[14],
    canonicalResourceCatalog: value[15],
    resourceCatalogDigest: value[16],
    legacyExpeditions: readUnsigned(value[17]),
    legacyOccupations: readUnsigned(value[18]),
    legacySchedules: readUnsigned(value[19]),
    genericAssignments: readUnsigned(value[32]),
    genericOccupations: readUnsigned(value[33]),
    genericSchedules: readUnsigned(value[34]),
    genericCommandReceipts: readUnsigned(value[35]),
  });
  if (
    !['draining', 'active'].includes(status.phase)
    || status.expectedCastleCount !== expectedCastleCount
    || status.expectedWorkerCount !== expectedCastleCount * 4n
    || status.actualCastleCount !== expectedCastleCount
    || status.actualWorkerCount !== expectedCastleCount * 4n
    || typeof status.rosterDigest !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.rosterDigest)
    || status.malformedWorkerGraphRows !== 0n
    || status.resourceAccounts !== expectedCastleCount
    || status.missingResourceAccounts !== 0n
    || status.orphanedResourceAccounts !== 0n
    || status.resourceInvariantViolations !== 0n
    || typeof status.resourceRosterDigest !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.resourceRosterDigest)
    || status.canonicalResourceCatalog !== true
    || typeof status.resourceCatalogDigest !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.resourceCatalogDigest)
    || status.legacyExpeditions !== 0n
    || status.legacyOccupations !== 0n
    || status.legacySchedules !== 0n
  ) fail('Worker aggregate was not ready for local activation.');
  return status;
}

function readOptionalString(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (
    Array.isArray(value)
    && value.length === 2
    && value[0] === 1
    && (
      (Array.isArray(value[1]) && value[1].length === 0)
      || (
        value[1] !== null
        && typeof value[1] === 'object'
        && !Array.isArray(value[1])
        && Object.keys(value[1]).length === 0
      )
    )
  ) return undefined;
  if (
    Array.isArray(value)
    && value.length === 2
    && value[0] === 0
    && typeof value[1] === 'string'
  ) return value[1];
  if (
    typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 1
  ) {
    if (typeof value.some === 'string') return value.some;
    if (
      Object.hasOwn(value, 'none')
      && (
        value.none === null
        || value.none === undefined
        || (Array.isArray(value.none) && value.none.length === 0)
      )
    ) return undefined;
  }
  const shape = Array.isArray(value)
    ? `array-${value.length}-${value.map((entry) => (
        typeof entry === 'string' && /^(?:some|none)$/i.test(entry)
          ? entry.toLowerCase()
          : typeof entry === 'number' && Number.isInteger(entry)
            ? `tag${entry}`
            : entry !== null && typeof entry === 'object' && !Array.isArray(entry)
              ? `object${Object.keys(entry).sort().join('-').replace(/[^a-z0-9-]/gi, '')}`
          : typeof entry
      )).join('-')}`
    : value !== null && typeof value === 'object'
      ? `object-${Object.keys(value).sort().join('-').replace(/[^a-z0-9-]/gi, '')}`
      : typeof value;
  fail(`Worker control projection option shape was invalid (${shape}).`);
}

function readOptionalValue(value) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value) && value.length === 2) {
    if (value[0] === 0) return value[1];
    if (value[0] === 1) return undefined;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'some') return value.some;
    if (keys.length === 1 && keys[0] === 'none') return undefined;
  }
  return value;
}

function readOptionalUnsigned(value) {
  const unwrapped = readOptionalValue(value);
  return unwrapped === undefined ? undefined : readUnsigned(unwrapped);
}

function parseInnerKeepCatalogPlan(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Inner Keep catalog plan JSON was invalid.');
  }
  if (
    !Array.isArray(value)
    || value.length !== 5
    || ![0n, 1n].includes(readUnsigned(value[0]))
    || ![0n, 12n].includes(readUnsigned(value[1]))
    || ![0n, 4n].includes(readUnsigned(value[2]))
    || ![0n, 20n].includes(readUnsigned(value[3]))
    || typeof value[4] !== 'boolean'
  ) fail('Inner Keep catalog plan was invalid.');
  const plan = Object.freeze({
    missingLayout: Number(readUnsigned(value[0])),
    missingSlots: Number(readUnsigned(value[1])),
    missingBuildings: Number(readUnsigned(value[2])),
    missingLevels: Number(readUnsigned(value[3])),
    ready: value[4],
  });
  if (plan.ready !== (
    plan.missingLayout === 0
    && plan.missingSlots === 0
    && plan.missingBuildings === 0
    && plan.missingLevels === 0
  )) fail('Inner Keep catalog plan readiness was invalid.');
  return plan;
}

function parseInnerKeepBuilderPlan(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Inner Keep Builder plan JSON was invalid.');
  }
  if (!Array.isArray(value) || value.length !== 4 || typeof value[3] !== 'boolean') {
    fail('Inner Keep Builder plan was invalid.');
  }
  const plan = Object.freeze({
    expectedCastles: Number(readUnsigned(value[0])),
    existingBuilders: Number(readUnsigned(value[1])),
    missingBuilders: Number(readUnsigned(value[2])),
    ready: value[3],
  });
  if (
    plan.expectedCastles !== LOCAL_FULLSTACK_FOUNDER_COUNT
    || plan.existingBuilders + plan.missingBuilders !== plan.expectedCastles
    || plan.ready !== (plan.existingBuilders === plan.expectedCastles)
  ) fail('Inner Keep Builder plan readiness was invalid.');
  return plan;
}

function parseInnerKeepStatus(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Inner Keep aggregate JSON was invalid.');
  }
  if (!Array.isArray(value) || value.length !== 27) {
    fail('Inner Keep aggregate shape was invalid.');
  }
  const status = Object.freeze({
    layoutRows: readUnsigned(value[0]),
    slotRows: readUnsigned(value[1]),
    buildingCatalogRows: readUnsigned(value[2]),
    levelPolicyRows: readUnsigned(value[3]),
    castleRows: readUnsigned(value[4]),
    builderRows: readUnsigned(value[5]),
    buildingRows: readUnsigned(value[6]),
    activeProjects: readUnsigned(value[7]),
    receiptRows: readUnsigned(value[8]),
    scheduleRows: readUnsigned(value[9]),
    missingBuilders: readUnsigned(value[10]),
    orphanBuilders: readUnsigned(value[11]),
    invalidBuilders: readUnsigned(value[12]),
    invalidBuildings: readUnsigned(value[13]),
    invalidSchedules: readUnsigned(value[14]),
    builderProjectMismatches: readUnsigned(value[15]),
    staticCatalogExact: value[16],
    workerSystemReady: value[17],
    readyForCatalogSeed: value[18],
    readyForBuilderBackfill: value[19],
    readyForActivation: value[20],
    active: value[21],
    policyVersion: value[22],
    policyDigest: value[23],
    layoutPolicyVersion: value[24],
    layoutDigest: value[25],
    assetCatalogDigest: value[26],
  });
  if (
    [
      status.staticCatalogExact,
      status.workerSystemReady,
      status.readyForCatalogSeed,
      status.readyForBuilderBackfill,
      status.readyForActivation,
      status.active,
    ].some((entry) => typeof entry !== 'boolean')
    || status.policyVersion !== INNER_KEEP_POLICY_VERSION
    || status.policyDigest !== INNER_KEEP_POLICY_DIGEST
    || status.layoutPolicyVersion !== INNER_KEEP_LAYOUT_POLICY_VERSION
    || status.layoutDigest !== INNER_KEEP_LAYOUT_DIGEST
    || status.assetCatalogDigest !== INNER_KEEP_ASSET_CATALOG_DIGEST
  ) fail('Inner Keep aggregate policy was invalid.');
  return status;
}

function parseInnerKeepPrivateState(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Inner Keep private projection JSON was invalid.');
  }
  if (!Array.isArray(value) || value.length !== 21) {
    fail('Inner Keep private projection shape was invalid.');
  }
  const state = Object.freeze({
    castleId: readUnsigned(value[0]),
    componentActive: value[1],
    componentReady: value[2],
    builderPresent: value[3],
    builderBusy: value[4],
    activeBuildingKey: readOptionalString(value[5]),
    busyUntilMicros: readOptionalUnsigned(value[6]),
    builderRevision: readUnsigned(value[7]),
    food: readUnsigned(value[8]),
    wood: readUnsigned(value[9]),
    stone: readUnsigned(value[10]),
    gold: readUnsigned(value[11]),
    projectedFood: readUnsigned(value[12]),
    projectedWood: readUnsigned(value[13]),
    projectedStone: readUnsigned(value[14]),
    projectedGold: readUnsigned(value[15]),
    resourceRevision: readUnsigned(value[16]),
    observedAtMicros: readUnsigned(value[17]),
    policyVersion: value[18],
    layoutDigest: value[19],
    assetCatalogDigest: value[20],
  });
  if (
    [state.componentActive, state.componentReady, state.builderPresent, state.builderBusy]
      .some((entry) => typeof entry !== 'boolean')
    || state.castleId === 0n
    || state.policyVersion !== INNER_KEEP_POLICY_VERSION
    || state.layoutDigest !== INNER_KEEP_LAYOUT_DIGEST
    || state.assetCatalogDigest !== INNER_KEEP_ASSET_CATALOG_DIGEST
    || (state.activeBuildingKey === undefined) !== (state.busyUntilMicros === undefined)
  ) fail('Inner Keep private projection was invalid.');
  return state;
}

function parseInnerKeepReceipt(text, expectedRequestKey) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Inner Keep receipt JSON was invalid.');
  }
  if (!Array.isArray(value) || value.length !== 12 || value[0] !== true) {
    fail('Inner Keep receipt shape was invalid.');
  }
  const receipt = Object.freeze({
    castleId: readOptionalUnsigned(value[1]),
    buildingKey: readOptionalString(value[2]),
    slotId: readOptionalString(value[3]),
    buildingKind: readOptionalString(value[4]),
    targetLevel: readOptionalUnsigned(value[5]),
    deductedFood: readOptionalUnsigned(value[6]),
    deductedWood: readOptionalUnsigned(value[7]),
    deductedStone: readOptionalUnsigned(value[8]),
    deductedGold: readOptionalUnsigned(value[9]),
    startedAtMicros: readOptionalUnsigned(value[10]),
    policyVersion: readOptionalString(value[11]),
    requestKey: expectedRequestKey,
  });
  if (
    receipt.castleId === undefined
    || receipt.castleId === 0n
    || receipt.buildingKey === undefined
    || receipt.slotId === undefined
    || receipt.buildingKind === undefined
    || receipt.targetLevel === undefined
    || receipt.deductedFood === undefined
    || receipt.deductedWood === undefined
    || receipt.deductedStone === undefined
    || receipt.deductedGold === undefined
    || receipt.startedAtMicros === undefined
    || receipt.policyVersion !== INNER_KEEP_POLICY_VERSION
  ) fail('Inner Keep receipt was incomplete.');
  return receipt;
}

function parseWorkerControlState(text, expectedFid = BigInt(LOCAL_FULLSTACK_FID)) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Worker control projection JSON was invalid.');
  }
  if (!Array.isArray(value) || value.length !== 17 || !Array.isArray(value[3])) {
    fail('Worker control projection outer shape was invalid.');
  }
  const workers = value[3].map((worker) => {
    if (
      !Array.isArray(worker)
      || worker.length !== 10
      || typeof worker[0] !== 'string'
      || !/^[a-z]+$/.test(worker[2])
    ) fail('Worker control projection Worker shape was invalid.');
    return Object.freeze({
      workerId: worker[0],
      ordinal: Number(readUnsigned(worker[1])),
      status: worker[2],
      resourceKind: readOptionalString(worker[3]),
      siteId: readOptionalString(worker[4]),
      accruedAmount: readUnsigned(worker[5]),
      materializedAmount: readUnsigned(worker[6]),
      availableAmount: readUnsigned(worker[7]),
      observedAtMicros: readUnsigned(worker[8]),
      revision: readUnsigned(worker[9]),
    });
  });
  const state = Object.freeze({
    fid: readUnsigned(value[0]),
    castleId: readUnsigned(value[1]),
    observedAtMicros: readUnsigned(value[2]),
    workers: Object.freeze(workers),
    food: readUnsigned(value[4]),
    wood: readUnsigned(value[5]),
    stone: readUnsigned(value[6]),
    gold: readUnsigned(value[7]),
    pendingFood: readUnsigned(value[8]),
    pendingWood: readUnsigned(value[9]),
    pendingStone: readUnsigned(value[10]),
    pendingGold: readUnsigned(value[11]),
    settledThroughMicros: readUnsigned(value[12]),
    revision: readUnsigned(value[13]),
    resourcePolicyVersion: value[14],
    workerPolicyVersion: value[15],
    workerSystemMode: value[16],
  });
  if (
    state.fid !== expectedFid
    || state.castleId === 0n
    || state.workers.length !== 4
    || state.workers.some((worker, index) => (
      worker.ordinal !== index + 1
      || worker.workerId !== (
        `genesis-001-castle-${state.castleId}-worker-${
          String(index + 1).padStart(2, '0')
        }`
      )
      || worker.observedAtMicros !== state.observedAtMicros
    ))
    || state.settledThroughMicros > state.observedAtMicros
    || state.resourcePolicyVersion !== RESOURCE_POLICY_VERSION
    || state.workerPolicyVersion !== 'genesis-001-castle-workers-v1'
    || state.workerSystemMode !== 'active'
  ) fail('Worker control projection invariant was invalid.');
  return state;
}

async function waitForLocalWorkerState(readState, predicate, deadlineMilliseconds) {
  const deadline = Date.now() + deadlineMilliseconds;
  while (Date.now() <= deadline) {
    const state = await readState();
    if (predicate(state)) return state;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  fail('Production-shaped local Worker state did not become ready.');
}

export async function terminateLocalFullstackProcessGroup(child, options = {}) {
  if (!child?.pid) return;
  const killProcessGroup = options.killProcessGroup
    ?? ((pid, signal) => process.kill(-pid, signal));
  const killChild = options.killChild
    ?? ((processChild, signal) => processChild.kill(signal));
  const wait = options.wait
    ?? ((milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)));
  const running = child.exitCode === null && child.signalCode === null;
  const closed = running
    ? new Promise((resolveClose) => child.once('close', resolveClose))
    : Promise.resolve();
  const send = (signal) => {
    try { killProcessGroup(child.pid, signal); } catch {
      try { killChild(child, signal); } catch { /* Already stopped. */ }
    }
  };
  send('SIGTERM');
  if (running) {
    await Promise.race([
      closed,
      wait(SERVER_STOP_TIMEOUT_MILLISECONDS),
    ]);
  }
  send('SIGKILL');
  if (running) {
    await Promise.race([
      closed,
      wait(SERVER_STOP_TIMEOUT_MILLISECONDS),
    ]);
  }
  try {
    killProcessGroup(child.pid, 0);
    fail('Disposable SpacetimeDB process group remained alive.');
  } catch (error) {
    if (error instanceof LocalFullstackRuntimeError) throw error;
    if (error?.code !== 'ESRCH') {
      fail('Disposable SpacetimeDB process group could not be verified as stopped.');
    }
  }
}

async function seedLocalRealm(server, privateKey, moduleDigest) {
  const adminCredential = () => createEphemeralJwt(privateKey, localAdminClaims());
  const callAdmin = (name, body = '[]', timeout = 30_000) => callLocalProcedure({
    server,
    database: LOCAL_FULLSTACK_DATABASE,
    name,
    credential: adminCredential(),
    body,
    timeout,
  });
  await callAdmin('admin_seed_world', '[]', 120_000);
  await callAdmin('admin_seed_genesis_forest_layout_v1');
  for (const [name, count, policy] of [
    ['admin_seed_genesis_tier_i_gold_sites_v1', 24, 'genesis-001-tier1-gold-sites-v3'],
    ['admin_seed_genesis_tier_i_food_sites_v1', 96, 'genesis-001-tier1-food-sites-v2'],
    ['admin_seed_genesis_tier_i_wood_sites_v1', 96, 'genesis-001-tier1-wood-sites-v2'],
    ['admin_seed_genesis_tier_i_stone_sites_v1', 96, 'genesis-001-tier1-stone-sites-v3'],
  ]) {
    await callAdmin(name, JSON.stringify([count, policy]), 120_000);
  }
  await callAdmin('admin_seed_genesis_water_layout_v1', '[]', 120_000);
  await callAdmin('admin_activate_genesis_water_layout_v1', '[]', 120_000);
  await callAdmin('admin_seed_genesis_water_revision_v1', '[]', 120_000);
  await callAdmin('admin_activate_genesis_water_revision_v1', '[]', 120_000);
  for (const founder of LOCAL_FULLSTACK_FOUNDERS) {
    await callAdmin('admin_admit_founder_v1', JSON.stringify([
      founder.fid,
      'disposable local full-stack browser fixture',
      founder.username,
      { some: founder.displayName },
      LOCAL_FULLSTACK_PROFILE_URL,
      { some: 'Synthetic loopback-only founder' },
      PROFILE_POLICY_VERSION,
    ]));
  }
  await callAdmin('admin_stage_worker_system_v1');
  await callAdmin('admin_backfill_worker_roster_v1');
  await callAdmin('admin_begin_worker_legacy_drain_v1');
  const draining = parseWorkerRollout(await callAdmin('admin_get_worker_rollout_status_v2'));
  await callAdmin('admin_activate_worker_system_v1', JSON.stringify([
    WORKER_PROTOCOL_CAPABILITY,
    'alpha-0.3.18',
    LOCAL_CLIENT_ARTIFACT_DIGEST,
    moduleDigest,
    LOCAL_SOURCE_COMMIT,
    2,
    RESOURCE_POLICY_VERSION,
    draining.resourceCatalogDigest,
    Number(draining.expectedCastleCount),
    Number(draining.expectedWorkerCount),
    draining.rosterDigest,
    draining.resourceRosterDigest,
  ]));
  const active = parseWorkerRollout(await callAdmin('admin_get_worker_rollout_status_v2'));
  if (active.phase !== 'active') fail('Worker system did not activate locally.');

  const catalogPlan = parseInnerKeepCatalogPlan(
    await callAdmin('admin_plan_inner_keep_catalog_v1')
  );
  if (
    catalogPlan.missingLayout !== 1
    || catalogPlan.missingSlots !== 12
    || catalogPlan.missingBuildings !== 4
    || catalogPlan.missingLevels !== 20
    || catalogPlan.ready
  ) fail('Inner Keep catalog did not begin from the exact empty state.');
  await callAdmin('admin_seed_inner_keep_catalog_v1', JSON.stringify([
    INNER_KEEP_PROTOCOL_CAPABILITY,
    INNER_KEEP_POLICY_DIGEST,
    INNER_KEEP_LAYOUT_DIGEST,
    INNER_KEEP_ASSET_CATALOG_DIGEST,
    catalogPlan.missingLayout,
    catalogPlan.missingSlots,
    catalogPlan.missingBuildings,
    catalogPlan.missingLevels,
  ]));
  const builderPlan = parseInnerKeepBuilderPlan(
    await callAdmin('admin_plan_inner_keep_builders_v1')
  );
  if (
    builderPlan.expectedCastles !== LOCAL_FULLSTACK_FOUNDER_COUNT
    || builderPlan.existingBuilders !== 0
    || builderPlan.missingBuilders !== LOCAL_FULLSTACK_FOUNDER_COUNT
    || builderPlan.ready
  ) fail('Inner Keep Builder graph did not begin from the exact empty state.');
  await callAdmin('admin_backfill_inner_keep_builders_v1', JSON.stringify([
    INNER_KEEP_PROTOCOL_CAPABILITY,
    INNER_KEEP_POLICY_DIGEST,
    INNER_KEEP_LAYOUT_DIGEST,
    INNER_KEEP_ASSET_CATALOG_DIGEST,
    builderPlan.expectedCastles,
    builderPlan.existingBuilders,
    builderPlan.missingBuilders,
  ]));
  await callAdmin('admin_activate_inner_keep_v1', JSON.stringify([
    INNER_KEEP_PROTOCOL_CAPABILITY,
    INNER_KEEP_POLICY_DIGEST,
    INNER_KEEP_LAYOUT_DIGEST,
    INNER_KEEP_ASSET_CATALOG_DIGEST,
    'alpha-0.3.18',
    LOCAL_CLIENT_ARTIFACT_DIGEST,
    moduleDigest,
    LOCAL_SOURCE_COMMIT,
    LOCAL_FULLSTACK_FOUNDER_COUNT,
  ]));
  const activeInnerKeep = parseInnerKeepStatus(
    await callAdmin('admin_get_inner_keep_status_v1')
  );
  if (
    activeInnerKeep.layoutRows !== 1n
    || activeInnerKeep.slotRows !== 12n
    || activeInnerKeep.buildingCatalogRows !== 4n
    || activeInnerKeep.levelPolicyRows !== 20n
    || activeInnerKeep.castleRows !== BigInt(LOCAL_FULLSTACK_FOUNDER_COUNT)
    || activeInnerKeep.builderRows !== BigInt(LOCAL_FULLSTACK_FOUNDER_COUNT)
    || activeInnerKeep.buildingRows !== 0n
    || activeInnerKeep.activeProjects !== 0n
    || activeInnerKeep.receiptRows !== 0n
    || activeInnerKeep.scheduleRows !== 0n
    || activeInnerKeep.missingBuilders !== 0n
    || activeInnerKeep.orphanBuilders !== 0n
    || activeInnerKeep.invalidBuilders !== 0n
    || activeInnerKeep.invalidBuildings !== 0n
    || activeInnerKeep.invalidSchedules !== 0n
    || activeInnerKeep.builderProjectMismatches !== 0n
    || !activeInnerKeep.staticCatalogExact
    || !activeInnerKeep.workerSystemReady
    || !activeInnerKeep.active
  ) fail('Inner Keep did not activate from the exact disposable state.');

  const playerCredential = createEphemeralJwt(
    privateKey,
    localPlayerClaims(LOCAL_FULLSTACK_FID)
  );
  const callPlayer = (name, body = '[]', timeout = 30_000) => callLocalProcedure({
    server,
    database: LOCAL_FULLSTACK_DATABASE,
    name,
    credential: playerCredential,
    body,
    timeout,
  });
  const initialAdmission = JSON.parse(
    await callPlayer('get_my_admission_status_v2')
  );
  if (initialAdmission !== 'admitted_needs_bootstrap') {
    fail('Disposable founder did not require exact local bootstrap.');
  }
  await callPlayer('bootstrap_player_v2');
  await callPlayer('accept_alpha_terms_v1', JSON.stringify([
    WARPKEEP_ENTRY_AGREEMENT_VERSION,
    true,
  ]));
  const currentEntryAgreement = JSON.parse(
    await callPlayer('get_my_entry_agreement_status_v1')
  );
  if (
    !Array.isArray(currentEntryAgreement)
    || currentEntryAgreement.length !== 2
    || currentEntryAgreement[0] !== WARPKEEP_ENTRY_AGREEMENT_VERSION
    || currentEntryAgreement[1] !== true
  ) {
    fail('Disposable founder did not retain exact-current entry agreement authority.');
  }
  const readyAdmission = JSON.parse(
    await callPlayer('get_my_admission_status_v2')
  );
  if (readyAdmission !== 'ready') {
    fail('Disposable founder did not become locally ready.');
  }

  const initialInnerKeepState = parseInnerKeepPrivateState(
    await callPlayer('get_my_inner_keep_state_v1')
  );
  if (
    !initialInnerKeepState.componentActive
    || !initialInnerKeepState.componentReady
    || !initialInnerKeepState.builderPresent
    || initialInnerKeepState.builderBusy
    || initialInnerKeepState.activeBuildingKey !== undefined
    || initialInnerKeepState.busyUntilMicros !== undefined
    || initialInnerKeepState.builderRevision !== 0n
    || initialInnerKeepState.food !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.food
    || initialInnerKeepState.wood !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.wood
    || initialInnerKeepState.stone !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.stone
    || initialInnerKeepState.gold !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.gold
    || initialInnerKeepState.projectedFood !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.food
    || initialInnerKeepState.projectedWood !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.wood
    || initialInnerKeepState.projectedStone !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.stone
    || initialInnerKeepState.projectedGold !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.gold
    || initialInnerKeepState.resourceRevision !== 0n
  ) fail('Disposable Inner Keep founder did not begin with exact bounded authority.');

  const readControlState = async () => parseWorkerControlState(
    await callPlayer('get_my_worker_control_state_v1')
  );
  let innerKeepJourneyAttested = false;
  const inspectInnerKeepFirstProject = async (requestKey) => {
    if (
      typeof requestKey !== 'string'
      || !/^[a-z0-9][a-z0-9-]{15,79}$/.test(requestKey)
    ) fail('Disposable Inner Keep request key was invalid.');
    const [receipt, state, aggregate, workers] = await Promise.all([
      callPlayer(
        'get_my_inner_keep_request_status_v1',
        JSON.stringify([requestKey])
      ).then((text) => parseInnerKeepReceipt(text, requestKey)),
      callPlayer('get_my_inner_keep_state_v1').then(parseInnerKeepPrivateState),
      callAdmin('admin_get_inner_keep_status_v1').then(parseInnerKeepStatus),
      readControlState(),
    ]);
    if (
      receipt.slotId !== 'inner-keep-slot-m01'
      || receipt.buildingKind !== 'city-mill'
      || receipt.targetLevel !== 1n
      || receipt.deductedFood !== 300n
      || receipt.deductedWood !== 900n
      || receipt.deductedStone !== 600n
      || receipt.deductedGold !== 0n
      || !state.componentActive
      || !state.componentReady
      || !state.builderPresent
      || !state.builderBusy
      || state.activeBuildingKey !== receipt.buildingKey
      || state.busyUntilMicros === undefined
      || state.builderRevision !== 1n
      || state.food !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.food - 300n
      || state.wood !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.wood - 900n
      || state.stone !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.stone - 600n
      || state.gold !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.gold
      || state.resourceRevision !== 1n
      || aggregate.buildingRows !== 1n
      || aggregate.activeProjects !== 1n
      || aggregate.receiptRows !== 1n
      || aggregate.scheduleRows !== 1n
      || aggregate.builderProjectMismatches !== 0n
      || aggregate.invalidBuildings !== 0n
      || aggregate.invalidSchedules !== 0n
      || workers.revision !== 1n
      || workers.workers.some((worker) => (
        worker.status !== 'idle'
        || worker.revision !== 0n
        || worker.resourceKind !== undefined
        || worker.siteId !== undefined
      ))
    ) fail('Disposable Inner Keep first project was not exact and atomic.');
    return Object.freeze({
      activeProjects: 1,
      builderRows: Number(aggregate.builderRows),
      buildingRows: 1,
      deductedFood: receipt.deductedFood.toString(),
      deductedGold: receipt.deductedGold.toString(),
      deductedStone: receipt.deductedStone.toString(),
      deductedWood: receipt.deductedWood.toString(),
      receiptRows: 1,
      resourceRevision: state.resourceRevision.toString(),
      scheduleRows: 1,
      workerCount: workers.workers.length,
    });
  };
  const attestInnerKeepJourney = async (requestKeys) => {
    if (
      !Array.isArray(requestKeys)
      || requestKeys.length !== 2
      || new Set(requestKeys).size !== 2
      || requestKeys.some((key) => (
        typeof key !== 'string'
        || !/^[a-z0-9][a-z0-9-]{15,79}$/.test(key)
      ))
    ) fail('Disposable Inner Keep request keys were invalid.');
    const [firstReceipt, secondReceipt] = await Promise.all(requestKeys.map(
      async (requestKey) => parseInnerKeepReceipt(
        await callPlayer(
          'get_my_inner_keep_request_status_v1',
          JSON.stringify([requestKey])
        ),
        requestKey
      )
    ));
    const [state, aggregate, workers] = await Promise.all([
      callPlayer('get_my_inner_keep_state_v1').then(parseInnerKeepPrivateState),
      callAdmin('admin_get_inner_keep_status_v1').then(parseInnerKeepStatus),
      readControlState(),
    ]);
    const expectedFood = LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.food - 300n - 480n;
    const expectedWood = LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.wood - 900n - 700n;
    const expectedStone = LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.stone - 600n - 650n;
    if (
      firstReceipt.slotId !== 'inner-keep-slot-m01'
      || firstReceipt.buildingKind !== 'city-mill'
      || firstReceipt.targetLevel !== 1n
      || firstReceipt.deductedFood !== 300n
      || firstReceipt.deductedWood !== 900n
      || firstReceipt.deductedStone !== 600n
      || firstReceipt.deductedGold !== 0n
      || secondReceipt.slotId !== 'inner-keep-slot-m02'
      || secondReceipt.buildingKind !== 'lumber-camp'
      || secondReceipt.targetLevel !== 1n
      || secondReceipt.deductedFood !== 480n
      || secondReceipt.deductedWood !== 700n
      || secondReceipt.deductedStone !== 650n
      || secondReceipt.deductedGold !== 0n
      || firstReceipt.castleId !== secondReceipt.castleId
      || firstReceipt.buildingKey === secondReceipt.buildingKey
      || !state.componentActive
      || !state.componentReady
      || !state.builderPresent
      || !state.builderBusy
      || state.activeBuildingKey !== secondReceipt.buildingKey
      || state.busyUntilMicros === undefined
      || state.builderRevision !== 3n
      || state.food !== expectedFood
      || state.wood !== expectedWood
      || state.stone !== expectedStone
      || state.gold !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.gold
      || state.projectedFood !== expectedFood
      || state.projectedWood !== expectedWood
      || state.projectedStone !== expectedStone
      || state.projectedGold !== LOCAL_FULLSTACK_INNER_KEEP_RESOURCES.gold
      || state.resourceRevision !== 2n
      || aggregate.layoutRows !== 1n
      || aggregate.slotRows !== 12n
      || aggregate.buildingCatalogRows !== 4n
      || aggregate.levelPolicyRows !== 20n
      || aggregate.castleRows !== BigInt(LOCAL_FULLSTACK_FOUNDER_COUNT)
      || aggregate.builderRows !== BigInt(LOCAL_FULLSTACK_FOUNDER_COUNT)
      || aggregate.buildingRows !== 2n
      || aggregate.activeProjects !== 1n
      || aggregate.receiptRows !== 2n
      || aggregate.scheduleRows !== 1n
      || aggregate.missingBuilders !== 0n
      || aggregate.orphanBuilders !== 0n
      || aggregate.invalidBuilders !== 0n
      || aggregate.invalidBuildings !== 0n
      || aggregate.invalidSchedules !== 0n
      || aggregate.builderProjectMismatches !== 0n
      || !aggregate.staticCatalogExact
      || !aggregate.workerSystemReady
      || !aggregate.active
      || workers.revision !== 2n
      || workers.workers.some((worker) => (
        worker.status !== 'idle'
        || worker.revision !== 0n
        || worker.resourceKind !== undefined
        || worker.siteId !== undefined
      ))
    ) fail('Disposable Inner Keep journey did not retain exact authority.');
    innerKeepJourneyAttested = true;
    return Object.freeze({
      activeProjects: Number(aggregate.activeProjects),
      builderRevision: state.builderRevision.toString(),
      buildingRows: Number(aggregate.buildingRows),
      exactDeductions: Object.freeze([
        Object.freeze({ food: '300', wood: '900', stone: '600', gold: '0' }),
        Object.freeze({ food: '480', wood: '700', stone: '650', gold: '0' }),
      ]),
      receiptRows: Number(aggregate.receiptRows),
      resourceRevision: state.resourceRevision.toString(),
      scheduleRows: Number(aggregate.scheduleRows),
      workerCount: workers.workers.length,
    });
  };
  let preparedAttestation;
  const prepareWorkerScenario = async () => {
    if (preparedAttestation) return preparedAttestation;
    if (!innerKeepJourneyAttested) {
      fail('Disposable Worker preparation requires the completed Inner Keep journey.');
    }
    const idleState = await readControlState();
    if (
      idleState.revision !== 2n
      || idleState.workers.some((worker) => (
        worker.status !== 'idle'
        || worker.revision !== 0n
        || worker.resourceKind !== undefined
        || worker.siteId !== undefined
      ))
    ) fail('Disposable Worker roster did not begin idle.');
    for (const target of LOCAL_FULLSTACK_DISPATCH_TARGETS) {
      const worker = idleState.workers[target.ordinal - 1];
      await callPlayer('dispatch_worker_v1', JSON.stringify([
        worker.workerId,
        target.resourceKind,
        target.siteId,
        `local-qa-dispatch-${String(target.ordinal).padStart(2, '0')}`,
      ]));
    }

    const gatheringState = await waitForLocalWorkerState(
      readControlState,
      (state) => (
        state.workers[0]?.status === 'outbound'
        && state.workers[1]?.status === 'outbound'
        && state.workers[2]?.status === 'gathering'
        && state.workers[3]?.status === 'outbound'
        && state.workers.every((worker, index) => (
          worker.resourceKind === LOCAL_FULLSTACK_DISPATCH_TARGETS[index]?.resourceKind
          && worker.siteId === LOCAL_FULLSTACK_DISPATCH_TARGETS[index]?.siteId
          && worker.revision > 0n
        ))
      ),
      65_000
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_250));
    const projectedBeforeSettlement = await readControlState();
    if (
      projectedBeforeSettlement.workers[2]?.availableAmount === 0n
      || projectedBeforeSettlement.pendingWood === 0n
    ) fail('Disposable Worker projection did not accrue pending resources.');
    await callPlayer('collect_resources_v1');
    const settledState = await waitForLocalWorkerState(
      readControlState,
      (state) => (
        state.wood > 0n
        && state.revision > gatheringState.revision
        && state.workers.every((worker) => worker.revision > 0n)
      ),
      10_000
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_250));
    const pendingAfterSettlement = await waitForLocalWorkerState(
      readControlState,
      (state) => (
        state.pendingWood > 0n
        && state.wood >= settledState.wood
        && state.revision >= settledState.revision
      ),
      10_000
    );
    const fourthWorker = pendingAfterSettlement.workers[3];
    await callPlayer('recall_worker_v1', JSON.stringify([
      fourthWorker.workerId,
      'local-qa-recall-worker-04',
    ]));
    const prepared = await waitForLocalWorkerState(
      readControlState,
      (state) => (
        state.workers[0]?.status === 'outbound'
        && state.workers[1]?.status === 'outbound'
        && state.workers[2]?.status === 'gathering'
        && state.workers[3]?.status === 'returning'
        && state.workers.every((worker) => worker.revision > 0n)
        && state.wood > 0n
        && state.pendingWood > 0n
        && state.revision > 0n
      ),
      10_000
    );
    const preparedRollout = parseWorkerRollout(
      await callAdmin('admin_get_worker_rollout_status_v2')
    );
    if (
      preparedRollout.phase !== 'active'
      || preparedRollout.genericAssignments !== 4n
      || preparedRollout.genericOccupations !== 3n
      || preparedRollout.genericSchedules !== 4n
      || preparedRollout.legacyExpeditions !== 0n
      || preparedRollout.legacyOccupations !== 0n
      || preparedRollout.legacySchedules !== 0n
    ) fail('Production-shaped local Worker aggregate was invalid.');
    preparedAttestation = Object.freeze({
      castleCount: Number(active.expectedCastleCount),
      workerCount: Number(active.actualWorkerCount),
      ownerCastleId: Number(prepared.castleId),
      ownerStoredWood: prepared.wood.toString(),
      ownerPendingWood: prepared.pendingWood.toString(),
      ownerResourceRevision: prepared.revision.toString(),
      ownerWorkerRevisions: Object.freeze(
        prepared.workers.map((worker) => worker.revision.toString())
      ),
      genericAssignments: Number(preparedRollout.genericAssignments),
      genericOccupations: Number(preparedRollout.genericOccupations),
      genericSchedules: Number(preparedRollout.genericSchedules),
      legacyExpeditions: Number(preparedRollout.legacyExpeditions),
      legacyOccupations: Number(preparedRollout.legacyOccupations),
      legacySchedules: Number(preparedRollout.legacySchedules),
    });
    return preparedAttestation;
  };
  return Object.freeze({
    seedAttestation: Object.freeze({
      castleCount: Number(active.expectedCastleCount),
      workerCount: Number(active.actualWorkerCount),
      innerKeepActive: activeInnerKeep.active,
      innerKeepBuilderCount: Number(activeInnerKeep.builderRows),
      innerKeepCatalogRows: Number(
        activeInnerKeep.layoutRows
        + activeInnerKeep.slotRows
        + activeInnerKeep.buildingCatalogRows
        + activeInnerKeep.levelPolicyRows
      ),
      innerKeepInitialResources: Object.freeze({
        food: initialInnerKeepState.food.toString(),
        wood: initialInnerKeepState.wood.toString(),
        stone: initialInnerKeepState.stone.toString(),
        gold: initialInnerKeepState.gold.toString(),
      }),
      entryAgreementAcceptedCurrent: currentEntryAgreement[1],
      entryAgreementRequiredVersion: currentEntryAgreement[0],
      genericAssignments: Number(active.genericAssignments),
      genericOccupations: Number(active.genericOccupations),
      genericSchedules: Number(active.genericSchedules),
      legacyExpeditions: Number(active.legacyExpeditions),
      legacyOccupations: Number(active.legacyOccupations),
      legacySchedules: Number(active.legacySchedules),
    }),
    attestInnerKeepJourney,
    inspectInnerKeepFirstProject,
    prepareWorkerScenario,
  });
}

export async function startDisposableLocalFullstackSpacetime(options = {}) {
  if (
    options === null
    || typeof options !== 'object'
    || (options.onLifecycle !== undefined && typeof options.onLifecycle !== 'function')
  ) fail('Disposable runtime options were invalid.');
  const requestedRoot = options.runtimeDirectory;
  const runtimeDirectory = requestedRoot === undefined
    ? await mkdtemp(join(tmpdir(), 'warpkeep-local-fullstack-'))
    : exactPrivateDirectory(requestedRoot);
  await chmod(runtimeDirectory, 0o700);
  const rootMetadata = await lstat(runtimeDirectory);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    fail('Disposable runtime root was unsafe.');
  }
  const environment = childEnvironment(runtimeDirectory, options.environment);
  let cliSnapshot;
  let activeCliProcess;
  let serverProcess;
  let closePromise;
  const close = () => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      let firstFailure;
      try {
        await terminateLocalFullstackProcessGroup(activeCliProcess);
      } catch (error) {
        firstFailure = error;
      }
      try {
        await terminateLocalFullstackProcessGroup(serverProcess);
      } catch (error) {
        firstFailure ??= error;
      }
      try {
        await rm(runtimeDirectory, { recursive: true, force: true });
      } catch (error) {
        firstFailure ??= error;
      }
      try { cliSnapshot?.cleanup(); } catch (error) { firstFailure ??= error; }
      if (firstFailure) throw firstFailure;
    })();
    return closePromise;
  };
  const assertOpen = () => {
    if (closePromise) fail('Disposable SpacetimeDB startup was cancelled.');
  };
  let startupStage = 'lifecycle-registration';
  try {
    options.onLifecycle?.(Object.freeze({ close }));
    assertOpen();
    startupStage = 'cli-attestation';
    cliSnapshot = attestPinnedSpacetimeCli(
      options.spacetimeExecutable ?? process.env.SPACETIME_BIN ?? 'spacetime',
      undefined,
      environment,
    );
    assertOpen();
    startupStage = 'module-copy';
    const moduleDirectory = await createLocalModule(runtimeDirectory);
    assertOpen();
    startupStage = 'ephemeral-key-generation';
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const publicKeyPath = join(runtimeDirectory, 'jwt-public.pem');
    const privateKeyPath = join(runtimeDirectory, 'jwt-private.pem');
    startupStage = 'ephemeral-key-write';
    await writeFile(publicKeyPath, publicKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await writeFile(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    assertOpen();
    startupStage = 'loopback-port-reservation';
    const port = await freeLoopbackPort();
    assertOpen();
    const server = `http://127.0.0.1:${port}`;
    startupStage = 'spacetimedb-spawn';
    serverProcess = spawn(cliSnapshot.path, [
      'start',
      '--listen-addr', `127.0.0.1:${port}`,
      '--in-memory',
      '--data-dir', join(runtimeDirectory, 'database'),
      '--jwt-pub-key-path', publicKeyPath,
      '--jwt-priv-key-path', privateKeyPath,
      '--non-interactive',
    ], {
      cwd: REPOSITORY_ROOT,
      detached: true,
      env: environment,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    serverProcess.on('error', () => {});
    startupStage = 'spacetimedb-readiness';
    const owner = await acquireDisposableIdentity(server);
    assertOpen();
    const cliConfigPath = join(runtimeDirectory, 'spacetime-cli.toml');
    startupStage = 'cli-config-write';
    await writeFile(
      cliConfigPath,
      `spacetimedb_token = ${JSON.stringify(owner.token)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' }
    );
    assertOpen();
    const publishArguments = [
      `--config-path=${cliConfigPath}`,
      'publish',
      '--server', server,
      '--module-path', moduleDirectory,
      '--delete-data=never',
      '--no-config',
      LOCAL_FULLSTACK_DATABASE,
    ];
    if (
      publishArguments.includes('--break-clients')
      || publishArguments.some((value) => value.startsWith('--yes'))
      || publishArguments.filter((value) => value === '--delete-data=never').length !== 1
    ) fail('Disposable module publication arguments were unsafe.');
    startupStage = 'module-publication';
    const published = await runDisposableLocalFullstackCli(cliSnapshot.path, publishArguments, {
      environment,
      onProcess(nextProcess, completedProcess) {
        if (nextProcess) activeCliProcess = nextProcess;
        else if (activeCliProcess === completedProcess) activeCliProcess = undefined;
      },
      secrets: [owner.token],
      timeout: COMMAND_TIMEOUT_MILLISECONDS,
    });
    assertOpen();
    if (published.code !== 0) fail('Disposable module publication failed safely.');
    startupStage = 'module-artifact-attestation';
    const artifactPath = join(moduleDirectory, 'dist', 'bundle.js');
    const artifact = await readFile(artifactPath);
    assertOpen();
    const artifactText = artifact.toString('utf8');
    if (
      !artifactText.includes(LOCAL_FULLSTACK_ISSUER)
      || !artifactText.includes(LOCAL_FULLSTACK_AUDIENCE)
      // This scans generated JavaScript bytes for a forbidden build input; it
      // is deliberately not hostname or URL validation.
      || artifact.indexOf(PRODUCTION_OIDC_ISSUER_BYTES) !== -1
    ) fail('Disposable module artifact authority was not isolated.');
    const moduleDigest = createHash('sha256').update(artifact).digest('hex');
    artifact.fill(0);
    startupStage = 'realm-seed';
    const localRealm = await seedLocalRealm(server, privateKey, moduleDigest);
    assertOpen();
    startupStage = 'player-session-probe';
    const playerClaims = localPlayerClaims();
    const playerToken = createEphemeralJwt(privateKey, playerClaims);
    await callLocalProcedure({
      server,
      database: LOCAL_FULLSTACK_DATABASE,
      name: 'get_my_admission_status_v2',
      credential: playerToken,
    });
    assertOpen();
    return Object.freeze({
      bootstrap: Object.freeze({
        version: 1,
        spacetimeUri: server,
        database: LOCAL_FULLSTACK_DATABASE,
        issuer: LOCAL_FULLSTACK_ISSUER,
        audience: LOCAL_FULLSTACK_AUDIENCE,
        fid: LOCAL_FULLSTACK_FID,
        username: 'qa.warpkeeper',
        displayName: 'Synthetic QA Keeper',
        pfpUrl: LOCAL_FULLSTACK_PROFILE_URL,
        accessToken: playerToken,
        accessExpiresAt: playerClaims.exp * 1_000,
        sessionExpiresAt: playerClaims.exp * 1_000,
      }),
      close,
      moduleDigest,
      runtimeDirectory,
      attestInnerKeepJourney: localRealm.attestInnerKeepJourney,
      inspectInnerKeepFirstProject: localRealm.inspectInnerKeepFirstProject,
      prepareWorkerScenario: localRealm.prepareWorkerScenario,
      seedAttestation: localRealm.seedAttestation,
      serverProcess,
    });
  } catch (error) {
    try { await close(); } catch {
      // Preserve the original startup failure after attempting containment.
    }
    if (error instanceof LocalFullstackRuntimeError) throw error;
    fail(`Disposable SpacetimeDB startup failed closed at ${startupStage}.`);
  }
}
