# Inner Keep activation runbook

This runbook describes a future owner-reviewed rollout. It does not authorize
publication, seeding, backfill, deployment, activation, production gameplay,
or asset use. Every mutating command is a dry run unless `--confirm` is supplied
after reviewing the exact preflight.

The repository's guarded publisher exposes one protocol-v15 lane: the exact
active-v14 predecessor to an inactive v15 append. Selecting that source lane
does not authorize its use. It still requires owner review, the exact
production expectations and private credential, a successful network-read-only
dry run, and a separately confirmed publication operation.

## Required approvals and inputs

- reviewed Warpkeep source commit and module artifact digest;
- current production database identity and the exact v14 predecessor proof;
- additive v15 migration proof with refs 0–55 unchanged;
- compatible client artifact and Inner Keep catalog/layout digest;
- exact static, population, and rabbit runtime-use authorizations plus the
  combined 163-path installed registry;
- owner/legal accuracy review of the then-current Alpha Terms and Privacy
  Notice, without treating this runbook as acceptance of a new legal bundle;
- owner approval for each publication, seed, backfill, deploy, and activation;
- short-lived Hermes administrator credential through the private operator
  input path.

The reviewed inactive artifacts currently pin asset-selection digest
`cf1fdac091e310cce3362d43403be938fe7946e46df906f2efb8cff601497c6d`,
presentation digest
`533ff0c18624445af874f97b71d1d3ae4c6cb4a61f8b7732ba905ee10a61b443`,
combined layout digest
`1b3a452794c28f8d7f8814ce6064da8582725d34bb0ee0271d51f40c2fbdfad7`,
palisade/compound digest
`e3a6e117e7610cb942432c18d0c1ce38485a5c3b6e37069bdc07787e7ef273a8`,
far-countryside digest
`20e1a2f00edbaee520aa96f67d651721da6786e29c19d555fa7bfda161e9eacc`,
and construction-policy digest
`cbffcdc223b5d99625cab7549f3a5ae211c725893574b629aa83f8260668a779`.
Any later reviewed artifact must replace these pins coherently before an
operator proceeds.

Never place credentials, FIDs, balances, receipts, request keys, private rows,
or raw production output in a public record.

This inactive source PR does not change the accepted legal bundle. The current
Privacy Notice already describes public gameplay projections and private game
authority records. The current Alpha Terms also say the larger gameplay loop is
not implemented, so their factual accuracy must be reviewed before construction
is ever made live. Any legal-text update and fresh acceptance remain separate
owner/legal decisions.

## Review sequence

1. Run the complete repository, module, migration, bindings, asset, Mini App,
   rendered, accessibility, and local full-stack checks.
2. When separately approved, merge the exact source to protected `main`. The
   existing workflow then deploys the verified compatible client to Pages with
   the Inner Keep entry still hidden.
3. Verify the deployed client attestation, runtime registry, functional 2D
   fallback, and disabled command behavior.
4. Inspect production with the counts-only Inner Keep command. Require no v15
   rows before the first additive publication.
5. After separate owner review, use the dedicated v15 publication lane to
   publish the exact proven module with data deletion disabled. Do not seed,
   backfill, or activate as a side effect.
6. Reinspect. Require the v14 prefix and all historical counts unchanged and
   all v15 tables empty.
7. Seed the exact inactive layout, zero compatibility-slot rows, six building
   catalog rows, and thirty level-policy rows. Require the reviewed digests and
   no duplicates.
8. Backfill exactly one idle private Builder for each existing founded castle.
   Require no resource, building, schedule, receipt, Worker, Mark, castle, or
   Terms mutation.
9. Activate the component in a separate confirmed operation only when the
   catalog, Builder graph, schedules, runtime registry, and client attestation
   are exact.
10. Run one disposable local full-stack founder journey. Any production smoke
    remains a separate owner decision.

## Mutating command contract

Each future seed, backfill, activation, or deactivation command requires:

- the exact database identity and module protocol;
- exact current and expected aggregate counts;
- a fresh preflight and postflight;
- `--confirm` for mutation;
- deletion disabled;
- a counts-only local result plus the corresponding private admin audit row;
- fail-closed behavior on ambiguity or timeout.

Activation additionally binds the expected source commit, client release, and
client/module artifact digests. The other commands bind their command-specific
policy or layout digests where applicable.

Do not blindly retry an ambiguous mutation. Reinspect the exact aggregate state
and reconcile the previous result first.

## Guarded schema publication lane

The only accepted v15 selection is explicit on both boundaries:

```sh
npm run stdb:publish:dev -- \
  --dry-run \
  --resource-rollout-stage=ready \
  --genesis-world-stage=expanded \
  --worker-rollout-stage=active \
  --worker-module-predecessor=exact-v14-active \
  --worker-forward-repair=none \
  --inner-keep-module-predecessor=exact-v14-active \
  --inner-keep-publication-stage=append-inactive
```

The dry run verifies the pinned CLI and migration artifact, canonical issuer
and database identity, exact v14 schema and ABI, and the protected historical
aggregates. Its network operations are reads; it never calls `spacetime
publish`. A real publication additionally requires the existing explicit
database confirmation and repeats every preflight before invoking the sole
publisher with `--delete-data=never`.

After a successful publish response, the lane requires all refs 0–55 and their
signatures to remain exact, refs 56–63 to match the reviewed public/private v15
contracts, the Worker and Inner Keep ABIs to be complete, every historical
aggregate to equal its preflight value, and every new Inner Keep table to be
empty with the component inactive. Historical comparison covers the combined
protocol/resource/Worker envelope, active Daily Marks status, and counts-only
private access-request totals. An ambiguity, timeout, changed count, ABI drift,
non-empty v15 table, or active component stops the lane. It never seeds the
catalog, backfills Builders, deploys a client, or activates Inner Keep.

## Source-only operator

The checked-in operator exposes the review sequence as separate commands:

```sh
npm run stdb:inner-keep:inspect
npm run stdb:inner-keep:plan-catalog
npm run stdb:inner-keep:seed-catalog -- \
  --expected-missing-layout 1 \
  --expected-missing-slots 0 \
  --expected-missing-buildings 6 \
  --expected-missing-levels 30
npm run stdb:inner-keep:plan-builders
npm run stdb:inner-keep:backfill-builders -- \
  --expected-castles <count> \
  --expected-existing-builders <count> \
  --expected-missing-builders <count>
```

The mutation commands above only print a counts-and-digests dry-run record.
They do not request a credential or contact SpacetimeDB until `--confirm` is
added. Copy expected counts from a fresh plan. Supply the short-lived Hermes
secret only through the existing private stdin contract. Never place it in an
argument, log, shell history, or public evidence.

### Exact protected-state evidence

Every confirmed seed, Builder backfill, activation, and deactivation uses the
exact reviewed SpacetimeDB CLI to take private fixed-query snapshots immediately
before and after the reducer or confirmed no-op boundary. The evidence covers
all castle and claim rows
(including castle level and state), resource accounts, Alpha Terms acceptance,
the generic four-Worker system, roster, assignments and their reservation
inputs, occupations, schedules, command receipts, and every Marks account,
projection, credit, grant, and schedule row. All fifteen table outputs must be
byte-for-byte identical.

Raw rows and reversible snapshot bytes stay in operator memory. They are never
written to stdout, stderr, receipts, or audit notes. The printable result carries
only a structured `inner-keep-protected-state-proof-v1` record: the table count,
one verified boolean for each protected surface, and confirmation that no private
rows were emitted. The CLI receives its token only through a temporary
mode-`0600` config inside a mode-`0700` directory, and the operator removes that
directory on exit.

These are sequential operator-side reads, not one atomic database snapshot. Run
confirmed mutations only during a reviewed quiet window. A concurrent Worker or
Marks schedule can therefore make the evidence ambiguous even when the Inner
Keep reducer behaved correctly. Any changed table, unsafe or incomplete read,
timeout, or oversized output fails closed; stop and inspect before any retry.
Dry runs still return before credential access, network access, or snapshotting.

Future activation also requires `--expected-castles`, `--client-release`,
`--client-artifact-digest`, `--module-artifact-digest`, and `--source-commit`.
Even with `--confirm`, it fails before reading a credential or using the network
until all three exact runtime-use authorizations are recorded, all selected
static, population, and rabbit files form the exact combined registry, and the
local artifacts come from clean protected `main`. Deactivation similarly binds
`--expected-castles` and
`--expected-active-projects` to a fresh preflight. The deactivation reducer
rechecks both counts and the active state in its own transaction, immediately
before changing the layout. A project or castle committed after inspection
therefore makes the request fail without mutation. This PR does not satisfy or
exercise any of those production gates.

## Activation invariants

- one active layout with the exact catalog and layout digests;
- zero rows in the retained `inner_keep_slot_v1` compatibility table;
- six exact active building kinds and five level policies per kind;
- one private idle Builder for every founded castle;
- zero duplicate castle/building assignments or overlapping persisted
  footprints;
- zero orphan or mismatched schedules;
- zero active projects at first activation;
- the current generic four-Worker system active and legacy expeditions drained;
- exact compatible client and runtime asset registry attestations;
- no asset with unresolved runtime-use authorization.

## Deactivation and recovery

Deactivation stops new starts and hides player entry. It does not delete rows,
refund resources, rewrite levels, cancel projects, alter Workers, change Marks,
or roll back the schema. Existing valid schedules may complete. A missing exact
schedule before its deadline, or while construction is deactivated, remains a
forward-fix blocker. No repair operator exists in this release. Once an exact
caller-owned project is overdue, an active and Worker-ready Inner Keep entry
read may complete it transactionally after proving the project and Builder
correlation; corrupt schedule state always fails closed.

If publication or an operator call times out, stop. Read the anonymous schema
and counts-only status, compare them with the private admin audit and local
result, and choose a forward action only after the state is unambiguous.
