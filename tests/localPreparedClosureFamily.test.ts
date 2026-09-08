// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS } from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import * as boundedFiles from '../scripts/local-binding-bounded-file.mjs';
const state = vi.hoisted(() => ({ files: [] as { path: string; bytes: Uint8Array }[], count: 0 }));
vi.mock('../scripts/local-prepared-closure-inventory.mjs', () => ({
  derivePreparedClosurePolicyInventoryAndCounts: () => ({ memberCount: state.count, files: state.files }),
}));
import { derivePreparedClosureFamily } from '../scripts/local-prepared-closure-family.mjs';
const root = process.cwd();
const verifierPath = 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
const outputPaths = [
  'scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs', verifierPath,
  'scripts/production-player-canary-activation-launcher.mjs',
  'scripts/production-player-canary-activation-launcher.d.mts',
  'tests/authBridgeNotificationB0Closure.test.ts',
  'tests/authBridgeNotificationPreparedReleaseProjection.test.ts',
  'tests/authBridgeNotificationPreparedWorkflow.test.ts',
  'tests/greaterRealmReleaseGateDeployBoundary.test.ts',
];
function fixture() {
  state.files = outputPaths.map(path => ({ path, bytes: new Uint8Array(readFileSync(resolve(root, path))) }));
  state.count = AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS.length;
}
afterEach(() => vi.restoreAllMocks());
it('connects the actual verifier engine to manifest and workflow generation (existing-inventory fixture)', async () => {
  fixture();
  const result = await derivePreparedClosureFamily({ repositoryRoot: root });
  expect(result.files).toHaveLength(15);
  expect(result.memberCount).toBe(state.count);
  const manifest = result.files.find(file => file.path.endsWith('deploy-closure-v1.json'))!;
  expect(createHash('sha256').update(manifest.bytes).digest('hex')).toBe(result.manifestSha256);
  const members = JSON.parse(Buffer.from(manifest.bytes).toString()).members;
  for (const path of ['scripts/generate-0.4.0-sealed-launch-activation.mjs', 'scripts/verify-0.4.0-sealed-launch.mjs']) {
    const file = result.files.find(file => file.path === path)!;
    expect(members.find((member: { path: string }) => member.path === path)).toMatchObject({
      digestProfile: 'raw-file-sha256-v1', sha256: createHash('sha256').update(file.bytes).digest('hex'),
    });
  }
  const generator = result.files.find(file => file.path === 'scripts/generate-0.4.0-sealed-launch-activation.mjs')!;
  const launchVerifier = result.files.find(file => file.path === 'scripts/verify-0.4.0-sealed-launch.mjs')!;
  expect(Buffer.from(launchVerifier.bytes).toString()).toContain(createHash('sha256').update(generator.bytes).digest('hex'));
  const fixturePin = result.files.find(file => file.path === 'tests/sealedLaunchActivationGenerator.test.ts')!;
  const bootstrapDigest = createHash('sha256').update(readFileSync(resolve(root, 'scripts/greater-realm-production-bootstrap.mjs'))).digest('hex');
  expect(Buffer.from(fixturePin.bytes).toString()).toMatch(new RegExp(`bootstrapSha256:\\r?\\n    '${bootstrapDigest}'`));
  expect(members.some((member: { path: string }) => member.path === fixturePin.path)).toBe(false);
  for (const workflow of result.files.filter(file => file.path.startsWith('.github/'))) {
    expect(Buffer.from(workflow.bytes).toString()).toContain(result.manifestSha256);
  }
});
it('uses the newly expanded literal inventory, including all nine synthetic bundle bodies', async () => {
  fixture();
  const bundles = [
    ...['activation', 'g001', 'g002', 'ptr'].flatMap(lane => ['d.mts', 'mjs'].map(suffix =>
      `scripts/sealed-realms-production-${lane}-lane.bundle.${suffix}`)),
    'scripts/sealed-realms-production-bundle-manifest-v1.json',
  ];
  // Current source already contains the generated family. Model the prior
  // inventory explicitly, then add the nine new members exactly once.
  const baseline = AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS
    .filter(path => !bundles.includes(path));
  const paths = [...baseline, ...bundles].sort();
  expect(new Set(paths).size).toBe(paths.length);
  const verifier = state.files.find(file => file.path === verifierPath)!;
  verifier.bytes = Buffer.from(Buffer.from(verifier.bytes).toString().replace(
    /^export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS =\r?\n  Object\.freeze\(\[\r?\n(?:    '[A-Za-z0-9._/-]+',\r?\n)+  \]\);/gm,
    `export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS =\n  Object.freeze([\n${paths.map(path => `    '${path}',\n`).join('')}  ]);`,
  ));
  state.count = paths.length;
  const read = boundedFiles.readLocalBindingBoundedFile;
  vi.spyOn(boundedFiles, 'readLocalBindingBoundedFile').mockImplementation((path, options) => {
    if (bundles.some(member => resolve(root, member) === path)) {
      return { body: Buffer.from('// synthetic bundle bytes, not a compiled release\n'), identity: {} } as never;
    }
    return read(path, options);
  });
  const result = await derivePreparedClosureFamily({ repositoryRoot: root });
  const manifest = JSON.parse(Buffer.from(result.files.find(file => file.path.endsWith('deploy-closure-v1.json'))!.bytes).toString());
  expect(result.memberCount).toBe(paths.length);
  for (const path of bundles) expect(manifest.members.some((member: { path: string }) => member.path === path)).toBe(true);
  // The coordinator owns read buffers, never the actual working files.
  expect(readFileSync(resolve(root, verifierPath)).length).toBeGreaterThan(0);
});
it('rejects duplicate members instead of silently deduplicating the generated inventory', async () => {
  fixture();
  const paths = [...AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS[0]!].sort();
  const verifier = state.files.find(file => file.path === verifierPath)!;
  verifier.bytes = Buffer.from(Buffer.from(verifier.bytes).toString().replace(
    /^export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS =\r?\n  Object\.freeze\(\[\r?\n(?:    '[A-Za-z0-9._/-]+',\r?\n)+  \]\);/gm,
    `export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS =\n  Object.freeze([\n${paths.map(path => `    '${path}',\n`).join('')}  ]);`,
  ));
  state.count = paths.length;
  await expect(derivePreparedClosureFamily({ repositoryRoot: root })).rejects.toThrow('LOCAL_PREPARED_CLOSURE_FAMILY_INVALID');
  expect(state.files.every(file => file.bytes.every(byte => byte === 0))).toBe(true);
});
it('converges across all fifteen source/pin/test/manifest/workflow outputs using a read-overlay fixture', async () => {
  fixture();
  const first = await derivePreparedClosureFamily({ repositoryRoot: root });
  const overlay = new Map(first.files.map(file => [resolve(root, file.path), file.bytes]));
  state.files = outputPaths.map(path => ({ path, bytes: new Uint8Array(overlay.get(resolve(root, path))!) }));
  const read = boundedFiles.readLocalBindingBoundedFile;
  vi.spyOn(boundedFiles, 'readLocalBindingBoundedFile').mockImplementation((path, options) => {
    const bytes = overlay.get(path);
    return bytes === undefined ? read(path, options)
      : { body: Buffer.from(bytes), identity: {} } as never;
  });
  const second = await derivePreparedClosureFamily({ repositoryRoot: root });
  expect(second).toEqual(first);
});
it('rejects altered verifier logic before executing candidate code and clears owned outputs', async () => {
  fixture();
  const verifier = state.files.find(file => file.path === verifierPath)!;
  verifier.bytes = Buffer.concat([verifier.bytes, Buffer.from('\nthrow new Error("CANDIDATE_EXECUTED");\n')]);
  await expect(derivePreparedClosureFamily({ repositoryRoot: root })).rejects.toThrow('LOCAL_PREPARED_CLOSURE_FAMILY_INVALID');
  expect(state.files.every(file => file.bytes.every(byte => byte === 0))).toBe(true);
});
it('rejects missing required member bodies without returning a partial family', async () => {
  fixture();
  await expect(derivePreparedClosureFamily({ repositoryRoot: resolve(root, 'tests') })).rejects.toThrow('LOCAL_PREPARED_CLOSURE_FAMILY_INVALID');
  expect(state.files.every(file => file.bytes.every(byte => byte === 0))).toBe(true);
});
it('rejects caller inventory overrides and accessors', async () => {
  let called = false;
  await expect(derivePreparedClosureFamily({ get repositoryRoot() { called = true; return root; } })).rejects.toThrow();
  expect(called).toBe(false);
  await expect(derivePreparedClosureFamily({ repositoryRoot: root, inventory: [] } as never)).rejects.toThrow();
});
