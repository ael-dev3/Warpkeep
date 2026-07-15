import { describe, expect, it } from 'vitest';

import {
  isLocalQaRuntimeAllowed,
  type LocalQaRuntimeContext
} from '../src/dev/localQaRuntime';

const ALLOWED_CONTEXT: LocalQaRuntimeContext = Object.freeze({
  compileGateEnabled: true,
  development: true,
  production: false,
  protocol: 'http:',
  hostname: '127.0.0.1'
});

describe('local QA runtime gate', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]'])(
    'allows the explicit development gate on exact loopback host %s',
    (hostname) => {
      expect(isLocalQaRuntimeAllowed({ ...ALLOWED_CONTEXT, hostname })).toBe(true);
    }
  );

  it.each([
    [{ compileGateEnabled: false }, 'disabled compile gate'],
    [{ development: false }, 'non-development runtime'],
    [{ production: true }, 'production runtime'],
    [{ protocol: 'file:' }, 'non-HTTP protocol'],
    [{ hostname: '192.168.1.25' }, 'LAN address'],
    [{ hostname: 'warpkeep.local' }, 'hostname alias'],
    [{ hostname: '127.0.0.1.example.com' }, 'loopback-looking suffix'],
    [{ hostname: '0.0.0.0' }, 'wildcard bind address']
  ] as const)('rejects %s (%s)', (override, _label) => {
    expect(isLocalQaRuntimeAllowed({ ...ALLOWED_CONTEXT, ...override })).toBe(false);
  });
});
