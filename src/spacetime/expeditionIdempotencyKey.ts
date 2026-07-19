const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Create a reducer retry key only from browser-grade entropy. Callers retain
 * this key until a private authority read proves the dispatch outcome.
 */
export function createExpeditionIdempotencyKey(): string | undefined {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) return undefined;
  try {
    if (typeof cryptoApi.randomUUID === 'function') {
      const key = cryptoApi.randomUUID();
      return typeof key === 'string' && UUID_V4_PATTERN.test(key)
        ? key.toLowerCase()
        : undefined;
    }
    if (typeof cryptoApi.getRandomValues !== 'function') return undefined;
    const bytes = new Uint8Array(16);
    // Native Web Crypto returns and fills this exact view. Seed it first so a
    // silent no-op or substituted-view polyfill fails closed instead of
    // producing a deterministic all-zero UUID.
    bytes.fill(0xa5);
    const returned = cryptoApi.getRandomValues(bytes);
    if (returned !== bytes || bytes.every((value) => value === 0xa5)) return undefined;
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    const key = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20)
    ].join('-');
    return UUID_V4_PATTERN.test(key) ? key : undefined;
  } catch {
    return undefined;
  }
}
