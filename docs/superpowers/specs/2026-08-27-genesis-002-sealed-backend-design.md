# Genesis 002 sealed-backend design

## Purpose and release shape

Warpkeep 0.4.0 introduces a two-realm launcher without admitting anyone new.
Genesis 001 remains the exact 0.3.43 authority for the players already admitted
there. Genesis 002 contains the selected Greater Realm atlas, but is sealed:
zero allowed FIDs, requests, players, founders, castles, claims, occupancy,
activation rows, and Worker rows. It has no player-facing presentation or
connection path.

This owner-approved release shape supersedes the earlier C7 plan that reserved
0.4.0 for an active Greater Realm client. A later Genesis 002 admission,
founding, activation, or presentation release requires a new reviewed plan.
Nothing in this design migrates, republishes, renames, copies, or mutates the
Genesis 001 database.

## Separate authority and private schema

Genesis 002 is a separate SpacetimeDB 2.6.1 TypeScript module at
`spacetimedb/genesis002/`. Its fixed identities are:

- realm: `GENESIS_002`
- release: `0.4.0`
- database alias: `warpkeep-genesis-002`
- module identity: `warpkeep-genesis-002-sealed-v1`
- atlas: `GENESIS_002_GREATER_REALM`

The module registers 23 tables. It reuses the reviewed v17/v18 atlas row,
index, and constraint descriptors, but rewrites every registered table
descriptor to private before schema registration. This includes the player,
castle, visible-atlas, region, claim, occupancy, activation, and Worker tables
that are public in the Genesis 001 module. Genesis 002 never registers the
Genesis 001 gameplay, scheduler, founding, activation, or public-root reducers.

The exact generated ABI must contain 23 private tables and zero public tables.
A real SpacetimeDB loopback gate publishes the built G002 module, imports and
finalizes a complete atlas fixture, and then proves that anonymous and
non-administrator clients cannot connect, query any registered table with SQL,
subscribe, or invoke any read procedure. The administrator-only status comment
and runtime behavior agree; there is no public realm-status exception.

## Sealed player and admission boundary

The lifecycle hook permits only the existing short-lived Hermes administrator
principal and rejects even that principal if any population row exists.
Read-only status procedures are administrator-only and assert the same
zero-population boundary.

The complete compatibility mutation set for request submission, allowlisting,
founder admission, disablement, auth-epoch changes, request reset, player
bootstrap, terms acceptance, and profile mutation uses one total denial policy.
It throws `GENESIS_002_ADMISSIONS_SEALED` before any database or audit effect is
reachable. Genesis 002 contains no public or player-callable admission path.

The production auth bridge separately rejects both `POST` and CORS `OPTIONS`
for `/v2/access/request` with exact HTTP 503 and
`admission_requests_suspended` before rate limiting, authentication,
credentials, or backend access. `/v2/access/status` remains read-only. A direct
live probe, rather than source attestation alone, binds this property into the
launch receipt.

## Atlas-only administrative exception

Atlas ingestion is the sole bounded launch-time mutation exception. The G002
module exposes exactly seven administrator-only writers: stage, component
import, region import, chunk import, begin verification, verification batch,
and finalize. Every call:

1. requires the administrator principal;
2. requires `GENESIS_002_GREATER_REALM` and the exact selected release tuple;
3. requires every population, claim, occupancy, activation, and Worker count
   to be zero before the effect;
4. repeats the zero-state assertion after the effect; and
5. rejects once the shared finalized/ready state exists.

The pre-effect finalized check covers all seven writers. Successful
finalization therefore makes the complete atlas writer surface inert without
deleting atlas data. Final status distinguishes atlas ready/finalized from
activation and player presentation, which remain false.

## Source-built publication and import

The G002 publisher accepts no mutable server or database target. It requires a
clean, exact protected-main checkout; materializes the G002 source and locked
dependency closure into a private workspace; builds an immutable module
artifact there; generates and verifies the exact private ABI; and re-attests
source, executable, dependency, CLI-config, and artifact bytes immediately
before use. Build and ABI-generation children receive a sanitized environment
with no administrator secret or ambient auth configuration.

The concrete publisher uses an owner-private Spacetime CLI configuration file.
The file, containing directory, executable, link count, owner, mode, size,
descriptor/path identity, and SHA-256 are checked through no-follow file
descriptors. The CLI receives the private copied config explicitly. The
production target must not already exist, the new full database identity must
differ from immutable Genesis 001, and the postflight uses that identity—not
the alias—to verify the exact fresh zero state. Any error after a possible
publish submission is ambiguous and requires manual reconciliation; it is
never ordinary retry authority.

The G002 import operator is distinct from the legacy G001 import tooling. It
binds the fresh G002 database identity, protected module commit, module and
dependency digests, CLI executable, exact regenerated G002 runtime-release
package, atlas source commit, and source ancestry. It can call only the seven
atlas writers. Every submitted operation receives an immediate exact
postcondition; lost responses reconcile state or stop as ambiguous. The final
privacy-safe receipt proves ready/finalized atlas bytes, closed atlas writers,
zero population/claim/occupancy/activation/Worker/public-root rows, and false
activation/presentation.

## Two-phase Pages boundary

Preparation and activation are deliberately different source states:

- Preparation remains package and lock version `0.3.43`. The checked-in
  sealed-launch binding has every operational receipt field null,
  `pagesDeploymentApproved: false`, and all presentation and notification gates
  false. Verify passes, but Pages classifies the run as
  `sealed-launch-blocked` and terminates before install, build, artifact upload,
  environment acquisition, credentials, or deployment.
- After the frozen Genesis 001 publish, private census export, admission-monitor
  suspension, auth-bridge live probe, fresh G002 publish, atlas import/finalize,
  private-access loopback, and exact live receipts all pass, one small reviewed
  activation successor atomically changes the package/lock/release identity to
  `0.4.0`, fills the exact non-null binding, and sets
  `pagesDeploymentApproved: true`.

The census binding is deliberately opaque. A separate local producer securely
re-reads and canonical-validates the owner-private mode-0600 TXT, recomputes and
matches its private exporter reference, generates a fresh 32-byte blinding
nonce internally, and installs one non-overwritable mode-0600 private proof
receipt. Only the domain-separated opaque proof digest enters the public
binding; raw TXT/JSON digests, applicant count, and nonce remain private.

Activation verification rejects missing or extra binding fields, arbitrary or
swapped receipt digests, the immutable G001 identity used as G002, incorrect
G001 baseline/ABI/freeze nonce, G001 player access closure, open mutation or
request gates, nonzero G002 state, non-final atlas state, mismatched module and
atlas source commits, non-ancestor preparation/source commits, enabled legacy
Greater Realm presentation, and enabled admission notifications. Pages repeats
the live auth-bridge suspension probe immediately before build and deploy.

## Verification evidence

The release gates comprise focused unit and adversarial tests, root and G002
typechecks, a real SpacetimeDB build, generated-binding diff checks, the real
private loopback, source-built publisher/cache exercise, auth-bridge checks,
workflow-order tests, `git diff --check`, and independent review. Production
publication and import are operational steps outside the implementation lane;
this design does not authorize them on its own.
