// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { derivePreparedLinuxRecoveryBundle } from '../scripts/local-recovery-bundle-runtime.mjs';
afterEach(() => vi.restoreAllMocks());

it('rejects explicit caller inputs before local preparation', async () => {
  await expect(Reflect.apply(derivePreparedLinuxRecoveryBundle, null, [undefined]))
    .rejects.toThrow('LOCAL_RECOVERY_BUNDLE_RUNTIME_INVALID');
});
it.each([
  ['platform', 'win32'], ['arch', 'arm64'], ['execPath', '/usr/bin/node'],
] as const)('rejects an unapproved %s before source capture', async (field, value) => {
  vi.spyOn(process, field, 'get').mockReturnValue(value as never);
  await expect(derivePreparedLinuxRecoveryBundle()).rejects.toThrow('LOCAL_RECOVERY_BUNDLE_RUNTIME_INVALID');
});
