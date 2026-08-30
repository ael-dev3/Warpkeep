# Task 6A implementation report

Original Task 6A base: `b5921083509de1b46a254e59dce4baa1b0d9862b`

Closure-sequencing follow-up base:
`c0d07e56cbaf75f73532b9fab9e6f52b94654993`.

Scope: normative documentation only. No Task 6B-6E code, test, workflow,
configuration, package, lock, binding, generated artifact, manifest, pin, or
production/infrastructure mutation was performed.

## Consistency decisions

- Source mode `S` requires checkout HEAD, protected remote `main`, workflow
  input commit, inert preparation binding, and successful Verify SHA to be
  identical. All 20 existing operations are permitted in `S`.
- Outside `S`, only exact activated source mode `A` is permitted. `A` has one
  parent `S`, the exact activated binding, successful Verify, binding/history
  verification, and a raw NUL-safe three-file mode-100644 delta. Only
  `preflight`, `g001-current-state`, `g002-live-inspect`, and
  `ptr-live-inspect` may run in `A`; the other 16 names are S-only.
- G002 and PTR publication precede bridge deployment and use only pinned
  authenticated Spacetime CLI authority plus authenticated read-only CLI
  list/identity postflight. The fresh PTR public identity is installed in the
  protected bridge binding before bridge deploy/reconcile. The release-
  authoritative suspension proof occurs only afterward. Immutable
  `deploymentAuthority` authenticates the prepared receipt, completed journal,
  deployment/version/source, and PTR binding. `g002-import-inspect` and later
  `ptr-import-inspect` each freshly reattest/reprobe, append their own lane
  gate, and issue a gate-bound confirmation consumed within five minutes by
  that lane alone; applies append cross-links to unchanged realm receipts.
- Task 6C defines only the pure canonical publication ambiguity profile
  `warpkeep-sealed-realms-publication-possibly-submitted-v1` with exact ordered
  lane/source/URI/alias/module/release/artifact/toolchain/publish-plan/
  confirmation/nonce/time/state fields plus pure parser/digest and marker-to-
  receipt reconciliation ABIs. It is non-activatable, contains no database
  identity/private field, and claims no durable restart safety. Task 6D publish
  inspect persists its exact bytes no-clobber and fsyncs before returning a
  confirmation or permitting apply, then owns crash/restart adoption, alias-
  absent no-effect reconciliation, and no-replay authority.
- PTR has three distinct mutation-authority receipts/lanes: publication,
  ownerless atlas import, and configured-owner provision. A fourth artifact is
  the distinct read-only live receipt that cross-links the provision proof; it
  carries no additional mutation authority. Publish/import output and receipts
  contain no owner FID or auth epoch.
- The unchanged applicant census and new admitted-player census are separate,
  mandatory two-pass evidence pairs. Both passes are collected by the existing
  census operations, within 60-300 seconds, before one-time monitor suspension.
  The applicant human-readable export remains separately private.
- The admitted-player preferred query is exact bounded machine-parseable
  `SELECT fid, enabled, auth_epoch FROM allowed_fid`; it requires unique
  canonical enabled rows and pre/post aggregate equality. The unchanged-ABI
  fallback enumerates `player_v2` plus existing per-FID status and must
  reconstruct exact aggregate `allowedFids`.
- The admitted-player public profile is consistently
  `warpkeep-genesis-001-admitted-player-census-privacy-safe-v1`. FIDs, epochs,
  count, normalized/raw private set digest, and receipt body remain private.
- Task 6B stops at the private admitted-player census/receipt, nonce/stability,
  opaque profile, and static privacy/source verification. Task 6E atomically
  adopts that receipt into the activation boundary. The activation envelope is
  exactly 19 keys after adding
  `g001AdmittedPlayerCensusPrivateReceipt` and, after G001 current state, the
  dedicated `authBridgeSuspensionPrivateReceipt`; the public binding has exactly 17
  opaque commitments. Production generation is an authenticated activation
  bundle followed by an independent builtins-only verifier. The dispatcher,
  verifier, and upload share only exact fixed path
  `~/Library/Application Support/Warpkeep/operations/runtime/sealed-realms-v1/public/0.4.0-sealed-launch.json`.
- The bridge private receipt uses exact profile
  `warpkeep-sealed-realms-auth-bridge-suspension-private-v1` and binds the
  prepared receipt canonical body/digest, `S`, and expiry; completed journal
  head/digest plus run/attempt/deploy-or-recovery chain; fresh private/public
  deployment and credentialed binding attestations; deployment ID/latest Worker
  version/source commit; PTR identity/binding digest; import and fresh
  activation POST/OPTIONS evidence, timestamps, distinct nonces, digests, and
  freshness/chronology links. `activation-evidence-inspect` always freshly
  re-probes; the generator rejects external bridge-field injection and derives
  the existing public bridge source commit/digest/commitment from this member
  only after both candidate bridge-derived fields are exactly null.
  Public commitment count remains 17.
- Bridge authority is append-only. Expired/ambiguous confirmations never
  revive; same-lane reinspection must prove no effect before superseding a gate
  or adopt the exact submitted receipt without replay. No gate is added after
  prepared-receipt expiry. A completed earlier realm cannot authorize the
  missing later lane. The sole recovery is protected workflow internal action
  `recover-expired-authority-read-only`, entrypoint
  `runAuthBridgeNotificationPreparedReadOnlyRecovery`, outcome
  `verified-read-only-recovery`; it adds no dispatcher operation. The deploy-
  callback top-level receipt writer is explicitly not reused. The new export
  uses a read-only Cloudflare resolver that enumerates deployments/latest
  uploads, inspects the exact old version, requires it uniquely latest deployed,
  supplies fail-if-called upload/release/deploy callbacks, performs fresh
  protected-run/`S`, control-plane/public/private/PTR-binding attestations, and
  writes one new content-addressed receipt plus completed no-deploy recovery
  head. The old chain remains byte-identical and terminal.
- A recovered physical authority file is deterministically named
  `auth-bridge-import-authority-<authorityChainDigest>.jsonl` from the canonical
  new receipt/head/deployment/version/PTR-binding tuple. No caller selects it;
  orphan/duplicate eligible pairs or heads, old-chain revival/mutation, or
  drift fail closed. Existing G002 inspect/apply re-adopts its completed
  immutable receipt through a new dispatcher branch that never calls its import
  core/reducer. PTR uses the equivalent branch for a completed receipt or proves
  no effect and calls the missing import core/reducer once.
- Exact physical bridge-log grammar is one `deploymentAuthority`, zero-or-more
  abandoned G002 gates, one final consumed G002 gate, one
  `g002ImportAuthorityCrossLink`, zero-or-more abandoned PTR gates, one final
  consumed PTR gate, then one `ptrImportAuthorityCrossLink`. Each new gate names
  its immediately superseded same-lane predecessor; the old gate is never
  modified and only the final gate is cross-linked. Forks, cycles, skipped
  predecessors, or a gate after its lane cross-link fail closed.
- Time-sensitive G001 policy/census/suspension/current-state evidence runs only
  after G002/PTR publication, bridge deploy/suspension proof, both atlas imports,
  and PTR owner provision/live inspection, immediately before generation.
- Production uses fixed signed Node 22 plus four authenticated checked-in ESM
  bundles. It performs no npm/pnpm/tsx/root-node-modules/download/install and
  requires `globalThis.WebSocket` before secrets or network work. The sole
  shell exception is exact authenticated frozen G001 envelope execution; that
  envelope alone validates the fixed ChatGPT Node 24 candidate at run time.
- Existing subsystem roots are never created/repaired; only
  `sealed-realms-v1` children and canonical bounded owner-private no-clobber
  files are created. Confirmations are consumed before mutation, and ambiguous
  reconciliation state can never reactivate a confirmation or replay a
  submitted publication/reducer.
- Preparation Task 6 is split sequentially into 6A documentation, 6B admitted-
  player evidence, 6C publisher/PTR authority separation, 6D dispatcher/source
  authority/private state/lane entries/reconciliation, and 6E workflow/public verifier/activation
  schema/CI. Each has an exact surface, TDD order, review gate, and required
  subject. Task 6C now owns same-commit migration of the sealed-launch verifier,
  declaration, tests, interim byte pins, and semantic publication -> ownerless
  import -> configured-owner assertions. Task 6D owns the explicit private
  bridge state source/declaration/test. Task 6E owns 19-key adoption and bridge
  derivation/injection tests plus the exact adapter/entrypoint/Cloudflare
  runtime/receipt/journal/workflow/declaration/tests for expiry recovery.
  Task 6C's corrected exact tests include
  `tests/genesis002ProductionOperators.test.ts` and
  `tests/ptrProductionCli.test.ts`. Task 6E explicitly overrides Task 6D's
  read-only receipt/journal limit only for the new writer ABIs. These sources
  are raw-file closure members. Exact manifest intersection establishes
  that Task 6B changes two current raw members while refreeze remains forbidden.
  The raw closure was already stale from Task 1; only the Task 6B verifier
  declaration becomes newly stale because the implementation was already
  stale, moving 18/979 to 19/979. Task 6C's formal surface intersects 21 current
  raw members total, including those same two; it adds 19 newly distinct members
  to that surface, so the planned set union remains `2 + 19 = 21`. The approved
  Task 6C final tree instead changes 18 raw members: 10 already stale plus 8
  newly stale, moving 19/979 to 27/979. Tasks 6B through 6E continue the already-
  stale, fail-closed interval. No prepared/live workflow executes
  from any Task 6B-6E intermediate commit. Their focused review gates exclude
  full-green closure claims and require pin-dependent cases to fail closed until
  Task 7 atomically refreezes every closure/pin consumer and full verification
  is green. Revised Task 7 deterministically builds four
  ABI-bearing bundles plus declarations and uses one closure-refreezer path to
  atomically derive/refreeze the closure policy/generator/manifest, full exact-
  count consumer set, bundle manifest/digests, workflows, dispatcher/bootstrap/
  bridge-state/canary/activation generator/verifier/public-verifier pins, and
  declarations/tests. The first run must be complete and green and the second
  full-surface refreeze zero diff; stale/tampered/missing consumers fail and
  G001 bindings remain byte-identical.

## Producer-to-consumer audit

1. Exact `S` plus preflight produces only source/tool/root authority; it does
   not claim the later bridge-suspension fact.
2. G002 and PTR publish inspections produce one-time confirmations; apply lanes
   consume them before submission and internally authenticate read-only CLI
   identity postflights. Before callback release, Task 6D durably persists the
   pure Task 6C possibly-submitted marker. Ambiguity or crash returns only to
   the same inspect lane for exact adoption or alias-absent/no-effect proof.
3. The PTR publication receipt produces the public identity consumed by the
   protected bridge binding and later ownerless import; no owner evidence is
   present.
4. Bridge deployment consumes exact `S`, predecessor evidence, and the fresh
   PTR identity. Dispatcher inspection authenticates one immutable
   `deploymentAuthority`. `g002-import-inspect` freshly reattests and probes,
   appends `g002Gate`, and only then produces its gate-bound confirmation.
5. G002 apply consumes `g002Gate`, retains its immutable import receipt ABI,
   and appends `g002ImportAuthorityCrossLink`. Afterward PTR inspection reopens
   the same authority, freshly reattests/reprobes, and appends independent
   `ptrGate`; PTR apply consumes it and appends
   `ptrImportAuthorityCrossLink` to the zero-owner atlas receipt it produced.
   PTR owner inspection consumes that exact import;
   provision alone consumes live G001 owner authority and produces the private
   owner receipt; read-only live inspection cross-links it.
   If receipt expiry interrupts the lanes, the protected read-only recovery
   produces a new receipt/head and physical authority file with zero deploy,
   publish, or reducer callbacks; G002 is re-adopted before PTR continues.
6. The two G001 operations produce pass one/pass two of both census pairs.
   Second inspection produces the suspension confirmation; suspension consumes
   it before mutation; current-state produces the fresh final monitor proof.
7. Activation inspection consumes every private predecessor, requires both
   lane gates/cross-links to bind the same deployment/source/PTR binding,
   freshly reattests and re-probes POST/OPTIONS,
   writes `authBridgeSuspensionPrivateReceipt`, and issues the generation
   confirmation. Generation consumes it, rejects caller-injected bridge fields,
   constructs the exact 19-key envelope, and writes only the fixed-path public
   binding. The
   independent verifier consumes only that fixed-path artifact before upload.
8. Successor `A` consumes the verified public binding and changes exactly the
   binding, package, and lock files. Post-activation consumers are restricted
   to the four read-only operation names before Pages, tag, and release.

No CLI postflight, bridge deploy/reconcile, G001 launch cleanup, admitted-player
collection, public artifact verifier, or post-activation read was coined as a
21st operation; each is internal/external work owned by an existing operation
or protected workflow.

## Changed files

- `docs/superpowers/specs/2026-08-30-warpkeep-0.4.0-sealed-realms-release.md`
- `docs/superpowers/plans/2026-08-30-warpkeep-0.4.0-preparation.md`
- `docs/superpowers/plans/2026-08-30-warpkeep-0.4.0-release-operations.md`
- `docs/operations/genesis-002-sealed-launch.md`
- `docs/operations/access-requests.md`
- `docs/operations/genesis001-admission-monitor-suspension.md`
- `.superpowers/sdd/2026-08-30-warpkeep-0.4.0-preparation/task-6a-report.md`

## Verification evidence

- Complete read: the original Task 6A brief, the closure-sequencing follow-up
  brief, all six allowed normative documents, and this report were read before
  the sequencing edit; the six documents and report were re-read as one
  producer-to-consumer graph.
- Contradiction scan: no stale `17-key`, `seventeen`, `sixteen commitments`,
  bridge-before-publish, combined PTR import/provision, all-operations-after-A,
  applicant-only, or unqualified generic no-shell statement remains. The sole
  `npm ci` match is explicitly a CI/developer preparation check, never a
  production runtime install. The sole no-shell match explicitly preserves the
  frozen-envelope exception.
- Review correction: all three Major findings in `task-6a-review.md` are
  explicitly closed: Task 7 owns the full real derivation consumer set and
  convergence/tamper contract; Task 6C owns same-commit verifier pin/semantic
  migration; and the bridge deployment/import/activation evidence edge is
  authenticated through existing operations with a dedicated nineteenth
  private member and unchanged 17-public-commitment boundary.
- Rereview correction: the single shared five-minute gate was replaced by
  immutable deployment authority plus independently fresh G002/PTR lane gates,
  exact one-way append-only revision grammar, final-gate-bound confirmations/
  cross-links, fork/cycle/skipped-predecessor rejection,
  no-effect/adoption and supersession rules, prepared-receipt expiry behavior,
  and the full expiry/revival/replay/drift/order/substitution negative matrix.
- Third-review correction: prepared-receipt expiry now has one exact owned
  protected workflow action/export/outcome, new content-addressed receipt and
  completed recovery-head schema/linkage, deterministic new physical chain,
  byte-identical terminal old chain, G002-then-PTR re-adoption/no-effect order,
  and no-deploy/no-publish/no-reducer/crash/duplicate/revival adversarial tests.
  Task 6E owns every required adapter/runtime/receipt/journal/workflow/
  declaration/test surface. Task 6C's exact nonexistent test path is corrected,
  PTR CLI coverage is included, its pure marker ABI is exact, and Task 6D owns
  durable persistence/reconciliation/no-replay completion.
- Fourth-amendment source trace: the plan records that the current top-level
  receipt writer always invokes its deploy callback; the new recovery entrypoint
  instead uses an exact-version, unique-latest, read-only Cloudflare resolver
  and never calls the deploy adapter executor. Task 6D adoption branches under
  the existing operation names never call the current G002/PTR import cores;
  only an authenticated missing PTR no-effect result permits one core/reducer
  call. Task 6E's recovery writers explicitly supersede Task 6D's read-only
  receipt/journal limit and continue the already-stale, non-runnable raw-file-
  pinned interval. That interval began at Task 1; Tasks 6B through 6E continue
  it until Task 7 atomically refreezes the full closure.
  The marker
  producer binds exact publish-plan and confirmation digests and supplies pure
  parser/digest/reconciliation ABIs, including PTR submission-error adoption.
- Post-Task-6B manifest-intersection sequencing correction: Task 6B's exact
  six-file commit changes two existing raw closure members,
  `scripts/verify-0.4.0-sealed-launch.mjs` and its declaration while refreeze
  remains forbidden. Immutable Git-object recomputation shows the 979-member
  manifest was current at `b450df45c` and first became stale at Task 1 commit
  `73792442b` (1/979, `.github/workflows/verify.yml`), then progressed through
  Tasks 2-5 as 4/979, 11/979, 16/979, and 18/979. Task 6A remained 18/979; only
  the Task 6B verifier declaration became newly stale because the implementation
  was already stale, moving the count to 19/979. Task 6C's formal planned
  surface intersects 21 current raw members total and overlaps Task 6B on those
  same two verifier paths. It therefore adds 19 newly distinct formal-surface
  members, preserving the planned set union `2 + 19 = 21`. Those set counts
  establish neither the actual stale-interval origin nor Task 6C's final changed-
  member count. The approved Task 6C tree changes 18 raw members: 10 already
  stale plus 8 newly stale, yielding 19/979 to 27/979. Tasks 6B through 6E
  continue the already-stale, fail-closed interval. This corrects only the
  closure timeline, not realm authority,
  receipts, publication markers, recovery, or operation semantics. Task 6B's
  focused census/static-verifier/typecheck/diff/frozen-byte checks and Task
  6C's focused publisher/import/owner/verifier suites may pass, while closure-
  dependent cases remain expected fail-closed. Task 7 is the sole restoration
  point through one complete green atomic refreeze and a zero-diff second
  refreeze before workflow execution.
- Raw-member evidence: intersecting the exact Task 6B six-file commit with
  current `raw-file-sha256-v1` closure members yields exactly the verifier
  implementation and declaration. Intersecting the Task 6C exact planned
  surface yields 21 current raw members total: 18 explicitly named paths plus
  the G002 publisher, PTR publisher, and sealed-launch verifier declarations.
  The verifier implementation/declaration are the two-member overlap, leaving
  19 newly distinct Task 6C members and a 21-member union through Task 6C. The
  sequencing-only diff leaves all six Task 6B file bytes
  identical to follow-up base `c0d07e56cbaf75f73532b9fab9e6f52b94654993`.
- Exact allowlist: the base list and each new canonical list contain exactly 20
  entries and compare equal in spelling and order. A scan of backticked
  G001/G002/PTR/activation operation tokens found no additional operation name.
- Protected blobs: `git diff --quiet` against base returned exit 0 for the full
  `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS`, package/lock/release binding,
  and both reviewed G001 launch-envelope text files.
- Allowlist/diff checks: the cached name set compared exactly equal to the seven
  allowed paths; cached `git diff --check` returned exit 0.

## Residual fail-closed infrastructure gates

This Task 6A follow-up does not verify or claim any live realm identity, alias
absence, Spacetime query availability/shape, authenticated CLI postflight,
production runner ownership/labels, fixed Node code signature, ChatGPT Node candidate,
`globalThis.WebSocket`, CLI configuration, private-root filesystem contract,
bridge deployment/reconciliation, live suspension probe, receipt, confirmation,
bundle build/attestation, deterministic refreeze, macOS native contract, Pages
deployment, tag, or release. Tasks 6C-7 and the protected operations plan must
verify these in order. Every missing, ambiguous, stale, mismatched, leaking, or
unavailable fact blocks release.

## Final pre-commit checks

- Cached `git diff --name-only`: exact seven-path allowlist, count 7.
- Cached `git diff --check`: exit 0.
- Cached G001 projection comparison against base: exit 0.
- Cached package/lock/release-binding comparison against base: exit 0.
- Cached reviewed-envelope comparison against base: exit 0.
- Cached Task 6B six-file byte comparison against follow-up base: exit 0.
- Cached raw-member sets: Task 6B intersection 2; Task 6C intersection 21;
  overlap 2; Task 6C newly distinct 19; union through Task 6C 21.
- Planned single follow-up commit parent:
  `c0d07e56cbaf75f73532b9fab9e6f52b94654993`.
- Planned exact subject: `Correct sealed realms closure sequencing`.
- Clean worktree is verified immediately after the commit and reported to the
  delegating controller.
