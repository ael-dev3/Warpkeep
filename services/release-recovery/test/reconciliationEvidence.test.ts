import { readFile } from 'node:fs/promises'

import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GitHubAppEnvironment } from '../src/config.js'
import { githubEvidenceMetadataSha256, type GitHubEvidenceMetadata } from '../src/githubEvidenceMetadata.js'
import type { LedgerSignerClaimProjection } from '../src/ledgerV2.js'
import { createDeploymentReconciliationProofReader } from '../src/reconciliationEvidence.js'

const API = 'https://api.github.com/repos/ael-dev3/Warpkeep'
const INSTALLATION_URL = 'https://api.github.com/app/installations/23/access_tokens'
const PUBLIC_ATTESTATION_URL = 'https://warpkeep.com/.well-known/warpkeep-deployment-v1.json'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const AUTHORIZATION_JTI = '123e4567-e89b-42d3-a456-426614174001'
const CANDIDATE = 'a'.repeat(40)
const CANDIDATE_TREE = 'b'.repeat(40)
const PREPARATION_COMMIT = 'c'.repeat(40)
const PREPARATION_TREE = 'd'.repeat(40)
const ARCHIVE_SHA256 = 'e'.repeat(64)
const RUN_ID = '41'
const RUN_ATTEMPT = '2'
const CHECK_RUN_ID = '91'
const ARTIFACT_ID = '73'
const DEPLOYMENT_ID = '501'
const DEPLOYMENT_STATUS_ID = '601'
const NOW = 1_788_400_000
const DEPLOY_STEP = 'Deploy recovery-authorized release to GitHub Pages'
const DEPLOY_ACTION = 'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128'
const DEPLOYMENTS_URL = `${API}/deployments?sha=${CANDIDATE}&environment=github-pages&per_page=100`
const DEPLOYMENT_STATUSES_URL = `${API}/deployments/${DEPLOYMENT_ID}/statuses?per_page=100`
const PAGES_STATUS_URL = `${API}/pages/deployments/${CANDIDATE}`
const TRANSPORT_TIMEOUT_MS = 10_000
const encoder = new TextEncoder()

let githubApp: GitHubAppEnvironment

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  githubApp = Object.freeze({
    GITHUB_APP_ID: '17',
    GITHUB_APP_INSTALLATION_ID: '23',
    GITHUB_APP_PRIVATE_KEY_PEM:
      `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----`,
  })
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW * 1_000)
})

afterEach(() => {
  vi.useRealTimers()
})

function rawSha256(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
}

function responseAt(
  requestedUrl: string,
  body: BodyInit | Uint8Array | null,
  init: ResponseInit = {},
  finalUrl = requestedUrl,
): Response {
  const responseBody = body instanceof Uint8Array ? Uint8Array.from(body).buffer : body
  const response = new Response(responseBody, init)
  Object.defineProperty(response, 'url', { value: finalUrl })
  return response
}

function jsonResponse(
  url: string,
  value: unknown,
  status = 200,
  etag = '"fixture-etag"',
  finalUrl = url,
): Response {
  return responseAt(url, JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(etag === '' ? {} : { etag }),
    },
  }, finalUrl)
}

function canonicalAttestation(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-deployment-attestation-v1',
    candidateCommit: CANDIDATE,
    candidateTree: CANDIDATE_TREE,
    recoveryAuthorizationCoreSha256: '1'.repeat(64),
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: '2'.repeat(64),
    releaseVersion: '0.4.0',
    canonicalOrigin: 'https://warpkeep.com',
    contentManifestSha256: '3'.repeat(64),
  }
}

function recoveryWorkflow(): string {
  return `name: Deploy GitHub Pages
on:
  workflow_run:
    workflows: [Verify]
    types: [completed]
concurrency:
  group: warpkeep-production-state
  cancel-in-progress: false
jobs:
  deploy-recovery:
    runs-on: [self-hosted, Linux, X64, warpkeep-production-admin, warpkeep-repository-exclusive]
    permissions:
      contents: read
      actions: read
      pages: write
      id-token: write
    environment:
      name: github-pages
    steps:
      - name: Upload exact recovery artifact
        uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9
        with:
          name: github-pages-recovery-\${{ github.run_id }}-\${{ github.run_attempt }}
      - name: Prepare private recovery claim
        id: recovery-claim
        shell: bash
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: |
          node scripts/recovery-workflow-prepare-claim.mjs
      - name: Check recovery deployment boundary
        id: recovery-boundary
        shell: bash
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: |
          node scripts/recovery-workflow-check-deployment.mjs
      - name: ${DEPLOY_STEP}
        id: recovery-deployment
        uses: ${DEPLOY_ACTION}
        with:
          artifact_name: github-pages-recovery-\${{ github.run_id }}-\${{ github.run_attempt }}
      - name: Verify recovery live postflight
        id: recovery-postflight
        if: \${{ always() && steps.recovery-claim.outcome == 'success' }}
        shell: bash
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: |
          node scripts/recovery-workflow-postflight.mjs
`
}

function repositoryResponse(): Record<string, unknown> {
  return {
    id: 1273513252,
    name: 'Warpkeep',
    full_name: 'ael-dev3/Warpkeep',
    default_branch: 'main',
    archived: false,
    disabled: false,
    owner: { id: 183124839, login: 'ael-dev3' },
  }
}

function branchResponse(): Record<string, unknown> {
  return { name: 'main', protected: true, commit: { sha: CANDIDATE } }
}

function commitResponse(): Record<string, unknown> {
  return {
    sha: CANDIDATE,
    tree: { sha: CANDIDATE_TREE },
    parents: [{ sha: PREPARATION_COMMIT }],
  }
}

function artifactResponse(): Record<string, unknown> {
  return {
    id: Number(ARTIFACT_ID),
    name: `github-pages-recovery-${RUN_ID}-${RUN_ATTEMPT}`,
    node_id: 'A_kwDOsynthetic',
    size_in_bytes: 1_234,
    url: `${API}/actions/artifacts/${ARTIFACT_ID}`,
    archive_download_url: `${API}/actions/artifacts/${ARTIFACT_ID}/zip`,
    expired: false,
    created_at: new Date((NOW - 3_600) * 1_000).toISOString(),
    expires_at: new Date((NOW + 86_400) * 1_000).toISOString(),
    updated_at: new Date((NOW - 3_500) * 1_000).toISOString(),
    digest: `sha256:${ARCHIVE_SHA256}`,
    workflow_run: {
      id: Number(RUN_ID),
      repository_id: 1273513252,
      head_repository_id: 1273513252,
      head_branch: 'main',
      head_sha: CANDIDATE,
    },
  }
}

function githubBlobBase64(bytes: Uint8Array): string {
  const encoded = Buffer.from(bytes).toString('base64')
  return `${encoded.match(/.{1,60}/gu)!.join('\n')}\n`
}

async function workflowContentsResponse(workflow: string): Promise<Record<string, unknown>> {
  const bytes = encoder.encode(workflow)
  const prefix = encoder.encode(`blob ${bytes.byteLength}\0`)
  const blobInput = new Uint8Array(prefix.byteLength + bytes.byteLength)
  blobInput.set(prefix)
  blobInput.set(bytes, prefix.byteLength)
  const blob = [...new Uint8Array(await crypto.subtle.digest('SHA-1', blobInput))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
  const url = `${API}/contents/.github/workflows/deploy-pages.yml?ref=${CANDIDATE}`
  return {
    type: 'file',
    encoding: 'base64',
    size: bytes.byteLength,
    name: 'deploy-pages.yml',
    path: '.github/workflows/deploy-pages.yml',
    content: githubBlobBase64(bytes),
    sha: blob,
    url,
    git_url: `${API}/git/blobs/${blob}`,
    html_url: `https://github.com/ael-dev3/Warpkeep/blob/${CANDIDATE}/.github/workflows/deploy-pages.yml`,
    download_url: `https://raw.githubusercontent.com/ael-dev3/Warpkeep/${CANDIDATE}/.github/workflows/deploy-pages.yml`,
    _links: {
      self: url,
      git: `${API}/git/blobs/${blob}`,
      html: `https://github.com/ael-dev3/Warpkeep/blob/${CANDIDATE}/.github/workflows/deploy-pages.yml`,
    },
  }
}

function runAttemptResponse(
  status: 'in_progress' | 'completed' = 'in_progress',
  conclusion: string | null = null,
): Record<string, unknown> {
  const runUrl = `${API}/actions/runs/${RUN_ID}`
  return {
    id: Number(RUN_ID),
    name: 'Deploy GitHub Pages',
    node_id: 'WFR_kwDOfixture',
    head_branch: 'main',
    head_sha: CANDIDATE,
    path: '.github/workflows/deploy-pages.yml@main',
    display_title: 'Deploy GitHub Pages',
    run_number: 300,
    event: 'workflow_run',
    status,
    conclusion,
    workflow_id: 309643090,
    check_suite_id: 77,
    check_suite_node_id: 'CS_kwDOfixture',
    url: runUrl,
    html_url: `https://github.com/ael-dev3/Warpkeep/actions/runs/${RUN_ID}`,
    pull_requests: [],
    created_at: new Date((NOW - 2_000) * 1_000).toISOString(),
    updated_at: new Date((NOW - 1) * 1_000).toISOString(),
    actor: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' },
    triggering_actor: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' },
    run_attempt: Number(RUN_ATTEMPT),
    referenced_workflows: [],
    run_started_at: new Date((NOW - 2_000) * 1_000).toISOString(),
    jobs_url: `${runUrl}/attempts/${RUN_ATTEMPT}/jobs`,
    logs_url: `${runUrl}/logs`,
    check_suite_url: `${API}/check-suites/77`,
    artifacts_url: `${runUrl}/artifacts`,
    cancel_url: `${runUrl}/cancel`,
    rerun_url: `${runUrl}/rerun`,
    previous_attempt_url: null,
    workflow_url: `${API}/actions/workflows/309643090`,
    head_commit: {
      id: CANDIDATE,
      tree_id: CANDIDATE_TREE,
      message: 'activate recovery',
      timestamp: new Date((NOW - 2_100) * 1_000).toISOString(),
      author: { name: 'Warpkeep', email: 'noreply@example.invalid' },
      committer: { name: 'Warpkeep', email: 'noreply@example.invalid' },
    },
    repository: { id: 1273513252, name: 'Warpkeep', full_name: 'ael-dev3/Warpkeep' },
    head_repository: { id: 1273513252, name: 'Warpkeep', full_name: 'ael-dev3/Warpkeep' },
  }
}

function deployStep(
  conclusion: 'success' | 'skipped' | 'failure' = 'success',
): Record<string, unknown> {
  const unstarted = conclusion === 'skipped'
  return {
    name: DEPLOY_STEP,
    status: 'completed',
    conclusion,
    number: 7,
    started_at: unstarted ? null : new Date((NOW - 1_000) * 1_000).toISOString(),
    completed_at: unstarted ? null : new Date((NOW - 900) * 1_000).toISOString(),
  }
}

function jobsResponse(
  step = deployStep(),
  jobStatus: 'in_progress' | 'completed' = 'in_progress',
  jobConclusion: string | null = null,
): Record<string, unknown> {
  const runUrl = `${API}/actions/runs/${RUN_ID}`
  return {
    total_count: 1,
    jobs: [{
      id: Number(CHECK_RUN_ID),
      run_id: Number(RUN_ID),
      workflow_name: 'Deploy GitHub Pages',
      head_branch: 'main',
      run_url: runUrl,
      run_attempt: Number(RUN_ATTEMPT),
      node_id: 'CR_kwDOfixture',
      head_sha: CANDIDATE,
      url: `${API}/actions/jobs/${CHECK_RUN_ID}`,
      html_url: `https://github.com/ael-dev3/Warpkeep/actions/runs/${RUN_ID}/job/${CHECK_RUN_ID}`,
      status: jobStatus,
      conclusion: jobConclusion,
      created_at: new Date((NOW - 2_000) * 1_000).toISOString(),
      started_at: new Date((NOW - 1_990) * 1_000).toISOString(),
      completed_at: jobStatus === 'completed' ? new Date((NOW - 800) * 1_000).toISOString() : null,
      name: 'deploy-recovery',
      steps: [
        {
          name: 'Request recovery authority',
          status: 'completed',
          conclusion: 'success',
          number: 6,
          started_at: new Date((NOW - 1_200) * 1_000).toISOString(),
          completed_at: new Date((NOW - 1_100) * 1_000).toISOString(),
        },
        step,
      ],
      check_run_url: `${API}/check-runs/${CHECK_RUN_ID}`,
      labels: ['ubuntu-latest'],
      runner_id: 1001,
      runner_name: 'GitHub Actions 1',
      runner_group_id: 0,
      runner_group_name: 'GitHub Actions',
    }],
  }
}

function githubActionsBotResponse(): Record<string, unknown> {
  const apiUrl = 'https://api.github.com/users/github-actions%5Bbot%5D'
  return {
    login: 'github-actions[bot]',
    id: 41898282,
    node_id: 'MDM6Qm90NDE4OTgyODI=',
    avatar_url: 'https://avatars.githubusercontent.com/in/15368?v=4',
    gravatar_id: '',
    url: apiUrl,
    html_url: 'https://github.com/apps/github-actions',
    followers_url: `${apiUrl}/followers`,
    following_url: `${apiUrl}/following{/other_user}`,
    gists_url: `${apiUrl}/gists{/gist_id}`,
    starred_url: `${apiUrl}/starred{/owner}{/repo}`,
    subscriptions_url: `${apiUrl}/subscriptions`,
    organizations_url: `${apiUrl}/orgs`,
    repos_url: `${apiUrl}/repos`,
    events_url: `${apiUrl}/events{/privacy}`,
    received_events_url: `${apiUrl}/received_events`,
    type: 'Bot',
    site_admin: false,
  }
}

function pagesDeploymentResponse(): Record<string, unknown> {
  const deploymentUrl = `${API}/deployments/${DEPLOYMENT_ID}`
  return {
    url: deploymentUrl,
    id: Number(DEPLOYMENT_ID),
    node_id: 'DE_kwDOsynthetic',
    sha: CANDIDATE,
    ref: 'main',
    task: 'deploy',
    payload: {},
    original_environment: 'github-pages',
    environment: 'github-pages',
    description: 'github-pages',
    creator: githubActionsBotResponse(),
    created_at: new Date((NOW - 1_050) * 1_000).toISOString(),
    updated_at: new Date((NOW - 850) * 1_000).toISOString(),
    statuses_url: `${deploymentUrl}/statuses`,
    repository_url: API,
    transient_environment: false,
    production_environment: true,
  }
}

function pagesDeploymentStatusResponse(): Record<string, unknown> {
  const deploymentUrl = `${API}/deployments/${DEPLOYMENT_ID}`
  const jobUrl = `https://github.com/ael-dev3/Warpkeep/actions/runs/${RUN_ID}/job/${CHECK_RUN_ID}`
  return {
    url: `${deploymentUrl}/statuses/${DEPLOYMENT_STATUS_ID}`,
    id: Number(DEPLOYMENT_STATUS_ID),
    node_id: 'DS_kwDOsynthetic',
    state: 'success',
    creator: githubActionsBotResponse(),
    description: 'Deployment finished successfully.',
    environment: 'github-pages',
    target_url: jobUrl,
    created_at: new Date((NOW - 850) * 1_000).toISOString(),
    updated_at: new Date((NOW - 850) * 1_000).toISOString(),
    deployment_url: deploymentUrl,
    repository_url: API,
    environment_url: 'https://warpkeep.com/',
    log_url: jobUrl,
  }
}

type EvidenceState = {
  repository: Record<string, unknown>
  branch: Record<string, unknown>
  commit: Record<string, unknown>
  artifact: Record<string, unknown>
  artifactSecond?: Record<string, unknown>
  workflow: string
  run: Record<string, unknown>
  runSecond?: Record<string, unknown>
  jobs: Record<string, unknown>
  jobsSecond?: Record<string, unknown>
  deploymentsStatus: number
  deploymentsBody: unknown
  deploymentsSecondStatus?: number
  deploymentsSecondBody?: unknown
  deploymentsEtag?: string
  deploymentsSecondEtag?: string
  deploymentsLink?: string
  deploymentsSecondLink?: string
  deploymentStatusesStatus: number
  deploymentStatusesBody: unknown
  deploymentStatusesSecondStatus?: number
  deploymentStatusesSecondBody?: unknown
  deploymentStatusesEtag?: string
  deploymentStatusesSecondEtag?: string
  deploymentStatusesLink?: string
  deploymentStatusesSecondLink?: string
  pagesStatus: number
  pagesBody: Record<string, unknown>
  pagesSecondStatus?: number
  pagesSecondBody?: Record<string, unknown>
  publicBytes: Uint8Array
  publicSecondBytes?: Uint8Array
  pagesRedirectUrl?: string
  publicRedirectUrl?: string
  nonSettlingUrl?: string
}

type Fixture = {
  state: EvidenceState
  projection: LedgerSignerClaimProjection
  calls: string[]
  requestInits: RequestInit[]
  reader: ReturnType<typeof createDeploymentReconciliationProofReader>
  settleNonSettling: (response?: Response) => void
}

const UNSETTLED = Symbol('unsettled')

async function makeFixture(outcome: 'completed' | 'not-deployed' = 'completed'): Promise<Fixture> {
  const attestationText = JSON.stringify(canonicalAttestation())
  const publicBytes = encoder.encode(attestationText)
  const artifactName = `github-pages-recovery-${RUN_ID}-${RUN_ATTEMPT}`
  const metadata: GitHubEvidenceMetadata = {
    repository: 'ael-dev3/Warpkeep',
    repositoryId: '1273513252',
    repositoryOwnerId: '183124839',
    candidateCommit: CANDIDATE,
    candidateTree: CANDIDATE_TREE,
    parentCommit: PREPARATION_COMMIT,
    preparationTree: PREPARATION_TREE,
    artifactId: ARTIFACT_ID,
    artifactName,
    pagesRunId: RUN_ID,
    pagesRunAttempt: RUN_ATTEMPT,
    artifactSize: 1_234,
    artifactDigest: `sha256:${ARCHIVE_SHA256}`,
    artifactUrl: `${API}/actions/artifacts/${ARTIFACT_ID}`,
    artifactArchiveUrl: `${API}/actions/artifacts/${ARTIFACT_ID}/zip`,
    artifactNodeId: 'A_kwDOsynthetic',
    artifactCreatedAt: new Date((NOW - 3_600) * 1_000).toISOString(),
    artifactExpiresAt: new Date((NOW + 86_400) * 1_000).toISOString(),
    artifactEtag: '"artifact-etag"',
    githubArtifactArchiveSha256: ARCHIVE_SHA256,
  }
  const projection: LedgerSignerClaimProjection = {
    state: 'reconciliation-required',
    requestId: REQUEST_ID,
    authorization: {
      locators: {
        requestId: REQUEST_ID,
        candidateCommit: CANDIDATE,
        sourceVerifyRunId: '51',
        sourceVerifyRunAttempt: '1',
        artifactId: ARTIFACT_ID,
      },
      workflowIdentity: {
        repository: 'ael-dev3/Warpkeep',
        repositoryId: '1273513252',
        repositoryOwnerId: '183124839',
        ref: 'refs/heads/main',
        workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
        environment: 'github-pages',
        eventName: 'workflow_run',
        workflowSha: CANDIDATE,
        pagesRunId: RUN_ID,
        pagesRunAttempt: RUN_ATTEMPT,
        checkRunId: CHECK_RUN_ID,
      },
      authorizationJti: AUTHORIZATION_JTI,
      authorizationEpoch: 3,
      issuedAt: NOW - 3_000,
      notBefore: NOW - 3_000,
      expiresAt: NOW - 1_000,
      issuanceEvidenceSnapshotDigest: '4'.repeat(64),
      liveInvariantDigest: '5'.repeat(64),
      candidateTree: CANDIDATE_TREE,
      artifactName,
      githubArtifactArchiveSha256: ARCHIVE_SHA256,
      innerArtifactTarSha256: '6'.repeat(64),
      contentManifestSha256: '3'.repeat(64),
      deploymentAttestationSha256: rawSha256(publicBytes),
      operation: 'github-pages-production-deploy',
      canonicalOrigin: 'https://warpkeep.com',
      githubMetadata: metadata,
      githubMetadataSha256: await githubEvidenceMetadataSha256(metadata),
    },
    authorizationJwsSha256: '8'.repeat(64),
    claim: {
      claimSnapshotDigest: '9'.repeat(64),
      claimLiveInvariantDigest: '5'.repeat(64),
      claimSequence: 1,
      claimedAt: NOW - 1_300,
      claimDeadline: NOW - 100,
    },
    rowBindingDigest: 'a1'.repeat(32),
    revision: 4,
  }

  const state: EvidenceState = {
    repository: repositoryResponse(),
    branch: branchResponse(),
    commit: commitResponse(),
    artifact: artifactResponse(),
    workflow: recoveryWorkflow(),
    run: outcome === 'completed'
      ? runAttemptResponse()
      : runAttemptResponse('completed', 'failure'),
    jobs: outcome === 'completed'
      ? jobsResponse()
      : jobsResponse(deployStep('skipped'), 'completed', 'failure'),
    deploymentsStatus: 200,
    deploymentsBody: outcome === 'completed' ? [pagesDeploymentResponse()] : [],
    deploymentStatusesStatus: 200,
    deploymentStatusesBody: outcome === 'completed' ? [pagesDeploymentStatusResponse()] : [],
    pagesStatus: outcome === 'completed' ? 200 : 404,
    pagesBody: outcome === 'completed' ? { status: 'succeed' } : { message: 'Not Found' },
    publicBytes,
  }
  const calls: string[] = []
  const requestInits: RequestInit[] = []
  let artifactReads = 0
  let runReads = 0
  let jobReads = 0
  let deploymentsReads = 0
  let deploymentStatusesReads = 0
  let pagesReads = 0
  let publicReads = 0
  let settleNonSettling!: (response: Response) => void
  const nonSettling = new Promise<Response>(resolve => {
    settleNonSettling = resolve
  })

  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    requestInits.push(init ?? {})
    if (url === state.nonSettlingUrl) return await nonSettling
    if (url === INSTALLATION_URL) {
      return jsonResponse(url, {
        expires_at: new Date((NOW + 3_600) * 1_000).toISOString(),
        permissions: {
          actions: 'read',
          checks: 'read',
          contents: 'read',
          deployments: 'read',
          metadata: 'read',
          pages: 'read',
        },
        repository_selection: 'selected',
        repositories_url: 'https://api.github.com/installation/repositories',
        has_multiple_single_files: false,
        single_file: null,
        single_file_paths: [],
        token_last_eight: 'on-token',
        repositories: [{
          full_name: 'ael-dev3/Warpkeep',
          id: 1273513252,
          node_id: 'R_kgDOL5fixture',
          name: 'Warpkeep',
          private: false,
          owner: { login: 'ael-dev3', id: 183124839 },
        }],
        token: 'installation-token',
      }, 201)
    }

    const authorization = new Headers(init?.headers).get('authorization')
    if (url.startsWith('https://api.github.com/') && authorization !== 'Bearer installation-token') {
      return jsonResponse(url, { message: 'denied' }, 401)
    }
    if (url === API) return jsonResponse(url, state.repository)
    if (url === `${API}/branches/main`) return jsonResponse(url, state.branch)
    if (url === `${API}/git/commits/${CANDIDATE}`) return jsonResponse(url, state.commit)
    if (url === `${API}/actions/artifacts/${ARTIFACT_ID}`) {
      artifactReads += 1
      return jsonResponse(
        url,
        artifactReads === 2 ? state.artifactSecond ?? state.artifact : state.artifact,
        200,
        '"artifact-etag"',
      )
    }
    if (url === `${API}/contents/.github/workflows/deploy-pages.yml?ref=${CANDIDATE}`) {
      return jsonResponse(url, await workflowContentsResponse(state.workflow), 200, '"workflow-etag"')
    }
    if (url === `${API}/actions/runs/${RUN_ID}/attempts/${RUN_ATTEMPT}`) {
      runReads += 1
      return jsonResponse(
        url,
        runReads === 2 ? state.runSecond ?? state.run : state.run,
        200,
        '"run-etag"',
      )
    }
    if (url === `${API}/actions/runs/${RUN_ID}/attempts/${RUN_ATTEMPT}/jobs?per_page=100`) {
      jobReads += 1
      return jsonResponse(
        url,
        jobReads === 2 ? state.jobsSecond ?? state.jobs : state.jobs,
        200,
        '"jobs-etag"',
      )
    }
    if (url === DEPLOYMENTS_URL) {
      deploymentsReads += 1
      const second = deploymentsReads === 2
      const status = second ? state.deploymentsSecondStatus ?? state.deploymentsStatus : state.deploymentsStatus
      const body = second ? state.deploymentsSecondBody ?? state.deploymentsBody : state.deploymentsBody
      const etag = second ? state.deploymentsSecondEtag ?? state.deploymentsEtag : state.deploymentsEtag
      const link = second ? state.deploymentsSecondLink ?? state.deploymentsLink : state.deploymentsLink
      return responseAt(url, JSON.stringify(body), {
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          etag: etag ?? '"deployments-etag"',
          ...(link === undefined ? {} : { link }),
        },
      })
    }
    if (url === DEPLOYMENT_STATUSES_URL) {
      deploymentStatusesReads += 1
      const second = deploymentStatusesReads === 2
      const status = second
        ? state.deploymentStatusesSecondStatus ?? state.deploymentStatusesStatus
        : state.deploymentStatusesStatus
      const body = second
        ? state.deploymentStatusesSecondBody ?? state.deploymentStatusesBody
        : state.deploymentStatusesBody
      const etag = second
        ? state.deploymentStatusesSecondEtag ?? state.deploymentStatusesEtag
        : state.deploymentStatusesEtag
      const link = second
        ? state.deploymentStatusesSecondLink ?? state.deploymentStatusesLink
        : state.deploymentStatusesLink
      return responseAt(url, JSON.stringify(body), {
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          etag: etag ?? '"deployment-statuses-etag"',
          ...(link === undefined ? {} : { link }),
        },
      })
    }
    if (url === PAGES_STATUS_URL) {
      pagesReads += 1
      const status = pagesReads === 2 ? state.pagesSecondStatus ?? state.pagesStatus : state.pagesStatus
      const body = pagesReads === 2 ? state.pagesSecondBody ?? state.pagesBody : state.pagesBody
      return jsonResponse(url, body, status, '"pages-etag"', state.pagesRedirectUrl ?? url)
    }
    if (url === PUBLIC_ATTESTATION_URL) {
      publicReads += 1
      const body = publicReads === 2 ? state.publicSecondBytes ?? state.publicBytes : state.publicBytes
      return responseAt(url, body, {
        status: 200,
        headers: { 'content-type': 'application/json', etag: '"public-etag"' },
      }, state.publicRedirectUrl ?? url)
    }
    throw new Error(`unexpected fake transport: ${url}`)
  }) as typeof fetch

  return {
    state,
    projection,
    calls,
    requestInits,
    reader: createDeploymentReconciliationProofReader({ githubApp, fetch: fetchImplementation }),
    settleNonSettling: (response = jsonResponse(state.nonSettlingUrl ?? API, {})) => {
      settleNonSettling(response)
    },
  }
}

async function expectOwnedTransportTimeout(fixture: Fixture, url: string): Promise<void> {
  fixture.state.nonSettlingUrl = url
  let observed: unknown = UNSETTLED
  const pending = fixture.reader(fixture.projection)
  void pending.then(
    value => { observed = value },
    error => { observed = error },
  )
  await vi.waitFor(() => {
    expect(fixture.calls).toContain(url)
  })

  await vi.advanceTimersByTimeAsync(TRANSPORT_TIMEOUT_MS)
  await vi.advanceTimersByTimeAsync(0)
  expect(observed).toEqual({ outcome: 'ambiguous' })
}

describe('read-only V2 deployment reconciliation evidence', () => {
  it('completes only from the exact pinned step, Pages deployment, and raw-SHA-bound public attestation', async () => {
    const fixture = await makeFixture('completed')

    await expect(fixture.reader(fixture.projection)).resolves.toEqual({
      outcome: 'completed',
      rowBindingDigest: fixture.projection.rowBindingDigest,
      deployStepConclusion: 'success',
      matchingPagesDeployment: true,
      deploymentAttestationMatches: true,
    })

    expect(fixture.calls.filter(url => url === INSTALLATION_URL)).toHaveLength(1)
    expect(fixture.calls.filter(url => url === DEPLOYMENTS_URL)).toHaveLength(2)
    expect(fixture.calls.filter(url => url === DEPLOYMENT_STATUSES_URL)).toHaveLength(2)
    expect(fixture.calls.filter(url => url === PAGES_STATUS_URL)).toHaveLength(2)
    expect(fixture.calls.some(url => /\/zip(?:\?|$)|objects\.githubusercontent\.com/u.test(url))).toBe(false)
    expect(fixture.calls.some(url => /openid-configuration|\.well-known\/jwks/u.test(url))).toBe(false)
    for (const init of fixture.requestInits) {
      expect(init.cache).toBe('no-store')
      expect(init.redirect).toBe('manual')
    }
    const publicIndex = fixture.calls.indexOf(PUBLIC_ATTESTATION_URL)
    expect(publicIndex).toBeGreaterThan(-1)
    expect(new Headers(fixture.requestInits[publicIndex]!.headers).has('authorization')).toBe(false)
    expect(fixture.requestInits[publicIndex]!.credentials).toBe('omit')
  })

  it('marks not-deployed only for an authoritative terminal attempt, an unstarted exact step, and stable Pages absence', async () => {
    const fixture = await makeFixture('not-deployed')

    await expect(fixture.reader(fixture.projection)).resolves.toEqual({
      outcome: 'not-deployed',
      rowBindingDigest: fixture.projection.rowBindingDigest,
      authoritativeTerminalRun: true,
      pagesDeployStepStarted: false,
      matchingPagesDeploymentAbsent: true,
    })
    expect(fixture.calls.filter(url => url === DEPLOYMENTS_URL)).toHaveLength(2)
    expect(fixture.calls).not.toContain(PAGES_STATUS_URL)
    expect(fixture.calls).not.toContain(PUBLIC_ATTESTATION_URL)
  })

  it('returns exactly ambiguous without fetching for a non-reconciliation projection', async () => {
    const fixture = await makeFixture()
    const claimed = { ...fixture.projection, state: 'claimed' } as LedgerSignerClaimProjection

    await expect(fixture.reader(claimed)).resolves.toEqual({ outcome: 'ambiguous' })
    expect(fixture.calls).toEqual([])
  })

  it('collapses a transport rejection to exactly ambiguous without exposing its error', async () => {
    const fixture = await makeFixture()
    const offline = createDeploymentReconciliationProofReader({
      githubApp,
      fetch: (async () => { throw new Error('sensitive upstream detail') }) as typeof fetch,
    })

    await expect(offline(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
  })

  it('settles exactly ambiguous when App-token mint transport never settles or observes abort', async () => {
    const fixture = await makeFixture()

    await expectOwnedTransportTimeout(fixture, INSTALLATION_URL)
  })

  it('settles exactly ambiguous when authenticated metadata transport never settles or observes abort', async () => {
    const fixture = await makeFixture()

    await expectOwnedTransportTimeout(fixture, API)
  })

  it('keeps its selected ambiguous result when a timed-out public transport settles late', async () => {
    const fixture = await makeFixture()
    fixture.state.nonSettlingUrl = PUBLIC_ATTESTATION_URL
    let observed: unknown = UNSETTLED
    const pending = fixture.reader(fixture.projection)
    void pending.then(
      value => { observed = value },
      error => { observed = error },
    )
    await vi.waitFor(() => {
      expect(fixture.calls).toContain(PUBLIC_ATTESTATION_URL)
    })

    await vi.advanceTimersByTimeAsync(TRANSPORT_TIMEOUT_MS)
    await vi.advanceTimersByTimeAsync(0)
    expect(observed).toEqual({ outcome: 'ambiguous' })

    fixture.settleNonSettling(responseAt(PUBLIC_ATTESTATION_URL, fixture.state.publicBytes, {
      status: 200,
      headers: { 'content-type': 'application/json', etag: '"late-public-etag"' },
    }))
    await vi.advanceTimersByTimeAsync(0)
    await expect(pending).resolves.toEqual({ outcome: 'ambiguous' })
  })

  it('keeps the current workflow source ambiguous because no deploy-recovery producer exists yet', async () => {
    const fixture = await makeFixture()
    fixture.state.workflow = await readFile(
      new URL('../../../.github/workflows/deploy-pages.yml', import.meta.url),
      'utf8',
    )

    await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
    expect(fixture.calls).not.toContain(PUBLIC_ATTESTATION_URL)
  })
  it.each(['hosted-runner', 'old-deploy-id', 'missing-postflight'])('rejects stale reconciliation workflow contract: %s', async kind => {
    const fixture = await makeFixture()
    if (kind === 'hosted-runner') fixture.state.workflow = fixture.state.workflow.replace(
      '[self-hosted, Linux, X64, warpkeep-production-admin, warpkeep-repository-exclusive]', 'ubuntu-latest')
    if (kind === 'old-deploy-id') fixture.state.workflow = fixture.state.workflow.replace('id: recovery-deployment', 'id: deployment')
    if (kind === 'missing-postflight') fixture.state.workflow = fixture.state.workflow.slice(0,
      fixture.state.workflow.indexOf('      - name: Verify recovery live postflight'))
    await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
  })

  it.each([
    ['unpinned action', (fixture: Fixture) => {
      fixture.state.workflow = fixture.state.workflow.replace(DEPLOY_ACTION, 'actions/deploy-pages@v5')
    }],
    ['wrong artifact input', (fixture: Fixture) => {
      fixture.state.workflow = fixture.state.workflow.replace('github-pages-recovery-', 'github-pages-')
    }],
    ['wrong run attempt', (fixture: Fixture) => {
      fixture.state.run.run_attempt = 3
    }],
    ['duplicate deploy job', (fixture: Fixture) => {
      const jobs = fixture.state.jobs.jobs as Record<string, unknown>[]
      jobs.push({ ...jobs[0], id: 92, node_id: 'duplicate' })
      fixture.state.jobs.total_count = 2
    }],
    ['duplicate named step', (fixture: Fixture) => {
      const job = (fixture.state.jobs.jobs as Record<string, unknown>[])[0]!
      const steps = job.steps as Record<string, unknown>[]
      steps.push({ ...steps[1], number: 8 })
    }],
    ['missing Pages deployment', (fixture: Fixture) => {
      fixture.state.deploymentsBody = []
    }],
    ['wrong Pages status', (fixture: Fixture) => {
      fixture.state.pagesBody = { status: 'deployment_failed' }
    }],
    ['noncanonical public attestation', (fixture: Fixture) => {
      fixture.state.publicBytes = encoder.encode(`${new TextDecoder().decode(fixture.state.publicBytes)}\n`)
      ;(fixture.projection.authorization as unknown as { deploymentAttestationSha256: string })
        .deploymentAttestationSha256 = rawSha256(fixture.state.publicBytes)
    }],
    ['public attestation field substitution', (fixture: Fixture) => {
      fixture.state.publicBytes = encoder.encode(JSON.stringify({
        ...canonicalAttestation(),
        candidateCommit: 'f'.repeat(40),
      }))
      ;(fixture.projection.authorization as unknown as { deploymentAttestationSha256: string })
        .deploymentAttestationSha256 = rawSha256(fixture.state.publicBytes)
    }],
  ])('returns ambiguous for completed evidence with %s', async (_name, mutate) => {
    const fixture = await makeFixture()
    mutate(fixture)
    await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
  })

  it.each([
    ['wrong candidate', (fixture: Fixture) => {
      const deployment = (fixture.state.deploymentsBody as Record<string, unknown>[])[0]!
      deployment.sha = 'f'.repeat(40)
    }],
    ['wrong run', (fixture: Fixture) => {
      const status = (fixture.state.deploymentStatusesBody as Record<string, unknown>[])[0]!
      const wrong = `https://github.com/ael-dev3/Warpkeep/actions/runs/42/job/${CHECK_RUN_ID}`
      status.target_url = wrong
      status.log_url = wrong
    }],
    ['wrong attempt', (fixture: Fixture) => {
      const status = (fixture.state.deploymentStatusesBody as Record<string, unknown>[])[0]!
      const wrongAttemptJob = `https://github.com/ael-dev3/Warpkeep/actions/runs/${RUN_ID}/job/92`
      status.target_url = wrongAttemptJob
      status.log_url = wrongAttemptJob
    }],
    ['wrong environment', (fixture: Fixture) => {
      const deployment = (fixture.state.deploymentsBody as Record<string, unknown>[])[0]!
      const status = (fixture.state.deploymentStatusesBody as Record<string, unknown>[])[0]!
      deployment.original_environment = 'staging'
      deployment.environment = 'staging'
      status.environment = 'staging'
    }],
    ['wrong deployment identity', (fixture: Fixture) => {
      const status = (fixture.state.deploymentStatusesBody as Record<string, unknown>[])[0]!
      status.deployment_url = `${API}/deployments/502`
    }],
  ])('rejects completed evidence with a %s Pages deployment relation', async (_name, mutate) => {
    const fixture = await makeFixture('completed')
    mutate(fixture)

    await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
  })

  it.each([
    ['incomplete response', (fixture: Fixture) => {
      fixture.state.deploymentsStatus = 206
    }],
    ['paginated response', (fixture: Fixture) => {
      fixture.state.deploymentsLink = `<${DEPLOYMENTS_URL}&page=2>; rel="next"`
    }],
  ])('does not manufacture not-deployed from an empty but %s', async (_name, mutate) => {
    const fixture = await makeFixture('not-deployed')
    mutate(fixture)

    await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
  })

  it.each([
    ['a nonterminal run', (fixture: Fixture) => {
      fixture.state.run = runAttemptResponse()
    }],
    ['a started failed deploy step', (fixture: Fixture) => {
      fixture.state.jobs = jobsResponse(deployStep('failure'), 'completed', 'failure')
    }],
    ['an extant Pages deployment', (fixture: Fixture) => {
      fixture.state.deploymentsBody = [pagesDeploymentResponse()]
      fixture.state.deploymentStatusesBody = [pagesDeploymentStatusResponse()]
      fixture.state.pagesStatus = 200
      fixture.state.pagesBody = { status: 'succeed' }
    }],
  ])('does not manufacture not-deployed from %s', async (_name, mutate) => {
    const fixture = await makeFixture('not-deployed')
    mutate(fixture)
    await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
  })

  it('returns ambiguous when authenticated metadata drifts between its two reads', async () => {
    const fixture = await makeFixture()
    fixture.state.artifactSecond = { ...fixture.state.artifact, node_id: 'drifted' }
    await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
  })

  it('returns ambiguous when run, Pages, or public evidence changes between reads', async () => {
    const fixtures = await Promise.all([makeFixture(), makeFixture(), makeFixture()])
    fixtures[0]!.state.runSecond = runAttemptResponse('completed', 'success')
    fixtures[1]!.state.deploymentsSecondBody = []
    fixtures[2]!.state.publicSecondBytes = encoder.encode(JSON.stringify({
      ...canonicalAttestation(),
      sourceClosureSha256: '7'.repeat(64),
    }))

    for (const fixture of fixtures) {
      await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
    }
  })

  it('returns ambiguous for a redirect at either authenticated or public evidence origin', async () => {
    const pages = await makeFixture()
    pages.state.pagesRedirectUrl = 'https://attacker.test/evidence'
    await expect(pages.reader(pages.projection)).resolves.toEqual({ outcome: 'ambiguous' })

    const publicEvidence = await makeFixture()
    publicEvidence.state.publicRedirectUrl = 'https://attacker.test/evidence'
    await expect(publicEvidence.reader(publicEvidence.projection)).resolves.toEqual({ outcome: 'ambiguous' })
    expect(publicEvidence.calls).toContain(PUBLIC_ATTESTATION_URL)
  })

  it('rejects projection commitment/cross-link substitutions before terminal evidence is accepted', async () => {
    const fixtures = await Promise.all([makeFixture(), makeFixture(), makeFixture()])
    ;(fixtures[0]!.projection.authorization.githubMetadata as unknown as { candidateTree: string })
      .candidateTree = 'f'.repeat(40)
    ;(fixtures[1]!.projection.authorization.workflowIdentity as unknown as { pagesRunAttempt: string })
      .pagesRunAttempt = '3'
    ;(fixtures[2]!.projection.authorization as unknown as { githubMetadataSha256: string })
      .githubMetadataSha256 = '0'.repeat(64)

    for (const fixture of fixtures) {
      await expect(fixture.reader(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
      expect(fixture.calls).toEqual([])
    }
  })

  it('turns accessor, proxy, and malformed factory input into exactly ambiguous without reading through them', async () => {
    const fixture = await makeFixture()
    let projectionAccessorReads = 0
    const accessor = { ...fixture.projection } as Record<string, unknown>
    Object.defineProperty(accessor, 'rowBindingDigest', {
      enumerable: true,
      get() {
        projectionAccessorReads += 1
        throw new Error('hostile row binding')
      },
    })
    const proxy = new Proxy(fixture.projection, {
      getPrototypeOf() { throw new Error('hostile projection') },
    })
    const factoryInput = {} as Record<string, unknown>
    let factoryAccessorReads = 0
    Object.defineProperty(factoryInput, 'githubApp', {
      enumerable: true,
      get() {
        factoryAccessorReads += 1
        throw new Error('hostile app')
      },
    })
    factoryInput.fetch = async () => { throw new Error('must not fetch') }
    const failClosed = createDeploymentReconciliationProofReader(factoryInput as never)

    await expect(fixture.reader(accessor as never)).resolves.toEqual({ outcome: 'ambiguous' })
    await expect(fixture.reader(proxy)).resolves.toEqual({ outcome: 'ambiguous' })
    await expect(failClosed(fixture.projection)).resolves.toEqual({ outcome: 'ambiguous' })
    expect(projectionAccessorReads).toBe(0)
    expect(factoryAccessorReads).toBe(0)
  })
})
