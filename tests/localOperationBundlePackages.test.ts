// @vitest-environment node

import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertFixedOperationBundleNamespace,
  selectFixedOperationBundlePackages,
  validateFixedOperationBundleArchive,
} from '../scripts/local-operation-bundle-packages';

const ESBUILD_SRI = 'sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==';
const COMPANION_SRI = 'sha512-u/anNYF2mmVOEDwLtnQ1wOr3EZ9sTNGLWrsYGYwHWzGA3Si84IOkHXlbWTD1NB+9/1lcnweYKO54uhxZydNzfA==';

function fixedLock() {
  return {
    packages: {
      'node_modules/esbuild': {
        version: '0.28.1',
        resolved: 'https://registry.npmjs.org/esbuild/-/esbuild-0.28.1.tgz',
        integrity: ESBUILD_SRI,
        optionalDependencies: { '@esbuild/linux-x64': '0.28.1' },
      },
      'node_modules/@esbuild/linux-x64': {
        version: '0.28.1',
        resolved: 'https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.1.tgz',
        integrity: COMPANION_SRI,
        os: ['linux'], cpu: ['x64'],
      },
    },
  };
}

describe('fixed operation bundle compiler packages', () => {
  it('selects only the fixed esbuild 0.28.1 Linux x64 pair', () => {
    const selected = selectFixedOperationBundlePackages(fixedLock());
    expect(selected.map(entry => entry.key)).toEqual([
      'node_modules/esbuild',
      'node_modules/@esbuild/linux-x64',
    ]);
    expect(selected.map(entry => entry.integrity)).toEqual([ESBUILD_SRI, COMPANION_SRI]);
  });

  it.each([
    ['missing compiler', (lock: any) => { delete lock.packages['node_modules/esbuild']; }],
    ['wrong compiler URL', (lock: any) => { lock.packages['node_modules/esbuild'].resolved += '?mirror=1'; }],
    ['wrong companion OS', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].os = ['darwin']; }],
    ['wrong companion version', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].version = '0.28.0'; }],
  ])('rejects %s without transport', (_name, mutate) => {
    const lock = fixedLock();
    mutate(lock);
    expect(() => selectFixedOperationBundlePackages(lock)).toThrow('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
  });

  it('accepts only the seven authenticated compiler files and their exact lengths', () => {
    let offset = 0;
    const files = ([
      ['bin/esbuild', 9350], ['install.js', 11773], ['lib/main.js', 97214],
      ['package.json', 3980], ['LICENSE.md', 1069], ['README.md', 175],
      ['lib/main.d.ts', 23392],
    ] as const).map(([path, size]) => {
      const entry = { path, kind: 'file' as const, offset, size };
      offset += size;
      return entry;
    });
    expect(validateFixedOperationBundleArchive('node_modules/esbuild', {
      uncompressed: Buffer.alloc(offset), entries: files, fileBytes: 146953,
    }).map(entry => entry.path)).toEqual(files.map(entry => `esbuild/${entry.path}`)
      .sort((left, right) => left.localeCompare(right)));
    expect(() => validateFixedOperationBundleArchive('node_modules/esbuild', {
      uncompressed: Buffer.alloc(offset + 1),
      entries: [...files, { path: 'unexpected.js', kind: 'file' as const, offset: 0, size: 1 }],
      fileBytes: 146954,
    })).toThrow('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
  });

  it('rejects extra files and links in a real temporary namespace', () => {
    const parent = mkdtempSync(join(tmpdir(), 'warpkeep-operation-packages-'));
    const root = join(parent, 'node_modules');
    const expected = [
      { path: 'esbuild/package.json', mode: 0o400, bytes: 2, sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
    ];
    try {
      mkdirSync(join(root, 'esbuild'), { recursive: true, mode: 0o700 });
      writeFileSync(join(root, 'esbuild', 'package.json'), '{}', { mode: 0o400 });
      expect(() => assertFixedOperationBundleNamespace(root, expected)).not.toThrow();
      chmodSync(join(root, 'esbuild', 'package.json'), 0o600);
      writeFileSync(join(root, 'esbuild', 'package.json'), '{"changed":true}', { mode: 0o400 });
      chmodSync(join(root, 'esbuild', 'package.json'), 0o400);
      expect(() => assertFixedOperationBundleNamespace(root, expected))
        .toThrow();
      chmodSync(join(root, 'esbuild', 'package.json'), 0o600);
      writeFileSync(join(root, 'esbuild', 'package.json'), '{}', { mode: 0o400 });
      chmodSync(join(root, 'esbuild', 'package.json'), 0o400);
      writeFileSync(join(root, 'extra'), 'x', { mode: 0o400 });
      expect(() => assertFixedOperationBundleNamespace(root, expected))
        .toThrow('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
      rmSync(join(root, 'extra'));
      symlinkSync(join(root, 'esbuild'), join(root, 'linked'), 'junction');
      expect(() => assertFixedOperationBundleNamespace(root, expected))
        .toThrow('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
});
