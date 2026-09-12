import { describe, expect, it } from 'vitest'

import {
  canonicalMapJsonBytes,
  parseRecoveryCompactJws,
  parseRecoveryHeader,
  parseRecoveryJson,
  sha256Hex,
  serializeExactObject,
} from '../src/protocol.js'
import type { JsonValue } from '../src/protocol.js'

const text = new TextDecoder()

describe('recovery protocol canonicalization', () => {
  it('domain-separates hashes so the same bytes cannot satisfy two recovery commitments', async () => {
    const bytes = new TextEncoder().encode('same-input')

    await expect(sha256Hex('recovery-core', bytes)).resolves.toBe('a5f89e0512c33374d8064d99b682b82ecdf1a6e664db48ac6eea60aab47dc0d7')
    await expect(sha256Hex('live-invariant', bytes)).resolves.not.toBe('a5f89e0512c33374d8064d99b682b82ecdf1a6e664db48ac6eea60aab47dc0d7')
  })

  it('length-prefixes hash domains so delimiter-containing inputs cannot collide', async () => {
    await expect(sha256Hex('a', new TextEncoder().encode('b:c')))
      .resolves.not.toBe(await sha256Hex('a:b', new TextEncoder().encode('c')))
  })

  it('sorts map keys so differently inserted maps cannot change a commitment', () => {
    expect(text.decode(canonicalMapJsonBytes({ z: 2, a: 1 }))).toBe('{"a":1,"z":2}')
  })

  it('uses the declared key order so an object insertion order cannot change signed bytes', () => {
    expect(text.decode(serializeExactObject(['alg', 'typ', 'kid'] as const, {
      kid: 'key',
      alg: 'ES256',
      typ: 'test',
    }))).toBe('{"alg":"ES256","typ":"test","kid":"key"}')
  })

  it('encodes non-ASCII text as literal UTF-8 bytes so signature inputs are portable', () => {
    expect([...canonicalMapJsonBytes({ value: 'é' })]).toEqual([
      123, 34, 118, 97, 108, 117, 101, 34, 58, 34, 195, 169, 34, 125,
    ])
  })

  it('rejects duplicate parsed names so an attacker cannot shadow a protected field', () => {
    expect(() => parseRecoveryJson('{"alg":"ES256","alg":"none"}'))
      .toThrowError('RECOVERY_JSON_INVALID')
  })

  it('rejects extra protected-header fields so unhandled JWS extensions cannot be smuggled', () => {
    expect(() => parseRecoveryHeader('{"alg":"ES256","typ":"warpkeep-0.4.0-recovery-status+jwt","kid":"warpkeep-0.4.0-recovery-2026-09-03-1","jwk":{}}'))
      .toThrowError('RECOVERY_JWS_HEADER_INVALID')
  })

  it('rejects unsafe integers so time and epoch comparisons cannot lose precision', () => {
    expect(() => canonicalMapJsonBytes({ epoch: Number.MAX_SAFE_INTEGER + 1 }))
      .toThrowError('RECOVERY_JSON_INVALID')
  })

  it('rejects malformed base64url so distinct compact encodings cannot share decoded bytes', () => {
    expect(() => parseRecoveryCompactJws('***.e30.AA', 'status'))
      .toThrowError('RECOVERY_JWS_COMPACT_INVALID')
  })

  it('rejects accessor-backed objects so serialization cannot execute attacker-controlled code', () => {
    const value = {} as { value?: string }
    Object.defineProperty(value, 'value', { enumerable: true, get: () => 'unsafe' })

    expect(() => canonicalMapJsonBytes(value)).toThrowError('RECOVERY_JSON_INVALID')
  })

  it('rejects cyclic values so unsupported JSON cannot exhaust the signing worker', () => {
    const value: Record<string, JsonValue> = {}
    value.self = value

    expect(() => canonicalMapJsonBytes(value)).toThrowError('RECOVERY_JSON_INVALID')
  })

  it('rejects proxy traps so serialization cannot accept an object with unstable keys', () => {
    const value = new Proxy({}, {
      ownKeys: () => {
        throw new Error('proxy trap')
      },
    })

    expect(() => canonicalMapJsonBytes(value)).toThrowError('RECOVERY_JSON_INVALID')
  })

  it('rejects getter-backed array entries so canonicalization never executes payload code', () => {
    const value: JsonValue[] = []
    Object.defineProperty(value, '0', { enumerable: true, get: () => 'unsafe' })
    value.length = 1

    expect(() => canonicalMapJsonBytes(value)).toThrowError('RECOVERY_JSON_INVALID')
  })

  it('rejects a transparent proxy so a signed field cannot change after validation', () => {
    const target = { kid: 'pinned', enabled: true }
    const value = new Proxy(target, {
      getOwnPropertyDescriptor(current, key) {
        return Object.getOwnPropertyDescriptor(current, key)
      },
      get(current, key) {
        if (key === 'kid') return 'attacker-selected'
        return Reflect.get(current, key)
      },
    })

    expect(() => canonicalMapJsonBytes(value)).toThrowError('RECOVERY_JSON_INVALID')
  })
})
