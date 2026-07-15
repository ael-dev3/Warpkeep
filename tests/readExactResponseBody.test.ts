import { describe, expect, it } from 'vitest';

import { readExactResponseBody } from '../scripts/read-exact-response-body.mjs';

function streamedResponse(chunks: readonly Uint8Array[], contentLength?: string) {
  return {
    headers: new Headers(contentLength ? { 'content-length': contentLength } : undefined),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      }
    })
  } as Response;
}

describe('bounded release response reader', () => {
  it('accepts exactly the pinned streamed byte count', async () => {
    const bytes = await readExactResponseBody(
      streamedResponse([Uint8Array.of(1, 2), Uint8Array.of(3)], '3'),
      3,
      'fixture'
    );
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it('rejects changed declarations, truncation, and oversized bodies', async () => {
    await expect(readExactResponseBody(
      streamedResponse([Uint8Array.of(1, 2)], '9'),
      2,
      'fixture'
    )).rejects.toThrow(/declared byte length changed/i);
    await expect(readExactResponseBody(
      streamedResponse([Uint8Array.of(1)]),
      2,
      'fixture'
    )).rejects.toThrow(/byte length changed: 1/i);
    await expect(readExactResponseBody(
      streamedResponse([Uint8Array.of(1, 2, 3)]),
      2,
      'fixture'
    )).rejects.toThrow(/exceeded its pinned 2-byte boundary/i);
  });
});
