# Warpkeep local final-release preparation

## Priority amendment: admissions deferred

The owner's latest direction makes shipping 0.4 live the immediate priority;
Genesis 002's future admissions scope is undecided and deferred until after
release. Genesis 001 admissions stay frozen at the existing 0.3 state. Do not
design, expand or activate admissions as part of this work. Preserve current
access restrictions and existing players during deployment. Do not interpret
the undecided future policy as authorization to open access, delete players or
relax authentication. Admission-policy design is not a release prerequisite.
An owner identity is necessary only for an operation that actually provisions
owner access; its absence must not block unrelated release work or be filled
with an invented identity.

## Scope amendment: all production operations local

The owner's subsequent instruction is: disregard the Mac runner entirely and
bring all production scope onto the local machine. This supersedes every
statement below that defers deployment migration or preserves a mandatory Mac
execution dependency. The preparation design remains a component, not the full
delivery scope. No further Mac availability checks are part of this plan.

Windows/WSL must support build, verification, final preparation, authenticated
deployment, recovery operations, activation and post-deployment checks against
the existing remote services. This does not relocate the live databases or
website onto this workstation. Cloudflare, SpacetimeDB and GitHub remain their
existing hosting/control services unless a separately justified change is made.

Replace Mac-specific execution and attestation contracts with explicitly
identified local equivalents; retain legacy interfaces only for compatibility,
never as required steps. Audit the installed-toolchain, workflow identity,
receipt and signing interfaces before specifying their successors. Local
execution cannot manufacture GitHub OIDC claims, historical receipts, missing
keys or owner identity. Genuine remote permission and credential requirements
must be established through supported authenticated mechanisms.

Preserve existing G001 players, data and latest 0.3 behavior with no additional
admissions; keep G002 sealed and PTR owner-only. Do not delete or recreate a
populated database as a deployment shortcut. Completion requires an actual
verified live release and local operating instructions, not merely a working
local build. The deployment migration audit and implementation tasks are tracked
in the active release-closure ledger.

## Objective and authorization

Build and verify the final 0.4 preparation tree locally on Windows/WSL, without
requiring the Mac runner to produce that tree. This implements the owner's
approval of future implementation decisions and renewed instruction to rework
needed functionality locally. It supersedes the older Darwin-only preparation
and refreeze choice, not the protections for production data or credentials.
This is release engineering, not new gameplay or admission functionality.

The last authenticated GitHub read reports the sole production runner offline.
A local build must have its own identity; it must never claim Darwin provenance.
The existing authenticated deployment interlocks remain required. Their current
Mac runner dependency is a separate outstanding release-delivery issue, not a
reason to describe a locally prepared tree as deployed.

## Chosen architecture

Use the explicit profile
`warpkeep-spacetime-binding-final-preparation-linux-x64-v1` for the final
source-build, binding generation, four-bundle build and atomic refreeze/check.
Retain existing Darwin entrypoints and profile meanings. Reject arbitrary
platform/profile selection and never equate the two profiles' evidence.

The alternatives were to retain Mac-only preparation, which preserves the
availability dependency, or add a candidate-only local pipeline, which leaves
the final preparation blocked on the same runner. Neither satisfies the local
preparation requirement. The chosen profile must reach the final refreezer.

Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged,
including root package/lock and the historical source/build helpers. G001
bindings are an exact zero-diff check, never a write target. Existing G001
players and its latest 0.3 behavior remain intact; new admissions remain closed.
G002 remains sealed and PTR remains owner-only. Local build code neither needs
nor receives production credentials, FIDs, raw receipts or database contents.

## Fixed local runtime

Host entry is `C:\Windows\System32\wsl.exe`, distribution `Ubuntu-24.04`,
guest platform `linux`, architecture `x64`. Runtime ownership is the existing
guest user, not a root/elevation fallback. The dedicated namespace is
`/home/snapmeter/.warpkeep/release-preparation-v1`, with `toolchain`, `cache`
and `runs` children. These are new intended paths, not a claim of provisioning.
Every operation gets an owned private child under `runs`; source inputs and
outputs never share writable paths with live deployments.

Use Node 22.22.3 for the preparation worker and G002/PTR, Node 24.19.0 where
the frozen G001 source contract requires it, and SpacetimeDB 2.6.1 CLI plus
standalone. Exact upstream archive/member hashes and WSL/system-tool pins come
from the committed recovery toolchain source policy. Reuse public validation
and pin data, not the recovery-private host or its receipt prerequisites.
Node installations live at `toolchain/node-v<version>-linux-x64/bin/node`;
Spacetime binaries at `toolchain/spacetime-2.6.1/`. No ambient PATH, launcher,
preload, home configuration, caller command or executable override is authority.

Attest binary bytes, version, canonical inode/namespace, owner and permissions
before execution and around each child. Bootstrap verifies upstream evidence
before populating the dedicated namespace; offline derivation only consumes
already verified archives. No replacement of existing user installations.

Use the exact Node binary's built-in TypeScript transformation and synchronous
module hooks instead of installing another TypeScript loader. A read-only
feasibility probe transformed and parsed all 40 current helper modules without
evaluation; only `yaml` is external. Attest `yaml@2.9.0` and its complete runtime
namespace against root lock integrity
`sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA==`.
Hooks resolve only the committed, validated source graph and this fixed package;
no ambient package resolution or source execution occurs before attestation.
Transformation is not typechecking: each realm also runs its fixed compiler.

## Source and dependency builds

Extract the reviewed nonfrozen PTR installer into one internal implementation
with two fixed wrappers. Preserve `withPtrLockedSourceBuild`'s exact Darwin
interface, package graph, error semantics and provenance domain. Add
`withPtrLinuxLockedSourceBuild` with the same source-build input/result shape,
the exact Linux x64 graph, and distinct domain
`warpkeep-ptr-independent-linux-x64-dependency-closure-v1`.
The shared implementation exports no arbitrary profile factory or injection
seam. All private profile data is immutable and selected by the fixed wrappers.
Keep bounded descriptor reads, archive/SRI checks, real contained package links,
source reattestation, thenable rejection, exact output allowance, retained
failures and primary/cleanup error preservation. Root lock fallback stays absent.

G001 uses a successor local wrapper over the already specified frozen
commit/materializer/dependency coordinates, not a modified Darwin installer.
G002 uses the workspace lock's exact Linux closure. Both reuse existing safe
materialization and archive primitives where their interfaces permit, without
promoting fixture-only authority factories to production.

## Generation, bundles and final transaction

Capture one committed preparation source tree. Build each realm twice in
independent private materializations, typecheck it, copy bounded verified JS
before synchronous source cleanup, and compare both builds. Generate bindings
with pinned CLI `--no-config --js-path` into separate private output trees.
G001 is public zero-diff; G002 uses `--include-private`; PTR is public. Reuse the
strict binding-tree reader and exact byte/path comparisons. Any mismatch fails.

The nonfrozen four-bundle builder gains a separately named Linux preparation
constructor and typed provenance while preserving its Darwin constructor.
Use the same pinned esbuild version and verified Linux package from the root
lock. Run two builds per lane and preserve the existing payload/declaration
rules. No frozen lane source changes or direct generated-output edits.

Only the final atomic refreezer installs G002/PTR bindings, four bundle pairs,
bundle manifest, derived closure inventory and generated consumer pins/counts.
It stages the entire allowlisted family, records a recoverable journal, fsyncs,
installs and immediately runs the identical check. Interrupted or uncertain
state fails closed. The final provenance identifies Linux preparation; the
Darwin installed deployment toolchain remains a separate protected input.

## Verification and delivery limits

Test wrong platform/tool identity, caller injection, source/lock/archive drift,
cross-profile substitution, missing/widened optional metadata, bounds,
symlink/namespace mutation, real native writer behavior, cleanup failures,
two-run nondeterminism, G001 differences and atomic recovery. Preserve the
existing Darwin regression suites. Windows mocks are not native Linux evidence.

The source integration is complete only when the actual fixed local adapter,
bundle builder and refreezer consume the new profile, not merely a profile
parser or disconnected helper. Real preparation additionally requires fresh
toolchain checks, a reviewed committed source candidate and passing final
transaction/test evidence. Live deployment, PR closure, recovery signing and
activation remain outstanding until independently executed and verified.

## References and limits of the probe

The existing release-closure plan remains the task ledger's parent plan; this
spec supersedes its host-selection assumptions for preparation/refreeze only.
Node APIs were checked against the installed 22.22.3 binary and the
[version-specific Node module documentation](https://nodejs.org/download/release/v22.22.3/docs/api/module.html).
The API is experimental and output can change across Node versions, so the
exact binary pin is mandatory. The probe only parsed/transformed in memory;
it did not evaluate helpers, create release artifacts or establish authority.
