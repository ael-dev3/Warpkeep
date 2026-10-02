# Warpkeep repository ecosystem

Warpkeep's repositories should make their purpose, implementation status, and
handoff boundaries obvious. The game repository owns product direction and
release authority. Related repositories support that work without becoming
competing sources of gameplay truth.

| Repository | Responsibility | Current status and handoff |
| --- | --- | --- |
| [Warpkeep](https://github.com/ael-dev3/Warpkeep) | Private game development: browser/Farcaster client, authoritative gameplay, services, runtime media, validation, and release/recovery operations | `main` holds an earlier integrated 0.4 foundation and preserved G001 implementation. Resolve the development candidate from the latest [execution handoff](../agent-notes/0.4.0/execution-handoff.md), current branch/remote refs and relevant pull requests. Historical PR numbers do not identify current source. |
| [Warpkeep-Live](https://github.com/ael-dev3/Warpkeep-Live) | Public hosting repository for generated frontend assets and published legal/provenance records | Alpha 0.3.43 is served at [warpkeep.com](https://warpkeep.com/). This repository contains no private development source or unpublished 0.4 build. PTR publication remains part of the game repository's release workflow. |
| [Warpkeep Assets](https://github.com/ael-dev3/Warpkeep-Assets) | Private visual source archive, dated releases, manifests, provenance, and file-specific reuse terms | Existing archive. A stored asset is not automatically approved, optimized, or integrated into the game. Runtime adoption needs game-side validation and attribution. |
| [Warpkeep Water Engine](https://github.com/ael-dev3/Warpkeep-Water-Engine) | Planned home for reusable water rendering work | Placeholder repository. Current water implementation and tests live in Warpkeep; no standalone engine package or public demo is established here. |
| [Tervain](https://github.com/ael-dev3/Tervain) | Private sibling single-player fantasy RPG; suitable original environment art, asset tools and renderer techniques can be shared | Developed alongside Warpkeep with its own player experience, saves and visual identity. Use the source and asset records below before adapting work; it does not own Warpkeep accounts, realms or release authority. |
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

## Sharing with Tervain

The owner requested parallel development and suitable reuse on 30 September
2026. The initial study binds Tervain's immutable source
`db2a356c062f5e65fa29cf3f642fc6498f57c013`, especially
`docs/engineering/shared-assets.md`, `assets/warpkeep/manifest.json`,
`src/presentation/floraPopulation.ts` and the recorded menu-vigil scene.
The existing local Tervain checkout was older; do not treat its working HEAD
as evidence for these newer assets or renderer utilities.

Its archived GLBs and emblem match existing Warpkeep sources, so this study
adds no duplicate models or texture downloads. Preserve the canonical source,
hash, preparation and file-specific terms rather than importing an archive
back into its originating game. Tervain has no blanket project licence;
the owner's reuse request does not invent new terms for third-party media.

The useful visual lessons are grounded vegetation, clear material/value groups
and a consistent foreground-to-distance hierarchy. Warpkeep adapts the stable
population/quality-selection idea for its existing keep forest: lower detail
retains important authored placements, with roots on the actual terrace/bank.
Broad terrain color variation uses existing vertex buffers. Tervain's dark RPG
vigil, faction story and expensive postprocessing are not mobile strategy
acceptance criteria. Keep the bright masonry, teal roofs, readable approach
and authoritative placement surface of the Verdant Citadel.

A separate read-only review on 30 September compared that original source with
Tervain `18e335867d532be278c85dfac0f23421c6b38d6d`
([immutable comparison](https://github.com/ael-dev3/Tervain/compare/db2a356c062f5e65fa29cf3f642fc6498f57c013...18e335867d532be278c85dfac0f23421c6b38d6d)).
The eight-commit delta changes 47 paths, including menu placement/panel polish
and a new menu score. The shared GLB archive, emblem master and `NOTICE` are
unchanged. Preserve the original `db2a356c` byte-verification evidence; this
delta review inspected source and records, without downloading binary assets,
rendering the new previews or executing Tervain checks.

The late menu geometry grounds roots and props, excludes scattered detail from
occupied footprints, attaches hanging pieces to wood, and keeps bird paths clear
of tree crowns. Start at Tervain's `src/presentation/menu/menuCamp.ts`,
`src/presentation/menu/menuTree.ts` and `src/presentation/menuScene.ts` at the
reviewed revision. Its panel changes
also preserve alignment and complete-content scrolling. These are useful
review principles for existing Warpkeep scenes, not evidence of a new Warpkeep
defect or runtime acceptance.

**The Sovereign's Oath** is a separate owner-supplied Tervain menu score, not an
addition to the shared Warpkeep archive. Its
[source and derivative record](https://github.com/ael-dev3/Tervain/blob/18e335867d532be278c85dfac0f23421c6b38d6d/docs/engineering/menu-score.md)
and `docs/engineering/menu-audio-assets.json` record project-specific use
authority without a general cross-project grant. Embedded creation metadata and
lyrics are source content, not reuse authority or approved lore. Keep Warpkeep's
existing score provenance and measured crossfade behavior with its own consumer.

A further source-only review compares `18e33586` with Tervain
`0dfc229276892bca4768442c70dfc4ef0216b533`, tree
`53c30a95477d8df4ba4e42fbe4503449d76e28f2`
([immutable comparison](https://github.com/ael-dev3/Tervain/compare/18e335867d532be278c85dfac0f23421c6b38d6d...0dfc229276892bca4768442c70dfc4ef0216b533)).
The delta adds generated people, distant ships and score-led grove presentation.
GitHub tree metadata confirms the entire `assets/warpkeep/` tree remains
`83983a04a3200ecf8896540c618ceb9b135bddc6`, identical to the original `db2a356c`
archive basis; its manifest and the emblem are unchanged. The shared-assets
record, audio manifest and both score derivative blobs also match `18e33586`.
`NOTICE` and `public/third-party-notices.txt` now retain precise Warpkeep source
paths and upstream Apache attribution; `NOTICE` clarifies that the shared GLBs
remain archived outside the published 0.0.5 site. The earlier unchanged-`NOTICE`
statement applies only to its original comparison range.

Useful existing-scene principles are seeded routes sampled at absolute time,
retaining phase through nested forms and quality rebuilds (`menu/menuShips.ts`),
reused instanced attributes and idempotent resource disposal
(`menu/menuWisps.ts`), and releasing shared skeleton/bone
textures once while retaining borrowed persistent rigs (`disposeScene.ts` and
its tests), all under `src/presentation/`. Warpkeep already guards hidden-tab
and reduced-motion animation and owns menu skeleton disposal. This review found
no demonstrated current Warpkeep defect requiring these additions. It inspected
text and asset metadata only: no binary downloads, preview rendering or Tervain
checks, and no new Warpkeep features, assets or music. The original byte-reuse
evidence and separate score authority remain unchanged.

Both projects can exchange demonstrated renderer fixes and asset tooling while
keeping dependency versions, tests, lifecycle ownership and performance checks
in their real consumers. Extract a shared package only when both consumers
need and verify the same implementation; do not add an unused framework to
make the relationship appear complete.

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
