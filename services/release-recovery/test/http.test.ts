import { describe, expect, it } from 'vitest'

import { bounded, json, parseGitHubJsonObject } from '../src/http.js'

const URL = 'https://api.github.com/example'

function responseAt(
  url: string,
  body: BodyInit | null,
  init: ResponseInit = {},
): Response {
  const response = new Response(body, init)
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function fetchResponse(response: Response): typeof fetch {
  return (async () => response) as typeof fetch
}

describe('bounded GitHub JSON transport', () => {
  it('rejects duplicate names before a later value can shadow authority', async () => {
    const response = responseAt(
      URL,
      '{"id":9007199254740992,"id":9007199254740993}',
      { headers: { 'content-type': 'application/json' } },
    )

    await expect(json(fetchResponse(response), URL, {}, 'DUPLICATE'))
      .rejects.toThrowError('DUPLICATE')
  })

  it('keeps adjacent integers above 2^53 distinct until an ID schema consumes them', async () => {
    const body = '{"first":9007199254740992,"second":9007199254740993}'
    const response = responseAt(URL, body, {
      headers: { 'content-type': 'application/json' },
    })

    const value = await json(
      fetchResponse(response),
      URL,
      {},
      'PRECISE',
      200,
      ['first', 'second'],
    )

    expect(value.first).toBe('9007199254740992')
    expect(value.second).toBe('9007199254740993')
  })

  it('selects an integer ID by JSON path without treating a nested commit ID as numeric', () => {
    const value = parseGitHubJsonObject(
      new TextEncoder().encode(
        '{"id":9007199254740993,"head_commit":{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}',
      ),
      'PATH_ID',
      ['/id'],
    )

    expect(value.id).toBe('9007199254740993')
    expect((value.head_commit as Record<string, unknown>).id)
      .toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  })

  it.each([
    ['leading zero', '{"id":01}'],
    ['exponent', '{"id":1e3}'],
    ['fraction', '{"id":1.0}'],
  ])('rejects a %s GitHub ID lexeme', async (_name, body) => {
    const response = responseAt(URL, body, {
      headers: { 'content-type': 'application/json' },
    })

    await expect(
      json(fetchResponse(response), URL, {}, 'BAD_ID', 200, ['id']),
    ).rejects.toThrowError('BAD_ID')
  })

  it('rejects a declared content length that differs from streamed bytes', async () => {
    const response = responseAt(URL, '{}', {
      headers: { 'content-length': '3', 'content-type': 'application/json' },
    })

    await expect(json(fetchResponse(response), URL, {}, 'LENGTH'))
      .rejects.toThrowError('LENGTH')
  })

  it.each([
    ['missing', responseAt(URL, new TextEncoder().encode('{}'))],
    ['wrong', responseAt(URL, '{}', { headers: { 'content-type': 'text/plain' } })],
  ])('rejects a %s JSON media type', async (_name, response) => {
    await expect(json(fetchResponse(response), URL, {}, 'MEDIA'))
      .rejects.toThrowError('MEDIA')
  })

  it.each([
    ['wrong status', responseAt(URL, '{}', { status: 201, headers: { 'content-type': 'application/json' } })],
    ['missing final URL', new Response('{}', { headers: { 'content-type': 'application/json' } })],
    ['wrong final URL', responseAt('https://api.github.com/other', '{}', { headers: { 'content-type': 'application/json' } })],
  ])('rejects a response with a %s', async (_name, response) => {
    await expect(json(fetchResponse(response), URL, {}, 'METADATA'))
      .rejects.toThrowError('METADATA')
  })

  it('rejects a chunked body once its bytes exceed the configured limit', async () => {
    const response = responseAt(URL, new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4]))
        controller.close()
      },
    }))

    await expect(bounded(response, 3, 'OVERSIZE'))
      .rejects.toThrowError('OVERSIZE')
  })

  it('maps a chunked stream error to the stable caller code', async () => {
    const response = responseAt(URL, new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('upstream secret'))
      },
    }))

    await expect(bounded(response, 16, 'STREAM'))
      .rejects.toThrowError('STREAM')
  })

  it('bounds time while waiting for a stalled response body', async () => {
    const response = responseAt(URL, new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined)
      },
    }))

    await expect(bounded(response, 16, 'TIMEOUT', 5))
      .rejects.toThrowError('TIMEOUT')
  })

  it('maps a missing response body to the stable caller code', async () => {
    await expect(bounded(responseAt(URL, null), 16, 'NO_BODY'))
      .rejects.toThrowError('NO_BODY')
  })
})
