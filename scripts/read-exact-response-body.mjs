/**
 * Read a trusted release response without permitting a changed server to make
 * the reconstruction tool buffer an unbounded body. Hash verification remains
 * the caller's responsibility after this exact byte-count boundary.
 */
export async function readExactResponseBody(response, expectedBytes, label) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1) {
    throw new Error(`Invalid expected byte length for ${label}.`);
  }
  const contentEncoding = response.headers.get('content-encoding');
  const contentLength = response.headers.get('content-length');
  if (
    (!contentEncoding || contentEncoding.toLowerCase() === 'identity')
    && contentLength !== null
    && (!/^\d+$/.test(contentLength) || Number(contentLength) !== expectedBytes)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${label} declared byte length changed: ${contentLength}.`);
  }
  if (!response.body) throw new Error(`${label} response body is unavailable.`);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new Error(`${label} returned a non-binary response chunk.`);
      }
      total += value.byteLength;
      if (total > expectedBytes) {
        throw new Error(`${label} exceeded its pinned ${expectedBytes}-byte boundary.`);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedBytes) {
    throw new Error(`${label} byte length changed: ${total}.`);
  }
  return Buffer.concat(chunks, total);
}
