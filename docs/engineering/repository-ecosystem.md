# Warpkeep repository ecosystem

Warpkeep's repositories should make their purpose, implementation status, and
handoff boundaries obvious. The game repository owns product direction and
release authority. Related repositories support that work without becoming
competing sources of gameplay truth.

| Repository | Responsibility | Current status and handoff |
| --- | --- | --- |
| [Warpkeep](https://github.com/ael-dev3/Warpkeep) | Browser/Farcaster game, authoritative gameplay, services, runtime media, validation, and release/recovery operations | `main` contains integrated 0.4 development source and preserved G001 implementation; live 0.4 delivery remains unfinished. Follow the [execution handoff](../agent-notes/0.4.0/execution-handoff.md), current refs and open pull requests for active work. |
| [Warpkeep Assets](https://github.com/ael-dev3/Warpkeep-Assets) | Visual source archive, dated releases, manifests, provenance, and file-specific reuse terms | Existing archive. A stored asset is not automatically approved, optimized, or integrated into the game. Runtime adoption needs game-side validation and attribution. |
| [Warpkeep Water Engine](https://github.com/ael-dev3/Warpkeep-Water-Engine) | Planned home for reusable water rendering work | Placeholder repository. Current water implementation and tests live in Warpkeep; no standalone engine package or public demo is established here. |
| Ael's GitHub profile | Introduce the person, selected public projects, and links to their canonical documentation | Public presentation. Keep descriptions consistent with project evidence; avoid private project information and unsupported release claims. |

## Runtime and infrastructure remain together

The Warpkeep repository currently owns `src/`, `spacetimedb/`,
`services/auth-bridge/`, `services/release-recovery/`, `.github/workflows/`,
`scripts/`, and `config/`. These are connected parts of the release. Do not create
an infrastructure repository merely to match a diagram or move files without
fixing their real consumers.

The separate editor workspace is planning material and remains private. It has
no application or deployment yet. Future authoring tools should reuse the game's
schemas and validators, label previews clearly, and pass reviewed content back
through the existing game workflow. Public-facing pages should feature public
projects only.

## Asset and rendering flow

1. Find the source, creator, permission, and intended use in the asset archive or
   game-side provenance record.
2. Prepare a runtime candidate with the correct format, scale, origin, materials,
   and mobile cost. Preserve the source and its terms.
3. Integrate through the owning renderer and manifest in Warpkeep. Test loading,
   failure, disposal, and actual rendered appearance.
4. Record the accepted source/output relationship. Archive availability and
   local preview quality are not runtime acceptance.

For 0.4 water, start at `src/greater-realm/createGreaterRealmSceneRuntime.ts` and
the atlas chunks it constructs. `src/components/realm/realmWaterLayer.ts` belongs to G001.
Extracting a reusable engine is a future decision based on demonstrated need;
the placeholder repository does not change runtime ownership.

## Keep the ecosystem understandable

- Put the player promise in the root README and
  [product direction](../design/warpkeep-direction.md).
- Put subsystem ownership in [architecture](../technical-architecture.md) and
  investigation paths in the [repository map](../agent-notes/0.4.0/repo-map.md).
- Put setup and maintenance instructions beside the tool or service that runs.
- Put dated successes, failures, and unknowns in evidence and agent notes.
- Update affected repository descriptions and profile summaries when the public
  product status changes. Never use a README refresh to imply a release happened.
- Synchronize reviewed source explicitly using the
  [development sync workflow](../operations/0.4.0-development-sync.md).
