# Warpkeep release recovery authorization

This package implements the Cloudflare authorization service for Warpkeep's
protected 0.4 recovery deployment path. It verifies source, artifact, workflow
and live-invariant evidence, then issues signed authorization, claim and terminal
receipts backed by a durable ledger. The deployment caller performs the effect;
this service is not a database backup, a publisher or a general-purpose signing API.

## Current status and scope

The gateway, private signer, GitHub evidence/OIDC validation, realm observation
binding, durable ledger and Worker-runtime tests are implemented. Checked-in
[signer configuration](wrangler.signer.toml) sets `RECOVERY_ENABLED = "false"`.
Configuration files do not prove that either Worker, its keys, control state or
release-specific authorization has been deployed and armed.

The operating path is still being connected. Source expects a protected
`deploy-recovery` job and a particular authenticated Linux runner context;
the complete production workflow, installed helpers and activation caller must
actually supply that contract. A local compiler probe or valid-looking descriptor
does not provide a GitHub job identity or complete a recovery deployment.

Read the [architecture](../../docs/technical-architecture.md),
[0.4 handoff](../../docs/agent-notes/0.4.0/README.md),
[infrastructure audit](../../docs/agent-notes/0.4.0/release-and-infrastructure.md)
and [recovery validation map](../../docs/evidence/0.4.0/recovery-binding-validation-map.md)
for the current callers, evidence and remaining work. Use the
[release checklist](../../docs/operations/0.4.0-release-checklist.md) for release
acceptance rather than treating this package's successful tests as deployment proof.

Recovery evidence distinguishes three realm invariants: preserve G001's existing
players and normal progress while new admissions remain frozen; keep G002 sealed;
and keep the PTR owner isolated from general admission. G002 and PTR are already
recorded as existing realms. Their safe update path and preservation of legitimate
post-deployment writes are separate responsibilities from authorization issuance.

## Service boundaries

```text
Protected operating caller
  -> exact recovery HTTP gateway
  -> private Cloudflare service binding
  -> signer: GitHub evidence + bridge realm observation + durable ledger
  -> signed authorization / claim / terminal receipt
  -> fixed deployment boundary and mandatory postflight
```

[index-gateway.ts](src/index-gateway.ts) exposes the HTTP gateway at the configured
`release-auth.warpkeep.com` coordinate. It delegates to the `RECOVERY_SIGNER`
service binding; it does not hold signing or realm-administration authority.
[index-signer.ts](src/index-signer.ts) exposes the named
`ReleaseRecoverySignerEntrypoint` RPC methods and the V2 ledger Durable Object.
The signer's default HTTP handler returns 404 and its Wrangler configuration
has no public route. The [auth bridge](../auth-bridge/README.md) exposes a separate
`ReleaseRecoveryObservationEntrypoint` to the signer through `AUTH_BRIDGE_OBSERVER`.

The HTTP gateway rejects browser `Origin` headers, non-canonical origins/paths,
query strings and unsupported methods. POST bodies have bounded size, time and
exact shapes; the request parser and signed protocol are authoritative for fields.
Logs contain only the closed safe-event projection, not credentials, raw evidence
or signed-token contents.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/v1/recovery/status` | Signed control status (`statusJws`) |
| `POST` | `/v1/recovery/issue` | Evidence-bound authorization (`authorizationJws`) |
| `POST` | `/v1/recovery/claim` | Durable deployment claim (`claimReceiptJws`) |
| `POST` | `/v1/recovery/complete` | Validated terminal completion (`terminalJws`) |
| `POST` | `/v1/recovery/reconcile` | Evidence-based reconciliation (`terminalJws`) |
| `GET` | `/v1/recovery/requests/<requestId>` | Signed terminal result for a canonical request UUID (`terminalJws`) |

The signer repeats request validation at the RPC boundary. A gateway timeout is
not proof that a durable effect failed. Preserve request/claim correlation and use
the implemented reconciliation path instead of issuing a new unrelated attempt.

## Source and test map

| Work | Start here |
| --- | --- |
| HTTP transport and service binding | [gateway.ts](src/gateway.ts), [gateway runtime tests](test-workerd/gateway.workerd.test.ts), [gateway configuration](wrangler.gateway.toml) |
| Signed payloads and strict request shapes | [protocol.ts](src/protocol.ts), [signerRequests.ts](src/signerRequests.ts), [protocol tests](test/protocol.test.ts) |
| Signer composition and control | [signer.ts](src/signer.ts), [signerEnvironment.ts](src/signerEnvironment.ts), [signerControl.ts](src/signerControl.ts) |
| Issue, claim and completion | [signerIssue.ts](src/signerIssue.ts), [signerClaim.ts](src/signerClaim.ts), [signerCompletion.ts](src/signerCompletion.ts) |
| Authenticated workflow and artifact evidence | [githubEvidence.ts](src/githubEvidence.ts), [githubOidc.ts](src/githubOidc.ts), [archive.ts](src/archive.ts) |
| Realm observations and module compatibility | [realmEvidence.ts](src/realmEvidence.ts), [spacetimeProgramPins.ts](src/spacetimeProgramPins.ts), [rawModuleDefV10.ts](src/rawModuleDefV10.ts) |
| Durable authorization/claim state | [ledgerV2.ts](src/ledgerV2.ts), [ledgerDurableObjectV2.ts](src/ledgerDurableObjectV2.ts), [V2 runtime tests](test-workerd/ledgerDurableObjectV2.test.ts) |
| Uncertain-outcome reconciliation | [reconciliationEvidence.ts](src/reconciliationEvidence.ts), [reconciliationProof.ts](src/reconciliationProof.ts) |
| Fixed deployment caller | Root [claim preparation](../../scripts/recovery-workflow-prepare-claim.mjs), [deployment boundary](../../scripts/recovery-workflow-deployment-boundary.mjs), [postflight](../../scripts/recovery-workflow-postflight.mjs) and [reconciliation](../../scripts/recovery-workflow-reconcile-current-run.mjs) |

V2 is the configured ledger path. Older ledger code and fixtures remain reference
and test material; their presence is not a second active production state owner.
Deployment control, authorization epoch and arming inputs are parsed separately
from gateway requests. Callers cannot supply a replacement signer or relax the
fixed source, artifact, realm or workflow identities.

## Local verification and generated inputs

The package uses Node 22 and its pinned pnpm version. Install in a fresh
independent checkout, and prepare the generated module inputs described below
before running the complete check from the repository root:

```sh
pnpm --dir services/release-recovery install --frozen-lockfile
pnpm --dir services/release-recovery run check
```

Inspect existing dependency links before installing into a worktree. The
[package scripts](package.json) run both TypeScript configurations, verify the
generated workerd binding declarations and execute the unit and workerd suites.
`test` and `test:workerd` are available separately for focused iteration. Root
release-workflow tests are separate from this package's checks; use the
[repository map](../../docs/agent-notes/0.4.0/repo-map.md) to select the real caller.

The signer expects generated module descriptors under `fixtures/spacetime/`.
Those outputs are not present in an ordinary source checkout. Produce and maintain
them through the
[fixture generator](scripts/generate-release-recovery-spacetime-fixtures.mjs)
and its [WSL toolchain preparation](scripts/prepare-release-recovery-wsl-toolchain.mjs)
and [runner](scripts/run-release-recovery-spacetime-fixtures-wsl.mjs).
Source identities, generated bytes and consumers must agree; manually replacing
hashes or relabeling unrelated module output does not establish compatibility.

The root [local release workspace](../../scripts/local-release-workspace.mjs)
and compiled artifact producers handle candidate files and source-bound bundles.
Their installation/recovery proofs are distinct from production database recovery
that preserves later legitimate player writes. Follow the infrastructure audit
for the integrated operating caller and its current limitations.

## Configuration and reuse

[wrangler.gateway.toml](wrangler.gateway.toml),
[wrangler.signer.toml](wrangler.signer.toml) and
[wrangler.workerd.toml](wrangler.workerd.toml) describe public transport, private
signing and local tests respectively. The workerd fixtures use synthetic services;
they are not production credentials or realm observations. Keep signer keys,
provider credentials and private evidence in their configured restricted stores.
Do not put them in Vite variables, source files, logs or handoff packages.

This package follows the repository's [Apache-2.0 software policy](../../LICENSING.md).
Retain provenance and the terms of its dependencies and generated inputs.
