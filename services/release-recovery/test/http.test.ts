import { describe, expect, it, vi } from 'vitest'

import { bounded, githubArchiveRemainingMilliseconds, githubRedirect, json, parseGitHubJsonObject } from '../src/http.js'

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

  it('maps a locked body reader to the stable caller code', async () => {
    const response = responseAt(URL, '{}')
    const reader = response.body!.getReader()
    try {
      await expect(bounded(response, 16, 'LOCKED_BODY'))
        .rejects.toThrowError('LOCKED_BODY')
    } finally {
      reader.releaseLock()
    }
  })

  it('cancels a JSON body on response-metadata failure without awaiting hostile cleanup', async () => {
    let cancelled = false
    const response = responseAt(URL, new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
        return new Promise<void>(() => undefined)
      },
    }), { headers: { 'content-type': 'text/plain' } })

    await expect(json(fetchResponse(response), URL, {}, 'JSON_METADATA'))
      .rejects.toThrowError('JSON_METADATA')
    expect(cancelled).toBe(true)
  })

  it.each(['status', 'url', 'headers', 'body'] as const)(
    'maps a throwing response %s accessor to a stable JSON error',
    async property => {
      const response = responseAt(URL, '{}', { headers: { 'content-type': 'application/json' } })
      const hostile = new Proxy(response, {
        get(target, key) {
          if (key === property) throw new Error('upstream secret')
          return Reflect.get(target, key, target)
        },
      })
      await expect(json(fetchResponse(hostile), URL, {}, 'HOSTILE_RESPONSE'))
        .rejects.toThrowError('HOSTILE_RESPONSE')
    },
  )
})

describe('GitHub archive redirect transport', () => {
  function redirectResponse(url: string, target: string, status = 302, body: BodyInit | null = null): Response {
    return responseAt(url, body, { status, headers: { location: target } })
  }

  it.each([
    'https://intranet/archive.zip',
    'https://artifact.local/archive.zip',
    'https://artifact.internal/archive.zip',
    'https://artifact.localdomain/archive.zip',
    'https://artifact.home.arpa/archive.zip',
    'https://objects.githubusercontent.com./archive.zip',
  ])('rejects reserved or single-label redirect target %s', async target => {
    const fake = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url === URL) return redirectResponse(URL, target)
      return responseAt(url, 'archive')
    }) as typeof fetch

    await expect(githubRedirect(fake, URL, 'Bearer token'))
      .rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('cancels a non-302 first response without awaiting hostile cleanup', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
        return new Promise<void>(() => undefined)
      },
    })
    const fake = (async () => redirectResponse(URL, 'https://objects.githubusercontent.com/archive.zip', 200, body)) as typeof fetch

    await expect(githubRedirect(fake, URL, 'Bearer token'))
      .rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    expect(cancelled).toBe(true)
  })

  it('maps a throwing first-response status accessor to the stable archive error', async () => {
    const response = redirectResponse(URL, 'https://objects.githubusercontent.com/archive.zip')
    const hostile = new Proxy(response, {
      get(target, key) {
        if (key === 'status') throw new Error('upstream secret')
        return Reflect.get(target, key, target)
      },
    })
    await expect(githubRedirect((async () => hostile) as typeof fetch, URL, 'Bearer token'))
      .rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('attaches the five-minute archive deadline rather than the ten-second JSON deadline', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    try {
      const target = 'https://objects.githubusercontent.com/recovery.zip'
      const fake = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input)
        if (url === URL) return redirectResponse(URL, target)
        expect(init?.signal).toBeInstanceOf(AbortSignal)
        return responseAt(target, 'archive', { headers: { 'content-type': 'application/zip' } })
      }) as typeof fetch
      await githubRedirect(fake, URL, 'Bearer token')
      expect(timeout.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([10_000, 300_000])
    } finally {
      timeout.mockRestore()
    }
  })

  it('shares the archive-fetch hard deadline with downstream inspection', async () => {
    vi.useFakeTimers()
    try {
      const target = 'https://objects.githubusercontent.com/recovery.zip'
      const fake = (async (input: string | URL | Request) => String(input) === URL
        ? redirectResponse(URL, target)
        : responseAt(target, 'archive')) as typeof fetch
      const archive = await githubRedirect(fake, URL, 'Bearer token')
      expect(githubArchiveRemainingMilliseconds(archive)).toBe(300_000)
      await vi.advanceTimersByTimeAsync(120_000)
      expect(githubArchiveRemainingMilliseconds(archive)).toBe(180_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('maps an arbitrary hostile thrown value from a reader to the stable caller code', async () => {
    const hostile = new Proxy(Object.create(null), {
      getPrototypeOf() { throw new Error('prototype secret') },
    })
    const response = responseAt(URL, new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(hostile) },
    }))
    await expect(bounded(response, 16, 'HOSTILE_READ')).rejects.toThrowError('HOSTILE_READ')
  })
})
