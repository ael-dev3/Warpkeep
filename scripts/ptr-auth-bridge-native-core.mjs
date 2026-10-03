// Scoped initial-PTR Worker protocol. This module grants no production/source authority.
import { createHash } from 'node:crypto';

export const PTR_BRIDGE_ACCOUNT = 'c647739b4535010b0b13e6fc296e2c4e';
export const PTR_BRIDGE_WORKER = 'warpkeep-auth-bridge';
export const PTR_BRIDGE_DATABASE = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
export const PTR_BRIDGE_PROFILE = 'warpkeep-ptr-auth-bridge-native-v1';
export const PTR_BRIDGE_LATEST_UPLOAD_PATH = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts/${PTR_BRIDGE_WORKER}/versions?page=1&per_page=1`;
const ALPHA = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA = /^[a-f0-9]{64}$/u, COMMIT = /^[a-f0-9]{40}$/u;
const SECRETS = ['ADMIN_TOKEN_SECRET', 'FARCASTER_RPC_URL', 'FARCASTER_RPC_URL_SECONDARY',
  'NOTIFICATION_OPERATOR_SECRET', 'SESSION_COOKIE_KEY', 'SIGNING_KEY_JWK'];
const OBJECTS = { ADMISSION_NOTIFICATIONS: 'AdmissionNotification', AUTH_RATE_LIMITER: 'AuthRateLimiter',
  CHALLENGE_REPLAY_GUARD: 'ChallengeReplayGuard', QA_CHALLENGE_REPLAY_GUARD: 'QaChallengeReplayGuard', SESSION_FAMILIES: 'SessionFamily' };
const CHANGED = new Set(['PTR_ENABLED', 'PTR_OIDC_AUDIENCE', 'PTR_SPACETIMEDB_DATABASE', 'PLAYER_CANARY_OWNER_FID',
  'WARPKEEP_BRIDGE_SOURCE_COMMIT', 'CF_VERSION_METADATA']);
export class PtrNativeBridgeError extends Error {
  constructor(code) { super(`PTR_NATIVE_BRIDGE_${code}`); this.name = 'PtrNativeBridgeError'; this.code = this.message; }
}
const fail = code => { throw new PtrNativeBridgeError(code); };
export const bridgeCanonical = value => JSON.stringify(value, (_key, item) => item !== null && typeof item === 'object'
  && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const bridgeDigest = value => createHash('sha256').update(bridgeCanonical(value)).digest('hex');
// Exact maintained multipart-v1 inventory algorithm; boundaries and metadata are excluded.
export function bridgeModuleDigest(modules) {
  const hash = createHash('sha256').update('warpkeep-auth-bridge-wrangler-multipart-v1\n');
  const ordered = [...modules].sort((a, b) => a.field.localeCompare(b.field, 'en') || a.name.localeCompare(b.name, 'en')
    || a.contentType.localeCompare(b.contentType, 'en'));
  for (const item of ordered) hash.update(`${JSON.stringify({ field: item.field, name: item.name,
    contentType: item.contentType, size: item.size, sha256: item.sha256 })}\n`);
  return hash.digest('hex');
}
const same = (a, b) => bridgeCanonical(a) === bridgeCanonical(b);
const sorted = values => [...values].sort((a, b) => a.name.localeCompare(b.name, 'en'));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeBridgeBinding(binding) {
  if (!record(binding) || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(binding.name ?? '')) fail('BINDING_INVALID');
  const keys = Object.keys(binding).sort().join(',');
  if (binding.type === 'plain_text' && keys === 'name,text,type' && typeof binding.text === 'string'
    && binding.text.length <= 4096 && !/[\u0000-\u001f\u007f]/u.test(binding.text)) return { name: binding.name, type: binding.type, text: binding.text };
  if (binding.type === 'secret_text' && keys === 'name,type') return { name: binding.name, type: binding.type };
  if (binding.type === 'version_metadata' && keys === 'name,type' && binding.name === 'CF_VERSION_METADATA') return { name: binding.name, type: binding.type };
  if (binding.type === 'durable_object_namespace' && keys === 'class_name,name,namespace_id,type'
    && OBJECTS[binding.name] === binding.class_name && /^[a-f0-9]{32}$/u.test(binding.namespace_id ?? '')) return {
    name: binding.name, type: binding.type, class_name: binding.class_name, namespace_id: binding.namespace_id };
  fail('BINDING_INVALID');
}

export function validateBridgeSnapshot(snapshot) {
  if (!record(snapshot) || snapshot.accountId !== PTR_BRIDGE_ACCOUNT || snapshot.workerName !== PTR_BRIDGE_WORKER
    || !UUID.test(snapshot.deploymentId ?? '') || !UUID.test(snapshot.versionId ?? '')
    || !Number.isSafeInteger(snapshot.versionNumber) || snapshot.versionNumber < 1
    || !SHA.test(snapshot.sourceDigest ?? '') || !Array.isArray(snapshot.bindings) || snapshot.bindings.length > 64
    || snapshot.compatibilityDate !== '2026-07-11' || !same(snapshot.compatibilityFlags, ['nodejs_compat'])
    || snapshot.migrationTag !== 'v5' || ![undefined, 'standard'].includes(snapshot.usageModel)
    || !same(snapshot.subdomain, { enabled: false, previews_enabled: false })
    || !Array.isArray(snapshot.routes) || snapshot.routes.length !== 0
    || !Array.isArray(snapshot.domains) || snapshot.domains.length !== 1
    || snapshot.domains[0]?.hostname !== 'auth.warpkeep.com' || snapshot.domains[0]?.service !== PTR_BRIDGE_WORKER
    || ![undefined, null, 'production'].includes(snapshot.domains[0]?.environment)
    || snapshot.domains[0]?.enabled !== true || snapshot.domains[0]?.previews_enabled !== false
    || !/^[a-f0-9]{32}$/u.test(snapshot.domains[0]?.zone_id ?? '')) fail('SNAPSHOT_INVALID');
  const settings = snapshot.settings;
  if (!record(settings) || Object.keys(settings).some(key => !['logpush', 'observability', 'tags', 'tail_consumers'].includes(key))
    || ![undefined, false].includes(settings.logpush)
    || (settings.observability != null && (!record(settings.observability) || settings.observability.enabled !== false
      || Object.keys(settings.observability).some(key => key !== 'enabled')))
    || ['tags', 'tail_consumers'].some(key => settings[key] != null && (!Array.isArray(settings[key]) || settings[key].length))) fail('SCRIPT_SETTINGS_UNSUPPORTED');
  const cache = snapshot.cacheOptions;
  // A missing provider field is unobserved; only an actually present disabled object is supported.
  if (Object.hasOwn(snapshot, 'cacheOptions') && (!record(cache) || cache.enabled !== false
    || (cache.cross_version_cache !== undefined && typeof cache.cross_version_cache !== 'boolean')
    || Object.keys(cache).some(key => !['enabled', 'cross_version_cache'].includes(key)))) fail('CACHE_SETTINGS_UNSUPPORTED');
  const bindings = sorted(snapshot.bindings.map(normalizeBridgeBinding));
  if (new Set(bindings.map(b => b.name)).size !== bindings.length) fail('DUPLICATE_BINDING');
  const byName = new Map(bindings.map(b => [b.name, b]));
  for (const name of SECRETS) if (byName.get(name)?.type !== 'secret_text') fail('ESTABLISHED_SECRET_MISSING');
  for (const [name, className] of Object.entries(OBJECTS)) if (byName.get(name)?.type !== 'durable_object_namespace'
    || byName.get(name).class_name !== className) fail('ESTABLISHED_OBJECT_MISSING');
  if (bindings.filter(b => b.type === 'durable_object_namespace').length !== 5) fail('EXTRA_OBJECT');
  for (const [name, value] of Object.entries({ ENVIRONMENT: 'production', ISSUER: 'https://auth.warpkeep.com',
    ALLOWED_ORIGINS: 'https://warpkeep.com', FARCASTER_DOMAIN: 'warpkeep.com', FARCASTER_SIWE_URI: 'https://warpkeep.com/',
    OIDC_AUDIENCE: 'warpkeep-spacetimedb', SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com', SPACETIMEDB_DATABASE: ALPHA })) {
    if (byName.get(name)?.type !== 'plain_text' || byName.get(name).text !== value) fail('ALPHA_CONFIG_INVALID');
  }
  for (const name of ['PUBLIC_AUTH_ENABLED', 'ACCESS_EXPECTED_FID_REQUIRED', 'APPROVAL_NOTIFICATIONS_ENABLED', 'QA_OBSERVER_ENABLED']) {
    if (byName.get(name)?.type !== 'plain_text' || !['true', 'false'].includes(byName.get(name).text)) fail('MODE_INVALID');
  }
  return { ...snapshot, bindings };
}

export function createNativeBridgePlan({ source, before, modules, entrypoint, sourceDigest, toolchainDigest }) {
  const held = validateBridgeSnapshot(before);
  if (!record(source) || !COMMIT.test(source.sourceCommit ?? '') || !COMMIT.test(source.sourceTree ?? '')
    || !source.signerFingerprint?.startsWith('SHA256:') || !source.signerIdentity || !SHA.test(toolchainDigest ?? '')
    || !SHA.test(sourceDigest ?? '') || !Array.isArray(modules) || modules.length < 1 || modules.length > 256
    || !modules.some(module => module.name === entrypoint)) fail('PLAN_INVALID');
  if (new Set(modules.map(module => module.name)).size !== modules.length || modules.some(module =>
    !/^[A-Za-z0-9._/-]{1,512}$/u.test(module.name ?? '') || module.name.split('/').includes('..')
    || typeof module.field !== 'string' || typeof module.contentType !== 'string'
    || !SHA.test(module.sha256 ?? '') || !Number.isSafeInteger(module.size) || module.size < 1)) fail('MODULE_INVENTORY_INVALID');
  if (bridgeModuleDigest(modules) !== sourceDigest) fail('MODULE_DIGEST_INVALID');
  const bindings = sorted([...held.bindings.filter(binding => !CHANGED.has(binding.name)),
    { name: 'PTR_ENABLED', type: 'plain_text', text: 'true' },
    { name: 'PTR_OIDC_AUDIENCE', type: 'plain_text', text: 'warpkeep-ptr-spacetimedb' },
    { name: 'PTR_SPACETIMEDB_DATABASE', type: 'plain_text', text: PTR_BRIDGE_DATABASE },
    { name: 'PLAYER_CANARY_OWNER_FID', type: 'secret_text' },
    { name: 'WARPKEEP_BRIDGE_SOURCE_COMMIT', type: 'plain_text', text: source.sourceCommit },
    { name: 'CF_VERSION_METADATA', type: 'version_metadata' }]);
  const plan = { schemaVersion: 1, profile: PTR_BRIDGE_PROFILE, source, before: held, bindings,
    entrypoint, modules: [...modules].sort((a, b) => a.name.localeCompare(b.name, 'en')), sourceDigest, toolchainDigest,
    versionTag: `ptr-native-${source.sourceCommit}`, versionMessage: `Warpkeep initial owner PTR ${source.sourceCommit}` };
  return { ...plan, planDigest: bridgeDigest(plan) };
}

export function validateNativeBridgePlan(plan) {
  if (!record(plan)) fail('PLAN_INVALID');
  const expected = createNativeBridgePlan(plan);
  if (!same(plan, expected)) fail('PLAN_CHANGED');
  return plan;
}

export function assertNativeBridgeVersion(plan, snapshot, modules, entrypoint, annotations) {
  validateNativeBridgePlan(plan);
  const actual = validateBridgeSnapshot(snapshot);
  if (actual.versionNumber !== plan.before.versionNumber + 1 || actual.versionId === plan.before.versionId
    || !same(actual.bindings, plan.bindings) || actual.sourceDigest !== plan.sourceDigest
    || !same(actual.domains, plan.before.domains) || !same(actual.routes, plan.before.routes)
    || !same(actual.settings, plan.before.settings)
    || Object.hasOwn(actual, 'cacheOptions') !== Object.hasOwn(plan.before, 'cacheOptions')
    || !same(actual.cacheOptions, plan.before.cacheOptions)
    || !same(actual.subdomain, plan.before.subdomain) || !same(actual.compatibilityFlags, plan.before.compatibilityFlags)
    || actual.compatibilityDate !== plan.before.compatibilityDate || actual.migrationTag !== plan.before.migrationTag
    || actual.usageModel !== plan.before.usageModel || entrypoint !== plan.entrypoint
    || !same([...modules].sort((a, b) => a.name.localeCompare(b.name, 'en')), plan.modules)
    || annotations?.['workers/tag'] !== plan.versionTag || annotations?.['workers/message'] !== plan.versionMessage) fail('CANDIDATE_READBACK_CHANGED');
  return actual;
}

/** Validate genuine serializer metadata; replace type-wide secret retention with explicit version inheritance. */
export function bridgeRedactedMetadataDigest(metadata) {
  const bindings = metadata.bindings.map(binding => binding.name === 'PLAYER_CANARY_OWNER_FID'
    ? { name: binding.name, type: binding.type } : binding);
  return bridgeDigest({ ...metadata, bindings });
}

function normalizeOwnerFid(ownerFid) {
  if (typeof ownerFid !== 'string' || !/^[1-9][0-9]{0,15}$/u.test(ownerFid)
    || BigInt(ownerFid) > BigInt(Number.MAX_SAFE_INTEGER) || String(Number(ownerFid)) !== ownerFid) fail('OWNER_FID_INVALID');
  return ownerFid;
}

export function takeNativeBridgeOwnerFid(environment) {
  if (!record(environment)) fail('OWNER_FID_INVALID');
  const ownerFid = environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
  delete environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
  return normalizeOwnerFid(ownerFid);
}

export function projectNativeBridgeUploadMetadata(plan, metadata, ownerFid) {
  validateNativeBridgePlan(plan);
  normalizeOwnerFid(ownerFid);
  const allowed = ['main_module', 'bindings', 'compatibility_date', 'compatibility_flags', 'keep_bindings',
    'annotations', 'package_dependencies', 'cache_options'];
  if (!record(metadata) || Object.keys(metadata).some(key => !allowed.includes(key))
    || metadata.main_module !== plan.entrypoint || !Array.isArray(metadata.bindings)
    || metadata.compatibility_date !== plan.before.compatibilityDate
    || !same(metadata.compatibility_flags, plan.before.compatibilityFlags)
    || !same(metadata.keep_bindings, ['secret_text', 'secret_key']) || metadata.migrations !== undefined
    || !same(metadata.annotations, { 'workers/tag': plan.versionTag, 'workers/message': plan.versionMessage })
    || (Object.hasOwn(metadata, 'cache_options') && (!Object.hasOwn(plan.before, 'cacheOptions')
      || !same(metadata.cache_options, plan.before.cacheOptions)))) fail('MULTIPART_METADATA_CHANGED');
  if (metadata.package_dependencies !== undefined && (!Array.isArray(metadata.package_dependencies)
    || metadata.package_dependencies.length > 1024 || metadata.package_dependencies.some(item => !record(item)
      || Object.keys(item).sort().join(',') !== 'installedVersion,name,packageJsonVersion'
      || Object.values(item).some(value => typeof value !== 'string' || value.length < 1 || value.length > 256
        || /[\u0000-\u001f\u007f]/u.test(value)))
    || new Set(metadata.package_dependencies.map(item => item.name)).size !== metadata.package_dependencies.length)) fail('MULTIPART_METADATA_CHANGED');
  const expected = plan.bindings.filter(binding => binding.type !== 'secret_text').map(binding => {
    const { namespace_id: _transportOnly, ...fromConfig } = binding; return fromConfig;
  });
  if (!same(sorted(metadata.bindings), sorted(expected))) fail('MULTIPART_BINDINGS_CHANGED');
  const bindings = sorted([...metadata.bindings.filter(binding => !CHANGED.has(binding.name)),
    ...plan.bindings.filter(binding => CHANGED.has(binding.name)).map(binding => binding.name === 'PLAYER_CANARY_OWNER_FID'
      ? { name: binding.name, type: 'secret_text', text: ownerFid } : binding),
    ...plan.before.bindings.filter(binding => binding.type === 'secret_text' && binding.name !== 'PLAYER_CANARY_OWNER_FID')
      .map(binding => ({ name: binding.name, type: 'inherit', version_id: plan.before.versionId }))]);
  const { keep_bindings: _typeWideInheritance, ...heldMetadata } = metadata;
  return { ...heldMetadata, bindings,
    ...(Object.hasOwn(plan.before, 'cacheOptions') ? { cache_options: plan.before.cacheOptions } : {}),
    annotations: { 'workers/tag': plan.versionTag, 'workers/message': plan.versionMessage } };
}

export function assertNativeBridgeLatestUpload(result, resultInfo, versionId, versionNumber) {
  const items = Array.isArray(result) ? result : record(result) && Object.keys(result).join(',') === 'items' ? result.items : null;
  if (!Array.isArray(items) || items.length !== 1 || !record(items[0]) || items[0].id !== versionId
    || items[0].number !== versionNumber || !UUID.test(versionId ?? '') || !Number.isSafeInteger(versionNumber) || versionNumber < 1
    || (resultInfo !== undefined && (!record(resultInfo)
      || !['count,page,per_page,total_count', 'count,page,per_page,total_count,total_pages'].includes(Object.keys(resultInfo).sort().join(','))
      || resultInfo.count !== 1 || resultInfo.page !== 1 || resultInfo.per_page !== 1
      || !Number.isSafeInteger(resultInfo.total_count) || resultInfo.total_count < 1
      || (Object.hasOwn(resultInfo, 'total_pages') && resultInfo.total_pages !== resultInfo.total_count)))) fail('LATEST_UPLOAD_CHANGED');
}

export function persistNativeBridgeInspection(plan, journal) {
  validateNativeBridgePlan(plan);
  const target = bridgeDigest({ account: PTR_BRIDGE_ACCOUNT, worker: PTR_BRIDGE_WORKER, profile: PTR_BRIDGE_PROFILE });
  if (journal.present('submission', target)) fail('MARKED_RECONCILE_ONLY');
  if (journal.present('inspection', plan.planDigest)) {
    if (!same(validateNativeBridgePlan(journal.read('inspection', plan.planDigest).value), plan)) fail('INSPECTION_CHANGED');
    return { reused: true };
  }
  journal.write('inspection', plan.planDigest, plan); return { reused: false };
}

// Caller supplies genuinely authenticated IO; pure tests exercise protocol only.
// A retained marker never authorizes retry of its corresponding provider mutation.
export async function runNativeBridgeProtocol({ command, plan, journal, assertSource, observeBefore, preflight, upload, findCandidate, release, observeAfter }) {
  validateNativeBridgePlan(plan);
  if (!['deploy', 'release', 'reconcile'].includes(command)) fail('COMMAND_INVALID');
  const target = bridgeDigest({ account: PTR_BRIDGE_ACCOUNT, worker: PTR_BRIDGE_WORKER, profile: PTR_BRIDGE_PROFILE });
  const uploadKey = target, releaseKey = bridgeDigest({ target, phase: 'release' });
  const assertMarker = key => {
    if (!journal.present('submission', key)) return false;
    const held = journal.read('submission', key).value;
    if (!same(held, { planDigest: plan.planDigest, source: plan.source })) fail('MARKER_PLAN_CHANGED');
    return true;
  };
  const uploadMarked = assertMarker(uploadKey), releaseMarked = assertMarker(releaseKey);
  if ((command === 'deploy' && (uploadMarked || releaseMarked)) || (command === 'release' && releaseMarked)) fail('MARKED_RECONCILE_ONLY');
  if (command !== 'deploy' && !uploadMarked) fail('UPLOAD_NOT_MARKED');
  assertSource();
  let candidate;
  if (command === 'deploy') {
    if (!same(await observeBefore(), plan.before)) fail('PREDECESSOR_CHANGED');
    await preflight(plan, null); assertSource();
    assertSource(); journal.write('submission', uploadKey, { planDigest: plan.planDigest, source: plan.source });
    assertSource();
    candidate = await upload(plan);
  } else candidate = await findCandidate(plan); // read-only, never rebuild/reupload.
  assertSource();
  if (!candidate) return { outcome: 'upload-unresolved', mutationRetried: false, planDigest: plan.planDigest };
  if (!UUID.test(candidate.versionId ?? '')) fail('CANDIDATE_INVALID');
  if (command === 'reconcile') {
    const after = await observeAfter(plan, candidate);
    assertSource();
    return { outcome: after.deployed ? 'deployed-observed' : 'uploaded-not-deployed', mutationRetried: false,
      planDigest: plan.planDigest, versionId: candidate.versionId, observation: after };
  }
  if (!same(await observeBefore(), plan.before)) fail('PREDECESSOR_CHANGED');
  await preflight(plan, candidate); assertSource();
  assertSource(); journal.write('submission', releaseKey, { planDigest: plan.planDigest, source: plan.source });
  assertSource(); await release(plan, candidate);
  const after = await observeAfter(plan, candidate);
  assertSource();
  if (!after.deployed) fail('DEPLOYMENT_NOT_OBSERVED');
  return { outcome: 'deployed-observed', mutationRetried: false, planDigest: plan.planDigest,
    versionId: candidate.versionId, observation: after };
}
