// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  darwin: vi.fn(() => { throw new Error('selected Darwin G002 source'); }),
  linux: vi.fn(() => { throw new Error('selected Linux G002 source'); }),
  cleanup: vi.fn(), attest: vi.fn(),
}));
vi.mock('../scripts/greater-realm-production-immutable-artifact.ts', () => ({ withGreaterRealmLockedSourceBuild: dependencies.darwin }));
vi.mock('../scripts/genesis002-binding-linux-locked-source-build.ts', () => ({ withGenesis002LinuxLockedSourceBuild: dependencies.linux }));
vi.mock('../scripts/spacetime-cli-attestation.mjs', () => ({
  attestPinnedSpacetimeCli: (...args: unknown[]) => {
    dependencies.attest(...args);
    return { path: '/private/cli', digest: 'e'.repeat(64), cleanup: dependencies.cleanup };
  },
}));
import { prepareGenesis002SourceBuiltArtifact } from '../scripts/genesis002-production-publisher.mjs';

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
const nativeFilesystem = process.platform !== 'win32';
afterEach(() => {
  Object.defineProperty(process, 'platform', platform); Object.defineProperty(process, 'arch', arch);
  vi.clearAllMocks();
});
function runtime(os: string, cpu: string) {
  Object.defineProperty(process, 'platform', { ...platform, value: os });
  Object.defineProperty(process, 'arch', { ...arch, value: cpu });
}
const prepare = () => prepareGenesis002SourceBuiltArtifact({ sourceCommit: 'a'.repeat(40),
  reattestSource: () => 'a'.repeat(40), dependencyCacheRoot: '/private/cache', materializationParent: '/private/builds',
  environment: { PATH: '/usr/bin:/bin' } });

describe('G002 source artifact runtime selection', () => {
  it.skipIf(!nativeFilesystem).each([['linux', 'x64', 'Linux'], ['darwin', 'arm64', 'Darwin']])(
    'selects the actual %s/%s build closure and retires failed preparation', (os, cpu, selected) => {
      runtime(os, cpu);
      expect(prepare).toThrow(`selected ${selected} G002 source`);
      expect(selected === 'Linux' ? dependencies.linux : dependencies.darwin).toHaveBeenCalledOnce();
      expect(selected === 'Linux' ? dependencies.darwin : dependencies.linux).not.toHaveBeenCalled();
      const call = (selected === 'Linux' ? dependencies.linux : dependencies.darwin).mock.calls[0] as unknown as [Record<string, unknown>];
      expect(call[0].materializationParent).toBe('/private/builds');
      expect(Object.hasOwn(call[0], 'generatedFiles')).toBe(selected === 'Darwin');
      expect(dependencies.cleanup).toHaveBeenCalledOnce();
    },
  );
  it.each([['linux', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['freebsd', 'x64']])(
    'refuses unsupported %s/%s before CLI or source access', (os, cpu) => {
      runtime(os, cpu);
      expect(prepare).toThrow('GENESIS_002_SOURCE_BUILD_RUNTIME_UNSUPPORTED');
      expect(dependencies.attest).not.toHaveBeenCalled();
      expect(dependencies.darwin).not.toHaveBeenCalled(); expect(dependencies.linux).not.toHaveBeenCalled();
    },
  );
});
