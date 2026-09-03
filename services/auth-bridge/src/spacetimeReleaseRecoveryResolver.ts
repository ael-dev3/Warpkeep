import type { BridgeConfig } from './config.js'
import {
  adminClaims,
  genesis002AdminClaims,
  ptrAtlasAdminClaims,
  ptrOwnerClaims,
  signEs256Jwt,
} from './jwt.js'
import type { ReleaseRecoveryConfig } from './releaseRecoveryConfig.js'
import type {
  AdminTokenClaims,
  Genesis002AdminTokenClaims,
  PtrAtlasAdminTokenClaims,
  PtrOwnerTokenClaims,
} from './types.js'

export const RELEASE_RECOVERY_OVERALL_TIMEOUT_MS = 75_000
export const RELEASE_RECOVERY_REQUEST_TIMEOUT_MS = 4_000
export const RELEASE_RECOVERY_MAXIMUM_REQUESTS = 114
export const RELEASE_RECOVERY_AGGREGATE_RESPONSE_BYTES = 12 * 1024 * 1024

export const PROGRAM_HASH_SQL = 'SELECT program_hash FROM st_module' as const
export const PLAYER_FID_SQL = 'SELECT fid FROM player_v2' as const

export const G001_POLICY_FIELDS = Object.freeze([
  'realmId',
  'releaseVersion',
  'playerAccessEnabled',
  'admissionStateMutationsEnabled',
  'accessRequestSubmissionsEnabled',
  'sourceBaselineCommit',
  'freezeReleaseNonce',
] as const)

export const G001_ALPHA_STATUS_FIELDS = Object.freeze([
  'worldTiles',
  'occupiedWorldTiles',
  'worldTileMeta',
  'realms',
  'castleSlots',
  'castleSlotClaims',
  'legacyPlayers',
  'playersV2',
  'playerOwnershipsV2',
  'castles',
  'realmProfiles',
  'markAccounts',
  'snapBurnCredits',
  'walletAttributions',
  'walletAttributionSnapshots',
  'scanCursors',
  'scanBatches',
  'alphaTermsAcceptances',
  'allowedFids',
  'enabledAllowedFids',
  'auditEntries',
  'orphanedPlayerRowsV2',
  'orphanedOwnershipRowsV2',
  'orphanedCastleClaims',
  'orphanedCastles',
  'orphanedRealmProfiles',
  'orphanedMarkAccounts',
  'orphanedBurnCredits',
  'orphanedTermsAcceptances',
  'founderStateGaps',
  'markAccountInvariantViolations',
  'publicMarkProjectionViolations',
  'duplicateBurnReferences',
  'burnAccountReconciliationViolations',
  'ambiguousActiveWalletAddresses',
  'staticWorldDriftViolations',
  'termsAcceptanceInvariantViolations',
  'protocolVersion',
  'worldSeed',
  'worldSeedName',
] as const)

export const G001_MEMBER_STATUS_FIELDS = Object.freeze([
  'admissionState',
  'authEpoch',
  'requestState',
  'requestCycle',
  'requestedAtMicros',
] as const)

export const G002_ADMIN_STATUS_FIELDS = Object.freeze([
  'realmId',
  'databaseName',
  'moduleIdentity',
  'releaseVersion',
  'launchState',
  'admissionsOpen',
  'accessRequestsOpen',
  'admittedPlayers',
  'founders',
  'allowedFids',
  'accessRequests',
  'playersV1',
  'playersV2',
  'ownershipBindings',
  'castles',
  'realmProfiles',
  'termsAcceptances',
  'markAccounts',
  'resourceAccounts',
  'castleClaims',
  'cellOccupancies',
  'activationRows',
  'workerSystemRows',
  'atlasImportMutationsEnabled',
  'atlasActivationMutationsEnabled',
  'playerPresentationEnabled',
  'atlasPresent',
  'atlasState',
  'atlasReady',
  'atlasCellRows',
  'atlasSlotRows',
  'atlasResourceRows',
  'present',
  'atlasId',
  'publicReleaseId',
  'publicApprovalReceiptId',
  'sourceCommit',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'state',
  'importEpoch',
  'verificationPhase',
  'verificationCursor',
  'verificationDigest',
  'expectedRegionCount',
  'expectedComponentCount',
  'expectedChunkCount',
  'expectedCellCount',
  'expectedSlotCount',
  'expectedResourceNodeCount',
  'verifiedComponentCount',
  'verifiedChunkCount',
  'verifiedCellCount',
  'verifiedSlotCount',
  'verifiedResourceNodeCount',
  'componentExpectedCellCount',
  'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount',
  'importedPassableCellCount',
  'regionManifestRows',
  'componentRows',
  'chunkRows',
  'cellRows',
  'slotRows',
  'resourceRows',
  'claimRows',
  'occupancyRows',
  'publicAtlasRows',
  'publicRegionRows',
  'importsExact',
  'ready',
  'importMutationsCompiled',
  'activationMutationsCompiled',
] as const)

export const PTR_ADMIN_STATUS_FIELDS = Object.freeze([
  'present',
  'atlasId',
  'publicReleaseId',
  'publicApprovalReceiptId',
  'sourceCommit',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'state',
  'importEpoch',
  'verificationPhase',
  'verificationCursor',
  'verificationDigest',
  'expectedRegionCount',
  'expectedComponentCount',
  'expectedChunkCount',
  'expectedCellCount',
  'expectedSlotCount',
  'expectedResourceNodeCount',
  'verifiedComponentCount',
  'verifiedChunkCount',
  'verifiedCellCount',
  'verifiedSlotCount',
  'verifiedResourceNodeCount',
  'componentExpectedCellCount',
  'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount',
  'importedPassableCellCount',
  'regionManifestRows',
  'componentRows',
  'chunkRows',
  'cellRows',
  'slotRows',
  'resourceRows',
  'claimRows',
  'occupancyRows',
  'activationRows',
  'publicAtlasRows',
  'publicRegionRows',
  'workerSystemRows',
  'importsExact',
  'ready',
  'importMutationsCompiled',
  'activationMutationsCompiled',
  'ownerProvisioned',
  'ownerEnabled',
] as const)

export const PTR_OWNER_STATUS_FIELDS = Object.freeze([
  'realmId',
  'releaseVersion',
  'moduleIdentity',
  'ownerFid',
  'authEpoch',
  'accessGranted',
  'atlasReady',
  'sessionExpiresAt',
] as const)

const G001_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G001_BASELINE_COMMIT = '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
const G001_FREEZE_NONCE = '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'
const U32_MAX = 0xffff_ffffn
const U64_MAX = (1n << 64n) - 1n
const MAX_FID = BigInt(Number.MAX_SAFE_INTEGER)
const JSON_MEDIA_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/iu
const SHA256 = /^[0-9a-f]{64}$/u
const COMMIT = /^[0-9a-f]{40}$/u
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u
const PUBLIC_APPROVAL_ID = /^GRA-[A-Z2-7]{26}$/u
const U256_QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/u
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

const BODY_LIMITS = Object.freeze({
  program: 4 * 1024,
  fids: 1024 * 1024,
  policy: 4 * 1024,
  member: 1024,
  alpha: 16 * 1024,
  administrator: 64 * 1024,
  owner: 4 * 1024,
})

const DOMAINS = Object.freeze({
  census: 'warpkeep.release-recovery.realm-observation.g001-census.v1\n',
  alphaInvariant: 'warpkeep.release-recovery.realm-observation.g001-alpha-invariant.v1\n',
  g002Sealed: 'warpkeep.release-recovery.realm-observation.g002-sealed-state.v1\n',
  ptrSealed: 'warpkeep.release-recovery.realm-observation.ptr-sealed-state.v1\n',
  ptrOwner: 'warpkeep.release-recovery.realm-observation.ptr-owner-invariant.v1\n',
  programBefore: 'warpkeep.release-recovery.realm-observation.response.program-identity-before.v1\n',
  policy: 'warpkeep.release-recovery.realm-observation.response.g001-policy.v1\n',
  alphaBefore: 'warpkeep.release-recovery.realm-observation.response.g001-alpha-before.v1\n',
  enumerationBefore: 'warpkeep.release-recovery.realm-observation.response.g001-enumeration-before.v1\n',
  member: 'warpkeep.release-recovery.realm-observation.response.g001-admission-status-member.v1\n',
  members: 'warpkeep.release-recovery.realm-observation.response.g001-admission-statuses.v1\n',
  enumerationAfter: 'warpkeep.release-recovery.realm-observation.response.g001-enumeration-after.v1\n',
  alphaAfter: 'warpkeep.release-recovery.realm-observation.response.g001-alpha-after.v1\n',
  g002: 'warpkeep.release-recovery.realm-observation.response.g002-status.v1\n',
  ptrAdmin: 'warpkeep.release-recovery.realm-observation.response.ptr-admin-status.v1\n',
  ptrOwnerResponse: 'warpkeep.release-recovery.realm-observation.response.ptr-owner-status.v1\n',
  programAfter: 'warpkeep.release-recovery.realm-observation.response.program-identity-after.v1\n',
})

type UIntJson = Readonly<{ lexeme: string; value: bigint }>
type StrictJson = null | boolean | string | UIntJson | readonly StrictJson[] | StrictJsonObject
interface StrictJsonObject {
  readonly [key: string]: StrictJson
}

export class SpacetimeReleaseRecoveryResolverFailure extends Error {
  constructor() {
    super('SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED')
    this.name = 'SpacetimeReleaseRecoveryResolverFailure'
    delete this.stack
  }
}

function fail(): never {
  throw new SpacetimeReleaseRecoveryResolverFailure()
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

class StrictSpacetimeJsonParser {
  #index = 0
  #nodes = 0

  constructor(private readonly source: string) {}

  parse(): StrictJson {
    this.skipWhitespace()
    const result = this.value(0)
    this.skipWhitespace()
    if (this.#index !== this.source.length) fail()
    return result
  }

  private value(depth: number): StrictJson {
    if (depth > 64 || ++this.#nodes > 250_000) fail()
    this.skipWhitespace()
    const current = this.source[this.#index]
    if (current === '{') return this.object(depth + 1)
    if (current === '[') return this.array(depth + 1)
    if (current === '"') return this.string()
    if (this.consume('true')) return true
    if (this.consume('false')) return false
    if (this.consume('null')) return null
    const start = this.#index
    const first = this.source.charCodeAt(this.#index)
    if (!(first >= 0x30 && first <= 0x39)) fail()
    this.#index += 1
    if (first === 0x30) {
      const next = this.source.charCodeAt(this.#index)
      if (next >= 0x30 && next <= 0x39) fail()
    } else {
      while (this.#index < this.source.length) {
        const digit = this.source.charCodeAt(this.#index)
        if (digit < 0x30 || digit > 0x39) break
        if (this.#index - start >= 20) fail()
        this.#index += 1
      }
    }
    if (!this.boundary()) fail()
    const lexeme = this.source.slice(start, this.#index)
    let parsed: bigint
    try { parsed = BigInt(lexeme) } catch { return fail() }
    return Object.freeze({ lexeme, value: parsed })
  }

  private object(depth: number): StrictJsonObject {
    this.#index += 1
    this.skipWhitespace()
    const result: Record<string, StrictJson> = Object.create(null)
    if (this.source[this.#index] === '}') {
      this.#index += 1
      return Object.freeze(result)
    }
    for (;;) {
      if (this.source[this.#index] !== '"') fail()
      const key = this.string()
      if (Object.hasOwn(result, key)) fail()
      this.skipWhitespace()
      if (this.source[this.#index] !== ':') fail()
      this.#index += 1
      result[key] = this.value(depth)
      this.skipWhitespace()
      const separator = this.source[this.#index]
      if (separator === '}') {
        this.#index += 1
        return Object.freeze(result)
      }
      if (separator !== ',') fail()
      this.#index += 1
      this.skipWhitespace()
    }
  }

  private array(depth: number): readonly StrictJson[] {
    this.#index += 1
    this.skipWhitespace()
    const result: StrictJson[] = []
    if (this.source[this.#index] === ']') {
      this.#index += 1
      return Object.freeze(result)
    }
    for (;;) {
      if (result.length >= 100_000) fail()
      result.push(this.value(depth))
      this.skipWhitespace()
      const separator = this.source[this.#index]
      if (separator === ']') {
        this.#index += 1
        return Object.freeze(result)
      }
      if (separator !== ',') fail()
      this.#index += 1
      this.skipWhitespace()
    }
  }

  private string(): string {
    this.#index += 1
    let result = ''
    for (;;) {
      const character = this.source[this.#index++]
      if (character === undefined) fail()
      if (character === '"') {
        if (hasUnpairedSurrogate(result) || encoder.encode(result).length > 1024 * 1024) fail()
        return result
      }
      if (character === '\\') {
        const escaped = this.source[this.#index++]
        if (escaped === '"' || escaped === '\\' || escaped === '/') {
          result += escaped
          continue
        }
        const controls: Readonly<Record<string, string>> = {
          b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
        }
        if (escaped !== undefined && Object.hasOwn(controls, escaped)) {
          result += controls[escaped]
          continue
        }
        if (escaped === 'u') {
          const hexValue = this.source.slice(this.#index, this.#index + 4)
          if (!/^[0-9a-fA-F]{4}$/u.test(hexValue)) fail()
          result += String.fromCharCode(Number.parseInt(hexValue, 16))
          this.#index += 4
          continue
        }
        fail()
      }
      if (character < ' ') fail()
      result += character
    }
  }

  private skipWhitespace(): void {
    while (/^[ \t\r\n]$/u.test(this.source[this.#index] ?? '')) this.#index += 1
  }

  private consume(value: string): boolean {
    if (this.source.slice(this.#index, this.#index + value.length) !== value) return false
    this.#index += value.length
    return true
  }

  private boundary(): boolean {
    return this.source[this.#index] === undefined
      || /[ \t\r\n,\]}]/u.test(this.source[this.#index] ?? '')
  }
}

function parseJsonBytes(raw: Uint8Array): StrictJson {
  try {
    return new StrictSpacetimeJsonParser(decoder.decode(raw)).parse()
  } catch (error) {
    if (error instanceof SpacetimeReleaseRecoveryResolverFailure) throw error
    return fail()
  }
}

function array(value: StrictJson, length?: number): readonly StrictJson[] {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length)) fail()
  return value as readonly StrictJson[]
}

function object(value: StrictJson, keys: readonly string[]): StrictJsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail()
  const record = value as StrictJsonObject
  const actual = Object.keys(record)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(record, key))) fail()
  return record
}

function uint(value: StrictJson, maximum: bigint): UIntJson {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail()
  const candidate = value as Partial<UIntJson>
  if (typeof candidate.lexeme !== 'string' || typeof candidate.value !== 'bigint' || candidate.value > maximum) fail()
  return candidate as UIntJson
}

function u32(value: StrictJson): UIntJson { return uint(value, U32_MAX) }
function u64(value: StrictJson): UIntJson { return uint(value, U64_MAX) }

function boolean(value: StrictJson): boolean {
  if (typeof value !== 'boolean') fail()
  return value
}

function string(value: StrictJson, maximumBytes = 512): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || encoder.encode(value).length > maximumBytes
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail()
  return value
}

function exactString(value: StrictJson, expected: string): string {
  const parsed = string(value, Math.max(64, encoder.encode(expected).length))
  if (parsed !== expected) fail()
  return parsed
}

function option(value: StrictJson): StrictJson | undefined {
  if (Array.isArray(value)) {
    const tuple = array(value, 2)
    const tag = u32(tuple[0])
    if (tag.value === 0n) return tuple[1]
    if (tag.value === 1n && array(tuple[1], 0).length === 0) return undefined
    return fail()
  }
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as StrictJsonObject
    : fail()
  const keys = Object.keys(record)
  if (keys.length !== 1) fail()
  if (keys[0] === 'some') return record.some
  if (keys[0] === 'none' && array(record.none, 0).length === 0) return undefined
  return fail()
}

function requiredOptionString(value: StrictJson, pattern: RegExp): string {
  const parsed = option(value)
  if (parsed === undefined) fail()
  const result = string(parsed)
  if (!pattern.test(result)) fail()
  return result
}

function requiredOptionU64(value: StrictJson): UIntJson {
  const parsed = option(value)
  if (parsed === undefined) fail()
  return u64(parsed)
}

function parseSqlStatement(raw: Uint8Array, columnName: string, columnType: 'U64' | 'U256'): readonly StrictJson[] {
  const document = array(parseJsonBytes(raw), 1)
  const statement = object(document[0], ['schema', 'rows', 'total_duration_micros', 'stats'])
  u64(statement.total_duration_micros)
  const stats = object(statement.stats, ['rows_inserted', 'rows_deleted', 'rows_updated'])
  if (
    u64(stats.rows_inserted).value !== 0n
    || u64(stats.rows_deleted).value !== 0n
    || u64(stats.rows_updated).value !== 0n
  ) fail()
  const schema = object(statement.schema, ['elements'])
  const elements = array(schema.elements, 1)
  const element = object(elements[0], ['name', 'algebraic_type'])
  const name = object(element.name, ['some'])
  exactString(name.some, columnName)
  const algebraicType = object(element.algebraic_type, [columnType])
  array(algebraicType[columnType], 0)
  return array(statement.rows)
}

/** Strict parser reused by the disposable-server Task 4 program-pin check. */
export function parseSpacetimeProgramHashResponse(raw: Uint8Array): string {
  try {
    if (!(raw instanceof Uint8Array) || raw.length < 1 || raw.length > BODY_LIMITS.program) fail()
    const rows = parseSqlStatement(raw, 'program_hash', 'U256')
    const row = array(rows[0] ?? fail(), 1)
    if (rows.length !== 1 || typeof row[0] !== 'string' || !U256_QUANTITY.test(row[0])) fail()
    const magnitude = row[0].slice(2).padStart(64, '0')
    const octets = magnitude.match(/../gu)
    if (octets === null || octets.length !== 32) fail()
    return octets.reverse().join('')
  } catch (error) {
    if (error instanceof SpacetimeReleaseRecoveryResolverFailure) throw error
    return fail()
  }
}

/** Strict lossless FID SQL parser; returned lexemes are sorted numerically. */
export function parseSpacetimeFidResponse(raw: Uint8Array): readonly string[] {
  try {
    if (!(raw instanceof Uint8Array) || raw.length < 1 || raw.length > BODY_LIMITS.fids) fail()
    const rows = parseSqlStatement(raw, 'fid', 'U64')
    if (rows.length < 1 || rows.length > 100) fail()
    const fids = rows.map(value => {
      const parsed = u64(array(value, 1)[0])
      if (parsed.value < 1n || parsed.value > MAX_FID) fail()
      return parsed.lexeme
    })
    if (new Set(fids).size !== fids.length) fail()
    fids.sort((left, right) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0)
    return Object.freeze(fids)
  } catch (error) {
    if (error instanceof SpacetimeReleaseRecoveryResolverFailure) throw error
    return fail()
  }
}

type NormalizedRecord = Readonly<Record<string, string | boolean | null>>

function product(raw: Uint8Array, fields: readonly string[]): readonly StrictJson[] {
  return array(parseJsonBytes(raw), fields.length)
}

function orderedRecord(fields: readonly string[], values: readonly (string | boolean | null)[]): NormalizedRecord {
  if (fields.length !== values.length) fail()
  const result: Record<string, string | boolean | null> = {}
  fields.forEach((field, index) => { result[field] = values[index]! })
  return Object.freeze(result)
}

function parsePolicy(raw: Uint8Array): Readonly<{
  realmId: 'GENESIS_001'
  releaseVersion: '0.3.43'
  playerAccessEnabled: true
  admissionStateMutationsEnabled: false
  accessRequestSubmissionsEnabled: false
  sourceBaselineCommit: typeof G001_BASELINE_COMMIT
  freezeReleaseNonce: typeof G001_FREEZE_NONCE
}> {
  const value = product(raw, G001_POLICY_FIELDS)
  exactString(value[0], 'GENESIS_001')
  exactString(value[1], '0.3.43')
  if (!boolean(value[2]) || boolean(value[3]) || boolean(value[4])) fail()
  exactString(value[5], G001_BASELINE_COMMIT)
  exactString(value[6], G001_FREEZE_NONCE)
  return Object.freeze({
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: G001_BASELINE_COMMIT,
    freezeReleaseNonce: G001_FREEZE_NONCE,
  })
}

const ALPHA_U64_END = 37

function parseAlpha(raw: Uint8Array): Readonly<{
  complete: NormalizedRecord
  invariant: NormalizedRecord
}> {
  const value = product(raw, G001_ALPHA_STATUS_FIELDS)
  const normalized: Array<string | boolean | null> = []
  for (let index = 0; index < ALPHA_U64_END; index += 1) normalized.push(u64(value[index]).lexeme)
  normalized.push(u32(value[37]).lexeme, u32(value[38]).lexeme, string(value[39], 64))
  const complete = orderedRecord(G001_ALPHA_STATUS_FIELDS, normalized)
  const invariantFields = [
    'worldTiles', 'occupiedWorldTiles', 'worldTileMeta', 'realms', 'castleSlots',
    'castleSlotClaims', 'legacyPlayers', 'playersV2', 'playerOwnershipsV2', 'castles',
    'realmProfiles', 'markAccounts', 'allowedFids', 'enabledAllowedFids',
    ...G001_ALPHA_STATUS_FIELDS.slice(21, 37),
    'protocolVersion', 'worldSeed', 'worldSeedName',
  ]
  const invariant: Record<string, string | boolean | null> = {}
  for (const field of invariantFields) invariant[field] = complete[field]!
  return Object.freeze({ complete, invariant: Object.freeze(invariant) })
}

function validateAlpha(alpha: ReturnType<typeof parseAlpha>, count: number): void {
  const n = BigInt(count)
  const expected: Readonly<Record<string, bigint>> = {
    worldTiles: 10_000n,
    occupiedWorldTiles: n,
    worldTileMeta: 10_000n,
    realms: 1n,
    castleSlots: 100n,
    castleSlotClaims: n,
    legacyPlayers: 0n,
    playersV2: n,
    playerOwnershipsV2: n,
    castles: n,
    realmProfiles: n,
    markAccounts: n,
    allowedFids: n,
    enabledAllowedFids: n,
    orphanedPlayerRowsV2: 0n,
    orphanedOwnershipRowsV2: 0n,
    orphanedCastleClaims: 0n,
    orphanedCastles: 0n,
    orphanedRealmProfiles: 0n,
    orphanedMarkAccounts: 0n,
    orphanedBurnCredits: 0n,
    orphanedTermsAcceptances: 0n,
    founderStateGaps: 0n,
    markAccountInvariantViolations: 0n,
    publicMarkProjectionViolations: 0n,
    duplicateBurnReferences: 0n,
    burnAccountReconciliationViolations: 0n,
    ambiguousActiveWalletAddresses: 0n,
    staticWorldDriftViolations: 0n,
    termsAcceptanceInvariantViolations: 0n,
    protocolVersion: 3n,
    worldSeed: 3_445_214_658n,
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (decimal(alpha.complete, field) !== expectedValue) fail()
  }
  if (text(alpha.complete, 'worldSeedName') !== 'HEGEMONY_GENESIS_001') fail()
}

type Member = Readonly<{
  fid: string
  authEpoch: string
  authEpochNumber: number
  normalized: NormalizedRecord
}>

function parseOptionalU64(value: StrictJson): string | null {
  const parsed = option(value)
  return parsed === undefined ? null : u64(parsed).lexeme
}

function parseMember(raw: Uint8Array, fid: string): Member {
  const value = product(raw, G001_MEMBER_STATUS_FIELDS)
  const admissionState = exactString(value[0], 'enabled')
  const authEpoch = u32(value[1])
  if (authEpoch.value < 1n) fail()
  const requestState = string(value[2], 32)
  const requestCycle = parseOptionalU64(value[3])
  const requestedAtMicros = parseOptionalU64(value[4])
  if ((requestCycle === null) !== (requestedAtMicros === null)) fail()
  if (requestCycle === null) {
    if (requestState !== 'not_requested') fail()
  } else {
    if (requestState !== 'resolved' || BigInt(requestCycle) > authEpoch.value || BigInt(requestedAtMicros!) < 1n) fail()
  }
  const normalized = orderedRecord(G001_MEMBER_STATUS_FIELDS, [
    admissionState, authEpoch.lexeme, requestState, requestCycle, requestedAtMicros,
  ])
  return Object.freeze({ fid, authEpoch: authEpoch.lexeme, authEpochNumber: Number(authEpoch.value), normalized })
}

function normalizeAtlasStatus(raw: Uint8Array, fields: readonly string[], g002: boolean): NormalizedRecord {
  const value = product(raw, fields)
  const normalized: Array<string | boolean | null> = []
  const stringIndexes = new Set<number>(g002 ? [0, 1, 2, 3, 4, 27, 39, 41, 43] : [7, 9, 11])
  const booleanIndexes = new Set<number>(g002
    ? [5, 6, 23, 24, 25, 26, 28, 32, 69, 70, 71, 72]
    : [0, 39, 40, 41, 42, 43, 44])
  const optionalStringIndexes = new Set<number>(g002 ? [33, 34, 35, 36, 37, 38] : [1, 2, 3, 4, 5, 6])
  const optionalU64Indexes = new Set<number>(g002 ? [40] : [8])
  const u32Indexes = new Set<number>(g002
    ? Array.from({ length: 16 }, (_, index) => index + 44)
    : Array.from({ length: 16 }, (_, index) => index + 12))
  for (let index = 0; index < fields.length; index += 1) {
    if (stringIndexes.has(index)) normalized.push(string(value[index]))
    else if (booleanIndexes.has(index)) normalized.push(boolean(value[index]))
    else if (optionalStringIndexes.has(index)) {
      const selected = option(value[index])
      normalized.push(selected === undefined ? null : string(selected))
    } else if (optionalU64Indexes.has(index)) {
      const selected = option(value[index])
      normalized.push(selected === undefined ? null : u64(selected).lexeme)
    } else if (u32Indexes.has(index)) normalized.push(u32(value[index]).lexeme)
    else normalized.push(u64(value[index]).lexeme)
  }
  return orderedRecord(fields, normalized)
}

function decimal(record: NormalizedRecord, field: string): bigint {
  const value = record[field]
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) fail()
  return BigInt(value)
}

function text(record: NormalizedRecord, field: string): string {
  const value = record[field]
  if (typeof value !== 'string') fail()
  return value
}

function flag(record: NormalizedRecord, field: string): boolean {
  const value = record[field]
  if (typeof value !== 'boolean') fail()
  return value
}

function validateAtlasCoordinates(record: NormalizedRecord, atlasId: string): void {
  if (
    text(record, 'atlasId') !== atlasId
    || !PUBLIC_RELEASE_ID.test(text(record, 'publicReleaseId'))
    || !PUBLIC_APPROVAL_ID.test(text(record, 'publicApprovalReceiptId'))
    || !COMMIT.test(text(record, 'sourceCommit'))
    || !SHA256.test(text(record, 'expectedReleaseSha256'))
    || !SHA256.test(text(record, 'releaseHeaderSha256'))
    || !SHA256.test(text(record, 'verificationDigest'))
  ) fail()
}

function validateAtlasEquations(record: NormalizedRecord): void {
  const pairs: readonly (readonly [string, string])[] = [
    ['expectedComponentCount', 'verifiedComponentCount'],
    ['expectedChunkCount', 'verifiedChunkCount'],
    ['expectedCellCount', 'verifiedCellCount'],
    ['expectedSlotCount', 'verifiedSlotCount'],
    ['expectedResourceNodeCount', 'verifiedResourceNodeCount'],
    ['expectedComponentCount', 'componentRows'],
    ['expectedChunkCount', 'chunkRows'],
    ['expectedCellCount', 'cellRows'],
    ['expectedSlotCount', 'slotRows'],
    ['expectedResourceNodeCount', 'resourceRows'],
    ['componentExpectedSlotCount', 'expectedSlotCount'],
    ['componentExpectedResourceNodeCount', 'expectedResourceNodeCount'],
    ['componentExpectedCellCount', 'importedPassableCellCount'],
    ['expectedRegionCount', 'regionManifestRows'],
  ]
  if (pairs.some(([left, right]) => decimal(record, left) !== decimal(record, right))) fail()
  if (
    decimal(record, 'importEpoch') < 1n
    || decimal(record, 'verificationCursor') !== 0n
    || decimal(record, 'expectedRegionCount') !== 6n
    || decimal(record, 'expectedSlotCount') !== 600n
    || decimal(record, 'expectedCellCount') < 1n
    || decimal(record, 'expectedResourceNodeCount') < 1n
    || decimal(record, 'componentExpectedCellCount') > decimal(record, 'expectedCellCount')
    || text(record, 'state') !== 'ready'
    || text(record, 'verificationPhase') !== 'complete'
    || !flag(record, 'present')
    || !flag(record, 'importsExact')
    || !flag(record, 'ready')
    || !flag(record, 'importMutationsCompiled')
    || flag(record, 'activationMutationsCompiled')
  ) fail()
  for (const field of ['claimRows', 'occupancyRows', 'activationRows', 'publicAtlasRows', 'publicRegionRows', 'workerSystemRows']) {
    if (decimal(record, field) !== 0n) fail()
  }
}

function parseG002(raw: Uint8Array): NormalizedRecord {
  const status = normalizeAtlasStatus(raw, G002_ADMIN_STATUS_FIELDS, true)
  if (
    text(status, 'realmId') !== 'GENESIS_002'
    || text(status, 'databaseName') !== 'warpkeep-genesis-002'
    || text(status, 'moduleIdentity') !== 'warpkeep-genesis-002-sealed-v1'
    || text(status, 'releaseVersion') !== '0.4.0'
    || text(status, 'launchState') !== 'sealed'
    || flag(status, 'admissionsOpen')
    || flag(status, 'accessRequestsOpen')
    || !flag(status, 'atlasImportMutationsEnabled')
    || flag(status, 'atlasActivationMutationsEnabled')
    || flag(status, 'playerPresentationEnabled')
    || !flag(status, 'atlasPresent')
    || text(status, 'atlasState') !== 'ready'
    || !flag(status, 'atlasReady')
  ) fail()
  for (const field of G002_ADMIN_STATUS_FIELDS.slice(7, 23)) {
    if (decimal(status, field) !== 0n) fail()
  }
  validateAtlasCoordinates(status, 'GENESIS_002_GREATER_REALM')
  validateAtlasEquations(status)
  if (
    decimal(status, 'atlasCellRows') !== decimal(status, 'cellRows')
    || decimal(status, 'atlasSlotRows') !== decimal(status, 'slotRows')
    || decimal(status, 'atlasResourceRows') !== decimal(status, 'resourceRows')
  ) fail()
  return status
}

function parsePtrAdmin(raw: Uint8Array): NormalizedRecord {
  const status = normalizeAtlasStatus(raw, PTR_ADMIN_STATUS_FIELDS, false)
  validateAtlasCoordinates(status, 'PTR_GREATER_REALM')
  validateAtlasEquations(status)
  if (!flag(status, 'ownerProvisioned') || !flag(status, 'ownerEnabled')) fail()
  return status
}

function parsePtrOwner(raw: Uint8Array, canaryFid: string, expectedEpoch: number): Readonly<{
  normalized: NormalizedRecord
}> {
  const value = product(raw, PTR_OWNER_STATUS_FIELDS)
  exactString(value[0], 'PTR')
  exactString(value[1], '0.4.0-ptr.1')
  exactString(value[2], 'warpkeep-ptr-owner-view-v1')
  const fid = u64(value[3])
  const epoch = u32(value[4])
  if (fid.lexeme !== canaryFid || epoch.value !== BigInt(expectedEpoch) || !boolean(value[5]) || !boolean(value[6])) fail()
  const expiry = u64(value[7])
  if (expiry.value < 1n) fail()
  return Object.freeze({
    normalized: orderedRecord(PTR_OWNER_STATUS_FIELDS, [
      'PTR', '0.4.0-ptr.1', 'warpkeep-ptr-owner-view-v1', fid.lexeme,
      epoch.lexeme, true, true, expiry.lexeme,
    ]),
  })
}

function utf8Json(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

function u32be(value: number): Uint8Array {
  const result = new Uint8Array(4)
  new DataView(result.buffer).setUint32(0, value, false)
  return result
}

function u64be(value: number): Uint8Array {
  const result = new Uint8Array(8)
  new DataView(result.buffer).setBigUint64(0, BigInt(value), false)
  return result
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function frame(value: Uint8Array): Uint8Array {
  return concat([u64be(value.length), value])
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

function hex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function importPepper(value: Uint8Array): Promise<CryptoKey> {
  if (!(value instanceof Uint8Array) || value.length !== 32) fail()
  try {
    return await crypto.subtle.importKey(
      'raw', arrayBuffer(value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
  } catch { return fail() }
}

async function hmac(key: CryptoKey, domain: string, payload: Uint8Array): Promise<Readonly<{ hex: string; bytes: Uint8Array }>> {
  const domainBytes = encoder.encode(`warpkeep-recovery-v1:${domain}:`)
  const input = concat([u32be(domainBytes.length), domainBytes, u64be(payload.length), payload])
  try {
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, arrayBuffer(input)))
    return Object.freeze({ hex: hex(bytes), bytes })
  } catch { return fail() } finally { input.fill(0) }
}

async function hmacHex(key: CryptoKey, domain: string, payload: Uint8Array): Promise<string> {
  const result = await hmac(key, domain, payload)
  try { return result.hex } finally { result.bytes.fill(0) }
}

export type ReleaseRecoveryTimer = Readonly<{
  signal: AbortSignal
  fired(): boolean
  cancel(): void
}>

export type ReleaseRecoveryTimerFactory = (milliseconds: number) => ReleaseRecoveryTimer

/**
 * Overall request lifetime owned by the observation receiver. Its deadline begins
 * before any recovery configuration I/O, so the resolver must neither replace nor
 * cancel it.
 */
export type ReleaseRecoveryRequestContext = Readonly<{
  signal: AbortSignal
  deadlineMilliseconds: number
  clockMilliseconds(): number
  fired(): boolean
}>

function defaultTimerFactory(milliseconds: number): ReleaseRecoveryTimer {
  const controller = new AbortController()
  let didFire = false
  const timeout = setTimeout(() => {
    didFire = true
    controller.abort()
  }, milliseconds)
  return Object.freeze({
    signal: controller.signal,
    fired: () => didFire,
    cancel: () => clearTimeout(timeout),
  })
}

type RecoveryClaims = AdminTokenClaims | Genesis002AdminTokenClaims | PtrAtlasAdminTokenClaims | PtrOwnerTokenClaims
export type ReleaseRecoveryJwtSigner = (config: BridgeConfig, claims: RecoveryClaims) => Promise<string>
export type ReleaseRecoveryFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SpacetimeReleaseRecoveryResolverDependencies = Readonly<{
  fetcher?: ReleaseRecoveryFetch
  signer?: ReleaseRecoveryJwtSigner
  clockMilliseconds?: () => number
  clockSeconds?: () => number
  timerFactory?: ReleaseRecoveryTimerFactory
  requestContext?: ReleaseRecoveryRequestContext
}>

type TokenKind = 'g001' | 'g002' | 'ptr-admin' | 'ptr-owner'

class ResolutionContext {
  readonly overall: Pick<ReleaseRecoveryTimer, 'signal' | 'fired'>
  readonly deadline: number
  readonly failure = new AbortController()
  readonly clockMilliseconds: () => number
  readonly ownedOverall: ReleaseRecoveryTimer | undefined
  requestCount = 0
  aggregateBytes = 0

  constructor(
    clockMilliseconds: () => number,
    timerFactory: ReleaseRecoveryTimerFactory,
    requestContext?: ReleaseRecoveryRequestContext,
  ) {
    if (requestContext === undefined) {
      this.clockMilliseconds = clockMilliseconds
      this.ownedOverall = timerFactory(RELEASE_RECOVERY_OVERALL_TIMEOUT_MS)
      this.overall = this.ownedOverall
      const now = clockMilliseconds()
      if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - RELEASE_RECOVERY_OVERALL_TIMEOUT_MS) fail()
      this.deadline = now + RELEASE_RECOVERY_OVERALL_TIMEOUT_MS
      return
    }
    this.clockMilliseconds = requestContext.clockMilliseconds
    this.ownedOverall = undefined
    this.overall = Object.freeze({
      signal: requestContext.signal,
      fired: requestContext.fired,
    })
    const now = requestContext.clockMilliseconds()
    if (
      !(requestContext.signal instanceof AbortSignal)
      || requestContext.signal.aborted
      || requestContext.fired()
      || !Number.isSafeInteger(now)
      || now < 0
      || !Number.isSafeInteger(requestContext.deadlineMilliseconds)
      || requestContext.deadlineMilliseconds <= now
      || requestContext.deadlineMilliseconds - now > RELEASE_RECOVERY_OVERALL_TIMEOUT_MS
    ) fail()
    this.deadline = requestContext.deadlineMilliseconds
  }

  remaining(): number {
    const now = this.clockMilliseconds()
    if (!Number.isSafeInteger(now) || now < 0 || this.overall.signal.aborted || this.overall.fired() || now >= this.deadline) fail()
    return this.deadline - now
  }

  checkCompletion(): void {
    if (this.overall.signal.aborted || this.overall.fired()) fail()
    const now = this.clockMilliseconds()
    if (!Number.isSafeInteger(now) || now < 0 || now >= this.deadline) fail()
  }

  addBytes(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0) fail()
    this.aggregateBytes += length
    if (this.aggregateBytes > RELEASE_RECOVERY_AGGREGATE_RESPONSE_BYTES) fail()
  }

  abort(): void {
    if (!this.failure.signal.aborted) this.failure.abort()
  }

  close(): void {
    this.abort()
    this.ownedOverall?.cancel()
  }
}

function abortPromise(signal: AbortSignal): Readonly<{
  promise: Promise<never>
  remove(): void
}> {
  let listener: (() => void) | undefined
  const promise = new Promise<never>((_resolve, reject) => {
    listener = () => reject(new SpacetimeReleaseRecoveryResolverFailure())
    if (signal.aborted) listener()
    else signal.addEventListener('abort', listener, { once: true })
  })
  return Object.freeze({
    promise,
    remove: () => { if (listener !== undefined) signal.removeEventListener('abort', listener) },
  })
}

async function raceSignals<T>(operation: Promise<T>, signals: readonly AbortSignal[]): Promise<T> {
  const aborts = signals.map(abortPromise)
  try {
    return await Promise.race([operation, ...aborts.map(value => value.promise)])
  } finally {
    aborts.forEach(value => value.remove())
  }
}

function cancelBodyNoWait(body: ReadableStream<Uint8Array> | null): void {
  if (body === null) return
  try {
    void body.cancel().catch(() => undefined)
  } catch {
    // Cancellation is cleanup only; the fixed validation failure remains authoritative.
  }
}

function releaseReaderNoThrow(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try { reader.releaseLock() } catch { /* a pending read retains the lock until cancellation settles */ }
}

function cancelReaderNoWait(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    void reader.cancel().then(
      () => releaseReaderNoThrow(reader),
      () => releaseReaderNoThrow(reader),
    )
  } catch {
    releaseReaderNoThrow(reader)
  }
}

async function readBody(
  response: Response,
  maximumBytes: number,
  context: ResolutionContext,
  signals: readonly AbortSignal[],
): Promise<Uint8Array> {
  const advertised = response.headers.get('content-length')
  let advertisedLength: number | undefined
  if (advertised !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(advertised)) fail()
    advertisedLength = Number(advertised)
    if (!Number.isSafeInteger(advertisedLength) || advertisedLength > maximumBytes) fail()
  }
  if (response.body === null) fail()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let currentChunk: Uint8Array | undefined
  let deferReaderRelease = false
  let length = 0
  try {
    for (;;) {
      const result = await raceSignals(reader.read(), signals)
      if (result.done) break
      if (result.value === undefined) continue
      const chunk = result.value
      currentChunk = chunk
      length += chunk.length
      if (length > maximumBytes) fail()
      context.addBytes(chunk.length)
      chunks.push(chunk)
      currentChunk = undefined
    }
  } catch {
    currentChunk?.fill(0)
    chunks.forEach(chunk => chunk.fill(0))
    deferReaderRelease = true
    cancelReaderNoWait(reader)
    return fail()
  } finally {
    if (!deferReaderRelease) releaseReaderNoThrow(reader)
  }
  const result = concat(chunks)
  chunks.forEach(chunk => chunk.fill(0))
  if (advertisedLength !== undefined && advertisedLength !== length) {
    result.fill(0)
    fail()
  }
  try { decoder.decode(result) } catch { result.fill(0); return fail() }
  return result
}

type RawResponse = Readonly<{ raw: Uint8Array }>

export type G001RecoveryResolution = Readonly<{
  databaseIdentity: typeof G001_DATABASE
  programKeccak256: string
  realmId: 'GENESIS_001'
  releaseVersion: '0.3.43'
  playerAccessEnabled: true
  admissionStateMutationsEnabled: false
  accessRequestSubmissionsEnabled: false
  sourceBaselineCommit: typeof G001_BASELINE_COMMIT
  freezeReleaseNonce: typeof G001_FREEZE_NONCE
  admittedPlayerCount: number
  enabledPlayerCount: number
  censusStable: true
  admittedPlayerCensusHmacSha256: string
  alphaInvariantHmacSha256: string
}>

export type G002RecoveryResolution = Readonly<{
  databaseIdentity: string
  programKeccak256: string
  realmId: 'GENESIS_002'
  databaseName: 'warpkeep-genesis-002'
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1'
  releaseVersion: '0.4.0'
  launchState: 'sealed'
  admissionsOpen: false
  accessRequestsOpen: false
  sealed: true
  atlasReady: true
  playerCount: 0
  generalAdmissionCount: 0
  populationGuardPassed: true
  atlasId: string
  publicReleaseId: string
  publicApprovalReceiptId: string
  atlasSourceCommit: string
  expectedReleaseSha256: string
  releaseHeaderSha256: string
  verificationDigest: string
  sealedStateHmacSha256: string
}>

export type PtrRecoveryResolution = Readonly<{
  databaseIdentity: string
  programKeccak256: string
  realmId: 'PTR'
  releaseVersion: '0.4.0-ptr.1'
  moduleIdentity: 'warpkeep-ptr-owner-view-v1'
  launchState: 'owner-only'
  admissionsOpen: false
  accessRequestsOpen: false
  sealed: true
  atlasReady: true
  populationGuardPassed: true
  singletonOwnerCount: 1
  ownerEnabled: true
  generalAdmissionCount: 0
  atlasId: string
  publicReleaseId: string
  publicApprovalReceiptId: string
  atlasSourceCommit: string
  expectedReleaseSha256: string
  releaseHeaderSha256: string
  verificationDigest: string
  sealedStateHmacSha256: string
  ownerInvariantHmacSha256: string
}>

export type ReleaseRecoveryUpstreamResponseDigests = Readonly<{
  programIdentityBeforeTranscriptHmacSha256: string
  g001PolicyResponseHmacSha256: string
  g001AlphaBeforeResponseHmacSha256: string
  g001PlayerEnumerationBeforeResponseHmacSha256: string
  g001AdmissionStatusesResponseHmacSha256: string
  g001PlayerEnumerationAfterResponseHmacSha256: string
  g001AlphaAfterResponseHmacSha256: string
  g002StatusResponseHmacSha256: string
  ptrAdminStatusResponseHmacSha256: string
  ptrOwnerStatusResponseHmacSha256: string
  programIdentityAfterTranscriptHmacSha256: string
}>

export type SpacetimeReleaseRecoveryResolution = Readonly<{
  observedFrom: number
  observedThrough: number
  g001: G001RecoveryResolution
  g002: G002RecoveryResolution
  ptr: PtrRecoveryResolution
  upstreamResponseDigests: ReleaseRecoveryUpstreamResponseDigests
}>

export class SpacetimeReleaseRecoveryResolver {
  private readonly fetcher: ReleaseRecoveryFetch
  private readonly signer: ReleaseRecoveryJwtSigner
  private readonly clockMilliseconds: () => number
  private readonly clockSeconds: () => number
  private readonly timerFactory: ReleaseRecoveryTimerFactory
  private readonly requestContext: ReleaseRecoveryRequestContext | undefined

  constructor(
    private readonly config: ReleaseRecoveryConfig,
    dependencies: SpacetimeReleaseRecoveryResolverDependencies = {},
  ) {
    this.fetcher = dependencies.fetcher ?? fetch
    this.signer = dependencies.signer ?? signEs256Jwt
    this.clockMilliseconds = dependencies.clockMilliseconds ?? Date.now
    this.clockSeconds = dependencies.clockSeconds ?? (() => Math.floor(Date.now() / 1000))
    this.timerFactory = dependencies.timerFactory ?? defaultTimerFactory
    this.requestContext = dependencies.requestContext
  }

  private claims(kind: TokenKind, epoch?: number): RecoveryClaims {
    const now = this.clockSeconds()
    if (!Number.isSafeInteger(now) || now < 0) fail()
    if (kind === 'g001') return adminClaims(this.config.bridgeConfig, now)
    if (kind === 'g002') return genesis002AdminClaims(this.config.bridgeConfig, now)
    if (kind === 'ptr-admin') return ptrAtlasAdminClaims(this.config.bridgeConfig, now)
    if (!Number.isSafeInteger(epoch) || epoch === undefined || epoch < 1) fail()
    return ptrOwnerClaims(this.config.bridgeConfig, now, this.config.canaryFid, epoch)
  }

  private endpoint(database: string, operation: string, sql: boolean): string {
    const suffix = sql ? 'sql?confirmed=true' : `call/${operation}`
    return `${this.config.spacetimeOrigin}/v1/database/${database}/${suffix}`
  }

  private async request(
    context: ResolutionContext,
    database: string,
    operation: string,
    body: string,
    maximumBytes: number,
    tokenKind: TokenKind,
    epoch?: number,
  ): Promise<RawResponse> {
    context.requestCount += 1
    if (context.requestCount > RELEASE_RECOVERY_MAXIMUM_REQUESTS) fail()
    const sql = operation === 'sql'
    const url = this.endpoint(database, operation, sql)
    let token: string | undefined
    const failureAbort = abortPromise(context.failure.signal)
    const overallAbort = abortPromise(context.overall.signal)
    try {
      token = await Promise.race([
        this.signer(this.config.bridgeConfig, this.claims(tokenKind, epoch)),
        failureAbort.promise,
        overallAbort.promise,
      ])
      if (typeof token !== 'string' || token.length < 1) fail()
      const timeout = this.timerFactory(Math.min(RELEASE_RECOVERY_REQUEST_TIMEOUT_MS, context.remaining()))
      const controller = new AbortController()
      const forward = () => controller.abort()
      for (const signal of [context.failure.signal, context.overall.signal, timeout.signal]) {
        if (signal.aborted) forward()
        else signal.addEventListener('abort', forward, { once: true })
      }
      try {
        const response = await raceSignals(this.fetcher(url, {
          method: 'POST',
          headers: new Headers({
            authorization: `Bearer ${token}`,
            'content-type': sql ? 'text/plain; charset=utf-8' : 'application/json',
            accept: 'application/json',
            'cache-control': 'no-store',
          }),
          body,
          redirect: 'manual',
          signal: controller.signal,
        }), [context.failure.signal, context.overall.signal, timeout.signal])
        context.checkCompletion()
        if (
          timeout.fired()
          || response.url !== url
          || response.status !== 200
          || !JSON_MEDIA_TYPE.test(response.headers.get('content-type') ?? '')
        ) {
          cancelBodyNoWait(response.body)
          fail()
        }
        const raw = await readBody(
          response,
          maximumBytes,
          context,
          [context.failure.signal, context.overall.signal, timeout.signal],
        )
        context.checkCompletion()
        if (timeout.fired()) { raw.fill(0); fail() }
        return Object.freeze({ raw })
      } finally {
        timeout.cancel()
        controller.abort()
        for (const signal of [context.failure.signal, context.overall.signal, timeout.signal]) {
          signal.removeEventListener('abort', forward)
        }
      }
    } catch {
      context.abort()
      return fail()
    } finally {
      token = undefined
      failureAbort.remove()
      overallAbort.remove()
    }
  }

  private async programGroup(context: ResolutionContext): Promise<readonly Readonly<{
    label: 'GENESIS_001' | 'GENESIS_002' | 'PTR'
    database: string
    raw: Uint8Array
    program: string
  }>[]> {
    const inputs = [
      ['GENESIS_001', this.config.genesis001Database, 'g001'],
      ['GENESIS_002', this.config.genesis002Database, 'g002'],
      ['PTR', this.config.ptrDatabase, 'ptr-admin'],
    ] as const
    const tasks = inputs.map(([label, database, kind]) => (async () => {
      const response = await this.request(context, database, 'sql', PROGRAM_HASH_SQL, BODY_LIMITS.program, kind)
      try {
        return Object.freeze({ label, database, raw: response.raw, program: parseSpacetimeProgramHashResponse(response.raw) })
      } catch {
        response.raw.fill(0)
        return fail()
      }
    })().catch(() => {
      context.abort()
      return fail()
    }))
    const settled = await Promise.allSettled(tasks)
    if (settled.some(result => result.status === 'rejected')) {
      settled.forEach(result => {
        if (result.status === 'fulfilled') result.value.raw.fill(0)
      })
      fail()
    }
    return settled.map(result => (result as PromiseFulfilledResult<Awaited<(typeof tasks)[number]>>).value)
  }

  private async programTranscript(
    key: CryptoKey,
    domain: string,
    group: readonly Readonly<{ label: string; database: string; raw: Uint8Array }>[],
  ): Promise<string> {
    const frames: Uint8Array[] = []
    let payload: Uint8Array | undefined
    try {
      for (const item of group) {
        frames.push(frame(encoder.encode(item.label)), frame(encoder.encode(item.database)), frame(item.raw))
      }
      payload = concat(frames)
      return await hmacHex(key, domain, payload)
    } finally {
      payload?.fill(0)
      frames.forEach(value => value.fill(0))
      group.forEach(item => item.raw.fill(0))
    }
  }

  private async parseAndDigest<T>(
    key: CryptoKey,
    domain: string,
    response: RawResponse,
    parser: (raw: Uint8Array) => T,
  ): Promise<Readonly<{ value: T; digest: string }>> {
    try {
      const value = parser(response.raw)
      const digest = await hmacHex(key, domain, response.raw)
      return Object.freeze({ value, digest })
    } finally {
      response.raw.fill(0)
    }
  }

  private async memberPool(
    context: ResolutionContext,
    key: CryptoKey,
    fids: readonly string[],
  ): Promise<Readonly<{ members: readonly Member[]; digest: string }>> {
    const results: Array<Member | undefined> = new Array(fids.length)
    const digests: Array<Uint8Array | undefined> = new Array(fids.length)
    let cursor = 0
    const worker = async () => {
      for (;;) {
        if (context.failure.signal.aborted) return
        const index = cursor
        cursor += 1
        if (index >= fids.length) return
        const fid = fids[index]!
        const response = await this.request(
          context,
          this.config.genesis001Database,
          'admin_get_access_request_admission_status_v1',
          `[${fid}]`,
          BODY_LIMITS.member,
          'g001',
        )
        try {
          const member = parseMember(response.raw, fid)
          results[index] = member
          const fidBytes = encoder.encode(fid)
          const normalizedBytes = utf8Json(member.normalized)
          const frames = [frame(fidBytes), frame(normalizedBytes)]
          const payload = concat(frames)
          try {
            digests[index] = (await hmac(key, DOMAINS.member, payload)).bytes
          } finally {
            payload.fill(0)
            frames.forEach(value => value.fill(0))
            fidBytes.fill(0)
            normalizedBytes.fill(0)
          }
        } finally { response.raw.fill(0) }
      }
    }
    const workers = Array.from({ length: Math.min(6, fids.length) }, () => worker().catch(() => {
      context.abort()
      return fail()
    }))
    let payload: Uint8Array | undefined
    const aggregateParts: Uint8Array[] = []
    try {
      const settled = await Promise.allSettled(workers)
      if (settled.some(result => result.status === 'rejected') || results.some(value => value === undefined) || digests.some(value => value === undefined)) fail()
      aggregateParts.push(u32be(fids.length))
      for (let index = 0; index < fids.length; index += 1) {
        const fidBytes = encoder.encode(fids[index]!)
        try {
          aggregateParts.push(frame(fidBytes), frame(digests[index]!))
        } finally {
          fidBytes.fill(0)
        }
      }
      payload = concat(aggregateParts)
      const digest = await hmacHex(key, DOMAINS.members, payload)
      return Object.freeze({ members: Object.freeze(results as Member[]), digest })
    } finally {
      payload?.fill(0)
      aggregateParts.forEach(value => value.fill(0))
      digests.forEach(value => value?.fill(0))
    }
  }

  async resolve(): Promise<SpacetimeReleaseRecoveryResolution> {
    let context: ResolutionContext | undefined
    const pepper = Uint8Array.from(this.config.censusPepperBytes)
    try {
      const key = await importPepper(pepper)
      pepper.fill(0)
      context = new ResolutionContext(this.clockMilliseconds, this.timerFactory, this.requestContext)
      const observedFrom = this.clockSeconds()
      if (!Number.isSafeInteger(observedFrom) || observedFrom < 0) fail()

      const programsBefore = await this.programGroup(context)
      const programBeforeDigest = await this.programTranscript(key, DOMAINS.programBefore, programsBefore)

      const policyResponse = await this.request(
        context, this.config.genesis001Database, 'genesis_001_access_policy_v1', '[]', BODY_LIMITS.policy, 'g001',
      )
      const { value: policy, digest: policyDigest } = await this.parseAndDigest(
        key, DOMAINS.policy, policyResponse, parsePolicy,
      )

      const alphaBeforeResponse = await this.request(
        context, this.config.genesis001Database, 'admin_get_alpha_status_v3', '[]', BODY_LIMITS.alpha, 'g001',
      )
      const { value: alphaBefore, digest: alphaBeforeDigest } = await this.parseAndDigest(
        key, DOMAINS.alphaBefore, alphaBeforeResponse, parseAlpha,
      )
      const enumerationBeforeResponse = await this.request(
        context, this.config.genesis001Database, 'sql', PLAYER_FID_SQL, BODY_LIMITS.fids, 'g001',
      )
      const { value: fidsBefore, digest: enumerationBeforeDigest } = await this.parseAndDigest(
        key, DOMAINS.enumerationBefore, enumerationBeforeResponse, parseSpacetimeFidResponse,
      )
      validateAlpha(alphaBefore, fidsBefore.length)

      const members = await this.memberPool(context, key, fidsBefore)

      const enumerationAfterResponse = await this.request(
        context, this.config.genesis001Database, 'sql', PLAYER_FID_SQL, BODY_LIMITS.fids, 'g001',
      )
      const { value: fidsAfter, digest: enumerationAfterDigest } = await this.parseAndDigest(
        key, DOMAINS.enumerationAfter, enumerationAfterResponse, parseSpacetimeFidResponse,
      )
      if (JSON.stringify(fidsBefore) !== JSON.stringify(fidsAfter)) fail()

      const alphaAfterResponse = await this.request(
        context, this.config.genesis001Database, 'admin_get_alpha_status_v3', '[]', BODY_LIMITS.alpha, 'g001',
      )
      const { value: alphaAfter, digest: alphaAfterDigest } = await this.parseAndDigest(
        key, DOMAINS.alphaAfter, alphaAfterResponse, parseAlpha,
      )
      validateAlpha(alphaAfter, fidsAfter.length)
      if (JSON.stringify(alphaBefore.invariant) !== JSON.stringify(alphaAfter.invariant)) fail()

      const canary = members.members.find(member => member.fid === this.config.canaryFid)
      if (canary === undefined) fail()

      const g002Response = await this.request(
        context, this.config.genesis002Database, 'admin_get_greater_realm_status_v1', '[]',
        BODY_LIMITS.administrator, 'g002',
      )
      const { value: g002Status, digest: g002ResponseDigest } = await this.parseAndDigest(
        key, DOMAINS.g002, g002Response, parseG002,
      )

      const ptrAdminResponse = await this.request(
        context, this.config.ptrDatabase, 'admin_get_greater_realm_status_v1', '[]',
        BODY_LIMITS.administrator, 'ptr-admin',
      )
      const { value: ptrAdminStatus, digest: ptrAdminResponseDigest } = await this.parseAndDigest(
        key, DOMAINS.ptrAdmin, ptrAdminResponse, parsePtrAdmin,
      )

      const ptrOwnerResponse = await this.request(
        context, this.config.ptrDatabase, 'get_ptr_owner_status_v1', '[]',
        BODY_LIMITS.owner, 'ptr-owner', canary.authEpochNumber,
      )
      const { value: ptrOwnerStatus, digest: ptrOwnerResponseDigest } = await this.parseAndDigest(
        key,
        DOMAINS.ptrOwnerResponse,
        ptrOwnerResponse,
        raw => parsePtrOwner(raw, this.config.canaryFid, canary.authEpochNumber),
      )

      const programsAfter = await this.programGroup(context)
      const programAfterDigest = await this.programTranscript(key, DOMAINS.programAfter, programsAfter)
      for (let index = 0; index < programsBefore.length; index += 1) {
        if (programsBefore[index]!.program !== programsAfter[index]!.program) fail()
      }

      const observedThrough = this.clockSeconds()
      if (
        !Number.isSafeInteger(observedThrough)
        || observedThrough < observedFrom
        || observedThrough - observedFrom > 75
      ) fail()

      const censusPayload = utf8Json(members.members.map(member => ({ fid: member.fid, authEpoch: member.authEpoch })))
      const alphaPayload = utf8Json(alphaBefore.invariant)
      const g002Payload = utf8Json(g002Status)
      const ptrPayload = utf8Json(ptrAdminStatus)
      const ptrOwnerInvariant = orderedRecord(PTR_OWNER_STATUS_FIELDS.slice(0, 7), [
        text(ptrOwnerStatus.normalized, 'realmId'),
        text(ptrOwnerStatus.normalized, 'releaseVersion'),
        text(ptrOwnerStatus.normalized, 'moduleIdentity'),
        text(ptrOwnerStatus.normalized, 'ownerFid'),
        text(ptrOwnerStatus.normalized, 'authEpoch'),
        flag(ptrOwnerStatus.normalized, 'accessGranted'),
        flag(ptrOwnerStatus.normalized, 'atlasReady'),
      ])
      const ptrOwnerPayload = utf8Json(ptrOwnerInvariant)
      try {
        const [censusHmac, alphaHmac, g002Hmac, ptrHmac, ptrOwnerHmac] = await Promise.all([
          hmacHex(key, DOMAINS.census, censusPayload),
          hmacHex(key, DOMAINS.alphaInvariant, alphaPayload),
          hmacHex(key, DOMAINS.g002Sealed, g002Payload),
          hmacHex(key, DOMAINS.ptrSealed, ptrPayload),
          hmacHex(key, DOMAINS.ptrOwner, ptrOwnerPayload),
        ])
        context.checkCompletion()
        const g001Program = programsBefore[0]!.program
        const g002Program = programsBefore[1]!.program
        const ptrProgram = programsBefore[2]!.program
        return Object.freeze({
          observedFrom,
          observedThrough,
          g001: Object.freeze({
            databaseIdentity: G001_DATABASE,
            programKeccak256: g001Program,
            ...policy,
            admittedPlayerCount: members.members.length,
            enabledPlayerCount: members.members.length,
            censusStable: true,
            admittedPlayerCensusHmacSha256: censusHmac,
            alphaInvariantHmacSha256: alphaHmac,
          }),
          g002: Object.freeze({
            databaseIdentity: this.config.genesis002Database,
            programKeccak256: g002Program,
            realmId: 'GENESIS_002',
            databaseName: 'warpkeep-genesis-002',
            moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
            releaseVersion: '0.4.0',
            launchState: 'sealed',
            admissionsOpen: false,
            accessRequestsOpen: false,
            sealed: true,
            atlasReady: true,
            playerCount: 0,
            generalAdmissionCount: 0,
            populationGuardPassed: true,
            atlasId: text(g002Status, 'atlasId'),
            publicReleaseId: text(g002Status, 'publicReleaseId'),
            publicApprovalReceiptId: text(g002Status, 'publicApprovalReceiptId'),
            atlasSourceCommit: text(g002Status, 'sourceCommit'),
            expectedReleaseSha256: text(g002Status, 'expectedReleaseSha256'),
            releaseHeaderSha256: text(g002Status, 'releaseHeaderSha256'),
            verificationDigest: text(g002Status, 'verificationDigest'),
            sealedStateHmacSha256: g002Hmac,
          }),
          ptr: Object.freeze({
            databaseIdentity: this.config.ptrDatabase,
            programKeccak256: ptrProgram,
            realmId: 'PTR',
            releaseVersion: '0.4.0-ptr.1',
            moduleIdentity: 'warpkeep-ptr-owner-view-v1',
            launchState: 'owner-only',
            admissionsOpen: false,
            accessRequestsOpen: false,
            sealed: true,
            atlasReady: true,
            populationGuardPassed: true,
            singletonOwnerCount: 1,
            ownerEnabled: true,
            generalAdmissionCount: 0,
            atlasId: text(ptrAdminStatus, 'atlasId'),
            publicReleaseId: text(ptrAdminStatus, 'publicReleaseId'),
            publicApprovalReceiptId: text(ptrAdminStatus, 'publicApprovalReceiptId'),
            atlasSourceCommit: text(ptrAdminStatus, 'sourceCommit'),
            expectedReleaseSha256: text(ptrAdminStatus, 'expectedReleaseSha256'),
            releaseHeaderSha256: text(ptrAdminStatus, 'releaseHeaderSha256'),
            verificationDigest: text(ptrAdminStatus, 'verificationDigest'),
            sealedStateHmacSha256: ptrHmac,
            ownerInvariantHmacSha256: ptrOwnerHmac,
          }),
          upstreamResponseDigests: Object.freeze({
            programIdentityBeforeTranscriptHmacSha256: programBeforeDigest,
            g001PolicyResponseHmacSha256: policyDigest,
            g001AlphaBeforeResponseHmacSha256: alphaBeforeDigest,
            g001PlayerEnumerationBeforeResponseHmacSha256: enumerationBeforeDigest,
            g001AdmissionStatusesResponseHmacSha256: members.digest,
            g001PlayerEnumerationAfterResponseHmacSha256: enumerationAfterDigest,
            g001AlphaAfterResponseHmacSha256: alphaAfterDigest,
            g002StatusResponseHmacSha256: g002ResponseDigest,
            ptrAdminStatusResponseHmacSha256: ptrAdminResponseDigest,
            ptrOwnerStatusResponseHmacSha256: ptrOwnerResponseDigest,
            programIdentityAfterTranscriptHmacSha256: programAfterDigest,
          }),
        })
      } finally {
        censusPayload.fill(0)
        alphaPayload.fill(0)
        g002Payload.fill(0)
        ptrPayload.fill(0)
        ptrOwnerPayload.fill(0)
      }
    } catch {
      context?.abort()
      return fail()
    } finally {
      pepper.fill(0)
      context?.close()
    }
  }
}
