// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  darwin: vi.fn(() => { throw new Error('selected Darwin locked source'); }),
  linux: vi.fn(() => { throw new Error('selected Linux locked source'); }),
  cleanup: vi.fn(),
  attest: vi.fn(),
}));
vi.mock('../scripts/ptr-binding-locked-source-build.ts', () => ({ withPtrLockedSourceBuild: dependencies.darwin }));
vi.mock('../scripts/ptr-binding-linux-locked-source-build.ts', () => ({ withPtrLinuxLockedSourceBuild: dependencies.linux }));
vi.mock('../scripts/spacetime-cli-attestation.mjs', () => ({
  attestPinnedSpacetimeCli: (...args: unknown[]) => {
    dependencies.attest(...args);
    return { path: '/private/cli', digest: 'e'.repeat(64), cleanup: dependencies.cleanup };
  },
}));
// Source identity/clone is isolated here; the new real-Git suite tests those semantics.
vi.mock('../scripts/atlas/greater-realm-git.ts', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  return { runGreaterRealmTrustedGit: (args: readonly string[]) => {
    const cloneIndex = args.indexOf('clone');
    if (cloneIndex !== -1) {
      const root = args.at(-1)!;
      fs.mkdirSync(path.join(root, '.git', 'objects', 'info'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(root, '.git', 'info'), { mode: 0o700 });
      fs.writeFileSync(path.join(root, '.git', 'config'), '[core]\nfilemode = true\n', { mode: 0o600 });
    }
    const stdout = args.includes('--name-only') ? 'core.filemode\n'
      : args.includes('cat-file') ? 'commit\n'
        : args.includes('rev-parse') ? `${args.at(-1) === 'HEAD' ? 'a'.repeat(40) : 'b'.repeat(40)}\n` : '';
    return { status: 0, signal: null, stdout, stderr: '' };
  } };
});

import { preparePtrSourceBuiltArtifact } from '../scripts/ptr-production-publisher.mjs';

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
const nativeFilesystem = process.platform !== 'win32';
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  Object.defineProperty(process, 'arch', arch);
  vi.clearAllMocks();
});
const prepare = () => preparePtrSourceBuiltArtifact({ sourceCommit: 'a'.repeat(40),
  reattestSource: () => 'a'.repeat(40), dependencyCacheRoot: '/private/cache', environment: { PATH: '/usr/bin:/bin' } });
const runtime = (os: string, cpu: string) => {
  Object.defineProperty(process, 'platform', { ...platform, value: os });
  Object.defineProperty(process, 'arch', { ...arch, value: cpu });
};
describe('PTR source artifact runtime selection', () => {
  it.skipIf(!nativeFilesystem).each([['linux', 'x64', 'Linux'], ['darwin', 'arm64', 'Darwin']])(
    'uses the actual %s/%s locked builder and cleans failed artifact preparation', (os, cpu, selected) => {
      runtime(os, cpu);
      expect(prepare).toThrow(`selected ${selected} locked source`);
      expect(selected === 'Linux' ? dependencies.linux : dependencies.darwin).toHaveBeenCalledOnce();
      expect(selected === 'Linux' ? dependencies.darwin : dependencies.linux).not.toHaveBeenCalled();
      expect(dependencies.cleanup).toHaveBeenCalledOnce();
    },
  );
  it.each([['linux', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['freebsd', 'x64']])(
    'rejects unsupported %s/%s before touching the CLI or source builder', (os, cpu) => {
      runtime(os, cpu);
      expect(prepare).toThrow('PTR_PRODUCTION_SOURCE_BUILD_RUNTIME_UNSUPPORTED');
      expect(dependencies.attest).not.toHaveBeenCalled();
      expect(dependencies.darwin).not.toHaveBeenCalled();
      expect(dependencies.linux).not.toHaveBeenCalled();
    },
  );
});
