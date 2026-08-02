import {
  createPublicClient,
  decodeAbiParameters,
  http,
  parseAbi,
  verifyTypedData,
  type Address,
  type Hex,
} from 'viem'
import { optimism } from 'viem/chains'

import type { BridgeConfig } from './config'
import type {
  MiniAppWebhookVerifier,
  VerifiedMiniAppWebhookEvent,
} from './types'

const HUB_RESPONSE_TIMEOUT_MILLISECONDS = 5_000
const HUB_RESPONSE_MAX_BYTES = 2 * 1_024 * 1_024
const MAX_HUB_SIGNER_EVENTS = 2_048
const MAX_METADATA_BYTES = 4 * 1_024
const MAX_NOTIFICATION_TOKEN_BYTES = 2 * 1_024
const MAX_JFS_HEADER_BYTES = 1_024
const MAX_JFS_PAYLOAD_BYTES = 16 * 1_024
const KEY_REGISTRY_ADDRESS = '0x00000000fc1237824fb747abde0ff18990e59b7e' as const
const ID_REGISTRY_ADDRESS = '0x00000000fc6c5f01fc30151999387bb99a9f489b' as const
const SIGNED_KEY_REQUEST_VALIDATOR_ADDRESS =
  '0x00000000fc700472606ed4fa22623acf62c60553' as const

const KEY_REGISTRY_ABI = parseAbi([
  'function keyDataOf(uint256 fid, bytes key) view returns (uint8 state, uint32 keyType)',
])
const ID_REGISTRY_ABI = parseAbi([
  'function idOf(address owner) view returns (uint256 fid)',
])
const SIGNED_KEY_REQUEST_ABI = [{
  type: 'tuple',
  components: [
    { type: 'uint256' },
    { type: 'address' },
    { type: 'bytes' },
    { type: 'uint256' },
  ],
}] as const

type FetchLike = typeof fetch

type VerifyAppKeyResult = Readonly<{
  valid: true
  appFid: number
}> | Readonly<{
  valid: false
}>

type VerifyAppKey = (
  fid: number,
  appKey: string,
) => Promise<VerifyAppKeyResult>

type VerifyOnChainAppKeyAtRpc = (
  rpcUrl: string,
  fid: number,
  appKey: Hex,
  attestation: HubAppKeyAttestation,
) => Promise<boolean>

type ParsedNotificationDetails = Readonly<{
  token: string
  url: string
}>

type ParsedMiniAppWebhookEvent = Readonly<{
  event: 'miniapp_added' | 'notifications_enabled'
  notificationDetails?: ParsedNotificationDetails
}> | Readonly<{
  event: 'miniapp_removed' | 'notifications_disabled'
}>

type ParsedMiniAppWebhook = Readonly<{
  fid: number
  appFid: number
  event: ParsedMiniAppWebhookEvent
}>

type HubAppKeyAttestation = Readonly<{
  appFid: number
  requestSigner: Address
  signature: Hex
  deadline: bigint
  canonicalMetadata: string
}>

export type MiniAppWebhookVerifierDependencies = Readonly<{
  fetchImpl?: FetchLike
  /** Test seam only; production callers omit this complete authority verifier. */
  appKeyVerifier?: VerifyAppKey
  /** Test seam only; production callers retain the redundant Optimism checks. */
  activeOnChainAppKeyVerifier?: (
    config: BridgeConfig,
    fid: number,
    appKey: Hex,
    attestation: HubAppKeyAttestation,
  ) => Promise<boolean>
  /** Test seam below the redundant provider aggregator; production uses viem. */
  activeOnChainRpcVerifier?: VerifyOnChainAppKeyAtRpc
}>

export const MINI_APP_WEBHOOK_VERIFIER_FAILURE_STAGES = Object.freeze([
  'configuration',
  'hub_primary_fetch',
  'hub_primary_response',
  'hub_primary_attestation',
  'hub_secondary_fetch',
  'hub_secondary_response',
  'hub_secondary_attestation',
  'hub_attestation_conflict',
  'rpc_primary_transport',
  'rpc_secondary_transport',
  'rpc_disagreement',
  'unexpected',
] as const)

export type MiniAppWebhookVerifierFailureStage =
  typeof MINI_APP_WEBHOOK_VERIFIER_FAILURE_STAGES[number]

const MINI_APP_WEBHOOK_VERIFIER_FAILURE_STAGE_SET = new Set<string>(
  MINI_APP_WEBHOOK_VERIFIER_FAILURE_STAGES,
)

type HubFailureStages = Readonly<{
  fetch: MiniAppWebhookVerifierFailureStage
  response: MiniAppWebhookVerifierFailureStage
  attestation: MiniAppWebhookVerifierFailureStage
}>

const HUB_FAILURE_STAGES: readonly [HubFailureStages, HubFailureStages] = Object.freeze([
  Object.freeze({
    fetch: 'hub_primary_fetch',
    response: 'hub_primary_response',
    attestation: 'hub_primary_attestation',
  }),
  Object.freeze({
    fetch: 'hub_secondary_fetch',
    response: 'hub_secondary_response',
    attestation: 'hub_secondary_attestation',
  }),
])

export class MiniAppWebhookInvalidError extends Error {
  constructor() {
    super('The Mini App webhook is invalid.')
    this.name = 'MiniAppWebhookInvalidError'
  }
}

export class MiniAppWebhookVerifierUnavailableError extends Error {
  constructor(readonly stage: MiniAppWebhookVerifierFailureStage) {
    if (!MINI_APP_WEBHOOK_VERIFIER_FAILURE_STAGE_SET.has(stage)) {
      throw new Error('Mini App webhook verifier failure stage is invalid.')
    }
    super('Mini App webhook verification is unavailable.')
    this.name = 'MiniAppWebhookVerifierUnavailableError'
  }
}

export function miniAppWebhookVerifierFailureStage(
  error: unknown,
): MiniAppWebhookVerifierFailureStage | null {
  return error instanceof MiniAppWebhookVerifierUnavailableError
    && MINI_APP_WEBHOOK_VERIFIER_FAILURE_STAGE_SET.has(error.stage)
    ? error.stage
    : null
}

function verifierUnavailable(stage: MiniAppWebhookVerifierFailureStage): never {
  throw new MiniAppWebhookVerifierUnavailableError(stage)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function safeFid(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null
}

function canonicalAppKey(value: unknown): Hex | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null
  return value.toLowerCase() as Hex
}

function canonicalBase64Url(value: unknown, maxBytes: number): Uint8Array | null {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > Math.ceil(maxBytes / 3) * 4
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null
  }
  try {
    const bytes = Uint8Array.from(Buffer.from(value, 'base64url'))
    if (
      bytes.byteLength === 0
      || bytes.byteLength > maxBytes
      || Buffer.from(bytes).toString('base64url') !== value
    ) {
      bytes.fill(0)
      return null
    }
    return bytes
  } catch {
    return null
  }
}

function parsedNotificationDetails(value: unknown): ParsedNotificationDetails | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ['token', 'url'])
    || typeof value.token !== 'string'
    || typeof value.url !== 'string'
  ) {
    return null
  }
  return Object.freeze({ token: value.token, url: value.url })
}

function parsedServerEvent(value: unknown): ParsedMiniAppWebhookEvent | null {
  if (!isRecord(value) || typeof value.event !== 'string') return null
  const event = value.event === 'frame_added'
    ? 'miniapp_added'
    : value.event === 'frame_removed'
      ? 'miniapp_removed'
      : value.event

  if (event === 'miniapp_removed' || event === 'notifications_disabled') {
    return exactKeys(value, ['event'])
      ? Object.freeze({ event })
      : null
  }
  if (event !== 'miniapp_added' && event !== 'notifications_enabled') return null
  if (value.notificationDetails === undefined) {
    return event === 'miniapp_added' && exactKeys(value, ['event'])
      ? Object.freeze({ event })
      : null
  }
  if (!exactKeys(value, ['event', 'notificationDetails'])) return null
  const notificationDetails = parsedNotificationDetails(value.notificationDetails)
  return notificationDetails
    ? Object.freeze({ event, notificationDetails })
    : null
}

async function validEd25519Signature(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  const keyBytes: Uint8Array<ArrayBuffer> = new Uint8Array(publicKey.byteLength)
  const signatureBytes: Uint8Array<ArrayBuffer> = new Uint8Array(signature.byteLength)
  const messageBytes: Uint8Array<ArrayBuffer> = new Uint8Array(message.byteLength)
  keyBytes.set(publicKey)
  signatureBytes.set(signature)
  messageBytes.set(message)
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signatureBytes,
      messageBytes,
    )
  } catch {
    return false
  } finally {
    keyBytes.fill(0)
    signatureBytes.fill(0)
    messageBytes.fill(0)
  }
}

async function parseFarcasterWebhook(
  value: Record<string, unknown>,
  verifyAppKey: VerifyAppKey,
): Promise<ParsedMiniAppWebhook> {
  const headerEncoded = value.header
  const payloadEncoded = value.payload
  const signatureEncoded = value.signature
  const headerBytes = canonicalBase64Url(headerEncoded, MAX_JFS_HEADER_BYTES)
  const payloadBytes = canonicalBase64Url(payloadEncoded, MAX_JFS_PAYLOAD_BYTES)
  const signatureBytes = canonicalBase64Url(signatureEncoded, 64)
  if (
    !headerBytes
    || !payloadBytes
    || !signatureBytes
    || signatureBytes.byteLength !== 64
    || typeof headerEncoded !== 'string'
    || typeof payloadEncoded !== 'string'
  ) {
    headerBytes?.fill(0)
    payloadBytes?.fill(0)
    signatureBytes?.fill(0)
    throw new MiniAppWebhookInvalidError()
  }

  const signedInput = new TextEncoder().encode(`${headerEncoded}.${payloadEncoded}`)
  try {
    let header: unknown
    let eventValue: unknown
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true })
      header = JSON.parse(decoder.decode(headerBytes))
      eventValue = JSON.parse(decoder.decode(payloadBytes))
    } catch {
      throw new MiniAppWebhookInvalidError()
    }
    if (
      !isRecord(header)
      || !exactKeys(header, ['fid', 'key', 'type'])
      || header.type !== 'app_key'
    ) {
      throw new MiniAppWebhookInvalidError()
    }
    const fid = safeFid(header.fid)
    const appKey = canonicalAppKey(header.key)
    const event = parsedServerEvent(eventValue)
    if (!fid || !appKey || !event) throw new MiniAppWebhookInvalidError()

    const appKeyBytes = Uint8Array.from(Buffer.from(appKey.slice(2), 'hex'))
    let signatureValid = false
    try {
      signatureValid = await validEd25519Signature(
        signatureBytes,
        signedInput,
        appKeyBytes,
      )
    } catch {
      signatureValid = false
    } finally {
      appKeyBytes.fill(0)
    }
    if (!signatureValid) throw new MiniAppWebhookInvalidError()

    let appKeyResult: VerifyAppKeyResult
    try {
      appKeyResult = await verifyAppKey(fid, appKey)
    } catch (error) {
      if (error instanceof MiniAppWebhookVerifierUnavailableError) throw error
      verifierUnavailable('unexpected')
    }
    if (!appKeyResult.valid || !safeFid(appKeyResult.appFid)) {
      throw new MiniAppWebhookInvalidError()
    }
    return Object.freeze({ fid, appFid: appKeyResult.appFid, event })
  } finally {
    headerBytes.fill(0)
    payloadBytes.fill(0)
    signatureBytes.fill(0)
    signedInput.fill(0)
  }
}

function canonicalBase64(value: unknown): Readonly<{ bytes: Uint8Array; text: string }> | null {
  if (
    typeof value !== 'string'
    || value.length < 4
    || value.length > Math.ceil(MAX_METADATA_BYTES / 3) * 4 + 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return null
  }
  try {
    const bytes = Uint8Array.from(Buffer.from(value, 'base64'))
    if (
      bytes.byteLength === 0
      || bytes.byteLength > MAX_METADATA_BYTES
      || Buffer.from(bytes).toString('base64') !== value
    ) {
      return null
    }
    return Object.freeze({ bytes, text: value })
  } catch {
    return null
  }
}

function decodeSignedKeyRequest(value: unknown): HubAppKeyAttestation | null {
  const metadata = canonicalBase64(value)
  if (!metadata) return null
  try {
    const hex = `0x${Buffer.from(metadata.bytes).toString('hex')}` as Hex
    const tuple = decodeAbiParameters(SIGNED_KEY_REQUEST_ABI, hex)[0] as readonly [
      bigint,
      Address,
      Hex,
      bigint,
    ]
    const [requestFid, requestSigner, signature, deadline] = tuple
    const numericFid = requestFid <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(requestFid)
      : 0
    if (
      numericFid < 1
      || !/^0x[0-9a-fA-F]{40}$/.test(requestSigner)
      || !/^0x[0-9a-fA-F]{130}$/.test(signature)
      || deadline <= 0n
    ) {
      return null
    }
    return Object.freeze({
      appFid: numericFid,
      requestSigner: requestSigner.toLowerCase() as Address,
      signature: signature.toLowerCase() as Hex,
      deadline,
      canonicalMetadata: metadata.text,
    })
  } catch {
    return null
  }
}

async function boundedJson(
  response: Response,
  failureStage: MiniAppWebhookVerifierFailureStage,
): Promise<unknown> {
  if (!response.ok) verifierUnavailable(failureStage)
  if (!/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type') ?? '')) {
    verifierUnavailable(failureStage)
  }
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > HUB_RESPONSE_MAX_BYTES)) {
    verifierUnavailable(failureStage)
  }
  if (!response.body) verifierUnavailable(failureStage)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > HUB_RESPONSE_MAX_BYTES) {
        try { await reader.cancel() } catch { /* Fail closed below. */ }
        verifierUnavailable(failureStage)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof MiniAppWebhookVerifierUnavailableError) throw error
    verifierUnavailable(failureStage)
  } finally {
    try { reader.releaseLock() } catch { /* Reader cleanup is best effort. */ }
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    verifierUnavailable(failureStage)
  }
}

async function hubAppKeyAttestation(
  hubUrl: string,
  fid: number,
  appKey: Hex,
  fetchImpl: FetchLike,
  failureStages: HubFailureStages,
): Promise<HubAppKeyAttestation | null> {
  const url = new URL('/v1/onChainSignersByFid', hubUrl)
  url.searchParams.set('fid', String(fid))
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(HUB_RESPONSE_TIMEOUT_MILLISECONDS),
    })
  } catch {
    verifierUnavailable(failureStages.fetch)
  }
  const body = await boundedJson(response, failureStages.response)
  if (!isRecord(body) || !Array.isArray(body.events) || body.events.length > MAX_HUB_SIGNER_EVENTS) {
    verifierUnavailable(failureStages.response)
  }

  const matches: HubAppKeyAttestation[] = []
  for (const event of body.events) {
    if (!isRecord(event) || !isRecord(event.signerEventBody)) continue
    const signer = event.signerEventBody
    if (
      signer.eventType !== 'SIGNER_EVENT_TYPE_ADD'
      || canonicalAppKey(signer.key) !== appKey
    ) {
      continue
    }
    // Once a Hub claims an ADD for the exact app key, malformed authority
    // metadata is not replication lag. Fail closed instead of silently using
    // the other Hub's otherwise valid record.
    if (
      event.type !== 'EVENT_TYPE_SIGNER'
      || signer.keyType !== 1
      || signer.metadataType !== 1
    ) {
      verifierUnavailable(failureStages.attestation)
    }
    const decoded = decodeSignedKeyRequest(signer.metadata)
    if (!decoded) verifierUnavailable(failureStages.attestation)
    matches.push(decoded)
  }
  if (matches.length === 0) return null
  const first = matches[0]
  if (matches.some(candidate => (
    candidate.appFid !== first.appFid
    || candidate.requestSigner !== first.requestSigner
    || candidate.signature !== first.signature
    || candidate.deadline !== first.deadline
    || candidate.canonicalMetadata !== first.canonicalMetadata
  ))) {
    verifierUnavailable(failureStages.attestation)
  }
  return first
}

function sameAttestation(
  left: HubAppKeyAttestation,
  right: HubAppKeyAttestation,
): boolean {
  return left.appFid === right.appFid
    && left.requestSigner === right.requestSigner
    && left.signature === right.signature
    && left.deadline === right.deadline
    && left.canonicalMetadata === right.canonicalMetadata
}

/**
 * Hubs are replicated indexes rather than the final app-key authority. A
 * healthy but lagging Hub may not have indexed a newer signer event yet. Use a
 * matching attestation from either healthy Hub, reject conflicting matches,
 * and leave final authority to the independently redundant on-chain checks.
 */
function compatibleHubAttestation(
  attestations: readonly (HubAppKeyAttestation | null)[],
): HubAppKeyAttestation | null {
  const matches = attestations.filter(
    (attestation): attestation is HubAppKeyAttestation => attestation !== null,
  )
  if (matches.length === 0) return null
  const first = matches[0]
  if (matches.some(candidate => !sameAttestation(first, candidate))) {
    verifierUnavailable('hub_attestation_conflict')
  }
  return first
}

async function activeOnChainAppKeyAtRpc(
  rpcUrl: string,
  fid: number,
  appKey: Hex,
  attestation: HubAppKeyAttestation,
): Promise<boolean> {
  const client = createPublicClient({
    chain: optimism,
    transport: http(rpcUrl, { retryCount: 0, timeout: HUB_RESPONSE_TIMEOUT_MILLISECONDS }),
  })
  const [keyData, ownerFid] = await Promise.all([
    client.readContract({
      address: KEY_REGISTRY_ADDRESS,
      abi: KEY_REGISTRY_ABI,
      functionName: 'keyDataOf',
      args: [BigInt(fid), appKey],
    }),
    client.readContract({
      address: ID_REGISTRY_ADDRESS,
      abi: ID_REGISTRY_ABI,
      functionName: 'idOf',
      args: [attestation.requestSigner],
    }),
  ])
  const [state, keyType] = keyData
  return state === 1 && keyType === 1 && ownerFid === BigInt(attestation.appFid)
}

async function activeOnChainAppKey(
  config: BridgeConfig,
  fid: number,
  appKey: Hex,
  attestation: HubAppKeyAttestation,
  verifyAtRpc: VerifyOnChainAppKeyAtRpc = activeOnChainAppKeyAtRpc,
): Promise<boolean> {
  let metadataSignatureValid = false
  try {
    metadataSignatureValid = await verifyTypedData({
      address: attestation.requestSigner,
      domain: {
        name: 'Farcaster SignedKeyRequestValidator',
        version: '1',
        chainId: 10,
        verifyingContract: SIGNED_KEY_REQUEST_VALIDATOR_ADDRESS,
      },
      types: {
        SignedKeyRequest: [
          { name: 'requestFid', type: 'uint256' },
          { name: 'key', type: 'bytes' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'SignedKeyRequest',
      message: {
        requestFid: BigInt(attestation.appFid),
        key: appKey,
        deadline: attestation.deadline,
      },
      signature: attestation.signature,
    })
  } catch {
    return false
  }
  if (!metadataSignatureValid) return false

  const results = await Promise.allSettled(config.farcasterRpcUrls.map(rpcUrl => (
    verifyAtRpc(rpcUrl, fid, appKey, attestation)
  )))
  if (results[0]?.status === 'rejected') verifierUnavailable('rpc_primary_transport')
  if (results[1]?.status === 'rejected') verifierUnavailable('rpc_secondary_transport')
  const values = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  if (values.length === 2 && values[0] !== values[1]) {
    verifierUnavailable('rpc_disagreement')
  }
  return values.length > 0 && values.every(Boolean)
}

function configuredDeliveryUrl(config: BridgeConfig, appFid: number): string | null {
  return config.miniAppNotifications?.clients.find(client => client.appFid === appFid)
    ?.deliveryUrl ?? null
}

function canonicalNotificationToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const bytes = new TextEncoder().encode(value)
  try {
    if (
      bytes.byteLength < 16
      || bytes.byteLength > MAX_NOTIFICATION_TOKEN_BYTES
      || /[\u0000-\u0020\u007f]/.test(value)
    ) {
      return null
    }
    return value
  } finally {
    bytes.fill(0)
  }
}

async function envelopeId(raw: Record<string, unknown>): Promise<string> {
  const header = raw.header
  const payload = raw.payload
  const signature = raw.signature
  if (
    typeof header !== 'string'
    || typeof payload !== 'string'
    || typeof signature !== 'string'
  ) {
    throw new MiniAppWebhookInvalidError()
  }
  const material = new TextEncoder().encode(
    `warpkeep-miniapp-webhook-v1\0${header.length}:${header}${payload.length}:${payload}${signature.length}:${signature}`,
  )
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material))
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  } finally {
    material.fill(0)
  }
}

export function createMiniAppWebhookVerifier(
  config: BridgeConfig,
  dependencies: MiniAppWebhookVerifierDependencies = {},
): MiniAppWebhookVerifier {
  // Signature verification remains available while delivery is paused so an
  // authentic disable/remove event can still erase stored consent and tokens.
  if (!config.miniAppNotifications) {
    verifierUnavailable('configuration')
  }
  const allowedClientFids = new Set(
    config.miniAppNotifications.clients.map(client => client.appFid),
  )
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const verifyActiveOnChainAppKey = dependencies.activeOnChainAppKeyVerifier
    ?? ((activeConfig, fid, appKey, attestation) => activeOnChainAppKey(
      activeConfig,
      fid,
      appKey,
      attestation,
      dependencies.activeOnChainRpcVerifier,
    ))

  const productionAppKeyVerifier: VerifyAppKey = async (
    rawFid: number,
    rawAppKey: string,
  ): Promise<VerifyAppKeyResult> => {
    const fid = safeFid(rawFid)
    const appKey = canonicalAppKey(rawAppKey)
    if (!fid || !appKey) return { valid: false }

    const attestations = await Promise.all(
      config.miniAppNotifications!.hubUrls.map((url, index) => (
        hubAppKeyAttestation(url, fid, appKey, fetchImpl, HUB_FAILURE_STAGES[index]!)
      )),
    )
    const attestation = compatibleHubAttestation(attestations)
    if (!attestation) return { valid: false }
    if (!(await verifyActiveOnChainAppKey(config, fid, appKey, attestation))) {
      return { valid: false }
    }
    return { valid: true, appFid: attestation.appFid }
  }
  const verifyAppKey = dependencies.appKeyVerifier ?? productionAppKeyVerifier

  return Object.freeze({
    async verify(value: unknown): Promise<VerifiedMiniAppWebhookEvent> {
      if (!isRecord(value) || !exactKeys(value, ['header', 'payload', 'signature'])) {
        throw new MiniAppWebhookInvalidError()
      }
      const eventId = await envelopeId(value)
      let parsed: ParsedMiniAppWebhook
      try {
        parsed = await parseFarcasterWebhook(value, verifyAppKey)
      } catch (error) {
        if (error instanceof MiniAppWebhookVerifierUnavailableError) throw error
        throw new MiniAppWebhookInvalidError()
      }
      const fid = safeFid(parsed.fid)
      const appFid = safeFid(parsed.appFid)
      if (!fid || !appFid) {
        throw new MiniAppWebhookInvalidError()
      }

      const base = { eventId, fid: String(fid), appFid }
      if (
        parsed.event.event === 'miniapp_removed'
        || parsed.event.event === 'notifications_disabled'
      ) {
        return Object.freeze({ ...base, event: Object.freeze({ type: 'disabled' }) })
      }
      if (!allowedClientFids.has(appFid)) throw new MiniAppWebhookInvalidError()
      const details = 'notificationDetails' in parsed.event
        ? parsed.event.notificationDetails
        : undefined
      if (!details) {
        return Object.freeze({ ...base, event: Object.freeze({ type: 'observed' }) })
      }
      const expectedUrl = configuredDeliveryUrl(config, appFid)
      const token = canonicalNotificationToken(details.token)
      let exactUrl: string | null = null
      try {
        exactUrl = new URL(details.url).toString()
      } catch {
        exactUrl = null
      }
      if (!token || !expectedUrl || exactUrl !== expectedUrl || details.url !== expectedUrl) {
        throw new MiniAppWebhookInvalidError()
      }
      return Object.freeze({
        ...base,
        event: Object.freeze({
          type: 'enabled',
          details: Object.freeze({ token, url: expectedUrl }),
        }),
      })
    },
  })
}
