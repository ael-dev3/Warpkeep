// Read-only local inspection. No update, owner provisioning, adoption, or global release authority.
import { createHash } from 'node:crypto';
import { closeSync, constants, fchmodSync, fsyncSync, openSync, realpathSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GREATER_REALM_RELEASE_STATES } from '../spacetimedb/ptr/src/atlasPolicy';
import { runGreaterRealmTrustedGit } from './atlas/greater-realm-git';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { assertProductionAdminTrustedAncestors } from './production-admin-token-budget.mjs';
import { takePtrProductionAdminSecret } from './ptr-production-admin-token';
import { verifyAuthBridgeRpcRoleAttestation, type AuthBridgeRpcRoleAttestation } from './auth-bridge-config-attestation.mjs';
import { createPtrInspectionProviderCredentials, disposePtrUpdateProviderCredentials, requestPtrInspectionProvider,
  PTR_INSPECTION_TABLES, type PtrInspectionProviderOperation } from './ptr-update-provider-credentials.mjs';
import { parseExistingUpdateJson, parseExistingUpdateSchema, parseExistingUpdateSql, parseExistingUpdateProgram,
  updateCanonical, updateDigest } from './sealed-realms-existing-update-protocol.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TARGET = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
const HEX40 = /^[a-f0-9]{40}$/u, HEX64 = /^[a-f0-9]{64}$/u;
const MAX_TOTAL = 256 * 1024 * 1024;
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export class PtrInitialOwnerInspectError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'PtrInitialOwnerInspectError'; }
}
const fail: (code: string) => never = code => { throw new PtrInitialOwnerInspectError(`PTR_INITIAL_OWNER_INSPECT_${code}`); };
export type PtrInitialOwnerSource = Readonly<{ sourceCommit: string; sourceTree: string;
  signerFingerprint: string; signerIdentity: string; nativeEvidence?: string }>;

/** A content-addressed source reference, never a substitute for the closed full-evidence gate. */
export function readPtrInitialOwnerSourceReference(root: string, source: PtrInitialOwnerSource) {
  if (source.nativeEvidence === undefined) return null;
  if (!HEX64.test(source.nativeEvidence)) fail('SOURCE_REFERENCE_INVALID');
  const path = join(root, 'artifacts', 'qa', `native-source-verification-${source.nativeEvidence}.json`);
  const file = readLocalBindingBoundedFile(path, { maximumBytes: 32 * 1024 * 1024, minimumBytes: 1,
    expectedMode: 0o600, expectedUid: process.getuid?.(), expectedSha256: source.nativeEvidence });
  try {
    const value = parseExistingUpdateJson(file.body);
    if (value.schemaVersion !== 1 || !['warpkeep-native-source-test-partitions-v1',
      'warpkeep-native-source-checks-v1', 'warpkeep-native-service-checks-v1'].includes(value.profile)
      || value.repositoryRoot !== root || value.source?.sourceCommit !== source.sourceCommit
      || value.source?.sourceTree !== source.sourceTree) fail('SOURCE_REFERENCE_INVALID');
    return Object.freeze({ path, digest: source.nativeEvidence, profile: value.profile as string,
      identity: file.identity, authority: false as const });
  } finally { file.body.fill(0); }
}

/** Both quality checkpoints and main are inspectable; this does not label either accepted main. */
export function capturePtrInitialOwnerSource(root: string, source: PtrInitialOwnerSource) {
  if (realpathSync(root) !== root || !HEX40.test(source.sourceCommit) || !HEX40.test(source.sourceTree)
    || !/^SHA256:[A-Za-z0-9+/]{43}$/u.test(source.signerFingerprint)
    || !source.signerIdentity || source.signerIdentity.length > 256 || /[\r\n\0]/u.test(source.signerIdentity)) fail('SOURCE_INVALID');
  const git = (args: readonly string[], allowStderr = false) => {
    const result = runGreaterRealmTrustedGit(args, root);
    if (result.error || result.status !== 0 || result.signal !== null || (!allowStderr && result.stderr !== '')) fail('SOURCE_GIT_FAILED');
    return result.stdout;
  };
  const indexPath = resolve(root, git(['rev-parse', '--git-path', 'index']).trim());
  const index = () => {
    const file = readLocalBindingBoundedFile(indexPath, { maximumBytes: 16 * 1024 * 1024,
      minimumBytes: 1, expectedMode: 0o644, expectedUid: process.getuid?.() });
    try { return { identity: file.identity, sha256: sha(file.body) }; } finally { file.body.fill(0); }
  };
  const reference = readPtrInitialOwnerSourceReference(root, source);
  const before = index();
  const refs = git(['for-each-ref', '--format=%(refname)%00%(objectname)']);
  if (git(['rev-parse', '--verify', 'HEAD']).trim() !== source.sourceCommit
    || git(['rev-parse', '--verify', 'HEAD^{tree}']).trim() !== source.sourceTree
    || git(['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('SOURCE_DIRTY_OR_DIFFERENT');
  git(['verify-commit', '--raw', source.sourceCommit], true);
  if (git(['log', '-1', '--format=%G?%n%GK%n%GS', source.sourceCommit]).trimEnd()
    !== `G\n${source.signerFingerprint}\n${source.signerIdentity}`) fail('SOURCE_SIGNATURE_INVALID');
  const facts = Object.freeze({ sourceCommit: source.sourceCommit, sourceTree: source.sourceTree,
    signerFingerprint: source.signerFingerprint, signerIdentity: source.signerIdentity,
    localRefsSha256: sha(refs), index: before, nativeEvidence: reference,
    acceptedMainAuthority: false as const, productionAuthorized: false as const });
  const assert = () => {
    if (git(['rev-parse', '--verify', 'HEAD']).trim() !== source.sourceCommit
      || git(['status', '--porcelain=v1', '--untracked-files=all']) !== ''
      || git(['for-each-ref', '--format=%(refname)%00%(objectname)']) !== refs
      || updateCanonical(index()) !== updateCanonical(before)
      || updateCanonical(readPtrInitialOwnerSourceReference(root, source)) !== updateCanonical(reference)) fail('SOURCE_CHANGED');
  };
  assert(); return Object.freeze({ facts, assert });
}

type ParsedSql = ReturnType<typeof parseExistingUpdateSql>;
export function ptrInitialOwnerSqlRowObject(value: ParsedSql, row: unknown): Record<string, unknown> {
  const elements = (value.schema as { elements: { name: { some: string } }[] }).elements;
  if (!Array.isArray(elements) || elements.length < 1 || elements.length > 4096
    || elements.some(element => typeof element?.name?.some !== 'string'
      || !/^[a-z][a-z0-9_]{0,127}$/u.test(element.name.some))
    || new Set(elements.map(element => element.name.some)).size !== elements.length
    || !Array.isArray(row) || row.length !== elements.length) fail('ROW_SHAPE_INVALID');
  return Object.fromEntries(elements.map((element, index) => [element.name.some, row[index]]));
}
const rowObject = ptrInitialOwnerSqlRowObject;
function uint(value: unknown, maximum: bigint): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail('ROW_INTEGER_INVALID');
    value = String(value);
  }
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/u.test(value)) fail('ROW_INTEGER_INVALID');
  const number = BigInt(value); if (number > maximum) fail('ROW_INTEGER_INVALID'); return number;
}
export function observePtrInitialOwnerAnchor(value: ParsedSql) {
  if (value.rows.length === 0) return Object.freeze({ state: 'ownerless' as const, enabled: false, authEpoch: null });
  if (value.rows.length !== 1) fail('OWNER_CARDINALITY_INVALID');
  const row = rowObject(value, value.rows[0]);
  const fid = uint(row.owner_fid, BigInt(Number.MAX_SAFE_INTEGER));
  const epoch = uint(row.auth_epoch, 0xffff_ffffn);
  if (row.singleton_key !== 'PTR_OWNER_V1' || fid < 1n || epoch < 1n || typeof row.enabled !== 'boolean') fail('OWNER_INVALID');
  // FID and provision/suspension details never enter the output or diagnostics.
  return Object.freeze({ state: row.enabled ? 'enabled' as const : 'disabled' as const,
    enabled: row.enabled, authEpoch: Number(epoch) });
}
export function observePtrInitialOwnerAtlas(value: ParsedSql) {
  const selected = value.rows.map(row => rowObject(value, row)).filter(row => row.atlas_id === 'PTR_GREATER_REALM');
  if (selected.length > 1) fail('ATLAS_CARDINALITY_INVALID');
  if (selected.length === 0) return Object.freeze({ state: 'absent' as const });
  const row = selected[0]!;
  if (typeof row.state !== 'string' || !(GREATER_REALM_RELEASE_STATES as readonly string[]).includes(row.state)
    || typeof row.verification_phase !== 'string' || row.verification_phase.length > 64
    || typeof row.source_commit !== 'string' || !HEX40.test(row.source_commit)
    || typeof row.expected_release_sha_256 !== 'string' || !HEX64.test(row.expected_release_sha_256)) fail('ATLAS_ROW_INVALID');
  return Object.freeze({ state: row.state, verificationPhase: row.verification_phase,
    importEpoch: uint(row.import_epoch, 0xffff_ffff_ffff_ffffn).toString(),
    atlasSourceCommit: row.source_commit, releaseDigest: row.expected_release_sha_256,
    fullImportStatusAuthority: false as const });
}

export type PtrInitialOwnerReadDependencies = Readonly<{
  request: (operation: PtrInspectionProviderOperation) => Promise<Uint8Array>;
  assertSource: () => void;
  configuration: () => Promise<AuthBridgeRpcRoleAttestation>;
}>;
/** Fixed observations only. No caller-controlled SQL/destination and no write continuation exist. */
export async function inspectPtrInitialOwnerState(dependencies: PtrInitialOwnerReadDependencies) {
  let totalBytes = 0;
  const parsed = async <T>(operation: PtrInspectionProviderOperation, parser: (bytes: Uint8Array) => T) => {
    dependencies.assertSource(); const bytes = await dependencies.request(operation);
    try {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 32 * 1024 * 1024) fail('RESPONSE_BOUND');
      totalBytes += bytes.byteLength; if (totalBytes > MAX_TOTAL) fail('RESPONSE_TOTAL_BOUND');
      dependencies.assertSource(); return parser(bytes);
    } finally { bytes.fill(0); }
  };
  const snapshot = async () => {
    const program = await parsed('program', parseExistingUpdateProgram);
    const schema = await parsed('schema-v9', bytes => {
      const policy = parseExistingUpdateSchema(bytes), raw = parseExistingUpdateJson(bytes);
      if (policy.names.some(name => !(PTR_INSPECTION_TABLES as readonly string[]).includes(name))
        || !policy.names.includes('ptr_owner_anchor_v1') || !policy.names.includes('greater_realm_release_v1')) fail('TABLE_INVENTORY_UNSUPPORTED');
      const rowSchemas = Object.fromEntries(raw.tables.map((table: { name: string; product_type_ref: number }) =>
        [table.name, raw.typespace.types[table.product_type_ref].Product]));
      const resolveRefs = (value: any, depth = 0, active = new Set<number>()): any => {
        if (depth > 64) fail('ROW_TYPE_UNSUPPORTED');
        if (value && typeof value === 'object' && Object.hasOwn(value, 'Ref')) {
          const ref = value.Ref as number;
          if (active.has(ref)) fail('ROW_TYPE_UNSUPPORTED');
          const next = new Set(active); next.add(ref); return resolveRefs(raw.typespace.types[ref], depth + 1, next);
        }
        if (Array.isArray(value)) return value.map(entry => resolveRefs(entry, depth + 1, active));
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
          .map(([key, entry]) => [key, resolveRefs(entry, depth + 1, active)]));
        return value;
      };
      return { policy, rowSchemas, expandedRowSchemas: Object.fromEntries(Object.entries(rowSchemas)
        .map(([name, row]) => [name, resolveRefs(row)])) };
    });
    const tables = []; let owner, atlas;
    for (const name of schema.policy.names) {
      const value = await parsed(`rows:${name}` as PtrInspectionProviderOperation, parseExistingUpdateSql);
      if (updateCanonical(value.schema) !== updateCanonical(schema.rowSchemas[name])
        && updateCanonical(value.schema) !== updateCanonical(schema.expandedRowSchemas[name])) fail('ROW_SCHEMA_DIFFERENT');
      // Never persist raw table rows. Compare complete count/digest and actual result schema.
      tables.push({ name, count: value.count, rowsDigest: value.rowsDigest,
        schemaDigest: updateDigest(value.schema), installedTableSchemaDigest: schema.policy.tableSchemas[name] });
      if (name === 'ptr_owner_anchor_v1') {
        try { owner = observePtrInitialOwnerAnchor(value); }
        catch { owner = { state: 'unrecognized' as const, enabled: null, authEpoch: null }; }
      }
      if (name === 'greater_realm_release_v1') {
        try { atlas = observePtrInitialOwnerAtlas(value); }
        catch { atlas = { state: 'unrecognized' as const }; }
      }
    }
    if (program !== await parsed('program', parseExistingUpdateProgram)) fail('PROGRAM_CHANGED_DURING_READ');
    return { program, schemaDigest: schema.policy.digest, definitionPolicy: schema.policy.definitionPolicy, tables, owner, atlas };
  };
  const blockers: string[] = []; let beforeConfig: AuthBridgeRpcRoleAttestation | null = null,
    afterConfig: AuthBridgeRpcRoleAttestation | null = null;
  const configuration = async () => {
    dependencies.assertSource();
    try { const value = await dependencies.configuration(); dependencies.assertSource(); return value; }
    catch { blockers.push('PRIVATE_BRIDGE_CONFIG_UNOBSERVED'); return null; }
  };
  beforeConfig = await configuration();
  const before = await snapshot(), after = await snapshot();
  afterConfig = await configuration(); dependencies.assertSource();
  const rowsPreserved = updateCanonical(before) === updateCanonical(after);
  const bridgePreserved = beforeConfig !== null && afterConfig !== null && updateCanonical(beforeConfig) === updateCanonical(afterConfig);
  if (!rowsPreserved) blockers.push('INSTALLED_STATE_CHANGED');
  if (beforeConfig && afterConfig && !bridgePreserved) blockers.push('PRIVATE_BRIDGE_CONFIG_CHANGED');
  if (after.owner?.state !== 'enabled') blockers.push('OWNER_NOT_ENABLED');
  if (after.atlas?.state !== 'ready') blockers.push('ATLAS_READY_NOT_OBSERVED');
  if (!afterConfig?.ptrEnabled || afterConfig.ptrSpacetimeDbDatabase !== TARGET) blockers.push('BRIDGE_PTR_BINDING_NOT_READY');
  return Object.freeze({ schemaVersion: 1, profile: 'warpkeep-ptr-initial-owner-inspection-v1',
    databaseIdentity: TARGET, status: blockers.length ? 'blocked' as const : 'observed' as const,
    blockers: [...new Set(blockers)], before, after, beforeConfiguration: beforeConfig, afterConfiguration: afterConfig,
    preservation: { installedStateObservedEqual: rowsPreserved, privateConfigurationObservedEqual: bridgePreserved,
      comparison: 'two-sequential-program-bounded-snapshots' as const, atomicDatabaseSnapshot: false as const },
    responseBytes: totalBytes, providerWritesAttempted: false as const, ownerAuthTokenVerified: false as const,
    candidateArtifactComparison: 'not-performed' as const, productionAuthorized: false as const,
    globalReleaseAuthority: false as const, fullNativeAuthority: false as const });
}

/** Maintained production entry: fixed PTR plus canonical bridge current-mode read attestation only. */
export async function executePtrInitialOwnerInspect(input: Readonly<{ source: PtrInitialOwnerSource;
  environment: NodeJS.ProcessEnv }>) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000) fail('PLATFORM_INVALID');
  const source = capturePtrInitialOwnerSource(ROOT, input.source);
  const environment = { ...input.environment };
  let secret: string | undefined, capability;
  const configPath = environment.WARPKEEP_SPACETIME_CLI_CONFIG_PATH;
  const executable = environment.WARPKEEP_SPACETIME_EXECUTABLE ?? environment.SPACETIME_BIN;
  if (typeof configPath !== 'string' || !isAbsolute(configPath) || realpathSync(configPath) !== configPath
    || typeof executable !== 'string' || !isAbsolute(executable)
    || environment.WARPKEEP_SPACETIMEDB_URI !== undefined || environment.WARPKEEP_SPACETIMEDB_DATABASE !== undefined) fail('ENVIRONMENT_INVALID');
  assertProductionAdminTrustedAncestors(dirname(configPath));
  const config = readLocalBindingBoundedFile(configPath, { maximumBytes: 64 * 1024, minimumBytes: 1,
    expectedMode: 0o600, expectedUid: 1000 });
  const configSha = sha(config.body); config.body.fill(0);
  const binary = readLocalBindingBoundedFile(executable, { maximumBytes: 256 * 1024 * 1024,
    minimumBytes: 1, requireExecutable: true, rejectWritableExecutable: true });
  const binarySha = sha(binary.body); binary.body.fill(0);
  const assertConfig = () => { const value = readLocalBindingBoundedFile(configPath, {
    maximumBytes: 64 * 1024, expectedMode: 0o600, expectedUid: 1000,
    expectedIdentity: config.identity, expectedSha256: configSha }); value.body.fill(0); };
  let result: Awaited<ReturnType<typeof inspectPtrInitialOwnerState>> | undefined, error: string | null = null,
    sourcePreserved = false, cleanupCompleted = false;
  try {
    capability = createPtrInspectionProviderCredentials({ credentials: {
      spacetimeExecutable: executable, spacetimeExecutableSha256: binarySha,
      spacetimeCliRootDirectory: dirname(configPath), spacetimeCliConfigPath: configPath,
      spacetimeCliConfigSha256: configSha, assertSource: source.assert, assertCliConfig: assertConfig,
    } });
    // Missing current-mode config authority is a readable blocker, not an invented disabled config.
    try { secret = takePtrProductionAdminSecret(environment); } catch { secret = undefined; }
    const heldCapability = capability;
    result = await inspectPtrInitialOwnerState({ assertSource: source.assert,
      request: async operation => (await requestPtrInspectionProvider(heldCapability, { operation })).bytes,
      configuration: async () => {
        if (secret === undefined) fail('PRIVATE_BRIDGE_CONFIG_UNOBSERVED');
        return verifyAuthBridgeRpcRoleAttestation({ adminToken: secret });
      } });
  } catch (failure) {
    error = failure instanceof PtrInitialOwnerInspectError ? failure.code : 'PTR_INITIAL_OWNER_INSPECT_PROVIDER_OR_PROTOCOL_FAILED';
  } finally {
    secret = undefined; delete environment.WARPKEEP_ADMIN_TOKEN_SECRET;
    try { if (capability !== undefined) { disposePtrUpdateProviderCredentials(capability); cleanupCompleted = true; } }
    catch { error ??= 'PTR_INITIAL_OWNER_INSPECT_CREDENTIAL_CLEANUP_FAILED'; }
    try { source.assert(); assertConfig(); sourcePreserved = true; }
    catch { error = 'PTR_INITIAL_OWNER_INSPECT_SOURCE_OR_CONFIG_CHANGED'; }
  }
  return Object.freeze({ schemaVersion: 1, profile: 'warpkeep-ptr-initial-owner-inspect-operation-v1',
    source: source.facts, cliConfigSha256: configSha, spacetimeExecutableSha256: binarySha,
    result: result ?? null, error, sourcePreserved, credentialCapabilityCreated: capability !== undefined,
    credentialCleanupReturnedNormally: capability === undefined ? null : cleanupCompleted,
    observationComplete: result !== undefined && error === null && sourcePreserved && cleanupCompleted,
    productionAuthorized: false as const, providerWritesAttempted: false as const });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const values = new Map<string, string>();
    for (const argument of args) {
      const match = /^--(source|tree|signer|signer-identity|native-evidence|out)=(.+)$/u.exec(argument);
      if (!match || values.has(match[1]!)) fail('ARGUMENT_INVALID'); values.set(match[1]!, match[2]!);
    }
    if (command !== 'inspect' || ['source', 'tree', 'signer', 'signer-identity', 'out'].some(key => !values.has(key))) fail('ARGUMENT_INVALID');
    const path = resolve(values.get('out')!);
    if (dirname(path) !== join(ROOT, 'artifacts', 'qa') || !/^[A-Za-z0-9-]+\.json$/u.test(path.slice(dirname(path).length + 1))) fail('OUTPUT_PATH_INVALID');
    assertProductionAdminTrustedAncestors(dirname(path));
    const receipt = await executePtrInitialOwnerInspect({ source: { sourceCommit: values.get('source')!,
      sourceTree: values.get('tree')!, signerFingerprint: values.get('signer')!, signerIdentity: values.get('signer-identity')!,
      ...(values.has('native-evidence') ? { nativeEvidence: values.get('native-evidence')! } : {}) }, environment: process.env });
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    if (bytes.length > 256 * 1024) fail('OUTPUT_BOUND');
    const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { fchmodSync(fd, 0o600); let offset = 0; while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset); if (written < 1) fail('OUTPUT_WRITE_FAILED'); offset += written;
    } fsyncSync(fd); } finally { closeSync(fd); }
    const check = readLocalBindingBoundedFile(path, { maximumBytes: 256 * 1024, expectedUid: 1000,
      expectedMode: 0o600, expectedSha256: sha(bytes) }); check.body.fill(0);
    process.stdout.write(`${JSON.stringify({ path, sha256: sha(bytes), productionAuthorized: false })}\n`);
    if (!receipt.observationComplete || receipt.result?.status !== 'observed') process.exitCode = 1;
  } catch (failure) {
    process.stderr.write(`${failure instanceof PtrInitialOwnerInspectError ? failure.code : 'PTR_INITIAL_OWNER_INSPECT_FAILED'}\n`); process.exitCode = 1;
  }
}
