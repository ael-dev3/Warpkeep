# Warpkeep Alpha 0.3.4 — Genesis Realm Presentation

**Status:** Pages-only release, deployed from protected-main commit
[089430e](https://github.com/ael-dev3/Warpkeep/commit/089430ecec83b72756104b33632673bdc6c2d8f1)
and named by tag [v0.3.4](https://github.com/ael-dev3/Warpkeep/releases/tag/v0.3.4).

Alpha 0.3.4 improves the admission-gated Genesis 001 realm presentation while
leaving shared-world authority unchanged.

## Highlights

- The title route uses only the integrity-verified 3D title model; legacy HTML,
  SVG, loader, and procedural wordmark paths are removed.
- Hegemony castle models and quality levels replace earlier Frontier Keep
  derivatives in the shared realm.
- Castle labels, selection, inspection, camera framing, and navigation are more
  compact and readable across supported layouts.
- The title and realm retain responsive, touch, keyboard, reduced-motion, and
  non-WebGL fallback behavior.

## Current alpha boundary

The alpha supports controlled realm viewing and navigation, castle presentation,
and bounded public-profile and Marks-balance presentation. It does not make
resources, upgrades, units, combat, alliances, chat, seasons, wallet actions,
or Marks crediting/spending available.

This release changes Pages frontend assets only. It does not publish a Worker,
Durable Object, or SpacetimeDB module/schema, and it does not alter admission,
profiles, world data, castles, wallets, Marks, scans, or burns.

## Known limits

- Admission remains controlled; public admission is not open.
- Representative real-device GPU, thermal, and long-session lifecycle evidence
  remains future operational work.
- The title and realm are a presentation foundation, not a completed gameplay
  loop.
