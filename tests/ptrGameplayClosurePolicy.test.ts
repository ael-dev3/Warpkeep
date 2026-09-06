// @vitest-environment node
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
  AuthBridgeNotificationPreparedDeployClosureError,
  authBridgeNotificationPreparedDeployClosureTestSeams,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  deriveAuthBridgeNotificationPreparedDeployClosurePaths,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';

const repositoryRoot = realpathSync(process.cwd());
const namespace = 'spacetimedb/ptr/generated-bindings/';
const gameplayProcedurePaths = [
  'dispatch_gameplay_04_worker_v_1_procedure.ts',
  'get_gameplay_04_keep_v_1_procedure.ts',
  'initialize_gameplay_04_keep_v_1_procedure.ts',
  'recall_gameplay_04_worker_v_1_procedure.ts',
  'start_gameplay_04_building_v_1_procedure.ts',
].map(name => `${namespace}${name}`);
const sharedNamespace = 'spacetimedb/gameplay04/';
const sharedSourcePaths = [
  'commands.ts', 'construction.ts', 'keep.ts', 'placement.ts', 'policy.ts',
  'reconciliation.ts', 'workerJourney.ts', 'workerState.ts', 'workers.ts',
].map(name => `${sharedNamespace}${name}`);
const existingBindingNames = [
  'admin_begin_greater_realm_verification_v_1_reducer.ts',
  'admin_finalize_greater_realm_release_v_1_reducer.ts',
  'admin_get_greater_realm_status_v_1_procedure.ts',
  'admin_import_greater_realm_chunk_v_1_reducer.ts',
  'admin_import_greater_realm_components_v_1_reducer.ts',
  'admin_import_greater_realm_regions_v_1_reducer.ts',
  'admin_provision_ptr_owner_v_1_reducer.ts',
  'admin_stage_greater_realm_release_v_1_reducer.ts',
  'admin_suspend_ptr_owner_v_1_reducer.ts',
  'admin_verify_greater_realm_batch_v_1_reducer.ts',
  'get_ptr_owner_status_v_1_procedure.ts',
  'get_realm_atlas_bootstrap_v_1_procedure.ts',
  'get_realm_atlas_chunk_v_1_procedure.ts',
  'get_realm_atlas_resource_locations_v_1_procedure.ts',
  'get_realm_atlas_window_v_1_procedure.ts',
  'index.ts',
  'plan_realm_route_v_1_procedure.ts',
  'types.ts',
];
const admittedPaths = [
  ...existingBindingNames.map(name => `${namespace}${name}`),
  ...gameplayProcedurePaths,
].sort();
const temporaryDirectories: string[] = [];
const errorPrefix = 'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_';

function temporaryDirectory(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-ptr-policy-')));
  temporaryDirectories.push(root);
  return root;
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Reuse the existing policy fixture's frozen-member seed, then copy current
// source namespaces: the old frozen manifest cannot supply new graph members.
// Dependencies are never copied, linked, installed, or modified.
function createPolicyFixture(): string {
  const root = temporaryDirectory();
  for (const path of AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS) {
    const destination = resolve(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resolve(repositoryRoot, path), destination);
  }
  for (const path of [
    'scripts', 'src', 'spacetimedb/src', 'spacetimedb/genesis002/src',
    'spacetimedb/ptr/src', 'spacetimedb/ptr/generated-bindings', 'spacetimedb/gameplay04',
  ]) {
    cpSync(resolve(repositoryRoot, path), resolve(root, path), {
      recursive: true,
      filter: source => !/(?:^|[\\/])(?:node_modules|__pycache__)(?:[\\/]|$)/u.test(source),
    });
  }
  return root;
}

function expectPolicyFailure(operation: () => unknown, suffix: string, root?: string): void {
  let failure: unknown;
  try { operation(); } catch (error) { failure = error; }
  if (root !== undefined && failure instanceof Error
    && failure.message !== `${errorPrefix}${suffix}`) {
    throw new Error(`Unexpected fixture rejection: ${diagnoseRejectedImport(root)}`, { cause: failure });
  }
  expect(failure).toBeInstanceOf(AuthBridgeNotificationPreparedDeployClosureError);
  expect(failure).toMatchObject({ message: `${errorPrefix}${suffix}`, code: `${errorPrefix}${suffix}` });
}

function manifestFor(paths: readonly string[]): Buffer {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 2,
    profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1',
    members: paths.map(path => ({
      path,
      digestProfile: 'raw-file-sha256-v1',
      sha256: 'a'.repeat(64),
    })),
  }, null, 2)}\n`);
}

// Failure-only diagnostic copy. Production retains its fixed error transport.
// Record only resolved import edges, then recover the first BFS parent chain.
function diagnoseRejectedImport(root = repositoryRoot): string {
  const policyPath = resolve(repositoryRoot,
    'scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs');
  const diagnosticPath = resolve(temporaryDirectory(), 'diagnostic.mjs');
  const original = readFileSync(policyPath, 'utf8');
  const marker = '  const memberPath = relative(repository, matches[0]).split(sep).join(\'/\');';
  expect(original.split(marker)).toHaveLength(2);
  const diagnostic = original.replace(marker, `${marker}\n  globalThis.__ptrEdges.push({ importer, specifier, memberPath });`)
    .replace('  const base = resolve(repository, dirname(importer), specifier);',
      '  globalThis.__ptrAttempt = { importer, specifier };\n  const base = resolve(repository, dirname(importer), specifier);')
    .replace(/from '(\.[^']+)'/gu, (_match, specifier: string) =>
      `from '${pathToFileURL(resolve(dirname(policyPath), specifier)).href}'`);
  writeFileSync(diagnosticPath, diagnostic);
  return execFileSync(process.execPath, ['--input-type=module', '--eval', `
    globalThis.__ptrEdges = [];
    const { deriveAuthBridgeNotificationPreparedDeployClosurePaths: derive } =
      await import(${JSON.stringify(pathToFileURL(diagnosticPath).href)});
    try { derive({ repositoryRoot: ${JSON.stringify(root)} }); }
    catch (error) {
      const edges = globalThis.__ptrEdges;
      const rejected = edges.at(-1);
      const chain = rejected ? [rejected] : [];
      const seen = new Set();
      while (chain.length && !seen.has(chain[0].importer)) {
        seen.add(chain[0].importer);
        const parent = edges.find(edge => edge.memberPath === chain[0].importer);
        if (!parent) break;
        chain.unshift(parent);
      }
      console.log(JSON.stringify({ code: error.code ?? error.message, chain, attempt: globalThis.__ptrAttempt }));
    }
  `], { encoding: 'utf8', timeout: 90_000, maxBuffer: 64 * 1024 }).trim();
}

describe('exact PTR gameplay closure path policy', () => {
  it('derives the genuine shipped graph with all five gameplay procedures', () => {
    let paths: readonly string[];
    try {
      paths = deriveAuthBridgeNotificationPreparedDeployClosurePaths({ repositoryRoot });
    } catch (error) {
      throw new Error(`Production graph rejected: ${diagnoseRejectedImport()}`, { cause: error });
    }
    expect(paths).toEqual(expect.arrayContaining(gameplayProcedurePaths));
    expect(paths.filter(path => path.startsWith(sharedNamespace))).toEqual(sharedSourcePaths);
    expect(paths).toEqual([...new Set(paths)].sort());
    const ptrPaths = paths.filter(path => path.startsWith(namespace));
    expect(ptrPaths.some(path => path.endsWith('_table.ts'))).toBe(false);
    expect(ptrPaths).toEqual(admittedPaths);
    expect(authBridgeNotificationPreparedDeployClosureTestSeams
      ?.parseManifest(manifestFor(ptrPaths))).toMatchObject({
      members: ptrPaths.map(path => expect.objectContaining({ path })),
    });
  }, 180_000);

  it('admits the same exact PTR candidates through the verifier manifest predicate', () => {
    expect(authBridgeNotificationPreparedDeployClosureTestSeams).toBeDefined();
    const manifest = authBridgeNotificationPreparedDeployClosureTestSeams!
      .parseManifest(manifestFor([...admittedPaths, ...sharedSourcePaths].sort()));
    expect(manifest.members).toEqual([...admittedPaths, ...sharedSourcePaths].sort().map(path => ({
      path, digestProfile: 'raw-file-sha256-v1', sha256: 'a'.repeat(64),
    })));
  });

  it('derives the same complete graph from an unmodified disposable fixture', () => {
    const root = createPolicyFixture();
    expect(deriveAuthBridgeNotificationPreparedDeployClosurePaths({ repositoryRoot: root }))
      .toEqual(deriveAuthBridgeNotificationPreparedDeployClosurePaths({ repositoryRoot }));
  }, 180_000);

  it.each(['unknown_v_1_procedure.ts', 'private_gameplay_04_table.ts'])(
    'rejects an imported unadmitted binding: %s', name => {
      const root = createPolicyFixture();
      const index = resolve(root, namespace, 'index.ts');
      writeFileSync(resolve(root, namespace, name), 'export const unreviewed = true;\n');
      writeFileSync(index, `import './${name}';\n${readFileSync(index, 'utf8')}`);
      expectPolicyFailure(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
        repositoryRoot: root,
      }), 'IMPORT_INVALID', root);
    }, 90_000,
  );

  it('rejects an imported unknown shared gameplay module', () => {
    const root = createPolicyFixture();
    const entry = resolve(root, 'src/main.tsx');
    writeFileSync(resolve(root, sharedNamespace, 'unreviewed.ts'), 'export const unreviewed = true;\n');
    writeFileSync(entry, `import '../${sharedNamespace}unreviewed.ts';\n${readFileSync(entry, 'utf8')}`);
    expectPolicyFailure(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: root,
    }), 'IMPORT_INVALID', root);
  }, 90_000);

  it('protects the backend-only reconciliation dependency through the PTR entrypoint', () => {
    const paths = deriveAuthBridgeNotificationPreparedDeployClosurePaths({ repositoryRoot });
    for (const path of [
      'spacetimedb/ptr/src/index.ts',
      'spacetimedb/ptr/src/gameplayKeep.ts',
      `${sharedNamespace}reconciliation.ts`,
    ]) expect(paths.includes(path), path).toBe(true);
  }, 90_000);

  it('rejects a backend-only unknown shared dependency', () => {
    const root = createPolicyFixture();
    const backend = resolve(root, 'spacetimedb/ptr/src/gameplayKeep.ts');
    writeFileSync(resolve(root, sharedNamespace, 'backendUnreviewed.ts'), 'export const unreviewed = true;\n');
    writeFileSync(backend, `import '../../gameplay04/backendUnreviewed';\n${readFileSync(backend, 'utf8')}`);
    expectPolicyFailure(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: root,
    }), 'IMPORT_INVALID', root);
  }, 90_000);

  it('rejects a deleted admitted procedure', () => {
    const root = createPolicyFixture();
    const target = resolve(root, gameplayProcedurePaths[0]);
    unlinkSync(target);
    expectPolicyFailure(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: root,
    }), 'IMPORT_UNRESOLVED', root);
  }, 90_000);

  // Windows file symlinks require privileges unavailable to this checkout.
  // Do not mistake the supplementary junction check for Linux file-link proof.
  it.skipIf(process.platform === 'win32')('rejects a real file symlink at an admitted procedure path', () => {
    const root = createPolicyFixture();
    const target = resolve(root, gameplayProcedurePaths[0]);
    unlinkSync(target);
    symlinkSync(resolve(repositoryRoot, gameplayProcedurePaths[0]), target, 'file');
    expectPolicyFailure(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: root,
    }), 'IMPORT_UNRESOLVED', root);
  }, 90_000);

  it.skipIf(process.platform !== 'win32')('rejects a Windows junction at an admitted procedure path', () => {
    const root = createPolicyFixture();
    const target = resolve(root, gameplayProcedurePaths[0]);
    unlinkSync(target);
    symlinkSync(resolve(repositoryRoot, namespace), target, 'junction');
    expectPolicyFailure(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: root,
    }), 'IMPORT_UNRESOLVED', root);
  }, 90_000);

  it.each([
    'unknown_v_1_procedure.ts', 'private_gameplay_04_table.ts',
    'types/procedures.ts', 'types/reducers.ts',
  ])('rejects an unadmitted verifier candidate: %s', name => {
    expectPolicyFailure(() => authBridgeNotificationPreparedDeployClosureTestSeams!
      .parseManifest(manifestFor([`${namespace}${name}`])), 'MANIFEST_INVALID');
  });

  it.each(['unreviewed.ts', 'backendUnreviewed.ts'])(
    'rejects an unadmitted shared verifier candidate: %s', name => {
      expectPolicyFailure(() => authBridgeNotificationPreparedDeployClosureTestSeams!
        .parseManifest(manifestFor([`${sharedNamespace}${name}`])), 'MANIFEST_INVALID');
    },
  );
});
