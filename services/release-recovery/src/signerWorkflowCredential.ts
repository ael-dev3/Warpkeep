import { githubFail, type GitHubAppEnvironment, type GitHubEvidenceEnvironment } from './config.js'
import { snapshotGitHubEvidenceEnvironment } from './githubEvidence.js'

export type GitHubEvidenceBindings = Partial<GitHubAppEnvironment> & Readonly<{ GITHUB_WORKFLOW_TOKEN?: string }>

/** Select an API-read credential. Signed OIDC, never this token, authorizes work. */
export function githubEvidenceFromBindings(env: GitHubEvidenceBindings): GitHubEvidenceEnvironment {
  return snapshotGitHubEvidenceEnvironment(env.GITHUB_WORKFLOW_TOKEN === undefined
    ? { GITHUB_APP_ID: env.GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID: env.GITHUB_APP_INSTALLATION_ID,
      GITHUB_APP_PRIVATE_KEY_PEM: env.GITHUB_APP_PRIVATE_KEY_PEM }
    : { GITHUB_WORKFLOW_TOKEN: env.GITHUB_WORKFLOW_TOKEN })
}

/** Request-local only: do not mutate Worker bindings or retain tokens in a ledger. */
export function withWorkflowCredential<T extends GitHubEvidenceBindings>(env: T, extra: readonly unknown[]): T {
  if (extra.length === 0) return env
  if (extra.length !== 1) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const evidence = snapshotGitHubEvidenceEnvironment({ GITHUB_WORKFLOW_TOKEN: extra[0] })
  if (!('GITHUB_WORKFLOW_TOKEN' in evidence)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return { ...env, GITHUB_WORKFLOW_TOKEN: evidence.GITHUB_WORKFLOW_TOKEN }
}
