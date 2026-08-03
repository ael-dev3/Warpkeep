import { describe, expect, it, vi } from 'vitest';

import {
  copyFarcasterAuthDiagnosticReport,
  createFarcasterAuthSupportCode,
  farcasterAuthSafeDiagnosticReport
} from '../src/farcaster/farcasterAuthDiagnostics';

describe('Farcaster auth diagnostics', () => {
  it('creates an opaque code from random bytes only and clears the source buffer', () => {
    let observed: Uint8Array<ArrayBuffer> | undefined;
    const code = createFarcasterAuthSupportCode((target) => {
      observed = target;
      target.set([0, 1, 2, 3, 4, 5]);
    });

    expect(code).toBe('WK-ABCDEF');
    expect(Array.from(observed ?? [])).toEqual([0, 0, 0, 0, 0, 0]);
    expect(createFarcasterAuthSupportCode(() => {
      throw new Error('random source unavailable');
    })).toBe('WK-UNAVAIL');
  });

  it('formats only bounded allowlisted device and entry facts', () => {
    const report = farcasterAuthSafeDiagnosticReport({
      version: '0.3.43',
      build: '9B3AF43',
      stage: 'quick_auth_token_timeout',
      host: 'miniapp',
      platform: 'mobile',
      viewportWidth: 390.4,
      viewportHeight: 844.2,
      online: true,
      supportCode: 'WK-ABCDEF'
    });

    expect(report).toBe([
      'Warpkeep Alpha 0.3.43',
      'Build: 9b3af43',
      'Entry stage: quick_auth_token_timeout',
      'Host: miniapp',
      'Platform: mobile',
      'Viewport: 390x844',
      'Online: yes',
      'Support code: WK-ABCDEF'
    ].join('\n'));
    expect(report).not.toMatch(/539854|private|username|cookie|authorization|profile|query|ip=/i);
  });

  it('does not copy forged free-form values through the bounded report', () => {
    const privateSentinel = 'PRIVATE_TOKEN_FID_539854';
    const report = farcasterAuthSafeDiagnosticReport({
      version: privateSentinel,
      build: privateSentinel,
      stage: privateSentinel,
      host: 'miniapp',
      platform: 'unknown',
      viewportWidth: Number.POSITIVE_INFINITY,
      viewportHeight: -1,
      supportCode: privateSentinel
    });

    expect(report).not.toContain(privateSentinel);
    expect(report).toContain('Entry stage: deployment_contract_mismatch');
    expect(report).toContain('Viewport: unknown');
    expect(report).toContain('Support code: WK-UNAVAIL');
  });

  it('keeps clipboard access best-effort and local', async () => {
    const writer = { writeText: vi.fn(async () => {}) };
    await expect(copyFarcasterAuthDiagnosticReport('safe report', writer))
      .resolves.toBe(true);
    expect(writer.writeText).toHaveBeenCalledExactlyOnceWith('safe report');

    await expect(copyFarcasterAuthDiagnosticReport('safe report', {
      writeText: vi.fn(async () => { throw new Error('denied'); })
    })).resolves.toBe(false);
  });
});
