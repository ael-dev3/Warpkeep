import { describe, expect, test } from 'vitest';
import { PTR_BRIDGE_ACCOUNT, PTR_BRIDGE_WORKER, PTR_BRIDGE_DATABASE, bridgeDigest, bridgeModuleDigest, createNativeBridgePlan,
  validateNativeBridgePlan, validateBridgeSnapshot, assertNativeBridgeVersion, runNativeBridgeProtocol,
  projectNativeBridgeUploadMetadata, bridgeRedactedMetadataDigest, takeNativeBridgeOwnerFid,
  assertNativeBridgeLatestUpload, persistNativeBridgeInspection, PTR_BRIDGE_LATEST_UPLOAD_PATH,
  type NativeBridgeSnapshot } from '../scripts/ptr-auth-bridge-native-core.mjs';

// Synthetic provider protocol fixtures only; no owner authentication or actual deployment is claimed.
const SYNTHETIC_OWNER_FID = '12345';
const before: NativeBridgeSnapshot = { accountId: PTR_BRIDGE_ACCOUNT, workerName: PTR_BRIDGE_WORKER,
  deploymentId: '11111111-1111-4111-8111-111111111111', versionId: '22222222-2222-4222-8222-222222222222', versionNumber: 51,
  sourceDigest: 'a'.repeat(64), compatibilityDate: '2026-07-11', compatibilityFlags: ['nodejs_compat'], migrationTag: 'v5', usageModel: 'standard',
  subdomain: { enabled: false, previews_enabled: false }, settings: { logpush: false, observability: { enabled: false }, tags: [], tail_consumers: [] },
  routes: [], cacheOptions: { enabled: false, cross_version_cache: false },
  domains: [{ hostname: 'auth.warpkeep.com', service: PTR_BRIDGE_WORKER, enabled: true, previews_enabled: false,
    environment: 'production', zone_id: 'b'.repeat(32), id: 'c'.repeat(32) }], bindings: [
    ...Object.entries({ ENVIRONMENT: 'production', ISSUER: 'https://auth.warpkeep.com', ALLOWED_ORIGINS: 'https://warpkeep.com',
      FARCASTER_DOMAIN: 'warpkeep.com', FARCASTER_SIWE_URI: 'https://warpkeep.com/', OIDC_AUDIENCE: 'warpkeep-spacetimedb',
      SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com', SPACETIMEDB_DATABASE: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      PUBLIC_AUTH_ENABLED: 'true', ACCESS_EXPECTED_FID_REQUIRED: 'true', APPROVAL_NOTIFICATIONS_ENABLED: 'true', QA_OBSERVER_ENABLED: 'false',
      GENESIS_002_SPACETIMEDB_DATABASE: 'f'.repeat(64), MINIAPP_NOTIFICATION_CLIENTS: '9152=https://api.farcaster.xyz/v1/frame-notifications' })
      .map(([name, text]) => ({ name, type: 'plain_text', text })),
    ...['ADMIN_TOKEN_SECRET', 'FARCASTER_RPC_URL', 'FARCASTER_RPC_URL_SECONDARY', 'NOTIFICATION_OPERATOR_SECRET', 'SESSION_COOKIE_KEY', 'SIGNING_KEY_JWK',
      'RELEASE_RECOVERY_RPC_SECRET'].map(name => ({ name, type: 'secret_text' })),
    ...Object.entries({ ADMISSION_NOTIFICATIONS: 'AdmissionNotification', AUTH_RATE_LIMITER: 'AuthRateLimiter', CHALLENGE_REPLAY_GUARD: 'ChallengeReplayGuard',
      QA_CHALLENGE_REPLAY_GUARD: 'QaChallengeReplayGuard', SESSION_FAMILIES: 'SessionFamily' }).map(([name, class_name], i) => ({ name,
        type: 'durable_object_namespace', class_name, namespace_id: String(i + 1).repeat(32) })) ] };
const modules = [{ field: 'index.js', name: 'index.js', contentType: 'application/javascript+module', size: 1234, sha256: 'd'.repeat(64) }];
const makePlan = () => createNativeBridgePlan({ source: { sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
  signerFingerprint: `SHA256:${'x'.repeat(43)}`, signerIdentity: 'reviewed@example.test' }, before, modules,
  entrypoint: 'index.js', sourceDigest: bridgeModuleDigest(modules), toolchainDigest: 'f'.repeat(64) });
const candidateId = '33333333-3333-4333-8333-333333333333';
const after = () => ({ ...before, versionId: candidateId, versionNumber: 52, bindings: makePlan().bindings, sourceDigest: bridgeModuleDigest(modules) });
function protocol() {
  const plan = makePlan(), records = new Map<string, unknown>(), events: string[] = [];
  const journal = { present: (_kind: string, key: string) => records.has(key), read: (_kind: string, key: string) => ({ value: records.get(key) }),
    write: (_kind: string, key: string, value: unknown) => { events.push('fsynced-marker'); if (records.has(key)) throw new Error('exclusive'); records.set(key, value); } };
  const input = { command: 'deploy' as const, plan, journal, assertSource: () => { events.push('source-held'); },
    observeBefore: async () => plan.before, upload: async () => { events.push('upload'); return { versionId: candidateId }; },
    preflight: async () => { events.push('preflight'); },
    findCandidate: async () => { events.push('read-only-find'); return { versionId: candidateId }; },
    release: async () => { events.push('release'); }, observeAfter: async () => ({ deployed: true }) };
  return { plan, records, events, input };
}

describe('scoped native PTR bridge protocol', () => {
  test('preserves Alpha, notification mode, established secrets, G002 values and exact DO namespaces', () => {
    const plan = makePlan(); validateNativeBridgePlan(plan);
    for (const name of ['PUBLIC_AUTH_ENABLED', 'ACCESS_EXPECTED_FID_REQUIRED', 'APPROVAL_NOTIFICATIONS_ENABLED', 'SPACETIMEDB_DATABASE',
      'GENESIS_002_SPACETIMEDB_DATABASE', 'RELEASE_RECOVERY_RPC_SECRET', 'SESSION_FAMILIES']) {
      expect(plan.bindings.find(b => b.name === name)).toEqual(before.bindings.find(b => b.name === name));
    }
    expect(plan.bindings.find(b => b.name === 'PTR_SPACETIMEDB_DATABASE')?.text).toBe(PTR_BRIDGE_DATABASE);
    expect(plan.bindings.find(b => b.name === 'PLAYER_CANARY_OWNER_FID')).toEqual({ name: 'PLAYER_CANARY_OWNER_FID', type: 'secret_text' });
  });
  test.each(['accountId', 'workerName', 'migrationTag'])('rejects redirected %s target or migration', key => {
    expect(() => validateBridgeSnapshot({ ...before, [key]: 'wrong' })).toThrow();
  });
  test('rejects missing established secret, duplicate binding and provider-exposed secret value', () => {
    expect(() => validateBridgeSnapshot({ ...before, bindings: before.bindings.filter(b => b.name !== 'SIGNING_KEY_JWK') })).toThrow();
    expect(() => validateBridgeSnapshot({ ...before, bindings: [...before.bindings, before.bindings[0]] })).toThrow();
    expect(() => validateBridgeSnapshot({ ...before, bindings: before.bindings.map(b => b.name === 'ADMIN_TOKEN_SECRET' ? { ...b, text: 'private' } : b) })).toThrow();
  });
  test('rejects altered authenticated plan even with a caller-recomputed digest', () => {
    const plan = makePlan(), altered = { ...plan, bindings: plan.bindings.filter(b => b.name !== 'SESSION_COOKIE_KEY') };
    const { planDigest: _discard, ...rest } = altered;
    expect(() => validateNativeBridgePlan({ ...altered, planDigest: bridgeDigest(rest) })).toThrow('PLAN_CHANGED');
  });
  test('requires actual candidate byte inventory and every preserved setting on readback', () => {
    const plan = makePlan(), annotations = { 'workers/tag': plan.versionTag, 'workers/message': plan.versionMessage };
    expect(assertNativeBridgeVersion(plan, after(), modules, 'index.js', annotations).versionId).toBe(candidateId);
    expect(() => assertNativeBridgeVersion(plan, { ...after(), bindings: after().bindings.map(b => b.name === 'APPROVAL_NOTIFICATIONS_ENABLED'
      ? { ...b, text: 'false' } : b) }, modules, 'index.js', annotations)).toThrow('CANDIDATE_READBACK_CHANGED');
    expect(() => assertNativeBridgeVersion(plan, after(), [{ ...modules[0]!, sha256: '0'.repeat(64) }], 'index.js', annotations)).toThrow();
    expect(() => assertNativeBridgeVersion(plan, { ...after(), domains: [{ ...before.domains[0], zone_id: '0'.repeat(32) }] }, modules, 'index.js', annotations)).toThrow();
  });
  test('writes separate exclusive durable markers before upload and release', async () => {
    const { input, events } = protocol(); expect((await runNativeBridgeProtocol(input)).outcome).toBe('deployed-observed');
    const effects = events.filter(event => event !== 'source-held'); expect(effects).toEqual(['preflight', 'fsynced-marker', 'upload', 'preflight', 'fsynced-marker', 'release']);
  });
  test('source/predecessor failure causes no marker or provider effect', async () => {
    const { input, records, events } = protocol();
    await expect(runNativeBridgeProtocol({ ...input, observeBefore: async () => ({ ...input.plan.before, versionNumber: 99 }) })).rejects.toThrow('PREDECESSOR_CHANGED');
    expect(records.size).toBe(0); expect(events).not.toContain('upload');
  });
  test('failed marker persistence prevents upload', async () => {
    const { input, events } = protocol();
    await expect(runNativeBridgeProtocol({ ...input, journal: { ...input.journal, write() { throw new Error('fsync'); } } })).rejects.toThrow('fsync');
    expect(events).not.toContain('upload');
  });
  test('lost upload ACK stays marked; reconcile observes only and never resubmits', async () => {
    const { input, records, events } = protocol();
    await expect(runNativeBridgeProtocol({ ...input, upload: async () => { throw new Error('lost ACK'); } })).rejects.toThrow('lost ACK');
    expect(records.size).toBe(1); await expect(runNativeBridgeProtocol(input)).rejects.toThrow('MARKED_RECONCILE_ONLY');
    expect((await runNativeBridgeProtocol({ ...input, command: 'reconcile', observeAfter: async () => ({ deployed: false }) })).outcome).toBe('uploaded-not-deployed');
    expect(events).not.toContain('upload'); expect(events).not.toContain('release');
  });
  test('lost deployment ACK permits read-only reconciliation but no second release', async () => {
    const { input, records, events } = protocol();
    await expect(runNativeBridgeProtocol({ ...input, release: async () => { throw new Error('lost ACK'); } })).rejects.toThrow('lost ACK');
    expect(records.size).toBe(2); await expect(runNativeBridgeProtocol({ ...input, command: 'release' })).rejects.toThrow('MARKED_RECONCILE_ONLY');
    const uploads = events.filter(e => e === 'upload').length;
    expect((await runNativeBridgeProtocol({ ...input, command: 'reconcile' })).outcome).toBe('deployed-observed');
    expect(events.filter(e => e === 'upload').length).toBe(uploads);
  });
  test('a marked but unobserved upload returns unresolved without a fake deployment', async () => {
    const { input } = protocol(); await expect(runNativeBridgeProtocol({ ...input, upload: async () => { throw new Error('lost'); } })).rejects.toThrow();
    expect(await runNativeBridgeProtocol({ ...input, command: 'reconcile', findCandidate: async () => null })).toEqual({ outcome: 'upload-unresolved',
      mutationRetried: false, planDigest: input.plan.planDigest });
  });
  test('rejects cross-source marker reuse', async () => {
    const { input, records } = protocol(); await expect(runNativeBridgeProtocol({ ...input, upload: async () => { throw new Error('lost'); } })).rejects.toThrow();
    for (const key of records.keys()) records.set(key, { planDigest: '0'.repeat(64), source: input.plan.source });
    await expect(runNativeBridgeProtocol({ ...input, command: 'reconcile' })).rejects.toThrow('MARKER_PLAN_CHANGED');
  });
  test('release continues a genuinely found upload without repeating upload', async () => {
    const { input, events } = protocol();
    await expect(runNativeBridgeProtocol({ ...input, upload: async () => { throw new Error('lost ACK'); } })).rejects.toThrow();
    expect((await runNativeBridgeProtocol({ ...input, command: 'release' })).outcome).toBe('deployed-observed');
    expect(events).not.toContain('upload'); expect(events.filter(event => event === 'release')).toHaveLength(1);
  });
  test('rejects an inventory-independent caller hash', () => {
    const plan = makePlan(); expect(() => createNativeBridgePlan({ ...plan, sourceDigest: '0'.repeat(64) })).toThrow('MODULE_DIGEST_INVALID');
  });
  test('rejects unsupported telemetry settings and preserves explicit disabled settings', () => {
    expect(makePlan().before.settings).toEqual(before.settings);
    expect(() => validateBridgeSnapshot({ ...before, settings: { logpush: true } })).toThrow('SCRIPT_SETTINGS_UNSUPPORTED');
    expect(() => validateBridgeSnapshot({ ...before, settings: { tail_consumers: [{ service: 'other' }] } })).toThrow();
  });
  test('compares provider object fields semantically while preserving actual values', () => {
    const plan = makePlan(), reordered = { ...before, domains: before.domains.map(domain => Object.fromEntries(Object.entries(domain).reverse())) };
    expect(createNativeBridgePlan({ ...plan, before: reordered })).toEqual(plan);
  });
  test('holds actual Worker cache settings and rejects cache admission or drift', () => {
    const plan = makePlan(), annotations = { 'workers/tag': plan.versionTag, 'workers/message': plan.versionMessage };
    expect(plan.before.cacheOptions).toEqual(before.cacheOptions);
    expect(() => validateBridgeSnapshot({ ...before, cacheOptions: { enabled: true } })).toThrow('CACHE_SETTINGS_UNSUPPORTED');
    expect(() => validateBridgeSnapshot({ ...before, cacheOptions: undefined })).toThrow('CACHE_SETTINGS_UNSUPPORTED');
    expect(() => assertNativeBridgeVersion(plan, { ...after(), cacheOptions: { enabled: false, cross_version_cache: true } },
      modules, 'index.js', annotations)).toThrow('CANDIDATE_READBACK_CHANGED');
  });
});

function metadata(plan = makePlan()) {
  return { main_module: plan.entrypoint, bindings: plan.bindings.filter(binding => binding.type !== 'secret_text').map(binding => {
    const { namespace_id: _actualProviderIdentity, ...configured } = binding; return configured;
  }), compatibility_date: plan.before.compatibilityDate, compatibility_flags: plan.before.compatibilityFlags,
  keep_bindings: ['secret_text', 'secret_key'], annotations: { 'workers/tag': plan.versionTag, 'workers/message': plan.versionMessage },
  cache_options: plan.before.cacheOptions,
  package_dependencies: [{ name: 'wrangler', packageJsonVersion: '4.110.0', installedVersion: '4.110.0' }] };
}
const project = (plan: ReturnType<typeof makePlan>, built: unknown, ownerFid = SYNTHETIC_OWNER_FID) =>
  projectNativeBridgeUploadMetadata(plan, built, ownerFid);

describe('genuine multipart metadata and pre-effect recovery', () => {
  test('consumes the managed-owner environment value and rejects invalid input', () => {
    const environment = { WARPKEEP_PLAYER_CANARY_OWNER_FID: SYNTHETIC_OWNER_FID };
    expect(takeNativeBridgeOwnerFid(environment)).toBe(SYNTHETIC_OWNER_FID);
    expect(environment).not.toHaveProperty('WARPKEEP_PLAYER_CANARY_OWNER_FID');
    for (const invalid of [undefined, '', '0', '0123', '+123', ' 123', '9007199254740992']) {
      const candidate = { WARPKEEP_PLAYER_CANARY_OWNER_FID: invalid };
      expect(() => takeNativeBridgeOwnerFid(candidate)).toThrow('PTR_NATIVE_BRIDGE_OWNER_FID_INVALID');
      expect(candidate).not.toHaveProperty('WARPKEEP_PLAYER_CANARY_OWNER_FID');
    }
  });
  test('keeps owner text transient while its receipt digest excludes the identifier', () => {
    const plan = makePlan(), built = metadata(plan);
    const first = project(plan, built, SYNTHETIC_OWNER_FID);
    const second = project(plan, built, '67890');
    expect(first.bindings).not.toEqual(second.bindings);
    expect(bridgeRedactedMetadataDigest(first)).toBe(bridgeRedactedMetadataDigest(second));
    expect(JSON.stringify(plan)).not.toContain(SYNTHETIC_OWNER_FID);
    expect(() => projectNativeBridgeUploadMetadata(plan, built, '')).toThrow('OWNER_FID_INVALID');
  });
  test('preserves genuine metadata except explicitly replaced type-wide inheritance and observed cache', () => {
    const plan = makePlan(), built = metadata(plan), projected = project(plan, built);
    const { bindings: _old, annotations: _oldAnnotations, keep_bindings: _typeWide, cache_options: _oldCache, ...held } = built;
    const { bindings: _new, annotations: _newAnnotations, cache_options: _newCache, ...actual } = projected;
    expect(actual).toEqual(held);
    expect((projected.bindings as any[]).filter(binding => binding.type === 'durable_object_namespace'))
      .toEqual(built.bindings.filter(binding => binding.type === 'durable_object_namespace'));
    expect(projected).not.toHaveProperty('migrations');
    expect(projected).not.toHaveProperty('keep_bindings');
    expect(projected.cache_options).toEqual(before.cacheOptions);
  });
  test('pins each existing secret inheritance to the exact observed predecessor version', () => {
    const plan = makePlan(), projected = project(plan, metadata(plan));
    const inherited = (projected.bindings as any[]).filter(binding => binding.type === 'inherit');
    expect(projected).not.toHaveProperty('keep_bindings');
    expect(inherited).toHaveLength(before.bindings.filter(binding => binding.type === 'secret_text').length);
    for (const binding of inherited) expect(binding).toEqual({ name: binding.name, type: 'inherit', version_id: before.versionId });
    expect((projected.bindings as any[]).find(binding => binding.name === 'PLAYER_CANARY_OWNER_FID'))
      .toEqual({ name: 'PLAYER_CANARY_OWNER_FID', type: 'secret_text', text: SYNTHETIC_OWNER_FID });
  });
  test('rejects the v1 missing keep_bindings subset and any newly introduced migration', () => {
    const plan = makePlan(), built = metadata(plan), { keep_bindings: _discarded, ...v1Subset } = built;
    expect(() => project(plan, v1Subset)).toThrow('MULTIPART_METADATA_CHANGED');
    expect(() => project(plan, { ...built, migrations: { new_tag: 'v6', steps: [] } })).toThrow();
  });
  test('rejects runtime, DO class, cache or unreviewed full-metadata drift before upload', () => {
    const plan = makePlan(), built = metadata(plan);
    expect(() => project(plan, { ...built, compatibility_date: '2026-08-01' })).toThrow();
    expect(() => project(plan, { ...built, bindings: built.bindings.map(binding => binding.type === 'durable_object_namespace'
      ? { ...binding, class_name: 'Other' } : binding) })).toThrow('MULTIPART_BINDINGS_CHANGED');
    expect(() => project(plan, { ...built, cache_options: { enabled: true } })).toThrow();
    expect(() => project(plan, { ...built, limits: { cpu_ms: 10_000 } })).toThrow();
  });
  test('explicitly uploads actual observed cache when Wrangler omits the optional field', () => {
    const plan = makePlan(), { cache_options: _notEmitted, ...built } = metadata(plan);
    expect(project(plan, built).cache_options).toEqual(before.cacheOptions);
    expect(() => createNativeBridgePlan({ ...plan, before: { ...before, cacheOptions: undefined } })).toThrow('CACHE_SETTINGS_UNSUPPORTED');
  });
  test('unfiltered newest nondeployable foreign upload refuses before marker or provider write', async () => {
    expect(PTR_BRIDGE_LATEST_UPLOAD_PATH).toBe(`/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts/${PTR_BRIDGE_WORKER}/versions?page=1&per_page=1`);
    const { input, records, events } = protocol();
    await expect(runNativeBridgeProtocol({ ...input, preflight: async () => assertNativeBridgeLatestUpload([
      { id: candidateId, number: before.versionNumber + 1, deployable: false }], undefined, before.versionId, before.versionNumber) }))
      .rejects.toThrow('LATEST_UPLOAD_CHANGED');
    expect(records.size).toBe(0); expect(events).not.toContain('upload'); expect(events).not.toContain('release');
  });
  test('pre-release failure leaves only genuine upload marked and does not consume release marker', async () => {
    const { input, records, events } = protocol();
    await expect(runNativeBridgeProtocol({ ...input, preflight: async (_plan, version) => {
      if (version) throw new Error('latest changed');
    } })).rejects.toThrow('latest changed');
    expect(records.size).toBe(1); expect(events.filter(event => event === 'upload')).toHaveLength(1); expect(events).not.toContain('release');
  });
  test('tool preflight failure leaves no submission marker and can be retried before any write', async () => {
    const { input, records, events } = protocol();
    await expect(runNativeBridgeProtocol({ ...input, preflight: async () => { throw new Error('tool changed'); } })).rejects.toThrow('tool changed');
    expect(records.size).toBe(0); expect(events).not.toContain('upload');
    expect((await runNativeBridgeProtocol(input)).outcome).toBe('deployed-observed');
  });
  test('crash after durable inspection but before submission can reuse exactly the same inspection', async () => {
    const { input, records } = protocol();
    expect(persistNativeBridgeInspection(input.plan, input.journal)).toEqual({ reused: false });
    expect(persistNativeBridgeInspection(input.plan, input.journal)).toEqual({ reused: true });
    expect(records.size).toBe(1);
    expect((await runNativeBridgeProtocol(input)).outcome).toBe('deployed-observed');
    expect(() => persistNativeBridgeInspection(input.plan, input.journal)).toThrow('MARKED_RECONCILE_ONLY');
  });
  test('mismatched inspection cannot be reused even when its filename/key remains held', () => {
    const { input, records } = protocol(); persistNativeBridgeInspection(input.plan, input.journal);
    records.set(input.plan.planDigest, { ...input.plan, toolchainDigest: '0'.repeat(64) });
    expect(() => persistNativeBridgeInspection(input.plan, input.journal)).toThrow();
  });
});
