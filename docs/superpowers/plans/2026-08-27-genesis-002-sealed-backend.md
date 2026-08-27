# Genesis 002 sealed-backend implementation plan

> **For agentic workers:** use test-driven development for every behavior
> change, verification-before-completion before any success claim, and an
> independent code review before integration.

**Goal:** Ship a distinct, atlas-capable Genesis 002 backend with zero
population and no public/player access, while preserving Genesis 001 0.3.43 and
preventing Pages from publishing 0.4.0 until exact live receipts are bound.

**Architecture:** `spacetimedb/genesis002/` privately registers the reviewed
atlas table contracts, denies every admission/player mutation, and exposes only
seven administrator-only atlas-import writers. Source-built G002-only publish
and import operators bind exact target, source, artifact, dependency, runtime
release, zero-state, and finalization evidence. A two-phase verifier blocks
Pages during preparation and permits it only from the reviewed 0.4.0 activation
successor.

**Tech stack:** TypeScript, Node.js 22, SpacetimeDB 2.6.1, pnpm 11.7.0, Vitest,
GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-27-genesis-002-sealed-backend-design.md`

## Global constraints

- Genesis 001 remains exact release 0.3.43 and its immutable production
  identity is never a target of a G002 build, publisher, or importer.
- The preparation source remains package/lock 0.3.43 and Pages is hard blocked.
- Genesis 002 is a fresh database with atlas ID
  `GENESIS_002_GREATER_REALM`, zero population, and private tables only.
- Atlas import/finalization is the sole write exception; admission, founding,
  activation, public roots, gameplay, and player presentation remain sealed.
- Any error after a possible production submission is ambiguous and requires
  manual reconciliation, never blind retry.
- No production mutation or deployment belongs to this implementation branch.

## Task 1: Private G002 module and denial contract

**Files:**

- `spacetimedb/genesis002/src/{auth,contract,index,lifecycle,policy,population,reducers,schema}.ts`
- `tests/genesis002SealedBackend.test.ts`

- [x] Write denial-first tests for every existing admission/player mutation.
- [x] Register the exact G002 compatibility wires with one total fail-closed
  policy and prove no supplied effect runs.
- [x] Add zero-population assertions to lifecycle and read-only status surfaces.
- [x] Rewrite all 23 registered table descriptors private before schema
  registration; expose no anonymous/public status path.
- [x] Generate exact bindings and assert 23 private tables, zero public tables,
  and the reviewed procedure/reducer surface.

## Task 2: Atlas import and post-finalization seal

**Files:**

- `spacetimedb/genesis002/src/atlasImportReducers.ts`
- `scripts/atlas/greater-realm-{cli,contracts,runtime-release}.ts`
- `scripts/genesis002-production-import-{core,operator}.ts`
- `tests/{greaterRealmRuntimeRelease,genesis002ProductionImport}.test.ts`

- [x] Add the explicit G002 runtime-release export path without changing the
  historical G001 atlas constants or evidence.
- [x] Bind every new producer and importer to
  `GENESIS_002_GREATER_REALM`; reject legacy G001 packages.
- [x] Limit the G002 transport to the exact seven atlas writers and two
  administrator status procedures.
- [x] Assert zero population, claims, occupancy, activation, Worker, and public
  roots before and after every write.
- [x] Make every writer reject once atlas state is finalized/ready.
- [x] Implement immediate postcondition checks and explicit ambiguous/manual
  reconciliation for lost submission outcomes.

## Task 3: Source-built fresh-target publisher

**Files:**

- `scripts/genesis002-production-publisher.{mjs,d.mts}`
- `scripts/genesis002-production-publisher-cli.ts`
- `scripts/genesis002-production-transport.ts`
- `scripts/genesis002-sealed-live-receipt.{mjs,d.mts}`
- `tests/{genesis002ProductionPublisher,genesis002ProductionOperators,genesis002SealedLiveReceipt}.test.ts`

- [x] Require exact clean protected main and materialize source from that commit
  into a private immutable workspace.
- [x] Bind locked dependency closure, root dependencies, executable provenance,
  module artifact/tree, and exact generated ABI.
- [x] Copy and attest the owner-private Spacetime CLI config through a no-follow
  descriptor; sanitize all build, ABI-generation, and CLI child environments.
- [x] Require the alias to be absent before publication and the returned full
  identity to be fresh and different from Genesis 001.
- [x] Verify exact identity-bound fresh zero state immediately after publish.
- [x] Treat every possibly submitted failure as ambiguous/manual reconciliation.
- [ ] Exercise the real locked source-build/cache path from the final clean
  integrated source commit.

## Task 4: Real private-access proof

**Files:**

- `scripts/genesis002-private-loopback-verifier.ts`
- `.github/workflows/verify.yml`

- [x] Publish the actual G002 module to an isolated SpacetimeDB 2.6.1 loopback.
- [x] Import and finalize a complete atlas fixture through all seven writers.
- [x] Prove anonymous and non-admin connection, SQL, subscription, and procedure
  access fail across all 23 tables and seven status procedures.
- [x] Emit only a deterministic privacy-safe pass summary.

## Task 5: Two-phase sealed-launch and auth-bridge gate

**Files:**

- `config/releases/0.4.0-sealed-launch.json`
- `scripts/verify-0.4.0-sealed-launch.{mjs,d.mts}`
- `scripts/verify-admission-request-suspension.{mjs,d.mts}`
- `.github/workflows/{verify,deploy-pages}.yml`
- `src/release/{admissionLaunchPolicy,realmReleaseIdentity}.ts`
- `tests/{admissionRequestSuspensionProbe,sealedLaunchVerifier,notificationPagesPrivateDeployWorkflow,workflowSecurity}.test.ts`

- [x] Keep preparation source at package/lock 0.3.43 with null operational
  binding, approval false, and `sealed-launch-blocked` Pages classification.
- [x] Ensure blocked preparation exits before install, artifact upload,
  environment acquisition, credentials, or deployment.
- [x] Require activation package/lock 0.4.0 and exact non-null G001, census,
  monitor, auth bridge, G002 publish/import/live, atlas, and source-ancestry
  commitments with no extra fields.
- [x] Bind G001 exact production identity, frozen 2ae baseline, baseline ABI,
  freeze nonce, player-access true, and both admission mutation surfaces false.
- [x] Bind G002 zero state, atlas finalized/ready/writes-closed, activation and
  presentation false, and legacy presentation/notification gates false.
- [x] Add a direct live POST+OPTIONS 503 auth-bridge suspension probe and keep
  the status surface read-only.
- [x] Add the blinded census proof producer: re-attest the canonical private
  TXT against its private exporter reference, generate the nonce internally,
  persist a non-overwritable owner-only receipt, and expose only the opaque
  proof digest to the release binding.
- [x] Repeat source and live suspension verification before Pages build and
  deployment.
- [ ] Integrate and exact-match the finalized G001 frozen receipt implementation
  and generated `genesis_001_access_policy_v1` wire from their authoritative
  lane.

## Task 6: Operations and final gates

**Files:**

- `spacetimedb/genesis002/README.md`
- `docs/operations/genesis-002-sealed-launch.md`
- `docs/operations/greater-realm-{activation-client-presentation,production-cutover}.md`

- [x] Document the two-phase order, privacy-safe receipt boundary, reversible
  post-census admission-monitor suspension, and run-admin/CLI-config authority.
- [x] Mark both legacy G001 active-Greater-Realm runbooks superseded and
  refusal-only for this release while retaining their historical detail.
- [ ] Run focused and broad tests, auth-bridge checks, both typechecks, real
  module build, generated-binding diff, real loopback, workflow-order tests,
  and `git diff --check` from the final integrated source.
- [ ] Obtain independent review and address every blocking finding.
- [ ] Split into logical commits and report exact integration and operational
  ordering. Do not refreeze the cross-lane source-closure manifest here.
