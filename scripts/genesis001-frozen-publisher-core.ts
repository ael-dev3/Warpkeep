import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import {
  G001_BASELINE,
  G001_BASELINE_ABI_SHA256,
  G001_FREEZE_NONCE,
} from './genesis001-frozen-materializer.mjs';

export const GENESIS001_PRODUCTION_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
});

export const GENESIS001_LEGACY_COUNTS = Object.freeze({
  tables: 56,
  reducers: 49,
  procedures: 32,
});

export const GENESIS001_FINAL_RECEIPT_PROFILE =
  'warpkeep-genesis-001-freeze-publish-final-receipt-v2' as const;

export const GENESIS001_BUILD_PROVENANCE_PROFILE =
  'warpkeep-genesis-001-frozen-build-provenance-v2' as const;

export const GENESIS001_DEPENDENCY_INSTALLER_PROFILE =
  'warpkeep-genesis-001-historical-root-dependency-closure-v1' as const;

export const GENESIS001_NODE_VERSION = 'v24.19.0' as const;

export const GENESIS001_NODE_EXECUTABLE_SHA256 =
  '27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1' as const;

export const GENESIS001_SPACETIME_CLI_VERSION = '2.6.1' as const;

export const GENESIS001_SPACETIME_CLI_COMMIT =
  '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87' as const;

export const GENESIS001_SPACETIME_CLI_EXECUTABLE_SHA256 =
  '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6' as const;

export const GENESIS001_SPACETIME_STANDALONE_EXECUTABLE_SHA256 =
  '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa' as const;

export const GENESIS001_DEPENDENCY_LOCKFILE_SHA256 =
  '7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234' as const;

export const GENESIS001_FINAL_RECEIPT_BASENAME =
  /^genesis-001-freeze-publish-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/u;

const FROZEN_POLICY_PROCEDURE = 'genesis_001_access_policy_v1';
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const CHILD_ENVIRONMENT_ALLOWLIST = Object.freeze([
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'TMPDIR',
]);

type JsonObject = Readonly<Record<string, unknown>>;

export type Genesis001Descriptor = Readonly<{
  typespace: Readonly<{ types: readonly unknown[] }>;
  tables: readonly JsonObject[];
  reducers: readonly JsonObject[];
  misc_exports: readonly JsonObject[];
  row_level_security: readonly unknown[];
}>;

export type Genesis001LiveSnapshot = Readonly<{
  uri: string;
  databaseIdentity: string;
  descriptor: Genesis001Descriptor;
}>;

export type PrivateGenesis001Artifact = Readonly<{
  path: string;
  sha256: string;
  mode: string;
  nlink: string;
  verify: () => void;
  close: () => void;
}>;

export type Genesis001FrozenBuildProvenance = Readonly<{
  schemaVersion: 2;
  profile: typeof GENESIS001_BUILD_PROVENANCE_PROFILE;
  platform: 'darwin';
  architecture: 'arm64';
  nodeVersion: typeof GENESIS001_NODE_VERSION;
  nodeExecutableSha256: typeof GENESIS001_NODE_EXECUTABLE_SHA256;
  spacetimeCliVersion: typeof GENESIS001_SPACETIME_CLI_VERSION;
  spacetimeCliCommit: typeof GENESIS001_SPACETIME_CLI_COMMIT;
  spacetimeCliExecutableSha256: typeof GENESIS001_SPACETIME_CLI_EXECUTABLE_SHA256;
  spacetimeStandaloneExecutableSha256:
    typeof GENESIS001_SPACETIME_STANDALONE_EXECUTABLE_SHA256;
  dependencyInstallerProfile: typeof GENESIS001_DEPENDENCY_INSTALLER_PROFILE;
  dependencyLockfileSha256: typeof GENESIS001_DEPENDENCY_LOCKFILE_SHA256;
  lockedPackageCount: 16;
  dependencyArchiveClosureSha256: string;
  dependencyClosureSha256: string;
  dependencyTreeEntryCount: number;
}>;

export type BuiltGenesis001Artifact = Readonly<{
  path: string;
  sha256: string;
  builtDescriptor: Genesis001Descriptor;
  builtPolicy: unknown;
  buildProvenance: Genesis001FrozenBuildProvenance;
  verify: () => void;
  close: () => void;
  cleanup: () => void;
}>;

export type Genesis001PublishAuthority = Readonly<{
  preparePostflight: () => Promise<void>;
  readPolicyFresh: () => Promise<unknown>;
  close: () => Promise<void>;
}>;

export type Genesis001PublishSupervisor = Readonly<{
  release: () => Promise<void>;
  completion: () => Promise<void>;
  cleanup: () => Promise<void>;
}>;

export type Genesis001FrozenPolicyReceipt = Readonly<{
  realmId: 'GENESIS_001';
  releaseVersion: '0.3.43';
  playerAccessEnabled: true;
  admissionStateMutationsEnabled: false;
  accessRequestSubmissionsEnabled: false;
  sourceBaselineCommit: typeof G001_BASELINE;
  freezeReleaseNonce: typeof G001_FREEZE_NONCE;
}>;

export type Genesis001FrozenFinalReceipt = Readonly<{
  schemaVersion: 2;
  profile: typeof GENESIS001_FINAL_RECEIPT_PROFILE;
  outcome: 'published' | 'reconciled';
  target: typeof GENESIS001_PRODUCTION_TARGET;
  protectedMainCommit: string;
  sourceBaselineCommit: typeof G001_BASELINE;
  baselineAbiSha256: typeof G001_BASELINE_ABI_SHA256;
  freezeReleaseNonce: typeof G001_FREEZE_NONCE;
  artifactSha256: string;
  candidateDescriptorSha256: string;
  postflightDescriptorSha256: string;
  buildProvenance: Genesis001FrozenBuildProvenance;
  buildProvenanceSha256: string;
  livePolicyReceipt: Genesis001FrozenPolicyReceipt;
  livePolicyReceiptSha256: string;
}>;

export type Genesis001FinalReceiptPointer = Readonly<{
  receiptBasename: string;
  receiptSha256: string;
}>;

export type FrozenPublishDependencies = Readonly<{
  verifyProtectedCurrentMain: () => Promise<string>;
  readLiveSnapshot: () => Promise<Genesis001LiveSnapshot>;
  verifyExactBaseline: (descriptor: Genesis001Descriptor) => void;
  buildImmutableArtifact: (
    baseline: Genesis001Descriptor,
    sourceCommit: string,
  ) => Promise<BuiltGenesis001Artifact>;
  acquirePublishAuthority: () => Promise<Genesis001PublishAuthority>;
  prepareSupervisedPublish: (
    arguments_: readonly string[],
    authority: Genesis001PublishAuthority,
  ) => Promise<Genesis001PublishSupervisor>;
  persistFinalReceipt: (
    receipt: Genesis001FrozenFinalReceipt,
  ) => Promise<Genesis001FinalReceiptPointer>;
}>;

export type Genesis001PublishResult = Genesis001FinalReceiptPointer;

export class Genesis001PublishManualStopError extends Error {
  readonly artifactPath: string;
  readonly code:
    | 'GENESIS_001_PUBLISH_OUTCOME_ABSENT_MANUAL_RETRY_REQUIRED'
    | 'GENESIS_001_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
    | 'GENESIS_001_PUBLISH_RECEIPT_PERSISTENCE_MANUAL_RECONCILIATION_REQUIRED';

  constructor(
    code: Genesis001PublishManualStopError['code'],
    artifactPath: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'Genesis001PublishManualStopError';
    this.code = code;
    this.artifactPath = artifactPath;
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function descriptorDigest(descriptor: unknown): string {
  return createHash('sha256').update(canonicalJson(descriptor)).digest('hex');
}

function asDescriptor(value: unknown): Genesis001Descriptor {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Genesis 001 descriptor is invalid');
  }
  const descriptor = value as Record<string, unknown>;
  const typespace = descriptor.typespace;
  if (
    typespace === null
    || typeof typespace !== 'object'
    || Array.isArray(typespace)
    || !Array.isArray((typespace as Record<string, unknown>).types)
    || !Array.isArray(descriptor.tables)
    || !Array.isArray(descriptor.reducers)
    || !Array.isArray(descriptor.misc_exports)
    || !Array.isArray(descriptor.row_level_security)
  ) {
    throw new Error('Genesis 001 descriptor is invalid');
  }
  return value as Genesis001Descriptor;
}

function resolveType(
  value: unknown,
  types: readonly unknown[],
  trail: ReadonlySet<number> = new Set<number>(),
): unknown {
  if (Array.isArray(value)) {
    return value.map(item => resolveType(item, types, new Set(trail)));
  }
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length === 1 && Number.isInteger(object.Ref)) {
      const index = object.Ref as number;
      if (index < 0 || index >= types.length) {
        throw new Error(`Genesis 001 descriptor contains an invalid type reference: ${index}`);
      }
      if (trail.has(index)) return Object.freeze({ RecursiveRef: index });
      const nextTrail = new Set(trail);
      nextTrail.add(index);
      return resolveType(types[index], types, nextTrail);
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, item]) => [
        key,
        resolveType(item, types, new Set(trail)),
      ]),
    );
  }
  return value;
}

function procedures(descriptor: Genesis001Descriptor): readonly JsonObject[] {
  return descriptor.misc_exports.flatMap(export_ => {
    const procedure = export_.Procedure;
    if (procedure === null || typeof procedure !== 'object' || Array.isArray(procedure)) {
      return [];
    }
    return [procedure as JsonObject];
  });
}

function procedureName(procedure: JsonObject): string {
  if (typeof procedure.name !== 'string' || procedure.name.length === 0) {
    throw new Error('Genesis 001 descriptor contains an invalid procedure');
  }
  return procedure.name;
}

function tableAbiSurface(descriptor: Genesis001Descriptor): unknown {
  return descriptor.tables.map(table => {
    const reference = table.product_type_ref;
    if (!Number.isInteger(reference)) {
      throw new Error('Genesis 001 descriptor contains an invalid table type reference');
    }
    const { product_type_ref: _omitted, ...metadata } = table;
    return {
      ...metadata,
      product_type: resolveType({ Ref: reference }, descriptor.typespace.types),
    };
  });
}

function reducerAbiSurface(descriptor: Genesis001Descriptor): unknown {
  return descriptor.reducers.map(reducer => resolveType(reducer, descriptor.typespace.types));
}

function legacyMiscExportSurface(descriptor: Genesis001Descriptor): unknown {
  return descriptor.misc_exports
    .filter(export_ => {
      const procedure = export_.Procedure;
      return !(
        procedure !== null
        && typeof procedure === 'object'
        && !Array.isArray(procedure)
        && (procedure as Record<string, unknown>).name === FROZEN_POLICY_PROCEDURE
      );
    })
    .map(export_ => resolveType(export_, descriptor.typespace.types));
}

function assertEqualSurface(label: string, baseline: unknown, candidate: unknown): void {
  if (canonicalJson(baseline) !== canonicalJson(candidate)) {
    throw new Error(`Genesis 001 ${label} changed`);
  }
}

function assertDescriptorCounts(
  descriptor: Genesis001Descriptor,
  expectedProcedures: number,
  label: string,
): void {
  if (
    descriptor.tables.length !== GENESIS001_LEGACY_COUNTS.tables
    || descriptor.reducers.length !== GENESIS001_LEGACY_COUNTS.reducers
    || procedures(descriptor).length !== expectedProcedures
  ) {
    throw new Error(`Genesis 001 ${label} ABI counts changed`);
  }
}

export function assertFrozenDescriptorPreservesBaseline(
  baselineValue: unknown,
  candidateValue: unknown,
): void {
  const baseline = asDescriptor(baselineValue);
  const candidate = asDescriptor(candidateValue);
  assertDescriptorCounts(baseline, GENESIS001_LEGACY_COUNTS.procedures, 'baseline');
  assertDescriptorCounts(candidate, GENESIS001_LEGACY_COUNTS.procedures + 1, 'frozen');

  const policyProcedures = procedures(candidate)
    .filter(procedure => procedureName(procedure) === FROZEN_POLICY_PROCEDURE);
  if (policyProcedures.length !== 1) {
    throw new Error('Genesis 001 frozen descriptor must expose exactly one policy procedure');
  }

  assertEqualSurface('table ABI', tableAbiSurface(baseline), tableAbiSurface(candidate));
  assertEqualSurface('reducer ABI', reducerAbiSurface(baseline), reducerAbiSurface(candidate));
  assertEqualSurface(
    'legacy procedure ABI',
    legacyMiscExportSurface(baseline),
    legacyMiscExportSurface(candidate),
  );
  assertEqualSurface(
    'row-level security ABI',
    baseline.row_level_security,
    candidate.row_level_security,
  );
}

export function assertGenesis001BaselineDescriptor(
  descriptorValue: unknown,
  expectedDigest: string = G001_BASELINE_ABI_SHA256,
): void {
  const descriptor = asDescriptor(descriptorValue);
  if (!/^[0-9a-f]{64}$/.test(expectedDigest)) {
    throw new Error('Genesis 001 baseline ABI digest is invalid');
  }
  assertDescriptorCounts(descriptor, GENESIS001_LEGACY_COUNTS.procedures, 'baseline');
  if (descriptorDigest(descriptor) !== expectedDigest) {
    throw new Error('live Genesis 001 baseline ABI does not equal the exact 2ae baseline');
  }
}

export function assertProtectedReleaseCommit(
  repositoryCommit: string,
  isAncestorOfProtectedMain: boolean,
): void {
  if (!/^[0-9a-f]{40}$/.test(repositoryCommit) || !isAncestorOfProtectedMain) {
    throw new Error('publisher must execute from the exact reviewed protected-main commit');
  }
}

export function exactFrozenReceipt(value: unknown): boolean {
  return canonicalJson(value) === canonicalJson(canonicalGenesis001FrozenPolicyReceipt());
}

export function canonicalGenesis001FrozenPolicyReceipt(): Genesis001FrozenPolicyReceipt {
  return Object.freeze({
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: G001_BASELINE,
    freezeReleaseNonce: G001_FREEZE_NONCE,
  });
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

export function assertGenesis001FrozenBuildProvenance(
  value: unknown,
): asserts value is Genesis001FrozenBuildProvenance {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Genesis 001 frozen build provenance is invalid');
  }
  const provenance = value as Record<string, unknown>;
  const digest = /^[0-9a-f]{64}$/u;
  if (
    !exactKeys(provenance, [
      'architecture',
      'dependencyArchiveClosureSha256',
      'dependencyClosureSha256',
      'dependencyInstallerProfile',
      'dependencyLockfileSha256',
      'dependencyTreeEntryCount',
      'lockedPackageCount',
      'nodeExecutableSha256',
      'nodeVersion',
      'platform',
      'profile',
      'schemaVersion',
      'spacetimeCliCommit',
      'spacetimeCliExecutableSha256',
      'spacetimeCliVersion',
      'spacetimeStandaloneExecutableSha256',
    ])
    || provenance.schemaVersion !== 2
    || provenance.profile !== GENESIS001_BUILD_PROVENANCE_PROFILE
    || provenance.platform !== 'darwin'
    || provenance.architecture !== 'arm64'
    || provenance.nodeVersion !== GENESIS001_NODE_VERSION
    || provenance.nodeExecutableSha256 !== GENESIS001_NODE_EXECUTABLE_SHA256
    || provenance.spacetimeCliVersion !== GENESIS001_SPACETIME_CLI_VERSION
    || provenance.spacetimeCliCommit !== GENESIS001_SPACETIME_CLI_COMMIT
    || provenance.spacetimeCliExecutableSha256
      !== GENESIS001_SPACETIME_CLI_EXECUTABLE_SHA256
    || provenance.spacetimeStandaloneExecutableSha256
      !== GENESIS001_SPACETIME_STANDALONE_EXECUTABLE_SHA256
    || provenance.dependencyInstallerProfile !== GENESIS001_DEPENDENCY_INSTALLER_PROFILE
    || provenance.dependencyLockfileSha256 !== GENESIS001_DEPENDENCY_LOCKFILE_SHA256
    || provenance.lockedPackageCount !== 16
    || typeof provenance.dependencyArchiveClosureSha256 !== 'string'
    || !digest.test(provenance.dependencyArchiveClosureSha256)
    || typeof provenance.dependencyClosureSha256 !== 'string'
    || !digest.test(provenance.dependencyClosureSha256)
    || !Number.isSafeInteger(provenance.dependencyTreeEntryCount)
    || (provenance.dependencyTreeEntryCount as number) <= 0
  ) {
    throw new Error('Genesis 001 frozen build provenance is invalid');
  }
}

export function genesis001FrozenBuildProvenanceDigest(value: unknown): string {
  assertGenesis001FrozenBuildProvenance(value);
  return descriptorDigest(value);
}

export function assertGenesis001FrozenFinalReceipt(
  value: unknown,
): asserts value is Genesis001FrozenFinalReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Genesis 001 final receipt is invalid');
  }
  const receipt = value as Record<string, unknown>;
  const digest = /^[0-9a-f]{64}$/u;
  if (
    !exactKeys(receipt, [
      'artifactSha256',
      'baselineAbiSha256',
      'buildProvenance',
      'buildProvenanceSha256',
      'candidateDescriptorSha256',
      'freezeReleaseNonce',
      'livePolicyReceipt',
      'livePolicyReceiptSha256',
      'outcome',
      'postflightDescriptorSha256',
      'profile',
      'protectedMainCommit',
      'schemaVersion',
      'sourceBaselineCommit',
      'target',
    ])
    || receipt.schemaVersion !== 2
    || receipt.profile !== GENESIS001_FINAL_RECEIPT_PROFILE
    || !['published', 'reconciled'].includes(receipt.outcome as string)
    || canonicalJson(receipt.target) !== canonicalJson(GENESIS001_PRODUCTION_TARGET)
    || typeof receipt.protectedMainCommit !== 'string'
    || !/^[0-9a-f]{40}$/u.test(receipt.protectedMainCommit)
    || receipt.sourceBaselineCommit !== G001_BASELINE
    || receipt.baselineAbiSha256 !== G001_BASELINE_ABI_SHA256
    || receipt.freezeReleaseNonce !== G001_FREEZE_NONCE
    || typeof receipt.artifactSha256 !== 'string'
    || !digest.test(receipt.artifactSha256)
    || typeof receipt.candidateDescriptorSha256 !== 'string'
    || !digest.test(receipt.candidateDescriptorSha256)
    || receipt.postflightDescriptorSha256 !== receipt.candidateDescriptorSha256
    || typeof receipt.buildProvenanceSha256 !== 'string'
    || !digest.test(receipt.buildProvenanceSha256)
    || !exactFrozenReceipt(receipt.livePolicyReceipt)
    || typeof receipt.livePolicyReceiptSha256 !== 'string'
    || receipt.livePolicyReceiptSha256 !== descriptorDigest(receipt.livePolicyReceipt)
  ) {
    throw new Error('Genesis 001 final receipt is invalid');
  }
  try {
    assertGenesis001FrozenBuildProvenance(receipt.buildProvenance);
    if (
      receipt.buildProvenanceSha256
        !== genesis001FrozenBuildProvenanceDigest(receipt.buildProvenance)
    ) {
      throw new Error('Genesis 001 final receipt build provenance digest changed');
    }
  } catch {
    throw new Error('Genesis 001 final receipt is invalid');
  }
}

export function assertGenesis001FinalReceiptPointer(
  value: unknown,
): asserts value is Genesis001FinalReceiptPointer {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Genesis 001 final receipt pointer is invalid');
  }
  const pointer = value as Record<string, unknown>;
  if (
    !exactKeys(pointer, ['receiptBasename', 'receiptSha256'])
    || typeof pointer.receiptBasename !== 'string'
    || !GENESIS001_FINAL_RECEIPT_BASENAME.test(pointer.receiptBasename)
    || typeof pointer.receiptSha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(pointer.receiptSha256)
  ) throw new Error('Genesis 001 final receipt pointer is invalid');
}

function safeEnvironmentValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0') && !value.includes('\n');
}

export function sanitizeGenesis001ChildEnvironment(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(
    CHILD_ENVIRONMENT_ALLOWLIST.flatMap(key => {
      const value = environment[key];
      return safeEnvironmentValue(value) ? [[key, value] as const] : [];
    }),
  ));
}

function modeBits(mode: bigint): string {
  return Number(mode & 0o777n).toString(8).padStart(3, '0');
}

function hashFileDescriptor(fd: number, size: bigint): string {
  if (size <= 0n || size > BigInt(MAX_ARTIFACT_BYTES)) {
    throw new Error('Genesis 001 artifact is invalid: unexpected size');
  }
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let offset = 0;
  const expectedSize = Number(size);
  while (offset < expectedSize) {
    const bytesRead = readSync(fd, buffer, 0, Math.min(buffer.length, expectedSize - offset), offset);
    if (bytesRead === 0) throw new Error('Genesis 001 artifact changed while hashing');
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return hash.digest('hex');
}

function sameFileIdentity(
  left: Readonly<{ dev: bigint; ino: bigint }>,
  right: Readonly<{ dev: bigint; ino: bigint }>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

export function attestPrivateGenesis001Artifact(
  artifactPath: string,
): PrivateGenesis001Artifact {
  if (
    !isAbsolute(artifactPath)
    || resolve(artifactPath) !== artifactPath
    || artifactPath.includes('\0')
    || artifactPath.includes('\n')
  ) {
    throw new Error('Genesis 001 artifact is invalid: path must be absolute and canonical');
  }

  const parentPath = dirname(artifactPath);
  const owner = typeof process.getuid === 'function' ? BigInt(process.getuid()) : undefined;
  const parent = lstatSync(parentPath, { bigint: true });
  const pathStat = lstatSync(artifactPath, { bigint: true });
  const canonicalArtifactPath = realpathSync.native(artifactPath);
  const noFollow = 'O_NOFOLLOW' in fsConstants ? fsConstants.O_NOFOLLOW : 0;
  let fd = -1;

  try {
    if (
      !parent.isDirectory()
      || modeBits(parent.mode) !== '700'
      || (owner !== undefined && parent.uid !== owner)
      || !pathStat.isFile()
      || pathStat.isSymbolicLink()
      || modeBits(pathStat.mode) !== '600'
      || pathStat.nlink !== 1n
      || (owner !== undefined && pathStat.uid !== owner)
    ) {
      throw new Error('Genesis 001 artifact is invalid: it must be owner-private and unlinked');
    }

    fd = openSync(artifactPath, fsConstants.O_RDONLY | noFollow);
    const descriptorStat = fstatSync(fd, { bigint: true });
    if (
      !descriptorStat.isFile()
      || modeBits(descriptorStat.mode) !== '600'
      || descriptorStat.nlink !== 1n
      || (owner !== undefined && descriptorStat.uid !== owner)
      || !sameFileIdentity(pathStat, descriptorStat)
      || descriptorStat.size !== pathStat.size
    ) {
      throw new Error('Genesis 001 artifact is invalid: descriptor identity mismatch');
    }
    const sha256 = hashFileDescriptor(fd, descriptorStat.size);
    let closed = false;

    const verify = (): void => {
      if (closed) throw new Error('Genesis 001 artifact changed: descriptor is closed');
      const currentPath = lstatSync(artifactPath, { bigint: true });
      const currentDescriptor = fstatSync(fd, { bigint: true });
      if (
        !currentPath.isFile()
        || currentPath.isSymbolicLink()
        || realpathSync.native(artifactPath) !== canonicalArtifactPath
        || modeBits(currentPath.mode) !== '600'
        || currentPath.nlink !== 1n
        || (owner !== undefined && currentPath.uid !== owner)
        || !sameFileIdentity(pathStat, currentPath)
        || !sameFileIdentity(pathStat, currentDescriptor)
        || currentPath.size !== pathStat.size
        || currentDescriptor.size !== pathStat.size
        || hashFileDescriptor(fd, currentDescriptor.size) !== sha256
      ) {
        throw new Error('Genesis 001 artifact changed after attestation');
      }
    };

    const close = (): void => {
      if (closed) return;
      closeSync(fd);
      closed = true;
    };

    return Object.freeze({
      path: artifactPath,
      sha256,
      mode: modeBits(descriptorStat.mode),
      nlink: descriptorStat.nlink.toString(),
      verify,
      close,
    });
  } catch (error) {
    if (fd >= 0) closeSync(fd);
    throw error;
  }
}

export function publishArguments(artifactPath: string): readonly string[] {
  if (
    !isAbsolute(artifactPath)
    || resolve(artifactPath) !== artifactPath
    || artifactPath.includes('\0')
    || artifactPath.includes('\n')
  ) {
    throw new Error('private artifact path must be absolute and canonical');
  }
  return Object.freeze([
    'publish',
    '--server', GENESIS001_PRODUCTION_TARGET.uri,
    '--js-path', artifactPath,
    '--delete-data=never',
    '--yes=remote,skip-login',
    GENESIS001_PRODUCTION_TARGET.database,
  ]);
}

function assertExactTarget(snapshot: Genesis001LiveSnapshot): void {
  if (
    snapshot.uri !== GENESIS001_PRODUCTION_TARGET.uri
    || snapshot.databaseIdentity !== GENESIS001_PRODUCTION_TARGET.database
  ) {
    throw new Error('Genesis 001 live snapshot did not bind the exact production database identity');
  }
}

function assertCommit(value: string): void {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error('protected-main attestation returned an invalid source commit');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNonReconcilableContainment(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  if ((error as Record<string, unknown>).nonReconcilable === true) return true;
  return error instanceof AggregateError
    && error.errors.some(isNonReconcilableContainment);
}

export async function publishGenesis001Frozen(
  dependencies: FrozenPublishDependencies,
): Promise<Genesis001PublishResult> {
  let artifact: BuiltGenesis001Artifact | undefined;
  let authority: Genesis001PublishAuthority | undefined;
  let supervisor: Genesis001PublishSupervisor | undefined;
  let retainArtifact = false;
  let primaryError: unknown;

  try {
    const sourceCommit = await dependencies.verifyProtectedCurrentMain();
    assertCommit(sourceCommit);

    const before = await dependencies.readLiveSnapshot();
    assertExactTarget(before);
    dependencies.verifyExactBaseline(before.descriptor);

    artifact = await dependencies.buildImmutableArtifact(before.descriptor, sourceCommit);
    artifact.verify();
    assertGenesis001FrozenBuildProvenance(artifact.buildProvenance);
    const buildProvenance = Object.freeze({ ...artifact.buildProvenance });
    const buildProvenanceSha256 = genesis001FrozenBuildProvenanceDigest(buildProvenance);
    const verifyArtifactAndBuildProvenance = (): void => {
      artifact!.verify();
      assertGenesis001FrozenBuildProvenance(artifact!.buildProvenance);
      if (
        genesis001FrozenBuildProvenanceDigest(artifact!.buildProvenance)
          !== buildProvenanceSha256
      ) {
        throw new Error('Genesis 001 frozen build provenance changed after attestation');
      }
    };
    assertFrozenDescriptorPreservesBaseline(before.descriptor, artifact.builtDescriptor);
    if (!exactFrozenReceipt(artifact.builtPolicy)) {
      throw new Error('source-built Genesis 001 policy receipt is invalid');
    }

    const preparationCommit = await dependencies.verifyProtectedCurrentMain();
    assertCommit(preparationCommit);
    if (preparationCommit !== sourceCommit) {
      throw new Error('protected main advanced while the Genesis 001 artifact was prepared');
    }

    authority = await dependencies.acquirePublishAuthority();
    await authority.preparePostflight();
    try {
      supervisor = await dependencies.prepareSupervisedPublish(
        publishArguments(artifact.path),
        authority,
      );
    } catch (error) {
      if (isNonReconcilableContainment(error)) {
        retainArtifact = true;
        throw new Genesis001PublishManualStopError(
          'GENESIS_001_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
          artifact.path,
          'Genesis 001 publisher containment could not be proven; the exact artifact and '
            + 'recovery metadata were retained and no retry was attempted',
          { cause: error },
        );
      }
      throw error;
    }

    verifyArtifactAndBuildProvenance();
    const releaseCommit = await dependencies.verifyProtectedCurrentMain();
    assertCommit(releaseCommit);
    if (releaseCommit !== sourceCommit) {
      throw new Error('protected main advanced before the Genesis 001 publish release');
    }
    verifyArtifactAndBuildProvenance();

    let submissionError: unknown;
    try {
      await supervisor.release();
      await supervisor.completion();
    } catch (error) {
      submissionError = error;
    }

    let after: Genesis001LiveSnapshot | undefined;
    let snapshotError: unknown;
    try {
      after = await dependencies.readLiveSnapshot();
    } catch (error) {
      snapshotError = error;
    }

    let policy: unknown;
    let policyError: unknown;
    try {
      policy = await authority.readPolicyFresh();
    } catch (error) {
      policyError = error;
    }

    let artifactError: unknown;
    try {
      verifyArtifactAndBuildProvenance();
    } catch (error) {
      artifactError = error;
    }

    let reconciliationError: unknown;
    try {
      if (isNonReconcilableContainment(submissionError)) throw submissionError;
      if (after === undefined) throw snapshotError ?? new Error('fresh postflight snapshot missing');
      assertExactTarget(after);
      assertFrozenDescriptorPreservesBaseline(before.descriptor, after.descriptor);
      if (descriptorDigest(after.descriptor) !== descriptorDigest(artifact.builtDescriptor)) {
        throw new Error('fresh postflight ABI does not equal the source-built candidate ABI');
      }
      if (policyError !== undefined) throw policyError;
      if (!exactFrozenReceipt(policy) || canonicalJson(policy) !== canonicalJson(artifact.builtPolicy)) {
        throw new Error('fresh postflight policy receipt does not equal the source-built receipt');
      }
      if (artifactError !== undefined) throw artifactError;
    } catch (error) {
      reconciliationError = error;
    }

    if (reconciliationError !== undefined) {
      retainArtifact = true;
      const exactUnchangedSnapshot = after !== undefined
        && after.uri === GENESIS001_PRODUCTION_TARGET.uri
        && after.databaseIdentity === GENESIS001_PRODUCTION_TARGET.database
        && descriptorDigest(after.descriptor) === descriptorDigest(before.descriptor);
      if (
        submissionError !== undefined
        && !isNonReconcilableContainment(submissionError)
        && exactUnchangedSnapshot
        && policyError !== undefined
      ) {
        throw new Genesis001PublishManualStopError(
          'GENESIS_001_PUBLISH_OUTCOME_ABSENT_MANUAL_RETRY_REQUIRED',
          artifact.path,
          'Genesis 001 remained on the exact baseline after an outcome-ambiguous submission; '
            + 'the artifact was retained and no retry was attempted',
          { cause: submissionError },
        );
      }
      throw new Genesis001PublishManualStopError(
        'GENESIS_001_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        artifact.path,
        'Genesis 001 publish outcome is ambiguous; the exact artifact was retained and no retry '
          + `was attempted (${errorMessage(reconciliationError)})`,
        { cause: submissionError ?? reconciliationError },
      );
    }

    const livePolicyReceipt = canonicalGenesis001FrozenPolicyReceipt();
    const finalReceipt = Object.freeze({
      schemaVersion: 2 as const,
      profile: GENESIS001_FINAL_RECEIPT_PROFILE,
      outcome: submissionError === undefined ? 'published' as const : 'reconciled' as const,
      target: GENESIS001_PRODUCTION_TARGET,
      protectedMainCommit: sourceCommit,
      sourceBaselineCommit: G001_BASELINE,
      baselineAbiSha256: G001_BASELINE_ABI_SHA256,
      freezeReleaseNonce: G001_FREEZE_NONCE,
      artifactSha256: artifact.sha256,
      candidateDescriptorSha256: descriptorDigest(artifact.builtDescriptor),
      postflightDescriptorSha256: descriptorDigest(after!.descriptor),
      buildProvenance,
      buildProvenanceSha256,
      livePolicyReceipt,
      livePolicyReceiptSha256: descriptorDigest(livePolicyReceipt),
    });
    assertGenesis001FrozenFinalReceipt(finalReceipt);
    try {
      const pointer = await dependencies.persistFinalReceipt(finalReceipt);
      assertGenesis001FinalReceiptPointer(pointer);
      return Object.freeze({ ...pointer });
    } catch (error) {
      retainArtifact = true;
      throw new Genesis001PublishManualStopError(
        'GENESIS_001_PUBLISH_RECEIPT_PERSISTENCE_MANUAL_RECONCILIATION_REQUIRED',
        artifact.path,
        'Genesis 001 exact postflight passed but its durable final receipt was not persisted; '
          + 'the artifact and recovery metadata were retained and no publish retry is permitted',
        { cause: error },
      );
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors: unknown[] = [];
    if (supervisor !== undefined) {
      try {
        await supervisor.cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (authority !== undefined) {
      try {
        await authority.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    const cleanupContainment = cleanupErrors.some(isNonReconcilableContainment);
    if (cleanupContainment) retainArtifact = true;
    if (artifact !== undefined) {
      try {
        artifact.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (!retainArtifact) {
        try {
          artifact.cleanup();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
    if (cleanupContainment && artifact !== undefined) {
      throw new Genesis001PublishManualStopError(
        'GENESIS_001_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        artifact.path,
        'Genesis 001 publisher cleanup containment could not be proven; the exact artifact '
          + 'and recovery metadata were retained and no retry was attempted',
        { cause: new AggregateError(
          primaryError === undefined ? cleanupErrors : [primaryError, ...cleanupErrors],
          'Genesis 001 publisher containment cleanup failed',
        ) },
      );
    }
    if (primaryError === undefined && cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Genesis 001 publisher cleanup failed');
    }
  }
}
