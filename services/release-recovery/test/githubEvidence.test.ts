import { beforeAll, describe, expect, it } from 'vitest'
import {
  RECOVERY_BINDING_KEYS_V2,
  RECOVERY_RECEIPT_COMMITMENT_DIGESTS,
  loadGitHubCandidateEvidence,
  recheckGitHubEvidenceMetadata,
  type GitHubCandidateEvidence,
} from '../src/githubEvidence.js'
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
const G002 = '7'.repeat(64)
const PTR = '8'.repeat(64)
const CLOSURE = '6'.repeat(64)
const encoder = new TextEncoder()

let privateKeyPem = ''

type TreeEntry = { path: string; mode: string; type: string; sha: string; size?: number; url: string }
type JsonObject = Record<string, unknown>

type State = {
  repository: JsonObject
  branch: JsonObject
  candidateCommit: JsonObject
  preparationCommit: JsonObject
  candidateTree: TreeEntry[]
  preparationTree: TreeEntry[]
  bindingBytes: Uint8Array
  workflowBytes: Uint8Array
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
  return btoa(String.fromCharCode(...bytes))
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
  centralView.setUint16(4, 0x0314, true)
  centralView.setUint16(6, 10, true)
  centralView.setUint16(12, 0x1234, true)
  centralView.setUint16(14, 0x5678, true)
  centralView.setUint32(16, crc, true)
  centralView.setUint32(20, body.length, true)
  centralView.setUint32(24, body.length, true)
  centralView.setUint16(28, name.length, true)
  centralView.setUint32(38, 0x81a40000, true)
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
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: CLOSURE,
    pagesDeploymentApproved: true,
    preparationSourceCommit: PREPARATION,
    preparationSourceTree: PREPARATION_TREE,
    g001DatabaseIdentity: G001,
    g002DatabaseIdentity: G002,
    ptrDatabaseIdentity: PTR,
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
      - name: Upload exact recovery artifact
        with:
          name: github-pages-recovery-\${{ github.run_id }}-\${{ github.run_attempt }}
`)
}

async function makeFixture(): Promise<Readonly<{
  state: State
  input: Parameters<typeof loadGitHubCandidateEvidence>[0]
  calls: string[]
}>> {
  const binding = await validBinding()
  const workflow = workflowBytes()
  const packageBytes = encoder.encode('{"version":"0.4.0"}\n')
  const oldPackageBytes = encoder.encode('{"version":"0.3.43"}\n')
  const lockBytes = encoder.encode('{"version":"0.4.0","lockfileVersion":3}\n')
  const oldLockBytes = encoder.encode('{"version":"0.3.43","lockfileVersion":3}\n')
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
    entry('.github/workflows/deploy-pages.yml', workflowSha, workflow.length),
    entry(BINDING_PATH, bindingSha, binding.bytes.length),
    entry('README.md', readmeSha, readmeBytes.length),
    entry('package-lock.json', lockSha, lockBytes.length),
    entry('package.json', packageSha, packageBytes.length),
  ]
  const preparationTree = [
    entry('.github/workflows/deploy-pages.yml', workflowSha, workflow.length),
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
    source: {
      id: SOURCE_RUN_ID, run_attempt: 1, name: 'Verify', path: '.github/workflows/verify.yml',
      event: 'push', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: CANDIDATE,
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
  const fetchImplementation = (async (request: string | URL | Request) => {
    const url = String(request)
    calls.push(url)
    if (url.includes('/access_tokens')) {
      return jsonResponse(url, {
        expires_at: new Date(Math.floor(Date.now() / 1000) * 1000 + 3_000_000).toISOString(),
        permissions: { actions: 'read', checks: 'read', contents: 'read', deployments: 'read', metadata: 'read', pages: 'read' },
        repositories: [{ full_name: REPOSITORY, id: REPOSITORY_ID }],
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
      let bytes: Uint8Array
      if (sha === bindingEntry?.sha) bytes = state.bindingBytes
      else if (sha === workflowEntry?.sha) bytes = state.workflowBytes
      else throw new Error(`unexpected blob ${sha}`)
      const content = count === 2 && state.blobSecondContentOverride !== undefined
        ? state.blobSecondContentOverride
        : state.blobContentOverride ?? base64(bytes)
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
      return withUrl(url, new Response(null, { status: 302, headers: { location: 'https://artifact-cdn.example.test/recovery.zip' } }))
    }
    if (url === 'https://artifact-cdn.example.test/recovery.zip') {
      if (state.forbidArchive) throw new Error('archive download forbidden')
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
      requestId: REQUEST_ID,
      authorizationMode: 'recovery-authorization-v1',
      recoveryAuthorizationProfile: 'warpkeep-0.4.0-recovery-authorization-v1',
      recoveryKeyId: RECOVERY_KEY_ID,
      recoveryKeyThumbprint: RECOVERY_KEY_THUMBPRINT,
      authorizationEpoch: 3,
      repository: REPOSITORY,
      repositoryId: String(REPOSITORY_ID),
      repositoryOwnerId: String(OWNER_ID),
      ref: 'refs/heads/main',
      workflowRef: `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`,
      environment: 'github-pages',
      releaseVersion: '0.4.0',
      operation: 'github-pages-production-deploy',
      canonicalOrigin: 'https://warpkeep.com',
      issuer: 'https://release-auth.warpkeep.com',
      authWorker: 'warpkeep-auth-bridge',
      preparationCommit: PREPARATION,
      preparationTree: PREPARATION_TREE,
      sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
      sourceClosureSha256: CLOSURE,
      recoveryAuthorizationCoreSha256: binding.core,
      bindingPath: BINDING_PATH,
      workflowPath: WORKFLOW_PATH,
      genesis001Database: G001,
      genesis002Database: G002,
      ptrDatabase: PTR,
    },
    environment: { GITHUB_APP_ID: '1', GITHUB_APP_INSTALLATION_ID: '2', GITHUB_APP_PRIVATE_KEY_PEM: privateKeyPem },
    fetch: fetchImplementation,
  }
  return { state, input, calls }
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
    const body = btoa(String.fromCharCode(...bytes)).match(/.{1,64}/gu)?.join('\n') ?? ''
    privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
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

  it.each([
    ['wrong returned blob sha', (state: State) => { state.blobShaOverride = 'f'.repeat(40) }],
    ['noncanonical base64', (state: State) => { state.blobContentOverride = 'AA' }],
    ['wrong encoding', (state: State) => { state.blobEncodingOverride = 'utf-8' }],
    ['changed second body', (state: State) => { state.blobSecondContentOverride = 'AAAA' }],
    ['changed second ETag', (state: State) => { state.blobSecondEtag = '"changed"' }],
  ])('rejects blob evidence with %s', async (_name, mutate) => rejects(({ state }) => mutate(state)))

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
    ['path', '.github/workflows/other.yml'], ['event', 'workflow_dispatch'],
    ['status', 'in_progress'], ['conclusion', 'failure'], ['head_branch', 'other'],
    ['head_sha', PREPARATION],
  ])('rejects wrong source Verify %s', async (key, value) => rejects(({ state }) => { state.source[key] = value }))

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
