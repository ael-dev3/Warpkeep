# Warpkeep product direction

This default-branch overview describes the 0.4 target. Its implementation and
linked specifications live on [the development branch](https://github.com/ael-dev3/Warpkeep/tree/codex/prepared-keep-bindings-fix);
main retains the G001 baseline and release preparation.

## The promise

A real person, a permanent keep, and a world worth returning to. Warpkeep is a
Farcaster-connected persistent strategy game about building a home in a shared
world. A Keeper's choices, accumulated effort and visible improvements should
make that place feel personal and give the next visit a purpose.

The Greater Realm supplies geography, resource destinations and visible journeys.
The Inner Keep turns the results into decisions and a growing home. These scales
should feel like one game: a shortage suggests a journey; a successful journey
makes a building possible; a completed building improves what happens next.

## The current release target: 0.4

Make one evening satisfying and tomorrow's return meaningful through
**gather → choose → build → benefit → return**. Workers gather resources from
the shared landscape. The player chooses which improvement matters now, places
it inside the keep and sees completion improve a later journey or project.
The first useful choice should arrive quickly; longer projects should create
anticipation without making the first session feel empty.

The current building roles make that loop concrete. Mills, Lumber Camps,
Stoneworks and Goldworks improve their matching resource yield. Barracks shorten
travel, and the Cathedral shortens future construction. Their exact costs,
durations and progression live in the [gameplay notes](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/agent-notes/0.4.0/gameplay-and-visuals.md),
where they can be checked against implementation. A player should understand
the benefit from the game itself.

The Verdant Citadel is the visual direction: an elevated town diorama with pale
masonry, dark timber, teal roofs, restrained warp accents and a muted, layered
forest. Building silhouettes, entrances, construction and completed upgrades
must remain legible at the scale of a phone. Voxel details give the ground and
surroundings structure; lightweight water gives the landscape movement and depth.
Both support the composition while staying decorative and responsive.

Visual quality includes the whole interaction: framing the selected site,
reading a cost, placing with touch or keyboard, seeing progress and recovering
from missing graphics. Reused models retain their recorded provenance; the new
composition and material treatment do not change their authorship.

This target is **not yet a shipped release**. The recorded Genesis 001 0.3.43
baseline has persistent keeps, Workers and gathering, not the completed 0.4
construction loop. Preserve its players, timers, data and presentation while
freezing new admissions during verified rollout. Deploy Genesis 002 sealed with
admissions TBD; prove playable 0.4 through the actual owner's isolated PTR.

## Design principles

- Judge additions by how they strengthen choices, progress and the desire to return.
- Make the next useful decision obvious; show spendable versus pending resources,
  exact costs and shortages, permanent placement and what completion changes.
- Keep identity, admission, ownership, resources, routes, timers and outcomes
  server-authoritative. Browser prediction is presentation, never a grant.
- Make retries, stale terms, reconnect and uncertain outcomes understandable and
  safe. Never hide a new irreversible command inside an automatic refresh.
- Prefer coherent original art direction and provenance-recorded reuse. Reduce
  optional decorative density before sacrificing legibility or responsiveness.
- Evaluate quality through actual play, measured responsiveness, visible state,
  preservation and failure recovery. Code volume and test counts are supporting
  evidence, not a rating of the game.
- Use Farcaster for verified identity and bounded social presentation, not an
  unbounded gameplay advantage. AI-assisted creation does not become game authority.

## How to judge the first release

The [0.4 checklist](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/operations/0.4.0-release-checklist.md) is the single release
completion contract. The first economy building **and its improved return** must
finish within ten minutes on actual atlas routes during owner PTR play.
All six effects/progression, realm isolation, visual/fallback states and fixed
performance gates require evidence. Code and synthetic captures alone do not
satisfy a live acceptance requirement.

Use the [gameplay specification](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/superpowers/specs/2026-09-05-warpkeep-0.4-gameplay-design.md)
and [Astra keep specification](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/superpowers/specs/2026-09-06-warpkeep-astra-keep-design.md)
as the current implementation baseline. Independent design and engineering
judgment are encouraged when they make the game better. Explain a substantial
change in terms of the player problem, alternatives, effect on existing work
and how the new result will be evaluated. Preserve working foundations where
they help; a historical plan is not a permanent limit on the game's ambition.

## Beyond 0.4

Scouting could make geography valuable; trade could make different priorities
useful; alliances and shared objectives could give neighbors a reason to matter.
Training, conflict, seasons and community institutions are also possible directions.
These are future possibilities rather than implemented features or promises.
Let observed play, voluntary return and player relationships guide prioritization.
See the [roadmap](roadmap.md) for the current/deferred boundary.

Warpkeep is not a wallet client or financial product. Community Marks are
non-transferable experimental accounting with no cash value, promised utility,
airdrop or financial return.
