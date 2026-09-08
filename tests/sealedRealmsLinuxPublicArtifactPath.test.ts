// @vitest-environment node
import { expect, it, vi } from 'vitest';
const probe = vi.hoisted(() => vi.fn(() => { throw new Error('read-probe'); }));
vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(), lstatSync: probe,
}));
import { verifySealedRealmsPublicActivationArtifact } from '../scripts/verify-sealed-realms-public-activation-artifact.mjs';

it('opens only the fixed Linux artifact even if HOME points at a historical account', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const uid = Object.getOwnPropertyDescriptor(process, 'getuid');
  const home = process.env.HOME;
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
    Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1000 });
    process.env.HOME = '/home/runner';
    expect(() => verifySealedRealmsPublicActivationArtifact()).toThrow('read-probe');
    expect(probe).toHaveBeenCalledExactlyOnceWith(
      '/home/warpkeep/.warpkeep/private/sealed-realms-v1/runtime/sealed-realms-v1/public/0.4.0-sealed-launch.json',
      { bigint: true },
    );
    expect(() => Reflect.apply(verifySealedRealmsPublicActivationArtifact, undefined, ['/alternate']))
      .toThrow('SEALED_REALMS_PUBLIC_ACTIVATION_ARGUMENT_INVALID');
    expect(probe).toHaveBeenCalledTimes(1);
  } finally {
    Object.defineProperty(process, 'platform', platform);
    if (uid) Object.defineProperty(process, 'getuid', uid); else Reflect.deleteProperty(process, 'getuid');
    if (home === undefined) delete process.env.HOME; else process.env.HOME = home;
  }
});
