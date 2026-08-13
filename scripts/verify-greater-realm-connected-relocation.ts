import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import {
  chmod,
  cp,
  lstat,
  mkdir,
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
  type GreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  exactGreaterRealmReleaseHeader,
  parseGreaterRealmConnectedStatus,
} from './verify-greater-realm-connected-import';
import {
  assertGreaterRealmConnectedDisposableGateMode,
  normalizeGreaterRealmConnectedDisposableGateMode,
  parseGreaterRealmConnectedProductionGateMode,
  type GreaterRealmConnectedProductionGateMode,
} from './greater-realm-connected-gate-mode';
// @ts-expect-error The migration proof deliberately exposes these shared JavaScript helpers.
import { acquireDisposableIdentity, adminServiceClaims, cleanupMigrationProofResources, containServerProcessErrors, createEphemeralJwt, freeLoopbackPort, installMigrationProofSignalCleanup } from './verify-spacetime-additive-migration.mjs';

export const GREATER_REALM_CONNECTED_RELOCATION_DATABASES = Object.freeze({
  rollback: 'warpkeep-greater-realm-relocation-rollback',
  resume: 'warpkeep-greater-realm-relocation-resume',
});
export const GREATER_REALM_CONNECTED_RELOCATION_TIMEOUT_MILLISECONDS = 20 * 60 * 1_000;
export const GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS = 120_000;
export const GREATER_REALM_CONNECTED_FOUNDER_COUNT = 100;
export const GREATER_REALM_CONNECTED_WORKER_COUNT = 400;
export const GREATER_REALM_CONNECTED_STATIC_FLIP_COUNT = 12_600;

export const DISPOSABLE_RELOCATION_REDUCER_MODULE =
  './reducers/greaterRealmRelocationConnectedRehearsal';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceModule = join(repositoryRoot, 'spacetimedb');
const productionPolicyPath = join(sourceModule, 'src', 'greaterRealmV17Policy.ts');
const productionIndexPath = join(sourceModule, 'src', 'index.ts');
const expectedCliVersion = '2.6.1';
const expectedCliCommit = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const command = process.env.SPACETIME_BIN || 'spacetime';
const importEpoch = 1;
const maximumCliOutputBytes = 20 * 1_024 * 1_024;
const maximumResponseBytes = 16 * 1_024 * 1_024;
const maximumSqlBytes = 256 * 1_024;
const commandTimeoutMilliseconds = 120_000;
const requestTimeoutMilliseconds = 30_000;
const profilePolicyVersion = 'trusted-snapchain-profile-v3';
const workerProtocolCapability = 'generic-castle-workers-v1';
const resourcePolicyVersion = 'genesis-resource-yield-v1';
const innerKeepProtocolCapability = 'inner-keep-construction-v1';
const innerKeepPolicyDigest =
  'cbffcdc223b5d99625cab7549f3a5ae211c725893574b629aa83f8260668a779';
const innerKeepLayoutDigest =
  '1b3a452794c28f8d7f8814ce6064da8582725d34bb0ee0271d51f40c2fbdfad7';
const innerKeepAssetCatalogDigest =
  'cf1fdac091e310cce3362d43403be938fe7946e46df906f2efb8cff601497c6d';
const rehearsalSourceCommit = '0'.repeat(40);
const rehearsalClientDigest = createHash('sha256')
  .update('warpkeep.connected-relocation.client.v1')
  .digest('hex');
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
export const GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS = Object.freeze({
  prepare: 'admin_prepare_greater_realm_activation_v1',
  beginDrain: 'admin_begin_greater_realm_drain_v1',
  freeze: 'admin_freeze_greater_realm_activation_v1',
  plan: 'admin_plan_greater_realm_relocation_v1',
  canary: 'admin_relocate_greater_realm_canary_v1',
  commit: 'admin_commit_greater_realm_active_v1',
  halt: 'admin_halt_greater_realm_activation_v1',
  resume: 'admin_resume_greater_realm_active_v1',
  rollback: 'admin_rollback_greater_realm_before_commit_v1',
});
export const GREATER_REALM_CONNECTED_CUTOVER_STATUS_PROCEDURE =
  'admin_get_greater_realm_cutover_status_v_1';
export const GREATER_REALM_CONNECTED_HOSTILE_CANARY_REDUCER =
  'rehearsal_hostile_greater_realm_canary_v1';
export const GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS = Object.freeze([
  'importMutationsCompiled',
  'activationMutationsCompiled',
  'releaseRows',
  'releasePresent',
  'atlasId',
  'publicReleaseId',
  'sourceCommit',
  'importEpoch',
  'releaseState',
  'verificationPhase',
  'verificationCursor',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'expectedRegionCount',
  'expectedComponentCount',
  'expectedChunkCount',
  'expectedCellCount',
  'expectedSlotCount',
  'expectedResourceNodeCount',
  'componentExpectedCellCount',
  'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount',
  'importedPassableCellCount',
  'verifiedComponentCount',
  'verifiedChunkCount',
  'verifiedCellCount',
  'verifiedSlotCount',
  'verifiedResourceNodeCount',
  'regionManifestRows',
  'componentRows',
  'chunkRows',
  'cellRows',
  'slotRows',
  'activeSlotRows',
  'resourceNodeRows',
  'activeResourceNodeRows',
  'releaseImportsExact',
  'releaseVerificationExact',
  'releaseReady',
  'activationRows',
  'activationPresent',
  'activationMode',
  'everActive',
  'topologySnapshotDigest',
  'relocationPlanDigest',
  'snapshotCastleDigest',
  'snapshotWorkerDigest',
  'snapshotResourceDigest',
  'snapshotMarksDigest',
  'snapshotInnerKeepDigest',
  'snapshotScheduleDigest',
  'snapshotCastleCount',
  'snapshotWorkerCount',
  'snapshotResourceAccountCount',
  'snapshotMarkAccountCount',
  'snapshotInnerKeepBuildingCount',
  'snapshotClaimCount',
  'snapshotOccupancyCount',
  'nextAllocationSequence',
  'postCanaryFoundingCount',
  'postCanaryDispatchCount',
  'rollbackEligible',
  'resumeEligible',
  'legacyFoundingOpen',
  'legacyJourneyDispatchOpen',
  'castleCapacity',
  'currentFounderCount',
  'founderCapacityRemaining',
  'castleRows',
  'greaterRealmClaimRows',
  'greaterRealmOccupancyRows',
  'plannedClaimRows',
  'activeClaimRows',
  'unknownClaimStateRows',
  'relocatedClaimRows',
  'foundedClaimRows',
  'unknownClaimKindRows',
  'legacyClaimRows',
  'legacyOccupiedWorldTileRows',
  'lowlandsFounderCount',
  'frostmereFounderCount',
  'sunscarFounderCount',
  'mirefenFounderCount',
  'stonewakeFounderCount',
  'emberwoodFounderCount',
  'unassignedRegionFounderCount',
  'profileRows',
  'markAccountRows',
  'resourceAccountRows',
  'allowedFidRows',
  'enabledAllowedFidRows',
  'castleWorkerRows',
  'idleCastleWorkerRows',
  'nonIdleCastleWorkerRows',
  'auditRows',
  'legacyRealmRows',
  'legacyRealmActive',
  'atlasRows',
  'atlasMode',
  'atlasRevision',
  'atlasCastleCapacity',
  'atlasVisibleRegionCount',
  'atlasVisibleCellCount',
  'atlasVisibleChunkCount',
  'visibleRegionRows',
  'activeVisibleRegionRows',
  'workerSystemV2Rows',
  'workerSystemV2Mode',
  'workerSystemV2RosterDigest',
  'workerSystemV2CurrentCastleCount',
  'workerSystemV2CurrentWorkerCount',
  'workerSystemV1Rows',
  'workerSystemV1Mode',
  'workerSystemV1RosterDigest',
  'workerSystemV1ExpectedCastleCount',
  'workerSystemV1ExpectedWorkerCount',
  'workerSystemV1LegacyDrainRequired',
  'goldNodeOccupationRows',
  'goldExpeditionRows',
  'goldExpeditionScheduleRows',
  'foodNodeOccupationRows',
  'foodExpeditionRows',
  'foodExpeditionScheduleRows',
  'woodNodeOccupationRows',
  'woodExpeditionRows',
  'woodExpeditionScheduleRows',
  'stoneNodeOccupationRows',
  'stoneExpeditionRows',
  'stoneExpeditionScheduleRows',
  'workerAssignmentRows',
  'workerNodeOccupationRows',
  'workerAssignmentScheduleRows',
  'currentWorldGraphApplicable',
  'currentWorldGraphExact',
  'currentWorldIntegrityViolationCount',
  'activeAdmissionEligible',
] as const);

class GreaterRealmConnectedRelocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GreaterRealmConnectedRelocationError';
  }
}

function fail(message: string): never {
  throw new GreaterRealmConnectedRelocationError(message);
}

function countOccurrences(value: string, needle: string): number {
  if (needle.length === 0) fail('Disposable substitution needle was invalid.');
  return value.split(needle).length - 1;
}

/** Normalize only the copied policy to the fully enabled rehearsal scenario. */
export function enableDisposableGreaterRealmRelocationGates(source: string): string {
  return normalizeGreaterRealmConnectedDisposableGateMode(source, 'TT');
}

const reducerExportAppend = `
// warpkeep-disposable-connected-relocation-rehearsal-v1
export {
  rehearsalHostileGreaterRealmCanaryV1,
} from '${DISPOSABLE_RELOCATION_REDUCER_MODULE}';
`;

/** Source exists only inside the private copied module. */
export function disposableGreaterRealmRelocationReducerSource(): string {
  return `import { SenderError } from 'spacetimedb/server';

import { requireAdmin } from '../auth';
import {
  greaterRealmRelocationAuthorityErrorCode,
  relocateGreaterRealmCanaryAuthorizedTransactionV1,
} from '../greaterRealmRelocationAuthority';
import { runGreaterRealmCutoverTransitionWithAuditV1 } from '../greaterRealmCutoverAudit';
import { greaterRealmActivationPolicyErrorCode } from '../greaterRealmActivationPolicy';
import { greaterRealmActivationStateErrorCode } from '../greaterRealmActivationState';
import { greaterRealmRelocationSnapshotErrorCode } from '../greaterRealmRelocationSnapshot';
import { castleWorkerErrorCode } from '../castleWorkerAuthority';
import {
  greaterRealmAuthorityErrorCode,
  requireGreaterRealmV17ActivationGate,
} from '../greaterRealmV17Authority';
import warpkeep from '../schema';

function senderError(error: unknown): never {
  const code = greaterRealmRelocationAuthorityErrorCode(error)
    ?? greaterRealmRelocationSnapshotErrorCode(error)
    ?? greaterRealmActivationPolicyErrorCode(error)
    ?? greaterRealmActivationStateErrorCode(error)
    ?? greaterRealmAuthorityErrorCode(error)
    ?? castleWorkerErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  throw error;
}

function authorized(ctx: Parameters<typeof requireAdmin>[0]): void {
  requireGreaterRealmV17ActivationGate();
  const admin = requireAdmin(ctx);
  try {
    runGreaterRealmCutoverTransitionWithAuditV1(
      ctx,
      admin.subject,
      'relocate_greater_realm_canary_v1',
      () => {
    let target: NonNullable<
      ReturnType<typeof ctx.db.greaterRealmResourceNodeV1.nodeId.find>
    > | undefined;
    for (const row of ctx.db.greaterRealmResourceNodeV1.iter()) {
      if (target !== undefined) break;
      target = row;
    }
    if (target === undefined || target.active) {
      throw new SenderError('GREATER_REALM_REHEARSAL_DRIFT_TARGET_INVALID');
    }
    ctx.db.greaterRealmResourceNodeV1.nodeId.update({ ...target, active: true });
    return relocateGreaterRealmCanaryAuthorizedTransactionV1(ctx);
      },
    );
  } catch (error) { return senderError(error); }
}

export const rehearsalHostileGreaterRealmCanaryV1 = warpkeep.reducer(
  { name: '${GREATER_REALM_CONNECTED_HOSTILE_CANARY_REDUCER}' },
  ctx => authorized(ctx),
);
`;
}

export function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJsonText(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export async function directoryDigest(root: string): Promise<string> {
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
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

export type DisposableModule = Readonly<{
  moduleDirectory: string;
  artifactPath: string;
  productionPolicyBytes: Buffer;
  productionIndexBytes: Buffer;
  productionSourceDigest: string;
  productionGateMode: GreaterRealmConnectedProductionGateMode;
  disposableSourceDigest: string;
}>;

export async function createDisposableGreaterRealmRelocationModule(
  runtimeDirectory: string,
): Promise<DisposableModule> {
  const productionPolicyBytes = await readFile(productionPolicyPath);
  const productionIndexBytes = await readFile(productionIndexPath);
  const productionGateMode = parseGreaterRealmConnectedProductionGateMode(
    productionPolicyBytes.toString('utf8'),
  ).mode;
  const productionIndex = productionIndexBytes.toString('utf8');
  if (
    productionIndex.includes(DISPOSABLE_RELOCATION_REDUCER_MODULE)
    || /\brehearsal(?:_|[A-Z])/u.test(productionIndex)
  ) fail('Production entrypoint unexpectedly registered rehearsal reducers.');
  const productionSourceDigest = await directoryDigest(join(sourceModule, 'src'));
  const moduleDirectory = join(runtimeDirectory, 'module');
  await mkdir(moduleDirectory, { mode: 0o700 });
  const moduleMetadata = await lstat(moduleDirectory);
  if (
    !moduleMetadata.isDirectory()
    || moduleMetadata.isSymbolicLink()
    || (moduleMetadata.mode & 0o777) !== 0o700
  ) fail('Disposable module source root was not mode 0700.');
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
  const copiedIndexPath = join(moduleDirectory, 'src', 'index.ts');
  const reducerPath = join(
    moduleDirectory,
    'src',
    'reducers',
    'greaterRealmRelocationConnectedRehearsal.ts',
  );
  const enabledPolicy = enableDisposableGreaterRealmRelocationGates(
    await readFile(copiedPolicyPath, 'utf8'),
  );
  await writeFile(copiedPolicyPath, enabledPolicy, {
    encoding: 'utf8', mode: 0o600, flag: 'w',
  });
  assertGreaterRealmConnectedDisposableGateMode(enabledPolicy, 'TT');
  const copiedIndex = await readFile(copiedIndexPath, 'utf8');
  if (
    countOccurrences(copiedIndex, 'warpkeep-disposable-connected-relocation-rehearsal-v1') !== 0
    || countOccurrences(copiedIndex, DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 0
  ) fail('Disposable entrypoint registration marker was not absent.');
  await writeFile(copiedIndexPath, `${copiedIndex}${reducerExportAppend}`, {
    encoding: 'utf8', mode: 0o600, flag: 'w',
  });
  const hostileReducerSource = disposableGreaterRealmRelocationReducerSource();
  await writeFile(reducerPath, hostileReducerSource, {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  if (
    (await readFile(productionPolicyPath)).compare(productionPolicyBytes) !== 0
    || (await readFile(productionIndexPath)).compare(productionIndexBytes) !== 0
    || parseGreaterRealmConnectedProductionGateMode(
      await readFile(productionPolicyPath, 'utf8'),
    ).mode !== productionGateMode
    || countOccurrences(await readFile(copiedIndexPath, 'utf8'), DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 1
    || countOccurrences(hostileReducerSource, 'warpkeep.reducer(') !== 1
    || countOccurrences(
      hostileReducerSource,
      GREATER_REALM_CONNECTED_HOSTILE_CANARY_REDUCER,
    ) !== 1
  ) fail('Disposable relocation mutation escaped its private copy.');
  const disposableSourceDigest = await directoryDigest(join(moduleDirectory, 'src'));
  return Object.freeze({
    moduleDirectory,
    artifactPath: join(moduleDirectory, 'dist', 'bundle.js'),
    productionPolicyBytes,
    productionIndexBytes,
    productionSourceDigest,
    productionGateMode,
    disposableSourceDigest,
  });
}

export function childEnvironment(): Readonly<Record<string, string>> {
  const inherited = Object.fromEntries(safeChildEnvironmentKeys
    .filter(key => typeof process.env[key] === 'string' && process.env[key]!.length > 0)
    .map(key => [key, process.env[key]!]));
  return Object.freeze({ ...inherited, CI: '1', LANG: 'C', NO_COLOR: '1' });
}

export function terminateProcess(child: ChildProcess | undefined): void {
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

export type RuntimeControl = {
  deadline: number;
  environment: Readonly<Record<string, string>>;
  activeCliProcess?: ChildProcess;
  cliConfigPath?: string;
  refreshPrivateSqlCredential?: () => Promise<string>;
  privateSqlOperationTail?: Promise<void>;
  deadlineExpired: boolean;
};

function remainingTimeout(
  control: RuntimeControl,
  maximum = commandTimeoutMilliseconds,
): number {
  const remaining = control.deadline - Date.now();
  if (control.deadlineExpired || remaining <= 0) {
    fail('Greater Realm connected relocation exceeded its hard deadline.');
  }
  return Math.max(1, Math.min(maximum, remaining));
}

export async function runCommand(
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
      new GreaterRealmConnectedRelocationError('SpacetimeDB CLI process could not start.'),
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
        new GreaterRealmConnectedRelocationError(
          'SpacetimeDB CLI command did not terminate.',
        ),
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
      try { await reader.cancel(); } catch { /* Bounded rejection remains authoritative. */ }
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

export async function callLoopback(
  control: RuntimeControl,
  server: string,
  database: string,
  name: string,
  credential: string,
  body: string,
  expectedStatus = 200,
  timeout = requestTimeoutMilliseconds,
): Promise<string> {
  if (
    !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(server)
    || !/^warpkeep-[a-z0-9-]+$/.test(database)
    || !/^[a-z0-9_]+$/.test(name)
    || typeof credential !== 'string'
    || credential.length < 32
    || !body.startsWith('[')
  ) fail('Loopback reducer coordinates were invalid.');
  let response: Response;
  try {
    response = await fetch(
      `${server}/v1/database/${database}/call/${name}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential}`,
          'cache-control': 'no-store',
          'content-type': 'application/json',
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(remainingTimeout(control, timeout)),
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
  return text;
}

export async function sqlRaw(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  query: string,
): Promise<string> {
  if (
    !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(server)
    || !/^warpkeep-[a-z0-9-]+$/.test(database)
    || typeof ownerToken !== 'string'
    || ownerToken.length < 32
    || Buffer.byteLength(query) < 1
    || Buffer.byteLength(query) > maximumSqlBytes
    || query.includes('\0')
  ) fail('Loopback SQL coordinates were invalid.');
  if (typeof control.cliConfigPath !== 'string') {
    fail('Disposable CLI credential was unavailable for owner-private SQL.');
  }
  const prior = control.privateSqlOperationTail ?? Promise.resolve();
  let releaseCurrent: () => void = () => undefined;
  const current = new Promise<void>(resolveCurrent => { releaseCurrent = resolveCurrent; });
  const tail = prior.then(() => current);
  control.privateSqlOperationTail = tail;
  await prior;
  try {
    const sqlCredential = control.refreshPrivateSqlCredential === undefined
      ? ownerToken
      : await control.refreshPrivateSqlCredential();
    if (typeof sqlCredential !== 'string' || sqlCredential.length < 32) {
      fail('Fresh disposable CLI credential was invalid for owner-private SQL.');
    }
    const result = await runCommand(control, [
      `--config-path=${control.cliConfigPath}`,
      'sql',
      '--server', server,
      '--confirmed', 'true',
      '--no-config',
      database,
      query,
    ], {
      secrets: sqlCredential === ownerToken
        ? [ownerToken]
        : [ownerToken, sqlCredential],
      timeout: requestTimeoutMilliseconds,
    });
    if (result.code !== 0) {
      const diagnostic = result.stderr.replace(/[\r\n]+/g, ' ').slice(0, 500);
      fail(
        'Loopback owner-private SQL failed safely'
        + `${diagnostic.length > 0 ? ` (${diagnostic})` : ''}.`,
      );
    }
    return result.stdout;
  } finally {
    releaseCurrent();
    if (control.privateSqlOperationTail === tail) {
      control.privateSqlOperationTail = undefined;
    }
  }
}

export function sqlRows(
  text: string,
  columns: readonly string[],
): ReadonlyArray<Readonly<Record<string, string>>> {
  const normalized = text.replace(/\u001b\[[0-9;]*m/g, '').trim();
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
  const rows: Array<Readonly<Record<string, string>>> = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim().length === 0 || /^[\s+\-|─┼┌┐└┘├┤┬┴]+$/u.test(line)) continue;
    const fields = splitLine(line);
    if (fields.length !== columns.length) fail('Loopback SQL table row width was invalid.');
    rows.push(Object.freeze(Object.fromEntries(columns.map((column, index) => [
      column,
      decodeField(fields[index]!),
    ]))));
  }
  return Object.freeze(rows);
}

export async function queryRows(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  query: string,
  columns: readonly string[],
): Promise<ReadonlyArray<Readonly<Record<string, string>>>> {
  return sqlRows(await sqlRaw(control, server, database, ownerToken, query), columns);
}

export function readUnsigned(value: unknown, label: string): bigint {
  const parsed = typeof value === 'number' && Number.isSafeInteger(value)
    ? BigInt(value)
    : typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)
      ? BigInt(value)
      : undefined;
  if (parsed === undefined || parsed < 0n) fail(`${label} was not an unsigned integer.`);
  return parsed;
}

export function readBoolean(value: unknown, label: string): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  fail(`${label} was not boolean.`);
}

function readU32(value: unknown, label: string): number {
  const parsed = readUnsigned(value, label);
  if (parsed > 0xffff_ffffn) fail(`${label} exceeded u32.`);
  return Number(parsed);
}

function readStatusString(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 512
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail(`${label} was not a bounded string.`);
  return value;
}

export type ConnectedCutoverStatus = Readonly<{
  importMutationsCompiled: boolean;
  activationMutationsCompiled: boolean;
  releaseRows: bigint;
  releasePresent: boolean;
  releaseState: string;
  releaseImportsExact: boolean;
  releaseVerificationExact: boolean;
  releaseReady: boolean;
  activationRows: bigint;
  activationPresent: boolean;
  activationMode: string;
  rollbackEligible: boolean;
  resumeEligible: boolean;
  legacyFoundingOpen: boolean;
  legacyJourneyDispatchOpen: boolean;
  currentFounderCount: number;
  greaterRealmClaimRows: bigint;
  greaterRealmOccupancyRows: bigint;
  activeClaimRows: bigint;
  legacyClaimRows: bigint;
  auditRows: bigint;
  legacyRealmActive: boolean;
  atlasRows: bigint;
  atlasMode: string;
  activeVisibleRegionRows: bigint;
  workerSystemV2Rows: bigint;
  workerSystemV2Mode: string;
  currentWorldGraphApplicable: boolean;
  currentWorldGraphExact: boolean;
  currentWorldIntegrityViolationCount: number;
  activeAdmissionEligible: boolean;
}>;

/** Strict positional decoder for the generated 137-field procedure wire. */
export function parseConnectedCutoverStatus(text: string): ConnectedCutoverStatus {
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail('Cutover status response was invalid JSON.'); }
  if (
    !Array.isArray(value)
    || value.length !== GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS.length
    || GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS.length !== 137
    || GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS[95] !== 'auditRows'
  ) fail('Cutover status wire shape changed.');
  const at = (field: typeof GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS[number]) => {
    const index = GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS.indexOf(field);
    if (index < 0) fail('Cutover status field was not indexed.');
    return value[index];
  };
  const status = Object.freeze({
    importMutationsCompiled: readBoolean(at('importMutationsCompiled'), 'Import compile mode'),
    activationMutationsCompiled: readBoolean(at('activationMutationsCompiled'), 'Activation compile mode'),
    releaseRows: readUnsigned(at('releaseRows'), 'Release rows'),
    releasePresent: readBoolean(at('releasePresent'), 'Release presence'),
    releaseState: readStatusString(at('releaseState'), 'Release state'),
    releaseImportsExact: readBoolean(at('releaseImportsExact'), 'Release import exactness'),
    releaseVerificationExact: readBoolean(at('releaseVerificationExact'), 'Release verification exactness'),
    releaseReady: readBoolean(at('releaseReady'), 'Release readiness'),
    activationRows: readUnsigned(at('activationRows'), 'Activation rows'),
    activationPresent: readBoolean(at('activationPresent'), 'Activation presence'),
    activationMode: readStatusString(at('activationMode'), 'Activation mode'),
    rollbackEligible: readBoolean(at('rollbackEligible'), 'Rollback eligibility'),
    resumeEligible: readBoolean(at('resumeEligible'), 'Resume eligibility'),
    legacyFoundingOpen: readBoolean(at('legacyFoundingOpen'), 'Legacy founding policy'),
    legacyJourneyDispatchOpen: readBoolean(at('legacyJourneyDispatchOpen'), 'Legacy journey policy'),
    currentFounderCount: readU32(at('currentFounderCount'), 'Current founder count'),
    greaterRealmClaimRows: readUnsigned(at('greaterRealmClaimRows'), 'Greater Realm claim rows'),
    greaterRealmOccupancyRows: readUnsigned(at('greaterRealmOccupancyRows'), 'Greater Realm occupancy rows'),
    activeClaimRows: readUnsigned(at('activeClaimRows'), 'Active claim rows'),
    legacyClaimRows: readUnsigned(at('legacyClaimRows'), 'Legacy claim rows'),
    auditRows: readUnsigned(at('auditRows'), 'Audit rows'),
    legacyRealmActive: readBoolean(at('legacyRealmActive'), 'Legacy realm mode'),
    atlasRows: readUnsigned(at('atlasRows'), 'Atlas rows'),
    atlasMode: readStatusString(at('atlasMode'), 'Atlas mode'),
    activeVisibleRegionRows: readUnsigned(at('activeVisibleRegionRows'), 'Active region rows'),
    workerSystemV2Rows: readUnsigned(at('workerSystemV2Rows'), 'Worker V2 rows'),
    workerSystemV2Mode: readStatusString(at('workerSystemV2Mode'), 'Worker V2 mode'),
    currentWorldGraphApplicable: readBoolean(at('currentWorldGraphApplicable'), 'Current graph applicability'),
    currentWorldGraphExact: readBoolean(at('currentWorldGraphExact'), 'Current graph exactness'),
    currentWorldIntegrityViolationCount: readU32(at('currentWorldIntegrityViolationCount'), 'Current graph violations'),
    activeAdmissionEligible: readBoolean(at('activeAdmissionEligible'), 'Active admission eligibility'),
  });
  if (
    !['absent', 'importing', 'verifying', 'ready', 'canary', 'active', 'halted', 'rolled-back']
      .includes(status.releaseState)
    || !['absent', 'prepared', 'draining', 'frozen', 'planned', 'canary', 'active', 'halted', 'rolled-back']
      .includes(status.activationMode)
    || !['absent', 'canary', 'active', 'halted'].includes(status.atlasMode)
    || !['absent', 'canary', 'active', 'halted'].includes(status.workerSystemV2Mode)
  ) fail('Cutover status mode was invalid.');
  return status;
}

export async function countWhere(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  table: string,
  predicate = 'true',
): Promise<bigint> {
  if (
    !/^[a-z0-9_]+$/.test(table)
    || predicate.length > 8_192
    || /[;\0]/.test(predicate)
  ) fail('Loopback aggregate coordinates were invalid.');
  const rows = await queryRows(
    control,
    server,
    database,
    ownerToken,
    `SELECT COUNT(*) AS warpkeep_count FROM ${table} WHERE ${predicate}`,
    ['warpkeep_count'],
  );
  if (rows.length !== 1) fail('Loopback aggregate response cardinality was invalid.');
  return readUnsigned(rows[0]!.warpkeep_count, 'Loopback aggregate count');
}

export async function tableDigest(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  domain: string,
  queries: readonly string[],
): Promise<string> {
  const hash = createHash('sha256').update(`warpkeep.connected-relocation.${domain}.v1\n`);
  for (const query of queries) {
    const response = await sqlRaw(control, server, database, ownerToken, query);
    hash.update(`${Buffer.byteLength(query)}:${query}:${Buffer.byteLength(response)}:`);
    hash.update(response);
  }
  return hash.digest('hex');
}

const legacyTopologyTables = Object.freeze([
  Object.freeze({
    table: 'realm_v1',
    primaryKey: Object.freeze(['realm_id']),
    columns: Object.freeze([
      'realm_id', 'public_name', 'seed_name', 'numeric_seed', 'generation_version',
      'authoritative_radius', 'render_radius', 'player_capacity', 'active', 'created_at',
    ]),
  }),
  Object.freeze({
    table: 'world_tile',
    primaryKey: Object.freeze(['key']),
    columns: Object.freeze([
      'key', 'q', 'r', 'biome', 'terrain_seed', 'occupant_castle_id',
    ]),
  }),
  Object.freeze({
    table: 'world_tile_meta_v1',
    primaryKey: Object.freeze(['tile_key']),
    columns: Object.freeze([
      'tile_key', 'realm_id', 's', 'ring', 'sector', 'terrain_kind', 'passable',
      'movement_cost', 'static_content_kind', 'generation_version',
    ]),
  }),
  Object.freeze({
    table: 'castle_slot_v1',
    primaryKey: Object.freeze(['slot_id']),
    columns: Object.freeze([
      'slot_id', 'realm_id', 'tile_key', 'q', 'r', 'generation_version',
    ]),
  }),
  Object.freeze({
    table: 'castle_slot_claim_v1',
    primaryKey: Object.freeze(['slot_id']),
    columns: Object.freeze([
      'slot_id', 'owner_fid', 'castle_id', 'claimed_at', 'generation_version',
    ]),
  }),
  Object.freeze({
    table: 'castle',
    primaryKey: Object.freeze(['castle_id']),
    columns: Object.freeze([
      'castle_id', 'owner_fid', 'tile_key', 'q', 'r', 'level', 'name', 'created_at',
    ]),
  }),
]);
const legacyTopologyQueries = Object.freeze(legacyTopologyTables.map(({ table }) => (
  `SELECT * FROM ${table}`
)));
const unrelatedStateQueries = Object.freeze([
  'SELECT * FROM allowed_fid',
  'SELECT * FROM realm_profile_v1',
  'SELECT * FROM mark_account_v1',
  'SELECT * FROM resource_account_v1',
  'SELECT * FROM realm_worker_system_v1',
  'SELECT * FROM castle_worker_v1',
  'SELECT * FROM inner_keep_layout_v1',
  'SELECT * FROM inner_keep_building_catalog_v1',
  'SELECT * FROM inner_keep_build_level_v1',
  'SELECT * FROM castle_inner_builder_v1',
]);
const transactionAtomicityQueries = Object.freeze([
  ...legacyTopologyQueries,
  'SELECT activation_id, mode, snapshot_claim_count, snapshot_occupancy_count, '
    + 'canary_at, activated_at, halted_at, rolled_back_at FROM greater_realm_activation_v1',
  'SELECT * FROM greater_realm_castle_claim_v1',
  'SELECT * FROM greater_realm_cell_occupancy_v1',
  'SELECT node_id, active FROM greater_realm_resource_node_v1',
  'SELECT slot_id, active FROM greater_realm_castle_slot_v1',
  'SELECT component_key, active FROM greater_realm_navigation_component_v1',
  'SELECT atlas_id, state FROM greater_realm_release_v1',
  'SELECT * FROM realm_atlas_v1',
  'SELECT * FROM realm_atlas_visible_region_v1',
  'SELECT * FROM realm_worker_system_v2',
  'SELECT * FROM admin_audit',
]);

async function canonicalTableValueDigests(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  domain: string,
  tables: typeof legacyTopologyTables,
): Promise<Readonly<Record<string, string>>> {
  const entries: Array<readonly [string, string]> = [];
  for (const { table, columns, primaryKey } of tables) {
    const rows = await queryRows(
      control,
      server,
      database,
      ownerToken,
      `SELECT ${columns.join(', ')} FROM ${table}`,
      columns,
    );
    const keyedRows = rows.map(row => Object.freeze({
      key: JSON.stringify(primaryKey.map(column => row[column])),
      value: JSON.stringify(columns.map(column => row[column])),
    })).sort((left, right) => left.key.localeCompare(right.key));
    if (new Set(keyedRows.map(row => row.key)).size !== keyedRows.length) {
      fail(`Canonical ${domain} digest found duplicate keys in ${table}.`);
    }
    const canonicalRows = keyedRows.map(row => `${row.key}:${row.value}`);
    const hash = createHash('sha256')
      .update(`warpkeep.connected-relocation.${domain}.${table}.v1\n`)
      .update(`${canonicalRows.length}\n`)
      .update(`${canonicalRows.join('\n')}\n`)
      .digest('hex');
    entries.push(Object.freeze([table, hash] as const));
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function manifestParts(artifacts: GreaterRealmRuntimeReleaseArtifacts) {
  const manifest = artifacts.manifest as Readonly<Record<string, any>>;
  const totals = manifest.totals as Readonly<Record<string, unknown>>;
  if (
    totals === null
    || typeof totals !== 'object'
    || !Array.isArray(manifest.components)
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
    releaseSha256: manifest.releaseSha256 as string,
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

export type AdminCaller = (
  name: string,
  arguments_?: readonly unknown[],
  expectedStatus?: number,
  timeout?: number,
) => Promise<string>;

type ProductionCutoverTransition = keyof typeof GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS;

const productionTransitionTargets = Object.freeze({
  prepare: Object.freeze({ activationMode: 'prepared', releaseState: 'ready' }),
  beginDrain: Object.freeze({ activationMode: 'draining', releaseState: 'ready' }),
  freeze: Object.freeze({ activationMode: 'frozen', releaseState: 'ready' }),
  plan: Object.freeze({ activationMode: 'planned', releaseState: 'ready' }),
  canary: Object.freeze({ activationMode: 'canary', releaseState: 'canary' }),
  commit: Object.freeze({ activationMode: 'active', releaseState: 'active' }),
  halt: Object.freeze({ activationMode: 'halted', releaseState: 'halted' }),
  resume: Object.freeze({ activationMode: 'active', releaseState: 'active' }),
  rollback: Object.freeze({ activationMode: 'rolled-back', releaseState: 'ready' }),
} satisfies Readonly<Record<ProductionCutoverTransition, Readonly<{
  activationMode: string;
  releaseState: string;
}>>>);

type ConnectedCutoverStatusRead = Readonly<{
  canonicalWire: string;
  status: ConnectedCutoverStatus;
}>;

async function readConnectedCutoverStatus(
  callAdmin: AdminCaller,
): Promise<ConnectedCutoverStatusRead> {
  const response = await callAdmin(GREATER_REALM_CONNECTED_CUTOVER_STATUS_PROCEDURE);
  const status = parseConnectedCutoverStatus(response);
  let canonicalWire: string;
  try { canonicalWire = JSON.stringify(JSON.parse(response)); } catch {
    fail('Cutover status response could not be canonicalized.');
  }
  if (
    !status.importMutationsCompiled
    || !status.activationMutationsCompiled
    || !status.releasePresent
    || !status.releaseImportsExact
    || !status.releaseVerificationExact
    || status.releaseRows !== 1n
    || status.currentFounderCount !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
  ) fail('Production cutover status was not ready for connected relocation.');
  return Object.freeze({ canonicalWire, status });
}

function assertConnectedTransitionStatus(
  transition: ProductionCutoverTransition,
  status: ConnectedCutoverStatus,
): void {
  const current = ['canary', 'commit', 'halt', 'resume'].includes(transition);
  const planned = transition === 'plan';
  const rolledBack = transition === 'rollback';
  const currentMode = transition === 'canary'
    ? 'canary'
    : transition === 'halt'
      ? 'halted'
      : current
        ? 'active'
        : 'absent';
  if (
    status.activationRows !== 1n
    || !status.activationPresent
    || status.currentFounderCount !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
    || status.currentWorldGraphApplicable !== current
    || status.currentWorldGraphExact !== current
    || status.currentWorldIntegrityViolationCount !== 0
    || status.greaterRealmClaimRows !== (current || planned ? 100n : 0n)
    || status.greaterRealmOccupancyRows !== (current ? 100n : 0n)
    || status.activeClaimRows !== (current ? 100n : 0n)
    || status.legacyClaimRows !== (current ? 0n : 100n)
    || status.legacyRealmActive !== !current
    || status.atlasRows !== (current ? 1n : 0n)
    || status.atlasMode !== currentMode
    || status.activeVisibleRegionRows !== (current ? 6n : 0n)
    || status.workerSystemV2Rows !== (current ? 1n : 0n)
    || status.workerSystemV2Mode !== currentMode
    || status.releaseReady !== (!current)
    || status.legacyFoundingOpen !== (transition === 'prepare' || rolledBack)
    || status.legacyJourneyDispatchOpen !== (transition === 'prepare' || rolledBack)
    || status.rollbackEligible !== (
      transition === 'prepare'
      || transition === 'beginDrain'
      || transition === 'freeze'
      || transition === 'plan'
      || transition === 'canary'
    )
    || status.resumeEligible !== (transition === 'halt')
    || status.activeAdmissionEligible !== (
      transition === 'commit' || transition === 'resume'
    )
  ) fail(`Production ${transition} aggregate status was invalid.`);
}

/** Call one actual production reducer, prove +1 audit, then prove retry +0. */
async function callProductionCutoverTransition(
  callAdmin: AdminCaller,
  transition: ProductionCutoverTransition,
  timeout = 120_000,
): Promise<ConnectedCutoverStatus> {
  const reducer = GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS[transition];
  const target = productionTransitionTargets[transition];
  const before = await readConnectedCutoverStatus(callAdmin);
  await callAdmin(reducer, [], 200, timeout);
  const after = await readConnectedCutoverStatus(callAdmin);
  if (
    after.status.auditRows !== before.status.auditRows + 1n
    || after.status.activationMode !== target.activationMode
    || after.status.releaseState !== target.releaseState
  ) fail(`Production ${transition} postcondition or audit delta was invalid.`);
  assertConnectedTransitionStatus(transition, after.status);

  await callAdmin(reducer, [], 200, timeout);
  const retry = await readConnectedCutoverStatus(callAdmin);
  if (
    retry.status.auditRows !== after.status.auditRows
    || retry.canonicalWire !== after.canonicalWire
  ) fail(`Production ${transition} exact retry was not a status/audit no-op.`);
  return retry.status;
}

type WorkerRolloutStatus = Readonly<{
  phase: string;
  expectedCastleCount: bigint;
  expectedWorkerCount: bigint;
  actualCastleCount: bigint;
  actualWorkerCount: bigint;
  rosterDigest: string;
  resourceRosterDigest: string;
  resourceCatalogDigest: string;
  genericAssignments: bigint;
  genericOccupations: bigint;
  genericSchedules: bigint;
  genericCommandReceipts: bigint;
}>;

function parseWorkerRollout(text: string): WorkerRolloutStatus {
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail('Worker aggregate was invalid.'); }
  if (!Array.isArray(value) || value.length !== 36) fail('Worker aggregate was invalid.');
  const status = Object.freeze({
    phase: value[0],
    expectedCastleCount: readUnsigned(value[3], 'Worker expected castle count'),
    expectedWorkerCount: readUnsigned(value[4], 'Worker expected worker count'),
    actualCastleCount: readUnsigned(value[5], 'Worker actual castle count'),
    actualWorkerCount: readUnsigned(value[6], 'Worker actual worker count'),
    rosterDigest: value[7],
    malformedWorkerGraphRows: readUnsigned(value[9], 'Malformed Worker graph rows'),
    resourceAccounts: readUnsigned(value[10], 'Worker resource accounts'),
    missingResourceAccounts: readUnsigned(value[11], 'Missing Worker resource accounts'),
    orphanedResourceAccounts: readUnsigned(value[12], 'Orphaned Worker resource accounts'),
    resourceInvariantViolations: readUnsigned(value[13], 'Worker resource violations'),
    resourceRosterDigest: value[14],
    canonicalResourceCatalog: value[15],
    resourceCatalogDigest: value[16],
    legacyExpeditions: readUnsigned(value[17], 'Legacy expeditions'),
    legacyOccupations: readUnsigned(value[18], 'Legacy occupations'),
    legacySchedules: readUnsigned(value[19], 'Legacy schedules'),
    genericAssignments: readUnsigned(value[32], 'Generic Worker assignments'),
    genericOccupations: readUnsigned(value[33], 'Generic Worker occupations'),
    genericSchedules: readUnsigned(value[34], 'Generic Worker schedules'),
    genericCommandReceipts: readUnsigned(value[35], 'Generic Worker receipts'),
  });
  if (
    !['draining', 'active'].includes(String(status.phase))
    || status.expectedCastleCount !== BigInt(GREATER_REALM_CONNECTED_FOUNDER_COUNT)
    || status.expectedWorkerCount !== BigInt(GREATER_REALM_CONNECTED_WORKER_COUNT)
    || status.actualCastleCount !== BigInt(GREATER_REALM_CONNECTED_FOUNDER_COUNT)
    || status.actualWorkerCount !== BigInt(GREATER_REALM_CONNECTED_WORKER_COUNT)
    || typeof status.rosterDigest !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.rosterDigest)
    || status.malformedWorkerGraphRows !== 0n
    || status.resourceAccounts !== BigInt(GREATER_REALM_CONNECTED_FOUNDER_COUNT)
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
  ) fail('Worker aggregate was not ready for relocation rehearsal.');
  return status as WorkerRolloutStatus;
}

function parseInnerKeepCatalogPlan(text: string) {
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail('Inner Keep catalog plan was invalid.'); }
  if (!Array.isArray(value) || value.length !== 5 || typeof value[4] !== 'boolean') {
    fail('Inner Keep catalog plan was invalid.');
  }
  return Object.freeze({
    missingLayout: Number(readUnsigned(value[0], 'Inner Keep missing layout')),
    missingSlots: Number(readUnsigned(value[1], 'Inner Keep missing slots')),
    missingBuildings: Number(readUnsigned(value[2], 'Inner Keep missing buildings')),
    missingLevels: Number(readUnsigned(value[3], 'Inner Keep missing levels')),
    ready: value[4],
  });
}

function parseInnerKeepBuilderPlan(text: string) {
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail('Inner Keep Builder plan was invalid.'); }
  if (!Array.isArray(value) || value.length !== 4 || typeof value[3] !== 'boolean') {
    fail('Inner Keep Builder plan was invalid.');
  }
  return Object.freeze({
    expectedCastles: Number(readUnsigned(value[0], 'Inner Keep expected castles')),
    existingBuilders: Number(readUnsigned(value[1], 'Inner Keep existing builders')),
    missingBuilders: Number(readUnsigned(value[2], 'Inner Keep missing builders')),
    ready: value[3],
  });
}

function parseInnerKeepStatus(text: string) {
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail('Inner Keep status was invalid.'); }
  if (!Array.isArray(value) || value.length !== 27) fail('Inner Keep status was invalid.');
  return Object.freeze({
    layoutRows: readUnsigned(value[0], 'Inner Keep layout rows'),
    slotRows: readUnsigned(value[1], 'Inner Keep slot rows'),
    buildingCatalogRows: readUnsigned(value[2], 'Inner Keep catalog rows'),
    levelPolicyRows: readUnsigned(value[3], 'Inner Keep level rows'),
    castleRows: readUnsigned(value[4], 'Inner Keep castle rows'),
    builderRows: readUnsigned(value[5], 'Inner Keep builder rows'),
    buildingRows: readUnsigned(value[6], 'Inner Keep building rows'),
    activeProjects: readUnsigned(value[7], 'Inner Keep active projects'),
    receiptRows: readUnsigned(value[8], 'Inner Keep receipt rows'),
    scheduleRows: readUnsigned(value[9], 'Inner Keep schedule rows'),
    missingBuilders: readUnsigned(value[10], 'Inner Keep missing builders'),
    orphanBuilders: readUnsigned(value[11], 'Inner Keep orphan builders'),
    invalidBuilders: readUnsigned(value[12], 'Inner Keep invalid builders'),
    invalidBuildings: readUnsigned(value[13], 'Inner Keep invalid buildings'),
    invalidSchedules: readUnsigned(value[14], 'Inner Keep invalid schedules'),
    builderProjectMismatches: readUnsigned(value[15], 'Inner Keep project mismatches'),
    staticCatalogExact: value[16],
    workerSystemReady: value[17],
    active: value[21],
  });
}

export async function seedCanonicalLegacyV16(
  callAdmin: AdminCaller,
  moduleDigest: string,
  database: string,
): Promise<void> {
  console.log(`Connected relocation ${database}: seeding canonical v16 world.`);
  await callAdmin('admin_seed_world', [], 200, 120_000);
  await callAdmin('admin_seed_genesis_forest_layout_v1', [], 200, 120_000);
  for (const [name, count, policy] of [
    ['admin_seed_genesis_tier_i_gold_sites_v1', 24, 'genesis-001-tier1-gold-sites-v3'],
    ['admin_seed_genesis_tier_i_food_sites_v1', 96, 'genesis-001-tier1-food-sites-v2'],
    ['admin_seed_genesis_tier_i_wood_sites_v1', 96, 'genesis-001-tier1-wood-sites-v2'],
    ['admin_seed_genesis_tier_i_stone_sites_v1', 96, 'genesis-001-tier1-stone-sites-v3'],
  ] as const) {
    await callAdmin(name, [count, policy], 200, 120_000);
  }
  for (let index = 0; index < GREATER_REALM_CONNECTED_FOUNDER_COUNT; index += 1) {
    const ordinal = String(index + 1).padStart(3, '0');
    const fid = 9_910_001 + index;
    await callAdmin('admin_admit_founder_v1', [
      fid,
      'disposable connected Greater Realm relocation rehearsal',
      `relocation.keeper.${ordinal}`,
      { some: `Relocation Keeper ${ordinal}` },
      'https://i.imgur.com/warpkeep-relocation-keeper.png',
      { some: 'Synthetic numeric-loopback-only relocation founder' },
      profilePolicyVersion,
    ], 200, 120_000);
    if ((index + 1) % 25 === 0) {
      console.log(`Connected relocation ${database}: founders=${index + 1}/100.`);
    }
  }
  await callAdmin('admin_stage_worker_system_v1');
  await callAdmin('admin_backfill_worker_roster_v1', [], 200, 120_000);
  await callAdmin('admin_begin_worker_legacy_drain_v1');
  const draining = parseWorkerRollout(
    await callAdmin('admin_get_worker_rollout_status_v2'),
  );
  await callAdmin('admin_activate_worker_system_v1', [
    workerProtocolCapability,
    'alpha-0.3.18',
    rehearsalClientDigest,
    moduleDigest,
    rehearsalSourceCommit,
    2,
    resourcePolicyVersion,
    draining.resourceCatalogDigest,
    Number(draining.expectedCastleCount),
    Number(draining.expectedWorkerCount),
    draining.rosterDigest,
    draining.resourceRosterDigest,
  ]);
  const activeWorker = parseWorkerRollout(
    await callAdmin('admin_get_worker_rollout_status_v2'),
  );
  if (
    activeWorker.phase !== 'active'
    || activeWorker.genericAssignments !== 0n
    || activeWorker.genericOccupations !== 0n
    || activeWorker.genericSchedules !== 0n
    || activeWorker.genericCommandReceipts !== 0n
  ) fail('Canonical Worker graph was not exactly active and idle.');

  const catalogPlan = parseInnerKeepCatalogPlan(
    await callAdmin('admin_plan_inner_keep_catalog_v1'),
  );
  if (
    catalogPlan.missingLayout !== 1
    || catalogPlan.missingSlots !== 0
    || catalogPlan.missingBuildings !== 6
    || catalogPlan.missingLevels !== 30
    || catalogPlan.ready
  ) fail('Inner Keep catalog did not begin exactly empty.');
  await callAdmin('admin_seed_inner_keep_catalog_v1', [
    innerKeepProtocolCapability,
    innerKeepPolicyDigest,
    innerKeepLayoutDigest,
    innerKeepAssetCatalogDigest,
    catalogPlan.missingLayout,
    catalogPlan.missingSlots,
    catalogPlan.missingBuildings,
    catalogPlan.missingLevels,
  ]);
  const builderPlan = parseInnerKeepBuilderPlan(
    await callAdmin('admin_plan_inner_keep_builders_v1'),
  );
  if (
    builderPlan.expectedCastles !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
    || builderPlan.existingBuilders !== 0
    || builderPlan.missingBuilders !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
    || builderPlan.ready
  ) fail('Inner Keep Builder graph did not begin exactly empty.');
  await callAdmin('admin_backfill_inner_keep_builders_v1', [
    innerKeepProtocolCapability,
    innerKeepPolicyDigest,
    innerKeepLayoutDigest,
    innerKeepAssetCatalogDigest,
    builderPlan.expectedCastles,
    builderPlan.existingBuilders,
    builderPlan.missingBuilders,
  ]);
  await callAdmin('admin_activate_inner_keep_v1', [
    innerKeepProtocolCapability,
    innerKeepPolicyDigest,
    innerKeepLayoutDigest,
    innerKeepAssetCatalogDigest,
    'alpha-0.3.18',
    rehearsalClientDigest,
    moduleDigest,
    rehearsalSourceCommit,
    GREATER_REALM_CONNECTED_FOUNDER_COUNT,
  ]);
  const innerKeep = parseInnerKeepStatus(
    await callAdmin('admin_get_inner_keep_status_v1'),
  );
  if (
    innerKeep.layoutRows !== 1n
    || innerKeep.slotRows !== 0n
    || innerKeep.buildingCatalogRows !== 6n
    || innerKeep.levelPolicyRows !== 30n
    || innerKeep.castleRows !== BigInt(GREATER_REALM_CONNECTED_FOUNDER_COUNT)
    || innerKeep.builderRows !== BigInt(GREATER_REALM_CONNECTED_FOUNDER_COUNT)
    || innerKeep.buildingRows !== 0n
    || innerKeep.activeProjects !== 0n
    || innerKeep.receiptRows !== 0n
    || innerKeep.scheduleRows !== 0n
    || innerKeep.missingBuilders !== 0n
    || innerKeep.orphanBuilders !== 0n
    || innerKeep.invalidBuilders !== 0n
    || innerKeep.invalidBuildings !== 0n
    || innerKeep.invalidSchedules !== 0n
    || innerKeep.builderProjectMismatches !== 0n
    || innerKeep.staticCatalogExact !== true
    || innerKeep.workerSystemReady !== true
    || innerKeep.active !== true
  ) fail('Inner Keep graph was not exactly active and idle.');
}

export async function importReadyGreaterRealmV17(
  callAdmin: AdminCaller,
  artifacts: GreaterRealmRuntimeReleaseArtifacts,
  database: string,
): Promise<number> {
  console.log(`Connected relocation ${database}: importing tracked v17 release.`);
  const { manifest, totals, components, regions, releaseSha256 } = manifestParts(artifacts);
  const headerJson = canonicalJsonText(exactGreaterRealmReleaseHeader(manifest));
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
  for (const chunk of artifacts.chunks) {
    await callAdmin('admin_import_greater_realm_chunk_v1', [
      manifest.atlasId,
      importEpoch,
      sha256(chunk.bytes),
      chunk.bytes.toString('utf8'),
    ]);
  }
  let status = parseGreaterRealmConnectedStatus(
    await callAdmin('admin_get_greater_realm_status_v1'),
  );
  if (
    status.state !== 'importing'
    || !status.importsExact
    || status.componentRows !== BigInt(totals.componentCount)
    || status.chunkRows !== BigInt(totals.chunkCount)
    || status.cellRows !== BigInt(totals.cellCount)
    || status.slotRows !== BigInt(totals.castleSlotCount)
    || status.resourceRows !== BigInt(totals.resourceNodeCount)
  ) fail('Canonical v17 import counts were not exact.');
  await callAdmin('admin_begin_greater_realm_verification_v1', [
    manifest.atlasId,
    importEpoch,
  ]);
  let verificationCalls = 0;
  while (true) {
    status = parseGreaterRealmConnectedStatus(
      await callAdmin('admin_get_greater_realm_status_v1'),
    );
    if (status.verificationPhase === 'complete') break;
    if (status.state !== 'verifying' || verificationCalls >= 256) {
      fail('Bounded v17 verification did not converge.');
    }
    await callAdmin('admin_verify_greater_realm_batch_v1', [
      manifest.atlasId,
      importEpoch,
      256,
    ]);
    verificationCalls += 1;
  }
  await callAdmin('admin_finalize_greater_realm_release_v1', [
    manifest.atlasId,
    importEpoch,
    manifest.publicApprovalReceiptId,
    releaseSha256,
    status.verificationDigest,
    'Synthetic Connected Relocation Rehearsal',
  ]);
  const ready = parseGreaterRealmConnectedStatus(
    await callAdmin('admin_get_greater_realm_status_v1'),
  );
  if (
    !ready.present
    || ready.atlasId !== manifest.atlasId
    || ready.state !== 'ready'
    || !ready.ready
    || !ready.importMutationsCompiled
    || !ready.activationMutationsCompiled
    || ready.claimRows !== 0n
    || ready.occupancyRows !== 0n
    || ready.activationRows !== 0n
    || ready.publicAtlasRows !== 0n
    || ready.publicRegionRows !== 0n
    || ready.workerSystemRows !== 0n
  ) fail('Final ready-but-inactive v17 release was invalid.');
  const cutoverReady = await readConnectedCutoverStatus(callAdmin);
  if (
    cutoverReady.status.releaseState !== 'ready'
    || cutoverReady.status.activationPresent
    || cutoverReady.status.activationMode !== 'absent'
    || cutoverReady.status.activationRows !== 0n
    || cutoverReady.status.legacyClaimRows
      !== BigInt(GREATER_REALM_CONNECTED_FOUNDER_COUNT)
    || cutoverReady.status.greaterRealmClaimRows !== 0n
    || cutoverReady.status.greaterRealmOccupancyRows !== 0n
    || !cutoverReady.status.legacyRealmActive
    || cutoverReady.status.atlasRows !== 0n
    || cutoverReady.status.workerSystemV2Rows !== 0n
    || cutoverReady.status.currentWorldGraphApplicable
    || cutoverReady.status.currentWorldGraphExact
    || cutoverReady.status.activeAdmissionEligible
  ) fail('Actual production cutover status was not exactly ready and inactive.');
  console.log(
    `Connected relocation ${database}: v17 ready; verification_calls=${verificationCalls}.`,
  );
  return verificationCalls;
}

function readSigned(value: unknown, label: string): bigint {
  const parsed = typeof value === 'number' && Number.isSafeInteger(value)
    ? BigInt(value)
    : typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)$/.test(value)
      ? BigInt(value)
      : undefined;
  if (parsed === undefined) fail(`${label} was not a signed integer.`);
  return parsed;
}

export async function assertCanonicalSeedCounts(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
): Promise<void> {
  for (const [table, expected] of [
    ['realm_v1', 1n],
    ['world_tile', 10_000n],
    ['world_tile_meta_v1', 10_000n],
    ['castle_slot_v1', 100n],
    ['castle_slot_claim_v1', 100n],
    ['castle', 100n],
    ['allowed_fid', 100n],
    ['realm_profile_v1', 100n],
    ['mark_account_v1', 100n],
    ['resource_account_v1', 100n],
    ['realm_worker_system_v1', 1n],
    ['castle_worker_v1', 400n],
    ['castle_inner_builder_v1', 100n],
    ['inner_keep_layout_v1', 1n],
    ['inner_keep_building_catalog_v1', 6n],
    ['inner_keep_build_level_v1', 30n],
  ] as const) {
    if (await countWhere(control, server, database, ownerToken, table) !== expected) {
      fail(`Canonical v16 seed count was invalid for ${table}.`);
    }
  }
  if (
    await countWhere(control, server, database, ownerToken, 'realm_v1', 'active = true') !== 1n
    || await countWhere(control, server, database, ownerToken, 'castle_worker_v1', "status = 'idle'") !== 400n
    || await countWhere(control, server, database, ownerToken, 'worker_assignment_v1') !== 0n
    || await countWhere(control, server, database, ownerToken, 'worker_node_occupation_v1') !== 0n
    || await countWhere(control, server, database, ownerToken, 'worker_assignment_schedule_v_1') !== 0n
    || await countWhere(control, server, database, ownerToken, 'castle_inner_keep_building_v1') !== 0n
  ) fail('Canonical v16 seed was not exactly active, idle, and journey-free.');
}

type ActivationAudit = Readonly<{
  mode: string;
  preparedAt: string;
  canaryAt: string;
  activatedAt: string;
  haltedAt: string;
  rolledBackAt: string;
  snapshotCastleCount: bigint;
  snapshotWorkerCount: bigint;
  snapshotClaimCount: bigint;
  snapshotOccupancyCount: bigint;
}>;

export async function readActivationAudit(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
): Promise<ActivationAudit> {
  const columns = [
    'mode',
    'prepared_at',
    'canary_at',
    'activated_at',
    'halted_at',
    'rolled_back_at',
    'snapshot_castle_count',
    'snapshot_worker_count',
    'snapshot_claim_count',
    'snapshot_occupancy_count',
  ] as const;
  const rows = await queryRows(
    control,
    server,
    database,
    ownerToken,
    `SELECT ${columns.join(', ')} FROM greater_realm_activation_v1`,
    columns,
  );
  if (rows.length !== 1) fail('Activation audit row cardinality was invalid.');
  const row = rows[0]!;
  return Object.freeze({
    mode: row.mode!,
    preparedAt: row.prepared_at!,
    canaryAt: row.canary_at!,
    activatedAt: row.activated_at!,
    haltedAt: row.halted_at!,
    rolledBackAt: row.rolled_back_at!,
    snapshotCastleCount: readUnsigned(row.snapshot_castle_count, 'Snapshot castle count'),
    snapshotWorkerCount: readUnsigned(row.snapshot_worker_count, 'Snapshot worker count'),
    snapshotClaimCount: readUnsigned(row.snapshot_claim_count, 'Snapshot claim count'),
    snapshotOccupancyCount: readUnsigned(row.snapshot_occupancy_count, 'Snapshot occupancy count'),
  });
}

export async function assertRelocatedCastleGraph(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
): Promise<void> {
  const claims = await queryRows(
    control,
    server,
    database,
    ownerToken,
    'SELECT slot_id, owner_fid, castle_id, atlas_id, state, claim_kind, '
      + 'allocation_sequence, legacy_tile_key FROM greater_realm_castle_claim_v1',
    [
      'slot_id', 'owner_fid', 'castle_id', 'atlas_id', 'state', 'claim_kind',
      'allocation_sequence', 'legacy_tile_key',
    ],
  );
  const castles = await queryRows(
    control,
    server,
    database,
    ownerToken,
    'SELECT castle_id, owner_fid, tile_key, q, r FROM castle',
    ['castle_id', 'owner_fid', 'tile_key', 'q', 'r'],
  );
  const occupancies = await queryRows(
    control,
    server,
    database,
    ownerToken,
    'SELECT cell_key, atlas_id, region_id, castle_id, atlas_revision '
      + 'FROM greater_realm_cell_occupancy_v1',
    ['cell_key', 'atlas_id', 'region_id', 'castle_id', 'atlas_revision'],
  );
  const slots = await queryRows(
    control,
    server,
    database,
    ownerToken,
    'SELECT slot_id, atlas_id, cell_key, region_id, tier, active '
      + 'FROM greater_realm_castle_slot_v1',
    ['slot_id', 'atlas_id', 'cell_key', 'region_id', 'tier', 'active'],
  );
  const cells = await queryRows(
    control,
    server,
    database,
    ownerToken,
    'SELECT cell_key, atlas_id, region_id, atlas_q, atlas_r, tier, passable '
      + 'FROM greater_realm_cell_v1',
    ['cell_key', 'atlas_id', 'region_id', 'atlas_q', 'atlas_r', 'tier', 'passable'],
  );
  if (
    claims.length !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
    || castles.length !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
    || occupancies.length !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
    || slots.length !== 600
    || cells.length !== 16_475
  ) fail('Relocated graph row counts were invalid.');
  const byCastle = new Map(castles.map(row => [row.castle_id, row]));
  const occupancyByCastle = new Map(occupancies.map(row => [row.castle_id, row]));
  const slotById = new Map(slots.map(row => [row.slot_id, row]));
  const cellById = new Map(cells.map(row => [row.cell_key, row]));
  const sequences = new Set<string>();
  const legacyTiles = new Set<string>();
  for (const claim of claims) {
    const castle = byCastle.get(claim.castle_id);
    const occupancy = occupancyByCastle.get(claim.castle_id);
    const slot = slotById.get(claim.slot_id);
    const cell = slot === undefined ? undefined : cellById.get(slot.cell_key);
    const sequence = readUnsigned(claim.allocation_sequence, 'Relocation allocation sequence');
    if (
      castle === undefined
      || occupancy === undefined
      || slot === undefined
      || cell === undefined
      || claim.owner_fid !== castle.owner_fid
      || claim.atlas_id !== slot.atlas_id
      || claim.state !== 'active'
      || claim.claim_kind !== 'relocated'
      || sequence >= BigInt(GREATER_REALM_CONNECTED_FOUNDER_COUNT)
      || sequences.has(sequence.toString())
      || claim.legacy_tile_key.length === 0
      || legacyTiles.has(claim.legacy_tile_key)
      || castle.tile_key !== cell.cell_key
      || readSigned(castle.q, 'Relocated castle q') !== readSigned(cell.atlas_q, 'Target cell q')
      || readSigned(castle.r, 'Relocated castle r') !== readSigned(cell.atlas_r, 'Target cell r')
      || occupancy.cell_key !== cell.cell_key
      || occupancy.atlas_id !== claim.atlas_id
      || occupancy.region_id !== cell.region_id
      || occupancy.atlas_revision !== '1'
      || slot.region_id !== cell.region_id
      || slot.tier !== '1'
      || cell.tier !== '1'
      || !readBoolean(slot.active, 'Relocated slot active flag')
      || !readBoolean(cell.passable, 'Relocated target passability')
    ) fail('Relocated castle/claim/occupancy graph was invalid.');
    sequences.add(sequence.toString());
    legacyTiles.add(claim.legacy_tile_key);
  }
  if (
    sequences.size !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
    || legacyTiles.size !== GREATER_REALM_CONNECTED_FOUNDER_COUNT
  ) fail('Relocation allocation/preimage uniqueness was invalid.');
}

export async function assertCanaryOrActiveState(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  mode: 'canary' | 'active' | 'halted',
): Promise<void> {
  for (const [table, expected] of [
    ['greater_realm_navigation_component_v1', 8n],
    ['greater_realm_castle_slot_v1', 600n],
    ['greater_realm_resource_node_v1', 12_000n],
  ] as const) {
    if (
      await countWhere(control, server, database, ownerToken, table, 'active = true')
        !== expected
    ) fail(`Static activation was incomplete for ${table}.`);
  }
  if (
    await countWhere(control, server, database, ownerToken, 'greater_realm_castle_claim_v1') !== 100n
    || await countWhere(control, server, database, ownerToken, 'greater_realm_cell_occupancy_v1') !== 100n
    || await countWhere(control, server, database, ownerToken, 'castle_slot_claim_v1') !== 0n
    || await countWhere(control, server, database, ownerToken, 'realm_v1', 'active = false') !== 1n
    || await countWhere(control, server, database, ownerToken, 'realm_atlas_v1', `mode = '${mode}'`) !== 1n
    || await countWhere(control, server, database, ownerToken, 'realm_atlas_visible_region_v1', 'active = true') !== 6n
    || await countWhere(control, server, database, ownerToken, 'realm_worker_system_v2', `mode = '${mode}'`) !== 1n
    || await countWhere(control, server, database, ownerToken, 'greater_realm_release_v1', `state = '${mode}'`) !== 1n
  ) fail(`Greater Realm ${mode} root/count invariants were invalid.`);
  const workerRoots = await queryRows(
    control,
    server,
    database,
    ownerToken,
    'SELECT current_castle_count, current_worker_count, workers_per_castle, '
      + 'castle_capacity FROM realm_worker_system_v2',
    ['current_castle_count', 'current_worker_count', 'workers_per_castle', 'castle_capacity'],
  );
  if (
    workerRoots.length !== 1
    || workerRoots[0]!.current_castle_count !== '100'
    || workerRoots[0]!.current_worker_count !== '400'
    || workerRoots[0]!.workers_per_castle !== '4'
    || workerRoots[0]!.castle_capacity !== '600'
  ) fail(`Greater Realm ${mode} Worker root was invalid.`);
  const activation = await readActivationAudit(control, server, database, ownerToken);
  if (
    activation.mode !== mode
    || activation.snapshotCastleCount !== 100n
    || activation.snapshotWorkerCount !== 400n
    || activation.snapshotClaimCount !== 100n
    || activation.snapshotOccupancyCount !== 100n
  ) fail(`Greater Realm ${mode} activation snapshot was invalid.`);
  await assertRelocatedCastleGraph(control, server, database, ownerToken);
}

export async function runActivationPrefix(callAdmin: AdminCaller): Promise<void> {
  await callProductionCutoverTransition(callAdmin, 'prepare');
  await callProductionCutoverTransition(callAdmin, 'beginDrain');
  await callProductionCutoverTransition(callAdmin, 'freeze');
  await callProductionCutoverTransition(callAdmin, 'plan');
}

export type ScenarioCoordinates = Readonly<{
  control: RuntimeControl;
  server: string;
  database: string;
  ownerToken: string;
  callAdmin: AdminCaller;
}>;

async function runRollbackScenario(
  coordinates: ScenarioCoordinates,
): Promise<Readonly<{ canaryElapsed: number; hostileRollbackDigest: string }>> {
  const { control, server, database, ownerToken, callAdmin } = coordinates;
  const legacyBefore = await canonicalTableValueDigests(
    control,
    server,
    database,
    ownerToken,
    'legacy-topology',
    legacyTopologyTables,
  );
  const unrelatedBefore = await tableDigest(
    control, server, database, ownerToken, 'unrelated-state', unrelatedStateQueries,
  );
  const componentsBefore = await tableDigest(
    control,
    server,
    database,
    ownerToken,
    'finalized-components',
    ['SELECT * FROM greater_realm_navigation_component_v1'],
  );
  await runActivationPrefix(callAdmin);
  const atomicBefore = await tableDigest(
    control, server, database, ownerToken, 'hostile-atomicity', transactionAtomicityQueries,
  );
  const hostileStatusBefore = await readConnectedCutoverStatus(callAdmin);
  const hostileResponse = await callAdmin(
    GREATER_REALM_CONNECTED_HOSTILE_CANARY_REDUCER,
    [],
    530,
    GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS,
  );
  if (!hostileResponse.includes('GREATER_REALM_RESOURCE_ACTIVATION_INVALID')) {
    const diagnostic = hostileResponse.replace(/[\r\n]+/g, ' ').slice(0, 500);
    fail(
      'Hostile drift did not reach the exact static activation rejection'
      + `${diagnostic.length > 0 ? ` (${diagnostic})` : ''}.`,
    );
  }
  const atomicAfter = await tableDigest(
    control, server, database, ownerToken, 'hostile-atomicity', transactionAtomicityQueries,
  );
  const hostileStatusAfter = await readConnectedCutoverStatus(callAdmin);
  if (
    atomicAfter !== atomicBefore
    || hostileStatusAfter.status.auditRows !== hostileStatusBefore.status.auditRows
    || hostileStatusAfter.canonicalWire !== hostileStatusBefore.canonicalWire
  ) {
    fail('Injected hostile drift rejection was not transaction-atomic.');
  }
  console.log(`Connected relocation ${database}: hostile drift rolled back atomically.`);
  const canaryStartedAt = Date.now();
  await callProductionCutoverTransition(
    callAdmin,
    'canary',
    GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS,
  );
  const canaryElapsed = Date.now() - canaryStartedAt;
  if (canaryElapsed > GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS) {
    fail('Canary static flip exceeded its hard deadline.');
  }
  console.log(
    `Connected relocation ${database}: canary static flip completed in ${canaryElapsed}ms.`,
  );
  await assertCanaryOrActiveState(control, server, database, ownerToken, 'canary');
  await callProductionCutoverTransition(
    callAdmin,
    'rollback',
    GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS,
  );
  const legacyAfter = await canonicalTableValueDigests(
    control,
    server,
    database,
    ownerToken,
    'legacy-topology',
    legacyTopologyTables,
  );
  const unrelatedAfter = await tableDigest(
    control, server, database, ownerToken, 'unrelated-state', unrelatedStateQueries,
  );
  const componentsAfter = await tableDigest(
    control,
    server,
    database,
    ownerToken,
    'finalized-components',
    ['SELECT * FROM greater_realm_navigation_component_v1'],
  );
  const changedLegacyTable = legacyTopologyTables.find(({ table }) => (
    legacyAfter[table] !== legacyBefore[table]
  ))?.table;
  if (changedLegacyTable !== undefined) {
    fail(`Rollback did not restore byte-exact v16 topology for ${changedLegacyTable}.`);
  }
  if (unrelatedAfter !== unrelatedBefore) fail('Rollback changed unrelated live state.');
  if (componentsAfter !== componentsBefore) {
    fail('Rollback changed finalized navigation component bytes.');
  }
  const rolledBack = await readActivationAudit(control, server, database, ownerToken);
  if (
    rolledBack.mode !== 'rolled-back'
    || rolledBack.snapshotClaimCount !== 0n
    || rolledBack.snapshotOccupancyCount !== 0n
    || await countWhere(control, server, database, ownerToken, 'realm_v1', 'active = true') !== 1n
    || await countWhere(control, server, database, ownerToken, 'castle_slot_claim_v1') !== 100n
    || await countWhere(control, server, database, ownerToken, 'greater_realm_castle_claim_v1') !== 0n
    || await countWhere(control, server, database, ownerToken, 'greater_realm_cell_occupancy_v1') !== 0n
    || await countWhere(control, server, database, ownerToken, 'realm_atlas_v1') !== 0n
    || await countWhere(control, server, database, ownerToken, 'realm_atlas_visible_region_v1') !== 0n
    || await countWhere(control, server, database, ownerToken, 'realm_worker_system_v2') !== 0n
    || await countWhere(control, server, database, ownerToken, 'greater_realm_release_v1', "state = 'ready'") !== 1n
    || await countWhere(control, server, database, ownerToken, 'greater_realm_navigation_component_v1', 'active = true') !== 8n
    || await countWhere(control, server, database, ownerToken, 'greater_realm_castle_slot_v1', 'active = false') !== 600n
    || await countWhere(control, server, database, ownerToken, 'greater_realm_resource_node_v1', 'active = false') !== 12_000n
  ) fail('Rolled-back Greater Realm state was invalid.');
  console.log(`Connected relocation ${database}: byte-exact v16 rollback passed.`);
  return Object.freeze({ canaryElapsed, hostileRollbackDigest: atomicAfter });
}

export async function runActiveResumeScenario(
  coordinates: ScenarioCoordinates,
): Promise<Readonly<{ canaryElapsed: number; activatedAt: string; haltedAt: string }>> {
  const { control, server, database, ownerToken, callAdmin } = coordinates;
  await runActivationPrefix(callAdmin);
  const canaryStartedAt = Date.now();
  await callProductionCutoverTransition(
    callAdmin,
    'canary',
    GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS,
  );
  const canaryElapsed = Date.now() - canaryStartedAt;
  console.log(
    `Connected relocation ${database}: canary static flip completed in ${canaryElapsed}ms.`,
  );
  await assertCanaryOrActiveState(control, server, database, ownerToken, 'canary');
  await callProductionCutoverTransition(callAdmin, 'commit');
  await assertCanaryOrActiveState(control, server, database, ownerToken, 'active');
  const committed = await readActivationAudit(control, server, database, ownerToken);
  if (
    committed.activatedAt.length === 0
    || committed.canaryAt.length === 0
    || committed.haltedAt === committed.activatedAt
  ) fail('Committed activation timestamps were invalid.');
  await callProductionCutoverTransition(callAdmin, 'halt');
  await assertCanaryOrActiveState(control, server, database, ownerToken, 'halted');
  const halted = await readActivationAudit(control, server, database, ownerToken);
  if (
    halted.activatedAt !== committed.activatedAt
    || halted.haltedAt.length === 0
    || halted.preparedAt !== committed.preparedAt
    || halted.canaryAt !== committed.canaryAt
  ) fail('Halt did not preserve immutable activation timestamps.');
  await callProductionCutoverTransition(callAdmin, 'resume');
  await assertCanaryOrActiveState(control, server, database, ownerToken, 'active');
  const resumed = await readActivationAudit(control, server, database, ownerToken);
  if (
    resumed.activatedAt !== committed.activatedAt
    || resumed.haltedAt !== halted.haltedAt
    || resumed.preparedAt !== committed.preparedAt
    || resumed.canaryAt !== committed.canaryAt
  ) fail('Resume rewrote immutable activation history.');
  return Object.freeze({
    canaryElapsed,
    activatedAt: resumed.activatedAt,
    haltedAt: resumed.haltedAt,
  });
}

export async function publishDisposableDatabase(
  control: RuntimeControl,
  server: string,
  database: string,
  artifactPath: string,
  ownerToken: string,
): Promise<void> {
  const publishArguments = [
    `--config-path=${control.cliConfigPath!}`,
    'publish',
    '--server', server,
    '--js-path', artifactPath,
    '--delete-data=never',
    '--no-config',
    database,
  ];
  if (
    publishArguments.includes('--break-clients')
    || publishArguments.some(value => value === '--yes' || value.startsWith('--yes='))
    || publishArguments.filter(value => value === '--delete-data=never').length !== 1
    || publishArguments.some(value => (
      value.startsWith('--delete-data=') && value !== '--delete-data=never'
    ))
  ) fail('Disposable publication arguments were unsafe.');
  const published = await runCommand(control, publishArguments, { secrets: [ownerToken] });
  if (published.code !== 0) {
    const diagnostic = published.stderr.replace(/[\r\n]+/g, ' ').slice(0, 500);
    fail(`Disposable in-memory publication failed safely${diagnostic ? ` (${diagnostic})` : ''}.`);
  }
}

async function attestPublishedProductionCutoverAbi(
  control: RuntimeControl,
  server: string,
  database: string,
): Promise<void> {
  const described = await runCommand(control, [
    `--config-path=${control.cliConfigPath!}`,
    'describe',
    '--json',
    '--anonymous',
    '--server', server,
    '--no-config',
    database,
  ]);
  if (described.code !== 0) {
    fail('Disposable published cutover ABI could not be described.');
  }
  let schema: unknown;
  try {
    schema = JSON.parse(described.stdout);
  } catch {
    fail('Disposable published cutover ABI was not machine-readable.');
  }
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    fail('Disposable published cutover ABI description was invalid.');
  }
  const description = schema as {
    reducers?: ReadonlyArray<{ name?: unknown }>;
    misc_exports?: ReadonlyArray<{ Procedure?: { name?: unknown } }>;
  };
  const reducerNames = (description.reducers ?? []).map(entry => entry?.name);
  const procedureNames = (description.misc_exports ?? [])
    .map(entry => entry?.Procedure?.name)
    .filter(name => typeof name === 'string');
  const expectedReducers = [
    ...Object.values(GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS),
    GREATER_REALM_CONNECTED_HOSTILE_CANARY_REDUCER,
  ];
  const missingReducers = expectedReducers.filter(
    name => reducerNames.filter(value => value === name).length !== 1,
  );
  const statusProcedureCount = procedureNames.filter(
    name => name === GREATER_REALM_CONNECTED_CUTOVER_STATUS_PROCEDURE,
  ).length;
  const sourceSpellingProcedureCount = procedureNames.filter(
    name => name === 'admin_get_greater_realm_cutover_status_v1',
  ).length;
  const rehearsalReducers = reducerNames.filter(
    name => typeof name === 'string' && name.startsWith('rehearsal_'),
  );
  if (
    missingReducers.length !== 0
    || statusProcedureCount !== 1
    || sourceSpellingProcedureCount !== 0
    || rehearsalReducers.length !== 1
    || rehearsalReducers[0] !== GREATER_REALM_CONNECTED_HOSTILE_CANARY_REDUCER
  ) {
    fail(
      'Disposable published schema omitted the exact production cutover ABI '
      + `(missing_reducers=${missingReducers.join(',') || 'none'} `
      + `status_procedures=${statusProcedureCount} `
      + `source_spelling_procedures=${sourceSpellingProcedureCount} `
      + `rehearsal_reducers=${rehearsalReducers.length}).`,
    );
  }
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    fail('Connected relocation rehearsal accepts no operator coordinates.');
  }
  const startedAt = Date.now();
  let proofStage = 'synthetic-release';
  const artifacts = createGreaterRealmRuntimeRelease({
    source: createGreaterRealmRuntimeReleaseFixtureSource(),
    sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
    releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
  });
  const parts = manifestParts(artifacts);
  if (
    parts.totals.regionCount !== 6
    || parts.totals.componentCount !== 8
    || parts.totals.chunkCount !== 208
    || parts.totals.cellCount !== 16_475
    || parts.totals.castleSlotCount !== 600
    || parts.totals.resourceNodeCount !== 12_000
    || artifacts.status.productionUntouched !== true
    || artifacts.status.tierOneOnly !== true
    || artifacts.chunks.some(chunk => /(?:T2_|T3_)/.test(chunk.bytes.toString('utf8')))
    || /(?:T2_|T3_)/.test(artifacts.manifestBytes.toString('utf8'))
  ) fail('Tracked synthetic release crossed its exact Tier-I boundary.');

  const environment = childEnvironment();
  const control: RuntimeControl = {
    deadline: Date.now() + GREATER_REALM_CONNECTED_RELOCATION_TIMEOUT_MILLISECONDS,
    environment,
    deadlineExpired: false,
  };
  let runtimeDirectory: string | undefined;
  let serverProcess: ChildProcess | undefined;
  let disposable: DisposableModule | undefined;
  let ownerToken: string | undefined;
  let receipt: string | undefined;
  let cleanupFailed = false;
  const forceCleanup = () => {
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
    if (runtimeDirectory !== undefined) {
      rmSync(runtimeDirectory, { recursive: true, force: true });
    }
  };
  const removeSignalCleanup = installMigrationProofSignalCleanup(forceCleanup);
  const totalDeadline = setTimeout(() => {
    control.deadlineExpired = true;
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
  }, GREATER_REALM_CONNECTED_RELOCATION_TIMEOUT_MILLISECONDS);
  try {
    proofStage = 'private-runtime-allocation';
    runtimeDirectory = mkdtempSync(join(
      tmpdir(), 'warpkeep-greater-realm-relocation-',
    ));
    const runtimeRoot = runtimeDirectory;
    await chmod(runtimeRoot, 0o700);
    const runtimeMetadata = await lstat(runtimeRoot);
    if (
      !runtimeMetadata.isDirectory()
      || runtimeMetadata.isSymbolicLink()
      || (runtimeMetadata.mode & 0o777) !== 0o700
    ) fail('Connected relocation runtime root was unsafe.');

    proofStage = 'cli-attestation';
    const version = await runCommand(control, ['--version'], { timeout: 10_000 });
    if (
      version.code !== 0
      || !version.stdout.includes(`spacetimedb tool version ${expectedCliVersion};`)
      || !version.stdout.includes(`Commit: ${expectedCliCommit}`)
    ) fail('Pinned SpacetimeDB CLI 2.6.1 was not active.');

    proofStage = 'exact-source-copy';
    disposable = await createDisposableGreaterRealmRelocationModule(runtimeRoot);
    proofStage = 'disposable-module-build';
    const built = await runCommand(control, [
      'build', '--module-path', disposable.moduleDirectory,
    ]);
    if (built.code !== 0) {
      const diagnostic = built.stderr.replace(/[\r\n]+/g, ' ').slice(0, 1_000);
      fail(`Disposable Greater Realm relocation module build failed${diagnostic ? ` (${diagnostic})` : ''}.`);
    }
    const artifact = await readFile(disposable.artifactPath);
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
    const publicKeyPath = join(runtimeRoot, 'jwt-public.pem');
    const privateKeyPath = join(runtimeRoot, 'jwt-private.pem');
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
      fail('Connected relocation server was not numeric-loopback-only.');
    }
    serverProcess = containServerProcessErrors(spawn(command, [
      'start',
      '--listen-addr', `127.0.0.1:${port}`,
      '--in-memory',
      '--data-dir', join(runtimeRoot, 'database'),
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
    await acquireDisposableIdentity(server);
    const connectedOwnerToken = createEphemeralJwt(
      generated.privateKey,
      adminServiceClaims(),
    );
    ownerToken = connectedOwnerToken;
    const cliConfigPath = join(runtimeRoot, 'spacetime-cli.toml');
    await writeFile(
      cliConfigPath,
      `spacetimedb_token = ${JSON.stringify(connectedOwnerToken)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    const configMetadata = await stat(cliConfigPath);
    if (!configMetadata.isFile() || (configMetadata.mode & 0o777) !== 0o600) {
      fail('Disposable CLI credential permissions were invalid.');
    }
    control.cliConfigPath = cliConfigPath;

    const results: Array<Readonly<{
      database: string;
      verificationCalls: number;
      canaryElapsed: number;
      lifecycle: string;
    }>> = [];
    for (const [lifecycle, database] of Object.entries(
      GREATER_REALM_CONNECTED_RELOCATION_DATABASES,
    )) {
      proofStage = `${lifecycle}-publication`;
      await publishDisposableDatabase(
        control,
        server,
        database,
        disposable.artifactPath,
        connectedOwnerToken,
      );
      await attestPublishedProductionCutoverAbi(control, server, database);
      const adminCredential = () => createEphemeralJwt(
        generated.privateKey,
        adminServiceClaims(),
      );
      const callAdmin: AdminCaller = (
        name,
        arguments_ = [],
        expectedStatus = 200,
        timeout = requestTimeoutMilliseconds,
      ) => callLoopback(
        control,
        server,
        database,
        name,
        adminCredential(),
        JSON.stringify(arguments_),
        expectedStatus,
        timeout,
      );
      proofStage = `${lifecycle}-gate-attestation`;
      const emptyStatus = parseGreaterRealmConnectedStatus(
        await callAdmin('admin_get_greater_realm_status_v1'),
      );
      if (
        emptyStatus.present
        || !emptyStatus.importMutationsCompiled
        || !emptyStatus.activationMutationsCompiled
        || emptyStatus.activationRows !== 0n
        || emptyStatus.publicAtlasRows !== 0n
        || emptyStatus.publicRegionRows !== 0n
      ) fail('Disposable module gates or empty activation state were invalid.');
      const emptyCutover = parseConnectedCutoverStatus(
        await callAdmin(GREATER_REALM_CONNECTED_CUTOVER_STATUS_PROCEDURE),
      );
      if (
        !emptyCutover.importMutationsCompiled
        || !emptyCutover.activationMutationsCompiled
        || emptyCutover.releasePresent
        || emptyCutover.releaseRows !== 0n
        || emptyCutover.releaseState !== 'absent'
        || emptyCutover.activationPresent
        || emptyCutover.activationRows !== 0n
        || emptyCutover.activationMode !== 'absent'
        || emptyCutover.currentFounderCount !== 0
        || emptyCutover.auditRows !== 0n
      ) fail('Actual production cutover status was not exactly empty and gate-enabled.');

      proofStage = `${lifecycle}-legacy-seed`;
      await seedCanonicalLegacyV16(callAdmin, artifactDigest, database);
      await assertCanonicalSeedCounts(
        control, server, database, connectedOwnerToken,
      );
      proofStage = `${lifecycle}-v17-import`;
      const verificationCalls = await importReadyGreaterRealmV17(
        callAdmin, artifacts, database,
      );
      proofStage = `${lifecycle}-activation-lifecycle`;
      const result = lifecycle === 'rollback'
        ? await runRollbackScenario({
          control, server, database, ownerToken: connectedOwnerToken, callAdmin,
        })
        : await runActiveResumeScenario({
          control, server, database, ownerToken: connectedOwnerToken, callAdmin,
        });
      results.push(Object.freeze({
        database,
        verificationCalls,
        canaryElapsed: result.canaryElapsed,
        lifecycle,
      }));
    }

    proofStage = 'production-source-attestation';
    if (
      (await readFile(productionPolicyPath)).compare(disposable.productionPolicyBytes) !== 0
      || (await readFile(productionIndexPath)).compare(disposable.productionIndexBytes) !== 0
      || await directoryDigest(join(sourceModule, 'src')) !== disposable.productionSourceDigest
      || await directoryDigest(join(disposable.moduleDirectory, 'src'))
        !== disposable.disposableSourceDigest
    ) fail('Production module source changed during the disposable rehearsal.');
    const productionPolicy = await readFile(productionPolicyPath, 'utf8');
    const productionIndex = await readFile(productionIndexPath, 'utf8');
    if (
      parseGreaterRealmConnectedProductionGateMode(productionPolicy).mode
        !== disposable.productionGateMode
      || countOccurrences(productionIndex, DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 0
      || /\brehearsal(?:_|[A-Z])/u.test(productionIndex)
    ) fail('Checked-in relocation gate mode or reducer registration changed.');
    const totalVerificationCalls = results.reduce(
      (total, result) => total + result.verificationCalls,
      0,
    );
    receipt = 'Greater Realm connected relocation rehearsal passed: '
      + `founders=${GREATER_REALM_CONNECTED_FOUNDER_COUNT} `
      + `workers=${GREATER_REALM_CONNECTED_WORKER_COUNT} `
      + `static_updates=${GREATER_REALM_CONNECTED_STATIC_FLIP_COUNT} `
      + `rollback_canary_ms=${results[0]!.canaryElapsed} `
      + `resume_canary_ms=${results[1]!.canaryElapsed} `
      + `verification_calls=${totalVerificationCalls} `
      + `module_sha256=${artifactDigest} elapsed_ms=${Date.now() - startedAt}`;
  } catch (error) {
    if (error instanceof GreaterRealmConnectedRelocationError) {
      throw new GreaterRealmConnectedRelocationError(`${error.message} [stage=${proofStage}]`);
    }
    throw new GreaterRealmConnectedRelocationError(
      `Greater Realm connected relocation failed closed at ${proofStage}.`,
    );
  } finally {
    ownerToken = undefined;
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
    try {
      if (serverProcess !== undefined && runtimeDirectory !== undefined) {
        await cleanupMigrationProofResources(serverProcess, runtimeDirectory);
      } else if (runtimeDirectory !== undefined) {
        await rm(runtimeDirectory, { recursive: true, force: true });
      }
    } catch {
      cleanupFailed = true;
    } finally {
      clearTimeout(totalDeadline);
      removeSignalCleanup();
    }
    if (cleanupFailed) {
      throw new GreaterRealmConnectedRelocationError(
        'Connected relocation cleanup failed safely.',
      );
    }
  }
  if (runtimeDirectory !== undefined && existsSync(runtimeDirectory)) {
    fail('Connected relocation runtime cleanup was incomplete.');
  }
  if (receipt === undefined) fail('Connected relocation rehearsal produced no receipt.');
  console.log(receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof GreaterRealmConnectedRelocationError
      ? error.message
      : 'Greater Realm connected relocation rehearsal failed closed.');
    process.exitCode = 1;
  });
}
