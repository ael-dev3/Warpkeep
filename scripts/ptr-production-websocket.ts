import type { DbConnection } from '../spacetimedb/ptr/generated-bindings';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

type Factory = Parameters<ReturnType<typeof DbConnection.builder>['withWSFn']>[0];
export type PtrEffectiveSession = Readonly<{ issuedAt: number; expiresAt: number; hexIdentity: string }>;
const HOST = 'https://maincloud.spacetimedb.com';
const KEYS = ['iss', 'sub', 'aud', 'token_type', 'roles', 'iat', 'nbf', 'exp', 'jti'];
function fail(): never { throw Object.assign(new Error('PTR_PRODUCTION_WS_SESSION_INVALID'), { code: 'PTR_PRODUCTION_WS_SESSION_INVALID' }); }
/** withWSFn replaces the SDK adapter as well as its exchange. Preserve framed binary delivery. */
function adapter(socket: WebSocket): Awaited<ReturnType<Factory>> {
  let onError: (event: ErrorEvent) => void = () => undefined;
  return {
    get protocol() { return socket.protocol; },
    send(bytes) { socket.send(bytes); }, close() { socket.close(); },
    set onopen(handler: () => void) { socket.onopen = handler; },
    set onclose(handler: (event: CloseEvent) => void) { socket.onclose = handler; },
    set onerror(handler: (event: ErrorEvent) => void) { onError = handler; socket.onerror = handler as (event: Event) => void; },
    set onmessage(handler: (event: { data: Uint8Array }) => void) {
      socket.onmessage = event => {
        try {
          if (!(event.data instanceof ArrayBuffer)) fail();
          const bytes = new Uint8Array(event.data), data = bytes.subarray(1);
          if (bytes[0] === 0) handler({ data });
          else if (bytes[0] === 1) handler({ data: brotliDecompressSync(data) });
          else if (bytes[0] === 2) handler({ data: gunzipSync(data) });
          else fail();
        } catch { socket.close(); onError({ message: 'PTR_PRODUCTION_WS_MESSAGE_INVALID' } as ErrorEvent); }
      };
    },
  };
}
function claims(token: string): Record<string, unknown> {
  if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) fail();
  const bytes = Buffer.from(token.split('.')[1]!, 'base64url');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value) !== text) fail();
    return value as Record<string, unknown>;
  } finally { bytes.fill(0); }
}

/** The host verifies signatures; this boundary prevents exchanged authority or lifetime expansion. */
export function readPtrEffectiveAtlasSession(originalToken: string, exchangedToken: string, now: number): PtrEffectiveSession {
  const original = claims(originalToken), effective = claims(exchangedToken);
  if (!Number.isSafeInteger(now) || now < 0
    || Object.keys(original).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(original, key))
    || Object.keys(effective).length !== KEYS.length + 1 || [...KEYS, 'hex_identity'].some(key => !Object.hasOwn(effective, key))
    || original.iss !== 'https://auth.warpkeep.com' || original.sub !== 'service:hermes'
    || JSON.stringify(original.aud) !== '["warpkeep-ptr-spacetimedb"]'
    || JSON.stringify(original.roles) !== '["warpkeep-admin"]' || original.token_type !== 'spacetime-access'
    || ['iss', 'sub', 'aud', 'roles', 'token_type'].some(key => JSON.stringify(original[key]) !== JSON.stringify(effective[key]))
    || [original.iat, original.nbf, original.exp, effective.iat, effective.nbf, effective.exp].some(value => !Number.isSafeInteger(value) || (value as number) < 0)
    // The host renews iat but preserves the issuer's original activation bound.
    || original.nbf !== original.iat || effective.nbf !== original.nbf
    || (effective.iat as number) < (original.iat as number)
    || (original.exp as number) - (original.iat as number) !== 300
    || (effective.exp as number) <= (effective.iat as number)
    || (effective.exp as number) - (effective.iat as number) > 300
    || (effective.exp as number) > (original.exp as number)
    || (effective.iat as number) > now + 5 || (effective.exp as number) <= now
    || typeof effective.jti !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(effective.jti)
    || typeof effective.hex_identity !== 'string' || !/^[0-9a-f]{64}$/u.test(effective.hex_identity)) fail();
  return Object.freeze({ issuedAt: effective.iat as number, expiresAt: effective.exp as number, hexIdentity: effective.hex_identity });
}

/** Private, fixed-host equivalent of the SDK exchange, retaining only effective session metadata. */
export function createPtrAtlasWebSocketFactory(input: Readonly<{
  databaseIdentity: string; token: string; nowSeconds: () => number;
  session: (value: PtrEffectiveSession) => void;
  request?: typeof fetch; socket?: (url: URL, protocols: string[]) => WebSocket;
}>): Factory {
  return async args => {
    if (args.url.origin !== 'wss://maincloud.spacetimedb.com' || args.nameOrAddress !== input.databaseIdentity
      || args.authToken !== input.token || !/^[0-9a-f]{64}$/u.test(input.databaseIdentity)) fail();
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 8000);
    let exchanged = '';
    try {
      const response = await (input.request ?? fetch)(HOST + '/v1/identity/websocket-token', {
        method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${input.token}` }, signal: abort.signal,
      });
      if (!response.ok || response.body === null) fail();
      const reader = response.body.getReader(), buffers: Uint8Array[] = []; let size = 0;
      let body: unknown;
      try {
        for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 32768) fail(); buffers.push(next.value); }
        const bytes = Buffer.concat(buffers);
        try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } finally { bytes.fill(0); }
      } finally { for (const bytes of buffers) bytes.fill(0); await reader.cancel().catch(() => undefined); }
      if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
        || typeof (body as { token?: unknown }).token !== 'string') fail();
      exchanged = (body as { token: string }).token; (body as { token: string }).token = '';
      const effective = readPtrEffectiveAtlasSession(input.token, exchanged, input.nowSeconds());
      // The host can lead the local clock slightly. Never open the session before its actual activation.
      while (input.nowSeconds() < effective.issuedAt) {
        if (abort.signal.aborted) fail(); await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (abort.signal.aborted || effective.expiresAt - input.nowSeconds() <= 30) fail();
      const url = new URL(`/v1/database/${input.databaseIdentity}/subscribe`, HOST);
      url.protocol = 'wss:'; url.searchParams.set('token', exchanged);
      url.searchParams.set('compression', { gzip: 'Gzip', brotli: 'Brotli', none: 'None' }[args.compression]);
      if (args.lightMode) url.searchParams.set('light', 'true');
      if (args.confirmedReads !== undefined) url.searchParams.set('confirmed', String(args.confirmedReads));
      const socket = (input.socket ?? ((address, protocols) => new WebSocket(address, protocols)))(url, args.wsProtocol);
      socket.binaryType = 'arraybuffer'; input.session(effective); return adapter(socket);
    } catch { return fail(); } finally { exchanged = ''; clearTimeout(timer); }
  };
}
