import { afterEach, expect, it, vi } from 'vitest';
import * as runtime from '../scripts/local-binding-runtime.mjs';
import * as core from '../scripts/local-binding-runtime-core.mjs';

afterEach(() => {
  vi.doUnmock('../scripts/local-binding-runtime-core.mjs');
  vi.resetModules();
});

it('exposes one fixed all-realm derivation', () => {
  expect(runtime.derivePreparedAllRealmLinuxBindings).toEqual(expect.any(Function));
  expect(core.deriveFixedAllRealmLocalBindingRuntime).toEqual(expect.any(Function));
});

it('rejects even explicit undefined instead of accepting caller-selected authority', async () => {
  await expect((runtime.derivePreparedAllRealmLinuxBindings as unknown as
    (input: unknown) => Promise<unknown>)(undefined))
    .rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID' });
});

it('returns only metadata for G001 and defensive installable G002/PTR bindings', async () => {
  const genesis002Bytes = Uint8Array.of(1, 2, 3);
  const ptrBytes = Uint8Array.of(4, 5, 6);
  vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
    deriveFixedAllRealmLocalBindingRuntime: async () => ({
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
      sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
      genesis001: {
        current: {
          bundleSha256: '3'.repeat(64), dependencyClosureDigest: '4'.repeat(64),
          bindingFileCount: 7, bindings: [{ path: 'forbidden.ts', bytes: Uint8Array.of(9) }],
        },
        compatibility: {
          baselineBundleSha256: '5'.repeat(64), frozenBundleSha256: '6'.repeat(64),
          baselineDescriptorSha256: '7'.repeat(64), frozenDescriptorSha256: '8'.repeat(64),
          checkedFrozenWriters: [
            'admin_allow_fid', 'admin_admit_founder_v1', 'admin_disable_fid',
            'admin_bump_auth_epoch', 'access_request_submit_v1', 'admin_reset_access_request_v1',
          ],
          rawBundle: Uint8Array.of(10),
        },
      },
      genesis002: {
        bundleSha256: '9'.repeat(64), dependencyClosureDigest: 'a'.repeat(64),
        bindings: [{ path: 'scripts/genesis002_module_bindings/index.ts', bytes: genesis002Bytes }],
      },
      ptr: {
        bundleSha256: 'b'.repeat(64), dependencyClosureDigest: 'c'.repeat(64),
        bindings: [{ path: 'spacetimedb/ptr/generated-bindings/index.ts', bytes: ptrBytes }],
      },
      privatePath: '/forbidden',
    }),
  }));
  const entrypoint = await import('../scripts/local-binding-runtime.mjs');
  const result = await entrypoint.derivePreparedAllRealmLinuxBindings();
  genesis002Bytes[0] = 99;
  ptrBytes[0] = 99;

  expect(Object.keys(result).sort()).toEqual([
    'genesis001', 'genesis002', 'profile', 'ptr', 'sourceCommit', 'sourceTree',
  ]);
  expect(Object.keys(result.genesis001).sort()).toEqual(['compatibility', 'current']);
  expect(Object.keys(result.genesis001.current).sort()).toEqual([
    'bindingFileCount', 'bundleSha256', 'dependencyClosureDigest',
  ]);
  expect(Object.keys(result.genesis001.compatibility).sort()).toEqual([
    'baselineBundleSha256', 'baselineDescriptorSha256', 'checkedFrozenWriters',
    'frozenBundleSha256', 'frozenDescriptorSha256',
  ]);
  expect(result.genesis002.bindings[0]!.bytes).toEqual(Uint8Array.of(1, 2, 3));
  expect(result.ptr.bindings[0]!.bytes).toEqual(Uint8Array.of(4, 5, 6));
  expect(JSON.stringify(result)).not.toContain('forbidden');
});
