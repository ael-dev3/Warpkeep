# Warpkeep technical architecture

This is the current architecture map, not proof that every operating path is
deployed. It separates the preserved G001 baseline from the isolated 0.4
successor. For dated implementation/CI/access findings, use the
[agent handoff](agent-notes/0.4.0/README.md); for completion, use
[R01–R18](operations/0.4.0-release-checklist.md).

## Responsibilities and trust boundaries

| Layer | Owns | Must not own |
| --- | --- | --- |
| React/Three.js browser | Navigation, validated presentation, controls, graphics lifecycle | Admission, balances, authoritative route/yield/timer outcomes or signing credentials |
| Cloudflare auth bridge | Verified Farcaster proof exchange, scoped sessions and access claims | Unconditional admission from a frontend assertion |
| Realm database adapters | Authenticated identity/database/epoch checks, transactions, storage and topology | Trust in a client-selected acting owner, route, balance or elapsed reward |
| Shared 0.4 core | Bounded deterministic policy/state transitions and arithmetic | Network authentication, SDK schema registration or a second realm's identity |
| Release/recovery services and fixed workflows | Verified source/artifact/execution identity, private authorization and reconciliation | Arbitrary caller evidence, fabricated history or bypasses around protected deployment |
| Asset/voxel presentation | Geometry, material, detail and fallback | Persistent world membership, resources, collision or navigation authority |

### Hosting

- GitHub Pages serves the frontend at `warpkeep.com`.
- Cloudflare Workers serve the auth bridge at `auth.warpkeep.com`.
- SpacetimeDB holds distinct G001, G002 and PTR databases.
- The recovery design separates an external gateway from a private signer/service
  binding and durable ledger. Checked-in configuration is not proof of deployed
  or enabled recovery services.

Authenticated provider/account/route/database re-verification is required before
operations. CLI login is not application-admin or actual-owner authorization.

## Two gameplay generations, not one shared authority

**Genesis 001** retains the recorded 0.3.43 world, existing players, resources,
Workers, timers, bindings and appearance. Its narrow access-freeze policy permits
existing player access while disabling new admission mutations/access requests.
Before rollout, independently record deployed versions, immutable identity and
sensitive admitted-player baseline. Normal writes continue; static whole-database
hash comparison cannot prove preservation.

**0.4** uses `spacetimedb/gameplay04/` as a dependency-free transition core.
G002 and PTR instantiate separate private schemas and thin SDK transaction
adapters. The seven gameplay families cover keep/account, four Workers, buildings,
one project, bounded command receipts, reservations and scheduled wakeups.
Existing legacy population descriptors remain empty in these isolated realms;
the new gameplay path must not seed or activate legacy G001 authorities.

**G002** rejects gameplay before storage while sealed, including for an admin.
This is the required release behavior. **PTR** checks current signed issuer,
audience, expiry, immutable database identity, enabled unique owner anchor and
matching identity/epoch. Atlas-admin access is not player authority.

## Authoritative 0.4 command flow

The app's realm selection obtains a scoped PTR session/capability through
`src/ptr/PtrRealmProvider.tsx` and `ptrRealmConnection.ts`. The narrow generated
interface supports initialize, read/reconcile, dispatch, recall and start/upgrade.

The controller captures a canonical request key/sequence, expected revision and
required quote/placement bindings. The realm procedure authenticates, resolves
real atlas facts and executes the core inside a transaction. The response is
bounded/validated before immutable presentation is published.

Accepted exact retries return the original receipt without additional effect.
Conflicting, pruned or out-of-order requests reject. Unknown outcomes retain the
original envelope; changed quote terms require explicit renewed confirmation.
Reconciliation, deductions, placement/project/Worker state and receipt commit
atomically. Server scheduling and authenticated reads can reconcile overdue
canonical work; browser clocks never grant resources or finish buildings.

Workers reserve real validated atlas capacity, capture rates at dispatch and
make resources spendable on authoritative return. Four economy buildings improve
matching yield; Barracks improves travel and Cathedral future build time.
An existing expedition/project retains its captured terms. One Builder and
permanent placement remain. See the
[gameplay specification](superpowers/specs/2026-09-05-warpkeep-0.4-gameplay-design.md)
for the exact numeric/wire contract rather than duplicating it here.

Realm/session/database/epoch changes retire incompatible connections,
subscriptions, caches, capabilities and pending operations. Async replies must
recheck scope. Current short owner sessions make expiry/re-entry an important
acceptance case; see the [gameplay audit](agent-notes/0.4.0/gameplay-and-visuals.md).

## Presentation and renderer ownership

`PtrGameplay04SurfaceHost.tsx` selects the separate world or keep surface.
`src/ptr/gameplay04/` owns controller/decoded state; `src/components/keep04/`
owns keep decisions, schematic fallback, scene host, materials and art profile.
It does not inject legacy G001 resources/Worker/Inner Keep callbacks to bypass
the older renderer's isolation checks.

The new route mounts mutually exclusive world/keep surfaces with owned lifecycle;
it is **not** the legacy implementation's promise to retain the same renderer
instance across every world/keep switch. The invariant is at most one active
canvas/renderer, proper retirement/disposal and correct scope on return.

The Verdant Citadel composition uses pale stepped masonry, dark timber, teal
roofs, restrained warp accents and layered forest. New art direction/materials
coexist with correctly attributed pinned assets and six procedural fallbacks.
`voxelSurfaceMesh.ts` is reusable bounded meshing infrastructure; actual world
and keep dressing consume it. Decorative detail cannot change placement or route
authority. Keep generated dressing plans reproducible.

Actual 0.4 world/water runs in
`src/greater-realm/createGreaterRealmSceneRuntime.ts`. Legacy
`src/components/realm/realmWaterLayer.ts` is a G001 shader reference, not already
integrated 0.4 water. Any adaptation must leave G001 appearance intact.

Hosts own loaders, RAF scheduling, canvas/listeners, context restoration and
disposal. Quality/reduced-motion/hidden-page policies bound optional work.
Fallback remains usable, with text/keyboard/touch decisions rather than a dead
canvas. Source/unit/fixture evidence does not replace measured production-build
[performance](evidence/0.4.0/performance.md) or actual-owner acceptance.

## Identity, privacy and adjacent systems

The [auth bridge](../services/auth-bridge/README.md) independently verifies browser
SIWF or exact-domain Mini App Quick Auth. Browser session rotation and cookie-free
Mini App entry are separate paths. The database verifies narrowly scoped claims
again. Usernames/portraits and Mini App context are presentation, not entitlement.

Private balances, admin records, identity proofs and receipts stay private.
Renderers receive constrained state, never credentials or arbitrary RPC.
Realm Chat, notifications, observers, canaries and legacy Inner Keep features
retain their own gates; new keep work does not silently activate them.
See the [threat model](security/threat-model.md) and [SECURITY](../SECURITY.md).

## Release architecture and current operating gap

The local Windows/WSL pipeline captures committed source, builds real bindings
and fixed operation bundles, derives the exact closure family, then installs and
checks an isolated candidate transactionally. G001 compatibility projections are
validation-only. Candidate-file crash recovery is separate from live database
recovery preserving later writes.

The approved recovery path binds independently authenticated source/artifact/
program/atlas/bridge facts to producer-owned records and genuine Actions identity.
Canonical hashes and private file ownership alone do not establish provenance.
Schema2 recovery must not fabricate missing schema1 historical freeze evidence.

Several production adapters, the recovery Pages job and supported local runner
wiring remain incomplete at the dated audit. Do not describe component tests or
configuration files as an operating release. Follow the
[release audit](agent-notes/0.4.0/release-and-infrastructure.md) and
[assembler specification](superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md).

Finish required gameplay, visual and operating sources before final family freeze.
Capture baseline and test compatible write-preserving recovery before production
effects. Then use protected integration, exact deployments and live verification.
The final ledger links reviewed source/CI/artifacts/deployment/database identities
to every mandatory acceptance result and the credential-free Desktop handoff.

## Where details belong

- [Repository map](agent-notes/0.4.0/repo-map.md): source/test investigation routes.
- [Development workflow](engineering/development-workflow.md): change/evidence/review process.
- [Legacy Inner Keep V1](design/inner-keep-construction.md): retained historical
  G001-oriented contract, not current 0.4 policy.
- [Lowlands presentation](design/hegemony-lowlands-terrain.md) and
  [legacy analytic water](design/realm-surface-relief-and-analytic-waves.md):
  preserved-generation details, not permission to change G001 appearance.
- [Asset provenance](../ASSETS-LICENSE.md): exact rights and attribution.
- [Documentation index](README.md): remaining product, service, operations and history routes.
