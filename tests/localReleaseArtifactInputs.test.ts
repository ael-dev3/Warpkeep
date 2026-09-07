// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bindingRuntime from '../scripts/local-binding-runtime.mjs';
import * as bundleRuntime from '../scripts/local-operation-bundle-runtime.mjs';
import * as recoveryRuntime from '../scripts/local-recovery-bundle-runtime.mjs';

const profile = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1' as const;
const identity = { profile, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40) };
function recoveryResult(): Awaited<ReturnType<typeof recoveryRuntime.derivePreparedLinuxRecoveryBundle>> {
  const bytes = Buffer.from('fixture');
  const path = 'services/release-recovery/scripts/prepare-recovery-workflow-claim.bundle.mjs';
  return {...identity, profile: 'warpkeep-recovery-bundle-preparation-linux-x64-v1', path, bytes,
    sha256: 'd'.repeat(64), inputs: [], files: [
      {path: 'scripts/recovery-workflow-bundle-manifest-v1.json', bytes: Buffer.from('{}')}, {path, bytes},
    ]};
}
beforeEach(() => vi.spyOn(recoveryRuntime, 'derivePreparedLinuxRecoveryBundle').mockResolvedValue(recoveryResult()));

function bindingResult(): bindingRuntime.PreparedAllRealmLinuxBindings {
  const digest = 'c'.repeat(64);
  return {
    ...identity,
    genesis001: {
      current: { bundleSha256: digest, dependencyClosureDigest: digest, bindingFileCount: 180 },
      compatibility: {
        baselineBundleSha256: digest, frozenBundleSha256: digest,
        baselineDescriptorSha256: digest, frozenDescriptorSha256: digest,
        checkedFrozenWriters: ['admin_allow_fid', 'admin_admit_founder_v1', 'admin_disable_fid',
          'admin_bump_auth_epoch', 'access_request_submit_v1', 'admin_reset_access_request_v1'],
      },
    },
    genesis002: { bundleSha256: digest, dependencyClosureDigest: digest,
      bindings: [{ path: 'scripts/genesis002_module_bindings/index.ts', bytes: new Uint8Array([1]) }] },
    ptr: { bundleSha256: digest, dependencyClosureDigest: digest,
      bindings: [{ path: 'spacetimedb/ptr/generated-bindings/index.ts', bytes: new Uint8Array([2]) }] },
  };
}

function bundleResult() {
  return { ...identity, files: [
    ...['activation', 'g001', 'g002', 'ptr'].flatMap(lane => ['mjs', 'd.mts'].map(suffix => ({
      path: `scripts/sealed-realms-production-${lane}-lane.bundle.${suffix}`, bytes: new Uint8Array([3]),
    }))),
    { path: 'scripts/sealed-realms-production-bundle-manifest-v1.json', bytes: new Uint8Array([4]) },
  ] };
}

async function coordinator() {
  const module = await import('../scripts/local-release-artifact-inputs.mjs');
  return module.derivePreparedLinuxArtifactInputs;
}

afterEach(() => vi.restoreAllMocks());

describe('fixed release artifact input coordination', () => {
  it.each([{sourceCommit: 'c'.repeat(40)}, {sourceTree: 'c'.repeat(40)}, {profile: 'other'}])(
    'rejects a recovery producer from a different source or profile %j', async changed => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      vi.spyOn(bindingRuntime, 'derivePreparedAllRealmLinuxBindings').mockResolvedValue(bindingResult());
      vi.spyOn(bundleRuntime, 'derivePreparedLinuxOperationBundleFiles').mockResolvedValue(bundleResult());
      vi.mocked(recoveryRuntime.derivePreparedLinuxRecoveryBundle).mockResolvedValue({...recoveryResult(), ...changed} as never);
      await expect((await coordinator())()).rejects.toMatchObject({code: 'LOCAL_RELEASE_ARTIFACT_SOURCE_MISMATCH'});
    });
  it('returns matching verified producer results without creating G001 output files', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    const bindings = bindingResult();
    const bundles = bundleResult();
    vi.spyOn(bindingRuntime, 'derivePreparedAllRealmLinuxBindings').mockResolvedValue(bindings);
    vi.spyOn(bundleRuntime, 'derivePreparedLinuxOperationBundleFiles').mockResolvedValue(bundles);
    const run = await coordinator();
    const result = await run();
    const recovery = recoveryResult();
    const files = [...bindings.genesis002.bindings, ...bindings.ptr.bindings, ...bundles.files, ...recovery.files]
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    expect(result).toEqual({ ...identity, bindings, bundles, recovery, files });
    expect(result.files.map(file => file.path)).toEqual([...result.files.map(file => file.path)].sort());
    expect(result.files.at(-1)?.path).toBe('spacetimedb/ptr/generated-bindings/index.ts');
    expect(result.files).toHaveLength(13);
    expect(Object.isFrozen(result.files)).toBe(true);
    // Sorting is a copy; source producer ordering and byte ownership survive.
    expect(bundles.files[0].path).toBe('scripts/sealed-realms-production-activation-lane.bundle.mjs');
    expect(result.files.find(file => file.path === bindings.ptr.bindings[0].path)?.bytes)
      .toBe(bindings.ptr.bindings[0].bytes);
  });

  it.each([
    { sourceCommit: 'c'.repeat(40) },
    { sourceTree: 'c'.repeat(40) },
    { profile: 'another-profile' },
  ])('rejects mixed source identity %j', async changed => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.spyOn(bindingRuntime, 'derivePreparedAllRealmLinuxBindings').mockResolvedValue(bindingResult());
    vi.spyOn(bundleRuntime, 'derivePreparedLinuxOperationBundleFiles').mockResolvedValue({ ...bundleResult(), ...changed } as never);
    const run = await coordinator();
    await expect(run()).rejects.toMatchObject({ code: 'LOCAL_RELEASE_ARTIFACT_SOURCE_MISMATCH' });
  });

  it.each([
    { sourceCommit: 'invalid' }, { sourceTree: '' }, { profile: 'another-profile' },
  ])('rejects invalid first identity before invoking the second producer %j', async changed => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.spyOn(bindingRuntime, 'derivePreparedAllRealmLinuxBindings').mockResolvedValue({ ...bindingResult(), ...changed } as never);
    const later = vi.spyOn(bundleRuntime, 'derivePreparedLinuxOperationBundleFiles').mockRejectedValue(new Error('must not run'));
    const run = await coordinator();
    await expect(run()).rejects.toMatchObject({ code: 'LOCAL_RELEASE_ARTIFACT_SOURCE_INVALID' });
    expect(later).not.toHaveBeenCalled();
  });

  it('preserves a producer failure and never continues to bundles', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    const failure = new Error('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
    vi.spyOn(bindingRuntime, 'derivePreparedAllRealmLinuxBindings').mockRejectedValue(failure);
    const later = vi.spyOn(bundleRuntime, 'derivePreparedLinuxOperationBundleFiles').mockRejectedValue(new Error('must not run'));
    const run = await coordinator();
    await expect(run()).rejects.toBe(failure);
    expect(later).not.toHaveBeenCalled();
  });

  it('rejects explicit arguments and non-Linux hosts before producers', async () => {
    const first = vi.spyOn(bindingRuntime, 'derivePreparedAllRealmLinuxBindings').mockRejectedValue(new Error('must not run'));
    const run = await coordinator();
    await expect((run as (...args: unknown[]) => Promise<unknown>)(undefined))
      .rejects.toMatchObject({ code: 'LOCAL_RELEASE_ARTIFACT_ARGUMENTS_INVALID' });
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    await expect(run()).rejects.toMatchObject({ code: 'LOCAL_RELEASE_ARTIFACT_HOST_INVALID' });
    expect(first).not.toHaveBeenCalled();
  });
});
