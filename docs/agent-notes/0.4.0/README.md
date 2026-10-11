Actual terrain inspection and SQL field correction - 11 October 2026

The read-only inspect-terrain-recovery on signed source 0939f24d closed exit 1,
PTR_INITIAL_ATLAS_TERRAIN_PREFIX_DIFFERENT; source/index/refs were held and cleanup
completed. Summary SHA256 91a0ab4a7e77080be8accfbe4e53084e6060b2f8c1f61770304469eb45b20621.
No writes, new submission marker or completed receipt were produced. A bounded
fixed-provider diagnostic traced the failure to indexed chunk comparison. The
verifier's camel-to-SQL mapping omitted the digit-to-uppercase boundary: it expected
lod_0cell_count instead of the backend's actual lod_0_cell_count (and likewise
levels 1-3). Corrected this mapping without relaxing exact row comparison. A literal
SQL-name regression also rejects the old malformed spelling. Independent review
passed; 83 affected verifier tests pass on Windows and Linux. Existing operator,
core and build-type evidence remains applicable. Preserve the atlas and all markers;
publish the correction, synchronize exact source, then obtain fresh actual inspection
and confirmation before any continuation. The prior failed inspection authorizes
no import. Authenticated gameplay and final release acceptance remain unproven.

Terrain-prefix continuation checkpoint - 11 October 2026

Implemented a distinct inspect-terrain-recovery / resume-terrain-import path for
an exact nonpassable prefix with no component membership, slots or resources.
The read-only verifier compares every retained chunk and indexed cell against
maintained verified artifact bytes, reconstructs the release hash state and rejects
missing, extra or changed rows. Two complete readbacks bind the confirmation;
a fresh prefix check precedes the first send. Earlier stage, component, region and
chunk operations are forbidden. All three prior markers remain unchanged; a fourth
once-only marker and genuine completion provenance precede any original ACK.
This is narrow recovery admission, not owner gameplay or release acceptance.
Windows and native Linux: 259 affected tests and root build-mode types passed.
Licensing, file-size, caller syntax and diff checks passed. Independent review
passed after correcting the signed timestamp bound and QA caller version identity.
Actual deployment
inspection and continuation are still pending. Preserve the accepted atlas; do
not rebuild, restage or replay a previously marked command. New QA caller versions
retain bounded diagnostic codes without retaining exception messages or credentials.

Current recovery checkpoint - 11 October 2026, committed terrain prefix retained

Diagnostic reporting correction: the import core now retains bounded submission
and inspection protocol codes; the operator keeps that diagnostic separate from
its ambiguous outcome. Typed token-acquisition errors are preserved before send.
The maintained CLI emits only the validated diagnostic code, never provider bodies
or exception messages. Windows/native Linux: 199 affected tests and root build-mode
types passed; independent bounded review passed. This improves future diagnosis;
it does not recover the lost underlying cause of the completed ten-chunk attempt.
No provider write was performed for this correction. Next: independently qualify
actual exact terrain-prefix continuation while retaining all three markers.

Signed source 1cd0b209427201eeea340736305b9a8c3808cd6f,
tree 77ef90fa90ae274045bf0946c23141d3299cd593, passed live
inspect-region-recovery. Summary SHA256
134d232bd80b1c0e643cc64a9ae34334f6acf2770bf999b434112234e99eda62.
The once-only resume-region-import ran 07:16:48.562-07:30:39.119 UTC,
closed exit 1 with IMPORT_OUTCOME_AMBIGUOUS_RECONCILE_ONLY.
Summary SHA256 2f21bf93cb5d34473e0bb1b4484282fe1677d9e70364f0da8fa55f7bc8ba3a2c;
operation SHA256 48adba699bab7dd6e04b86cbcf0e7a684f9666f7e6d6b9bbe0eb94b270d3e899.
Source/index/refs held; cleanup completed and native launchers are absent.

Actual fixed-provider readback proves next_chunk_ordinal=10 and ten terrain chunk
rows, importing, with zero verification progress. This is committed partial
progress, not a ready atlas or completed owner PTR. Original, staged-recovery and
region-recovery markers remain; no completion receipt was returned. Region marker
key 2011d5bd47cc2409ac2e36d1e40b265254b9e1f2413608c1b26a0443eae08838,
file SHA256 981de471bb186ab21f92f069c730809b3053b5b9b1868323c99df402db1bd80c,
created 07:28:38.275 UTC. Backend error readback is unchanged: no new logged
INVALID_PTR_ATLAS_ADMIN_SESSION. The current failure classification masks its
underlying cause; do not assert a new backend authentication failure without proof.

Next, Codex: preserve a sanitized underlying diagnostic alongside ambiguous outcome,
then qualify exact retained terrain-prefix continuation and real completion
provenance. Never rerun resume-region-import, erase a marker, rebuild/restage or
replay committed components/regions/chunks. Keep Alpha, G001 progress/admission
freeze, G002 seal, licensing and rollback. Owner, bridge/frontend, authenticated
journey, mobile/performance and cutover acceptance remain. 0.4 is not shipped.
Historical next steps below are superseded by this actual partial import.

Current recovery checkpoint - 11 October 2026, actual session renewal verified

Signed source bd5f1f52f6b169e4b018390f96d079f9e6198042,
tree f6104ed9090340b749ed5d3ef4ef0ccc4754aa23, is synchronized with GitHub
and native Linux. The actual default transport completed two read-only PTR reads
32 seconds apart and requested two tokens: renewalObserved=true. Both reads show
importing, six committed regions and zero terrain chunks. No provider write,
owner acceptance or release acceptance occurred. Safe evidence SHA256
73e1e8dc22c727f71142a48b0efd6ed92ce178d59247125bbbb5bc9f3743c2a8.
The ignored QA reporter's newline/projection parsing was corrected; its earlier
reporting failures do not establish a failed runtime renewal.

The distinct continuation is implemented as inspect-region-recovery followed by
resume-region-import with its actual fresh confirmation. Windows and native Linux:
202 affected tests passed, including chunk-zero continuation and provenance tamper
cases; root build-mode types passed on both. Licensing/file-size policy passed.
Independent bounded review found no remaining blocker after fixing validation of
the prior marker's profile and original-import link. Actual inspection and import
completion from this new source remain unproven; publish and synchronize first.

Next: inspect the distinct once-only continuation from the complete initialized
component/region prefix. Bind unchanged original and staged-recovery markers,
canonical regions and zero verification/terrain to fresh confirmation. Never
replay stage/components/regions or fabricate the earlier recovery's completion.
Require genuine completion provenance before acknowledging the original import.
Then owner provisioning, bridge/frontend, authenticated journey, mobile/performance
and cutover/rollback acceptance. Atlas43 remains accepted; no rebuild is needed.
Preserve Alpha, G001 progress/admission freeze, G002 seal and licensing.
0.4 is not shipped. Historical next steps below are superseded.

Current release checkpoint — 11 October 2026, Atlas43 retained; protected-target caller fixed

Atlas43 from signed source 86a24f58a93829d9c4ea04e3d8db1e6c7c6316b2
passed all 26 maintained proofs and local runtime preparation. Signed token fix
9284aa94 passed fresh actual backend inspection. Import then stopped before any
submission because its caller supplied an empty protected-target exclusion.
The actual nested journal is empty; its directories alone do not mean submission.
Fresh CLI alias readback resolved G001/PTR/sealed G002. The correction supplies
verified G002 to transport/import and binds it into confirmation; no guard is relaxed.
111 affected tests and root build-mode types pass on Windows and native Linux.
Detailed timestamps, receipt hashes and recovery:
[Atlas43/token recovery](2026-10-11-atlas43-token-activation.md).

Next, owned by Codex: publish/synchronize the qualified correction and use the
verified G002 readback in the maintained caller; inspect from that exact source;
import once only with actual marker absence and fresh confirmation (or reconcile
an existing marker); verify readiness, then provision the reviewed owner and accept
authenticated gameplay/mobile/performance before cutover. Keep Atlas43's original
provenance. Preserve Alpha, G001 progress/admission freeze, G002 seal and rollback.
0.4 is not shipped. Historical checkpoints below are superseded where conflicting.

Current release checkpoint - 10 October 2026, qualified bounded .53 Stonewake repair

Qualified implementation: f811be86282307439d721c91c3fe08351ab20bd1.
This signed evidence checkpoint follows .52 commit
7723386703c928f450b9bc79d2dd4c6717d4f327. It is development source, not a
selected atlas or a completed release. Preserve the installed PTR backend,
Alpha, G001 access/progress and admission freeze, G002 seal, licensing and rollback.
No provider write or GitHub Actions execution has been performed for this repair.

Replacement41 closed with exit1 at 19:28:48.225 UTC after all 256 attempts:
206 geography rejections and 50 proof rejections. The original launcher,
worker group, recorded descendants, supervisor and cutoff are fully closed.
No interruption, timeout, source hold or toolchain failure caused exhaustion.
Never resume that exhausted workspace or import its rejected worlds.
Native credential-free authenticated terminal receipt:
artifacts/qa/october-release-atlas41-authenticated-terminal-v1.json
SHA256 fc24c7c5500638107e737571022e6bbfb120feb9390bc125d44074ed13537ed3.
Failure diagnostics receipt SHA256
 ae302824a75282e58fd850ccc1e5cc6c990aec9d556e9bfbfe1ffbc6cfc1e9a1.

The exact ordinal102 replay reproduced only regional QA and Stonewake failures.
Physical island/strait search found no eligible endpoint in its assigned basin.
Final signatures showed the sole basin satisfying Stonewake also supplied the
only passing Frostmere signature; distinct regional assignment cannot reuse it.
Donor budgets, locks, search truncation and missing caller invocation were ruled
out. A centered-rift diagnostic rebuilt geological authority and passed every
hard gate; the existing water-only repair then completed the actual strait.
It remains diagnostic evidence, with no selection, preparation or import authority.

A broad centered-rift source draft regressed six checks in the unchanged public
and ordinary-world suites, including the gate graph. It was reverted. Mixed and
single-center drafts also failed existing natural topology/regional proofs and
were discarded. No fixture root, ordinal, digest or proof was weakened to admit
these drafts. The actual .53 correction retains the original layout first.
Only a world failing exactly regional QA plus Stonewake receives one centered-
chain geological rebuild, with the same root, ordinal and seed namespace .3.
Every downstream authority and release proof is recomputed; any new failure still
rejects it. Eligible worlds and unrelated rejected worlds retain their ordinary
layout. This is a bounded generator repair, not a second unbounded search.

Candidate retirement is shared between generation and packaging through a
module with only a type import, avoiding a runtime package/generator cycle.
Secrets are wiped first; typed authority, grid coordinates and neighbors are
wiped even if mutable geometry or the coordinate-index cleanup throws. The
existing cleanup regression also covers an intentionally frozen geometry path.

Explicit final generator/package/test TypeScript on Windows and native Linux,
root build-mode types, license, file-size, scoped redacted secret scan and diff
checks pass. Bounded independent review found no demonstrated production blocker;
its retirement-error and diagnostic-wording concerns were corrected.
Native session82959 closed exit0: 115 passes (82 package, 21 generator, 11 rejection,
1 ordinary yield). The original public root, ordinal and final digest remain
unchanged. Final f811be86 source then passed both index/geometry cleanup cases in
session70148 and all 22 coherence/strait tests in session9261, each closed exit0.
This covers 138 distinct tests across six files, reusing the unaffected passing
package/generator evidence rather than repeating their expensive integrity replays.
Windows package tests failed before execution because the temporary ancestor was
untrusted; native acceptance passed without weakening private-path checks.

Session53764 closed exit0 on the exact ordinal102 diagnostic. The bounded .53
implementation preserved the ordinary rejection first, retired it, then rebuilt
once and passed every hard gate with all regional signatures passing. No release
selection, preparation or import. Native credential-free diagnostic receipt:
artifacts/qa/october-release-atlas41-ordinal102-bounded-rift-counterfactual-v1.json
SHA256 3c1ee2ff2449e82fbee3d191a7dd958a75b572f8cce4969d20ef4b60035f04e6.
Its private checkpoint remains bound to original .52 source; the hash-held ignored
.53 diagnostic module mirrors the reviewed production repair. This receipt is
qualification evidence, never a deployable accepted package.

Next executable order: synchronize and freeze this qualified published source;
run one fresh bounded release atlas search. Only its authenticated accepted package may proceed through import,
owner provisioning, actual PTR gameplay/mobile acceptance and cutover/readbacks.
Farcaster web login was verified again, but the MiniApp still showed secure-sign-in
timeout with a separate wallet confirmation prompt. Web login is not authenticated
owner PTR gameplay evidence. Keep the pending human wallet handoff separate from
atlas work; do not create a persistent wallet session automatically.

Historical checkpoint follows; its source and process handles are historical.

Current release checkpoint - 10 October 2026, qualified .52 capacity-annex repair

Candidate source is the signed commit containing this checkpoint. It replaces
published .51 documentation checkpoint 7e25574bb4841e847c430887d3be7d0e67c0b839.
Replacement40 is exhausted and fully closed; no accepted release atlas or provider
write. The .52 correction fixes two public-seam regressions: capacity borrowing can
damage a surviving donor body, and largest-body-only search can abandon a safe
mainland repair when Stonewake's largest body is offshore. Each complete proposal
checks real donor topology using the existing gate-foothold donor margins, then
performs equal non-passable ownership swaps. Search stays largest-first and tries
other real target bodies when an earlier complete proposal cannot succeed.
Terrain seed namespace .3, release proofs, legacy/immutable authority, exact
populations, installed PTR backend and preserved Alpha remain unchanged.

Qualification covers 137 distinct native tests across six files. Original
session34831 closed exit1 with 136 passes and one stale historical digest assertion;
all 82 package tests, 12 coherence tests, 11 rejection tests, 10 strait tests and
ordinary-world eligibility passed. Comparing published .51 with .52 on the same
public root/ordinal proved identical authoritative arrays and every stage digest,
with all final proofs passing and no eligibility failures. Both produce final hash
a3bdf4c9e048b6edde634e0b70e38e6e6697661d26c17e1df757dd24b0f4901c.
After correcting that stale assertion, generator session49093 closed exit0 with
all 21 tests passing. The unchanged 116 other checks retain their passing evidence.
Windows focused qualification passes 13 tests. Explicit generator/test TypeScript,
root build-mode types, license policy, file-size policy, scoped redacted secret
scan and bounded independent source review pass.

Three indexed-geometry regressions cover a severed donor bridge, a safe endpoint
transfer and Stonewake's smaller mainland body. Old-source failures were observed
before correction. Donor topology uses the existing ownership-transfer margins:
ordinary outer8500 basis points and Stonewake6500. Final atlas proofs remain
unchanged. Later gate-parent selection uses actual repaired contacts. The original
ordinary test world's root, ordinal and authoritative fields remain unchanged.

Next: verify exact published-source synchronization, freeze that source and run
one fresh bounded atlas search. Authenticate actual terminal closure before
selection/preparation; preserve the installed backend and existing Actions hold.
Owner PTR acceptance follows the accepted atlas import/provisioning path. Restored
Farcaster web authentication already verified preserved Alpha access; MiniApp
QuickAuth PTR entry and the owner gameplay journey still require actual acceptance.

Historical checkpoint follows; its process IDs and source holds are historical.

Current release checkpoint - 10 October 2026, authenticated replacement40 exhaustion

Reviewed .51 source ad7e7233916cd89574270cd5d20b7835deacd205
(tree abbc72eb8c77706f1811514e4ace9f48425eb43a) was published and synchronized
before replacement40. Original session22137 started 16:23:35.635 UTC and closed
exit 1 at 17:26:08.762 UTC. Maintained validation authenticated all 256 rejections:
208 geography, 48 proof. No timeout, interruption, source/toolchain or monitoring
failure. Full worker/group/supervisor absence and root-seed zeroization verified.
Cutoff session26340 stopped after authenticated closure; native helper absence
verified. Never reuse exhausted replacement40. No accepted atlas, selection,
runtime preparation, import or provider write. Credential-free terminal receipt:
artifacts/qa/october-release-atlas40-authenticated-terminal-v1.json
SHA256 827944d91ff92376879fdd6d764d83c657c376d11303a7d4ee0b4ae7baedda57.

A source-bound replay of the sole regionally eligible rejection, ordinal230,
reproduced missing Sunscar -> Ironveil (region2 -> region7) gates: that arm
has no gate while the other
eight retain two each. Natural boundary, geomorphology, hydrology and geological
barrier proofs pass. Remaining failures concern gate access/graph, regional land
coherence/passability, castle capacity/suitability and Throneheart being smallest.
The .51 enumeration correction remains qualified; it has not produced an accepted
release world. Do not lower proofs or launch the same-source search again.

A hash-pinned aggregate-only instrumented copy matched the direct replay's final
diagnostics exactly. Stonewake (region4) already has only 2,891 traversable cells and a
29.68% dominant land component immediately after natural region coherence repair;
Throneheart then has 7,047 traversable cells. Before the late strait repair those
counts are 2,727 and 6,561, with region4's dominant share 31.46%. The strait repair
returns unchanged, and the pre-sites counts remain identical. Region6 also loses
its earlier capacity margin after sealing. Trace initial allocation and the
reachable donor/capacity decisions in natural coherence repair before claiming
an implementation defect. The measured world remains unusable under existing
rules. No seed, coordinates, identity or private Realm payload was disclosed.
Replay sessions23478,85870 and16690 closed exit 0; explicit diagnostic types pass.
The first eligible-helper preparation exposed a TypeScript union-narrowing error
in ignored QA code; it was corrected and typechecked. It did not affect the game
or the authenticated terminal result. Instrumented stage receipt:
artifacts/qa/october-release-atlas40-ordinal230-stages-v1.jsonl
SHA256 5ecea7fcf4286d2ea39ce5e47dd706aa6987c700c8136ac8be5b1be249f6233d.

Owner web acceptance advanced: the saved Farcaster session restored on deployed
frontend BUILD 9EA4821 at https://warpkeep.com/ptr/. The preserved Alpha realm
rendered the owner's existing keep, showed verified keeper identity, and retained
that identity on returning to the menu. The directory reports G001 admitted,
G002 sealed and PTR access unknown. No resource command was performed. This is
Alpha/web-session evidence, not authenticated PTR gameplay acceptance; PTR uses
Mini App QuickAuth, whose separate browser-wallet confirmation is still pending.
Credential-free local observation SHA256:
e40f8bccaa9d439de7fd62598d746982bd04732a44a0fd08f5589242c98a4b0c.

Next ordered work, owned by Codex:
1. Diagnose the earlier land allocation/coherence and missing gate route using
   the actual callers, then reproduce demonstrated defects in public fixtures.
   Qualify and publish a coherent correction before another bounded atlas build.
2. Verify/select/prepare only an actually accepted atlas. Replacement40 adapters
   were prepared and typechecked, never invoked; exhausted work is not acceptance.
3. Bind import to the accepted source and the existing installed-backend readbacks;
   do not reapply backend6713e152.... Provision only the actual isolated PTR owner.
4. Accept gather -> choose -> build -> benefit -> return, mobile comfort and
   performance through real owner authority, then finish frontend/cutover/rollback.
Preserve Alpha, G001 progress/admission freeze, sealed G002 and licensing.
0.4 remains unshipped. Historical checkpoint follows.

Current release checkpoint - 10 October 2026, canonical gate approach options (.51)

The .51 generator correction is locally qualified for publication. The real
compatibleGateApproaches caller counted primary/alternate label swaps as separate
options, exhausting bounded callers on repeated geometry. Canonical unordered
pairs retain original option zero and let unchanged finite budgets inspect more
distinct corridor combinations. All four callers treat both routes symmetrically.
No sealing, disjointness, core-connectivity proof, search limit or terrain seed
namespace changed. This does not establish acceptance of an atlas.

Public regressions reproduced the old failure before the correction: two new
tests failed while the six existing coherence tests passed. The corrected tests
also reject routes ending in disconnected, genuinely derived dry cores and verify
input preservation. Windows focused tests: 20 passed, actual session47293 exit 0.
Linux package/rejection/coherence: 102 passed, original session90837 exit 0,
598.71 seconds; strait ownership: 10 passed separately, exit 0. Root build-mode
and explicit generator/test TypeScript, licensing, file-size policy and scoped
redacted secret scan passed. Independent review found no blocker.

Next: publish and synchronize this reviewed checkpoint, bind one fresh bounded
replacement40 to its exact commit/tree, and authenticate its actual terminal
result before selecting/preparing anything. Never reuse exhausted replacement39.
Only an accepted atlas may proceed to import, actual owner provisioning and PTR
acceptance, then frontend/cutover. The installed backend must not be reapplied.
Alpha, G001 progress/admission freeze, sealed G002 and licensing remain preserved.
Farcaster host login is verified; Warpkeep QuickAuth and the separate 30-day
browser-wallet confirmation remain unverified. No provider writes or deployment
were performed by this correction. 0.4 remains unshipped.

Historical checkpoint follows; pending statements below are superseded.

Current release checkpoint - 10 October 2026, authenticated replacement39 exhaustion

The published .50 correction is qualified and synchronized at
b9cd1b3d5d4dc6495d79bbdc0023ae32d24deebc
(tree f33319701526f4f4d5901ef2f71d137bb59d2326). Replacement39 used that exact
source. Original session28376 started at 14:31:30.698 UTC and closed exit 1 at
15:38:41.622 UTC, before its cutoff. No timeout, interruption, source-hold or
toolchain failure. Maintained terminal validation authenticated all 256
rejections: 217 geography and 39 proof. No accepted atlas, selection, runtime
preparation, import or provider write. Worker/group/supervisor absence and root
seed zeroization were verified. Cutoff session86074 was stopped after validation;
its native helper absence was verified. Never reuse exhausted replacement39.
Credential-free terminal receipt:
artifacts/qa/october-release-atlas39-authenticated-terminal-v1.json
SHA256 54d78a29c2ebb6897a3921b2dfd9b5eb4d65330e3185c5a5ed386c22150f3e06.

One rejected candidate, ordinal72, passed regional hydrogeomorphology and the
major-river range. A source-bound replay reproduced seven failed proofs: gate
approaches, gate graph, advanced geomorphology, natural outer boundary, regional
land coherence, regional passable land and region graph. The planned region2 ->
region7 connection has no gate, despite 345 barrier cross-sections; the other
eight planned pairs retain two gates each. This is a reproduced release-blocking
candidate failure, not yet a demonstrated selector implementation bug.

A second bounded replay used a hash-pinned diagnostic copy of the exact .50
generator, with aggregate logging only. TypeScript and actual replay exit 0;
tracked source, private checkpoint, production and proof thresholds were unchanged.
It measured 743 gate candidates and 83 with approaches on both sides of the
missing pair. Further tracing must distinguish pair compatibility, sealing,
regional-core connectivity and fallback selection before claiming a source bug.
No coordinates, root seed, identity or credentials were disclosed.

Further tracing measured zero usable approaches among the fallback's first 128
raw edges. An experimental necessary-reachability filter retained the same
expensive search limits and exposed 83 reachable edges, eight compatible
single-gate options and no valid two-gate bundle. All 3,328 examined pair options
failed existing sealing checks: 1,440 expose an unintended entrance and 1,888
have an approach crossing a selected gate endpoint. The other eight graph arms
have bundles. The experiment did not restore gates or any failed proof and is
not a qualified source fix. Keep it out of production; neither relax sealing
nor infer that removing candidate starvation alone makes this world usable.
Diagnostic replay sessions7995,45198,31786,91496 and2227 all closed exit 0;
all diagnostic/experimental code remains ignored, with no provider calls or
checkpoint writes. Source remains .50. Next diagnosis must inspect approach
option compatibility and earlier regional land allocation, with a reproducing
public fixture before modifying the maintained implementation.

The same replay identifies independent rejection causes: no volcanic anchors,
volcanic tectonic compatibility zero, ridge uplift alignment 8,488 below the
8,500 requirement, and an aligned outer-boundary run of 112 above the existing
96 limit. Final passable-land largest-component shares are 7,805 basis points
for region1 and 5,498 for region5, both below their 8,000 requirement; final
fragmentation and tendril proofs also fail. Relief structure and natural landmass
topology pass. These values explain rejection; they do not justify lowering
thresholds, changing world authority or rerunning the same exhausted search.

Next ordered work, owned by Codex:
1. Trace the reproduced gate and connectivity failures through the real callers.
   Fix demonstrated defects with public regressions and qualified source changes
   before another bounded build. The .50 qualification/publication is complete;
   do not repeat it or treat Farcaster host login as atlas acceptance.
2. Verify/select/prepare only an actually accepted package. The replacement39
   continuation/runtime adapters are prepared and typechecked, never invoked.
3. Bind import to that accepted source and inspection45c7403e..., prior
   4a78bc2b... and bootstrapad787790.... Do not reapply installed backend6713e152....
4. Provision the real owner and accept gather -> choose -> build -> benefit ->
   return on PTR with mobile checks. Host Farcaster login is verified, but
   QuickAuth and the separate browser-wallet handoff remain unverified.
5. Complete frontend/cutover readbacks and rollback. Preserve Alpha, G001 progress
   and its admission freeze, sealed G002 and existing licensing. 0.4 is unshipped.

Historical checkpoint follows; pending statements below are superseded.

Current release checkpoint - 10 October 2026, planned-parent frontier correction

Replacement38 ran against published source bdf30f484db7380fff058196bbb4704431815f6c
(tree c355748b03bd95c3562f63703f45e8b9698b52b7, generator .49). Its original
session97599 closed with exit 1 at 13:53:13.155 UTC. Maintained terminal validation
authenticated all 256 rejections: 216 geography, 40 proof. One candidate passed
regional hydrogeomorphology, but failed gate approaches, gate graph, geological
barrier coverage, natural landmass topology and region graph. No accepted atlas,
selection, preparation, import or provider write. Source/index/refs, toolchain,
root-seed zeroization and full worker/group/supervisor absence were verified.
The cutoff session92310 was stopped after authenticated closure; helper absence
was verified. Never reuse the exhausted workspace. Credential-free receipt:
artifacts/qa/october-release-atlas38-authenticated-exhaustion-v1.json
SHA256 9a70fd0128fcbf8699b70c9f74d8f6176fecbcf3f9bc0f35402fe9bc92960d60.

A source-bound, bounded replay of ordinal192 traced the gate failure to natural
region coherence repair. The planned region1 -> region7 frontier had 187 dry
contacts after semantic naming and only 24 after repair. Repair protected a
1,550-cell foothold with 193 contacts to a different middle realm and transferred
the 955-cell foothold serving the actual parent. The remaining frontier had no
outer-side exit from the barrier band: zero approaches, zero cross-sections,
16 gates and coverage for eight of nine required graph pairs. This is a real
planned-parent preservation defect, not a reason to increase search budgets.

The .50 correction counts dry tier contacts only with the source region's
planned graph parents. That rule governs both foothold protection and subsequent
foothold trimming. The experimental replay retained the correct frontier and
restored 18 gates, route redundancy, gate approaches, gate graph and geological
barrier coverage. It still failed land coherence/passable land/region graph and
natural landmass topology (nine large islands against a maximum of eight).
The replay is rejected and must not be imported or called accepted. Do not infer
that this correction resolves all regional failures or establishes release readiness.
No proof threshold, search budget, terrain seed namespace, Lowlands authority,
licensing, backend installation or deployment change.

Two public synthetic regressions invoke the real coherence repair with valid
middle-tier spine authority. Both fail with the previous contact predicate and
pass with the planned-parent correction; they cover a larger foreign foothold
and a dominant body touching the wrong parent. They also verify population/tier
conservation and unchanged caller-owned terrain/water/authority arrays.
Windows focused checks, explicit generator/test TypeScript on both platforms,
root build-mode types, license/file-size policy and redacted outgoing scan passed.
Native session67958 closed exit 0: 99 tests (82 package, 11 rejection, 6 coherence)
in 592.81 seconds. Final corrected coherence fixtures also passed separately on
both platforms. The originally named strait test path matched no file; the actual
greaterRealmStraitOwnershipRepair.test.ts was then run separately and all 10 tests
passed. Qualification covers ordinary/repaired public package replay, tamper
rejection and zeroization; it does not establish private atlas acceptance. Independent bounded review found no production
blocker and identified an initially non-reproducing parameter; that fixture was
corrected and both old-behavior failures were observed. Publish the coherent
reviewed correction with its actual verification status and synchronize source.

Next ordered work, owned by Codex:
1. Finish exact .50 qualification and publication; retain truthful rejected38 evidence.
2. Diagnose demonstrated remaining atlas failures before another bounded build.
   Verify/select/prepare only an accepted package; never reuse exhausted38.
3. Bind atlas import to accepted source and final inspection45c7403e..., prior
   4a78bc2b... and bootstrapad787790.... Do not reapply installed backend6713e152....
4. Provision the real owner and accept gather -> choose -> build -> benefit ->
   return on PTR with mobile checks; preserve Alpha, G001 and sealed G002.
5. Complete frontend/cutover readback and rollback. 0.4 remains unshipped.

Farcaster host login is not QuickAuth acceptance. The previously observed
quick_auth_token_timeout and separate browser-wallet identity handoff remain
unverified until actual owner sign-in succeeds. Never replace player access
with admin credentials or report hosted static delivery as gameplay acceptance.

Historical checkpoint follows; pending statements below are superseded.

Current release checkpoint - 10 October 2026, barrier-coherence qualification

Published source f2f858f008375766adf387ded8393bcd104f7574 (generator .48)
completed replacement37 at 12:21:23.210 UTC with actual exit 1. Maintained
terminal validation authenticated exhaustion: 256 rejections (218 geography,
38 proof). Two candidates passed regional hydrogeomorphology; both failed
TIER_III_SMALLEST_PASSABLE_LAND, one also failed minor-stream count. No atlas
was accepted, selected, prepared or imported. Root seed zeroization, source
preservation and worker/group/supervisor absence were verified. Cutoff monitoring
was stopped; production was untouched. Credential-free exhaustion receipt:
artifacts/qa/october-release-atlas37-authenticated-exhaustion-v1.json
SHA256 4075f8697a52b93f77b60ebb42356c2569ac48d12154dbf62f99750355a41655.

A public synthetic fixture demonstrates an independent coherence defect:
region1 donates 70 passable cells, falling from 150 to 80 while Throneheart
stays 100. The smallest-passable proof changes from true to false despite
population conservation. This does not establish replacement37's private cause.
The .49 correction skips transfers whose barrier-excluded donor would become
no larger than Throneheart, continuing existing bounded choices. Regression
coverage includes below/equal capacity, sealed barriers and permitted transfers.
No proof threshold, search budget, terrain seed namespace, Lowlands authority,
licensing, backend installation or deployment changes.

Windows focused tests, explicit TypeScript and build-mode types passed.
Native Linux passed all 106 tests in the affected package/repair/rejection batch
in 581.11 seconds, including public ordinal9 and repaired ordinal18 replay,
tamper rejection and zeroization. The final four focused coherence tests also
passed separately on both platforms. License, file-size, diff and redacted
source-secret checks passed. Independent review found no blocker; its sealed-
barrier test gap was covered. Complete Actions history and a fresh readback at
12:40:30 UTC confirmed no active runs, unchanged workflows and all four repos
disabled. Publish this reviewed .49 checkpoint and synchronize exact source
before rebuilding. The preceding .48 checkpoint remains the historical base.

Farcaster host login was verified. A fresh Alpha Mini App attempt returned
quick_auth_token_timeout (build 5f77c3c) while Farcaster displayed its separate
30-day browser-wallet identity prompt. Host login is not QuickAuth acceptance;
the existing human handoff remains pending. Do not substitute admin access.

Next ordered work, owned by Codex:
1. Complete .49 qualification, publish the reviewed source, synchronize native.
2. Run one fresh bounded source-bound atlas and authenticate actual closure;
   verify/select/prepare only an accepted package. Never reuse exhausted37.
3. Bind import adapters to accepted evidence and final inspection 45c7403e...
   with prior 4a78bc2b... and bootstrap ad787790.... Do not reapply backend6713e152....
4. Provision the real owner and accept gather -> choose -> build -> benefit ->
   return with mobile checks; preserve Alpha, G001 progress and sealed G002.
5. Complete frontend/cutover readback and rollback. 0.4 is not shipped.

Historical checkpoint follows; pending statements below are superseded.

Current release checkpoint - 10 October 2026, atlas repair qualification

Published source 9512a86db68b0a4ef6525900fbab0718a6a97079 (generator .47)
remains the remote checkpoint. Replacement35 was interrupted by a native runner
reboot; no terminal receipt existed, and its checkpoint was safely aborted.
Do not describe it as completed or exhausted and do not reuse its workspace.

Replacement36 closed with actual exit 1 at 11:01:00.455 UTC. Maintained terminal
validation authenticated exhaustion of 256 candidates: 220 geography and 36
proof rejections. All 36 proof candidates failed regional hydrogeomorphology.
No candidate was accepted, selected, prepared or imported. Source was preserved,
the root seed zeroized, and worker/group/supervisor absence verified. The cutoff
monitor was stopped. Production was untouched. Credential-free exhaustion receipt:
artifacts/qa/october-release-atlas36-authenticated-exhaustion-v1.json
SHA256 6140a9b3c8162bc076881a37bc0bdd96755bce1d1918eab0a59fdf4c2a1c1b34.

Bounded public diagnosis demonstrated that strait ownership repair returned after
the first independently rejected threshold-reaching corridor. It could discard
an accepted alternative within its existing four-plan budget. The .48 correction
undoes only rejected swaps and donor consumption, retains earlier partial work,
and continues bounded enumeration. A fixture preserving cell q=6,r=1 rejects
the first trial and accepts the second; conservation, final Stonewake proof and
input authority are checked. Preserving the whole q=6 corridor is not claimed.
This helper defect is reproducible; it does not prove the cause of replacement36.
Package version advances to .48; terrain seed namespace remains .3. No acceptance
threshold, search budget, Lowlands lock, licensing or deployment changes.

Windows repair tests (10), rejection tests (11), build-mode types and explicit
TypeScript passed. Native Linux passed all 103 affected tests (10 repair, 11
rejection, 82 package) in 509.84 seconds, including deterministic replay, repaired
semantic-region roundtrip, tamper rejection and cleanup. License, file-size, diff
and redacted source-secret checks passed. Independent review found no blocker.
Complete Actions inventory at 11:11:03 UTC found no active runs and all four
repositories disabled; publication is pending. Do not rebuild or import until
the corrected source is published and synchronized as an exact checkpoint.
Owner Farcaster host login is visible; this is not owner PTR QuickAuth acceptance.

Next ordered work, owned by Codex:
1. Finish package qualification, review and publish the corrected checkpoint;
   preserve disabled Actions and synchronize the native checkout exactly.
2. Generate one fresh bounded source-bound atlas, authenticate its actual closure,
   and verify/select/prepare only an accepted package. Retire exhausted workspaces.
3. Bind import adapters to the accepted package and final inspection 45c7403e...
   with prior 4a78bc2b... and bootstrap ad787790.... Do not reapply backend 6713e152....
4. Provision the real owner, accept authenticated gather -> choose -> build ->
   benefit -> return with mobile checks, and preserve Alpha and G001/G002 policy.
5. Complete frontend/cutover readback with rollback preserved. 0.4 is not shipped.

Historical checkpoint follows; pending statements below are superseded.

Current release checkpoint - 9 October 2026, 14:55 UTC

Published source 4ba9899632e8e90266af6262d76dfe19dcaf1c21 (generator .46)
completed replacement34 at 14:49:28.696 UTC. Maintained terminal validation
authenticated exhaustion of all 256 candidates (207 geography, 49 proof), seed
zeroization, source preservation and worker/group/supervisor absence. No atlas
was accepted, selected or imported. Production was untouched. The cutoff monitor
is stopped and its native process is absent. Do not resume this workspace.

A public reproduction demonstrates a remaining independent-shortlist defect:
both complete sibling pools contain compatible pairs, but each bounded shortlist
can discard the other's compatible witness, leaving no pair for ranked search.
The local .47 correction jointly reserves a compatible pair within existing caps
and integrates ordinary and repair selection. Lowlands protection, preferred and
donor eligibility, proof criteria and the terrain seed namespace remain intact.
This reproduction does not establish the cause of every private rejection.

Validation completed: native Linux passed 146 affected tests (53 search,
11 rejection, 82 package) in 620.75 seconds, including deterministic replay,
tamper rejection and cleanup. Explicit TypeScript, root build-mode types, license
and file-size checks passed. Independent review found no functional blocker.
The joint witness adds at most one reserved choice per capped child pool and
65,536 predicate calls per uncached parent/lane; it preserves original rank order
but does not claim the globally lowest-score pair. Actions inventory completed
at 14:57:29 UTC with no active runs and all configured repositories disabled.
Publication is pending; no replacement35 or provider write has started.

Next ordered work, owned by Codex:
1. Review and qualify joint selection, publish the source checkpoint with conserved
   Actions state, and synchronize exact bytes into the idle native checkout.
2. Generate a fresh source-bound atlas; authenticate closure and verify/select/
   prepare only an accepted package. Bind import adapters to that exact source.
3. Import using final inspection 45c7403e... plus prior 4a78bc2b... and bootstrap
   ad787790.... Installed backend 6713e152... must not be reapplied.
4. Provision the real owner; accept authenticated gather -> choose -> build ->
   benefit -> return, mobile performance and Alpha preservation, then cut over
   with rollback retained and verified deployment readback.

G001 progress and the admission freeze remain preserved; G002 stays sealed.
Farcaster host login does not establish mini-app secure-sign-in acceptance.
Existing Alpha remains the public baseline. 0.4 is not shipped.

Earlier checkpoints (historical):

Current release checkpoint - 9 October 2026, 13:26 UTC

Published source 6220954dd197db976976df0b3a5db4bac0cddf95 (generator .45)
completed replacement33 at 13:20:00.439 UTC. Maintained terminal validation
authenticated all 256 rejections (218 geography, 38 proof), seed zeroization,
source preservation and worker/group/supervisor absence. No candidate was
accepted or imported; production was untouched. The cutoff monitor is stopped.
Do not resume this exhausted workspace or reuse its prepared import adapters.

The local .46 correction addresses another reproduced shortlist loss: choices
with no physically compatible, sufficiently separated sibling could occupy the
entire cap. Both ordinary and repair paths now use their existing complete
compatibility predicate before shortlisting. An option is removed only after
every raw eligible sibling is disproved. The bounded callback budget retains
unresolved and unvisited choices; it does not reject a candidate. Existing caps,
Lowlands protection, preferred/donor lanes, proof criteria and terrain seed
namespace remain unchanged. Downstream pair construction shares the predicate.
This reproduction does not prove the cause of every private rejection.

Validation so far: 62 affected search/rejection tests passed, including the
axial separation reproduction through actual ranked search and conservative
budget exhaustion. Native Linux passed all 144 affected tests (51 search,
11 rejection, 82 package), including deterministic replay, tamper rejection and
cleanup, in 630.49 seconds. Explicit TypeScript, root build-mode types, licensing,
file-size policy, diff whitespace and outgoing secret scan passed. Independent
bounded review found no functional blocker. The full Actions inventory completed
at 13:31:33 UTC: no active runs and all configured repositories disabled.
Publication is pending; no fresh private search has started.

Next ordered work, owned by Codex:
1. Finish native qualification and reviewed publication of .46, synchronizing
   exact bytes and checking conserved Actions state before the remote checkpoint.
2. Run one fresh source-bound atlas search, authenticate actual closure, then
   verify/select/prepare only an accepted atlas. Bind new adapters to that source.
3. Import against final inspection 45c7403e... with prior 4a78bc2b... and preserved
   bootstrap ad787790.... Installed backend 6713e152... must not be reapplied.
4. Provision the real owner and accept authenticated gather -> choose -> build ->
   benefit -> return, mobile performance and Alpha preservation; then cut over
   with verified rollback and production readback.

G001 progress and the admission freeze remain preserved; G002 stays sealed.
Farcaster host login alone is not actual mini-app secure-sign-in acceptance.
Existing Alpha remains the public baseline; 0.4 is not shipped.

Earlier checkpoints (historical):

Current release checkpoint - 9 October 2026, 11:51 UTC

Published predecessor d501b848eb569c69c59c527562e28488635b26cb repaired
successive PTR backend-update continuity; the native affected suite passed 105 tests.
Backend program 6713e15292fc304ebc971e3bc37b852d81f4ee5507b813682634f6d6d172dae4
is installed with preserved schema, rows and configuration. Do not reapply it.

Replacement31 closed at 11:41:21.427 UTC: all 256 candidates were rejected
(211 geography, 45 proof). The terminal reader authenticated exhaustion,
source preservation, seed cleanup and worker/group/supervisor absence.
No selection or provider write occurred. The cutoff watcher is also stopped.

The next generator revision .45 fixes a reproduced bounded-search failure:
provably incompatible bundles could occupy all 256 shortlisted positions,
hiding a feasible sibling pair. Ordinary and repair callers now prune only
collisions with cells mandatory in every option of the complete raw sibling
pool before applying the existing cap. Preferred and donor repair pools remain
separate; Lowlands protection, proof criteria and terrain seed namespace remain
unchanged. A synthetic reproduction and exhaustive small-footprint checks cover
feasible-pair preservation. This does not prove that all historical failures had
this cause. Historical packages retain their original source and generator bindings.

Validation completed: native Linux passed all 142 affected tests (49 search,
11 rejection, 82 private-package tests), including deterministic replay, tampering
rejection and cleanup. Explicit TypeScript, root build-mode types, license policy,
tracked file-size policy, diff whitespace and outgoing secret scan passed.
Independent bounded review found no functional blocker. Repository-wide Actions
inventory found no active runs; Actions remain disabled, with no runner usage.

Next ordered work, owned by Codex:
1. Finish native qualification, publish the reviewed .45 checkpoint and synchronize
   exact source bytes before a fresh bounded source-bound atlas generation.
2. Authenticate actual closure; verify/select/prepare the eligible atlas. Import
   against final inspection 45c7403e... with prior inspection 4a78bc2b... and the
   preserved bootstrap inspection ad787790.... Never relabel a historical package.
3. Provision the real owner; accept authenticated gather -> choose -> build ->
   benefit -> return, mobile performance and Alpha preservation.
4. Complete production cutover/readback with rollback retained.

Farcaster host login is verified. Mini-app secure sign-in is not yet accepted;
the host browser still requests a separate wallet identity confirmation.
G001 and its admission freeze are preserved; G002 stays sealed. Existing Alpha
remains the public baseline. No new release completion claim is made here.

Earlier checkpoints (historical):

Current release checkpoint — 9 October 2026, 08:48 UTC

Published and native frozen source: 3bd4214342262251be0a08792b9eee45cfd44157
(tree 47ee7d67a3ff31ce497525e87736d6c47b597c7d).
PTR update completed with provider acknowledgement and fresh preservation readback:
installed program 6713e15292fc304ebc971e3bc37b852d81f4ee5507b813682634f6d6d172dae4.
Schema, retained rows and private configuration were preserved. Owner and atlas
readiness remain incomplete; this is not authenticated journey acceptance.

Replacement29 started 08:23:51.284 UTC from this exact source. Process monitor
54638 remained live at 08:46 UTC. Do not change native tracked source/index/refs
or start another worker before actual closure and authenticated terminal readback.
Retain its original source provenance even when later operator-only fixes publish.

Windows-only pending patch repairs the demonstrated two-update continuation gap:
bootstrap ac364d4f... -> first update 95ca5801... -> current program 6713e152....
Both real immutable inspections and acknowledgements are retained. The operator
accepts an explicit ordered prior-update-inspections list, verifies each signed
source/tree and ancestry, preserves historical rows/configuration/schema continuity,
rereads all journal records after asynchronous boundaries, and still requires fresh
final installed-program readback. Single-update digest/import markers stay compatible;
marked imports remain reconciliation-only. Never bypass this check by relabelling
the bootstrap candidate or rerunning the successful backend update.

Validation: 79 affected tests passed before four additional historical-continuity
cases; those four passed after correcting the owner fixture to include its anchor.
Explicit operator/test TypeScript checking, root tsc -b and diff whitespace checks passed.
Independent read-only review found no reproducible release-blocking patch defect.
Prepared, not invoked: replacement29 initial-atlas child/run/parent QA adapters.
They target the actual replacement29 workspace and final inspection 45c7403e...
with explicit prior inspection 4a78bc2b.... All three syntax checks passed and
native ignored copies are exclusive UID1000/mode600 files. Their SHA256 values:
child 38f8f238716b8da8bda170bb530cc02f40c282464cf6c1c21265189b5da21b60
run 919584b67427d45779297926ff6fe6353f75017a383a78f7eda92311ed46ef21
parent 92d11f9a6b72baabdac485b69d68a48c1075a82e357526c396a93603ea069ef0
No credential or provider input was used during preparation. At the 08:50 UTC check, the
actual worker /proc identity matched recorded birth 86266360 and remained R;
supervisor and timeout identities also matched. No native tracked mutation.
Independent read-only review also found no concrete invocation blocker in these
three adapters; native identity and invocation readback remain runtime checks.

Pending: final local qualification, worker closure/terminal authentication, signed
publication and native synchronization, actual runtime selection/preparation,
initial atlas inspect/import/readbacks, owner provisioning and authenticated journey.
The browser host account is logged in; mini-app secure sign-in remains unverified.

Earlier checkpoint (historical):

Current release checkpoint — 9 October 2026, 08:16 UTC

Published source 11115e7275028dc1149cb6a63b2a4cb395d3bb05 contains the
PTR sealed-flow correction. Replacement28 closed at 08:10:16.491 UTC with
all 256 attempts rejected (210 geography, 46 proof). The authenticated terminal
reader confirmed exhaustion, source preservation and process/group/supervisor
absence. No candidate was selected and no provider write occurred. Retain the
successful replacement27 package as historical evidence; do not relabel it.

Backend preparation first failed because one native tracked test file had CRLF
bytes despite clean Git status. After worker closure and terminal authentication,
only tests/greaterRealmGateApronSearch.test.ts was restored to its existing
committed LF bytes. Exact-path index refresh via git add preserved the tree;
the full strict source preflight then passed. No code or commit changed in that
representation repair; never normalize the full checkout or public Alpha.

Actual prepare-update at 08:11:48.009–08:13:50.286 UTC then failed safely with
PTR_INITIAL_OWNER_UPDATE_HOST_UNSUPPORTED, without a submission marker.
Maincloud GET /v1/health now reports 2.11.0 / spacetimedb-cloud. Official release:
https://github.com/clockworklabs/SpacetimeDB/releases/tag/v2.11.0
The current update operator adds only this exact host version to its existing
2.10.2 allowance. Fixed target/package, exact source/artifact, complete schema,
plan, preservation and one-submission checks remain required. Native Linux x64
UID1000 validation passed all 22 operator tests, including both supported versions,
future-version and wrong-package rejection. Independent bounded review found no
blocker. This is not proof of provider compatibility: actual preparation is next.
The historical compatibility bootstrap is not rerun or modified by this change.

Next ordered work, owned by Codex:
1. Publish/synchronize this reviewed host-version fix and recovery record.
2. Retry actual backend preparation; apply once only after compatible schema/plan
   and preservation evidence, then read back. Reconcile a lost acknowledgement.
3. Generate a fresh source-bound eligible atlas, verify/select/prepare/import it.
4. Provision the actual owner, accept the authenticated mobile journey and Alpha
   preservation, then complete cutover/readback with rollback retained.

Farcaster host login is present; fresh Warpkeep entry still reaches a separate
wallet identity check. Actual owner acceptance and 0.4 shipping remain unproven.

Historical release checkpoint — 9 October 2026, 07:03 UTC

The .44 search at signed de8b7663802c327ed6f71a14447345547df707c5
completed successfully at 06:00:26.567 UTC. Its private package was canonically
verified, all 26 eligibility proofs passed, and explicit owner selection was
recorded. Preserve replacement27 as evidence; it has not been imported.

Runtime preparation failed with GREATER_REALM_RUNTIME_RELEASE_HYDROLOGY_FLOW_INVALID.
A read-only verified-package reproduction identifies the missing-direction
branch: 12 flowing Tier 1 cells drain into hidden tiers. The exporter omitted
those directions. The actual PTR import verifier also required a public target,
so changing export alone would not unblock deployment.

The correction retains direction only for PTR river/stream flow through a sealed
edge. Both runtime verification and the actual PTR backend recompute the complete
seal; present downstream targets retain transition, slope, body and accumulation
checks. No hidden cells or navigable routes are added. Historical G001 and G002
producers retain their previous behavior, and schemas/licensing are unchanged.

The regression failed before the correction. Native qualification covers all 39
runtime cases (36 passed in the full run; three repaired/new cases passed on the
focused rerun), 90 PTR read/import/update cases and three hydrology cases. Actual
PTR cell verification accepts river/stream exits and rejects forged complete seals
before counter mutation. Project, explicit source/test and PTR module types pass;
the pinned CLI builds the module (its missing local tsc warning is covered by the
separate explicit compiler check). Independent bounded review found no blocker.
The full run also exposed stale generator-version contract vectors and a test
rehash helper that defaulted PTR artifacts to G001. These test issues are corrected;
published and corrected G001 fixture exports were independently byte-identical.

Next ordered work, owned by Codex:
1. Publish and synchronize this reviewed fix; retain the source checkpoint exactly.
2. Generate/verify/select a fresh source-bound atlas, then prepare its runtime once.
   Existing provenance checks cover scripts/atlas, so do not relabel or reuse the
   old candidate under changed source, weaken that check, or blindly replay it.
3. Inspect the real PTR deployment, install/read back the schema-compatible backend
   correction, import/read back the atlas, and provision the real owner.
4. Accept the authenticated owner journey, mobile/device and Alpha preservation,
   then complete Cloudflare cutover/readback with rollback retained.

Farcaster host login is verified, but a fresh Warpkeep Mini App retry still reaches
its separate wallet identity approval with a stated 30-day browser session. That
approval has not been confirmed as completed. No owner acceptance or 0.4 release
is claimed. No provider writes occurred during this correction. Preserve Alpha,
G001 progress/admission freeze, G002 sealing and current Actions policy.

See the maintained [next-work brief](next-work.txt) for exact terminal evidence,
correction scope and the next executable action. Resolve the current signed
commit/tree from Git and PR #385; historical hashes are not current source.
The finish order remains qualification, atlas verification/selection, owner
import/provision, authenticated acceptance and Cloudflare cutover/readback.
Preserve Alpha, G001 progress/admission freeze, G002 seal, licensing, rollback
and the current Actions policy. Dated entries below are historical evidence.

# Warpkeep 0.4 development handoff

## Historical release step — 8 October 2026, 07:22 UTC

Published signed .33 source `2ad40f31` / tree `c520e6b9` completed its search
at 07:15:55.885 UTC: 256 authenticated rejections (217 geography / 39 proof),
no eligible atlas, selection or provider write. Its checkpoint is retired,
seed zeroization is confirmed and watcher/helper are stopped. Do not resume it.
The .33 source passed 157 affected tests and project build-mode typecheck.

A bounded public replay proves a remaining repair-pair defect: presence of a
fallback pair excludes remaining own pairs from the second-slot diversity scan.
The current selector yields no-match; retaining a better own pair under the same
two-slot cap yields a match. Qualify the .34 correction before publishing and
another fresh source-bound search. This reproduction does not establish the cause
of every random rejection. Existing proof criteria and caps remain authoritative.

Remaining order: qualify/publish/sync .34; generate and verify/select a genuine
atlas; import/read back and provision actual owner; authenticated Mini App journey
and device/Alpha acceptance; Cloudflare cutover/readback with rollback. Static PTR
and accepted backend/bridge remain reusable absent a reproduced defect.

The dated sections below are historical snapshots. Use this section and
next-work.txt for the current next action.

Start with the [product direction](../../design/warpkeep-direction.md), then use
this index to find the implementation, current evidence, and next useful work.
The goal is a satisfying **gather → choose → build → benefit → return** journey
and a coherent Verdant Citadel, delivered as a dependable persistent game.

## Current operating decision — 5 October 2026

- **Release route.** Ship the owner PTR first at `warpkeep.com/ptr/`, preserve
  the live Alpha root and G001 state/admission policy, and keep G002 sealed.
- **Actions.** The current hold check reports GitHub Actions disabled with no
  active runs in Warpkeep, Warpkeep-Live, Warpkeep-Assets or
  Warpkeep-Water-Engine. Continue local validation and ordinary Git sync; do
  not treat a push as CI or deployment evidence. `Verify` listens to main and
  pull requests; Pages deployment listens to successful `Verify` pushes on
  main. Workflow dispatch and provider work remain separate operations.
- **Hydrology correction.** The owner-approved narrow policy is recorded in
  [issue #384 comment 5995094139](https://github.com/ael-dev3/Warpkeep/issues/384#issuecomment-5995094139):
  allow equal accumulation only when generated water goes strictly downhill;
  allow lower accumulation only when generated River/Stream flow terminates
  into a verified frozen Alpha Ocean endpoint. Keep every other check and all
  Alpha rows unchanged.
- **Sequence.** Publish the reviewed source, generate a source-bound candidate
  and inspect/update isolated PTR in parallel. Complete candidate proof/selection
  and runtime gates before atlas publication; the compatible backend must be
  installed before importing current-source atlas. Then complete owner
  provisioning, bridge/frontend verification, cutover, and authenticated owner
  PTR plus Alpha acceptance in order. Never relabel an older seed or candidate.

## Current working state — 8 October 2026

Published source `51b41e2b` / tree `66acff5b` on draft PR #385 completed its
`.32` search at 05:57:19.253 UTC with 256 authenticated rejections and no
eligible atlas. Its checkpoint is maintained-retired and its watcher stopped.
The local `.33` correction prevents origin-mandatory corridors from suppressing
child-option diversity, while preserving physical collision authority and caps.
Two regressions reproduced the old failure; 43 apron tests and pinned typecheck
pass. Remaining generator/package qualification and signed publication must
complete before a fresh search. Resolve exact source from actual Git/PR HEAD/tree.
Follow
[next-work.txt](next-work.txt) and the [ordered release checklist](../../operations/0.4.0-release-checklist.md)
for current qualification, publication and fresh exact-source search steps.

Backend program `95ca5801`, bridge readiness and immutable frontend source
`9ea4821a` are accepted and should be reused absent a reproduced defect. The
frontend already serves statically at `warpkeep.com/ptr/` through Cloudflare
Pages direct upload; Alpha root remains reachable. Atlas import/readback,
actual owner provisioning and Mini App gameplay/device acceptance remain open.
Keep G001 progress/admission freeze, G002 sealing, exact legal bytes and rollback.
The current Farcaster client has a mobile sync-channel failure, and the production
Cloudflare browser route awaits existing-account sign-in. Use those human
handoffs; no new recovery key or substitute player identity is required.

Tervain reuse/design findings remain in the [7 October ecosystem review](../../engineering/repository-ecosystem.md#current-tervain-source-review-7-october-2026).
Do not add unrelated features or duplicate assets while closing release gates.

## Previous working state — 7 October 2026

The release branch and draft PR [#385](https://github.com/ael-dev3/Warpkeep/pull/385)
contain the exact-rank search-budget correction at signed published source
`7ae40a6f4ba44188f7935f7dbcaf6f920f4eb36f`, tree
`0cbb69dd6258533a84e851d0929d70a43765e8ea`. Native operating source stays
frozen while generation runs. The code skips option prefixes
whose remaining groups cannot supply the required rank. Two regressions
reproduced the old node-limit failure. The correction preserves feasible plan
order, MRV selection, production caps, geometry, ownership and eligibility
proofs. Windows apron tests passed 24/24; pinned Linux Node `22.22.3` passed
build-mode typechecking and all 60 focused apron/rejection/generator/connectivity
tests. Independent review found no blocking issue.

The last completed fresh private batch, on code source `ac6d85ee`, exhausted
256 attempts with 224 geography and 32 proof-rejection attempts. Its authenticated
reader zeroized the recovered seed; the maintained abort confirmed
`checkpointAborted: true` and `productionUntouched: true`. No candidate,
package, selection, atlas or production mutation resulted. The retired batch
must not be replayed. Full sanitized evidence and the new correction are in
[local operations](../../evidence/0.4.0/local-operations.md).

Source publication/synchronization are complete and a fresh private batch is
running; five additional isolated workers are being prepared within measured
capacity. Actual PTR inspection, nonbreaking update preparation and one-submit
apply passed: program `95ca5801` is installed at this source, with existing
tables/rows and private configuration preserved. Only owner/atlas readiness
remain missing; the bridge is ready. See the [ordered release checklist](../../operations/0.4.0-release-checklist.md)
and [full operating evidence](../../evidence/0.4.0/local-operations.md).
Next verify the terminal candidate/package/shortlist, select and prepare runtime,
then import/read back atlas and provision the owner. Preserve all source, proof,
preservation, rollback and acceptance gates; do not repeat the resolved update.

GitHub Actions remains disabled. Source synchronization and local checks are
not deployment evidence. The staged frontend and visual acceptance remain
frozen. Final bridge/artifact readback, custom-domain cutover, authenticated
owner journey and Alpha preservation acceptance remain open. The last live
readback found Alpha HTTP 200, custom-domain `/ptr/` HTTP 404 and Pages preview
`/ptr/` HTTP 200. Owner PTR is not yet a released 0.4 build. Preserve G001 and
its admission policy; keep G002 sealed.

The 7 October Tervain review is in the
[repository ecosystem guide](../../engineering/repository-ecosystem.md#current-tervain-source-review-7-october-2026).
It found no Tervain-specific media suited for copying into this release; useful
composition/loading practices and separate licensing boundaries are recorded.

## Previous working state — 6 October 2026

Signed source `85a2a7cf2826c3526cfacac150827746d6cfa62a` completed one fresh
private search with the supported 256-attempt cap. It returned
`GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE`; the authenticated checkpoint was
bound to this exact source and pinned Linux x64 Node 22.22.3 toolchain, at
sequence/ordinal 256, with 224 geography rejections and 32 proof-rejection
attempts. The recovered root-seed buffer was zeroized in `finally`. The safe
aggregate and complete geography-code counts are in
[local operations](../../evidence/0.4.0/local-operations.md). After recording
the result, the maintained abort returned `checkpointAborted: true` and
`productionUntouched: true`. No candidate, package, shortlist, selection,
atlas, provider request, or production mutation resulted; the checkpoint is
retired and must not be replayed.

The new rejection-stage classifier recorded 96 generic dry-gate apron
no-matches, 1 no-match after the Lowlands repair check, 8 complete-plan limits,
30 search-node limits, and 32 Crownwood parent-slot misses. Other geography
codes total 57: active-grid count out of range (30), legacy Lowlands placement
(8), capacity assignment infeasible (5), throne-component repair forbidden
(4), primary component undersized (9), and Tier-II assignment missing (1).
These are rejection occurrences in a fresh sample, not causal comparisons.
The 96 generic no-matches do not establish that the final plan reached either
apron lane. The batch produced no acceptance evidence.

The tested diagnostic source `0109aaf0` classifies only safe rejection
metadata and changes no acceptance, geometry, ownership, thresholds, caps, or
search limits. The pinned-runner batch confirms that most no-match attempts
remain generic, so the next step is a bounded local trace of the plan paths
that return generic no-match, followed by a focused fixture for a demonstrated
frontier defect. Do not spend another private seed until a concrete,
threshold-preserving correction is tested. Preserve the Lowlands fallback
correction and all existing proofs. Never replay an exhausted checkpoint.
The hydrology correction, deterministic PTR frozen-water catalog, authority
repairs, and closure/test fixes remain committed and pushed. The old
`GR-A-WB4ATWJNGTDQCGGH` / H19/T03 candidate remains invalid and must not be
relabeled or resumed.

The diagnosis is read-only and source-bound: verifier receipt
`9561974f29bfb5236fd5c321069b3ceb9837d72210ff8215a26fc8ff5b5bbfa0` and
independent postcheck claim `4b9ac9ff5591fedc912852ec1c337311ea154d57d484e1ea05501f491e486fcd` found 15 generated-to-generated equal-flow
joins whose surface strictly falls and seven generated River/Stream joins
that discharge into verified frozen Alpha Ocean terminals. All other
hydrology, terrain, direction, body and Alpha-row checks remain mandatory.
The implementation mirrors this exact policy in the offline candidate
verifier, shared live authority and isolated PTR verifier, backed by a
deterministic frozen-water catalog.

Native targeted validation passes 455 cases across the 13 affected files,
including the full 8-case PTR prepared-closure file on the exact `e1ac103`
source. The checked-in sealed-launch gate passes in preparation mode and the
protected browser closure verifies all 1,271 members. Windows root/PTR builds,
module verification, frozen catalog checks, and focused hydrology/PTR suites
also pass. The full runtime-release suite retains its Windows private-temp ACL
limitation; its guard is unchanged. GitHub Actions remains disabled, so these
are local checks, not hosted CI or deployment evidence.

The exact-source private search on `e1ac103` exhausted 128 ordinals. Two fresh,
source-bound searches on `cff3479` and documentation-only successor `c7c494b`
then exhausted all 256 supported ordinals each with
`GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE`. Their safe profiles are nearly
identical: respectively 96/95 dry-gate apron no-matches, 52/51 search-node
limits, and 36/34 missing capacity assignments. The c7 run recorded 223
geography rejections and 33 proof rejections. This confirms the bounded
Tier-II apron/capacity solver is a systemic blocker, not a seed-specific event.
Full safe counts are in [local operations](../../evidence/0.4.0/local-operations.md).
No eligible package, shortlist, selection, atlas publication or provider
operation resulted. The cff, c7 and c5 checkpoints have each been retired
through the maintained abort command after their safe summaries were
synchronized (`checkpointAborted: true`, `productionUntouched: true`). The older
retained-seed checkpoint remains bound to `19b3422`; preserve it without
relabeling or seed import.

Next: trace the generic no-match and Crownwood parent-slot paths locally,
separating failures that never form a complete final plan from those that
reach the apron solver. Add a focused regression only for a demonstrated
search-frontier defect; preserve map rules, geometry, ownership and thresholds.
Then validate, sign and publish the correction before another fresh
maximum-256 batch. Do not replay or relabel exhausted seeds or infer causality
from independent samples. If a candidate passes, verify its package and
shortlist before separate owner selection.
Preserve the one-winner import rule, rollback artifacts, Alpha and licensing.
The [execution handoff](execution-handoff.md) is authoritative for the ordered
release path. Earlier dated sections below are history.

## Current operating decision — 3 October 2026

- **Route.** 0.4 ships owner PTR first, at `warpkeep.com/ptr/`.
  - The Alpha root, G001 state, timers and admission policy are preserved.
  - G002 stays sealed.
  - A wider rollout is separate later work.
- **Why Cloudflare.** The private repository's included hosted Actions allowance is exhausted, and Actions stays disabled under the current policy. This route therefore doesn't use hosted Verify, protected workflow dispatches or branch Pages. It uses the Cloudflare route that the owner chose instead. Each provider action follows the owner's current instructions; this note records the route and grants no permission.
- **Steps:**
  - P1: native `warpkeep-ptr` update and owner provisioning (Codex);
  - P2: a native PTR-only bridge binding (Codex);
  - P3: `/ptr/` publication on Cloudflare Pages, with mobile validation (Claude).
- **Coordination.** Ownership, results and blockers are tracked in [issue #384](https://github.com/ael-dev3/Warpkeep/issues/384).
- **Preview.** The Pages preview at `warpkeep.pages.dev` (source `a89173f9`) only proves the delivery route.
  - It isn't the accepted final source.
  - The custom-domain cutover follows a successful final postflight.

The current session's user instructions remain authoritative.

## Current working state — 3 October 2026

This checkpoint integrates the authentic PR #386 (`ad4879ce`), #387
(`00b5e517`) and #388 (`1fa2ac2c`) heads with the P1 private-source-clone
repair and P2 scoped native bridge caller, on signed quality base `f06bb380`.
Resolve the latest signed HEAD/tree and publication from Git and its receipts.
Main `cb282bab` is unchanged and [PR #385](https://github.com/ael-dev3/Warpkeep/pull/385)
remains draft. Alpha 0.3.43 is live; authenticated owner `/ptr/` is unpublished.

The 3,449-file integration passed fifteen complete files with 344 cases and
related types/syntax. The final P2 privacy repair then passed its complete
31-case file, all three type checks and core syntax, with independent process/
source/Git closure. The earlier strict type failure is retained in the handoff;
its heavyweight receipt-parser import was replaced with the pure owner-input
helper. Supported family reproduction held all 16 outputs, with no further
generated change after the privacy correction. These are scoped local results,
not full native authority or provider execution.

P1 and P2 have not updated the realm or auth Worker. After clean signed
publication, continue the inline PTR compatibility bootstrap, owner provisioning
and scoped direct-native bridge route. The clone repair preserves G001's builder
guard. Actual ABI, nonbreaking token, durable no-replay and provider readback
checks remain required; full 102-output preparation and unrelated hosted permits
are separate from this isolated caller.

The latest [Pages preview](https://a4e3a104.warpkeep.pages.dev) uses prior base
`f06bb380` and preserves Alpha root bytes. Claude's pinned postflight reports
800 files/two fallbacks; root independently sampled Alpha bytes and PTR HTTP 200.
It is not a domain cutover, PTR auth or owner/mobile acceptance. The decision
block's `a89173f9` preview records the earlier trial. Codex/root retains final
integration/delivery authority; Claude contributes P3 through
[issue #384](https://github.com/ael-dev3/Warpkeep/issues/384).

Use the [handoff](execution-handoff.md) for exact receipts and next operations.
Actions remains held under its runtime policy.

## Previous integrated work — before f06 publication, 3 October 2026 (superseded)

Signed `da3e057f` / tree `02164ba0` is the verified base for this
checkpoint; resolve the latest HEAD/tree and guarded native source from Git.
Genuine prepare/check at the signed base completed with matching results
(`90eb8e1b`, receipt `604b840c`), and independent post `e06d20bb` closed its
original process group with source/index/refs preserved. The guarded native integration contains the authentic PR #383 merge,
maintenance, PTR compatibility, G001 refreeze and notes. Resolve its exact
signed checkpoint/publication from Git and receipts; the earlier base
preparation does not cover the combined source. Main `cb282bab` is unchanged; [PR #385](https://github.com/ael-dev3/Warpkeep/pull/385)
is draft and supersedes #380/#381.

The maintenance overlay passed 52 complete cases and its type checks. The
explicit G001 refreeze passed 170 cases; PTR compatibility/bootstrap passed
39 focused cases and its type checks. Supported metadata derivation reproduced
all 16 family outputs, without recompiling the integrated source. The ordinary
focused aggregate reported 393 passed, zero failed and 29 skipped; its strict
overall result remains failed because the namespace cases could not run there.
The separate installed namespace run reported 260 passed, zero failed and one
declared unsupported-runtime negative-control skip (`84a572de`, independent
post `edb305c3`). Raw skipped is still skipped. These are scoped local checks,
not complete native authority, backend update or release acceptance.

Alpha 0.3.43 remains live and authenticated owner `/ptr/` unpublished. Codex owns the clean-source PTR compatibility bootstrap: genuine inline
artifact/ABI validation, authenticated nonbreaking prepublish token, one
durably marked guarded update and two complete poststate reads. Old private
SQL 403 leaves programBefore/rowsBefore unknown (`null`); do not invent
private before-state or require it before bootstrap. Codex then owns the
existing auth Worker's direct owner caller path. Do not substitute unrelated GitHub-bound
settings for that caller contract. Claude owns the frontend/mobile preview; its
current Cloudflare preview is from an older source, not the Alpha domain
cutover or actual owner acceptance. Preserve G001 state, timers and admission
freeze, and keep G002 sealed. Unrelated G002/notification deployments and
global S/F/A remain separate. The previous PTR SQL 403 and missing bridge PTR
bindings stay open until supported reads prove otherwise.

Use [issue #384](https://github.com/ael-dev3/Warpkeep/issues/384) for exact
head and completion coordination. Claude works in a separate Windows checkout;
Codex owns the guarded native operation. The already integrated #375–#378
branches are provenance, not extra merges. Read the
[handoff](execution-handoff.md) for full receipt scope and next actions. Check
SpacetimeDB `login show` before `list --yes`; a logged-out list can initialize
an anonymous identity.

## Previous working state — earlier 3 October 2026 (superseded)

Published signed quality source `a89173f9` / tree `e3cf809b` follows game baseline `a0f6a55f`. Resolve subsequent repair checkpoints from Git. Main `cb282bab` and PRs #380/#381 remain separate. Alpha 0.3.43 is live; authenticated owner PTR remains unpublished. Actions is held disabled; the current runtime policy governs remote actions.

Initial-owner inspection/update passed 139 tests and types (`276442df`, independent post `3bd626b9`). The completed relocation run passed all 79 original cases within their maintained bounds (`fc0cb87e`, post `d43bbb94`); its preserved assertions and native structuredClone remain intact. Remaining module coverage and full release acceptance are open.

The first real prepare/check at this source failed before compilation. A genuine materialization diagnostic isolated rejection of a valid Git 100755 executable. The repair preserves exact 100644/100755 bytes and modes while retaining nonregular-file rejection. All 21 native regression cases and root/module types pass (`9fba62b8`, post `6c379b10`). The supported family changed five metadata outputs, reproduced all 16 and passed protected/static policies (`00dab22d`, post `2a5b8518`). Metadata is not compiler success: retry genuine prepare/check from the clean signed repair checkpoint.

Actual PTR inspection fails at the first SQL request with HTTP 403 / INVALID_PTR_OWNER_SESSION. Metadata/schema reads succeed, and the stored publisher identity matches the database owner. Pinned CLI SQL reproduces the same connection-gate refusal. This is neither a missing login nor a parser error; preserve the failed receipts and resolve the publisher/module compatibility before claiming before-state observation or update readiness. Latest auth Worker also lacks PTR and managed-owner bindings. See [handoff](execution-handoff.md) and [local operations](../../evidence/0.4.0/local-operations.md) for evidence and recovery order.

## Historical working state (superseded)

The former working-state text and its follow-up directions below are retained history; the current section supersedes them.

## Current working state

The [execution handoff](execution-handoff.md) is the single dated record of
current main, active source, CI receipts and operation results. Read its latest
checkpoint before acting; older checkpoints below it are historical evidence.
The private-repository plan currently provides neither branch protection nor
CodeQL code scanning. Read the [current Actions policy](../../operations/github-actions-budget.md)
before following historical hosted-Verify directions. Actions is globally
disabled; complete local verification is being integrated with the existing
release callers. Selected local diagnostics do not authorize deployment. The
intended route retains genuine GitHub dispatch/OIDC for bounded operations.
The maintained verifier and explicitly closed native consumer retain real local reports without granting production authority. Signed `5cddb1a7` / tree `f2b1e73e` is the published clean baseline. Its maintained namespace run passed 260 assertions with one known source-declared skip; that skip is not a pass. The full ordinary run completed with 12,970 passes, 11 failures and 68 skips, then failed canonical-index preservation. It did not time out.

This coherent repair checkpoint descends from the published baseline and integrates eleven reviewed repair candidates plus five mechanically derived metadata changes; its signed identity must come from actual receipts. The completed focused run covers 15 whole files: 715 passed, nine failed and none skipped or unfinished of 724 assertions. Its first group retains nine notification clean-checkout failures; the other groups passed 400 and 194 cases. App/all-tests types and three module syntax checks returned normal 0/null. Independent cleanup preserved the focused source/index/refs, but the aggregate remains failed. Rerun the complete 20-case notification file from a clean local signed checkpoint and retain closure before remote backup, without weakening its guard. A separate three-mode unprivileged sleep-fixture crash rehearsal passed independent audits; maintained connected execution remains closed.

Completed service evidence at `41e760fe` remains 2,069 assertions across 76 files plus five separate type/declaration checks. Genuine development preparation retains its `b9ca8ca7` scope. The opt-in public workflow is not installed or deployed. Complete native/dependency coverage, authenticated transport, prepared reuse and cumulative hosted admission remain open. Read the current handoff for actual failures and the next source-bound checks.

Recheck that accepted main still names the exact verified source before each
operation. Source changes to the release workflow require a fresh native
prepare/check and generated-only promotion before live observations.
Preserve failed census attempts and never reuse their identities. Pages
classification does not establish deployment, owner play or device acceptance.

The Keep04 gather → choose → build → benefit → return foundation, readable
expedition/return feedback, first-journey cue and mobile visual foundation are
implemented and covered by focused tests. Exact test results belong to the
source and platform recorded in the execution handoff and linked evidence.
Earlier connected probes and synthetic captures retain their original source;
they do not automatically attest later presentation changes.

Checkouts may legitimately track different published branches or immutable
native inputs; use the [checkout roles](../../operations/0.4.0-development-sync.md#start-from-the-actual-checkout-and-remote).
The sync automation is paused and routine
notes belong in the repository; use the existing checkouts and ignored
`artifacts/` directory, and create no Desktop siblings, backups or archives.
Development and live release remain separate: private activation authority,
G001 observation, PTR observer/readback, provider deployment/recovery,
owner-only PTR play, physical-device performance and final release freeze are
still open.
## Find the right starting point

| Need | Read | Outcome |
| --- | --- | --- |
| Understand the game | [Direction](../../design/warpkeep-direction.md), [roadmap](../../design/roadmap.md) | Player promise, 0.4 focus, and later opportunities |
| Find code and its owner | [Repository map](repo-map.md), [architecture](../../technical-architecture.md) | Real entry points, callers, state authority, and generated boundaries |
| Improve play and appearance | [Gameplay and visuals](gameplay-and-visuals.md) | Working behavior, specific defects, missing evidence, and useful next probes |
| Apply the full inspiration library | [Visual foundation contract](visual-foundation-contract.md) | Reference-to-source decisions, mobile rules, review states, and evidence limits |
| Continue the living vale and world | [Living realm](living-realm.md) | Keep vale, ambient life, world daylight, own journeys, steward advice, budgets and limits |
| Continue daylight, sound and keep-screen craft | [Craft and atmosphere](craft-and-atmosphere.md) | Local-hour daylight for keep and world, night glow, ground contact, shore and verges, 0.4 sound cues and the keep soundscape, keep-screen design |
| Check bug, security and reliability status | [Hardening audit](hardening-audit.md) | PTR device-clock lease and in-place reconnection fixes, deferred observations, reviewed-sound areas, dependency advisories |
| Complete delivery | [Release and infrastructure](release-and-infrastructure.md) | Current services, CI, operating gaps, and verification routes |
| Continue this checkout | [Execution handoff](execution-handoff.md), [source synchronization](../../operations/0.4.0-development-sync.md) | Current checkpoint, environment traps, reviewed publication, and next actions |
| Follow the daily release sequence | [Next work](next-work.txt) | Compact, tracked action brief; the repository copy is canonical and no Desktop duplicate is created |
| Resolve access or request owner help | [Connection and resumption guide](../../operations/0.4.0-infra-access.md#resume-without-guessing) | Correct account, target and caller; exact unmet prerequisite and smallest human action |
| Recover from a known delivery failure | [Known blocker recovery paths](../../operations/0.4.0-infra-access.md#known-blockers-and-recovery-paths) | Observed symptom, owning repair and confirming check; reuse existing credentials and retained evidence |
| Keep local storage compact | [Output locations and retention](../../engineering/development-workflow.md#output-locations-and-retention) | No new Desktop files; reuse tools/checkouts, bound disposable output, preserve recovery evidence |
| Work across repositories | [Repository ecosystem](../../engineering/repository-ecosystem.md) | Runtime, asset archive, planned tools, and public profile ownership |
| Judge release readiness | [Release checklist](../../operations/0.4.0-release-checklist.md), [evidence](../../evidence/0.4.0/) | Required results tied to source and actual deployed artifacts |

## How to use the findings

Retain strong foundations and improve weak behavior based on evidence. The owner
explicitly authorizes product and architecture improvements that advance the game;
old plans do not impose arbitrary restrictions. Record changes to settled behavior
in its specification and relevant tests so the next contributor understands why.

Source inspection, local tests, synthetic rendered scenes, physical-device play,
authenticated provider observations, and actual owner acceptance establish
different facts. Each finding must say what was observed and what remains unknown.
Never replace missing live evidence with a fixture or a plausible release record.

Source publication is a normal development step. Keep this index, the execution
handoff and the dated evidence aligned with the actual branch and deployed state;
none of them should turn missing provider or owner evidence into a release claim.

## Coverage and limits

The study mapped tracked source, browser entry points, keep/world rendering,
gameplay and schemas, identity, Cloudflare services, release/recovery callers,
generators, tests, asset manifests, and current documentation. Independent reviews
covered gameplay/presentation, backend ownership, and delivery infrastructure.
Historical plans and generated/binary artifacts were classified by role; this is
not a claim to have inspected every media byte or independently security-audited
every dependency.

Keep private probes, credentials, player records, provider stores, and disposable
build output outside public evidence. Preserve existing local work. Detailed
commands and historical results remain in the linked notes, with dates and scope.
