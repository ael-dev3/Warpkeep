# Warpkeep roadmap

## Current milestone — Alpha 0.3.0 living-world foundation

Warpkeep's public title, menu, SIWF/OIDC boundary, deterministic 61-cell Lowlands, first authoritative keep projection, and server module are live. The production admission list remains intentionally empty: the world exists, but no player or castle is created until a FID is deliberately admitted.

Alpha 0.3.0 adds the real 3D title, functional graphics settings, a high-quality balanced mobile keep, clearer realm lighting/fog, centered credits, reproducible asset inputs, and a complete reconstruction record. Cinematic/Balanced/Performance choices affect the title model and VFX, realm terrain density, keep LOD, pixel budget, shadows, fog, and lighting without changing authentication or authority.

## Next vertical slice — admitted shared realm

After a deliberate admission decision:

1. Bootstrap one player and level-one castle atomically through the server module.
2. Prove server-owned castle location/name/level after reload and on a second client.
3. Render another admitted player as a lightweight peer marker.
4. Prove disable/auth-epoch rotation revokes gameplay authorization without deleting state.
5. Keep private admission/audit data out of browser subscriptions and diagnostics.

## Gameplay slices

1. Server-derived resources and deterministic building queues.
2. Unit training, scouting, map visibility, and public activity reports.
3. Deterministic travel, raids, defenses, and bounded combat resolution.
4. Alliances, diplomacy, season rules, and community realm governance.
5. Read-only AI court reports, lore, summaries, and quests derived from authoritative snapshots.

## Non-goals for this alpha

- pretending the complete resource/combat/social loop exists;
- automatic owner, QA, synthetic, or public allowlisting;
- browser-owned keep identity, resource totals, timer completion, or combat results;
- wallet/token mechanics or pay-to-win shortcuts;
- using AI output as authoritative state;
- publishing unresolved-rights source media merely to reduce repository size.

The frontier grows through small server-authoritative slices, each deployed from an exact reviewed commit and verified against production before the next begins.
