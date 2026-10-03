// Native initial-PTR bridge operation. No hosted permit/receipt is synthesized.
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants, closeSync, existsSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, realpathSync, rmSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { capturePtrInitialOwnerSource, type PtrInitialOwnerSource } from './ptr-initial-owner-operator';
import { openPtrInitialOwnerUpdateJournal } from './ptr-initial-owner-update-operator';
import { assertProductionAdminTrustedAncestors, defaultProductionAdminStateDirectory,
  ensureCanonicalProductionAdminStateDirectory } from './production-admin-token-budget.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { verifyAuthBridgeNotificationPreparedInstalledToolchain } from './auth-bridge-notification-prepared-installed-toolchain.mjs';
import { authBridgeNotificationPreparedSourceDigest, inspectAuthBridgeNotificationPreparedMultipart,
  parseAuthBridgeNotificationPreparedMultipart } from './auth-bridge-notification-prepared-cloudflare-runtime.mjs';
import { verifyAuthBridgeRpcRoleAttestation } from './auth-bridge-config-attestation.mjs';
import { takePtrProductionAdminSecret } from './ptr-production-admin-token';
import { PTR_BRIDGE_ACCOUNT, PTR_BRIDGE_WORKER, PTR_BRIDGE_DATABASE, PTR_BRIDGE_PROFILE,
  PtrNativeBridgeError, bridgeCanonical, bridgeDigest, createNativeBridgePlan, validateNativeBridgePlan,
  validateBridgeSnapshot, assertNativeBridgeVersion, runNativeBridgeProtocol, projectNativeBridgeUploadMetadata,
  bridgeRedactedMetadataDigest, takeNativeBridgeOwnerFid,
  assertNativeBridgeLatestUpload, persistNativeBridgeInspection, PTR_BRIDGE_LATEST_UPLOAD_PATH, type NativeBridgePlan } from './ptr-auth-bridge-native-core.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const API = 'https://api.cloudflare.com/client/v4';
const BASE = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts/${PTR_BRIDGE_WORKER}`;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const fail: (code: string) => never = code => { throw new PtrNativeBridgeError(code); };
type Command = 'deploy' | 'release' | 'reconcile';
type Data = Record<string, any>;

// Reuse existing exclusive, held-directory, fsynced journal storage. Distinct root prevents backend marker collision.
function openJournal(create: boolean) {
  const parent = create ? ensureCanonicalProductionAdminStateDirectory() : defaultProductionAdminStateDirectory();
  assertProductionAdminTrustedAncestors(parent);
  const root = join(parent, 'ptr-auth-bridge-native-v1');
  if (create && !existsSync(root)) mkdirSync(root, { mode: 0o700 });
  const store = openPtrInitialOwnerUpdateJournal(root, create);
  const home = dirname(dirname(dirname(parent)));
  if (parent !== join(home, '.warpkeep', 'private', 'production-admin-v1')) fail('JOURNAL_PARENT_INVALID');
  const directories = [join(root, 'ptr-initial-owner-updates-v1'), root, parent, dirname(parent), dirname(dirname(parent)), home];
  const identity = (path: string) => {
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.uid !== 1000n
      || (path === home ? (stat.mode & 0o022n) !== 0n : (stat.mode & 0o7777n) !== 0o700n)) fail('JOURNAL_ANCESTOR_INVALID');
    return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.uid}:${stat.gid}`;
  };
  const held = directories.map(path => ({ path, identity: identity(path) }));
  for (const fact of held) {
    const fd = openSync(fact.path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd, { bigint: true });
      if (`${stat.dev}:${stat.ino}:${stat.mode}:${stat.uid}:${stat.gid}` !== fact.identity) fail('JOURNAL_ANCESTOR_CHANGED');
      if (create) fsyncSync(fd);
    } finally { closeSync(fd); }
  }
  const assert = () => { store.assert(); if (held.some(fact => identity(fact.path) !== fact.identity)) fail('JOURNAL_ANCESTOR_CHANGED'); };
  assert(); return { ...store, assert };
}

/** Parse actual fixed-endpoint envelopes; this does not authenticate result contents or authorize a mutation. */
export function parsePtrNativeBridgeResponseEnvelope(value: unknown, path: string, method = 'GET') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('RESPONSE_ENVELOPE');
  const envelope = value as Data;
  const observedDomainNullLists = method === 'GET'
    && path === `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/domains?service=${PTR_BRIDGE_WORKER}`
    && envelope.errors === null && envelope.messages === null;
  const emptyArrayLists = Array.isArray(envelope.errors) && envelope.errors.length === 0
    && Array.isArray(envelope.messages) && envelope.messages.length === 0;
  if (envelope.success !== true || !Object.hasOwn(envelope, 'result')
    || (!emptyArrayLists && !observedDomainNullLists)) fail('RESPONSE_ENVELOPE');
  return { result: envelope.result, resultInfo: envelope.result_info };
}
function apiClient(token: string, assert: () => void) {
  if (!/^\S{20,4096}$/u.test(token)) fail('CREDENTIAL_INVALID');
  const request = async (path: string, options: { method?: string; body?: Uint8Array | string; contentType?: string } = {}) => {
    if (!path.startsWith(`/accounts/${PTR_BRIDGE_ACCOUNT}/workers/`) || /\.\.|\\|[\r\n]/u.test(path)) fail('REQUEST_PATH_INVALID');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
    const chunks: Buffer[] = []; let size = 0;
    try {
      assert();
      const response = await fetch(`${API}${path}`, { method: options.method ?? 'GET', redirect: 'error', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: controller.signal, body: options.body as BodyInit | undefined,
        headers: { authorization: `Bearer ${token}`, accept: '*/*', ...(options.contentType ? { 'content-type': options.contentType } : {}) } });
      if (response.url !== `${API}${path}` || response.redirected || !response.body) fail('RESPONSE_INVALID');
      if (response.status !== 200) fail(`HTTP_${response.status}_${options.method ? 'MUTATION_OUTCOME_UNRESOLVED' : 'READ_FAILED'}`);
      const reader = response.body.getReader();
      try { for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 16 * 1024 * 1024) { controller.abort(); fail('RESPONSE_BOUND'); }
        chunks.push(Buffer.from(value));
      } } finally { try { await reader.cancel(); } catch { /* original bounded failure retained */ } reader.releaseLock(); }
      assert(); return { body: Buffer.concat(chunks), contentType: response.headers.get('content-type') ?? '',
        entrypoint: response.headers.get('cf-entrypoint') };
    } catch (error) {
      if (error instanceof PtrNativeBridgeError) throw error;
      fail(options.method ? 'MUTATION_OUTCOME_UNRESOLVED' : 'READ_FAILED');
    } finally { clearTimeout(timer); for (const chunk of chunks) chunk.fill(0); }
  };
  const json = async (path: string, options?: Parameters<typeof request>[1]) => {
    const response = await request(path, options);
    try {
      if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.contentType)) fail('RESPONSE_TYPE');
      const value = JSON.parse(response.body.toString('utf8'));
      return parsePtrNativeBridgeResponseEnvelope(value, path, options?.method ?? 'GET');
    } finally { response.body.fill(0); }
  };
  return { request, json, dispose() { token = ''; } };
}

function moduleFacts(parts: readonly Data[]) {
  return parts.map(part => ({ field: part.field, name: part.name, contentType: part.contentType,
    size: part.bytes.length, sha256: hash(part.bytes) })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
function deployment(result: Data) {
  const list = Array.isArray(result) ? result : result?.deployments;
  const first = list?.[0];
  if (!UUID.test(first?.id ?? '') || first.strategy !== 'percentage' || first.versions?.length !== 1
    || !UUID.test(first.versions[0]?.version_id ?? '') || first.versions[0]?.percentage !== 100) fail('DEPLOYMENT_INVALID');
  return { deploymentId: first.id as string, versionId: first.versions[0].version_id as string };
}
function serializeMultipart(metadata: Data, modules: readonly Data[]) {
  const boundary = `warpkeep-ptr-${randomBytes(18).toString('hex')}`;
  const pieces = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`)];
  for (const part of modules) {
    if (![part.name, part.field].every(value => /^[A-Za-z0-9._/-]{1,512}$/u.test(value))
      || !/^[a-zA-Z0-9.+/-]+$/u.test(part.contentType)) fail('MODULE_HEADER_INVALID');
    pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.field}"; filename="${part.name}"\r\nContent-Type: ${part.contentType}\r\n\r\n`), part.bytes, Buffer.from('\r\n'));
  }
  pieces.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(pieces), contentType: `multipart/form-data; boundary=${boundary}` };
}

export async function executePtrNativeBridge(input: { command: Command; source: PtrInitialOwnerSource;
  environment: NodeJS.ProcessEnv; inspectionDigest?: string }) {
  // The managed owner identifier leaves the environment before any child process is started.
  // It exists only in this invocation's upload metadata; no plan or journal contains its value.
  let ownerFid: string | null = null;
  if (input.command === 'deploy') {
    try { ownerFid = takeNativeBridgeOwnerFid(input.environment); }
    catch { fail('OWNER_FID_INVALID'); }
  } else delete input.environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
    || process.env.WARPKEEP_AUTH_BRIDGE_PREPARED_INSTALLED_TOOLCHAIN_PROFILE !== 'linux-x64') fail('PLATFORM_INVALID');
  if (!['deploy', 'release', 'reconcile'].includes(input.command) || (input.command === 'deploy'
    ? input.inspectionDigest !== undefined : !/^[a-f0-9]{64}$/u.test(input.inspectionDigest ?? ''))) fail('ARGUMENT_INVALID');
  const source = capturePtrInitialOwnerSource(ROOT, input.source);
  const wrangler = join(ROOT, 'services/auth-bridge/node_modules/wrangler/bin/wrangler.js');
  const tools = verifyAuthBridgeNotificationPreparedInstalledToolchain({ repositoryRoot: ROOT, wranglerEntrypoint: wrangler });
  let token = input.environment.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN ?? '';
  delete input.environment.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN;
  let admin: string | undefined;
  try { admin = takePtrProductionAdminSecret(input.environment); } catch { admin = undefined; }
  delete input.environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  const journal = openJournal(input.command === 'deploy');
  const assert = () => { source.assert(); journal.assert(); };
  const assertTools = () => {
    assert();
    const current = verifyAuthBridgeNotificationPreparedInstalledToolchain({ repositoryRoot: ROOT, wranglerEntrypoint: wrangler });
    if (bridgeCanonical(current) !== bridgeCanonical(tools)) fail('TOOLCHAIN_CHANGED');
  };
  const api = apiClient(token, assert); token = '';
  let plan: NativeBridgePlan | undefined, uploadBody: Buffer | undefined, contentType: string | undefined,
    result: Data | null = null, error: string | null = null, sourcePreserved = false, redactedMetadataDigest: string | null = null;
  const infrastructure = async () => {
    const [domains, routes, subdomain, settings, scripts] = await Promise.all([
      api.json(`/accounts/${PTR_BRIDGE_ACCOUNT}/workers/domains?service=${PTR_BRIDGE_WORKER}`),
      api.json(`/accounts/${PTR_BRIDGE_ACCOUNT}/workers/services/${PTR_BRIDGE_WORKER}/environments/production/routes?show_zonename=true`),
      api.json(`${BASE}/subdomain`), api.json(`${BASE}/script-settings`),
      api.json(`/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts`) ]);
    if (!Array.isArray(domains.result) || domains.result.length !== 1 || (domains.resultInfo?.total_count ?? 1) !== 1) fail('DOMAIN_INVENTORY_INVALID');
    if (!Array.isArray(scripts.result) || scripts.result.filter((script: Data) => script.id === PTR_BRIDGE_WORKER).length !== 1) fail('WORKER_INVENTORY_INVALID');
    const cacheOptions = scripts.result.find((script: Data) => script.id === PTR_BRIDGE_WORKER).cache_options;
    return { domains: domains.result, routes: routes.result, subdomain: subdomain.result, settings: settings.result,
      ...(cacheOptions === undefined ? {} : { cacheOptions }) };
  };
  const readVersion = async (versionId: string, deployed: { deploymentId: string; versionId: string }) => {
    if (!UUID.test(versionId)) fail('VERSION_ID_INVALID');
    const [detail, infra, content] = await Promise.all([api.json(`${BASE}/versions/${versionId}`), infrastructure(),
      api.request(`${BASE}/content/v2?version=${versionId}`)]);
    try {
      if (detail.result?.id !== versionId || !/^[a-f0-9]{64}$/u.test(detail.result?.resources?.script?.etag ?? '')
        || typeof content.entrypoint !== 'string') fail('VERSION_INVALID');
      const parsed = parseAuthBridgeNotificationPreparedMultipart(content.body, content.contentType);
      const metadata = parsed.filter(part => part.field === 'metadata');
      if (metadata.length > 1 || metadata.some(part => part.name !== 'metadata' || part.contentType !== 'application/json')) fail('VERSION_METADATA_INVALID');
      if (metadata.length) {
        let value: unknown; try { value = JSON.parse(metadata[0]!.bytes.toString('utf8')); } catch { fail('VERSION_METADATA_INVALID'); }
        if (value === null || typeof value !== 'object' || Array.isArray(value)
          || (value as Data).main_module !== content.entrypoint) fail('VERSION_METADATA_INVALID');
      }
      const parts = parsed.filter(part => part.field !== 'metadata');
      const runtime = detail.result.resources.script_runtime;
      const snapshot = validateBridgeSnapshot({ accountId: PTR_BRIDGE_ACCOUNT, workerName: PTR_BRIDGE_WORKER, ...deployed,
        versionId, versionNumber: detail.result.number, sourceDigest: authBridgeNotificationPreparedSourceDigest(parts),
        bindings: detail.result.resources.bindings, compatibilityDate: runtime.compatibility_date,
        compatibilityFlags: runtime.compatibility_flags, migrationTag: runtime.migration_tag, usageModel: runtime.usage_model, ...infra });
      return { snapshot, modules: moduleFacts(parts), entrypoint: content.entrypoint, annotations: detail.result.annotations };
    } finally { content.body.fill(0); }
  };
  const observeBefore = async () => {
    const current = deployment((await api.json(`${BASE}/deployments`)).result);
    const version = await readVersion(current.versionId, current);
    return version.snapshot;
  };
  const assertLatestVersion = async (versionId: string, versionNumber: number) => {
    const latest = await api.json(PTR_BRIDGE_LATEST_UPLOAD_PATH);
    assertNativeBridgeLatestUpload(latest.result, latest.resultInfo, versionId, versionNumber);
  };
  const candidate = async (value: NativeBridgePlan, versionId: string) => {
    const read = await readVersion(versionId, { deploymentId: value.before.deploymentId, versionId });
    assertNativeBridgeVersion(value, read.snapshot, read.modules, read.entrypoint, read.annotations);
    return { versionId };
  };
  try {
    if (input.command === 'deploy') {
      const before = await observeBefore(); assert();
      const directory = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-ptr-worker-'));
      try {
        // Same credential-free pinned Wrangler serialization as the maintained prepared route; no install or upload.
        const variables = before.bindings.filter((b: Data) => b.type === 'plain_text').map((b: Data) => [b.name, b.text]);
        const vars = Object.fromEntries([...variables, ['PTR_ENABLED', 'true'], ['PTR_OIDC_AUDIENCE', 'warpkeep-ptr-spacetimedb'],
          ['PTR_SPACETIMEDB_DATABASE', PTR_BRIDGE_DATABASE], ['WARPKEEP_BRIDGE_SOURCE_COMMIT', input.source.sourceCommit]]);
        const outfile = join(directory, 'worker.multipart');
        const args = [realpathSync(wrangler), 'versions', 'upload', 'src/index.ts', '--config', 'wrangler.toml', '--name', PTR_BRIDGE_WORKER,
          '--tag', `ptr-native-${input.source.sourceCommit}`, '--message', `Warpkeep initial owner PTR ${input.source.sourceCommit}`,
          '--outfile', outfile, '--strict', '--dry-run', ...Object.entries(vars).sort().flatMap(([name, text]) => ['--var', `${name}:${text}`])];
        execFileSync(process.execPath, args, { cwd: join(ROOT, 'services/auth-bridge'), timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'], env: { CI: 'true', CLOUDFLARE_ACCOUNT_ID: PTR_BRIDGE_ACCOUNT, HOME: directory,
            LANG: 'C', LC_ALL: 'C', TZ: 'UTC', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'error',
            WRANGLER_LOG_SANITIZE: 'true', WRANGLER_OUTPUT_FILE_PATH: join(directory, 'wrangler.ndjson') } });
        assertTools();
        const file = readLocalBindingBoundedFile(outfile, { maximumBytes: 16 * 1024 * 1024, expectedUid: 1000 });
        try {
          const built = inspectAuthBridgeNotificationPreparedMultipart(file.body, `multipart/form-data; boundary=${file.body.toString('utf8', 2, file.body.indexOf('\r\n'))}`);
          if (typeof built.metadata.main_module !== 'string') fail('BUILT_ENTRYPOINT_INVALID');
          plan = createNativeBridgePlan({ source: input.source, before, entrypoint: built.metadata.main_module,
            modules: moduleFacts(built.modules), sourceDigest: built.sourceDigest, toolchainDigest: bridgeDigest(tools) });
          const metadata = projectNativeBridgeUploadMetadata(plan, built.metadata, ownerFid!);
          redactedMetadataDigest = bridgeRedactedMetadataDigest(metadata);
          const serialized = serializeMultipart(metadata, built.modules); uploadBody = serialized.body; contentType = serialized.contentType;
          persistNativeBridgeInspection(plan, journal);
        } finally { file.body.fill(0); }
      } finally { rmSync(directory, { recursive: true, force: true }); }
    } else {
      plan = validateNativeBridgePlan(journal.read('inspection', input.inspectionDigest!).value);
      if (plan.planDigest !== input.inspectionDigest || bridgeCanonical(plan.source) !== bridgeCanonical(input.source)
        || plan.toolchainDigest !== bridgeDigest(tools)) fail('INSPECTION_SOURCE_CHANGED');
    }
    const held = plan!;
    result = await runNativeBridgeProtocol({ command: input.command, plan: held, journal, assertSource: assert, observeBefore,
      preflight: async (_plan: NativeBridgePlan, version: { versionId: string } | null) => {
        await assertLatestVersion(version?.versionId ?? held.before.versionId,
          held.before.versionNumber + (version === null ? 0 : 1)); assertTools();
      },
      upload: async () => {
        await assertLatestVersion(held.before.versionId, held.before.versionNumber); assertTools();
        const response = await api.json(`${BASE}/versions?bindings_inherit=strict`, { method: 'POST', body: uploadBody!, contentType });
        return candidate(held, response.result?.id);
      },
      findCandidate: async () => {
        const matches: string[] = [], seen = new Set<string>();
        for (let page = 1; page <= 100; page++) {
          const response = await api.json(`${BASE}/versions?deployable=true&page=${page}&per_page=100`);
          const items = Array.isArray(response.result) ? response.result : response.result?.items;
          if (!Array.isArray(items) || items.length > 100) fail('VERSION_INVENTORY_INVALID');
          for (const item of items) {
            if (!UUID.test(item?.id ?? '') || seen.has(item.id)) fail('VERSION_INVENTORY_INVALID'); seen.add(item.id);
            if (item.annotations?.['workers/tag'] === held.versionTag) matches.push(item.id);
          }
          if (items.length < 100) break; if (page === 100) fail('VERSION_INVENTORY_BOUND');
        }
        if (matches.length > 1) fail('MULTIPLE_CANDIDATES');
        return matches.length ? candidate(held, matches[0]!) : null;
      },
      release: async (_value: Data, value: Data) => { await assertLatestVersion(value.versionId, held.before.versionNumber + 1); assertTools();
        await api.json(`${BASE}/deployments`, { method: 'POST', contentType: 'application/json',
        body: JSON.stringify({ strategy: 'percentage', versions: [{ percentage: 100, version_id: value.versionId }],
          annotations: { 'workers/message': held.versionMessage } }) }); },
      observeAfter: async (_value: Data, value: Data) => {
        const live = deployment((await api.json(`${BASE}/deployments`)).result);
        const read = await readVersion(value.versionId, live);
        assertNativeBridgeVersion(held, read.snapshot, read.modules, read.entrypoint, read.annotations);
        if (live.versionId !== value.versionId && bridgeCanonical(await observeBefore()) !== bridgeCanonical(held.before)) fail('LIVE_DEPLOYMENT_CHANGED');
        return { deployed: live.versionId === value.versionId, deploymentId: live.deploymentId, versionId: value.versionId,
          sourceDigest: read.snapshot.sourceDigest, bindingsDigest: bridgeDigest(read.snapshot.bindings), infrastructureHeld: true,
          publicAuthPreserved: true, expectedFidModePreserved: true, notificationsPreserved: true, establishedSecretsInherited: true };
      } });
  } catch (failure) { error = failure instanceof PtrNativeBridgeError ? failure.code : 'PTR_NATIVE_BRIDGE_FAILED'; }
  finally {
    ownerFid = null;
    uploadBody?.fill(0); api.dispose(); token = '';
    try { assertTools(); sourcePreserved = true; } catch { error ??= 'PTR_NATIVE_BRIDGE_SOURCE_OR_TOOLCHAIN_CHANGED'; }
  }
  let bridgeConfig: Data | null = null;
  if (result?.observation?.deployed && admin !== undefined) {
    try {
      source.assert(); const observed = await verifyAuthBridgeRpcRoleAttestation({ adminToken: admin }); source.assert();
      bridgeConfig = { observed: true, ptrEnabled: observed.ptrEnabled, ptrDatabaseMatches: observed.ptrSpacetimeDbDatabase === PTR_BRIDGE_DATABASE,
        roleAttestationDigest: observed.digest };
    } catch { bridgeConfig = { observed: false, error: 'PRIVATE_BRIDGE_CONFIGURATION_UNOBSERVED' }; }
  }
  admin = undefined;
  try { assertTools(); } catch { sourcePreserved = false; error ??= 'PTR_NATIVE_BRIDGE_SOURCE_OR_TOOLCHAIN_CHANGED'; }
  return { schemaVersion: 1, profile: PTR_BRIDGE_PROFILE, source: source.facts, command: input.command,
    inspectionDigest: plan?.planDigest ?? null, redactedMetadataDigest, result, error, sourcePreserved, bridgeConfig,
    cacheEvidence: { scope: 'explicit-upload-metadata-and-live-script-readback',
      uploadValue: redactedMetadataDigest === null ? null : plan?.before.cacheOptions ?? null,
      candidateVersionCacheObserved: false, candidateVersionCacheEquivalenceProven: false },
    commandSucceeded: error === null && sourcePreserved && result?.outcome === 'deployed-observed',
    ownerGameplayVerified: false, fullNativeAuthority: false, hostedWorkflowAuthority: false, globalReleaseAuthority: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2), values = new Map<string, string>();
    for (const argument of args) { const match = /^--(source|tree|signer|signer-identity|inspection|out)=(.+)$/u.exec(argument);
      if (!match || values.has(match[1]!)) fail('ARGUMENT_INVALID'); values.set(match[1]!, match[2]!); }
    if (!['deploy', 'release', 'reconcile'].includes(command ?? '') || ['source', 'tree', 'signer', 'signer-identity', 'out'].some(key => !values.has(key))) fail('ARGUMENT_INVALID');
    const output = resolve(values.get('out')!);
    if (dirname(output) !== join(ROOT, 'artifacts/qa') || !/^[A-Za-z0-9-]+\.json$/u.test(output.slice(dirname(output).length + 1))) fail('OUTPUT_PATH_INVALID');
    assertProductionAdminTrustedAncestors(dirname(output));
    const fd = openSync(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      fchmodSync(fd, 0o600); const reserved = fstatSync(fd, { bigint: true });
      const receipt = await executePtrNativeBridge({ command: command as Command, source: { sourceCommit: values.get('source')!,
        sourceTree: values.get('tree')!, signerFingerprint: values.get('signer')!, signerIdentity: values.get('signer-identity')! },
        environment: process.env, ...(values.has('inspection') ? { inspectionDigest: values.get('inspection')! } : {}) });
      const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`), byFd = fstatSync(fd, { bigint: true }), byPath = lstatSync(output, { bigint: true });
      if (bytes.length > 256 * 1024 || !reserved.isFile() || reserved.uid !== 1000n || reserved.nlink !== 1n || reserved.size !== 0n
        || byPath.isSymbolicLink() || ['dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink', 'mtimeNs', 'ctimeNs'].some(key =>
          byFd[key as keyof typeof byFd] !== reserved[key as keyof typeof reserved] || byPath[key as keyof typeof byPath] !== reserved[key as keyof typeof reserved])) fail('OUTPUT_CHANGED');
      for (let offset = 0; offset < bytes.length;) { const count = writeSync(fd, bytes, offset, bytes.length - offset); if (count < 1) fail('OUTPUT_WRITE'); offset += count; }
      fsyncSync(fd); if (!receipt.commandSucceeded) process.exitCode = 1;
      const finished = fstatSync(fd, { bigint: true });
      readLocalBindingBoundedFile(output, { maximumBytes: 256 * 1024, expectedMode: 0o600, expectedUid: 1000,
        expectedSha256: hash(bytes), expectedIdentity: { dev: String(finished.dev), ino: String(finished.ino), mode: String(finished.mode),
          uid: String(finished.uid), nlink: String(finished.nlink), size: String(finished.size), mtimeNs: String(finished.mtimeNs), ctimeNs: String(finished.ctimeNs) } }).body.fill(0);
      process.stdout.write(`${JSON.stringify({ path: output, sha256: hash(bytes), commandSucceeded: receipt.commandSucceeded })}\n`);
    } finally { closeSync(fd); }
  } catch (error) { process.stderr.write(`${error instanceof PtrNativeBridgeError ? error.code : 'PTR_NATIVE_BRIDGE_FAILED'}\n`); process.exitCode = 1; }
}
