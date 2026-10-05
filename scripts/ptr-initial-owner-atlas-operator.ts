// Initial owner PTR continuation. Quality source is not accepted-main or global release authority.
import { createHash } from 'node:crypto';
import { closeSync, constants, fchmodSync, fsyncSync, fstatSync, lstatSync, mkdirSync, existsSync, openSync, realpathSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capturePtrInitialOwnerSource, inspectPtrInitialOwnerState, type PtrInitialOwnerSource } from './ptr-initial-owner-operator';
import { openPtrCompatibilityBootstrapJournal } from './ptr-compatibility-bootstrap-operator';
import { validatePtrBootstrapInspection, PTR_BOOTSTRAP_TARGET, type PtrBootstrapInspection } from './ptr-compatibility-bootstrap-core.mjs';
import { preparePtrInitialOwnerRuntimeRelease } from './atlas/greater-realm-cli';
import { openExistingGreaterRealmPrivateWorkspace } from './atlas/greater-realm-private-workspace';
import { readPtrGreaterRealmRuntimeRelease, verifyPtrGreaterRealmRuntimeReleaseArtifacts } from './atlas/greater-realm-runtime-release';
import { runGreaterRealmTrustedGit } from './atlas/greater-realm-git';
import { greaterRealmProductionImportEngine } from './greater-realm-production-import-core';
import { executePtrProductionImport, projectPtrProductionStatus, ptrProductionImportReceiptDigest, type PtrProductionImportReceipt } from './ptr-production-import-core';
import { createPtrAtlasImportTransport } from './ptr-production-transport';
import { takePtrProductionAdminSecret } from './ptr-production-admin-token';
import { writePrivatePtrProductionReceipt } from './ptr-production-receipt-file';
import { executePtrOwnerProvisionOperator } from './ptr-owner-provision-operator';
import { createPtrInspectionProviderCredentials, disposePtrUpdateProviderCredentials, requestPtrInspectionProvider, PTR_INSPECTION_TABLES } from './ptr-update-provider-credentials.mjs';
import { parsePtrUpdateDefinition } from './ptr-update-definition-policy.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { executePtrInitialOwnerUpdate, openPtrInitialOwnerUpdateJournal } from './ptr-initial-owner-update-operator';
import { classifyPtrInitialOwnerUpdateObservation, validatePtrInitialOwnerUpdateInspection,
  type PtrInitialOwnerUpdateInspection } from './ptr-initial-owner-update-core.mjs';
import { assertProductionAdminTrustedAncestors, defaultProductionAdminStateDirectory, ensureCanonicalProductionAdminStateDirectory } from './production-admin-token-budget.mjs';
import { verifyAuthBridgeRpcRoleAttestation } from './auth-bridge-config-attestation.mjs';
import { updateCanonical, updateDigest, parseExistingUpdateJson, parseExistingUpdateProgram, parseExistingUpdateSchema } from './sealed-realms-existing-update-protocol.mjs';

const ROOT = resolve(import.meta.dirname, '..'), HASH = /^[a-f0-9]{64}$/u;
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
export class PtrInitialOwnerAtlasError extends Error {
  constructor(readonly code: string, readonly submitted = false) { super(`PTR_INITIAL_OWNER_ATLAS_${code}`); this.name = 'PtrInitialOwnerAtlasError'; }
}
const fail: (code: string, submitted?: boolean) => never = (code, submitted = false) => { throw new PtrInitialOwnerAtlasError(code, submitted); };
type Command = 'select-runtime' | 'prepare-runtime' | 'inspect' | 'import' | 'reconcile-import' | 'inspect-owner' | 'provision-owner';
type Source = ReturnType<typeof capturePtrInitialOwnerSource>;

/** Compare real immutable bootstrap records, not a caller-authored publish receipt. */
export function assertPtrInitialAtlasBootstrapMarker(inspection: PtrBootstrapInspection, marker: unknown) {
  if (updateCanonical(marker) !== updateCanonical({ inspectionDigest: inspection.inspectionDigest, binding: inspection.binding,
    programBefore: null, rowsBefore: null, submissionState: 'possibly-submitted' })) fail('BOOTSTRAP_MARKER_DIFFERENT');
}
/** A fresh observed program/schema is required even when the successful bootstrap is retained. */
export function assertPtrInitialAtlasObservation(record: PtrBootstrapInspection, input: Readonly<{
  state: Awaited<ReturnType<typeof inspectPtrInitialOwnerState>>['after']; installedV9: Uint8Array; installedV10: Uint8Array;
}>, installedBinding: PtrBootstrapInspection['binding'] = validatePtrBootstrapInspection(record).binding) {
  const inspection = validatePtrBootstrapInspection(record), v9 = parseExistingUpdateSchema(input.installedV9),
    v10 = parsePtrUpdateDefinition(input.installedV10), state = input.state, names = [...PTR_INSPECTION_TABLES].sort();
  if (installedBinding.databaseIdentity !== inspection.binding.databaseIdentity
    || state.program !== installedBinding.candidateProgram || state.schemaDigest !== v9.digest
    || state.definitionPolicy !== v9.definitionPolicy || v10.fullDigest !== installedBinding.candidateDescriptionDigest
    || updateCanonical(v9.names) !== updateCanonical(names) || updateCanonical(state.tables.map(table => table.name)) !== updateCanonical(names)
    || !state.owner || !['ownerless', 'enabled', 'disabled'].includes(state.owner.state)
    || !state.atlas || !['absent', 'importing', 'verifying', 'ready'].includes(state.atlas.state)) fail('INSTALLED_STATE_INVALID');
  if (state.owner.state === 'ownerless'
    ? state.owner.enabled !== false || state.owner.authEpoch !== null || state.tables.find(row => row.name === 'ptr_owner_anchor_v1')?.count !== 0
    : state.owner.enabled !== (state.owner.state === 'enabled') || !Number.isSafeInteger(state.owner.authEpoch)
      || Number(state.owner.authEpoch) < 1 || Number(state.owner.authEpoch) > 0xffff_ffff
      || state.tables.find(row => row.name === 'ptr_owner_anchor_v1')?.count !== 1) fail('INSTALLED_OWNER_INVALID');
  for (const row of state.tables) {
    if (!Number.isSafeInteger(row.count) || row.count < 0 || row.count > 500_000 || !HASH.test(row.rowsDigest)
      || (row.count === 0 && row.rowsDigest !== updateDigest([]))
      || !HASH.test(row.schemaDigest) || row.installedTableSchemaDigest !== v9.tableSchemas[row.name]) fail('INSTALLED_ROWS_INVALID');
  }
  // Atlas import and owner provisioning intentionally populate tables. Initial bootstrap emptiness is historical evidence only.
  return Object.freeze({ outcome: 'observed-installed-candidate', candidateProgram: state.program, tableCount: names.length,
    snapshotDigest: updateDigest(state), owner: state.owner, atlas: state.atlas, atomicDatabaseSnapshot: false,
    preBootstrapRowEqualityObserved: false, usableOwnerPtrVerified: false, productionAuthorized: false, globalReleaseAuthority: false });
}
/** Validate the retained source update chain without inventing missing ACK evidence. */
export function ptrInitialAtlasUpdateContinuationEvidence(input: Readonly<{
  bootstrap: PtrBootstrapInspection; update: PtrInitialOwnerUpdateInspection; requestedInspectionDigest: string;
  submissionMarker: unknown; acknowledgementPresent: boolean; acknowledgementMarker?: unknown;
}>) {
  const bootstrap = validatePtrBootstrapInspection(input.bootstrap), update = validatePtrInitialOwnerUpdateInspection(input.update);
  if (!HASH.test(input.requestedInspectionDigest) || update.inspectionDigest !== input.requestedInspectionDigest
    || update.binding.databaseIdentity !== bootstrap.binding.databaseIdentity
    || update.before.program !== bootstrap.binding.candidateProgram) fail('UPDATE_CONTINUATION_PREDECESSOR_DIFFERENT');
  const expectedSubmission = { inspectionDigest: update.inspectionDigest, binding: update.binding,
    beforeProgram: update.before.program, submissionState: 'possibly-submitted' };
  if (!input.submissionMarker || typeof input.submissionMarker !== 'object'
    || updateCanonical(input.submissionMarker) !== updateCanonical(expectedSubmission)) fail('UPDATE_CONTINUATION_SUBMISSION_INVALID');
  let acknowledgementDigest: string | null = null;
  if (input.acknowledgementPresent) {
    const raw = input.acknowledgementMarker;
    if (!raw || typeof raw !== 'object') fail('UPDATE_CONTINUATION_ACKNOWLEDGEMENT_INVALID');
    const acknowledgement = raw as Record<string, unknown>;
    if (Object.keys(acknowledgement).sort().join('\0') !== 'inspectionDigest\0response\0responseSha256'
      || acknowledgement.inspectionDigest !== update.inspectionDigest
      || acknowledgement.response !== 'fixed-target-update-success'
      || typeof acknowledgement.responseSha256 !== 'string' || !HASH.test(acknowledgement.responseSha256))
      fail('UPDATE_CONTINUATION_ACKNOWLEDGEMENT_INVALID');
    acknowledgementDigest = updateDigest(acknowledgement);
  } else if (input.acknowledgementMarker !== undefined) fail('UPDATE_CONTINUATION_ACKNOWLEDGEMENT_INVALID');
  const continuationFacts = { profile: 'warpkeep-ptr-initial-atlas-update-continuation-v1',
    bootstrapInspectionDigest: bootstrap.inspectionDigest, updateInspectionDigest: update.inspectionDigest,
    predecessorProgram: update.before.program, installedProgram: update.binding.candidateProgram,
    installedSourceCommit: update.binding.sourceCommit, installedModuleSha256: update.binding.candidateSha256,
    submissionMarkerDigest: updateDigest(expectedSubmission), acknowledgementPresent: input.acknowledgementPresent,
    acknowledgementDigest };
  return Object.freeze({ binding: update.binding, continuationDigest: updateDigest(continuationFacts),
    ...continuationFacts, acknowledgementPresent: input.acknowledgementPresent,
    providerAckReceived: input.acknowledgementPresent, installationProvenByReadback: false,
    productionAuthorized: false, globalReleaseAuthority: false });
}
/** Resolve the post-bootstrap module only from the real update inspection, predecessor marker and provider readback. */
type VerifiedPtrInitialAtlasUpdateContinuation = Omit<ReturnType<typeof ptrInitialAtlasUpdateContinuationEvidence>, 'installationProvenByReadback'> & {
  installationProvenByReadback: true; preservedRowsDigest: string; configurationDigest: string;
};
export function assertPtrInitialAtlasUpdateContinuation(input: Readonly<{
  bootstrap: PtrBootstrapInspection; update: PtrInitialOwnerUpdateInspection; requestedInspectionDigest: string;
  submissionMarker: unknown; acknowledgementPresent: boolean; acknowledgementMarker?: unknown;
  observation: Readonly<{ state: Awaited<ReturnType<typeof inspectPtrInitialOwnerState>>['after'];
    configuration: unknown; installedV10: Uint8Array }>;
}>): VerifiedPtrInitialAtlasUpdateContinuation {
  const evidence = ptrInitialAtlasUpdateContinuationEvidence(input), update = validatePtrInitialOwnerUpdateInspection(input.update);
  const configuration = input.observation.configuration as Awaited<ReturnType<typeof inspectPtrInitialOwnerState>>['afterConfiguration'];
  const updateObservation = classifyPtrInitialOwnerUpdateObservation(update, { state: input.observation.state as never,
    configuration, installedV10: input.observation.installedV10 });
  if (updateObservation.outcome !== 'observed-preserved-candidate' || configuration === null
    || !configuration.ptrEnabled || configuration.ptrSpacetimeDbDatabase !== PTR_BOOTSTRAP_TARGET
    || configuration.ptrAudience !== 'warpkeep-ptr-spacetimedb' || updateObservation.currentConfigurationDigest === null)
    fail('UPDATE_CONTINUATION_READBACK_INVALID');
  return Object.freeze({ ...evidence,
    installationProvenByReadback: true, preservedRowsDigest: updateObservation.installedStateDigest,
    configurationDigest: updateObservation.currentConfigurationDigest, productionAuthorized: false, globalReleaseAuthority: false });
}
/** A missing provider ACK is recoverable only from two fresh, successful read-only reconciliations. */
export function assertPtrInitialAtlasUpdateReconciliationPair(input: Readonly<{
  continuation: VerifiedPtrInitialAtlasUpdateContinuation; first: unknown; second: unknown;
}>) {
  const check = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') fail('UPDATE_CONTINUATION_RECONCILIATION_INVALID');
    const receipt = raw as Record<string, unknown>, result = receipt.result as Record<string, unknown> | null;
    if (receipt.profile !== 'warpkeep-ptr-initial-owner-update-operation-v1' || receipt.command !== 'reconcile'
      || receipt.inspectionDigest !== input.continuation.updateInspectionDigest || receipt.commandSucceeded !== true
      || receipt.operationComplete !== true || receipt.resolutionComplete !== true || receipt.candidateInstallationObserved !== true
      || receipt.sourcePreserved !== true || receipt.cleanupCompleted !== true || receipt.privateConfigurationObserved !== true
      || receipt.acknowledgementReceived !== false || !result || result.outcome !== 'observed-preserved-candidate'
      || result.candidateProgram !== input.continuation.installedProgram || result.privateConfigurationPreservationObserved !== true
      || !HASH.test(String(result.installedStateDigest)) || !HASH.test(String(result.currentConfigurationDigest)))
      fail('UPDATE_CONTINUATION_RECONCILIATION_INVALID');
    return { installedStateDigest: result.installedStateDigest as string,
      currentConfigurationDigest: result.currentConfigurationDigest as string };
  };
  if (input.continuation.acknowledgementPresent || input.continuation.providerAckReceived) fail('UPDATE_CONTINUATION_RECONCILIATION_INVALID');
  const first = check(input.first), second = check(input.second);
  if (first.installedStateDigest !== second.installedStateDigest || first.currentConfigurationDigest !== second.currentConfigurationDigest
    || first.installedStateDigest !== input.continuation.preservedRowsDigest
    || first.currentConfigurationDigest !== input.continuation.configurationDigest) fail('UPDATE_CONTINUATION_RECONCILIATION_CHANGED');
  return Object.freeze({ profile: 'warpkeep-ptr-initial-atlas-update-readback-reconciliation-v1',
    inspectionDigest: input.continuation.updateInspectionDigest, candidateProgram: input.continuation.installedProgram,
    installedStateDigest: first.installedStateDigest, currentConfigurationDigest: first.currentConfigurationDigest,
    reconciliationCount: 2, acknowledgementPresent: false, providerAckReceived: false,
    installationProvenByReadback: true, productionAuthorized: false, globalReleaseAuthority: false });
}
export function ptrInitialAtlasConfirmation(input: Readonly<{ bootstrapInspection: string; sourceCommit: string;
  installedSourceCommit: string; program: string; releaseSha256: string; atlasSourceCommit: string; continuationDigest?: string }>) {
  if (![input.bootstrapInspection, input.program, input.releaseSha256].every(value => HASH.test(value))
    || ![input.sourceCommit, input.installedSourceCommit, input.atlasSourceCommit].every(value => /^[a-f0-9]{40}$/u.test(value))
    || (input.continuationDigest !== undefined && !HASH.test(input.continuationDigest))) fail('CONFIRMATION_INPUT_INVALID');
  const { continuationDigest, ...legacy } = input;
  return updateDigest({ profile: 'warpkeep-ptr-initial-atlas-confirmation-v1', databaseIdentity: PTR_BOOTSTRAP_TARGET,
    ...legacy, ...(continuationDigest === undefined ? {} : { continuationDigest }) });
}
export function ptrInitialAtlasImportMarker(input: Readonly<{ bootstrapInspection: string; binding: PtrBootstrapInspection['binding'];
  atlasSourceCommit: string; releaseSha256: string;
  continuation?: Omit<ReturnType<typeof ptrInitialAtlasUpdateContinuationEvidence>, 'installationProvenByReadback'> & {
    installationProvenByReadback: boolean; preservedRowsDigest?: string; configurationDigest?: string | null } }>) {
  if (!HASH.test(input.bootstrapInspection) || input.binding.databaseIdentity !== PTR_BOOTSTRAP_TARGET
    || !/^[a-f0-9]{40}$/u.test(input.atlasSourceCommit) || !HASH.test(input.releaseSha256)) fail('IMPORT_MARKER_INPUT_INVALID');
  if (input.continuation && (input.continuation.binding.candidateProgram !== input.binding.candidateProgram
    || input.continuation.binding.sourceCommit !== input.binding.sourceCommit
    || input.continuation.continuationDigest !== updateDigest({ profile: 'warpkeep-ptr-initial-atlas-update-continuation-v1',
      bootstrapInspectionDigest: input.continuation.bootstrapInspectionDigest,
      updateInspectionDigest: input.continuation.updateInspectionDigest,
      predecessorProgram: input.continuation.predecessorProgram, installedProgram: input.continuation.installedProgram,
      installedSourceCommit: input.continuation.installedSourceCommit, installedModuleSha256: input.continuation.installedModuleSha256,
      submissionMarkerDigest: input.continuation.submissionMarkerDigest,
      acknowledgementPresent: input.continuation.acknowledgementPresent,
      acknowledgementDigest: input.continuation.acknowledgementDigest }))) fail('IMPORT_MARKER_CONTINUATION_INVALID');
  const common = { bootstrapInspection: input.bootstrapInspection, databaseIdentity: PTR_BOOTSTRAP_TARGET,
    installedModuleSourceCommit: input.binding.sourceCommit, program: input.binding.candidateProgram,
    atlasSourceCommit: input.atlasSourceCommit, releaseSha256: input.releaseSha256, importEpoch: '1' };
  return Object.freeze(input.continuation ? { profile: 'warpkeep-ptr-initial-atlas-possibly-submitted-v2', ...common,
    updateInspection: input.continuation.updateInspectionDigest, continuationDigest: input.continuation.continuationDigest,
    providerAckReceived: input.continuation.providerAckReceived } :
    { profile: 'warpkeep-ptr-initial-atlas-possibly-submitted-v1', ...common });
}
function validatePtrInitialAtlasImportReceipt(value: unknown, input: Readonly<{ binding: PtrBootstrapInspection['binding'];
  authority: ReturnType<typeof greaterRealmProductionImportEngine.importAuthority>; manifestSha256: string; headerJson: string }>) {
  if (!value || typeof value !== 'object' || !('importReceiptDigest' in value)) fail('IMPORT_RECEIPT_INVALID');
  const receipt = value as PtrProductionImportReceipt, { importReceiptDigest, ...body } = receipt;
  if (ptrProductionImportReceiptDigest(body) !== importReceiptDigest || receipt.databaseIdentity !== PTR_BOOTSTRAP_TARGET
    || receipt.moduleSourceCommit !== input.binding.sourceCommit || receipt.moduleSha256 !== input.binding.candidateSha256
    || receipt.moduleTreeId !== input.binding.moduleTreeId || receipt.dependencyClosureDigest !== input.binding.dependencyClosureDigest
    || receipt.spacetimeExecutableSha256 !== input.binding.cliDigest || receipt.atlasSourceCommit !== input.authority.sourceCommit
    || receipt.publicReleaseId !== input.authority.publicReleaseId || receipt.expectedReleaseSha256 !== input.authority.releaseSha256
    || receipt.releaseManifestSha256 !== input.manifestSha256 || receipt.releaseHeaderSha256 !== sha(Buffer.from(input.headerJson))
    || receipt.importEpoch !== '1') fail('IMPORT_RECEIPT_BINDING_DIFFERENT');
  return receipt;
}
/** A marked invocation can only read its real retained receipt; it never invokes the import executor again. */
export async function coordinatePtrInitialAtlasImport(input: Readonly<{
  command: 'import' | 'reconcile-import'; journal: ReturnType<typeof openPtrInitialOwnerUpdateJournal>;
  marker: unknown; assert: () => void; validateReceipt: (value: unknown) => PtrProductionImportReceipt;
  execute: (beforeSend: () => void) => Promise<PtrProductionImportReceipt>;
}>) {
  const key = updateDigest(input.marker), journal = input.journal;
  const assertMarker = () => { input.assert(); journal.assert();
    if (journal.present('submission', key) && updateCanonical(journal.read('submission', key).value) !== updateCanonical(input.marker)) fail('IMPORT_MARKER_DIFFERENT'); };
  assertMarker(); const marked = journal.present('submission', key);
  if (input.command === 'reconcile-import') {
    if (!marked) fail('IMPORT_SUBMISSION_NOT_MARKED');
    if (!journal.present('acknowledgement', key)) return null;
    const stored = journal.read('acknowledgement', key).value;
    if (!stored || typeof stored !== 'object' || Object.keys(stored).sort().join('\0') !== 'markerDigest\0receiptJson'
      || stored.markerDigest !== key || typeof stored.receiptJson !== 'string' || Buffer.byteLength(stored.receiptJson) > 64 * 1024) fail('IMPORT_RECEIPT_INVALID');
    const bytes = Buffer.from(stored.receiptJson);
    try { const receipt = input.validateReceipt(parseExistingUpdateJson(bytes)); assertMarker(); return receipt; }
    finally { bytes.fill(0); }
  }
  if (marked) fail('IMPORT_SUBMISSION_ALREADY_MARKED_RECONCILE_ONLY', true);
  let submitted = false;
  const receipt = input.validateReceipt(await input.execute(() => {
    assertMarker();
    if (!submitted) { journal.write('submission', key, input.marker); submitted = true; }
    assertMarker();
  }));
  if (!submitted) fail('IMPORT_SUBMISSION_NOT_MARKED');
  // JSON text preserves the maintained receipt's strict field order across canonical journal serialization.
  journal.write('acknowledgement', key, { markerDigest: key, receiptJson: JSON.stringify(receipt) });
  assertMarker(); return receipt;
}
function assertInstalledSource(source: Source, inspection: PtrBootstrapInspection, installedBinding = inspection.binding) {
  const git = (args: string[], allowStderr = false) => {
    const r = runGreaterRealmTrustedGit(args, ROOT);
    if (r.error || r.status !== 0 || r.signal !== null || (!allowStderr && r.stderr !== '')) fail('INSTALLED_SOURCE_INVALID');
    return r.stdout.trim();
  };
  source.assert();
  const b = inspection.binding, installed = installedBinding;
  if (b.databaseIdentity !== PTR_BOOTSTRAP_TARGET || installed.databaseIdentity !== PTR_BOOTSTRAP_TARGET
    || installed.moduleTreeId !== installed.sourceTree
    || git(['rev-parse', '--verify', `${b.sourceCommit}^{tree}`]) !== b.sourceTree
    || git(['rev-parse', '--verify', `${installed.sourceCommit}^{tree}`]) !== installed.sourceTree) fail('INSTALLED_SOURCE_INVALID');
  for (const commit of new Set([b.sourceCommit, installed.sourceCommit])) {
    git(['verify-commit', '--raw', commit], true);
    if (git(['log', '-1', '--format=%G?%n%GK%n%GS', commit])
      !== `G\n${source.facts.signerFingerprint}\n${source.facts.signerIdentity}`) fail('INSTALLED_SIGNATURE_INVALID');
  }
  git(['merge-base', '--is-ancestor', b.sourceCommit, installed.sourceCommit]);
  git(['merge-base', '--is-ancestor', installed.sourceCommit, source.facts.sourceCommit]);
  // The exact installed module implementation remains current; later operator/tests-only edits are permitted.
  git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', installed.sourceCommit, source.facts.sourceCommit,
    '--', 'spacetimedb', 'package.json', 'package-lock.json']);
  source.assert();
}

/** The actual CLI wires only maintained fixed-target factories. No arbitrary token, SQL, endpoint or reducer inputs. */
export async function executePtrInitialOwnerAtlas(input: Readonly<{ command: Command; source: PtrInitialOwnerSource;
  environment: NodeJS.ProcessEnv; workspaceRoot: string; bootstrapInspection?: string; batchHandle?: string;
  candidateHandle?: string; approvalReference?: string; confirmation?: string; atlasImportReceipt?: string; updateInspection?: string }>) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000) fail('PLATFORM_INVALID');
  if (!['select-runtime', 'prepare-runtime', 'inspect', 'import', 'reconcile-import', 'inspect-owner', 'provision-owner'].includes(input.command)
    || !isAbsolute(input.workspaceRoot) || realpathSync(input.workspaceRoot) !== input.workspaceRoot) fail('ARGUMENT_INVALID');
  const source = capturePtrInitialOwnerSource(ROOT, input.source);
  if (input.command === 'select-runtime' || input.command === 'prepare-runtime') {
    if (input.bootstrapInspection !== undefined || input.confirmation !== undefined || input.atlasImportReceipt !== undefined
      || input.updateInspection !== undefined) fail('ARGUMENT_INVALID');
    const runtime = await preparePtrInitialOwnerRuntimeRelease({ command: input.command === 'select-runtime' ? 'select' : 'prepare',
      workspaceRoot: input.workspaceRoot, batchHandle: input.batchHandle ?? '', assertSource: () => source.assert(),
      ...(input.candidateHandle === undefined ? {} : { candidateHandle: input.candidateHandle }),
      ...(input.approvalReference === undefined ? {} : { approvalReference: input.approvalReference }) });
    source.assert(); return Object.freeze({ profile: 'warpkeep-ptr-initial-owner-atlas-operation-v1', source: source.facts,
      command: input.command, runtime, commandSucceeded: true, providerWritesAttempted: false,
      usableOwnerPtrVerified: false, productionAuthorized: false, globalReleaseAuthority: false });
  }
  if (!HASH.test(input.bootstrapInspection ?? '') || input.batchHandle !== undefined || input.candidateHandle !== undefined
    || input.approvalReference !== undefined || (input.command === 'import' || input.command === 'provision-owner'
      ? !HASH.test(input.confirmation ?? '') : input.confirmation !== undefined)
    || (input.command.endsWith('owner') ? !HASH.test(input.atlasImportReceipt ?? '') : input.atlasImportReceipt !== undefined)
    || (input.updateInspection !== undefined && !HASH.test(input.updateInspection))) fail('ARGUMENT_INVALID');
  const env = { ...input.environment };
  const configPath = env.WARPKEEP_SPACETIME_CLI_CONFIG_PATH, executable = env.WARPKEEP_SPACETIME_EXECUTABLE ?? env.SPACETIME_BIN;
  const receiptDirectory = env.WARPKEEP_PTR_RECEIPT_DIRECTORY;
  if (typeof configPath !== 'string' || !isAbsolute(configPath) || realpathSync(configPath) !== configPath
    || typeof executable !== 'string' || !isAbsolute(executable) || realpathSync(executable) !== executable
    || typeof receiptDirectory !== 'string' || !isAbsolute(receiptDirectory)
    || ['WARPKEEP_SPACETIMEDB_URI', 'WARPKEEP_SPACETIMEDB_DATABASE', 'WARPKEEP_PTR_SPACETIMEDB_DATABASE', 'WARPKEEP_AUTH_BRIDGE_URL']
      .some(key => env[key] !== undefined)) fail('ENVIRONMENT_INVALID');
  assertProductionAdminTrustedAncestors(dirname(configPath)); assertProductionAdminTrustedAncestors(dirname(executable));
  const config = readLocalBindingBoundedFile(configPath, { minimumBytes: 1, maximumBytes: 64 * 1024, expectedUid: 1000, expectedMode: 0o600 });
  const configSha = sha(config.body); config.body.fill(0);
  const binary = readLocalBindingBoundedFile(executable, { minimumBytes: 1, maximumBytes: 256 * 1024 * 1024,
    requireExecutable: true, rejectWritableExecutable: true });
  const binarySha = sha(binary.body); binary.body.fill(0);
  const journal = openPtrCompatibilityBootstrapJournal(false);
  const record = journal.read('inspection', input.bootstrapInspection!).value;
  const inspection = validatePtrBootstrapInspection(record);
  if (inspection.inspectionDigest !== input.bootstrapInspection || inspection.binding.cliDigest !== binarySha
    || inspection.binding.cliConfigDigest !== configSha) fail('BOOTSTRAP_TOOLS_DIFFERENT');
  assertPtrInitialAtlasBootstrapMarker(inspection, journal.read('submission', PTR_BOOTSTRAP_TARGET).value);
  const updateJournal = input.updateInspection === undefined ? undefined
    : openPtrInitialOwnerUpdateJournal(defaultProductionAdminStateDirectory(), false);
  let updateRecord: unknown, updateInspection: PtrInitialOwnerUpdateInspection | undefined,
    updateSubmission: unknown, updateAcknowledgement: unknown, updateAcknowledgementPresent = false;
  if (updateJournal && input.updateInspection) {
    updateRecord = updateJournal.read('inspection', input.updateInspection).value;
    updateInspection = validatePtrInitialOwnerUpdateInspection(updateRecord);
    if (updateInspection.inspectionDigest !== input.updateInspection) fail('UPDATE_CONTINUATION_INSPECTION_DIFFERENT');
    const predecessorKey = updateInspection.before.program;
    if (!updateJournal.present('submission', predecessorKey)) fail('UPDATE_CONTINUATION_SUBMISSION_MISSING');
    updateSubmission = updateJournal.read('submission', predecessorKey).value;
    updateAcknowledgementPresent = updateJournal.present('acknowledgement', updateInspection.inspectionDigest);
    updateAcknowledgement = updateAcknowledgementPresent
      ? updateJournal.read('acknowledgement', updateInspection.inspectionDigest).value : undefined;
  }
  const continuationEvidence = updateInspection && updateJournal ? ptrInitialAtlasUpdateContinuationEvidence({
    bootstrap: inspection, update: updateInspection, requestedInspectionDigest: input.updateInspection!,
    submissionMarker: updateSubmission, acknowledgementPresent: updateAcknowledgementPresent,
    ...(updateAcknowledgementPresent ? { acknowledgementMarker: updateAcknowledgement } : {}) }) : undefined;
  const binding = continuationEvidence?.binding ?? inspection.binding;
  const assertContinuationJournal = () => {
    if (!updateJournal || !updateInspection || !input.updateInspection) return;
    updateJournal.assert();
    const currentRecord = updateJournal.read('inspection', input.updateInspection).value;
    if (updateCanonical(currentRecord) !== updateCanonical(updateRecord)) fail('UPDATE_CONTINUATION_RECORD_CHANGED');
    const key = updateInspection.before.program;
    if (!updateJournal.present('submission', key)
      || updateCanonical(updateJournal.read('submission', key).value) !== updateCanonical(updateSubmission))
      fail('UPDATE_CONTINUATION_SUBMISSION_CHANGED');
    const acknowledgementPresent = updateJournal.present('acknowledgement', updateInspection.inspectionDigest);
    if (acknowledgementPresent !== updateAcknowledgementPresent) fail('UPDATE_CONTINUATION_ACKNOWLEDGEMENT_CHANGED');
    if (acknowledgementPresent && updateCanonical(updateJournal.read('acknowledgement', updateInspection.inspectionDigest).value)
      !== updateCanonical(updateAcknowledgement)) fail('UPDATE_CONTINUATION_ACKNOWLEDGEMENT_CHANGED');
    const evidence = ptrInitialAtlasUpdateContinuationEvidence({ bootstrap: inspection, update: updateInspection,
      requestedInspectionDigest: input.updateInspection, submissionMarker: updateSubmission,
      acknowledgementPresent: updateAcknowledgementPresent,
      ...(updateAcknowledgementPresent ? { acknowledgementMarker: updateAcknowledgement } : {}) });
    if (evidence.continuationDigest !== continuationEvidence?.continuationDigest) fail('UPDATE_CONTINUATION_CHANGED');
  };
  const assert = () => {
    source.assert(); journal.assert(); updateJournal?.assert(); assertContinuationJournal(); assertInstalledSource(source, inspection, binding);
    if (updateCanonical(journal.read('inspection', input.bootstrapInspection!).value) !== updateCanonical(record)) fail('BOOTSTRAP_RECORD_CHANGED');
    assertPtrInitialAtlasBootstrapMarker(inspection, journal.read('submission', PTR_BOOTSTRAP_TARGET).value);
    readLocalBindingBoundedFile(configPath, { maximumBytes: 64 * 1024, expectedUid: 1000, expectedMode: 0o600,
      expectedSha256: configSha, expectedIdentity: config.identity }).body.fill(0);
    readLocalBindingBoundedFile(executable, { maximumBytes: 256 * 1024 * 1024, requireExecutable: true, rejectWritableExecutable: true,
      expectedSha256: binarySha, expectedIdentity: binary.identity }).body.fill(0);
  };
  let capability: ReturnType<typeof createPtrInspectionProviderCredentials> | undefined;
  let transport: ReturnType<typeof createPtrAtlasImportTransport> | undefined;
  let secret = '', submitted = false;
  try {
    secret = takePtrProductionAdminSecret(input.environment); delete env.WARPKEEP_ADMIN_TOKEN_SECRET;
    assert();
    capability = createPtrInspectionProviderCredentials({ credentials: { spacetimeExecutable: executable,
      spacetimeExecutableSha256: binarySha, spacetimeCliRootDirectory: dirname(configPath), spacetimeCliConfigPath: configPath,
      spacetimeCliConfigSha256: configSha, assertSource: assert, assertCliConfig: assert } });
    const held = capability;
    const assertProgram = async () => { assert(); const response = await requestPtrInspectionProvider(held, { operation: 'program' });
      try { assert(); if (parseExistingUpdateProgram(response.bytes) !== binding.candidateProgram) fail('PROGRAM_CHANGED'); } finally { response.bytes.fill(0); } };
    const read = async (operation: 'schema-v9' | 'schema-v10') => { assert();
      const response = await requestPtrInspectionProvider(held, { operation }); assert(); return response.bytes; };
    const observeOnce = async () => {
      const v9 = await read('schema-v9'); let v10: Uint8Array | undefined;
      try {
        v10 = await read('schema-v10');
        const actual = await inspectPtrInitialOwnerState({ assertSource: assert,
          request: async operation => { assert(); const response = await requestPtrInspectionProvider(held, { operation }); assert(); return response.bytes; },
          configuration: async () => { assert(); const value = await verifyAuthBridgeRpcRoleAttestation({ adminToken: secret }); assert(); return value; } });
        if (!actual.preservation.installedStateObservedEqual) fail('INSTALLED_STATE_CHANGED');
        if (!actual.preservation.privateConfigurationObservedEqual) fail('BRIDGE_CONFIGURATION_CHANGED_OR_UNOBSERVED');
        if (!actual.afterConfiguration?.ptrEnabled || actual.afterConfiguration.ptrSpacetimeDbDatabase !== PTR_BOOTSTRAP_TARGET) fail('BRIDGE_NOT_READY');
        const afterImport = actual.after.atlas?.state !== 'absent' || actual.after.owner?.state !== 'ownerless';
        let continuation: ReturnType<typeof assertPtrInitialAtlasUpdateContinuation> | undefined;
        if (continuationEvidence && updateInspection) {
          if (!afterImport) {
            continuation = assertPtrInitialAtlasUpdateContinuation({ bootstrap: inspection, update: updateInspection,
              requestedInspectionDigest: input.updateInspection!, submissionMarker: updateSubmission,
              acknowledgementPresent: updateAcknowledgementPresent,
              ...(updateAcknowledgementPresent ? { acknowledgementMarker: updateAcknowledgement } : {}),
              observation: { state: actual.after, configuration: actual.afterConfiguration, installedV10: v10 } });
          } else assertContinuationJournal();
        }
        const observed = assertPtrInitialAtlasObservation(inspection, { state: actual.after, installedV9: v9, installedV10: v10 }, binding);
        return { observed, actual, continuation, afterImport };
      } finally { v9.fill(0); v10?.fill(0); }
    };
    const observe = async () => {
      if (!continuationEvidence) return observeOnce();
      const first = await observeOnce(), second = await observeOnce();
      if (first.afterImport !== second.afterImport || first.observed.snapshotDigest !== second.observed.snapshotDigest
        || updateCanonical(first.actual.afterConfiguration) !== updateCanonical(second.actual.afterConfiguration)
        || first.continuation?.continuationDigest !== second.continuation?.continuationDigest)
        fail('UPDATE_CONTINUATION_READBACK_CHANGED');
      return second;
    };
    const before = await observe();
    let updateReadbackReconciliation: ReturnType<typeof assertPtrInitialAtlasUpdateReconciliationPair> | undefined;
    if (continuationEvidence && !updateAcknowledgementPresent && before.continuation) {
      env.WARPKEEP_ADMIN_TOKEN_SECRET = secret;
      try {
        const first = await executePtrInitialOwnerUpdate({ command: 'reconcile', source: input.source, environment: env,
          inspectionDigest: updateInspection!.inspectionDigest });
        const second = await executePtrInitialOwnerUpdate({ command: 'reconcile', source: input.source, environment: env,
          inspectionDigest: updateInspection!.inspectionDigest });
        updateReadbackReconciliation = assertPtrInitialAtlasUpdateReconciliationPair({ continuation: before.continuation, first, second });
      } finally { delete env.WARPKEEP_ADMIN_TOKEN_SECRET; }
    }
    const assertBridgePreserved = (after: Awaited<ReturnType<typeof observe>>) => {
      if (updateCanonical(before.actual.afterConfiguration) !== updateCanonical(after.actual.afterConfiguration)) fail('BRIDGE_CONFIGURATION_CHANGED');
    };
    if (input.command.endsWith('owner')) {
      if (continuationEvidence) {
        const workspace = openExistingGreaterRealmPrivateWorkspace({ repositoryRoot: ROOT, workspaceRoot: input.workspaceRoot });
        const artifacts = readPtrGreaterRealmRuntimeRelease(workspace);
        verifyPtrGreaterRealmRuntimeReleaseArtifacts(artifacts);
        const authority = greaterRealmProductionImportEngine.importAuthority(artifacts, verifyPtrGreaterRealmRuntimeReleaseArtifacts);
        const lineage = runGreaterRealmTrustedGit(['merge-base', '--is-ancestor', authority.sourceCommit, source.facts.sourceCommit], ROOT);
        if (lineage.error || lineage.status !== 0 || lineage.signal !== null || lineage.stderr !== '') fail('ATLAS_SOURCE_ANCESTRY_INVALID');
        const marker = ptrInitialAtlasImportMarker({ bootstrapInspection: inspection.inspectionDigest, binding,
          atlasSourceCommit: authority.sourceCommit, releaseSha256: authority.releaseSha256, continuation: continuationEvidence });
        const stateRoot = join(defaultProductionAdminStateDirectory(), 'ptr-initial-owner-atlas-v1');
        const importJournal = openPtrInitialOwnerUpdateJournal(stateRoot, false);
        const retained = await coordinatePtrInitialAtlasImport({ command: 'reconcile-import', journal: importJournal, marker, assert,
          validateReceipt: value => validatePtrInitialAtlasImportReceipt(value, { binding, authority,
            manifestSha256: sha(artifacts.manifestBytes), headerJson: authority.headerJson }),
          execute: async () => fail('OWNER_IMPORT_CHAIN_EXECUTOR_UNAVAILABLE') });
        if (!retained || retained.importReceiptDigest !== input.atlasImportReceipt) fail('OWNER_IMPORT_CHAIN_UNVERIFIED');
      }
      assert();
      env.WARPKEEP_ADMIN_TOKEN_SECRET = secret;
      const result = await executePtrOwnerProvisionOperator({ arguments: [input.command === 'inspect-owner' ? 'inspect' : 'provision',
        `--database-identity=${PTR_BOOTSTRAP_TARGET}`, `--module-source-commit=${binding.sourceCommit}`,
        `--module-sha256=${binding.candidateSha256}`, `--atlas-import-receipt-digest=${input.atlasImportReceipt}`,
        ...(input.command === 'provision-owner' ? [`--confirm=${input.confirmation}`] : [])], environment: env });
      assert(); const after = await observe(); assertBridgePreserved(after);
      return Object.freeze({ profile: 'warpkeep-ptr-initial-owner-atlas-operation-v1', source: source.facts,
        command: input.command, installedModuleSourceCommit: binding.sourceCommit, result, after: after.observed,
        ...(continuationEvidence ? { continuation: { ...continuationEvidence, installationProvenByReadback: before.continuation?.installationProvenByReadback ?? false,
          ...(updateReadbackReconciliation ? { updateReadbackReconciliation } : {}), importChainVerified: true } } : {}),
        commandSucceeded: true, usableOwnerPtrVerified: false, productionAuthorized: false, globalReleaseAuthority: false });
    }
    if (input.command === 'import' && before.observed.owner.state !== 'ownerless') fail('OWNER_ALREADY_PRESENT');
    const workspace = openExistingGreaterRealmPrivateWorkspace({ repositoryRoot: ROOT, workspaceRoot: input.workspaceRoot });
    const artifacts = readPtrGreaterRealmRuntimeRelease(workspace);
    verifyPtrGreaterRealmRuntimeReleaseArtifacts(artifacts);
    const authority = greaterRealmProductionImportEngine.importAuthority(artifacts, verifyPtrGreaterRealmRuntimeReleaseArtifacts);
    const lineage = runGreaterRealmTrustedGit(['merge-base', '--is-ancestor', authority.sourceCommit, source.facts.sourceCommit], ROOT);
    if (lineage.error || lineage.status !== 0 || lineage.signal !== null || lineage.stderr !== '') fail('ATLAS_SOURCE_ANCESTRY_INVALID');
    let importChainVerified = false;
    if (continuationEvidence && before.afterImport) {
      const stateRoot = join(defaultProductionAdminStateDirectory(), 'ptr-initial-owner-atlas-v1');
      const importJournal = openPtrInitialOwnerUpdateJournal(stateRoot, false);
      const marker = ptrInitialAtlasImportMarker({ bootstrapInspection: inspection.inspectionDigest, binding,
        atlasSourceCommit: authority.sourceCommit, releaseSha256: authority.releaseSha256, continuation: continuationEvidence });
      const retained = await coordinatePtrInitialAtlasImport({ command: 'reconcile-import', journal: importJournal, marker, assert,
        validateReceipt: value => validatePtrInitialAtlasImportReceipt(value, { binding, authority,
          manifestSha256: sha(artifacts.manifestBytes), headerJson: authority.headerJson }),
        execute: async () => fail('IMPORT_CHAIN_EXECUTOR_UNAVAILABLE') });
      if (!retained) fail('IMPORT_CHAIN_RECEIPT_MISSING');
      importChainVerified = true;
    }
    const confirmation = ptrInitialAtlasConfirmation({ bootstrapInspection: inspection.inspectionDigest, sourceCommit: source.facts.sourceCommit,
      installedSourceCommit: binding.sourceCommit, program: binding.candidateProgram, releaseSha256: authority.releaseSha256,
      atlasSourceCommit: authority.sourceCommit, ...(continuationEvidence ? { continuationDigest: continuationEvidence.continuationDigest } : {}) });
    transport = createPtrAtlasImportTransport({ databaseIdentity: PTR_BOOTSTRAP_TARGET, adminSecret: secret, disallowedDatabaseIdentities: [] });
    const active = transport, status = projectPtrProductionStatus(await active.inspect()); assert();
    if (input.command === 'inspect') return Object.freeze({ profile: 'warpkeep-ptr-initial-owner-atlas-operation-v1', command: input.command,
      source: source.facts, installedModuleSourceCommit: binding.sourceCommit, program: binding.candidateProgram,
      atlasSourceCommit: authority.sourceCommit, releaseSha256: authority.releaseSha256, confirmationDigest: confirmation,
      ...(continuationEvidence ? { continuation: { ...continuationEvidence,
        installationProvenByReadback: before.continuation?.installationProvenByReadback ?? false,
        ...(updateReadbackReconciliation ? { updateReadbackReconciliation } : {}),
        ...(importChainVerified ? { importChainVerified } : {}) } } : {}),
      status: { present: status.present, state: status.state, ready: status.ready, importsExact: status.importsExact,
        ownerProvisioned: status.ownerProvisioned, ownerEnabled: status.ownerEnabled }, commandSucceeded: true,
      providerWritesAttempted: false, usableOwnerPtrVerified: false, productionAuthorized: false, globalReleaseAuthority: false });
    if (input.command === 'import' && input.confirmation !== confirmation) fail('CONFIRMATION_DIFFERENT');
    // Exclusive durable marker precedes the first reducer. A later invocation is read-only, even if its ACK was lost.
    const stateParent = input.command === 'import' ? ensureCanonicalProductionAdminStateDirectory() : defaultProductionAdminStateDirectory();
    const stateRoot = join(stateParent, 'ptr-initial-owner-atlas-v1');
    if (!existsSync(stateRoot) && input.command === 'import') mkdirSync(stateRoot, { mode: 0o700 });
    if (!existsSync(stateRoot)) fail('IMPORT_JOURNAL_ABSENT');
    const rootStat = lstatSync(stateRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || realpathSync(stateRoot) !== stateRoot
      || rootStat.uid !== 1000 || (rootStat.mode & 0o7777) !== 0o700) fail('IMPORT_JOURNAL_INVALID');
    const parentFd = openSync(stateParent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(parentFd); } finally { closeSync(parentFd); }
    const importJournal = openPtrInitialOwnerUpdateJournal(stateRoot, input.command === 'import');
    const marker = ptrInitialAtlasImportMarker({ bootstrapInspection: inspection.inspectionDigest, binding,
      atlasSourceCommit: authority.sourceCommit, releaseSha256: authority.releaseSha256, continuation: continuationEvidence });
    const validateReceipt = (value: unknown) => validatePtrInitialAtlasImportReceipt(value, { binding, authority,
      manifestSha256: sha(artifacts.manifestBytes), headerJson: authority.headerJson });
    const receipt = await coordinatePtrInitialAtlasImport({ command: input.command as 'import' | 'reconcile-import', journal: importJournal,
      marker, assert, validateReceipt, execute: beforeSend => executePtrProductionImport({ artifacts, databaseIdentity: PTR_BOOTSTRAP_TARGET, disallowedDatabaseIdentities: [],
      moduleSourceCommit: binding.sourceCommit, moduleSha256: binding.candidateSha256, moduleTreeId: binding.moduleTreeId,
      dependencyClosureDigest: binding.dependencyClosureDigest, spacetimeExecutableSha256: binding.cliDigest,
      importEpoch: 1n, publicName: 'Warpkeep PTR', transport: { inspect: async () => { assert(); const r = await active.inspect(); assert(); return r; },
        prepareSubmission: async () => { assert(); await active.prepareSubmission(); assert(); },
        submit: async (reducer, args) => { assert(); await assertProgram();
          await active.submit(reducer, args, () => { beforeSend(); submitted = true; }); assert(); } },
      assertCanStartWrite: assert }) });
    assert(); const after = await observe(); assertBridgePreserved(after);
    if (receipt === null) return Object.freeze({ profile: 'warpkeep-ptr-initial-owner-atlas-operation-v1', command: input.command,
       source: source.facts, after: after.observed, commandSucceeded: false, submissionOutcome: 'uncertain',
       ...(continuationEvidence ? { continuation: { ...continuationEvidence,
        installationProvenByReadback: before.continuation?.installationProvenByReadback ?? false,
        ...(updateReadbackReconciliation ? { updateReadbackReconciliation } : {}) } } : {}),
      providerWritesAttempted: false, retryAuthorized: false, usableOwnerPtrVerified: false, productionAuthorized: false, globalReleaseAuthority: false });
    if ((input.command === 'import' && after.observed.owner.state !== 'ownerless') || after.observed.atlas.state !== 'ready')
      fail('IMPORT_POSTCONDITION_INVALID', input.command === 'import');
    const ready = projectPtrProductionStatus(await active.inspect()); assert();
    if (ready.expectedReleaseSha256 !== receipt.expectedReleaseSha256 || ready.sourceCommit !== receipt.atlasSourceCommit
      || ready.publicReleaseId !== receipt.publicReleaseId || ready.releaseHeaderSha256 !== receipt.releaseHeaderSha256
      || ready.verificationDigest !== receipt.verificationDigest || ready.importEpoch?.toString() !== receipt.importEpoch
      || !greaterRealmProductionImportEngine.readyPostcondition(ready, authority, 1n)
      || ready.verifiedComponentCount !== authority.totals.componentCount || ready.verifiedChunkCount !== authority.totals.chunkCount
      || ready.verifiedCellCount !== authority.totals.cellCount || ready.verifiedSlotCount !== authority.totals.castleSlotCount
      || ready.verifiedResourceNodeCount !== authority.totals.resourceNodeCount
      || ready.componentExpectedCellCount !== ready.importedPassableCellCount
      || ready.componentExpectedSlotCount !== authority.totals.castleSlotCount
      || ready.componentExpectedResourceNodeCount !== authority.totals.resourceNodeCount) fail('IMPORT_POSTCONDITION_INVALID', true);
    const installed = writePrivatePtrProductionReceipt({ directory: receiptDirectory, repositoryRoot: ROOT, kind: 'atlas-import', receipt });
    assert();
    return Object.freeze({ profile: 'warpkeep-ptr-initial-owner-atlas-operation-v1', command: input.command, source: source.facts,
      installedModuleSourceCommit: binding.sourceCommit, program: binding.candidateProgram, receipt, receiptFileSha256: installed.receiptFileSha256,
      ...(continuationEvidence ? { continuation: { ...continuationEvidence,
        installationProvenByReadback: before.continuation?.installationProvenByReadback ?? false,
        ...(updateReadbackReconciliation ? { updateReadbackReconciliation } : {}),
        ...(importChainVerified ? { importChainVerified } : {}),
        atlasImportReceiptDigest: receipt.importReceiptDigest } } : {}),
      after: after.observed, commandSucceeded: true, providerWritesAttempted: submitted, retryAuthorized: false, usableOwnerPtrVerified: false,
      productionAuthorized: false, globalReleaseAuthority: false });
  } catch (error) {
    if (error instanceof PtrInitialOwnerAtlasError) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      && /^[A-Z0-9_:-]{3,160}$/u.test(error.code) ? error.code : 'PROVIDER_OR_PROTOCOL_FAILED';
    const possiblySubmitted = submitted || (typeof error === 'object' && error !== null && 'submitted' in error && error.submitted === true);
    fail(possiblySubmitted ? 'IMPORT_OUTCOME_AMBIGUOUS_RECONCILE_ONLY' : code, possiblySubmitted);
  } finally {
    delete input.environment.WARPKEEP_ADMIN_TOKEN_SECRET; delete input.environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
    delete env.WARPKEEP_ADMIN_TOKEN_SECRET; delete env.WARPKEEP_PLAYER_CANARY_OWNER_FID; delete env.WARPKEEP_PTR_LAUNCH_ENTROPY;
    secret = '';
    try { await transport?.close(); } finally { if (capability !== undefined) disposePtrUpdateProviderCredentials(capability); assert(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2), values = new Map<string, string>();
    for (const argument of args) { const match = /^--(source|tree|signer|signer-identity|native-evidence|workspace|batch|candidate|approval-reference|bootstrap-inspection|update-inspection|atlas-import-receipt|confirm|out)=(.+)$/u.exec(argument);
      if (!match || values.has(match[1]!)) fail('ARGUMENT_INVALID'); values.set(match[1]!, match[2]!); }
    if (['source', 'tree', 'signer', 'signer-identity', 'workspace', 'out'].some(key => !values.has(key))) fail('ARGUMENT_INVALID');
    const output = resolve(values.get('out')!);
    if (dirname(output) !== join(ROOT, 'artifacts', 'qa') || !/^[A-Za-z0-9-]+\.json$/u.test(output.slice(dirname(output).length + 1))) fail('OUTPUT_PATH_INVALID');
    assertProductionAdminTrustedAncestors(dirname(output));
    const fd = openSync(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      fchmodSync(fd, 0o600); const reserved = fstatSync(fd, { bigint: true });
      if (!reserved.isFile() || reserved.nlink !== 1n || reserved.size !== 0n || reserved.uid !== 1000n) fail('OUTPUT_IDENTITY_INVALID');
      const result = await executePtrInitialOwnerAtlas({ command: command as Command, source: { sourceCommit: values.get('source')!,
        sourceTree: values.get('tree')!, signerFingerprint: values.get('signer')!, signerIdentity: values.get('signer-identity')!,
        ...(values.has('native-evidence') ? { nativeEvidence: values.get('native-evidence')! } : {}) }, environment: process.env, workspaceRoot: values.get('workspace')!,
        ...(values.has('batch') ? { batchHandle: values.get('batch')! } : {}), ...(values.has('candidate') ? { candidateHandle: values.get('candidate')! } : {}),
        ...(values.has('approval-reference') ? { approvalReference: values.get('approval-reference')! } : {}),
        ...(values.has('bootstrap-inspection') ? { bootstrapInspection: values.get('bootstrap-inspection')! } : {}),
        ...(values.has('update-inspection') ? { updateInspection: values.get('update-inspection')! } : {}),
        ...(values.has('atlas-import-receipt') ? { atlasImportReceipt: values.get('atlas-import-receipt')! } : {}),
        ...(values.has('confirm') ? { confirmation: values.get('confirm')! } : {}) });
      const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`), current = fstatSync(fd, { bigint: true }), byPath = lstatSync(output, { bigint: true });
      if (bytes.length > 256 * 1024 || byPath.isSymbolicLink() || ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        .some(key => current[key as keyof typeof current] !== reserved[key as keyof typeof reserved] || byPath[key as keyof typeof byPath] !== reserved[key as keyof typeof reserved])) fail('OUTPUT_CHANGED');
      for (let offset = 0; offset < bytes.length;) { const count = writeSync(fd, bytes, offset, bytes.length - offset); if (count < 1) fail('OUTPUT_WRITE_FAILED'); offset += count; }
      fsyncSync(fd); readLocalBindingBoundedFile(output, { maximumBytes: 256 * 1024, expectedMode: 0o600, expectedUid: 1000, expectedSha256: sha(bytes) }).body.fill(0);
      process.stdout.write(`${JSON.stringify({ path: output, sha256: sha(bytes), commandSucceeded: result.commandSucceeded })}\n`);
      if (!result.commandSucceeded) process.exitCode = 1;
    } finally { closeSync(fd); }
  } catch (error) { process.stderr.write(`${error instanceof PtrInitialOwnerAtlasError ? error.message : 'PTR_INITIAL_OWNER_ATLAS_FAILED'}\n`); process.exitCode = 1; }
}
