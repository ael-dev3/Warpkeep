import { spawn, type ChildProcess } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
} from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createGreaterRealmRuntimeReleaseFixtureSource,
  greaterRealmRuntimeReleaseFixtureSeed,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
} from './atlas/greater-realm-runtime-release-test-fixture';
import {
  createGreaterRealmRuntimeRelease,
  type GreaterRealmRuntimeChunkArtifact,
  type GreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  assertGreaterRealmConnectedDisposableGateMode,
  normalizeGreaterRealmConnectedDisposableGateMode,
  parseGreaterRealmConnectedProductionGateMode,
  type GreaterRealmConnectedProductionGateMode,
} from './greater-realm-connected-gate-mode';
// @ts-expect-error The migration proof deliberately exposes these shared JavaScript helpers.
import { acquireDisposableIdentity, adminServiceClaims, cleanupMigrationProofResources, containServerProcessErrors, createEphemeralJwt, freeLoopbackPort, installMigrationProofSignalCleanup } from './verify-spacetime-additive-migration.mjs';

/**
 * Audited upstream provenance, not an assertion that the integrated proof tree
 * is byte-identical to these commits. This branch additionally closes the dry
 * Lowlands tuple in the exporter verifier while preserving c4da78d's emitted
 * wire for a server-compatible source.
 */
export const GREATER_REALM_CONNECTED_AUDITED_EXPORTER_COMMIT =
  'c4da78d1895f61faf56d5c7ceb21229d5e28ff26';
export const GREATER_REALM_CONNECTED_AUDITED_SERVER_COMMITS = Object.freeze([
  '055e08e719275a29ed9cb35c7e2abfc6db4db36b',
  'a9fcee9378f3a4360e8ff22290840686fb02508b',
]);
export const GREATER_REALM_CONNECTED_DATABASE =
  'warpkeep-greater-realm-connected-import';
export const GREATER_REALM_CONNECTED_IMPORT_TIMEOUT_MILLISECONDS = 8 * 60 * 1_000;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceModule = join(repositoryRoot, 'spacetimedb');
const productionPolicyPath = join(sourceModule, 'src', 'greaterRealmV17Policy.ts');
const expectedCliVersion = '2.6.1';
const expectedCliCommit = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const command = process.env.SPACETIME_BIN || 'spacetime';
const importEpoch = 1;
const maximumCliOutputBytes = 16 * 1_024 * 1_024;
const maximumResponseBytes = 16 * 1_024 * 1_024;
const maximumSqlBytes = 256 * 1_024;
const commandTimeoutMilliseconds = 120_000;
const requestTimeoutMilliseconds = 30_000;
const copiedModuleFiles = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
]);
const safeChildEnvironmentKeys = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
]);
const exactHeaderKeys = Object.freeze([
  'schema',
  'classification',
  'atlasId',
  'publicReleaseId',
  'publicApprovalReceiptId',
  'sourceCommit',
  'generatorVersion',
  'sourceFormatVersion',
  'livingWorldVersion',
  'runtimePartitionVersion',
  'rendererContractVersion',
  'visibleTierMax',
  'totals',
  'legacyLowlandsBridge',
]);
const publicRegionIds = Object.freeze([
  'T1_LOWLANDS',
  'T1_FROSTMERE',
  'T1_SUNSCAR',
  'T1_MIREFEN',
  'T1_STONEWAKE',
  'T1_EMBERWOOD',
]);
const invalidChildComponentKey = `GRC-${'A'.repeat(26)}`;

class GreaterRealmConnectedImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GreaterRealmConnectedImportError';
  }
}

function fail(message: string): never {
  throw new GreaterRealmConnectedImportError(message);
}

/**
 * Normalize only the copied import authority to the import-only scenario.
 * Reviewed production source may be FF, TF, or FT, but never TT.
 */
export function enableDisposableGreaterRealmImportGate(source: string): string {
  return normalizeGreaterRealmConnectedDisposableGateMode(source, 'TF');
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJsonText(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function importBatchDescriptors(
  rows: ReadonlyArray<Readonly<{ releaseOrdinal: number }>>,
  maximumRows: number,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const descriptors: Array<Readonly<Record<string, unknown>>> = [];
  for (let offset = 0; offset < rows.length; offset += maximumRows) {
    const batch = rows.slice(offset, offset + maximumRows);
    descriptors.push(Object.freeze({
      batchOrdinal: descriptors.length,
      firstRowOrdinal: batch[0]!.releaseOrdinal,
      rowCount: batch.length,
      rowsSha256: sha256(canonicalJsonText(batch)),
    }));
  }
  return Object.freeze(descriptors);
}

/**
 * Produce a fully re-hashed payload whose final resource child names a validly
 * shaped but nonexistent component. The real reducer reaches its resource
 * insertion loop only after inserting the chunk and its cells, so rejection
 * also exercises SpacetimeDB transaction rollback rather than parser-only
 * rejection.
 */
export function createGreaterRealmChildBindingTamper(
  chunk: GreaterRealmRuntimeChunkArtifact,
): Readonly<{ payloadJson: string; payloadSha256: string }> {
  const payload = JSON.parse(JSON.stringify(chunk.payload)) as Record<string, any>;
  const resources = payload.resourceNodes;
  if (!Array.isArray(resources) || resources.length < 2) {
    fail('Synthetic child-binding probe requires a multi-resource chunk.');
  }
  const child = resources.at(-1);
  if (
    child === null
    || typeof child !== 'object'
    || typeof child.componentKey !== 'string'
    || child.componentKey === invalidChildComponentKey
  ) fail('Synthetic child-binding probe target was invalid.');
  child.componentKey = invalidChildComponentKey;
  if (
    payload.sectionDigests === null
    || typeof payload.sectionDigests !== 'object'
    || payload.importBatches === null
    || typeof payload.importBatches !== 'object'
  ) fail('Synthetic child-binding probe digest envelope was invalid.');
  payload.sectionDigests.resourceNodesSha256 = sha256(canonicalJsonText(resources));
  payload.importBatches.resourceNodes = importBatchDescriptors(resources, 256);
  const payloadJson = canonicalJsonText(payload);
  const payloadSha256 = sha256(payloadJson);
  if (payloadJson === chunk.bytes.toString('utf8')) {
    fail('Synthetic child-binding probe did not change its payload.');
  }
  return Object.freeze({ payloadJson, payloadSha256 });
}

export function exactGreaterRealmReleaseHeader(
  manifest: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const keys = Object.keys(manifest);
  if (
    keys.length !== exactHeaderKeys.length + 4
    || exactHeaderKeys.some((key, index) => keys[index] !== key)
    || keys.at(-4) !== 'regions'
    || keys.at(-3) !== 'components'
    || keys.at(-2) !== 'chunks'
    || keys.at(-1) !== 'releaseSha256'
  ) fail('Synthetic runtime release manifest order was incompatible with the server ABI.');
  return Object.freeze(Object.fromEntries(
    exactHeaderKeys.map(key => [key, manifest[key]]),
  ));
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') fail(message);
  return value as Record<string, unknown>;
}

function readUnsigned(value: unknown, label: string): bigint {
  const parsed = typeof value === 'number' && Number.isSafeInteger(value)
    ? BigInt(value)
    : typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)
      ? BigInt(value)
      : undefined;
  if (parsed === undefined || parsed < 0n) fail(`${label} was not an unsigned integer.`);
  return parsed;
}

function readBoolean(value: unknown, label: string): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  fail(`${label} was not boolean.`);
}

function unwrapOption(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value) && value.length === 2) {
    if (value[0] === 0 || String(value[0]).toLowerCase() === 'some') return value[1];
    if (value[0] === 1 || String(value[0]).toLowerCase() === 'none') return undefined;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const option = value as Record<string, unknown>;
    if (Object.keys(option).length === 1 && Object.hasOwn(option, 'some')) return option.some;
    if (Object.keys(option).length === 1 && Object.hasOwn(option, 'none')) return undefined;
  }
  return value;
}

type GreaterRealmStatus = Readonly<{
  present: boolean;
  atlasId?: string;
  publicReleaseId?: string;
  state: string;
  importEpoch?: bigint;
  verificationPhase: string;
  verificationCursor: bigint;
  verificationDigest: string;
  expectedComponentCount: bigint;
  expectedChunkCount: bigint;
  expectedCellCount: bigint;
  expectedSlotCount: bigint;
  expectedResourceNodeCount: bigint;
  regionManifestRows: bigint;
  componentRows: bigint;
  chunkRows: bigint;
  cellRows: bigint;
  slotRows: bigint;
  resourceRows: bigint;
  claimRows: bigint;
  occupancyRows: bigint;
  activationRows: bigint;
  publicAtlasRows: bigint;
  publicRegionRows: bigint;
  workerSystemRows: bigint;
  importsExact: boolean;
  ready: boolean;
  importMutationsCompiled: boolean;
  activationMutationsCompiled: boolean;
}>;

export function parseGreaterRealmConnectedStatus(text: string): GreaterRealmStatus {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Greater Realm status response was not JSON.');
  }
  if (!Array.isArray(value) || value.length !== 29) {
    fail('Greater Realm status response had an unexpected ABI shape.');
  }
  const atlasId = unwrapOption(value[1]);
  const publicReleaseId = unwrapOption(value[2]);
  const parsedImportEpoch = unwrapOption(value[4]);
  if (
    (atlasId !== undefined && typeof atlasId !== 'string')
    || (publicReleaseId !== undefined && typeof publicReleaseId !== 'string')
    || typeof value[3] !== 'string'
    || typeof value[5] !== 'string'
    || typeof value[7] !== 'string'
  ) fail('Greater Realm status response fields were invalid.');
  return Object.freeze({
    present: readBoolean(value[0], 'Greater Realm presence'),
    atlasId,
    publicReleaseId,
    state: value[3],
    importEpoch: parsedImportEpoch === undefined
      ? undefined
      : readUnsigned(parsedImportEpoch, 'Greater Realm import epoch'),
    verificationPhase: value[5],
    verificationCursor: readUnsigned(value[6], 'Greater Realm verification cursor'),
    verificationDigest: value[7],
    expectedComponentCount: readUnsigned(value[8], 'Greater Realm component expectation'),
    expectedChunkCount: readUnsigned(value[9], 'Greater Realm chunk expectation'),
    expectedCellCount: readUnsigned(value[10], 'Greater Realm cell expectation'),
    expectedSlotCount: readUnsigned(value[11], 'Greater Realm slot expectation'),
    expectedResourceNodeCount: readUnsigned(value[12], 'Greater Realm resource expectation'),
    regionManifestRows: readUnsigned(value[13], 'Greater Realm region rows'),
    componentRows: readUnsigned(value[14], 'Greater Realm component rows'),
    chunkRows: readUnsigned(value[15], 'Greater Realm chunk rows'),
    cellRows: readUnsigned(value[16], 'Greater Realm cell rows'),
    slotRows: readUnsigned(value[17], 'Greater Realm slot rows'),
    resourceRows: readUnsigned(value[18], 'Greater Realm resource rows'),
    claimRows: readUnsigned(value[19], 'Greater Realm claim rows'),
    occupancyRows: readUnsigned(value[20], 'Greater Realm occupancy rows'),
    activationRows: readUnsigned(value[21], 'Greater Realm activation rows'),
    publicAtlasRows: readUnsigned(value[22], 'Greater Realm public atlas rows'),
    publicRegionRows: readUnsigned(value[23], 'Greater Realm public region rows'),
    workerSystemRows: readUnsigned(value[24], 'Greater Realm worker-system rows'),
    importsExact: readBoolean(value[25], 'Greater Realm import exactness'),
    ready: readBoolean(value[26], 'Greater Realm readiness'),
    importMutationsCompiled: readBoolean(value[27], 'Greater Realm import gate'),
    activationMutationsCompiled: readBoolean(value[28], 'Greater Realm activation gate'),
  });
}

async function directoryDigest(root: string): Promise<string> {
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    fail('Module source root was not a real directory.');
  }
  const paths: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('Module source contained a symbolic link.');
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) paths.push(path);
      else fail('Module source contained an unsupported filesystem entry.');
    }
  };
  await visit(root);
  const hash = createHash('sha256').update('warpkeep.module-source-tree.v1\n');
  for (const path of paths) {
    const name = relative(root, path).replaceAll('\\', '/');
    const bytes = await readFile(path);
    hash.update(`${Buffer.byteLength(name)}:${name}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

async function createDisposableModule(runtimeDirectory: string): Promise<Readonly<{
  moduleDirectory: string;
  productionPolicyBytes: Buffer;
  productionSourceDigest: string;
  productionGateMode: GreaterRealmConnectedProductionGateMode;
}>> {
  const productionPolicyBytes = await readFile(productionPolicyPath);
  const productionPolicy = productionPolicyBytes.toString('utf8');
  const productionGateMode = parseGreaterRealmConnectedProductionGateMode(
    productionPolicy,
  ).mode;
  const productionSourceDigest = await directoryDigest(join(sourceModule, 'src'));
  const moduleDirectory = join(runtimeDirectory, 'module');
  await mkdir(moduleDirectory, { mode: 0o700 });
  await cp(join(sourceModule, 'src'), join(moduleDirectory, 'src'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  for (const file of copiedModuleFiles) {
    await cp(join(sourceModule, file), join(moduleDirectory, file), {
      errorOnExist: true,
      force: false,
    });
  }
  if (await directoryDigest(join(moduleDirectory, 'src')) !== productionSourceDigest) {
    fail('Disposable module source copy was not byte exact.');
  }
  const sourceDependencies = await realpath(join(sourceModule, 'node_modules'));
  if (!(await stat(sourceDependencies)).isDirectory()) {
    fail('Pinned module dependencies were unavailable.');
  }
  await symlink(sourceDependencies, join(moduleDirectory, 'node_modules'), 'dir');
  const copiedPolicyPath = join(moduleDirectory, 'src', 'greaterRealmV17Policy.ts');
  const enabledPolicy = enableDisposableGreaterRealmImportGate(
    await readFile(copiedPolicyPath, 'utf8'),
  );
  await writeFile(copiedPolicyPath, enabledPolicy, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'w',
  });
  assertGreaterRealmConnectedDisposableGateMode(enabledPolicy, 'TF');
  if (
    (await readFile(productionPolicyPath)).compare(productionPolicyBytes) !== 0
    || parseGreaterRealmConnectedProductionGateMode(
      await readFile(productionPolicyPath, 'utf8'),
    ).mode !== productionGateMode
  ) fail('Disposable module mutation escaped its private copy.');
  return Object.freeze({
    moduleDirectory,
    productionPolicyBytes,
    productionSourceDigest,
    productionGateMode,
  });
}

function childEnvironment(): Readonly<Record<string, string>> {
  const inherited = Object.fromEntries(safeChildEnvironmentKeys
    .filter(key => typeof process.env[key] === 'string' && process.env[key]!.length > 0)
    .map(key => [key, process.env[key]!]));
  return Object.freeze({
    ...inherited,
    CI: '1',
    LANG: 'C',
    NO_COLOR: '1',
  });
}

function terminateProcess(child: ChildProcess | undefined): void {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill('SIGKILL'); } catch { /* Bounded cleanup remains authoritative. */ }
}

function collectBounded(
  stream: NodeJS.ReadableStream,
  terminate: () => void,
  operation: string,
): () => string {
  const chunks: Buffer[] = [];
  let bytes = 0;
  stream.on('data', (chunk: Buffer) => {
    bytes += chunk.byteLength;
    if (bytes > maximumCliOutputBytes) {
      terminate();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  return () => {
    if (bytes > maximumCliOutputBytes) {
      fail(`SpacetimeDB CLI ${operation} output exceeded its bound.`);
    }
    return Buffer.concat(chunks).toString('utf8');
  };
}

type RuntimeControl = {
  deadline: number;
  environment: Readonly<Record<string, string>>;
  activeCliProcess?: ChildProcess;
  cliConfigPath?: string;
  deadlineExpired: boolean;
};

function remainingTimeout(
  control: RuntimeControl,
  maximum = commandTimeoutMilliseconds,
): number {
  const remaining = control.deadline - Date.now();
  if (control.deadlineExpired || remaining <= 0) {
    fail('Greater Realm connected import exceeded its hard deadline.');
  }
  return Math.max(1, Math.min(maximum, remaining));
}

async function runCommand(
  control: RuntimeControl,
  arguments_: readonly string[],
  options: Readonly<{ secrets?: readonly string[]; timeout?: number }> = {},
): Promise<Readonly<{ code: number; stdout: string; stderr: string }>> {
  const boundedTimeout = remainingTimeout(
    control,
    options.timeout ?? commandTimeoutMilliseconds,
  );
  return new Promise((resolveRun, rejectRun) => {
    let settled = false;
    let timedOut = false;
    let forcedDeadline: NodeJS.Timeout | undefined;
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: control.environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    control.activeCliProcess = child;
    const terminate = () => terminateProcess(child);
    const operation = arguments_.find(argument => (
      argument === '--version'
      || argument === 'build'
      || argument === 'publish'
      || argument === 'sql'
    )) ?? 'command';
    const stdout = collectBounded(child.stdout!, terminate, operation);
    const stderr = collectBounded(child.stderr!, terminate, operation);
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (forcedDeadline !== undefined) clearTimeout(forcedDeadline);
      if (control.activeCliProcess === child) control.activeCliProcess = undefined;
      callback();
    };
    child.once('error', () => settle(() => rejectRun(
      new GreaterRealmConnectedImportError('SpacetimeDB CLI process could not start.'),
    )));
    child.once('close', code => settle(() => {
      try {
        if (timedOut) fail('SpacetimeDB CLI command exceeded its hard deadline.');
        const capturedStdout = stdout();
        const capturedStderr = stderr();
        for (const secret of options.secrets ?? []) {
          if (
            typeof secret === 'string'
            && secret.length > 0
            && (capturedStdout.includes(secret) || capturedStderr.includes(secret))
          ) fail('SpacetimeDB CLI exposed disposable authority.');
        }
        resolveRun(Object.freeze({
          code: code ?? 1,
          stdout: capturedStdout,
          stderr: capturedStderr,
        }));
      } catch (error) {
        rejectRun(error);
      }
    }));
    const deadline = setTimeout(() => {
      timedOut = true;
      terminate();
      forcedDeadline = setTimeout(() => settle(() => rejectRun(
        new GreaterRealmConnectedImportError('SpacetimeDB CLI command did not terminate.'),
      )), 5_000);
    }, boundedTimeout);
  });
}

async function readBoundedResponse(
  response: Response,
  credential: string,
  maximumBytes = maximumResponseBytes,
): Promise<string> {
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength !== null
    && (!/^[0-9]+$/.test(advertisedLength) || Number(advertisedLength) > maximumBytes)
  ) fail('Loopback response exceeded its fixed bound.');
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      try { await reader.cancel(); } catch { /* The bounded rejection remains authoritative. */ }
      fail('Loopback response exceeded its fixed bound.');
    }
    chunks.push(value);
  }
  const text = new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks));
  if (credential.length > 0 && text.includes(credential)) {
    fail('Loopback response reflected disposable authority.');
  }
  return text;
}

async function callLoopback(
  control: RuntimeControl,
  server: string,
  name: string,
  credential: string,
  body: string,
  expectedStatus: number,
): Promise<string> {
  if (
    !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(server)
    || !/^[a-z0-9_]+$/.test(name)
    || typeof credential !== 'string'
    || credential.length < 32
    || !body.startsWith('[')
  ) fail('Loopback reducer coordinates were invalid.');
  let response: Response;
  try {
    response = await fetch(
      `${server}/v1/database/${GREATER_REALM_CONNECTED_DATABASE}/call/${name}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential}`,
          'cache-control': 'no-store',
          'content-type': 'application/json',
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(remainingTimeout(control, requestTimeoutMilliseconds)),
      },
    );
  } catch {
    fail(`Loopback call ${name} failed within its fixed boundary.`);
  }
  const text = await readBoundedResponse(response, credential);
  if (response.status !== expectedStatus) {
    const diagnostic = text.replace(/[\r\n]+/g, ' ').slice(0, 500);
    fail(
      `Loopback call ${name} returned ${response.status}; expected ${expectedStatus}`
      + `${diagnostic.length > 0 ? ` (${diagnostic})` : ''}.`,
    );
  }
  if (
    expectedStatus === 200
    && name.startsWith('admin_get_')
    && response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      !== 'application/json'
  ) fail(`Loopback procedure ${name} returned an unexpected media type.`);
  return text;
}

async function sqlRaw(
  control: RuntimeControl,
  server: string,
  ownerToken: string,
  query: string,
): Promise<Readonly<{ parsed: unknown; text: string }>> {
  if (
    !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(server)
    || typeof ownerToken !== 'string'
    || ownerToken.length < 32
    || Buffer.byteLength(query) < 1
    || Buffer.byteLength(query) > maximumSqlBytes
    || query.includes('\0')
  ) fail('Loopback SQL coordinates were invalid.');
  if (typeof control.cliConfigPath !== 'string') {
    fail('Disposable CLI credential was unavailable for owner-private SQL.');
  }
  const table = query.match(/\bFROM\s+([a-z0-9_]+)/i)?.[1] ?? 'query';
  let result: Awaited<ReturnType<typeof runCommand>>;
  try {
    result = await runCommand(control, [
      `--config-path=${control.cliConfigPath}`,
      'sql',
      '--server', server,
      '--no-config',
      GREATER_REALM_CONNECTED_DATABASE,
      query,
    ], { secrets: [ownerToken], timeout: requestTimeoutMilliseconds });
  } catch (error) {
    if (
      error instanceof GreaterRealmConnectedImportError
      && error.message === 'SpacetimeDB CLI sql output exceeded its bound.'
    ) fail(`Loopback SQL output exceeded its bound for ${table}.`);
    throw error;
  }
  if (result.code !== 0) {
    const diagnostic = result.stderr.replace(/[\r\n]+/g, ' ').slice(0, 500);
    fail(
      'Loopback owner-private SQL failed safely'
      + `${diagnostic.length > 0 ? ` (${diagnostic})` : ''}.`,
    );
  }
  return Object.freeze({ parsed: result.stdout, text: result.stdout });
}

function sqlRows(
  parsed: unknown,
  columns: readonly string[],
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  if (typeof parsed === 'string') {
    const normalized = parsed.replace(/\u001b\[[0-9;]*m/g, '').trim();
    const lines = normalized.split(/\r?\n/);
    const splitLine = (line: string): string[] => {
      if (line.includes('│')) {
        return line.split('│').map(value => value.trim()).filter(Boolean);
      }
      if (line.includes('|')) {
        return line.split('|').map(value => value.trim()).filter(Boolean);
      }
      return [line.trim()];
    };
    const decodeField = (field: string): string => {
      if (field.startsWith('"') && field.endsWith('"')) {
        try {
          const decoded: unknown = JSON.parse(field);
          if (typeof decoded === 'string') return decoded;
        } catch { /* The unquoted table value remains authoritative. */ }
      }
      return field;
    };
    const headerIndex = lines.findIndex(line => {
      const fields = splitLine(line);
      return fields.length === columns.length
        && fields.every((field, index) => field === columns[index]);
    });
    if (headerIndex < 0) fail('Loopback SQL table header was invalid.');
    const rows: Array<Readonly<Record<string, unknown>>> = [];
    for (const line of lines.slice(headerIndex + 1)) {
      if (
        line.trim().length === 0
        || /^[\s+\-|─┼┌┐└┘├┤┬┴]+$/u.test(line)
      ) continue;
      const fields = splitLine(line);
      if (fields.length !== columns.length) {
        fail('Loopback SQL table row width was invalid.');
      }
      rows.push(Object.freeze(Object.fromEntries(columns.map((column, index) => [
        column,
        decodeField(fields[index]!),
      ]))));
    }
    return Object.freeze(rows);
  }
  const result = Array.isArray(parsed) && parsed.length === 1
    ? parsed[0]
    : parsed;
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    fail('Loopback SQL response result was invalid.');
  }
  const rows = (result as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) fail('Loopback SQL response rows were invalid.');
  return Object.freeze(rows.map((rawRow) => {
    let row = rawRow;
    if (typeof row === 'string') {
      try { row = JSON.parse(row); } catch { fail('Loopback SQL row was invalid.'); }
    }
    if (Array.isArray(row)) {
      if (row.length !== columns.length) fail('Loopback SQL row width was invalid.');
      return Object.freeze(Object.fromEntries(columns.map((column, index) => [
        column,
        row[index],
      ])));
    }
    if (row !== null && typeof row === 'object') {
      const object = row as Record<string, unknown>;
      if (columns.some(column => !Object.hasOwn(object, column))) {
        fail('Loopback SQL object row columns were invalid.');
      }
      return Object.freeze(Object.fromEntries(columns.map(column => [column, object[column]])));
    }
    fail('Loopback SQL row shape was invalid.');
  }));
}

async function queryRows(
  control: RuntimeControl,
  server: string,
  ownerToken: string,
  query: string,
  columns: readonly string[],
): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>> {
  return sqlRows((await sqlRaw(control, server, ownerToken, query)).parsed, columns);
}

async function countWhere(
  control: RuntimeControl,
  server: string,
  ownerToken: string,
  table: string,
  predicate = 'true',
): Promise<bigint> {
  if (!/^[a-z0-9_]+$/.test(table) || predicate.length > 8_192 || /[;\0]/.test(predicate)) {
    fail('Loopback aggregate coordinates were invalid.');
  }
  const rows = await queryRows(
    control,
    server,
    ownerToken,
    `SELECT COUNT(*) AS warpkeep_count FROM ${table} WHERE ${predicate}`,
    ['warpkeep_count'],
  );
  if (rows.length !== 1) fail('Loopback aggregate response cardinality was invalid.');
  return readUnsigned(rows[0]!.warpkeep_count, 'Loopback aggregate count');
}

const atomicStateQueries = Object.freeze([
  'SELECT * FROM greater_realm_release_v1',
  'SELECT * FROM greater_realm_navigation_component_v1',
  'SELECT * FROM greater_realm_chunk_v1',
  'SELECT * FROM greater_realm_cell_v1',
  'SELECT * FROM greater_realm_castle_slot_v1',
  'SELECT * FROM greater_realm_resource_node_v1',
]);

async function authorityStateDigest(
  control: RuntimeControl,
  server: string,
  ownerToken: string,
  includeAudit: boolean,
): Promise<string> {
  const hash = createHash('sha256').update('warpkeep.greater-realm.connected-state.v1\n');
  const queries = includeAudit
    ? [...atomicStateQueries, 'SELECT * FROM admin_audit']
    : atomicStateQueries;
  for (const query of queries) {
    const response = await sqlRaw(control, server, ownerToken, query);
    hash.update(`${Buffer.byteLength(query)}:${query}:${Buffer.byteLength(response.text)}:`);
    hash.update(response.text);
  }
  return hash.digest('hex');
}

function sqlLiteral(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${label} was invalid.`);
  return `'${value}'`;
}

function exactPermutation(values: readonly bigint[], size: number, label: string): void {
  if (
    values.length !== size
    || new Set(values.map(String)).size !== size
    || values.some(value => value < 0n || value >= BigInt(size))
  ) fail(`${label} was not a complete unique permutation.`);
}

function manifestParts(artifacts: GreaterRealmRuntimeReleaseArtifacts) {
  const manifest = artifacts.manifest;
  const totals = record(manifest.totals, 'Synthetic runtime totals were invalid.');
  if (
    !Array.isArray(manifest.components)
    || !Array.isArray(manifest.regions)
    || !Array.isArray(manifest.chunks)
    || typeof manifest.releaseSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(manifest.releaseSha256)
  ) fail('Synthetic runtime manifest was invalid.');
  const count = (key: string): number => {
    const value = totals[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      fail(`Synthetic runtime ${key} was invalid.`);
    }
    return value;
  };
  return Object.freeze({
    manifest,
    totals: Object.freeze({
      regionCount: count('regionCount'),
      componentCount: count('componentCount'),
      chunkCount: count('chunkCount'),
      cellCount: count('cellCount'),
      castleSlotCount: count('castleSlotCount'),
      resourceNodeCount: count('resourceNodeCount'),
    }),
    components: manifest.components as ReadonlyArray<Readonly<Record<string, unknown>>>,
    regions: manifest.regions as ReadonlyArray<Readonly<Record<string, unknown>>>,
    chunks: manifest.chunks as ReadonlyArray<Readonly<Record<string, unknown>>>,
    releaseSha256: manifest.releaseSha256,
  });
}

function componentManifestWireRow(row: Readonly<Record<string, unknown>>) {
  return {
    component_key: row.componentKey,
    component_ordinal: row.componentOrdinal,
    region_mask: row.regionMask,
    root_cell_key: row.rootCellKey,
    expected_cell_count: row.expectedCellCount,
    max_route_depth: row.maxRouteDepth,
    expected_slot_count: row.expectedSlotCount,
    expected_food_node_count: row.expectedFoodNodeCount,
    expected_wood_node_count: row.expectedWoodNodeCount,
    expected_stone_node_count: row.expectedStoneNodeCount,
    expected_gold_node_count: row.expectedGoldNodeCount,
    component_sha_256: row.componentSha256,
  };
}

function regionManifestWireRow(row: Readonly<Record<string, unknown>>) {
  return {
    region_id: row.regionId,
    public_name: row.publicName,
    ordinal: row.ordinal,
    tier: row.tier,
    cell_count: row.cellCount,
    passable_cell_count: row.passableCellCount,
    chunk_count: row.chunkCount,
    castle_capacity: row.castleCapacity,
    resource_location_count: row.resourceLocationCount,
    resource_node_count: row.resourceNodeCount,
    food_node_count: row.foodNodeCount,
    wood_node_count: row.woodNodeCount,
    stone_node_count: row.stoneNodeCount,
    gold_node_count: row.goldNodeCount,
    active: row.active,
  };
}

async function verifyFinalDatabase(
  control: RuntimeControl,
  server: string,
  ownerToken: string,
  artifacts: GreaterRealmRuntimeReleaseArtifacts,
  status: GreaterRealmStatus,
  headerJson: string,
): Promise<string> {
  const { manifest, totals, components, chunks, releaseSha256 } = manifestParts(artifacts);
  const atlasIdLiteral = sqlLiteral(manifest.atlasId, /^[a-zA-Z0-9._:-]+$/, 'Atlas ID');
  const releaseRows = await queryRows(
    control,
    server,
    ownerToken,
    'SELECT atlas_id, public_release_id, source_commit, expected_release_sha_256, '
      + 'release_header_sha_256, verification_digest, state '
      + 'FROM greater_realm_release_v1',
    [
      'atlas_id',
      'public_release_id',
      'source_commit',
      'expected_release_sha_256',
      'release_header_sha_256',
      'verification_digest',
      'state',
    ],
  );
  if (releaseRows.length !== 1) fail('Final release row cardinality was invalid.');
  const release = releaseRows[0]!;
  for (const [label, actual, expected] of [
    ['atlas ID', release.atlas_id, manifest.atlasId],
    ['public release ID', release.public_release_id, manifest.publicReleaseId],
    ['source commit', release.source_commit, GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT],
    ['expected release digest', release.expected_release_sha_256, releaseSha256],
    ['header digest', release.release_header_sha_256, sha256(headerJson)],
    ['verification digest', release.verification_digest, status.verificationDigest],
    ['state', release.state, 'ready'],
  ] as const) {
    if (actual !== expected) fail(`Final release ${label} was not exact.`);
  }

  const componentRows = [...await queryRows(
    control,
    server,
    ownerToken,
    'SELECT component_ordinal, component_key, component_sha_256, expected_cell_count, '
      + 'imported_cell_count, verified_cell_count, expected_slot_count, imported_slot_count, '
      + 'verified_slot_count, expected_food_node_count, imported_food_node_count, '
      + 'verified_food_node_count, expected_wood_node_count, imported_wood_node_count, '
      + 'verified_wood_node_count, expected_stone_node_count, imported_stone_node_count, '
      + 'verified_stone_node_count, expected_gold_node_count, imported_gold_node_count, '
      + 'verified_gold_node_count, active FROM greater_realm_navigation_component_v1',
    [
      'component_ordinal', 'component_key', 'component_sha_256',
      'expected_cell_count', 'imported_cell_count', 'verified_cell_count',
      'expected_slot_count', 'imported_slot_count', 'verified_slot_count',
      'expected_food_node_count', 'imported_food_node_count', 'verified_food_node_count',
      'expected_wood_node_count', 'imported_wood_node_count', 'verified_wood_node_count',
      'expected_stone_node_count', 'imported_stone_node_count', 'verified_stone_node_count',
      'expected_gold_node_count', 'imported_gold_node_count', 'verified_gold_node_count',
      'active',
    ],
  )];
  componentRows.sort((left, right) => (
    Number(readUnsigned(left.component_ordinal, 'Component ordinal'))
    - Number(readUnsigned(right.component_ordinal, 'Component ordinal'))
  ));
  if (componentRows.length !== components.length) fail('Final component count was invalid.');
  for (let index = 0; index < components.length; index += 1) {
    const expected = components[index]!;
    const actual = componentRows[index]!;
    if (readUnsigned(actual.component_ordinal, 'Component ordinal') !== BigInt(index)) {
      fail('Final component ordinal was invalid.');
    }
    if (actual.component_key !== expected.componentKey) {
      fail('Final component key was invalid.');
    }
    if (actual.component_sha_256 !== expected.componentSha256) {
      fail('Final component digest was invalid.');
    }
    if (!readBoolean(actual.active, 'Component verification state')) {
      fail('Final component verification was incomplete.');
    }
    for (const [expectedField, importedField, verifiedField] of [
      ['expectedCellCount', 'imported_cell_count', 'verified_cell_count'],
      ['expectedSlotCount', 'imported_slot_count', 'verified_slot_count'],
      ['expectedFoodNodeCount', 'imported_food_node_count', 'verified_food_node_count'],
      ['expectedWoodNodeCount', 'imported_wood_node_count', 'verified_wood_node_count'],
      ['expectedStoneNodeCount', 'imported_stone_node_count', 'verified_stone_node_count'],
      ['expectedGoldNodeCount', 'imported_gold_node_count', 'verified_gold_node_count'],
    ] as const) {
      const expectedCount = readUnsigned(expected[expectedField], `Component ${expectedField}`);
      if (
        readUnsigned(actual[importedField], `Component ${importedField}`) !== expectedCount
        || readUnsigned(actual[verifiedField], `Component ${verifiedField}`) !== expectedCount
      ) fail('Final component imported/verified counts were not exact.');
    }
  }

  const chunkRows = [...await queryRows(
    control,
    server,
    ownerToken,
    'SELECT import_ordinal, chunk_handle, payload_sha_256 FROM greater_realm_chunk_v1',
    ['import_ordinal', 'chunk_handle', 'payload_sha_256'],
  )];
  chunkRows.sort((left, right) => (
    Number(readUnsigned(left.import_ordinal, 'Chunk ordinal'))
    - Number(readUnsigned(right.import_ordinal, 'Chunk ordinal'))
  ));
  if (chunkRows.length !== chunks.length) fail('Final chunk count was invalid.');
  for (let index = 0; index < chunks.length; index += 1) {
    const expected = chunks[index]!;
    const actual = chunkRows[index]!;
    if (
      readUnsigned(actual.import_ordinal, 'Chunk ordinal') !== BigInt(index)
      || actual.chunk_handle !== expected.chunkHandle
      || actual.payload_sha_256 !== expected.payloadSha256
    ) fail('Final canonical chunk digest sequence was invalid.');
  }

  const slotRows = await queryRows(
    control,
    server,
    ownerToken,
    'SELECT release_ordinal, region_id, region_order_rank, allocation_rank, active '
      + 'FROM greater_realm_castle_slot_v1',
    ['release_ordinal', 'region_id', 'region_order_rank', 'allocation_rank', 'active'],
  );
  const allocationRanks = slotRows.map(row => (
    readUnsigned(row.allocation_rank, 'Slot allocation rank')
  ));
  exactPermutation(allocationRanks, totals.castleSlotCount, 'Slot allocation ranks');
  for (const regionId of publicRegionIds) {
    const regionSlots = slotRows.filter(row => row.region_id === regionId);
    exactPermutation(
      regionSlots.map(row => readUnsigned(row.region_order_rank, 'Region slot rank')),
      100,
      `${regionId} slot ranks`,
    );
  }
  if (
    slotRows.length !== totals.castleSlotCount
    || slotRows.some(row => readBoolean(row.active, 'Slot active state'))
  ) fail('Final inactive slot set was invalid.');
  const rankDigest = sha256(JSON.stringify(slotRows
    .map(row => ({
      releaseOrdinal: String(readUnsigned(row.release_ordinal, 'Slot release ordinal')),
      allocationRank: String(readUnsigned(row.allocation_rank, 'Slot allocation rank')),
      regionId: row.region_id,
      regionOrderRank: String(readUnsigned(row.region_order_rank, 'Region slot rank')),
    }))
    .sort((left, right) => Number(BigInt(left.releaseOrdinal) - BigInt(right.releaseOrdinal)))));

  for (const [table, expected] of [
    ['greater_realm_navigation_component_v1', BigInt(totals.componentCount)],
    ['greater_realm_chunk_v1', BigInt(totals.chunkCount)],
    ['greater_realm_cell_v1', BigInt(totals.cellCount)],
    ['greater_realm_castle_slot_v1', BigInt(totals.castleSlotCount)],
    ['greater_realm_resource_node_v1', BigInt(totals.resourceNodeCount)],
  ] as const) {
    if (await countWhere(control, server, ownerToken, table, `atlas_id = ${atlasIdLiteral}`) !== expected) {
      fail(`Final imported row count was invalid for ${table}.`);
    }
  }
  for (const table of [
    'greater_realm_cell_v1',
    'greater_realm_castle_slot_v1',
    'greater_realm_resource_node_v1',
  ]) {
    for (const tier of [2, 3]) {
      if (await countWhere(control, server, ownerToken, table, `tier = ${tier}`) !== 0n) {
        fail(`Forbidden Tier-${tier} rows crossed the import boundary.`);
      }
    }
  }
  for (const table of [
    'greater_realm_castle_slot_v1',
    'greater_realm_resource_node_v1',
  ]) {
    if (await countWhere(control, server, ownerToken, table, 'active = true') !== 0n) {
      fail(`Import unexpectedly activated ${table}.`);
    }
  }
  return rankDigest;
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) fail('Connected import proof accepts no operator coordinates.');
  const startedAt = Date.now();
  let proofStage = 'synthetic-release';
  const artifacts = createGreaterRealmRuntimeRelease({
    source: createGreaterRealmRuntimeReleaseFixtureSource(),
    sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
    releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
  });
  const { manifest, totals, components, regions, releaseSha256 } = manifestParts(artifacts);
  if (
    manifest.sourceCommit !== GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT
    || artifacts.status.productionUntouched !== true
    || artifacts.status.tierOneOnly !== true
    || artifacts.chunks.some(chunk => /(?:T2_|T3_)/.test(chunk.bytes.toString('utf8')))
    || /(?:T2_|T3_)/.test(artifacts.manifestBytes.toString('utf8'))
  ) fail('Tracked synthetic release crossed its Tier-I-only boundary.');
  const header = exactGreaterRealmReleaseHeader(manifest);
  const headerJson = canonicalJsonText(header);

  proofStage = 'private-runtime-allocation';
  const runtimeDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-greater-realm-import-'));
  await chmod(runtimeDirectory, 0o700);
  const runtimeMetadata = await lstat(runtimeDirectory);
  if (
    !runtimeMetadata.isDirectory()
    || runtimeMetadata.isSymbolicLink()
    || (runtimeMetadata.mode & 0o777) !== 0o700
  ) fail('Connected import runtime root was unsafe.');
  const environment = childEnvironment();
  const control: RuntimeControl = {
    deadline: Date.now() + GREATER_REALM_CONNECTED_IMPORT_TIMEOUT_MILLISECONDS,
    environment,
    deadlineExpired: false,
  };
  let serverProcess: ChildProcess | undefined;
  let productionPolicyBytes: Buffer | undefined;
  let productionSourceDigest: string | undefined;
  let productionGateMode: GreaterRealmConnectedProductionGateMode | undefined;
  let authorityToken: string | undefined;
  let receipt: string | undefined;
  const forceCleanup = () => {
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
    try { rmSync(runtimeDirectory, { recursive: true, force: true }); } catch {
      fail('Interrupted connected import cleanup failed.');
    }
  };
  const removeSignalCleanup = installMigrationProofSignalCleanup(forceCleanup);
  const totalDeadline = setTimeout(() => {
    control.deadlineExpired = true;
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
  }, GREATER_REALM_CONNECTED_IMPORT_TIMEOUT_MILLISECONDS);
  try {
    proofStage = 'cli-attestation';
    const version = await runCommand(control, ['--version'], { timeout: 10_000 });
    if (
      version.code !== 0
      || !version.stdout.includes(`spacetimedb tool version ${expectedCliVersion};`)
      || !version.stdout.includes(`Commit: ${expectedCliCommit}`)
    ) fail('Pinned SpacetimeDB CLI 2.6.1 was not active.');

    proofStage = 'exact-source-copy';
    const copied = await createDisposableModule(runtimeDirectory);
    productionPolicyBytes = copied.productionPolicyBytes;
    productionSourceDigest = copied.productionSourceDigest;
    productionGateMode = copied.productionGateMode;

    proofStage = 'disposable-module-build';
    const built = await runCommand(control, [
      'build',
      '--module-path', copied.moduleDirectory,
    ]);
    if (built.code !== 0) fail('Disposable Greater Realm module build failed safely.');
    const artifactPath = join(copied.moduleDirectory, 'dist', 'bundle.js');
    const artifact = await readFile(artifactPath);
    if (artifact.byteLength < 1 || artifact.byteLength > 16 * 1_024 * 1_024) {
      fail('Disposable Greater Realm module artifact was invalid.');
    }
    const artifactDigest = sha256(artifact);

    proofStage = 'ephemeral-authority';
    const generated = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const publicKeyPath = join(runtimeDirectory, 'jwt-public.pem');
    const privateKeyPath = join(runtimeDirectory, 'jwt-private.pem');
    await writeFile(publicKeyPath, generated.publicKey, {
      encoding: 'utf8', mode: 0o600, flag: 'wx',
    });
    await writeFile(privateKeyPath, generated.privateKey, {
      encoding: 'utf8', mode: 0o600, flag: 'wx',
    });
    for (const path of [publicKeyPath, privateKeyPath]) {
      const metadata = await stat(path);
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
        fail('Disposable signing-key permissions were invalid.');
      }
    }

    proofStage = 'loopback-start';
    const port = await freeLoopbackPort();
    const server = `http://127.0.0.1:${port}`;
    if (!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(server)) {
      fail('Connected import server was not numeric-loopback-only.');
    }
    serverProcess = containServerProcessErrors(spawn(command, [
      'start',
      '--listen-addr', `127.0.0.1:${port}`,
      '--in-memory',
      '--data-dir', join(runtimeDirectory, 'database'),
      '--jwt-pub-key-path', publicKeyPath,
      '--jwt-priv-key-path', privateKeyPath,
      '--non-interactive',
    ], {
      cwd: repositoryRoot,
      env: environment,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    }));
    // The identity endpoint is the established bounded readiness probe. The
    // database itself is deliberately created by the same short-lived Hermes
    // principal that calls the private import authority: the real module's
    // on-connect policy correctly rejects the identity endpoint's local token.
    await acquireDisposableIdentity(server);
    const connectedAuthorityToken = createEphemeralJwt(
      generated.privateKey,
      adminServiceClaims(),
    );
    authorityToken = connectedAuthorityToken;
    const cliConfigPath = join(runtimeDirectory, 'spacetime-cli.toml');
    await writeFile(
      cliConfigPath,
      `spacetimedb_token = ${JSON.stringify(connectedAuthorityToken)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    const configMetadata = await stat(cliConfigPath);
    if (!configMetadata.isFile() || (configMetadata.mode & 0o777) !== 0o600) {
      fail('Disposable CLI credential permissions were invalid.');
    }
    control.cliConfigPath = cliConfigPath;

    proofStage = 'in-memory-publication';
    const publishArguments = [
      `--config-path=${cliConfigPath}`,
      'publish',
      '--server', server,
      '--js-path', artifactPath,
      '--delete-data=never',
      '--no-config',
      GREATER_REALM_CONNECTED_DATABASE,
    ];
    if (
      publishArguments.includes('--break-clients')
      || publishArguments.some(value => value === '--yes' || value.startsWith('--yes='))
      || publishArguments.filter(value => value === '--delete-data=never').length !== 1
      || publishArguments.some(value => value.startsWith('--delete-data=') && value !== '--delete-data=never')
    ) fail('Disposable connected import publication arguments were unsafe.');
    const published = await runCommand(
      control,
      publishArguments,
      { secrets: [connectedAuthorityToken] },
    );
    if (published.code !== 0) fail('Disposable in-memory publication failed safely.');

    const adminCredential = () => createEphemeralJwt(
      generated.privateKey,
      adminServiceClaims(),
    );
    const callAdmin = (
      name: string,
      arguments_: readonly unknown[] = [],
      expectedStatus = 200,
    ) => callLoopback(
      control,
      server,
      name,
      adminCredential(),
      JSON.stringify(arguments_),
      expectedStatus,
    );
    const readStatus = async () => parseGreaterRealmConnectedStatus(
      await callAdmin('admin_get_greater_realm_status_v1'),
    );

    proofStage = 'temporary-gate-attestation';
    const emptyStatus = await readStatus();
    if (
      emptyStatus.present
      || emptyStatus.importMutationsCompiled !== true
      || emptyStatus.activationMutationsCompiled !== false
      || emptyStatus.activationRows !== 0n
      || emptyStatus.publicAtlasRows !== 0n
      || emptyStatus.publicRegionRows !== 0n
    ) fail('Disposable module gates or empty activation state were invalid.');

    proofStage = 'exact-header-stage';
    await callAdmin('admin_stage_greater_realm_release_v1', [
      manifest.atlasId,
      manifest.publicReleaseId,
      manifest.publicApprovalReceiptId,
      manifest.sourceCommit,
      manifest.generatorVersion,
      manifest.sourceFormatVersion,
      manifest.livingWorldVersion,
      manifest.runtimePartitionVersion,
      manifest.rendererContractVersion,
      totals.regionCount,
      totals.componentCount,
      totals.chunkCount,
      totals.cellCount,
      totals.castleSlotCount,
      totals.resourceNodeCount,
      releaseSha256,
      importEpoch,
      headerJson,
    ]);

    proofStage = 'manifest-import';
    await callAdmin('admin_import_greater_realm_components_v1', [
      manifest.atlasId,
      importEpoch,
      components.map(componentManifestWireRow),
    ]);
    await callAdmin('admin_import_greater_realm_regions_v1', [
      manifest.atlasId,
      importEpoch,
      regions.map(regionManifestWireRow),
    ]);

    const importChunk = (chunk: GreaterRealmRuntimeChunkArtifact, expectedStatus = 200) => (
      callAdmin('admin_import_greater_realm_chunk_v1', [
        manifest.atlasId,
        importEpoch,
        sha256(chunk.bytes),
        chunk.bytes.toString('utf8'),
      ], expectedStatus)
    );
    const childTargetIndex = artifacts.chunks.findIndex(chunk => (
      chunk.payload.resourceNodes.length >= 2
    ));
    if (childTargetIndex < 1) fail('Synthetic release lacked a safe child-binding probe target.');

    proofStage = 'tampered-order-atomicity';
    const orderBaseline = await authorityStateDigest(
      control,
      server,
      connectedAuthorityToken,
      true,
    );
    const outOfOrderResponse = await importChunk(artifacts.chunks[1]!, 530);
    if (!outOfOrderResponse.includes('GREATER_REALM_CHUNK_IMPORT_OUT_OF_ORDER')) {
      fail('Out-of-order chunk did not reach the exact authority rejection.');
    }
    if (
      await authorityStateDigest(control, server, connectedAuthorityToken, true)
      !== orderBaseline
    ) {
      fail('Out-of-order chunk rejection was not transaction-atomic.');
    }

    proofStage = 'canonical-prefix-import';
    for (let index = 0; index < childTargetIndex; index += 1) {
      await importChunk(artifacts.chunks[index]!);
    }

    proofStage = 'tampered-child-binding-atomicity';
    const target = artifacts.chunks[childTargetIndex]!;
    const tampered = createGreaterRealmChildBindingTamper(target);
    const childBaseline = await authorityStateDigest(
      control,
      server,
      connectedAuthorityToken,
      true,
    );
    const childResponse = await callAdmin('admin_import_greater_realm_chunk_v1', [
      manifest.atlasId,
      importEpoch,
      tampered.payloadSha256,
      tampered.payloadJson,
    ], 530);
    if (!childResponse.includes('GREATER_REALM_RESOURCE_REACHABILITY_INVALID')) {
      fail('Tampered resource child did not reach the exact binding rejection.');
    }
    if (
      await authorityStateDigest(control, server, connectedAuthorityToken, true)
      !== childBaseline
    ) {
      fail('Late child-binding rejection was not transaction-atomic.');
    }

    proofStage = 'canonical-chunk-import-and-retry';
    await importChunk(target);
    const retryBaseline = await authorityStateDigest(
      control,
      server,
      connectedAuthorityToken,
      false,
    );
    const retryAuditsBefore = await countWhere(
      control,
      server,
      connectedAuthorityToken,
      'admin_audit',
      "action = 'import_greater_realm_chunk_v1'",
    );
    await importChunk(target);
    const retryAuditsAfter = await countWhere(
      control,
      server,
      connectedAuthorityToken,
      'admin_audit',
      "action = 'import_greater_realm_chunk_v1'",
    );
    if (
      await authorityStateDigest(control, server, connectedAuthorityToken, false) !== retryBaseline
      || retryAuditsAfter !== retryAuditsBefore + 1n
    ) fail('Exact canonical chunk retry was not an unchanged authority operation.');
    for (let index = childTargetIndex + 1; index < artifacts.chunks.length; index += 1) {
      await importChunk(artifacts.chunks[index]!);
    }

    proofStage = 'verification';
    let importedStatus = await readStatus();
    if (
      importedStatus.state !== 'importing'
      || !importedStatus.importsExact
      || importedStatus.regionManifestRows !== BigInt(totals.regionCount)
      || importedStatus.componentRows !== BigInt(totals.componentCount)
      || importedStatus.chunkRows !== BigInt(totals.chunkCount)
      || importedStatus.cellRows !== BigInt(totals.cellCount)
      || importedStatus.slotRows !== BigInt(totals.castleSlotCount)
      || importedStatus.resourceRows !== BigInt(totals.resourceNodeCount)
    ) fail('Canonical synthetic import counts were not exact before verification.');
    await callAdmin('admin_begin_greater_realm_verification_v1', [
      manifest.atlasId,
      importEpoch,
    ]);
    let verificationCalls = 0;
    while (true) {
      importedStatus = await readStatus();
      if (importedStatus.verificationPhase === 'complete') break;
      if (
        importedStatus.state !== 'verifying'
        || verificationCalls >= 256
      ) fail('Bounded Greater Realm verification did not converge.');
      await callAdmin('admin_verify_greater_realm_batch_v1', [
        manifest.atlasId,
        importEpoch,
        256,
      ]);
      verificationCalls += 1;
    }
    if (!/^[0-9a-f]{64}$/.test(importedStatus.verificationDigest)) {
      fail('Completed Greater Realm verification digest was invalid.');
    }

    proofStage = 'server-random-finalize';
    await callAdmin('admin_finalize_greater_realm_release_v1', [
      manifest.atlasId,
      importEpoch,
      manifest.publicApprovalReceiptId,
      releaseSha256,
      importedStatus.verificationDigest,
      'Synthetic Connected Import Proof',
    ]);
    const finalStatus = await readStatus();
    if (
      !finalStatus.present
      || finalStatus.atlasId !== manifest.atlasId
      || finalStatus.publicReleaseId !== manifest.publicReleaseId
      || finalStatus.importEpoch !== BigInt(importEpoch)
      || finalStatus.state !== 'ready'
      || finalStatus.verificationPhase !== 'complete'
      || finalStatus.verificationCursor !== 0n
      || !finalStatus.importsExact
      || !finalStatus.ready
      || !finalStatus.importMutationsCompiled
      || finalStatus.activationMutationsCompiled
      || finalStatus.claimRows !== 0n
      || finalStatus.occupancyRows !== 0n
      || finalStatus.activationRows !== 0n
      || finalStatus.publicAtlasRows !== 0n
      || finalStatus.publicRegionRows !== 0n
      || finalStatus.workerSystemRows !== 0n
    ) fail('Final ready-but-inactive Greater Realm status was invalid.');

    proofStage = 'final-database-attestation';
    const rankDigest = await verifyFinalDatabase(
      control,
      server,
      connectedAuthorityToken,
      artifacts,
      finalStatus,
      headerJson,
    );
    if (
      (await readFile(productionPolicyPath)).compare(productionPolicyBytes) !== 0
      || await directoryDigest(join(sourceModule, 'src')) !== productionSourceDigest
      || parseGreaterRealmConnectedProductionGateMode(
        await readFile(productionPolicyPath, 'utf8'),
      ).mode !== productionGateMode
    ) fail('Production module source changed during the disposable proof.');
    receipt = 'Greater Realm connected synthetic import proof passed: '
      + `audited_exporter_upstream=${GREATER_REALM_CONNECTED_AUDITED_EXPORTER_COMMIT} `
      + `audited_server_upstream=${GREATER_REALM_CONNECTED_AUDITED_SERVER_COMMITS.join('+')} `
      + `release=${String(manifest.publicReleaseId)} `
      + `components=${totals.componentCount} chunks=${totals.chunkCount} `
      + `cells=${totals.cellCount} slots=${totals.castleSlotCount} `
      + `resources=${totals.resourceNodeCount} verification_sha256=${finalStatus.verificationDigest} `
      + `slot_rank_sha256=${rankDigest} module_sha256=${artifactDigest} `
      + `verification_calls=${verificationCalls} elapsed_ms=${Date.now() - startedAt}`;
  } catch (error) {
    if (error instanceof GreaterRealmConnectedImportError) throw error;
    throw new GreaterRealmConnectedImportError(
      `Greater Realm connected import failed closed at ${proofStage}.`,
    );
  } finally {
    clearTimeout(totalDeadline);
    authorityToken = undefined;
    removeSignalCleanup();
    terminateProcess(control.activeCliProcess);
    if (serverProcess !== undefined) {
      await cleanupMigrationProofResources(serverProcess, runtimeDirectory);
    } else {
      await rm(runtimeDirectory, { recursive: true, force: true });
    }
  }
  if (existsSync(runtimeDirectory)) fail('Connected import runtime cleanup was incomplete.');
  if (receipt === undefined) fail('Connected import proof did not produce a receipt.');
  console.log(receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof GreaterRealmConnectedImportError
      ? error.message
      : 'Greater Realm connected import proof failed closed.');
    process.exitCode = 1;
  });
}
