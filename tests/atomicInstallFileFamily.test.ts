import {
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ATOMIC_FAMILY_TRANSACTION_PREFIX,
  assertNoStaleAtomicFamilyTransactions,
  installAtomicFileFamily,
  readContainedRegularFile,
  resolveContainedPath
} from '../scripts/atomic-install-file-family.mjs';

const family = [
  { relativePath: 'high.glb', bytes: Buffer.from('new-high'), label: 'High' },
  { relativePath: 'balanced.glb', bytes: Buffer.from('new-balanced'), label: 'Balanced' },
  { relativePath: 'compact.glb', bytes: Buffer.from('new-compact'), label: 'Compact' }
];

describe('atomic file-family installer', () => {
  let fixtureRoot: string;
  let destinationRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-family-install-test-'));
    destinationRoot = join(fixtureRoot, 'destination');
    mkdirSync(destinationRoot);
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  function seedCompleteFamily() {
    writeFileSync(join(destinationRoot, 'high.glb'), 'old-high');
    writeFileSync(join(destinationRoot, 'balanced.glb'), 'old-balanced');
    writeFileSync(join(destinationRoot, 'compact.glb'), 'old-compact');
  }

  function expectNoTransactionDebris() {
    expect(
      readdirSync(destinationRoot).filter((name) =>
        name.startsWith(ATOMIC_FAMILY_TRANSACTION_PREFIX))
    ).toEqual([]);
  }

  it('stages on the destination filesystem and atomically replaces each family member', () => {
    seedCompleteFamily();
    let transactionDevice: bigint | number | undefined;

    installAtomicFileFamily({
      destinationRoot,
      entries: family,
      injectFailure: (context) => {
        if (context.phase === 'afterStage') {
          transactionDevice = lstatSync(context.transactionRoot).dev;
        }
      }
    });

    expect(transactionDevice).toBe(lstatSync(destinationRoot).dev);
    family.forEach((entry) => {
      expect(readFileSync(join(destinationRoot, entry.relativePath))).toEqual(entry.bytes);
    });
    expectNoTransactionDebris();
  });

  it('does not truncate an existing hard-linked destination inode', () => {
    const preservedLink = join(fixtureRoot, 'preserved-high.glb');
    writeFileSync(preservedLink, 'old-high');
    linkSync(preservedLink, join(destinationRoot, 'high.glb'));
    writeFileSync(join(destinationRoot, 'balanced.glb'), 'old-balanced');
    writeFileSync(join(destinationRoot, 'compact.glb'), 'old-compact');
    const oldInode = lstatSync(preservedLink).ino;

    installAtomicFileFamily({ destinationRoot, entries: family });

    expect(readFileSync(preservedLink, 'utf8')).toBe('old-high');
    expect(lstatSync(preservedLink).ino).toBe(oldInode);
    expect(lstatSync(join(destinationRoot, 'high.glb')).ino).not.toBe(oldInode);
    expect(readFileSync(join(destinationRoot, 'high.glb'))).toEqual(family[0].bytes);
    expectNoTransactionDebris();
  });

  it('rolls every destination back when a later replacement fails', () => {
    seedCompleteFamily();

    expect(() => installAtomicFileFamily({
      destinationRoot,
      entries: family,
      injectFailure: (context) => {
        if (context.phase === 'afterReplace' && context.index === 1) {
          throw new Error('injected replacement failure');
        }
      }
    })).toThrow(/injected replacement failure/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expect(readFileSync(join(destinationRoot, 'balanced.glb'), 'utf8')).toBe('old-balanced');
    expect(readFileSync(join(destinationRoot, 'compact.glb'), 'utf8')).toBe('old-compact');
    expectNoTransactionDebris();
  });

  it('leaves the original family intact when failure is injected after backup creation', () => {
    seedCompleteFamily();

    expect(() => installAtomicFileFamily({
      destinationRoot,
      entries: family,
      injectFailure: (context) => {
        if (context.phase === 'afterBackup' && context.index === 1) {
          throw new Error('injected backup-boundary failure');
        }
      }
    })).toThrow(/injected backup-boundary failure/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expect(readFileSync(join(destinationRoot, 'balanced.glb'), 'utf8')).toBe('old-balanced');
    expect(readFileSync(join(destinationRoot, 'compact.glb'), 'utf8')).toBe('old-compact');
    expectNoTransactionDebris();
  });

  it('restores present files and removes newly created files during rollback', () => {
    writeFileSync(join(destinationRoot, 'high.glb'), 'old-high');

    expect(() => installAtomicFileFamily({
      destinationRoot,
      entries: family,
      injectFailure: (context) => {
        if (context.phase === 'afterReplace' && context.index === 1) {
          throw new Error('injected mixed-family failure');
        }
      }
    })).toThrow(/injected mixed-family failure/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expect(() => lstatSync(join(destinationRoot, 'balanced.glb'))).toThrow();
    expect(() => lstatSync(join(destinationRoot, 'compact.glb'))).toThrow();
    expectNoTransactionDebris();
  });

  it('rolls the family back when exact post-replacement verification fails', () => {
    seedCompleteFamily();

    expect(() => installAtomicFileFamily({
      destinationRoot,
      entries: family,
      injectFailure: (context) => {
        if (context.phase === 'beforePostVerify') {
          writeFileSync(context.entries[2].destination, 'tampered-after-replace');
        }
      }
    })).toThrow(/does not match the staged exact bytes/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expect(readFileSync(join(destinationRoot, 'balanced.glb'), 'utf8')).toBe('old-balanced');
    expect(readFileSync(join(destinationRoot, 'compact.glb'), 'utf8')).toBe('old-compact');
    expectNoTransactionDebris();
  });

  it('keeps rollback active through the post-verification transaction boundary', () => {
    seedCompleteFamily();

    expect(() => installAtomicFileFamily({
      destinationRoot,
      entries: family,
      injectFailure: (context) => {
        if (context.phase === 'afterPostVerify') {
          throw new Error('injected post-verification failure');
        }
      }
    })).toThrow(/injected post-verification failure/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expect(readFileSync(join(destinationRoot, 'balanced.glb'), 'utf8')).toBe('old-balanced');
    expect(readFileSync(join(destinationRoot, 'compact.glb'), 'utf8')).toBe('old-compact');
    expectNoTransactionDebris();
  });

  it('preflights every destination before creating transaction state', () => {
    seedCompleteFamily();
    const outside = join(fixtureRoot, 'outside.glb');
    writeFileSync(outside, 'outside');
    rmSync(join(destinationRoot, 'compact.glb'));
    symlinkSync(outside, join(destinationRoot, 'compact.glb'));

    expect(() => installAtomicFileFamily({ destinationRoot, entries: family }))
      .toThrow(/symbolic-link path component/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expect(readFileSync(join(destinationRoot, 'balanced.glb'), 'utf8')).toBe('old-balanced');
    expect(readFileSync(outside, 'utf8')).toBe('outside');
    expectNoTransactionDebris();
  });

  it('fails closed on stale transaction state before starting a new install', () => {
    seedCompleteFamily();
    const stale = join(
      destinationRoot,
      `${ATOMIC_FAMILY_TRANSACTION_PREFIX}crash-evidence`
    );
    mkdirSync(stale);

    expect(() => assertNoStaleAtomicFamilyTransactions(destinationRoot))
      .toThrow(/unresolved atomic-family transaction state/);
    expect(() => installAtomicFileFamily({ destinationRoot, entries: family }))
      .toThrow(/unresolved atomic-family transaction state/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expect(readFileSync(join(destinationRoot, 'balanced.glb'), 'utf8')).toBe('old-balanced');
    expect(readFileSync(join(destinationRoot, 'compact.glb'), 'utf8')).toBe('old-compact');
    expect(readdirSync(stale)).toEqual([]);
  });

  it('detects same-size destination mutation before replacement and rolls back earlier files', () => {
    seedCompleteFamily();
    const balancedPath = join(destinationRoot, 'balanced.glb');
    const originalBalanced = readFileSync(balancedPath);
    const sameSizeMutation = Buffer.alloc(originalBalanced.byteLength, 0x4d);

    expect(() => installAtomicFileFamily({
      destinationRoot,
      entries: family,
      injectFailure: (context) => {
        if (context.phase === 'afterStage') {
          writeFileSync(balancedPath, sameSizeMutation);
        }
      }
    })).toThrow(/destination bytes changed after preflight/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expect(readFileSync(balancedPath)).toEqual(sameSizeMutation);
    expect(readFileSync(join(destinationRoot, 'compact.glb'), 'utf8')).toBe('old-compact');
    expectNoTransactionDebris();
  });

  it('rejects path traversal, symbolic-link leaves, and symbolic-link ancestors', () => {
    const sourceRoot = join(fixtureRoot, 'source');
    const actual = join(sourceRoot, 'actual');
    mkdirSync(sourceRoot);
    mkdirSync(actual);
    writeFileSync(join(actual, 'asset.glb'), 'authorized');
    symlinkSync(actual, join(sourceRoot, 'alias'));
    symlinkSync(join(actual, 'asset.glb'), join(sourceRoot, 'leaf.glb'));

    expect(() => resolveContainedPath(sourceRoot, '../outside.glb', 'source input'))
      .toThrow(/parent-directory segments/);
    expect(() => readContainedRegularFile({
      root: sourceRoot,
      relativePath: 'leaf.glb',
      label: 'symbolic leaf'
    })).toThrow(/symbolic-link path component/);
    expect(() => readContainedRegularFile({
      root: sourceRoot,
      relativePath: 'alias/asset.glb',
      label: 'symbolic ancestor'
    })).toThrow(/symbolic-link path component/);
    expect(readContainedRegularFile({
      root: sourceRoot,
      relativePath: 'actual/asset.glb',
      label: 'regular source'
    }).toString('utf8')).toBe('authorized');
  });

  it('rejects an output root reached through a symbolic-link ancestor', () => {
    const destinationAlias = join(fixtureRoot, 'destination-alias');
    symlinkSync(destinationRoot, destinationAlias);
    seedCompleteFamily();

    expect(() => installAtomicFileFamily({
      destinationRoot: destinationAlias,
      entries: family
    })).toThrow(/symbolic-link path component/);

    expect(readFileSync(join(destinationRoot, 'high.glb'), 'utf8')).toBe('old-high');
    expectNoTransactionDebris();
  });
});
