import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbConnection } from '../../spacetimedb/ptr/generated-bindings';
import type { BridgeConfig } from '../../services/auth-bridge/src/config';
import { ptrAdminClaims, ptrAtlasAdminClaims, ptrOwnerClaims } from '../../services/auth-bridge/src/jwt';
import { createPtrRealmAuthClient, retirePtrRealmAuthority, type PtrRealmAuthority } from '../../src/ptr/ptrRealmAuthClient';
import { closePtrRealmConnectionSession, connectPtrRealm, createPtrGameplay04Capability,
  type PtrGameplay04Capability, type PtrRealmConnectionBuilder, type PtrRealmConnectionSession } from '../../src/ptr/ptrRealmConnection';
import { preflightPtrRealmView } from '../../src/ptr/ptrGreaterRealmBridge';
import { createGameplay04Controller, type Controller04 } from '../../src/ptr/gameplay04/createGameplay04Controller';
import { quoteBuilding04 } from '../../src/ptr/gameplay04/gameplay04Presentation';
import { Gameplay04ClientError } from '../../src/ptr/gameplay04/ptrGameplay04Errors';
import type { Mutation04, Target04 } from '../../src/ptr/gameplay04/ptrGameplay04Types';
import { createPtrGreaterRealmRuntimeRelease, verifyPtrGreaterRealmRuntimeReleaseArtifacts,
  type GreaterRealmRuntimeReleaseArtifacts, type GreaterRealmRuntimeCell,
  type GreaterRealmRuntimeResourceNode } from '../atlas/greater-realm-runtime-release';
import { createGreaterRealmRuntimeReleaseFixtureSource, greaterRealmRuntimeReleaseFixtureSeed } from '../atlas/greater-realm-runtime-release-test-fixture';
import { executePtrProductionImport, PTR_PRODUCTION_IMPORT_TARGET } from '../ptr-production-import-core';
import { createPtrAtlasImportTransport, createPtrOwnerProvisionTransport } from '../ptr-production-transport';
import { attestPinnedSpacetimeCli, type AttestedSpacetimeCli } from '../spacetime-cli-attestation.mjs';
import { runDisposableLocalFullstackCli, terminateLocalFullstackProcessGroup } from './local-fullstack-spacetime.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DATABASE = 'warpkeep-ptr-gameplay04-local-smoke';
const FIXTURE_FID = '9900004';
const DEADLINE_MS = 12 * 60_000;
const HASH = /^[a-f0-9]{64}$/u;
const RECEIPT = join(ROOT, 'artifacts/qa/ptr-gameplay04-local-smoke.json');
const MODULE_INPUTS = ['spacetimedb/ptr/src', 'spacetimedb/gameplay04', 'spacetimedb/ptr/package.json',
  'spacetimedb/ptr/pnpm-lock.yaml', 'spacetimedb/ptr/tsconfig.json'];
const OUTCOMES = ['initialized', 'gathered', 'staleQuoteUnsent', 'exactRetry', 'deductedOnce',
  'completed', 'improvedReturn', 'renewed', 'reconnected'] as const;
type Outcome = typeof OUTCOMES[number];

/** The import guard already excludes Genesis 001; these are additional targets. */
export function gameplay04LocalAdditionalForbiddenIdentities(databaseIdentity: string) {
  assert.match(databaseIdentity, HASH);
  const additional = Object.freeze(['c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
    'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e']);
  assert.ok(![PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity, ...additional].includes(databaseIdentity));
  return additional;
}

/** The receipt contains fixture evidence only, never credentials or player identity. */
export function gameplay04LocalSmokeReceipt(sourceCommit: string, completed: readonly Outcome[], elapsedMs: number) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
  assert.ok(Number.isSafeInteger(elapsedMs) && elapsedMs >= 0);
  assert.equal(new Set(completed).size, completed.length);
  assert.ok(completed.every(value => OUTCOMES.includes(value)));
  return Object.freeze({ schemaVersion: 1, profile: 'warpkeep-ptr-gameplay04-local-smoke-v1',
    authority: 'ephemeral-signed-local-fixture', atlas: 'synthetic-fixture', owner: 'synthetic-fid',
    productionPtrVerified: false, sourceCommit, elapsedMs,
    outcomes: Object.freeze(Object.fromEntries(OUTCOMES.map(value => [value, completed.includes(value)]))) });
}

/** Run every cleanup even if an earlier owned resource cannot be cleaned up. */
export async function cleanupGameplay04LocalSmoke(effects: readonly (() => void | Promise<void>)[]) {
  let failed = false;
  for (const effect of effects) {
    try { await effect(); } catch { failed = true; }
  }
  if (failed) throw new Error('PTR_GAMEPLAY04_LOCAL_CLEANUP_FAILED');
}

function loopback(value: string) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.port, /^[1-9][0-9]{0,4}$/u);
  assert.ok(Number(url.port) <= 65_535);
  assert.equal(url.origin, value);
  return value;
}

function environment(directory: string) {
  const inherited = Object.fromEntries(['PATH', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS']
    .filter(key => typeof process.env[key] === 'string').map(key => [key, process.env[key]!]));
  return { ...inherited, CI: '1', HOME: directory, LANG: 'C', NO_COLOR: '1', TMPDIR: directory,
    XDG_CACHE_HOME: join(directory, 'cache'), XDG_CONFIG_HOME: join(directory, 'config'),
    XDG_DATA_HOME: join(directory, 'data') };
}

async function port() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
        server.close(); reject(new Error('PTR_GAMEPLAY04_LOCAL_PORT_FAILED')); return;
      }
      server.close(error => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function boundedResponse(response: Response) {
  assert.ok(response.body);
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > 65_536) { await reader.cancel(); throw new Error('PTR_GAMEPLAY04_LOCAL_RESPONSE_OVERSIZED'); }
      parts.push(part.value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
  } finally { reader.releaseLock(); }
}

async function owningIdentity(server: string) {
  loopback(server);
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${server}/v1/identity`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(1_000) });
      const value = JSON.parse(await boundedResponse(response));
      if (response.status === 200 && HASH.test(value.identity) && typeof value.token === 'string' && value.token.split('.').length === 3) return value as { identity: string; token: string };
    } catch { /* Bounded native server startup. */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error('PTR_GAMEPLAY04_LOCAL_SERVER_UNAVAILABLE');
}

async function databaseIdentity(server: string) {
  loopback(server);
  const response = await fetch(`${server}/v1/database/${DATABASE}/identity`, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
  const text = (await boundedResponse(response)).trim();
  assert.equal(response.status, 200);
  const identity = text.startsWith('"') ? JSON.parse(text) : text;
  assert.equal(typeof identity, 'string'); assert.match(identity, HASH);
  return identity as string;
}

function signed(privateKey: string, claims: unknown) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'local-gameplay04' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function sourceDigest(directory: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(path: string, prefix: string) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name); const name = `${prefix}${entry.name}`;
      assert.ok(!entry.isSymbolicLink());
      if (entry.isDirectory()) await visit(child, `${name}/`);
      else { assert.ok(entry.isFile()); hash.update(name).update('\0').update(await readFile(child)).update('\0'); }
    }
  }
  await visit(directory, ''); return hash.digest('hex');
}

async function privateModule(directory: string) {
  const moduleRoot = join(directory, 'module'); const ptr = join(moduleRoot, 'ptr');
  await mkdir(ptr, { recursive: true, mode: 0o700 });
  const original = join(ROOT, 'spacetimedb');
  for (const name of ['src', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json']) await cp(join(original, 'ptr', name), join(ptr, name), { recursive: true, dereference: false, errorOnExist: true, force: false });
  await cp(join(original, 'gameplay04'), join(moduleRoot, 'gameplay04'), { recursive: true, dereference: false, errorOnExist: true, force: false });
  for (const name of ['ptr/src', 'gameplay04']) assert.equal(await sourceDigest(join(moduleRoot, name)), await sourceDigest(join(original, name)));
  // Bind every copied source byte to the operating commit, rather than merely
  // comparing a potentially dirty checkout with its copy.
  const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', ...MODULE_INPUTS], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }).trim().split('\n');
  for (const path of tracked) {
    const expected = execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
    assert.deepEqual(await readFile(join(ROOT, path)), expected);
    assert.deepEqual(await readFile(join(moduleRoot, path.slice('spacetimedb/'.length))), expected);
  }
  await symlink(await realpath(join(original, 'node_modules')), join(moduleRoot, 'node_modules'), 'dir');
  return ptr;
}

async function connectLocal(server: string, identity: string, token: string): Promise<InstanceType<typeof DbConnection>> {
  loopback(server); assert.match(identity, HASH);
  return new Promise((resolveConnection, reject) => {
    let pending: InstanceType<typeof DbConnection> | undefined;
    const timer = setTimeout(() => { pending?.disconnect(); reject(new Error('PTR_GAMEPLAY04_LOCAL_CONNECT_TIMEOUT')); }, 8_000);
    pending = DbConnection.builder().withUri(server).withDatabaseName(identity).withToken(token)
      .onConnect(connection => { clearTimeout(timer); resolveConnection(connection); })
      .onConnectError(() => { clearTimeout(timer); pending?.disconnect(); reject(new Error('PTR_GAMEPLAY04_LOCAL_CONNECT_FAILED')); }).build();
  });
}

export async function runPtrGameplay04LocalSmoke() {
  assert.equal(process.platform, 'linux'); assert.equal(process.getuid?.(), 1_000);
  assert.equal(process.version, 'v22.22.3');
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }).trim(), '', 'PTR_GAMEPLAY04_LOCAL_DIRTY_SOURCE');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }).trim();
  const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }).trim();
  const started = Date.now(); const completed: Outcome[] = []; let stage = 'private-directory';
  const directory = await mkdtemp(join(tmpdir(), 'warpkeep-ptr-gameplay04-smoke-'));
  await chmod(directory, 0o700);
  let cli: AttestedSpacetimeCli | undefined; let cliProcess: ChildProcess | undefined; let serverProcess: ChildProcess | undefined;
  let importTransport: ReturnType<typeof createPtrAtlasImportTransport> | undefined;
  let ownerTransport: ReturnType<typeof createPtrOwnerProvisionTransport> | undefined;
  let artifacts: GreaterRealmRuntimeReleaseArtifacts | undefined;
  let fixture: ReturnType<typeof createGreaterRealmRuntimeReleaseFixtureSource> | undefined;
  let session: PtrRealmConnectionSession | undefined; let authority: PtrRealmAuthority | undefined;
  let connection: InstanceType<typeof DbConnection> | undefined; let controller: Controller04 | undefined;
  let privateKey = ''; let deadlineReached = false; let generation = 0; let ownerIssuedAt = 0;
  let containmentFailed = false;
  let receipt: ReturnType<typeof gameplay04LocalSmokeReceipt> | undefined;
  const consoleLevels = ['log', 'warn', 'error', 'info', 'debug', 'trace'] as const;
  const priorConsole = consoleLevels.map(level => console[level]);
  // Upstream SDK diagnostics may contain a URL, procedure value or exception.
  // Only our fixed stage messages and explicit receipt go to public output.
  for (const level of consoleLevels) console[level] = () => {};
  let deadlineContainment: Promise<PromiseSettledResult<void>[]> | undefined;
  const deadline = setTimeout(() => {
    deadlineReached = true;
    deadlineContainment = Promise.allSettled([
      terminateLocalFullstackProcessGroup(cliProcess), terminateLocalFullstackProcessGroup(serverProcess),
    ]);
  }, DEADLINE_MS);
  const progress = (next: string) => { stage = next; assert.ok(!deadlineReached); process.stdout.write(`${JSON.stringify({ profile: 'ptr-gameplay04-local-smoke', stage })}\n`); };
  try {
    const env = environment(directory);
    progress('cli-attestation'); cli = attestPinnedSpacetimeCli(process.env.SPACETIME_BIN ?? 'spacetime', undefined, env);
    progress('private-source-copy'); const moduleDirectory = await privateModule(directory);
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    privateKey = keys.privateKey;
    const publicPath = join(directory, 'jwt-public.pem'); const privatePath = join(directory, 'jwt-private.pem');
    await writeFile(publicPath, keys.publicKey, { mode: 0o600, flag: 'wx' }); await writeFile(privatePath, privateKey, { mode: 0o600, flag: 'wx' });
    const server = loopback(`http://127.0.0.1:${await port()}`);
    progress('server-start');
    serverProcess = spawn(cli.path, ['start', '--listen-addr', new URL(server).host, '--in-memory', '--data-dir', join(directory, 'database'), '--jwt-pub-key-path', publicPath, '--jwt-priv-key-path', privatePath, '--non-interactive'], { cwd: directory, detached: true, env, shell: false, stdio: 'ignore' });
    serverProcess.on('error', () => {});
    const owner = await owningIdentity(server);
    const config = join(directory, 'cli.toml'); await writeFile(config, `spacetimedb_token = ${JSON.stringify(owner.token)}\n`, { mode: 0o600, flag: 'wx' });
    async function command(arguments_: string[], secrets: string[] = []) {
      cli!.verify();
      const result = await runDisposableLocalFullstackCli(cli!.path, arguments_, { environment: env, timeout: 120_000, secrets,
        onProcess(next, previous) { if (next) cliProcess = next; else if (cliProcess === previous) cliProcess = undefined; } });
      assert.equal(result.code, 0, 'PTR_GAMEPLAY04_LOCAL_CLI_FAILED');
    }
    progress('private-module-build'); await command(['build', '--module-path', moduleDirectory]);
    const bundle = await readFile(join(moduleDirectory, 'dist/bundle.js')); const moduleSha256 = createHash('sha256').update(bundle).digest('hex'); bundle.fill(0);
    progress('private-module-publish'); await command([`--config-path=${config}`, 'publish', '--server', server, '--js-path', join(moduleDirectory, 'dist/bundle.js'), '--delete-data=never', '--no-config', DATABASE], [owner.token]);
    progress('local-database-identity');
    const identity = await databaseIdentity(server);
    const disallowed = gameplay04LocalAdditionalForbiddenIdentities(identity);
    // This config is consumed only by pure claim producers. Its synthetic FID,
    // target and signing key never enter the production bridge or provider.
    const claimConfig = { issuer: 'https://auth.warpkeep.com', ptrEnabled: true,
      ptrSpacetimeDb: { database: identity, audience: 'warpkeep-ptr-spacetimedb' }, playerCanaryOwnerFid: FIXTURE_FID } as BridgeConfig;
    const adminSecret = randomBytes(32).toString('hex');
    const freshAdmin = () => Math.floor(Date.now() / 1_000) - 1;
    progress('fixture-atlas-import');
    fixture = createGreaterRealmRuntimeReleaseFixtureSource();
    artifacts = createPtrGreaterRealmRuntimeRelease({ source: fixture, sourceCommit, releaseSeed: greaterRealmRuntimeReleaseFixtureSeed() });
    verifyPtrGreaterRealmRuntimeReleaseArtifacts(artifacts);
    importTransport = createPtrAtlasImportTransport({ databaseIdentity: identity, adminSecret, disallowedDatabaseIdentities: disallowed,
      requestToken: async () => signed(privateKey, ptrAtlasAdminClaims(claimConfig, freshAdmin())),
      connectDatabase: async (_identity, token) => connectLocal(server, identity, token) });
    await executePtrProductionImport({ artifacts, databaseIdentity: identity, disallowedDatabaseIdentities: disallowed,
      moduleSourceCommit: sourceCommit, moduleTreeId: sourceTree, moduleSha256,
      dependencyClosureDigest: createHash('sha256').update(await readFile(join(moduleDirectory, 'pnpm-lock.yaml'))).digest('hex'),
      spacetimeExecutableSha256: cli.provenance.cliExecutableSha256, importEpoch: 1n,
      publicName: 'Synthetic local PTR gameplay smoke', transport: importTransport, assertCanStartWrite: () => { loopback(server); },
      testOnlyVerifyArtifacts: verifyPtrGreaterRealmRuntimeReleaseArtifacts });
    await importTransport.close(); importTransport = undefined;
    progress('synthetic-owner-provision');
    ownerTransport = createPtrOwnerProvisionTransport({ databaseIdentity: identity, adminSecret, disallowedDatabaseIdentities: disallowed,
      requestToken: async () => signed(privateKey, ptrAdminClaims(claimConfig, freshAdmin(), FIXTURE_FID, 1)),
      connectDatabase: async (_identity, token) => connectLocal(server, identity, token) });
    await ownerTransport.provisionOwner(BigInt(FIXTURE_FID), () => { loopback(server); });
    await ownerTransport.close(); ownerTransport = undefined;

    const mutations: Mutation04[] = []; let dropBuildReply = true;
    let atlas: { atlasId: string; revision: bigint };
    async function renew() {
      controller?.dispose(); closePtrRealmConnectionSession(session); if (authority) retirePtrRealmAuthority(authority);
      ownerIssuedAt = Date.now();
      const auth = createPtrRealmAuthClient({ expectedDatabaseIdentity: identity,
        fetch: (async () => {
          // A fixture response avoids any network call to the production bridge.
          const seconds = Math.floor(Date.now() / 1_000) - 1;
          const claims = ptrOwnerClaims(claimConfig, seconds, FIXTURE_FID, 1);
          return new Response(JSON.stringify({ version: 1, status: 'authorized', realmId: 'PTR', databaseIdentity: identity,
            accessToken: signed(privateKey, claims), tokenType: 'spacetime-access', accessExpiresAt: claims.exp * 1_000 }),
          { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        }) as typeof fetch });
      authority = await auth.exchangeQuickAuth('local.fixture.token');
      const abort = new AbortController();
      const builder = DbConnection.builder();
      let builtConnection: InstanceType<typeof DbConnection> | undefined;
      const localBuilder: PtrRealmConnectionBuilder = {
        withUri() { builder.withUri(loopback(server)); return this; },
        withDatabaseName(value) { assert.equal(value, identity); builder.withDatabaseName(value); return this; },
        withToken(value) { builder.withToken(value); return this; },
        onConnect(callback) { builder.onConnect((value, sender, token) => { connection = value; callback(value, sender, token); }); return this; },
        onConnectError(callback) { builder.onConnectError(callback); return this; },
        onDisconnect(callback) { builder.onDisconnect((_context, error) => { if (builtConnection) callback(builtConnection, error); }); return this; },
        build() { builtConnection = builder.build(); return builtConnection; },
      };
      session = await connectPtrRealm({ config: { availability: 'available', enabled: true, spacetimeUri: 'https://maincloud.spacetimedb.com', databaseIdentity: identity },
        authority, generation: ++generation, signal: abort.signal, builderFactory: () => localBuilder });
      const anchor = await preflightPtrRealmView(session, authority, abort.signal);
      const bootstrap = await connection!.procedures.getRealmAtlasBootstrapV1({});
      atlas = { atlasId: bootstrap.atlasId, revision: bootstrap.revision };
      const capability = createPtrGameplay04Capability(session, authority, anchor);
      const faulted: PtrGameplay04Capability = Object.freeze({ scope: capability.scope, isCurrent: () => capability.isCurrent(),
        read: signal => capability.read(signal),
        async mutate(command, signal) {
          mutations.push(command); const result = await capability.mutate(command, signal);
          if (command.kind === 'build' && dropBuildReply) { dropBuildReply = false; throw new Gameplay04ClientError('uncertain'); }
          return result;
        } });
      controller = createGameplay04Controller({ capability: faulted, now: Date.now, nonce: () => randomBytes(16).toString('hex') });
      controller.setAtlas(atlas); await controller.refresh();
    }
    async function refresh() {
      assert.ok(!deadlineReached);
      if (Date.now() - ownerIssuedAt >= 80_000) { await renew(); if (!completed.includes('renewed')) completed.push('renewed'); }
      else await controller!.refresh();
      assert.equal(controller!.getSnapshot().phase, 'ready');
      return controller!.getSnapshot().view!;
    }
    async function waitUntil(predicate: (view: NonNullable<ReturnType<Controller04['getSnapshot']>['view']>) => boolean, maximumMs: number) {
      const until = Math.min(started + DEADLINE_MS, Date.now() + maximumMs);
      while (Date.now() < until) {
        const view = await refresh(); if (predicate(view)) return view;
        await new Promise(done => setTimeout(done, 1_000));
      }
      throw new Error('PTR_GAMEPLAY04_LOCAL_GAMEPLAY_TIMEOUT');
    }
    const observeController = () => {
      const snapshot = controller!.getSnapshot();
      process.stdout.write(`${JSON.stringify({ profile: 'ptr-gameplay04-local-smoke', stage,
        phase: snapshot.phase, problem: snapshot.problem })}\n`);
    };
    progress('real-controller-initialize'); await renew(); observeController();
    if (controller!.getSnapshot().phase !== 'uninitialized') {
      // Diagnose a real procedure boundary without printing its raw exception,
      // owner binding, signed claim or response data.
      try { await connection!.procedures.getGameplay04KeepV1({}); }
      catch (error) {
        const code = typeof error === 'string' ? /\b(?:GAMEPLAY04|PTR)_[A-Z0-9_]{1,80}\b/u.exec(error)?.[0] : undefined;
        process.stdout.write(`${JSON.stringify({ profile: 'ptr-gameplay04-local-smoke', stage,
          procedureFailureShape: typeof error, procedureCode: code })}\n`);
      }
    }
    assert.equal(controller!.getSnapshot().phase, 'uninitialized'); await controller!.submit({ kind: 'initialize' });
    progress('real-controller-initialized-read'); observeController();
    const initialized = await refresh(); assert.equal(initialized.state.lastAcceptedSequence, 1n); assert.equal(initialized.workers.length, 4); completed.push('initialized');
    const bootstrap = await connection!.procedures.getRealmAtlasBootstrapV1({});
    const cells = new Map(artifacts.chunks.flatMap(chunk => chunk.payload.cells).map(cell => [cell.cellKey, cell]));
    const anchorCell = cells.get(bootstrap.myCellKey)!; assert.ok(anchorCell);
    const targets = new Map<string, Target04>();
    for (const resource of ['food', 'wood', 'stone'] as const) {
      const candidates: Array<{ node: GreaterRealmRuntimeResourceNode; cell: GreaterRealmRuntimeCell; handle: string }> = artifacts.chunks.flatMap(chunk => chunk.payload.resourceNodes
        .filter(node => node.resourceKind === resource && node.componentKey === anchorCell.componentKey && node.nodeOrdinal === 0)
        .map(node => ({ node, cell: cells.get(node.cellKey)!, handle: chunk.payload.chunkHandle })))
        .sort((a, b) => a.cell.routeDepth! - b.cell.routeDepth!);
      const candidate = candidates[0]; assert.ok(candidate);
      const route = await connection!.procedures.planRealmRouteV1({ originCellKey: bootstrap.myCellKey, destinationCellKey: candidate.cell.cellKey, offset: 0, limit: 128, expectedRevision: atlas!.revision });
      assert.ok(route.totalLength <= 31, 'PTR_GAMEPLAY04_LOCAL_FIXTURE_ROUTE_TOO_LONG');
      const live = await connection!.procedures.getRealmAtlasResourceLocationsV1({ chunkHandles: [candidate.handle], expectedRevision: atlas!.revision });
      const location = live.resourceLocations.find(row => row.locationId === candidate.node.locationId); assert.ok(location); assert.equal(location.resourceKind, resource);
      targets.set(resource, { ...atlas!, locationId: location.locationId, resource, q: location.atlasQ, r: location.atlasR });
    }
    progress('real-clock-gather');
    for (const [ordinal, resource] of ['food', 'wood', 'stone'].entries()) {
      await controller!.submit({ kind: 'dispatch', workerOrdinal: ordinal, target: targets.get(resource)!, durationMicros: 60_000_000n });
      assert.equal(controller!.getSnapshot().phase, 'ready');
    }
    const gathered = await waitUntil(view => view.workers.every(worker => worker.phase === 'idle') && view.balances.food >= 60n && view.balances.wood >= 60n && view.balances.stone >= 60n, 200_000);
    completed.push('gathered');
    const placement = { kind: 'city-mill' as const, x: -15_000_000n, z: 15_000_000n, rotation: 0 };
    const oldQuote = quoteBuilding04(gathered, 'city-mill', placement);
    await controller!.submit({ kind: 'dispatch', workerOrdinal: 3, target: targets.get('wood')!, durationMicros: 60_000_000n });
    const mutationCount = mutations.length; await controller!.submit({ kind: 'build', quote: oldQuote });
    assert.equal(mutations.length, mutationCount); assert.equal(controller!.getSnapshot().phase, 'ready'); completed.push('staleQuoteUnsent');
    const before = controller!.getSnapshot().view!; const quote = quoteBuilding04(before, 'city-mill', placement);
    progress('real-clock-build-and-exact-retry');
    await controller!.submit({ kind: 'build', quote }); assert.equal(controller!.getSnapshot().phase, 'uncertain');
    await controller!.refresh(); assert.equal(controller!.getSnapshot().phase, 'uncertain');
    const afterCommit = controller!.getSnapshot().view!;
    for (const resource of ['food', 'wood', 'stone', 'gold'] as const) assert.equal(afterCommit.balances[resource], before.balances[resource] - quote.cost[resource]);
    await controller!.retryPending(); assert.equal(controller!.getSnapshot().phase, 'ready');
    const builds = mutations.filter(command => command.kind === 'build'); assert.equal(builds.length, 2); assert.equal(builds[0], builds[1]);
    assert.deepEqual(controller!.getSnapshot().view!.balances, afterCommit.balances); completed.push('exactRetry', 'deductedOnce');
    assert.equal(controller!.getSnapshot().view!.state.project!.durationMicros, 120_000_000n);
    const built = await waitUntil(view => view.state.project === undefined && view.state.completedLevels.mill === 1, 160_000);
    assert.equal(built.state.completedEffects.foodYieldPerQuantum, 12n); completed.push('completed');
    progress('real-clock-improved-return');
    const foodBefore = built.balances.food;
    await controller!.submit({ kind: 'dispatch', workerOrdinal: 0, target: targets.get('food')!, durationMicros: 60_000_000n });
    assert.equal(controller!.getSnapshot().view!.workers[0]!.capturedYield, 12n);
    const improved = await waitUntil(view => view.workers[0]!.phase === 'idle' && view.workers[0]!.lastCredited === 72n, 200_000);
    assert.equal(improved.balances.food, foodBefore + 72n); completed.push('improvedReturn');
    progress('fresh-connection-persisted-read');
    const persisted = improved.state; await renew();
    assert.deepEqual(controller!.getSnapshot().view!.state, persisted); completed.push('reconnected');
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }).trim(), sourceCommit);
    assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }).trim(), '');
    receipt = gameplay04LocalSmokeReceipt(sourceCommit, completed, Date.now() - started);
    assert.ok(Object.values(receipt.outcomes).every(Boolean));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,100}$/u.test(error.code) ? error.code : 'PTR_GAMEPLAY04_LOCAL_SMOKE_FAILED';
    throw new Error(`PTR_GAMEPLAY04_LOCAL_SMOKE_FAILED: ${stage} (${code})`);
  } finally {
    clearTimeout(deadline);
    await deadlineContainment;
    await cleanupGameplay04LocalSmoke([
      () => { controller?.dispose(); closePtrRealmConnectionSession(session); connection?.disconnect(); if (authority) retirePtrRealmAuthority(authority); privateKey = ''; },
      async () => { await importTransport?.close(); }, async () => { await ownerTransport?.close(); },
      async () => { try { await terminateLocalFullstackProcessGroup(cliProcess); } catch (error) { containmentFailed = true; throw error; } },
      async () => { try { await terminateLocalFullstackProcessGroup(serverProcess); } catch (error) { containmentFailed = true; throw error; } },
      () => { fixture?.grid.clearIndex?.(); artifacts?.manifestBytes.fill(0); artifacts?.statusBytes.fill(0); for (const chunk of artifacts?.chunks ?? []) chunk.bytes.fill(0); },
      () => { assert.equal(containmentFailed, false); cli?.cleanup(); },
      async () => { assert.equal(containmentFailed, false); const state = await lstat(directory); assert.ok(state.isDirectory() && !state.isSymbolicLink()); await rm(directory, { recursive: true, force: true }); },
      () => { consoleLevels.forEach((level, index) => { console[level] = priorConsole[index]!; }); },
    ]);
  }
  assert.ok(receipt);
  await mkdir(dirname(RECEIPT), { recursive: true });
  await writeFile(RECEIPT, `${JSON.stringify({ ...receipt, cleanupComplete: true }, null, 2)}\n`, { mode: 0o600 });
  return Object.freeze({ ...receipt, cleanupComplete: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runPtrGameplay04LocalSmoke().then(receipt => process.stdout.write(`${JSON.stringify(receipt)}\n`), error => {
    process.stderr.write(`${error instanceof Error && /^PTR_[A-Z0-9_]+(?:: [a-z0-9-]+ \([A-Z0-9_]+\))?$/u.test(error.message) ? error.message : 'PTR_GAMEPLAY04_LOCAL_SMOKE_FAILED'}\n`);
    process.exitCode = 1;
  });
}
