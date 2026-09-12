import { afterEach, expect, it, vi } from 'vitest'
import { createRecoveryGateway } from '../src/gateway.js'

const origin = 'https://release-auth.warpkeep.com'
const requestId = '123e4567-e89b-42d3-a456-426614174000'
const issue = { requestId, candidateCommit: 'a'.repeat(40), sourceVerifyRunId: '1', sourceVerifyRunAttempt: '1', artifactId: '2', oidcToken: 'private-opaque-token' }
function fixture() {
  const signer = { status: vi.fn(async () => ({ statusJws: 'opaque-status' })), issue: vi.fn(async () => ({ authorizationJws: 'opaque-authorization' })),
    claim: vi.fn(async () => ({ claimReceiptJws: 'opaque-claim' })), complete: vi.fn(async () => ({ terminalJws: 'opaque-terminal' })),
    reconcile: vi.fn(async () => ({ terminalJws: 'opaque-terminal' })), terminal: vi.fn(async () => ({ terminalJws: 'opaque-terminal' })) }
  const log = vi.fn()
  return { signer, log, gateway: createRecoveryGateway({ signer, log }) }
}
const post = (path: string, body: string | Uint8Array = JSON.stringify(issue), headers = {}) => new Request(origin + path,
  { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body as BodyInit })
afterEach(() => vi.useRealTimers())

it('routes all six endpoints with exact opaque payloads and safe responses/logs', async () => {
  const { gateway, signer, log } = fixture()
  for (const endpoint of ['issue', 'claim', 'complete', 'reconcile'] as const) {
    const value = { ...issue, ...(endpoint === 'claim' ? { authorizationJws: 'private-authorization' } : endpoint === 'issue' ? {} : { claimReceiptJws: 'private-claim' }) }
    const response = await gateway.fetch(post(`/v1/recovery/${endpoint}`, JSON.stringify(value)))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(response.headers.has('Location')).toBe(false)
    expect(signer[endpoint]).toHaveBeenCalledExactlyOnceWith(value)
    expect(Object.keys(await response.json())).toHaveLength(1)
  }
  expect((await gateway.fetch(new Request(origin + '/v1/recovery/status'))).status).toBe(200)
  expect(signer.status).toHaveBeenCalledExactlyOnceWith()
  expect((await gateway.fetch(new Request(origin + '/v1/recovery/requests/' + requestId))).status).toBe(200)
  expect(signer.terminal).toHaveBeenCalledExactlyOnceWith({ requestId })
  for (const [event] of log.mock.calls) expect(Object.keys(event)).toEqual(['schemaVersion', 'profile', 'endpoint', 'outcome', 'httpStatus', 'requestId'])
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|opaque-|candidateCommit|oidcToken/u)
})

it('rejects wrong origin/host/path/method/type, duplicate/extra keys and invalid JSON without RPC', async () => {
  const { gateway, signer } = fixture()
  const requests = [
    new Request('http://release-auth.warpkeep.com/v1/recovery/status'), new Request('https://evil.test/v1/recovery/status'),
    post('/v1/recovery/issue', undefined, { Origin: 'null' }), new Request(origin + '/v1/recovery/status?x=1'),
    new Request(origin + '/v1/recovery/%69ssue'), new Request(origin + '/v1/recovery/status', { method: 'OPTIONS' }),
    post('/v1/recovery/issue', undefined, { 'Content-Type': 'text/plain' }), post('/v1/recovery/issue', undefined, { 'Content-Encoding': 'gzip' }),
    post('/v1/recovery/issue', JSON.stringify({ ...issue, epoch: 3 })), post('/v1/recovery/issue', '{"requestId":"x","requestId":"y"}'),
    post('/v1/recovery/issue', new Uint8Array([0xff])), post('/v1/recovery/issue', '[]'), post('/v1/recovery/issue', '{'),
    post('/v1/recovery/complete', JSON.stringify({ ...issue, authorizationJws: 'must-not-accept' })),
  ]
  for (const request of requests) {
    const response = await gateway.fetch(request)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(Object.keys(await response.json())).toEqual(['code', 'requestId'])
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  }
  for (const method of Object.values(signer)) expect(method).not.toHaveBeenCalled()
})

it('bounds declared and streamed bodies and cancels a stalled body at its deadline', async () => {
  const { gateway, signer } = fixture()
  expect((await gateway.fetch(post('/v1/recovery/issue', 'x', { 'Content-Length': '32769' }))).status).toBe(413)
  expect((await gateway.fetch(post('/v1/recovery/issue', 'x'.repeat(32769)))).status).toBe(413)
  expect((await gateway.fetch(post('/v1/recovery/issue', JSON.stringify(issue), { 'Content-Length': '1' }))).status).toBe(400)
  vi.useFakeTimers()
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({ pull() {}, cancel })
  const request = new Request(origin + '/v1/recovery/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit)
  const pending = gateway.fetch(request)
  await vi.advanceTimersByTimeAsync(10001)
  expect((await pending).status).toBe(408)
  expect(cancel).toHaveBeenCalled()
  expect(signer.issue).not.toHaveBeenCalled()
})

it('redacts signer failures and malformed replies, and never retries RPC', async () => {
  const { gateway, signer, log } = fixture()
  signer.issue.mockRejectedValueOnce(new Error('secret-token-and-provider-url'))
  const failed = await gateway.fetch(post('/v1/recovery/issue'))
  expect(failed.status).toBe(503)
  expect(await failed.json()).toEqual({ code: 'RECOVERY_ISSUE_UNAVAILABLE', requestId })
  signer.issue.mockResolvedValueOnce({ authorizationJws: 'opaque', extra: 'secret' } as { authorizationJws: string })
  expect((await gateway.fetch(post('/v1/recovery/issue'))).status).toBe(503)
  expect(signer.issue).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret')
})

it('accepts exactly 32 KiB and cancels multi-chunk overflow before RPC', async () => {
  const { gateway, signer } = fixture()
  const json = JSON.stringify(issue)
  expect((await gateway.fetch(post('/v1/recovery/issue', json.padEnd(32768, ' ')))).status).toBe(200)
  const cancel = vi.fn()
  let chunk = 0
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    controller.enqueue(new Uint8Array(chunk++ === 0 ? 32768 : 1).fill(32))
  }, cancel })
  const request = new Request(origin + '/v1/recovery/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half' } as RequestInit)
  expect((await gateway.fetch(request)).status).toBe(413)
  expect(cancel).toHaveBeenCalled()
  expect(signer.issue).toHaveBeenCalledTimes(1)
})

it('bounds a stalled signer without retry and does not reflect logging failures', async () => {
  vi.useFakeTimers()
  const { gateway, signer, log } = fixture()
  signer.status.mockImplementationOnce(() => new Promise(() => {}))
  const pending = gateway.fetch(new Request(origin + '/v1/recovery/status'))
  await vi.advanceTimersByTimeAsync(20001)
  const response = await pending
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ code: 'RECOVERY_STATUS_UNAVAILABLE', requestId: null })
  expect(signer.status).toHaveBeenCalledTimes(1)
  log.mockImplementationOnce(() => { throw new Error('private-log-failure') })
  expect((await gateway.fetch(new Request(origin + '/v1/recovery/status'))).status).toBe(200)
})

it('accepts only the RPC-owned nonenumerable disposal method, cleans it up, and rejects other symbols/accessors', async () => {
  const { gateway, signer } = fixture()
  const dispose = vi.fn()
  const reply = Object.defineProperty({ statusJws: 'opaque-status' }, Symbol.dispose, { value: dispose, enumerable: false })
  signer.status.mockResolvedValueOnce(reply)
  expect((await gateway.fetch(new Request(origin + '/v1/recovery/status'))).status).toBe(200)
  expect(dispose).toHaveBeenCalledTimes(1)
  for (const invalid of [
    { statusJws: 'opaque', [Symbol('extra')]: true },
    { statusJws: 'opaque', [Symbol.dispose]: dispose },
    Object.defineProperty({ statusJws: 'opaque' }, Symbol.dispose, { get() { throw new Error('must not call accessor') } }),
  ]) {
    signer.status.mockResolvedValueOnce(invalid)
    expect((await gateway.fetch(new Request(origin + '/v1/recovery/status'))).status).toBe(503)
  }
})
