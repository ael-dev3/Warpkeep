import { Inflate } from 'fflate'
import {
  MAX_ARCHIVE_BYTES,
  MAX_TAR_BYTES,
  RecoveryGitHubError,
  commit,
  githubFail,
  sha,
  snapshotExactDataObject,
} from './config.js'
import { parseGitHubJsonObject, type GitHubJsonObject } from './http.js'

const CODE = 'RECOVERY_GITHUB_ARCHIVE_INVALID'
const ARTIFACT_NAME = 'artifact.tar'
const ATTESTATION_PATH = '.well-known/warpkeep-deployment-v1.json'
const ALLOWED_HIDDEN_PATHS = new Set([ATTESTATION_PATH, '.well-known/farcaster.json'])
const ATTESTATION_KEYS = [
  'schemaVersion', 'profile', 'candidateCommit', 'candidateTree',
  'recoveryAuthorizationCoreSha256', 'sourceClosureProfile',
  'sourceClosureSha256', 'releaseVersion', 'canonicalOrigin',
  'contentManifestSha256',
] as const
const EXPECTED_KEYS = [
  'candidateCommit', 'candidateTree', 'recoveryAuthorizationCoreSha256',
  'sourceClosureProfile', 'sourceClosureSha256',
] as const
const SOURCE_CLOSURE_PROFILE = 'warpkeep-0.4.0-recovery-source-closure-v1'
const MAX_QUEUE_BYTES = 1024 * 1024
const MAX_INFLATER_PENDING_BYTES = 256 * 1024
const MAX_INFLATE_CHUNK_BYTES = 32 * 1024
const MAX_TAR_ENTRIES = 20_000
const MAX_TAR_FILE_BYTES = 64 * 1024 * 1024
const MAX_ATTESTATION_BYTES = 16 * 1024
const MAX_COMPRESSION_RATIO = 2048
const READ_TIMEOUT_MS = 10_000
const LOCAL_SIGNATURE = 0x0403_4b50
const CENTRAL_SIGNATURE = 0x0201_4b50
const DESCRIPTOR_SIGNATURE = 0x0807_4b50
const EOCD_SIGNATURE = 0x0605_4b50
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export type PagesArtifactExpected = Readonly<{
  candidateCommit: string
  candidateTree: string
  recoveryAuthorizationCoreSha256: string
  sourceClosureProfile: string
  sourceClosureSha256: string
}>

export type PagesArtifactDigests = Readonly<{
  githubArtifactArchiveSha256: string
  innerArtifactTarSha256: string
  contentManifestSha256: string
  deploymentAttestationSha256: string
  deploymentAttestationBytes: Uint8Array
}>

function snapshotExpected(input: PagesArtifactExpected): PagesArtifactExpected {
  const value = snapshotExactDataObject(input, EXPECTED_KEYS, CODE)
  if (
    !commit(value.candidateCommit)
    || !commit(value.candidateTree)
    || !sha(value.recoveryAuthorizationCoreSha256)
    || value.sourceClosureProfile !== SOURCE_CLOSURE_PROFILE
    || !sha(value.sourceClosureSha256)
  ) githubFail(CODE)
  return Object.freeze({
    candidateCommit: value.candidateCommit,
    candidateTree: value.candidateTree,
    recoveryAuthorizationCoreSha256: value.recoveryAuthorizationCoreSha256,
    sourceClosureProfile: SOURCE_CLOSURE_PROFILE,
    sourceClosureSha256: value.sourceClosureSha256,
  })
}

const SHA256_INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
])
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const CRC32_TABLE = new Uint32Array(256)
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb8_8320 : 0)
  CRC32_TABLE[index] = value >>> 0
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount))
}

class Sha256 {
  readonly #state = Uint32Array.from(SHA256_INITIAL)
  readonly #buffer = new Uint8Array(64)
  readonly #words = new Uint32Array(64)
  #buffered = 0
  #length = 0n
  #finished = false

  update(value: Uint8Array): void {
    if (this.#finished) githubFail(CODE)
    this.#length += BigInt(value.length)
    let offset = 0
    while (offset < value.length) {
      const count = Math.min(64 - this.#buffered, value.length - offset)
      this.#buffer.set(value.subarray(offset, offset + count), this.#buffered)
      this.#buffered += count
      offset += count
      if (this.#buffered === 64) {
        this.compress(this.#buffer)
        this.#buffered = 0
      }
    }
  }

  digestHex(): string {
    if (this.#finished) githubFail(CODE)
    const bitLength = this.#length * 8n
    this.#finished = true
    this.#buffer[this.#buffered++] = 0x80
    if (this.#buffered > 56) {
      this.#buffer.fill(0, this.#buffered)
      this.compress(this.#buffer)
      this.#buffered = 0
    }
    this.#buffer.fill(0, this.#buffered, 56)
    const view = new DataView(this.#buffer.buffer)
    view.setBigUint64(56, bitLength, false)
    this.compress(this.#buffer)
    return [...this.#state].map(word => word.toString(16).padStart(8, '0')).join('')
  }

  private compress(block: Uint8Array): void {
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
    for (let index = 0; index < 16; index += 1) this.#words[index] = view.getUint32(index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const before15 = this.#words[index - 15]!
      const before2 = this.#words[index - 2]!
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      this.#words[index] = (this.#words[index - 16]! + sigma0 + this.#words[index - 7]! + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = this.#state
    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25)
      const choose = (e! & f!) ^ (~e! & g!)
      const first = (h! + bigSigma1 + choose + SHA256_K[index]! + this.#words[index]!) >>> 0
      const bigSigma0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22)
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!)
      const second = (bigSigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d! + first) >>> 0
      d = c
      c = b
      b = a
      a = (first + second) >>> 0
    }
    this.#state[0] = (this.#state[0]! + a!) >>> 0
    this.#state[1] = (this.#state[1]! + b!) >>> 0
    this.#state[2] = (this.#state[2]! + c!) >>> 0
    this.#state[3] = (this.#state[3]! + d!) >>> 0
    this.#state[4] = (this.#state[4]! + e!) >>> 0
    this.#state[5] = (this.#state[5]! + f!) >>> 0
    this.#state[6] = (this.#state[6]! + g!) >>> 0
    this.#state[7] = (this.#state[7]! + h!) >>> 0
  }
}

class Crc32 {
  #value = 0xffff_ffff

  update(bytes: Uint8Array): void {
    for (const byte of bytes) this.#value = (this.#value >>> 8) ^ CRC32_TABLE[(this.#value ^ byte) & 0xff]!
  }

  digest(): number {
    return (this.#value ^ 0xffff_ffff) >>> 0
  }
}

async function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) githubFail(CODE)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new RecoveryGitHubError(CODE)), remaining)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function safeArchiveUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.hash === ''
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && !hostname.includes(':')
      && !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)
      && !/^(?:10|127|169\.254|192\.168|172\.(?:1[6-9]|2[0-9]|3[0-1]))\./u.test(hostname)
  } catch {
    return false
  }
}

class ArchiveSource {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>
  readonly #declaredLength: number
  readonly #deadline = Date.now() + READ_TIMEOUT_MS
  readonly #outerSha256 = new Sha256()
  readonly #queue: Uint8Array[] = []
  #queueOffset = 0
  #queuedBytes = 0
  #readBytes = 0
  #position = 0
  #ended = false

  constructor(response: Response) {
    try {
      if (response.status !== 200 || response.type === 'opaqueredirect' || !safeArchiveUrl(response.url) || response.body === null) {
        githubFail(CODE)
      }
      const contentLength = response.headers.get('content-length')
      const contentType = response.headers.get('content-type')
      if (
        contentLength === null
        || !/^[1-9][0-9]*$/u.test(contentLength)
        || contentType === null
        || !/^application\/(?:zip|octet-stream|x-zip-compressed)$/iu.test(contentType)
      ) githubFail(CODE)
      const declared = BigInt(contentLength)
      if (declared > BigInt(MAX_ARCHIVE_BYTES)) githubFail(CODE)
      this.#declaredLength = Number(declared)
      this.#reader = response.body.getReader()
    } catch (error) {
      if (error instanceof RecoveryGitHubError) throw error
      githubFail(CODE)
    }
  }

  get position(): number {
    return this.#position
  }

  async readExactly(length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_QUEUE_BYTES) githubFail(CODE)
    const result = new Uint8Array(length)
    let offset = 0
    while (offset < length) {
      const part = await this.readSome(length - offset)
      if (part.length === 0) githubFail(CODE)
      result.set(part, offset)
      offset += part.length
    }
    return result
  }

  async readSome(limit: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUEUE_BYTES) githubFail(CODE)
    while (this.#queuedBytes === 0 && !this.#ended) await this.pull()
    if (this.#queuedBytes === 0) return new Uint8Array()
    const first = this.#queue[0]!
    const count = Math.min(limit, first.length - this.#queueOffset)
    const result = Uint8Array.from(first.subarray(this.#queueOffset, this.#queueOffset + count))
    this.#queueOffset += count
    this.#queuedBytes -= count
    this.#position += count
    if (this.#queueOffset === first.length) {
      this.#queue.shift()
      this.#queueOffset = 0
    }
    return result
  }

  unread(bytes: Uint8Array): void {
    if (bytes.length === 0) return
    if (bytes.length > this.#position || bytes.length > MAX_QUEUE_BYTES - this.#queuedBytes) githubFail(CODE)
    if (this.#queueOffset !== 0) {
      const first = this.#queue.shift()!
      this.#queue.unshift(Uint8Array.from(first.subarray(this.#queueOffset)))
      this.#queueOffset = 0
    }
    this.#queue.unshift(Uint8Array.from(bytes))
    this.#queuedBytes += bytes.length
    this.#position -= bytes.length
  }

  async finish(): Promise<string> {
    if ((await this.readSome(1)).length !== 0) githubFail(CODE)
    if (!this.#ended || this.#queuedBytes !== 0 || this.#readBytes !== this.#declaredLength || this.#position !== this.#declaredLength) {
      githubFail(CODE)
    }
    return this.#outerSha256.digestHex()
  }

  async cancel(): Promise<void> {
    try {
      await this.#reader.cancel()
    } catch {
      // The stable archive error is selected by the caller.
    }
  }

  private async pull(): Promise<void> {
    let result: ReadableStreamReadResult<Uint8Array>
    try {
      result = await beforeDeadline(this.#reader.read(), this.#deadline)
    } catch (error) {
      if (error instanceof RecoveryGitHubError) throw error
      githubFail(CODE)
    }
    if (result.done) {
      this.#ended = true
      if (this.#readBytes !== this.#declaredLength) githubFail(CODE)
      return
    }
    if (!(result.value instanceof Uint8Array) || result.value.length === 0) githubFail(CODE)
    if (
      result.value.length > MAX_QUEUE_BYTES - this.#queuedBytes
      || result.value.length > this.#declaredLength - this.#readBytes
    ) githubFail(CODE)
    const copy = Uint8Array.from(result.value)
    this.#outerSha256.update(copy)
    this.#readBytes += copy.length
    this.#queue.push(copy)
    this.#queuedBytes += copy.length
  }
}

function unsignedUtf8Order(left: string, right: string): number {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!
  }
  return a.length - b.length
}

function decodeNulField(field: Uint8Array): string {
  const nul = field.indexOf(0)
  const end = nul === -1 ? field.length : nul
  if (nul !== -1 && field.subarray(nul).some(byte => byte !== 0)) githubFail(CODE)
  const value = field.subarray(0, end)
  if (value.some(byte => byte < 0x20 || byte > 0x7e)) githubFail(CODE)
  return String.fromCharCode(...value)
}

function octal(field: Uint8Array, maximum: number): number {
  if (field.length < 2 || field[field.length - 1] !== 0 || field.subarray(0, field.length - 1).some(byte => byte < 0x30 || byte > 0x37)) {
    githubFail(CODE)
  }
  const value = Number.parseInt(String.fromCharCode(...field.subarray(0, field.length - 1)), 8)
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) githubFail(CODE)
  return value
}

function safeTarPath(value: string): boolean {
  if (
    value.length < 1
    || value.length > 255
    || value.startsWith('/')
    || value.endsWith('/')
    || /[\\\0-\x1f\x7f]/u.test(value)
  ) return false
  const parts = value.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) return false
  if (parts.some(part => part.startsWith('.')) && !ALLOWED_HIDDEN_PATHS.has(value)) return false
  return !parts.some(part => (
    part === '.git'
    || part === '.github'
    || part === 'node_modules'
    || part === '.dev.vars'
    || part === '.wrangler'
    || part === '.env'
    || part.startsWith('.env.')
  ))
}

type ManifestEntry = Readonly<{ path: string; byteLength: number; sha256: string }>

class TarStream {
  readonly #tarSha256 = new Sha256()
  readonly #tarCrc32 = new Crc32()
  readonly #header = new Uint8Array(512)
  readonly #seen = new Set<string>()
  readonly #folded = new Set<string>()
  readonly #manifest: ManifestEntry[] = []
  #headerLength = 0
  #tarBytes = 0
  #entries = 0
  #zeroBlocks = 0
  #ended = false
  #currentPath = ''
  #currentLength = 0
  #bodyRemaining = 0
  #paddingRemaining = 0
  #fileSha256: Sha256 | undefined
  #attestation: Uint8Array | undefined
  #attestationOffset = 0
  #capturingAttestation = false

  get byteLength(): number {
    return this.#tarBytes
  }

  get crc32(): number {
    return this.#tarCrc32.digest()
  }

  push(bytes: Uint8Array): void {
    if (bytes.length === 0) return
    if (this.#ended) githubFail(CODE)
    if (bytes.length > MAX_TAR_BYTES - this.#tarBytes) githubFail(CODE)
    this.#tarSha256.update(bytes)
    this.#tarCrc32.update(bytes)
    this.#tarBytes += bytes.length
    let offset = 0
    while (offset < bytes.length) {
      if (this.#bodyRemaining > 0) {
        const count = Math.min(this.#bodyRemaining, bytes.length - offset)
        const part = bytes.subarray(offset, offset + count)
        this.#fileSha256!.update(part)
        if (this.#capturingAttestation) {
          if (this.#attestation === undefined) githubFail(CODE)
          this.#attestation.set(part, this.#attestationOffset)
          this.#attestationOffset += count
        }
        this.#bodyRemaining -= count
        offset += count
        if (this.#bodyRemaining === 0 && this.#paddingRemaining === 0) this.finishFile()
        continue
      }
      if (this.#paddingRemaining > 0) {
        const count = Math.min(this.#paddingRemaining, bytes.length - offset)
        if (bytes.subarray(offset, offset + count).some(byte => byte !== 0)) githubFail(CODE)
        this.#paddingRemaining -= count
        offset += count
        if (this.#paddingRemaining === 0) this.finishFile()
        continue
      }
      const count = Math.min(512 - this.#headerLength, bytes.length - offset)
      this.#header.set(bytes.subarray(offset, offset + count), this.#headerLength)
      this.#headerLength += count
      offset += count
      if (this.#headerLength === 512) {
        this.consumeHeader()
        this.#headerLength = 0
      }
    }
  }

  finish(expectedInput: PagesArtifactExpected): PagesArtifactDigests {
    if (!this.#ended || this.#headerLength !== 0 || this.#bodyRemaining !== 0 || this.#paddingRemaining !== 0 || this.#zeroBlocks !== 2) {
      githubFail(CODE)
    }
    if (this.#attestation === undefined) githubFail(CODE)
    this.#manifest.sort((left, right) => unsignedUtf8Order(left.path, right.path))
    const manifestBytes = encoder.encode(JSON.stringify(this.#manifest))
    const manifestSha = new Sha256()
    manifestSha.update(manifestBytes)
    const contentManifestSha256 = manifestSha.digestHex()
    const attestation = this.parseAttestation(this.#attestation)
    if (
      attestation.candidateCommit !== expectedInput.candidateCommit
      || attestation.candidateTree !== expectedInput.candidateTree
      || attestation.recoveryAuthorizationCoreSha256 !== expectedInput.recoveryAuthorizationCoreSha256
      || attestation.sourceClosureProfile !== expectedInput.sourceClosureProfile
      || attestation.sourceClosureSha256 !== expectedInput.sourceClosureSha256
      || attestation.contentManifestSha256 !== contentManifestSha256
    ) githubFail(CODE)
    const attestationSha = new Sha256()
    attestationSha.update(this.#attestation)
    return Object.freeze({
      githubArtifactArchiveSha256: '',
      innerArtifactTarSha256: this.#tarSha256.digestHex(),
      contentManifestSha256,
      deploymentAttestationSha256: attestationSha.digestHex(),
      deploymentAttestationBytes: Uint8Array.from(this.#attestation),
    })
  }

  private consumeHeader(): void {
    const header = Uint8Array.from(this.#header)
    if (header.every(byte => byte === 0)) {
      this.#zeroBlocks += 1
      if (this.#zeroBlocks === 2) this.#ended = true
      return
    }
    if (this.#zeroBlocks !== 0 || this.#ended) githubFail(CODE)
    this.#entries += 1
    if (this.#entries > MAX_TAR_ENTRIES) githubFail(CODE)
    const checksumField = header.subarray(148, 156)
    if (
      checksumField[6] !== 0
      || checksumField[7] !== 0x20
      || checksumField.subarray(0, 6).some(byte => byte < 0x30 || byte > 0x37)
    ) githubFail(CODE)
    const expectedChecksum = Number.parseInt(String.fromCharCode(...checksumField.subarray(0, 6)), 8)
    let actualChecksum = 0
    for (let index = 0; index < header.length; index += 1) {
      actualChecksum += index >= 148 && index < 156 ? 0x20 : header[index]!
    }
    if (expectedChecksum !== actualChecksum) githubFail(CODE)
    const mode = octal(header.subarray(100, 108), 0o7777)
    const uid = octal(header.subarray(108, 116), 0x1f_ffff)
    const gid = octal(header.subarray(116, 124), 0x1f_ffff)
    const size = octal(header.subarray(124, 136), MAX_TAR_FILE_BYTES)
    octal(header.subarray(136, 148), Number.MAX_SAFE_INTEGER)
    const deviceMajor = octal(header.subarray(329, 337), 0x1f_ffff)
    const deviceMinor = octal(header.subarray(337, 345), 0x1f_ffff)
    if (
      (mode !== 0o644 && mode !== 0o755)
      || uid !== 0
      || gid !== 0
      || deviceMajor !== 0
      || deviceMinor !== 0
      || header[156] !== 0x30
      || header.subarray(157, 257).some(byte => byte !== 0)
      || String.fromCharCode(...header.subarray(257, 263)) !== 'ustar\0'
      || String.fromCharCode(...header.subarray(263, 265)) !== '00'
      || header.subarray(265, 329).some(byte => byte !== 0)
    ) githubFail(CODE)
    const name = decodeNulField(header.subarray(0, 100))
    const prefix = decodeNulField(header.subarray(345, 500))
    if (header.subarray(500).some(byte => byte !== 0)) githubFail(CODE)
    const path = prefix === '' ? name : `${prefix}/${name}`
    if (!safeTarPath(path) || this.#seen.has(path) || this.#folded.has(path.toLowerCase())) githubFail(CODE)
    this.#seen.add(path)
    this.#folded.add(path.toLowerCase())
    this.#currentPath = path
    this.#currentLength = size
    this.#bodyRemaining = size
    this.#paddingRemaining = (512 - size % 512) % 512
    this.#fileSha256 = new Sha256()
    if (path === ATTESTATION_PATH) {
      if (this.#attestation !== undefined || size > MAX_ATTESTATION_BYTES) githubFail(CODE)
      this.#attestation = new Uint8Array(size)
      this.#attestationOffset = 0
      this.#capturingAttestation = true
    }
    if (size === 0 && this.#paddingRemaining === 0) this.finishFile()
  }

  private finishFile(): void {
    if (this.#fileSha256 === undefined) githubFail(CODE)
    const sha256 = this.#fileSha256.digestHex()
    if (this.#currentPath !== ATTESTATION_PATH) {
      this.#manifest.push(Object.freeze({ path: this.#currentPath, byteLength: this.#currentLength, sha256 }))
    }
    this.#fileSha256 = undefined
    this.#currentPath = ''
    this.#currentLength = 0
    this.#attestationOffset = 0
    this.#capturingAttestation = false
  }

  private parseAttestation(bytes: Uint8Array): GitHubJsonObject {
    const value = parseGitHubJsonObject(bytes, CODE, [])
    const keys = Object.keys(value)
    if (
      keys.length !== ATTESTATION_KEYS.length
      || ATTESTATION_KEYS.some((key, index) => keys[index] !== key)
    ) githubFail(CODE)
    let raw: string
    try {
      raw = decoder.decode(bytes)
    } catch {
      githubFail(CODE)
    }
    if (
      JSON.stringify(value) !== raw
      || value.schemaVersion !== 1
      || value.profile !== 'warpkeep-deployment-attestation-v1'
      || !commit(value.candidateCommit)
      || !commit(value.candidateTree)
      || !sha(value.recoveryAuthorizationCoreSha256)
      || value.sourceClosureProfile !== SOURCE_CLOSURE_PROFILE
      || !sha(value.sourceClosureSha256)
      || value.releaseVersion !== '0.4.0'
      || value.canonicalOrigin !== 'https://warpkeep.com'
      || !sha(value.contentManifestSha256)
    ) githubFail(CODE)
    return value
  }
}

type InspectableInflate = Readonly<{
  s: Readonly<{ f?: number; l?: unknown; p?: number }>
  p: Uint8Array
}>

class RawInflater {
  readonly #stream: Inflate
  #inputBytes = 0
  #outputBytes = 0
  #consumedBytes: number | undefined

  constructor(onData: (bytes: Uint8Array) => void) {
    // fflate is pinned exactly because this seam reads its stable 0.8.3 stream
    // cursor to delimit raw DEFLATE before a ZIP bit-3 data descriptor.
    this.#stream = new Inflate((bytes) => {
      const copy = Uint8Array.from(bytes)
      this.#outputBytes += copy.length
      if (this.#outputBytes > MAX_TAR_BYTES) githubFail(CODE)
      onData(copy)
    })
  }

  get complete(): boolean {
    return this.#consumedBytes !== undefined
  }

  get consumedBytes(): number {
    if (this.#consumedBytes === undefined) githubFail(CODE)
    return this.#consumedBytes
  }

  get outputBytes(): number {
    return this.#outputBytes
  }

  push(bytes: Uint8Array, final: boolean): void {
    if (this.complete || bytes.length === 0) githubFail(CODE)
    this.#inputBytes += bytes.length
    try {
      this.#stream.push(Uint8Array.from(bytes), final)
    } catch (error) {
      if (error instanceof RecoveryGitHubError) throw error
      githubFail(CODE)
    }
    const internal = this.#stream as unknown as InspectableInflate
    if (!(internal.p instanceof Uint8Array) || internal.p.length > MAX_INFLATER_PENDING_BYTES) githubFail(CODE)
    if (internal.s.f && !internal.s.l) {
      const bitOffset = internal.s.p ?? 0
      if (!Number.isSafeInteger(bitOffset) || bitOffset < 0 || bitOffset > 7) githubFail(CODE)
      const consumed = this.#inputBytes - internal.p.length + (bitOffset === 0 ? 0 : 1)
      if (consumed < 1 || consumed > this.#inputBytes) githubFail(CODE)
      this.#consumedBytes = consumed
    }
    if (final && !this.complete) githubFail(CODE)
  }
}

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) githubFail(CODE)
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true)
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) githubFail(CODE)
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)
}

function validateDosTime(time: number, date: number): void {
  const seconds = (time & 0x1f) * 2
  const minutes = (time >>> 5) & 0x3f
  const hours = (time >>> 11) & 0x1f
  const day = date & 0x1f
  const month = (date >>> 5) & 0x0f
  if (seconds > 59 || minutes > 59 || hours > 23 || day < 1 || day > 31 || month < 1 || month > 12) githubFail(CODE)
}

async function streamStored(source: ArchiveSource, tar: TarStream, size: number): Promise<void> {
  let remaining = size
  while (remaining > 0) {
    const part = await source.readSome(Math.min(MAX_INFLATE_CHUNK_BYTES, remaining))
    if (part.length === 0) githubFail(CODE)
    tar.push(part)
    remaining -= part.length
  }
}

async function streamKnownDeflate(source: ArchiveSource, tar: TarStream, size: number): Promise<number> {
  const inflater = new RawInflater(bytes => tar.push(bytes))
  let remaining = size
  while (remaining > 0) {
    const part = await source.readSome(Math.min(MAX_INFLATE_CHUNK_BYTES, remaining))
    if (part.length === 0) githubFail(CODE)
    remaining -= part.length
    inflater.push(part, remaining === 0)
  }
  if (inflater.consumedBytes !== size) githubFail(CODE)
  return inflater.outputBytes
}

async function streamDescriptorDeflate(source: ArchiveSource, tar: TarStream): Promise<Readonly<{ compressed: number; uncompressed: number }>> {
  const inflater = new RawInflater(bytes => tar.push(bytes))
  const memberOffset = source.position
  while (!inflater.complete) {
    const part = await source.readSome(MAX_INFLATE_CHUNK_BYTES)
    if (part.length === 0) githubFail(CODE)
    inflater.push(part, false)
    if (!inflater.complete) continue
    const consumedBeforePart = source.position - part.length - memberOffset
    const trailing = part.length - (inflater.consumedBytes - consumedBeforePart)
    if (!Number.isSafeInteger(trailing) || trailing < 0 || trailing > part.length) githubFail(CODE)
    source.unread(part.subarray(part.length - trailing))
  }
  return Object.freeze({ compressed: inflater.consumedBytes, uncompressed: inflater.outputBytes })
}

async function descriptor(source: ArchiveSource): Promise<Readonly<{ crc: number; compressed: number; uncompressed: number; length: number }>> {
  const first = await source.readExactly(4)
  if (u32(first, 0) === DESCRIPTOR_SIGNATURE) {
    const rest = await source.readExactly(12)
    return Object.freeze({ crc: u32(rest, 0), compressed: u32(rest, 4), uncompressed: u32(rest, 8), length: 16 })
  }
  const rest = await source.readExactly(8)
  return Object.freeze({ crc: u32(first, 0), compressed: u32(rest, 0), uncompressed: u32(rest, 4), length: 12 })
}

function withArchiveDigest(result: PagesArtifactDigests, githubArtifactArchiveSha256: string): PagesArtifactDigests {
  return Object.freeze({
    githubArtifactArchiveSha256,
    innerArtifactTarSha256: result.innerArtifactTarSha256,
    contentManifestSha256: result.contentManifestSha256,
    deploymentAttestationSha256: result.deploymentAttestationSha256,
    deploymentAttestationBytes: Uint8Array.from(result.deploymentAttestationBytes),
  })
}

export async function inspectPagesArtifact(
  response: Response,
  expected: PagesArtifactExpected,
): Promise<PagesArtifactDigests> {
  let source: ArchiveSource | undefined
  let sourceConstructionStarted = false
  try {
    const trustedExpected = snapshotExpected(expected)
    sourceConstructionStarted = true
    source = new ArchiveSource(response)
    const localOffset = source.position
    if (localOffset !== 0) githubFail(CODE)
    const local = await source.readExactly(30)
    if (u32(local, 0) !== LOCAL_SIGNATURE) githubFail(CODE)
    const versionNeeded = u16(local, 4)
    const flags = u16(local, 6)
    const method = u16(local, 8)
    const modifiedTime = u16(local, 10)
    const modifiedDate = u16(local, 12)
    const localCrc = u32(local, 14)
    const localCompressed = u32(local, 18)
    const localUncompressed = u32(local, 22)
    const nameLength = u16(local, 26)
    const extraLength = u16(local, 28)
    const bit3 = (flags & 8) !== 0
    if (
      (flags !== 0 && flags !== 8)
      || (method !== 0 && method !== 8)
      || (method === 0 ? versionNeeded !== 10 && versionNeeded !== 20 : versionNeeded !== 20)
      || (bit3 && method !== 8)
      || nameLength !== ARTIFACT_NAME.length
      || extraLength !== 0
      || localCompressed === 0xffff_ffff
      || localUncompressed === 0xffff_ffff
    ) githubFail(CODE)
    validateDosTime(modifiedTime, modifiedDate)
    if (String.fromCharCode(...await source.readExactly(nameLength)) !== ARTIFACT_NAME) githubFail(CODE)
    if (bit3) {
      if (localCrc !== 0 || localCompressed !== 0 || localUncompressed !== 0) githubFail(CODE)
    } else if (
      localCompressed < 1
      || localCompressed > MAX_ARCHIVE_BYTES
      || localUncompressed < 1
      || localUncompressed > MAX_TAR_BYTES
      || (method === 0 && localCompressed !== localUncompressed)
    ) githubFail(CODE)

    const tar = new TarStream()
    let compressedSize = localCompressed
    let uncompressedSize = localUncompressed
    let crc = localCrc
    let descriptorLength = 0
    if (method === 0) {
      await streamStored(source, tar, localCompressed)
    } else if (!bit3) {
      uncompressedSize = await streamKnownDeflate(source, tar, localCompressed)
    } else {
      const inflated = await streamDescriptorDeflate(source, tar)
      const metadata = await descriptor(source)
      compressedSize = inflated.compressed
      uncompressedSize = inflated.uncompressed
      crc = metadata.crc
      descriptorLength = metadata.length
      if (metadata.compressed !== compressedSize || metadata.uncompressed !== uncompressedSize) githubFail(CODE)
    }
    if (
      tar.byteLength !== uncompressedSize
      || tar.crc32 !== crc
      || compressedSize < 1
      || compressedSize > MAX_ARCHIVE_BYTES
      || uncompressedSize < 1
      || uncompressedSize > MAX_TAR_BYTES
      || uncompressedSize > compressedSize * MAX_COMPRESSION_RATIO + 1024
    ) githubFail(CODE)
    const tarResult = tar.finish(trustedExpected)

    const centralOffset = source.position
    const central = await source.readExactly(46)
    if (u32(central, 0) !== CENTRAL_SIGNATURE) githubFail(CODE)
    const centralNameLength = u16(central, 28)
    const centralExtraLength = u16(central, 30)
    const centralCommentLength = u16(central, 32)
    if (
      (u16(central, 4) !== 0x0014 && u16(central, 4) !== 0x0314)
      || u16(central, 6) !== versionNeeded
      || u16(central, 8) !== flags
      || u16(central, 10) !== method
      || u16(central, 12) !== modifiedTime
      || u16(central, 14) !== modifiedDate
      || u32(central, 16) !== crc
      || u32(central, 20) !== compressedSize
      || u32(central, 24) !== uncompressedSize
      || centralNameLength !== nameLength
      || centralExtraLength !== 0
      || centralCommentLength !== 0
      || u16(central, 34) !== 0
      || u16(central, 36) !== 0
      || (u16(central, 4) === 0x0014
        ? u32(central, 38) !== 0
        : u32(central, 38) !== 0x81a4_0000)
      || u32(central, 42) !== localOffset
      || u32(central, 20) === 0xffff_ffff
      || u32(central, 24) === 0xffff_ffff
      || u32(central, 42) === 0xffff_ffff
    ) githubFail(CODE)
    if (String.fromCharCode(...await source.readExactly(centralNameLength)) !== ARTIFACT_NAME) githubFail(CODE)
    const centralSize = source.position - centralOffset
    const eocdOffset = source.position
    const eocd = await source.readExactly(22)
    if (
      u32(eocd, 0) !== EOCD_SIGNATURE
      || u16(eocd, 4) !== 0
      || u16(eocd, 6) !== 0
      || u16(eocd, 8) !== 1
      || u16(eocd, 10) !== 1
      || u32(eocd, 12) !== centralSize
      || u32(eocd, 16) !== centralOffset
      || u16(eocd, 20) !== 0
      || centralOffset !== 30 + nameLength + extraLength + compressedSize + descriptorLength
      || eocdOffset !== centralOffset + centralSize
    ) githubFail(CODE)
    return withArchiveDigest(tarResult, await source.finish())
  } catch (error) {
    if (source !== undefined) {
      await source.cancel()
    } else if (sourceConstructionStarted) {
      try {
        await response.body?.cancel()
      } catch {
        // The stable archive error is selected below.
      }
    }
    if (error instanceof RecoveryGitHubError) throw error
    githubFail(CODE)
  }
}
