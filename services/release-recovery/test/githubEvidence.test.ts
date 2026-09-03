import { createPrivateKey } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  RECOVERY_BINDING_KEYS_V2,
  RECOVERY_RECEIPT_COMMITMENT_DIGESTS,
  loadGitHubCandidateEvidence,
  mintGitHubInstallationToken,
  recheckGitHubEvidenceMetadata,
  type GitHubCandidateEvidence,
} from '../src/githubEvidence.js'
import {
  RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  type RecoveryRealmBindingProjection,
} from '../src/config.js'
import { serializeExactObject, sha256Hex, type JsonValue } from '../src/protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from '../src/recoveryPublicKey.js'

const REPOSITORY = 'ael-dev3/Warpkeep'
const REPOSITORY_ID = 1273513252
const OWNER_ID = 183124839
const CANDIDATE = 'a'.repeat(40)
const PREPARATION = 'b'.repeat(40)
const CANDIDATE_TREE = 'c'.repeat(40)
const PREPARATION_TREE = 'd'.repeat(40)
const PREPARATION_PARENT = 'e'.repeat(40)
const BINDING_PATH = 'config/releases/0.4.0-sealed-launch.json'
const WORKFLOW_PATH = '.github/workflows/deploy-pages.yml'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const API = `https://api.github.com/repos/${REPOSITORY}`
const ARTIFACT_ID = 44112233
const SOURCE_RUN_ID = 52
const PAGES_RUN_ID = 41
const G001 = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G002 = '70'.repeat(32)
const PTR = '80'.repeat(32)
const CLOSURE = '60'.repeat(32)
const BRIDGE_VERSION = 'warpkeep-auth-bridge-release-recovery-v1'
const BRIDGE_VERSION_ID = '123e4567-e89b-42d3-a456-426614174002'
const BRIDGE_SOURCE_COMMIT = '1'.repeat(40)
const BRIDGE_CONFIG_IDENTITY = '21'.repeat(32)
const G001_PROGRAM = '31'.repeat(32)
const G002_PROGRAM = '41'.repeat(32)
const PTR_PROGRAM = '51'.repeat(32)
const G002_ATLAS_ID = 'GENESIS_002_GREATER_REALM'
const G002_PUBLIC_RELEASE_ID = `GRR-${'A'.repeat(26)}`
const G002_PUBLIC_APPROVAL_RECEIPT_ID = `GRA-${'B'.repeat(26)}`
const G002_ATLAS_SOURCE_COMMIT = '6'.repeat(40)
const G002_RELEASE_SHA256 = 'a1'.repeat(32)
const G002_RELEASE_HEADER_SHA256 = 'a2'.repeat(32)
const G002_VERIFICATION_DIGEST = 'a3'.repeat(32)
const PTR_ATLAS_ID = 'PTR_GREATER_REALM'
const PTR_PUBLIC_RELEASE_ID = `GRR-${'C'.repeat(26)}`
const PTR_PUBLIC_APPROVAL_RECEIPT_ID = `GRA-${'D'.repeat(26)}`
const PTR_ATLAS_SOURCE_COMMIT = 'a'.repeat(40)
const PTR_EXPECTED_RELEASE_SHA256 = 'b1'.repeat(32)
const PTR_RELEASE_HEADER_SHA256 = 'b2'.repeat(32)
const PTR_VERIFICATION_DIGEST = 'b3'.repeat(32)
const encoder = new TextEncoder()
const BASE64_CHUNK_BYTES = 24 * 1024
const CAPTURED_GITHUB_PACKAGE_BLOB_CONTENT = `ewogICJuYW1lIjogIndhcnBrZWVwIiwKICAicHJpdmF0ZSI6IHRydWUsCiAg
InZlcnNpb24iOiAiMC40LjAiLAogICJzY3JpcHRzIjogewogICAgImJ1aWxk
IjogInZpdGUgYnVpbGQiLAogICAgInRlc3QiOiAidml0ZXN0IC0tcnVuIgog
IH0sCiAgImRlcGVuZGVuY2llcyI6IHsKICAgICJ2aXRlIjogIjguMC4xNiIK
ICB9LAogICJkZXNjcmlwdGlvbiI6ICJXYXJwa2VlcCByZWNvdmVyeSBmaXh0
dXJlIgp9Cg==
`

let privateKeyPem = ''

type TreeEntry = { path: string; mode: string; type: string; sha: string; size?: number; url: string }
type JsonObject = Record<string, unknown>

const EXPECTED_REALM_BINDING_PROJECTION_KEYS = [
  'requestId', 'authorizationMode', 'recoveryAuthorizationProfile',
  'recoveryKeyId', 'recoveryKeyThumbprint', 'authorizationEpoch',
  'repository', 'repositoryId', 'repositoryOwnerId', 'ref', 'workflowRef',
  'environment', 'releaseVersion', 'operation', 'canonicalOrigin', 'issuer',
  'authWorker', 'bridgeWorkerVersion', 'bridgeWorkerVersionId',
  'bridgeSourceCommit', 'bridgeConfigIdentity', 'bridgeConfigEpoch',
  'preparationCommit', 'preparationTree', 'sourceClosureProfile',
  'sourceClosureSha256', 'recoveryAuthorizationCoreSha256',
  'pagesDeploymentApproved', 'genesis001Database', 'genesis002Database',
  'ptrDatabase', 'g001ExpectedProgramKeccak256',
  'g002ExpectedProgramKeccak256', 'ptrExpectedProgramKeccak256',
  'g002AtlasId', 'g002PublicReleaseId', 'g002PublicApprovalReceiptId',
  'g002AtlasSourceCommit', 'g002ReleaseSha256',
  'g002ReleaseHeaderSha256', 'g002VerificationDigest', 'ptrAtlasId',
  'ptrPublicReleaseId', 'ptrPublicApprovalReceiptId', 'ptrAtlasSourceCommit',
  'ptrExpectedReleaseSha256', 'ptrReleaseHeaderSha256',
  'ptrVerificationDigest',
] as const

function expectedRealmBinding(core: string): RecoveryRealmBindingProjection {
  return {
    requestId: REQUEST_ID,
    authorizationMode: 'recovery-authorization-v1',
    recoveryAuthorizationProfile: 'warpkeep-0.4.0-recovery-authorization-v1',
    recoveryKeyId: RECOVERY_KEY_ID,
    recoveryKeyThumbprint: RECOVERY_KEY_THUMBPRINT,
    authorizationEpoch: 3,
    repository: REPOSITORY,
    repositoryId: '1273513252',
    repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`,
    environment: 'github-pages',
    releaseVersion: '0.4.0',
    operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com',
    issuer: 'https://release-auth.warpkeep.com',
    authWorker: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: BRIDGE_VERSION,
    bridgeWorkerVersionId: BRIDGE_VERSION_ID,
    bridgeSourceCommit: BRIDGE_SOURCE_COMMIT,
    bridgeConfigIdentity: BRIDGE_CONFIG_IDENTITY,
    bridgeConfigEpoch: 4,
    preparationCommit: PREPARATION,
    preparationTree: PREPARATION_TREE,
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: CLOSURE,
    recoveryAuthorizationCoreSha256: core,
    pagesDeploymentApproved: true,
    genesis001Database: G001,
    genesis002Database: G002,
    ptrDatabase: PTR,
    g001ExpectedProgramKeccak256: G001_PROGRAM,
    g002ExpectedProgramKeccak256: G002_PROGRAM,
    ptrExpectedProgramKeccak256: PTR_PROGRAM,
    g002AtlasId: G002_ATLAS_ID,
    g002PublicReleaseId: G002_PUBLIC_RELEASE_ID,
    g002PublicApprovalReceiptId: G002_PUBLIC_APPROVAL_RECEIPT_ID,
    g002AtlasSourceCommit: G002_ATLAS_SOURCE_COMMIT,
    g002ReleaseSha256: G002_RELEASE_SHA256,
    g002ReleaseHeaderSha256: G002_RELEASE_HEADER_SHA256,
    g002VerificationDigest: G002_VERIFICATION_DIGEST,
    ptrAtlasId: PTR_ATLAS_ID,
    ptrPublicReleaseId: PTR_PUBLIC_RELEASE_ID,
    ptrPublicApprovalReceiptId: PTR_PUBLIC_APPROVAL_RECEIPT_ID,
    ptrAtlasSourceCommit: PTR_ATLAS_SOURCE_COMMIT,
    ptrExpectedReleaseSha256: PTR_EXPECTED_RELEASE_SHA256,
    ptrReleaseHeaderSha256: PTR_RELEASE_HEADER_SHA256,
    ptrVerificationDigest: PTR_VERIFICATION_DIGEST,
  }
}

const REALM_BINDING_MUTATIONS: ReadonlyArray<readonly [keyof RecoveryRealmBindingProjection, unknown]> = [
  ['requestId', '123e4567-e89b-42d3-a456-426614174099'],
  ['authorizationMode', 'wrong'],
  ['recoveryAuthorizationProfile', 'wrong'],
  ['recoveryKeyId', 'wrong'],
  ['recoveryKeyThumbprint', 'wrong'],
  ['authorizationEpoch', 5],
  ['repository', 'fork/Warpkeep'],
  ['repositoryId', '9007199254740993'],
  ['repositoryOwnerId', '9007199254740993'],
  ['ref', 'refs/heads/other'],
  ['workflowRef', 'wrong'],
  ['environment', 'other'],
  ['releaseVersion', '0.4.1'],
  ['operation', 'wrong'],
  ['canonicalOrigin', 'https://example.test'],
  ['issuer', 'https://example.test'],
  ['authWorker', 'other'],
  ['bridgeWorkerVersion', 'other'],
  ['bridgeWorkerVersionId', '123e4567-e89b-42d3-a456-426614174099'],
  ['bridgeSourceCommit', 'f'.repeat(40)],
  ['bridgeConfigIdentity', 'e'.repeat(64)],
  ['bridgeConfigEpoch', 5],
  ['preparationCommit', PREPARATION_PARENT],
  ['preparationTree', CANDIDATE_TREE],
  ['sourceClosureProfile', 'wrong'],
  ['sourceClosureSha256', 'f'.repeat(64)],
  ['recoveryAuthorizationCoreSha256', 'f'.repeat(64)],
  ['pagesDeploymentApproved', false],
  ['genesis001Database', G002],
  ['genesis002Database', '9'.repeat(64)],
  ['ptrDatabase', 'e'.repeat(64)],
  ['g001ExpectedProgramKeccak256', 'a'.repeat(64)],
  ['g002ExpectedProgramKeccak256', 'b'.repeat(64)],
  ['ptrExpectedProgramKeccak256', 'c'.repeat(64)],
  ['g002AtlasId', PTR_ATLAS_ID],
  ['g002PublicReleaseId', `GRR-${'Z'.repeat(26)}`],
  ['g002PublicApprovalReceiptId', `GRA-${'Z'.repeat(26)}`],
  ['g002AtlasSourceCommit', 'e'.repeat(40)],
  ['g002ReleaseSha256', '0'.repeat(64)],
  ['g002ReleaseHeaderSha256', '1'.repeat(64)],
  ['g002VerificationDigest', '2'.repeat(64)],
  ['ptrAtlasId', G002_ATLAS_ID],
  ['ptrPublicReleaseId', `GRR-${'Y'.repeat(26)}`],
  ['ptrPublicApprovalReceiptId', `GRA-${'Y'.repeat(26)}`],
  ['ptrAtlasSourceCommit', 'e'.repeat(40)],
  ['ptrExpectedReleaseSha256', '0'.repeat(64)],
  ['ptrReleaseHeaderSha256', '1'.repeat(64)],
  ['ptrVerificationDigest', '2'.repeat(64)],
]

type State = {
  repository: JsonObject
  branch: JsonObject
  candidateCommit: JsonObject
  preparationCommit: JsonObject
  candidateTree: TreeEntry[]
  preparationTree: TreeEntry[]
  bindingBytes: Uint8Array
  workflowBytes: Uint8Array
  candidatePackageBytes: Uint8Array
  preparationPackageBytes: Uint8Array
  candidateLockBytes: Uint8Array
  preparationLockBytes: Uint8Array
  source: JsonObject
  artifact: JsonObject
  listedArtifacts: JsonObject[]
  listTotal: number
  listLink: string | null
  artifactSecond?: JsonObject
  artifactEtag: string
  artifactSecondEtag?: string
  blobShaOverride?: string
  blobEncodingOverride?: string
  blobContentOverride?: string
  blobSecondContentOverride?: string
  blobSecondEtag?: string
  archive: Uint8Array
  archiveLengthOverride?: string
  archiveResponse?: () => Response
  forbidArchive: boolean
}

function withUrl(url: string, response: Response): Response {
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function jsonResponse(url: string, value: unknown, status = 200, etag?: string, link?: string | null): Response {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (etag !== undefined) headers.set('etag', etag)
  if (link !== undefined && link !== null) headers.set('link', link)
  return withUrl(url, new Response(JSON.stringify(value), { status, headers }))
}

async function digest(algorithm: 'SHA-1' | 'SHA-256', bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest(algorithm, Uint8Array.from(bytes)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function blobSha(bytes: Uint8Array): Promise<string> {
  const prefix = encoder.encode(`blob ${bytes.length}\0`)
  const input = new Uint8Array(prefix.length + bytes.length)
  input.set(prefix)
  input.set(bytes, prefix.length)
  return digest('SHA-1', input)
}

function base64(bytes: Uint8Array): string {
  let result = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    result += btoa(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES)))
  }
  return result
}

function githubBlobBase64(bytes: Uint8Array): string {
  return `${base64(bytes).match(/.{1,60}/gu)!.join('\n')}\n`
}

function canonicalJson(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`)
}

function packageLockPair(preparationByteLength: number): Readonly<{
  candidate: Uint8Array
  preparation: Uint8Array
}> {
  const value = (version: string, padding: string) => ({
    name: 'warpkeep', version, lockfileVersion: 3, requires: true,
    packages: {
      '': { name: 'warpkeep', version, dependencies: { vite: '8.0.16' } },
      'node_modules/vite': {
        version: '8.0.16', resolved: 'https://registry.npmjs.org/vite/-/vite-8.0.16.tgz',
        integrity: 'sha512-sanitized-fixture',
      },
    },
    fixturePadding: padding,
  })
  const emptyPreparation = canonicalJson(value('0.3.43', ''))
  const paddingLength = preparationByteLength - emptyPreparation.length
  if (paddingLength < 0) throw new Error('invalid package-lock fixture size')
  const padding = 'x'.repeat(paddingLength)
  const preparation = canonicalJson(value('0.3.43', padding))
  const candidate = canonicalJson(value('0.4.0', padding))
  if (preparation.length !== preparationByteLength || candidate.length !== preparationByteLength - 2) {
    throw new Error('package-lock fixture size mismatch')
  }
  return Object.freeze({ candidate, preparation })
}

function octal(value: number, length: number): Uint8Array {
  return encoder.encode(`${value.toString(8).padStart(length - 1, '0')}\0`)
}

function tarEntry(path: string, body: Uint8Array): Uint8Array {
  const header = new Uint8Array(512)
  header.set(encoder.encode(path))
  header.set(octal(0o644, 8), 100)
  header.set(octal(0, 8), 108)
  header.set(octal(0, 8), 116)
  header.set(octal(body.length, 12), 124)
  header.set(octal(0, 12), 136)
  header.fill(0x20, 148, 156)
  header[156] = 48
  header.set(encoder.encode('ustar\0'), 257)
  header.set(encoder.encode('00'), 263)
  header.set(octal(0, 8), 329)
  header.set(octal(0, 8), 337)
  let checksum = 0
  for (const byte of header) checksum += byte
  header.set(encoder.encode(`${checksum.toString(8).padStart(6, '0')}\0 `), 148)
  const result = new Uint8Array(512 + Math.ceil(body.length / 512) * 512)
  result.set(header)
  result.set(body, 512)
  return result
}

function zip(body: Uint8Array): Uint8Array {
  let crc = 0xffff_ffff
  for (const byte of body) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0)
  }
  crc = (crc ^ 0xffff_ffff) >>> 0
  const name = encoder.encode('artifact.tar')
  const local = new Uint8Array(30 + name.length)
  const localView = new DataView(local.buffer)
  localView.setUint32(0, 0x04034b50, true)
  localView.setUint16(4, 10, true)
  localView.setUint16(10, 0x1234, true)
  localView.setUint16(12, 0x5678, true)
  localView.setUint32(14, crc, true)
  localView.setUint32(18, body.length, true)
  localView.setUint32(22, body.length, true)
  localView.setUint16(26, name.length, true)
  local.set(name, 30)
  const central = new Uint8Array(46 + name.length)
  const centralView = new DataView(central.buffer)
  centralView.setUint32(0, 0x02014b50, true)
  centralView.setUint16(4, 0x032d, true)
  centralView.setUint16(6, 10, true)
  centralView.setUint16(12, 0x1234, true)
  centralView.setUint16(14, 0x5678, true)
  centralView.setUint32(16, crc, true)
  centralView.setUint32(20, body.length, true)
  centralView.setUint32(24, body.length, true)
  centralView.setUint16(28, name.length, true)
  centralView.setUint32(38, 0x81a40020, true)
  central.set(name, 46)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(8, 1, true)
  eocdView.setUint16(10, 1, true)
  eocdView.setUint32(12, central.length, true)
  eocdView.setUint32(16, local.length + body.length, true)
  return new Uint8Array([...local, ...body, ...central, ...eocd])
}

async function validBinding(): Promise<Readonly<{ bytes: Uint8Array; core: string }>> {
  const binding: Record<string, JsonValue> = Object.create(null)
  for (const key of RECOVERY_BINDING_KEYS_V2) binding[key] = null
  Object.assign(binding, {
    schemaVersion: 2,
    profile: 'warpkeep-0.4.0-sealed-launch-v2',
    authorizationMode: 'recovery-authorization-v1',
    recoveryAuthorizationProfile: 'warpkeep-0.4.0-recovery-authorization-v1',
    recoveryAuthorizationRequestId: REQUEST_ID,
    recoveryAuthorizationCoreSha256: null,
    recoveryKeyId: RECOVERY_KEY_ID,
    recoveryKeyThumbprint: RECOVERY_KEY_THUMBPRINT,
    recoveryAuthorizationEpoch: 3,
    recoveryRepository: REPOSITORY,
    recoveryRepositoryId: String(REPOSITORY_ID),
    recoveryRepositoryOwnerId: String(OWNER_ID),
    recoveryRef: 'refs/heads/main',
    recoveryWorkflowRef: `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`,
    recoveryEnvironment: 'github-pages',
    recoveryReleaseVersion: '0.4.0',
    recoveryOperation: 'github-pages-production-deploy',
    recoveryCanonicalOrigin: 'https://warpkeep.com',
    recoveryIssuer: 'https://release-auth.warpkeep.com',
    recoveryAuthWorker: 'warpkeep-auth-bridge',
    recoveryAuthWorkerVersion: BRIDGE_VERSION,
    recoveryAuthWorkerVersionId: BRIDGE_VERSION_ID,
    recoveryAuthWorkerSourceCommit: BRIDGE_SOURCE_COMMIT,
    recoveryAuthWorkerConfigIdentity: BRIDGE_CONFIG_IDENTITY,
    recoveryAuthWorkerConfigEpoch: 4,
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: CLOSURE,
    pagesDeploymentApproved: true,
    preparationSourceCommit: PREPARATION,
    preparationSourceTree: PREPARATION_TREE,
    g001DatabaseIdentity: G001,
    g001ExpectedProgramKeccak256: G001_PROGRAM,
    g002DatabaseIdentity: G002,
    g002ExpectedProgramKeccak256: G002_PROGRAM,
    ptrDatabaseIdentity: PTR,
    ptrExpectedProgramKeccak256: PTR_PROGRAM,
    g002AtlasId: G002_ATLAS_ID,
    g002PublicReleaseId: G002_PUBLIC_RELEASE_ID,
    g002PublicApprovalReceiptId: G002_PUBLIC_APPROVAL_RECEIPT_ID,
    g002AtlasSourceCommit: G002_ATLAS_SOURCE_COMMIT,
    g002ReleaseSha256: G002_RELEASE_SHA256,
    g002ReleaseHeaderSha256: G002_RELEASE_HEADER_SHA256,
    g002VerificationDigest: G002_VERIFICATION_DIGEST,
    ptrAtlasId: PTR_ATLAS_ID,
    ptrPublicReleaseId: PTR_PUBLIC_RELEASE_ID,
    ptrPublicApprovalReceiptId: PTR_PUBLIC_APPROVAL_RECEIPT_ID,
    ptrAtlasSourceCommit: PTR_ATLAS_SOURCE_COMMIT,
    ptrExpectedReleaseSha256: PTR_EXPECTED_RELEASE_SHA256,
    ptrReleaseHeaderSha256: PTR_RELEASE_HEADER_SHA256,
    ptrVerificationDigest: PTR_VERIFICATION_DIGEST,
    g001FreezePublishReceiptDigest: null,
    g001FreezePublishReceiptCommitment: null,
  })
  let index = 1
  for (const digestKey of Object.values(RECOVERY_RECEIPT_COMMITMENT_DIGESTS)) {
    binding[digestKey] = (index++).toString(16).padStart(2, '0').repeat(32)
  }
  const allCommitments = new Set([
    'g001FreezePublishReceiptCommitment',
    ...Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS),
  ])
  const receiptKeys = RECOVERY_BINDING_KEYS_V2.filter(key => !allCommitments.has(key))
  const receipt: Record<string, JsonValue> = Object.create(null)
  for (const key of receiptKeys) receipt[key] = key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]!
  for (const commitmentKey of Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS)) {
    binding[commitmentKey] = await sha256Hex(
      `warpkeep.0.4.0.recovery-sealed-launch.${commitmentKey}.v2\n`,
      serializeExactObject(receiptKeys, receipt as never),
    )
  }
  const coreProjection = { ...binding, recoveryAuthorizationCoreSha256: null }
  const core = await sha256Hex(
    'warpkeep.0.4.0.recovery-authorization-core.v1\n',
    serializeExactObject(RECOVERY_BINDING_KEYS_V2, coreProjection as never),
  )
  binding.recoveryAuthorizationCoreSha256 = core
  return { bytes: encoder.encode(`${JSON.stringify(binding, null, 2)}\n`), core }
}

function workflowBytes(): Uint8Array {
  return encoder.encode(`name: Deploy GitHub Pages
on:
  workflow_run:
jobs:
  deploy-recovery:
    runs-on: ubuntu-latest
    steps:
      - name: Acquire exact recovery identity
        id: recovery-oidc
        shell: bash
        env:
          OIDC_AUDIENCE: warpkeep-release-recovery
        run: |
          test "$OIDC_AUDIENCE" = warpkeep-release-recovery
          curl --fail-with-body --silent --show-error \\
            --header "Authorization: bearer \${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \\
            "\${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=\${OIDC_AUDIENCE}"
      - name: Upload exact recovery artifact
        uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9
        with:
          name: github-pages-recovery-\${{ github.run_id }}-\${{ github.run_attempt }}
`)
}

async function makeFixture(): Promise<Readonly<{
  state: State
  input: Parameters<typeof loadGitHubCandidateEvidence>[0]
  calls: string[]
  requestInits: RequestInit[]
}>> {
  const binding = await validBinding()
  const workflow = workflowBytes()
  const packageValue = {
    name: 'warpkeep', private: true, version: '0.4.0',
    scripts: { build: 'vite build', test: 'vitest --run' },
    dependencies: { vite: '8.0.16' },
    description: 'Warpkeep recovery fixture',
  }
  const packageBytes = canonicalJson(packageValue)
  const oldPackageBytes = canonicalJson({ ...packageValue, version: '0.3.43' })
  const lockValue = {
    name: 'warpkeep', version: '0.4.0', lockfileVersion: 3, requires: true,
    packages: {
      '': { name: 'warpkeep', version: '0.4.0', dependencies: { vite: '8.0.16' } },
      'node_modules/vite': {
        version: '8.0.16', resolved: 'https://registry.npmjs.org/vite/-/vite-8.0.16.tgz',
        integrity: 'sha512-sanitized-fixture',
      },
    },
  }
  const lockBytes = canonicalJson(lockValue)
  const oldLockBytes = canonicalJson({
    ...lockValue,
    version: '0.3.43',
    packages: { ...lockValue.packages, '': { ...lockValue.packages[''], version: '0.3.43' } },
  })
  const oldBindingBytes = encoder.encode('{"schemaVersion":1}\n')
  const readmeBytes = encoder.encode('Warpkeep\n')
  const [bindingSha, workflowSha, packageSha, oldPackageSha, lockSha, oldLockSha, oldBindingSha, readmeSha] = await Promise.all([
    blobSha(binding.bytes), blobSha(workflow), blobSha(packageBytes), blobSha(oldPackageBytes),
    blobSha(lockBytes), blobSha(oldLockBytes), blobSha(oldBindingBytes), blobSha(readmeBytes),
  ])
  const entry = (path: string, sha: string, size: number): TreeEntry => ({
    path, mode: '100644', type: 'blob', sha, size, url: `${API}/git/blobs/${sha}`,
  })
  const candidateTree = [
    entry('.github', '1'.repeat(40), 0),
    entry('.github/workflows', '2'.repeat(40), 0),
    entry('.github/workflows/deploy-pages.yml', workflowSha, workflow.length),
    entry('config', '3'.repeat(40), 0),
    entry('config/releases', '4'.repeat(40), 0),
    entry(BINDING_PATH, bindingSha, binding.bytes.length),
    entry('README.md', readmeSha, readmeBytes.length),
    entry('package-lock.json', lockSha, lockBytes.length),
    entry('package.json', packageSha, packageBytes.length),
  ]
  candidateTree[0]!.type = 'tree'; candidateTree[0]!.mode = '040000'; delete candidateTree[0]!.size
  candidateTree[1]!.type = 'tree'; candidateTree[1]!.mode = '040000'; delete candidateTree[1]!.size
  candidateTree[3]!.type = 'tree'; candidateTree[3]!.mode = '040000'; delete candidateTree[3]!.size
  candidateTree[4]!.type = 'tree'; candidateTree[4]!.mode = '040000'; delete candidateTree[4]!.size
  const preparationTree = [
    { ...candidateTree[0] },
    { ...candidateTree[1] },
    entry('.github/workflows/deploy-pages.yml', workflowSha, workflow.length),
    { ...candidateTree[3], sha: '5'.repeat(40) },
    { ...candidateTree[4], sha: '6'.repeat(40) },
    entry(BINDING_PATH, oldBindingSha, oldBindingBytes.length),
    entry('README.md', readmeSha, readmeBytes.length),
    entry('package-lock.json', oldLockSha, oldLockBytes.length),
    entry('package.json', oldPackageSha, oldPackageBytes.length),
  ]
  const emptyManifestSha256 = await digest('SHA-256', encoder.encode('[]'))
  const attestation = encoder.encode(JSON.stringify({
    schemaVersion: 1,
    profile: 'warpkeep-deployment-attestation-v1',
    candidateCommit: CANDIDATE,
    candidateTree: CANDIDATE_TREE,
    recoveryAuthorizationCoreSha256: binding.core,
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: CLOSURE,
    releaseVersion: '0.4.0',
    canonicalOrigin: 'https://warpkeep.com',
    contentManifestSha256: emptyManifestSha256,
  }))
  const tar = new Uint8Array([
    ...tarEntry('.well-known/warpkeep-deployment-v1.json', attestation),
    ...new Uint8Array(1024),
  ])
  const archive = zip(tar)
  const archiveSha = await digest('SHA-256', archive)
  const artifact: JsonObject = {
    id: ARTIFACT_ID,
    node_id: 'MDg6QXJ0aWZhY3Q0NDExMjIzMw==',
    name: `github-pages-recovery-${PAGES_RUN_ID}-2`,
    size_in_bytes: archive.length,
    url: `${API}/actions/artifacts/${ARTIFACT_ID}`,
    archive_download_url: `${API}/actions/artifacts/${ARTIFACT_ID}/zip`,
    expired: false,
    created_at: '2026-09-01T00:00:00Z',
    expires_at: '2099-12-03T00:00:00Z',
    digest: `sha256:${archiveSha}`,
    workflow_run: {
      id: PAGES_RUN_ID,
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
      head_branch: 'main',
      head_sha: CANDIDATE,
    },
  }
  const state: State = {
    repository: {
      id: REPOSITORY_ID, name: 'Warpkeep', full_name: REPOSITORY,
      default_branch: 'main', archived: false, disabled: false,
      owner: { id: OWNER_ID, login: 'ael-dev3' },
    },
    branch: { name: 'main', protected: true, commit: { sha: CANDIDATE } },
    candidateCommit: { sha: CANDIDATE, tree: { sha: CANDIDATE_TREE }, parents: [{ sha: PREPARATION }] },
    preparationCommit: { sha: PREPARATION, tree: { sha: PREPARATION_TREE }, parents: [{ sha: PREPARATION_PARENT }] },
    candidateTree,
    preparationTree,
    bindingBytes: binding.bytes,
    workflowBytes: workflow,
    candidatePackageBytes: packageBytes,
    preparationPackageBytes: oldPackageBytes,
    candidateLockBytes: lockBytes,
    preparationLockBytes: oldLockBytes,
    source: {
      id: SOURCE_RUN_ID, run_attempt: 1, name: 'Verify', path: '.github/workflows/verify.yml@main',
      event: 'push', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: CANDIDATE,
      workflow_id: 17,
      workflow_url: `${API}/actions/workflows/17`,
      repository: { id: REPOSITORY_ID, full_name: REPOSITORY, owner: { id: OWNER_ID } },
      head_repository: { id: REPOSITORY_ID },
    },
    artifact,
    listedArtifacts: [artifact],
    listTotal: 1,
    listLink: null,
    artifactEtag: '"artifact-etag"',
    archive,
    forbidArchive: false,
  }
  const calls: string[] = []
  const blobCalls = new Map<string, number>()
  let artifactCalls = 0
  const requestInits: RequestInit[] = []
  const fetchImplementation = (async (request: string | URL | Request, init?: RequestInit) => {
    const url = String(request)
    calls.push(url)
    requestInits.push(init ?? {})
    if (url.includes('/access_tokens')) {
      return jsonResponse(url, {
        expires_at: new Date(Math.floor(Date.now() / 1000) * 1000 + 3_000_000).toISOString(),
        permissions: { actions: 'read', checks: 'read', contents: 'read', deployments: 'read', metadata: 'read', pages: 'read' },
        repository_selection: 'selected',
        repositories_url: 'https://api.github.com/installation/repositories',
        has_multiple_single_files: false,
        single_file: null,
        single_file_paths: [],
        token_last_eight: 'on-token',
        repositories: [{
          full_name: REPOSITORY, id: REPOSITORY_ID, name: 'Warpkeep', private: false,
          node_id: 'R_kgDOL5fixture', owner: { login: 'ael-dev3', id: OWNER_ID },
        }],
        token: 'installation-token',
      }, 201)
    }
    if (url === API) return jsonResponse(url, state.repository)
    if (url === `${API}/branches/main`) return jsonResponse(url, state.branch)
    if (url === `${API}/git/commits/${CANDIDATE}`) return jsonResponse(url, state.candidateCommit)
    if (url === `${API}/git/commits/${PREPARATION}`) return jsonResponse(url, state.preparationCommit)
    if (url === `${API}/git/trees/${CANDIDATE_TREE}?recursive=1`) return jsonResponse(url, { sha: CANDIDATE_TREE, url, tree: state.candidateTree, truncated: false })
    if (url === `${API}/git/trees/${PREPARATION_TREE}?recursive=1`) return jsonResponse(url, { sha: PREPARATION_TREE, url, tree: state.preparationTree, truncated: false })
    if (url.startsWith(`${API}/git/blobs/`)) {
      const sha = url.slice(`${API}/git/blobs/`.length)
      const count = (blobCalls.get(sha) ?? 0) + 1
      blobCalls.set(sha, count)
      const bindingEntry = state.candidateTree.find(value => value.path === BINDING_PATH)
      const workflowEntry = state.candidateTree.find(value => value.path === WORKFLOW_PATH)
      const candidatePackageEntry = state.candidateTree.find(value => value.path === 'package.json')
      const preparationPackageEntry = state.preparationTree.find(value => value.path === 'package.json')
      const candidateLockEntry = state.candidateTree.find(value => value.path === 'package-lock.json')
      const preparationLockEntry = state.preparationTree.find(value => value.path === 'package-lock.json')
      let bytes: Uint8Array
      if (sha === bindingEntry?.sha) bytes = state.bindingBytes
      else if (sha === workflowEntry?.sha) bytes = state.workflowBytes
      else if (sha === candidatePackageEntry?.sha) bytes = state.candidatePackageBytes
      else if (sha === preparationPackageEntry?.sha) bytes = state.preparationPackageBytes
      else if (sha === candidateLockEntry?.sha) bytes = state.candidateLockBytes
      else if (sha === preparationLockEntry?.sha) bytes = state.preparationLockBytes
      else throw new Error(`unexpected blob ${sha}`)
      const content = count === 2 && state.blobSecondContentOverride !== undefined
        ? state.blobSecondContentOverride
        : state.blobContentOverride ?? githubBlobBase64(bytes)
      const etag = count === 2 ? state.blobSecondEtag ?? '"blob-etag"' : '"blob-etag"'
      return jsonResponse(url, {
        content,
        encoding: state.blobEncodingOverride ?? 'base64',
        node_id: 'MDQ6QmxvYg==',
        sha: state.blobShaOverride ?? sha,
        size: bytes.length,
        url,
      }, 200, etag)
    }
    if (url === `${API}/actions/runs/${SOURCE_RUN_ID}/attempts/1`) return jsonResponse(url, state.source)
    if (url.startsWith(`${API}/actions/runs/${PAGES_RUN_ID}/artifacts?`)) {
      return jsonResponse(url, { total_count: state.listTotal, artifacts: state.listedArtifacts }, 200, undefined, state.listLink)
    }
    if (url === `${API}/actions/artifacts/${ARTIFACT_ID}`) {
      artifactCalls += 1
      return jsonResponse(
        url,
        artifactCalls === 2 ? state.artifactSecond ?? state.artifact : state.artifact,
        200,
        artifactCalls === 2 ? state.artifactSecondEtag ?? state.artifactEtag : state.artifactEtag,
      )
    }
    if (url === `${API}/actions/artifacts/${ARTIFACT_ID}/zip`) {
      if (state.forbidArchive) throw new Error('archive download forbidden')
      return withUrl(url, new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/recovery.zip' } }))
    }
    if (url === 'https://objects.githubusercontent.com/recovery.zip') {
      if (state.forbidArchive) throw new Error('archive download forbidden')
      if (state.archiveResponse !== undefined) return state.archiveResponse()
      return withUrl(url, new Response(Uint8Array.from(state.archive).buffer, {
        headers: { 'content-length': state.archiveLengthOverride ?? String(state.archive.length), 'content-type': 'application/zip' },
      }))
    }
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch
  const input: Parameters<typeof loadGitHubCandidateEvidence>[0] = {
    identity: {
      repository: REPOSITORY,
      repositoryId: '1273513252',
      repositoryOwnerId: '183124839',
      ref: 'refs/heads/main',
      workflowRef: `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`,
      environment: 'github-pages',
      eventName: 'workflow_run',
      workflowSha: CANDIDATE,
      pagesRunId: String(PAGES_RUN_ID),
      pagesRunAttempt: '2',
      checkRunId: '700',
      oidcJti: '123e4567-e89b-42d3-a456-426614174001',
    },
    candidateCommit: CANDIDATE,
    artifactId: String(ARTIFACT_ID),
    sourceVerifyRunId: String(SOURCE_RUN_ID),
    sourceVerifyRunAttempt: '1',
    bindingRequestId: REQUEST_ID,
    armed: {
      ...expectedRealmBinding(binding.core),
      bindingPath: BINDING_PATH,
      workflowPath: WORKFLOW_PATH,
    },
    environment: { GITHUB_APP_ID: '1', GITHUB_APP_INSTALLATION_ID: '2', GITHUB_APP_PRIVATE_KEY_PEM: privateKeyPem },
    fetch: fetchImplementation,
  }
  return { state, input, calls, requestInits }
}

async function replaceBinding(fixture: Awaited<ReturnType<typeof makeFixture>>, mutate: (value: JsonObject) => void): Promise<void> {
  const value = JSON.parse(new TextDecoder().decode(fixture.state.bindingBytes)) as JsonObject
  mutate(value)
  fixture.state.bindingBytes = encoder.encode(`${JSON.stringify(value, null, 2)}\n`)
  const entry = fixture.state.candidateTree.find(candidate => candidate.path === BINDING_PATH)!
  entry.sha = await blobSha(fixture.state.bindingBytes)
  entry.size = fixture.state.bindingBytes.length
  entry.url = `${API}/git/blobs/${entry.sha}`
}

async function replacePackageBlob(
  fixture: Awaited<ReturnType<typeof makeFixture>>,
  path: 'package.json' | 'package-lock.json',
  side: 'candidate' | 'preparation',
  bytes: Uint8Array,
): Promise<void> {
  const field = path === 'package.json'
    ? side === 'candidate' ? 'candidatePackageBytes' : 'preparationPackageBytes'
    : side === 'candidate' ? 'candidateLockBytes' : 'preparationLockBytes'
  fixture.state[field] = bytes
  const tree = side === 'candidate' ? fixture.state.candidateTree : fixture.state.preparationTree
  const entry = tree.find(value => value.path === path)!
  entry.sha = await blobSha(bytes)
  entry.size = bytes.length
  entry.url = `${API}/git/blobs/${entry.sha}`
}

async function mutatePackageJson(
  fixture: Awaited<ReturnType<typeof makeFixture>>,
  side: 'candidate' | 'preparation',
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const bytes = side === 'candidate' ? fixture.state.candidatePackageBytes : fixture.state.preparationPackageBytes
  const value = JSON.parse(new TextDecoder().decode(bytes)) as JsonObject
  mutate(value)
  await replacePackageBlob(fixture, 'package.json', side, canonicalJson(value))
}

async function mutatePackageLock(
  fixture: Awaited<ReturnType<typeof makeFixture>>,
  side: 'candidate' | 'preparation',
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const bytes = side === 'candidate' ? fixture.state.candidateLockBytes : fixture.state.preparationLockBytes
  const value = JSON.parse(new TextDecoder().decode(bytes)) as JsonObject
  mutate(value)
  await replacePackageBlob(fixture, 'package-lock.json', side, canonicalJson(value))
}

async function installPackageLockSize(
  fixture: Awaited<ReturnType<typeof makeFixture>>,
  preparationByteLength: number,
): Promise<void> {
  const pair = packageLockPair(preparationByteLength)
  await replacePackageBlob(fixture, 'package-lock.json', 'preparation', pair.preparation)
  await replacePackageBlob(fixture, 'package-lock.json', 'candidate', pair.candidate)
}

async function rejects(mutator: (fixture: Awaited<ReturnType<typeof makeFixture>>) => void | Promise<void>): Promise<void> {
  const fixture = await makeFixture()
  await mutator(fixture)
  await expect(loadGitHubCandidateEvidence(fixture.input)).rejects.toThrowError(/RECOVERY_GITHUB_(?:EVIDENCE|ARCHIVE)_INVALID/u)
}

describe('GitHub candidate evidence', () => {
  beforeAll(async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )
    const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
    privateKeyPem = createPrivateKey({ key: Buffer.from(bytes), format: 'der', type: 'pkcs8' })
      .export({ format: 'pem', type: 'pkcs1' }).toString()
  })

  it('loads a realistic authenticated GitHub evidence chain and returns copied bytes and actual tree', async () => {
    const fixture = await makeFixture()
    const evidence = await loadGitHubCandidateEvidence(fixture.input)
    expect(evidence).toMatchObject({
      currentMainCommit: CANDIDATE,
      parentCommit: PREPARATION,
      candidateTree: CANDIDATE_TREE,
      sourceVerifyRunId: String(SOURCE_RUN_ID),
      pagesArtifactId: String(ARTIFACT_ID),
      pagesArtifactName: `github-pages-recovery-${PAGES_RUN_ID}-2`,
    })
    expect(evidence.recoveryBindingBytes).toEqual(fixture.state.bindingBytes)
    expect(evidence.protectedWorkflowBytes).toEqual(fixture.state.workflowBytes)
    fixture.state.bindingBytes.fill(0)
    expect(evidence.recoveryBindingBytes[0]).not.toBe(0)
    const tokenIndex = fixture.calls.findIndex(url => url.includes('/access_tokens'))
    expect(fixture.requestInits[tokenIndex]?.method).toBe('POST')
    expect(fixture.requestInits[tokenIndex]?.body).toBe(JSON.stringify({
      permissions: { actions: 'read', checks: 'read', contents: 'read', deployments: 'read', metadata: 'read', pages: 'read' },
      repositories: ['Warpkeep'],
    }))
    const tokenHeaders = new Headers(fixture.requestInits[tokenIndex]?.headers)
    expect(tokenHeaders.get('accept')).toBe('application/vnd.github+json')
    expect(tokenHeaders.get('content-type')).toBe('application/json')
    expect(tokenHeaders.get('x-github-api-version')).toBe('2022-11-28')
    expect(tokenHeaders.get('authorization')).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
  })

  it('returns the frozen exact static realm binding without candidate coordinates or source paths', async () => {
    const fixture = await makeFixture()
    const evidence = await loadGitHubCandidateEvidence(fixture.input)
    const core = fixture.input.armed.recoveryAuthorizationCoreSha256

    expect(RECOVERY_REALM_BINDING_PROJECTION_KEYS).toEqual(EXPECTED_REALM_BINDING_PROJECTION_KEYS)
    expect(REALM_BINDING_MUTATIONS.map(([key]) => key)).toEqual(EXPECTED_REALM_BINDING_PROJECTION_KEYS)
    expect(Object.isFrozen(RECOVERY_REALM_BINDING_PROJECTION_KEYS)).toBe(true)
    expect(Object.keys(evidence.realmBinding)).toEqual(EXPECTED_REALM_BINDING_PROJECTION_KEYS)
    expect(evidence.realmBinding).toEqual(expectedRealmBinding(core))
    expect(Object.getPrototypeOf(evidence.realmBinding)).toBe(Object.prototype)
    expect(Object.isFrozen(evidence.realmBinding)).toBe(true)
    expect(Object.keys(evidence.realmBinding)).not.toEqual(expect.arrayContaining([
      'candidateCommit', 'candidateTree', 'currentMainCommit', 'parentCommit',
      'bindingPath', 'workflowPath',
    ]))
    expect(fixture.input.armed.bindingPath).toBe(BINDING_PATH)
    expect(fixture.input.armed.workflowPath).toBe(WORKFLOW_PATH)
  })

  it('extends the exact schema-2 key order without a G002 release digest alias', () => {
    const bridgeIndex = RECOVERY_BINDING_KEYS_V2.indexOf('recoveryAuthWorker')
    expect(RECOVERY_BINDING_KEYS_V2.slice(bridgeIndex, bridgeIndex + 6)).toEqual([
      'recoveryAuthWorker', 'recoveryAuthWorkerVersion',
      'recoveryAuthWorkerVersionId', 'recoveryAuthWorkerSourceCommit',
      'recoveryAuthWorkerConfigIdentity', 'recoveryAuthWorkerConfigEpoch',
    ])
    const g001DatabaseIndex = RECOVERY_BINDING_KEYS_V2.indexOf('g001DatabaseIdentity')
    expect(RECOVERY_BINDING_KEYS_V2.slice(g001DatabaseIndex, g001DatabaseIndex + 2)).toEqual([
      'g001DatabaseIdentity', 'g001ExpectedProgramKeccak256',
    ])
    const g002DatabaseIndex = RECOVERY_BINDING_KEYS_V2.indexOf('g002DatabaseIdentity')
    expect(RECOVERY_BINDING_KEYS_V2.slice(g002DatabaseIndex, g002DatabaseIndex + 2)).toEqual([
      'g002DatabaseIdentity', 'g002ExpectedProgramKeccak256',
    ])
    const g002AtlasIndex = RECOVERY_BINDING_KEYS_V2.indexOf('g002AtlasSourceCommit')
    expect(RECOVERY_BINDING_KEYS_V2.slice(g002AtlasIndex, g002AtlasIndex + 8)).toEqual([
      'g002AtlasSourceCommit', 'g002AtlasId', 'g002PublicReleaseId',
      'g002PublicApprovalReceiptId', 'g002ReleaseSha256',
      'g002ReleaseHeaderSha256', 'g002VerificationDigest', 'g002AllowedFids',
    ])
    const ptrDatabaseIndex = RECOVERY_BINDING_KEYS_V2.indexOf('ptrDatabaseIdentity')
    expect(RECOVERY_BINDING_KEYS_V2.slice(ptrDatabaseIndex, ptrDatabaseIndex + 2)).toEqual([
      'ptrDatabaseIdentity', 'ptrExpectedProgramKeccak256',
    ])
    const ptrAtlasIndex = RECOVERY_BINDING_KEYS_V2.indexOf('ptrAtlasSourceCommit')
    expect(RECOVERY_BINDING_KEYS_V2.slice(ptrAtlasIndex, ptrAtlasIndex + 9)).toEqual([
      'ptrAtlasSourceCommit', 'ptrAtlasId', 'ptrPublicReleaseId',
      'ptrPublicApprovalReceiptId', 'ptrReleaseVersion',
      'ptrReleaseManifestSha256', 'ptrExpectedReleaseSha256',
      'ptrReleaseHeaderSha256', 'ptrVerificationDigest',
    ])
    expect(RECOVERY_BINDING_KEYS_V2.filter(key => key === 'g002ReleaseSha256')).toHaveLength(1)
    expect(RECOVERY_BINDING_KEYS_V2).not.toContain('g002ExpectedReleaseSha256')
    expect(new Set(RECOVERY_BINDING_KEYS_V2).size).toBe(RECOVERY_BINDING_KEYS_V2.length)
  })

  it.each(REALM_BINDING_MUTATIONS)(
    'rejects an armed mismatch for realm projection field %s',
    async (key, value) => rejects(({ input }) => {
      ;(input.armed as unknown as JsonObject)[key] = value
    }),
  )

  it('rejects duplicate G002 release aliases in protected and armed inputs', async () => {
    await rejects(fixture => replaceBinding(fixture, binding => {
      binding.g002ExpectedReleaseSha256 = binding.g002ReleaseSha256
    }))
    await rejects(({ input }) => {
      ;(input.armed as unknown as JsonObject).g002ExpectedReleaseSha256 = G002_RELEASE_SHA256
    })
  })

  it('rejects malformed and oversized PKCS#1 app keys with a stable evidence error', async () => {
    const fixture = await makeFixture()
    for (const pem of [
      '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----',
      `-----BEGIN RSA PRIVATE KEY-----\n${'A'.repeat(32_769)}\n-----END RSA PRIVATE KEY-----`,
      `${privateKeyPem}-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----`,
    ]) {
      await expect(mintGitHubInstallationToken({ ...fixture.input.environment, GITHUB_APP_PRIVATE_KEY_PEM: pem }, fixture.input.fetch, 1_788_200_000))
        .rejects.toThrowError('RECOVERY_GITHUB_EVIDENCE_INVALID')
    }
  })

  it.each([
    ['stale main', (state: State) => { (state.branch.commit as JsonObject).sha = PREPARATION }],
    ['unprotected main', (state: State) => { state.branch.protected = false }],
    ['candidate merge', (state: State) => { (state.candidateCommit.parents as JsonObject[]).push({ sha: PREPARATION_PARENT }) }],
    ['wrong candidate parent', (state: State) => { (state.candidateCommit.parents as JsonObject[])[0]!.sha = PREPARATION_PARENT }],
    ['wrong candidate tree', (state: State) => { (state.candidateCommit.tree as JsonObject).sha = PREPARATION_TREE }],
    ['wrong preparation tree', (state: State) => { (state.preparationCommit.tree as JsonObject).sha = CANDIDATE_TREE }],
  ])('rejects %s', async (_name, mutate) => rejects(({ state }) => mutate(state)))

  it.each([
    ['an added path', (state: State) => state.candidateTree.push({ ...state.candidateTree[2]!, path: 'extra.txt' })],
    ['a deleted path', (state: State) => state.candidateTree.splice(2, 1)],
    ['a missing required delta', (state: State) => { state.candidateTree.find(value => value.path === 'package.json')!.sha = state.preparationTree.find(value => value.path === 'package.json')!.sha }],
    ['an added binding', (state: State) => { state.preparationTree.splice(state.preparationTree.findIndex(value => value.path === BINDING_PATH), 1) }],
    ['a changed mode', (state: State) => { state.candidateTree.find(value => value.path === 'package.json')!.mode = '100755' }],
    ['a changed type', (state: State) => { state.candidateTree.find(value => value.path === 'package.json')!.type = 'tree' }],
    ['a changed workflow blob', (state: State) => { state.preparationTree.find(value => value.path === WORKFLOW_PATH)!.sha = 'f'.repeat(40) }],
  ])('rejects activation delta with %s', async (_name, mutate) => rejects(({ state }) => mutate(state)))

  it('permits recursive ancestor tree SHA changes but rejects unrelated tree SHA changes', async () => {
    await expect(loadGitHubCandidateEvidence((await makeFixture()).input)).resolves.toBeDefined()
    await rejects(({ state }) => {
      state.candidateTree.find(value => value.path === '.github')!.sha = '9'.repeat(40)
    })
  })

  it('accepts package manifests whose only activation change is the pinned version transform', async () => {
    const fixture = await makeFixture()
    await expect(loadGitHubCandidateEvidence(fixture.input)).resolves.toBeDefined()
  })

  it.each(['candidate', 'preparation'] as const)('rejects a %s package tree size inconsistent with verified blob bytes', async side => {
    await rejects(({ state }) => {
      const tree = side === 'candidate' ? state.candidateTree : state.preparationTree
      tree.find(value => value.path === 'package.json')!.size! += 1
    })
  })

  it.each([
    ['scripts', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageJson(fixture, 'candidate', value => {
      ;(value.scripts as JsonObject).build = 'node attacker.js'
    })],
    ['dependencies', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageJson(fixture, 'candidate', value => {
      ;(value.dependencies as JsonObject).vite = '9.0.0'
    })],
    ['unrelated metadata', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageJson(fixture, 'candidate', value => {
      value.description = 'changed'
    })],
    ['package name', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageJson(fixture, 'candidate', value => {
      value.name = 'attacker'
    })],
    ['old version', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageJson(fixture, 'preparation', value => {
      value.version = '0.3.42'
    })],
    ['new version', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageJson(fixture, 'candidate', value => {
      value.version = '0.4.1'
    })],
  ])('rejects package.json activation with changed %s', async (_name, mutate) => rejects(mutate))

  it.each([
    ['resolved URL', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      ;((value.packages as JsonObject)['node_modules/vite'] as JsonObject).resolved = 'https://attacker.invalid/vite.tgz'
    })],
    ['integrity', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      ;((value.packages as JsonObject)['node_modules/vite'] as JsonObject).integrity = 'sha512-changed'
    })],
    ['dependency content', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      ;(((value.packages as JsonObject)[''] as JsonObject).dependencies as JsonObject).vite = '9.0.0'
    })],
    ['only top-level version', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      value.version = '0.3.43'
    })],
    ['only root-package version', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      ;((value.packages as JsonObject)[''] as JsonObject).version = '0.3.43'
    })],
    ['old versions', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'preparation', value => {
      value.version = '0.3.42'; ((value.packages as JsonObject)[''] as JsonObject).version = '0.3.42'
    })],
    ['new versions', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      value.version = '0.4.1'; ((value.packages as JsonObject)[''] as JsonObject).version = '0.4.1'
    })],
    ['top-level name', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      value.name = 'attacker'
    })],
    ['root-package name', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      ;((value.packages as JsonObject)[''] as JsonObject).name = 'attacker'
    })],
    ['lockfile version', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      value.lockfileVersion = 2
    })],
    ['root shape', async (fixture: Awaited<ReturnType<typeof makeFixture>>) => mutatePackageLock(fixture, 'candidate', value => {
      delete value.packages
    })],
  ])('rejects package-lock.json activation with changed %s', async (_name, mutate) => rejects(mutate))

  it.each([
    ['24 KiB chunk edge with no padding', BASE64_CHUNK_BYTES],
    ['24 KiB chunk edge with two padding bytes', BASE64_CHUNK_BYTES + 1],
    ['24 KiB chunk edge with one padding byte', BASE64_CHUNK_BYTES + 2],
  ] as const)('loads a canonical package lock at the %s', async (_name, preparationByteLength) => {
    const fixture = await makeFixture()
    await installPackageLockSize(fixture, preparationByteLength)
    await expect(loadGitHubCandidateEvidence(fixture.input)).resolves.toBeDefined()
  })

  it.each([
    ['captured real package-lock size', 171_699],
    ['exact decoded blob limit', 1024 * 1024],
  ] as const)('loads a canonical version-only package lock at the %s', async (_name, preparationByteLength) => {
    const fixture = await makeFixture()
    await installPackageLockSize(fixture, preparationByteLength)
    await expect(loadGitHubCandidateEvidence(fixture.input)).resolves.toBeDefined()
  })

  it('rejects a package lock one byte beyond the decoded blob limit with a stable error', async () => {
    const fixture = await makeFixture()
    await installPackageLockSize(fixture, 1024 * 1024 + 1)
    await expect(loadGitHubCandidateEvidence(fixture.input))
      .rejects.toThrowError('RECOVERY_GITHUB_EVIDENCE_INVALID')
  })

  it.each(['package.json', 'package-lock.json'] as const)('rejects noncanonical and duplicate %s JSON', async path => {
    await rejects(async fixture => {
      const bytes = path === 'package.json' ? fixture.state.candidatePackageBytes : fixture.state.candidateLockBytes
      await replacePackageBlob(fixture, path, 'candidate', encoder.encode(`${JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)))}\n`))
    })
    await rejects(async fixture => {
      const bytes = path === 'package.json' ? fixture.state.candidatePackageBytes : fixture.state.candidateLockBytes
      const source = new TextDecoder().decode(bytes)
      const duplicate = path === 'package.json'
        ? source.replace('{\n', '{\n  "version": "0.4.0",\n')
        : source.replace('{\n', '{\n  "lockfileVersion": 3,\n')
      await replacePackageBlob(fixture, path, 'candidate', encoder.encode(duplicate))
    })
  })

  it('accepts a bounded realistic 2,419-entry recursive tree response over the generic JSON cap', async () => {
    const fixture = await makeFixture()
    const needed = 2_419 - fixture.state.candidateTree.length
    for (let index = 0; index < needed; index += 1) {
      const path = `dist/assets/generated-${index.toString().padStart(4, '0')}-${'x'.repeat(96)}.js`
      const entry = {
        path, mode: '100644', type: 'blob', sha: '9'.repeat(40), size: 12,
        url: `${API}/git/blobs/${'9'.repeat(40)}`,
      }
      fixture.state.candidateTree.push(entry)
      fixture.state.preparationTree.push({ ...entry })
    }
    await expect(loadGitHubCandidateEvidence(fixture.input)).resolves.toBeDefined()
  })

  it.each([
    ['wrong returned blob sha', (state: State) => { state.blobShaOverride = 'f'.repeat(40) }],
    ['noncanonical base64', (state: State) => { state.blobContentOverride = 'AA\n' }],
    ['wrong encoding', (state: State) => { state.blobEncodingOverride = 'utf-8' }],
    ['changed second body', (state: State) => { state.blobSecondContentOverride = 'AAAA\n' }],
    ['changed second ETag', (state: State) => { state.blobSecondEtag = '"changed"' }],
  ])('rejects blob evidence with %s', async (_name, mutate) => rejects(({ state }) => mutate(state)))

  it('accepts an immutable captured 60-column LF GitHub blob independently of the wrapping helper', async () => {
    const fixture = await makeFixture()
    expect(githubBlobBase64(fixture.state.candidatePackageBytes)).toBe(CAPTURED_GITHUB_PACKAGE_BLOB_CONTENT)
    const bindingWire = githubBlobBase64(fixture.state.bindingBytes)
    const workflowWire = githubBlobBase64(fixture.state.workflowBytes)
    expect(bindingWire.slice(0, 122)).toMatch(/^[A-Za-z0-9+/]{60}\n[A-Za-z0-9+/]{60}\n/u)
    expect(workflowWire.slice(0, 122)).toMatch(/^[A-Za-z0-9+/]{60}\n[A-Za-z0-9+/]{60}\n/u)
    await expect(loadGitHubCandidateEvidence(fixture.input)).resolves.toMatchObject({
      recoveryBindingBytes: fixture.state.bindingBytes,
      protectedWorkflowBytes: fixture.state.workflowBytes,
    })
  })

  it.each([
    ['CRLF', (wire: string) => wire.replace('\n', '\r\n')],
    ['space', (wire: string) => `${wire.slice(0, 10)} ${wire.slice(11)}`],
    ['blank line', (wire: string) => wire.replace('\n', '\n\n')],
    ['irregular nonfinal width', (wire: string) => `${wire.replace(/\n/gu, '').slice(0, 59)}\n${wire.replace(/\n/gu, '').slice(59)}\n`],
    ['missing final LF', (wire: string) => wire.slice(0, -1)],
    ['extra final LF', (wire: string) => `${wire}\n`],
    ['misplaced LF', (wire: string) => `${wire.slice(0, 30)}\n${wire.slice(30)}`],
    ['noncanonical padding', (_wire: string) => 'AB==\n'],
  ])('rejects GitHub blob content with %s', async (_name, mutate) => {
    await rejects(fixture => {
      fixture.state.blobContentOverride = mutate(githubBlobBase64(fixture.state.bindingBytes))
    })
  })

  it.each([
    ['schemaVersion', 1],
    ['profile', 'wrong'],
    ['authorizationMode', 'wrong'],
    ['recoveryAuthorizationRequestId', '123e4567-e89b-42d3-a456-426614174099'],
    ['recoveryAuthorizationCoreSha256', 'f'.repeat(64)],
    ['recoveryKeyId', 'wrong'],
    ['recoveryKeyThumbprint', 'wrong'],
    ['recoveryAuthorizationEpoch', 0],
    ['recoveryRepository', 'fork/Warpkeep'],
    ['recoveryRepositoryId', '9007199254740993'],
    ['recoveryRepositoryOwnerId', '9007199254740993'],
    ['recoveryRef', 'refs/heads/other'],
    ['recoveryWorkflowRef', 'wrong'],
    ['recoveryEnvironment', 'other'],
    ['recoveryReleaseVersion', '0.4.1'],
    ['recoveryOperation', 'wrong'],
    ['recoveryCanonicalOrigin', 'https://example.test'],
    ['recoveryIssuer', 'https://example.test'],
    ['recoveryAuthWorker', 'other'],
    ['sourceClosureProfile', 'wrong'],
    ['sourceClosureSha256', 'f'.repeat(64)],
    ['pagesDeploymentApproved', false],
    ['preparationSourceCommit', PREPARATION_PARENT],
    ['preparationSourceTree', CANDIDATE_TREE],
    ['g001DatabaseIdentity', G002],
    ['g002DatabaseIdentity', PTR],
    ['ptrDatabaseIdentity', G002],
    ['g001FreezePublishReceiptDigest', 'f'.repeat(64)],
    ['g001FreezePublishReceiptCommitment', 'f'.repeat(64)],
    ['g002PublishReceiptDigest', 'f'.repeat(64)],
    ['g002PublishReceiptCommitment', 'f'.repeat(64)],
  ])('rejects mutated schema-2 binding field %s', async (key, value) => rejects(fixture => replaceBinding(fixture, binding => { binding[key] = value })))

  it('rejects missing, extra, reordered, and duplicate schema-2 binding keys', async () => {
    await rejects(fixture => replaceBinding(fixture, binding => { delete binding.profile }))
    await rejects(fixture => replaceBinding(fixture, binding => { binding.extra = null }))
    await rejects(fixture => replaceBinding(fixture, binding => {
      const profile = binding.profile
      delete binding.profile
      binding.profile = profile
    }))
    await rejects(async fixture => {
      const source = new TextDecoder().decode(fixture.state.bindingBytes)
      fixture.state.bindingBytes = encoder.encode(source.replace('{\n', '{\n  "schemaVersion": 2,\n'))
      const entry = fixture.state.candidateTree.find(value => value.path === BINDING_PATH)!
      entry.sha = await blobSha(fixture.state.bindingBytes)
      entry.size = fixture.state.bindingBytes.length
    })
  })

  it.each([
    ['requestId', '123e4567-e89b-42d3-a456-426614174099'],
    ['bindingPath', 'config/releases/other.json'],
    ['workflowPath', '.github/workflows/other.yml'],
    ['sourceClosureSha256', 'f'.repeat(64)],
    ['recoveryAuthorizationCoreSha256', 'f'.repeat(64)],
    ['genesis002Database', '9'.repeat(64)],
    ['ptrDatabase', '9'.repeat(64)],
  ])('rejects mutated signer-armed %s', async (key, value) => rejects(({ input }) => {
    ;(input.armed as unknown as JsonObject)[key] = value
  }))

  it('rejects a caller request ID that differs from signer-armed state', async () => rejects(({ input }) => {
    ;(input as unknown as JsonObject).bindingRequestId = '123e4567-e89b-42d3-a456-426614174099'
  }))

  it.each([
    ['workflow name', (source: string) => source.replace('Deploy GitHub Pages', 'Other')],
    ['recovery job', (source: string) => source.replace('deploy-recovery:', 'deploy:')],
    ['artifact convention', (source: string) => source.replace('github-pages-recovery-', 'pages-')],
    ['OIDC audience', (source: string) => source.replace('warpkeep-release-recovery', 'attacker-audience')],
    ['OIDC request URL', (source: string) => source.replace('ACTIONS_ID_TOKEN_REQUEST_URL', 'ATTACKER_URL')],
    ['artifact action input', (source: string) => source.replace('name: github-pages-recovery-', 'artifact-name: github-pages-recovery-')],
    ['display-name-only spoof', (source: string) => source.replace('uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9', 'run: echo upload-pages-artifact')],
    ['wrong pinned artifact action', (source: string) => source.replace('fc324d3547104276b827a68afc52ff2a11cc49c9', '0000000000000000000000000000000000000000')],
  ])('rejects a changed protected %s', async (_name, mutate) => rejects(async ({ state }) => {
    state.workflowBytes = encoder.encode(mutate(new TextDecoder().decode(state.workflowBytes)))
    const sha = await blobSha(state.workflowBytes)
    for (const tree of [state.candidateTree, state.preparationTree]) {
      const entry = tree.find(value => value.path === WORKFLOW_PATH)!
      entry.sha = sha
      entry.size = state.workflowBytes.length
    }
  }))

  it.each([
    ['id', PAGES_RUN_ID], ['run_attempt', 2], ['name', 'Other'],
    ['path', '.github/workflows/other.yml@main'], ['path', '.github/workflows/verify.yml@release'],
    ['workflow_id', 18], ['workflow_url', `${API}/actions/workflows/18`], ['event', 'workflow_dispatch'],
    ['status', 'in_progress'], ['conclusion', 'failure'], ['head_branch', 'other'],
    ['head_sha', PREPARATION],
  ])('rejects wrong source Verify %s', async (key, value) => rejects(({ state }) => { state.source[key] = value }))

  it('accepts the exact bare source Verify workflow path returned by GitHub', async () => {
    const fixture = await makeFixture()
    fixture.state.source.path = '.github/workflows/verify.yml'
    await expect(loadGitHubCandidateEvidence(fixture.input)).resolves.toBeDefined()
  })

  it('rejects wrong source Verify repository, owner, and head repository IDs', async () => {
    await rejects(({ state }) => { (state.source.repository as JsonObject).id = 1 })
    await rejects(({ state }) => { ((state.source.repository as JsonObject).owner as JsonObject).id = 1 })
    await rejects(({ state }) => { (state.source.head_repository as JsonObject).id = 1 })
  })

  it('rejects zero, duplicate, or paginated exact-name artifacts', async () => {
    await rejects(({ state }) => { state.listTotal = 0; state.listedArtifacts = [] })
    await rejects(({ state }) => { state.listTotal = 2; state.listedArtifacts = [state.artifact, { ...state.artifact }] })
    await rejects(({ state }) => { state.listLink = `<${API}/actions/runs/41/artifacts?page=2>; rel="next"` })
  })

  it.each([
    ['id', 44112234], ['name', 'wrong'], ['expired', true],
    ['digest', `sha256:${'f'.repeat(64)}`], ['size_in_bytes', 0],
  ])('rejects wrong artifact %s', async (key, value) => rejects(({ state }) => {
    state.artifact[key] = value
    state.listedArtifacts = [state.artifact]
  }))

  it('rejects wrong artifact run/head/repository identity and stale metadata', async () => {
    await rejects(({ state }) => { (state.artifact.workflow_run as JsonObject).id = SOURCE_RUN_ID })
    await rejects(({ state }) => { (state.artifact.workflow_run as JsonObject).repository_id = 1 })
    await rejects(({ state }) => { (state.artifact.workflow_run as JsonObject).head_repository_id = 1 })
    await rejects(({ state }) => { (state.artifact.workflow_run as JsonObject).head_branch = 'other' })
    await rejects(({ state }) => { (state.artifact.workflow_run as JsonObject).head_sha = PREPARATION })
    await rejects(({ state }) => { state.artifact.expires_at = '2020-01-01T00:00:00Z' })
  })

  it('rejects changed artifact metadata body or ETag', async () => {
    await rejects(({ state }) => { state.artifactSecond = { ...state.artifact, node_id: 'changed' } })
    await rejects(({ state }) => { state.artifactSecondEtag = '"changed"' })
  })

  it('rejects an archive response length that differs from authenticated artifact metadata', async () => {
    await rejects(({ state }) => { state.archiveLengthOverride = String(state.archive.length + 1) })
  })

  it.each(['headers accessor', 'headers.get', 'body.getReader', 'length mismatch', 'cancel rejection', 'cancel throw'] as const)(
    'cancels the exact archive body once on %s and selects the evidence error',
    async mode => {
      const fixture = await makeFixture()
      let cancellations = 0
      fixture.state.archiveResponse = () => {
        const body = mode === 'cancel throw' || mode === 'body.getReader'
          ? ({
              cancel() {
                cancellations += 1
                if (mode === 'cancel throw') throw new Error('secret cancel')
              },
              getReader() { throw new Error('must not acquire reader') },
            } as unknown as ReadableStream<Uint8Array>)
          : new ReadableStream<Uint8Array>({
              cancel() {
                cancellations += 1
                if (mode === 'cancel rejection') return Promise.reject(new Error('secret cancel'))
              },
            })
        const response = withUrl('https://objects.githubusercontent.com/recovery.zip', new Response(null, {
          headers: {
            'content-length': mode === 'length mismatch' || mode.startsWith('cancel')
              ? String(fixture.state.archive.length + 1)
              : String(fixture.state.archive.length),
            'content-type': 'application/zip',
          },
        }))
        Object.defineProperty(response, 'body', { value: body })
        if (mode === 'headers accessor') {
          Object.defineProperty(response, 'headers', { get() { throw new Error('secret headers') } })
        } else if (mode === 'headers.get') {
          Object.defineProperty(response, 'headers', { value: { get() { throw new Error('secret get') } } })
        }
        return response
      }
      await expect(loadGitHubCandidateEvidence(fixture.input)).rejects.toThrowError('RECOVERY_GITHUB_EVIDENCE_INVALID')
      expect(cancellations).toBe(1)
    },
  )

  it('maps a throwing archive body accessor to the stable evidence error', async () => {
    const fixture = await makeFixture()
    fixture.state.archiveResponse = () => {
      const response = withUrl('https://objects.githubusercontent.com/recovery.zip', new Response(null, {
        headers: { 'content-length': String(fixture.state.archive.length), 'content-type': 'application/zip' },
      }))
      Object.defineProperty(response, 'body', { get() { throw new Error('secret body') } })
      return response
    }
    await expect(loadGitHubCandidateEvidence(fixture.input)).rejects.toThrowError('RECOVERY_GITHUB_EVIDENCE_INVALID')
  })

  it('rejects accessor and hostile Proxy caller input before fetching', async () => {
    const fixture = await makeFixture()
    let fetched = false
    const accessor = { ...fixture.input } as Record<string, unknown>
    Object.defineProperty(accessor, 'artifactId', { enumerable: true, get: () => String(ARTIFACT_ID) })
    accessor.fetch = (async () => { fetched = true; throw new Error('no') }) as typeof fetch
    await expect(loadGitHubCandidateEvidence(accessor as never)).rejects.toThrowError('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const hostile = new Proxy(fixture.input, { getPrototypeOf: () => { throw new Error('hostile') } })
    await expect(loadGitHubCandidateEvidence(hostile)).rejects.toThrowError('RECOVERY_GITHUB_EVIDENCE_INVALID')
    expect(fetched).toBe(false)
  })

  it('rechecks only stored metadata without downloading blobs, trees, or archive', async () => {
    const fixture = await makeFixture()
    const evidence: GitHubCandidateEvidence = await loadGitHubCandidateEvidence(fixture.input)
    fixture.calls.splice(0)
    fixture.state.forbidArchive = true
    await recheckGitHubEvidenceMetadata({
      githubMetadata: evidence.githubMetadata,
      githubMetadataSha256: evidence.githubMetadataSha256,
      environment: fixture.input.environment,
      fetch: fixture.input.fetch,
    })
    expect(fixture.calls.some(url => /\/zip|\/git\/blobs|\/git\/trees|\/actions\/runs/u.test(url))).toBe(false)
  })

  it('rejects stored metadata tampering and authenticated metadata drift', async () => {
    const fixture = await makeFixture()
    const evidence = await loadGitHubCandidateEvidence(fixture.input)
    await expect(recheckGitHubEvidenceMetadata({
      githubMetadata: { ...evidence.githubMetadata, artifactSize: evidence.githubMetadata.artifactSize + 1 },
      githubMetadataSha256: evidence.githubMetadataSha256,
      environment: fixture.input.environment,
      fetch: fixture.input.fetch,
    })).rejects.toThrowError('RECOVERY_GITHUB_EVIDENCE_INVALID')
    fixture.state.artifact = { ...fixture.state.artifact, node_id: 'drifted' }
    fixture.state.artifactSecond = fixture.state.artifact
    await expect(recheckGitHubEvidenceMetadata({
      githubMetadata: evidence.githubMetadata,
      githubMetadataSha256: evidence.githubMetadataSha256,
      environment: fixture.input.environment,
      fetch: fixture.input.fetch,
    })).rejects.toThrowError('RECOVERY_GITHUB_EVIDENCE_INVALID')
  })
})
