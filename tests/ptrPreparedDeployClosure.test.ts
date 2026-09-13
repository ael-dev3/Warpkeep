// @vitest-environment node

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  deriveAuthBridgeNotificationPreparedDeployClosurePaths,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];
let protectedClosurePaths: readonly string[];
let fixtureRoot: string;

const PTR_OPERATOR_MEMBERS = Object.freeze([
  'scripts/ptr-production-admin-token.ts',
  'scripts/ptr-production-existing-update-adapter.d.mts',
  'scripts/ptr-production-existing-update-adapter.mjs',
  'scripts/ptr-production-import-core.ts',
  'scripts/ptr-production-import-operator.ts',
  'scripts/ptr-production-publisher-cli.ts',
  'scripts/ptr-production-publisher.d.mts',
  'scripts/ptr-production-publisher.mjs',
  'scripts/ptr-production-receipt-file.ts',
  'scripts/ptr-production-release-receipts.ts',
  'scripts/ptr-production-state-observation.d.mts',
  'scripts/ptr-production-state-observation.mjs',
  'scripts/ptr-production-transport.ts',
]);

const PTR_BROWSER_MEMBERS = Object.freeze([
  'src/ptr/PtrGameplay04SurfaceHost.tsx',
  'src/ptr/PtrRealmProvider.tsx',
  'src/ptr/PtrSessionContinuation.css',
  'src/ptr/PtrSessionContinuation.tsx',
  'src/ptr/gameplay04/createGameplay04Controller.ts',
  'src/ptr/gameplay04/gameplay04Placement.ts',
  'src/ptr/gameplay04/gameplay04Presentation.ts',
  'src/ptr/gameplay04/gameplay04State.ts',
  'src/ptr/gameplay04/ptrGameplay04Errors.ts',
  'src/ptr/gameplay04/ptrGameplay04Types.ts',
  'src/ptr/gameplay04/useGameplay04Controller.ts',
  'src/ptr/ptrGreaterRealmBridge.ts',
  'src/ptr/ptrRealmAuthClient.ts',
  'src/ptr/ptrRealmConfig.ts',
  'src/ptr/ptrRealmConnection.ts',
  'src/ptr/ptrRealmPresentationPolicy.ts',
]);

const PTR_GENERATED_BINDING_MEMBERS = Object.freeze([
  'spacetimedb/ptr/generated-bindings/admin_begin_greater_realm_verification_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_finalize_greater_realm_release_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_get_greater_realm_status_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_chunk_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_components_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_regions_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_provision_ptr_owner_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_stage_greater_realm_release_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_suspend_ptr_owner_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_verify_greater_realm_batch_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/dispatch_gameplay_04_worker_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_gameplay_04_keep_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_ptr_owner_status_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_realm_atlas_bootstrap_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_realm_atlas_chunk_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_realm_atlas_resource_locations_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_realm_atlas_window_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/index.ts',
  'spacetimedb/ptr/generated-bindings/initialize_gameplay_04_keep_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/plan_realm_route_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/recall_gameplay_04_worker_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/start_gameplay_04_building_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/types.ts',
]);

function createClosureFixture(): string {
  const root = realpathSync(mkdtempSync(join(
    tmpdir(),
    'warpkeep-ptr-protected-closure-',
  )));
  temporaryDirectories.push(root);
  for (const memberPath of protectedClosurePaths) {
    const destination = resolve(root, memberPath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resolve(repositoryRoot, memberPath), destination);
  }
  return root;
}

function prependFixtureImport(
  root: string,
  specifier: string,
): void {
  const entrypoint = resolve(
    root,
    'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',
  );
  writeFileSync(
    entrypoint,
    `import ${JSON.stringify(specifier)};\n${readFileSync(entrypoint, 'utf8')}`,
  );
}

beforeAll(() => {
  protectedClosurePaths = deriveAuthBridgeNotificationPreparedDeployClosurePaths({
    repositoryRoot,
  });
  fixtureRoot = createClosureFixture();
}, 90_000);

afterAll(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('PTR prepared-deploy protected closure', () => {
  it('binds every live PTR operator, browser dependency, and backend source', () => {
    const paths = protectedClosurePaths;

    expect(paths).toEqual(
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
    );
    expect(paths).toEqual(expect.arrayContaining([
      ...PTR_OPERATOR_MEMBERS,
      ...PTR_BROWSER_MEMBERS,
      ...PTR_GENERATED_BINDING_MEMBERS,
    ]));
    expect(paths.filter(path => path.startsWith('scripts/ptr-production-')))
      .toEqual(PTR_OPERATOR_MEMBERS);
    expect(paths.filter(path => path.startsWith('src/ptr/')))
      .toEqual(PTR_BROWSER_MEMBERS);
    expect(paths.filter(
      path => path.startsWith('spacetimedb/ptr/generated-bindings/'),
    )).toEqual(PTR_GENERATED_BINDING_MEMBERS);
    expect(paths).toEqual(expect.arrayContaining([
      'spacetimedb/ptr/src/index.ts',
      'spacetimedb/ptr/src/schema.ts',
      'spacetimedb/ptr/src/auth.ts',
      'spacetimedb/ptr/src/ownerPolicy.ts',
      'spacetimedb/ptr/package.json',
      'spacetimedb/ptr/tsconfig.json',
      'spacetimedb/ptr/pnpm-lock.yaml',
      'scripts/genesis001-admitted-player-census.mjs',
      'scripts/genesis001-admitted-player-census.d.mts',
    ]));
    expect(paths.some(path => path.startsWith('spacetimedb/ptr/dist/')))
      .toBe(false);
    expect(paths).not.toContain('spacetimedb/genesis002/src/reducers.ts');
  }, 90_000);

  // The full TypeScript graph launches native parser processes on Windows.
  it('includes unimported module source so a release cannot omit dormant authority', () => {
    const additions = [
      'spacetimedb/genesis002/src/releaseInventorySentinel.ts',
      'spacetimedb/ptr/src/releaseInventorySentinel.ts',
    ];
    try {
      for (const path of additions) {
        writeFileSync(resolve(fixtureRoot, path), 'export const sentinel = true;\n');
      }
      expect(deriveAuthBridgeNotificationPreparedDeployClosurePaths({
        repositoryRoot: fixtureRoot,
      })).toEqual(expect.arrayContaining(additions));
    } finally {
      for (const path of additions) rmSync(resolve(fixtureRoot, path), { force: true });
    }
  }, process.platform === 'win32' ? 180_000 : 90_000);

  it('requires the PTR independent lock even when no runtime import reaches it', () => {
    const target = resolve(fixtureRoot, 'spacetimedb/ptr/pnpm-lock.yaml');
    const original = readFileSync(target);
    try {
      rmSync(target);
      expect(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
        repositoryRoot: fixtureRoot,
      })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_NAMESPACE_INVALID');
    } finally {
      writeFileSync(target, original);
    }
  }, 90_000);

  it.each([
    [
      'private generated table',
      'spacetimedb/ptr/generated-bindings/private_admin_audit_table.ts',
    ],
    ['built module output', 'spacetimedb/ptr/dist/bundle.ts'],
  ])('rejects a PTR %s imported by a protected root', (_label, hostilePath) => {
    const entrypoint = resolve(
      fixtureRoot,
      'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',
    );
    const originalEntrypoint = readFileSync(entrypoint);
    const target = resolve(fixtureRoot, hostilePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'export const hostilePtrMember = true;\n');
    try {
      prependFixtureImport(fixtureRoot, `../${hostilePath}`);
      expect(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
        repositoryRoot: fixtureRoot,
      })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_INVALID');
    } finally {
      writeFileSync(entrypoint, originalEntrypoint);
      originalEntrypoint.fill(0);
      rmSync(target, { force: true });
    }
  }, 90_000);

  it('rejects a module source directory reparse point before traversing it', () => {
    const target = resolve(fixtureRoot, 'spacetimedb/ptr/src');
    const link = resolve(target, 'linkedSource');
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      expect(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
        repositoryRoot: fixtureRoot,
      })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_NAMESPACE_INVALID');
    } finally {
      rmSync(link, { force: true });
    }
  });

  // File symlinks require Developer Mode/elevation on Windows. The directory
  // reparse-point case above still runs there; Linux CI retains this case.
  it.skipIf(process.platform === 'win32')('rejects a generated PTR binding replaced by a symlink', () => {
    const entrypoint = resolve(
      fixtureRoot,
      'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',
    );
    const originalEntrypoint = readFileSync(entrypoint);
    const binding = resolve(
      fixtureRoot,
      'spacetimedb/ptr/generated-bindings/index.ts',
    );
    const originalBinding = readFileSync(binding);
    rmSync(binding);
    symlinkSync('./types.ts', binding);
    try {
      prependFixtureImport(
        fixtureRoot,
        '../spacetimedb/ptr/generated-bindings',
      );
      expect(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
        repositoryRoot: fixtureRoot,
      })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_UNRESOLVED');
    } finally {
      writeFileSync(entrypoint, originalEntrypoint);
      originalEntrypoint.fill(0);
      rmSync(binding, { force: true });
      writeFileSync(binding, originalBinding);
      originalBinding.fill(0);
    }
  }, 90_000);

  it('rejects a local import that traverses outside the repository', () => {
    const entrypoint = resolve(
      fixtureRoot,
      'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',
    );
    const originalEntrypoint = readFileSync(entrypoint);
    const escapePath = resolve(
      fixtureRoot,
      '..',
      `${basename(fixtureRoot)}-escape.ts`,
    );
    writeFileSync(escapePath, 'export const escaped = true;\n');
    try {
      prependFixtureImport(
        fixtureRoot,
        `../../${basename(escapePath, '.ts')}`,
      );
      expect(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
        repositoryRoot: fixtureRoot,
      })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_INVALID');
    } finally {
      writeFileSync(entrypoint, originalEntrypoint);
      originalEntrypoint.fill(0);
      rmSync(escapePath, { force: true });
    }
  }, 90_000);
});
