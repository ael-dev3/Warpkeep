# Continue Warpkeep 0.4

## Active release checkpoint — 7 October 2026, after corrected-source batch

The only open Warpkeep PR is draft #385 against `main`, now at signed source
`e2488c735971a34283810ea6a063e211f1e552de` on
`release/0.4-living-realm-quality`. This correction retains the best compatible
own-terrain Lowlands-repair pair plus one permitted non-Lowlands donor pair
under the existing two-pair cap. It preserves geometry, ownership, proofs and
all other limits. Its deterministic regression, typecheck and focused Windows
suite passed; pinned Linux typecheck and the apron/rejection/generator suites
passed 53/53.

One fresh-seed batch on that exact source exhausted 256 attempts in about 42
minutes 45 seconds with `GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE`: 222
geography rejections and 34 proof-rejection attempts. Bundle-pair limit was
terminal in 123 geography attempts; the search-node, complete-plan and
bundle-option limits were terminal in 26, 11 and 5. The sanitized profile is
in [local operations](../../evidence/0.4.0/local-operations.md). The
authenticated reader zeroized the recovered root seed. The maintained abort
returned `checkpointAborted: true` and `productionUntouched: true`; selection
readiness passed. No candidate, package, shortlist, selection, atlas, provider
request or production mutation resulted. Do not replay or relabel the retired
checkpoint, and do not infer causation from independent seed profiles.

Read-only live checks on 7 October returned HTTP 200 for the Alpha root, 404
for custom-domain `/ptr/`, and 200 for the Pages preview `/ptr/`. Alpha remains
available; owner PTR is not live on the custom domain. GitHub Actions remains
disabled; the push did not create a workflow run. No additional open PRs are
waiting for integration.

Next executable work: trace the remaining bounded pair/option/node/plan search
and proof failures to a deterministic local counterexample. Make only a
demonstrated correction that preserves every existing limit and proof, validate
it locally, publish one signed source checkpoint, and run one fresh
source-bound batch. If it yields an eligible candidate, verify the private
package, shortlist and inspection before selection; then continue the
source-bound atlas, isolated PTR update, owner, bridge/frontend, cutover and
authenticated owner plus Alpha acceptance in dependency order. Preserve
rollback and Alpha/G001/G002. No hosted CI or deployment is implied by source
publication.

## Previous release checkpoint — 7 October 2026 (superseded by `e2488c73`)

The only open Warpkeep PR is draft #385 against `main`; verify its exact signed
head before every source-bound operation. PR #394 and #399 have merged
remotely; their canonical P3 plan-path and Cloudflare legal-text
header/postflight fixes are in #385. The #397 allowance was already present,
and stale PRs were closed as incorporated or superseded.

The fresh exact-source `.22` run on signed documentation-only successor
`fb55117a` exhausted all 256 attempts without an eligible candidate: 221
geography rejections and 35 proof-rejection attempts. The 2,048-pair frontier
was terminal in 134 geography attempts; search-node and complete-plan limits
appeared in 29 and 17. This independent-seed run did not show improvement over
`.21` (124 pair-frontier terminals in 221 geography attempts). Its sanitized
aggregate and maintained abort/readiness checks are in
[local operations](../../evidence/0.4.0/local-operations.md). The checkpoint
was aborted with production untouched and no completion receipt.

Revision `.23` raises the separate per-child ranked bundle-option cutoff from
64 to 128 in both ordinary and Lowlands repair searches. The 2,048 raw-pair
cap, 320,000-node and 256-plan bounds, terrain-seed namespace `.3`, ownership,
geometry proofs, and candidate eligibility remain unchanged. The exact signed
`.23` implementation `483ac590cbb3ae7febc3fb093ad143744ec413d2` passes
TypeScript checking and 52/52 focused Windows tests, then 134/134 across the
four focused Linux suites in 554.87 seconds with all 11 locked packages
verified (about 5.5% slower than `.22`).

A fresh `.23` candidate batch bound to that exact source exhausted 256 attempts
in about 40½ minutes without an eligible candidate: 220 geography rejections
and 36 proof-rejection attempts. The pair-limit terminal appeared 127 times,
the child-option limit once, the search-node limit 24 times, and the
complete-plan limit 17 times. Compared with independent `.22` seeds, this is a
modest shift, not evidence that the cap alone will produce a candidate. The
maintained abort returned `checkpointAborted: true` and
`productionUntouched: true`;
selection readiness is true, no completion receipt exists, and the private
workspace is down to one file, seven directories, and 70 bytes. See the full
sanitized tables in [local operations](../../evidence/0.4.0/local-operations.md).

The second independent `.23` batch on exact signed source `387f6b81` also
exhausted 256 attempts without an eligible candidate: 225 geography rejections
and 31 proof-rejection attempts in about 35 minutes. The pair-limit terminal
appeared 126 times, the search-node limit 27 times, and the complete-plan limit
17 times. The maintained abort confirmed production untouched and selection
readiness true, with no completion receipt. Full safe aggregates are in
[local operations](../../evidence/0.4.0/local-operations.md).

The two fresh seeds do not establish that the pair cap caused failure. The
single-code rejection projection also hides downstream truncations behind the
higher-priority pair-limit code. Source inspection did establish a concrete
bounded-search omission: `bundleOptionsFor` sorts a requested child's own
bundles first and then slices to 128, so a full own-child prefix can remove all
borrowed bundles from later child origins before sibling compatibility is
tested. Generator `.24` now preserves the first ranked option from each source
child within the existing 128-option budget, then fills remaining slots in the
original ranking order. It retains all geometry, ownership, proofs, seed
namespace, pair/node/plan limits, and candidate eligibility. The new
deterministic regression, the other two platform-neutral focused suites, and
Windows typecheck pass (52/52 tests). The private candidate-package fixture
hits the known Windows temporary-directory ACL guard, so it remains for pinned
Linux verification; the guard was not weakened. The exact signed `.24` source
is now on the pinned Linux runner. All four focused suites passed 134/134
(533.90 seconds wall, 599.89 seconds summed test time), and the typecheck
passed after restoring the nested auth-bridge dependencies specified by Verify.
The first fresh-seed maximum-256 batch exhausted all attempts in about 39
minutes without an eligible candidate: 219 geography rejections and 37
proof-rejection attempts. A second independent batch on exact signed successor
`f8d5b4af` also exhausted all 256 attempts: 219 geography and 40 proof
rejections. Across the two batches, the dry gate-apron bundle-pair limit was
terminal in 268 of 438 geography rejections; search-node and complete-plan
limits remain separately bounded. Both maintained checkpoints were aborted
with production untouched, no completion receipt, and selection readiness true.
The full sanitized aggregates are in
[local operations](../../evidence/0.4.0/local-operations.md).

That repeated truncation justified `.25` increasing the retained per-child
bundle-pair frontier from 2,048 to 4,096, while preserving the 128 child-option
bound, 320,000 search-node bound, 256 complete-plan bound, terrain seed
namespace `.3`, geometry, ownership, proofs, and candidate eligibility. Signed
source `a10a7d1f` passed the four focused Linux suites (134/134) and exact-source
typecheck. Its fresh-seed maximum-256 batch exhausted in about 35 minutes with
229 geography rejections and 27 proof-rejection attempts; the pair frontier
remained terminal in 152 geography attempts, with search-node and complete-plan
limits in 29 and 12. The maintained abort confirmed production untouched and
selection readiness true. Safe details are in
[local operations](../../evidence/0.4.0/local-operations.md).

The `.26` candidate-generation change is based on signed source
`c855c79bbf573809fdc1ac0f7e658f27b60d2a22`, pushed to open draft PR #385;
its post-run evidence is recorded in a docs-only successor. That source
preserves an ordinary match, then invokes the
separately capped Lowlands repair lane after ordinary no-match, node-limit, or
complete-plan-limit. A successful repair still passes the shared allocator
commit path and all final proofs; an unsuccessful repair preserves the
ordinary typed limit. The 8,192 pair cap, 128 child-option cap, 320,000 search
nodes, 256 complete plans, geometry, ownership, proof thresholds, and `.3`
terrain namespace remain unchanged. This corrects the earlier behavior that
could discard a valid bounded repair result when ordinary search hit its cap.

Pinned Linux Node `22.22.3` verified all 11 toolchain packages. Six focused
suites passed 178/178; the integrated fixed rejection fixture was rerun
afterward and passed 21/21 with an assertion that both lanes execute after its
ordinary node limit. Pinned Linux typecheck passed. The fixture still rejects;
it demonstrates the lane is reached, not that its current frontier yields a
candidate.

One fresh-seed batch on exact source `c855c79b` exhausted all 256 attempts in
about 36 minutes without an eligible candidate: 229 geography rejections and
27 proof rejections. The authenticated checkpoint showed bundle-pair
truncation in 180 geography attempts, bundle-option and each Lowlands-repair
cutoff in 190; all four co-occurred in 180 attempts. The maintained abort
returned production untouched and selection readiness passed. Do not widen
caps or repeat blind seeds: the candidate remains the first release gate.

Follow-up source review found the repair capacity frontier was derived before
the ordinary search, even when ordinary search later succeeded. The repair
frontier is now memoized and built inside the fallback thunk, which the
two-lane sequencer invokes only after ordinary no-match or a bounded limit.
This removes unnecessary repair derivation from successful ordinary attempts
and prevents repair-preparation failures from preempting an ordinary match.
Caps, ranking, ownership, geometry and proof gates are unchanged. Pinned Linux
typecheck and 53 focused tests pass; the fixed ordinary fixture retains its
exact digest, and the rejection fixture still reaches both lanes. A same-runner
candidate-generator timing was 70.12 seconds with lazy repair versus 71.45
seconds before it; this single-run difference is too small to claim a measured
end-to-end speedup. No new private batch was run. Continue inspecting the
bounded Lowlands-repair ranking/retention path for a deterministic case proving
that a valid eligible plan is pruned; keep the current caps and proofs fixed.
Full sanitized counts are in
[local operations](../../evidence/0.4.0/local-operations.md).

That trace found a per-child own-first mismatch: the donor fallback discarded
an available own bundle for both siblings when either side lacked a compatible
own pair. The fallback now retains each requested child's own bundle first and
adds non-Lowlands donor options after it; Lowlands remains excluded as a donor.
Every borrowed choice still requires the existing count-balanced repartition,
512-cell footprint bound and final proofs. The policy regression failed before
the change and passes afterward. The pinned fixed rejection fixture still
reaches both lanes and rejects at the same ordinary search-node limit, so this
has not yet produced a candidate. No cap was widened and no seed batch was
repeated. Continue tracing retained pair/assignment alternatives without
claiming release readiness.

The live Alpha returned HTTP 200 and `/ptr/` returned HTTP 404 on 7 October.
Root production dependencies audit clean, but the development toolchain has
two high advisories recorded in local operations for follow-up. GitHub Actions
are disabled, so local verification and branch publication are not hosted CI
or deployment evidence.

The earlier `64 → 128` pair-cap correction passed 51/51 focused gate-apron,
rejection, and generator tests on Windows Node `24.19.0`, plus TypeScript
checking. The pinned Linux Node `22.22.3` toolchain preflight verifies. Its
installed Vitest entrypoint runs directly with
`node node_modules/vitest/vitest.mjs` even though the `.bin` shim is absent.
The exact signed `.20` source passed 133/133 across the four focused suites on
Linux Node 22. The `.21` implementation at signed commit `435586b7` passed
133/133 across the four suites on Linux Node 22. The `.22` implementation at
signed commit `5c041085` also passed 133/133 on Linux and 51/51 focused tests
plus typechecking on Windows Node 24.19.0. Generation stays pinned to Linux
Node 22.
Windows `npm run typecheck` and the full production build pass; the build
retains the known 677.52 kB `RealmMapScreen` chunk warning. The five changed
Pages suites also passed 63/63 on the prior exact source. The attempted Linux
`pnpm run build` had auto-run an install against the npm-managed dependency
tree; the original packages were restored, generated pnpm artifacts removed,
and the pinned toolchain verifies. Avoid `pnpm run` in that WSL checkout.

The live Alpha root still returns HTTP 200; `/ptr/` returns HTTP 404. Preserve
the existing Alpha and its licensing. There is no eligible Atlas package, no
PTR cutover, and no authenticated 0.4 owner acceptance. GitHub Actions are
disabled; local validation and branch publication do not count as hosted
Verify or deployment.

After an eligible batch, verify the private package and sanitized review before
selection under the existing `OWNER-EXPLICIT-0.4-SHIP` reference, then complete
owner/atlas, bridge, frontend, and cutover in dependency order. Keep Alpha and
rollback evidence intact. Do not relax proofs, use Actions, or claim
deployment/PTR acceptance.

## Previous cap-192 checkpoint — historical

The previously published cap-192 candidate `54889099e464862e936459b30da2e681257aadbf` (tree
`261f074d85bb5197fabb737a0368c2a5bab56f52`) is the baseline at open draft PR
#385. The cap-192 change raises only the raw Tier-II edge frontier. The 32-pair
cap, repair budgets, complete-plan/node limits, ownership rules, and candidate
proofs remain fixed. This signed successor corrects incomplete-search
diagnostics without changing eligibility, proofs, or budgets, and corrects
the exact public-boundary source allowance from two occurrences to three.
Windows typecheck and all 51 focused apron/rejection/generator tests pass; the
public-boundary verifier passes with 3,459 tracked paths and 1,929 scanned
entries. The pinned Linux Tier-II fixture passed on the preceding classifier
commit (1 pass, 1 skipped; 15.99 seconds test time, 17.00 seconds total). The
full Windows-hosted test sweep reported native-filesystem and runner-sensitive
failures and was stopped before completion. Its result is inconclusive; the
full check must run under the pinned Linux/Node 22 toolchain. The fixture is
not a whole-generator performance guarantee.

Two independent fresh-seed cap-192 batches on this exact commit both exhausted
all 256 attempts with `GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE`. They recorded
214 geography / 42 proof-rejection attempts in 35:58 with 513,440 KiB peak RSS,
and 221 geography / 35 proof attempts in 36:56 with 700,684 KiB peak RSS. The
complete authenticated aggregates are in [local operations](../../evidence/0.4.0/local-operations.md).
Both reads matched source, generator `greater-realm-v2-natural-continent-pr-a.19`,
Node `22.22.3`, and the verified `linux-x64` toolchain (11 packages). Both root
seeds were zeroized. The first maintained abort returned
`checkpointAborted: true` and `productionUntouched: true`; the second returned
`GREATER_REALM_ATTEMPT_CHECKPOINT_MISSING`, with no checkpoint or active
generator process remaining in its isolated workspace. Neither produced a
candidate, package, shortlist, selection, atlas operation, provider request,
or production mutation. The default retained-seed workspace was untouched.

At cap 192, prioritized frontier codes reported edge truncation in 75 and 55
attempts and pair truncation in 23 and 28. Since edge diagnostics have priority
over pair diagnostics, edge-coded attempts can also contain pair truncation.
The samples used independent seeds and are not paired cap comparisons. They
show the current search remains bounded at both frontiers, but do not prove
that any omitted option would pass the complete geometry and ownership proofs.
The pair-ranking helper was reviewed; its deterministic endpoint-balanced
selection has no reproduced correctness defect. A diagnostic defect was
reproduced in the source path: when no assignment survived, a truncated
frontier could still be reported as a definitive missing parent or capacity
failure. The local correction gives known truncation priority and has focused
tests; it does not change candidate eligibility, geometry proofs, or search
budgets. Historical cap-192 labels remain as emitted and cannot establish an
untruncated root cause.

Stop cap-only iteration here. The next bounded source step is to publish the
scanner-allowance correction and run the complete local check under pinned
Linux/Node 22. Then use fresh exact-source rejection evidence before changing
allocator behavior. Do not change caps, proof thresholds, or infer parent-slot
root causes from historical truncated runs. Do not touch the retained-seed or
serialization checkpoints.

The pre-push GitHub inventory covers 3,807 runs in 39 pages: 3,836 attempts,
28 records with reruns and all 57 rerun attempts inspected. All runs and
attempts are completed; Actions permission is disabled. The authenticated
owner PTR and Alpha acceptance, release integration, hosted verification,
and public cutover remain unverified.

## Previous generation diagnosis — historical

The signed `a18930b4` source introduced the parent-specific diagnostic:
exactly one missing parent maps to Crownwood, Ironveil, or Glasswater; multiple
missing parents retain the generic code, and lane-split/capacity outcomes stay
distinct. The signed `de1a5f63` follow-on correction is published and passes 27
focused apron/rejection tests, all 21 generator regressions, typecheck, and diff
checks. It preserves child zero's own Lowlands reserve bundles while limiting
donor bundles to other non-Lowlands children; it does not relax geometry,
proofs, or caps. The latest independent sample has 96 generic apron
no-matches, 1 no-match after the Lowlands repair check, 8 complete-plan limits,
30 search-node limits, and 32 Crownwood parent-slot misses. Generic no-match
does not demonstrate that those plans reached the final apron solver. Inspect
the generic no-match path and Crownwood sibling-pair frontier separately;
another private seed is unwarranted until a concrete threshold-preserving
defect is reproduced and fixed. Do not replay retired checkpoints.

Signed source `0109aaf0e3a5c8b0d9614180b9e027fb1d5be59c` adds safe apron
no-match stage classification only. It reports the furthest rejection stage
reached by any complete plan and preserves the generic legacy code when no
complete plan reaches acceptance. It changes no candidate acceptance, geometry,
ownership, thresholds, caps, or search limits and exposes no seed or
coordinates. Typecheck and 48 focused rejection/apron/generator tests pass. A
separate public ordinal-18 full-candidate fixture reaches both apron lanes but
then fails closed at `PRIMARY_COMPONENT_UNDERSIZED`; that post-search capacity
failure remains visible and must not be called a passing candidate. The fresh
bounded private batch on this exact source is complete and retired; its
classification is summarized above. Do not rerun the same source or seed.

The release route and hydrology correction are recorded in [issue #384](https://github.com/ael-dev3/Warpkeep/issues/384#issuecomment-5995094139). On 5 October the owner delegated remaining release decisions to the release lead. Preserve the Alpha root, G001 state and admission freeze; keep G002 sealed. Actions is disabled; preserve that hold and its downstream Pages chain. Continue local verification and Git synchronization; never represent a branch push as CI or deployment. The `Verify` workflow is triggered for pull requests and pushes to `main`; Pages deployment listens to successful `Verify` runs for `main` pushes.

The preceding private searches used signed sources `cff3479`, `c7c494b` and `2c5f0d3`; PR #385 remains open and draft. The `2c5f0d3` batch exhausted all 256 ordinals without an eligible package, shortlist or selection. Its authenticated safe summary was synchronized, then the maintained abort API returned `checkpointAborted: true` and `productionUntouched: true`. The signed successor `fee38320f81f54647e17ed8351b3f2a4b45199dc` fixes the demonstrated Lowlands fallback gap: after all compatible own sibling pairs fail existing geometry checks, it tries compatible bundles borrowed from other non-Lowlands children. Lowlands and the requested child are excluded as donors; all caps and proofs remain unchanged. Signed source `40f5c708a92b765232e0d35c139eaf765ba8ab66` separates missing sibling pairs from component-capacity-infeasible assignments in the safe rejection code, without changing map rules, geometry, thresholds or caps. Its exact-source 256-attempt private batch exhausted with no eligible candidate (`GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE`): 219 geography rejections, 37 proof-rejection attempts, with `ASSIGNMENT_MISSING` in 65 attempts and `CAPACITY_ASSIGNMENT_INFEASIBLE` once. The complete safe aggregate is in [local operations](../../evidence/0.4.0/local-operations.md). Signed commit `d9ff3157` synchronized this summary; at `2026-10-05 21:25:13 UTC`, the maintained abort API returned `checkpointAborted: true` and `productionUntouched: true` on exact source `40f5c708a92b765232e0d35c139eaf765ba8ab66`. The hydrology correction, frozen PTR water catalog, Alpha source restoration, sealed-launch verifier repair, closure pins, stale SFX closure test, and evidence notes remain committed and pushed. The previous `GR-A-WB4ATWJNGTDQCGGH` / H19/T03 candidate is invalid for the corrected source and cannot be relabeled or resumed. The retained hydrology diagnosis remains read-only and source-bound: verifier receipt `9561974f29bfb5236fd5c321069b3ceb9837d72210ff8215a26fc8ff5b5bbfa0`; independent postcheck claim `4b9ac9ff5591fedc912852ec1c337311ea154d57d484e1ea05501f491e486fcd`. It covers only the approved downhill equal-flow and frozen Alpha Ocean terminal cases; every other flow, terrain, regime-transition, direction, body, and Alpha-row check remains mandatory.

The exact-source follow-on batch ran once on signed `8bd8de9d5673fe63dff73bc9196fb9c953b61f3a` with a fresh seed and 256 attempts. It ended with `GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE`, no candidate or provider operation, and a safe read of 223 geography rejections plus 33 proof-rejection attempts. `GATE_PARENT_SLOT_MISSING` appeared 81 times, capacity infeasibility twice, and `ASSIGNMENT_MISSING` zero times. Signed commit `a2c3589e` synchronized the aggregate; at `2026-10-05 22:28:22 UTC`, the maintained checkpoint abort returned `checkpointAborted: true` and `productionUntouched: true` on exact source `8bd8de9d5673fe63dff73bc9196fb9c953b61f3a`. Do not infer causality from the independent fresh-seed profile.

Native targeted validation passes 455 cases across the 13 affected files, including the full 8-case PTR prepared-closure file on `e1ac103`. The checked-in sealed-launch gate passes in preparation mode and the protected browser closure verifies 1,271 members. Root/PTR builds, module verification, catalog generation checks, and focused hydrology/PTR suites pass. The full runtime-release suite retains the Windows private-temp ACL limitation; do not weaken its guard. Actions is disabled, so no hosted check or deployment follows from the successful Git push.

The follow-on Tier-II assignment diagnostic now emits existing `GATE_PARENT_SLOT_MISSING` when a parent has no eligible sibling-pair component in either lane, reserves `ASSIGNMENT_MISSING` for parent coverage split across lanes, and retains `CAPACITY_ASSIGNMENT_INFEASIBLE` precedence for combinations rejected by immutable capacity. This changes rejection reporting only. Focused rejection/apron tests pass 26/26, generator regression 21/21, typecheck and diff check pass. The next executable action is to publish the `8bd8de9` batch evidence, then retire its exhausted checkpoint through the maintained abort API and verify production untouched. Afterward, diagnose why parents have no eligible sibling-pair components in either lane, using bounded local tests and only a concrete, threshold-preserving source correction. The exhausted `40f5c70` checkpoint is retired; do not replay it.

The maintained private generator exhausted 128 ordinals on `e1ac103`, then exhausted 256 ordinals each on exact sources `cff3479`, `c7c494b`, `2c5f0d3`, and `fee3832`; each returned `GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE`. The shared normal/Lowlands apron frontier correction and the compatible-own-pair fallback fix preserve all quality thresholds, but neither yielded a candidate. The `fee3832` fix retains ownership proofs, prefers compatible own pairs, and considers fallback only when that set is empty. Its focused apron tests pass 18/18, deterministic generator regression 21/21, typecheck passes, and pinned Linux toolchain preflight verifies 11 packages. The authenticated `2c5f0d3` summary reported 206 geography-exhaustion and 50 proof-rejection attempts. The `fee3832` summary reports 227 geography-exhaustion and 29 proof-rejection attempts, including 71 assignment-missing, 53 apron-no-match, and 26 node-limit codes. These are separate fresh-seed samples, not a controlled comparison. No candidate/package/shortlist was accepted. Full safe counts are in [local operations](../../evidence/0.4.0/local-operations.md). The cff/c7/c5/fee3832 checkpoints were retired through the maintained abort API only after their safe summaries were synchronized; each abort confirmed production untouched. The separate older retained-seed checkpoint remains bound to `19b3422` and cannot be imported or relabeled.

Next: trace the 81 parent-slot failures to a concrete, bounded generation-stage cause, preserving private seed and candidate bytes in the existing private root. Correct only a demonstrated gap without relaxing thresholds; then publish the reviewed source, sync the pinned Linux runner and run one fresh-seed maximum-256 batch on that exact commit. Do not replay exhausted seeds or claim causal improvement from independent samples. If a candidate passes, verify its private package and shortlist, then record selection separately before atlas publication. Continue the isolated PTR update, owner provisioning, bridge/frontend verification, domain cutover, and authenticated owner PTR plus Alpha acceptance in dependency order. Do not begin provider work before candidate proofs and source identity pass. Preserve rollback and licensing. Read-only checks on 5 October returned `200` for the Alpha root, `404` for custom-domain `/ptr/`, and `200` for the Pages preview `/ptr/`; cutover remains pending.

<!-- Preserve incoming historical current-checkpoint links. -->
<a id="current-release-checkpoint--1-october-2026"></a>

## Current isolated owner-PTR continuation - 4 October 2026

The release path and ownership are fixed in [issue #384](https://github.com/ael-dev3/Warpkeep/issues/384): reviewed source, private atlas and owner, bridge, frontend, then domain cutover and genuine owner acceptance. Codex/root owns the release; Claude's frontend and visual acceptance are complete and frozen. Grok's one bounded acceptance assignment is closed. Optional findings belong in follow-up issues, not additional release gates.

The published runtime candidate is `9ea4821ad3fda90694ccc80dfe3bc81fc96c6646` / tree `01e20bd9dc7af99c3b6418acbf1b54888fad1e5a`. The immutable Cloudflare version-reader maintenance is separately published at `e3d884ce45fa45ae31798df3954eaaa90d588d66`. Resolve any corrective successor from the actual signed quality ref and #384; neither an old SHA nor a completed helper proves delivery.

Already completed: the genuine PTR gameplay bootstrap, existing admin credential recovery and synchronization, bridge deployment, and frontend staging. The active bridge version is `08570296-4899-41c2-8ea3-f836d865d5d5` (52), with version 51 retained for rollback. The exact public artifact `3634aa82acace39d7db7c48be6f8bb0a97f95b01` is published and staged at [the owner PTR preview](https://8a469929.warpkeep.pages.dev/ptr/); its complete byte/fallback postflight passed. The preserved Alpha bytes and legal files are included. Do not repeat bootstrap, bridge upload, credential recovery or frontend work without a new reproduced failure. Domain cutover and authenticated Alpha/PTR acceptance are still unverified.

At `2026-10-04T10:07:20.337Z`, the auxiliary genuine private search failed with `GREATER_REALM_PRIVATE_TOPOGRAPHIC_QA_INVALID` before candidate acceptance or provider work. Its summary SHA-256 is `038feef1d72b6d75b1465fc0cd959366f2e2ccc888da0a2361cc179b0f0b3f97`; independent closure is `245fb8ace5561d547d380f9269fcc74fda30b22b1e0c949f42215d278fcfde7f`. An authenticated, read-only replay of exactly its current candidate reproduced the failure: the candidate passes generation proofs, but the serializer recomputes regional QA with the default role mapping instead of the already-derived repair mapping. Using that candidate's mapping reproduces its complete stored report. The checkpoint, key, source and Git state remained unchanged; replay receipt SHA-256 is `d51b23e77512c003b3df55af0e395ecb3e6b0eccebc615d0aa3cbcfe6fc7ac91`.

The existing public repair fixture independently reproduced the same serialization failure on native Node 22.22.3 at `10:24:10.259–10:24:38.313 UTC`, receipt `f7382205a0fd7af72cf8716a533c3eeda32be447f4b9219dac3bd38297b139be`. This fixture is test evidence only, never a private release seed. The narrow correction must verify nonidentity roles against fresh final geometry and retain complete report equality and every existing proof. Require the real package write/verify roundtrip and forged mapping/report rejection before approving its successor for generation or release. No geometry, budget, protocol format, frontend feature or licensing change is needed.

The corrective diff passed independent scoped review, TypeScript build-mode checks and the existing topographic/Tier-II suites (20 cases, no failures). Windows package tests stopped in their existing owner-only workspace bootstrap with `GREATER_REALM_PRIVATE_PATH_UNTRUSTED_ANCESTOR`; no package case passed there. Publish the reviewed development checkpoint with that limitation, synchronize the idle supported native checkout, then verify repaired and ordinary package roundtrips and report-drift rejection as UID 1000 before approving generation. Do not weaken the ancestor guard or create another Desktop workspace.

All original search/replay actors are closed. Main v16's exhausted checkpoint was safely retired with encrypted evidence and key retained. Preserve the auxiliary checkpoint under `/home/warpkeep/.warpkeep/private/greater-realm-release-9ea-aux`; it is a serialization failure, not an exhausted search. Its source binding cannot be migrated by the maintained APIs. Never reseal, relabel or inject corrected code beneath the old source identity. Publish and synchronize the verified corrective source, then use its normal genuine private generation and existing select/prepare/import/provision path. Only one winner may enter the shared production import journal; uncertain import acknowledgment permits read-only reconciliation, not resubmission.

The existing ordered release path remains in force. Owner Terms consent and an actual Farcaster owner session are still required for acceptance. Actions remains OFF under the current runtime policy; preserve the existing rollback artifacts and Alpha. The software/asset licensing terms and file-specific exceptions are unchanged by this correction; the private assets repository is not an anonymous public archive.

## Previous isolated owner-PTR continuation - 3 October 2026 (superseded)

The signed/published repair source `d6e069c4` / tree `873040fb` was used for the genuine P1 bootstrap (`ac364d4`, result `9b2f159c`, independent post `711ff1a8`). The gameplay program deployed; the observed PTR remains ownerless and its private atlas is absent. This is not owner delivery. The full maintained installed-toolchain verifier passed (`54344a`, proof `249c55c1`) after a clean patched-pnpm 11.11 frozen copy install with a fresh private store and `0077` mask; no tracked manifest or verifier requirement was relaxed.

The second P2 attempt failed on genuine Cloudflare GET envelopes with `errors`/`messages: null`, before upload/release markers; independent post `2c539e5b` retains failure and closes its original group with source/Git held. Resolve the actual checks and signed publication for the narrow provider response-shape/cache-preservation repairs, atlas/owner CLI changes and PR #389; complete only what remains unverified. Then generate the genuine private atlas from that signed helper, enable/verify the existing PTR bridge and provision/verify the owner through actual G001 admission. The existing local admin-secret value is unavailable; use established private access rather than creating recovery apps or keys. The scripts-list response also omitted `cache_options`; disabled cache or preservation cannot be inferred. No P2 deployment or owner success is established. Resolve each later checkpoint and operation from actual Git/receipts.

## Earlier continuation before the deployed bootstrap and toolchain recovery (superseded)

The prior published signed quality base `f06bb380b3193b78f01d08c16894eab4e52baaea`
/ tree `9d71959b8bb66b3a142cf9c0f240c84b44df794b` includes the genuine
PR #383 merge and reviewed maintenance/bootstrap/G001 work. Normal backup
push and GitHub signature/tree/parent readback completed; GitHub marked
#383 merged at 12:53:34 UTC. PRIMARY and native were clean and raw-byte
synchronized at that source. Main `cb282bab` and draft PR #385 remain separate.
Actions remains OFF across the configured repositories; no new run was used.

This checkpoint integrates the real author heads for #386
`ad4879ce496bce5d0f88629a022356ffed170702`, #387
`00b5e5179e629b1f84be8f932c87e4ac9d05c826` and #388
`1fa2ac2cfc4791ee80b127a25bad678036b45452`. Ordinary merge receipt
`4a7914db` records the actual staged tree `e4c5d3a`, 3,444 receiving files
and normal merge state. Independent post `0b7e8aa4` closes its original
actors/group with source/index/refs held. The six P1 source-clone candidates
and four P2 bridge files were then adopted (`f5879915`); post `5fe01941`
independently holds all 3,449 receiving files, index and refs and closes the
original group. The incoming merge index and unstaged overlay are distinct.
Supported family regeneration reproduced all 16 outputs and changed six
metadata files (`525d098a`); independent post `f9af320b` closes the original
actors/group and holds source/index/merge/refs. No compiler ran. At the adopted v2 source, fifteen whole test files passed all 344 cases with
zero failures/skips (14:26:54.874–14:34:04.783 UTC, `557dcbd8`). All seven
command terminals were 0/null, including the type/syntax checks. Independent
post `293784b8` reparsed the report and held all 3,449 files/index/MERGE_HEAD/
refs, with original actors/group absent twice. This fifteen-file result belongs
to its adopted v2 source; the entire batch was not repeated after the narrow
privacy repair.

The initial privacy check passed 31 cases, app/root-test types, PTR types and
core syntax, but strict operator types failed with 21 inherited unused-symbol
errors from the heavyweight owner-parser import (`64dcc3e6`). Failed post
`3305f386` retained that failure and closed its original group with source/Git
held. The repair uses the pure-core `takeNativeBridgeOwnerFid` helper to consume
and delete the transient input; no global unused-symbol cleanup or type waiver
was applied. The final complete P2 file passed 31 cases, zero failures/skips,
all three type commands and core syntax, each terminal 0/null
(15:30:35.710–15:30:58.401 UTC, `0329b864`). Independent post `2fc07214`
retains success and holds all 3,449 files/index/HEAD/MERGE_HEAD/refs, with
original actors/group absent twice. Supported privacy-family reproduction
`5c37ef42` / post `b21a75dc` held all 16 outputs with zero further generated
changes. Metadata reproduction is not new compiler or provider evidence.
The preceding integration checkpoint was signed and published as
`b6504fcf80b5dd0a2635260ebc5d3806ed190e3f` / tree
`305076545f07798bc4130a03ddc9a2e93e6f7f39`; PRIMARY/native were synchronized
at that observation and PRs #386, #387 and #388 were merged. A failed physical-index readback
(`8c1f08`) did not change raw source bytes; protected recovery (`605d29`)
and native origin synchronization (`98a6cb`) resolved the readback. Preserve
that failed record. Read-only Git must suppress optional locks/stat-cache writes.
Resolve the next signed repair source from actual Git/publication receipts.

Two object-import attempts failed before merge with mounted-repository
ownership refusals (`09c327`, `449988`). Independent failed posts `773e5000`
and `28cb2021` retain failure and hold all 3,441 source files/index/refs/status
with original groups absent. A parent Git `-c safe.directory` did not propagate
to its upload-pack child. The successful third attempt explicitly used the
fixed upload-pack command `/usr/bin/git -c safe.directory=/mnt/c/Users/heyas/Documents/Codex/2026-09-07/wa/work/Warpkeep/.git -c core.hooksPath=/dev/null -c core.fsmonitor=false upload-pack`
for this local import. Trust was command-scoped to that exact source, with no
global exception, new keys, ref export or persistent clone.

### P1: repair the metadata compatibility refusal, then run owner PTR

The actual clean-f06 bootstrap ran 13:01:07.715–13:01:09.546 UTC and exited
1/null (`defe3dcd`, operation `2bb5d572`). It failed before inspection,
artifact completion or any provider submission. The 13:04:56.399 UTC local
build diagnosis (`81ebc11f`) observed only a successful pinned CLI version
check and then `GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID`; no provider
request occurred. The checkout's development Git configuration was outside
the production builder allowlist. Independent post `1b3ff5b5` retains the
failed result, observes the private inspection/submission journal empty and
closes the original owner/child/group with source/index/refs held.

The adopted source-owned repair creates a private independent clone of the
actual committed source, checks raw tracked bytes/modes and minimal Git
configuration, and retires it after use. It does not relax G001's builder
allowlist, borrow mutable working-tree changes or require new login/keys.
The signed-b650 retry ran 16:03:10.006–16:05:16.323 UTC (`b58df59f`). The
real inline build passed; provider preflight then refused
`PTR_COMPATIBILITY_BOOTSTRAP_PROVIDER_METADATA_INVALID` before any submission
marker or provider write. The genuine public metadata GET at 16:09:38.964 UTC
(`ca89af79`) returned `host_type: { Js: [] }`; the parser expected a string
host enum. Independent post `3771d970` retains the failed result, confirms no
submission marker and closes the original group with source/index/refs held.
The minimal parser/test compatibility repair passed both complete files:
42 + 7 = 49 cases, zero failures; app/all-root-test types, strict operator
types and core syntax each exited 0. At this observation, signed publication
and the genuine bootstrap retry were unobserved. Resolve exact source and
publication from Git/receipts; publish only if still unpublished, then rerun the maintained
`scripts/ptr-compatibility-bootstrap-operator.ts` against that exact source.
It builds the real PTR artifact inline, checks every preserved old ABI item
and known additions, binds the authenticated nonbreaking prepublish token,
then performs one durably marked guarded update. Old private SQL 403 /
`INVALID_PTR_OWNER_SESSION` still leaves programBefore/rowsBefore `null`.
Do not invent pre-rows or replay a possibly submitted write. Read the genuine
complete poststate twice, then provision/verify the fixed owner. The full
102-output release preparation is separate evidence, not a prerequisite for
this isolated inline-build route.

### P2: the existing Worker's scoped native owner exchange

The four adopted `ptr-auth-bridge-native-*` files define a distinct direct
native caller for the existing account/Worker, without forged GitHub permits.
It has not built/uploaded/deployed a Worker or made provider requests. A
completed follow-up removes the managed owner value from source and persists
only value-free operation evidence; its affected checks passed as recorded
above. Use the existing private owner anchor, never a source literal. Its
six intended binding changes are PTR enablement, PTR database, PTR audience,
the existing managed owner FID, the actual clean source-commit binding and provider version
metadata. Fresh observations must hold Alpha, other modes/bindings, established
secret names, five Durable Objects, notifications, routes/domain, migration
and runtime. Managed values are inherited from the actually observed
predecessor; their values are not exposed or claimed equal by readback.

Use the existing selected Cloudflare production profile and privately supplied
provider authentication. Worker metadata establishes existing secret names,
not their values. Protected GitHub secret names also exist; that does not prove
locally available values or authorize extraction. Discover the existing local
admin-secret source privately if role attestation needs it; missing local value
evidence is not a finding of no Cloudflare access. No additional key, login or
blanket privilege is prescribed. Genuine source/tool/build metadata, unfiltered
latest-upload checks, durable no-replay markers and read-only reconciliation
remain required. Do not substitute the unrelated global hosted deployment lane.

### P3 and immediate continuation

Alpha remains at `https://warpkeep.com/`; authenticated owner `/ptr/` is not
live. The latest preview is [a4e3a104.warpkeep.pages.dev](https://a4e3a104.warpkeep.pages.dev),
from source `f06bb380`. Root independently observed exact Alpha root bytes
and preview PTR HTTP 200; apex remains GitHub Alpha 200/PTR 404. Claude's
compact postflight (`5e2de741`, `C:/dev/Warpkeep/artifacts/claude-qa/postflight-f06-preview-a4e3a104.json`)
reports 800 files and two fallback routes against genuine plan `b114d976`
(`C:/dev/wk-ship/artifacts/delivery/0.4.0/public-pages-ptr-mirror-plan-v1.json`).
Its signed public candidate is `134fcc83` / tree `b4584ea8`, parent `b6afe92e`;
Root/the independent cadence reviewer verified its signature against the
trusted PRIMARY allowed-signers mapping. The reported full postflight remains
attributed frontend evidence, not a
Codex full refetch or actual owner auth. Production Pages remains at its
previous deployment; no custom-domain cutover occurred. Preview CORS is not
allowlisted for the existing auth exchange. Domain cutover, bridge/realm
exchange and the owner/mobile journey remain unaccepted.

Retain the completed scoped checks, metadata reproduction and all failed
attempts. Resolve the reviewed metadata-parser repair's signed publication;
publish only if still unpublished, then run P1 and its readbacks from that
exact clean signed source. Run P2 with
its fresh provider observations; finally
use the approved P3 source/export and real owner/mobile acceptance. Keep G001
players/progress/timers and the new-admission freeze, Alpha/public bytes and
G002 sealing. Unrelated G002/notification deployments and global S/F/A remain
separate absent a demonstrated PTR dependency. Full native authority stays
closed; local slices and metadata do not become hosted identity or release
acceptance.

Codex/root owns final integration and provider/publication decisions. Claude
implements the frontend/mobile stream and reports exact heads/results/blockers
through [issue #384](https://github.com/ael-dev3/Warpkeep/issues/384), following
the user's current reply cadence. Use the runtime Actions configuration and
fresh inventories; do not copy numeric policy into instructions. Keep durable
work in the repository and do not create Desktop duplicates. For identity
recovery, inspect `login show` before `list --yes`; do not create anonymous
credentials as a diagnosis.

## Previous isolated owner-PTR continuation — before f06 publication, 3 October 2026 (superseded)

Signed quality source `da3e057ff7fd6a8f5b1a1b2616dff8b3db50cffb` /
tree `02164ba0ed75c4690ccb126817ee6ecb8fd7e3f9` is the verified native
base, not a guessed final integration hash. Genuine prepare/check completed
there with matching results (`90eb8e1b`, receipt `604b840c`), a
`prepared-source-candidate` handle and 102 outputs. Independent post
`e06d20bb` confirmed the original process group absent and raw source,
index and refs preserved. Resolve latest HEAD/tree, merge state and guarded
native source from actual Git and receipts before acting.

After that signed-base preparation, the guarded native integration
contains a two-file maintenance overlay (`b644e7`, post `0ee039`), the
authentic PR #383 merge, PTR compatibility/bootstrap, explicit G001 refreeze
and these notes. Resolve its exact signed checkpoint/publication from actual
Git and receipts. Maintenance focused tests passed 52/52 (`7aeeaf`, post
`84b95c`); G001 refreeze passed 170 cases; PTR compatibility/bootstrap passed
39 and relevant type checks. Its supported 16-output family metadata was
reproduced with source/index/merge/refs preserved. This is metadata and
focused-test evidence, not a fresh compiler result for the combined source.
The earlier base workspace handle cannot be reused for changed
source. Full combined-source prepare/check remains separate release evidence.

The combined ordinary focused attempt (`9708d52f`) recorded 393 passes, zero
failures and 29 skips. Its strict aggregate remained failed because the
namespace cases were not run in that environment. The separate installed
namespace four-file run completed with 260 passes, zero failures and one
source-declared unsupported-runtime negative-control skip (`84a572de`).
Independent post `edb305c3` rechecked the raw report, guarded source/Git and
original whole-group absence. Its scoped disposition does not erase the raw
skip or convert the earlier ordinary aggregate into a pass. Complete native
verification and final release acceptance remain open.

[PR #385](https://github.com/ael-dev3/Warpkeep/pull/385) is still draft and
supersedes #380/#381; main `cb282bab` is unchanged. The native integration's signed/publication identity belongs to
actual Git and receipts, not an anticipated hash in this note. [Issue #384](https://github.com/ael-dev3/Warpkeep/issues/384)
coordinates exact heads and work: Codex owns the PTR provider update/readback
and the direct owner caller bridge; Claude owns the frontend/mobile preview
in a separate Windows checkout. The integrated #375–#378 branches are
provenance rather than additional merges.

Alpha 0.3.43 remains live; authenticated owner `/ptr/` is unpublished. The
older-source Cloudflare preview is neither current integrated game, Alpha
domain cutover nor owner acceptance. The next provider step is the maintained
`ptr-compatibility-bootstrap-operator.ts` from clean committed source. It
builds the real PTR artifact inline, validates its ABI and authenticated
nonbreaking prepublish token, makes one durably marked guarded PUT, then reads
the complete poststate twice. Prior private SQL 403 /
`INVALID_PTR_OWNER_SESSION` prevents program and row before-state; both
remain `null`, never guessed. Metadata `initial_program` is not current
program proof. Do not generate a replacement key or replay an uncertain PUT.
Then configure and validate the auth Worker's direct owner exchange with
existing protected credentials; unrelated GitHub-bound settings do not
replace that caller. Publish the approved `/ptr/` build while preserving the
Alpha root, then complete a real authenticated owner journey and mobile
acceptance. Preserve G001 players/progress/timers and new-admission freeze;
keep G002 sealed. G002/notification deployments and global S/F/A stay
separate absent a demonstrated PTR contract dependency.

For CLI recovery, check SpacetimeDB `login show` before `list --yes`; a
logged-out list can initialize an anonymous identity. Read the
[access guide](../../operations/0.4.0-infra-access.md#spacetimedb-identities-and-schema-inspection)
for existing profile paths. The current Actions policy and fresh inventory
govern any remote workflow action; these notes grant no permission.

## Previous local release work — 3 October 2026 (superseded)

### Verified source, build repair and PTR connection blocker

Published signed quality source `a89173f94bd211d4a95defa6c45df11868166b07` / tree `e3cf809b38d2784925ec3a260bfe7cbf50b0b736` follows game baseline `a0f6a55f`. Publication `3bf80e59` and complete post inventory `0c4245c5` confirm remote equality, signature and no unexpected Actions activity. Resolve subsequent repair checkpoints from actual Git. Main `cb282bab` and PRs #380/#381 remain separate. Alpha 0.3.43 is live; the last public read returned Alpha 200, PTR 404 and SpacetimeDB Cloud 2.10.2. Current runtime policy governs remote work; repository Actions is held disabled.

Initial-owner inspection/update passed all 139 cases and type/syntax checks (`276442df`, independent post `3bd626b9`). The later whole relocation run passed every one of the 79 original cases (`fc0cb87e`, post `d43bbb94`) with no skips or unfinished cases. It retains 816 assertion calls, native structuredClone, the original command bounds and all Authority fixture/whole-state comparisons. Earlier timeouts, inherited type failures and rejected prototypes remain retained. Remaining module files and the complete release gate still require actual coverage.

Actual fresh prepare/check failed at 08:42 UTC: prepare exited 1 / LOCAL_BINDING_RUNTIME_PROCESS_FAILED; no check child or completed artifact exists. The focused genuine G001-current materializer diagnostic (`a0cab32e`, post `1d1a94a0`) exposed TREE_INVALID before any compiler: the tracked executable script's valid Git 100755 mode was rejected. The four-path repair accepts only regular Git 100644/100755, preserves 0644/0755 on creation/verification/cleanup, updates the pinned openat helper and retains all byte/identity/nonregular guards. Its actual 09:30:37.942–09:31:04.142 UTC run passed all 21 regression cases, root application/all-test types and relocation-module types (`9fba62b8`). Independent post `6c379b10` closes the original owner, three children and whole group with source/index/refs held. The supported family successor changed five metadata outputs, reproduced all 16 and passed protected/static policies (`00dab22d`, post `2a5b8518`). Successful metadata derivation does not replace genuine compilation.

Actual fixed-target inspection failed before program/schema/row parsing (`45ab116d`, post `a5d84d2c`). Read-only comparisons established metadata/schema HTTP 200 and a stored publisher identity matching the real database owner, with an unexpired claim. Both table and installed-program SQL return HTTP 403 / INVALID_PTR_OWNER_SESSION (`1d5c4d5a`, post `691ccc59`); the real pinned CLI reproduces it (`0f060dd0`, post `bb891928`). Each diagnostic group is closed; no provider mutation occurred. The module's client-connected gate runs before provider SQL authorization and rejects the publisher's ordinary credentials. Do not repeat logins, mint recovery keys, substitute an unverified admin identity or claim a before-state snapshot. Metadata initial_program is not proof of the current installed program. Resolve this compatibility defect through a source-reviewed, data-preserving provider route.

Resume in order: sign and synchronize the reviewed repair; run genuine fresh prepare/check without recovering failed workspace IDs; resolve publisher/module compatibility and obtain actual fixed PTR program/schema/owner/epoch/atlas/config/rows; then use reviewed genuine prepare-update, explicit apply and read-only lost-acknowledgement reconciliation. Keep uncertain outcomes nonzero and never automatically resubmit a provider mutation. Private missing values remain unknown.

Latest auth Worker `8e758507` has no PTR enable/database/audience or managed-owner bindings (`cc2fb250`). Its admin secret is present, but metadata cannot supply its value. Existing protected deployment secrets are available to an admitted bounded workflow; no additional keys are required. Preserve the actual Alpha/G001/G002/notification state when configuring PTR. Public Pages candidates remain QA-only; their tests are not a deployed site. Global S/F/A remains sealed. Authenticated owner play, full release proof, World nominal timing and physical-device/render acceptance remain open.

## Earlier development records (historical; directions superseded)

The current continuation above supersedes the old next steps below. Their source scopes, failed attempts and receipt facts remain unchanged.

This checkpoint descends from the signed, published `97f4041b` development source. Resolve its actual HEAD/tree and synchronized branch state from Git and the publication receipt. Alpha 0.3.43 is live; owner PTR 0.4 remains unpublished. Main `cb282bab` and PR380/381 are unchanged. Actions remains disabled under the current operating policy.

Completed source repairs and checks: G002 setup and cleanup are bound by `october-release-g002-cleanup-focused-97-v2-20261003T0246Z-summary.json` (`e6295e59`), 107/107 across two complete files, 02:39:59.317–02:40:16.263 UTC on 3 October. App/all-tests noEmit and connected-module syntax exited 0/null; independent native post `4926c46e` retained the original leader, three children and full PGID absence, with source/index/refs held. The earlier focused V1 106-pass/one-failure report remains failed evidence: the mock captured no allocated directories; capturing actual HOME at CLI attestation corrected that test without changing verifier `791f9e06` bytes. This did not execute a live G002 workload.

Supported source-family derivation `3290f49d` retained all 16 outputs. Exactly five outputs changed: four existing workflow closure-digest pins and one verifier member hash in the closure manifest. Eleven other output bodies and all compiled bodies/triggers stayed unchanged; no compiler ran. Five complete family test files passed 194/194 (`october-release-g002-cleanup-family-focused-97-v1-20261003T0253Z-summary.json`, `7e0e0180`), 02:47:43.118–02:53:44.920 UTC. Independent native post `d79a4047` retained original actor/group absence and the actual nine-path source/index/refs.

The complete indexed fake-database fixture still cancelled at the unchanged 120/180 limits (`october-release-relocation-fixture-index-v5-97f4041b-20261003T0256Z-summary.json`, `c138063e`), 02:55:12.702–02:57:24.540 UTC. Its strict parser refused cancellation; parsed result is null, actual exit 1/null and preservationError null. Independent native post `869b7c26` retains the original actor/group/source/index/refs. Ten selected controls separately passed with complete strict parsing (`october-release-relocation-fixture-controls-v5-97f4041b-20261003T0300Z-summary.json`, `259c1ffe`), 03:00:39.394–03:00:43.476 UTC, actual 0/null; post `fbe18164` retains closure. The original 69-case suffix is byte-exact, but those 69 unmatched cases were omitted, not executed or skipped, in this selected run. No whole-file speed or coverage pass follows. The earlier selected-seven operator's false result arose from a wrong 69-skips expectation; raw reconciliation `e04d509d` establishes only seven actual passes and does not rewrite the original failed operator report.

The earlier full run `0595bd98` ran 23:55:34.469 UTC on 2 October–01:02:22.433 UTC on 3 October. Its 45/82 commands retained 701 ordinary files with 12,997 passed/68 skipped/zero failed, namespace 260 passed/one skipped with satisfied fixed disposition, and the first 36 module files. Module37 cancelled at 120s; source preservation and original actor/group closure were independently retained. The ordinary skip dispositions remain unsupported. Clean-source notification20/20 and its post `cc558ec9`/`ca303e31` are complete. Do not repeat these completed domains without changed inputs or mislabel the raw skips as passes.

Failed diagnosis records remain: unchanged-source trace `558e8fee` completed all ten imports in roughly 3s, then cancelled. Phase2 `a0a9d83a` (01:43:07.822–01:45:23.233 UTC) observed first-case:done within 10s, disproving an inference of first-case stall from earlier report silence; it still failed and its relative `test:stderr` file reference was rejected by the strict parser. Native post `038c3b00` and restoration `7534c571` retain closure and clean original97 bytes at 01:47:50.497 UTC. Actual restoration inner12b72c succeeded; the surrounding tool's later exit 1 was a missing-filename read. Clean-original duration `711b39e7` (01:49:58.219–02:01:03.742 UTC) also cancelled under diagnostic-only 600/660s bounds, stderr 0 and preservationError null. Native-only post `d432b769` retains owner1925170/child1925227 and group absence. The subsequent whole76 optimization `e219ffb1` also cancelled at 120s. None of these failed reports is waived or rewritten.

Four finite current-user namespace controls passed with independent closure: normal, adopted detached-orphan reaping and original-owner death before registration or after fsync before ACK. They establish the finite UID1000/capability-drop/loopback/reaper mechanism, not genuine Spacetime/G002 or connected20 execution.

Mobile v1 `825e12c6` failed before server/Chrome on a stale dist chunk; v2 `e7900487` loaded World but failed on an omitted favicon 404 before capture. Actual v3 `e76ee419` ran 02:15:34.830–02:16:57.219 UTC, with eligible complete sample `2e5664d9` lasting 60,013.9ms and CPU first-GL p95 84.8>83.4ms. Normal Chrome exit 0/profile removal/ownedRemaining 0 and native exit 0/two original-group absence probes retained source/index/refs. Compiled8b fixture JS and operating97/currentCSS are separately bound; no GPU/presented-frame, phone or final-A acceptance follows. Diagnosis `9fbc7498` records parent/render RAF p95 83.7ms and zero join issues; individual duplicate matrix/attribute costs remain unmeasured. The twelve historical nominal World misses retain their failed scopes.

Latest bounded diagnosis used the signed, published facf6731 development source (tree a7d9dea9), publication receipt `7148f41b`. Whole-file trace `4dbe1938` ran 2026-10-03T03:27:59.411Z–2026-10-03T03:30:14.698Z; its recorded channel observed 24 callback returns and case 25 start before cancellation. This is progress, not parsed test acceptance: strict parsing rejected the relative stderr file reference and the run stayed failed. Original actor/group closure `db396a16` and narrow restoration `1d443928` returned the native checkout to exact published bytes.

A fixture-only cell lookup prototype `69c69bc6` preserved every original 79 test body and added 3 controls. Selected 13 controls passed with strict parsing at 2026-10-03T03:40:49.463Z–2026-10-03T03:40:53.762Z (bfdb5f2a; independent post4b0b9b8b), with 69 original cases omitted. The complete 82-case file still cancelled at unchanged 120s Node/180s parent bounds at 2026-10-03T03:41:47.617Z–2026-10-03T03:44:02.962Z (c7bb2b00); strict cancellation refusal remains failed evidence, not a timeout waiver. Independent post `24f9b085` and restoration `c546762b` retained original actor/group absence, all 3405 other physical sources/index/refs and clean published `facf` bytes. The prototype remains ignored QA only and is not the current implementation; its speed benefit is unmeasured.

Incoming PR #382 head `7d5a167b` targets the quality branch. Its nine commits are unsigned; source integration must preserve author history and current fixes, then use a signed reviewed checkpoint. Review `f29083b2` found three reachable audio risks: ambience beyond the shared voice cap, offscreen ambience persisting even in reduced-motion lanes, and lost construction cues when different building kinds share a project revision. Head-bound repair drafts are not yet executed or integrated. Three new imports require supported source-family namespace refresh and current compiled-input validation; previous compiler or device evidence does not cover this source.

First measure repeated fixture preparation, route lookup and whole-state snapshot costs before another optimization; do not repeat an unchanged full batch or infer a single stalled case from buffered output. Complete module 37 under the maintained bounds, then resume modules 38–74 and the recorded remaining coverage. Review and test the three PR #382 repairs before integrating its visual/audio work. Retain all existing native, connected, mobile, owner/device and hosted delivery requirements.

## Historical checkpoints and directions (superseded)

The original dated text below is unchanged. Its former resumption instructions are historical; use the current section above. In particular, the focused 715/9 aggregate and earlier changed-index failure remain failed evidence.

## Current local release work — 3 October 2026

### Native ordinary failure retained; focused repairs completed — 3 October

This coherent repair checkpoint descends from published, synchronized `5cddb1a7` / tree `f2b1e73e` (`181c4950`) and integrates eleven reviewed repair candidates plus five mechanically derived metadata changes. Its eventual signed identity and publication must be read from actual receipts. Main and PR380/381 remain separate; Actions remains disabled under the runtime configuration.

The maintained fixed namespace launcher was provisioned and exercised at `5cddb1a7`, 21:16:15.709–21:21:01.869 UTC on 2 October. Its four-file result is 260 passed assertions and one known source-declared negative-control skip (`1d624ae3`), with independent post-readback `3c2decf9`. The skip remains raw skipped evidence, not a pass or complete-source authority.

The first full ordinary run completed 701 files: 12,970 passed, 11 failed and 68 skipped, 21:27:38.054–22:23:22.873 UTC on 2 October at the report/command scope (`abe08587`, raw `3871f281`, independent failure review `9f94afac`); the outer summary records 21:27:38.044–22:23:23.306 UTC. It did not time out. The producer then stopped with `NATIVE_SOURCE_VERIFICATION_CHANGED`: tracked source bytes and refs held, but the canonical index changed. Preserve that failed preservation result. The intentional index-flag fixture used the canonical checkout; the reviewed repair moves it to a temporary private clone. Ordinary test fixtures also need the real account home and functioning replacement-object positive controls, while strict source Git inspection remains isolated.

The eleven reviewed candidates cover those fixture/environment failures, complete-file ordinary batching, observed bootstrap/publisher/CSS fixture defects and bounded callback retirement. Supported sixteen-output source-family derivation preserves the retained compiled bytes; only five metadata outputs change. This is source derivation, not a fresh operation compilation or accepted-main proof.

The focused run completed 23:02:31.224–23:23:21.144 UTC on 2 October (`d735f7d6`; outer `7587cd`, exit 1). Fifteen complete files contain 724 assertions: 715 passed, nine failed and none skipped or unfinished. The first lifecycle group is 121/9 of 130: all 63 fullstack and 47 native-producer cases passed; 11 notification cases passed and nine clean-checkout guards rejected the then-unsigned source overlay (raw `a1c44227`). The observed-failure group passed all 400 cases (raw `05cac86a`), and the five protected-family files passed all 194 (raw `75525ffa`). App/all-tests noEmit and three module syntax checks each returned normal 0/null; no command timed out. The aggregate remains failed.

Independent post-readback `cc2294f3` proves the original owner, seven recorded children and full process group absent twice on the original boot. Current overlay raw source `fedafc01`, physical index `ba0d21bd` and refs `3ce87123` held during this focused run. This does not repair or erase the earlier full ordinary run's changed-index preservation failure. After a clean local signed checkpoint, rerun the complete 20-case notification file and retain independent closure before remote backup; do not weaken its clean-source guard or relabel the nine failed cases.

A separate unprivileged owner-death rehearsal completed normal, before-registration and after-fsync-before-ack modes, with independent record/absence audits (`e1aa5d02`). These are bounded sleep fixtures, not the maintained twenty-leaf connected profile, general orphan-reaping proof or release authorization. Connected containment, complete native/dependency coverage, authenticated proof transport, bounded hosted admission, owner play, physical devices and final-A performance remain open. Earlier service, compiler and rendered receipts retain their recorded source scopes.

The older dated follow-up directions below are retained history and are superseded by this current section.

### Native service verification completed; connected execution remains closed — 2 October

Signed code checkpoint `41e760fe` (tree `01c62e80`, parent `b9ca8ca7`) is published and synchronized; publication `3cabd70b` preserves the disabled, idle Actions policy. The actual maintained service run `20139fbf` completed 17:46:06.292–17:47:33.932 UTC. All nine commands exited 0/null. Its four strict raw partitions passed 484 auth-bridge ordinary assertions in 18 files, 18 auth-bridge Workerd assertions in one file, 1,499 recovery ordinary assertions in 49 files and 68 recovery Workerd assertions in eight files: 2,069 assertions across 76 files, with no failures, skips, pending cases or todo cases. Four type checks and one generated Workerd declaration check are five separate successful terminal results; they have no test counts.

Independent post-outer `21ad303e` reparsed those four reports and retained all nine command contracts, actual tools/configuration, local signature and the selected root dependency slice. At 18:01:27.208 UTC it proved the original producer and nine recorded children physically absent, with the entire original process group empty twice on its original boot. All 3,406 raw source files, physical index and refs held. Summary, proof and four raw reports are retained byte-for-byte in PRIMARY (retention `17eb5f18`). This establishes the local service slice only: `completeCoverage:false` and `productionAuthorized:false`; complete root/module/service dependency provenance, hosted CI/OIDC, accepted-main transport and release authority remain unproved.

The actual connected plan `366e8cdd` is planning-only. Its attempted `--run` exited 1 with `NATIVE_SOURCE_VERIFICATION_CONNECTED_CONTAINMENT_NOT_IMPLEMENTED`; no connected check or server was launched. The plan is retained in native `artifacts/qa` as `october-release-native-connected-41e760fe-v1-plan-20261002.json`; the observed refusal has no separate disk receipt. Next run the maintained ordinary/isolated-namespace/module test profile from the next clean signed source with actual source-owned dispositions. Then implement and validate detached G002 server/CLI containment and required runtime input capture, complete authenticated proof transport, and review the bounded hosted-operation policy. Keep owner/mobile and final-A acceptance separate. Do not rerun the completed service slice merely to follow older notes.

The failed template-plan attempt and development preparation below retain their original source and outcomes. The `b9ca8ca7` prepare/check is development-only evidence and is not relabeled as `41e760fe` or accepted main. Alpha remains live; owner PTR 0.4 is unpublished. Numeric Actions policy belongs only to its runtime configuration.

## Historical local checkpoints (superseded)

The retained sections below preserve their original evidence and follow-up text. Their old resumption directions are superseded by the current section above.

### Successful development preparation and service configuration repair — 2 October

Signed development source `b9ca8ca7` is published and synchronized (publication `98592bd5`). Its genuine prepare/check ran 16:47:35.063–17:12:47.573 UTC. Both actual CLI children exited 0/null; their completions match all nineteen fields and all 102 private candidate/journal outputs. Receipt `49cfec4a`, matching results `9e2cbac6` and independent post-outer `8efc2eef` retain the exact source, physical index, HEAD and refs. The original wrapper and both recorded children, with their original births and entire process group, were absent in both readbacks. Compact review `7540600d` and bounded raw records are copied byte-for-byte to PRIMARY. This is a development rehearsal, with no candidate export, source integration, provider deployment or release authority.

The first service plan then failed at 17:18:49.795 UTC with `NATIVE_SOURCE_VERIFICATION_AMBIENT_SERVICE_CONFIGURATION`. Its guard incorrectly included the tracked root `.env.example` in the active environment-file namespace. No service test or type command ran. Keep failed operator `888a6a5e`, actual nonzero CLI/stderr and independent closure `b63039e1`; the adapter's empty-stdout headline is not the underlying failure. Configuration capture now exempts only the exact non-loaded root template and existing auth-bridge example. Actual ambient configuration and executable shadows remain rejected. The regression uses unreadable malformed example bytes and rejects a near-name environment file, proving the exemption does not read values or admit active configuration.

The connected-module continuation now has a source-derived `--plan-connected` recipe preserving every existing verification leaf. It remains planning-only: `executionImplemented:false`, and `--run` rejects it explicitly until actual detached G002 server/CLI births and process groups are retained and closed. Launcher exit and the producer's own group cannot prove a detached server stopped. Root TypeScript-script aliases require root tsx 4.23.0; module pure tests separately retain module tsx 4.20.6. Root client SDK and root tsx/esbuild transitive inputs must also be captured before execution. The real structured G002 receipt and additive protocol-v18 parser remain required; no synthetic assertion counts or aggregate-script substitute is introduced.

All three complete affected native files passed 176 assertions, with app/test noEmit and namespace shell syntax (summary `6706b0a8`, actual outer 0/null). The final nine-path overlay is `1428923a`; earlier Windows 92-case results retain their own platform and pre/post-correction scope. Independent post-outer source/index/ref/process readback is recorded alongside the exact raw reports. Independent reachability review confirms these producer/CLI/planning changes are outside the protected source family: the unchanged minimal evidence reader is the sole privileged import. No family rewrite, operation compiler rerun or workflow change is needed for this checkpoint.

Next, publish any still-local reviewed checkpoint, run the fixed service plan from that exact clean signed source, and retain its actual results before advancing the remaining native domains. Full verification, authenticated source transport, admitted hosted operations and measured owner/mobile acceptance remain open. Actions stays governed by the operational configuration; no new runner minutes, installation, provider mutation or Desktop sibling has been created.

### Native verifier partitions and isolated receipt reader — 2 October

Signed checkpoint `889e37c5` is published and synchronized (publication `bc6adc21`; all configured Actions repositories disabled and idle). Its genuine preparation ran 14:38:23.115–14:50:03.943 UTC and exited unsuccessfully before a prepared handle or check. The original failure and independent source/index/ref/process closure `1d80b4fa` remain retained. Do not reuse its failed draft/candidate as completed preparation.

One operation-only diagnostic ran 15:13:56.283–15:14:02.683 UTC on the same held source. Actual worker failure `SEALED_REALMS_BUNDLES_ABSOLUTE_PATH_INVALID` is preserved in `39445902`; independent `459ca43b` confirms every recorded actor and both original groups absent with exact source, physical index and refs. The workflow evidence import had pulled the local verifier and production-dist exclusion vocabulary into the operation graph. The new minimal receipt reader imports no test runner/build/dependency producer. It preserves bounded owned CAS/source validation and unconditional incomplete-authority refusal; the operation artifact path/graph guards are unchanged.

The maintained verifier now has a separate `--plan-services` recipe for exact ordinary/Workerd service reports, separate type checks and generated declaration checking. It reopens ignored ambient configuration and actual service tools/shims before each child; service-local Node shadows are refused. A bounded root dependency slice compares existing lock-SRI archives against every selected package file, mode and bin/link fact, retaining uncovered records. It does not install packages or establish full root/module/service provenance, audit, registry signatures or release authority. The namespace partition may classify only its exact source-declared unsupported-runtime negative control as inapplicable; raw skipped outcomes and `allTestsPassed:false` remain intact. No ordinary/service skip exemption is added.

Source-only family derivation `1d167e80` passes paths/inventory/family after the reader split. Actual focused run `8c0c9fd8` ran all ten complete selected files: 327 assertions passed and 22 failed, with no skips, pending cases or runtime errors. All four real operation-lane compiler regressions, bundled reader import, strict incomplete-receipt refusals, services and namespace tests passed. App/test types and shell syntax separately passed. Independent `53a04fd9` closes the original leader, three children and full group with exact source, physical index and refs. Keep that unsuccessful aggregate result.

The 21 dependency fixture failures came from the default DOM test environment supplying a different-realm byte type; the native-only test file now explicitly uses Node. Its unchanged production helper retains every rejection case. The remaining workflow failure exposed the dist verifier declaration falling out of the graph after the reader split. The existing CLI is now an explicit script graph root; its adjacent declaration remains required, with a negative regression that removes the file and expects ABI rejection. There is no declarationless exemption. A partial QA copy stopped on an existing untracked file; recovery `2cdb4538` verified the exact approved partial state and copied only the remaining test file, preserving the original failed attempt.

Corrected source-only family `0de309d9` and independent post-outer `3b4f8e85` pass paths/inventory/family. Installation `42fa0418` changes only its twelve derived outputs. Independent review confirms each affected workflow changes only its two fingerprints; triggers, jobs, permissions, timeouts and downstream chains remain identical, and all existing compiled members retain their exact bytes. The corrected two complete files passed all 189 assertions with zero failures, skips or pending cases, 16:03:23.104–16:09:22.118 UTC (`9f76aa10`, actual outer exit 0). App/test types and shell syntax separately passed. Independent post-outer `fbcd5a72` confirms the original boot, leader, three recorded children and full process group absent twice, with the exact raw source, physical index and refs held. The eight other complete-file results retain their earlier overlay scope. A genuine installed-dependency capture then exposed `NATIVE_SOURCE_DEPENDENCIES_LOCK_PATH`: the actual lock includes the historical uppercase `JSONStream` name outside the selected slice. Keep failed receipt `44239237` and original-process/source closure `e05b5b01`. The parser now accepts safe recorded uppercase names and rejects dot/traversal, malformed scopes/nesting and excessive paths. The complete dependency and native-verifier files passed 79 assertions, including all 42 dependency cases, with types/shell (`169a415d`, 16:27:12.823–16:27:25.404 UTC); independent `69c93603` closes every original actor and the held source/index/refs. Actual capture `8d9ef202` then passed 16:29:37.549–16:29:38.219 UTC, with independent closure `d4cbeae6`. It compares all own files of the six fixed packages against the actual lock-SRI archives and explicitly leaves every other root record, including `JSONStream`, uncovered. This remains a bounded dependency slice, with full dependency, audit, signatures and release authority unproved.

The fresh signed b9ca8ca7 preparation later passed, as recorded above. Reuse earlier complete production builds only at their retained source; do not relabel them as a later checkpoint. No Actions execution or provider mutation occurred.

### Current source verification and preparation repair — 2 October

Every fixed source check passed at signed `fef7d77a`, 13:23:02.736–13:26:17.224 UTC. Content-addressed summary `e44101ba` retains actual command exits and the three separate production build inventories; independent post-outer `d31b15b6` confirms original leader, all recorded children and group absent twice with exact source, physical index and refs held. This completes the local types/builds lane at that source. Full native coverage and release authority remain incomplete; the earlier failed runs remain separate.

The preparation graph reached the production-dist exclusion verifier without its required adjacent declaration. `scripts/verify-production-dist-exclusions.d.mts` now describes its four real exports with literal readonly path tuples and exact CSP keys. No JavaScript behavior, graph exemption or release approval changed. Supported derivation through the existing attested scanner succeeds for paths, inventory and the full source family (final `ed9235c9`; independent post-outer `9d547ef5`). The derived manifest includes the newly reached modules/declarations; consumers retain exact member counts, and each affected workflow changes only its verifier/manifest fingerprints. All existing compiled members remain unchanged; this is source derivation, not a new compiler result or accepted-main proof.

Keep the failed diagnostics: the first retirement check ran before Node reaped its closed parser children; the corrected bounded wait records their original identities and actual absence. Initial focused run `8fcbc944` exceeded its local aggregate deadline and exposed obsolete type-error annotations. Corrected run `74fef93e` passed nine affected files and types/shell, while one workflow assertion still expected the now-declared verifier in the declarationless list. Removing only that outdated entry preserves exact bidirectional ABI assertions. The complete repaired workflow file then passed all 164 assertions, types and shell (`34dd0449`); independent `7427b8ef` closes all original processes and exact source/index/refs. No test was filtered or skipped to pass the correction.

Historical follow-up (completed by published `889e37c5`): publish the coherent signed declaration, generated metadata, test and notes checkpoint after an outgoing secret scan and fresh conserved readbacks. Reuse the retained build evidence for its actual source scope; do not relabel it as a build of a later commit. Continue genuine preparation, remaining native verification domains and authenticated proof transport. Actions remain stopped under the operational configuration; owner PTR 0.4 is unpublished. The older checkpoints below are historical diagnostics, not current resumption instructions.

### Release fingerprint repair and actual builds — 2 October

The maintained run at signed source `3a2dc781` ran from 13:09:29.418 to 13:12:49.164 UTC. Its immutable summary `c9fb96e6` records all fixed commands and nine passes: scanner regression, full-HEAD Gitleaks with no findings, licensing, runtime assets, file sizes, build-mode types and all three complete production builds. Each build retained its actual bounded output before the next replaced dist. The sealed-source check alone failed with `SEALED_LAUNCH_RELEASE_IDENTITY_INVALID`; keep that failure, rather than combining it into an aggregate pass. Independent post-outer `c06d6392` verifies the original leader, all recorded children and complete process group absent twice, with exact source, physical index and refs held.

The package and lock remain canonical Alpha 0.3.43; the preparation binding remains closed. The version-neutral package fingerprint omitted the two reviewed operator scripts, `verify:actions-hold` and `verify:source-native`. Removing only those entries reproduces the historical fingerprint exactly. Supported `derivePreparedSourcePins` produced receipt `e961ec1d`; its only changed output is the sealed verifier's package fingerprint. Installation checks that exact one-line replacement and preserves every other pin and authority value. Three focused suites passed all 207 assertions, app/test types and shell syntax (`d8bf8d51`); independent `ffa0d86a` closes original processes and source/index/refs.

Create a fresh maintained plan from the resulting clean signed source and retain the complete corrected run. Full closure-family derivation at the earlier source failed before installation; all mandatory compiled members exist, so do not diagnose them as missing. No compiler, dependency install, workflow execution or provider mutation was performed by the fingerprint derivation. Complete native coverage, authenticated source authority, genuinely rebuilt preparation and usable owner PTR remain open.

### Verified pnpm script execution — 2 October

At signedD74/treeD2AA, plan547a3ddf and actualrunbe9542/session16136 reached all10 fixed checks. Summary45e0893b records full-HEAD Gitleaks and scanner regression passed0/null with zero findings. Eight pnpm scripts refused the unsupported bare verify-deps-before-run option before script execution; those eight original exit1 failures remain recorded, allChecksPassed:false. Independent8b29d1/9b4fe3a7 proves original leader, all10 recorded children and complete PGID absent twice, and exact raw source/physical index/refs preserved. No types or production build pass is inferred from that failed run.

The supported override is --config.verify-deps-before-run=false, alongside --pm-on-fail=ignore; the closed environment has no competing pnpm_config_verify_deps_before_run key. The native regression executes the actual fixed type command against an isolated fixture with missing declared dependencies and only the reviewed compiler bin link. Valid TypeScript exits0; intentionally invalid TypeScript exits1 with TS2322. Dependencies remain uninstalled, package bytes unchanged and no workspace/lock created. First fixture-run185cbeb8 failed only an unnecessary script-banner stdout assumption; that assertion was removed while retaining the real positive/negative compiler checks. Corrected focusb192f8/session3384 closed6f04d3: all233 assertions in four files, app/tests types and shell syntax passed0/null (summary2b84b7d7, overlay4cf9346a atD74). Keep earlier failed records; recreate the maintained source-check plan from the resulting signed source. No Actions, installer or provider operation occurred.

Publish the complete signed75-to-current source range as one nonforced backup after outgoing scan and fresh conserved history/settings/ref/trigger readbacks. Native origin tracking must stay pinned while a source-check actor runs; synchronize it only after original actor/group absence is independently observed. Full source authority and owner PTR remain unfinished.

### Scanner output and failure retention — 2 October

Correction sourceAF93/tree0683364d is signed locally, parent75. Its maintained plan60ce8446 was created successfully; run109c96 reached the actual scanner regression, which closed0/null, then failed in source-secrets. The isolated environment disabled graft input via /dev/null but did not suppress Git's deprecation advice for the scanner's own Git child. That warning aborted Gitleaks, removed its external report and exposed a retainer lstat error that prevented the final summary. Keep the partial started/terminal/raw logs; no remaining policy/type/build check was reached. Post-outer6c8544/4e8c1ed8 proves original leader and two children/full PGID absent twice, original source bytes/index bytes/refs preserved. It does not claim a complete run or physical-inode equality.

The correction adds a source-owned Git advice=false config to the closed child environment while retaining GIT_GRAFT_FILE=/dev/null and replacement/global-config isolation. Gitleaks now emits JSON to stdout, captured directly in the producer's reserved600 report under its live byte bound. Missing reports become explicit null-digest failure metadata, preserving the run summary; they cannot pass. Focusede807db/session34622 closed339493,12:44:08.803–12:44:28.900 UTC: all232 assertions, app/tests types and shell syntax passed0/null. Summaryb5a3aa0f binds overlay086cfb09 atAF93; real empty-fixture Git/Gitleaks stdout regression, missing-report retention and actual CommonJS sealed import passed. No install or provider operation occurred. Recreate the fixed maintained plan from the resulting signed source before its next owned --run; previous plan/source identities remain historical and incomplete.

### Native no-install launch correction — 2 October

The signed75c69cd5/tree238e6c2f checkpoint was published by nonforced pushfd4b20,12:26:32.326–12:26:34.898 UTC. Prede952395 and post3dec244a each used116 GETs; the post closed12:28:16.174 UTC. Publication51a95a3a confirms the conserved all-four disabled/idle settings, unchanged main/PR/history/catalog boundaries and local source backup. Native/PRIMARY match75; completeCoverage and productionAuthorized remainfalse.

Its first --plan-checks call4cfd61 stopped before any checks because the native optional pnpm workspace file is absent, while PRIMARY has a harmless ignored placeholder. Configuration capture now records absence explicitly, binds reviewed present bytes/identity, rejects uncontrolled Vite env, ancestor/user package configuration and hook/config-dependency sources, and pins the bundled pnpmrc. Review also found pnpm11.11 defaults verify-deps-before-run to install: every fixed script command now explicitly supplies --verify-deps-before-run=false alongside --pm-on-fail=ignore. No install, workspace copy or normalization was performed.

Focused corrected run18945f/session3559 closed d39283,12:33:19.597–12:33:41.216 UTC: all230 assertions in four files, app/tests noEmit and shell syntax passed, each actual child0/null with cleanup and raw-source/index/status/refs preserved. Summary4fd13528 binds overlayee9f1545 at signed75. Tests cover absent workspace, exact present bytes and unsupported configDependencies/ambient files. Preserve the earlier failed plan and focused type-error records. Commit the reviewed correction, create the maintained plan from that resulting clean signed source and run its complete fixed lane. Until actual terminal/output/source receipts exist, do not claim complete build verification, CI, deployment or owner PTR acceptance.

### Fixed native source-check lane — 2 October

The fixed native source-check lane is implemented alongside the existing test profile. It runs the exact source scripts through attested pnpm, without installation: scanner regression/full-HEAD secret scan, licensing/runtime assets/file sizes/sealed launch, build-mode root types and three serial production variants. Actual terminals, owned-process cleanup and source/tool/config preservation stay separate from test counters. Each successful build captures its complete bounded dist inventory twice, checks actual application/owner script and CSS references, and retains that manifest before the next build overwrites dist. Ignored Vite production env files and uncontrolled package configuration are refused; the existing ignored pnpm workspace bytes are explicitly bound. Full dependency bytes, npm audit/signature provenance, services, connected module, genuine preparation and authenticated source reopening remain incomplete. Both profiles retain completeCoverage:false and productionAuthorized:false.

Focused native run 6a629a/session10305 closed in b9285c at exit0: all228 assertions in four files, app/tests noEmit and namespace shell syntax passed. Summary5b7577f0 binds the eight-path A7 overlay66f459e9 and unchanged raw source/index/status/refs. First run99915c/session90249 retained228 passing assertions but a TypeScript error in the new filesystem-owner mock (TS2345); the one-line value guard corrected it. Earlier summary17222529 remains failed. Independent observerddffc3/044c057d proved that first original leader/children/full group absent and reproduced its raw source before repair. The import-time dist-path resolution that would break the actual sealed CommonJS bundle was moved into its callable default; the bundled import regression passed. Ordinary tests now retain the existing workflow test timeout. No Actions, dependency install, provider operation or PTR publication occurred. Actual execution of the complete new source-check plan is the next action after its signed source checkpoint.

Base is signed published A7/treeD361, parent39. Preserve the disabled Actions policy, main/PR boundaries, concurrent Assets review and in-place Desktop study/history. Resolve resulting HEAD and remote equality from actual publication receipts; this source change is not an accepted-main or full release candidate.

The resulting implementation is published as signed 39afd152/tree ca9aea5d,
sole parent d9bbab2d. Nonforced push 9fe30f closed at 11:38:16.494 UTC;
post-readback 1d4ca5a7 closed at 11:39:46.857 UTC. Both local checkouts and the
quality branch match. All four repositories stayed globally disabled and idle;
complete retained histories, latest identities, historical attempts and unchanged
game-main/PR boundaries were checked. Publication 8b919cf6 records the precise
local validation scopes below. This is a source backup, not a live 0.4 release.

The concurrent Assets main advance to 65fb1f26 was separately reviewed and
bound to its signed linear ancestry, workflow tree and fresh blob/trigger bytes
(1697b028/f269c737/1d4ca5a7). Assets PRs #38, #40 and #41 are merged; their
archive status is distinct from runtime integration and third-party rights.
Desktop refresh initially held because a Stillwater study had been inserted
independently. Review 5ccf4311 proved that was the sole new section; refresh
8f878eda preserved it and the historical suffix byte-for-byte, in the same TXT.
No Desktop siblings, new Actions runs, public workflow installation or provider
operation occurred. Resume the incomplete native coverage and bounded release
work described below; preserve all earlier failed probes and proof limitations.

This checkpoint starts from verified signed development publication d9bbab2d/tree fa538249 on release/0.4-living-realm-quality, the ordinary child of 13b8fd01. Actual nonforced push 2be8b6 exited 0; post-readback 144fca88 and publication b326f978 confirm its signature, sole parent, exact tree and native/PRIMARY synchronization. This record's resulting source identity must come from actual Git and remote readback. Main cb282bab and PR380/381 remain unchanged; PR381 is based on PR380. Alpha is available; owner PTR 0.4 is unpublished.

Resolve the current Actions policy from config/github-actions-budget.json and docs/operations/github-actions-budget.md. All four repositories remain globally disabled. D9 pre/post publication inventories 7c232d92/144fca88 reused complete run histories and refreshed activity, attempts, triggers, PRs, refs and permissions. No Actions execution was started or cancelled. Additional execution under the disabled policy is zero. Retained prior jobs establish a conservative 51-minute policy lower bound for 2 October; the aggregate daily total remains unknown. This is per-job policy accounting across midnight, not actual billing or wall time within the day. Older billing-recovery and full-hosted-Verify instructions below are historical. Do not re-enable, dispatch or infer an automatic daily reset.

The checkpoint includes the existing mobile/coarse castle Close correction and 77 passing local assertions, plus explicit app/tests noEmit. Static exact-CSS probe 832f2307 reproduced the old 30.390625px target and verified 44px and trusted touch/click in both orientations. Fresh React/World touch regressions then passed portrait 08:35:31.573–08:36:17.418 UTC (d327a4b1) and landscape 08:36:29.447–08:37:12.969 (58044453), 41 UI operations each. Actual Close clears selection; pinch, selective finger lift, survivor pan, fresh canvas selection, camera controls and disclosure focus passed. Contacts, observer, motion and owned stylesheet were cleaned; Chrome and native server closed normally at 0/null, profiles and owned groups were absent, source/index/refs stayed unchanged. Root viewed both PNGs (58a1846e/54180e8d). These runs mount unchanged compiled 8b JS/React with one explicit exact-213 CSS overlay; they are not a compiled-213, final-main, physical-phone, maximum-density or full R06 pass.

The landscape capture exposed a separate zone-legend overlap with bottom controls. The existing legend now hides below 700px viewport height as well as on narrow screens. Exact-CSS layout probe v3 (526780d1), 09:07:35.792–09:07:41.884 UTC, passed eight before/after coarse and noncoarse profiles, including both sides of the height boundary. Visible legends did not intersect cards; disclosure hit targets, overflow and the existing Close sizes passed. Chrome closed normally at 0/null, with zero owned actors, its profile removed and all inputs unchanged. Root viewed the short coarse and retained noncoarse-boundary PNGs. Static source-derived markup is distinct from the earlier React touch runs and does not close full R06. Preserve v1's headless pointer-classification failure and v2's real noncoarse 600px overlap. Publish the coherent source/docs checkpoint; do not repeat completed unit/types or compiler rehearsals without a changed input or unresolved failure.

Independent retained-file cadence analysis aeabc9ba rederived 12,965 bursts and 12,953 intervals; callback gaps stay within the expected 3/4/5, and all 14 long intervals contain a long ambient RAF gap. No extra product scheduler callback was demonstrated. All 12 strict nominal World misses remain failures; no ceiling changed. The next resolving measurement is causal RAF-request timing in one reduced-profile capture, not a speculative scheduler patch.

The actual selected native producer ran at 13b8fd01 from 09:39:45.409 to 09:39:55.820 UTC, outer tool253edb exit0. It passed 14 ordinary Vitest assertions and six module Node assertions, in two files, with both child terminals 0/null and zero raw stderr. Summary 24516228 and independent original-boot leader/children/full-group absence 475c90a9 confirm unchanged source, physical index and refs. Parser/reporter offline checks separately passed 18 cases (cc02dda5). This is selected diagnostic coverage only: completeCoverage and productionAuthorized remain false; no verifiedSha adapter or production caller was installed.

The maintained scripts/verify-native-source.mjs CLI now separates effect-free imports from plan/run operations. Its API verifies source/tool identities, discovers the ordinary/namespace/module union, reserves bounded reports and retains actual terminals and cleanup. The first three domains are implemented; policy, types, builds, services, connected module and genuine preparation still require complete maintained coverage and an authenticated reopenable proof. completeCoverage and productionAuthorized remain false. The actual workflow-evidence consumer supports explicit native-full plus a SHA-256 locator, verifies actual content-addressed bytes, and deterministically refuses incomplete evidence without hosted fallback. Default hosted behavior is preserved. A corrected five-file run passed 198 assertions, app/tests noEmit and shell syntax; its exact receipts and runtime cleanup repairs are recorded in local-operations.md.

Use the practical hybrid route: complete local source verification and preparation, then retain genuine GitHub dispatch/OIDC, existing permits and signed observations for bounded operations. Initial observation services accept genuine current-main dispatch identity without hosted Verify. Current dispatcher callees still compile/materialize despite installed workflow bundles, so prepared-artifact reuse or measured bounded execution remains necessary. Existing opaque handles cannot simply reopen a private prepared family. Public Warpkeep-Live Pages remains legacy/main-root (fresh GET c37cad). The source-reviewed config/public-pages-ptr-workflow-v1.yml template is implemented with explicit workflow-mode planning, both publisher rechecks and actual-run/file-hash postflight; it is not installed in the public repository, admitted, dispatched or deployed. A timeout alone does not enforce cumulative daily allocation. The separate recovery Pages issue/claim service still requires hosted Verify and its source-closure artifact. No execution plan is currently admitted. Preserve accepted main/source, owner authority, G001 progress/freeze, G002 sealing, observation chronology, update/adoption and S-to-A invariants. Never manufacture GitHub/OIDC IDs or relabel development/compiler/selected diagnostics as production authority.

The native VM's default policy has no noninteractive helper route. Its documented one-off WSL-root --as entry drops the actual test body to UID/GID 1000. Temporary local helper access exercised exact PIDFD cleanup and was removed after all owned probes (bbeece/71e657). The repaired helper accepts the actual sudo monitor's mixed UID tuple while preserving boot/birth/PGID, caller, pidfds and exact signal checks. Namespace v4 ran11:04:15.100–11:09:03.934 UTC: real child0/null, zero stderr,260 passed and one source-declared unsupported-runtime skip. Strict aggregate1f8d199a remains false/outerexit1 because a skipped leaf is not a pass; complete native coverage needs explicit platform-skip dispositions. Independent9f169e71 confirms original actors/groups absent and matching raw source; the run separately checked its physical index, status and refs. Before unattended native verification is enabled, install an independently reviewed root-owned helper bound to the current source digest and verify exact allowed commands. Do not grant arbitrary sudo, add a key or ask the owner to repeat GitHub login for this local environment issue.

Alpha root returned HTTP 200 at 07:34:02.049 UTC (3e0ff6ee), availability only. The existing Desktop Next Work TXT was refreshed in place after D9 publication (bfb33ebe), with its historical suffix unchanged and no sibling files. Refresh it again only after the next verified source publication. Preserve private candidates and journals; retention review c312c7d7 remains conditional. No new gameplay feature, key, financial change, clone, dependency install, provider deployment or storage retirement was made.

## Previous verified development snapshot — 2 October 2026

At this notes snapshot, local source is signed, backed-up 14ac294e/tree 73ea369f, a three-note child of runtime 8b57f62a/tree 3f810073. Main cb282bab, PR380/381 and Alpha 0.3.43 remain unchanged; owner PTR 0.4 is unpublished. Resolve subsequent notes HEADs from actual Git and publication receipts rather than treating this dated snapshot as a permanent branch status.

Preserved runtime evidence is 224/224 native assertions in eight suites, app/Vite-config noEmit, sealed/policy checks and zero-finding scan 817e2296. The 474-case, 21-suite frontend overlay and selected-test types retain separate scope; the earlier 223/224 failure and cleanup remain historical evidence.

The genuine development rehearsal at 14ac ran prepare then independent rebuilding check from 05:27:48.472 to 05:53:02.388 UTC. Both children exited/closed 0 with signal null, and all 19 result fields match: 102 outputs, family eb011331, candidate release-workspace-849154f508873ce35d5b64bcb8dd1614. Receipt 177ecd87 and independent absence 8b94346e verify the original actors, whole group, source/index and candidate. finalReleasePrepared is false: no export/integration, future-M1, hosted or provider authority is claimed. The tracked historical 16-file family and seven compiler artifacts were not replaced.

Optimized synthetic Keep camera measurements remain bound to 8b: all 12 eligible 60-second CPU-submission samples pass unchanged ceilings, with profile-worst p95 17.2/18.0/33.8/17.7 ms against 33.4/50/75/50 ms. Rederivation 8dd3f15d pairs 42,483 actual SceneHost/GL bursts; profile maxima 73/255,628, 54/108,028, 51/79,004 and 55/108,148 draws/nominal triangles meet unchanged caps. World v2 preserves 12 eligible nominal misses, worst 50.9/67.5/84.7/67.4 ms against 50/66.7/83.4/66.7 ms; no ceiling was raised.

All four balanced/reduced Keep lifecycle variants passed 20 remount cycles and three context restores each. Resources matched baseline and final SceneHost-owned RAF/loaders/listeners were zero. Whole-page post-GC heap growth was 1,315,324–1,376,564 bytes, slope 59,090.84–62,301.34 bytes/cycle, within existing diagnostics. Portrait/landscape v3 trusted Chromium touch runs each passed 13 interactions and preserved the placement draft through pinch, selective finger lift, continued pan and end. Root separately reviewed both emulator screenshots without visible horizontal clipping. Retained earlier touch failures were harness transport/driver limitations; no product defect was established.

These are synthetic component results using unchanged 8b presentation code at operating source 14ac. They do not establish input-to-presented-frame latency, GPU completion, maximum-density/World–Keep–realm cycles, physical-phone/owner acceptance, final-A cold bootstrap or full R06. See local-operations.md for actual operation times, receipts and failure details.

Signed-in readback 0dcdf53c records exhausted included Actions usage and the paid-usage stop; CLI authentication works, while the existing owner billing handoff remains pending. This is observed account state, not a permission grant. No financial change or trial CI was made. Retention review c312c7d7 leaves the prior 219G store and conditional 3.10 GiB cb-draft retirement unresolved; no private-run deletion/recovery occurred.

After actual source idle, sign/scan/sync/back up only these three excluded notes. Hosted release still needs exact-source PR/main acceptance, actual M1/main Verify and its own prepare/check/generated M2, then accepted S/main Verify/Pages and the existing provider/PTR/final-A route. The development candidate and synthetic fixtures do not replace those gates.

## Historical unpublished integration record — 2 October 2026

## Current Living Realm source checkpoint and Actions blocker — 2 October 2026

R2 `d4f40cb5`, tree `7efff06b`, is the signed direct child of R `53edd619`.
Its exact native public-caller run passed all 44 cases across four files, with
zero failed/skipped/pending cases; both policy syntax checks and app/tests noEmit
types passed. Source/tree/index and all tracked raw files stayed unchanged,
and the independent post-terminal owner/group proof closed cleanup. The outgoing
redacted scan found zero findings. These are R2 local checks, separate from
R's earlier 212-case validation and cancelled hosted Verify.

The one backup-only push completed at 2026-10-02T01:19:42.914Z. GitHub confirms
`release/0.4-public-payload-paths` at exact signed R2/tree/parent, with no open PR
and no CI trigger. Receipt `06714f72` records PR380 unchanged at R, PR381 unchanged
at `8c22fddb`, and main unchanged at `cb282bab`. Nothing here claims publication
of 0.4 or acceptance of a new operating main.

GitHub blocked PR381 Verify `36945781752` attempt 1 before tests: all seventeen
jobs have no executed steps/runner. The retained terminal `d0e2775b` and signed-in
billing readback `52e2a8e4` establish the account Actions billing boundary, not a
product test failure. No retry, new PR-head update or provider operation was made.
Resolve that actual account blocker, then fresh readback under the current user
Actions policy; do not introduce recovery keys or infer an accepted CI result.

This source checkpoint integrates the reviewed PR381 Living Realm presentation
with R2's public-publication repairs and bounded fixes to existing Keep/World
behavior. It preserves the original PR author ancestry. The Keep corrections
restore ambient wake/reconcile behavior; World repairs preserve Worker journeys,
sub-quantum progress and confirmed cargo, bound decorative trail geometry, and
admit/count actual sky/journey uploads within the existing host budget. No new
server rule, player authority, asset or performance allowance is introduced.

The final source-only v4 overlay run used immutable `8c22fddb` while the real
primary/native checkouts stayed at exact R2. All 474 cases across 21 affected
suites passed, with zero failed/skipped/pending cases, at 02:16:17.997 UTC.
Full app plus selected-test types and Vite-config noEmit checks passed by
02:16:19.288 UTC. Actual outer exit0, run `149021c2`, independent results
`dcb3706b` and idle proof `b1c20979` bind the final candidate bytes, absent
owned group and unchanged source/index/caches. This is component/unit/type
evidence, not whole-repository types, a product build, browser or R06 acceptance.

Retain the earlier attempts separately: original-PR regressions were 20 cases
with 13 passes/7 failures, then provisional 470 passes (`376b7e16`, older
journey `0751e0da`). The later v3 baseline had 53 cases, 49 passes/4 failures;
its composed suite had 473 passes/1 failure out of 474 and both type checks
passed (`f935e864`, outer exit1). The remaining failure exposed the telemetry
getter resetting the latest completed frame's upload counters. The v4 host
retains those counters and its regression passed in the final 474-case run.
These earlier failures are retained evidence, not relabeled successes.

The thirteen new browser modules enter the protected import namespace through
the supported sixteen-output source-family producer. Its policy, inventory,
count consumers, source pins, manifest and four workflow pins belong to this
source checkpoint; use the actual signed checkpoint receipt for the resulting
source/tree, member count and closure SHA. The preserved cb compiler manifests
and five bundle bodies remain authentic historical inputs. The changed
compiler-input namespace does not make them current production authority.

Next, finish the signed source checkpoint's independent native source-family,
checked-in/policy/topology checks and outgoing scan, then back it up on the
unopened `release/0.4-living-realm-quality` branch. No integrated source SHA,
new hosted pass, operating S or production acceptance is invented in these notes.
Once GitHub Actions billing is demonstrably restored, refresh actual
repository-wide history/activity under the current user policy. Retarget existing
PR381 to main first, then make one reviewed non-forced head update and require
its exact-head normal source Verify. Keep PR380 until the accepted integration.

Accepted signed main M1 and its own successful main Verify come first. Sync the
idle native checkout to actual M1 and run existing private Node22
`scripts/local-release-assembler.mjs prepare`, followed by
`check <actual-handle>`. Authenticate/export/receive the genuine outputs;
commit, verify and integrate generated-only M2. Only resulting accepted main S,
its exact successful main Verify and separate preparation Pages classification
can enter the provider route. Do not compile a candidate then squash away its
compiler-source ancestry; production preflight checks the real commit/raw bytes.

At accepted S: existing Linux preflight -> G001 observation -> preserving
prepared bridge -> initial disabled preparation signer/gateway -> signed PTR
observation -> PTR then G002 existing-update inspect/apply and signed adoptions.
Immediately reopen the private prepared receipt and completed deployment journal
under `production-admin-v1`. They are separate from the sealed bridge chain:
initial updates/adoptions can precede that chain; later activation inspection or
generation calls `createSealedRealmsProductionAuthBridgeState().establish()`
internally with deployment evidence and fresh live attestations. No manual
authority file or invented establish CLI is supported. Generate/check genuine F
through the existing private ingress while S stays pinned; generate activation
with the initial disabled-signer policy/epoch, then reviewed signer promotion.
A remains the supported direct S child changing only binding/package/package-lock.
Then build actual A /ptr/, sign/publish the public mirror and run postflight.

Measured W `028b1e4b` remains separate: nine mobile Keep cadence samples meet
unchanged 50/75/50ms ceilings; twelve synthetic World samples retain strict nominal
misses. Keep H2's desktop 33.6ms versus 33.4ms miss and the ungraded 59998.7ms
World attempt. PR381's new presentation has no production-component timing or
visual acceptance yet. None of this proves full R06, GPU completion,
input-to-visible/touch acceptance, final-A cold bootstrap or owner/physical-phone
acceptance. Alpha 0.3.43 stays public; 0.4 owner PTR is not live. Preserve G001
progress/admission freeze and sealed G002. Existing Desktop notes update only
in place; ignored candidates stay under this repository.

See [local operations](../../evidence/0.4.0/local-operations.md) for exact
source-bound receipts and [performance](../../evidence/0.4.0/performance.md) for
remaining workload and device requirements. These notes accompany the reviewed integrated source bytes; actual signing,
source-family/local checks, hosted Verify and accepted-main compilation have
separate receipts. No accepted S or production activation is claimed here.

## Historical release checkpoint — 1 October 2026, 21:26 UTC

Historical source-bound snapshot; superseded for the next action by the current
checkpoint above. Its measurements and completion claims retain their own dates.

Snapshot after local World scheduler validation, before its new signed checkpoint.
Resolve actual local/remote refs and latest CI instead of inferring a future SHA.
Main remains `cb282bab`; [PR #380](https://github.com/ael-dev3/Warpkeep/pull/380)
currently publishes H2 `a903e78e`, tree `344f5768`. Its exact normal
[Verify 36920400660](https://github.com/ael-dev3/Warpkeep/actions/runs/36920400660),
attempt 1, passed all 17 jobs at 21:20:49 UTC. The retained terminal summary is
`artifacts/qa/october-release-a903e78e-verify-terminal-summary.json`, SHA-256
`7743f9fcee858382936054c21ec1756733e5fac7d71ee78cc100eed6e43f29b4`.
Three complete job logs prove CI merge `68e3467e`, same H2 tree with parents
`cb282bab`/`a903e78e`. This is PR evidence, not resulting-main authority.

Integration is deferred for a demonstrated existing World scheduler defect.
The genuine H2 World fixture recorded reduced submission p95 of
100.5/100.2/100.4ms against 83.4ms. An exact-source, browser-batch model reproduced
early modulo carry producing an extra update. The local source now carries
signed early debt and a tolerance bounded to 1ms and half a period. Caps remain
24/18/12Hz; long-stall, visibility/activity and retirement behavior remain.
Eighteen scheduler tests and 153 renderer/runtime/legacy-cleanup tests pass;
app noEmit types pass. Read [performance](../../evidence/0.4.0/performance.md)
for retained failures and the distinction between modeled repair and live acceptance.

The six authored paths are this file, `next-work.txt`, `local-operations.md`,
`performance.md`, `src/components/realm/realmAmbientScheduler.ts` and its test.
Use the exact reviewed manifest and existing supported 16-file projection.
The scheduler is a raw member of the prepared closure, but is outside all four
cb compiler graphs and seven recovery inputs. Its test/notes are outside both.
Retain both compiler manifests, all 212 inputs (135 tracked) and five bundle
bodies. No new full compile, prepare handle or 102-output completion is justified.

Next: sign the coherent H2 child on `release/0.4-world-scheduler`, synchronize
the primary checkout, scan, publish an explicit non-forced backup, and update
existing PR #380 once. Old G/H2-only merge helpers are superseded for that child.
Require normal exact-head and resulting-main Verify, then freeze actual S through
the existing provider/component/activation route below. H2 measurements stay
bound to H2; build the repaired World before measuring it. Four Keep-only lifecycle
profiles passed their memory/resource/context checks, while nominal World and
one desktop placement timing miss remain open. PTR is unpublished; final-A
R06, actual owner and physical-device acceptance are still required. No owner
action is currently needed; no provider write or new recovery key occurred here.

## Previous release checkpoint — 1 October 2026, 20:02 UTC

This notes snapshot follows the final H component run at 20:02:51.443 UTC and
precedes H2 signing/publication. Resolve actual Git refs, PR head and SHA-bound
CI evidence before continuing; no self-SHA is embedded here.

The authored source correction is integrated into signed main
`cb282bab1f6df094643e4b18b20db3ce39e96ddf`, tree
`feeeff15c458e18b793c071e67c16eb707d28a6f`, parent `acbb5128`.
[PR #379](https://github.com/ael-dev3/Warpkeep/pull/379) merged at 16:30:55 UTC
after all 17 jobs passed for its exact reviewed head `d16355f2` in
[Verify 36883391676](https://github.com/ael-dev3/Warpkeep/actions/runs/36883391676).
Actual-main [Verify 36892578403](https://github.com/ael-dev3/Warpkeep/actions/runs/36892578403)
passed all 17 jobs in the 17:36:29.827 UTC terminal readback. Retain its actual
terminal result and subsequent Pages classification separately from PR evidence.
The preparation checkouts were synchronized to this exact compiler-input main;
the earlier development branch at `d16355f2` is retained. Signed generated G
`a8feb8c4`, tree `96507e3f`, is published in
[PR #380](https://github.com/ael-dev3/Warpkeep/pull/380). Its exact
[Verify 36907314985](https://github.com/ael-dev3/Warpkeep/actions/runs/36907314985)
passed all 17 jobs at 19:16 UTC. Resolve actual local repair H, the published
PR head and later accepted operating main S separately; G's CI is not H/H2 CI.

The deployment audit found a separate, real auth predecessor incompatibility.
The live v50 is the known 27 September QR RPC recovery of reviewed B0 source
`308f901d`, with Wrangler provenance and the original binding namespace.
The preparation adapter incorrectly required a predecessor `PTR_ENABLED`
binding and original API-upload metadata. This checkpoint repairs those exact
predecessor checks; successor API validation and the original B0 multipart
source authority remain intact. No new auth mode or gameplay feature is added.

Actual `cb282bab` native prepare/check ran 17:20:59.498–17:46:10.895 UTC as
UID 1000 with pinned Node 22.22.3 and actual tool exit 0. Its genuine handle is
`release-workspace-5fd662e2cd5d954fd6b50961384369b4`; receipt stem
`artifacts/qa/october-release-cb282bab-actual-main`. All 19 completion fields
matched; independent full-group, raw-source and physical-index checks passed.
The authenticated export covers 102 outputs, changing exactly ten paths, with
genuine `cb282bab` compiler manifests. Isolated receive completed at
17:53:29.966 UTC, preserving HEAD, normal index and nonoutputs.
That generated family and the seven excluded notes are signed, scanned,
published and synchronized at G. Preserve this genuine preparation and its
102-output receipts. Do not rerun the completed source merge, stale M2 helper
or full compilation for excluded notes. A PR-head compile or equal tree cannot
replace signed main ancestry or push-main CI.

The existing Keep feedback repair is signed H
`0d36f06c7f2b1d65169be64e3aecc88b9e27096b`, tree
`c548e407d92b8cf7560452fcb9432af0c938f118`, direct child of G, completed
19:21:02.308 UTC. Primary/native sync completed 19:25:00.827 UTC; the explicit
`release/0.4-keep-feedback` remote backup was verified at 19:33:49.499 UTC.
Its affected Windows suite passes 139 tests, native checks pass 50, app types
pass and outgoing scanning finds no secrets. The supported 16-output closure
family passes fresh derivation and native policy; current closure is `9e0126ea`.
Both cb compiler identities and all 135 distinct committed compiler inputs are
unchanged. H does not require a new M1/M2/full compilation or establish a new
102-output completion; its changed closure is separately authenticated.

The genuine H production-component Keep build completes
19:25:37.735–19:25:38.620 UTC, with clean unchanged source/index and independently
absent owned group. Three 60-second camera samples per completed profile give
desktop high p95 17.1/17.1/17.1ms, portrait balanced 17.5/17.6/34.0ms and
portrait reduced 17.4/34.3/17.6ms and landscape balanced 17.4/18.8/34.2ms.
All four runners exit 0; samples are eligible,
exactly application-RAF/GL paired, have no failure and are not driver-limited.
All four meet their unchanged cadence budgets. The first landscape fixture
geometry failure is retained; ordinary scrolling before timing corrects the
ignored setup without changing the profile, WebGL or measurement gates.
Exact receipt hashes,
build/process proof and measured scope belong to
[local operations](../../evidence/0.4.0/local-operations.md#keep-feedback-repair-and-production-component-measurements--1-october-2026)
and the [performance contract](../../evidence/0.4.0/performance.md#repaired-keep-production-component-measurements--2026-10-01).

Next: freeze the five canonical notes as a notes-only H2 checkpoint.
Sign, scan, synchronize and back up that exact
checkpoint. At this notes snapshot, H2 signing/publication and CI are pending;
resolve its actual Git/PR evidence before acting, rather than deriving a self-SHA
from these notes. After a fresh complete Actions
inventory and trigger review, update PR #380's head once, require normal Verify
for the final head, integrate it and require exact resulting-main Verify before
freezing S. Then follow the existing S/F/A provider route below to owner PTR
publication. Do not claim live 0.4 from a backup push or component measurement.

Alpha remains live at 0.3.43; owner 0.4 PTR publication is pending. Full shaped
production R06, the actual-owner journey and physical-device acceptance remain
open. The planned frozen-S, separate signer-component F and direct-child A
route remains the publication path. No provider write follows from metadata,
simulated caller regressions or source-family verification alone.

Detailed source-bound failures, provider metadata and recovery steps are in
[local operations](../../evidence/0.4.0/local-operations.md#qr-recovery-predecessor-compatibility--1-october-2026).
Earlier failed component diagnostics retain their exact source bindings.
The measurement-only fixes for explicit favicon, WebAssembly permission and
fully received model cleanup cancellations are complete. Partial, blocked,
unknown or invalid requests remain denied; no product loading policy was relaxed.
The current sampler drives real existing controls and retains idle separately.
A settled scene intentionally idles. The synthetic component presentation does
not establish final-A cold bootstrap, owner/device acceptance or full R06.

### Operating source and signer-component route

Freeze accepted operating main **S** after the authored predecessor correction
and its genuine actual-main generated family pass.
Keep this source fixed from the first prepared auth-bridge deployment through
activation. Current bridge receipts require that exact operating source. Historical
realm adoptions have a separate authenticated route; they do not authorize a
historical bridge. Integrating fixture outputs into main would change the bridge's
operating source before activation.

1. At S, run supported Linux preflight and the real G001 policy observation;
   deploy the prepared auth bridge, then the initial disabled preparation signer
   and gateway. Keep their source-bound receipts and actual provider readbacks.
2. Inspect and apply the gated existing PTR/G002 updates, retaining real signed
   pre/post observations and adoption records. Read-only inspection alone does
   not satisfy the signer dependency of an actual update.
3. Run the real fixture generator and its check against S and those adoptions.
   Publish a separately signed and scanned **component F** branch from S containing
   exactly the generator's five outputs under `services/release-recovery/`:
   `fixtures/toolchains/linux-x64.json`,
   `fixtures/spacetime/g001.raw-module-def-v10.json`,
   `fixtures/spacetime/g002.raw-module-def-v10.json`,
   `fixtures/spacetime/ptr.raw-module-def-v10.json` and
   `fixtures/spacetime/manifest.json`.
   Keep F separate from operating main; its genuine realm provenance remains S.
4. Prove the exact F fixture bytes and full signer package. Generate activation
   inputs while the initial signer's exact `RECOVERY_PREPARATION_POLICY` is still
   installed. Then promote and verify the full signer with the actual arming
   inputs, retaining the existing key, RPC authority, ledger and epoch, before
   publishing activation. Final TOML does not automatically preserve omitted
   variables; do not depend on policy survival across promotion.
5. Create and publish actual **A** as an exact direct child of S, containing only
   the supported activation binding/package/lock changes. Keep its real commit
   timestamp and source proofs. This audit found no Git commit-date freshness
   guard; census/confirmation freshness belongs to their actual validation phase.
   Execute
   the existing provider, Pages/mirror and postflight gates before claiming PTR
   publication or release acceptance.

This is a planned route, not evidence that F, fixture generation, signer promotion
or A exists. Full shaped production R06, actual-owner journey and physical-device
acceptance remain open. The [local operations record](../../evidence/0.4.0/local-operations.md#m1-native-preparation-and-m2-publication--1-october-2026)
owns the receiver reconciliation and source-bound receipts; the
[release checklist](../../operations/0.4.0-release-checklist.md#current-release-verification--1-october-2026)
owns acceptance. Earlier checkpoints below retain their original dates and
source scopes and are superseded for the next action by this section.

## Current local checkpoint — 30 September 2026

Historical checkpoint, superseded by the 1 October release checkpoint above.

October continuation: 1 October 2026, UTC and Europe/Budapest.

Continue the active, unmerged [PR #374](https://github.com/ael-dev3/Warpkeep/pull/374)
on `fix/g001-census-admission-proxy`. It includes reviewed PRs #375–#378;
do not merge their older heads separately. Main remains `786c0b2b`.
Resolve the published PR head separately from the current local repaired source.

The latest completed development preparation is `7be8ae48`,
tree `1c19a7e7`. Its `/ptr/` production build is terminal, exit 0:
2026-10-01T09:04:33.674Z–09:09:21.573Z, with clean unchanged input,
UID 1000/Node 22.22.3 and verified absent owned actor/group.
Payload and independently checked mirror/Alpha-preservation
checks pass at this exact source, preserving all 341 Alpha entries and removing
none. The rendered keyboard review remains separately bound to `789933e2`.
Retain `artifacts/qa/ptr-final-build-summary.json` and
the source-bound preservation receipt; these are development
preparation receipts, not exact-M1/M2 integration or deployment.

The full native suite remains separately bound to `1ab86add`, tree `ee5804e3`:
12,720 passed, zero failed, 97 skipped across 694 actual files, exit 0.
Its input stayed clean and unchanged, with zero new fixture roots or historical
removals. Retain `artifacts/qa/tervain-final-root-*`. Later preview-label checks
pass 17/17 in two actual files, with app types; they do not relabel the full run.
The four production-menu images, narrow/landscape/desktop Settings geometry and
bounded desktop/4× CPU phone-size menu measurements remain scoped to `1ab86add`.

The actual `8d3b4c38` 320×640 Shift+Tab defect is repaired: two caller
regressions fail before repair and 124 affected tests across nine actual files
pass afterward (76 menu/modal, 48 realm/worker/chat/lyrics), with pinned app
types. Fresh `789933e2` production DOM and screenshot review confirms fully
visible focused controls after reverse entry and both boundary wraps in
Settings and Terms. Escape restores the correct caller, Terms remains unchecked
and there is no horizontal overflow. The tab is blank, viewport reset and exact owned
preview stopped/absent. This closes the built keyboard visibility check;
it does not establish legal or owner acceptance.

The separate `8d3b4c38` DEV Keep04 retained-switch heap/context diagnostic
passes its bounded local comparisons and independently verified cleanup.
Production world/keep/realm R06, actual-owner and physical-phone acceptance
remain open. The [performance contract](../../evidence/0.4.0/performance.md)
and [local evidence](../../evidence/0.4.0/local-operations.md#completed-keyboard-readback-and-keep-lifecycle-heap--1-october-2026)
own exact measurements, receipts and their limits; keep earlier sources separate.

Provider reads on September 30 at 22:33–22:39 UTC verify the documented Cloudflare
production profile/account, existing native private-config permissions and
immutable realm targets. CLI/login, deployment and PTR schema reads all succeed;
no human login is required by this readback. The live PTR still lacks all seven
required gameplay tables and five procedures. This is a pending source-bound
existing update, not a demonstrated authentication failure. Metadata reads do
not prove secret values, update permission, owner-row/session or release acceptance.

The [Tervain study](../../engineering/repository-ecosystem.md#sharing-with-tervain)
adapts grounded vegetation, stable detail selection and material grouping.
Existing shared models already match; no duplicates were copied. Its separate
menu score remains project-specific. Independent world/keep lifetime and
background/resume source review found no further demonstrated defect.

Both calendars are now October. The read-only repository-wide Actions
inventory completed at 2026-10-01T00:02:38.033Z: Warpkeep and Warpkeep-Live
have no queued/running work, their current workflows are active and `0babbc46`
has no applicable Verify. Retain
`artifacts/qa/october-actions-inventory-2026-10-01T000017236Z.json`.
The successful historical main Verify and failed old census/G002 inspections
retain their original sources; they cannot authorize this candidate. No hosted
run for the current development head has passed, and no new trigger, merge or
provider write is established by this inventory.

The first normal October PR Verify is
[36795398220](https://github.com/ael-dev3/Warpkeep/actions/runs/36795398220),
attempt 1, on `974a3ae6`, started at 00:17:07 UTC. Its Linux history scan
rejects one public Cathedral shader cache label at historical `9e07f475`; the
real scanner regression itself passes. The candidate adds only an exact
path/value exception, with a same-path changed value and wrong/copied-path
negative coverage: 49 allowed examples and 98 mandatory findings pass the
real Gitleaks 8.30.1 regression, plus seven focused unit tests.

The native-contract job separately fails during Dispatcher collection because
its depth-one checkout lacks retained compiler input `5d175edf`. Set only that
checkout to full history, preserving original manifests and authentication.
The existing native Dispatcher suite passes all 90 tests with the genuine
historical tree available. Retain the original failed job logs and local
readbacks under `artifacts/qa/october-974a3ae6-*`; do not relabel that hosted
attempt as passing. It finishes at 01:19:44 UTC with 14 independent jobs
successful, only the diagnosed Linux/native-contract leaves failed and their
aggregate failed. The connected migration/module job succeeds at 01:19:37 UTC.
This hosted attempt does not verify the later local maintenance repair.

Published `7be8ae48` has normal PR Verify
[36841020942](https://github.com/ael-dev3/Warpkeep/actions/runs/36841020942),
attempt 1. At 09:40:09 UTC, 13 independent jobs succeed, two diagnosed tests
fail and only the module job remains active. The failures are a stale Pages
toolchain service assertion and post-gate SIGKILL test synchronization; both
existing tests are repaired locally. Preserve the active run and its source.

Current local family checkpoint `a9878234`, tree `78b95888`, derives from
authored `be9596dd`. Its complete 16-output family independently reproduces
and native policy passes; manifest is
`c64fe8b750e8d67bb551137991fb440568349c74cdddaeb34af1cc91f6f939d5`.
Retain `artifacts/qa/tervain-final-family-verification.json` at this separate source.
It retains CLI 11.11.0 and explicit no-switch handling; current CI/Pages action
v6.0.10 uses the reviewed 11.19.0 seed. See
[maintenance evidence](../../evidence/0.4.0/local-operations.md#patched-pnpm-runtime-and-current-linux-snapshot--1-october-2026).
Native current-source checks pass 160 cases, zero failures and three Darwin/ARM64
platform-only skips across seven files. Separate Pages ordering and recovery
composition cases each pass one selected case; their 163/353 unselected cases
are not executed evidence. The `7be8ae48` build and earlier hosted/full-suite/
rendered results retain their source scopes. Final current-source preparation,
publication and normal hosted Verify remain pending.

Next, await the active module's terminal result and finish exact final-head
preparation, then publish one coherent
signed checkpoint without CI skip directives and use its normal PR Verify.
Verify has no manual dispatch; reopening/dispatching
the same skipped head is insufficient. Refresh final-head SHA-bound local
receipts. A notes-only checkpoint needs no additional generated-output commit
if independent family derivation returns identical bytes. Keep an active run's
source pinned and do not repeat closed keyboard/heap diagnostics for notes alone.
Require successful final-head PR Verify, then signed source-only M1, exact-M1
native prepare/check, generated-only M2 and exact-main Verify before live
preservation, sealed-realm/owner-PTR operations, owner/device acceptance and
the delivery ledger. For both M1 and M2, supply an explicit reviewed squash
subject **and body** without CI skip directives; do not inherit the PR description
or aggregated historical commit bodies. Verify each resulting signed merge and
its exact source before continuing. The existing Alpha stays available;
G002 remains closed.
PTR publication follows its source, activated configuration and deployment
gates; final release acceptance still requires owner/device evidence.
Complete expensive preparation before activation's fresh **inline** G001 census.
Use the existing [connection/recovery paths](../../operations/0.4.0-infra-access.md#resume-without-guessing)
and [PTR publisher](../../operations/0.4.0-infra-access.md#existing-alpha-frontend-restored);
no new recovery key, hosting clone or Desktop output is needed.

The refreshed complete Actions inventory ends at 01:22:11.841 UTC with no
active runs in either repository. Retain
`artifacts/qa/october-actions-refresh-2026-10-01T012042325Z.json`.
The reviewed signed repair is backed up at the GitHub source-history tag
`source-history/warpkeep-0.4-october-validation-271946c4`.
The corrected publication guide targets activated A, and the owner journey
records the authenticated Farcaster PTR launch; source-bound PTR readbacks
belong before activation. These instructions do not establish live acceptance.

## Previous delivery checkpoint — 30 September 2026, 17:57 CEST (15:57 UTC)

PR #374 is the open, unmerged candidate on fix/g001-census-admission-proxy
against main 786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32. It includes reviewed
work from PRs #375–#378; do not merge their older heads separately. Resolve
the current exact head and final closure/build/publication-plan hashes from
PR #374 before acting.

Linux recovery now uses kernel boot UUID and start tick rather than a driftable
wall-clock display. Live legacy/digest mismatches remain unknown. Scoped native
caller tests pass 276/276 at a23b863c, with zero new private test homes or
historical removals. Preserve ambiguous records; do not delete locks or create keys.

The complete native run at a23b863c found 110 failures. Repairs now derive the
missing paired-envelope source pin, bind current-byte recovery fixtures and
pair retained compiled dispatcher fixtures with their original Git input.
The actual native release CLI also exposed an older operator refreeze. The
reviewed seven-helper reference now binds signed 580cd588; all 134 remaining
frozen blobs, including the module/build recipe, are unchanged. New tests reject
byte or mode drift in each helper. All previous failure boundaries pass focused
native checks; a new POSIX test-mode setup issue is repaired and its regression
passes. The failed attempts remain retained, separately scoped.

The complete four-worker native suite passed at signed 3d47d05e: 12,670 passed,
zero failed and 97 skipped across 694 files, exit 0. Source tree is
5a65e56567fe64c80a177326ced7a8015729d0f5; Node 22.22.3/UID 1000 and a clean
checkout are recorded. Zero new private fixture homes or historical removals
remain. The job is terminal. Retained source/report/log/summary/exit evidence is
under artifacts/qa/root-suite-recovery-final-*; keep the earlier failed attempts
separate. The complete source family independently reproduces after refreeze
and native policy passes. PR #374 owns the final exact-source build/payload/mirror receipts.

Later public-feedback/legal-contact, project-status and build-stamp repairs pass
86/86 native checks at signed 601635cd, separate from the 3d47d05e full pass.
The complete 16-output family independently reproduces and native policy passes.
See [local evidence](../../evidence/0.4.0/local-operations.md) for exact scope and capture.
PR #374 maintains final exact-source build/payload/mirror receipts. The 28 retained
compiler paths and original inputs remain unchanged. These source corrections
are not yet served; the PTR plan preserves the existing Alpha root.


The source-only compiler inventory derives 28 retained paths, all unchanged
against main; the earlier 22-path summary was incomplete. Original compiler
inputs remain intact. Fresh audits are clean in all four package boundaries;
GitHub's main alerts await merge. See the latest local evidence and PR #374.

Existing mobile input, confirmation, focus and readability defects are repaired.
World controls meet the scoped 44px minimum and opened drawers remain reachable
in short landscape. Their 81 host tests and rendered viewport checks passed.
Real SpacetimeDB 2.6.1 testing also repaired first-use initialization: only the
verified module-host prefix plus a complete known error code is recognized,
preserving uncertain outcomes and exact retry. Independent capability/controller
checks passed 143/143. Read [local evidence](../../evidence/0.4.0/local-operations.md)
for source scopes and reproduction.

Connected loop session 64935 passed at exact 98a561db in 321,215ms (5m21s),
with all nine outcomes, normal timers and verified cleanup. It proves the
real module/client gathering, construction, improved return, exact retry/single
deduction, manual fixture-session renewal and client reconnection. The synthetic owner/atlas and
running in-memory database do not establish production-owner play, server
restart or physical-device acceptance. Actual Quick Auth expiry through the
production browser provider remains part of owner acceptance; synthetic caller
tests cover it, but this smoke does not.

At exact e308a64d, affected menu/closure/capability/controller/QA tests passed
315, zero failed, one platform-specific skip; native production build and
sealed-launch/license/file-size policies passed. The earlier full suite at
15b88b57 passed 12,603, zero failed, 97 skipped and predates later CSS/wire fixes.
A subsequent publisher-contract review found a real CNAME LF/CRLF mismatch.
The old plan hashed the clean Windows working file while the publisher preserves
its immutable Git blob. The repaired planner preserves exact binary parent bytes;
all ten planner regressions pass. The e308 mirror plan is superseded. Final
source-family regeneration and exact-source build/plan receipts belong on PR #374.
Keep retained compiled outputs and original input identities intact for M1.

Alpha root returned HTTP 200, auth health 200 and /ptr/ HTTP 404 at 15:00 CEST. PTR is unpublished;
sealed preparation remains 0.3.43, Pages approval false, live IDs unset and PTR
presentation disabled. No main merge or game-provider/public-hosting write occurred.
During September use local checks and signed [skip actions] pushes. On October 1
resume already-authorized exact-head Verify -> signed source-only M1 -> exact-M1
native prepare/check -> generated-only M2 -> exact-M2 Verify -> preservation/
readbacks/PTR publication -> owner/device acceptance. No new blanket approval
or recovery keys are needed. The [known blocker guide](../../operations/0.4.0-infra-access.md#known-blockers-and-recovery-paths)
covers the actual failed boundaries; use it before requesting human action.

## Native full pass and menu polish — 30 September 2026, 10:49 CEST (08:49 UTC)

Native UID-1000 root Vitest at signed 15b88b57 exited 0: 12,603 passed, zero
failed, 97 skipped across 693 files. This verifies the gesture/confirmation/
focus repairs after the narrow bundle-ownership recovery. Its separate source
receipt, report and log are retained under native artifacts/qa/; the earlier
failed report remains historical. The full pass precedes only the CSS and
archive-link repair below; keep its exact source scope.

The current polish changes only the menu's two existing panel gradients so
ivory controls remain readable over pale castle geometry. Existing menu tests
passed 27/27; conservative command-label contrast is at least 5.53:1 without
backdrop-filter assumptions. Source renders at mobile/desktop dimensions
retained layout, target sizes and keyboard outline with no horizontal overflow
or console warnings. Two broken G002 soundtrack links now identify its actual
draft archive by an immutable manifest, without altering rights or publishing.
The [local evidence](../../evidence/0.4.0/local-operations.md) holds exact scopes.

Signed polish d4465897 passed its outgoing Gitleaks scan and was pushed. All
3,351 raw native files matched Git; the full 16-output family reproduced
independently and UID-1000 policy verification passed. Its manifest SHA-256 is
8c637963331d7c899f695788aaf3b95d9983d4ab54bc5813b5f1c1bb4334de6b.
Run the final affected native closure/menu checks and rebuild the exact /ptr/ payload
and independent read-only mirror plan. Record final receipts on PR #374. Keep
September free of Actions; continue the already-authorized M1/exact-M1/M2
delivery lane on October 1, preserving Alpha and closed G002 admissions.

## Confirmation, focus and evidence repair — 30 September 2026, 10:10 CEST (08:10 UTC)

The next reviewed checkpoint fixes a confirmation swallowed by a concurrent
focus refresh and lost destination focus between world and keep. Real caller
regressions failed before repair; affected suites, independent cross-reviews
and app/Vite-config types passed. Read the [scoped repair evidence](../../evidence/0.4.0/local-operations.md#confirmation-and-destination-focus-repair--30-september-2026-1010-cest-0810-utc).

The full native root suite at d1474f11 exited 1: 12,591 passed, six failed,
97 skipped. All six failures were fixture setup against one root-owned ignored
SpacetimeDB bundle. Restoring that verified file's ownership made the unchanged
activation suite pass 199/199; it does not turn the earlier full run into a
pass. Native execution guidance now includes this recovery. Record the next
exact-source full-suite result on PR #374, keeping its source scope explicit.

The local full-stack browser playthrough described in older entries uses
legacy Inner Keep/G001, synthetic identity, balances and clocks. It is
preservation evidence, not gameplay04/PTR owner integration or real pacing.
The new module tests and UI fixtures remain distinct from the owner journey.
The candidate stays unmerged and PTR unpublished. Reproduce its complete
prepared-closure family after the signed source checkpoint, then validate
the final exact source/build/payload/mirror plan. Signed source repair 485e4ca6
passed the outgoing Gitleaks scan and was pushed. Its 3,351 raw source files
matched Git; all 16 family outputs reproduced independently and native
UID-1000 policy verification passed. The new manifest SHA-256 is
c47d7d096ff500aeafc5b27a4bc8122002d3c287b0b9800f7dfcded9c4162dd7.
Record the final candidate's exact-source receipts on PR #374 after execution.
On October 1 resume the
existing authorized signed M1/exact-M1/M2 hosted release sequence. September
remains free of GitHub Actions. Preserve Alpha and closed G002 admissions.

## Mobile gesture repair — 30 September 2026, 09:27 CEST (07:27 UTC)

Independent reviews at 268495f067e155ab76f56977797553de7194a63f found
Greater Realm camera gestures becoming selections and Keep04 pinch-to-pan
losing the remaining touch. The repaired real hosts retain valid tap/pan/orbit
controls, suppress post-pinch placement/selection and retain lifecycle
cancellation. Five focused suites passed 143/143 with Node 22.22.3;
app/Vite noEmit checks and independent source reviews passed. Reproductions,
rendered fixture scope and unchanged server-authority checks are in
[local operations](../../evidence/0.4.0/local-operations.md#mobile-gesture-repair--30-september-2026-0927-cest-0727-utc).

These runtime files belong to the protected prepared closure. The complete
family was refreshed from signed repair b696c3b7: all 3,351 source files
matched raw Git blobs, all 16 derived outputs reproduced independently and
the 1,250-member native UID-1000 policy passed. Its manifest SHA-256 is
9a28bb82a32e4f7af2aa212285245e65b30ec8145c42f552b09751bfd5b1d8d0.
The final signed source and exact build/payload/mirror receipt are recorded
on PR #374. The candidate is still unmerged and unpublished. Keep September free
of GitHub Actions; preserve Alpha and keep G002 admissions closed. Final
owner PTR play, physical-device performance and release evidence remain open.

## Continuation refresh — 30 September 2026, 09:00 CEST (07:00 UTC)

PR #374 remains open and unmerged against unchanged main
786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32. Its signed candidate before this
notes-only refresh is ac437ea35c708026f2a42b6785110fa6940d5202; game and test
sources are code-equivalent to 0269ef201c26e312fa0ec55c0548074ebb0ee905.
The separate native module suite passed 598/598; auth-bridge passed 502 tests
and release-recovery 1,567 across Node and workerd. Root, Genesis 002 and PTR
module typechecks passed. Native Windows SpacetimeDB 2.6.1 builds passed for
root, Genesis 002 and PTR. The prior PTR CLI tsc-discovery warning was fixed
by installing its package-local locked dependencies with --ignore-workspace
and --ignore-scripts; no project source changed. The exact commands and scoped
results are in [local operations](../../evidence/0.4.0/local-operations.md)
and [development sync](../../operations/0.4.0-development-sync.md).

At this candidate, root npm audit and both service pnpm audits reported zero
known vulnerabilities. GitHub's three moderate Undici alerts still describe
the default main lockfiles; this candidate resolves root jsdom's nested
Undici to 7.30.0 and both service locks to 7.29.1, all beyond the affected
range. The alerts should clear after integration and GitHub's rescan.

At exact source 9a24d455, the native /ptr/ production build, exclusion and
public-boundary scans, Farcaster check, license and file-size checks, payload
writer/check, and independent read-only Warpkeep-Live mirror recheck passed.
The receipt and SHA-256 values are in local operations and the PR snapshot.
The same exact-head build, payload write/check and independent mirror-plan
recheck passed at ac437ea3; the full receipt is on PR #374.
This documentation refresh requires one more exact-head build, payload check
and mirror recheck; the exact current-head receipt is recorded on PR #374 after
the signed push. Its 677.80 kB / 188.23 kB gzip RealmMapScreen warning remains
a measured bundle-size concern; do not suppress it or split code without a
profiled, regression-safe change.

The Alpha root remains available and /ptr/ is not yet deployed. Sealed launch
is still disabled (package 0.3.43, Pages approval false, live G001/G002/PTR
identities unset, PTR presentation disabled). Do not claim release acceptance.
Direct status checks at 08:50 CEST returned HTTP 200 for the Alpha root and
HTTP 404 for /ptr/.
No GitHub Actions workflow, run, check or status was queried, dispatched,
rerun or used in September; development publication uses [skip actions].

## Continuation refresh — 30 September 2026, 08:31 CEST (06:31 UTC)

At signed code/test head
`0269ef201c26e312fa0ec55c0548074ebb0ee905`, native WarpkeepRunner passed the
separate SpacetimeDB module typecheck and all 598 pure tests (0 failed, 0
skipped; 782.03 seconds), as UID 1000 `warpkeep` with Node 22.22.3 / pnpm
11.7.0. The current module result is recorded in [local
operations](../../evidence/0.4.0/local-operations.md). The native Linux root
Vitest suite also passed at code/test head
`198377c6569c08dfe97a8613f8ed098e561784b4`; its terminal stream did not retain
counts.

SpacetimeDB CLI 2.6.1 reported `Build finished successfully` and a `tsc not
found in node_modules` warning when invoked as the Windows executable from
WSL. The installed Linux `.bin/tsc` exists and the separate module typecheck
passed; the CLI's own TypeScript discovery remains unverified. No publish was
run. The exact `/ptr/` build, payload check and read-only mirror plan were
verified at source `0269ef20`; this documentation refresh requires a new
exact-head build/payload/mirror receipt. September remains a no-Actions period.
When the WSL verifier reads the Windows public checkout, set per-process
`safe.directory` to that exact checkout and `core.autocrlf=true`; otherwise
WSL reports the clean Windows `CNAME` as changed and refuses the mount as
unsafe. The exact read-only commands and reason are in [local
operations](../../evidence/0.4.0/local-operations.md). Do not weaken the
checkout-cleanliness check or persist this workaround globally.

## Current continuation — 30 September 2026, 07:51 CEST (05:51 UTC)

The full native Linux root Vitest suite was rerun after the DEV-only Keep04
cadence-recorder fix at code/test head `198377c6569c08dfe97a8613f8ed098e561784b4`.
`npm test -- --reporter=dot` exited 0 on WarpkeepRunner as UID 1000 `warpkeep`
with Node 22.22.3 / npm 10.9.8, SpacetimeDB 2.6.1 and the hash-verified YAML
fixture. The terminal stream did not retain final test totals; older counts do
not describe this rerun. The isolated corrupt-Git-object negative fixture
emitted its rejection diagnostics. Recurring `context canceled` messages also
appeared in the output, but no test failed. The detailed result is in [local
operations](../../evidence/0.4.0/local-operations.md).

Windows, origin and PR #374 remain at signed code/test head `198377c`; the
native checkout is clean. This tracked evidence update creates a new exact
documentation head; its `/ptr/` production build, payload verification and
read-only mirror plan are recorded on PR #374. September remains a no-Actions
period. The public Alpha root is HTTP 200 and `/ptr/` is HTTP 404, so no 0.4 PTR
is live. Sealed-launch preparation still reports package 0.3.43, Pages
approval false, no G001/G002/PTR identities and PTR presentation disabled.

## Current continuation — 30 September 2026, 07:17 CEST (05:17 UTC)

PR #374 remains open and unmerged against unchanged main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`; its pushed candidate branch now
contains `45d569db`, a DEV-only fix to Keep04 cadence reporting. Visible local
Chrome had exposed a false ~30.8-second p95: event-driven one-shot redraws were
separated by user-idle time, but the old collector treated the gap as a dropped
frame. Cadence now continues only when the previous frame reported a scheduled
successor RAF. The focused contract test passes 19 active cases (1 skipped),
typecheck passes, and a corrected visible repro with two isolated redraws
returns zero cadence samples/null percentiles. This confirms recorder behavior,
not a production performance result.

At exact notes-inclusive candidate `e86230ac70de5aa34f206d7d6c0cf65561d4274e`,
the native `/ptr/` production build passed with Node 22.22.3 / npm 10.9.8 and
`DEPLOY_BASE=/ptr/`. Payload write/check and independently rechecked read-only
Warpkeep-Live mirror planning passed; exact hashes and scope are in the local
operations record and PR #374 snapshot. This handoff refresh is documentation-
only. The final exact head and refreshed build/mirror receipt are recorded on
PR #374; regenerate them after any further tracked change.

The full native suite result remains at pre-fix code/test commit
`4350ae7a7c190bf65c5515cbb229e5b5485778b4`: 692 files passed / 1 skipped,
12,582 tests passed / 97 skipped, 847.76 seconds. It has not been rerun after
this DEV-only source change. Rebuild the exact notes-inclusive candidate in
native WarpkeepRunner and update the PR #374 exact-head receipt. The public
Alpha root returned HTTP 200 and `/ptr/` HTTP 404 in a direct check at 07:08
CEST. September remains a no-Actions period; no Actions workflow or status was
queried, dispatched, rerun or used. Keep the PTR sealed and resume hosted
verification only on or after 1 October.

## Current continuation — 30 September 2026, 06:02 CEST (04:02 UTC)

PR #374 remains open and unmerged against unchanged main
786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32. It contains the signed 0.4 candidate
on fix/g001-census-admission-proxy, including reviewed changes from still-open
PRs #375–#378. Do not merge their older heads separately. Read PR #374 for the
current signed candidate SHA and its exact-head build and mirror-plan receipts.

The candidate game and test code is code-equivalent to signed commit
4350ae7a7c190bf65c5515cbb229e5b5485778b4; subsequent changes are release notes
only. The full native Linux suite passed at 4350ae7a: 692 files passed / 1
skipped; 12,582 tests passed / 97 skipped; exit 0 in 847.76 seconds. It used
Node 22.22.3, npm 10.9.8, SpacetimeDB 2.6.1, the pinned offline YAML fixture
and umask 0022. A deterministic impossible-PID fixture removed the previously
observed parallel PID-reuse flake.

The disposable full-stack browser probe passed on code-equivalent source
`566d2728` with Windows Node 22.23.2 and SpacetimeDB CLI 2.6.1. It exercised
six direct-menu viewport profiles, City Mill construction/completion,
discounted Lumber Camp construction, hard-reload persistence, four-Worker
dispatch/recall/settlement, re-entry and failure-recovery seams. It used a
temporary local database and synthetic identity; this is not owner PTR
acceptance or physical-device evidence. Exact scope and outcome are in the
[local operations record](../../evidence/0.4.0/local-operations.md).

The last Keep/gameplay change is f289c3adf65f7afed8b21059ac3231ea721db571.
Focused Keep UI, accessibility and placement suites passed 70/70. A 36-case
Windows Chrome synthetic capture had no horizontal overflow, network-boundary
violation or cleanup issue, and rendered WebGL in the 844×390 all-buildings
case. Portrait and landscape captures were inspected. One CSP sandbox warning
per document remains a synthetic QA review item. These results are not
actual-owner PTR, physical-phone, production-network or performance acceptance.

Exact-head native `/ptr/` build results are recorded in PR #374. The
[local operations evidence](../../evidence/0.4.0/local-operations.md) also
retains the preceding exact-build receipt. The RealmMapScreen chunk remains
677.80 kB raw / 188.23 kB gzip.

The latest direct status check at 06:02 CEST found the Alpha root at HTTP 200
and /ptr/ at HTTP 404. Sealed launch remains disabled: package version 0.3.43,
Pages deployment approval false, G001/G002/PTR identities unset and PTR
presentation disabled. No merge, provider write, public Pages write or 0.4
publication has occurred.

No GitHub Actions workflow, run, check or status was queried, dispatched, rerun
or used during September; development pushes use [skip actions]. On or after
October 1, resume hosted exact-head Verify and the established signed sequence:
source-only M1, exact-M1 native prepare/check, generated-only M2, exact-M2
Verify, fresh G001 preservation, sealed G002 readback, approved PTR
publication/readback, actual-owner journey and physical-device acceptance.
Keep Alpha available and G002 admissions closed.

## Superseded continuation — 30 September 2026, 04:23 CEST (02:23 UTC)

The Keep layout source reviewed here is signed commit
`f289c3adf65f7afed8b21059ac3231ea721db571` on
`fix/g001-census-admission-proxy`, with PR #374 still open. This checkpoint's
documentation commit changes no game source; PR #374 records the exact current
head and its final build receipts. The reviewed feature commits from #375–#378
remain present in #374; do not merge older feature heads separately.

The existing Keep screen now uses a two-column short-landscape layout at
761–960 CSS pixels wide and at most 500 pixels tall. Resource/status/navigation
content stays beside the scene, controls keep 44-pixel minimum targets, an open
inspection panel stacks below the scene, and the canvas is capped at 180 pixels
with a 144-pixel minimum. This is presentation work only; it changes no Realm
authority, interactions, building rules, or resource behavior.

On the exact layout source, `npm run typecheck` passed and the Keep screen,
accessibility and placement UI suites passed 70/70. Windows Chrome 154 captured
all 36 synthetic desktop, portrait, landscape, loading, placement, construction,
completion, fallback and reduced-motion cases with stable source, 0 horizontal
overflow, no network-boundary violation, WebGL in the 844×390 all-buildings
case, and verified browser cleanup. The landscape and 390×844 portrait captures
were visually inspected. These are DEV fixtures, not production gameplay or
physical-phone acceptance. The capture retains `reviewRequired: true` because
each document reports the QA CSP sandbox warning (`sandbox-script-origin-tokens`);
the raw browser text is intentionally not retained. No capture error or boundary
violation occurred.

At 04:20 CEST the public Alpha root returned HTTP 200 and `/ptr/` HTTP 404.
Sealed-launch preparation still reports package `0.3.43`, Pages approval false,
unset G001/G002/PTR identities and disabled PTR presentation. No provider write,
merge or public release occurred. Do not query, dispatch, rerun or use GitHub
Actions during September; keep `[skip actions]` on repository pushes. After
October 1, resume the exact-source verification and signed publication sequence
only with the owner's direction. Physical-phone performance, production PTR
gameplay and owner acceptance remain open.

The retained exact-source capture is
`artifacts/keep04-qa/windows-run-qt9Ty7/`; its report explicitly distinguishes
render capture from performance or device acceptance.

## Superseded continuation — 30 September 2026, 03:48 CEST (01:48 UTC)

The release candidate's game source is signed commit
`4613bd04904050ab80e91b4e5eae2e6062da79b4` on
`fix/g001-census-admission-proxy`. PR #374 remains open and mergeable against
unchanged `main` `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`; this continuation
only refreshes release documentation. Its commit list already contains the
reviewed source commits from #375 (menu), #376 (castle film), #377 (sealed G002
soundtrack), and #378 (Greater Realm biome trees).
Do not merge or cherry-pick those feature branches separately while #374
contains their exact commits; reassess their open PRs after #374 lands. No
GitHub Actions workflow, run, check or status was queried, dispatched, rerun or
used during September. Development commits retain `[skip actions]`.

The full native Linux suite passed at code-equivalent source `1b333d0e`:
692 files passed / 1 skipped; 12,582 tests passed / 97 skipped. The exact
candidate at `7d12e016` also passed the disposable full-stack browser
playthrough: six menu viewport profiles, synthetic sign-in and Terms
continuity, City Mill and discounted Lumber Camp construction, hard-reload
persistence, Worker recovery and resource dispatch/return. No production
identity, data or service was used by that playthrough.

The exact `/ptr/` production build passed at `4613bd04`, including typecheck,
runtime assets, production exclusions, public-boundary, Farcaster, sealed-launch
preparation, license and file-size checks. The source-bound payload manifest
SHA-256 is
`8da0b8ad506b757eedd8bdd2d55b6e2f72b991197c487aca8b55b4df7c5cf004`. The
read-only mirror plan against `Warpkeep-Live/main@b6afe92` preserves 341 Alpha
entries, targets 800 PTR entries, removes none and hashes to
`82abc6cacb6dc62e688f03ddb34bf445d15657f21c7ff867f8b2cc93993528fd`.

A direct top-level Chromium preview of the exact production `/ptr/` output
rendered the 0.4 menu and loaded its 3D scene. After it settled, the cold
loopback preview recorded 53 same-origin resources and 3,833,259 encoded body
bytes (1,818,372 JavaScript, 1,797,980 GLB, 124,420 PNG and 92,487 CSS); local
transfer size was 3,849,159 bytes including response overhead. The navigation
load event was 2,736 ms on this machine. The server was uncompressed and had no
network shaping; these figures are a local asset baseline, not phone or public
network performance. See the [menu resource baseline](../../evidence/0.4.0/menu-production-local-performance.md).

The public root remains HTTP 200 and `/ptr/` HTTP 404. Sealed-launch
preparation reports package `0.3.43`, `pagesDeploymentApproved: false`, unset
G001/G002/PTR identities and disabled PTR presentation. No merge, provider or
public write, or deployment occurred. The documented `Warpkeep-Live` Pages
publication is a release operation, so keep it paused under the owner's
September no-Actions instruction. Resume exact-head hosted verification and
the signed publication sequence after the pause. Physical-phone performance
and owner PTR acceptance remain unverified.

The exact-head build and receipts below are ignored local outputs. A temporary
measurement script existed only in ignored `dist` on the loopback preview; the
next clean production build removes it. Regenerate exact-head output and
receipts after this handoff update is pushed. The Linux build owner remains
`/home/warpkeep/Warpkeep-0.4`; do not build through the Windows-mounted
`node_modules` in WSL.

## Superseded continuation — 30 September 2026, 03:08 CEST (01:08 UTC)

The reviewed Windows checkout, GitHub branch and idle native release checkout
are synchronized at signed commit
1b333d0e56629266223dc090f37d87ea880672ce on
fix/g001-census-admission-proxy. PR #374 remains open against main
786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32; PRs #374–#378 remain open. No
GitHub Actions workflow, check, run or status was queried or used during
September. Development commits carry the Actions-skip marker.

The exact native full suite passed at source 1b333d0e: 692 files passed /
1 skipped, 12,582 tests passed / 97 skipped, exit 0 in 849.11 seconds.
Environment was UID 1000 warpkeep, Node 22.22.3, npm 10.9.8, SpacetimeDB
2.6.1 and the verified offline YAML input
008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91. A first
run with umask 077 failed 62 file-mode assertions because that mask changed
deliberate 0644 rejection fixtures into 0600. The affected focused canary
authority suite then passed 25/25 with normal umask 0022, and the full suite
passed with 0022. These were test-environment failures, not source defects.
Negative-path Git tests printed malformed-object diagnostics for their
temporary fixtures; a post-run fsck of the actual checkout exited 0 with only
dangling commits reported.

At exact source 1b333d0e, the native Linux /ptr/ production build, typecheck,
runtime and production asset integrity, production exclusions,
public-boundary scan (3,350 tracked paths / 1,907 entries), Farcaster
integrity, sealed-launch preparation, license policy and file-size policy
passed. The payload is 446 files / 138,994,282 bytes; payload manifest
d75d95af2f4f717834fe1338ecfe62edfe277cc97cdd7ecbbc8d98e9f084e26e,
content manifest fb040b483ab42a982801c6735f08b96dd0e491db2f4d36f1d957e1acd08189b
and root HTML 1a4fab449bea72b777630cc12ab304f7b167036eca2604183e032d3c0ad81539.
The read-only mirror plan against Warpkeep-Live main
b6afe92e7b09197b1578d992103ac3c8f916d8ad preserves 341 Alpha entries,
targets 800 PTR files, removes zero obsolete paths and hashes to
76415981696deb8e1cc74297625c1fcb857986208fc0b40313f7f5ee781b931f.

The production root remains HTTP 200 and /ptr/ HTTP 404. Sealed-launch
preparation still reports package 0.3.43, Pages approval false, unset G001,
G002 and PTR identities, and disabled PTR presentation. No merge, provider
mutation, public write or deployment occurred. The 677.80 kB
RealmMapScreen chunk (188.23 kB gzip) remains; physical-phone performance is
unverified.

One initial WSL build attempt used the Windows-mounted development checkout
and stopped before Vite because its shared node_modules only contained the
win32-x64 esbuild binary. No dependency tree or source was changed. The
documented native ext4 checkout at /home/warpkeep/Warpkeep-0.4 has the Linux
dependencies and is the build owner. This documentation-only checkpoint
changes source identity; after its push, regenerate exact-head build and
ignored receipts there. Keep PTR sealed and continue without Actions in
September.

## Superseded continuation — 30 September 2026, 02:25 CEST (00:25 UTC)

Before this documentation-only refresh, Windows, GitHub and native
WarpkeepRunner were clean and synchronized at signed candidate
0fc189cf2126b0f283f01f042ed5ab41549b6b81 on
fix/g001-census-admission-proxy. PR #374 remains open against main
786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32; PRs #374–#378 are open. This
continuation uses no GitHub Actions during September: no workflow, check,
run, status or hosted gate is queried, dispatched, rerun or used.

The full native Linux suite evidence remains tied to tested code
11b2ccbf3b809a44afdbfb47bf5c8d07d3061c1c: 692 files passed / 1 skipped,
12,580 tests passed / 97 skipped. The later QA-controller code change at
570112ade8b95c3bccb50f87fc2fe06a2121caf0 passed its focused browser-probe
tests 5/5 under Node 22.22.3 / npm 10.9.8. Subsequent commits through 0fc
are documentation-only. No fresh browser capture or physical-phone test was
performed.

At exact source 0fc189cf, the native /ptr/ production build and typecheck,
runtime and production-asset integrity, production exclusions,
public-boundary scan (3,350 tracked paths / 1,907 scanned entries),
Farcaster integrity and sealed-launch preflight passed. The payload contains
446 files / 138,994,282 bytes; payload-manifest SHA-256
fb22fa1a356e6704bfac1850b4ab95b58599cffa551f2c924595fd25759b58e6,
content-manifest SHA-256
36d7e2cb950665e0259f68ebc0e311a946cf4a131f52bdfa3dca46ed2276c02e and root
HTML SHA-256 dd60c63d2ddcb77be4058ddb13a2210114960db1d3124aa246bc3391b82862b0.
The read-only plan against Warpkeep-Live main at
b6afe92e7b09197b1578d992103ac3c8f916d8ad preserves 341 Alpha entries,
targets 800 PTR files, removes zero obsolete paths and hashes to
5aef11f8fbcd36338914dabb7b821a711375d0c71e08a5104bd9df2c7cfbdb49.

The public root is HTTP 200 and /ptr/ is HTTP 404. Release preflight remains
sealed: package version 0.3.43, Pages approval false, live realm identities
unset and PTR presentation disabled. No merge, provider/public write or
deployment occurred. The 677.80 kB RealmMapScreen chunk (188.23 kB gzip)
remains a known load-cost concern; physical-phone performance is unverified.
Continue local QA and exact-source release preparation without Actions in
September. Keep PTR unpublished until the release gates and owner/device
acceptance are satisfied. The 0fc build and mirror receipts are ignored local
outputs; regenerate them after each subsequent source-changing commit.
This documentation refresh changes the notes-only source identity; rerun the
exact-source build and regenerate receipts at its pushed head.

## Superseded continuation — 30 September 2026, 01:21 CEST (23:21 UTC)

Windows, GitHub and native `WarpkeepRunner` are clean and synchronized at
signed candidate `bd0bb0f96bfce6357f4859e47b5035b786204b39` on
`fix/g001-census-admission-proxy`. PR #374 remains open against main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`; the open game PR inventory remains
#374–#378. No Actions workflow, check, run or status was queried, dispatched,
rerun or used during September.

The full native Linux root suite passed on code commit
`11b2ccbf3b809a44afdbfb47bf5c8d07d3061c1c`; current `bd0bb0f9` changes only
release notes. On UID 1000 `warpkeep` with pinned Node 22.22.3 / npm 10.9.8 and
native SpacetimeDB 2.6.1 it passed with exit 0: 692 files passed / 1 skipped,
12,580 tests passed / 97 skipped in 1,065.37 seconds. The first invocation
lacked the local CLI path and failed two tests with `spawnSync spacetime
ENOENT`; adding the repository's pinned Node directory to `PATH` and setting
`SPACETIME_BIN=/home/warpkeep/.cache/warpkeep-0.4-local-toolchain/spacetime-2.6.1/spacetime`
fixed the environment. The corrected full run passed with no source changes.
Keep this explicit native environment for future WSL root-suite runs; do not
invoke Windows `spacetime.exe` from WSL.

At exact notes-inclusive source `bd0bb0f9`, the `/ptr/` production build,
typecheck, runtime and production asset integrity, production exclusions,
public boundary (3,350 tracked paths / 1,907 scanned entries), Farcaster
integrity, licenses, file-size checks and sealed-launch preflight passed. The
payload contains 446 files / 138,994,282 bytes; manifest SHA-256
`7454a1010308fc3f76b760c278d0364fdb44c05ef242e8bfcc42919c51714eef`, content
manifest SHA-256
`38bea726003a48a996afffb37812d6f786b8f25b9081623696c8ab72b725a83e`, root
HTML SHA-256
`74a649ed8f6bd0d3748b9ffddfc2bb99796bb8e39877ed85a88faae4563eebc1`.
Read-only mirror planning against `Warpkeep-Live/main@b6afe92` preserves 341
Alpha entries, targets 800 files, removes zero and hashes to
`a80140759c1ca448132fb7b60aac7e8dfdc5d01b780d378782bf8f160a050974`.

The root remains HTTP 200 and `/ptr/` HTTP 404; no Pages or other production
write occurred. Package 0.3.43, Pages approval false, unset live realm
identities and disabled PTR presentation keep launch sealed. Vite warns that
`RealmMapScreen` is 677.80 kB (188.23 kB gzip); physical-phone performance is
not established. After this notes-only push, rerun the exact-head `/ptr/` build
and regenerate ignored delivery receipts. Keep #374 open and PTR unpublished
through September 30; after October 1 confirm the owner's current direction
before hosted Verify, then continue M1/M2, preservation, sealed readback, PTR
publication and owner/device acceptance. The ignored build, payload manifest
and mirror plan were regenerated at exact `bd0bb0f9`; refresh them again after
this notes-only update is pushed.

## Previous exact `/ptr/` candidate build — 30 September 2026, 00:16 CEST (22:16 UTC)

Windows, GitHub and native `WarpkeepRunner` are clean and synchronized at
signed candidate `6e2b9ff9e7bfa40d7bdb00091d068e2075a7da7d` on
`fix/g001-census-admission-proxy`; PR #374 remains open against main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. A read-only remote-ref check
confirmed GitHub has the same candidate. The runtime/gameplay source is
unchanged from the previously recorded candidate.

Pinned Linux Node 22.22.3 / npm 10.9.8 completed the full production `/ptr/`
build with the exact source SHA and `umask 077`. TypeScript, runtime and
production asset integrity, production exclusions, public boundary (3,350
tracked paths / 1,907 scanned entries), and Farcaster integrity passed. The
payload contains 446 files / 138,994,282 bytes; manifest SHA-256
`54cfdb1dd63219ca5b311c80000c8bec729d638f6f5341d858f79813205604b2`, content
manifest SHA-256
`952492547e7ee10ed48de2502c25618fe7c65e2c2d046f8e32ff58ee7e42a733`, and
root HTML SHA-256
`b994e6f1660cddc1ffffd725b98091213887126322a44ae4095aa3b1d2bf944c`.
Build-info embeds source 6e2b9ff9 and version 0.4.0-ptr.1. License and
tracked file-size policies passed. Checked-in release state remains disabled:
package 0.3.43, Pages approval false, G001/G002/PTR identities unset and PTR
presentation disabled. The build retains the 677.80 kB RealmMapScreen chunk
warning; actual-phone performance is not established.

Read-only mirror planning against clean Warpkeep-Live `main`
`b6afe92e7b09197b1578d992103ac3c8f916d8ad` passed: preserve 341 Alpha-root
entries, target 800 files, remove zero obsolete paths. WSL needed an
invocation-scoped exact-path Git ownership exception and `core.autocrlf=true`
because the checkout lives on the Windows mount. See the development workflow
for the recovery command. The stable ignored payload manifest has been
refreshed locally and checked. The mirror plan remains read-only; regenerate
both receipts after the notes-inclusive source commit.

The production root returned HTTP 200 and `/ptr/` HTTP 404. No Actions,
provider/public writes, merge or deployment occurred. Keep the September
pause in force; after October 1, confirm owner direction before hosted Verify,
then continue exact M1/M2, preservation, live readback, PTR and owner/device
acceptance. This checkpoint's notes commit changes source identity; build and
regenerate receipts again at its pushed head.

## Exact candidate browser-integration continuation — 30 September 2026, 00:04 CEST (22:04 UTC)

Windows, GitHub and the clean native `WarpkeepRunner` checkout match signed
candidate `4123d3dd961b3653b4303275f5d5f15ab23e58a5` on
`fix/g001-census-admission-proxy`; PR #374 remains open against main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. Commit 4123 changes only the Linux
headless-browser test launch and its contract test. It opts Linux headless
Chrome into SwiftShader; it does not disable Chrome's sandbox or change game
rendering. No gameplay source changed.

`tests/renderedWebglBrowserProbe.test.ts` passed 45/45 on the pinned Linux Node
22.22.3 checkout. The Windows Node 24.19.0 run passed 44 tests with one
platform-specific skip. Pinned Gitleaks 8.30.1 scanned the single outgoing
commit (365 bytes); no leaks were found. The complete local full-stack browser
probe passed on Windows Node 24.19.0 / npm 11.7.0, Chrome 154.0.8037.58 and
SpacetimeDB 2.6.1. It covered six responsive menu profiles, synthetic
authentication and Terms continuity, City Mill completion, discounted Lumber
Camp construction, reload persistence, a four-phase Worker recovery, private
read failure/visibility cases, 10,000 local Realm cells, four-resource
dispatch/recall/settlement/return and the visual aggregate. Its database and
identity were disposable synthetic fixtures. This is not actual-owner PTR,
physical-phone or performance acceptance. Probe-owned Chrome, SpacetimeDB and
Vite processes were cleaned up.

WSL recovery path: run native commands with `wsl -d WarpkeepRunner -u warpkeep`;
the distro otherwise starts as root and Chrome refuses to launch with its
sandbox enabled. Do not add `--no-sandbox`. On this image,
`/usr/bin/google-chrome` is a symlink rejected by executable attestation; set
`WARPKEEP_QA_CHROME=/opt/google/chrome/chrome` to use the attested file. With
those corrections, Linux unit tests pass, but the full emulated 3× portrait
browser probe still stops on a software-OpenGL GPU-stall diagnostic. Do not
silence or generalize warning filters to force a pass; the supported Windows
full-stack run above passed. See the development workflow's browser recovery
note before repeating this lane.

No GitHub Actions were queried, dispatched, rerun or used. No provider, public
repository, merge, Pages or database writes occurred. The Alpha root remains
HTTP 200 and `/ptr/` remains HTTP 404; live PTR still lacks seven Keep/Worker
tables and five procedures, and sealed-launch approval is false. Keep #374
open through September. After October 1, confirm the owner's current direction
before exact-head hosted Verify, then follow the existing M1/M2, preservation,
sealed-readback, PTR publication and owner/device acceptance sequence. The
next notes-inclusive candidate needs fresh build and release receipts.

## Previous exact-head source/build checkpoint — 29 September 2026, 21:51 CEST

Windows and origin are clean and synchronized at signed candidate
`7daea5f55e514f1c25e8b9a5e3258e3a5fa87729` on
`fix/g001-census-admission-proxy`. PR #374 is open and reported mergeable
against main `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. The candidate also
contains the code from open PRs #375–#378; keep those source PRs open for
provenance during the September no-Actions pause.

At exact source 7daea5f5, the pinned Linux Node 22.22.3 / npm 10.9.8 `/ptr/`
build exited 0. TypeScript, runtime-asset integrity, production exclusions,
the public boundary (3,350 tracked paths / 1,907 scanned entries), Farcaster
integrity, license policy and tracked-file-size policy passed. The focused
Keep04 document-policy and Windows-capture suites passed 91/91. Sealed-launch
preparation correctly remains disabled: package 0.3.43, Pages approval false,
G001/G002/PTR identities unset and PTR presentation disabled.

The build payload contained 446 files / 138,994,282 bytes. Its manifest SHA-256
was `17e6f60ce7610dde8d5bc51ca00d6b81f715d82de1a219c855648b5e707b90f3`; its
content manifest SHA-256 was
`5941b9fc65625f0fe264a349362e790fd7c3c5977d2a8708263885ce8554c4b2`; and its
root HTML SHA-256 was
`27e5004b41d16c968683871af6de416b18360a53b3b5c111cc3c082d9a7e804b`. The
independently checked read-only plan against clean Warpkeep-Live
`b6afe92e7b09197b1578d992103ac3c8f916d8ad` preserves 341 Alpha-root entries,
targets 800 generated paths, removes zero obsolete files, and hashes to
`5293912d89646974247b570a3c0964d586cc6305a5a10e6d4fb12d1ba0a4b6b1`.

The public Alpha root returned HTTP 200 and `/ptr/` returned HTTP 404. The
candidate has not been deployed. No GitHub Actions, provider writes, public
repository writes, merge or PTR publication occurred. The notes-only commit
below requires a fresh stamped build and regenerated receipts at its pushed
head before publication. Physical-phone performance and owner PTR acceptance
remain unverified; no production performance claim is made. See the latest
[next-work checkpoint](next-work.txt), [live delivery status](../../operations/0.4.0-live-delivery-status.md),
and [local operations evidence](../../evidence/0.4.0/local-operations.md).

## September no-Actions exact-head release continuation — 29 September 2026, 21:11 CEST (19:11 UTC)

The signed G001 test-fixture fix 7aa95148a1837f767cec7249d20fdb201bb665b2
and notes-only checkpoint b7c1b5224340806ced542d96c93d31e0c220794c are on
fix/g001-census-admission-proxy, with PR #374 open against signed main
786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32. The runtime/product source is
unchanged after 7aa. No GitHub Actions were queried, dispatched, rerun or used;
no provider mutation, public-repository write, merge or PTR publication
occurred.

The remaining privileged preflight failure was a fixture mismatch: it supplied
a fixed current-run title, while the checked-in workflow run-name is operation
plus source commit. After correcting the fixture, the workflow-evidence suite
passed 118/118 and the native Linux preflight suite passed 104/104 against the
prepared candidate, including all 97 root-gated cases and the G001 success
path. The simulated GitHub transport is GET-only and the test confirms there
are no private writes. The ordinary native Linux suite passed on product
source 2f1cc066: 692 files passed / 1 skipped; 12,579 tests passed / 97
skipped.

The documented local assembler prepare and independent check both passed at
development source 2f1cc066. Candidate
release-workspace-d2953d97bf5117d8ec29c0b2991657b8, transaction
48bcb949e37f411bc7968dfe054cf998: 102 generated outputs; 3,350
source/candidate files checked; 3,248 preserved; 624 compiled bundle inputs
and 7 recovery inputs. Journal SHA-256
cb0a22b59e6ce6c7394e031b861ededa9170f55b7e70b0c1fc45ad7d54098954; generated
family 7cc6fc1d4c6492100ddf3c3639a625a2a0009f532c338d488e891eb0b9f7c041;
closure a6990b37d837e2d9450013e8606d7299166f6158c6b55a450040ac15a9ad75c1;
scanner edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71.
finalReleasePrepared remains false; this is development preparation, not M1
or deployment authority.

At signed source `7a5f0ef04a69ec12eeb7b7d89af3904d3cd337ba`, the pinned native
Node 22.22.3 / npm 10.9.8 `/ptr/` production build passed TypeScript, runtime
asset verification, production exclusions, public boundary (3,350 paths / 1,907
entries) and Farcaster integrity. Payload: 446 files / 138,994,282 bytes;
manifest SHA-256 `6bc83b4235e62b3c2cb022c6c572195af1a29b7af2fee7136988e36d333b8950`;
content manifest SHA-256
`e223e894f3e01c00509f7eb9ab9f663f09aa76942dff1ba0bdc20c948e2e4150`. The
read-only plan against Warpkeep-Live@b6afe92 has SHA-256
`20c81e4b6e2c4d4042ba71ffa8b63e16c563cadb08051a3d5823dd0bbaf53728`:
341 Alpha-root entries preserved, 800 target files and zero obsolete generated
files. The PTR host chunk is 108.81 kB / 33.54 kB gzip; RealmMapScreen remains
677.80 kB / 188.23 kB gzip. Sealed-launch remains in preparation: package
0.3.43, Pages approval false, live realm IDs unset and PTR presentation
disabled.

The local release store had 205 retained run directories before this work;
prepare/check added two retained runs. Historical and incomplete records remain
intact by design; no automatic pruning occurred. About 1.1 TB remained free.
No new Desktop file, sibling backup or archive was created; the existing
next-work note is updated in place. Do not merge #374 or publish the PTR in
September. After October 1, confirm owner direction before hosted verification
and exact M1/M2 release gates.
## September no-Actions continuation — 29 September 2026, 17:46 CEST (15:46 UTC)

Signed product commit `53c2bc42eeb98e5b896b08db249bbfee9e2807ea` is synced to
the Windows development checkout and GitHub branch
`fix/g001-census-admission-proxy`; PR #374 remains open against signed main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. It clarifies the empty Keep's
first-return guidance: check City Mill costs, gather shortages with idle Workers
in parallel, and spend only Realm-confirmed returns. It changes no economy or
Worker rules. No GitHub Actions were used; keep the PR open and do not publish
PTR or write `Warpkeep-Live/main` during the September pause.

`Keep04Screen.test.tsx` passed 39/39 and `npm run typecheck` passed on this
source (Windows Node 24.19.0 / npm 11.7.0). Guarded Chrome 154 capture
`windows-run-A0VUGC` is stable at the exact source: 36 synthetic cases, 32
WebGL and four intended fallback, zero horizontal overflow or guard violations,
and verified Chrome cleanup. Manual 390×844 review confirms the updated copy
and resource-location action fit in the first-journey card; the construction
name and progress remain visible in the active-build view. Single render
snapshots of all six level-five sites are within the current draw/triangle caps,
but are not workload or percentile measurements. One `browser-log-security`
warning remains classified only as a bounded document warning for each case;
the raw message was not retained, so review is still open. The capture uses a
desktop RTX 3080 Ti and a synthetic fixture, not a phone, production build,
owner session or performance acceptance. The exact 53c2 `/ptr/` production
build has not been rerun after this copy-only change; rebuild before final
release freeze.

The prior exact `/ptr/` production build is source `4e73261f`: 446 files /
138,994,239 bytes, manifest SHA-256
`f42b355ba042d912a10b3d47bfa8cfbcd70c1de25ac1e08bf52ee30a3e1393af`, content
manifest SHA-256
`c01eb7a7e786b045b46930269e68e1f2d6e4099c8e269ffe3e023fe4c4640741`. The
read-only live-root plan preserves 341 Alpha entries, targets 800 files and
removes zero obsolete files. These receipts predate 53c2 and do not attest its
production payload.

Read-only PR inventory at 15:39 UTC found no new Warpkeep code PR beyond #378;
Warpkeep #374–#378 remain open. Relevant asset proposals #37–#41 remain open;
older draft asset PRs #36, #29 and #28 are outside this 0.4 intake. A fresh
HTTP read returned 200 at `https://warpkeep.com/` and 404 at `/ptr/`; the
existing Alpha is available and 0.4 is not published. After October 1, resume
with current owner direction, exact-head hosted Verify, final source-bound
receipts, live readback, owner PTR play and physical-phone evidence.

## September no-Actions continuation — 29 September 2026, 17:12 CEST (15:12 UTC)

Signed product-source commit `29e94dfa3ca396dcc75f74b4b63edc996971e888` is
synced across the Windows checkout, origin and native Linux WarpkeepRunner on
`fix/g001-census-admission-proxy`. PR #374 remains open against signed main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. This checkpoint adds release notes
only; final-head receipts are regenerated and checked after that sync. No
GitHub Actions were queried, dispatched, rerun or used during September;
source commits carry `[skip actions]`.

The candidate includes the menu from #375 and castle-film action from #376.
Signed commit `53aa334d` integrated #377's Genesis 002 soundtrack. Its exact
runtime file is 4,539,823 bytes and uses the requested official-game path; the
asset record keeps its unresolved source terms explicit. G002 remains sealed
and inaccessible, so the new score does not open an entry path or affect the
PTR/G001 Lowlands selection. The v3 tree catalog and 40 runtime models from
#378 are present (2,738,208 bytes). The candidate loader prefixes assets with
the configured deployment base and clears rejected requests from its cache so
transient fetch failures can retry. The exact-path and retry regressions are
covered in `tests/greaterRealmBiomeTreeAssetLoader.test.ts`.

Shipping validation found that the checked-in Pages payload boundary rejected
the newly approved G002 M4A. Signed fix `29e94dfa` now admits only the exact
`audio/warpkeep-genesis-002-theme.m4a` path and includes it in the manifest
fixture; unrelated M4A files remain rejected. The four focused PTR, payload,
mirror-plan and tree-loader files pass 39/39 on pinned Linux Node 22.22.3 and
native SpacetimeDB 2.6.1.

The complete native Linux suite passed on immediate predecessor `53aa334d`
before that release-validator-only fix: Vitest 4.1.11, Node 22.22.3, npm
10.9.8 and native SpacetimeDB 2.6.1; 692 files passed / 1 skipped and 12,579
tests passed / 97 skipped, exit 0 in 932.26 seconds. Raw output contained 15
`context canceled` messages and existing React `act(...)` warnings, but no test
failed. The subsequent change is limited to the exact payload allowlist and
its regression fixture; its affected tests and the PTR build passed at 29e94.

At exact source `29e94dfa`, the `/ptr/` production build passed TypeScript,
runtime-asset checks, production exclusions, the public-boundary scan (3,350
tracked paths / 1,907 scanned entries), Farcaster integrity, file-size policy
and license policy. The payload contains 446 files / 138,994,239 bytes. The
read-only mirror plan against clean `Warpkeep-Live@b6afe92` preserves 341
Alpha-root entries, targets 800 files and removes zero obsolete paths. These
ignored local receipts are regenerated and checked after this notes-only sync
so they bind to the final checkout. The existing `RealmMapScreen` chunk warning
remains 677.80 kB raw / 188.23 kB gzip.

The exact-head sealed-launch verifier reports package `0.3.43`, Pages approval
false, G001/G002/PTR identities unset and PTR presentation disabled. A fresh
HTTP check returned 200 for the public root and 404 for `/ptr/`; no 0.4
publication occurred. Keep #374 open and do not write `Warpkeep-Live/main` or
publish PTR during September. Remaining gates are source-bound live release
receipts and readback, owner PTR acceptance, review of the privacy-safe browser
diagnostic, and physical-device performance. Resume hosted Verify only after
the September pause ends.

### PR intake status

The current open main-repository PRs are #374–#378. #375/#376 code is already
in the candidate, #377 is integrated while G002 stays sealed, and #378's v3
models are present with the base-aware/retryable loader behavior. Keep those
source PRs open for provenance; do not merge older heads separately. No newer
Warpkeep PR was open at the last inventory. Warpkeep-Assets PRs #37–#41 remain
separate source archives and are not publication approval.

## Previous September no-Actions continuation — 29 September 2026, 15:56 CEST (13:56 UTC)

Product source 65b3d6cd37d0a0dc4435c37e8276440f60f6bfa5 remains the tested
candidate on fix/g001-census-admission-proxy. Windows, origin, the clean idle
WarpkeepRunner checkout and open PR #374 match signed head
8cdf8967c96897ea9c3b512b9d9b77f2a2feffdf against main
786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32. PR #374 is not a draft. No GitHub
Actions were queried, dispatched, rerun or used during September.

The product change frames existing rear and side forest bands with a
single-geometry, three-instance shallow bank and adds two units of scenic-camera
room. Tree count, support geometry and game authority are unchanged. Five focused
Keep04 suites passed 116/116, TypeScript passed, and a guarded Chrome capture
covered 36 synthetic cases over four viewport profiles with no guard violation,
overflow or cleanup failure. Synthetic evidence does not establish phone
performance or owner acceptance. One privacy-safe browser-log warning per
document remains under review; RealmMapScreen is 677.80 kB raw / 188.23 kB gzip.

The full native Linux suite was rerun from exact checkout head 8cdf8967 as
UID 1000 warpkeep, with Node 22.22.3, npm 10.9.8 and native SpacetimeDB 2.6.1.
Command: npm test -- --reporter=dot. Vitest 4.1.11 completed in 871.42 seconds
with exit 0: 692 test files passed / 1 skipped; 12,577 tests passed / 97
skipped; no test failed. The raw output still contained nine context canceled
messages, but the completed process and test summary were successful. This clean
repeat supersedes the earlier exit-1 run, whose cause was not isolated. The
isolated ptrProductionExistingUpdateContinuation suite passed 37/37 and native
ptrRealmBackend passed 15/15. The prior run using Windows spacetime.exe from WSL
remains invalid cross-OS evidence; its two environment-specific failures remain
documented.

At exact head 8cdf8967, pinned Node 22.22.3 / npm 10.9.8 DEPLOY_BASE=/ptr/
production build passed TypeScript, asset integrity, production exclusions,
the public-boundary scan (3,347 tracked paths / 1,902 scanned entries) and
Farcaster integrity. Payload: 445 files / 134,453,821 bytes; manifest SHA-256
188cdb42c41309199ca6faa357d3e25809c889fe2bddd1c2aa78ceaf2c15b1ec; content
manifest SHA-256 1121505aef6c8beb8a03d67298d1be0912c4adefcee6dc6c7beeb6f5311f44fd.
The read-only mirror plan against Warpkeep-Live parent
b6afe92e7b09197b1578d992103ac3c8f916d8ad preserves 341 Alpha-root entries
(manifest SHA-256 7699d03b70c901e4fb8453b8b515af03376d398bf79e9eabea1c85f6e303c3ef),
targets 799 files and removes zero obsolete generated paths. Plan SHA-256:
a848eccfa559e74082c3198747b0e38f40a60a4f7cc2b7300fd523cf36686bdc. These
ignored receipts are local preparation evidence, not publication approval.
Regenerate them after this documentation checkpoint for the exact final head.

The exact-head preparation verifier, run as the checkout owner warpkeep UID
1000, reports package 0.3.43, Pages approval false, G001/G002/PTR identities
unset and PTR presentation disabled. A fresh direct HTTP check returned 200 for
the public root and 404 for /ptr/. No 0.4 publication occurred. Keep PR #374
open and continue local exact-source work without Actions during September.
Remaining release evidence includes sealed G001/G002/PTR receipts and live
readback, actual owner PTR acceptance, physical-device performance and review
of the browser diagnostic. The full test suite now passes locally.

### Read-only provider and incoming PR check

At 12:31 UTC, authenticated SpacetimeDB CLI 2.6.1 listed the account's three
production targets: G001 `c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e`,
sealed G002 `c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194`,
and PTR `c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e`.
Read-only `describe` returned 56/49/140 tables, reducers and types for G001;
23/8/35 for G002; and 24/10/49 for PTR. This verifies account access and that
these database schemas are present. It does not establish source equality,
live row-level seal/activation state, PTR atlas finalization or owner
provisioning. The checked-in release binding still lacks the receipts that
authorize these identities, so keep its identities unset and make no database
writes until those proofs are verified.

The open PR inventory contains #375, #376, #377 and #378 alongside #374.
PR #375's menu and #376's castle-film commits are already ancestors of the
candidate. PR #378's current head `394df3c6ba69900ddc881c4c4b1e5d6bcd2aa1d6`
was cherry-picked into the candidate as signed commit `758d655b`; the original
OID is therefore not an ancestor, but its v3 tree code and assets are already
present. PR #377 adds a soundtrack for sealed G002 and remains deferred because
that realm has no player path in the owner PTR. Do not merge the older source
PRs independently or add #377 audio to the PTR without a playable release
scope.

### Default-branch dependency alert triage — 29 September 2026

GitHub's read-only Dependabot alert endpoint reports three medium `undici`
alerts on default `main`: the root `package-lock.json`, Auth Bridge lockfile and
Release Recovery lockfile. The candidate diff already raises jsdom's nested
root copy from 7.29.0 to 7.30.0 and both service Miniflare overrides from
7.29.0 to the advisory's fixed 7.29.1. These are default-branch alerts; the
candidate locks are patched, and the alerts should close when the source reaches
main. They are not a reason to merge during the September no-Actions window.

### Full-suite Linux runner correction — 29 September 2026, 14:40 CEST

The first full run used Windows `spacetime.exe` from WSL. It finished with 690
passed test files, two skipped files and one failed file (12,569 tests passed,
103 skipped, two failed). Both failures were in `ptrRealmBackend.test.ts`:
generated bundle sections contained `wsl.localhost` absolute module paths,
and cleanup hit a root-owned file emitted by the Windows CLI. With the cached
native Linux SpacetimeDB 2.6.1 executable, that exact test file passed 15/15.
The subsequent full run on pinned Linux at `92fb93d0` reported 692 test files
passed / 1 skipped and 12,577 tests passed / 97 skipped, with no failing test
listed, but Vitest exited 1 after printing `context canceled`. Do not mark this
as a clean full-suite pass until the runner-level exit is explained or a clean
full rerun succeeds. The slow isolated `ptrProductionExistingUpdateContinuation`
suite passed 37/37 with exit 0 and no cancellation message. Keep the original
cross-OS failure separate from the later successful run. The exact-head rerun at 8cdf8967 passed 692 files / 1 skipped and 12,577 tests / 97 skipped, exit 0 in 871.42 seconds. The earlier exit-1 cause remains unknown.

## September no-Actions continuation — 29 September 2026, 13:26 CEST (11:26 UTC)

Signed product source `0c9447e299c607f4685735cfe44b55c17ba77199` is
synchronized across Windows, origin and WarpkeepRunner on
`fix/g001-census-admission-proxy`. PR #374 against main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32` remains open and mergeable. No
GitHub Actions were queried, dispatched, rerun or used during September.

The Keep04 scene now frames the rear and both side terraces with its existing
shallow static moat while leaving the front gate approach open. The indexed
water surface and instanced shoreline remain non-pickable; support height,
placement and game authority are unchanged. The focused scene, voxel-dressing
and screen suites passed 97/97, and TypeScript build-mode checking passed.
The local 390×844 synthetic keep preview shows the new side/rear water and
clear gate spine. This is visual fixture evidence only, not a phone, owner or
performance acceptance result. See [visual evidence](../../evidence/0.4.0/visuals.md).

The exact `0c9447e299c607f4685735cfe44b55c17ba77199` `/ptr/` production build
passed on pinned Node 22.22.3 / npm 10.9.8, including asset integrity,
production exclusions, the public-boundary scan (3,347 tracked paths / 1,902
scanned entries) and Farcaster integrity. Its full source SHA is embedded.
The local payload has 445 files / 134,453,359 bytes (receipt SHA-256
`a50ee4a4f6a4b928229184474510d1beb34c7a21ebe02a4d1076072dd33a45ba`; content
manifest `c1db4e3d1cad702ee14c0597f38c9d9b1941a7ee2de1725c11010ae3f1ac95ea`).
The mirror plan preserves 341 Alpha-root entries, targets 799 files, removes
zero obsolete paths, and has SHA-256
`ae12b90c68b6fb21200b9be3131193c2d74684ba341ad0e9ae00caa131c139cc`.
These receipts are ignored local evidence, not publication approval; refresh
them after this evidence-only update is pushed.

The checked-in sealed-launch state remains Pages approval false, package
`0.3.43`, G001/G002/PTR identities unset, and PTR presentation disabled. At
11:12 UTC the live root returned HTTP 200 and `/ptr/` HTTP 404; no 0.4
deployment occurred. Vite still warns on the retained G001 `RealmMapScreen`
bundle (677.80 kB / 188.23 kB gzip); physical-device performance and the
retained browser-log security warning remain open. Keep #374 and PTR
unpublished through September 30; resume hosted Verify after September.

## Previous September no-Actions continuation — 29 September 2026, 13:06 CEST (11:06 UTC)

## Previous September no-Actions continuation — 29 September 2026, 12:40 CEST (10:40 UTC)

Windows and origin are synchronized on `fix/g001-census-admission-proxy` at
`0b44301c139356db866abcb3977d45662f7d0566`; WarpkeepRunner is clean at the same
commit. PR #374 against main `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32` is
open and mergeable. The latest update is documentation-only after the fully
tested product candidate `4e3d7cd`; no product code changed. No GitHub Actions
were queried, dispatched, rerun or used during September.

All four local root-test shards passed on code-equivalent predecessor
`b23d67f48755bbc2ae98d3152ba2751b6b7da690`; separate lanes passed auth-bridge
prepared workflow 164/164, production canary closure 3/3, PTR existing-update
continuation 37/37, Greater Realm runtime release 36/36, and sealed production
activation records 69/69. Shards 2 and 3 reported 3,210 passed / 48 skipped
and 2,398 passed / 13 skipped; shards 1 and 4 passed, but their exact counts
were not retained. Focused closure suites previously passed 227/227.

The product candidate passed the disposable Windows full-stack browser probe
on Node 22.23.2 with SpacetimeDB CLI 2.6.1. It covered six menu profiles,
City Mill construction/completion, discounted Lumber Camp construction,
reload persistence, Worker re-entry and retry seams, the local realm, all four
resource-return paths and cleanup. See [`owner-journey.md`](../../evidence/0.4.0/owner-journey.md)
for coverage and limits. The sealed-launch verifier passed and correctly
reported `pagesDeploymentApproved: false`, package `0.3.43`, all live database
identities unset and PTR presentation disabled.

The exact `0b44301c139356db866abcb3977d45662f7d0566` `/ptr/` build passed with
pinned Node 22.22.3 / npm 10.9.8, including TypeScript, runtime-asset and
production-exclusion checks, the public-boundary scan, and Farcaster Mini App
integrity. Its full source SHA is embedded in the build. The local payload
receipt verifies 445 files / 134,452,795 bytes (receipt SHA-256
`8e42f5af155325e435e4d5a76d89f8b0a96b1332ffbe4705a89baa63d4d16b31`, content
manifest SHA-256 `44764b05dc7720a7ac0df0693eac91ed628731c16090c33eba56e02fd7c901a4`).
The mirror plan preserves 341 Alpha-root entries, targets 799 files, removes
zero obsolete generated paths, and has SHA-256
`6dd57fb51abf7343a6cfbb75f4cd48bbe045c4abb39f7de0e4860f45985facdb`.
Vite still warns that `RealmMapScreen` is 677.80 kB (188.23 kB gzip); actual
phone performance has not been measured.
These ignored receipts do not authorize publication. After this
documentation-only checkpoint is pushed, rebuild and regenerate both receipts
at its exact head.

The live root returned HTTP 200 and `/ptr/` HTTP 404 at 10:40 UTC; no 0.4
deployment occurred. Keep #374 open and PTR unpublished through September 30.
Physical-device/performance acceptance, authenticated owner journey, actual
route timing and review of the retained browser security warning remain open.
Continue from the previous checkpoint below for unchanged release gates.

## Previous September no-Actions continuation — 29 September 2026, 10:46 CEST (08:46 UTC)

PR #374 against main `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32` remains open
and is currently mergeable. The Windows checkout, origin branch and dedicated
WarpkeepRunner checkout are synchronized at closure-refresh commit
`3e0f24a084264134bc07a0d9ea2ab0336547d99b` on
`fix/g001-census-admission-proxy`. No GitHub Actions were queried, dispatched,
rerun or used as evidence during September. Keep the PR open and PTR
unpublished through September 30; confirm the owner's direction before using
hosted checks on or after October 1.

Product commit `9e07f475` adjusts Cathedral upward-facing roof facets through
cloned materials, preserving the violet vertical banners and emblem. Focused
Keep tests passed 403 tests across 21 files with one existing skip. Stable-source
local Chrome QA covered 36 scenarios (32 WebGL, four fallback), with no
horizontal overflow or recorded violation. The capture is flagged for review
because each page emitted one `browser-log-security` class warning; the capture
did not retain raw diagnostics. This is synthetic visual evidence and does not
establish physical-device acceptance or performance.

The prepared deployment closure was derived from `9e07f475` and refreshed in
`3e0f24a`: 1,250 protected members, 16 installed outputs, manifest SHA-256
`2421cc7be91fdbf84da0ebe8d5c2b857bb3d2e5f575347cda1ce21a773609726`. Fresh
process output comparison and prepared-deployment policy verification passed.
Seven native closure and release-projection suites passed 227/227, including
the full one-byte mutation sweep. The candidate remains development source;
this closure refresh does not prepare or authorize deployment.

The pinned Node 22.22.3 / npm 10.9.8 `/ptr/` production build previously passed
at product source `9e07f475`, with TypeScript, runtime-asset validation,
production exclusions, public-boundary scan (3,347 tracked paths / 1,902
scanned entries), and Farcaster Mini App integrity. Its existing
`RealmMapScreen` chunk warning is 677.80 kB / 188.23 kB gzip, and physical-phone
performance remains unmeasured. Rebuild and regenerate both ignored local
receipts at the final docs-inclusive pushed head after updating this checkpoint.
At 08:46 UTC on September 29, the public root returned HTTP 200 and `/ptr/`
returned HTTP 404. No publication occurred.

The private prepared-receipt input remains unavailable; do not create a
placeholder or another recovery key. G002 remains sealed. PRs #375 and #378
are represented in #374; #376 and #377 remain outside pending film/mobile
playback and G002 scope/rights decisions. After October 1, confirm direction,
then resume exact M1/M2 preparation and verification, G001 preservation, sealed
G002 readback, PTR publication/readback, and owner/device acceptance. Keep
scheduled automation paused and do not create Desktop files.

## September no-Actions continuation — 29 September 2026, 09:22 CEST (07:22 UTC)

PR #374 is the open 0.4 source candidate against main
786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32. The signed pushed head is
8a292056ef33fc9e81ad9bab9f57be1d4f1f0e17 on
fix/g001-census-admission-proxy; the native Windows checkout was fast-forwarded
to this exact head. This September pass does not query, dispatch, rerun, or rely
on GitHub Actions. Keep #374 open and PTR unpublished through September 30;
confirm the owner's direction before hosted checks on or after October 1.

At product-code commit 66d4e9cb, the existing completed economic craft signs
in the Inner Keep were enlarged for mobile legibility along with their resource
symbols and craft-level marks. They remain in the existing merged decoration
layer with one draw; this adds no new gameplay mechanic or scene layer. Five
focused suites passed 124/124, including Keep marker geometry, Keep scene,
prepared closure projection, closure-family derivation, and its 1,249-member
source graph.

The closure generator returned 16 outputs for 1,249 protected members. A fresh
Node process reproduced all 16 outputs and matched their installed bytes;
manifest SHA-256 is
5a8b1295765c4b7d1fb6dbd0a83062b260f3f45e40c196c2726df5620085a4fb.
It corrected two stale protected-source pins: the updated Keep building source
and an already-stale realm-choice stylesheet pin. The complete generated family
was committed in signed commit 8a292056, pushed with [skip actions], and synced
into the native checkout. The prepared-deployment policy verifier,
checked-in sealed-launch verifier, and preparation verifier all pass on the
clean commit. Sealed state remains package 0.3.43, Pages approval false,
G001/G002/PTR identities unset, and PTR presentation disabled.

On exact source 8a292056, pinned Node 22.22.3 / npm 10.9.8 passed the PTR
production build: TypeScript, runtime assets, production exclusions, public
boundary (3,346 tracked paths / 1,901 scanned entries), and Farcaster Mini App
integrity. The existing RealmMapScreen chunk is 677.80 kB / 188.23 kB gzip;
physical-device performance is unmeasured. At 07:22 UTC on September 29,
https://warpkeep.com/ returned HTTP 200 and /ptr/ returned HTTP 404.
No public file changed or deployment occurred.

Payload and read-only mirror-plan receipts have not yet been regenerated for
the candidate after this change. Rebuild and regenerate/check both at the final
docs-inclusive pushed source; preserve all 341 Alpha-root entries in the plan.
PRs #375 and #378 have their integrated work staged in #374. PRs #376 and #377
remain outside because click-to-load film/mobile behavior and G002 scope/rights
remain unresolved. Keep G002 sealed. After October 1, follow exact M1/M2
preparation and verification, then G001 preservation, sealed G002 readback,
PTR publication/readback, and owner/device acceptance.

Do not use the DegenDogsRunner for production-admin operations. Keep scheduled
automation paused, do not create Desktop files, and do not request or generate
another recovery key.
## Realm chooser readability fix — 29 September 2026, 08:23 CEST (06:23 UTC)

A rendered local `/ptr/` check exposed an overlap that source-only layout tests
missed: the realm-status tooltip floated above its card, obscuring the directory
heading on desktop and the preceding card at 390x844. The tooltip now expands
in the grid below its own card on hover or keyboard-visible focus. Its
`aria-describedby` explanation remains attached to each realm. On the updated
local preview, the portrait explanation and both actions fit without covering
another choice; at 936x672 it stays within the expanded directory panel. The
568x320 landscape panel remains scrollable through its existing rail.

The four focused menu/realm suites pass 59/59 after this change. The first
browser attempt used bare `vite preview` at `/ptr/`; Vite returned the SPA HTML
fallback for prefixed CSS, JavaScript and image paths, which made the page look
blank and unstyled. A temporary local prefix mount served the same built files
with their correct MIME types. This was a preview-host path issue, not an app
asset failure. The repeatable mount command is in
[`0.4.0-local-release-preparation.md`](../../operations/0.4.0-local-release-preparation.md).

The full root suite remains green on code/test commit
`822a0f466e2f63fc28c9441445d857d4b864616d`; this follow-up adds only menu CSS,
layout-test assertions and removal of a superseded tooltip-position test. After
committing this checkpoint, rebuild `/ptr/` and regenerate/check the ignored
payload and mirror-plan receipts at the pushed head. No hosted Actions were
used, the source PR remains open, and the PTR remains unpublished through
September.

## Exact-head local PTR preflight — 29 September 2026, 08:03 CEST (06:03 UTC)

At signed source head `2ff579960af776345bdce32eaf52888e87c582c9`, the pinned
Node 22.22.3 / npm 10.9.8 `/ptr/` production build passed TypeScript, runtime
asset checks, production exclusions, the public-boundary scan (3,346 tracked
paths / 1,901 scanned entries), and Farcaster Mini App integrity. The existing
large-chunk warning remains: `RealmMapScreen` is 677.80 kB / 188.23 kB gzip;
the PTR host is 106.32 kB / 32.62 kB gzip. Physical-phone performance remains
unmeasured.

The ignored local payload receipt binds to source tree `927f667f27eb0f944c779378c9121bb6fe5735e0`:
445 files / 134,451,503 bytes, payload-manifest SHA-256
`9cdcdc749f7068327fc57c0bfe0350b7faf270f355b4b6193ccac6f4139a20ea`, and
content-manifest SHA-256
`3a8dbca4aa7a4921bdc4d38b28c10e5ffea88558365620086483b2ee7fbb6aea`. Both
the payload write and its immediate check passed. The read-only local mirror
plan passed against existing `Warpkeep-Live` parent
`b6afe92e7b09197b1578d992103ac3c8f916d8ad`; it preserves 341 root entries,
targets 799 files, and removes zero obsolete generated paths. Its local plan
SHA-256 is `d8b27c99dffbd6427dead2717b16cd7b397109a536a142787c0a071026653753`.
These ignored receipts do not publish or modify the public repository. This
note-only source commit advances PR #374, so rebuild and refresh both local
receipts after pushing it. No GitHub Actions were used; all September commits
carry `[skip actions]`.

## Local root-suite recovery — 29 September 2026, 07:36 CEST (05:36 UTC)

The local candidate and PR #374 were synchronized at signed source `5bd2435b`
when the full root test command completed in the dedicated `WarpkeepRunner`
WSL distribution. Vitest 4.1.11 reported 693 files: 688 passed, 3 failed and
2 skipped; 12,551 tests passed, 20 failed and 103 skipped. The 20 failures were
fully accounted for across the three failing files.

Six failures were missing local verification prerequisites: pinned SpacetimeDB
CLI 2.6.1 was not on the test process PATH, and the expected offline YAML
archive was absent from that checkout's Git metadata. The existing local tool
cache and exact archive were provisioned without changing tracked files; the
two suites then passed 19/19. Fourteen failures were immediate synchronous
queries against inspection panels intentionally loaded through React
`Suspense`. The tests now await their accessible panel or control; the isolated
realm recreation file passes 59/59. These changes make the checks respect the
UI's loading boundary without changing product behavior.

The full suite was rerun on signed code/test commit
`822a0f466e2f63fc28c9441445d857d4b864616d` after those corrections. Vitest
4.1.11 completed in 888.36 seconds with no failures: 692 files passed, 1 was
skipped; 12,577 tests passed and 97 were skipped. The run included the backend
and YAML suites with their exact local prerequisites. This follow-up changes
documentation only; the test evidence binds to exact `822a0f46`. The note
commit advances the PR head, so rebuild `/ptr/` and regenerate both ignored
receipts after pushing it. For future local runs, use `WarpkeepRunner` as
`warpkeep` with pinned Node 22.22.3 / npm 10.9.8, expose the cached SpacetimeDB
2.6.1 binary on `PATH`, and ensure `.git/yaml-2.9.0.tgz` exists with SHA-256
`008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91`. A
missing CLI or archive is a runner setup failure, not evidence of a product
regression. The earlier `DegenDogsRunner` root mode 0777 remains unsuitable for
production-admin ancestor checks.

No GitHub Actions workflow, check, run or status was used in September; commits
continue to carry `[skip actions]`. This source-only verification work does not
authorize publication. Keep PR #374 open and PTR unchanged until the existing
owner, M1/M2, G001/G002, publication/readback and device-acceptance gates pass.

## Exact-source PTR preflight — 29 September 2026, 06:46 CEST (04:46 UTC)

At the start of this checkpoint, PR [#374](https://github.com/ael-dev3/Warpkeep/pull/374)
and the local candidate were synchronized at signed head `9cda070e`, against
operational main `786c0b2b`. PRs #375, #376 and #378 are represented in the
candidate; #375 and #378 remain open as source provenance, #376 remains open
until #374 lands, and Genesis 002 soundtrack PR #377 is deferred while G002 is
sealed and has no player path on the owner PTR.

Node 22.23.2 / npm 10.9.8 passed the exact `/ptr/` production build, all runtime
asset checks, production exclusions, the public-boundary scan (3,346 tracked
paths / 1,903 scanned entries), and Farcaster Mini App integrity. The PTR host
is 106.32 kB / 32.62 kB gzip; `RealmMapScreen` is 677.80 kB / 188.23 kB gzip
with 16.88 kB gzip CSS. The G001 chunk warning remains, and physical-phone
performance is unmeasured.

The exact-source payload write and recheck passed for 447 files / 134,507,691
bytes. The read-only plan against clean `Warpkeep-Live@b6afe92e` preserves 341
Alpha-root entries, targets 801 files and identifies no obsolete generated
paths. The ignored payload manifest and plan bind their full source SHA and
must be regenerated after every source commit. The checked-in sealed-launch
verifier confirms preparation only; the prepared-deployment policy passes in
the supported Linux environment. Pages approval is false, package version is
`0.3.43`, and G001/G002/PTR identities remain unset.

The Linux-only policy verifier initially rejected the Windows checkout because
it requires POSIX ownership and mode checks. It passed from a temporary Linux
worktree under `/tmp`; that worktree and its temporary dependency install were
removed. No GitHub Actions workflow, check or run was queried or used, and no
public file changed. The public root returned HTTP 200 and `/ptr/` returned
HTTP 404 at the latest direct check.

This documentation update advances PR #374's source identity. After it is
pushed, read the new exact head from both `git rev-parse HEAD` and GitHub PR
metadata, then rebuild `/ptr/` and regenerate/recheck the ignored payload and
mirror plan at that SHA before further release operations. The root test suite
remains incomplete: the 761-file run was stopped after more than eight minutes.
Keep hosted Verify pending during September and retain the M1/M2, G001/G002,
PTR readback and owner-device acceptance gates.

## PTR boundary and release-guard update — 29 September 2026, 06:26 CEST (04:26 UTC)

At this checkpoint PR [#374](https://github.com/ael-dev3/Warpkeep/pull/374) was
open against `main` `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`; GitHub reported
signed candidate head `1c3504aafb513b414c065f73890b50b88183c934`. Product commit
`fe8dc80f` removed the duplicate PTR admission path from `RealmMapScreen`, its
PTR-specific props and authority selector, and left owner, anchor, bridge and
gameplay-capability checks in `PtrGameplay04SurfaceHost`. This makes the PTR
host the single renderer boundary and keeps the Genesis component API free of
PTR session state. The route and host tests now render the same standalone
component used by `WarpkeepExperience`.

Pinned Node 22.22.3 / npm 10.9.8 passed TypeScript and six affected suites
(175/175). The test exposed an unwrapped async viewport refresh; `d52b5868`
wrapped the resize and microtask settlement so the PTR host suite runs cleanly.
The full Pages live-receipt suite passed all 20 tests after `14f0f7e1` updated
its closure expectations. The direct production route now protects both
`PtrGameplay04SurfaceHost` and `GreaterRealmWorldScene`; only the lazy Genesis
`RealmMapScreen` edge is excluded from the menu presentation source closure.

The `/ptr/` production build passed on product head `d52b5868`, including the
runtime-asset and Mini App checks, public-boundary scan and production output
exclusions. Vite emitted `PtrGameplay04SurfaceHost` at 106.32 kB / 32.62 kB
gzip, and `RealmMapScreen` at 677.80 kB / 188.23 kB gzip with 16.88 kB gzip
CSS. The G001 size warning remains; physical-device performance is unmeasured.
The repository-wide 761-file Vitest run was stopped after more than eight
minutes. It had exposed the two stale closure assertions fixed above, but it
did not produce a complete root-suite result.

Signed candidate commit `1c3504aa` refreshes the prepared closure outputs. The
family has 1,249 members and 16 generated files, manifest SHA-256
`3901d1cd779ce4690179a1ade87a4a73fb8a9350e28e4acd6a8c743ee2ea2968`. A fresh
independent Linux checkout reproduced every byte; checked-in sealed-launch
verification and the prepared-deployment policy verifier passed. The release
remains in `preparation`, with package version `0.3.43`, Pages approval false,
G001/G002/PTR identities unset and PTR presentation disabled.

No GitHub Actions workflow, run, check or status was used in September; all
candidate commits carry `[skip actions]`. No public file changed and no
deployment occurred. The September pause leaves hosted Verify pending and PR
#374 open. After October 1, confirm the owner's direction before exact-head
Verify and the M1/M2 sequence. This handoff edit advances the source identity,
so rebuild the `/ptr/` distribution and regenerate both ignored delivery
receipts from the final clean commit before any publication. Do not reuse the
older payload/plan hashes or treat local preparation as deployment authority.

## Current shipping continuation — 29 September 2026, 05:10 CEST (03:10 UTC)

The PTR payload preflight exposed a real allowlist gap after PR #378's tree
catalog landed: Vite copies
`public/models/greater-realm/biome-trees/v3/manifest.json` into production,
while the payload boundary allowed model GLBs only. The exact manifest path is
now admitted; unrelated model JSON and metadata remain rejected. Signed code
commit [`23a73814`](https://github.com/ael-dev3/Warpkeep/commit/23a738144b47b7c12d76f6e97ce9c53460fd9b33)
contains this narrow fix and regression coverage.

Pinned Linux Node 22.22.3 / npm 10.9.8 verification passed: the payload suite
passed 14/14, and the payload, mirror-plan, publication-operator and postflight
suites passed 38/38. The full `/ptr/` production build on this source passed
TypeScript, runtime assets, production exclusions, public boundary and Mini App
integrity. `RealmMapScreen` remains 680.25 kB raw / 188.87 kB gzip, above the
600 kB warning threshold; physical-device performance is still unmeasured.

For source `23a73814`, the exact `/ptr/` payload recheck passed with 447 files
and 134,454,617 bytes (manifest SHA-256
`42e92578ee6faef7196236e13ace950b2d791e96f735bfc31a0f85a4e3d66aa0`). The
read-only mirror plan against clean `Warpkeep-Live@b6afe92e` preserves 341
Alpha-root files, targets 801 total files and has zero obsolete generated
paths; plan SHA-256 is
`2ee10b910b8fa1825c18c94e791b31d8d470b10aac81f858b470a944c8cd6b8a`. These
receipts are local candidate evidence only. This handoff update advances the
source commit, so rebuild and regenerate both ignored receipts against the
resulting exact head before relying on them for publication.

At 03:09 UTC, `https://warpkeep.com/` returned HTTP 200 and `/ptr/` returned
HTTP 404. No Pages file was changed or deployed. No GitHub Actions workflow
was dispatched, rerun or queried during September; commits continue to use
`[skip actions]`, leaving hosted required checks pending. 0.4 is not merged,
deployed or accepted.

## Previous shipping continuation — 29 September 2026, 04:54 CEST (02:54 UTC)

PR #374 remains open against `main` at `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`.
Its current signed head is `53a8227c899f2b2abf9068817e11e46d836a2ee3`; the
Windows checkout, fetched origin branch and GitHub PR metadata agree. The
product-code source is `860370ab`; `53a8227c` adds only its verification
checkpoint documentation.

Both WSL checkouts used for shipping are now clean at the same exact head:
`/home/warpkeep/Warpkeep-0.4` in the `WarpkeepRunner` distribution and
`/home/warpkeep/warpkeep-closure-check-675d8294`. The latter is owned by the
verification service account, so inspect it with a per-command
`git -c safe.directory=/home/warpkeep/warpkeep-closure-check-675d8294` override;
do not add this disposable path to global Git configuration. The former
detached checkout's five superseded generated-closure edits were preserved in
`stash@{0}` (`preserve superseded c1eb083 closure outputs`) before it was
aligned to the candidate. No tracked edits were discarded.

The September GitHub Actions pause remains in force. No workflow was
dispatched, rerun, queried or used, and the pushed documentation update also
uses `[skip actions]`. The skipped required checks keep #374 unmergeable. The
public Alpha remains live while `/ptr/` is unavailable; Warpkeep 0.4 is not
merged, deployed or accepted. Continue local review and preparation that do not
depend on hosted checks; after October 1, confirm the owner's direction and
resume the documented exact-head release gates.

## Current shipping continuation — 29 September 2026, 03:30 CEST (01:30 UTC)

Open PR #374 now contains signed integration commit
[`758d655b`](https://github.com/ael-dev3/Warpkeep/commit/758d655b2344cfdf0d51e00bd3153754a97cc071)
carrying the current tree implementation from PR #378, plus signed product fix
[`be04c322`](https://github.com/ael-dev3/Warpkeep/commit/be04c3221aaffa880d329ad26e495b13c2fae84d).
The tested product-code tree is `be04c322`; this handoff update changes only
documentation. The v3 set covers all 20 tree-bearing biomes and contains 40
profile-specific GLBs totaling 2,738,208 bytes. High selects near geometry;
Balanced and Reduced select mobile geometry. Their per-biome instancing and
existing upload budgets remain in place.

Review found that the incoming catalog used domain-root model URLs, which
would miss assets in the `/ptr/` app. The loader now prefixes Vite's deployment
base and evicts rejected requests from its cache so a later view can retry.
Focused Node 22.22.3 / Vitest 4.1.11 coverage passed 51/51 across four Greater
Realm suites, including base-path resolution and a failed-then-successful
mobile fetch. A source-SHA-bound `/ptr/` build at candidate head
`5e3bc5b0ba39c86c0cf269007b7571ce1b0f23e7` verified TypeScript, asset
integrity, production exclusions, public boundary (3,346 tracked paths / 1,903
scanned entries), and Mini App integrity. The temporary worktree had no npm
CLI, so the exact `scripts.build` command string was executed directly; its
first attempt exposed a missing ignored auth-bridge dependency link, which was
reused from the existing lock-matched checkout before the successful pass.

The production bundle remains 680.36 kB / 188.79 kB gzip for
`RealmMapScreen`, above the 600 kB warning threshold. Asset budgets and local
build verification do not establish physical-phone performance. No PTR is
available for owner play. Warpkeep-Assets PR #41's source-release attachment
is still unpublished; Warpkeep's own runtime copies are hash-pinned and pass
the build verifier without an external download. Retain #41 as the open
long-term source archive/provenance follow-up.

Payload and public-mirror plan receipts at a89798c5 predate the added tree
models; they are stale and must be regenerated against the final candidate
head. The last independent live check at 00:59 UTC saw Alpha return HTTP 200
and `/ptr/` return HTTP 404. Warpkeep 0.4 remains unshipped.

No GitHub Actions workflow was dispatched, rerun, or queried in September.
The current source commits include `[skip actions]` so pushes do not start the
repository's `push` or `pull_request` workflows. Those skipped checks remain
pending and do not allow PR #374 to merge. After October 1, first confirm the
owner's current direction, then require Verify on the exact final head. Continue
with exact M1/M2 preparation and verification, G001 preservation, sealed G002
readback, PTR publication, and owner/device acceptance.

## Previous shipping continuation — 29 September 2026, 01:46 CEST (23:46 UTC)

Product guidance at code commit
[675d8294](https://github.com/ael-dev3/Warpkeep/commit/675d8294042786cea9e60bcae5ed52a73e12853f)
names the City Mill in the first empty-keep step. The protected closure was
regenerated from that code at 1,247 members, manifest SHA-256
748bc2a0f7b81d34556a5f58c5cac854f7ee1b4b1d4fb4696bcb3f88430d2c3e.
The closure verifier, closure policy and static prepared policy passed. Seven
focused suites passed 133 tests. The prepared-workflow test file
tests/authBridgeNotificationPreparedWorkflow.test.ts then passed all 164 tests
in a verbose single-worker run (305.62 seconds). The suite is slow because it
starts a fresh verifier process repeatedly and includes a 53-second per-member
mutation check; it completed successfully. Combined evidence: eight focused
suites and 297 passing tests, for code source 0754260d.

A /ptr/ production build bound to source 0754260d929c36df885727f36a8fb23afbf3034e
passed on pinned Linux Node 22.22.3, including type/project checks, runtime
assets, production exclusions, the public-boundary audit (3,300 tracked,
1,780 scanned) and Farcaster Mini App integrity. RealmMapScreen measured
748.60 kB (202.67 kB gzip); phone performance is unmeasured.

The payload write and recheck passed: 373 files, 131,571,432 bytes, manifest
SHA-256 78f11be36d8cd96a8ddc14c24b64126927df4c597308133d1918fb08a47653c0.
The read-only plan passed against Warpkeep-Live at b6afe92e: 341 existing Alpha
root files preserved, 727 target files, zero obsolete generated paths, plan
SHA-256 8553b07171f4d029dca251e6e986675c1ff46f7b911d5bcb596112fec210d805.
No public file was changed or published.

The exact-source Windows Chrome synthetic matrix captured 36 desktop/mobile/
reduced-motion/landscape states with zero horizontal overflow. I inspected the
390x844 empty-keep card; the City Mill copy and action fit. A bounded
browser-log-security warning appeared for each document, without raw messages;
the cause remains unclassified. No stderr warning/error or capture failure was
reported, and owned Chrome cleanup passed. This does not establish physical
phone usability or performance.

At 23:32 UTC, the public root returned HTTP 200 and /ptr/ returned HTTP 404.
No GitHub Actions were dispatched, queried or used in September. #374 remains
open; #375, #376 and #378 are staged for provenance, and #377 remains deferred
while G002 is sealed. The candidate plan is local and read-only. After October
1, require exact-head Verify, M1/M2 preparation and verification, G001
preservation, sealed G002 readback, PTR publication and owner/device acceptance.
0.4 remains unshipped.

## Shipping continuation — 29 September 2026, 00:52 CEST (22:52 UTC)

The product code remains signed `2d6121cfc3c0693636c9e5e7d775625e5d7bff09`
on the clean, synced candidate branch for open PR #374. This local checkpoint
uses the latest exact candidate source before this documentation-only refresh,
`b1afbb2f14eaf1221d11508eaf3f7c3f27d32aa9`. The `/ptr/` production build passed
with Node 22.23.2, including TypeScript/build mode, assets, production
exclusions, the public-boundary audit (3,300 tracked paths; 1,782 scanned
entries), and Farcaster Mini App integrity. The `RealmMapScreen` chunk is still
748.56 kB (202.65 kB gzip); no physical-phone performance result exists.

The exact-source `/ptr/` payload write/check passed for 375 files and 131,724,169
bytes (manifest SHA-256 `d399648c4f6af64579385f37f76d6d67552ea33620f49c0291c96ba38d093abb`).
The read-only public mirror plan passed against clean
[`Warpkeep-Live@b6afe92`](https://github.com/ael-dev3/Warpkeep-Live/commit/b6afe92e7b09197b1578d992103ac3c8f916d8ad):
it preserves 341 Alpha root files, plans 729 total files, and has zero obsolete
generated paths. Preserved-root manifest SHA-256 is
`32397edc2c9f7afed14f960f7d929b575dea00470a3368d7385cb4ead816832e`; plan SHA-256
is `62de9bbbe7d1c7989df9464e83010ff258eefbaafcf6d1000d243d90334ba348`. This
read-only plan is candidate evidence only; it did not change the public checkout,
publish, or authorize deployment. For local planning, set
`VITE_WARPKEEP_BUILD_SHA` to the exact source commit before running the payload
verifier; without it, the verifier correctly rejects the generated build
identity.

At 00:52 CEST, the public root returned HTTP 200 and `/ptr/` returned HTTP 404.
No 0.4 PTR is deployed or accepted. No GitHub Actions were dispatched, queried,
or used in September. The Windows full suite targets 692 test files. After over
ten minutes it still showed many failing-case markers and repeated
`Greater Realm publish supervisor directory was not private` fixture
diagnostics, so it was stopped before the aggregate report. Root causes remain
unclassified; this is not a suite verdict. Focused native Linux release suites
passed on the unchanged product-code source `2d6121cf`; the broad full-suite
result remains pending a supported Linux run.

The existing release order remains: after October 1, run final-head Verify and
complete source review/integration, prepare and independently check exact M1,
promote generated-only M2, verify exact M2, then perform G001/G002 readback,
verified `/ptr/` publication, owner journey and mobile/performance acceptance.
Until those gates pass, Warpkeep 0.4 is not shipped.

## Latest release checkpoint — 29 September 2026, 00:27 CEST (22:27 UTC)

The tested candidate code is signed commit
[`2d6121cf`](https://github.com/ael-dev3/Warpkeep/commit/2d6121cfc3c0693636c9e5e7d775625e5d7bff09)
on `fix/g001-census-admission-proxy`, pushed to open PR #374 against main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. Local, origin and PR #374 matched
this code checkpoint. The following handoff refresh is documentation only.
GitHub Actions remain paused for September; none were dispatched, queried or
used.

This checkpoint makes the first empty-keep journey name Food, Wood and Stone,
call out Gold for City Goldworks, direct players to compare costs under
Buildings, and tell them to send an idle Worker to gather what they lack. It
does not change costs, yields, timers, routes, authority or commands.

The protected deployment closure had fallen behind the code already integrated
into the 0.4 candidate: six current files were absent. Regenerating the full
closure family brings its count to 1,247 and manifest SHA-256 to
`7f2a1b348b1549a97711e928e415256e5f4f94f843885e11f43191f55380b4bf`. The added
members are the castle-film action/config/eligibility files and
`src/greater-realm/biomeTreeGeometry.ts`. Native WSL scanner-backed policy
verification passed on the exact signed source.

Validation passed: the first-journey screen tests (39), local closure-family
tests (7), closure inventory and B0 topology tests (39, one skipped), closure
derivation tests (24, two skipped), native release projection and deploy-boundary
tests (14), and the protected workflow suite (164). `tsc -b` and the full
`DEPLOY_BASE=/ptr/ npm run build` also passed. The build verified 3,300 tracked
paths and 1,782 scanned entries, plus the production asset/exclusion and Mini App
checks. It continues to report the existing `RealmMapScreen` bundle at 748.56
kB (202.65 kB gzip); physical-device performance is unmeasured.

The checked-in sealed-launch verifier still reports
`pagesDeploymentApproved: false`, with G001, G002 and PTR identities unset.
At 00:27 CEST, the public root returned HTTP 200 and `/ptr/` returned HTTP 404.
The 0.4 PTR is not deployed or accepted; a genuine owner journey, exact-M1/M2
preparation and deployment readback, G001 preservation, sealed G002 verification
and phone/performance acceptance remain. Keep the candidate PR open and continue
signed `[skip actions]` checkpoints until hosted Verify resumes in October.

## Previous release checkpoint — 28 September 2026, 23:47 CEST (21:47 UTC)

The candidate code exercised here is signed source
[`1b295b3d`](https://github.com/ael-dev3/Warpkeep/commit/1b295b3d2e57447485f0f581dafc65f0e8725304),
which matched local, origin and open PR #374 before this documentation update.
PR #374 remains open against main `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`.
GitHub Actions remain paused for September; none were dispatched, queried or
used.

The disposable full-stack browser probe passed under the existing Node 22.23.2
runtime. It exercised six responsive direct-menu profiles, synthetic sign-in
and Terms continuity, City Mill construction and completion, the discounted
Lumber Camp with one Builder, hard-reload persistence, retained Realm camera
and Worker presentation, fresh-process four-phase Worker re-entry, delayed and
failing private reads with recovery, the 10,000-cell local Realm, and dispatch,
recall, automatic settlement and return completion for all four resources.
The test database, accelerated Worker timings and shortened first-building
duration are disposable QA substitutions; this does not prove the real-route
ten-minute target or an authenticated owner journey.

At 390×844, rendered local review showed the first-return cue, resource cards,
primary keep actions, City Mill progress and placement controls. This is local
browser evidence, not physical-phone acceptance. The current production bundle
measurement is 748.56 kB (202.65 kB gzip) for `RealmMapScreen`; phone performance
remains unmeasured.

At 21:47 UTC, `https://warpkeep.com/` returned HTTP 200 and
`https://warpkeep.com/ptr/` returned HTTP 404. The Alpha 0.3.43 root is live;
0.4 is not deployed or accepted. Continue local source work and signed,
`[skip actions]` checkpoints through September. In October, final-head Verify,
exact-M1 preparation/check, generated-only M2 verification, G001 preservation,
sealed G002 readback, backend and PTR deployment/readback, and owner/device
acceptance remain required.

## Previous release checkpoint — 28 September 2026, 23:24 CEST (21:24 UTC)

Signed source [`abe2fae2`](https://github.com/ael-dev3/Warpkeep/commit/abe2fae24f34ad1da76a952848fea5835c6e42e3)
is pushed and synced to open PR #374 on
`fix/g001-census-admission-proxy`. The PTR production build previously showed
0.3.43 and opened Genesis 001's old patch notes. The packaged build identity
now selects `PTR_RELEASE_VERSION` only when Vite's deployment base is exactly
`/ptr/`; its footer and Farcaster diagnostic therefore show
`ALPHA 0.4.0-ptr.1`, with the existing sealed 0.4 patch notes. The root build and
package remain 0.3.43, preserving Genesis 001.

The exact source closure was re-derived to 1,241 members with manifest SHA-256
`57ea459bc8fbcde9f9c5e194e227990342ecf75e3d86c219294ec71db760ff3b`. The
native ownership-bound closure verifier passed. Checked-in sealed-launch
verification passed in Windows and Linux and correctly returned
`pagesDeploymentApproved: false` with G001/G002/PTR identities unset. Native
closure projection and manifest tests passed 27/27. Four focused Windows
suites passed 204 tests with three skips. The full `/ptr/` production build,
asset and production-exclusion checks, public-boundary audit, Mini App
integrity, file-size policy and license policy passed. A 390×844 local browser
preview showed `ALPHA 0.4.0-ptr.1` and the matching 0.4 notes. The large
`RealmMapScreen` bundle remains 748.56 kB (202.65 kB gzip); physical-device
performance is still unmeasured. An independent root-base production build
and browser preview still show Alpha 0.3.43 and its original patch notes.

No GitHub Actions were dispatched, queried or used during September. At 23:14
CEST, `https://warpkeep.com/` returned HTTP 200 and `/ptr/` returned HTTP 404.
This change repairs candidate identity only; it is not a PTR publication or
owner acceptance. Keep #374 open. After the September pause, require exact-head
Verify, reviewed source integration, exact-M1 preparation/check, generated-only
M2 promotion, exact-M2 verification, G001 preservation and G002 sealed
readback, backend deployment/readback, PTR publication and owner/device
acceptance.

## Previous release checkpoint — 28 September 2026, 22:41 CEST (20:41 UTC)

The owner paused GitHub Actions for September; none were dispatched, queried or
used. Before integration, signed local/origin/PR #374 matched `513dac09` on main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. Signed merge
[`3e135906`](https://github.com/ael-dev3/Warpkeep/commit/3e135906df7956426f61c3e6ff8d9bbd3753bf4c)
integrates exact Warpkeep PR [#376](https://github.com/ael-dev3/Warpkeep/pull/376)
head `d924e2e99e471add91f22e14db98be3a637eae9d` into candidate #374. This is
candidate integration only. PRs #375, #376 and #378 remain open as provenance
until #374 lands; their older source closures should not be merged separately.

PR #376 adds the owner-commissioned castle-film action for the verified FID
existing managed owner record and narrow-screen castle-selection focus handling. The action is
bound to the resolved castle identity, and stale selections cannot reveal it.
Its module is lazy-loaded; the built JS is 3.02 kB (1.24 kB gzip), with 3.09 kB
(1.03 kB gzip) of CSS. The 288,869,749-byte video stays in its versioned public
release and loads only after the player opens. The release checksum matches
`ASSETS-LICENSE.md`; no video enters the Warpkeep package. PR #377 remains
deferred because G002 is sealed and no current player path can exercise its
score in the owner PTR.

The combined local suites passed 196/196 across 10 affected test files. The
full `npm run build` passed build-mode typechecking, asset integrity, production
exclusions, public-boundary and Farcaster Mini App checks. `npm run
verify:file-sizes` passed. On signed merge `3e135906`,
`npm run verify:sealed-launch` passed its checked-in phase and correctly
returned `pagesDeploymentApproved: false`, with G001/G002/PTR identities unset.
The build reports `RealmMapScreen` at 748.45 kB (202.64 kB gzip); continue to
measure mobile load and physical-device performance. The earlier 18-case Keep
render probe and 15-case rendered-WebGL matrix remain synthetic browser evidence.

At 22:41 CEST, the public root returned HTTP 200 and `/ptr/` returned HTTP 404.
No 0.4 PTR, authenticated owner journey, ten-minute real-route result or phone
acceptance is claimed. Continue syncing the source and notes without Actions.
After September, run final-head Verify, integrate the signed source, prepare
and independently check exact M1, promote generated-only M2, then verify and
complete G001/G002 readback, backend deployment, PTR publication and owner
acceptance. The documentation-only sync following this checkpoint does not
change runtime source.

## Latest release checkpoint — 28 September 2026, 19:46 CEST (17:46 UTC)

The owner directed this workflow to proceed without GitHub Actions during
September. No workflow was dispatched or rerun for this checkpoint, and no
hosted check status was used as evidence. The maintained branch
`fix/g001-census-admission-proxy` is synced to PR [#374](https://github.com/ael-dev3/Warpkeep/pull/374)
at signed commit [`f0fcd1a0`](https://github.com/ael-dev3/Warpkeep/commit/f0fcd1a0a537ee4b4763f629ff5784f9226f962d),
based on `main` `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. The source change
refreshes `SEALED_LAUNCH_PACKAGE_STRUCTURE_SHA256` in
`scripts/verify-0.4.0-sealed-launch.mjs` to `5cf98e7b…32a1367f`, matching the
current root package structure. Local `tests/localPreparedSourcePins.test.ts`
passed 25/25 and `tests/sealedLaunchVerifier.test.ts` passed 169/169. This is a
protected/prepared-closure output: the correction still needs the workflow's
fresh exact-source M1/M2 preparation after integration. It does not mean the
prepared closure or release was accepted.

On the isolated Linux test checkout, root shard 1 passed 4,105 tests (32
skipped), shard 3 passed 2,398 (13 skipped), and shard 4 passed 2,543 (4
skipped). Shard 2 initially exposed an environment setup issue: the pinned
`spacetimedb/ptr` pnpm workspace was absent and its generated `dist` directory
had the wrong owner. After installing with the lockfile and correcting only
that disposable checkout's ownership, the affected
`tests/ptrRealmBackend.test.ts` passed 15/15; shard 2 as a whole was not rerun.
The five separately scheduled suites were not run in this continuation.
`git diff --check` passed. A preparation attempt made before committing the
source correction correctly rejected the dirty checkout with
`SEALED_LAUNCH_CHECKOUT_INVALID`; it is recorded as pending exact-source
preparation, not a product regression. The repository's separate native M1/M2
sequence and hosted Verify remain required acceptance gates.

Public status is unchanged: `https://warpkeep.com/` serves Alpha 0.3.43 and
`https://warpkeep.com/ptr/` returns 404. Sealed launch remains in preparation;
there is no accepted 0.4 PTR deployment. Keep #374 open during the September
Actions pause. Continue independent local review and integration work, but do
not merge or describe local evidence as a hosted-check waiver. See the
[September workflow rule](../../engineering/development-workflow.md#temporary-github-actions-pause--september-2026).

## Latest release checkpoint — 28 September 2026, 09:15 CEST (07:15 UTC)

At this checkpoint, maintained branch `fix/g001-census-admission-proxy` and
`origin` matched at signed source
[`dd24abb`](https://github.com/ael-dev3/Warpkeep/commit/dd24abb135600295e3b0675c92088124a54aee9a).
PR [#374](https://github.com/ael-dev3/Warpkeep/pull/374) is open against
`main` `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. Exact-head Verify
[36389656795](https://github.com/ael-dev3/Warpkeep/actions/runs/36389656795)
failed all 17 jobs before runner allocation. GitHub attributes this to failed
account payments or the Actions spending limit; the jobs had no test steps,
so hosted source verification has not run. The account owner must clear this
gate and rerun Verify on the live exact PR head. This checkpoint's documentation
updates advance that head; always resolve the pushed SHA before release work.

The local Node 22.23.2 `/ptr/` production build and source-bound payload check
passed on `dd24abb`: 369 files and 131,605,137 bytes. The local 390×844 Chrome
capture reached model-ready with a visible canvas and no console warnings; the
resource waterfall was 3,738,720 bytes, versus 9,516,527 bytes in the earlier
capture. The castle and guardian source models are preserved unchanged; the
optimized runtime files total 1,036,412 bytes, down from 6,814,140 bytes. This
is synthetic local evidence, not physical-device acceptance.

The read-only `/ptr/` mirror plan passed against public
`Warpkeep-Live@b6afe92`: it preserves 341 current Alpha root files and
describes a 723-file target tree. No public files or refs changed. The previous
claim that delivery required the root path was stale; the checked-in planner
and publisher support `/ptr/` while preserving the live root. Production still
serves Alpha 0.3.43 at `/` (HTTP 200), while `/ptr/` is HTTP 404. The PTR is not
deployed or accepted.

PR #375 repeats the older menu source already staged in #374. #376's 288.9 MB
castle film remains deferred pending mobile transfer/playback review; #377's
Genesis 002 soundtrack remains deferred pending realm scope and rights review.
Assets #38 stacks Genesis 002 audio on Assets #37 and remains deferred with
that realm-scope decision. Re-inventory incoming PRs before integration.
Resume with account billing and hosted Verify, then complete the documented
exact-source M1/M2 integration, G001 preservation/readback, sealed G002
verification, owner PTR deployment, mobile/performance checks and owner
acceptance in order. Do not use the persistent privileged production runner as
a substitute for hosted checks.

## Shipping continuation — 28 September 2026, 06:15 CEST (04:15 UTC)

PR [#374](https://github.com/ael-dev3/Warpkeep/pull/374) is still open against
`main` (`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`), with no submitted review.
The maintained checkout is clean and matches
`origin/fix/g001-census-admission-proxy` at signed head
[`0893cf4b`](https://github.com/ael-dev3/Warpkeep/commit/0893cf4b0ecd9b37e8cfb594606afb302819899f).
The immediately preceding `/ptr/` production build and source-bound payload
manifest write/check passed on that exact source; the build includes the source
SHA and validates runtime assets, production exclusions, public boundaries and
Farcaster integrity. Its payload contained 369 files (137,380,979 bytes).
After the documentation-only update in this commit, regenerate the build and
manifest against the resulting exact source head before any publication plan.

Focused filesystem, payload and publication tests had 163 passes and four
capability/platform skips; the mirror-plan suite passed all eight when rerun
serially after one disk-contention timeout. The full local test/build evidence
for the candidate is recorded below. Exact-head [Verify
36376745041](https://github.com/ael-dev3/Warpkeep/actions/runs/36376745041)
on `0893cf4b` failed all 17 jobs before any job step ran. GitHub's check-run
annotation says recent account payments failed or the Actions spending limit
must be increased. This is a runner-allocation failure, not a hosted source
test verdict. Do not bypass the hosted gate; clear the account billing/budget
issue and rerun Verify on the eventual exact final PR head.

At 04:15 UTC, the production Alpha root returned HTTP 200 and
`https://warpkeep.com/ptr/` returned HTTP 404. The checked-in sealed-launch
verification remains in `preparation`, package version `0.3.43`,
`pagesDeploymentApproved: false`, with no PTR database identity or activated
production receipts. No public mirror mutation, 0.4 PTR deployment or release
acceptance occurred. Do not merge PR #375 directly because its older menu
branch is already staged in #374. PRs #376 and #377 remain open,
separate candidates deferred by the recorded media-size, mobile, readiness
and rights review; Assets #38 remains stacked on #37. Re-inventory both
repositories and review any new PR before integration.

Resume in order: clear GitHub Actions billing/spending limit, obtain a successful
exact-head hosted Verify and review, complete remaining sealed-realm/native
acceptance and PTR production bindings/receipts, prepare and verify the signed
`/ptr/` publication, then get the owner's PTR acceptance. Preserve the live
Alpha root throughout. See the release checklist for current public checks and
the detailed gate sequence.

## Shipping continuation — 28 September 2026, 05:29 CEST (03:29 UTC)

PR #374 now carries a source-pinned GitHub Pages candidate path at `/ptr/`, so
the 0.4 owner PTR can coexist with the Alpha at `/`. This supersedes the older
root-replacement proposal below; never publish an earlier root-targeted plan.
The versioned mirror plan records every existing Alpha generated/host file and
its digest, builds only the PTR payload under `ptr/`, refreshes provenance
documents, and pins the preserved-root inventory. The signed publication
operator reads preserved blobs from the reviewed public parent, verifies the
complete new tree and PTR fallback, and retains the exact-parent rollback. Live
postflight verifies all PTR files, the Alpha index/404/Farcaster manifest and
the root assets referenced by the Alpha HTML; it compares every preserved root
file against the publication parent before network checks.

The public `Warpkeep-Live` checkout remains unchanged at `b6afe92e`. Its current
352-file Alpha tree is 124,665,064 bytes (118.89 MiB); the existing local dist
was 124,859,424 bytes (119.08 MiB). The publication/postflight tree cap is
320 MiB to fit the preserved root plus the payload's existing 150 MiB maximum.
The candidate workflow is configured to build with `/ptr/` and binds its saved
payload manifest and asset paths to that prefix; the separate sealed G002 lane
retains its root base.

Verification on this source passed the focused publisher/payload/postflight
groups (**37 tests**), another selected payload/planner/config/sealed-launch run
(**23 passed; unrelated cases filtered**), TypeScript build mode, Node syntax
checks and `git diff --check`. The live root HTML's five application assets
also pass the independent root asset parser. No public repository mutation or
PTR deployment has occurred. After syncing this change, recheck GitHub's exact
PR head and Verify; the most recent hosted run still stopped before runner
allocation on the Actions payment/spending-limit gate. The PTR backend bindings,
final source approval, live publication and owner PTR play remain pending.

## Exact-head shipping checkpoint — 28 September 2026, 04:38 CEST (02:38 UTC)

The maintained checkout and `origin/fix/g001-census-admission-proxy` were clean
and matched signed commit
[`4ceba245`](https://github.com/ael-dev3/Warpkeep/commit/4ceba245db011ea5d5c2b8e764a3ba340ed8a9b5).
PR [#374](https://github.com/ael-dev3/Warpkeep/pull/374) remains open against
`main` `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`, with no submitted review.
The application checks below ran on exact source `feaade75`; `4ceba245` changes
only the release notes. The outgoing documentation commit passed the pinned
Gitleaks scan (8.58 KB, no leaks) and scanner-regression fixture (48 positives,
95 negatives). Exact-head
[Verify 36370609811](https://github.com/ael-dev3/Warpkeep/actions/runs/36370609811)
on `4ceba245` then failed all 17 jobs before any step. GitHub's check annotation
states that recent account payments failed or the Actions spending limit must
increase. This is the same external runner-allocation gate, not a hosted source
test result. This notes-only update will advance PR #374 again; recheck the new
exact head and run, and do not merge until a successful hosted Verify and
review are recorded.

Local verification on the exact source completed successfully:

- All four root-test shards passed: **12,138 passed, 201 skipped**. During the
  initial concurrent run, one 10-second test timed out under CPU contention;
  the isolated test and a serial rerun of its full shard both passed. This is
  recorded as runner contention, not hidden as a clean first attempt.
- The additional root workflow groups passed **309/309**. Auth-bridge checks
  passed **502** tests; release-recovery passed **68**. Their dependency audits
  reported no known vulnerabilities.
- TypeScript, licenses, runtime-asset inventory, file-size, checked-in
  sealed-launch, atlas-public-boundary, root/GitHub-Pages/subpath production
  builds, and the primary SpaceTimeDB typecheck, **598/598** pure tests and
  module build passed. The connected migration, import, relocation/rollback,
  active-population/gathering, access-request, worker and admission-CAS
  rehearsals passed. The schema fixtures through v18 built successfully.
- The additive-migration proof printed a complete pass, but its combined
  wrapper exited 1; a separate rerun of the database audit exited 0 and found
  no known vulnerabilities. The wrapper's nonzero source was not isolated, so
  retain it as an unresolved local-command anomaly rather than claiming every
  aggregate command exited successfully.
- The native sealed-existing-update contract passed **260 tests with one
  platform skip** using its documented privileged entrypoint that drops
  privileges for the test body; the extra native activation/receipt group
  passed **156/156**. No host sudo policy was changed.
- Gitleaks scanner regression passed (**48 positives, 95 negatives**) and the
  full 667-commit Git history scan found no leaks. `npm audit` found zero
  vulnerabilities; npm signature verification checked 249 packages and 74
  attestations.

GitHub exact-head Verify 36360727066 on `feaade75` and 36370609811 on
`4ceba245` both failed all 17 jobs before executing a step. The latest
runner-allocation annotation cites failed account payments or the Actions
spending limit. This is an external billing gate, not a hosted source-test
result. Do not merge or substitute the privileged production runner; the owner
must clear billing/enable an Actions budget, then rerun Verify on the final PR
head. The public Alpha root returned HTTP 200; `https://warpkeep.com/ptr/`
returned HTTP 404. A `/ptr/` candidate build succeeds, but the current
generated-only public-mirror publisher and verifier are pinned to `/` and the
exact existing root tree. No 0.4 PTR has been deployed, and preserving Alpha
requires a reviewed subpath delivery path or access to the intended hosting
account. No owner PTR play, G001 preservation, G002 activation, or release
acceptance is claimed.

The latest PR inventory still shows #375, #376, #377 and Warpkeep-Assets #37,
#38 open without submitted reviews; #38 depends on #37. Recheck exact heads,
diffs, rights and hosted checks before any later integration. Keep the large
film and G002 score deferred from the initial PTR candidate under the mobile,
realm-readiness and rights criteria already recorded in the next-work brief.
The tracked repository is the canonical local/GitHub note; create no Desktop
copy or other project file while syncing this checkpoint.

## Deployment and gameplay continuation — 28 September 2026, 01:55 CEST (27 September, 23:55 UTC)

At the start of this check, local `fix/g001-census-admission-proxy` and GitHub
matched signed head
[`1f7872f0`](https://github.com/ael-dev3/Warpkeep/commit/1f7872f00dd214b8ec719295cf6a99a1c03d397f),
with PR #374 open against `main` at
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. Eight gameplay, renderer,
resource-route, loop-rail and mobile-layout suites passed locally: **194/194**
on Windows Node 24.19.0. This focused run is useful regression evidence, not
the pinned Linux full-suite or exact-head hosted Verify. Exact-head
[Verify 36359661370](https://github.com/ael-dev3/Warpkeep/actions/runs/36359661370)
failed all 17 jobs before any step because GitHub rejected runner allocation on
the account payment/spending-limit gate.

A new read-only hosting check found that the current Cloudflare browser and
Wrangler session can see one account, while the configured Pages request targets
a different account and returns API authentication error 10000. Direct browser
access to that target also returns Cloudflare's “page may not exist or you may
not have permission” response. No project, DNS, Worker or deployment was changed.
Do not use the currently selected account as evidence for production Pages
access. The protected GitHub workflow may have separate provider credentials;
its operations remain untested because GitHub did not start the jobs.

The existing generated-only publisher and its manifest verifier pin the custom
domain artifact to publication path `/` and validate an exact root tree. Using it
for 0.4 would replace the live Alpha. The separate `/owner-canary/` entry is an
operator/canary page bound to the shared Alpha configuration; it does not satisfy
the playable 0.4 PTR. Keep the current Alpha at `/`. Before PTR deployment, either
restore access to the correct Cloudflare account and implement its source-pinned
subdomain, rollback and postflight route, or extend the reviewed public mirror to
publish a verified `/ptr/` subtree while preserving and byte-verifying every
existing root file. Preserve `https://warpkeep.com` as the login origin; test the
subpath build and all same-origin auth, legal, asset and mobile routes before
using it. Then require exact-source hosted Verify and owner PTR acceptance.

The browser dashboard and local Wrangler account IDs disagree with the account
target used by the configured profile; treat this as an access mismatch, not a
missing Cloudflare project. Do not create another recovery key or publish to the
wrong account. The existing PTR still requires owner authentication and the
server-side sealed-launch bindings. No live 0.4 PTR or release acceptance is
claimed.

## Current continuation — 28 September 2026, 01:42 CEST (27 September, 23:42 UTC)

The maintained `fix/g001-census-admission-proxy` checkout and GitHub ref match
signed commit
[`e48221bc`](https://github.com/ael-dev3/Warpkeep/commit/e48221bc411fc7675ecfb1f5ceef870cf84fd191).
PR [#374](https://github.com/ael-dev3/Warpkeep/pull/374) remains open against
`main` at `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`.

The 0.4 menu replaced the old GitHub link with the Farcaster community link,
so the QA journey test's previous accessible name was stale. It now checks the
current link's new-tab and referrer protections and confirms that mounting the
local fixture causes no navigation. The focused Linux run passed all 50 tests.
Earlier local checks on the same application source passed license, runtime
asset, file-size and checked-in sealed-launch verification, TypeScript checks,
and standard plus both GitHub Pages production builds. The full local four-shard
root suite was not completed; do not represent it as a full-suite pass.

Exact-head [Verify 36359580351](https://github.com/ael-dev3/Warpkeep/actions/runs/36359580351)
on `e48221bc` completed with all 17 jobs failing before any step ran. GitHub's
runner-allocation annotation again cites failed account payments or the Actions
spending limit. This is not a source-test result. Hosted Verify must pass on
the exact final PR head before integrating the source. The current Alpha remains
separate; no live 0.4 PTR or release acceptance is claimed.

Resume by resolving GitHub **Billing & plans**, then rerun exact-head Verify.
After that, integrate PR #374 through its required review path, prepare and
independently check the exact merged M1, promote only its generated M2, pass
exact-main Verify and protected provider/preservation gates, and publish and
accept the owner PTR. Keep #376 (large on-demand film), #377 (sealed G002 audio),
and Assets #38 (stacked on #37) deferred under the existing mobile, realm-readiness,
rights and hosted-check criteria. Re-inventory incoming PRs before integration.

## Current continuation — 28 September 2026, 00:38 CEST (27 September, 22:38 UTC)

The maintained checkout is clean and matched GitHub before this documentation
refresh at signed source head
[`5f67d36a`](https://github.com/ael-dev3/Warpkeep/commit/5f67d36a7c52da2d68ce46eea653fb80f221f477).
PR #374 remains open against `main` at
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. Its exact-head [Verify
36355948438](https://github.com/ael-dev3/Warpkeep/actions/runs/36355948438)
completed at 22:38:28 UTC. GitHub's check-run API confirms all 17 jobs have
zero steps and the failure annotation is: “The job was not started because
recent account payments have failed or your spending limit needs to be
increased.” This is account billing/runner allocation, not a source-test
verdict. Local checks on the source head passed: 31 targeted tests, TypeScript
project build, and the full rendered-WebGL browser probe (15 render cases,
terrain fallback, Worker lifecycle/locomotion/occupancy, 25 journey checks,
loopback LOD boundaries and aggregate fidelity). The direct-menu and Credits
link expectations were corrected to match local versus commit-stamped builds
and the single licensed Credits link.

The owner reported a fresh QR scan login succeeded; the conversation clock
observation was 22:17:54 UTC. This is the time the report was observed, not the
untraced scan/exchange time. No new Worker trace, browser identity or served
build hash is available. The detailed failure diagnosis and exact evidence
limits remain in the [QR incident record](../../evidence/0.4.0/qr-auth-incident-2026-09-27.md).

New open 0.4 candidates appeared and need review before integration:
[Warpkeep #376](https://github.com/ael-dev3/Warpkeep/pull/376) adds a gated
castle lyric-film action; [#377](https://github.com/ael-dev3/Warpkeep/pull/377)
adds a Genesis 002 soundtrack while that realm stays sealed; and
[Warpkeep-Assets #38](https://github.com/ael-dev3/Warpkeep-Assets/pull/38)
archives that score, stacked on open Assets #37. At this checkpoint, #376 and
#377 have no submitted reviews and their Verify jobs did not start under the
same account billing gate. Assets #38 also has no review; its Verify/CodeQL
checks failed before execution. Inspect actual diffs, rights/provenance,
accessibility, mobile behavior and dependency order; do not treat PR prose or
local author results as hosted approval. The user expects additional 0.4 PRs,
so re-inventory both repositories before every integration decision.

This docs refresh does not claim a live 0.4 PTR or release. A docs-only commit
will advance the PR head, so the eventual passing Verify must match the final
head exactly. Do not bypass it with the privileged production runner. After
reviewing incoming PRs, resolve the account Billing & plans gate and resume
the existing M1 → native proof → generated M2 → exact-main Verify → provider /
preservation → owner PTR sequence below.

## Incoming PR review — 28 September 2026, 00:50 CEST

The current pushed docs head is signed
[`4e8d8cf5`](https://github.com/ael-dev3/Warpkeep/commit/4e8d8cf5b3df09ddee81188c23ee53b265dad0d3);
local and `origin/fix/g001-census-admission-proxy` match. Exact-head [Verify
36356502820](https://github.com/ael-dev3/Warpkeep/actions/runs/36356502820)
completed at 22:48:17 UTC. GitHub reports 17 jobs with zero executed steps;
the failure is the same account payment/Actions spending-limit block. The
public Alpha home still returned HTTP 200 at 22:50 UTC.

Independent local checks were run against each unchanged PR head. Warpkeep
[#376](https://github.com/ael-dev3/Warpkeep/pull/376) passed its five changed
test suites (66 tests), `tsc -b`, and the full production build. Its remote
film is 288,869,749 bytes and loads only after the user opens the player. Hold
it outside the release candidate until mobile delivery cost and a poor-network
playback experience are reviewed; hosted Verify has not run. Warpkeep
[#377](https://github.com/ael-dev3/Warpkeep/pull/377) passed 23 audio tests,
`tsc -b`, file-size/runtime-asset verification and the full production build.
Keep it out of the initial PTR candidate while Genesis 002 is sealed: it adds
no experience to the currently reachable realm, and the source's `made with
suno` metadata does not establish ownership or service terms. Preserve the
PR's narrow use record; do not claim an open or broader redistribution license.

Warpkeep-Assets [#38](https://github.com/ael-dev3/Warpkeep-Assets/pull/38)
correctly stacks on Assets #37; do not retarget or merge it before that parent
lands. The archive manifests state unresolved/original terms, and both its
Verify and CodeQL jobs stopped before execution on the account billing gate.
Assets #37 also has no submitted review and its checks are blocked. Keep these
asset changes separate from the reachable PTR candidate until their dependency,
rights record and hosted checks are resolved. Vite's build warning about the
existing ~748 kB realm screen chunk remains; #376 changes it by under 1 kB, so
this is not a regression from that PR.

These candidates have been reviewed for scope and locally validated where the
game repo is available, but none is integrated or host-verified. Check for new
PRs before any later decision. Keep the next release checkpoint exact-head
aware because every docs commit also advances PR #374.

## Previous release checkpoint — 27 September 2026, 21:58 UTC

Local `fix/g001-census-admission-proxy` and GitHub match signed head
[`8d20e2bb`](https://github.com/ael-dev3/Warpkeep/commit/8d20e2bbff8dea0a4a46cd2eacb289a70fdbba4e).
PR #374 is open against `main` at `786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`.
The mandatory [release checklist](../../operations/0.4.0-release-checklist.md)
was refreshed on that head with the QR outcome, source-closure evidence,
current gate and remaining release sequence.

Exact-head [Verify 36353616339](https://github.com/ael-dev3/Warpkeep/actions/runs/36353616339)
started at **21:58:12 UTC** on `8d20e2bb`. All 17 jobs failed before any step
ran; the annotation says recent account payments failed or the Actions spending
limit must increase. This is a runner-allocation failure and contains no source
test verdict. Do not bypass hosted PR verification by running untrusted PR code
on the production-admin self-hosted runner. Restore GitHub Actions billing,
then rerun Verify on the exact final PR head before source integration. The
current 0.4 source still needs reviewed main integration, exact-M1 native
preparation/check, generated-only M2 promotion, exact-M2 Verify, protected
provider/preservation checks and a live owner PTR before it can be called
shipped.

## QR authentication continuation — 27 September 2026, 21:50 UTC

The owner reported a fresh phone QR scan and confirmed successful browser login.
The conversation clock was read at **21:50:52 UTC** immediately after that
report. The scan and exchange have no accompanying Worker trace, exact request
time, browser identity or served build hash, so this is recorded as owner
confirmation, not as an independently timestamped exchange. The prior
failure's route timestamps, RPC edge probes, secret-only repair and causal
confidence are detailed in the [QR incident record](../../evidence/0.4.0/qr-auth-incident-2026-09-27.md).

At the start of this continuation, local `fix/g001-census-admission-proxy`
matched its GitHub branch at `18935876b9bf1f3f655b9aaefec7de06f58b5d49` and
was clean. PR #374 remained open against `main` at `786c0b2b`. Exact-head
[Verify run 36352639028](https://github.com/ael-dev3/Warpkeep/actions/runs/36352639028)
started at 21:41:20 UTC; all 17 jobs failed before any step ran. GitHub's
annotation explicitly says recent account payments failed or the Actions
spending limit must increase. This is an account-level runner allocation gate,
not a source verdict. Do not bypass PR verification or send untrusted PR code to
the production-admin self-hosted runner. The current 0.4 source still needs a
passing exact-head Verify, reviewed main integration and a live owner PTR before
it can be called shipped.

## Prior checkpoint — 27 September 2026, 21:39 UTC

The open [PR #374](https://github.com/ael-dev3/Warpkeep/pull/374) is on
`fix/g001-census-admission-proxy`. Its latest gameplay/runtime source change is
[`66a9724a`](https://github.com/ael-dev3/Warpkeep/commit/66a9724ae9c1e7dc16b01b5227a491415855305b).
The Windows checkout and pushed GitHub ref matched at
[`8dd3904b`](https://github.com/ael-dev3/Warpkeep/commit/8dd3904b5ffd70e2f81e5a730b281d97b53f4a4b)
before this checkpoint's test correction and evidence update. The latest
completed exact-head [Verify 36349486249](https://github.com/ael-dev3/Warpkeep/actions/runs/36349486249)
on that source failed all 17 jobs before any job step ran. GitHub's failure annotation says
recent account payments failed or the spending limit needs to increase. This
run provides no source verdict. Do not call 0.4 shipped; the owner's playable
PTR remains outstanding. Restore Actions billing in GitHub's **Billing & plans**,
then require fresh successful Verify on the exact final PR head and exact merged
main head.

After another fresh scan, the owner reported successful sign-in at the
**20:56:33 UTC conversation-clock observation**. The exact exchange time,
browser and served build hash were not provided. This is an owner confirmation,
not a new Worker trace; the full failure diagnosis and timestamp limits are in
the [QR incident record](../../evidence/0.4.0/qr-auth-incident-2026-09-27.md).

Local checks on this Windows host found and corrected one real test assumption:
the reviewed menu closure removes obsolete title-screen files, so the complete
current prepared manifest is 259,978 bytes, below the former 256 KiB limit and
inside the current 512 KiB cap. The outdated assertion claiming the current
family was above that old limit was removed; full canonical parsing, inventory,
cap and digest assertions remain. On the available Node 22.23.2 runtime, the
owning closure-derivation test now passes 24 tests (2 skipped), and the auth
configuration, QR-panel and responsive-menu tests pass 69/69. The full
production build, typecheck, asset checks, production exclusions, public
boundary and Mini App integrity checks also pass. The available npm is 12.0.2,
outside the repository's declared npm 10.9.8 line, so these are local checks,
not exact pinned-toolchain acceptance.

The broad local Vitest run on this Windows filesystem is not a Linux CI result:
it reports POSIX-only failures for `/usr/bin/git`, `/bin/sh`, owner-only
directory modes and symlinks, and an earlier unsharded run under unsupported
Node 24.19.0 hit the worker heap limit. The Windows failures do not override the
focused passes, but the full Linux Verify remains necessary once GitHub can
allocate its hosted jobs.

Reviewing the current built menu found its secondary tagline crossed the
primary action in the 844×390 landscape screenshot. Signed source `66a9724a`
hides only that tagline at widths of 600px or more and heights of 420px or less
in landscape. A production-dist Chrome 154 capture at 844×390, 667×375,
568×320 and 390×844 confirmed the three menu actions, 44px action/link targets,
community link and WebGL canvas remained present, with no horizontal overflow
or title-to-primary-action collision. The tagline remains visible at 568×320
and in portrait. The responsive suite passed 13/13 and the production build
and asset/boundary checks passed on code head `66a9724a`. Pinned Gitleaks 8.30.1
found no leaks in the two exact outgoing commits, `5fad7332..66a9724a` and
`66a9724a..9926f139`. This is local synthetic-browser evidence; it is not a
physical-phone test or 0.4 PTR acceptance.

The pre-0.4 Alpha 0.3.43 site remains online at
[`warpkeep.com`](https://warpkeep.com/) through the public, generated-assets-only
[`Warpkeep-Live`](https://github.com/ael-dev3/Warpkeep-Live) repository. The
latest signed public head [`b6afe92`](https://github.com/ael-dev3/Warpkeep-Live/commit/b6afe92e7b09197b1578d992103ac3c8f916d8ad)
passed [Pages build 36343178620](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36343178620).
Live root, SPA fallback, owner canary and main asset matched the reviewed Alpha
build from signed source
[`5f77c3ce`](https://github.com/ael-dev3/Warpkeep/commit/5f77c3cec555823fd52b73c90080032867fc2ed4).
The deployed Alpha preserves the bounded QR clock-lag repair and distinguishes
privacy-safe QR failure classes. The owner QR sign-in succeeded at
2026-09-27 19:06:14 UTC, before this new public build deployed; the sanitized
bridge trace confirms session creation, but no frontend build hash was captured
for that exact browser attempt.

The owner's fresh phone-approved QR scan was traced through a sanitized Worker
tail under **`warpkeep-production`**: challenge HTTP 201, followed by three
exchange HTTP 503 responses after browser-binding verification. The route never
reached `auth_epoch_resolved`, so Maincloud admission was not the cause of this
failure. A disposable, syntactically valid but unauthorized SIWF proof also got
a fast 503. From this Windows host, both expected RPCs accepted registry reads;
a temporary Cloudflare edge preview instead saw dRPC return HTTP 429 repeatedly,
while PublicNode and `https://mainnet.optimism.io/` returned valid registry
reads. The preview had no production routes, bindings or secrets and was stopped.
This is strong evidence that the primary RPC path was rate-limited at the edge.

To restore the existing two-provider verifier without changing Worker code,
production version `2b28a266-862b-45da-a747-3cea0a0d858c` replaced only the
`FARCASTER_RPC_URL` secret with the tested OP Mainnet public endpoint and was
deployed at 100% by deployment `b338c098-a33e-4922-a3a4-1c2d92a3b035`.
The candidate retained the prior script etag, runtime, all 27 binding names and
types, and all plain-text binding values. The prior version
`79dfceec-9810-4868-afca-5b794d08a9a5` is the rollback target. Live health
and public attestation still pass with bridge source `308f901d`. After the
switch, the same disposable unauthorized proof got challenge HTTP 201 and
exchange HTTP 401 with binding verification, the expected fail-closed result;
this proves the verifier executed but did not by itself prove an owner session.
The owner's next live attempt did: challenge HTTP 201 and exchange HTTP 200 at
2026-09-27 19:06:14.479 UTC with `exchange_binding_verified`,
`auth_epoch_resolved`, `session_created` and `exchange_succeeded`. The owner
confirmed the browser was logged in. Record only route/status/fixed event
labels; never channel tokens, FIDs or proof. Private RPC-role fingerprint
attestation still needs the existing operator credential; it was not available
in this environment. The signed Alpha diagnostic source passed 129 focused
auth tests, production build, Pages configuration/release validators, Mini App
release validator and file-size policy. A separate Mini App Quick Auth success
is not desktop QR evidence. The
[hosting record](../../operations/0.4.0-infra-access.md#existing-alpha-frontend-restored)
has the source, verification and recovery path. The 0.4 PTR is not live.

Read the live head of signed 0.4
[PR #374](https://github.com/ael-dev3/Warpkeep/pull/374) before any operation;
documentation checkpoints may follow its protected-closure source. The signed
protected-source checkpoint is
[`175e3257`](https://github.com/ael-dev3/Warpkeep/commit/175e325771768d8427bedeff8280a9cb2a9de282),
and its signed, pushed 16-output closure is
[`6b9bcb1f`](https://github.com/ael-dev3/Warpkeep/commit/6b9bcb1f6bf27fa70d7870b4b0eb074a7f698242).
The 1,241-member closure manifest hashes to
`26f7a57e406fc239f6d7b42222d92293ca4402e83d863fba1de05b51be898f2e`.
Protected-closure derivation matched 3,285 raw Git blobs and independently
byte-reproduced all 16 derived outputs. Native Linux ownership-bound closure
policy and checked-in sealed-launch verification passed on the exact clean
closure head. These source checks do not attest a generated M2 family or a
live 0.4 deployment.

The reviewed 0.4 menu was integrated into PR #374 at signed merge
[`397b9697`](https://github.com/ael-dev3/Warpkeep/commit/397b9697),
with the loaded media in the presentation receipt and its reachable menu
graph in the release tests. Follow-up signed fixes preserve glTF-authored
double-sided materials and pause WebGL animation behind full-screen overlays.
The notification receipt fixture now accommodates the reviewed menu assets
without changing the production per-asset bound. The packaged version still
comes from `package.json` (`0.3.43`); coordinate its 0.4 change with actual
PTR/release cutover. The original
[menu PR #375](https://github.com/ael-dev3/Warpkeep/pull/375) remains open as
the source of the reviewed work; do not merge its stale closure into `main`.
Asset provenance [PR #37](https://github.com/ael-dev3/Warpkeep-Assets/pull/37)
also remains open.

The 0.4 QR diagnostic correction, backported to live Alpha, distinguishes
privacy-safe bridge failures and uses a neutral error heading. The
[timestamped incident record](../../evidence/0.4.0/qr-auth-incident-2026-09-27.md)
records strong evidence linking the failed 503 exchanges to the rate-limited
primary RPC path and documents
the secret-only bridge repair. A fresh owner scan reached exchange HTTP 200
with `session_created` at **2026-09-27 19:06:14.479 UTC**; the owner confirmed
login. The separately published Alpha diagnostic frontend came later and did
not cause that successful exchange.

The local and GitHub PR branch were clean and synchronized at signed head
[`6733620d`](https://github.com/ael-dev3/Warpkeep/commit/6733620d2335e317aa221b56ef20866ecf5d11bd)
when this follow-up began. The signed documentation update `9f43f0dd` had been
pushed and confirmed remote-equal; this follow-up advances the branch again.
Closure-head Verify 36345079867, documentation-head Verify
36345736413 and latest [Verify 36347362794](https://github.com/ael-dev3/Warpkeep/actions/runs/36347362794)
each stopped all 17 jobs before runner steps. The latest exact-head annotation
says recent account payments failed or the Actions spending limit must increase.
This is neither a source failure nor a pass. `main` remains the earlier signed
M2 `786c0b2b`.
Restore account billing, then require a passing hosted Verify on the live final
PR head before signed source M1 merge; prepare/check exact M1 natively, promote
generated-only M2, verify its exact main head and complete the protected live
gates before 0.4 PTR.

The Desktop daily action brief is now tracked at
[`next-work.txt`](next-work.txt). Update that canonical repo copy and the
existing Desktop companion together; do not create Desktop duplicates. The
existing Desktop copy was refreshed in place and its SHA-256 matches the
tracked copy (`a7629d0c9b4c4826d304623dcf197753d6cf938a9b2b1c439068f32157a418d`).

### Rendered QA compatibility note — 27 September 2026

The legacy `qa:title-transition` browser run at **20:07:24.870 UTC** timed out
at `owner-full-hd-half-renderer-repeated-gateway-ready`. Its initial-route
predicate still requires the retired title screen, title gateway and title
canvas, while the current app intentionally starts at `#menu`. This run is not
evidence that the integrated menu failed to render and is not current menu
visual acceptance. Keep it out of the release verdict until its contract is
retargeted to a live 0.4 transition; use the existing menu/resource lifecycle
and production-render evidence meanwhile. The failed probe left an empty
ignored artifact directory, not a tracked build output.

The same pinned Node 22 Windows run also executed `WarpkeepExperience.test.tsx`,
`menuWorldResourceLifecycle.test.tsx` and `titleTransitionFrameBrowserProbe.test.ts`:
26 tests passed. One probe-server test could not execute its symlink rejection
case because Windows returned `EPERM` while creating the test symlink
(`2026-09-27 20:12:49 UTC` run start). Treat that single case as environment-
limited; the other tests do not replace final-head hosted Verify.

### Earlier 27 September QR-diagnostic closure (superseded)

Before menu integration, signed source `1ef66c94` and closure `7d13a4a2`
held 16 derived outputs and 1,258 members (manifest
`afcbba80fda34b4a14908224092228429f5c26dd19dbd8ff5af4a5ae2f676566`).
Its native closure policy and checked-in sealed-launch checks passed; hosted
[Verify 36340576287](https://github.com/ael-dev3/Warpkeep/actions/runs/36340576287)
stopped before runner steps at the account billing gate. This checkpoint did
not include the reviewed menu and is not the current source closure.

### Earlier 27 September source checkpoint

At this earlier checkpoint, the 0.4 development [PR #374](https://github.com/ael-dev3/Warpkeep/pull/374)
has a signed, remote-equal protected-closure checkpoint at
[`a0cd382b`](https://github.com/ael-dev3/Warpkeep/commit/a0cd382bb599ba10402e52b62f6412c77f670644),
refrozen from signed source
[`4855890e`](https://github.com/ael-dev3/Warpkeep/commit/4855890e8088ad0b34cd001d8da675f2fdb9251a).
The committed 1,258-member closure manifest has SHA-256
`7852979eaac799f096abc714aa84aa2a7c3cceedbf3e086b4250da9af47ec53a`.
The exact-source native refreeze matched 3,266 Git blobs, regenerated all 16
outputs, and passed the independent 1,258-member policy and clean checked-in
sealed verifier on both Linux and Windows. The current source preserves the
earlier Keep guidance and QR clock repair; it also makes construction progress
visible above the first mobile fold and bounds public Realm resource-site reads
with a retry that keeps keyboard focus. The 98 combined affected tests,
typecheck and full production build passed locally. This improves the first
journey in source; it does not prove actual owner play or physical-phone
performance.

The earlier exact-head
[Verify 36326796457](https://github.com/ael-dev3/Warpkeep/actions/runs/36326796457)
failed all 17 jobs before any step ran. GitHub's job annotation cites recent
failed payments or the spending limit. This is an account gate, not a source
test failure or a CI pass. Require a successful Verify on the final PR head
before protected-main M1 integration, then exact-M1 native preparation/check,
generated-only M2, exact-main Verify and authenticated deployment. Current
`main` remains the earlier `786c0b2b` M2. The public Alpha hotfix is a separate
build; 0.4 owner PTR is not live. The latest closure head still needs its own
successful hosted Verify; do not reuse the earlier zero-step run as evidence.
[Verify 36330429158](https://github.com/ael-dev3/Warpkeep/actions/runs/36330429158)
on subsequent signed documentation head `0e1fcedd` also stopped all 17 jobs
before any step with the same billing annotation. A passing Verify on the
eventual final PR head remains absent.

### Earlier 27 September source checkpoints

An earlier signed protected source/closure checkpoint on PR #374 was
[`46b4c3b7`](https://github.com/ael-dev3/Warpkeep/commit/46b4c3b7c969460ad6f231d53d311c7ac9eb9e56),
refrozen from signed source
[`aaa128bb`](https://github.com/ael-dev3/Warpkeep/commit/aaa128bb41a1fda853a9d5c11983c06dfbac83ca)
for the public-mirror-candidate lane. Its
[Verify 36319626894](https://github.com/ael-dev3/Warpkeep/actions/runs/36319626894)
failed before the later source and closure refresh.

An earlier signed source/closure checkpoint on PR #374 is
[`89a29c01`](https://github.com/ael-dev3/Warpkeep/commit/89a29c01e597c5fb677611b9dfe047715cb4eb73),
from signed source [`a82cb0c9`](https://github.com/ael-dev3/Warpkeep/commit/a82cb0c9408f768516eada7b8eb22db219bd2793).
World initial/refresh reads now expose Retry after a bounded 30-second stall;
late intermediate phases cannot hide it, the last validated map stays visible,
and Worker commands require fresh authority. The parent Realm status no longer
claims a retained map is absent. The public Pages payload verifier rejects
index-hidden source drift. A read-only public-mirror planner checks exact clean
source/build and the existing public checkout, and inventories only reviewed
generated output, hosting files and current-source attribution documents. It
does not stage, publish or authorize 0.4. The 90 focused World/Realm/PTR tests,
17 payload/mirror tests, typecheck, root-base production build, checked-in
sealed-launch check, outgoing secret scan and signed remote readback passed.
The real source build passed payload `--write`/`--check` and a plan against the
clean `Warpkeep-Live@616eebfc` checkout: 381 target files and 26 obsolete old
generated paths. The disposable local manifest was removed; no public repo
mutation occurred. Native Linux matched all 3,261 source blobs, independently
regenerated all 16 closure outputs and passed the 1,258-member policy.
[PR #374](https://github.com/ael-dev3/Warpkeep/pull/374) now stages a
`public-mirror-candidate` lane for activated 0.4 bindings. After a successful
exact-main Verify, the contents-read build validates the sealed binding, PTR
inputs, canonical/auth configuration, admission suspension and generated public
payload. It requires shared Alpha access for owner sign-in. It neither uploads
nor deploys Pages and does not change `Warpkeep-Live`; signed publication,
live-byte postflight and owner PTR remain separate release work. This lane is
source-level preparation: its closure was refreshed at `46b4c3b7` at that
checkpoint. The later refreeze at `4df24928` still lacks a passing final-head hosted Verify.
[Verify 36318043715](https://github.com/ael-dev3/Warpkeep/actions/runs/36318043715)
on that closure head rejected all 17 jobs before runner start. GitHub's billing
page shows the Actions budget at $0 with stop usage enabled and says a valid
payment method is missing. Owner action is pending; no merge or PTR deployment
is justified by local checks.

An earlier signed source/closure checkpoint on PR #374 was
[`24c90daa`](https://github.com/ael-dev3/Warpkeep/commit/24c90daa9b92aa84e2c0322e226119d115b4c120).
The Greater Realm now explains an initial or refresh failure, offers a reachable
mobile retry, retains the last verified map during refresh failure and disables
stale recall commands until a current read succeeds. A standalone candidate
verifier checks that an exact clean source build contains only reviewed public
static paths and that its embedded source SHA is reachable from the root page;
it writes a deterministic file-hash manifest outside `dist`. It does not publish
or authorize 0.4. The 70 combined focused World/PTR/payload tests, typecheck,
root-base production build, checked-in sealed-launch check, outgoing secret scan
and signed remote readback passed. A real local build from this exact head
passed payload manifest `--write`/`--check` with 366 files and 124,852,956 bytes;
the disposable manifest was removed. Clean native Linux passed the eight
payload tests, checked-in sealed-launch and the 1,258-member closure policy.
The changed World and CSS protected members were independently refrozen from
raw Git blobs; all 16 derived outputs matched. These are local/preparatory
checks, not actual owner PTR or live deployment acceptance.
[Verify 36315983892](https://github.com/ael-dev3/Warpkeep/actions/runs/36315983892)
on that head again rejected all 17 jobs before runner start with the account
payment/spending-limit annotation. Do not merge under the release gate.

An earlier signed source/closure checkpoint on PR #374 is
[`8ef5f510`](https://github.com/ael-dev3/Warpkeep/commit/8ef5f510a086d6b7e64623080d8b440937ac93cf).
It keeps unchanged Keep polls from reconciling the 3D scene and allows panel
navigation against the retained validated view while a refresh or command is
pending; mutation gates remain closed in those phases. The affected 128 UI
tests, root typecheck, production build, visual-foundation check and clean
checked-in sealed-launch verifier passed locally. The two changed protected
members were refrozen from raw Git blobs in a disposable Linux checkout:
1,258 closure members, all 16 derived outputs and the policy verifier matched.
This is local evidence, not hosted CI or actual owner PTR acceptance.
[Verify 36314339079](https://github.com/ael-dev3/Warpkeep/actions/runs/36314339079)
on that head rejected every job before runner start with the account
payment/spending-limit annotation; the PR cannot merge under the release gate.

The source repairs below and a first-session Keep cue correction are published
in [PR #374](https://github.com/ael-dev3/Warpkeep/pull/374). The untouched Keep
now marks Gather, matching its resource-journey action; a funded Keep can mark
Choose. The code was reviewed, its 41 focused UI tests, typecheck and production
build passed locally, and the clean checked-in sealed-launch check passed.
A later mobile countdown repair on signed PR head
[`1b115a9b`](https://github.com/ael-dev3/Warpkeep/commit/1b115a9b61c114610cb64ae09183fd9492b4c4e0)
stops unchanged Keep 3D content from rerendering each second. Its 138 focused
tests, typecheck, production build, source/closure rederivation and native
sealed-launch checks passed. Verify on that source/closure head
[Verify 36309210745](https://github.com/ael-dev3/Warpkeep/actions/runs/36309210745)
rejected all 17 jobs before runner start with the same account payment/limit
annotation, so this is not a CI pass.
A provider-free diagnostic at earlier signed PR head `a157e3a7` built and
reattested the real G002 artifact with the pinned Linux tools and locked cache.
An initial manual rerun at source head `1b115a9b` stopped at
`GREATER_REALM_PRODUCTION_MATERIALIZATION_CHANGED` from a shell with
`umask 0022`; the verifier requires the built `dist` directory to be `0700`.
Repeating the same provider-free test with `umask 077` in the launching shell,
as the production workflow does, passed: the pinned build exited 0, `dist` was
`0700`, its bundle was `0600`, and locked-source closure verification completed.
Both disposable diagnostic checkouts were removed; maintained native `main`
remains clean. No provider request or G002 mutation occurred. The successful
mode-correct rerun supports diagnostic-context drift over a source regression;
neither local test grants
protected-main release authority. The final PR head still needs full Verify.
Earlier Verify
[36299816585](https://github.com/ael-dev3/Warpkeep/actions/runs/36299816585)
passed 15 of 16 jobs; Linux alone failed `npm audit signatures` although the
lockfile and published attestation digests matched. The retry and later
[Verify 36304028415](https://github.com/ael-dev3/Warpkeep/actions/runs/36304028415)
were refused before runners started. GitHub reports an account payment or
spending-limit block; the account's Actions budget is $0 with usage stopped.
Restore GitHub-hosted runner availability in account billing, then require a
fully successful Verify on the live final PR head before merge. Do not route
untrusted PR checks to the persistent privileged production runner. The
private-repository Pages destination is also unavailable on the current Free
plan; the public artifact-only Pages site is a possible 0.4 delivery target only
after its sealed release path is implemented and reviewed. No live PTR
exists yet, and this checkpoint does not claim 0.4 shipped.

At the start of this repair, the last validated operational `main` was signed
generated-only M2
[`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`](https://github.com/ael-dev3/Warpkeep/commit/786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32),
tree `b6af76785f1cc37d2cfc6778a0b287f4ab0bd3fa`, merged through
[PR #373](https://github.com/ael-dev3/Warpkeep/pull/373). Its source-only M1
was [PR #372](https://github.com/ael-dev3/Warpkeep/pull/372), merged as signed
[`5d175edf25ee1555b27c8220844352fdbc4e99ff`](https://github.com/ael-dev3/Warpkeep/commit/5d175edf25ee1555b27c8220844352fdbc4e99ff),
tree `e7f36c6c35fa126025220e0b70865ff17a62a93f`. Native preparation and
independent check on that exact M1 succeeded: 3,256 source/candidate files,
102 generated outputs. Exact-M2 push
[Verify 36294403406](https://github.com/ael-dev3/Warpkeep/actions/runs/36294403406)
succeeded. CodeQL was removed after GitHub refused private-repository code
scanning on the current plan; Verify remains the executable source gate. Recheck
live `main` and its exact-head Verify before any operation; this dated SHA is
an evidence checkpoint, not a permanent ref pin.

Read-only [preflight 36297501189](https://github.com/ael-dev3/Warpkeep/actions/runs/36297501189)
and [G001 policy observation 36297585906](https://github.com/ael-dev3/Warpkeep/actions/runs/36297585906)
succeeded on this exact M2. Fresh
[G001 freeze census 36297722529](https://github.com/ael-dev3/Warpkeep/actions/runs/36297722529)
failed closed with the count-free `g001-admitted-set-mismatch` diagnostic. It
did not establish a two-sample baseline or authorize provider mutation. The
fallback code enumerated `player_v2`, which is absent until bootstrap even
for valid `admitted_needs_bootstrap` founders. A targeted source repair now
enumerates public `realm_profile_v1.fid`, created at admission, while requiring
the existing profile/founder aggregate witnesses and per-FID administrator
status. This identifies a code-path defect; it does not reveal or establish
the private live admitted set. Merge the reviewed source-only M1 only after
its successful final-head Verify, generate its exact M2 from native
preparation, require both exact-main Verify gates,
then use a fresh operation identity. Do not reuse the failed attempt or query
private `allowed_fid` with an unreviewed credential.

[G002 update inspect 36297899627](https://github.com/ael-dev3/Warpkeep/actions/runs/36297899627)
failed at `phase=workflow` before provider transport; it supplies no G002
update authority. An artifact-only reproduction in a temporary detached checkout
of this exact M2 returned `GENESIS_002_SOURCE_BUILD_FAILED`. The pinned
`spacetime build` exited 2 with TypeScript `TS2307` for `spacetimedb/server`
and `spacetimedb` imported by shared `spacetimedb/src/*`. The locked G002
builder installed the verified package tree only under
`spacetimedb/genesis002/node_modules`, which those parent source files cannot
resolve. The source repair stages the same pinned dependency closure at the
common `spacetimedb/node_modules` root and updates the G001 materializer and
G002 runtime worker to use that path for typecheck and build;
the closure snapshot, before/after verification and cleanup remain exact. The
temporary diagnostic checkout was removed without a provider request. The
source repair is in PR #374 with the census repair. Once that M1 is
exact protected main, repeat the provider-free artifact build, then prepare
and verify its exact M2 before a fresh `g002-update-inspect`. Neither the local
diagnostic nor the source change establishes a live G002 result. G001
preservation/readback, sealed G002, actual
owner PTR journey, physical-device and measured-performance acceptance,
release freeze and delivery remain open. The local rendered WebGL matrix is
local evidence rather than live PTR acceptance. `warpkeep.com` serves the old
Alpha 0.3.43 through a separate public artifact-only Pages repository; the
private repository's existing 0.4 Pages workflow still cannot deploy there.
Implement and verify that delivery boundary before calling owner PTR live.
PTR owner access is mandatory; public admissions are not. Keep scheduled
automations paused, create no Desktop artifacts, and publish each reviewed
development checkpoint with a signed commit and verified GitHub SHA.

## Historical checkpoint — earlier 27 September 2026 (superseded above)

Generated M2 [`007e62f2`](https://github.com/ael-dev3/Warpkeep/commit/007e62f2e5b7440abf483a83aeda2b9621f4054e)
from [PR #371](https://github.com/ael-dev3/Warpkeep/pull/371) had exact-main
[Verify 36279277148](https://github.com/ael-dev3/Warpkeep/actions/runs/36279277148)
time out in the loaded Linux root-test step. CodeQL
[36279277087](https://github.com/ael-dev3/Warpkeep/actions/runs/36279277087)
could not upload on the private-repository plan. Earlier
[G001 freeze census 36271994192](https://github.com/ael-dev3/Warpkeep/actions/runs/36271994192)
failed with the old combined `g001-admitted-aggregate-mismatch` diagnostic,
without a validated baseline or provider mutation. Preserve its private
incomplete attempt and the earlier incomplete
[36255794350](https://github.com/ael-dev3/Warpkeep/actions/runs/36255794350);
do not reuse identities or inspect private applicant/admitted rows.

---

## Historical checkpoint — 25 September 2026, 15:20 UTC (superseded above)

Protected `main` is source-only M1
[`4cd17383de6962ce521e8d61e3c63605dbe4efc0`](https://github.com/ael-dev3/Warpkeep/commit/4cd17383de6962ce521e8d61e3c63605dbe4efc0),
tree `e2dc6f9dab4d5d292b64396140419acce2d949dc`, merged through PR
[#362](https://github.com/ael-dev3/Warpkeep/pull/362). GitHub reports the
protected merge signature as valid. PR Verify
[run 36146960783](https://github.com/ael-dev3/Warpkeep/actions/runs/36146960783)
and CodeQL [run 36146960627](https://github.com/ael-dev3/Warpkeep/actions/runs/36146960627)
passed. Verify covered the full Linux tests/build, Auth Bridge and recovery
contracts, native production contracts, SpacetimeDB module/bindings and both
connected Greater Realm rehearsals. The exact-main push Verify
[run 36153303660](https://github.com/ael-dev3/Warpkeep/actions/runs/36153303660)
and CodeQL [run 36153303661](https://github.com/ael-dev3/Warpkeep/actions/runs/36153303661)
are running for `4cd17383`; require their success before native preparation.

The triggering read-only G001 policy attempt first hit
`SEALED_REALMS_LINUX_AMBIENT_OVERRIDE_INVALID` in run
[36143161024](https://github.com/ael-dev3/Warpkeep/actions/runs/36143161024).
A targeted same-source retry
[36143814712](https://github.com/ael-dev3/Warpkeep/actions/runs/36143814712)
completed. Census run
[36144181281](https://github.com/ael-dev3/Warpkeep/actions/runs/36144181281)
failed closed with `g001-policy-transport`; no validated census receipt was
created. The supported public Auth Bridge health endpoint returned HTTP 200,
and a fresh exact-source read-only policy observation
[36144753078](https://github.com/ael-dev3/Warpkeep/actions/runs/36144753078)
completed. Census retry
[36145018339](https://github.com/ael-dev3/Warpkeep/actions/runs/36145018339)
failed before the operator in the Node workflow phase; its bounded result does
not identify the underlying stage. Preserve all attempts;
do not inspect private census rows or reuse either census identity.

PR #362 removes the duplicate ambient-variable rejection from the five
post-checkout operation steps. It retains all five pre-checkout runner gates,
fixed absolute Git tools with `env -i`, and the last-moment explicit environment
allowlist before Node. Focused pinned WSL Node 22.22.3 tests passed 53/53; the
PR's full Linux, module, native-contract, Auth Bridge, recovery and CodeQL gates
also passed. No protected operation or census was repeated by this repair. The
Windows development checkout is synchronized to `4cd17383`; native WSL remains
clean and pinned at `7a598435` until exact-main checks pass.

After exact-main Verify/CodeQL pass, fast-forward the clean native WSL checkout
to that exact signed M1, then run `local-release-assembler.mjs prepare` and an
independent `check`. Promote only the authenticated generated family as
generated-only M2. Require exact-M2 Verify/CodeQL before protected preflight,
read-only policy observation and one new census identity. Do not run protected
operations on interim M1. Use the [known blocker recovery path](../../operations/0.4.0-infra-access.md#known-blockers-and-recovery-paths)
if a fixed safe diagnostic returns.

Initial 0.4 remains unshipped. It still requires provider deployment, accepted
G001 preservation/readback, sealed G002 evidence, actual owner PTR play, mobile
and measured-performance acceptance, release freeze and final delivery. Owner
PTR access is mandatory; public admissions/live servers are not. Keep scheduled
automations paused, create no Desktop artifacts, preserve private attempts and
use existing credentials/recovery material only.
---

## Historical checkpoint — 24 September 2026, 22:34 UTC (superseded above)

Protected `main` is generated-only M2 [`b7d729b0e8a58cf43870d0baafdf8d8da508fc99`](https://github.com/ael-dev3/Warpkeep/commit/b7d729b0e8a58cf43870d0baafdf8d8da508fc99),
merged through PR #354. Exact-main Verify [run 36053702873](https://github.com/ael-dev3/Warpkeep/actions/runs/36053702873),
CodeQL [run 36053702845](https://github.com/ael-dev3/Warpkeep/actions/runs/36053702845) and
read-only preflight [run 36059961456](https://github.com/ael-dev3/Warpkeep/actions/runs/36059961456)
passed. Read-only G001 policy observations [run 36060050219](https://github.com/ael-dev3/Warpkeep/actions/runs/36060050219)
and [run 36060910719](https://github.com/ael-dev3/Warpkeep/actions/runs/36060910719)
both failed closed with `g001-policy-budget`. The bounded token-budget inspector
succeeded, reconciled the expired reservation and reported available capacity;
one controlled exact-source retry returned the same generic diagnostic. Neither
observation produced a verified receipt. No census or provider mutation followed.
Do not retry this M2 again.

Source M1 repair [PR #355](https://github.com/ael-dev3/Warpkeep/pull/355) is on
`fix/g001-budget-diagnostics`. It retains fixed privacy-safe token-budget
failure categories across the child and native boundaries and updates the
recovery guide. The latest source commit classifies SIGINT/SIGTERM ledger
interruptions as the existing fixed `interrupted` category; the diagnostic
projection regression passes 52/52 on Windows and pinned WSL Node 22. The
focused Linux batch also passed 375 tests across 8 files (44 provider-only
tests skipped). On source checkpoint `9d70b0d2`, native WSL freshly derived
the complete 1,258-member M1 closure, and a separate process reproduced all 16
outputs byte-for-byte and passed the closure policy check. Its manifest digest
is `a7dc7d017465bcc958e05bffd0a76b471823dd1b3b90d5b91f7b634370bf870b`.
Generated closure commit `c75f22ee` includes that family. The clean checked-in
sealed-launch verifier passed on `c75f22ee` in preparation phase with
deployment disabled and no release identities. Windows and WSL checkouts are
clean and synchronized at this branch head. Require fresh protected checks on
the PR's final documentation head; do not rely on a prior run or merge before
all final checks are green. The local preparation runbook now points back to
this checkpoint and labels earlier preparation evidence as superseded by the
current G001 repair.

After PR #355 merges, verify its signed main commit and tree, synchronize the
clean WSL ext4 operating checkout to that exact M1, and run native `prepare`
plus independent `check`. Promote only that authenticated generated family in
a generated-only M2. On exact M2, wait for push-to-main Verify and CodeQL, then
run protected preflight and one fresh read-only G001 policy observation. Follow
any returned fixed subcategory in the [access guide](../../operations/0.4.0-infra-access.md#known-blockers-and-recovery-paths);
do not inspect raw ledger state, hand-edit files, or count a failed run as a
receipt. Do not run protected operations against interim M1.

Initial 0.4 still requires the existing PTR target to become genuinely
accessible to its owner; public admissions and admission realms are not
required. Deployment, G001 preservation/readback, sealed G002 evidence, actual
owner journey, mobile and measured performance acceptance, release freeze and
final delivery remain open. Keep scheduled automations paused, create no
Desktop artifacts, preserve private attempts, and use existing credentials and
recovery material only; do not generate another GitHub App or recovery key.

---

## Historical checkpoint — 24 September 2026, 11:30 UTC (superseded above)

Protected `main` is M4 [`260f8a7a2b87d618a6a837a4fb480f1ee65a5bbb`](https://github.com/ael-dev3/Warpkeep/commit/260f8a7a2b87d618a6a837a4fb480f1ee65a5bbb),
tree `7469c69e4742217667b265dc35b70f495240b0f9`, merged through PR #350.
Exact-main Verify `35984587229`, CodeQL `35984587328` and preflight
`35990115518` passed. PTR update inspection `35990190731` failed at workflow
authority; PTR state inspection `35992596131` failed during its read-only
operation. Both expose only generic bounded phases; neither establishes live
realm state. Preserve their private attempt records. No gameplay database write
was requested by either inspection.

The supported prepared-bridge deploy `35993390680` stopped before its first
Cloudflare write at `AUTH_BRIDGE_PREPARED_TOOLCHAIN_DIGEST_MISMATCH`. The exact
M4 Actions checkout passed source checks; frozen Linux dependency installation
passed lockfile policy. The pinned Node 22.22.3 toolchain candidate was
repeatable, with the same lockfile digest, package counts and byte totals as its
manifest. Only the resolver-namespace and installed-tree digests were stale.
The regenerated Linux toolchain manifest is the sole source edit on branch
`fix/prepared-bridge-linux-toolchain-manifest`; source-closure derivation,
review and protected M1/M2 integration remain. Do not retry the failed M4 run.

The selected production Cloudflare account still has `warpkeep-auth-bridge`, but
read-only inventory returned Worker-not-found for both
`warpkeep-release-recovery-signer` and `warpkeep-release-recovery-gateway`.
The existing PTR target is to be preserved and updated through the existing
realm path. Initial 0.4 needs real owner access to PTR; public admissions and
admission realms are not a shipping requirement. Do not create another PTR
database or ask for a GitHub App PEM/new recovery key.

Next: finish and review the manifest/closure M1, merge it with required checks,
run native prepare and independent check on that exact M1, then promote its
generated-only M2. On exact M2, require Verify, CodeQL and preflight; rerun the
prepared preserving bridge deployment, then deploy the disabled preparation
signer and gateway with the existing signing and RPC material. Re-establish
signed PTR state, perform the supported preserved-realm update/adoption, and
complete owner, mobile and performance acceptance before claiming 0.4 shipped.
Keep scheduled tasks paused and create no Desktop artifacts.

## Prior checkpoint — 24 September 2026 (superseded by the readbacks above)

Protected `main` is generated-only M2 commit
[`5f5b36813f31d37436feb83573d882105ec0c83f`](https://github.com/ael-dev3/Warpkeep/commit/5f5b36813f31d37436feb83573d882105ec0c83f)
(tree `7e974ae138b528c620c10617fcd065d06dc4a8f8`), promoted from source M1
`255e3332fa8cedbcbd7c2bd959fd6ffd345c2876` through [PR #348](https://github.com/ael-dev3/Warpkeep/pull/348).
GitHub reports the squash commit signature as verified. Exact-main Verify
[run 35957030936](https://github.com/ael-dev3/Warpkeep/actions/runs/35957030936)
and CodeQL [run 35957030943](https://github.com/ael-dev3/Warpkeep/actions/runs/35957030943)
passed. Read-only preflight [run 35961074540](https://github.com/ael-dev3/Warpkeep/actions/runs/35961074540)
and fresh G001 policy observation
[run 35961181929](https://github.com/ael-dev3/Warpkeep/actions/runs/35961181929)
also passed from this exact source.

The subsequent read-only G001 freeze census
[run 35961418087](https://github.com/ael-dev3/Warpkeep/actions/runs/35961418087)
failed in `operate_readonly` with safe diagnostic `g001-admitted-collection`.
Every mutation lane was skipped; no provider mutation or downstream census work
followed. This is not a completed receipt. Leave this private attempt and all
historical attempts unchanged; never inspect, copy, or reuse applicant data.
The failure does not establish the underlying provider or admitted-player cause.

Source review found that the shared serialized transport boundary normalized
an already-allowlisted G001 callback diagnostic into a generic transport error
before the census stage projector could retain it. The actual stage inside
admitted collection remains unknown. A narrow source repair is in progress on
`fix/g001-preserve-census-diagnostic`: it preserves only the existing fixed
diagnostic across the generic boundary error while retaining failed-connection
invalidation and private-message redaction. On the Windows host, the focused
G001 suites passed 101 tests, the related serialized-session tests passed 2,
and TypeScript build-mode typecheck passed. These local checks do not identify
the underlying census cause and are not hosted acceptance. The repair and
current notes must pass review and protected CI before another operational run.

Put the scoped source-and-note repair through a signed PR from exact M2, require
hosted protection checks, and merge only the reviewed head. On its resulting
exact main SHA, require Verify and CodeQL, then run native `prepare`
and independent `check` for that M1 source. Promote only the authenticated,
complete generated family. On the resulting M2, require exact-main Verify and
CodeQL, then run preflight and a fresh read-only G001 policy observation. Start
a **new** census attempt only after that observation succeeds; do not retry or
reuse run `35961418087`. If census still fails, use only its fixed stage
diagnostic to repair source and repeat the signed, protected source/generated
sequence before another run.

0.4 is not shipped. Accepted G001 preservation/readback, sealed G002 and
owner-only PTR evidence, provider deployment and recovery, actual-owner
gameplay, physical-device and measured performance acceptance, final release
freeze, live hosting verification and final workspace delivery remain open.
Keep scheduled sync automation paused, create no Desktop artifacts or backups,
retain private attempts, and use the existing recovery/bootstrap path; no
additional GitHub App key is needed. Use the [release checklist](../../operations/0.4.0-release-checklist.md),
[access guide](../../operations/0.4.0-infra-access.md) and
[source synchronization procedure](../../operations/0.4.0-development-sync.md) as the
current route. Resolve live refs before each operation.

## Reliability follow-up — 21 September 2026 (historical)

The owner requested prevention of repeat blockers and maintenance only, with no
new features. Continue on PR #324's existing branch. Its source was synchronized
at `6ddfc026` when this review began; resolve the live head rather than using that
snapshot for an operation. Auto-merge was disabled during the follow-up so the
reviewed source can be completed before integration.

The [known blocker recovery paths](../../operations/0.4.0-infra-access.md#known-blockers-and-recovery-paths)
now map the observed symptoms to their owning repair and confirmation. Both
existing Desktop handoff files were updated in place with these routes and
current local paths. Their corrupt historical suffixes were preserved exactly
and remain historical. No new Desktop output or scheduled task was created.

Fresh review of real GitHub Pages records found that successful deployment
history includes multiple statuses and actor-attributed metadata. The earlier
reader's single-status/bot-only fixture could reject a legitimate completion.
Skipped jobs can also have reversed metadata timestamps, and a skipped deploy
step can have equal non-null timestamps. The reader now handles these observed
formats while retaining original candidate/job/environment correlation, bounded
status history, newest-success proof and canonical live attestation. Unrelated
scheduler-only skipped jobs get at most one second of rounding tolerance; the
original deployment job remains strict. A skipped deploy step with a nonzero
execution interval does not establish that no deployment occurred.

The claim caller also allocated an attempt directory before contacting the
signer; failure before a claim returned could leave an empty directory that
blocks every rerun. The follow-up defers allocation until an authenticated claim
returns, retaining a nonmutating filesystem preflight before network work.
A lost claim response or crash before receipt persistence still leaves genuine
remote ambiguity. Do not delete an old empty attempt or create a new claim to
assume that away; retain evidence and investigate the original operation.

Both patches passed independent cross-review. The complete recovery-service
unit suite passed 1,461 cases with five platform skips; root retry/handoff suites
passed 185 with eleven Windows skips, and compiled-module build/native-Node
import checks passed eight. Root build-mode types and both service type projects
passed. The five affected note files had 122 local links checked. At published
source `0cfef2e6`, the eight affected suites passed 203 cases on native Linux,
with one deliberate platform skip. The complete source closure was then derived
on native Linux and copied as exact generated bytes. Required hosted checks and
live acceptance remain separate; restore auto-merge only for the final reviewed
head with those required checks enforced.

The production claim caller is a compiled bundle. Its TypeScript repair must be
rebuilt through `local-release-assembler.mjs prepare` and independent `check` on
merged M1, then promoted with the generated M2 family. Updating the source-only
closure does not rebuild this bundle. The accepted prepared baseline, live
service state and M1/M2 requirements below are unchanged by these local results.

## Previous unblocking work — 21 September 2026 (historical)

**Current owner direction: no additional recovery keys.** The App-key download
path is no longer a prerequisite. The owner completed GitHub Mobile confirmation,
and App `4995046` was visible. An additional App key was generated before this
direction, but no PEM was recovered or provisioned; do not generate another or
repeat that request. The source follow-up uses the existing Actions job token
for transient GitHub evidence reads after signed OIDC validation, while reusing
the existing recovery signing key. Read the canonical
[bootstrap workflow](../../operations/0.4.0-recovery-bootstrap.md#no-additional-recovery-keys).

PR #324 initially published the detached-reader repair at `a230507c`. Subsequent
source work also removes the App-key prerequisite and repairs the prepared
bridge shell. Bridge workflow `35595876032` failed during shell parsing in
`Re-attest detached source and Linux closure pins`, before provider credentials
or calls. Three array-expansion quotes were missing. A regression now parses
every shell step with Bash. These repairs still need protected CI, generated
family preparation and live acceptance; do not report them as deployed.
The keyless source covers gateway, request-local credential selection,
OIDC/evidence validation and conservative ledger reconciliation. The explicit
earlier-attempt caller is now implemented: rerunning the same Pages run verifies
its retained signed claim and reconciles the original attempt before any build,
upload, claim or deployment. A resolved terminal skips deployment; ambiguous or
invalid evidence stops. No new claim is issued from the resume path. Real GitHub
run metadata is accepted with correlated repository, actor, attempt and log URLs.
The actual Worker RPC composition passes without App credentials. These are
source/test results; hosted acceptance and deployment remain outstanding.

Development branch: `codex/0.4-fix-native-g001-source-attestation` in the
maintained Windows checkout. The last accepted generated-family main is
`0ea473caa6634f96f828cdb5860d1cffad79a783` (PR #323), following source repair
PR #322 at `1fd0f1e636bdeb5aada9ce719a427baed3b14242`. Main Verify
`35577074726` and exact preflight `35582135678` passed. Native prepare and
independent check produced candidate `release-workspace-5bc40af94e7a293bf2b37b47a6619e33`,
family `f8a0c2bc35e8b037bc1ba104c50d87570507d58ef5aecb795827fef8d621ae98`
and closure `5e7853fda90b8a2763f664a99d748088f3e7d03603e85cd04cd3ee0d6db51f9d`.
`finalReleasePrepared:false`; these are preparation results, not deployment.

Census runs `35582210656` and `35582701454` failed at `g001-observation`.
Their attempt directories contained no census samples. Their duration does not
prove they reached the stability interval. The native operator invoked an older
source checker that requires a named `main` branch, but Actions checks out the
verified main SHA detached. That check runs before session creation. Both native
G001 readers now use the existing Linux source boundary, preserving clean bytes,
matching `origin/main` and operator checks. Descriptor regression tests cover
rejection before transport and successful progression to observation. The real,
clean detached Actions checkout also passed the boundary for both operator kinds.

The earlier claim that `INVALID_ISSUER` from a publisher CLI admin call proved
stale publisher login was incorrect. Application administration uses the
Warpkeep auth bridge issuer, not the publisher token. The Linux publisher was
restored through the already authenticated browser; its owner and all three
immutable realm identities match. No owner login action is currently required.
See the [access guide](../../operations/0.4.0-infra-access.md) before diagnosing
another credential issue. No live census or provider mutation is claimed here.

Next: publish and integrate this source repair, prepare/check its exact protected
M1 source, promote generated M2, wait for exact main Verify, then repeat preflight
and `g001-freeze-census`. Continue the prepared bridge, disabled signer/gateway,
realm preservation/readback and owner/device acceptance from genuine results.
Keep scheduled automation paused and create no Desktop output. The records below
are historical and must not override this checkpoint or freshly resolved refs.

## Shipping reliability audit — 20 September 2026

Active work: `codex/0.4-shipping-reliability-audit`, in the maintained Windows
development checkout. PR #311 passed all checks and merged as `9806187a`.
The operationally verified source below remains `5870717b`; the docs merge is
not a new provider acceptance result. Resolve the live ref before dispatch.

Fresh access checks confirmed the GitHub account, online Linux runner, correct
SpacetimeDB publisher and all three immutable realm identities. Cloudflare's
production profile reads the live B0 bridge version `79dfceec-9810-4868-afca-5b794d08a9a5`;
the recovery signer Worker is absent (provider code 10007). The protected
environment contains the expected admin/bridge secret names. Their presence
does not establish successful authenticated observation.

The earlier diagnosis that all remaining failures require owner-supplied private
state was too broad. This audit found an agent-owned build defect: the native
G001 materializer looked for SDK/compiler dependencies in `spacetimedb/node_modules`,
but its Genesis 002 builder installs them in `spacetimedb/genesis002/node_modules`.
The correction used the owning module at that checkpoint; the current repair
changes the builder itself to install at the common parent for shared source
imports. Read-only census run `35499384780` failed
at `workflow` before this repair; no successful census or provider mutation is
claimed. The private build roots exist with the required ownership and modes.

The installed Actions checkout also contains `gc.auto=0`, while the production
Git-context validator rejected that key. A real native repository regression
reproduced the rejection and now passes with absence-or-single-canonical-zero
support. Other configuration restrictions and before/after source attestation
are unchanged. This is another source compatibility defect, not a login failure;
the old generic workflow result does not establish which prerequisite failed first.

`g001-current-state` is a legacy macOS admission-monitor inspection. PR #309
wired only its outer Linux route; the workflow-evidence map still rejects it,
and its operator requires Darwin/LaunchAgents. The Linux workflow now offers
only implemented Linux operations. Use `g001-freeze-census` for native freeze
and current-state evidence; do not reinterpret a Mac monitor receipt.

The player reliability repair bounds unanswered gameplay calls to 30 seconds,
retains exact mutation identity for explicit retry, and ignores late responses.
Worker previews now distinguish gathering after arrival from the full trip and
make resource availability depend on the confirmed return. No new mechanics.
The Linux failure output now identifies fixed native G001 preparation/execution
stages without exposing raw errors, credentials or private records.

Verification before publication: capability/controller/connection suites passed
147 cases; workflow/preflight/preview suites passed 75, with 82 native-only skips;
closure/materializer/lifecycle suites passed 56. Both TypeScript projects and the
production Vite build passed. Synthetic browser review at 390×844 and 568×320
confirmed catalog/Worker navigation, focus return, no horizontal overflow and the
graphics fallback; these are browser checks, not physical-device or owner play.
The diagnostic/materializer follow-up passed 91 tests, with 44 privileged native
cases skipped; final build-mode TypeScript checks also passed. Public-boundary,
production-exclusion, runtime-asset, file-size and Mini App checks passed.
Native execution of the repaired release source remains to be established.
The real policy-observation dispatcher now retains the same bounded diagnostics;
dispatcher/preflight/native lifecycle suites passed 166 tests with 45 skips.
The initial source checkpoint `39bb1dd0` was scanned, pushed and verified equal
on GitHub; the idle native checkout was synchronized before source derivation.
The native source-closure/workflow review passed 201 tests without skips, and the
Git-context repair passed 66 native tests without skips. PR #312 contains this
source-only M1 repair; resolve its latest head/checks before integration. The
protected-main reference checkout was fast-forwarded cleanly to `9806187a`.
Source checkpoint `0cdf7449` includes the runner fix and owns the new reviewed
operator-helper refreeze. Only the four-line provenance change differs from
the previous helper checkpoint; the other three helpers and every non-helper
G001 adoption path are unchanged. Retention tag
`source-history/warpkeep-0.4-pr312-0cdf74495ef5` preserves that input across squash.
All tracked native inputs matched their Git blobs and a fresh full derivation
matched every installed source-family output. Read the committed closure manifest
for its final digest. This is not a newly compiled release candidate; required
PR checks and protected M1/M2 promotion remain.
At final functional source `cfb23a62`, clean checked-in release verification
passed on Windows and native Linux. The complete sealed-launch verifier suite
passed 168 tests with one platform skip. GitHub's full required checks are pending;
these local results do not establish their eventual outcome or a live release.

Historical App-key path, superseded by the September 21 no-additional-key direction:
the recovery App key generated during the earlier registration was absent
from the known Downloads/private-bootstrap locations. The owner has been asked
only for its local `.pem` path, never its contents. Do not repeat that request. Preserve the existing App,
installation, service keys and general GitHub/provider access; do not repeat
registration or treat this missing App-key file as a failed owner login.

Next: validate and publish these source repairs, complete their source-bound
M1/M2 preparation, then repeat the supported census and prepared bridge path.
The bridge transition must precede initial disabled signer/gateway provisioning,
realm update/readback and actual-owner/device acceptance. These are agent-owned
tasks until an exact unavailable input or interactive owner step is demonstrated.
Keep automation paused and create no Desktop output.

## Last operationally verified source — 20 September 2026

This is a historical source and operations record. The maintenance pass corrected
the G001 current-state route and promoted the exact native-prepared family; it
did not add new runtime features. The protected source verified at this checkpoint is
**`5870717bdb41d00f8b67039022640e03a675d84a`**.

The source-only repair in [PR #309](https://github.com/ael-dev3/Warpkeep/pull/309)
added an outer `g001-current-state` readonly route to the workflow,
preflight and contract tests. The audit above found the inner caller remained
incompatible with Linux. The generated-family promotion in
[PR #310](https://github.com/ael-dev3/Warpkeep/pull/310) then merged the exact
native-prepared outputs. Main Verify `35494158124` and main CodeQL
`35494158121` both passed. The exact protected preflight `35496632288` also
passed and returned `{"operation":"preflight","status":"preflight-inspected"}`.
No provider or realm mutation occurred and no 0.4 deployment is established.

Native preparation and independent check were run from M1 source
`e42aa15ae907e8914de47149cb0ee0b4b6f20145` under the existing `warpkeep` Linux
authority. Both converged on source tree
`379053a6b46aef6b3b0a811c8ed5d6717ad67a9e`, transaction
`24c88a0c67ab07d06efb6b502925cbbc`, journal
`984e7e1e2e9c8e60dd2826ef839aff32b2803884278e7f18a6d7d3554fcca2d8`, family
`311a2cdbf2f749f852dc473e11d77a3f71e03bbc7b44666fce9807c67dec6b20`, closure
`77c41fa2f1b275e8759323f2aaad2210aafafc10ae4ca22644a181568b7bb434`, and
scanner manifest `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.
The candidate checked 3,248 source/candidate files, 624 bundle inputs, 7
recovery inputs and 102 generated outputs; `finalReleasePrepared:false` remains
intentional. The candidate handle is
`release-workspace-f65dd11eb22d74179e30b4be4e1efb98`.

The earlier exact preflight `35490374334` failed closed at the bundle phase
because the generated family was stale for M1; PR #310 corrected that diagnosis.
That preflight is green. It does not establish that each operation can build or
reach its provider; the shipping audit above identifies the subsequent failures.

Windows and native WSL checkouts were clean and synchronized to this SHA at the
end of that checkpoint. Resolve their current roles before moving them. Keep the sync automation paused and
create no Desktop siblings. The live site remains the older 0.3.43 bundle, and
0.4 remains unshipped until provider deployment/recovery, G001 preservation,
sealed G002 denial, actual-owner PTR play, physical-device performance, hosting
and the final release ledger are complete.

### September 18 deep maintenance review

The owner requested a quality audit without new features. Independent review
covers gameplay authority/client reconciliation and the final UI/camera diff; local
review covers renderer cleanup, timestamp feedback, narrow controls, historical
evidence and inspiration boundaries. Browser checks use the real synthetic
Keep04 harness, not an authenticated player. At 390×844, the construction card
and scene summary agree, and displayed button heights meet the existing 44px
rule. At 844×390, the building panel remains in the document scroll below the
sticky resource header. At 320×568 the intentional schematic fallback has no
canvas or horizontal overflow and retains touch-sized controls.

The rendered comparison corrected an earlier building-name mix-up: in the
mature fixture, the foreground **Lumber Camp** obstructs the **City Mill** being
inspected. The existing Inspect action now uses a steeper sightline; the Mill's
facade and level marker are visible in the 390×844 comparison. Entry/grounds
framing, manual pan/zoom and context/quality recovery retain their existing
behavior. Geometry budgets, models and gameplay are unchanged. The six-building
camera tests exercise completed models and scaffolds; final physical-phone
composition remains an acceptance gate.

Maximum-level review now presents completed benefits without an impossible
upgrade heading, warning or confirmation. The schematic names construction and
benefit review accurately. A fully upgraded keep points back to gathering instead
of recommending another building upgrade. Existing command authority is unchanged.
The three new UI regressions and three foreground-obstruction cases failed before
their fixes. The combined final focused run passed **229 tests in 13 suites**;
closure topology passed four further tests. Independent review found no
actionable issue in the final UI/camera diff. These local checks do not confer
hosted acceptance on the newer PR head.
The final complete production build passed. Changing the camera source required
regenerating the dressing provenance digest; the generated geometry itself was
unchanged. The source manifest and all four bootstrap workflow bodies were then
regenerated together and a second derivation matched every byte. This still does
not refresh or authorize the native compiled operation family.

The independent core review traced commands, construction, reconciliation,
Workers, journey arithmetic and keep validation through the PTR transaction,
scheduler, connection capability and client controller. It found no substantiated
authority, double-settlement, accumulated-balance or exact-retry defect. Existing
tests were inspected for these invariants; this pass does not claim new live
concurrency or owner evidence.

The active Windows clone was shallow. Completing its history from the existing
full main checkout repaired the license verifier without another clone. A second
missing object was the explicitly pinned pre-squash operator-refreeze commit:
full main ancestry alone does not include it. Fetching that exact object from
the same retained full checkout repaired the clean sealed-launch history check.
At `e2c947fb`, checked-in verification passed in preparation phase with Pages
deployment disabled. The dirty-checkout rejection remains intentional. The
[sync guide](../../operations/0.4.0-development-sync.md) records both recoveries;
no source pin or guard was weakened. Native Linux was verified idle and fast-forwarded to protected main
`74365a19`; the four companion repositories were checked clean and equal to their
remotes. Preserve the active PR branch in the Windows development checkout.

Current source/CI facts now live only in this handoff; other entry documents
link here rather than repeatedly publishing stale main SHAs. Their dated
historical evidence remains unchanged. The Desktop historical prose contains
non-invertible character corruption, including digits and hashes. Restore only
exact matching passages from intact retained originals; never globally replace
characters or use unrecovered historical identifiers for an operation.
The exact-source restoration recovered 576 lines in 89 matched spans. Unmatched
Next Work history and later additions remain explicitly flagged; only the two
existing Desktop files were edited. The Koi Canal addition is now mapped to a
bounded shoreline/palette review in the visual contract, with no reuse or
performance claim.

### Initial preparation deployment repair

The full recovery signer statically imports final production fixtures that
cannot exist before the initial authenticated observations. A separate private
preparation entry/config now exposes the five existing preparation/observation
methods without those imports. Recovery remains disabled and final issuance,
claim and reconciliation methods remain absent. Gateway failures stay sanitized;
the same service and V2 ledger identity are preserved for later promotion.

Pinned Windows Node 22.22.3 passed the complete service check: types, generated
binding validation, 1,300 unit tests and 66 Workerd tests. The actual preparation
configuration dry-ran successfully in Wrangler 4.110.0 with the final fixtures
absent. Independent review verified its bundle has no final signer, production
fixture or test-double dependency. This establishes source readiness only.
See [signer wiring evidence](../../evidence/0.4.0/signer-worker-wiring.md) and the
[bootstrap procedure](../../operations/0.4.0-recovery-bootstrap.md).

Read-only Cloudflare inspection found the existing auth bridge deployed, while
the signer and gateway do not yet exist. Native fixed publisher configuration
exists with owner-only metadata; G001 policy token, sealed-state records and
Linux recovery bootstrap are absent from their fixed roots. The retained Windows
recovery key/secret bootstrap exists. Do not ask for another key or canary value
without tracing the selected operation's actual protected input.

The current bridge deployment `ec7c0f41-1404-40f8-9330-3c531afae621` serves
version `79dfceec-9810-4868-afca-5b794d08a9a5`. Its named handlers do not include
`ReleaseRecoveryObservationEntrypoint`. Complete the existing prepared bridge
transition and observer configuration before deploying the preparation signer,
then the gateway. The prepared bridge path preserves production authentication
and does not depend on a signer preparation receipt. Default bridge configuration
is not an acceptable replacement for that transition.

The initial audit found two source gaps: fixture generation depended on legacy
G002/PTR receipts, and G001 census/current-state execution depended on unavailable
callbacks and historical macOS monitor evidence. The repairs and remaining
integration work are recorded below; these are agent implementation tasks.
Never substitute Linux process absence for a historical monitor-suspension
receipt, or synthesize old realm publication/import/provision records.

GitHub's renewed elevated browser authentication succeeded on September 19.
After the owner's action-time authorization, “Warpkeep Release Recovery” was
registered as App `4995046` and installed as `162864794`, selecting only
`ael-dev3/Warpkeep`. Its evidence-reader permissions are read-only Actions,
Checks, Contents, Deployments, Metadata and Pages, with account-only installation
and disabled webhooks. A key was generated, but its PEM is absent from the
configured Downloads folder and the existing private bootstrap root. The pending
request is for its local path only, so it can be retained privately and used to
verify App-token access. No new registration, permission expansion or general
approval is needed. This reader does not replace or restrict
the existing GitHub write and provider deployment credentials.

The existing local recovery bootstrap revalidated successfully. Its RPC secret
and census pepper were provisioned directly into the existing protected
`notification-bridge-prepared` environment as
`WARPKEEP_RELEASE_RECOVERY_RPC_SECRET` and
`WARPKEEP_RELEASE_RECOVERY_CENSUS_PEPPER`; GitHub metadata confirms both names.
Their bytes were passed through stdin without being printed or committed.
The prepared bridge caller now consumes them in its existing preserving upload,
alongside the source-fixed G002 identity and initial observer epoch. Its separate
six-secret predecessor and nine-secret candidate contracts preserve existing
authentication, Durable Objects and migration identity. Historical completed
seven-secret recovery remains supported. The 56 focused Windows tests passed;
at published `3ecf9d08`, all 179 tests in the four affected suites then passed
on native Linux without skips. Generated closure refresh and deployment remain.
This secret provisioning and source verification are not a Worker deployment.

### PTR fixture source repair

The recovery materializer omitted `spacetimedb/gameplay04` even though current
PTR source imports those shared rules. It now extracts both fixed namespaces
from the same authenticated commit. The fixed repository, module-tree identity,
blob reads and path/link checks are preserved; untracked files and similarly
named directories cannot supply missing source. Historical PTR commits without
shared imports remain supported.

Before the fix, the native shared import failed and omitted shared link/blob
checks did not reject. Afterward all five native Git-object regression scenarios
passed under pinned WSL Node 22.22.3, including legacy commits, missing namespace,
symlink and missing blob. Windows passed three portable cases (five explicitly
native-only cases skipped), 66 adjacent fixture/host/toolchain tests and service
types. No full production fixture generation or provider operation ran. Existing
adoption provenance still needs its separate authenticated producer path.

### Retained adoption reader

The recovery producer can now authenticate retained PTR/G002 updates after
protected main advances, using a separate historical-read capability. It reopens
the original private completion, successful continuation and signed observation
pair; it cannot issue permits, claim operations, create adapters or write records.
The full repository tree remains distinct from the realm module tree.

Independent review found no blocking issue. Pinned Windows Node 22.22.3 passed
54 tests across the source-authority and signed-update suites, with six native-only
cases explicitly skipped; application typechecking passed. Added historical-entry
regressions cover genuine foreign stores and adoption/completion/terminal changes
during signature verification and after evidence creation. Native Linux then
passed all 60 cases without skips at `32cde68c`.

The fixed compiled reader now connects that historical evidence to the Windows
fixture producer through the existing attested native bundle. Explicit
`--evidence=existing-state` selects signed retained G002/PTR adoption data;
legacy mode retains its original inputs and there is no automatic fallback.
The producer proves each historical repository/module tree, rebuilds the installed
module, compares both SHA256 and Keccak256, and reopens authenticated adoption
after the build before publishing the unchanged fixture-manifest format.
An existing authenticated `gh` session can supply the bounded GitHub reads through
private stdin; no credential is written into a request, manifest or log.

The combined Windows reader/producer checks passed 237 root tests with 44
native-only skips, and 84 service tests with five native-only skips. Application
and service typechecks passed. Independent review found no blocking issue.
These tests include explicitly labeled host/private/HTTP emulation. Actual fixed
native bundle preparation, private-corpus reading and fixture generation remain
to be run from the integrated source; no production receipt was fabricated.

### Census interruption repair

The second census now validates the complete stable pair before persisting it.
If collection succeeded but confirmation or activation metadata was interrupted,
the retry authenticates the retained observation and the original workflow's
terminal state before completing only those deterministic records. It preserves
the original expiry and refuses conflicting bytes, a live original claim or
an unrelated completion digest. No collection or suspension is repeated.

Source review and syntax checks passed. The first native run exposed a missing
version-directory segment in the new tests' direct fixture paths. After fixing
the paths and requiring proof that the tamper hook actually replaced its target,
all 83 dispatcher tests passed under native Linux Node 22.22.3 at `2df17464`.
Fresh-first lifecycle
recovery and duplicate downstream continuation issuance remain unsupported;
this repair does not enable the unavailable Linux production census caller.

### Linux freeze evidence format

The pure V6 candidate/projection format replaces Mac monitor assertions with
explicit server-freeze confirmation and current-state receipt commitments.
Its codecs preserve the existing census framing and expiry, authenticate the
shape of Linux policy provenance and require a distinct later observation.
Producer/private-store authentication remains a separate required step.

Independent review found no blocking issue. The focused root codec/candidate/
policy suites and service projection suite passed, as did service types; fixed
regression hashes preserve V2–V5 binding bytes and V1 is untouched. The final
codec run passed 22 cases. This format checkpoint neither changes the G001 access
policy nor suspends player timers. The subsequent producer/public-consumer
integration follows below; private activation composition remains in progress.

The native census producer now collects both stable samples in one authenticated
read-only execution. It uses the existing admin session and aggregate-checked
admission reader, waits the original stable interval, then observes confirmation
and current policy in strictly increasing order. An immutable complete attempt
is retained only after actual child cleanup and exact private-report/proof
reopening. Interrupted attempts are not selected; no suspension, new continuation
claim or provider mutation was introduced. Both observations can truthfully
share one native execution while retaining their distinct observation digests.

Independent review found no blocking defect; a small nested-record immutability
issue was corrected without changing receipt bytes. The 64 focused tests passed
on Windows with one POSIX-only private-retention case skipped; application types
passed. The final attempt-only regression rerun passed 11 with that same single
skip. Native Linux at `3bc1696b` subsequently passed all 65 census/attempt/freeze/
lifecycle cases and all 38 descriptor/build/policy cases without skips. These
checks do not claim a production census. Protected admin-token ingress and
dispatch/activation integration remain required. The public
result selects an explicit source/workflow/attempt/digest; it does not select the
newest directory or assert a successful production census.

### Protected Linux census and V6 consumers

`g001-freeze-census` now routes through the existing protected read-only job.
It reuses the protected admin secret, removes it from the process environment
before the credential-free build, and passes it to the census child through an
owned disposable file/descriptor. Cleanup removes that file. The result contains
only an explicit completed-attempt selector. No persistent policy-token copy,
Mac suspension receipt or new continuation approval is required.

Activation's completed-run reader authenticates that exact source, workflow run,
attempt, operation title, successful runner/job and successful execution step.
It rechecks live activation and the latest census attempt after the intervening
reads; failed/skipped/superseded runs cannot supply evidence. The private consumer
must still reopen and compare the selected retained attempt after those reads.

The signer receiver, JWS reader, Pages classifier, Git source authority and
prepared-closure reader accept the native V6 format while preserving V1–V5
contracts and the private bridge V5 receipt. The combined dispatch/workflow/source/
census checks passed 174 Windows tests with 40 Linux-only cases skipped. App
types passed. Public receiver/projection tests passed 346 cases, the actual
Git/prepared-closure CLI passed 16, and focused V6 Git-history checks passed two.
Independent source review found no remaining blocking issue in these slices.
The live activation scope can now authenticate retained historical Verify
evidence with its existing token internally, without another login or a new
workflow identity. Fifteen focused cases pass, including expiry, revocation,
changed source and an actual run stopping or rerunning during the historical
reads. Private adoption composition still owns the data-to-current-release join.
Native execution, private activation composition, regenerated family, protected
main CI and provider execution remain separate steps; 0.4 is still unshipped.

The fixed native `production-admin-v1/g001-policy-observation` directory was
absent. It is now provisioned empty under the existing private root, with verified
`warpkeep` ownership, mode `0700`, real parents and directory fsync. No token or
receipt was created. The workflow will use its already provisioned protected
secret for each disposable census execution.

Actual pinned native builds at clean `3bc1696b` completed successfully: G001/G002
program artifacts took 264.37 seconds and PTR bindings took 203.50 seconds. Both
used the real locked build cycles; output bytes were discarded after validation
and source remained unchanged. Their combined 7 minutes 48 seconds exceed the
five-minute current-state freshness window before activation overhead. The
external census-then-build sequence is therefore not an operable release path.
The repair collects fresh census evidence inside the genuine activation run
after expensive preparation; its integration is in progress. The selected
external completed-attempt path remains useful for diagnostics but must not be
presented as a reliably timed shipping sequence.

Source-graph derivation also exposed previously unlisted fixed local-runtime
imports now reached by activation. The closure policy now enumerates their
existing attested expressions and the externally compiled census entry, without
allowing arbitrary dynamic paths. Its focused regression and app types pass.
Generated manifests/bundles still require their normal complete derivation.

At published `7e86dbe9`, eight native Linux suites passed all 338 tests without
skips, covering workflow evidence/authority, source, dispatch, census attempt,
native lifecycle and workflow shell execution. The recovery service's full
unit suite passed 1,346 tests with five native-only fixture cases skipped on
Windows; that suite establishes code behavior, not a production deployment.

The inline native producer now accepts the actual activation operation and
existing live permit, collects after preparation, and returns same-process
evidence bound to the reopened complete attempt. It never describes the live
activation job as a completed census workflow. Independent review found no
blocking issue; its four affected suites passed 80 tests on Windows with two
Linux-only skips, and app types passed. The explicit dispatch value is
`g001_census_attempt: inline`; private activation composition is still being
integrated, and the generated family is not yet refreshed.

At published `4a50c453`, all 82 tests in the four affected native Linux suites
passed without skips. The full recovery-service check also passed application
and Workerd types, Wrangler binding validation and all 66 Workerd tests; its
1,346 passing unit tests retain the five explicitly native-only Windows skips
noted above. These results do not establish production census or deployment.

The inline activation continuation now shares the original activation scope,
so it cannot bypass an older unresolved or completed effect. Its issuance and
claim use the actual generation operation and exact same run and attempt. A
fresh dispatch can recover an earlier terminal inline issuance that never
claimed an effect, using the existing exclusive reconciliation reservation and
an authenticated no-effect terminal. No claimed record is invented. The existing
authority requires a different run ID: use a fresh dispatch after cancellation,
not GitHub's rerun of that same run. Completed-record reads validate all history
and the exact successful binding while allowing earlier no-effect evidence.

Independent review identified and resolved both cross-mode replay and stranded
issuance cases. The three-file checkpoint adds 30 regression cases and passes
application types and source review; native continuation/completion execution
remains required. The actual fresh-bridge/issue/claim caller is still being
integrated. No new runtime gameplay features are part of this maintenance work.

The private V6 corpus now joins authenticated historical PTR/G002 adoption with
the current native program comparison and explicit Linux census. It preserves
historical module provenance while deriving bridge configuration from the fresh
current observation. It accepts the selected completed diagnostic attempt or
the genuine inline capability; generation builds before collection and requests
the short-lived preparation observation afterward. V2–V5 formats remain intact.
The actual same-run bridge/continuation integration is still unfinished.

This private checkpoint passed application types, 132 baseline tests with 15
native-only Windows skips, and all 77 focused tests. The new connected adoption
fixture passed with a different current bridge source/version and V6 descriptor
and projection; three corpus-change races and stale-new-candidate rejection also
passed. These private-source tests use synthetic retained data, not production
census, adoption or provider deployment. Native verification is recorded below.

At published `f7e7ce5f`, all 202 tests in nine native Linux suites passed without
skips, including the complete activation-records and connected V6 adoption
fixtures. At `cf1b713e`, all 58 continuation tests and six of seven completion
tests passed. The remaining test caught error-order drift from the earlier
historical-reader extraction: a forged store reached source validation first.
Restoring store/owner validation before authority restores the established
capability error; its targeted regression passes. At the published correction
`2a90a872`, all 65 native continuation/completion tests passed without skips.

The fresh inline caller now collects/selects its own immutable bridge receipt
after the genuine census, then issues and claims within the same generation
run. Diagnostic inline inspection retains its receipt without reserving the
generation action. Existing diagnostic receipts remain unchanged; selection
uses the exact newly written digest, never the newest file. Candidate assembly
is deferred until that bridge evidence exists, with full validation at generation.
Legacy inspection and separate-run generation retain their original behavior.

Independent review found no blocking issue in this bounded fresh-caller slice.
Application types and its connected Windows regression passed, separating
inspection from generation by more than ten minutes and using a different
census. All 38 selected legacy bridge/generator tests also passed. Native actual
inline dispatch and output generation subsequently passed at published
`c31bff9e`: the native connected case exercised the actual protected dispatcher,
same-run claim and generated descriptor/public artifact. All 136 tests in the
bridge-state and recovery-bridge runtime suites also passed without skips.
Already-written V6 output uses the separate completed-only retry path described
below, retaining original evidence at authenticated generation time without
requesting a new census or signer observation.

Published `11ad901d` adds data-only readers for that retry. They reopen
the exact completed output family, native census and retained signed preparation
at the original authenticated generation time. Copied contexts, foreign private
stores and use as fresh generation evidence are rejected. Independent review
found and repaired an ownership gap in the active reconciliation path; its
regression uses a genuine alternate store and ambiguous claim. Preparation
checks passed 36 direct, 19 signed-observation and 13 selected legacy cases on
Windows, with application types and both selected connected cases passing.
At that exact published source, all 82 preparation tests passed on native Linux.
The selected connected completed-context case also passed, including the genuine
foreign-owner reconciliation regression; 35 unrelated cases were unselected.

The reviewed caller now selects an existing completed inline family before any
new census, preparation request or bridge provider is constructed. The actual
activation lane either reopens successful completion or reconciles the original
uncertain claim after its run has terminated, then reopens the output before
reporting success. Reconciled completion also binds the exact generation receipt
to the journal's observation digest. Malformed or partial output is preserved
and rejected. Fresh and legacy generation remain separate existing paths.

Independent review passed after the receipt commitment repair. Application types
and all 29 workflow lifecycle cases passed on Windows. The connected regression
exercises normal completion and an actual private-write interruption before
terminal acknowledgement, followed by two retries 24 hours later. Its fixed
Git/artifact candidate projection is an explicit fixture seam, so this is not
full native release preparation or deployed acceptance. Both native caller cases
passed at published `15a6a0cf`, including two completed retries after expiry in
each case; 35 unrelated cases were unselected. All 158 native bridge/candidate
compatibility tests and all 83 dispatcher tests also passed. Additional candidate assembly
coverage passes 25 Windows cases, explicitly checking shared context identity,
retained facts and rejection of mixed fresh/completed inputs. The connected
fixture also now asserts the exact clock used by its final expiry read.
The preparation runbook consistently directs source-only
M1, native prepare/check from exact protected M1, then generated-only M2.

After ordinary integration of protected `68cfc928` into the development branch,
published `7d18304f` passed all 15 selected native completed-candidate/retry cases,
including the corrected expiry clock and earlier V4/V5 completion paths; 47
unrelated cases were unselected. Source-only derivation then identified a real
packaging limit: the complete canonical source manifest needs 263,411 bytes,
exceeding the earlier 262,144-byte bound by 1,267 bytes. No output was installed
by that failed derivation. The producer/parser and installed-toolchain reader
now share a 512 KiB bound, preserving the exact member, canonical-byte and hash
checks. Boundary regressions use valid canonical documents at the limit and
one byte above it. Generated family installation follows verification of this
source repair; the compiled operation provenance is unchanged.

At published `f4611936`, all three selected native manifest boundary cases
passed. Source-only derivation verified 1,268 input files against their Git
blobs and returned the fixed 16-output family, with 13 changed files. A fresh
process reproduced every installed byte and verified the complete 1,258-member
closure, manifest `9751f69a8b88531bb0dc7cd96257f6a1956716cae2fb360d7d156919a62e92bd`.
The family was copied into the unchanged Windows source only after those checks.
This is M1 source closure, not a compiled native preparation completion.

The native reader also found three retained root-owned files: `verify.yml`,
`local-fullstack-spacetime.mjs` and the recovery claim bundle. Their absolute
paths, regular-file identity and exact Git bytes were checked; only ownership
was corrected to `warpkeep` (UID/GID 1000), and the bytes were rechecked. Run
ordinary native Git, builds and tests as that account. No broad recursive
ownership change, dependency installation or duplicate checkout was needed.

The clean checked-in sealed-launch check then identified a stale static operation
list: it omitted the already implemented `g001-freeze-census` caller. The verifier
now includes that operation and its existing exact-membership regression checks
that removing it still fails even after source pins are regenerated. All nine
focused operation-membership cases passed on Windows (160 unrelated cases were
not selected). At published `88059172`, native derivation checked all 1,268 inputs
against Git again; a fresh process reproduced all 16 outputs and passed the full
policy/manifest check. Only the manifest and four workflow manifest pins changed,
to manifest `ba727f2881dd88c7e6d24e4c47f2ea0bc5c12bbaa3a74edf75d086ac8a16504e`.
App/test types also passed. Final clean checked-in verification and M1 integration
follow this synchronized source family.

At `5357d810`, the clean checked-in sealed-launch check passed in preparation
phase with deployment disabled. Native verification passed 455 of 456 cases in
ten affected suites. The remaining test expected two now-typed Linux modules to
have no declaration in the closure; the actual derived graph correctly includes
their declarations. The test's stale exception list is corrected, retaining the
exact executable/declaration pairing assertion. Its focused native rerun passed at
the final source head. The V6 contract repair then corrected ambient-environment
error precedence, marked V6 as supported in the older-version rejection tests,
and allowed the retained-fixture reader in the activation entry surface. Four
affected Windows suites passed 753/753; the native closure regression passed.
At `bca105e5`, a fresh native derivation checked 1,268 Git inputs and reproduced
all 16 outputs, with manifest `da2c2ab1beeb99e24d8abdff28122e74b74efccaca2c6a128c90d7ad45a01ccf`.
Independent static-source and current-documentation reviews passed; the handoff
now distinguishes completed source work from pending provider setup.

### Historical shipping estimate and next work at that checkpoint

Planning estimate: **5–10 focused working days once operation-specific private
authority is usable**, including native family integration, provider/recovery
validation, actual-owner play, device measurements and fixes. This is an effort
allowance, not a promised calendar date; it excludes unknown waits for retained
private records or owner/device availability. A significant acceptance failure
would require re-estimation. Source/test counts are not a completion percentage.

At that checkpoint, next: finish source-only PR #301 checks and merge M1. Its reviewed source closure
is derived; the initial signer repair is already merged. Prepare
and independently check the family from its actual M1, promote M2 and wait for
that main Verify. Then use supported read-only inspections to identify each
remaining private prerequisite and its existing producer. Missing implementation
is agent work; ask the owner only for the specific inaccessible retained record,
login step or prepared real-device/play test. Do not request secrets in chat or
dispatch provider changes using the earlier generated family.

### Maintenance review and recurrence prevention

The maintained connection/diagnosis guide and local checkout map remain the
entry point for agents. They identify the correct profile, pinned runtime,
native configuration, source prerequisites and smallest human-controlled
action; they distinguish a pending check, wrong account, denied player session
and absent private evidence. The Linux caller now separates execution failure
from workflow construction without exposing private errors, and the existing
Keep recovery path explains session renewal without weakening authority guards.
The real-controller review found no batched retry defect, and the renderer and
gameplay lifecycle review found no further actionable maintenance issue.

Green source checks remain scoped evidence. They do not replace authenticated
owner play, provider readback, physical-device measurements or final release
acceptance. Keep those facts in separate records and do not turn a synthetic
fixture, a publisher login or a passed Pages classifier into a deployment claim.

## Historical checkpoints

Everything below retains its original source/date and is not an instruction to
resume old branches, rerun completed work or treat old failures as current.
Use the verified baseline and resumption audit above, then inspect live refs.

### Previous consumer implementation checkpoint — 13 September 2026

Continue `codex/0.4-g002-existing-state` /
[PR #245](https://github.com/ael-dev3/Warpkeep/pull/245) in the reused isolated
checkout `C:/Temp/warpkeep-clean-ci`. Runtime `7e7aa9b1` and scanner follow-up
`d71b53e7` are published; full-range scanning and GitHub equality passed.
This follow-up connects the preserved G002
update through private activation records, bridge suspension, the public V5
binding and recovery consumers. Both realms require genuine retained signed
proofs from the same private-state owner; source/tree and signed bridge
configuration/epochs must agree. Original G002 publication/import history is not
invented. V2–V4 public formats and existing PTR private bytes remain supported.

The activation runtime authenticates both retained proofs before provider
construction. A dual-adoption bridge cannot create initial realm import gates,
owner-provision or legacy live receipts. Its new suspension receipt binds the
real prepared deployment and both adoption digests. The receiver validates the
G002 sealed-state HMAC against fresh state alongside the existing PTR/G001
safeguards. See the [owning recovery evidence](../../evidence/0.4.0/recovery.md#g002-and-ptr-adoption-consumers--2026-09-13)
for exact tests, review findings and the limits of each proof.

PR #245 now targets `main` and contains the complete PR #244 ancestry. Main
`a2929bb6` is its verified merge-base. PR #244 at `27671943` has passed all eight
hosted checks; retain its open draft and published source-history tag until the
combined PR is integrated. Do not merge or prepare a separate PR #244 family.
Require the final PR #245 head's own checks, normal protected eligibility and
retained history before its guarded squash. The primary Windows checkout retains
its own published `758bc482` branch; do not move that independent branch.

The previous producer source `1664405d` passed native session `61892`: all 356
cases in 13 suites, no skips. That does not certify this consumer follow-up.
The native checkout was synchronized cleanly to published `d71b53e7` after an
idle check, preserving RunnerService. Its remote fetch configuration covers only
`main`; explicitly fetch the published development branch before checking out
a new source. Do not alter that configuration or move native source during tests.

Native acceptance `28187` is closed with exit zero: all 1,459 cases in 19 suites
passed at immutable `d71b53e7`, without skips (688.56s). This includes actual
V4/V5 private descriptor generation, lost-response handling and restart. Windows
owning regression `29078` is also closed with exit zero: 122 passed with 15
expected platform skips across four suites (1104.20s). Do not restart either run.

The subsequent caller audit found that the prepared closure CLI projected only
the original V1 binding, rejecting valid V2–V5 recovery activation. This checkpoint
corrects that boundary by authenticating exact committed preparation/activation
bytes and projecting the binding to its actual inert parent. A fixed in-memory
module namespace isolates the Linux caller's ordinary cached helpers without
creating files or trusting unowned cached exports. The builtin-only bootstrap
checks committed manifest and RAW source before evaluating the reader, then
rechecks source and all member bytes before issuing closure authority.

The V1 control and actual V5 Git/CLI case passed on Windows with an explicit
metadata-only platform seam; source-reader and application type checks passed.
Independent runtime/policy review is clear. Expanded Windows CLI passed 13
cases; graph/compiler checks passed 51 with one Windows platform skip. Corrected
graph/source additions passed their targeted reruns, and all Windows handles are
closed. Native session `83592` then passed all 69 cases in the three complete
owning suites at this exact published source (18.86s, exit zero), including the
injected-entry cache case. The recovery closure correction now has its final
focused native acceptance. Read real terminal handles, not elapsed time. The complete source-family
preparation and independent check now passed for the exact published input; retain
their identities above and do not reuse an older family. Continue normal
protected integration and exact accepted-main preparation, then live preservation,
actual-owner play and rendered mobile acceptance. Follow the
[existing connected plan](../../superpowers/plans/2026-09-08-ptr-update-recovery.md#g002-adoption-consumer-contract).

The overall engineering estimate is about **86%** after generated-family
integration and documentation closure, with an 80–88% judgment range;
0.4 is not shipped and no reliable calendar ETA is established. The saved Codex
sync automation is **PAUSED** by the owner. Commit, scan and verify pushes at
active development checkpoints without recreating a scheduler. Do not create new
Desktop files; update the existing handoff in place only. Reuse ignored output
and the fixed private build roots. Native preparation currently retains about
73 GiB of historical runs; inspect referenced evidence and actual process state
before retiring anything or creating another large candidate.

Automatic approval review rejected cleanup of owned failed Windows CLI
fixture roots under `D:/Temp/heyas`: `warpkeep-recovery-closure-JGxHYp`,
`warpkeep-recovery-closure-Q6RF9e` and `warpkeep-recovery-closure-YrceVK`, with
only the reason "blocked by policy". They may remain after partial cleanup;
do not retry or bypass that rejection. A later failed fixture
`warpkeep-recovery-closure-lkXqvm` may also remain; no fallback deletion was
attempted. Successful suites clean their own
fixtures normally. No Desktop files or production/private state were targeted.

The records below are historical checkpoints, not instructions to move to an old
branch, restart a completed run or treat previous artifacts as current authority.

## Previous delivery integration — 13 September 2026

The owner paused the only saved Codex automation on 13 September 2026; immediate
reviewed development commits and verified pushes continue. Do not recreate the
scheduler from historical instructions.

Published repair `a7bfa1cf` completed native preparation `31058` and independent
check `52092`, both exit zero with every returned field equal. Its complete family
was authenticated and applied; staging the exact generated changes reproduced
tree `062df4b7044ba918667dc5f38d63edc2d38ddbf1` before adding evidence. The
[owning record](../../evidence/0.4.0/release-engineering.md#verified-observation-source-family--2026-09-13)
contains source, candidate and digest identities. Integration `70a65b34` was
published and synchronized while native was idle. Native `35676` passed all 701
tests in 18 generated/private suites, and preflight `7574` passed all 52 cases;
both are closed with exit zero and no skips. The initial preflight clone ownership
setup failures were resolved with process-only exact donor configuration, leaving
no persistent config or temporary fixture roots. Both sealed verifiers passed in
preparation state, with Pages routing `sealed-launch-blocked`. Resolve actual heads
and CI before protected integration; this does not certify a release. All prepare/check
handles are terminal, including failed `85601`; do not restart or export that
failed candidate. Live G002 exists with an older public interface, but genuine
local G002/bridge receipts were absent from the documented paths. Its production
workflow adapters are unavailable. The next delivery work needs authenticated
existing-G002 state/update provenance, preserving its sealed state and G001's
progress/admission freeze. PTR evidence cannot substitute for G002 authority.

The active delivery branch is `codex/0.4-ptr-state-adoption` /
[PR #244](https://github.com/ael-dev3/Warpkeep/pull/244) in the reused
`C:/Temp/warpkeep-clean-ci` checkout. The draft PR now targets `main`; the scanner
coverage follow-up's push will verify that consolidated base. Its seven owning
tests and real scanner passed after reproducing the two missing-coverage failures.
PR #240's sole non-ancestor correction `944bb17b` is patch-equivalent to included
`5996629a`, and its changed file is byte-identical in this integration. Do not
reapply it. Preserve the reviewed final tip and ancestry with a remotely verified
non-release `source-history/` tag before normal protected squash. Follow the
existing M1 preparation/check and M2 generated-family sequence; never deploy M1
or treat development-family success as final source authority. Read the connected
plan's [next G002 boundary](../../superpowers/plans/2026-09-08-ptr-update-recovery.md#next-delivery-boundary-existing-g002)
before implementing additional delivery machinery.
The published `e9262af0` checkpoint authenticates retained signed PTR adoption
after producer disposal and carries the separate V4 public/service profile through
recovery consumers. Its full native service run passed 1,218 tests in 44 suites.
Native root run `76533` is closed: 1,184 passed, one failed, no skips. The remaining
checked-in CLI failure is the stale generated source-authority pin; regenerate the
whole family from the next published connected batch rather than typing a hash.
Windows root run `89369` is also closed (90 passed, 13 native skips). Do not restart
those historical runs or describe either handle as active.

The current follow-up connects the private V4 corpus, bridge-state receipt,
candidate and descriptor generator, including retained-evidence authentication in
the actual activation workflow before provider/bridge construction. The distinct
bridge receipt preserves genuine G002/deployment evidence and binds the PTR adoption
digest. Missing or malformed retained state fails closed. Synchronous descriptor
validation requires the owned authenticated capability. The
[owning evidence](../../evidence/0.4.0/release-engineering.md#ptr-retained-adoption-and-recovery-consumers--2026-09-12)
and [connected plan](../../superpowers/plans/2026-09-08-ptr-update-recovery.md)
record exact verification and remaining native integration. No generated family or
live deployment is certified by component success.

The native joined producer/bridge/public-artifact and fixed-descriptor generation,
lost-acknowledgement restart and read-only reconciliation cases now pass at published
`a9e16d45` (`56511`, two targeted passes, 15 earlier cases filtered, 9.44 seconds).
The earlier native test setup wrote the descriptor before the real generator;
that fixture is corrected without weakening immutable publication. All root and
agent test handles are closed. Source is published before native synchronization;
resolve actual refs rather than restarting any historical handle. Next regenerate
and independently check the complete family from the next clean published source,
then verify exact-head CI and continue the real operating/owner/mobile workflow.
The completion estimate remains around 65% (60–70% judgment range), not shipped.

PR #242 at `758bc482` and PR #243 at `789db360` passed all hosted checks,
including their final Verify gates. PR #244 at `e9262af0` passed both services,
native-contract and CodeQL; Linux/module jobs were still running at the latest
inspection. New development commits need their own check results. The browser
inventory at this continuation contains no tabs: the previously prepared GitHub
App form is no longer present. No App/install/key was created here; the unanswered
action-time creation approval remains pending. Do not reconstruct or submit it
merely because the old handoff mentioned a tab.

The latest visual development is `codex/0.4-building-hierarchy` /
[PR #243](https://github.com/ael-dev3/Warpkeep/pull/243), in reused linked checkout
`C:/Temp/warpkeep-clean-ci`. Source `75c04680` passed all 138 owning tests,
both type projects and independent source review. Guarded run `windows-run-N8ekUE`
completed at that exact stable source; all 36 captures were independently reviewed.
The cathedral is better balanced, and root inspected full scrolled desktop and
landscape scenes plus selected portrait sites. Overview craft readability, lumber
sign occlusion, terrain composition, diagnostic warnings and device acceptance
remain open in the [visual record](../../evidence/0.4.0/visuals.md#rendered-follow-up-at-75c04680).
The QA tab/server are stopped; viewport override is reset. The failed initial
cache-location attempt remains retained and is not art acceptance.

The branch normally incorporates the published prepared-family integration
`eeda6f64ae86d370a652aa4a84e874684bd9740d` from PR #242. That family is bound
to D, not to the later visual source. Native verification of the exact published
family integration passed all 393 cases and both sealed verifiers; it is complete. No new
clone or package installation was added. Resolve each actual head and its check
results before protected integration. Keep the full release goal active: 0.4 is
not shipped, with an engineering estimate around 65% rather than a gate-derived
completion score. The next connected delivery work remains the observer rollout
and actual V4 existing-state adoption described below.

The primary Windows branch is `codex/0.4-keep-entry-framing`, published in
[PR #242](https://github.com/ael-dev3/Warpkeep/pull/242), based on PR #241 head
`5996629a413f205c0564d570670a650a17f2a63f`. Entry framing at `337a4cc0`
passed the five-suite 166-case selection, both type projects and independent
review. Guarded run `windows-run-PSW7Es` retained 36 reviewed images from that
exact source; [visual evidence](../../evidence/0.4.0/visuals.md#2026-09-12-occupied-entry-framing-and-placement-markers)
owns the scope, diagnostics and remaining acceptance.

Published review input `d64c8f78442da7ad1bc554c283daf136d670d399` then
completed native preparation `17954` and independent rebuilding check `10798`,
both exit zero with all fields equal. The authenticated complete output family
was independently reconstructed, applied to the unchanged Windows input and
staged as exact generated tree `f657aa5d007e58a6ded430c3df6bba37112b99e6`.
Only seven manifest/workflow-pin files changed. The
[owning family evidence](../../evidence/0.4.0/release-engineering.md#occupied-entry-source-family--2026-09-12)
records all identities. Do not restart either completed native run or apply an
older export. This development preparation is not a production deployment.
Native session `28168` passed all 393 cases in ten owning/generated-consumer
suites at published integration `eeda6f64`, without skips or failures, using the
normal timeouts (286.16 seconds). Both sealed verifiers passed in preparation
state, and native remained clean with no active source consumer. This closes the
recorded Windows fixture/timeout limits for J; it does not accept later art source.

PR #240 at `944bb17b` and PR #241 at `5996629a` have passed all hosted
checks; resolve actual heads before normal protected integration.

PR #241's preceding change fixes the real host's rejected Close/Escape request during
a pending command or refresh; see the [gameplay evidence](../../evidence/0.4.0/gameplay.md#panel-dismissal-during-a-request-or-refresh--2026-09-12).
All eight new integration cases reproduced the defect and then passed; the full
host/screen selection passed 68 tests, both type projects passed and independent
review found no actionable defect. Published input `8aaeda0f` completed native
preparation `24973` and independent check `93940`, both exit zero with all fields
equal. Its authenticated complete family was applied and generated-only staging
matched `1494fe0d9468b54c30ae47acccadd7038fb83726`; the
[owning evidence](../../evidence/0.4.0/release-engineering.md#pending-panel-source-family--2026-09-12)
records the candidate and exact digests. Do not restart either completed run.
PR #240's Linux job `103590042919` exposed one real-parser provider fixture that
still described the older Worker. The corrected test includes version metadata
and the observation entrypoint, with exact rejection cases when either is absent.
The failure was reproduced; all 211 owning cases then passed on Windows. The
test-only correction is published at `5996629a` and normally cherry-picked into
PR #240 as `944bb17bdeafed920466bbdc4e27511bd8e557e1`; production guards and
generated outputs are unchanged. Fresh native session `20928` passed all 400
tests across seven suites without skips at `5996629a` (20.53 seconds, exit zero),
covering the provider and generated consumers. The native checkout remained clean
at that published input. Later changed heads still require their own full hosted acceptance.
Resolve the live branches and dependent PR base before later protected integration.

Corrected source `3710f139b3572ae0a742d582d0d79d8aa88d9476` completed native
preparation `91889` and independent rebuilding check `80884`, both exit zero
with all returned fields equal. Candidate
`release-workspace-baf068853796d70d5c6b480a15116d05` and its full digests are
recorded in the [prepared-policy evidence](../../evidence/0.4.0/release-engineering.md#prepared-policy-family-refresh--2026-09-12).
The authenticated complete family was applied to the unchanged Windows input;
all outputs and preserved source were checked. Generated-only staging matches
tree `4795a1fe2bb6b6eeb5851c538a352b454aa66596`. Its seven changed paths carry
only manifests and workflow pins; compiled bodies and count fixtures are stable.
The targeted signature regression passed all seven selected cases (`30348`);
156 other cases were filtered. Published integration `9ac3ee36` subsequently
passed all 365 native cases across eight suites, including all 163 prepared-
workflow cases, without skips (`81593`, exit zero, 289.91 seconds). The native
checkout remained clean at that source. Its hosted checks and normal protected
integration remain required. Do not rerun either completed preparation command.

The source at `9e098f75` has now completed actual native preparation `67204`
and independent rebuilding check `6320`, both exit zero with every result field
equal. The complete authenticated family was exported and applied to that exact
Windows input, verifying all generated outputs, the exact changed-path set and
unchanged HEAD/index/preserved source. [The release-engineering record](../../evidence/0.4.0/release-engineering.md#bridgeptr-source-family--2026-09-12)
owns the retained candidate and full digests. Published integration
`4b96ae380b6fdb348d26eaf74464638e2e346aff` passed all 448 native tests in 15
owning and downstream suites without skips (session `89197`, 38.75 seconds,
exit zero). Checked-in/preparation verification passed and the actual source
classifier returned `sealed-launch-blocked`. Full current-head hosted checks and
normal protected integration remain required; this does not establish deployment.
Both Windows TypeScript projects and all 30 tests in the three doc-facing suites
passed after application, as did tracked file-size and diff checks. The broader
Windows generated-consumer run `31279` completed with 283 passes, 78 failures
and four skips. Its three failing suites require POSIX ownership, `/usr/bin/git`
and symlink semantics; the native projection/boundary suites passed in the 448
cases above. The native prepared-workflow run `81300` completed at `42b660fd`
with 156 passes and seven failures, no skips. A static-policy literal still
expected the old two-argument `exactApiScriptAttestation` signature, while the
repaired runtime correctly accepts a separate `expectedNamedHandlers` parameter.
The baseline refusal cascaded into six credential-comment regressions. The narrow
policy expectation is corrected without changing their assertions; the targeted
recheck and complete family above validate that correction's preparation. The [verification environment guidance](../../engineering/development-workflow.md#choose-the-verification-environment)
now routes those contracts through the existing native lane. Do not weaken their
assertions or restart the completed Windows run.
The operating checkout can synchronize after publication because its native
preparation/check processes have completed. Do not restart completed runs.

The release-integration branch remains `codex/0.4-bridge-predecessor-repair` in
[PR #240](https://github.com/ael-dev3/Warpkeep/pull/240), integrating the pending
PR #237–239 source against main. Published `b319e38b` includes a normal merge of
N3 with the exact repair tree preserved; its only conflict was older handoff
status, resolved to the reviewed descendant's completed evidence. It repairs the prepared bridge deployer's
comparison of historical B0 settings and bytes with the new candidate. The
production caller supplies a fixed, authenticated B0 module inventory; candidate
upload/readback stays bound to its independently built source, version metadata
and recovery export. The [prepared transition procedure](../../operations/auth-bridge-notification-prepared.md#prepared-transition-for-04)
owns the exact distinction and provider provenance. No provider mutation or
protected bridge dispatch has occurred. At `b319e38b`, native Linux passed all
202 cases in the five runtime/adapter/receipt/recovery-source/workflow suites
without skips. The actual credential-free Wrangler dry run now accepts the same
candidate bytes that previously failed. The wider closure selection found 15
inventory failures from the earlier PTR observation graph/order. The correction
adds the explicit observation root, permits only its six verifier dependencies
and restores canonical member order. Independent review, Windows closure cases
and direct derived/fixed inventory equality passed. Native session `44084` at
published `b3ac5d28fc2bbd30a89530992671d845ad128639` passed all 246 tests in the
eight owning suites without skips in 9.51 seconds, exit zero. Windows, GitHub and
the clean idle native checkout matched that implementation checkpoint. Read the
final PR head and its hosted checks before claiming the source accepted or
deployed; later documentation publication does not replace this test identity.

The downstream native check at the same source (session `38666`) passed 131
and failed 70 cases across seven suites. The remaining failures identify stale
generator-owned source pins, count fixtures and the checked manifest, plus a
missing `ptr-state-inspect` entry in the sealed verifier's exact operation list.
The structural declaration now includes that operation, with all eight
derived-pin membership cases passing and the activated subset unchanged.
Preserve the rejection checks. The completed preparation/check and authenticated
family above now replace those stale generated consumers. Run the affected
verification on the integrated source and read its current PR checks. Do not type
in counts/hashes or copy part of an older candidate. Development-source generation
does not replace later protected-source and deployment acceptance.

Q's read-only `ptr-state-inspect` connects the Linux workflow, recovery gateway,
private signer and existing auth-bridge observer. Its authenticated, pinned PTR
projection remains private. Current observation cannot replace historical
import/owner evidence or authorize an update. Service unit tests, both service
type projects, all seven Worker runtime suites, compiled caller checks and root
types passed for that implementation. Q's hosted service, native-contract and
CodeQL checks passed. Its Linux job `103572463255` later failed 90 cases across
nine suites because the expanded source inventory was not accepted by the
derivation/path validators. The bridge/observation runtime had no independent
failure in that result. PR #240 carries the inventory correction and must prove
the affected downstream consumers as well as the focused runtime cases.
The signer and gateway are not deployed, and the live bridge lacks their
observation bindings. Preserve G001 public authentication in the later rollout.

The owner's continuous-sync follow-up now requires immediate reviewable
checkpoints, including bounded unfinished work before switching work items.
AGENTS, contributor guidance and the canonical development/sync procedures agree;
the existing 15-minute app check has the same rule and remains a fallback. Its
stale main-only input wording is corrected: an active build retains its exact
published compiler input, including an authorized development commit. Fresh
owning-remote fetches found the profile, assets, water-engine and private editor
checkouts clean and equal; all nine local development branch histories are
already backed by live branches or retained PR history. The navigation follow-up
also synchronized Water Engine main `9d42fb7` and Assets main `4a47038` after
PR #34's required checks and normal signed merge. Current entry links now avoid
the retired prepared-keep branch. Use
the current live PR head for the latest source; a development push is not a
release or a pass for checks still running.

At this historical checkpoint, the bridge deployer could install PTR and canary
settings but not recovery observer bindings. Later source added the observer to
the same preserving prepared upload; the current Linux caller supplies both
managed observer secrets. Do not create another bridge successor from this old
note. After the accepted prepared upload, deploy the disabled private signer
and secretless gateway in that order using the existing recovery key and RPC
secret. The bridge also reuses the existing census pepper.
Full bootstrap verification still lacks the local canary owner carrier. A bounded
metadata/provenance audit found no retained authenticated owner record from which
to reconstruct it. The public Mini App association and expected-FID boolean serve
different roles and cannot supply that identity. The existing protected secret
remains usable by its workflow lane without disclosure; do not make local
plaintext reconstruction a new requirement for that lane. The
authenticated account's GitHub Apps settings showed no registered Apps during
this review. The owner subsequently completed GitHub's “Confirm access” step.
The private “Warpkeep Release Evidence” App
form is prepared with read-only Actions, Checks, Contents, Deployments, Metadata
and Pages access, webhooks disabled and installation restricted to the owner's
account. Creation/installation on only `ael-dev3/Warpkeep` and service-key
generation await the requested action-time confirmation. The dedicated
installation/key supply remains unresolved; no App or credential was created.

Existing-state adoption is a distinct V4 path. The connected private capture is
implemented with focused Windows, Workerd and native acceptance; bridge state, activation and recovery
consumers remain unfinished. The implementation keeps the standalone observation
contract and V3 completion/terminal bytes intact.
Collect a separately typed update observation inside `ptr-update-apply`, after
the authentic claim and before submission. An adapter-owned private sidecar keyed
by the claim-record digest retains that exact pre-observation. After genuine V3
completion and terminal records exist, collect post-observation binding the exact
pre-JWS, completion and terminal digests. A separate V4 adoption envelope reopens
the opaque completion and both signed statements. This avoids a circular digest
dependency or replacing a missing pre-observation after an effect.
Bind source, candidate, inspection, predecessor and claim throughout; distinguish
the current reconciliation job from original claim/terminal identities. The distinct
fixed `operate_ptr` verifier and apply-only observation permit do not widen
`observe_ptr`; never dispatch the standalone job inside shared concurrency.
Compare owner/atlas/admission commitments under unchanged observer configuration
and pepper scope. Historical signature validation authenticates retained data;
new effects still require fresh evidence and actual-clock checks after awaits.
Do not synthesize import/provision history or claim equality of every gameplay row.

The synchronous claim-binding reader shares the genuine claim validator and does
not extend its callback lifetime. Remote pre-capture occurs before entering the
provider's bounded `beforeSend` callback. That callback reopens the original signed
pre-state, checks the actual clock and claim expiry, then writes the unchanged V3
submission. Both observation sidecars are immutable and keyed by the authentic
claim-record digest under `runtime/ptr-update-observation-v4/<PTR>/`. The separate
adoption file uses the authentic completion-receipt digest under
`runtime/ptr-existing-state-adoptions-v4/`. A missing pre-state after an effect is
a refusal, never a new pre-capture. A retained authentic post may be reopened after
its freshness window because it is historical evidence, not new effect authority.
The runtime awaits post-capture and persistence before disposal; an already
completed update can retry failed evidence persistence without repeating its PUT.
The shared `operate_ptr` job receives OIDC capability for inspection and apply;
only the actual apply claim and opaque apply-only permit permit this client path.
The service authenticates the named job, not an unproven workflow input.

PR #236 passed every required check at `92d363ce` and merged by the normal
protected expected-head squash into signed, verified main
`a2929bb6a3646b2812eacc7482e056eb1abb8be3` (N3). Its tree
`8d39fe13fa18a22bfca698ae3d9bcc9624c98a7a` exactly matches the reviewed PR tree;
its sole parent is M2. Main Verify `34701912470` is still running. PR #237
automatically retargeted main and remains at `7bc5992c`; PR #238 is `23ec4731`,
and PR #239 is Q. Resolve their live status before integrating the remaining
source. Reconcile published ancestry normally; never reset or force the stack.
Windows and the clean idle native checkout matched Q before this new repair.
M2's full main Verify and sealed preflight are historical evidence for M2;
N3 and later source need their own checks and fresh generated family.

The published follow-up on `codex/0.4-frozen-source-test-isolation` separates four
independent frozen-source mutation checks into named Linux cases. Historical R
main Verify `34694304468` exceeded the default ten-second budget only in the
combined four-materialization callback; no behavioral assertion failed. Each
case now retains that default budget, its original rejection assertion and a
destination-retention assertion, including the previously missing inode check.
The shared cleanup and production materializer are unchanged. Native session
`93630` at original `e18cf0c5` passed all 11 tests without skips in 20.92 seconds;
the four split cases each completed in under one second. T2 has exactly the same
tree. This focused pass does not establish a full CI pass for either source.

Runner availability source `e57b5e38` is published in PR #237 on
`codex/0.4-runner-availability`, stacked on navigation `e6fca66f` / PR #236.
Windows and the clean idle native checkout were verified equal to its live head.
GitHub runner 22 was offline
because `WarpkeepRunner` had stopped; the enabled service started normally when
the guest opened. Its existing Windows keepalive task had exited with code 1.
The task was recovered, given an indefinite execution limit and a recurring
single-instance retry, then restarted under the new definition while idle.
GitHub reports it online again. Use the [runner maintenance procedure](../../operations/0.4.0-linux-runner.md)
to distinguish scheduling, guest/service health and actual GitHub availability.
Preserve active jobs; disable recurring starts before planned maintenance.

The published operational correction changes no generated family or game authority.
The existing M1 candidate remains retained after PR #235's integration. The receipt
integration
audit below is now recorded in [release and infrastructure](release-and-infrastructure.md#existing-ptr-evidence-continuity).

PR #228 merged normally at 11:30:54 UTC to signed main
`c4b95505b73705d120aff3f3318d2bd5151f6565` (**M1**). Its tree
`24f5ceb4e36814b0a2bdb691adb59591db676611` exactly matches reviewed `820e6111`.
Verify `34688961992` and CodeQL `34688961994` passed at that reviewed source;
the old remote branch was retired. Both annotated source-history tags remain
published, including `source-history/warpkeep-0.4-pr228-820e611148db`.

Main push Verify `34691247637` then failed its full-history Gitleaks step before
Linux tests. The exact public-Git-ID repair passed its real positive, mutation and
wrong-path regression, the complete history scan, owning tests and documentation
checks without weakening the history command or `.gitleaksignore`. PR #234
normally squashed that reviewed repair at 12:40:13 UTC into signed, valid main
`2dc1f519` (**R**), tree `7fdff63`, with M1 as its parent.

Native M1 preparation session `30088` and independent check session `8359` both
exited zero with every recorded field equal for candidate
`release-workspace-99438dc2cc576e073df09bc44f930bc6`. The authenticated family
was exported from exact M1 and all 102 output files, their bytes and Git objects, and preserved
source paths were checked. Generated checkpoint `654f1b57` incorporated the
published repair, then exact `3c4eb264` incorporated protected R without changing
tree `93a976b0`. The native checked-in sealed-launch and prepared-policy verifiers
passed again at that final checkpoint. CodeQL `34694406081` and Verify
`34694406086` both passed at exact `3c4eb264`. PR #235 then merged normally by
protected expected-head squash at 13:33:31 UTC into signed, valid main
`7b102f9f` (**M2**), whose sole parent is R and tree exactly equals `93a976b0`.
The actual M2 main push Verify `34696760924` reached terminal success. The first
sealed dispatch `34699447213`, created at 14:29:45 UTC, then passed its real
`operate_readonly` job `103568496530` and returned exact `preflight-inspected`.
Live protected main remained M2. The earlier R timeout is separate from this pass.
Earlier Verify
`34693755154` at `654f1b57` was cancelled by the later publication and is not
terminal evidence for the final head. No protection or release gate was weakened.

PR #236 publishes the separate desktop-navigation source `e6fca66f` on
`codex/0.4-keep-navigation`, based on `3c4eb264`. It makes the existing top
navigation visible on desktop and resets the compact-media bottom margin,
preserving the mobile layout. Actual desktop, portrait, landscape and narrow
browser checks covered the buttons, panel close, opener focus restoration and
horizontal overflow; 88 tests in four suites passed in session `27992`. Its full
outgoing scan, explicit publication and Windows/native/live equality passed.
GitHub retargeted PR #236 to main after PR #235 integrated. The normal ancestry
reconciliation and its propagation through later stacked PRs are complete,
with unchanged reviewed trees and the published heads recorded above.
The CSS is a protected-closure source change and
needs normal source integration followed by a fresh generated closure before any
later deployment.

Do not repeat M2's completed preflight to obtain authority for later source.
Continue the reviewed product/observation source integration, its exact main CI
and fresh generated family, alongside the authentic service configuration and
existing-state adoption work. Keep the clean idle native checkout synchronized with the current
published development head while the M1 candidate, journal and artifact
remain retained evidence. No live release is established.

### Pre-merge route correction

Hosted Verify `34686939701` at published `48a38b0f` failed two route integration
cases after 10,524 root tests passed. Both still expected the retired unavailable
pending message, although the funded keep now correctly remains visible. The
same two failures reproduced locally. The corrected test checks accessible pending
feedback inside the retained Resources region, the same command panel and disabled
confirmation, preserved City Mill selection, and the original exact-one-build,
atlas revision and back/history behavior for Mini App and browser. All 113 tests
in five affected route/screen/scene/accessibility/controller suites then passed
on pinned Node 22.22.3. No production behavior changed. Include the real route
suite in future keep-phase verification. Its terminal hosted success and protected
source promotion are recorded above; later main checks have their own authority.

The latest delivery correction fixes two integration defects exposed by hosted
Verify at `a7e19376`: the bundle engine still required the retired PTR home
literal, and aggregate workflow regex counts concealed a missing job timeout.
The exact transform now agrees with `/home/warpkeep`. Workflow policy parses
every job, including underscore IDs, and the refusal-only unsupported job has a
five-minute limit. Native verification passed all 127 affected tests without
skips; the [release engineering record](../../evidence/0.4.0/release-engineering.md#bundle-path-and-workflow-timeout-correction--2026-09-12)
owns the failed run, checks and limitations. The prior run is not green: its
Linux job failed before the subsequent source push cancelled the module job.

The latest product change preserves the last confirmed keep during a pending
command. The actual renderer, resources, selected draft and panel remain mounted;
mutations remain disabled until an authoritative read restores ready. A concise
pending status sits inside the measured resource header, visible at scrolled
confirmation on portrait and short landscape. Initialization without a confirmed
view, uncertainty, failures and expired sessions keep their unavailable behavior.
The [visual evidence](../../evidence/0.4.0/visuals.md#2026-09-12-pending-command-continuity)
records the reproduced defect, browser checks and their limitations.

Real provider inspection confirmed the fixed PTR identity, while its metadata
owner differed from the saved CLI login. A bounded follow-up classified the SQL
403 as `INVALID_PTR_OWNER_SESSION`, the application's session gate. This does not
prove provider update permission or denial. No atlas or owner state was obtained,
and no update was attempted. Inspect game state with genuine Warpkeep admin/owner
session authority and verify provider update authority separately. Preserve the
existing configuration and PTR state. The
[provider evidence](../../evidence/0.4.0/release-engineering.md#ptr-provider-read-and-unresolved-account-authority--2026-09-12)
owns the exact result; a refused read must not become an assumption of empty state.
The existing protected environment contains the workflow's secret entries, but
their presence does not establish validity. Source/UI work can continue while
access is verified. Remaining delivery work is
authenticated import/adoption continuity, owner/live caller composition, protected
source/family promotion and real preservation/owner/device acceptance. Overall
development remains approximately 65%; this is judgment against the full release
outcome, not a test-count score or a shipped-release claim.

The UI checkpoint `05c9e0f3` and bundle/workflow correction `48a38b0f` were
published, with Windows, GitHub and the clean idle native checkout verified equal.
The route-test correction was published as `820e6111` and integrated through
PR #228 after terminal checks. Continue each new change through the
[sync procedure](../../operations/0.4.0-development-sync.md), recording its actual
working PR and preserving active native inputs and retained evidence.
The retained `8033e01c` family predates this UI source and the Linux PTR caller;
the exact M1 result now owns PR #235's generated family and remains bound to M1.

The retained candidate also passed a fresh locked integrity check and an isolated
Git-index patch roundtrip. Existing assembler primitives support export without
another clone or a new CLI. Follow the
[integration procedure](../../operations/0.4.0-local-release-preparation.md#integrate-the-reviewed-source)
with the actual M1 prepare/check identities; do not reuse historical confirmation
values. That historical operating-path proof did not replace the fresh M1
prepare/check/export recorded above.

## Linux PTR workflow and preceding publication

The Linux production caller now connects `ptr-update-inspect` and
`ptr-update-apply` to the existing source-built artifact, fixed PTR provider,
continuation and completion-record path. The dedicated `operate_ptr` job has
read-only GitHub permissions, exact main/source guards and fixed cache/CLI/private
config paths; it does not receive OIDC or bridge/admin secrets. The CLI and
workflow evidence bind these operations to that job. The PTR constructor now
requires the installed `warpkeep` account, UID/GID 1000 and pinned Node mode
`0500`, retaining canonical-path, ownership, byte and re-attestation checks.

Tests first reproduced the missing input/evidence route and retired-runner
contract. All five affected suites then passed all 191 tests on native Linux
Node 22.22.3, with no skips (session `83875`, exit zero), using a checked ten-file
overlay over `33de0387`. Its exact paths were restored after verification; no
private credentials, provider state or generated family was changed. Windows
passed 104 CLI/evidence/dispatch tests, 36 lifecycle tests and 12 workflow tests;
its 39 Linux-only workflow cases were subsequently covered by the native pass.
The [Linux operating guide](../../operations/0.4.0-linux-runner.md#existing-ptr-module-updates)
owns the concrete path and credential requirements.

The private Linux CLI configuration has now been provisioned from the owner's
existing local configuration using an exclusive, checked process pipe. Both
pinned CLI binaries and config bytes/metadata were verified, and captured local
`login show` output confirmed a readable login without exposing credential or
identity values. This does not prove provider permission, current token validity
or PTR ownership; do not recreate or overwrite that existing config.

This source integration was published as `a7e19376`; it is not an executed PTR
update. All 191 tests also passed on the final committed native checkout in
session `83911` (exit zero). CodeQL `34684939137` completed successfully; Verify
`34684939145` was still running during the pending-keep work. Read the actual
published head's checks rather than carrying earlier results forward.
Follow normal source/family promotion.
The retained `8033e01c` generated family does not cover these runtime changes;
the [promotion sequence](../../evidence/0.4.0/release-engineering.md#protected-promotion-and-historical-source-retention)
requires preparation and independent checking from actual main ancestry before
protected use. Do not run apply until genuine credentials, predecessor state
and required recovery evidence are established. Inspection itself writes private
inspection/continuation records, although it performs no database update.

The next integration is the PTR import/owner/live caller. Import currently accepts
fresh-publish authority only; support authenticated completed existing-update
authority without fabricating a publish receipt. V3 intentionally supports
current-source initialization. Existing historical import/owner receipts, if
present, must retain their original bodies and source coordinates and obtain
authenticated continuity/adoption authority. Inspect actual private state before
choosing initialization versus adoption; never assume the owner is absent or
recreate an existing owner. The current-source restriction is already recorded
and tested, rather than a newly introduced regression.

The [sync procedure](../../operations/0.4.0-development-sync.md) now resolves its
example branch/PR dynamically, describes new-branch scan bases and clean idle
fast-forward updates, and makes contaminated outgoing-history recovery explicit.
The related repository agent guides and existing periodic check also enforce
immediate publication; their actual remote checkpoints remain in the external
handoff. Keep the complete 0.4 goal active; source and fixture progress does not
close owner, preservation, visuals, performance or release acceptance.

## Activation lifecycle correction and preceding checks

Verify `34680474756` at `2615518e` exposed a single failed root-test suite:
the activation lifecycle fixture supplied opaque authority stubs to the newly
connected real bridge-provider constructor. The corrected fixture now mocks
that boundary, asserts provider-to-state wiring and checks evidence revocation
before resource preparation on provider failure. Its ten previous cases remain,
with one new failure-path case. The runtime, real provider and auth-bridge-state
suites passed all 177 tests on pinned Windows Node 22.22.3 (session `18025`,
exit zero); explicit application/test types and independent review passed.
Production authority checks are unchanged. The
[release engineering record](../../evidence/0.4.0/release-engineering.md)
retains the failed hosted batch and corrected scope. The correction was published
as `33de0387`, and Verify `34682368968` and CodeQL `34682369009` completed
successfully. The subsequent PTR caller needs its own publication checks. Do not rerun source
preparation for this test/documentation-only follow-up. The immutable tag at
`2615518e` already retains the required historical operator ancestry.

All 36 saved mobile/desktop PNGs from `8033e01c` have now been reviewed. The
[visual record](../../evidence/0.4.0/visuals.md) owns the remaining desktop action
discoverability, small-building hierarchy, scenery and cropped-view findings.
This completes the saved-image review, not device, interaction or owner acceptance.
Continuous publication also resolves the authorized branch through future merges:
the existing 15-minute check was updated in place, Windows now tracks its verified
`upstream` publication remote, and maintained repositories were freshly fetched
and clean. Follow the [sync procedure](../../operations/0.4.0-development-sync.md).

The shared bridge provider is connected to the sealed activation workflow.
Recovery authenticates original uploaded bytes, preserves the complete retained
authority chain and samples elapsed time through provider reads and receipt
expiry. Source `44b91b94e401ed51512e11ca786bd04f8413d112` passed all 519 tests
in twelve affected suites on Linux as `warpkeep` UID 1000 with Node 22.22.3
(session `18870`, exit zero). The earlier Windows pass covered 193 tests with
42 platform skips; native verification completed that scope.

Hosted Verify `34675180672` exposed older update/dispatcher fixtures missing the
required test capability. The correction in `7cb573ba` preserves the production
constructor and passed 196 native tests; its one intentional skip is the
unsupported-runtime rejection inside the supported namespace. The test-only
follow-up `132355e0` replaces HTTP fixture URL-prefix routing with exact parsed
origin and route checks. Its 43 tests and strict types passed, and both CodeQL checks
succeeded. These results do not establish CI success for the generated-source
checkpoint that follows them; read that head's own required checks.

Native preparation `90120` and independent check `72208` both exited zero from
`7cb573baab40e54f52ab2aeb26c56c9e8f1cf9f5`, reproducing candidate
`release-workspace-326aab0c728dd07f02faa1969a94c7eb`. Both processes are terminal.
The guarded export authenticated every generated output and retained backup,
checked the full source/candidate trees and closure, then copied only the 17
changed generated bodies. The other 85 outputs, Windows HEAD/index and the
published `132355e0` test fix were preserved. The
[release engineering record](../../evidence/0.4.0/release-engineering.md) owns
exact transaction, family and closure identities, including older candidates.
`finalReleasePrepared` remains false: this is reproducible source preparation,
not a live release. Test-only and ordinary note changes do not alter the recorded
compiler input or require another preparation run.

The generated checkpoint `60097dd7` was scanned, published and synchronized to
the clean native checkout. Its closure and preparation classification passed
with Pages `sealed-launch-blocked`, and the eight selected suites passed all 87
native tests.
These results complete the scope that Windows could not verify: its earlier
invocation returned 62 passes, 12 skips and 13 POSIX-boundary failures. Windows
build-mode types and file-size policy passed; its closure CLI correctly refused
the unsupported platform.

The full prepared-workflow suite (session `36364`, terminal) passed 156 tests and
failed three because static policy still expected the old API-token, reviewed-B0
and PTR source counts. The correction binds credentials to their owning calls:
source inspection receives the Cloudflare token, and live inspection also
receives the admin token. The baseline and six credential-relocation regressions
passed natively in session `34162`; 156 tests were deselected. Strict TypeScript
also passed. The full suite then passed all 163 tests on clean native source
`72aee27e8dc165994d3893bed9b9151330b8c9f2` in session `75371`, with no skips.
Independent policy
and Linux PTR-variable wiring reviews found no further defect. The temporary
native overlays were restored, leaving the published checkout clean.

Preparation in that same session emitted its completed candidate result for
`release-workspace-3e7657772125faa459d4fa2d50e96fe0`. The outer shell then exited
one because of a trailing carriage return after the successful Node command.
Do not label the wrapper successful. The candidate is retained without an
independent check or export: the subsequent mobile layout changes two raw-hashed
closure members, so that candidate cannot cover the new UI source. Its exact
identities remain in the release engineering record. No active native process
remains from session `75371`.

The mobile entry correction moves the full loop rail below the workspace,
compacts resource and scene controls, and keeps exact balances and primary
actions visible. Its five affected suites passed all 64 tests and build-mode
types passed; local synthetic portrait/narrow/landscape views were inspected.
The [visual notes](gameplay-and-visuals.md) retain the capture limitations and
remaining composition work. No authority or gameplay mechanic changed.

Source `8033e01cc911f510fafb1770fdb0c0f0f3d2b3ac` was scanned, published and
synchronized before native preparation `35471` and independent check `7224`.
Both commands now exited zero with exactly matching candidate identities.
Guarded export `78755` also exited zero: seven generated manifest/pin files
changed and 95 outputs were preserved. Compiled bundles, bindings and test
consumers did not change. The release engineering record owns exact identities,
the public B0/admission observations and the source-bound verification scope.
Use LF-only Linux stdin and preserve the native command exit status. Verify the
published clean native closure, preparation policy and Pages `sealed-launch-blocked`
classification. Do not repeat the unrelated full policy suite for these generated
identity changes. Read the published head's own terminal hosted checks.

Protected promotion requires two normal squashes. First retain the reviewed PR
source ancestry with a remotely verified non-release `source-history/` tag:
automatic branch deletion would otherwise remove the normal fetch route to the
historical operator checkpoint used by the preparation projection. Squash the
checked source to main **M1**, then prepare and independently check actual clean
M1. Promote only its generated family through a second protected squash to **M2**.
After M2 Verify succeeds, dispatch preflight at M2. Its manifest source M1 must
remain an ancestor; no preparation from M2 is needed merely for that generated-only
commit. Do not deploy from interim M1 or alter protections to skip this source rule.
See the [promotion sequence](../../evidence/0.4.0/release-engineering.md#protected-promotion-and-historical-source-retention)
for exact operations. Record the actual tag/CI/promotion results in the PR and
existing external handoff until the next substantive commit.

After M2 verification, execute the existing protected read-only `preflight` and genuine
provider reads. Re-attest the retained B0 predecessor before initial prepared
bridge deployment. That existing deployment caller owns its durable journal and
receipt lifecycle, including B0 re-attestation and provider postflight; empty
Linux private roots do not require copying an old Mac prepared journal. Do not
rerun B0 or invent retained evidence. Complete the missing realm import and owner
producers, then obtain actual owner, preservation, recovery and device evidence.
The [workflow audit](../../evidence/0.4.0/workflow-sufficiency-audit.md) and
[recovery record](../../evidence/0.4.0/recovery.md) distinguish implemented callers
from remaining live acceptance. Keep G001 preserved and G002 sealed throughout.

The Linux PTR routing and account gaps identified at this earlier checkpoint are
addressed by the current integration above. Actual protected execution remains
unverified. Continue with genuine existing-update/adoption authority for import
and authenticated owner/live resolution; source composition is not provider proof.

Continuous publication is required in `AGENTS.md` and the
[sync procedure](../../operations/0.4.0-development-sync.md): commit and push
each completed development change and all authored durable work at handoff.
The 15-minute thread check supplements immediate publication. Synchronize clean
idle native checkouts after active runs finish, preserving private state and
immutable candidates. Reuse existing storage; create no Desktop output.

The placement fix inverts the native SVG screen transform and ignores
outside-plan taps before snapping, preserving pointer mapping with borders and
letterboxing. Chrome fixture checks passed at portrait, narrow bordered, wide
and tall layouts; keyboard movement remains covered. This is local browser
evidence, not owner or physical-device acceptance. Countdown arithmetic retains
a regression against the old floating-point calculation; contemporary
microsecond timestamps do not already exceed JavaScript's safe-integer range.

The loop indicator keeps construction at Build until authoritative completion,
then shows Benefit when inspecting a completed improvement. Other stages are
neutral: a returning Worker does not prove a building was completed. This changes
presentation, not construction timers, costs or resource authority.

Pages uses Verify's root-suite prerequisites and serial allowance for expensive
authority tests. The Linux prepared bridge reads the public immutable PTR
identity from `WARPKEEP_PTR_SPACETIMEDB_DATABASE`; repository readback agreed
with source pins and retained creation/provider metadata. Credentials remain
secrets, and publisher/owner access still requires genuine verification. The
Linux deployment/recovery caller already exists. No observed protected squash
rejection establishes a missing local signing key as a blocker. The recorded
public bridge attestation reports B0 source `308f901d`; it does not prove private
receipts, current Cloudflare bytes or live 0.4 acceptance.

## Historical verification checkpoint — 12 September 2026

The recorded synchronized development head was
`95945beaae12e31a3516b6ad42511fe8cff63ef4` on
`codex/prepared-keep-bindings-fix`. This documentation checkpoint aligns the
agent-facing evidence with the latest source/test head; the reviewed runtime
source and native preparation input remain unchanged. The complete
`authBridgeNotificationPreparedWorkflow.test.ts` suite passed 159/159 under
the dedicated `warpkeep` UID; a root-UID invocation is intentionally invalid
for this permission-bound verifier and is not counted.

GitHub Verify run `34665737857` completed successfully for this head, including
Linux, SpacetimeDB, release-recovery, auth-bridge, native-contract, and the
aggregate verification job. CodeQL run `34665737866` also completed
successfully. This evidence is source/test-head-bound; any later branch commit
requires its own terminal checks before treating R14 as complete.

At that checkpoint, the Windows checkout, GitHub development branch and native
WSL checkout were synchronized on `codex/prepared-keep-bindings-fix`; the
source checkpoint used for native preparation is
`03cb8b8fc2c0c59bcb58c4303b2082dead6325d9`; the reviewed
runtime source checkpoint is
`24e3c136fb5e3839b00c8e8ddb3c780b6f795461`. The Keep04-focused local suite passed 10 test
files and 139 tests, the PTR gameplay surface suite passed 33 tests, and the
Greater Realm world/RealmMapScreen suites passed 45 tests. A narrow local browser
pass also confirmed the title, menu, realm directory, sealed G002 state, and
fail-closed G001/PTR messages are legible and coherent; this is rendered smoke
evidence, not physical-device or live-owner acceptance.

The runtime bootstrap remains deferred behind a React lazy boundary: the initial
application chunk is about 3.9 kB (down from about 899 kB), while the interactive
runtime remains deferred until the gateway is entered. The Worker review panel
keeps internal `locationId` in the authority-bound dispatch payload but does not
render it to players; resource labels use the resource site and coordinates.
Native Linux `prepare` and independent `check` converged on candidate
`release-workspace-2d70e1808817fcf50990e5a4b84409b9` with family digest
`841eb93123b88508d82febe883966722d0ffffe46c0cd84b36666a6ed4d2deee`, closure
manifest `689dc56ab6ae708958093b6c8ffb89dcb7fd4671de82261f1c3bdc77ed4a7f77`,
scanner manifest `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`,
and 1,200 protected members. `finalReleasePrepared` remains `false`.
Verify and CodeQL are attached to the current PR head; read their live run IDs
and terminal state from GitHub before claiming R14 complete. No
authenticated provider deployment, recovery readback, owner journey,
physical-device result or live release is claimed. The existing Desktop handoff
was updated in place; no new Warpkeep Desktop file, copy, backup or archive was
created.

Build a persistent strategy world around **gather → choose → build → benefit → return**.
The GitHub/profile/ecosystem refresh is complete. Continue the connected game and
delivery work; substantial implementation is present, but 0.4 is not yet a verified
live release. The current user's direction takes precedence over historical plans.
The dated [workflow sufficiency audit](../../evidence/0.4.0/workflow-sufficiency-audit.md)
is the compact read of what is ready for development and what still blocks a ship.

## Workspace output direction — 2026-09-11

The owner requires no new Warpkeep files on the Desktop and limited storage
growth. Follow the repository-wide
[output and retention rules](../../engineering/development-workflow.md#output-locations-and-retention).
Update existing notes, reuse checkouts and attested caches, keep disposable
non-sensitive output under ignored `artifacts/`, and create the final package
only at `artifacts/delivery/0.4.0/`. The legacy `desktop-handoff.md` filename is
retained solely for link compatibility. Older Desktop delivery/export directions
are superseded; the existing external handoff may be maintained in place without
new sibling backups.

The September 11 storage inspection found approximately 39 GiB in native
release-preparation `runs/`, 127 MiB in its cache and 461 MiB in its toolchain.
These are dated observations, not permanent budgets or evidence of disposable
content. No authoritative candidate or journal was deleted. Inspect retention
and peak host/guest space before another preparation; do not repeat a full
prepare/check cycle solely for this documentation change.

Verification: all 206 local Markdown links in the changed documents resolve,
the existing handoff suite passed all three checks on Node 22.22.3, and
`git diff --check` passed. The delivery destination is Git-ignored. This update
changes workflow guidance and acceptance destinations; it adds no automatic
deletion service and makes no new runtime or deployment claim.

## Prepared source checkpoint — 2026-09-11

The generated source family was integrated at
`7d920b9f57ec450071632fdc3f0b560f7526811a` on
`codex/prepared-keep-bindings-fix`. Its native preparation and independent check
used committed input `713c2bfb7d5b0cb00028c3553089d60b53e2897b`.
Read the current local/GitHub heads through
[source synchronization](../../operations/0.4.0-development-sync.md); later
documentation commits are not new preparation inputs.
The Pages private deployment job now uses Linux x64, and closure
pin derivation resolves the Linux and Darwin workflow profiles independently.
Native `prepare` and independent `check` passed for that input source. The
converged candidate is
`release-workspace-69a975071850f1e562b593ffa811904e`, source tree
`2b23068063945029e439dbeb85bf4fa6b80b9735`, transaction
`5b1ab812dba7456e6c84493fe741efa4`, family
`c6c45376b8662f58f602d59c7f41912ebdde6bb4856d519d8a0cdc65e975c67e`, and
closure manifest
`c92fc469e86ca8ee285c4057901a9bd41c1be982283d04a82196cf541433702f`.
The candidate remains preparation evidence only, with `finalReleasePrepared: false`.
The protected Verify and CodeQL runs attached to the current PR head are the CI
authority; read both at terminal state before claiming CI complete. This
evidence still does not establish provider deployment, recovery readback, owner
admission, physical-device performance or final release approval.

### Linux prepared notification lane — 2026-09-11

Commit `36369e712fa719ce8b0cc2afd2fb181104a80b1c` adds
`.github/workflows/notification-bridge-prepared-linux.yml` and
`scripts/auth-bridge-notification-prepared-linux-runner.mjs`. The lane uses the
owner-only Linux x64 runner, fixed Node 22.22.3, a reviewed pnpm 11.7.0
wrapper and isolated store, then rechecks GitHub workflow authority before any
credentialed deploy or read-only recovery call. The protected source closure is
now 1,199 members; its current manifest SHA-256 is
`c92fc469e86ca8ee285c4057901a9bd41c1be982283d04a82196cf541433702f`.
The lane is source-verified and pushed, but no authenticated production run or
recovery readback has been recorded. Pages private delivery has since moved to
the Linux x64 profile with per-workflow closure pin derivation. B0 and the
legacy prepared caller remain on Darwin until their executable/path migration
is separately reviewed.

The checked-in `sealed-realms-production.yml` routes only `preflight`,
`g001-policy-observe`, and activation evidence operations to the installed Linux
authority. G002 publication/import/live operations and PTR publication,
import, owner-provision and live operations remain explicit fail-closed
`unsupported` cases until their authenticated provider and owner receipts are
available. This is the intended 0.4 safety boundary, not a completed live
release workflow.

## Workflow audit and runner repair — 2026-09-11

The workflow is usable for continued development but is not yet sufficient to
ship. The interrupted dedicated runner installation has been completed:
`WarpkeepRunner`, `warpkeep` UID/GID 1000, and existing GitHub runner ID 22 were
verified online/idle with the service enabled/running. Empty sealed private roots
were provisioned without credentials or receipts. This supersedes the older
offline/systemd-pending observations below; no protected dispatch was attempted.
WSL subsequently stopped the guest when interactive commands exited. A hidden
Windows process holds it open for this session, and the per-user scheduled task
`Warpkeep Runner Keepalive` now starts the same hold at interactive logon.
Post-reboot, pre-logon and host-sleep availability are not established.
Use the [current runner guide](../../operations/0.4.0-linux-runner.md) for the
exact account, maintenance commands, evidence and remaining work.

On September 11, a read-only `preflight` dispatch was attempted against
protected `main` using its exact SHA `9eb98e78bc975e29ced16d92c2060ab833ad9b46`.
GitHub returned workflow-not-found because `sealed-realms-production.yml` is
present on this prepared branch but not on that protected main revision. The
protected preflight therefore becomes runnable only after the prepared branch
lands; branch-local workflow bytes are not live authority.

The actual G001 policy workflow exposed a CLI defect: `g001-policy-observe` was
supported by the dispatcher but absent from its executable parser. The parser
now uses the dispatch operation map. The new fresh-process regression reproduced
the input failure before the fix, then reached the required host-attestation
failure without runner context. Unsupported operations still fail before host work.

The protected closure then exposed a second real drift: the checked-in inventory
omitted `src/components/keep04/Keep04LoopRail.tsx`. Commit `65f6541d` refroze the
generated closure and all count consumers at 1,195 members; commit `c0e30a37`
regenerated the manifest and workflow pins from the native Linux bytes so
Windows CRLF checkout differences cannot invalidate the Linux authority. The
native runner completed `prepare` and independent `check` at `c0e30a37`, each
checking 3,181 source/candidate files and 101 generated outputs. The durable
candidate remains local preparation evidence only; it is not a deployment grant.

After the first documentation-only publication at `7a542a33`, the same two
lanes were rerun against that source and passed with candidate
`release-workspace-447cff3cb663d042a1c10db14e426213`, source tree
`c1152bd3697fe77fda63552daf79edaf13278aaa`, and the same file/output counts.
The follow-up `be43114b` changes documentation only; it is synchronized in all
checkouts.

Linux recovery Pages and activation-generation callers already exist; generation
has job OIDC. The remaining integration is genuine recovery service deployment
and authenticated readback: the recovery bridge projection still relies on the
legacy prepared receipt/journal chain, and activation's deployment, binding,
import and owner attesters remain unavailable. Do not treat an offline bootstrap,
new runner labels or registration as replacement evidence. R11–R13 remain open.

## Earlier source checkpoint — 2026-09-10

The preceding published implementation checkpoint was
`5b9ba9657d6e66319f41aabd396faf2a6c947b29`, with functional source at `c4ad7539` and the Windows QA repair at `84c35a5e` on
`codex/prepared-keep-bindings-fix`. It includes
the bounded Keep04 moat surface,
current reference-to-source notes, the Windows browser-runtime adapter, the
Vite watcher boundary that keeps disposable Chrome profiles out of the source
watch graph, local-output ignore rules, Windows-connected local QA hardening,
realm-selection-aware browser journeys, redundant Inner Keep scene-reconcile
throttling, private-sync retry telemetry, resource-catalog disclosure/pagination,
fresh-browser re-entry diagnostics and the narrow WebGL teardown-warning
boundary. The latest release-rail commits also make the private TypeScript
loader fixture-CWD safe, keep the native operation-bundle import outside Vite's
static resolver, refresh the sealed package/lock identity pins, and refreeze the
1,195-member notification closure. Historical checkpoint labels retain their
original scope and are not current-source claims. The current Verify and CodeQL
runs attached to PR #228 are the R14 authority; read their live conclusions
before release. Local source and protected test rails pass. No live release,
physical-device acceptance or owner journey is claimed.

## Connected journey checkpoint — 2026-09-10

The disposable Windows full-stack lane passed on the functional source checkpoint.
It covered the title gateway,
restored Terms continuity, synthetic cold auth/bootstrap, Inner Keep setup,
four-worker dispatch, outbound → gathering → returning re-entry, private-read
failure/retry seams, timeout/missing/torn/visibility cases, individual recall,
Recall All, automatic settlement and released-node reuse. The visual aggregate
contained both cool high-albedo and warm low-green samples with no clipped
black/white samples. Static security is green at 50/50 after the current head;
rerun the connected lane after any further source change before declaring release evidence.

The handoff's full inspiration set remains the 0.4 visual rail: owner voxel
engine, Verdant Forest, Pelagic Ocean, Dream Loop/Vesper, terrain and atmosphere
research, Townscaper/Tiny Glade settlement language, Mapgen4 geography and the
secondary rendering studies. These references shape composition, palette,
material response, terrain hierarchy and review method; they do not introduce
copied code/media, deep simulation, freeform editing or arbitrary content counts.

### G001 history and the reviewed operator refreeze

The G001 adoption history still anchors the frozen module and its original
build recipe at `d945256b217fa13ade944b9ed9880e8463b46123`. Four shared operator
helpers were subsequently refactored for the current Linux/Windows delivery
rails: `greater-realm-production-provenance.ts`,
`greater-realm-production-transport.ts`, `hermes-admin.ts`, and
`spacetime-cli-attestation.mjs`. The sealed-launch verifier retains the complete
historical projection and, when those four bytes differ, requires every other
projection path to remain byte-identical to the historical freeze while
requiring the four helpers to match the explicitly reviewed refreeze commit
`f6036cb93711f1358eda9c7a5804457665a864c9`. A later operator change must be
reviewed and pinned as a new refreeze; it cannot pass through a broad exception.

## Windows connected local QA — September 9

The pinned SpacetimeDB 2.6.1 Windows CLI is now attested against the reviewed
CLI, standalone, and update-launcher bytes. The private snapshot uses `.exe`
members and retains canonical-path, exact-membership, byte-hash, identity, and
re-attestation checks; Windows ACL metadata is handled without weakening the
Unix mode contract. The local module copy uses a junction for the pinned
dependency tree and rewrites only the disposable copy's Genesis 001 admission
constant. Production `spacetimedb/src/genesis001AccessPolicy.ts` remains sealed.

The disposable SpacetimeDB runtime now completes publication, synthetic founder
seeding, Inner Keep setup, and process-tree cleanup on Windows. The browser lane
keeps Chrome's data directories disposable, starts Chrome before the bounded
Vite graph prewarm, tolerates slow identity/blank-target startup, and follows
the explicit realm-directory step before Terms or restored-session checks. A
connected run has passed the title gateway and restored current-agreement seam;
the current machine-level limitation is a renderer-thread stall during the
second Inner Keep project transition. The browser probe therefore remains
unpassed for this checkout even though the server runtime, focused
source/security suite (89/89), typecheck and CLI attestation suite pass. Do not
claim the full browser journey until a fresh run records it.

## Historical native artifact execution — September 9

The pinned WarpkeepRunner Ubuntu 24.04 guest executed the preceding native source
head `206c03683c9039b513b878d7b0d3c6770eda2626` (source tree
`ebc91c6cc7bf205de22e331d127b1f2f7b8ba5da`) through the native materializer and
child worker. The operation-bundle runtime completed activation, G001, G002 and
PTR lanes. The program-artifact path completed frozen G001 and current G002,
retaining exact SHA-256/Keccak bytes. The all-realms binding check also completed
successfully, covering G001 current and compatibility, G002, and PTR. Its
compact receipt is retained at `/home/warpkeep/warpkeep-all-realms-206c036.json`.

This closes the previously open local assembled-artifact execution proof. It is
still local evidence: protected GitHub workflow completion, provider deployment,
live owner admission, physical-device acceptance and the remaining R11–R13
gates remain separate requirements.

## Portrait keep framing — September 9

The portrait WebGL scene now uses the available panel width while retaining
padded controls. Matched actual-renderer synthetic captures cover empty/mature,
placement, construction, completed and fallback states. Portrait picking and
selected-site inspection worked; desktop, short landscape and fallback dimensions
were unchanged. Scene resources were unchanged, but the wider backing canvas
increased pixel area by about 7.4% at the measured profile. This is a readability
improvement, not physical-phone performance acceptance. Building/material cohesion,
final visual coverage, live owner play and deployment remain unfinished.

## Windows Keep04 browser boundary — September 9

After the current moat change, the real Windows Vite page was captured through
`scripts/qa-observer/keep04-windows-capture.mjs` as
`windows-run-q9Jo7j`. The run produced 36 bounded desktop, landscape and 390px
portrait cases, guarded all 36 document responses with the exact server CSP,
verified the installed signed Chrome identity, and verified owned-process
cleanup. Empty and completed-keep states were spot-checked at desktop and
portrait sizes; sustained frame time, memory, physical-device behavior and the
real owner/PTR route remain open.

The first attempt failed closed because Vite watched Chrome's locked profile
SQLite files and Windows raised `EBUSY`. The fix is intentionally narrow:
`vite.config.ts` ignores generated `.cache` profiles, and
`tests/keep04DocumentPolicy.test.ts` locks that contract. The report marks
`stableSource: false` because this checkout still contains unrelated local
changes; the capture is rendered development evidence, not release acceptance.

At preceding source `d6cfc5c`, native release preparation and its independent
rebuild both passed with matching source/artifact provenance. The privileged Linux
caller suite passed 31 cases; the bounded source/private-record rerun passed all
17 selected scenarios with unchanged assertions. Final release preparation is
still false. At that checkpoint, runner registration succeeded but service
installation timed out in systemd. The September 10 repair above supersedes the
service failure; protected workflow completion remains unverified.

## Linux G001 protected closure — September 9

The historical published checkpoint `5c210ce` names and verifies the
complete Linux G001 spawned-program family in the protected source closure:
launcher, materializer, child, policy boundary, receipt codecs, runtime
helpers, YAML manifest, synthetic G002 entry, workflow evidence codec and
binding-tree utilities. The regenerated closure is stable at 1,194 members;
the remaining proof is execution of that materializer/child inside the
assembled Linux artifact and the final-family run.

## Linux G001 policy integration — September 9

The Linux G001 policy integration was historically published at `a0b5060` and is
included in the reviewed branch checkpoint `75d577c8` on
`upstream/codex/prepared-keep-bindings-fix`.
That checkpoint connects the Linux G001 read-only policy lane to its receipt,
adoption, activation-record and recovery consumers. It keeps the historical
Darwin receipt profile distinct, refreshes the opaque workflow evidence scope at
the final credential boundary, and uses the fixed Linux account, private namespace,
Node toolchain and descriptor-backed secret handoff. Shared admin transport
primitives no longer import the unrelated notification/compiler chain.

The development source passed app and Node-side type checks, 21 Linux
receipt/descriptor/dispatch tests, 15 native lifecycle/descriptor tests and six
shared-admin transport tests on Windows. The independent Linux record rerun
passed all 17 selected source/private-record scenarios, and the compiled
shared-evidence identity regression passed with real Git/verification and explicit
host/filesystem/compiler/process fixtures. The broader Windows regression retains
six existing census timeouts; no full-suite pass is claimed.

The native materializer/child has not yet executed in WarpkeepRunner, the generated
release closure still needs an explicit audit that both spawned files are included,
and no provider, credential or protected workflow call has run. The dedicated
runner is registered but not online; systemd recovery remains pending. The source
is a development checkpoint, not a final-prepared or deployed release.

## Signed preparation configuration observation

The recovery service now exposes a separate signed configuration observation for
an exact reserved preparation intent. It reads deployed auth-bridge configuration
through a private RPC, rechecks authenticated GitHub source/run identity after
that RPC, and checks the disabled authorization epoch before and after signing.
It does not arm recovery or establish realm readiness. The durable reservation
receipt remains unchanged. Actual gateway/signer/SQLite composition has six
passing cases; selected service/auth tests and scoped types pass. Full auth types
still need the missing quick-auth dependency in the verification donor.

Downstream candidate consumption is unfinished: the published candidate still
lacks four inputs until the configuration observation consumer and native module
hash producers are connected. No production deployment is claimed.

WarpkeepRunner now has verified Node22 and authenticated Ubuntu package updates
matching the existing local bootstrap pins. The recovery fixture GPG policy is
aligned to the same package version and exact binary hashes. The actual Node24
bootstrap revealed an overlong GPG socket path in its private temporary directory;
the reviewed directory-name fix now retains full random entropy within the Linux
socket limit. Its focused suite and the actual Linux Node24 bootstrap pass. The
frozen G001 native lane completed both reproducible build cycles at cf1fbaa;
The new --program-artifacts mode retains exact reproducible frozen G001 and current
G002 module bytes, SHA256 and Keccak256 through the attested package path. Focused
parent/helper tests and strict types pass. Actual native program-artifact execution
at 0e0b0e4 completed both reproducible G001/G002 lanes and the pinned Keccak path.
The opaque recovery consumer is now connected to the actual candidate and workflow
lifecycle, with genuine corpus crosslinks and final preparation freshness preserved.
Its focused checks use a mocked native producer; actual native artifact production
has separate success evidence. Full authenticated workflow execution remains pending. The paired native diagnostic reached PTR and found missing
pinned archives in cache/ptr. The reviewed [PTR cache bootstrap](../../operations/ptr-local-binding-cache.md)
now follows its own committed lock with integrity and no-clobber checks. Focused
tests and types pass. Actual installation at 40b676a verified all selected PTR
archives. The normal logged paired rerun at ebd5fb1 passed both reproducible
G002/PTR lanes and binding generation. Its retained output is native build evidence,
not deployed program equality or owner acceptance.
Generated deployment closure outputs were regenerated and reproduced identically;
this is source consistency evidence, not an operating bundle or live release.

## Dedicated local Linux runner

Active local launchers, workers, cache/bootstrap paths and service fixture
policies now agree on WarpkeepRunner, user warpkeep and /home/warpkeep. Exact
UID, file modes, executable hashes, attestation and no-clobber checks remain
unchanged. The separate historical GitHub Actions runner has not been migrated.

Ubuntu 24.04.4 now executes commands as warpkeep UID/GID 1000. Home mode0750
and private build directories mode0700 are verified. Node22/24, SpacetimeDB2.6.1,
YAML and pinned operation/recovery/G002 dependency caches are installed and checked.
The cloud-init datasource disk probe stalled startup; the dedicated guest now has
/etc/cloud/cloud-init.disabled and, after restarting only WarpkeepRunner, reports
systemd running without the user-session warning. This guest-specific setting is
reversible by removing that marker when cloud provisioning is actually needed.
Native bundles and current-source preparation remain unfinished.

Independent review verified runtime changes are only the intended fixed path,
account and distro substitutions. Focused local checks passed205 cases; the
one timing failure passed on an isolated rerun at its original timeout. Seven
service checks and strict types passed. An archive-based Git-object composition
test remains unverified because it requires a physical repository. No WSL call
was substituted into those tests and no native readiness is inferred from them.

## Preparation receipts reach the recovery candidate

The generation runtime now obtains a signed preparation receipt through the
fixed workflow OIDC transport, verifies its signature and source binding, and
retains exact bytes in the owned private workspace. Its disposable capability
supplies the actual reserved request ID and epoch to the candidate. Source,
ownership, conflicting facts and receipt bytes are rechecked on reads; failure
and completion dispose the capability.

The genuine joined fixture passed and reduced missing candidate inputs from six
to four: Worker configuration identity/epoch and G001/G002 expected program
hashes remain. Receipt/transport/ownership passed 24 tests; candidate/runtime
checks passed 21. Strict types and a real operation bundle/plain-Node import
passed. Windows fixture Git I/O used a test-only compatibility adapter; production
and Linux bounds remain unchanged. The established deployment manifest generator
produced unchanged outputs; this does not prove native operating bundle readiness.

Live generation still needs the deployed preparation policy/service, workflow
OIDC permission and supported caller, remaining producers and the production
generator consumer. No live reservation, deployment or realm mutation is claimed.

## Activation-record test fixture repair

Fixed candidate and historical-context tests now build genuine G002/PTR private
release artifacts and derive their approval identifiers through production
validators. Receipt links and digests follow those generated releases. The
mandatory approval reader and its negative assertions remain intact; a duplicate
same-error read was removed without removing either assertion.

Focused strict types passed. Standalone real release generation/write/validation
passed, but the Windows integration runs timed out in candidate reads or cleanup.
No full test pass is claimed; Linux CI must establish the repaired scenario result.
This changes test fixtures only and performs no realm operations.

## Generated deployment source inventory

The established generator now includes the current PTR existing-update helpers
in the protected deployment source inventory and refreshes dependent workflow
pins and exact inventory assertions. Source bytes were compared to the published
Git blobs; accidental archive line-ending normalization was corrected before
derivation. Installed outputs reproduce identically on a second derivation.
Independent review verified raw-file digests and found no weakened checks.

The targeted PTR membership test and B0 topology checks passed. Native standalone
ownership verification and rebuilt operating bundles remain unfinished; this
manifest refresh is not proof of a deployable integrated release. Recovery service,
auth-bridge, native-contract and CodeQL CI passed on the preceding service commit;
complete root/module verification and actual owner play remain pending.

## Recovery preparation service

The gateway now exposes POST /v1/recovery/prepare through the private signer.
It authenticates the protected workflow identity and current source using OIDC
and GitHub App observations, then reserves an immutable preparation intent in
the fixed recovery control Durable Object. A separate deployment-owned policy
must explicitly enable preparation while recovery remains disabled. The signed
receipt is preparation data; it does not arm recovery or authorize deployment.
Retries preserve the first receipt, and later arming must match the reserved
coordinates. Source, epoch and token freshness checks precede durable writes.

The normalized service change passed 198 focused tests and both strict type
projects. Actual signer RPC and SQLite Durable Object checks passed before
line-ending-only normalization; the matching-manifest retry also passed against
the actual DO. Independent runtime review found no blocking issues. Broad legacy
suites remain non-green due to recorded timeout/reset and environment failures;
these focused results do not establish full regression or production readiness.

The downstream receipt-to-candidate connection, workflow OIDC permissions and
deployed preparation policy remain unfinished. Six published candidate inputs
are still missing. No preparation policy or realm was changed in production.
The dedicated WarpkeepRunner Ubuntu installation succeeded, but its first boot
failed with Wsl/Service/CreateInstance/HCS_E_CONNECTION_TIMEOUT. Native local
build verification remains pending; other projects' WSL instances are preserved.

## Regenerated sealed-launch source pins

The established source-pin generator refreshes the authority implementation,
authority declaration and PTR publisher hashes to their reviewed current source.
This repairs stale verification after existing-update and V3 PTR support. The
other generated source-pin outputs were already current. Historical source diffs
were reviewed, and independent whole-family derivation produced identical bytes.
Validation rules and hostile tests remain intact.

Source-pin derivation passed 25 tests and authority passed 21. The four-suite
Windows run passed 154 cases, failed 67 and skipped one: failures were missing
Linux shell/Git executables and fixture timeouts. These are not passing coverage;
native CI and the remaining generated operating family still need verification.

## Complete preparation-source inventory

The generation runtime now derives a complete inventory of the authenticated
preparation commit's Git blobs and supplies its digest to the actual recovery
candidate through an owned, disposable capability. It rechecks source, private
state and authority after asynchronous work and on candidate reads. Conflicting
facts fail validation. The inventory describes committed bytes; it does not
claim that Git-filtered checkout bytes are identical to those blobs.

Verify derives and uploads the fixed source inventory on pushes to main. The
artifact becomes useful evidence only after the complete run succeeds and a
consumer authenticates its repository, source and run. The recovery service's
actual GitHub evidence loader now discovers that preparation run, validates the
fixed producer workflow and artifact, compares the complete inventory with the
authenticated Git tree, and recomputes the digest. Run and artifact metadata are
rechecked after download. This supplies an initial source-evidence check; later
persisted metadata checks still cover the existing Pages evidence only.

The service's loader, archive, canonical inventory and bounded stream suites
passed 391 tests, and strict service types passed. Independent producer/consumer
review found no blocking contract mismatch. Tests use synthetic authenticated
transports; no live artifact acceptance or deployment is claimed. Artifact
metadata identifies its run but not its attempt, so only observed run-attempt
stability is claimed. The existing Pages archive parser retains its contract.

The focused integration passed 34 tests, including the actual activation bundle
and plain Node22 import. Two genuine Git/generated-release/private-corpus tests
passed and demonstrated that the candidate's missing inputs decrease from seven
to six solely through the source digest. Two final capability checks and focused
strict types passed. Windows permission emulation is not native Linux acceptance.

Additional surrounding checks passed 35 workflow, eight bundle, two bridge
candidate and three bridge-facts cases. Thirteen other cases failed through
Windows fixture timeouts or their cleanup cascade; they are not passing coverage.
No semantic or compiler assertion mismatch was observed in these runs. Broader
published Linux CI also has unresolved source-contract and fixture failures.

Remaining candidate inputs are the authorization request ID and epoch, worker
configuration identity and epoch, and G001/G002 program hashes. The production
generator consumer, operating workflow, owner PTR acceptance and live delivery
remain unfinished. Earlier sections below record their original checkpoints.

## Construction time in the building review

An active building card now shows its construction estimate, so opening the
Buildings panel on a compact screen no longer leaves the timer behind in the
scene. It uses the existing screen clock and the same estimate formatter.
Reaching zero displays Awaiting Realm update; only confirmed state removes
construction and exposes the completed level. No additional timer or command
submission was introduced.

The screen, benefits and accessibility suites passed 40 tests, including a
countdown-to-zero-to-confirmed-completion regression. Focused strict types
passed. Independent source review found no blocker; actual synthetic 320/390
pixel captures showed the updating estimate, readable cards and reachable
controls. These are desktop browser captures, not owner/device acceptance.
Seven production evidence inputs and the generator consumer remain unfinished.

## Verdant Citadel backdrop and loading continuity

A cooler muted green backdrop separates the pale terrace and warm grounds more
clearly. The WebGL background and fog share the visual profile, and the loading
canvas now uses the same color. Existing lighting, assets, geometry and mobile
framing remain intact.

Actual synthetic renders cover empty and mature keeps at narrow balanced,
narrow reduced and wide high quality. The scene suites passed 74 tests before
the matching loading CSS change; 47 accessibility/host tests passed afterward.
A paused-model-loading browser capture verified the transition into WebGL with
matching background and stable canvas height. Render resource counts were
unchanged in these captures; this is not a device-performance benchmark or owner
acceptance. No production deployment or realm operation occurred.

## Mobile keep framing

Compact screens now give the keep scene more vertical space, making the grounds
and buildings easier to read. The existing viewport budget, sticky resource and
navigation header, scene controls and short-landscape minimum remain in effect.
The wide-screen layout and camera behavior are unchanged.

Fresh actual WebGL renders from the 012bc483 source plus this CSS change show
the canvas increasing from about 168 to 304 pixels high at a 390-pixel viewport,
and from 258 to 468 at 600. Browser checks found no horizontal overflow at
390, 600, 844 and 1440 pixels. Short-landscape checks opened both Buildings and
Workers with their close controls visible below the sticky header. The three
focused accessibility, scene-host and visual-profile suites passed 59 tests.
These are synthetic local QA scenarios, not authenticated owner or device
acceptance. Production activation and the seven missing producer inputs remain
unfinished; this change does not deploy or initialize a realm.

## Approval evidence from the actual private releases

The real recovery candidate reopens the existing private Greater Realm workspace
and derives G002/PTR approval IDs through the production release readers. Realm,
source, public release and release/header digests must match authenticated corpus
receipts; PTR also matches the manifest digest. The reader reopens both releases
and the corpus, rechecks ownership and refuses replacement or conflicting facts.
The existing-only opener never creates missing directories. Missing or invalid
workspace evidence now refuses candidate inspection instead of supplying defaults.

A genuine generated-release, private-corpus and bridge test exercises the actual
candidate and leaves seven producer inputs missing: recovery authorization request
ID/epoch, worker configuration identity/epoch, source-closure SHA256, and G001/G002
expected program Keccak256. The production generator consumer remains closed.
No provider calls, realm initialization, admission change or deployment occurred.

Verification passed 53 tests across the focused reader/candidate, affected corpus
contracts and genuine combined producer suites, plus strict types. Root
independently passed 20 reader/workspace tests. Activation, G002 and PTR bundles
build and import under Node22 with the actual connected activation runtime.
Independent review found no blocking runtime issue. Windows test permission-mode
emulation is explicit; native Unix permission behavior and owner play remain
separate. Earlier timeout failures are retained; only the heavy test's Windows
budget changed, not production timeouts.

## Confirmed Worker return feedback

Worker cards name the resource from the last confirmed return, independently of
any new expedition. Nonzero overflow explains that the resource limit prevented
storage; zero overflow adds no warning. The view uses the decoded last-return
record, and advancing the UI clock cannot invent a credit or clear pending goods.
No server rewards, timers, persistence or commands changed.

The author passed 110 presentation, screen, accessibility and surface-host tests;
root independently passed 62 presentation/screen cases. Focused strict types
passed. Actual component renders at 320px and 390px fit without horizontal
overflow, including a current expedition with a different previous-return
resource. This is fixture presentation evidence, not authenticated owner play or
actual-device acceptance. Full-app types still require the separate auth-bridge
compiler sync API dependency; no full-app type success is claimed.

## Authenticated bridge facts in recovery candidate generation

The production activation runtime passes its actual bridge-state capability into the recovery candidate reader. The reader reopens the retained suspension receipt and its validated authority chain to obtain worker version, worker source, bridge source and suspension receipt digest. It checks exact source/private-state ownership, permits the existing linked recovery predecessor, and reopens the chain/catalog before returning facts. These are retained evidence facts, not a fresh provider observation or permission to perform effects.

Candidate assembly merges corpus, bridge and source projections separately so a conflicting duplicate cannot be silently overwritten. It rechecks each input before returning. The later approval integration above requires retained workspace evidence even during inspection. The final generator projection independently cross-checks G002/PTR import receipt links against the bridge history.

At the earlier bridge-only integration checkpoint, a genuine private bridge/corpus fixture reduced missing inputs from thirteen to nine: recovery authorization request ID and epoch; worker configuration identity and epoch; source-closure SHA256; G001/G002 expected program Keccak256; and G002/PTR public approval receipt IDs. No default values replace those producers. The production generator consumer remains unavailable, and this change does not deploy or initialize a realm.

Verification: the final bridge/candidate/runtime integration suite passed 13 tests and focused strict types. Root independently passed the candidate/runtime checks and all 40 workflow runtime tests. The bridge reader received independent review; its recovery case passed, with earlier Windows timeout evidence retained. The real full-source activation bundle builds and imports under plain Node 22. The relocated bundle fixture now copies the real compiler graph and required package metadata, fixing an incomplete fixture also reproduced on the unchanged baseline. Windows-only fixture timeouts accommodate observed filesystem/compiler setup; production validation and Linux timing limits remain unchanged.

Final relocated bundle regression: all 15 tests passed after the fixture repair.

## Private PTR-update activation integration

The private activation path supports the PTR-update V3 binding family. It reopens
the exact completed-update record, derives the current PTR module coordinates,
checks atlas initialization, owner provisioning and current live observations,
and feeds those facts to the real candidate builder. The generator recognizes
a fully validated V3 envelope; the operating candidate still lacks producer facts. The
actual opaque update writer validates the same receipt format before persistence.
V2 remains a distinct supported family with unchanged canonical output.

The supported V3 initialization path uses authentic records produced under the
current preparation source. Historical atlas or owner wrappers without an
authenticated prior-release anchor are refused rather than rewritten. This does
not establish historical continuity, perform initialization, or deploy the game.
Those operational integrations and evidence remain unfinished.

The generation-receipt codec and completed-family readback recognize the exact
V3 schema/profile pair. Mixed inventories, incompatible receipt families, source
or live-module substitutions and invalid continuation run facts are rejected.
Tests use real private-state and semantic validators where described, with
synthetic fixture evidence; they are not live provider or owner-play proof.

At the earlier V3 checkpoint, corpus-only inspection identified thirteen missing
producer fields. The connected bridge reader described above now supplies four
of them, leaving nine at that checkpoint. The approval reader above now reduces
that set to seven. The PTR program hash comes from the completed update
receipt. A synthetically complete test candidate does not establish operating
readiness; the remaining inputs still need their actual producers.

Final root Windows checks passed 44 V3, writer, generator and bundle tests,
plus focused strict types. Selected V2 descriptor regressions passed 43 tests
with 26 cases not selected. Two fixed-Linux-Git failures reproduced unchanged
in the exact baseline; native and full Linux CI remain separately required.
Independent review corrected attempt bounds and reconciliation-run checks.

The production generator-member consumer also remains closed with
`SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE`; its genuine lifetime must be
connected after the required producer facts are available.

Before shipping, complete actual PTR initialization and owner access, provision
the operating workflow, perform native preparation and live acceptance, and
continue gameplay and Verdant Citadel polish. Keep G001 progress and its agreed
admission freeze intact; G002 remains sealed.

## Completed PTR update capture

The actual PTR runtime now captures an opaque, source-bound completed update
before disposing its artifact and adapter. The receipt reopens private update
records and the genuine continuation terminal. It records acknowledgement
separately from observed installation and never invents a lost response.

If the update completed but receipt capture failed, a later apply can recover
that fixed record after a fresh workflow permit check and genuine completed-head
proof. This path does not redispatch or send another provider update. Conflicting
records are preserved and rejected; foreign stores and disposed capabilities
cannot capture receipts.

Root Windows checks passed 25 completion/adapter/joined tests (four native cases
skipped), plus lifecycle, bundle and existing runtime regression checks. Focused
strict types and independent reviews passed. The previous published native
integration passed all eight cases; newly extended receipt assertions need new
native CI. This is development integration, not a live activation. Private V3
corpus/generator data support was completed in the later checkpoint above;
authenticated historical import/owner continuity remains unfinished. Gameplay, Verdant Citadel polish and live release acceptance remain
part of the full 0.4 objective.

## Joined production update continuation checks

The dedicated production-adapter test now uses the real source issuer, workflow
permit, private-state persistence, continuation store, claim/reconciliation,
PTR lane and dispatcher. Only artifact issuance and external provider transport
are fixture boundaries. Cases cover direct completion, lost-response recovery
without a second update, live predecessor refusal, run revocation before sending,
and the synchronously scoped claim. It is included in the fixed native CI suite.

Windows passed three boundary checks with four native cases skipped; strict
types and source review passed. Native CI must establish the joined POSIX path.
Neither mocked provider responses nor fixture authority prove a live update.

## PTR runtime constructor and bundle integration

The genuine PTR workflow runtime now admits update inspection/application and
constructs its source-built artifact and production adapter internally. It reuses
the real lane's workflow permit and continuation store. The runtime disposes the
adapter and cleans the artifact after consumed execution or construction failure;
workflow evidence is revoked even when cleanup fails.

Configuration is explicit: `WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT`,
`WARPKEEP_SPACETIME_CLI_CONFIG_PATH` and `SPACETIME_BIN`. Paths must satisfy the
existing Linux runner account and ownership policy. The current Node executable
is checked against the pinned Linux runtime and its canonical directory leads
the build PATH. Source and configuration are rechecked by artifact attestation.
These configuration locations are not claimed to be provisioned on the runner.

The real bundle engine now handles the newly reachable artifact-description and
runner paths through its existing exact portability transforms. A regression
builds that graph and imports the generated result using plain Node. Lifecycle,
bundle and existing workflow regression checks, strict types and independent
review cover the implementation. Mocked lifecycle boundaries do not establish an
authenticated provider update or native artifact preparation.

The operating workflow still permits preflight only. Next connect the real
adapter/continuation integration evidence, authenticated private V3 completion
records and current owner/atlas observations before enabling the operating path.
Historical import/owner receipts must keep their original coordinates; the new
module belongs in the current update receipt, not rewritten historical evidence.

## Native inspector loading correction

The native CI run for `0201ca4` failed its two separate-process inspection races.
The new production adapter import reaches TypeScript build helpers; the synthetic
child launched plain Node and failed on an extensionless TypeScript import before
reaching the barrier. The source-level child now uses the locked `tsx` loader.
An always-running child import check covers this dependency graph, and early
child failures retain their original error instead of becoming a barrier timeout.
The barrier duration and native preservation/concurrency assertions are unchanged.

Windows regression checks and focused strict types passed. Native CI at `846adb5` passed both isolated update/recovery and production
contract jobs; production uses generated Node22 bundles and requires fresh
bundle verification separately. This correction does not enable deployment.

## Production PTR update adapter implementation

The existing production factory now constructs an adapter from genuine source,
private-state and internally built artifact capabilities. Artifact construction
derives SHA-256 and program Keccak from the same copied bytes; the capability is
revoked on cleanup. A separate opaque transport reads the staged provider login,
uses only the fixed PTR endpoints and never exposes a token accessor. Its decoded
identity remains a local assertion; successful migration planning supplies the
server's UpdateDatabase authorization evidence.

Complete RawV10 comparison preserves old tables, reachable row types, names and
schedules while committing function changes to the full description. A metadata
initial-program value is only a hypothesis: the authenticated migration token
must match that predecessor and the actual candidate. Private no-clobber records
bind inspections, submission, acknowledgement and completion across sources.
Reconciliation proves the expected installation without comparing mutable player
rows and never invents a received acknowledgement or blindly repeats a PUT.
Current supported-host health is rechecked before submission/reconciliation; it
is a deployment observation, not replica attestation or an atomic version lock.

The combined Windows checks passed 170 tests with 34 native skips; strict types
and independent policy, credential and adapter review passed. Corruption, delayed
callbacks after failed no-effect persistence, changed host and lost-response cases
are covered. Real workflow/continuation execution, activation-corpus selection,
native artifact verification and live production acceptance remain unfinished.
The workflow entry still must construct these capabilities under its genuine
permit; production operation dispatch has not been enabled by this checkpoint.

## Exact-artifact module description

The PTR artifact helper now derives the registered RawV10 description through
the attested standalone executable, reading its existing private artifact
descriptor before CLI credentials are staged. Separate digests retain raw output
identity and canonical schema identity. Explicit keyed collections normalize
runtime ordering differences; typespace, columns, variants and function order
remain significant. Unknown sections, duplicate identities and unsupported
views, RLS, HTTP and defaults refuse explicitly. This identifies a supported
complete description; it does not authorize a migration.

Windows focused tests and strict types passed. The real historical standalone
extraction fixtures are retained with provenance. New native publisher integration
checks and a fresh current-artifact extraction remain pending WSL recovery; the
prior successful Linux build did not execute this new integration. The factory
now composes provider transport, migration policy and private update records;
workflow execution and activation receipt selection remain unfinished.
Generate a fresh source-bound family after the integrated source is
ready; never apply an older source's generated outputs.

## Supported Linux artifact build

The actual PTR artifact helper now selects the existing Linux x64 locked builder,
preserves Darwin arm64 and refuses unsupported runtimes before CLI effects.
Focused platform/race/publisher tests, strict types and independent review passed.
A real Linux build from `af68cae` also passed source/artifact reattestation,
returned-hash/provenance checks and artifact/materialization cleanup. The runtime
used the workflow's existing private umask after normal checkout modes.
This proved builder selection. Schema extraction and provider credential handling
are now implemented as described above, with their native integration still pending.

## Populated PTR update integration

Recovery now has an explicit schema-3 public binding for an existing PTR update.
The public artifact verifier, signed authorization consumer, service evidence
parser and committed-source/Pages routing use version dispatch. Schema 2 remains
the fresh path with unchanged canonical bytes and hash domains. Schema 3 replaces
fresh/publish receipt slots with an update receipt commitment and retains legacy
zero-table and admission invariants; those counters are not gameplay04 progress.

This is consumer support, not production update enablement. The activation producer
must select authentic completion from the new adapter records and cross-bind current artifacts,
historical import/owner provenance and current live observations. The actual
Linux artifact/schema and provider-owner credential capabilities must then be
connected inside the existing workflow runtime. Hermes game-admin JWTs are not
provider module-update credentials. Follow the [connected implementation plan](../../superpowers/plans/2026-09-08-ptr-update-recovery.md).

The separate official 2.10.0 disposable recovery rehearsal passed from `826ed94`
at 12:40 UTC on September 8. It preserved earned resources and pending work through
repair and passed timers, expiry, renewed access and exact retry. It predates the
later synthetic v3 definition policy and does not prove production acceptance.

## Start from the actual checkout

The development branch is `codex/prepared-keep-bindings-fix`, tracked by
**`upstream/codex/prepared-keep-bindings-fix`** on GitHub. On the current Windows
machine it is at
`C:/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree`.
`origin` is a local baseline repository; equality with it does not prove GitHub sync.

At `923e024`, the isolated dependency correction completed native preparation
and its independent rebuilding check. Candidate QA then identified the stale
source-authority operation contract; that generated family is not accepted.
The current authored correction aligns the verifier with the existing update
operations and tests semantic rejection after authentic pin derivation. Complete
fresh preparation from the corrected source instead of installing hand-edited
pins or relabeling the older candidate. Check any running process through its
actual handle before starting another one.

The populated native B-to-C recovery passed at 11:12 UTC on September 8. It fixed
a synthetic construction fault while preserving earned resources and pending
work, then passed autonomous settlement, expiry and retry checks. Its authority
was synthetic and its preservation interval quiescent. Next connect a distinct
production update receipt to the activation consumer and construct the implemented
factory inside the workflow runtime and fixed Linux caller. Do not represent a populated update as
the existing fresh-publish receipt. See [recovery](../../evidence/0.4.0/recovery.md)
and [CI evidence](../../evidence/0.4.0/ci-preparation-failure-baseline.md).

Earlier source `d7798e6145c19536eefbf328f64d68d5b15b1e1f` completed full native
preparation and an independent rebuilding check. Generated-only commit
`582f498b0cd86117bdf8c5ea5d0cf8a2d1a741fd` integrates the verified output delta. Candidate QA passed
the affected release/recovery/UI suites and both type checks with source and
generated bytes unchanged. The later CI test-resolution correction
`0ab958f7bc088f61fcf9e7a63e7cadeda31d50c1` passed both module-installed and root-only dependency layouts.
That test-only change and the documentation do not extend the preparation proof
beyond its actual `d7798e6` input. Final release preparation and live acceptance
remain open. Read the actual remote and CI before relying on a published status.

Fetch and compare real refs, inspect the scoped diff and read current job/process
handles before starting work. Preserve unrelated files and private probes. This
checkout has widespread line-ending/stat noise; inspect substantive diffs and stage
exact paths. Never normalize, reset, clean or prune it to make status look tidy.

The root `node_modules` is a shared junction. Install only into an independent
verification checkout. Use the pinned toolchain described in the
[development workflow](../../engineering/development-workflow.md); the current
machine's default Node/npm do not match the project's required versions.

Existing-update planning now rejects unsupported visible migration operations
and malformed plan text, while retaining token and fixed-target checks. Captured
native no-op and AddTable plans pass, as do the native adapter tests. This is a
conservative visible-text check: SpacetimeDB omits some view/RLS changes from that
text. The production factory now uses a separate complete RawV10 comparison. Its actual
workflow and activation-receipt integration remain unfinished. See the
[fixture provenance and limits](../../../tests/fixtures/existing-update-plans-2.6.1.md).

## What works and what still needs proof

The September 8 mobile catalog review improved first-build readability: unbuilt
sites and construction now have distinct labels, cost/shortage lists omit unused
resources, and affordable cards say "Resources ready". Construction eligibility
still comes from the authoritative quote, including the busy Builder check.
The affected Benefits, Screen, Accessibility and PlacementUi suites passed; the
catalog was inspected at a 390-pixel browser viewport using empty and completed
keep fixtures. This is presentation evidence, not authenticated owner play or
physical-device performance acceptance. The whole-grounds camera still makes a
small keep difficult to appreciate; continue the rendered composition review.

| Area | Implemented and verified scope | Next useful evidence |
| --- | --- | --- |
| Core loop | Server-owned gathering, construction and progression connect to the PTR controller and keep UI. Building choices explain benefits; confirmed returns become spendable. | Actual owner first improvement and the better return it enables on real routes. |
| Navigation and continuity | Selected Worker survives keep-to-atlas navigation. Close/Escape closes nested panels to the keep; Back stays separate. Healthy refresh preserves scene/focus. Active expiry renews scoped authority and reconnects without replaying commands. | Actual owner foreground/resume, uncertain command and realm-switch journey. |
| Verdant Citadel | Current keep presentation and coherent Greater Realm water have scoped tests and synthetic rendered evidence. | Integrated visual review, lower quality/motion settings and physical-device performance. |
| Linux delivery | Complete source preparation, independent byte check, recovery and the fixed sealed preflight caller are connected. The supported runner is installed. | Remaining operating callers, authentic provider inputs and release-specific signer/runner authorization. |
| Existing databases | Compiled candidates preserve the captured old schema; authenticated planning supported deployed-program fingerprints at the recorded snapshots. | Populated A-to-B preservation and PTR timer/access-resume rehearsal passed. Complete useful code-replacement recovery and connected existing-update receipts. |
| GitHub checks | The published `00c0399` module, auth, native, recovery and CodeQL jobs passed. Linux failed one G002 test suite during SDK initialization; the failure was reproduced and its mock resolution corrected locally. | Required checks on the newly published source. |

These are separate scopes. A local fixture, generated source family, successful
provider request, runner registration or source sync does not establish a live
release. See [release engineering](../../evidence/0.4.0/release-engineering.md) and
the [infrastructure audit](release-and-infrastructure.md) for dated evidence.

## Preserve the worlds and player authority

- **G001:** preserve existing progress, access and normal timers alongside the
  agreed admission freeze.
- **G002:** keep sealed while future admissions remain undecided.
- **PTR:** use the actual owner's isolated entitlement for the new playable journey.

Provider administration, player identity and PTR entitlement are different
authorities. Never invent a player, receipt or token. Recheck authority after
asynchronous work and preserve exact command/retry identity, atomic settlement and
realm/database/session/epoch isolation.

The G002/PTR databases already exist. Current fresh-create publishers deliberately
reject existing targets; do not remove that refusal or manufacture fresh/empty
receipts. Existing updates need their own connected observation, publication,
preservation and reconciliation semantics. An unchanged old fingerprint after an
uncertain request cannot prove no effect: a program can change and change back.

The isolated historical rebuild did not match the recorded original artifacts.
Keep that limitation explicit. Exact predecessor-byte possession is not itself the
project's recovery requirement: the requirement is tested schema-compatible
recovery that preserves existing and subsequent writes. Evaluate a useful forward
recovery path; do not restore an old snapshot or call a schema-equivalent fixture
the exact deployed predecessor. Fresh authenticated program identity still belongs
at the actual update boundary.

G002 authentication has two transport paths. Direct HTTP uses the original bridge
JWT; the SDK exchanges it for a host-signed temporary token before WebSocket
subscription. Source `95ce45c` adds the correctly derived signed identity to the
G002 bridge token, preserving the existing module guards. Native HTTP and SDK
interoperability passed with synthetic local authority. This does not grant
production SQL ownership or establish a populated migration.


The 05:09–05:10 UTC rehearsal remains a retained failed attempt: it stopped at
PTR inspection because the historical parser rejects the SDK's exchanged identity
claim. Source `c5392e0` accepts only the original exact shapes or those shapes plus
the SDK identity, validates that field and binds it to the authenticated sender.
All existing owner/database/epoch and absolute-session checks remain enforced.
The historical A artifacts were not modified; their import, provisioning and
owner bootstrap use the actual host HTTP lifecycle with the original signed JWT.

The new rehearsal completed at 08:24 UTC. Real exporters/importers populated both
historical realms, followed by token-bound A-to-B updates that preserved every
existing row and complete table boundary. The updated PTR then completed gathering,
construction, issuance containment, autonomous timer settlement, expired-session
refusal and fresh-session resume. An explicit accepted-command retry changed no
rows. This is actual module behavior with synthetic local authority and persistent
test data; production owner play and code-replacement recovery remain unproven.
The server, temporary signing files and CLI snapshot were cleaned up.


The complete generated consumer family for `95ce45c` was independently reproduced
and verified. Commit `6a5123ed7fde3e5e6b21114b895477f8c6b43a03` installs its
reviewed generated changes. All affected suites passed: 432 cases, no skips,
including the complete prepared-workflow suite. Tracked source and generated
output bytes remained unchanged during QA. Retained compiled inputs and bundles
were verified without rebuilding; that historical checkpoint retained the
`b306eed` preparation. The newer `d7798e6` prepare/check and QA are recorded above.
Final release preparation and required published-source CI remain separate.

## Continue in useful increments

1. **Complete the owner journey.** Follow the real generated bindings, provider,
   controller, module and keep UI. Improve decisions, pacing and feedback where
   actual observation identifies a weakness. Preserve already repaired refresh,
   Worker selection and placement-readiness behavior.
2. **Review the rendered game.** Work in the current `keep04` and Greater Realm
   owners, not dormant legacy renderers. Compare placement, construction and
   completion at desktop and narrow widths; test lifecycle and degraded states.
3. **Connect existing-database delivery and recovery.** Use actual module/state
   fixtures, complete provider adapters and honest receipts. Test preservation of
   writes made after planning and after deployment, including uncertain outcomes.
   Continue from the [recovery evidence](../../evidence/0.4.0/recovery.md).
4. **Settle and publish a coherent checkpoint.** Run affected checks, independently
   review authority/persistence changes, derive generated consumers through their
   owners, scan outgoing commits, push without force and verify GitHub equality.
5. **Finish deployment and acceptance.** Pass required CI and repository protections,
   deploy exact artifacts, inspect live behavior, and produce the credential-free
   workspace delivery package at `artifacts/delivery/0.4.0/` after the usable
   release is demonstrated; do not create new Desktop output.

Do not wait for production readiness to publish reviewed development work. Do not
repeat a full preparation just to restate its status: retain its exact source and
result, and derive again when a new release candidate is actually selected.

## Find the real owners and evidence

Start with the [handoff index](README.md), [repository map](repo-map.md),
[architecture](../../technical-architecture.md),
[ecosystem map](../../engineering/ecosystem-map.md) and
[source synchronization procedure](../../operations/0.4.0-development-sync.md).
Use the [Linux runner guide](../../operations/0.4.0-linux-runner.md) and
[native preparation runbook](../../operations/0.4.0-local-release-preparation.md)
for operating work. The [release acceptance record](../../operations/0.4.0-release-checklist.md)
lists the actual unresolved gameplay, preservation, presentation and deployment
evidence; unchecked historical task labels do not create new approval requirements.

The [engineering record](../../evidence/0.4.0/release-engineering.md) retains prior
commits, exact experiments, environment limitations and superseded CI results.
The [earlier handoff](https://github.com/ael-dev3/Warpkeep/blob/b306eedd8c4fe8f32661d89abc32f04938a5aa8e/docs/agent-notes/0.4.0/execution-handoff.md)
preserves the longer local-inventory and implementation history. Recheck historical
claims before operating; do not confuse retained evidence with present authority.

Root tests use Vitest; module and service tests have separate runners. Root
`tsc --noEmit` alone does not traverse referenced projects: run the real package
typecheck or both app/config checks. Verify selected tests and exit status, and
label fixtures, emulation, real devices and authenticated owner play distinctly.

Signed preparation observation now reaches the actual recovery candidate through
the genuine source/private-state capability, with exact receipt retention and
final freshness checks. The complete joined fixture passed: reservation and
configuration inputs reduce the missing set from six to the two native program
hashes. Earlier Windows timeouts are retained; only duplicate test inspections
were removed. The new program capability supplies those fields from its fixed native producer
and authenticated source/corpus ownership. The actual bundle now constructs and
imports with corrected checkout paths; existing engine regression checks pass.
Native execution of the fully bundled workflow remains to be established.

Terrace tops now use muted ground cover with subdued retaining stone. Matching
desktop/mobile and reduced-quality captures preserve rendering resources and
show no horizontal overflow; focused tests and types pass. This is a modest
visual improvement, not physical-device or complete visual acceptance.

## Quieter mobile resource status and native candidate verification

The keep now omits repeated zero-pending amounts and shows one quiet no-return status. Nonzero incoming amounts remain explicitly unspendable; balances and command semantics are unchanged. All 21 Keep04Screen tests and app/test types passed. Fresh empty/mature desktop and 390px synthetic renderer captures had no horizontal overflow. Nonzero pending and confirmed-return behavior are covered by component tests; physical-device performance remains unverified.

At the earlier source `c104f7b6368635ab6ae36da6ce02c3aa5a9c412d`, full native Linux prepare and the separate rebuilding check both exited successfully with identical family `f23eb885a62eea112e943b70a692b785da0a28b7b873fe2f0e39a59c1508740e`. That candidate had `finalReleasePrepared: false`, was not deployed, and predates the current UI and Linux G001 integration. The note later recorded `096d9c0` as its then-current Windows/GitHub checkpoint; the current branch tip is the live source. Native materializer/child execution and generated-closure audit remain open.

## Dedicated Linux caller and private-state integration

The operating workflow now uses the dedicated warpkeep UID/GID1000 profile and fixed native Node toolchain. Preflight and activation inspection run without OIDC; activation generation alone receives job-level OIDC. Exact operation/job context is retained and refreshed. Other realm provider operations still refuse because their real adapters remain unconnected.

Linux private records use the fixed account-owned .warpkeep/private/sealed-realms-v1 namespace; the public artifact reader follows it. Existing record descendants and non-Linux layout remain. No credentials or private records were migrated.

Combined app/test types and 57 focused tests passed on Windows;14 POSIX tests skipped. Separate operation/context/workflow checks and independent source review passed with documented Windows fixture seams. Corrected native caller fixtures passed6 portable cases;25 privileged cases still require Linux execution. Full candidate preparation/check at preceding c104 source does not validate these new changes. Native verification, runner registration, genuine operating authority and real provider adapters remain unfinished.

## 11 September 2026 — workspace output guard

The current development head is `9ace823626515fd2293c952a42bae7b929c90b60` on
`codex/prepared-keep-bindings-fix`. Windows, GitHub and the native
`/home/warpkeep/Warpkeep-0.4` checkout are clean and synchronized at this SHA.
The focused `tests/desktopHandoff.test.ts` suite passes 5/5 and now checks both
the documented retention rule and the current verification/production workflow
files. Those workflow files must not contain Desktop, OneDrive or localized
Desktop output paths, so a future workflow edit fails the suite before it can be
treated as a valid checkpoint.

The runtime paths already enforce the same boundary: recovery bootstrap rejects
repository, profile, Desktop, OneDrive and worktree private roots, while Keep04
QA captures are created beneath the checkout's ignored `artifacts/keep04-qa`
tree. Routine notes remain in their existing tracked documents, and a final
credential-free package is created only when delivery needs it under
`artifacts/delivery/0.4.0/`. No new Warpkeep Desktop file, handoff copy,
backup or archive was created during this checkpoint; the existing Desktop
handoff was updated in place to point to this SHA.

The Linux private preparation root currently retains historical run evidence;
it was not age-deleted because several candidates and receipts remain referenced
by acceptance records. Future cleanup must name an agent-owned disposable path,
verify that no operation or process uses it, and record the retention decision.
The new GitHub Verify run is still in progress for this head; CodeQL completed
successfully in run `34646882569`. No release or authenticated provider
operation is claimed. B0 and the legacy
prepared caller still require their separate Darwin-to-Linux migration, and the
owner PTR journey, physical-device checks, protected deployment and signed-history
merge remain open.

## 22 September 2026 — policy observation secret wiring

Protected main was `e309d897299d1b3f3984ab62ebf00950b0de93b4` at the latest
read-only policy dispatch. [Run `35680568053` (#69)](https://github.com/ael-dev3/Warpkeep/actions/runs/35680568053), job `106596442275`, reached
the fixed G001 operation and failed at `g001-credential-descriptor`, before the
native observation. The workflow expression supplied
`WARPKEEP_PRODUCTION_ADMIN_TOKEN` to census and activation steps, but omitted
`g001-policy-observe`. The old policy reader also expected a runner-persistent
`admin-token` file, while census already used the protected secret through a
short-lived descriptor. No new App key or persistent runner file is needed.

The repair aligns both read-only G001 operations: the fixed workflow passes the
existing secret only to the native execution step; ingress scrubs its environment
entry; the native reader validates it, waits for refreshed authority, creates
the descriptor-backed file inside the operation's private root, and cleans that
root. The infrastructure and Linux runbooks give the exact recovery route for
this diagnostic. It is published as source-only [PR #330](https://github.com/ael-dev3/Warpkeep/pull/330).

At PR head `bd8e54853aa4d286892c6367e79cb79f81685a9d`, pinned Linux Node 22.22.3
passed the prepared-policy closure and checked-in sealed-launch verifiers. The
focused Linux workflow/native suites passed 112/112, the ingress evidence suite
passed 5/5, the compiled native credential-boundary regression passed 1/1, and
the Windows TypeScript build passed. Windows Vitest's compiled-boundary worker
exceeded its heap limit; the same test passed on the pinned Linux path. These
results validate the repair, but do not replace hosted checks on the final PR
head or the exact-main native M1 prepare/check. Continue through normal protected
M1 integration, native preparation and independent check, generated-only M2,
main Verify and preflight, then rerun the read-only policy observation/census.
An absent recovery signer does not block these G001 read-only observations and
is not a reason to request or generate another key. Signer and gateway work is
separate and uses the existing retained signing material for operations that
actually require it. 0.4 is not shipped; provider deployment, retained-state
readback and live acceptance gates remain open.

## 22 September 2026 — protected commit signing recovery

PR #330 (`codex/g001-policy-observe-secret-wiring`) was blocked by GitHub with
the explicit message “Commits must have verified signatures,” despite all
required checks passing on its earlier head. Protected `main` requires signed
commits, linear history and strict status checks, with squash as the only merge
method. The previously documented uncertainty about signatures was resolved by
this direct rejection; see the [infrastructure access guide](../../operations/0.4.0-infra-access.md#protected-commit-signing).

The repair used the already registered GitHub SSH signing key, whose public
fingerprint is `SHA256:H0mdBKhWdc4xPiVS6gGE49lZUOTEhXMqB0q1SK1Ofec`. The matching
private key was already available on the maintained Windows host at
`C:\Users\heyas\.ssh\warpkeep_signing`; no recovery GitHub App key or new SSH
key was created. Never copy key material into the repository, notes, terminal
logs or chat. If the existing signer is not available, stop and ask the owner
to restore access to that same signer; do not weaken branch rules or use an
administrative merge bypass.

For a future protected PR with unsigned commits, first confirm the live `main`
protection, PR head and exact blocking message with `gh`. Verify that the
existing private key is available and its `.pub` fingerprint matches the
account's registered **signing** key. Re-sign only the PR branch, based on the
current `origin/main`, with SSH commit signing enabled; do not rewrite `main` or
unrelated history. Record the old tip and tree before rewriting, then confirm the
new tip has the same tree, the patch series is preserved, and GitHub reports
every rewritten commit as verified. Push the rewritten PR branch with an
explicit `--force-with-lease` against the old remote tip. Run the repository's
pinned secret scan over the outgoing history, then wait for all required checks
on the exact new head. When eligible, use the existing normal squash
auto-merge. Do not infer that green checks override signature requirements.

For PR #330, the four replacement commits were all verified by GitHub; old and
new PR-tip trees both equal `a81c1658e60094db426420b95e3f554e7399f967`. The
pinned Gitleaks scan of the four-commit outgoing history was clean. Auto-merge
was enabled using squash, and GitHub restarted required checks for signed head
`060a3c7c5f190fbee029ea09df2d0cce0a7c3ce1`. The final workflow runs and merge
state must be rechecked before proceeding to M1 preparation; these notes do not
claim that PR #330 has merged or that 0.4 has shipped.

## 22 September 2026 — historical exact-M2 policy receipt recovery

At the time of this observation, before source-only recovery PR #337 merged,
protected `main` was exact M2 `8b4fa5ee08048878fa88973f3cd72900a1a1b84a`.
Its push Verify run [`35766416370`](https://github.com/ael-dev3/Warpkeep/actions/runs/35766416370)
and read-only preflight [`35772760378`](https://github.com/ael-dev3/Warpkeep/actions/runs/35772760378)
both completed successfully. The next exact-M2 `g001-policy-observe` dispatch,
[`35772933637`](https://github.com/ael-dev3/Warpkeep/actions/runs/35772933637),
failed in `operate_readonly` at “Attest runtime and execute authenticated
operation.” The operation is read-only; no census or deployment followed.

Supported private-state inspection found one active fixed G001 policy receipt
whose recorded source predates M2. Its receipt reports
`mutationSubmitted: false`; no applicant or player records were read or copied.
The Linux producer is fixed and source-bound but previously attempted a fresh
read-only observation before writing that receipt to the same no-clobber path.
The existing record then rejected capture and the dispatcher hid the precise
private-state error behind the generic lane label. The exact run likely reached
the read-only operator before capture failed; the action result does not expose
enough detail to claim that as directly observed. This failure did not authorize
or start census, deployment, or any write operation.

The repair under review makes both supported G001 paths handle the record by
source: validate and adopt an exact current-source receipt on retry; preserve an
older valid receipt byte-for-byte under a private source-keyed history path
before freeing the active slot; reject malformed records and conflicting
history without deleting the original. The frozen-envelope path also accepts
its bounded retained lifecycle inventory, rejects duplicate run IDs, and keeps
incomplete or ambiguous state fail-closed. Only fixed safe diagnostic labels
cross the dispatcher boundary. Focused Windows dispatcher tests passed
`89 passed, 1 skipped`; TypeScript and clean-tree `verify:sealed-launch` passed.
The Auth Bridge prepared-deploy closure verifier passed unchanged at 1,258
members. The initial Windows full sweep was stopped after platform-sensitive
private-mode/inode failures, fixture timeouts and dirty-checkout closure checks;
it is not a full-suite pass. A later WSL full sweep passed 12,327 tests but had
14 setup failures; all 34 tests in the four affected suites passed after the
exact CI prerequisites were installed. The full suite was not rerun locally
with corrected setup, so the hosted Linux check is the full-suite gate. This
is now merged as a source-only M1 change, with all required PR checks green. No
Auth Bridge prepared-closure refresh is needed; the code change belongs to the
sealed operation bundle, which must be regenerated by a fresh prepare/check of
the exact protected M1. The prior native candidate and generated M2 are bound to
earlier source and cannot certify this repair. Resolve current `main`, prepare
and independently check that exact source, promote its generated-only M2, wait
for that exact push Verify, then rerun preflight and the read-only policy
observation. Do not start census until the fresh observation has returned a
completed source-bound receipt.
Keep scheduled automation paused, do not create Desktop files, and do not
request or generate another recovery key. 0.4 remains unshipped.

## PR #374 recovery observer and Keep review — September 27

Independent audit found that the Auth Bridge release-recovery resolver still
used `player_v2` to enumerate admitted G001 founders. Admission creates
`realm_profile_v1`, castle, marks and allowed-FID state before first-login
`bootstrap_player_v2` creates the player and ownership pair. The resolver now
enumerates profile FIDs twice, obtains each administrator admission status, and
requires the alpha player/ownership counts to match and be no greater than the
admitted count. Existing zero orphan/founder-gap checks and raw/canonical HMAC
bindings remain. A two-admitted, one-bootstrapped fixture passes; malformed
aggregate and orphan cases fail closed. The independent reviewer found no
remaining resolver defect. The source checkpoint is signed `b41d434e`.

Mobile scene guidance now precedes the canvas and switches between desktop
scroll and touch pinch wording under coarse-pointer emulation. The DEV fixture
uses the existing hashed favicon, removing the previous lone browser network
error. This is synthetic presentation evidence, not physical-phone acceptance.
Auth Bridge checks passed 484 unit tests, 18 Workerd tests and both typechecks;
root typecheck, production build, 18 Inner Keep browser cases, and a 36-case
Windows Chrome capture passed. The capture had zero horizontal overflow and no
network errors; one bounded security diagnostic per document remains for
review. Synthetic frame timings do not establish production transfer or phone
performance.

The resolver, its test and Keep files are protected prepared-closure members.
All 3,256 tracked files at the signed source checkpoint matched their raw Git
blobs. `derivePreparedClosureFamily` returned 1,258 members, 16 outputs and
manifest SHA-256
`01ba31b6cea4d5e4559a4f5f95ffa5d32fdcb99ec0717e724e3fc9467fb82d11`;
a fresh process reproduced every installed output byte-for-byte. The
ownership-bound policy verifier rejects the Windows checkout by design. On the
exact clean signed `317fa0e0` in the supported Linux ext4 checkout, the policy
verified the same 1,258-member manifest, checked-in sealed-launch verification
passed, and five focused Linux suites passed all 193 tests, including a one-byte
mutation check for every member. The native checkout was restored to clean
`main` `786c0b2b` afterward. Require final-head hosted Verify before M1 merge, exact-M1 native
prepare and independent check, generated-only M2 and exact-M2 Verify before
fresh G001/G002 operations. Old M2 authority cannot cover this source.
Exact-head [Verify 36307725762](https://github.com/ael-dev3/Warpkeep/actions/runs/36307725762)
rejected all 17 jobs before runner start due account
payment/spending-limit state; private Pages also cannot serve this private repo
on the present plan. No live owner PTR or 0.4 release is claimed.

## 28 September 2026 — mobile menu transfer and current release gate

The 0.4 menu's castle and guardian are now served as separately optimized,
content-addressed models. Their exact 4,977,796-byte and 1,836,344-byte source
GLBs were moved from `public/` into
`docs/reference/menu/2026-09-27-warplet-castle/` without changing their bytes.
`npm run prepare:menu-world-models` uses the checksum-pinned gltfpack 1.2
executable and verifies both source and output lengths and SHA-256 before
installation. The castle output uses Meshopt, quantization, and maximum-quality
WebP without triangle simplification; the guardian keeps its 12-joint skin and
both authored clips, sampled at 30 Hz. The runtime outputs are 801,300 and
235,112 bytes, with explicit structural checks for all nine castle meshes,
per-mesh vertex/index counts, the WebP texture, guardian joints, and animation
names. The focused Windows asset-tool fix replaces `tar.exe` with the fixed
Git-for-Windows Info-ZIP locations required by `-Z1` and `-p`.

Commit `9a8bdac9c131b90ec0f0ac1873f4331cf7892d0e` passed the complete local
Node 22 production build, runtime assets, production exclusions, public-boundary
scan (3,289 tracked paths, 1,768 scanned), and Farcaster Mini App verification.
`tsc -b`, asset-license policy, file-size policy and 15 focused unzip/menu
lifecycle tests passed. A separate `notificationPagesLiveReceipt.test.ts`
attempt on native Windows could not start because that test suite hard-codes
`/usr/bin/git`; the supported hosted Linux full suite remains necessary. At
390×844, the built `/ptr/` menu reached model-ready with a visible canvas and
no console warnings. The measured resource waterfall was 3,738,720 bytes,
down from 9,516,527 bytes in the prior capture (about 60.7%); this is local
synthetic browser evidence, not a physical-phone test.

The exact-head [Verify 36388987777](https://github.com/ael-dev3/Warpkeep/actions/runs/36388987777)
on commit `9a8bdac9` failed before runner allocation. GitHub's job annotation
explicitly attributes it to failed recent account payments or an Actions
spending limit that must be increased; jobs contain no steps, so this gives no
code verdict. The owner must resolve the GitHub account's **Billing & plans**
state and then rerun Verify on the latest PR #374 head. Do not bypass hosted
Verify with the privileged production runner. At this check `main` is still
`786c0b2b`; Alpha 0.3.43 remains live at `https://warpkeep.com/` (HTTP 200),
and `https://warpkeep.com/ptr/` remains HTTP 404. This branch is a locally
validated candidate, not a merged, deployed, or accepted 0.4 release.

Open candidates Warpkeep #376 (the large click-to-load castle film) and #377
(the Genesis 002 score), plus Assets #38 (the stacked score archive), were
checked and remain intentionally outside this candidate while film/mobile
playback, G002 scope and rights evidence remain unresolved. Re-list their
current heads and checks before future integration; more 0.4 PRs are expected.

## 29 September 2026 — protected closure refresh and inspector camera hold

PR #374 is signed and synchronized at `860370ab6ca2b1473bd339f7617cc42388d57482`
on `fix/g001-census-admission-proxy`, against main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. This checkpoint contains the
prepared deployment source-closure refresh and a camera-neutral inspector fix.

The map previously decided whether to preserve the last camera composition by
looking only for a rendered `.realm-camera-neutral-inspector` element. Opening a
code-split water, resource or Worker panel sets `inspectorOpen` before the lazy
panel finishes loading. A scheduled composition measurement could run in that
gap, observe no panel element and replace the stable composition, allowing the
camera to shift during a passive inspection. The measurement now also checks the
current semantic inspector state. The recovery UI tests wait for each lazy panel
to mount and retain the no-focus and stable-composition assertions.

`tests/realmRendererRecoveryUi.test.tsx` passed 8/8; adjacent
`realmMapScreen` and camera-controller suites passed 58/58; the QA agent's
mutable build-contract test passed; TypeScript project build and full production
build passed. The build completed all runtime asset, production exclusion,
public-boundary and Farcaster Mini App checks. The production build used Windows
Node 24.19, outside the repository's pinned Node 22 range. It retains the known
`RealmMapScreen` chunk warning (680.22 kB raw / 188.87 kB gzip).

`derivePreparedClosureFamily` returned 1,249 members and 16 outputs with
manifest SHA-256
`55894f834179e505739f83a4978b50310fb726ce9f1e4261feb79af6515e4f33`; a fresh
process reproduced every installed byte. The clean committed checkout passed
`verify:sealed-launch --phase=checked-in` and remains in preparation with
package version `0.3.43`, Pages deployment approval false, and G001, G002 and
PTR identities unset. On this exact head, the pinned Linux closure-policy and
sealed-launch verifiers passed, as did six focused suites (216/216), including
the full 164-case prepared-workflow mutation matrix. The test checkout reused
its existing shared dependency link. A pinned Node 22 production-build attempt
stopped before the build because that link resolves the Windows esbuild binary;
the retained Linux npm cache is from 8 September and differs by 39 resolved
package versions, so it was not substituted. The local Windows full build and
TypeScript checks passed under Node 24, but the exact locked Linux build remains
unverified. Earlier Windows attempts of the Linux-only policy tests reject the
host's missing POSIX UID and `/usr/bin/git`; those were environment failures.

Commit `860370ab` was pushed to PR #374; local `HEAD`, the remote branch, and the
open PR head were confirmed equal. The commit uses `[skip actions]`. No GitHub
Actions workflow was dispatched, rerun, queried or used during September, per
the owner's instruction. At 02:47 UTC the public Alpha root returned HTTP 200
and `/ptr/` returned HTTP 404. The PTR remains unavailable, no release is
claimed, and skipped hosted checks remain pending. After October 1, confirm the
owner's direction before resuming hosted checks; continue with exact-head M1/M2
preparation, G001 preservation, sealed G002 readback, PTR publication/readback,
and owner/device acceptance.
