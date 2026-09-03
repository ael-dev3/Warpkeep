import { deflateSync, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { inspectPagesArtifact, type PagesArtifactExpected } from '../src/archive.js'

const encoder = new TextEncoder()
const ARTIFACT_NAME = 'artifact.tar'
const ATTESTATION_PATH = '.well-known/warpkeep-deployment-v1.json'
const CANDIDATE = 'a'.repeat(40)
const CANDIDATE_TREE = 'c'.repeat(40)
const PREPARATION_PLACEHOLDER = 'b'.repeat(40)
const CORE = '4'.repeat(64)
const CLOSURE = '6'.repeat(64)
const expected: PagesArtifactExpected = {
  candidateCommit: CANDIDATE,
  candidateTree: CANDIDATE_TREE,
  recoveryAuthorizationCoreSha256: CORE,
  sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
  sourceClosureSha256: CLOSURE,
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0)
  }
  return (crc ^ 0xffff_ffff) >>> 0
}

function octal(value: number, length: number): Uint8Array {
  return encoder.encode(`${value.toString(8).padStart(length - 1, '0')}\0`)
}

function tarHeader(path: string, size: number, options: Readonly<{
  mode?: number
  type?: number
  linkName?: string
}> = {}): Uint8Array {
  const header = new Uint8Array(512)
  header.set(encoder.encode(path), 0)
  header.set(octal(options.mode ?? 0o644, 8), 100)
  header.set(octal(0, 8), 108)
  header.set(octal(0, 8), 116)
  header.set(octal(size, 12), 124)
  header.set(octal(0, 12), 136)
  header.fill(0x20, 148, 156)
  header[156] = options.type ?? 0x30
  if (options.linkName !== undefined) header.set(encoder.encode(options.linkName), 157)
  header.set(encoder.encode('ustar\0'), 257)
  header.set(encoder.encode('00'), 263)
  header.set(octal(0, 8), 329)
  header.set(octal(0, 8), 337)
  let checksum = 0
  for (const byte of header) checksum += byte
  const checksumText = encoder.encode(`${checksum.toString(8).padStart(6, '0')}\0 `)
  header.set(checksumText, 148)
  return header
}

function tarFile(path: string, bytes: Uint8Array, options: Parameters<typeof tarHeader>[2] = {}): Uint8Array {
  return concat(tarHeader(path, bytes.length, options), bytes, new Uint8Array((512 - bytes.length % 512) % 512))
}

function refreshTarChecksum(tar: Uint8Array, offset = 0): void {
  tar.fill(0x20, offset + 148, offset + 156)
  let checksum = 0
  for (let index = offset; index < offset + 512; index += 1) checksum += tar[index]!
  tar.set(encoder.encode(`${checksum.toString(8).padStart(6, '0')}\0 `), offset + 148)
}

function manifestBytes(files: readonly Readonly<{ path: string; bytes: Uint8Array }>[]): Promise<Uint8Array> {
  return Promise.all(files.map(async file => ({
    path: file.path,
    byteLength: file.bytes.length,
    sha256: await sha256(file.bytes),
  }))).then(entries => {
    entries.sort((left, right) => {
      const a = encoder.encode(left.path)
      const b = encoder.encode(right.path)
      for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
        if (a[index] !== b[index]) return a[index]! - b[index]!
      }
      return a.length - b.length
    })
    return encoder.encode(JSON.stringify(entries))
  })
}

async function attestationBytes(
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[],
  mutate?: (attestation: Record<string, unknown>) => void,
): Promise<Uint8Array> {
  const manifest = await manifestBytes(files)
  const attestation: Record<string, unknown> = {
    schemaVersion: 1,
    profile: 'warpkeep-deployment-attestation-v1',
    candidateCommit: CANDIDATE,
    candidateTree: CANDIDATE_TREE,
    recoveryAuthorizationCoreSha256: CORE,
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: CLOSURE,
    releaseVersion: '0.4.0',
    canonicalOrigin: 'https://warpkeep.com',
    contentManifestSha256: await sha256(manifest),
  }
  mutate?.(attestation)
  return encoder.encode(JSON.stringify(attestation))
}

type TarOptions = Readonly<{
  files?: readonly Readonly<{ path: string; bytes: Uint8Array }>[]
  order?: 'attestation-first' | 'attestation-last'
  mutateAttestation?: (attestation: Record<string, unknown>) => void
  attestationRaw?: Uint8Array
  mutateTar?: (tar: Uint8Array) => void
  terminators?: number
}>

async function makeTar(options: TarOptions = {}): Promise<Uint8Array> {
  const files = options.files ?? [
    { path: 'assets/app.js', bytes: encoder.encode('console.log("warpkeep")\n') },
    { path: 'index.html', bytes: encoder.encode('<!doctype html>\n') },
  ]
  const attestation = options.attestationRaw ?? await attestationBytes(files, options.mutateAttestation)
  const fileParts = files.map(file => tarFile(file.path, file.bytes))
  const attestationPart = tarFile(ATTESTATION_PATH, attestation)
  const ordered = options.order === 'attestation-first'
    ? [attestationPart, ...fileParts]
    : [...fileParts, attestationPart]
  const tar = concat(...ordered, new Uint8Array(512 * (options.terminators ?? 2)))
  options.mutateTar?.(tar)
  return tar
}

type ZipOptions = Readonly<{
  method?: 0 | 8
  bit3?: boolean
  descriptorSignature?: boolean
  localFlags?: number
  centralFlags?: number
  localMethod?: number
  centralMethod?: number
  localName?: string
  centralName?: string
  localCrc?: number
  centralCrc?: number
  localCompressed?: number
  centralCompressed?: number
  localUncompressed?: number
  centralUncompressed?: number
  entries?: number
  centralOffset?: number
  centralSize?: number
  comment?: Uint8Array
  trailing?: Uint8Array
  mutateCompressed?: (bytes: Uint8Array) => void
}>

function makeZip(tar: Uint8Array, options: ZipOptions = {}): Uint8Array {
  const method = options.method ?? 0
  const bit3 = options.bit3 ?? false
  const flags = bit3 ? 8 : 0
  const compressed = method === 8 ? Uint8Array.from(deflateSync(tar)) : Uint8Array.from(tar)
  options.mutateCompressed?.(compressed)
  const crc = crc32(tar)
  const localName = encoder.encode(options.localName ?? 'artifact.tar')
  const centralName = encoder.encode(options.centralName ?? 'artifact.tar')
  const local = new Uint8Array(30 + localName.length)
  const localView = new DataView(local.buffer)
  localView.setUint32(0, 0x04034b50, true)
  localView.setUint16(4, method === 8 ? 20 : 10, true)
  localView.setUint16(6, options.localFlags ?? flags, true)
  localView.setUint16(8, options.localMethod ?? method, true)
  localView.setUint16(10, 0x1234, true)
  localView.setUint16(12, 0x5678, true)
  localView.setUint32(14, options.localCrc ?? (bit3 ? 0 : crc), true)
  localView.setUint32(18, options.localCompressed ?? (bit3 ? 0 : compressed.length), true)
  localView.setUint32(22, options.localUncompressed ?? (bit3 ? 0 : tar.length), true)
  localView.setUint16(26, localName.length, true)
  local.set(localName, 30)
  let descriptor = new Uint8Array()
  if (bit3) {
    descriptor = new Uint8Array(options.descriptorSignature === false ? 12 : 16)
    const view = new DataView(descriptor.buffer)
    let offset = 0
    if (options.descriptorSignature !== false) {
      view.setUint32(0, 0x08074b50, true)
      offset = 4
    }
    view.setUint32(offset, crc, true)
    view.setUint32(offset + 4, compressed.length, true)
    view.setUint32(offset + 8, tar.length, true)
  }
  const centralOffset = local.length + compressed.length + descriptor.length
  const central = new Uint8Array(46 + centralName.length)
  const centralView = new DataView(central.buffer)
  centralView.setUint32(0, 0x02014b50, true)
  centralView.setUint16(4, 0x0314, true)
  centralView.setUint16(6, method === 8 ? 20 : 10, true)
  centralView.setUint16(8, options.centralFlags ?? flags, true)
  centralView.setUint16(10, options.centralMethod ?? method, true)
  centralView.setUint16(12, 0x1234, true)
  centralView.setUint16(14, 0x5678, true)
  centralView.setUint32(16, options.centralCrc ?? crc, true)
  centralView.setUint32(20, options.centralCompressed ?? compressed.length, true)
  centralView.setUint32(24, options.centralUncompressed ?? tar.length, true)
  centralView.setUint16(28, centralName.length, true)
  centralView.setUint32(38, 0x81a40000, true)
  centralView.setUint32(42, 0, true)
  central.set(centralName, 46)
  const comment = options.comment ?? new Uint8Array()
  const eocd = new Uint8Array(22 + comment.length)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(8, options.entries ?? 1, true)
  eocdView.setUint16(10, options.entries ?? 1, true)
  eocdView.setUint32(12, options.centralSize ?? central.length, true)
  eocdView.setUint32(16, options.centralOffset ?? centralOffset, true)
  eocdView.setUint16(20, comment.length, true)
  eocd.set(comment, 22)
  return concat(local, compressed, descriptor, central, eocd, options.trailing ?? new Uint8Array())
}

function responseAt(bytes: Uint8Array, chunkSize = bytes.length, declaredLength = String(bytes.length)): Response {
  let offset = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close()
        return
      }
      const end = Math.min(offset + chunkSize, bytes.length)
      controller.enqueue(bytes.slice(offset, end))
      offset = end
    },
  })
  const response = new Response(body, { status: 200, headers: { 'content-length': declaredLength, 'content-type': 'application/zip' } })
  Object.defineProperty(response, 'url', { value: 'https://artifact-cdn.example.test/recovery.zip', configurable: true })
  Object.defineProperty(response, 'arrayBuffer', { value: () => { throw new Error('full body method forbidden') } })
  Object.defineProperty(response, 'text', { value: () => { throw new Error('full body method forbidden') } })
  return response
}

async function inspect(tar: Uint8Array, zipOptions: ZipOptions = {}, chunkSize?: number) {
  return inspectPagesArtifact(responseAt(makeZip(tar, zipOptions), chunkSize), expected)
}

describe('Pages recovery archive validator', () => {
  it.each([
    ['stored', { method: 0 as const }],
    ['DEFLATE', { method: 8 as const }],
    ['DEFLATE bit-3 signed descriptor', { method: 8 as const, bit3: true }],
    ['DEFLATE bit-3 signatureless descriptor', { method: 8 as const, bit3: true, descriptorSignature: false }],
  ])('streams one standard %s ZIP/TAR and returns exact digests', async (_name, zipOptions) => {
    const tar = await makeTar()
    const zipBytes = makeZip(tar, zipOptions)
    const result = await inspectPagesArtifact(responseAt(zipBytes), expected)
    expect(result.githubArtifactArchiveSha256).toBe(await sha256(zipBytes))
    expect(result.innerArtifactTarSha256).toBe(await sha256(tar))
    expect(result.deploymentAttestationSha256).toBe(await sha256(result.deploymentAttestationBytes))
    expect(result.contentManifestSha256).toBe(JSON.parse(new TextDecoder().decode(result.deploymentAttestationBytes)).contentManifestSha256)
  })

  it('accepts adversarial one-byte chunking without full-body methods', async () => {
    const tar = await makeTar()
    await expect(inspect(tar, { method: 8, bit3: true }, 1)).resolves.toMatchObject({
      githubArtifactArchiveSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    })
  })

  it.each([0, 6] as const)('accepts a standard fflate ZIP at compression level %i', async level => {
    const tar = await makeTar()
    const bytes = zipSync({ 'artifact.tar': tar }, { level })
    await expect(inspectPagesArtifact(responseAt(bytes, 31), expected)).resolves.toBeDefined()
  })

  it('computes standard SHA-256 and CRC-32 vectors through exact ZIP metadata', async () => {
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf4_3926)
    expect(await sha256(encoder.encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const tar = await makeTar()
    await expect(inspect(tar)).resolves.toBeDefined()
  })

  it.each([
    ['encrypted flag', { localFlags: 1, centralFlags: 1 }],
    ['unsafe flag', { localFlags: 0x800, centralFlags: 0x800 }],
    ['local method', { localMethod: 9 }],
    ['central method', { centralMethod: 9 }],
    ['local name', { localName: 'other.tar' }],
    ['central name', { centralName: 'other.tar' }],
    ['local CRC', { localCrc: 1 }],
    ['central CRC', { centralCrc: 1 }],
    ['local compressed size', { localCompressed: 1 }],
    ['central compressed size', { centralCompressed: 1 }],
    ['local uncompressed size', { localUncompressed: 1 }],
    ['central uncompressed size', { centralUncompressed: 1 }],
    ['multiple entries', { entries: 2 }],
    ['wrong central offset', { centralOffset: 1 }],
    ['wrong central size', { centralSize: 1 }],
    ['archive comment', { comment: encoder.encode('comment') }],
    ['trailing bytes', { trailing: new Uint8Array([0]) }],
  ])('rejects mutated ZIP %s', async (_name, options) => {
    await expect(inspect(await makeTar(), options as ZipOptions)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('rejects invalid compressed streams and descriptor metadata without scanning for magic', async () => {
    await expect(inspect(await makeTar(), { method: 8, mutateCompressed: bytes => { bytes[2] ^= 0xff } })).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const tar = await makeTar()
    const zipBytes = makeZip(tar, { method: 8, bit3: true })
    const descriptorOffset = 30 + ARTIFACT_NAME.length + deflateSync(tar).length
    zipBytes[descriptorOffset + 4] ^= 1
    await expect(inspectPagesArtifact(responseAt(zipBytes, 7), expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('rejects missing, malformed, oversized, and mismatched length metadata', async () => {
    const bytes = makeZip(await makeTar())
    await expect(inspectPagesArtifact(responseAt(bytes, bytes.length, ''), expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    await expect(inspectPagesArtifact(responseAt(bytes, bytes.length, String(160 * 1024 * 1024 + 1)), expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    await expect(inspectPagesArtifact(responseAt(bytes, bytes.length, String(bytes.length + 1)), expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('rejects wrong response status, final URL, and media type', async () => {
    const bytes = makeZip(await makeTar())
    const status = new Response(Uint8Array.from(bytes).buffer, {
      status: 206,
      headers: { 'content-length': String(bytes.length), 'content-type': 'application/zip' },
    })
    Object.defineProperty(status, 'url', { value: 'https://artifact-cdn.example.test/recovery.zip' })
    await expect(inspectPagesArtifact(status, expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const unsafeUrl = responseAt(bytes)
    Object.defineProperty(unsafeUrl, 'url', { value: 'http://127.0.0.1/archive.zip' })
    await expect(inspectPagesArtifact(unsafeUrl, expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const mediaType = responseAt(bytes)
    mediaType.headers.set('content-type', 'text/plain')
    await expect(inspectPagesArtifact(mediaType, expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('cancels the response body when outer metadata fails before streaming begins', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() { cancelled = true },
    })
    const response = new Response(body, {
      headers: { 'content-length': '1', 'content-type': 'text/plain' },
    })
    Object.defineProperty(response, 'url', { value: 'https://artifact-cdn.example.test/recovery.zip' })

    await expect(inspectPagesArtifact(response, expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    expect(cancelled).toBe(true)
  })

  it('cancels when an upstream chunk exceeds the bounded queue', async () => {
    let cancelled = false
    const chunk = new Uint8Array(1024 * 1024 + 1)
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(chunk) },
      cancel() { cancelled = true },
    })
    const response = new Response(body, {
      headers: { 'content-length': String(chunk.length), 'content-type': 'application/zip' },
    })
    Object.defineProperty(response, 'url', { value: 'https://artifact-cdn.example.test/recovery.zip' })
    await expect(inspectPagesArtifact(response, expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    expect(cancelled).toBe(true)
  })

  it('rejects local, central-directory, and EOCD structural mutations', async () => {
    const tar = await makeTar()
    const centralOffset = 30 + ARTIFACT_NAME.length + tar.length
    const eocdOffset = centralOffset + 46 + ARTIFACT_NAME.length
    const mutations: readonly ((bytes: Uint8Array) => void)[] = [
      bytes => { bytes[0] = 0 },
      bytes => { new DataView(bytes.buffer).setUint16(4, 45, true) },
      bytes => { new DataView(bytes.buffer).setUint16(28, 1, true) },
      bytes => { new DataView(bytes.buffer).setUint32(18, 0xffff_ffff, true) },
      bytes => { bytes[centralOffset] = 0 },
      bytes => { new DataView(bytes.buffer).setUint16(centralOffset + 4, 20, true) },
      bytes => { new DataView(bytes.buffer).setUint16(centralOffset + 30, 1, true) },
      bytes => { new DataView(bytes.buffer).setUint16(centralOffset + 34, 1, true) },
      bytes => { new DataView(bytes.buffer).setUint16(centralOffset + 36, 1, true) },
      bytes => { new DataView(bytes.buffer).setUint32(centralOffset + 38, 0, true) },
      bytes => { new DataView(bytes.buffer).setUint32(centralOffset + 42, 1, true) },
      bytes => { bytes[eocdOffset] = 0 },
      bytes => { new DataView(bytes.buffer).setUint16(eocdOffset + 4, 1, true) },
      bytes => { new DataView(bytes.buffer).setUint16(eocdOffset + 6, 1, true) },
      bytes => { new DataView(bytes.buffer).setUint16(eocdOffset + 20, 1, true) },
    ]
    for (const mutate of mutations) {
      const bytes = makeZip(tar)
      mutate(bytes)
      await expect(inspectPagesArtifact(responseAt(bytes, 17), expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    }
  })

  it('rejects every signed and signatureless data-descriptor mismatch', async () => {
    const tar = await makeTar()
    const compressedLength = deflateSync(tar).length
    for (const signature of [true, false]) {
      for (const fieldOffset of [0, 4, 8]) {
        const bytes = makeZip(tar, { method: 8, bit3: true, descriptorSignature: signature })
        const descriptorOffset = 30 + ARTIFACT_NAME.length + compressedLength
        const valueOffset = descriptorOffset + (signature ? 4 : 0) + fieldOffset
        bytes[valueOffset] ^= 1
        await expect(inspectPagesArtifact(responseAt(bytes, 13), expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
      }
    }
  })

  it('rejects ambiguous bit-3 stored entries and a malformed descriptor signature', async () => {
    await expect(inspect(await makeTar(), { method: 0, localFlags: 8, centralFlags: 8 })).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const tar = await makeTar()
    const bytes = makeZip(tar, { method: 8, bit3: true })
    const descriptorOffset = 30 + ARTIFACT_NAME.length + deflateSync(tar).length
    bytes[descriptorOffset] ^= 1
    await expect(inspectPagesArtifact(responseAt(bytes, 1), expected)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('rejects a stalled archive stream on the bounded deadline', async () => {
    vi.useFakeTimers()
    try {
      const response = new Response(new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) }), {
        status: 200,
        headers: { 'content-length': '1024', 'content-type': 'application/zip' },
      })
      Object.defineProperty(response, 'url', { value: 'https://artifact-cdn.example.test/recovery.zip' })
      const pending = inspectPagesArtifact(response, expected)
      const rejection = expect(pending).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
      await vi.advanceTimersByTimeAsync(10_001)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['checksum', (tar: Uint8Array) => { tar[148] ^= 1 }],
    ['magic', (tar: Uint8Array) => { tar[257] = 0 }],
    ['version', (tar: Uint8Array) => { tar[263] = 0x31 }],
    ['mode', (tar: Uint8Array) => { tar[100] = 0x37 }],
    ['type', (tar: Uint8Array) => { tar[156] = 0x32 }],
    ['absolute path', (tar: Uint8Array) => { tar[0] = 0x2f }],
    ['backslash path', (tar: Uint8Array) => { tar[6] = 0x5c }],
    ['control path', (tar: Uint8Array) => { tar[6] = 1 }],
    ['link target', (tar: Uint8Array) => { tar[157] = 0x78 }],
    ['nonzero body padding', (tar: Uint8Array) => { tar[512 + 30] = 1 }],
  ])('rejects TAR %s mutation', async (_name, mutate) => {
    const tar = await makeTar({ files: [{ path: 'x', bytes: encoder.encode('x') }] })
    mutate(tar)
    if (_name !== 'checksum' && _name !== 'nonzero body padding') refreshTarChecksum(tar)
    await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('rejects noncanonical octal fields, nonzero identities/devices, reserved bytes, and oversized members', async () => {
    const mutations: readonly ((tar: Uint8Array) => void)[] = [
      tar => { tar[100] = 0x20 },
      tar => { tar[107] = 0x20 },
      tar => { tar[108 + 6] = 0x31 },
      tar => { tar[116 + 6] = 0x31 },
      tar => { tar[329 + 6] = 0x31 },
      tar => { tar[337 + 6] = 0x31 },
      tar => { tar[500] = 1 },
    ]
    for (const mutate of mutations) {
      const tar = await makeTar({ files: [{ path: 'x', bytes: encoder.encode('x') }] })
      mutate(tar)
      refreshTarChecksum(tar)
      await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    }
    const oversized = concat(tarHeader('x', 64 * 1024 * 1024 + 1), new Uint8Array(1024))
    await expect(inspect(oversized)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it.each([
    ['symlink', 0x32], ['hardlink', 0x31], ['directory', 0x35], ['device', 0x33],
    ['fifo', 0x36], ['PAX', 0x78], ['GNU long-name', 0x4c],
  ])('rejects %s TAR entries', async (_name, type) => {
    const body = encoder.encode('x')
    const tar = concat(tarFile('x', body, { type }), new Uint8Array(1024))
    await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('rejects dot traversal, hidden authority, duplicate, case, and non-ASCII collisions', async () => {
    for (const path of ['../x', 'a/../x', './x', '.git/config', '.env', '.well-known/evil.json', 'é.txt']) {
      const tar = concat(tarFile(path, encoder.encode('x')), new Uint8Array(1024))
      await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    }
    const duplicateFiles = [{ path: 'x', bytes: encoder.encode('1') }, { path: 'x', bytes: encoder.encode('2') }]
    await expect(inspect(await makeTar({ files: duplicateFiles }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const caseFiles = [{ path: 'X', bytes: encoder.encode('1') }, { path: 'x', bytes: encoder.encode('2') }]
    await expect(inspect(await makeTar({ files: caseFiles }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('rejects missing, short, or overlong terminators and bytes after the terminator', async () => {
    await expect(inspect(await makeTar({ terminators: 0 }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    await expect(inspect(await makeTar({ terminators: 1 }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    await expect(inspect(await makeTar({ terminators: 3 }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const tar = concat(await makeTar(), new Uint8Array([1]))
    await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('rejects zero, multiple, oversized, duplicate-key, extra-key, and noncanonical attestations', async () => {
    const normal = [{ path: 'index.html', bytes: encoder.encode('x') }]
    const noAttestation = concat(tarFile('index.html', encoder.encode('x')), new Uint8Array(1024))
    await expect(inspect(noAttestation)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const attestation = await attestationBytes(normal)
    const multiple = concat(tarFile(ATTESTATION_PATH, attestation), tarFile(ATTESTATION_PATH, attestation), new Uint8Array(1024))
    await expect(inspect(multiple)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const oversized = new Uint8Array(65 * 1024)
    const oversizedTar = concat(tarFile(ATTESTATION_PATH, oversized), new Uint8Array(1024))
    await expect(inspect(oversizedTar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const text = new TextDecoder().decode(attestation)
    for (const raw of [
      text.replace('{', '{"schemaVersion":1,'),
      text.replace(/\}$/u, ',"extra":null}'),
      ` ${text}`,
      text.replace('"profile"', '"movedProfile"').replace('"warpkeep-deployment-attestation-v1"', '"profile":"warpkeep-deployment-attestation-v1"'),
    ]) {
      await expect(inspect(await makeTar({ files: normal, attestationRaw: encoder.encode(raw) }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    }
  })

  it('rejects missing attestation keys and hostile expected projections', async () => {
    const files = [{ path: 'index.html', bytes: encoder.encode('x') }]
    const missing = await attestationBytes(files, value => { delete value.profile })
    await expect(inspect(await makeTar({ files, attestationRaw: missing }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const tar = await makeTar({ files })
    const accessor = { ...expected } as Record<string, unknown>
    Object.defineProperty(accessor, 'candidateTree', { enumerable: true, get: () => CANDIDATE_TREE })
    await expect(inspectPagesArtifact(responseAt(makeZip(tar)), accessor as never)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const hostile = new Proxy(expected, { getPrototypeOf: () => { throw new Error('hostile') } })
    await expect(inspectPagesArtifact(responseAt(makeZip(tar)), hostile)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it.each([
    ['schemaVersion', 2], ['profile', 'wrong'], ['candidateCommit', PREPARATION_PLACEHOLDER],
    ['candidateTree', 'd'.repeat(40)], ['recoveryAuthorizationCoreSha256', '5'.repeat(64)],
    ['sourceClosureProfile', 'wrong'], ['sourceClosureSha256', '7'.repeat(64)],
    ['releaseVersion', '0.4.1'], ['canonicalOrigin', 'https://example.test'],
    ['contentManifestSha256', '8'.repeat(64)],
  ])('rejects mismatched attestation %s', async (key, value) => {
    const files = [{ path: 'index.html', bytes: encoder.encode('x') }]
    const tar = await makeTar({ files, mutateAttestation: attestation => { attestation[key] = value } })
    await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('uses deterministic unsigned UTF-8 manifest order and rejects unlisted content', async () => {
    const files = [
      { path: 'a.txt', bytes: encoder.encode('a') },
      { path: 'Z.txt', bytes: encoder.encode('z') },
    ]
    await expect(inspect(await makeTar({ files, order: 'attestation-first' }), { method: 8 })).resolves.toBeDefined()
    const attestation = await attestationBytes(files)
    const withUnlisted = concat(
      tarFile('a.txt', encoder.encode('a')),
      tarFile('Z.txt', encoder.encode('z')),
      tarFile('extra.txt', encoder.encode('extra')),
      tarFile(ATTESTATION_PATH, attestation),
      new Uint8Array(1024),
    )
    await expect(inspect(withUnlisted)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('streams and discards a large ordinary file instead of returning its body', async () => {
    const files = [{ path: 'large.bin', bytes: new Uint8Array(2 * 1024 * 1024) }]
    const result = await inspect(await makeTar({ files }), { method: 8 }, 257)
    expect(Object.keys(result).sort()).toEqual([
      'contentManifestSha256', 'deploymentAttestationBytes', 'deploymentAttestationSha256',
      'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
    ].sort())
    expect(result.deploymentAttestationBytes.length).toBeLessThan(4096)
  })
})
