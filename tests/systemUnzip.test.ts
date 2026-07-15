import type { Stats } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { resolveAttestedSystemUnzip } from '../scripts/system-unzip.mjs';

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
