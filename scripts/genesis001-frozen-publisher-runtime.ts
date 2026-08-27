import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
} from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { createServer } from 'node:net';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  canonicalSchemaDescribeChildArguments,
  attestPinnedSpacetimeCli,
  monitorSpacetimePublishChild,
  parseCanonicalSchemaDescription,
  planGreaterRealmPublishSupervisor,
  type GreaterRealmPublishSupervisorPlan,
} from './publish-spacetime-dev.mjs';
import {
  ensureCanonicalProductionAdminStateDirectory,
} from './production-admin-token-budget.mjs';
import {
  attestGreaterRealmProductionProtectedMain,
} from './greater-realm-production-provenance';
import {
  createGreaterRealmAdminTransportSession,
  readGreaterRealmProductionAdminSecretFile,
} from './greater-realm-production-transport';
import {
  G001_BASELINE,
  G001_BASELINE_ABI_SHA256,
  G001_FREEZE_NONCE,
  materializeGenesis001Frozen,
  materializeGenesis001HistoricalBaseline,
} from './genesis001-frozen-materializer.mjs';
import {
  assertGenesis001FinalReceiptPointer,
  assertGenesis001FrozenBuildProvenance,
  assertGenesis001FrozenFinalReceipt,
  assertFrozenDescriptorPreservesBaseline,
  assertGenesis001BaselineDescriptor,
  attestPrivateGenesis001Artifact,
  descriptorDigest,
  genesis001FrozenBuildProvenanceDigest,
  exactFrozenReceipt,
  GENESIS001_NODE_EXECUTABLE_SHA256,
  GENESIS001_NODE_VERSION,
  GENESIS001_SPACETIME_CLI_COMMIT,
  GENESIS001_SPACETIME_CLI_EXECUTABLE_SHA256,
  GENESIS001_SPACETIME_CLI_VERSION,
  GENESIS001_SPACETIME_STANDALONE_EXECUTABLE_SHA256,
  GENESIS001_PRODUCTION_TARGET,
  GENESIS001_FINAL_RECEIPT_BASENAME,
  sanitizeGenesis001ChildEnvironment,
  type BuiltGenesis001Artifact,
  type FrozenPublishDependencies,
  type Genesis001Descriptor,
  type Genesis001FinalReceiptPointer,
  type Genesis001FrozenBuildProvenance,
  type Genesis001FrozenFinalReceipt,
  type Genesis001PublishSupervisor,
} from './genesis001-frozen-publisher-core';
import {
  withGenesis001HistoricalLockedDependencyClosure,
  type Genesis001HistoricalDependencyClosureProvenance,
} from './greater-realm-production-immutable-artifact';

const RECOVERY_PROFILE = 'warpkeep-genesis-001-frozen-publish-recovery-v2';
const RECOVERY_FILENAME = 'recovery.json';
const FINAL_RECEIPTS_DIRECTORY = 'receipts';
const RUN_DIRECTORY = /^run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const MAX_RECOVERY_BYTES = 16 * 1024;
const MAX_FINAL_RECEIPT_BYTES = 32 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_DESCRIPTOR_BYTES = 16 * 1024 * 1024;
const BUILD_TIMEOUT_MILLISECONDS = 3 * 60 * 1_000;
const CLI_TIMEOUT_MILLISECONDS = 2 * 60 * 1_000;
const PROCESS_GROUP_GRACE_MILLISECONDS = 5_000;
const LOCAL_PROOF_DATABASE = 'genesis-001-frozen-proof';
const ADMIN_ISSUER = 'https://auth.warpkeep.com';
const GENESIS001_TRUSTED_NODE_TEAM = 'HX7739G8FX';

type RecoveryState = 'prepared' | 'supervisor-bound' | 'release-uncertain';

export type Genesis001FrozenRecoveryRecord = Readonly<{
  schemaVersion: 2;
  profile: typeof RECOVERY_PROFILE;
  state: RecoveryState;
  target: typeof GENESIS001_PRODUCTION_TARGET;
  sourceBaselineCommit: typeof G001_BASELINE;
  baselineAbiSha256: typeof G001_BASELINE_ABI_SHA256;
  freezeReleaseNonce: typeof G001_FREEZE_NONCE;
  protectedMainCommit: string;
  artifactPath: string;
  artifactSha256: string;
  builtDescriptorSha256: string;
  buildProvenance: Genesis001FrozenBuildProvenance;
  buildProvenanceSha256: string;
  supervisorIdentity?: Readonly<{
    schemaVersion: 1;
    profile: string;
    supervisorId: string;
    supervisorDirectory: string;
  }>;
}>;

export type Genesis001SignalLatch = Readonly<{
  signal: () => NodeJS.Signals | undefined;
  throwIfAborted: () => void;
  bindAbort: (abort: () => void | Promise<void>) => () => void;
  close: () => void;
}>;

export type Genesis001PinnedCliSnapshot = Readonly<{
  path: string;
  digest: string;
  provenance: Readonly<{
    version: typeof GENESIS001_SPACETIME_CLI_VERSION;
    commit: typeof GENESIS001_SPACETIME_CLI_COMMIT;
    cliExecutableSha256: typeof GENESIS001_SPACETIME_CLI_EXECUTABLE_SHA256;
    standaloneExecutableSha256:
      typeof GENESIS001_SPACETIME_STANDALONE_EXECUTABLE_SHA256;
  }>;
  verify: () => void;
  cleanup: () => void;
}>;

export type Genesis001RuntimeConfiguration = Readonly<{
  repositoryRoot: string;
  workspaceRoot: string;
  nodeExecutablePath: string;
  dependencyCacheRoot: string;
  cliConfigPath: string;
  adminSecretPath: string;
  childEnvironment: Readonly<Record<string, string>>;
}>;

export class Genesis001ProcessContainmentError extends Error {
  readonly nonReconcilable = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'Genesis001ProcessContainmentError';
  }
}

type RecoveryJournal = Readonly<{
  path: string;
  record: () => Genesis001FrozenRecoveryRecord;
  markSupervisorBound: (
    identity: GreaterRealmPublishSupervisorPlan['identity'],
  ) => void;
  markReleaseUncertain: () => void;
}>;

type RecoveryContainment = Readonly<{
  runRoot: string;
  workspaceRoot: string;
}>;

function fail(message: string, options?: ErrorOptions): never {
  throw new Error(message, options);
}

function mode(status: Readonly<{ mode: number }>): number {
  return status.mode & 0o777;
}

function owner(): number | undefined {
  return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

function assertPrivateDirectory(path: string, label: string): void {
  const status = lstatSync(path);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || mode(status) !== 0o700
    || (owner() !== undefined && status.uid !== owner())
  ) fail(`${label} must be an owner-private directory`);
}

function pathInside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const status = fstatSync(fd);
    if (!status.isDirectory()) fail('private directory identity changed');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function recoveryRecord(
  value: unknown,
  containment?: RecoveryContainment,
): Genesis001FrozenRecoveryRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('Genesis 001 recovery metadata is invalid');
  }
  const record = value as Record<string, unknown>;
  const allowed = [
    'artifactPath',
    'artifactSha256',
    'baselineAbiSha256',
    'buildProvenance',
    'buildProvenanceSha256',
    'builtDescriptorSha256',
    'freezeReleaseNonce',
    'profile',
    'protectedMainCommit',
    'schemaVersion',
    'sourceBaselineCommit',
    'state',
    'supervisorIdentity',
    'target',
  ];
  if (
    Object.keys(record).sort().join('\0')
      !== Object.keys(record).filter(key => allowed.includes(key)).sort().join('\0')
    || record.schemaVersion !== 2
    || record.profile !== RECOVERY_PROFILE
    || !['prepared', 'supervisor-bound', 'release-uncertain'].includes(record.state as string)
    || canonicalJson(record.target) !== canonicalJson(GENESIS001_PRODUCTION_TARGET)
    || record.sourceBaselineCommit !== G001_BASELINE
    || record.baselineAbiSha256 !== G001_BASELINE_ABI_SHA256
    || record.freezeReleaseNonce !== G001_FREEZE_NONCE
    || typeof record.protectedMainCommit !== 'string'
    || !COMMIT.test(record.protectedMainCommit)
    || typeof record.artifactPath !== 'string'
    || !isAbsolute(record.artifactPath)
    || resolve(record.artifactPath) !== record.artifactPath
    || typeof record.artifactSha256 !== 'string'
    || !SHA256.test(record.artifactSha256)
    || typeof record.builtDescriptorSha256 !== 'string'
    || !SHA256.test(record.builtDescriptorSha256)
  ) fail('Genesis 001 recovery metadata is invalid');
  try {
    assertGenesis001FrozenBuildProvenance(record.buildProvenance);
  } catch {
    fail('Genesis 001 recovery build provenance is invalid');
  }
  if (
    typeof record.buildProvenanceSha256 !== 'string'
    || record.buildProvenanceSha256
      !== genesis001FrozenBuildProvenanceDigest(record.buildProvenance)
  ) fail('Genesis 001 recovery build provenance is invalid');
  if (
    containment !== undefined
    && !pathInside(containment.runRoot, record.artifactPath as string)
  ) fail('Genesis 001 recovery metadata is invalid');
  if (
    record.state === 'prepared'
      ? record.supervisorIdentity !== undefined
      : record.supervisorIdentity === null || typeof record.supervisorIdentity !== 'object'
  ) fail('Genesis 001 recovery metadata supervisor identity is invalid');
  if (record.state !== 'prepared') {
    const supervisor = record.supervisorIdentity as Record<string, unknown>;
    if (
      Array.isArray(supervisor)
      || Object.keys(supervisor).sort().join('\0')
        !== ['profile', 'schemaVersion', 'supervisorDirectory', 'supervisorId'].sort().join('\0')
      || supervisor.schemaVersion !== 1
      || supervisor.profile !== 'warpkeep-greater-realm-publish-supervisor-v1'
      || typeof supervisor.supervisorId !== 'string'
      || !/^[0-9a-f]{32}$/u.test(supervisor.supervisorId)
      || typeof supervisor.supervisorDirectory !== 'string'
      || !isAbsolute(supervisor.supervisorDirectory)
      || resolve(supervisor.supervisorDirectory) !== supervisor.supervisorDirectory
      || basename(supervisor.supervisorDirectory) !== `publish-${supervisor.supervisorId}`
      || (
        containment === undefined
          ? basename(dirname(supervisor.supervisorDirectory)) !== 'supervisors'
          : dirname(supervisor.supervisorDirectory)
            !== join(containment.workspaceRoot, 'supervisors')
      )
    ) fail('Genesis 001 recovery metadata supervisor identity is invalid');
  }
  return Object.freeze(value as Genesis001FrozenRecoveryRecord);
}

function assertRecoveryArtifact(record: Genesis001FrozenRecoveryRecord): void {
  const artifact = attestPrivateGenesis001Artifact(record.artifactPath);
  try {
    artifact.verify();
    if (artifact.sha256 !== record.artifactSha256) {
      fail('Genesis 001 recovery artifact digest is invalid');
    }
  } finally {
    artifact.close();
  }
}

function writePrivateAtomicJson(path: string, value: unknown): void {
  const directory = dirname(path);
  assertPrivateDirectory(directory, 'Genesis 001 recovery directory');
  const temporary = join(directory, `.recovery-${randomUUID()}.tmp`);
  const bytes = Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
  if (bytes.byteLength > MAX_RECOVERY_BYTES) fail('Genesis 001 recovery metadata is oversized');
  let fd: number | undefined;
  try {
    fd = openSync(
      temporary,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
    fsyncDirectory(directory);
  } finally {
    bytes.fill(0);
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function readPrivateRecoveryRecord(
  path: string,
  containment: RecoveryContainment,
): Genesis001FrozenRecoveryRecord {
  const before = lstatSync(path, { bigint: true });
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1n
    || (before.mode & 0o777n) !== 0o600n
    || before.size < 2n
    || before.size > BigInt(MAX_RECOVERY_BYTES)
    || (owner() !== undefined && before.uid !== BigInt(owner()!))
  ) fail('Genesis 001 recovery metadata is not owner-private');
  const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (
      opened.dev !== before.dev
      || opened.ino !== before.ino
      || opened.mode !== before.mode
      || opened.nlink !== before.nlink
      || opened.size !== before.size
      || opened.mtimeNs !== before.mtimeNs
      || opened.ctimeNs !== before.ctimeNs
    ) fail('Genesis 001 recovery metadata identity changed');
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.mode !== opened.mode
      || after.nlink !== opened.nlink
      || after.size !== opened.size
      || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs
      || afterPath.dev !== opened.dev
      || afterPath.ino !== opened.ino
      || afterPath.mode !== opened.mode
      || afterPath.nlink !== opened.nlink
      || afterPath.size !== opened.size
      || afterPath.mtimeNs !== opened.mtimeNs
      || afterPath.ctimeNs !== opened.ctimeNs
    ) fail('Genesis 001 recovery metadata identity changed');
    try {
      const record = recoveryRecord(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
        containment,
      );
      assertRecoveryArtifact(record);
      return record;
    } finally {
      bytes.fill(0);
    }
  } finally {
    closeSync(fd);
  }
}

export function createGenesis001FrozenRecoveryJournal(input: Readonly<{
  runRoot: string;
  protectedMainCommit: string;
  artifactPath: string;
  artifactSha256: string;
  builtDescriptorSha256: string;
  buildProvenance: Genesis001FrozenBuildProvenance;
  buildProvenanceSha256: string;
}>): RecoveryJournal {
  if (
    !isAbsolute(input.runRoot)
    || resolve(input.runRoot) !== input.runRoot
    || realpathSync.native(input.runRoot) !== input.runRoot
  ) fail('Genesis 001 run root must be exact and absolute');
  assertPrivateDirectory(input.runRoot, 'Genesis 001 run root');
  const workspaceRoot = dirname(input.runRoot);
  assertPrivateDirectory(workspaceRoot, 'Genesis 001 workspace root');
  const containment = Object.freeze({ runRoot: input.runRoot, workspaceRoot });
  if (
    !RUN_DIRECTORY.test(basename(input.runRoot))
    || !COMMIT.test(input.protectedMainCommit)
    || !SHA256.test(input.artifactSha256)
    || !SHA256.test(input.builtDescriptorSha256)
    || !pathInside(input.runRoot, input.artifactPath)
  ) fail('Genesis 001 recovery inputs are invalid');
  const path = join(input.runRoot, RECOVERY_FILENAME);
  if (existsSync(path)) fail('Genesis 001 recovery metadata already exists');
  let current = recoveryRecord(Object.freeze({
    schemaVersion: 2,
    profile: RECOVERY_PROFILE,
    state: 'prepared',
    target: GENESIS001_PRODUCTION_TARGET,
    sourceBaselineCommit: G001_BASELINE,
    baselineAbiSha256: G001_BASELINE_ABI_SHA256,
    freezeReleaseNonce: G001_FREEZE_NONCE,
    protectedMainCommit: input.protectedMainCommit,
    artifactPath: input.artifactPath,
    artifactSha256: input.artifactSha256,
    builtDescriptorSha256: input.builtDescriptorSha256,
    buildProvenance: input.buildProvenance,
    buildProvenanceSha256: input.buildProvenanceSha256,
  }), containment);
  assertRecoveryArtifact(current);
  writePrivateAtomicJson(path, current);

  const markSupervisorBound = (
    identity: GreaterRealmPublishSupervisorPlan['identity'],
  ): void => {
    if (current.state !== 'prepared') fail('Genesis 001 recovery transition is invalid');
    current = recoveryRecord(Object.freeze({
      ...current,
      state: 'supervisor-bound',
      supervisorIdentity: identity,
    }), containment);
    writePrivateAtomicJson(path, current);
  };
  const markReleaseUncertain = (): void => {
    if (current.state !== 'supervisor-bound') fail('Genesis 001 recovery transition is invalid');
    current = recoveryRecord(
      Object.freeze({ ...current, state: 'release-uncertain' }),
      containment,
    );
    writePrivateAtomicJson(path, current);
  };
  return Object.freeze({ path, record: () => current, markSupervisorBound, markReleaseUncertain });
}

export function inspectGenesis001FrozenRecoveryMetadata(
  workspaceRoot: string,
): readonly Genesis001FrozenRecoveryRecord[] {
  if (
    !isAbsolute(workspaceRoot)
    || resolve(workspaceRoot) !== workspaceRoot
    || realpathSync.native(workspaceRoot) !== workspaceRoot
  ) fail('Genesis 001 workspace root must be exact and absolute');
  assertPrivateDirectory(workspaceRoot, 'Genesis 001 workspace root');
  return Object.freeze(readdirSync(workspaceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && RUN_DIRECTORY.test(entry.name))
    .flatMap(entry => {
      const runRoot = join(workspaceRoot, entry.name);
      assertPrivateDirectory(runRoot, 'Genesis 001 retained run root');
      const path = join(runRoot, RECOVERY_FILENAME);
      return existsSync(path)
        ? [readPrivateRecoveryRecord(path, { runRoot, workspaceRoot })]
        : [];
    }));
}

function assertExactPrivateDirectory(path: string, label: string): void {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync.native(path) !== path) {
    fail(`${label} must be exact and absolute`);
  }
  assertPrivateDirectory(path, label);
}

function finalReceiptsDirectory(workspaceRoot: string, create: boolean): string {
  assertExactPrivateDirectory(workspaceRoot, 'Genesis 001 workspace root');
  const receiptsDirectory = join(workspaceRoot, FINAL_RECEIPTS_DIRECTORY);
  if (create && !existsSync(receiptsDirectory)) createPrivateDirectory(receiptsDirectory);
  assertExactPrivateDirectory(receiptsDirectory, 'Genesis 001 final receipts directory');
  return receiptsDirectory;
}

export function inspectGenesis001FrozenFinalReceipt(input: Readonly<{
  workspaceRoot: string;
  receiptBasename: string;
  receiptSha256: string;
}>): Genesis001FrozenFinalReceipt {
  assertGenesis001FinalReceiptPointer({
    receiptBasename: input.receiptBasename,
    receiptSha256: input.receiptSha256,
  });
  const receiptsDirectory = finalReceiptsDirectory(input.workspaceRoot, false);
  const path = join(receiptsDirectory, input.receiptBasename);
  if (dirname(path) !== receiptsDirectory || basename(path) !== input.receiptBasename) {
    fail('Genesis 001 final receipt path is invalid');
  }
  const before = lstatSync(path, { bigint: true });
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1n
    || (before.mode & 0o777n) !== 0o600n
    || before.size < 2n
    || before.size > BigInt(MAX_FINAL_RECEIPT_BYTES)
    || (owner() !== undefined && before.uid !== BigInt(owner()!))
  ) fail('Genesis 001 final receipt is not owner-private');
  const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (
      opened.dev !== before.dev
      || opened.ino !== before.ino
      || opened.mode !== before.mode
      || opened.nlink !== before.nlink
      || opened.size !== before.size
      || opened.mtimeNs !== before.mtimeNs
      || opened.ctimeNs !== before.ctimeNs
    ) fail('Genesis 001 final receipt identity changed');
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.mode !== opened.mode
      || after.nlink !== opened.nlink
      || after.size !== opened.size
      || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs
      || afterPath.dev !== opened.dev
      || afterPath.ino !== opened.ino
      || afterPath.mode !== opened.mode
      || afterPath.nlink !== opened.nlink
      || afterPath.size !== opened.size
      || afterPath.mtimeNs !== opened.mtimeNs
      || afterPath.ctimeNs !== opened.ctimeNs
      || createHash('sha256').update(bytes).digest('hex') !== input.receiptSha256
    ) fail('Genesis 001 final receipt digest or identity changed');
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const value = JSON.parse(text) as unknown;
      assertGenesis001FrozenFinalReceipt(value);
      if (text !== `${canonicalJson(value)}\n`) {
        fail('Genesis 001 final receipt is not canonical');
      }
      return Object.freeze(value as Genesis001FrozenFinalReceipt);
    } finally {
      bytes.fill(0);
    }
  } finally {
    closeSync(fd);
  }
}

export function writeGenesis001FrozenFinalReceipt(input: Readonly<{
  workspaceRoot: string;
  record: Genesis001FrozenFinalReceipt;
  receiptId?: string;
}>): Genesis001FinalReceiptPointer {
  assertGenesis001FrozenFinalReceipt(input.record);
  const receiptsDirectory = finalReceiptsDirectory(input.workspaceRoot, true);
  const receiptId = input.receiptId ?? randomUUID();
  if (!UUID_V4.test(receiptId)) fail('Genesis 001 final receipt id is invalid');
  const receiptBasename = `genesis-001-freeze-publish-${receiptId}.json`;
  if (!GENESIS001_FINAL_RECEIPT_BASENAME.test(receiptBasename)) {
    fail('Genesis 001 final receipt basename is invalid');
  }
  const path = join(receiptsDirectory, receiptBasename);
  const bytes = Buffer.from(`${canonicalJson(input.record)}\n`, 'utf8');
  if (bytes.byteLength > MAX_FINAL_RECEIPT_BYTES) {
    bytes.fill(0);
    return fail('Genesis 001 final receipt is oversized');
  }
  const receiptSha256 = createHash('sha256').update(bytes).digest('hex');
  let fd: number | undefined;
  let createdIdentity: Readonly<{ dev: bigint; ino: bigint }> | undefined;
  let complete = false;
  try {
    fd = openSync(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    fchmodSync(fd, 0o600);
    const opened = fstatSync(fd, { bigint: true });
    createdIdentity = Object.freeze({ dev: opened.dev, ino: opened.ino });
    if (
      !opened.isFile()
      || opened.nlink !== 1n
      || (opened.mode & 0o777n) !== 0o600n
      || (owner() !== undefined && opened.uid !== BigInt(owner()!))
    ) fail('Genesis 001 final receipt destination is not owner-private');
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
    const afterWrite = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      afterWrite.dev !== opened.dev
      || afterWrite.ino !== opened.ino
      || afterWrite.mode !== opened.mode
      || afterWrite.nlink !== opened.nlink
      || afterWrite.size !== BigInt(bytes.byteLength)
      || afterPath.dev !== opened.dev
      || afterPath.ino !== opened.ino
      || afterPath.mode !== opened.mode
      || afterPath.nlink !== opened.nlink
      || afterPath.size !== BigInt(bytes.byteLength)
    ) fail('Genesis 001 final receipt identity changed while writing');
    closeSync(fd);
    fd = undefined;
    fsyncDirectory(receiptsDirectory);
    const pointer = Object.freeze({ receiptBasename, receiptSha256 });
    assertGenesis001FinalReceiptPointer(pointer);
    inspectGenesis001FrozenFinalReceipt({ workspaceRoot: input.workspaceRoot, ...pointer });
    complete = true;
    return pointer;
  } finally {
    bytes.fill(0);
    if (fd !== undefined) closeSync(fd);
    if (!complete && createdIdentity !== undefined && existsSync(path)) {
      const current = lstatSync(path, { bigint: true });
      if (current.dev === createdIdentity.dev && current.ino === createdIdentity.ino) {
        unlinkSync(path);
        fsyncDirectory(receiptsDirectory);
      }
    }
  }
}

export function createGenesis001SignalLatch(
  signalProcess: Pick<NodeJS.Process, 'on' | 'off'> = process,
): Genesis001SignalLatch {
  let received: NodeJS.Signals | undefined;
  let abort: (() => void | Promise<void>) | undefined;
  let closed = false;
  const handler = (signal: NodeJS.Signals): void => {
    if (received !== undefined) return;
    received = signal;
    if (abort !== undefined) void Promise.resolve(abort()).catch(() => undefined);
  };
  signalProcess.on('SIGINT', handler);
  signalProcess.on('SIGTERM', handler);
  return Object.freeze({
    signal: () => received,
    throwIfAborted: () => {
      if (received !== undefined) fail(`Genesis 001 publisher interrupted by ${received}`);
    },
    bindAbort: nextAbort => {
      if (closed || abort !== undefined) fail('Genesis 001 signal abort binding is invalid');
      abort = nextAbort;
      if (received !== undefined) void Promise.resolve(abort()).catch(() => undefined);
      return () => { if (abort === nextAbort) abort = undefined; };
    },
    close: () => {
      if (closed) return;
      signalProcess.off('SIGINT', handler);
      signalProcess.off('SIGTERM', handler);
      abort = undefined;
      closed = true;
    },
  });
}

function processGroupExists(pid: number): boolean {
  if (process.platform === 'win32') return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error !== null && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

export async function terminateGenesis001ProcessGroup(
  child: Pick<ChildProcess, 'pid' | 'kill'>,
  graceMilliseconds = PROCESS_GROUP_GRACE_MILLISECONDS,
): Promise<void> {
  const pid = child.pid;
  if (!Number.isSafeInteger(pid) || pid === undefined || pid < 2) {
    fail('Genesis 001 child process identity is invalid');
  }
  if (process.platform === 'win32') {
    child.kill('SIGKILL');
    return;
  }
  if (!processGroupExists(pid)) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if (!processGroupExists(pid)) return;
    throw error;
  }
  const gracefulDeadline = Date.now() + graceMilliseconds;
  while (processGroupExists(pid) && Date.now() < gracefulDeadline) await delay(20);
  if (!processGroupExists(pid)) return;
  process.kill(-pid, 'SIGKILL');
  const hardDeadline = Date.now() + graceMilliseconds;
  while (processGroupExists(pid) && Date.now() < hardDeadline) await delay(20);
  if (processGroupExists(pid)) fail('Genesis 001 publisher process group could not be contained');
}

function isGenesis001ProcessContainmentFailure(error: unknown): boolean {
  return error instanceof Genesis001ProcessContainmentError || (
    error instanceof AggregateError
    && error.errors.some(isGenesis001ProcessContainmentFailure)
  );
}

type Genesis001BuildNodeExpectation = Readonly<{
  expectedPath: string;
  expectedVersion: string;
  expectedSha256: string;
  expectedPlatform: NodeJS.Platform;
  expectedArchitecture: string;
  readVersion: (path: string) => string;
  verifySignature?: (path: string) => void;
}>;

type Genesis001BuildNodeSnapshot = Readonly<{
  path: string;
  provenance: Readonly<{
    platform: NodeJS.Platform;
    architecture: string;
    nodeVersion: string;
    nodeExecutableSha256: string;
  }>;
  verify: () => void;
}>;

function nodeVersion(path: string): string {
  return runBounded({
    executable: path,
    arguments_: ['--version'],
    cwd: '/',
    environment: Object.freeze({ PATH: '/usr/bin:/bin' }),
    timeout: 10_000,
    maximumOutputBytes: 4_096,
  }).trim();
}

function verifyTrustedNodeSignature(path: string): void {
  const verified = spawnSync('/usr/bin/codesign', ['--verify', '--strict', path], {
    cwd: '/',
    env: { PATH: '/usr/bin:/bin' },
    encoding: 'utf8',
    input: '',
    maxBuffer: 16 * 1024,
    timeout: 10_000,
  });
  const details = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', path], {
    cwd: '/',
    env: { PATH: '/usr/bin:/bin' },
    encoding: 'utf8',
    input: '',
    maxBuffer: 16 * 1024,
    timeout: 10_000,
  });
  if (
    verified.error !== undefined
    || verified.status !== 0
    || verified.signal !== null
    || details.error !== undefined
    || details.status !== 0
    || details.signal !== null
    || !details.stderr.split(/\r?\n/u).includes(
      `TeamIdentifier=${GENESIS001_TRUSTED_NODE_TEAM}`,
    )
  ) fail('Genesis 001 Node signature is invalid');
}

function attestGenesis001BuildNode(
  path: string,
  expectation: Genesis001BuildNodeExpectation,
): Genesis001BuildNodeSnapshot {
  if (
    process.platform !== expectation.expectedPlatform
    || process.arch !== expectation.expectedArchitecture
    || path !== expectation.expectedPath
    || !isAbsolute(path)
    || resolve(path) !== path
    || realpathSync.native(path) !== path
    || !SHA256.test(expectation.expectedSha256)
  ) fail('Genesis 001 Node runtime is invalid');
  const before = lstatSync(path, { bigint: true });
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1n
    || (before.mode & 0o7777n) !== 0o500n
    || before.size < 1n
    || before.size > 256n * 1024n * 1024n
    || (owner() !== undefined && before.uid !== BigInt(owner()!))
  ) fail('Genesis 001 Node runtime is invalid');
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (digest !== expectation.expectedSha256) fail('Genesis 001 Node runtime is invalid');
  expectation.verifySignature?.(path);
  const version = expectation.readVersion(path);
  if (version !== expectation.expectedVersion) fail('Genesis 001 Node runtime is invalid');
  const verify = (): void => {
    const after = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.mode !== before.mode
      || after.uid !== before.uid
      || after.nlink !== before.nlink
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
      || realpathSync.native(path) !== path
      || createHash('sha256').update(readFileSync(path)).digest('hex') !== digest
      || expectation.readVersion(path) !== version
    ) fail('Genesis 001 Node runtime changed after attestation');
    expectation.verifySignature?.(path);
  };
  verify();
  return Object.freeze({
    path,
    provenance: Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: version,
      nodeExecutableSha256: digest,
    }),
    verify,
  });
}

function runBounded(input: Readonly<{
  executable: string;
  arguments_: readonly string[];
  cwd: string;
  environment: Readonly<Record<string, string>>;
  timeout: number;
  maximumOutputBytes?: number;
}>): string {
  const result = spawnSync(input.executable, input.arguments_, {
    cwd: input.cwd,
    env: input.environment,
    encoding: 'utf8',
    input: '',
    maxBuffer: input.maximumOutputBytes ?? MAX_COMMAND_OUTPUT_BYTES,
    timeout: input.timeout,
    killSignal: 'SIGKILL',
  });
  if (result.error !== undefined || result.status !== 0 || result.signal !== null) {
    fail('Genesis 001 bounded child command failed');
  }
  return result.stdout;
}

function createPrivateDirectory(path: string): void {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
  assertPrivateDirectory(path, 'Genesis 001 private directory');
  fsyncDirectory(dirname(path));
}

function stageGenesis001BuildNode(input: Readonly<{
  sourcePath: string;
  runRoot: string;
}>): Genesis001BuildNodeSnapshot {
  const { sourcePath } = input;
  if (
    process.platform !== 'darwin'
    || process.arch !== 'arm64'
    || !isAbsolute(sourcePath)
    || resolve(sourcePath) !== sourcePath
    || realpathSync.native(sourcePath) !== sourcePath
  ) fail('Genesis 001 Node source is invalid');
  const beforePath = lstatSync(sourcePath, { bigint: true });
  if (
    !beforePath.isFile()
    || beforePath.isSymbolicLink()
    || beforePath.nlink !== 1n
    || (beforePath.mode & 0o022n) !== 0n
    || (beforePath.mode & 0o100n) === 0n
    || beforePath.size < 1n
    || beforePath.size > 256n * 1024n * 1024n
    || (owner() !== undefined && beforePath.uid !== BigInt(owner()!))
  ) fail('Genesis 001 Node source is invalid');
  const sourceFd = openSync(sourcePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  let bytes: Buffer;
  try {
    const opened = fstatSync(sourceFd, { bigint: true });
    if (
      opened.dev !== beforePath.dev
      || opened.ino !== beforePath.ino
      || opened.mode !== beforePath.mode
      || opened.uid !== beforePath.uid
      || opened.nlink !== beforePath.nlink
      || opened.size !== beforePath.size
      || opened.mtimeNs !== beforePath.mtimeNs
      || opened.ctimeNs !== beforePath.ctimeNs
    ) fail('Genesis 001 Node source identity changed');
    bytes = readFileSync(sourceFd);
    const afterRead = fstatSync(sourceFd, { bigint: true });
    const afterPath = lstatSync(sourcePath, { bigint: true });
    if (
      afterRead.dev !== opened.dev
      || afterRead.ino !== opened.ino
      || afterRead.mode !== opened.mode
      || afterRead.uid !== opened.uid
      || afterRead.nlink !== opened.nlink
      || afterRead.size !== opened.size
      || afterRead.mtimeNs !== opened.mtimeNs
      || afterRead.ctimeNs !== opened.ctimeNs
      || afterPath.dev !== opened.dev
      || afterPath.ino !== opened.ino
      || afterPath.mode !== opened.mode
      || afterPath.uid !== opened.uid
      || afterPath.nlink !== opened.nlink
      || afterPath.size !== opened.size
      || afterPath.mtimeNs !== opened.mtimeNs
      || afterPath.ctimeNs !== opened.ctimeNs
      || createHash('sha256').update(bytes).digest('hex') !== GENESIS001_NODE_EXECUTABLE_SHA256
    ) fail('Genesis 001 Node source identity changed');
  } finally {
    closeSync(sourceFd);
  }
  verifyTrustedNodeSignature(sourcePath);
  if (nodeVersion(sourcePath) !== GENESIS001_NODE_VERSION) {
    fail('Genesis 001 Node source version is invalid');
  }

  const runtimeRoot = join(input.runRoot, 'node-runtime');
  createPrivateDirectory(runtimeRoot);
  const stagedPath = join(runtimeRoot, 'node');
  let destinationFd: number | undefined;
  try {
    destinationFd = openSync(
      stagedPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o500,
    );
    fchmodSync(destinationFd, 0o500);
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(destinationFd, bytes, offset);
    fsyncSync(destinationFd);
    closeSync(destinationFd);
    destinationFd = undefined;
    fsyncDirectory(runtimeRoot);
  } finally {
    if (destinationFd !== undefined) closeSync(destinationFd);
    bytes.fill(0);
  }
  const sourceAfterStage = lstatSync(sourcePath, { bigint: true });
  if (
    sourceAfterStage.dev !== beforePath.dev
    || sourceAfterStage.ino !== beforePath.ino
    || sourceAfterStage.mode !== beforePath.mode
    || sourceAfterStage.uid !== beforePath.uid
    || sourceAfterStage.nlink !== beforePath.nlink
    || sourceAfterStage.size !== beforePath.size
    || sourceAfterStage.mtimeNs !== beforePath.mtimeNs
    || sourceAfterStage.ctimeNs !== beforePath.ctimeNs
  ) fail('Genesis 001 Node source identity changed');
  return attestGenesis001BuildNode(stagedPath, Object.freeze({
    expectedPath: stagedPath,
    expectedVersion: GENESIS001_NODE_VERSION,
    expectedSha256: GENESIS001_NODE_EXECUTABLE_SHA256,
    expectedPlatform: 'darwin',
    expectedArchitecture: 'arm64',
    readVersion: nodeVersion,
    verifySignature: verifyTrustedNodeSignature,
  }));
}

export function ensureGenesis001FrozenWorkspaceRoot(explicit?: string): string {
  const parent = explicit === undefined
    ? ensureCanonicalProductionAdminStateDirectory()
    : dirname(explicit);
  if (explicit !== undefined) assertPrivateDirectory(parent, 'Genesis 001 workspace parent');
  const root = explicit ?? join(parent, 'genesis001-frozen-publish-v2');
  if (!existsSync(root)) createPrivateDirectory(root);
  assertPrivateDirectory(root, 'Genesis 001 workspace root');
  return root;
}

function buildEnvironment(
  runRoot: string,
  nodeExecutablePath: string,
): Readonly<Record<string, string>> {
  const home = join(runRoot, 'home');
  const temporary = join(runRoot, 'tmp');
  createPrivateDirectory(home);
  createPrivateDirectory(temporary);
  return Object.freeze({
    HOME: home,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: `${dirname(nodeExecutablePath)}:/usr/bin:/bin`,
    TMPDIR: temporary,
  });
}

async function freeLoopbackPort(): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        rejectPromise(new Error('Genesis 001 loopback port reservation failed'));
        return;
      }
      server.close(error => error === undefined
        ? resolvePromise(address.port)
        : rejectPromise(error));
    });
  });
}

async function acquireLoopbackIdentity(server: string): Promise<Readonly<{
  identity: string;
  token: string;
}>> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${server}/v1/identity`, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(1_000),
      });
      const text = await response.text();
      if (text.length > 4_096) throw new Error();
      const value = JSON.parse(text) as Record<string, unknown>;
      if (
        !response.ok
        || typeof value.identity !== 'string'
        || !SHA256.test(value.identity)
        || typeof value.token !== 'string'
        || value.token.split('.').length !== 3
      ) throw new Error();
      return Object.freeze({ identity: value.identity, token: value.token });
    } catch {
      await delay(100);
    }
  }
  return fail('Genesis 001 disposable loopback server did not become ready');
}

function jwt(privateKey: string): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: ADMIN_ISSUER,
    sub: 'service:hermes',
    aud: ['warpkeep-spacetimedb'],
    token_type: 'spacetime-access',
    roles: ['warpkeep-admin'],
    iat: now,
    nbf: now,
    exp: now + 240,
    jti: randomUUID(),
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function callLoopback(
  server: string,
  procedure: string,
  credential: string,
  body: string,
): Promise<Readonly<{ status: number; text: string }>> {
  const response = await fetch(
    `${server}/v1/database/${LOCAL_PROOF_DATABASE}/call/${procedure}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential}`,
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    },
  );
  const text = await response.text();
  if (text.length > 32 * 1024 || text.includes(credential)) {
    fail('Genesis 001 loopback response exceeded its privacy boundary');
  }
  return Object.freeze({ status: response.status, text });
}

function writePrivateFile(path: string, value: string): void {
  writeFileSync(path, value, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
  const status = lstatSync(path);
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1 || mode(status) !== 0o600) {
    fail('Genesis 001 local proof file is not private');
  }
}

async function runGenesis001LocalProof(input: Readonly<{
  cliPath: string;
  baselineArtifactPath: string;
  artifactPath: string;
  runRoot: string;
  baselineDescriptor?: Genesis001Descriptor;
  environment: Readonly<Record<string, string>>;
}>): Promise<Readonly<{
  descriptor: Genesis001Descriptor;
  policy: unknown;
}>> {
  const proofRoot = join(input.runRoot, 'proof');
  createPrivateDirectory(proofRoot);
  const generated = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const publicKeyPath = join(proofRoot, 'jwt-public.pem');
  const privateKeyPath = join(proofRoot, 'jwt-private.pem');
  writePrivateFile(publicKeyPath, generated.publicKey);
  writePrivateFile(privateKeyPath, generated.privateKey);
  const port = await freeLoopbackPort();
  const server = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(input.cliPath, [
    'start',
    '--listen-addr', `127.0.0.1:${port}`,
    '--in-memory',
    '--data-dir', proofRoot,
    '--jwt-pub-key-path', publicKeyPath,
    '--jwt-priv-key-path', privateKeyPath,
    '--non-interactive',
  ], {
    cwd: input.runRoot,
    detached: process.platform !== 'win32',
    env: input.environment,
    stdio: 'ignore',
  });
  let primaryError: unknown;
  try {
    const identity = await acquireLoopbackIdentity(server);
    const configPath = join(proofRoot, 'cli.toml');
    writePrivateFile(configPath, `spacetimedb_token = ${JSON.stringify(identity.token)}\n`);
    const config = `--config-path=${configPath}`;
    const publish = (artifactPath: string): void => {
      runBounded({
        executable: input.cliPath,
        arguments_: [
          config,
          'publish',
          '--server', server,
          '--js-path', artifactPath,
          '--delete-data=never',
          '--no-config',
          LOCAL_PROOF_DATABASE,
        ],
        cwd: input.runRoot,
        environment: input.environment,
        timeout: CLI_TIMEOUT_MILLISECONDS,
      });
    };
    const describe = (): Genesis001Descriptor => parseCanonicalSchemaDescription(runBounded({
      executable: input.cliPath,
      arguments_: [
        config,
        'describe',
        '--json',
        '--server', server,
        '--no-config',
        LOCAL_PROOF_DATABASE,
      ],
      cwd: input.runRoot,
      environment: input.environment,
      timeout: CLI_TIMEOUT_MILLISECONDS,
      maximumOutputBytes: MAX_DESCRIPTOR_BYTES,
    })) as Genesis001Descriptor;

    publish(input.baselineArtifactPath);
    const builtBaseline = describe();
    assertGenesis001BaselineDescriptor(builtBaseline);
    if (
      input.baselineDescriptor !== undefined
      && descriptorDigest(builtBaseline) !== descriptorDigest(input.baselineDescriptor)
    ) {
      fail('source-built Genesis 001 baseline does not equal the live baseline ABI');
    }

    publish(input.artifactPath);
    const description = describe();
    assertFrozenDescriptorPreservesBaseline(input.baselineDescriptor ?? builtBaseline, description);

    const policyResponse = await callLoopback(
      server,
      'genesis_001_access_policy_v1',
      jwt(generated.privateKey),
      '[]',
    );
    if (policyResponse.status !== 200) fail('Genesis 001 local policy receipt was unavailable');
    let policyWire: unknown;
    try {
      policyWire = JSON.parse(policyResponse.text);
    } catch {
      fail('Genesis 001 local policy receipt was invalid');
    }
    if (!Array.isArray(policyWire) || policyWire.length !== 7) {
      fail('Genesis 001 local policy receipt wire shape was invalid');
    }
    const policy = Object.freeze({
      realmId: policyWire[0],
      releaseVersion: policyWire[1],
      playerAccessEnabled: policyWire[2],
      admissionStateMutationsEnabled: policyWire[3],
      accessRequestSubmissionsEnabled: policyWire[4],
      sourceBaselineCommit: policyWire[5],
      freezeReleaseNonce: policyWire[6],
    });
    if (!exactFrozenReceipt(policy)) fail('Genesis 001 local policy receipt was not exact');

    const writers = Object.freeze([
      ['admin_allow_fid', '[1,""]'],
      [
        'admin_admit_founder_v1',
        '[1,"","g001-local-proof",null,"https://example.invalid/g001.png",null,"trusted-snapchain-profile-v3"]',
      ],
      ['admin_disable_fid', '[1,""]'],
      ['admin_bump_auth_epoch', '[1,""]'],
      ['access_request_submit_v1', '[]'],
      [
        'admin_reset_access_request_v1',
        '[1,false,0,null,null,""]',
      ],
    ] as const);
    const writerStateTuple = async (): Promise<string> => {
      const status = await callLoopback(
        server,
        'admin_get_alpha_status_v3',
        jwt(generated.privateKey),
        '[]',
      );
      const requests = await callLoopback(
        server,
        'admin_list_access_requests_v1',
        jwt(generated.privateKey),
        '[0,0,100,true]',
      );
      const currentPolicy = await callLoopback(
        server,
        'genesis_001_access_policy_v1',
        jwt(generated.privateKey),
        '[]',
      );
      if (status.status !== 200 || requests.status !== 200 || currentPolicy.status !== 200) {
        fail('Genesis 001 local writer state tuple was unavailable');
      }
      return canonicalJson([status.text, requests.text, currentPolicy.text]);
    };
    for (const [writer, body] of writers) {
      const beforeWriter = await writerStateTuple();
      const response = await callLoopback(server, writer, jwt(generated.privateKey), body);
      const afterWriter = await writerStateTuple();
      if (
        response.status < 400
        || response.status > 599
        || afterWriter !== beforeWriter
      ) {
        fail(`Genesis 001 local writer freeze was not exact: ${writer}`);
      }
    }
    return Object.freeze({ descriptor: description, policy });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let containmentError: Genesis001ProcessContainmentError | undefined;
    try {
      await terminateGenesis001ProcessGroup(serverProcess);
    } catch (error) {
      containmentError = new Genesis001ProcessContainmentError(
        'Genesis 001 local proof process group could not be contained; run files were retained',
        { cause: error },
      );
    }
    if (containmentError !== undefined) {
      if (primaryError === undefined) throw containmentError;
      throw new AggregateError(
        [primaryError, containmentError],
        'Genesis 001 local proof failed and its process group could not be contained',
      );
    }
    rmSync(proofRoot, { recursive: true, force: true });
  }
}

function safeCleanupRun(workspaceRoot: string, runRoot: string): void {
  if (
    dirname(runRoot) !== workspaceRoot
    || !RUN_DIRECTORY.test(basename(runRoot))
    || !pathInside(workspaceRoot, runRoot)
  ) fail('Genesis 001 run cleanup target is invalid');
  rmSync(runRoot, { recursive: true, force: true });
  fsyncDirectory(workspaceRoot);
}

function buildHistoricalModule(input: Readonly<{
  moduleRoot: string;
  runRoot: string;
  environment: Readonly<Record<string, string>>;
  cliPath: string;
}>): string {
  runBounded({
    executable: input.cliPath,
    arguments_: ['build', '--module-path', input.moduleRoot],
    cwd: input.runRoot,
    environment: input.environment,
    timeout: BUILD_TIMEOUT_MILLISECONDS,
  });
  const artifactPath = join(input.moduleRoot, 'dist', 'bundle.js');
  chmodSync(dirname(artifactPath), 0o700);
  chmodSync(artifactPath, 0o600);
  return artifactPath;
}

function genesis001BuildProvenance(
  node: Genesis001BuildNodeSnapshot,
  dependency: Genesis001HistoricalDependencyClosureProvenance,
  cli: Genesis001PinnedCliSnapshot,
): Genesis001FrozenBuildProvenance {
  const provenance = Object.freeze({
    schemaVersion: 2 as const,
    profile: 'warpkeep-genesis-001-frozen-build-provenance-v2' as const,
    platform: node.provenance.platform,
    architecture: node.provenance.architecture,
    nodeVersion: node.provenance.nodeVersion,
    nodeExecutableSha256: node.provenance.nodeExecutableSha256,
    spacetimeCliVersion: cli.provenance.version,
    spacetimeCliCommit: cli.provenance.commit,
    spacetimeCliExecutableSha256: cli.provenance.cliExecutableSha256,
    spacetimeStandaloneExecutableSha256:
      cli.provenance.standaloneExecutableSha256,
    ...dependency,
  });
  assertGenesis001FrozenBuildProvenance(provenance);
  return provenance;
}

export async function buildImmutableGenesis001FrozenArtifact(input: Readonly<{
  configuration: Genesis001RuntimeConfiguration;
  cli: Genesis001PinnedCliSnapshot;
  baselineDescriptor?: Genesis001Descriptor;
  protectedMainCommit: string;
}>): Promise<BuiltGenesis001Artifact & Readonly<{
  recovery: RecoveryJournal;
  runRoot: string;
}>> {
  const { configuration } = input;
  const runRoot = join(configuration.workspaceRoot, `run-${randomUUID()}`);
  createPrivateDirectory(runRoot);
  let retained = false;
  let baselineArtifact: ReturnType<typeof attestPrivateGenesis001Artifact> | undefined;
  let artifact: ReturnType<typeof attestPrivateGenesis001Artifact> | undefined;
  try {
    input.cli.verify();
    const node = stageGenesis001BuildNode({
      sourcePath: configuration.nodeExecutablePath,
      runRoot,
    });
    const environment = buildEnvironment(runRoot, node.path);

    const baselineDestination = join(runRoot, 'baseline-source');
    materializeGenesis001HistoricalBaseline({
      repoRoot: configuration.repositoryRoot,
      destination: baselineDestination,
    });
    const baselineModuleRoot = join(baselineDestination, 'spacetimedb');
    input.cli.verify();
    const baselineBuild = withGenesis001HistoricalLockedDependencyClosure({
      materializedRoot: baselineDestination,
      dependencyCacheRoot: configuration.dependencyCacheRoot,
      operation: () => buildHistoricalModule({
        moduleRoot: baselineModuleRoot,
        runRoot,
        environment,
        cliPath: input.cli.path,
      }),
    });
    const baselineArtifactPath = baselineBuild.result;
    input.cli.verify();
    baselineBuild.verify();
    node.verify();
    baselineArtifact = attestPrivateGenesis001Artifact(baselineArtifactPath);

    const sourceDestination = join(runRoot, 'source');
    materializeGenesis001Frozen({
      repoRoot: configuration.repositoryRoot,
      destination: sourceDestination,
    });
    const moduleRoot = join(sourceDestination, 'spacetimedb');
    input.cli.verify();
    const frozenBuild = withGenesis001HistoricalLockedDependencyClosure({
      materializedRoot: sourceDestination,
      dependencyCacheRoot: configuration.dependencyCacheRoot,
      operation: () => buildHistoricalModule({
        moduleRoot,
        runRoot,
        environment,
        cliPath: input.cli.path,
      }),
    });
    const artifactPath = frozenBuild.result;
    input.cli.verify();
    frozenBuild.verify();
    node.verify();
    if (canonicalJson(baselineBuild.provenance) !== canonicalJson(frozenBuild.provenance)) {
      fail('Genesis 001 baseline and frozen dependency provenance differ');
    }
    const buildProvenance = genesis001BuildProvenance(
      node,
      frozenBuild.provenance,
      input.cli,
    );
    artifact = attestPrivateGenesis001Artifact(artifactPath);
    input.cli.verify();
    const local = await runGenesis001LocalProof({
      cliPath: input.cli.path,
      baselineArtifactPath: baselineArtifact.path,
      artifactPath,
      runRoot,
      baselineDescriptor: input.baselineDescriptor,
      environment,
    });
    input.cli.verify();
    baselineArtifact.verify();
    baselineBuild.verify();
    baselineArtifact.close();
    baselineArtifact = undefined;
    artifact.verify();
    frozenBuild.verify();
    node.verify();
    const recovery = createGenesis001FrozenRecoveryJournal({
      runRoot,
      protectedMainCommit: input.protectedMainCommit,
      artifactPath,
      artifactSha256: artifact.sha256,
      builtDescriptorSha256: descriptorDigest(local.descriptor),
      buildProvenance,
      buildProvenanceSha256: genesis001FrozenBuildProvenanceDigest(buildProvenance),
    });
    retained = true;
    return Object.freeze({
      path: artifact.path,
      sha256: artifact.sha256,
      builtDescriptor: local.descriptor,
      builtPolicy: local.policy,
      buildProvenance,
      verify: () => {
        artifact!.verify();
        frozenBuild.verify();
        node.verify();
        input.cli.verify();
        assertGenesis001FrozenBuildProvenance(buildProvenance);
      },
      close: artifact.close,
      cleanup: () => safeCleanupRun(configuration.workspaceRoot, runRoot),
      recovery,
      runRoot,
    });
  } catch (error) {
    if (isGenesis001ProcessContainmentFailure(error)) retained = true;
    try { baselineArtifact?.close(); } catch { /* Preserve the primary build failure. */ }
    try { artifact?.close(); } catch { /* Preserve the primary build failure. */ }
    throw error;
  } finally {
    if (!retained) safeCleanupRun(configuration.workspaceRoot, runRoot);
  }
}

export function readGenesis001LiveSnapshot(input: Readonly<{
  cli: Genesis001PinnedCliSnapshot;
  childEnvironment: Readonly<Record<string, string>>;
}>): Readonly<{
  uri: typeof GENESIS001_PRODUCTION_TARGET.uri;
  databaseIdentity: typeof GENESIS001_PRODUCTION_TARGET.database;
  descriptor: Genesis001Descriptor;
}> {
  input.cli.verify();
  const output = runBounded({
    executable: input.cli.path,
    arguments_: canonicalSchemaDescribeChildArguments(),
    cwd: '/',
    environment: input.childEnvironment,
    timeout: CLI_TIMEOUT_MILLISECONDS,
    maximumOutputBytes: MAX_DESCRIPTOR_BYTES,
  });
  input.cli.verify();
  const descriptor = parseCanonicalSchemaDescription(output) as Genesis001Descriptor;
  return Object.freeze({
    uri: GENESIS001_PRODUCTION_TARGET.uri,
    databaseIdentity: GENESIS001_PRODUCTION_TARGET.database,
    descriptor,
  });
}

export async function prepareGenesis001SupervisedPublish(input: Readonly<{
  configuration: Genesis001RuntimeConfiguration;
  cli: Genesis001PinnedCliSnapshot;
  arguments_: readonly string[];
  recovery: RecoveryJournal;
  signalLatch: Genesis001SignalLatch;
  planSupervisor?: typeof planGreaterRealmPublishSupervisor;
  monitor?: typeof monitorSpacetimePublishChild;
}>): Promise<Genesis001PublishSupervisor> {
  input.signalLatch.throwIfAborted();
  const supervisorRoot = join(input.configuration.workspaceRoot, 'supervisors');
  if (!existsSync(supervisorRoot)) createPrivateDirectory(supervisorRoot);
  assertPrivateDirectory(supervisorRoot, 'Genesis 001 supervisor root');
  const plan = (input.planSupervisor ?? planGreaterRealmPublishSupervisor)(
    supervisorRoot,
    input.configuration.cliConfigPath,
  );
  let child: Awaited<ReturnType<typeof plan.start>>;
  let completion: ReturnType<typeof monitorSpacetimePublishChild>;
  let unbind: (() => void) | undefined;
  try {
    input.cli.verify();
    child = await plan.start(input.cli.path, input.arguments_);
    input.cli.verify();
    completion = (input.monitor ?? monitorSpacetimePublishChild)(child);
    input.recovery.markSupervisorBound(plan.identity);
    unbind = input.signalLatch.bindAbort(() => terminateGenesis001ProcessGroup(child));
  } catch (error) {
    try {
      await plan.cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Genesis 001 publisher supervisor startup and containment cleanup failed',
      );
    }
    throw error;
  }
  let cleaned = false;
  return Object.freeze({
    release: async () => {
      input.signalLatch.throwIfAborted();
      input.cli.verify();
      input.recovery.markReleaseUncertain();
      input.signalLatch.throwIfAborted();
      input.cli.verify();
      await plan.release();
      input.cli.verify();
    },
    completion: async () => completion,
    cleanup: async () => {
      if (cleaned) return;
      unbind?.();
      try {
        await plan.cleanup();
      } catch (error) {
        try {
          await terminateGenesis001ProcessGroup(child);
        } catch (containmentError) {
          throw new Genesis001ProcessContainmentError(
            'Genesis 001 publisher process group could not be contained during cleanup',
            { cause: new AggregateError([error, containmentError]) },
          );
        }
        throw error;
      }
      cleaned = true;
    },
  });
}

export function createGenesis001FrozenPublisherDependencies(input: Readonly<{
  configuration: Genesis001RuntimeConfiguration;
  cli: Genesis001PinnedCliSnapshot;
  signalLatch: Genesis001SignalLatch;
}>): FrozenPublishDependencies {
  let liveReads = 0;
  let built: Awaited<ReturnType<typeof buildImmutableGenesis001FrozenArtifact>> | undefined;
  return Object.freeze({
    verifyProtectedCurrentMain: async () => {
      input.signalLatch.throwIfAborted();
      return attestGreaterRealmProductionProtectedMain(input.configuration.repositoryRoot);
    },
    readLiveSnapshot: async () => {
      liveReads += 1;
      if (liveReads === 1) input.signalLatch.throwIfAborted();
      return readGenesis001LiveSnapshot({
        cli: input.cli,
        childEnvironment: input.configuration.childEnvironment,
      });
    },
    verifyExactBaseline: descriptor => assertGenesis001BaselineDescriptor(descriptor),
    buildImmutableArtifact: async (baselineDescriptor, sourceCommit) => {
      input.signalLatch.throwIfAborted();
      built = await buildImmutableGenesis001FrozenArtifact({
        configuration: input.configuration,
        cli: input.cli,
        baselineDescriptor,
        protectedMainCommit: sourceCommit,
      });
      return built;
    },
    acquirePublishAuthority: async () => {
      input.signalLatch.throwIfAborted();
      const secret = readGreaterRealmProductionAdminSecretFile(
        input.configuration.adminSecretPath,
      );
      const session = createGreaterRealmAdminTransportSession({ adminSecret: secret });
      return Object.freeze({
        preparePostflight: () => session.prepareSubmission(),
        readPolicyFresh: async () => {
          await session.invalidate();
          return session.inspect('genesis_001_access_policy_v1');
        },
        close: () => session.close(),
      });
    },
    prepareSupervisedPublish: async arguments_ => {
      if (built === undefined) fail('Genesis 001 immutable artifact was not built');
      return prepareGenesis001SupervisedPublish({
        configuration: input.configuration,
        cli: input.cli,
        arguments_,
        recovery: built.recovery,
        signalLatch: input.signalLatch,
      });
    },
    persistFinalReceipt: async record => writeGenesis001FrozenFinalReceipt({
      workspaceRoot: input.configuration.workspaceRoot,
      record,
    }),
  });
}

export function attestGenesis001PinnedCli(
  executable: string,
  environment: Readonly<Record<string, string>>,
): Genesis001PinnedCliSnapshot {
  const snapshot = attestPinnedSpacetimeCli(executable, spawnSync, environment);
  try {
    snapshot.verify();
    if (
      snapshot.digest !== GENESIS001_SPACETIME_CLI_EXECUTABLE_SHA256
      || snapshot.provenance.version !== GENESIS001_SPACETIME_CLI_VERSION
      || snapshot.provenance.commit !== GENESIS001_SPACETIME_CLI_COMMIT
      || snapshot.provenance.cliExecutableSha256
        !== GENESIS001_SPACETIME_CLI_EXECUTABLE_SHA256
      || snapshot.provenance.standaloneExecutableSha256
        !== GENESIS001_SPACETIME_STANDALONE_EXECUTABLE_SHA256
    ) fail('Genesis 001 pinned SpacetimeDB CLI provenance is invalid');
    return snapshot as Genesis001PinnedCliSnapshot;
  } catch (error) {
    snapshot.cleanup();
    throw error;
  }
}

export function genesis001RuntimeConfiguration(input: Readonly<{
  repositoryRoot: string;
  workspaceRoot?: string;
  nodeExecutablePath: string;
  dependencyCacheRoot: string;
  cliConfigPath: string;
  adminSecretPath: string;
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
}>): Genesis001RuntimeConfiguration {
  const repositoryRoot = realpathSync.native(input.repositoryRoot);
  const workspaceRoot = ensureGenesis001FrozenWorkspaceRoot(input.workspaceRoot);
  for (const [label, path] of [
    ['Node executable', input.nodeExecutablePath],
    ['dependency cache', input.dependencyCacheRoot],
    ['Spacetime CLI config', input.cliConfigPath],
    ['administrator secret', input.adminSecretPath],
  ] as const) {
    if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0') || path.includes('\n')) {
      fail(`Genesis 001 ${label} path must be exact and absolute`);
    }
  }
  const childEnvironment = Object.freeze({
    ...sanitizeGenesis001ChildEnvironment(input.environment),
    PATH: '/usr/bin:/bin',
  });
  return Object.freeze({
    repositoryRoot,
    workspaceRoot,
    nodeExecutablePath: input.nodeExecutablePath,
    dependencyCacheRoot: input.dependencyCacheRoot,
    cliConfigPath: input.cliConfigPath,
    adminSecretPath: input.adminSecretPath,
    childEnvironment,
  });
}

export const genesis001FrozenPublisherRuntimeTestSeams = Object.freeze({
  attestBuildNode: attestGenesis001BuildNode,
});
