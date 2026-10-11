// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { createPtrAtlasWebSocketFactory, readPtrEffectiveAtlasSession } from '../scripts/ptr-production-websocket';

const NOW = 1800000000, IDENTITY = '1'.repeat(64), DATABASE = '2'.repeat(64);
const original = { iss: 'https://auth.warpkeep.com', sub: 'service:hermes', aud: ['warpkeep-ptr-spacetimedb'],
  token_type: 'spacetime-access', roles: ['warpkeep-admin'], iat: NOW, nbf: NOW, exp: NOW + 300, jti: 'original' };
const effective = { ...original, exp: NOW + 60, jti: 'exchanged', hex_identity: IDENTITY };
const jwt = (claims: unknown) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const args = { url: new URL('wss://maincloud.spacetimedb.com'), nameOrAddress: DATABASE,
  authToken: jwt(original), wsProtocol: ['v1.bsatn.spacetimedb'], compression: 'none' as const, lightMode: false, confirmedReads: true };

describe('PTR effective WebSocket session', () => {
  it('retains the actual shorter expiry and connected identity without retaining tokens', () => {
    expect(readPtrEffectiveAtlasSession(jwt(original), jwt(effective), NOW))
      .toEqual({ issuedAt: NOW, expiresAt: NOW + 60, hexIdentity: IDENTITY });
  });
  it.each([
    { exp: NOW + 301 }, { exp: NOW }, { exp: NOW + 60.5 }, { iat: NOW + 6, nbf: NOW + 6 },
    { nbf: NOW - 1 }, { iat: -1, nbf: -1 }, { iss: 'https://other.example' }, { sub: 'farcaster:1' },
    { aud: ['warpkeep-spacetimedb'] }, { roles: ['warpkeep-admin', 'warpkeep-ptr-owner'] },
    { token_type: 'other' }, { hex_identity: 'invalid' }, { jti: 'unsafe space' }, { owner_fid: '1' },
  ])('rejects exchanged authority, shape or lifetime changes: %j', overrides => {
    expect(() => readPtrEffectiveAtlasSession(jwt(original), jwt({ ...effective, ...overrides }), NOW))
      .toThrow('PTR_PRODUCTION_WS_SESSION_INVALID');
  });
  it('uses the fixed exchange and preserves SDK socket protocol options', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ token: jwt(effective) })));
    const session = vi.fn(), socket = { binaryType: '', protocol: 'v1.bsatn.spacetimedb', close: vi.fn() } as unknown as WebSocket;
    const open = vi.fn((_url: URL, _protocols: string[]) => socket);
    const factory = createPtrAtlasWebSocketFactory({ databaseIdentity: DATABASE, token: jwt(original),
      nowSeconds: () => NOW, request: request as typeof fetch, socket: open, session });
    const adapter = await factory(args); expect(adapter.protocol).toBe(socket.protocol);
    expect(request).toHaveBeenCalledWith('https://maincloud.spacetimedb.com/v1/identity/websocket-token',
      expect.objectContaining({ method: 'POST', redirect: 'error' }));
    const address = open.mock.calls[0]![0] as unknown as URL;
    expect(address.origin).toBe('wss://maincloud.spacetimedb.com');
    expect(address.pathname).toBe(`/v1/database/${DATABASE}/subscribe`);
    expect(address.searchParams.get('compression')).toBe('None');
    expect(address.searchParams.get('confirmed')).toBe('true');
    expect(socket.binaryType).toBe('arraybuffer'); expect(session).toHaveBeenCalledWith({ issuedAt: NOW, expiresAt: NOW + 60, hexIdentity: IDENTITY });
    const receive = vi.fn(); adapter.onmessage = receive;
    const content = new Uint8Array([10, 20, 30]);
    for (const [tag, bytes] of [[0, content], [1, brotliCompressSync(content)], [2, gzipSync(content)]] as const) {
      const framed = new Uint8Array(bytes.length + 1); framed[0] = tag; framed.set(bytes, 1);
      socket.onmessage!({ data: framed.buffer } as MessageEvent);
    }
    expect(receive.mock.calls.map(([event]) => Array.from(event.data))).toEqual([[10, 20, 30], [10, 20, 30], [10, 20, 30]]);
    const error = vi.fn(); adapter.onerror = error;
    socket.onmessage!({ data: new Uint8Array([9, 1]).buffer } as MessageEvent);
    expect(socket.close).toHaveBeenCalledOnce(); expect(error).toHaveBeenCalledWith({ message: 'PTR_PRODUCTION_WS_MESSAGE_INVALID' });
  });
  it.each(['target', 'short', 'extra', 'large', 'redirect'] as const)('never opens a socket after invalid %s exchange', async kind => {
    const payload = kind === 'extra' ? { token: jwt(effective), unexpected: true }
      : { token: jwt({ ...effective, exp: kind === 'short' ? NOW + 30 : NOW + 60 }) };
    const request = vi.fn(async () => new Response(kind === 'large' ? 'x'.repeat(32769) : JSON.stringify(payload), { status: kind === 'redirect' ? 302 : 200 }));
    const session = vi.fn(), socket = vi.fn();
    const factory = createPtrAtlasWebSocketFactory({ databaseIdentity: DATABASE, token: jwt(original),
      nowSeconds: () => NOW, request: request as typeof fetch, socket, session });
    await expect(factory({ ...args, nameOrAddress: kind === 'target' ? IDENTITY : DATABASE })).rejects.toThrow('PTR_PRODUCTION_WS_SESSION_INVALID');
    expect(socket).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
  });
});
