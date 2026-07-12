import type {
  ChallengeRecord,
  ChallengeStore,
  DurableObjectNamespace,
  DurableObjectState,
} from './types'

const RECORD_KEY = 'challenge'

function challengeUrl(path: 'record' | 'consume'): string {
  return `https://challenge-replay-guard.internal/${path}`
}

function isChallengeRecord(value: unknown): value is ChallengeRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<ChallengeRecord>
  return record.version === 1
    && typeof record.requestId === 'string'
    && typeof record.nonce === 'string'
    && typeof record.origin === 'string'
    && typeof record.domain === 'string'
    && typeof record.siweUri === 'string'
    && Number.isFinite(record.createdAt)
    && Number.isFinite(record.expiresAt)
}

async function responseRecord(response: Response): Promise<ChallengeRecord | null> {
  if (!response.ok) return null
  const value: unknown = await response.json()
  return isChallengeRecord(value) ? value : null
}

/**
 * A per-request Durable Object gives us serialized `consume` semantics. Cloudflare
 * KV alone is not used because get/delete cannot reliably enforce one-time use.
 */
export class DurableObjectChallengeStore implements ChallengeStore {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  private stub(requestId: string) {
    return this.namespace.get(this.namespace.idFromName(`warpkeep-challenge:${requestId}`))
  }

  async put(challenge: ChallengeRecord): Promise<void> {
    const response = await this.stub(challenge.requestId).fetch(challengeUrl('record'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(challenge),
    })
    if (!response.ok) throw new Error('Challenge store unavailable.')
  }

  async get(requestId: string): Promise<ChallengeRecord | null> {
    return responseRecord(await this.stub(requestId).fetch(challengeUrl('record')))
  }

  async consume(requestId: string): Promise<ChallengeRecord | null> {
    return responseRecord(await this.stub(requestId).fetch(challengeUrl('consume'), { method: 'POST' }))
  }
}

/**
 * Cloudflare Durable Object implementation. It is only reachable through the
 * internal namespace binding, never as a public HTTP route.
 */
export class ChallengeReplayGuard {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/record' && request.method === 'PUT') {
      const candidate: unknown = await request.json()
      if (
        !isChallengeRecord(candidate)
        || candidate.expiresAt <= Date.now()
        || candidate.createdAt >= candidate.expiresAt
      ) {
        return new Response(null, { status: 400 })
      }
      try {
        await this.state.storage.put(RECORD_KEY, candidate)
        await this.state.storage.setAlarm(candidate.expiresAt)
      } catch (error) {
        await this.state.storage.deleteAll()
        throw error
      }
      return new Response(null, { status: 204 })
    }

    if (url.pathname === '/record' && request.method === 'GET') {
      const challenge = await this.readUsableRecord()
      return challenge
        ? Response.json(challenge, { headers: { 'cache-control': 'no-store' } })
        : new Response(null, { status: 404 })
    }

    if (url.pathname === '/consume' && request.method === 'POST') {
      // Durable Object request processing is serialized, so deletion happens
      // before another request can obtain the same record.
      const challenge = await this.readUsableRecord()
      if (!challenge) return new Response(null, { status: 404 })
      await this.state.storage.deleteAll()
      return Response.json(challenge, { headers: { 'cache-control': 'no-store' } })
    }

    return new Response(null, { status: 404 })
  }

  /** Fully deallocate abandoned SQLite-backed objects at challenge expiry. */
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll()
  }

  private async readUsableRecord(): Promise<ChallengeRecord | null> {
    const candidate = await this.state.storage.get<unknown>(RECORD_KEY)
    if (candidate === undefined) return null
    if (!isChallengeRecord(candidate)) {
      await this.state.storage.deleteAll()
      return null
    }
    if (candidate.expiresAt <= Date.now()) {
      await this.state.storage.deleteAll()
      return null
    }
    return candidate
  }
}

/** Test/local adapter. Production uses DurableObjectChallengeStore. */
export class MemoryChallengeStore implements ChallengeStore {
  private readonly records = new Map<string, ChallengeRecord>()

  async put(challenge: ChallengeRecord): Promise<void> {
    this.records.set(challenge.requestId, challenge)
  }

  async get(requestId: string): Promise<ChallengeRecord | null> {
    const challenge = this.records.get(requestId)
    if (!challenge) return null
    if (challenge.expiresAt <= Date.now()) {
      this.records.delete(requestId)
      return null
    }
    return challenge
  }

  async consume(requestId: string): Promise<ChallengeRecord | null> {
    // Do not await between lookup and delete: this test adapter preserves the
    // same one-turn consume semantics as the production Durable Object.
    const challenge = this.records.get(requestId)
    if (!challenge) return null
    if (challenge.expiresAt <= Date.now()) {
      this.records.delete(requestId)
      return null
    }
    this.records.delete(requestId)
    return challenge
  }
}
