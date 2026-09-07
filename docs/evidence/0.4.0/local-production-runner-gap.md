# Local production execution gap — 2026-09-07

Authenticated `gh api repos/ael-dev3/Warpkeep/actions/runners` returned exactly
one registered runner: ID 21, `warpkeep-production-runner-01`, macOS, offline,
not busy. Its labels were `self-hosted`, `macOS`, `ARM64`,
`warpkeep-production-admin`, and `warpkeep-repository-exclusive`.
No Windows or Linux runner was registered at this observation.

The active release goal supersedes the historical Mac requirement and requires
production execution locally on Windows/WSL with genuine authorized Actions
identity where needed. Current source does not yet satisfy that requirement:

- Pages private-toolchain/private deployment jobs still select the Mac labels.
- `services/release-recovery/src/githubOidc.ts` requires signed
  `runner_environment === 'github-hosted'`, an exact `ubuntu-latest` deployment
  job label, and GitHub-hosted runner name/group metadata.
- The approved September 3 recovery design describes that hosted identity;
  changing only workflow `runs-on` would fail signer validation.
- The checked-in Pages workflow has no `deploy-recovery` job yet, although
  the signer requires that exact job identity.

## Required integration, not a bypass

Complete the local production runner and recovery workflow as one consistent
execution profile. Establish the authorized repository-exclusive local runner,
record its actual identity and labels, then bind the signed OIDC and GitHub
job checks to that profile. Preserve protected-main, exact job/run/attempt,
environment, source, artifact, and durable single-use claim checks. Retain
credential-free verification isolation and non-cancelling production concurrency.

Do not treat runner environment variables, a successful local test, a shell
process, or workflow emulation as GitHub identity. Do not broaden the signer
to arbitrary hosted/self-hosted execution just to accept the new job.
Registration, authenticated runner execution, and the recovery deployment job
remain unimplemented/unverified in this checkpoint. No runner was registered,
no workflow dispatched, and no provider state changed during this inspection.

This is part of the existing local-operations acceptance requirement, not a new
release feature or evidence that the release is blocked by a blanket permission
restriction. The historical activation path and its missing-receipt constraints
must not be confused with the separately approved recovery provenance root.
