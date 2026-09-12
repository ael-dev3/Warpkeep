import { snapshotExactDataObject } from './config.js'
import { parseGitHubJsonObject } from './http.js'
import { snapshotSignerRequest } from './signerRequests.js'
import { snapshotPreparationRequest } from './preparationPolicy.js'

type Endpoint = 'preparation-observation' | 'prepare' | 'status' | 'issue' | 'claim' | 'complete' | 'reconcile' | 'terminal'
export type RecoverySignerService = Readonly<{
  preparationObservation?(request: Readonly<Record<string, string>>): Promise<unknown>
  prepare?(request: Readonly<Record<string, string>>): Promise<unknown>
  status(): Promise<unknown>
  issue(request: Readonly<Record<string, string>>): Promise<unknown>
  claim(request: Readonly<Record<string, string>>): Promise<unknown>
  complete(request: Readonly<Record<string, string>>): Promise<unknown>
  reconcile(request: Readonly<Record<string, string>>): Promise<unknown>
  terminal(request: Readonly<Record<string, string>>): Promise<unknown>
}>
export type RecoverySafeLogEvent = Readonly<{
  schemaVersion: 1; profile: 'warpkeep-release-recovery-safe-log-v1'
  endpoint: Endpoint | 'unknown'; outcome: 'success' | 'rejected' | 'unavailable'; httpStatus: number; requestId: string | null
}>
const ORIGIN = 'https://release-auth.warpkeep.com'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const KEYS = { 'preparation-observation': 'preparationObservationJws', prepare: 'preparationReceiptJws', status: 'statusJws', issue: 'authorizationJws', claim: 'claimReceiptJws', complete: 'terminalJws', reconcile: 'terminalJws', terminal: 'terminalJws' } as const
const UNAVAILABLE = { 'preparation-observation': 'RECOVERY_PREPARATION_OBSERVATION_UNAVAILABLE', prepare: 'RECOVERY_PREPARATION_UNAVAILABLE', unknown: 'RECOVERY_UNAVAILABLE', status: 'RECOVERY_STATUS_UNAVAILABLE', issue: 'RECOVERY_ISSUE_UNAVAILABLE', claim: 'RECOVERY_CLAIM_UNAVAILABLE',
  complete: 'RECOVERY_COMPLETE_UNAVAILABLE', reconcile: 'RECOVERY_RECONCILE_UNAVAILABLE', terminal: 'RECOVERY_TERMINAL_UNAVAILABLE' } as const
const ERRORS = { 400: 'RECOVERY_REQUEST_INVALID', 403: 'RECOVERY_ORIGIN_FORBIDDEN', 404: 'RECOVERY_ENDPOINT_NOT_FOUND',
  405: 'RECOVERY_METHOD_NOT_ALLOWED', 408: 'RECOVERY_BODY_TIMEOUT', 413: 'RECOVERY_BODY_TOO_LARGE', 415: 'RECOVERY_MEDIA_TYPE_INVALID' } as const
class Rejected extends Error { constructor(readonly status: keyof typeof ERRORS) { super('RECOVERY_GATEWAY_REJECTED') } }

/** Only for the trusted Worker service result, never for HTTP request data.
 * Workerd attaches one nonenumerable lifecycle method to RPC result objects. */
function rpcResponse(value: unknown, key: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object') throw new Error('RECOVERY_RESPONSE_INVALID')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const lifecycle = Object.getOwnPropertyDescriptor(value, Symbol.dispose)
  if (lifecycle !== undefined && (lifecycle.enumerable || !Object.hasOwn(lifecycle, 'value') || typeof lifecycle.value !== 'function')) throw new Error('RECOVERY_RESPONSE_INVALID')
  try {
    Reflect.deleteProperty(descriptors, Symbol.dispose)
    return snapshotExactDataObject(Object.create(Object.getPrototypeOf(value), descriptors), [key], 'RECOVERY_RESPONSE_INVALID')
  } finally {
    if (lifecycle !== undefined) { try { lifecycle.value.call(value) } catch { /* No result or error material is logged. */ } }
  }
}

async function bodyBytes(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get('Content-Length')
  if (declared !== null && !/^(?:0|[1-9][0-9]*)$/u.test(declared)) throw new Rejected(400)
  if (declared !== null && (!Number.isSafeInteger(Number(declared)) || Number(declared) > 32768)) throw new Rejected(413)
  if (request.body === null || request.signal.aborted) throw new Rejected(400)
  const reader = request.body.getReader()
  const buffer = new Uint8Array(32768)
  let count = 0
  let timeout: ReturnType<typeof setTimeout> | undefined
  let abort: () => void = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Rejected(408)), 10000)
    abort = () => reject(new Rejected(400))
    request.signal.addEventListener('abort', abort, { once: true })
    if (request.signal.aborted) abort()
  })
  try {
    while (true) {
      const part = await Promise.race([reader.read(), interrupted])
      if (part.done) break
      if (!(part.value instanceof Uint8Array)) throw new Rejected(400)
      if (part.value.byteLength > 32768 - count) throw new Rejected(413)
      buffer.set(part.value, count)
      count += part.value.byteLength
    }
    if (count === 0 || (declared !== null && count !== Number(declared))) throw new Rejected(400)
    return buffer.slice(0, count)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', abort)
    buffer.fill(0)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function boundedRpc(operation: () => Promise<unknown>, endpoint: Endpoint): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('RECOVERY_RPC_TIMEOUT')), (endpoint === 'prepare' || endpoint === 'preparation-observation') ? 110000 : endpoint === 'issue' ? 390000 : endpoint === 'claim' ? 95000 : 20000)
    })])
  } finally { clearTimeout(timeout) }
}

export function createRecoveryGateway(input: Readonly<{ signer: RecoverySignerService; log: (event: RecoverySafeLogEvent) => void }>) {
  return { async fetch(request: Request): Promise<Response> {
    let endpoint: Endpoint | 'unknown' = 'unknown'
    let requestId: string | null = null
    let invoking = false
    const respond = (status: number, body: unknown) => {
      const event: RecoverySafeLogEvent = Object.freeze({ schemaVersion: 1, profile: 'warpkeep-release-recovery-safe-log-v1', endpoint,
        outcome: status === 200 ? 'success' : status === 503 ? 'unavailable' : 'rejected', httpStatus: status, requestId })
      try { input.log(event) } catch { /* Logging cannot change a durable operation's response. */ }
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
    }
    try {
      if (request.headers.has('Origin')) throw new Rejected(403)
      const url = new URL(request.url)
      if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash
        || request.url !== ORIGIN + url.pathname
        || (request.headers.has('Host') && request.headers.get('Host') !== 'release-auth.warpkeep.com')) throw new Rejected(404)
      const path = url.pathname
      const terminalId = path.startsWith('/v1/recovery/requests/') ? path.slice('/v1/recovery/requests/'.length) : null
      if (terminalId !== null && UUID.test(terminalId)) { endpoint = 'terminal'; requestId = terminalId }
      else {
        const name = path.slice('/v1/recovery/'.length)
        if (!path.startsWith('/v1/recovery/') || name === 'terminal' || !Object.hasOwn(KEYS, name)) throw new Rejected(404)
        endpoint = name as Endpoint
      }
      const get = endpoint === 'status' || endpoint === 'terminal'
      if (request.method !== (get ? 'GET' : 'POST')) throw new Rejected(405)
      let parsed: Readonly<Record<string, string>> | undefined
      if (get) {
        if (request.body !== null || request.headers.has('Transfer-Encoding')
          || (request.headers.has('Content-Length') && request.headers.get('Content-Length') !== '0')) throw new Rejected(400)
        if (endpoint === 'terminal') parsed = snapshotSignerRequest('terminal', { requestId })
      } else {
        if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/iu.test(request.headers.get('Content-Type') ?? '')
          || (request.headers.has('Content-Encoding') && request.headers.get('Content-Encoding') !== 'identity')) throw new Rejected(415)
        const bytes = await bodyBytes(request)
        try {
          const value = parseGitHubJsonObject(bytes, 'RECOVERY_REQUEST_INVALID', [])
          parsed = (endpoint === 'prepare' || endpoint === 'preparation-observation') ? snapshotPreparationRequest(value) : snapshotSignerRequest(endpoint, value)
        }
        finally { bytes.fill(0) }
        requestId = parsed.requestId ?? null
      }
      invoking = true
      const selected = endpoint
      // Workerd RPC cannot serialize a null-prototype object. Only copy the
      // already-validated string fields; never spread unvalidated request data.
      const rpcRequest = parsed === undefined ? undefined : Object.freeze({ ...parsed })
      const result = await boundedRpc(() => selected === 'status' ? input.signer.status() : selected === 'preparation-observation' ? (input.signer.preparationObservation?.(rpcRequest!) ?? Promise.reject(new Error('RECOVERY_PREPARATION_OBSERVATION_UNAVAILABLE'))) : selected === 'prepare' ? (input.signer.prepare?.(rpcRequest!) ?? Promise.reject(new Error('RECOVERY_PREPARATION_UNAVAILABLE'))) : input.signer[selected](rpcRequest!), selected)
      const key = KEYS[selected]
      const response = rpcResponse(result, key)
      const compact = response[key]
      if (typeof compact !== 'string' || compact.length === 0 || compact.length > 16384 || !/^[\x21-\x7e]+$/u.test(compact)
        || new TextEncoder().encode(JSON.stringify(response)).length > 32768) throw new Error('RECOVERY_RESPONSE_INVALID')
      return respond(200, response)
    } catch (error) {
      const status = invoking ? 503 : error instanceof Rejected ? error.status : 400
      return respond(status, { code: status === 503 ? UNAVAILABLE[endpoint] : ERRORS[status], requestId })
    } finally { if (request.body !== null && !request.body.locked) void request.body.cancel().catch(() => {}) }
  } }
}
