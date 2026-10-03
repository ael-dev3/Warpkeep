// Pure observations and a one-submission coordinator. These exports mint no release authority.
import { types } from 'node:util';
import { PTR_INSPECTION_TABLES } from './ptr-update-provider-credentials.mjs';
import { comparePtrUpdateDefinitions, parsePtrUpdateDefinition } from './ptr-update-definition-policy.mjs';
import { parseExistingUpdateJson, parseExistingUpdateSchema, parseExistingOpaqueUpdatePlan,
  parseExistingUpdateSuccess, updateCanonical, updateDigest } from './sealed-realms-existing-update-protocol.mjs';

export const PTR_BOOTSTRAP_TARGET = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
export const PTR_BOOTSTRAP_PROVIDER_OWNER = 'c200431f50cf410304546489e2600c8446408f1aa727c91d86bc00aef6724d15';
const PROFILE = 'warpkeep-ptr-compatibility-bootstrap-v1';
const OLD = Object.freeze(PTR_INSPECTION_TABLES.filter(name => !name.startsWith('gameplay04_')).sort());
const ADDED = Object.freeze(PTR_INSPECTION_TABLES.filter(name => name.startsWith('gameplay04_')).sort());
const ALL = Object.freeze([...PTR_INSPECTION_TABLES].sort());
const HASH = /^[a-f0-9]{64}$/u, COMMIT = /^[a-f0-9]{40}$/u;
const BINDING = ['sourceCommit', 'sourceTree', 'databaseIdentity', 'candidateProgram', 'candidateSha256',
  'candidateDescriptionDigest', 'moduleTreeId', 'dependencyClosureDigest', 'cliDigest', 'cliConfigDigest'];
export class PtrCompatibilityBootstrapError extends Error {
  constructor(code) { super(`PTR_COMPATIBILITY_BOOTSTRAP_${code}`); this.name = 'PtrCompatibilityBootstrapError'; this.code = this.message; }
}
const fail = code => { throw new PtrCompatibilityBootstrapError(code); };
const same = (a, b) => updateCanonical(a) === updateCanonical(b);
function data(value, keys) {
  if (types.isProxy(value) || !value || Object.getPrototypeOf(value) !== Object.prototype) fail('INPUT_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !descriptors[key]?.enumerable
    || !Object.hasOwn(descriptors[key], 'value'))) fail('INPUT_INVALID');
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function binding(value) {
  const result = data(value, BINDING);
  if (result.databaseIdentity !== PTR_BOOTSTRAP_TARGET
    || !['sourceCommit', 'sourceTree', 'moduleTreeId'].every(key => COMMIT.test(result[key] ?? ''))
    || !['candidateProgram', 'candidateSha256', 'candidateDescriptionDigest', 'dependencyClosureDigest', 'cliDigest', 'cliConfigDigest']
      .every(key => HASH.test(result[key] ?? ''))) fail('BINDING_INVALID');
  return result;
}
function inspectDefinition(bytes) {
  const value = parsePtrUpdateDefinition(bytes);
  const sections = Object.fromEntries(value.definition.sections.map(section => Object.entries(section)[0]));
  const names = sections.ExplicitNames.entries.filter(entry => entry.Table).map(entry => entry.Table.canonical_name).sort();
  if (sections.Tables.some(table => !same(table.table_access, { Private: [] }))) fail('PUBLIC_TABLE_UNSUPPORTED');
  // This bootstrap must not execute a data-writing init or disconnect lifecycle.
  if ((sections.LifeCycleReducers ?? []).some(entry => !same(entry.lifecycle_spec, { OnConnect: [] }))) fail('LIFECYCLE_UNSUPPORTED');
  return { value, names };
}
export function parsePtrBootstrapMetadata(bytes, claimedProviderIdentity) {
  const raw = data(parseExistingUpdateJson(bytes), ['database_identity', 'owner_identity', 'host_type', 'initial_program']);
  const identity = value => { const read = data(value, ['__identity__']); return read.__identity__; };
  if (identity(raw.database_identity) !== `0x${PTR_BOOTSTRAP_TARGET}`
    || identity(raw.owner_identity) !== `0x${PTR_BOOTSTRAP_PROVIDER_OWNER}`
    || claimedProviderIdentity !== PTR_BOOTSTRAP_PROVIDER_OWNER || raw.host_type !== 'Js') fail('PROVIDER_METADATA_INVALID');
  // initial_program is deliberately not used as the currently deployed program.
  return Object.freeze({ databaseIdentity: PTR_BOOTSTRAP_TARGET, providerOwnerIdentity: PTR_BOOTSTRAP_PROVIDER_OWNER, hostType: 'Js' });
}
export function createPtrBootstrapInspection(input) {
  const { binding: rawBinding, metadataBytes, claimedProviderIdentity, priorV9, priorV10, candidateDefinition, planBytes } =
    data(input, ['binding', 'metadataBytes', 'claimedProviderIdentity', 'priorV9', 'priorV10', 'candidateDefinition', 'planBytes']);
  const bound = binding(rawBinding), metadata = parsePtrBootstrapMetadata(metadataBytes, claimedProviderIdentity);
  const v9 = parseExistingUpdateSchema(priorV9), prior = inspectDefinition(priorV10);
  const candidate = inspectDefinition(Buffer.from(updateCanonical(candidateDefinition)));
  if (!same(v9.names, OLD) || !same(prior.names, OLD) || !same(candidate.names, ALL)
    || candidate.value.fullDigest !== bound.candidateDescriptionDigest) fail('TABLE_INVENTORY_INVALID');
  const preservation = comparePtrUpdateDefinitions({ priorServerSchema: priorV10, candidateArtifactDefinition: candidateDefinition });
  if (!same(preservation.addedTables, ADDED)) fail('ADDITIONS_UNSUPPORTED');
  const plan = parseExistingOpaqueUpdatePlan(planBytes);
  const visibleAdditions = [...plan.observation.AutoMigrate.migrate_plan.matchAll(/^▸ Created user table: ([a-z][a-z0-9_]{0,127}) \(private\)$/gmu)].map(match => match[1]).sort();
  if (!same(visibleAdditions, ADDED)) fail('PLAN_ADDITIONS_DIFFERENT');
  const value = { profile: PROFILE, binding: bound, metadata, priorV9Digest: v9.digest, preservation, plan,
    programBefore: null, rowsBefore: null, transportPolicy: 'BreakClients',
    planTokenScope: 'authenticated-provider-pre-publish-opaque-token-verified-by-server',
    preRowEqualityObserved: false, productionAuthorized: false, globalReleaseAuthority: false };
  return freeze({ ...value, inspectionDigest: updateDigest(value) });
}
export function validatePtrBootstrapInspection(record) {
  const keys = ['profile', 'binding', 'metadata', 'priorV9Digest', 'preservation', 'plan', 'programBefore', 'rowsBefore',
    'transportPolicy', 'planTokenScope', 'preRowEqualityObserved', 'productionAuthorized', 'globalReleaseAuthority', 'inspectionDigest'];
  const read = data(record, keys), { inspectionDigest, ...value } = read;
  if (read.profile !== PROFILE || read.programBefore !== null || read.rowsBefore !== null
    || read.transportPolicy !== 'BreakClients' || read.planTokenScope !== 'authenticated-provider-pre-publish-opaque-token-verified-by-server'
    || read.preRowEqualityObserved !== false || read.productionAuthorized !== false || read.globalReleaseAuthority !== false
    || !HASH.test(read.priorV9Digest ?? '') || !HASH.test(inspectionDigest ?? '') || updateDigest(value) !== inspectionDigest) fail('INSPECTION_INVALID');
  binding(read.binding);
  if (!same(read.metadata, { databaseIdentity: PTR_BOOTSTRAP_TARGET, providerOwnerIdentity: PTR_BOOTSTRAP_PROVIDER_OWNER, hostType: 'Js' })
    || !same(read.preservation.addedTables, ADDED)
    || read.preservation.priorPreservationDigest !== read.preservation.candidatePreservationDigest
    || read.preservation.candidateDigest !== read.binding.candidateDescriptionDigest
    || !same(parseExistingOpaqueUpdatePlan(Buffer.from(updateCanonical(read.plan.observation))), read.plan)) fail('INSPECTION_INVALID');
  return freeze(read);
}
export function classifyPtrBootstrapAfter(record, input) {
  const checked = validatePtrBootstrapInspection(record);
  const { state, installedV9, installedV10 } = data(input, ['state', 'installedV9', 'installedV10']);
  data(state, ['program', 'schemaDigest', 'definitionPolicy', 'tables', 'owner', 'atlas']);
  const v9 = parseExistingUpdateSchema(installedV9), v10 = inspectDefinition(installedV10);
  if (state?.program !== checked.binding.candidateProgram || state.schemaDigest !== v9.digest
    || state.definitionPolicy !== v9.definitionPolicy || v10.value.fullDigest !== checked.binding.candidateDescriptionDigest
    || !same(v9.names, ALL) || !same(v10.names, ALL) || !Array.isArray(state.tables) || !same(state.tables.map(table => table.name), ALL)
    || !state.owner || !['ownerless', 'enabled', 'disabled', 'unrecognized'].includes(state.owner.state)
    || !state.atlas || !['absent', 'unrecognized', 'importing', 'verifying', 'ready', 'canary', 'active', 'halted', 'rolled-back'].includes(state.atlas.state)) fail('AFTER_STATE_INVALID');
  for (const table of state.tables) {
    const row = data(table, ['name', 'count', 'rowsDigest', 'schemaDigest', 'installedTableSchemaDigest']);
    if (!Number.isSafeInteger(row.count) || row.count < 0 || row.count > 500000
      || !HASH.test(row.rowsDigest ?? '') || !HASH.test(row.schemaDigest ?? '')
      || row.installedTableSchemaDigest !== v9.tableSchemas[row.name]
      || (ADDED.includes(row.name) && (row.count !== 0 || row.rowsDigest !== updateDigest([])))) fail('AFTER_ROWS_INVALID');
  }
  return freeze({ outcome: 'observed-bootstrap-candidate', candidateProgram: state.program,
    fullPrivateAfterSnapshotDigest: updateDigest(state), tableCount: ALL.length,
    owner: state.owner, atlas: state.atlas, addedTablesObservedEmpty: true,
    programBefore: null, rowsBefore: null, preRowEqualityObserved: false,
    preservationBasis: 'reviewed-schema-boundary-and-provider-token-bound-additive-migration',
    atomicDatabaseSnapshot: false, retryAuthorized: false, usableOwnerPtrVerified: false,
    productionAuthorized: false, globalReleaseAuthority: false });
}

// The production CLI wires these dependencies to source-owned factories. A caller-supplied test seam is no authority.
export async function performPtrBootstrapOnce(dependencies) {
  let record = null, marked = false, acknowledgementReceived = false, acknowledgementError = null, result = null, error = null;
  const safe = failure => failure instanceof PtrCompatibilityBootstrapError ? failure.code : 'PTR_COMPATIBILITY_BOOTSTRAP_PROVIDER_OR_PROTOCOL_FAILED';
  try {
    dependencies.assert();
    if (dependencies.journal.present('submission', PTR_BOOTSTRAP_TARGET)) fail('SUBMISSION_ALREADY_MARKED_RECONCILE_ONLY');
    record = validatePtrBootstrapInspection(await dependencies.observeBefore()); dependencies.assert();
    dependencies.journal.write('inspection', record.inspectionDigest, record);
    const fresh = validatePtrBootstrapInspection(await dependencies.observeBefore());
    if (!same(fresh, record)) fail('PREFLIGHT_CHANGED');
    dependencies.assert();
    try {
      const response = await dependencies.apply(record.plan.token, () => {
        dependencies.assert();
        dependencies.journal.write('submission', PTR_BOOTSTRAP_TARGET, { inspectionDigest: record.inspectionDigest,
          binding: record.binding, programBefore: null, rowsBefore: null, submissionState: 'possibly-submitted' });
        marked = true; dependencies.assert();
      });
      try { parseExistingUpdateSuccess(response, PTR_BOOTSTRAP_TARGET); acknowledgementReceived = true; }
      finally { response.fill(0); }
    } catch (failure) { acknowledgementError = safe(failure); }
    // Even a 504/lost acknowledgement can follow a committed update. Never submit again.
    if (marked) {
      const after = await dependencies.observeAfter();
      try { result = classifyPtrBootstrapAfter(record, after); dependencies.assert(); }
      finally { after.installedV9.fill(0); after.installedV10.fill(0); }
    }
    else fail('SUBMISSION_NOT_MARKED');
  } catch (failure) { error = safe(failure); }
  let submissionSlotPresent = marked;
  try { submissionSlotPresent = dependencies.journal.present('submission', PTR_BOOTSTRAP_TARGET); }
  catch (failure) { error ??= safe(failure); submissionSlotPresent = null; }
  return freeze({ inspectionDigest: record?.inspectionDigest ?? null, submissionMarked: marked, submissionSlotPresent, acknowledgementReceived,
    acknowledgementError, result, error, candidateInstallationObserved: result !== null,
    submissionOutcome: (marked || submissionSlotPresent !== false) && result === null ? 'uncertain' : null, retryAuthorized: false,
    preRowEqualityObserved: false, productionAuthorized: false, globalReleaseAuthority: false });
}
