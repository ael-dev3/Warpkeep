import type { Stats } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  resolveAttestedSystemUnzip,
  SYSTEM_UNZIP_CANDIDATES
} from '../scripts/system-unzip.mjs';

function fakeStats(overrides: Partial<Pick<Stats, 'uid' | 'mode'>> = {}) {
  return {
    uid: 0,
    mode: 0o100755,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides
  } as Stats;
}

describe('attested system unzip resolution', () => {
  it('selects an Info-ZIP-compatible Git for Windows binary, not the incompatible tar CLI', () => {
    expect(SYSTEM_UNZIP_CANDIDATES.win32).toEqual([
      'C:/Program Files/Git/usr/bin/unzip.exe',
      'C:/Program Files (x86)/Git/usr/bin/unzip.exe'
    ]);
    expect(SYSTEM_UNZIP_CANDIDATES.win32).not.toContain('C:/Windows/System32/tar.exe');
    expect(resolveAttestedSystemUnzip({
      platform: 'win32',
      lstat: () => fakeStats(),
      access: vi.fn()
    })).toBe('C:/Program Files/Git/usr/bin/unzip.exe');
  });

  it('accepts only an executable, root-owned, non-writable ordinary file at a fixed absolute path', () => {
    const access = vi.fn();
    expect(resolveAttestedSystemUnzip({
      platform: 'test',
      candidates: ['/usr/bin/unzip'],
      lstat: () => fakeStats(),
      access
    })).toBe('/usr/bin/unzip');
    expect(access).toHaveBeenCalledOnce();
  });

  it.each([
    ['relative path', ['unzip'], fakeStats()],
    ['non-root owner', ['/usr/bin/unzip'], fakeStats({ uid: 501 })],
    ['group-writable file', ['/usr/bin/unzip'], fakeStats({ mode: 0o100775 })],
    ['non-executable file', ['/usr/bin/unzip'], fakeStats({ mode: 0o100644 })]
  ])('rejects a %s', (_case, candidates, details) => {
    expect(() => resolveAttestedSystemUnzip({
      platform: 'test',
      candidates,
      lstat: () => details,
      access: () => undefined
    })).toThrow(/No attested system unzip/i);
  });

  it('rejects symbolic links even when they resolve to a regular file', () => {
    const details = {
      ...fakeStats(),
      isSymbolicLink: () => true
    } as Stats;
    expect(() => resolveAttestedSystemUnzip({
      platform: 'test',
      candidates: ['/usr/bin/unzip'],
      lstat: () => details,
      access: () => undefined
    })).toThrow(/non-symlink/i);
  });
});
