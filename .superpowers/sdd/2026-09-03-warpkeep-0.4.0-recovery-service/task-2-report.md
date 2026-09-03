# Task 2 report — recovery workflow and artifact identity

## Scope

Added the Task 2 recovery-service modules for fixed GitHub OIDC identity,
bounded JSON and one-hop archive transport, a strict stored-ZIP/TAR parser, and
read-only candidate/artifact evidence loading.  Added local fake-transport tests
for OIDC verification and redirect rejection, archive member/traversal rejection,
and fail-closed noncanonical evidence locators.

## RED / GREEN evidence

The initial prescribed Task 2 command failed before execution because the Task 1
package has neither a local `vitest` nor a local `tsc` executable (`Command
"vitest" not found`; the package's declared scripts similarly could not resolve
`tsc`). No package dependency or lockfile was added. The test contracts were
then added before their Task 2 module implementations. The repository's already
pinned root runtime supplied the verification commands below.

GREEN evidence, fresh after implementation:

- `node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` — exit 0.
- focused Task 2 Vitest — 3 files, 5 tests passed.
- existing Task 1 Vitest — 2 files, 51 tests passed.
- full service Vitest — 5 files, 56 tests passed.
- `git diff --check` — no output, exit 0.

## Security self-review

- OIDC has a dedicated `warpkeep-release-recovery` audience; it never imports
  Task 1's release audience.
- Numeric GitHub locators are canonical positive decimal strings at the service
  boundary; no locator is coerced through `Number` for identity comparison.
- Discovery/JWKS URLs are fixed, bounded, nonredirecting, and the verifier
  accepts only one exact RS256 signing key selected by `kid`.
- The authenticated archive route permits exactly one HTTPS 302 to a
  credential-free, default-port, non-IP/non-local destination; the redirected
  request has no caller headers or authorization and a second redirect fails.
- JSON/archives have explicit byte limits and stable fail-closed error codes;
  errors do not include tokens, PEM contents, JWS values, or upstream bodies.

## Files

`services/release-recovery/src/{config,http,archive,githubOidc,githubEvidence}.ts`
and `services/release-recovery/test/{archive,githubOidc,githubEvidence}.test.ts`.

## Tooling diagnosis / concern

The Task 1 package does not expose its declared local TypeScript/Vitest tools to
`pnpm --dir services/release-recovery`; the existing repository root copies were
used read-only. The generated package-local `pnpm-lock.yaml` from the attempted
command was removed and is intentionally not part of this task.

## Material follow-up required

This implementation is a partial kernel, not sufficient for a release-security
handoff. In particular, the GitHub App exchange still needs signer-side JWT
minting from the PEM; candidate loading still needs exact Contents/tree/blob
re-fetches and the three-file delta; and archive handling currently accepts
only stored ZIP entries rather than implementing the required bounded DEFLATE
stream. These limitations are recorded explicitly so a reviewer does not treat
the passing local fakes as proof of the complete approved Task 2 contract.

Commit: `verify recovery workflow and artifact identity`.
