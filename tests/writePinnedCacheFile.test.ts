import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writePinnedCacheFile } from '../scripts/write-pinned-cache-file.mjs';

const roots: string[] = [];

function stickySystemTemporaryRoot() {
  for (const candidate of [tmpdir(), '/tmp', '/var/tmp']) {
    try {
      const path = realpathSync(candidate);
      const metadata = lstatSync(path);
      if (
        metadata.uid === 0
        && (metadata.mode & 0o1000) !== 0
        && (metadata.mode & 0o002) !== 0
      ) return path;
    } catch {
      // The candidate is absent or inaccessible on this platform.
    }
  }
  return undefined;
}

const stickyTemporaryRoot = stickySystemTemporaryRoot();

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function fixtureRoot() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-cache-write-'));
  roots.push(root);
  return root;
}

describe('pinned cache-file publication', () => {
  it('creates owner-private directories beneath the platform temp root and atomically replaces a cache file', () => {
    const root = fixtureRoot();
    chmodSync(root, 0o700);
    const destination = join(root, 'nested', 'asset.bin');
    writePinnedCacheFile({
      destination,
      bytes: Buffer.from('first'),
      mode: 0o600,
      label: 'fixture cache',
    });
    const firstInode = lstatSync(destination).ino;
    writePinnedCacheFile({
      destination,
      bytes: Buffer.from('second'),
      mode: 0o600,
      label: 'fixture cache',
    });

    expect(readFileSync(destination, 'utf8')).toBe('second');
    expect(lstatSync(destination).ino).not.toBe(firstInode);
    expect(lstatSync(destination).mode & 0o777).toBe(0o600);
    expect(lstatSync(join(root, 'nested')).mode & 0o777).toBe(0o700);
    expect(readdirSync(join(root, 'nested'))).toEqual(['asset.bin']);
  });

  it.runIf(Boolean(stickyTemporaryRoot))(
    'accepts a private user-owned child beneath a root-owned sticky temporary directory',
    () => {
      const root = mkdtempSync(join(stickyTemporaryRoot as string, 'warpkeep-sticky-cache-'));
      roots.push(root);
      chmodSync(root, 0o700);
      const destination = join(root, 'asset.bin');

      writePinnedCacheFile({
        destination,
        bytes: Buffer.from('exact'),
        mode: 0o600,
      });

      expect(readFileSync(destination, 'utf8')).toBe('exact');
      expect(lstatSync(root).mode & 0o777).toBe(0o700);
    },
  );

  it('rejects symbolic-link destinations and ancestors without touching their targets', () => {
    const root = fixtureRoot();
    chmodSync(root, 0o700);
    const outside = join(root, 'outside');
    const cache = join(root, 'cache');
    mkdirSync(outside, { mode: 0o700 });
    mkdirSync(cache, { mode: 0o700 });
    const target = join(outside, 'target.bin');
    writeFileSync(target, 'unchanged');
    symlinkSync(target, join(cache, 'leaf.bin'));
    symlinkSync(outside, join(cache, 'alias'));

    expect(() => writePinnedCacheFile({
      destination: join(cache, 'leaf.bin'),
      bytes: Buffer.from('bad'),
      mode: 0o600,
    })).toThrow(/regular non-symbolic file/);
    expect(() => writePinnedCacheFile({
      destination: join(cache, 'alias', 'nested.bin'),
      bytes: Buffer.from('bad'),
      mode: 0o600,
    })).toThrow(/symbolic-link component/);
    expect(readFileSync(target, 'utf8')).toBe('unchanged');
  });

  it('rejects a cache directory writable by other users', () => {
    const root = fixtureRoot();
    chmodSync(root, 0o777);
    expect(() => writePinnedCacheFile({
      destination: join(root, 'asset.bin'),
      bytes: Buffer.from('bad'),
      mode: 0o600,
    })).toThrow(/owner-private directory/);
  });

  it('rejects a private leaf beneath a mutable path ancestor', () => {
    const root = fixtureRoot();
    chmodSync(root, 0o777);
    const privateLeaf = join(root, 'private');
    mkdirSync(privateLeaf, { mode: 0o700 });

    expect(() => writePinnedCacheFile({
      destination: join(privateLeaf, 'asset.bin'),
      bytes: Buffer.from('bad'),
      mode: 0o600,
    })).toThrow(/untrusted mutable path ancestor/);
    expect(readdirSync(privateLeaf)).toEqual([]);
  });
});
