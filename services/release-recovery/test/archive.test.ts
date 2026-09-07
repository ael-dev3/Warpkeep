import { deflateSync, zipSync } from 'fflate'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deriveWarpkeepDeploymentAttestation } from '../../../scripts/generate-warpkeep-deployment-attestation.mjs'
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
const CAPTURED_PINNED_CENTRAL_PREFIX = Uint8Array.from([
  0x50, 0x4b, 0x01, 0x02, 0x2d, 0x03, 0x14, 0x00, 0x08, 0x00, 0x08, 0x00,
])
const CAPTURED_PINNED_EXTERNAL_ATTRIBUTES = Uint8Array.from([0x20, 0x00, 0xa4, 0x81])
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
  format?: 'posix' | 'gnu'
  uid?: number
  gid?: number
  uname?: string
  gname?: string
  mtime?: number
  deviceMajor?: number | 'nul'
  deviceMinor?: number | 'nul'
}> = {}): Uint8Array {
  const header = new Uint8Array(512)
  header.set(encoder.encode(path), 0)
  header.set(octal(options.mode ?? 0o644, 8), 100)
  header.set(octal(options.uid ?? 0, 8), 108)
  header.set(octal(options.gid ?? 0, 8), 116)
  header.set(octal(size, 12), 124)
  header.set(octal(options.mtime ?? 0, 12), 136)
  header.fill(0x20, 148, 156)
  header[156] = options.type ?? 0x30
  if (options.linkName !== undefined) header.set(encoder.encode(options.linkName), 157)
  header.set(encoder.encode(options.format === 'gnu' ? 'ustar ' : 'ustar\0'), 257)
  header.set(encoder.encode(options.format === 'gnu' ? ' \0' : '00'), 263)
  if (options.uname !== undefined) header.set(encoder.encode(options.uname), 265)
  if (options.gname !== undefined) header.set(encoder.encode(options.gname), 297)
  if (options.deviceMajor !== 'nul') header.set(octal(options.deviceMajor ?? 0, 8), 329)
  if (options.deviceMinor !== 'nul') header.set(octal(options.deviceMinor ?? 0, 8), 337)
  let checksum = 0
  for (const byte of header) checksum += byte
  const checksumText = encoder.encode(`${checksum.toString(8).padStart(6, '0')}\0 `)
  header.set(checksumText, 148)
  return header
}

function tarFile(path: string, bytes: Uint8Array, options: Parameters<typeof tarHeader>[2] = {}): Uint8Array {
  return concat(tarHeader(path, bytes.length, options), bytes, new Uint8Array((512 - bytes.length % 512) % 512))
}

function tarDirectory(path: string, options: Parameters<typeof tarHeader>[2] = {}): Uint8Array {
  return tarHeader(path, 0, { mode: 0o755, ...options, type: 0x35 })
}

function gnuLongName(path: string): Uint8Array {
  const body = concat(encoder.encode(path), new Uint8Array([0]))
  return tarFile('././@LongLink', body, {
    format: 'gnu', mode: 0, type: 0x4c, uid: 1000, gid: 1000,
    uname: 'snapmeter', gname: 'snapmeter',
  })
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

async function makeGnuTar(): Promise<Uint8Array> {
  const files: Array<{ path: string; bytes: Uint8Array }> = [
    { path: 'assets/app.js', bytes: encoder.encode('console.log("warpkeep")\n') },
    { path: 'index.html', bytes: encoder.encode('<!doctype html>\n') },
  ]
  for (let index = 0; index < 338; index += 1) {
    const path = index < 66
      ? `assets/${'nested/'.repeat(13)}bundle-${index.toString().padStart(3, '0')}.js`
      : `assets/chunk-${index.toString().padStart(3, '0')}.js`
    files.push({ path, bytes: encoder.encode(`chunk ${index}\n`) })
  }
  const attestation = await attestationBytes(files)
  const common = {
    format: 'gnu' as const,
    uid: 1000,
    gid: 1000,
    uname: 'snapmeter',
    gname: 'snapmeter',
    deviceMajor: 'nul' as const,
    deviceMinor: 'nul' as const,
  }
  const parts = [
    tarDirectory('./', common),
    tarDirectory('./assets/', common),
  ]
  for (const file of files) {
    const path = `./${file.path}`
    if (encoder.encode(path).length > 100) parts.push(gnuLongName(path))
    parts.push(tarFile(encoder.encode(path).length > 100 ? './long-name-placeholder' : path, file.bytes, common))
  }
  parts.push(tarDirectory('./.well-known/', common))
  parts.push(tarFile(`./${ATTESTATION_PATH}`, attestation, common))
  const used = parts.reduce((sum, value) => sum + value.length, 0)
  const paddedLength = Math.ceil((used + 1024) / 10_240) * 10_240
  return concat(...parts, new Uint8Array(paddedLength - used))
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
  localVersionNeeded?: number
  centralVersionMadeBy?: number
  centralExternalAttributes?: number
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
  localView.setUint16(4, options.localVersionNeeded ?? (method === 8 ? 20 : 10), true)
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
  centralView.setUint16(4, options.centralVersionMadeBy ?? 0x032d, true)
  centralView.setUint16(6, options.localVersionNeeded ?? (method === 8 ? 20 : 10), true)
  centralView.setUint16(8, options.centralFlags ?? flags, true)
  centralView.setUint16(10, options.centralMethod ?? method, true)
  centralView.setUint16(12, 0x1234, true)
  centralView.setUint16(14, 0x5678, true)
  centralView.setUint32(16, options.centralCrc ?? crc, true)
  centralView.setUint32(20, options.centralCompressed ?? compressed.length, true)
  centralView.setUint32(24, options.centralUncompressed ?? tar.length, true)
  centralView.setUint16(28, centralName.length, true)
  centralView.setUint32(38, options.centralExternalAttributes ?? 0x81a40020, true)
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
  Object.defineProperty(response, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip', configurable: true })
  Object.defineProperty(response, 'arrayBuffer', { value: () => { throw new Error('full body method forbidden') } })
  Object.defineProperty(response, 'text', { value: () => { throw new Error('full body method forbidden') } })
  return response
}

async function inspect(tar: Uint8Array, zipOptions: ZipOptions = {}, chunkSize?: number) {
  return inspectPagesArtifact(responseAt(makeZip(tar, zipOptions), chunkSize), expected)
}

describe('Pages recovery archive validator', () => {
  it('accepts local attestation bytes and rejects changed archived content', async () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-archive-attestation-'))
    try {
      const files = [
        { path: 'index.html', bytes: encoder.encode('<!doctype html>\n') },
        { path: 'assets/Z.js', bytes: encoder.encode('upper') },
        { path: 'assets/a.js', bytes: encoder.encode('lower') },
      ]
      mkdirSync(join(root, 'assets'))
      for (const file of files) writeFileSync(join(root, file.path), file.bytes)
      const attestation = deriveWarpkeepDeploymentAttestation({ distRoot: root, identity: expected })
      const tar = await makeTar({ files, attestationRaw: attestation.bytes })
      const result = await inspect(tar, { method: 8 }, 17)
      expect(result.deploymentAttestationSha256).toBe(await sha256(attestation.bytes))
      expect(result.contentManifestSha256).toBe(await sha256(await manifestBytes(files)))
      const changed = files.map(file => file.path === 'assets/a.js'
        ? { ...file, bytes: encoder.encode('other') } : file)
      await expect(inspect(await makeTar({ files: changed, attestationRaw: attestation.bytes })))
        .rejects.toThrow()
    } finally {
      rmSync(root, { recursive: true })
    }
  })

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

  it.each([0, 8] as const)('accepts a realistic GNU-tar upload-pages-artifact archive in ZIP method %i', async method => {
    const tar = await makeGnuTar()
    await expect(inspect(tar, { method })).resolves.toMatchObject({
      innerArtifactTarSha256: await sha256(tar),
    })
  })

  it('accepts the byte-exact pinned uploader ZIP and GNU TAR wire tuple', async () => {
    const tar = await makeGnuTar()
    const zipBytes = makeZip(tar, { method: 8, bit3: true })
    const local = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
    const centralOffset = 30 + ARTIFACT_NAME.length + deflateSync(tar).length + 16
    expect(zipBytes.subarray(centralOffset, centralOffset + CAPTURED_PINNED_CENTRAL_PREFIX.length))
      .toEqual(CAPTURED_PINNED_CENTRAL_PREFIX)
    expect(zipBytes.subarray(centralOffset + 38, centralOffset + 42))
      .toEqual(CAPTURED_PINNED_EXTERNAL_ATTRIBUTES)
    expect(local.getUint16(4, true)).toBe(20)
    expect(local.getUint16(6, true)).toBe(0x0008)
    expect(local.getUint16(8, true)).toBe(8)
    expect(local.getUint16(centralOffset + 4, true)).toBe(0x032d)
    expect(local.getUint32(centralOffset + 38, true)).toBe(0x81a40020)
    await expect(inspectPagesArtifact(responseAt(zipBytes, 137), expected)).resolves.toMatchObject({
      githubArtifactArchiveSha256: await sha256(zipBytes),
      innerArtifactTarSha256: await sha256(tar),
    })
  })

  it.each([
    ['neighboring creator version', { centralVersionMadeBy: 0x032c }],
    ['old creator version', { centralVersionMadeBy: 0x0314 }],
    ['missing DOS archive bit', { centralExternalAttributes: 0x81a40000 }],
    ['neighboring external attributes', { centralExternalAttributes: 0x81a40021 }],
  ] as const)('rejects pinned uploader ZIP metadata with %s', async (_name, zipOptions) => {
    await expect(inspect(await makeGnuTar(), { method: 8, bit3: true, ...zipOptions }))
      .rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('accepts adversarial one-byte chunking without full-body methods', async () => {
    const tar = await makeTar()
    await expect(inspect(tar, { method: 8, bit3: true }, 1)).resolves.toMatchObject({
      githubArtifactArchiveSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    })
  })

  it.each([0, 6] as const)('accepts a standard fflate stream with sanctioned outer metadata at compression level %i', async level => {
    const tar = await makeTar()
    const bytes = zipSync({ 'artifact.tar': tar }, { level })
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const centralOffset = view.getUint32(bytes.length - 22 + 16, true)
    view.setUint16(centralOffset + 4, 0x032d, true)
    view.setUint32(centralOffset + 38, 0x81a40020, true)
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

  it('accepts a signatureless descriptor whose CRC equals the optional descriptor signature', async () => {
    const files = [
      { path: 'pad', bytes: new Uint8Array() },
      { path: 'index.html', bytes: encoder.encode('x') },
    ]
    const attestation = await attestationBytes(files)
    const tar = concat(
      tarFile('pad', new Uint8Array(), { mtime: 5_840_551_874 }),
      tarFile('index.html', encoder.encode('x')),
      tarFile(ATTESTATION_PATH, attestation),
      new Uint8Array(1024),
    )
    expect(crc32(tar)).toBe(0x0807_4b50)
    await expect(inspect(tar, { method: 8, bit3: true, descriptorSignature: false })).resolves.toBeDefined()
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
    Object.defineProperty(status, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip' })
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
    Object.defineProperty(response, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip' })

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
    Object.defineProperty(response, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip' })
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

  it('allows progress beyond ten seconds but rejects a thirty-second idle stall', async () => {
    vi.useFakeTimers()
    try {
      const bytes = makeZip(await makeTar(), { method: 8 })
      let stage = 0
      const slow = new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (stage === 0) {
            stage = 1
            controller.enqueue(bytes.subarray(0, Math.floor(bytes.length / 2)))
            return
          }
          if (stage !== 1) return
          stage = 2
          return new Promise<void>(resolve => setTimeout(() => {
            try {
              controller.enqueue(bytes.subarray(Math.floor(bytes.length / 2)))
              controller.close()
            } catch {
              // The RED implementation cancels at its obsolete ten-second deadline.
            }
            resolve()
          }, 11_000))
        },
      }), { headers: { 'content-length': String(bytes.length), 'content-type': 'application/zip' } })
      Object.defineProperty(slow, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip' })
      const slowPending = inspectPagesArtifact(slow, expected)
      void slowPending.catch(() => undefined)
      await vi.advanceTimersByTimeAsync(11_001)
      await expect(slowPending).resolves.toBeDefined()

      const response = new Response(new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) }), {
        status: 200,
        headers: { 'content-length': '1024', 'content-type': 'application/zip' },
      })
      Object.defineProperty(response, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip' })
      const pending = inspectPagesArtifact(response, expected)
      const rejection = expect(pending).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
      await vi.advanceTimersByTimeAsync(30_001)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('separates resettable idle progress from an injectable hard total deadline', async () => {
    vi.useFakeTimers()
    try {
      const bytes = makeZip(await makeTar())
      let offset = 0
      const progressive = new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          return new Promise<void>(resolve => setTimeout(() => {
            const end = Math.min(bytes.length, offset + Math.ceil(bytes.length / 3))
            controller.enqueue(bytes.subarray(offset, end))
            offset = end
            if (offset === bytes.length) controller.close()
            resolve()
          }, 20))
        },
      }), { headers: { 'content-length': String(bytes.length), 'content-type': 'application/zip' } })
      Object.defineProperty(progressive, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip' })
      const progressWork = inspectPagesArtifact(progressive, expected, { totalTimeoutMilliseconds: 100, idleTimeoutMilliseconds: 30 })
      await vi.advanceTimersByTimeAsync(80)
      await expect(progressWork).resolves.toBeDefined()

      const endless = new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          return new Promise<void>(resolve => setTimeout(() => { controller.enqueue(new Uint8Array([1])); resolve() }, 20))
        },
      }), { headers: { 'content-length': '1024', 'content-type': 'application/zip' } })
      Object.defineProperty(endless, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip' })
      const totalWork = inspectPagesArtifact(endless, expected, { totalTimeoutMilliseconds: 100, idleTimeoutMilliseconds: 30 })
      void totalWork.catch(() => undefined)
      await vi.advanceTimersByTimeAsync(101)
      await expect(totalWork).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
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

  it('rejects noncanonical octal fields, nonzero devices, reserved bytes, and oversized members', async () => {
    const mutations: readonly ((tar: Uint8Array) => void)[] = [
      tar => { tar[100] = 0x20 },
      tar => { tar[107] = 0x20 },
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
    ['symlink', 0x32], ['hardlink', 0x31], ['device', 0x33],
    ['fifo', 0x36], ['PAX', 0x78], ['GNU long-link target', 0x4b],
  ])('rejects %s TAR entries', async (_name, type) => {
    const body = encoder.encode('x')
    const tar = concat(tarFile('x', body, { type }), new Uint8Array(1024))
    await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('accepts only a bounded one-shot canonical GNU LongLink followed by a regular file', async () => {
    const good = await makeGnuTar()
    await expect(inspect(good, { method: 8 })).resolves.toBeDefined()
    const common = { format: 'gnu' as const, uid: 1000, gid: 1000, uname: 'snapmeter', gname: 'snapmeter' }
    const files = [{ path: 'index.html', bytes: encoder.encode('x') }]
    const directoryTar = concat(
      gnuLongName(`./assets/${'nested/'.repeat(15)}`),
      tarDirectory('./placeholder/', common),
      tarFile('./index.html', files[0]!.bytes, common),
      tarFile(`./${ATTESTATION_PATH}`, await attestationBytes(files), common),
      new Uint8Array(1024),
    )
    await expect(inspect(directoryTar)).resolves.toBeDefined()
    const badBodies = [
      encoder.encode('../escape\0'),
      encoder.encode('/absolute\0'),
      concat(encoder.encode('assets/no-nul'), new Uint8Array([1])),
      new Uint8Array(1_025),
    ]
    for (const body of badBodies) {
      const tar = concat(
        tarFile('././@LongLink', body, { ...common, type: 0x4c }),
        tarFile('./placeholder', encoder.encode('x'), common),
        new Uint8Array(1024),
      )
      await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    }
    const dangling = concat(gnuLongName('./assets/a.js'), new Uint8Array(1024))
    await expect(inspect(dangling)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const repeated = concat(gnuLongName('./assets/a.js'), gnuLongName('./assets/b.js'), tarFile('./x', encoder.encode('x'), common), new Uint8Array(1024))
    await expect(inspect(repeated)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    const shortFiles = [{ path: 'index.html', bytes: encoder.encode('x') }]
    const redundant = concat(
      gnuLongName('./index.html'),
      tarFile('./placeholder', shortFiles[0]!.bytes, common),
      tarFile(`./${ATTESTATION_PATH}`, await attestationBytes(shortFiles), common),
      new Uint8Array(1024),
    )
    await expect(inspect(redundant)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('accepts normalized directories and rejects unsafe directory bodies, modes, and collisions', async () => {
    await expect(inspect(await makeGnuTar())).resolves.toBeDefined()
    const invalid = [
      concat(tarHeader('./assets/', 1, { type: 0x35, mode: 0o755 }), encoder.encode('x'), new Uint8Array(1535)),
      concat(tarDirectory('./assets/', { mode: 0o777 }), new Uint8Array(1024)),
      concat(tarDirectory('./../escape/', {}), new Uint8Array(1024)),
      concat(tarDirectory('./.secret/', {}), new Uint8Array(1024)),
      concat(tarDirectory('./assets/', {}), tarDirectory('./ASSETS/', {}), new Uint8Array(1024)),
    ]
    for (const tar of invalid) await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })

  it('accepts all-NUL GNU device fields and rejects mixed or nonzero device identities', async () => {
    await expect(inspect(await makeGnuTar(), { method: 8, bit3: true })).resolves.toBeDefined()
    for (const device of [
      Uint8Array.of(0x30, 0, 0, 0, 0, 0, 0, 0),
      octal(1, 8),
    ]) {
      const tar = await makeTar({ mutateTar: bytes => {
        bytes.set(device, 329)
        refreshTarChecksum(bytes)
      } })
      await expect(inspect(tar)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    }
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

  it('requires at least two zero terminators, accepts zero record padding, and rejects nonzero trailing bytes', async () => {
    await expect(inspect(await makeTar({ terminators: 0 }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    await expect(inspect(await makeTar({ terminators: 1 }))).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
    await expect(inspect(await makeTar({ terminators: 3 }))).resolves.toBeDefined()
    await expect(inspect(await makeTar({ terminators: 20 }))).resolves.toBeDefined()
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

  it('cancels without awaiting hostile cleanup when expected projection or response access fails', async () => {
    const bytes = makeZip(await makeTar())
    for (const kind of ['expected', 'response'] as const) {
      let cancelled = false
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(bytes) },
        cancel() { cancelled = true; return new Promise<void>(() => undefined) },
      })
      const response = new Response(body, { headers: { 'content-length': String(bytes.length), 'content-type': 'application/zip' } })
      Object.defineProperty(response, 'url', { value: 'https://objects.githubusercontent.com/recovery.zip' })
      const target = kind === 'response'
        ? new Proxy(response, { get(targetResponse, key) { if (key === 'status') throw new Error('secret'); return Reflect.get(targetResponse, key, targetResponse) } })
        : response
      const projection = kind === 'expected' ? { ...expected, candidateTree: 'invalid' } : expected
      await expect(inspectPagesArtifact(target, projection)).rejects.toThrowError('RECOVERY_GITHUB_ARCHIVE_INVALID')
      expect(cancelled).toBe(true)
    }
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

  it('streams highly compressible input through the bounded 1KiB inflater feed', async () => {
    const files = [{ path: 'large.bin', bytes: new Uint8Array(16 * 1024 * 1024) }]
    const zipBytes = makeZip(await makeTar({ files }), { method: 8 })
    await expect(inspectPagesArtifact(responseAt(zipBytes, 4096), expected)).resolves.toBeDefined()
  })

  it('copies stored payloads in bounded windows without a 1KiB read loop', async () => {
    const files = [{ path: 'large.bin', bytes: new Uint8Array(4 * 1024 * 1024) }]
    const zipBytes = makeZip(await makeTar({ files }), { method: 0 })
    const original = Uint8Array.from.bind(Uint8Array)
    let oneKiBCopies = 0
    const copySpy = vi.spyOn(Uint8Array, 'from').mockImplementation(((value: ArrayLike<number>) => {
      if (value instanceof Uint8Array && value.length === 1024) oneKiBCopies += 1
      return original(value)
    }) as typeof Uint8Array.from)
    try {
      await expect(inspectPagesArtifact(responseAt(zipBytes, 256 * 1024), expected)).resolves.toBeDefined()
      expect(oneKiBCopies).toBeLessThan(64)
    } finally {
      copySpy.mockRestore()
    }
  })
})
