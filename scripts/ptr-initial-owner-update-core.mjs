// Pure update observations only. This module cannot submit, mint authority, or authorize a retry.
import { types } from 'node:util';
import { PTR_INSPECTION_TABLES } from './ptr-update-provider-credentials.mjs';
import { comparePtrUpdateDefinitions, parsePtrUpdateDefinition } from './ptr-update-definition-policy.mjs';
import { parseExistingUpdatePlan, updateCanonical, updateDigest,
  EXISTING_UPDATE_DEFINITION_POLICY } from './sealed-realms-existing-update-protocol.mjs';

export const PTR_INITIAL_OWNER_UPDATE_TARGET = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
const PROFILE = 'warpkeep-ptr-initial-owner-module-update-v1';
const HASH = /^[a-f0-9]{64}$/u, COMMIT = /^[a-f0-9]{40}$/u;
const BINDING = ['sourceCommit', 'sourceTree', 'databaseIdentity', 'candidateProgram', 'candidateSha256',
  'candidateDescriptionDigest', 'moduleTreeId', 'dependencyClosureDigest', 'cliDigest', 'cliConfigDigest'];
export class PtrInitialOwnerUpdateError extends Error {
  constructor(code) { super(`PTR_INITIAL_OWNER_UPDATE_${code}`); this.name = 'PtrInitialOwnerUpdateError'; this.code = this.message; }
}
const fail = code => { throw new PtrInitialOwnerUpdateError(code); };
const same = (a, b) => updateCanonical(a) === updateCanonical(b);
function data(value, keys) {
  if (types.isProxy(value) || !value || Object.getPrototypeOf(value) !== Object.prototype) fail('INPUT_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !descriptors[key]?.enumerable
    || !Object.hasOwn(descriptors[key], 'value'))) fail('INPUT_INVALID');
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function binding(value) {
  const result = data(value, BINDING);
  if (result.databaseIdentity !== PTR_INITIAL_OWNER_UPDATE_TARGET
    || ![result.sourceCommit, result.sourceTree, result.moduleTreeId].every(x => typeof x === 'string' && COMMIT.test(x))
    || !['candidateProgram', 'candidateSha256', 'candidateDescriptionDigest', 'dependencyClosureDigest', 'cliDigest', 'cliConfigDigest']
      .every(key => typeof result[key] === 'string' && HASH.test(result[key]))) fail('BINDING_INVALID');
  return result;
}
function tableNames(parsed) {
  const sections = Object.fromEntries(parsed.definition.sections.map(section => Object.entries(section)[0]));
  const names = sections.ExplicitNames.entries.filter(entry => entry.Table).map(entry => entry.Table.canonical_name).sort();
  if (names.length < 1 || names.some(name => !PTR_INSPECTION_TABLES.includes(name))) fail('TABLES_UNSUPPORTED');
  return names;
}
function snapshot(value) {
  const result = data(value, ['program', 'schemaDigest', 'definitionPolicy', 'tables', 'owner', 'atlas']);
  if (typeof result.program !== 'string' || !HASH.test(result.program) || typeof result.schemaDigest !== 'string'
    || !HASH.test(result.schemaDigest) || result.definitionPolicy !== EXISTING_UPDATE_DEFINITION_POLICY
    || !Array.isArray(result.tables) || result.tables.length < 1 || result.tables.length > PTR_INSPECTION_TABLES.length) fail('SNAPSHOT_INVALID');
  let previous = '';
  const tables = result.tables.map(value => {
    const row = data(value, ['name', 'count', 'rowsDigest', 'schemaDigest', 'installedTableSchemaDigest']);
    if (!PTR_INSPECTION_TABLES.includes(row.name) || row.name <= previous || !Number.isSafeInteger(row.count)
      || row.count < 0 || row.count > 500000 || ![row.rowsDigest, row.schemaDigest, row.installedTableSchemaDigest]
        .every(x => typeof x === 'string' && HASH.test(x))) fail('SNAPSHOT_INVALID');
    previous = row.name; return row;
  });
  // The owner identity itself remains private; its complete row digest above detects identity/epoch changes.
  const owner = data(result.owner, ['state', 'enabled', 'authEpoch']);
  if (owner.state === 'ownerless') {
    if (owner.enabled !== false || owner.authEpoch !== null || tables.find(t => t.name === 'ptr_owner_anchor_v1')?.count !== 0)
      fail('OWNER_OBSERVATION_INVALID');
  } else if (owner.state === 'unrecognized') {
    if (owner.enabled !== null || owner.authEpoch !== null) fail('OWNER_OBSERVATION_INVALID');
  } else if (!['enabled', 'disabled'].includes(owner.state) || owner.enabled !== (owner.state === 'enabled')
    || !Number.isSafeInteger(owner.authEpoch) || owner.authEpoch < 1 || owner.authEpoch > 0xffffffff
    || tables.find(t => t.name === 'ptr_owner_anchor_v1')?.count !== 1) fail('OWNER_OBSERVATION_INVALID');
  // Readiness is metadata, never a prerequisite for a schema-preserving backend update.
  let atlas;
  if (result.atlas?.state === 'absent' || result.atlas?.state === 'unrecognized') {
    atlas = data(result.atlas, ['state']);
  } else {
    atlas = data(result.atlas, ['state', 'verificationPhase', 'importEpoch', 'atlasSourceCommit', 'releaseDigest', 'fullImportStatusAuthority']);
    if (!['importing', 'verifying', 'ready', 'canary', 'active', 'halted', 'rolled-back'].includes(atlas.state)
      || typeof atlas.verificationPhase !== 'string' || atlas.verificationPhase.length > 64
      || typeof atlas.importEpoch !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/u.test(atlas.importEpoch)
      || BigInt(atlas.importEpoch) > 0xffffffffffffffffn || !COMMIT.test(atlas.atlasSourceCommit)
      || !HASH.test(atlas.releaseDigest) || atlas.fullImportStatusAuthority !== false) fail('ATLAS_OBSERVATION_INVALID');
  }
  return { ...result, tables, owner, atlas };
}
function configuration(value) {
  if (value === null) return null; // Missing private authority remains explicitly unobserved.
  const result = data(value, ['profile', 'digest', 'farcasterRpcEndpointRoleFingerprints', 'notificationDeliveryEnabled',
    'notificationTransportConfigured', 'notificationClientCount', 'publicAuthEnabled', 'accessExpectedFidRequired',
    'ptrEnabled', 'ptrSpacetimeDbDatabase', 'ptrAudience']);
  const rpc = data(result.farcasterRpcEndpointRoleFingerprints, ['primary', 'secondary']);
  if (result.profile !== 'warpkeep-auth-v2' || !HASH.test(result.digest) || ![rpc.primary, rpc.secondary].every(x => HASH.test(x))
    || !['notificationDeliveryEnabled', 'notificationTransportConfigured', 'publicAuthEnabled', 'accessExpectedFidRequired', 'ptrEnabled']
      .every(key => typeof result[key] === 'boolean') || !Number.isSafeInteger(result.notificationClientCount)
    || result.notificationClientCount < 0
    || (result.ptrEnabled ? typeof result.ptrSpacetimeDbDatabase !== 'string' || !HASH.test(result.ptrSpacetimeDbDatabase)
      || result.ptrAudience !== 'warpkeep-ptr-spacetimedb' : result.ptrSpacetimeDbDatabase !== null || result.ptrAudience !== null))
    fail('CONFIGURATION_UNSUPPORTED');
  // Record the real current modes, including notification=true and PTR=false. Do not toggle anything here.
  return { ...result, farcasterRpcEndpointRoleFingerprints: rpc };
}
function assertNames(state, names) {
  if (!same(state.tables.map(table => table.name), names)) fail('V9_V10_TABLE_SET_DIFFERENT');
}
function copy(value) { return JSON.parse(updateCanonical(value)); }
function assertPlanAdditions(plan, addedTables) {
  // The maintained parser already checked the whole visible formatter envelope.
  const names = [...plan.observation.AutoMigrate.migrate_plan.matchAll(/^▸ Created user table: ([A-Za-z_][A-Za-z0-9_]*) \((?:private|public)\)$/gmu)]
    .map(match => match[1]).sort();
  if (!same(names, addedTables)) fail('VISIBLE_PLAN_TABLE_SET_DIFFERENT');
}

/** The operating entry must obtain every input from genuine source/artifact/provider reads. No authority is returned. */
export function createPtrInitialOwnerUpdateInspection(input) {
  const { binding: rawBinding, before: rawBefore, configuration: rawConfig, priorV10, candidateDefinition, planBytes } =
    data(input, ['binding', 'before', 'configuration', 'priorV10', 'candidateDefinition', 'planBytes']);
  const bound = binding(rawBinding), before = snapshot(rawBefore), config = configuration(rawConfig);
  if (before.program === bound.candidateProgram) fail('ALREADY_INSTALLED');
  const prior = parsePtrUpdateDefinition(priorV10);
  const policy = comparePtrUpdateDefinitions({ priorServerSchema: priorV10, candidateArtifactDefinition: candidateDefinition });
  const candidate = parsePtrUpdateDefinition(Buffer.from(updateCanonical(candidateDefinition)));
  if (candidate.fullDigest !== bound.candidateDescriptionDigest || policy.candidateDigest !== bound.candidateDescriptionDigest)
    fail('CANDIDATE_DESCRIPTION_DIFFERENT');
  assertNames(before, tableNames(prior));
  const added = tableNames(candidate).filter(name => !before.tables.some(table => table.name === name));
  if (!same(added, policy.addedTables)) fail('CANDIDATE_TABLE_SET_DIFFERENT');
  const plan = parseExistingUpdatePlan(planBytes, PTR_INITIAL_OWNER_UPDATE_TARGET, before.program, bound.candidateProgram);
  assertPlanAdditions(plan, policy.addedTables);
  const value = copy({ profile: PROFILE, binding: bound, before, configuration: config, preservation: policy,
    candidateTableNames: tableNames(candidate), plan });
  return freeze({ ...value, inspectionDigest: updateDigest(value), productionAuthorized: false,
    globalReleaseAuthority: false, ownerAuthTokenVerified: false });
}
function inspection(value) {
  const read = data(value, ['profile', 'binding', 'before', 'configuration', 'preservation', 'candidateTableNames', 'plan',
    'inspectionDigest', 'productionAuthorized', 'globalReleaseAuthority', 'ownerAuthTokenVerified']);
  const { inspectionDigest, productionAuthorized, globalReleaseAuthority, ownerAuthTokenVerified, ...committed } = read;
  if (read.profile !== PROFILE || !HASH.test(inspectionDigest) || updateDigest(committed) !== inspectionDigest
    || productionAuthorized !== false || globalReleaseAuthority !== false || ownerAuthTokenVerified !== false) fail('INSPECTION_INVALID');
  binding(read.binding); snapshot(read.before); configuration(read.configuration);
  const plan = parseExistingUpdatePlan(Buffer.from(updateCanonical(read.plan.observation)), PTR_INITIAL_OWNER_UPDATE_TARGET,
    read.before.program, read.binding.candidateProgram);
  if (!same(plan, read.plan)) fail('INSPECTION_INVALID');
  assertPlanAdditions(plan, read.preservation.addedTables);
  return read;
}

export function validatePtrInitialOwnerUpdateInspection(record) { return freeze(copy(inspection(record))); }

/** Repeat actual observations immediately before a durable marker; the fixed transport owns the subsequent PUT. */
export function assertPtrInitialOwnerUpdatePreflight(record, input) {
  const checked = inspection(record);
  const { binding: liveBinding, state, configuration: config, priorV10, candidateDefinition, planBytes } =
    data(input, ['binding', 'state', 'configuration', 'priorV10', 'candidateDefinition', 'planBytes']);
  if (!same(binding(liveBinding), checked.binding) || !same(snapshot(state), checked.before)
    || !same(configuration(config), checked.configuration)) fail('STATE_OR_CONFIG_CHANGED');
  const policy = comparePtrUpdateDefinitions({ priorServerSchema: priorV10, candidateArtifactDefinition: candidateDefinition });
  if (!same(policy, checked.preservation)) fail('DEFINITION_CHANGED');
  const plan = parseExistingUpdatePlan(planBytes, PTR_INITIAL_OWNER_UPDATE_TARGET, checked.before.program, checked.binding.candidateProgram);
  if (!same(plan, checked.plan)) fail('PLAN_CHANGED');
  return Object.freeze({ inspectionDigest: checked.inspectionDigest, exactPreflightObserved: true, productionAuthorized: false });
}

/** Read-only reconciliation. A predecessor still installed is unresolved, never permission to resubmit. */
export function classifyPtrInitialOwnerUpdateObservation(record, input) {
  const checked = inspection(record);
  const { state: rawState, configuration: rawConfig, installedV10 } = data(input, ['state', 'configuration', 'installedV10']);
  const state = snapshot(rawState), config = configuration(rawConfig), installed = parsePtrUpdateDefinition(installedV10);
  assertNames(state, tableNames(installed));
  const flags = { productionAuthorized: false, globalReleaseAuthority: false, ownerAuthTokenVerified: false,
    retryAuthorized: false, atomicDatabaseSnapshot: false };
  if (state.program === checked.before.program) {
    if (!same(state, checked.before) || !same(config, checked.configuration)
      || installed.fullDigest !== checked.preservation.priorDigest) fail('PREDECESSOR_STATE_CHANGED');
    return Object.freeze({ ...flags, outcome: 'not-observed-applied', submissionOutcome: 'uncertain' });
  }
  if (state.program !== checked.binding.candidateProgram || installed.fullDigest !== checked.binding.candidateDescriptionDigest
    || !same(config, checked.configuration) || !same(state.owner, checked.before.owner) || !same(state.atlas, checked.before.atlas)
    || !same(state.tables.map(table => table.name), checked.candidateTableNames)) fail('INSTALLED_STATE_CONFLICT');
  const old = new Map(checked.before.tables.map(table => [table.name, table]));
  for (const table of state.tables) {
    const previous = old.get(table.name);
    if (previous ? !same(previous, table) : (table.count !== 0 || table.rowsDigest !== updateDigest([]))) fail('ROWS_NOT_PRESERVED');
    old.delete(table.name);
  }
  if (old.size) fail('ROWS_NOT_PRESERVED');
  return Object.freeze({ ...flags, outcome: 'observed-preserved-candidate', installedStateDigest: updateDigest(state),
    currentConfigurationDigest: config === null ? null : updateDigest(config),
    privateConfigurationPreservationObserved: config !== null, candidateProgram: state.program, usableOwnerPtrVerified: false });
}
