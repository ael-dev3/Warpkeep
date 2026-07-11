# Warpkeep roadmap

## Current milestone — Farcaster-gated shared Lowlands alpha

Implemented in the repository, but intentionally not activated on the public Pages deployment until infrastructure is real:

- cinematic title, menu, credits, audio scenes, mobile deep-link-first SIWF, and accessible route transitions;
- 61 playable Lowlands hexes with a separate 30-cell visual apron, high/compact keep LODs, and a close keep camera;
- Farcaster SIWF → independently verified bridge proof → ES256 OIDC JWT with stable `farcaster:<fid>` subject;
- private `allowed_fid` plus auth-epoch revocation, public player/castle/world state, and real generated SpacetimeDB bindings;
- narrow shared subscriptions after admission only; server castle name/level/coordinates replace the old fixed-center authority while peer keeps stay lightweight;
- an empty initial whitelist and the Hegemony request-access panel for valid but unadmitted users;
- protected Hermes operations, generated-binding CI verification, bridge tests, and fail-closed deployment guards.

The public Pages experience does not currently claim a permanent keep. Without a configured bridge/issuer it remains title/menu-safe and performs no shared database I/O.

## Activation gate

Before merging active frontend configuration or publishing a real module:

1. Provision a stable HTTPS OIDC issuer with public discovery/JWKS and a managed ES256 private key.
2. Deploy the Worker with exact Pages CORS/SIWF values and a protected auth-epoch resolver that reads current module epoch state with Hermes authority.
3. Replace the module's `.invalid` issuer, build with pinned `2.6.1`, publish to `warpkeep-89e4u` non-destructively, and seed exactly 61 world rows.
4. Keep all real FIDs out of `allowed_fid`; test a valid Farcaster login through the clean denial panel first.
5. Configure public Vite values, deploy Pages, and verify anonymous visitors create neither relay nor SpacetimeDB identities.

## Next vertical slice — admitted shared realm

After activation QA, admit a deliberately chosen user through Hermes and prove:

- one persistent player and one level-one castle bootstrap atomically;
- server-owned castle location/name/level render after reload;
- a second admitted fixture appears as a lightweight peer marker;
- disable/auth-epoch bump revokes gameplay authorization immediately;
- public world/player/castle updates are realtime and private tables never reach browser bindings.

This requires isolated local module integration coverage before any real-user admission.

## Subsequent gameplay slices

1. Server-derived resources and building queues.
2. Unit training, scouting, map visibility, and public reports.
3. Deterministic travel, raids, and combat resolution.
4. Alliances, diplomacy, season rules, and community realm governance.
5. Optional original faction economies and social mechanics, never as authentication inputs or pay-to-win shortcuts.

AI remains a presentation layer for court reports, lore, summaries, and quest copy. Reducers remain the only authority for resources, progression, combat, and social state.

## Non-goals for this alpha

- resources, building upgrades, units, combat, alliances, chat, tokens, or multiple authoritative realms;
- authoritative visual-apron cells;
- Mini App/Quick Auth/wallet connectivity;
- a production refresh-token architecture;
- any automatic owner, QA, or synthetic FID allowlisting;
- new title/menu/terrain art unrelated to the shared-state proof.
