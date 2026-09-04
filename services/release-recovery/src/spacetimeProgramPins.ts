export const PROGRAM_PIN_MANIFEST_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'realms',
] as const)

export const PROGRAM_PIN_REALM_KEYS = Object.freeze([
  'g001',
  'g002',
  'ptr',
] as const)

const COMMON_PROGRAM_PIN_KEYS = Object.freeze([
  'modulePath',
  'dependencyLockClosureSha256',
  'toolchainManifestPath',
  'toolchainManifestSha256',
  'nodeVersion',
  'spacetimeVersion',
  'gitPackageVersion',
  'wslVersion',
  'firstBuildArtifactSha256',
  'secondBuildArtifactSha256',
  'programArtifactSha256',
  'programHashAlgorithm',
  'programKeccak256',
  'deployedAbiV10Sha256',
  'rawModuleDefV10ResponseSha256',
  'rawModuleDefV10FixturePath',
] as const)

export const G001_PROGRAM_PIN_KEYS = Object.freeze([
  'realm',
  'databaseIdentity',
  'recoveryBuildProfile',
  'g001BaselineCommit',
  'g001BaselineTree',
  'g001BaselineSpacetimeTree',
  'g001BaselineAbiSha256',
  'g001FreezePreparationCommit',
  'g001FreezePreparationTree',
  'g001FreezePreparationSourceSha256',
  'g001MaterializerSha256',
  'g001FreezeReleaseNonce',
  'g001TransformedFrozenSourceClosureSha256',
  ...COMMON_PROGRAM_PIN_KEYS,
] as const)

export const G002_PROGRAM_PIN_KEYS = Object.freeze([
  'realm',
  'databaseIdentity',
  'recoveryBuildProfile',
  'g002SourceCommit',
  'g002SourceTree',
  ...COMMON_PROGRAM_PIN_KEYS,
] as const)

export const PTR_PROGRAM_PIN_KEYS = Object.freeze([
  'realm',
  'databaseIdentity',
  'recoveryBuildProfile',
  'ptrSourceCommit',
  'ptrSourceTree',
  ...COMMON_PROGRAM_PIN_KEYS,
] as const)

export const SPACETIME_PROGRAM_PINS_PROFILE =
  'warpkeep-release-recovery-spacetime-program-pins-v1' as const
export const RECOVERY_PROGRAM_BUILD_PROFILE =
  'warpkeep-release-recovery-cross-platform-program-build-v1' as const
export const PROGRAM_HASH_ALGORITHM = 'keccak-256' as const

const TOOLCHAIN_MANIFEST_PATH =
  'services/release-recovery/fixtures/toolchains/linux-x64.json' as const
const SPACETIME_VERSION = '2.6.1' as const
const GIT_PACKAGE_VERSION = '1:2.43.0-1ubuntu7.3' as const
const WSL_VERSION = '2.7.11.0' as const

const G001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e' as const
const G001_BASELINE_COMMIT = '2ae51984e1fa6ce5b0028c1a250359fed79d819b' as const
const G001_BASELINE_TREE = '90deebb5faf4129282f5c35999244f540001b27d' as const
const G001_BASELINE_SPACETIME_TREE = 'ab450fd2b3dcdd3ed67ef1f0431e18ae507382ac' as const
const G001_BASELINE_ABI_SHA256 =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03' as const
const G001_FREEZE_PREPARATION_COMMIT = 'd945256b217fa13ade944b9ed9880e8463b46123' as const
const G001_FREEZE_PREPARATION_TREE = '8c2b0b0eda17cefc212f08716a287c44b0e84d48' as const
const G001_FREEZE_PREPARATION_SOURCE_SHA256 =
  '38cd67fa1dcfc6875d0f7696b24995416ef92b5d088c920c9cb10f4753235251' as const
const G001_MATERIALIZER_SHA256 =
  'a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93' as const
const G001_FREEZE_RELEASE_NONCE =
  '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00' as const

type CommonProgramPin = Readonly<{
  databaseIdentity: string
  recoveryBuildProfile: typeof RECOVERY_PROGRAM_BUILD_PROFILE
  modulePath: string
  dependencyLockClosureSha256: string
  toolchainManifestPath: typeof TOOLCHAIN_MANIFEST_PATH
  toolchainManifestSha256: string
  nodeVersion: '24.19.0' | '22.22.3'
  spacetimeVersion: typeof SPACETIME_VERSION
  gitPackageVersion: typeof GIT_PACKAGE_VERSION
  wslVersion: typeof WSL_VERSION
  firstBuildArtifactSha256: string
  secondBuildArtifactSha256: string
  programArtifactSha256: string
  programHashAlgorithm: typeof PROGRAM_HASH_ALGORITHM
  programKeccak256: string
  deployedAbiV10Sha256: string
  rawModuleDefV10ResponseSha256: string
  rawModuleDefV10FixturePath: string
}>

export type G001ProgramPin = CommonProgramPin & Readonly<{
  realm: 'g001'
  g001BaselineCommit: typeof G001_BASELINE_COMMIT
  g001BaselineTree: typeof G001_BASELINE_TREE
  g001BaselineSpacetimeTree: typeof G001_BASELINE_SPACETIME_TREE
  g001BaselineAbiSha256: typeof G001_BASELINE_ABI_SHA256
  g001FreezePreparationCommit: typeof G001_FREEZE_PREPARATION_COMMIT
  g001FreezePreparationTree: typeof G001_FREEZE_PREPARATION_TREE
  g001FreezePreparationSourceSha256: typeof G001_FREEZE_PREPARATION_SOURCE_SHA256
  g001MaterializerSha256: typeof G001_MATERIALIZER_SHA256
  g001FreezeReleaseNonce: typeof G001_FREEZE_RELEASE_NONCE
  g001TransformedFrozenSourceClosureSha256: string
}>

export type G002ProgramPin = CommonProgramPin & Readonly<{
  realm: 'g002'
  g002SourceCommit: string
  g002SourceTree: string
}>

export type PtrProgramPin = CommonProgramPin & Readonly<{
  realm: 'ptr'
  ptrSourceCommit: string
  ptrSourceTree: string
}>

export type SpacetimeProgramPins = Readonly<{
  schemaVersion: 1
  profile: typeof SPACETIME_PROGRAM_PINS_PROFILE
  realms: Readonly<{
    g001: G001ProgramPin
    g002: G002ProgramPin
    ptr: PtrProgramPin
  }>
}>

const LOWER_HEX_40 = /^[0-9a-f]{40}$/u
const LOWER_HEX_64 = /^[0-9a-f]{64}$/u
const MAX_PROGRAM_PINS_BYTES = 128 * 1024
const MAX_PROGRAM_PINS_DEPTH = 16
const MAX_PROGRAM_PINS_NODES = 1_024
const decoder = new TextDecoder('utf-8', { fatal: true })

export class ReleaseRecoveryProgramPinsError extends Error {
  readonly code = 'RELEASE_RECOVERY_PROGRAM_PINS_FAILED' as const

  constructor() {
    super('RELEASE_RECOVERY_PROGRAM_PINS_FAILED')
    Object.defineProperty(this, 'name', {
      value: 'ReleaseRecoveryProgramPinsError',
      configurable: true,
      enumerable: false,
      writable: true,
    })
    delete this.stack
  }
}

function fail(): never {
  throw new ReleaseRecoveryProgramPinsError()
}

function exactRecord(
  input: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail()
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) fail()
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const actualKeys = Reflect.ownKeys(descriptors)
  if (actualKeys.length !== expectedKeys.length) fail()

  const result: Record<string, unknown> = Object.create(null)
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const expectedKey = expectedKeys[index]
    const actualKey = actualKeys[index]
    if (expectedKey === undefined || actualKey !== expectedKey) fail()
    const descriptor = descriptors[expectedKey]
    if (
      descriptor === undefined
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, 'value')
    ) fail()
    result[expectedKey] = descriptor.value
  }
  return Object.freeze(result)
}

function requireLiteral<T extends string | number>(value: unknown, expected: T): T {
  if (value !== expected) fail()
  return expected
}

function requireLowerHex(value: unknown, expression: RegExp): string {
  if (typeof value !== 'string' || !expression.test(value) || /^0+$/u.test(value)) fail()
  return value
}

function requireCommit(value: unknown): string {
  return requireLowerHex(value, LOWER_HEX_40)
}

function requireSha256(value: unknown): string {
  return requireLowerHex(value, LOWER_HEX_64)
}

type CommonExpected = Readonly<{
  realm: 'g001' | 'g002' | 'ptr'
  modulePath: 'spacetimedb' | 'spacetimedb/genesis002' | 'spacetimedb/ptr'
  nodeVersion: '24.19.0' | '22.22.3'
  fixturePath:
    | 'services/release-recovery/fixtures/spacetime/g001.raw-module-def-v10.json'
    | 'services/release-recovery/fixtures/spacetime/g002.raw-module-def-v10.json'
    | 'services/release-recovery/fixtures/spacetime/ptr.raw-module-def-v10.json'
}>

function validateCommon(
  record: Readonly<Record<string, unknown>>,
  expected: CommonExpected,
): void {
  requireLiteral(record.realm, expected.realm)
  requireSha256(record.databaseIdentity)
  requireLiteral(record.recoveryBuildProfile, RECOVERY_PROGRAM_BUILD_PROFILE)
  requireLiteral(record.modulePath, expected.modulePath)
  requireSha256(record.dependencyLockClosureSha256)
  requireLiteral(record.toolchainManifestPath, TOOLCHAIN_MANIFEST_PATH)
  requireSha256(record.toolchainManifestSha256)
  requireLiteral(record.nodeVersion, expected.nodeVersion)
  requireLiteral(record.spacetimeVersion, SPACETIME_VERSION)
  requireLiteral(record.gitPackageVersion, GIT_PACKAGE_VERSION)
  requireLiteral(record.wslVersion, WSL_VERSION)
  requireSha256(record.firstBuildArtifactSha256)
  requireSha256(record.secondBuildArtifactSha256)
  requireSha256(record.programArtifactSha256)
  if (
    record.firstBuildArtifactSha256 !== record.secondBuildArtifactSha256
    || record.firstBuildArtifactSha256 !== record.programArtifactSha256
  ) fail()
  requireLiteral(record.programHashAlgorithm, PROGRAM_HASH_ALGORITHM)
  requireSha256(record.programKeccak256)
  requireSha256(record.deployedAbiV10Sha256)
  requireSha256(record.rawModuleDefV10ResponseSha256)
  requireLiteral(record.rawModuleDefV10FixturePath, expected.fixturePath)
}

function parseG001(input: unknown): G001ProgramPin {
  const record = exactRecord(input, G001_PROGRAM_PIN_KEYS)
  validateCommon(record, {
    realm: 'g001',
    modulePath: 'spacetimedb',
    nodeVersion: '24.19.0',
    fixturePath: 'services/release-recovery/fixtures/spacetime/g001.raw-module-def-v10.json',
  })
  requireLiteral(record.databaseIdentity, G001_DATABASE_IDENTITY)
  requireLiteral(record.g001BaselineCommit, G001_BASELINE_COMMIT)
  requireLiteral(record.g001BaselineTree, G001_BASELINE_TREE)
  requireLiteral(record.g001BaselineSpacetimeTree, G001_BASELINE_SPACETIME_TREE)
  requireLiteral(record.g001BaselineAbiSha256, G001_BASELINE_ABI_SHA256)
  requireLiteral(record.g001FreezePreparationCommit, G001_FREEZE_PREPARATION_COMMIT)
  requireLiteral(record.g001FreezePreparationTree, G001_FREEZE_PREPARATION_TREE)
  requireLiteral(
    record.g001FreezePreparationSourceSha256,
    G001_FREEZE_PREPARATION_SOURCE_SHA256,
  )
  requireLiteral(record.g001MaterializerSha256, G001_MATERIALIZER_SHA256)
  requireLiteral(record.g001FreezeReleaseNonce, G001_FREEZE_RELEASE_NONCE)
  requireSha256(record.g001TransformedFrozenSourceClosureSha256)
  if (record.deployedAbiV10Sha256 === record.g001BaselineAbiSha256) fail()
  return record as G001ProgramPin
}

function parseG002(input: unknown): G002ProgramPin {
  const record = exactRecord(input, G002_PROGRAM_PIN_KEYS)
  validateCommon(record, {
    realm: 'g002',
    modulePath: 'spacetimedb/genesis002',
    nodeVersion: '22.22.3',
    fixturePath: 'services/release-recovery/fixtures/spacetime/g002.raw-module-def-v10.json',
  })
  requireCommit(record.g002SourceCommit)
  requireCommit(record.g002SourceTree)
  return record as G002ProgramPin
}

function parsePtr(input: unknown): PtrProgramPin {
  const record = exactRecord(input, PTR_PROGRAM_PIN_KEYS)
  validateCommon(record, {
    realm: 'ptr',
    modulePath: 'spacetimedb/ptr',
    nodeVersion: '22.22.3',
    fixturePath: 'services/release-recovery/fixtures/spacetime/ptr.raw-module-def-v10.json',
  })
  requireCommit(record.ptrSourceCommit)
  requireCommit(record.ptrSourceTree)
  return record as PtrProgramPin
}

function requireDistinct(values: readonly string[]): void {
  if (new Set(values).size !== values.length) fail()
}

function validate(input: unknown): SpacetimeProgramPins {
  const manifest = exactRecord(input, PROGRAM_PIN_MANIFEST_KEYS)
  requireLiteral(manifest.schemaVersion, 1)
  requireLiteral(manifest.profile, SPACETIME_PROGRAM_PINS_PROFILE)
  const realmInput = exactRecord(manifest.realms, PROGRAM_PIN_REALM_KEYS)
  const g001 = parseG001(realmInput.g001)
  const g002 = parseG002(realmInput.g002)
  const ptr = parsePtr(realmInput.ptr)
  const realms = Object.freeze({ g001, g002, ptr })

  requireDistinct([g001.databaseIdentity, g002.databaseIdentity, ptr.databaseIdentity])
  requireDistinct([
    g001.dependencyLockClosureSha256,
    g002.dependencyLockClosureSha256,
    ptr.dependencyLockClosureSha256,
  ])
  requireDistinct([
    g001.programArtifactSha256,
    g002.programArtifactSha256,
    ptr.programArtifactSha256,
  ])
  requireDistinct([g001.programKeccak256, g002.programKeccak256, ptr.programKeccak256])
  requireDistinct([
    g001.deployedAbiV10Sha256,
    g002.deployedAbiV10Sha256,
    ptr.deployedAbiV10Sha256,
  ])
  requireDistinct([
    g001.rawModuleDefV10ResponseSha256,
    g002.rawModuleDefV10ResponseSha256,
    ptr.rawModuleDefV10ResponseSha256,
  ])
  if (
    g001.toolchainManifestSha256 !== g002.toolchainManifestSha256
    || g001.toolchainManifestSha256 !== ptr.toolchainManifestSha256
  ) fail()

  return Object.freeze({
    schemaVersion: 1,
    profile: SPACETIME_PROGRAM_PINS_PROFILE,
    realms,
  })
}

export function validateSpacetimeProgramPins(input: unknown): SpacetimeProgramPins {
  try {
    return validate(input)
  } catch (error) {
    if (error instanceof ReleaseRecoveryProgramPinsError) throw error
    fail()
  }
}

class StrictProgramPinsJsonParser {
  #index = 0
  #nodes = 0
  readonly #number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/uy

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.skipWhitespace()
    const value = this.value(1)
    this.skipWhitespace()
    if (this.#index !== this.source.length) fail()
    return value
  }

  private value(depth: number): unknown {
    if (depth > MAX_PROGRAM_PINS_DEPTH || ++this.#nodes > MAX_PROGRAM_PINS_NODES) fail()
    this.skipWhitespace()
    const character = this.source[this.#index]
    if (character === '{') return this.object(depth)
    if (character === '[') return this.array(depth)
    if (character === '"') return this.string()
    if (this.consume('true')) return true
    if (this.consume('false')) return false
    if (this.consume('null')) return null
    this.#number.lastIndex = this.#index
    const match = this.#number.exec(this.source)
    if (match === null) fail()
    const number = Number(match[0])
    if (!Number.isSafeInteger(number) || String(number) !== match[0]) fail()
    this.#index = this.#number.lastIndex
    return number
  }

  private object(depth: number): Record<string, unknown> {
    this.#index += 1
    const result: Record<string, unknown> = {}
    this.skipWhitespace()
    if (this.source[this.#index] === '}') {
      this.#index += 1
      return result
    }
    while (true) {
      if (this.source[this.#index] !== '"') fail()
      const key = this.string()
      if (Object.hasOwn(result, key)) fail()
      this.skipWhitespace()
      if (this.source[this.#index] !== ':') fail()
      this.#index += 1
      result[key] = this.value(depth + 1)
      this.skipWhitespace()
      const separator = this.source[this.#index]
      if (separator === '}') {
        this.#index += 1
        return result
      }
      if (separator !== ',') fail()
      this.#index += 1
      this.skipWhitespace()
    }
  }

  private array(depth: number): unknown[] {
    this.#index += 1
    const result: unknown[] = []
    this.skipWhitespace()
    if (this.source[this.#index] === ']') {
      this.#index += 1
      return result
    }
    while (true) {
      result.push(this.value(depth + 1))
      if (result.length > MAX_PROGRAM_PINS_NODES) fail()
      this.skipWhitespace()
      const separator = this.source[this.#index]
      if (separator === ']') {
        this.#index += 1
        return result
      }
      if (separator !== ',') fail()
      this.#index += 1
      this.skipWhitespace()
    }
  }

  private string(): string {
    const start = this.#index
    this.#index += 1
    let escaped = false
    while (this.#index < this.source.length) {
      const character = this.source[this.#index++]
      if (character === '"' && !escaped) {
        const token = this.source.slice(start, this.#index)
        try {
          const value: unknown = JSON.parse(token)
          if (typeof value !== 'string' || JSON.stringify(value) !== token) fail()
          return value
        } catch (error) {
          if (error instanceof ReleaseRecoveryProgramPinsError) throw error
          fail()
        }
      }
      if (character === undefined || character < ' ') fail()
      if (escaped) {
        if (character === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(this.source.slice(this.#index, this.#index + 4))) fail()
          this.#index += 4
        } else if (!'"\\/bfnrt'.includes(character)) {
          fail()
        }
        escaped = false
      } else if (character === '\\') {
        escaped = true
      }
    }
    fail()
  }

  private skipWhitespace(): void {
    while (' \t\r\n'.includes(this.source[this.#index] ?? '\0')) this.#index += 1
  }

  private consume(token: string): boolean {
    if (!this.source.startsWith(token, this.#index)) return false
    this.#index += token.length
    return true
  }
}

export function parseSpacetimeProgramPins(bytes: Uint8Array): SpacetimeProgramPins {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_PROGRAM_PINS_BYTES) fail()
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail()
    return validate(new StrictProgramPinsJsonParser(decoder.decode(bytes)).parse())
  } catch (error) {
    if (error instanceof ReleaseRecoveryProgramPinsError) throw error
    fail()
  }
}
