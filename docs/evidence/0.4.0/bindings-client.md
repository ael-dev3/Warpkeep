# PTR bindings and narrow gameplay client

Recorded 2026-09-06. Local component evidence, **not live gameplay evidence**.

## Generated bindings

Accepted carry commit: `ccd11b29058a07f04118bf1a247b7f71cab0651b`.
Generation source: `966a95f2ce4c9a6bb70374832f5216e107f713c7`, tree
`9e07dbc493c3e186be710136ab411df3d80a8084`.

The isolated native generator returned 25 files. The controller checked exact
path set, regular-file status, byte lengths and SHA-256 equality against the
retained generation result. Five new gameplay procedure modules were added;
public tables remain empty. Runtime descriptor and compile-time accessor tests
cover the real generated surface. Independent task review approved the carry.

The separate two-cycle native regression passed. Two legacy checkout-native
tests were excluded from the focused carry run because they invoke build/generate
in a checkout without isolated module dependencies. Complete final native release
verification is still required; these exclusions are not a release waiver.

## Authenticated capability

Accepted commit: `6b1d2e4aa0c4b2ea8e990a30fd6499cdd86211eb`.
Independent task review approved spec compliance and quality with no findings.

The capability exposes one read and four fixed mutation operations, not arbitrary
RPC or a raw connection. Private branding binds the exact originating session,
authority and generation. Pre-call and post-settlement checks suppress stale
results. Abort cleanup observes late rejection without claiming that an aborted
request cancelled a committed transaction. Fixed-message errors classify only
bounded exact known primitive codes; definitive rejection does not retire the
socket. Offline characterization exercises the real generated SDK's raw-string
procedure rejection.

Reported final verification (pinned Node 22.22.3):

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs --run tests/ptrGameplay04Capability.test.ts tests/ptrRealmConnection.test.ts
# Exit 0: 87 tests passed across 2 files.
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
# Exit 0.
```

RED/GREEN evidence includes the initially missing module and a failing
cross-session method-borrowing regression corrected before the final run.

## Validated state and pure presentation

Accepted commit: `53bede2e0eaceb5a7872f566ec9ec97ee46a9123`.
Independent review approved spec compliance and quality with no findings.
Seven scoped source/test files add closed, bounded, recursively frozen decoding
of the real flat projection; shared-policy costs, benefits and placement; and
spendable-only deficits. Captured trip rates are not rebased after upgrades.
There is no client-clock resource grant, transport or admission change.

The report records 154 passing tests across the three new client suites and
shared policy, placement and journey suites, plus pinned `tsc -b` exit 0.
Failure-first evidence includes over-cap balance rejection and regressions for
zero initialized keep revision/sequence. Review checked the actual server
projection, shared journey, return and construction validators.

Controller retry/reconfirmation, session retirement and integrated rendering
are not supplied by this pure state layer and remain mandatory downstream work.

## Acceptance boundary

R01's local generated-binding and narrow-client condition is satisfied for these
commits. The decoder, controller, presentation disposal, actual-owner admission,
live database targeting and playable journey remain separate mandatory gates.
No provider mutation, deployment or admission change occurred in these tasks.
Final source/artifact freeze must regenerate and verify the complete release
family after required source changes; this intermediate carry is not that freeze.
