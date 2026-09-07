# Working on Warpkeep

Build a persistent strategy game around a real person, a permanent keep and a
world worth returning to. Connect **gather → choose → build → benefit → return**
into a satisfying experience, then ship and improve it through observed play.

This file is durable repository guidance. The current user's instructions take
precedence. Handoffs, old plans and acceptance records provide context and evidence;
they do not create new permissions or silently restrict a newer product direction.

## Orient before changing things

1. Read [README.md](README.md) for the promise and
   [the 0.4 handoff](docs/agent-notes/0.4.0/README.md) for the current work.
2. Inspect the actual checkout, branch, scoped diff, remote and relevant CI.
   Active 0.4 work is on `codex/prepared-keep-bindings-fix`; do not confuse main,
   a development checkout, a generated candidate and the deployed application.
3. Use [the repository map](docs/agent-notes/0.4.0/repo-map.md) to find the real
   caller, state owner and tests. Verify reported running work through its actual
   process/job handle before restarting it. A stale lock or journal is not proof.
4. Read source and current evidence before redoing a feature or repeating an old
   failure. Record what is implemented, verified, deployed or still unknown.

Use the [branch entry map](docs/engineering/ecosystem-map.md) to distinguish
the published baseline from active development, and the
[repository ecosystem](docs/engineering/repository-ecosystem.md) for related
repositories and asset handoffs.

## Product and design judgment

- Favor useful player decisions, visible benefits, clear resource feedback and
  reliable return visits over feature count or implementation complexity.
- Improve or replace weak mechanics and architecture when that materially helps
  the game or delivery. Preserve useful foundations; explain significant changes
  through the problem, chosen behavior, tradeoffs and verification.
- Continue **The Verdant Citadel**: pale masonry, dark timber, teal roofs, warm
  activity, restrained warp accents and layered natural framing. Review the actual
  render path and mobile experience. A complex shader is not visual acceptance.
- Keep marketing and onboarding focused on the experience. Put tunable map sizes,
  capacities, economy values and performance limits in their technical owners,
  rather than repeating them as permanent product promises.
- Use independent bounded collaborators when useful, with explicit file ownership.
  Integrate and review their results; delegation does not establish correctness.

## Know the system you are changing

| Work | Primary implementation |
| --- | --- |
| New gameplay rules | `spacetimedb/gameplay04/`, with realm-specific transaction/auth adapters |
| Owner session and gameplay controller | `src/ptr/`, especially `src/ptr/gameplay04/` |
| New personal keep | `src/components/keep04/` |
| New atlas and water presentation | `src/greater-realm/`, especially `createGreaterRealmSceneRuntime.ts` |
| Preserved G001 gameplay and renderer | `spacetimedb/src/`, `src/spacetime/`, `src/components/realm/createRealmScene.ts` |
| Player identity | `services/auth-bridge/` |
| Delivery and recovery | `scripts/`, `.github/workflows/`, `services/release-recovery/` |

Legacy `inner-keep` and G001 water are not the current `keep04`/Greater Realm
implementation. Read [the architecture](docs/technical-architecture.md) before
crossing those boundaries.

Preserve existing G001 progress, access and normal timers alongside the agreed
new-admission freeze. G002 remains sealed while future admissions are undecided.
Use the owner's isolated PTR for the new playable journey. Never invent a player,
token, receipt or substitute administrator authority for actual player access.

The server owns resources, ownership, routes, completion and command outcomes.
Schema changes must preserve existing player data and compatible readers; inspect
the actual migration, deployment and recovery path before changing persisted state.
Preserve atomic settlement, exact retry identity, stale-quote reconciliation,
monotonic state and realm/session/database/epoch isolation. Recheck authority after
asynchronous work. Healthy refresh should preserve scene and focus without making
unconfirmed commands available. Decorative geometry must not silently change game
authority. Generated bindings and release manifests come from their generators.

## Work, verify and publish

Follow [the development workflow](docs/engineering/development-workflow.md) and
[source synchronization](docs/operations/0.4.0-development-sync.md).

- Make a coherent improvement, test the affected behavior and inspect the diff.
  Complete the real caller and integration, not only an unused helper.
- Inspect dependency paths before installing. Existing worktrees may share a
  `node_modules` junction; install into an independent verification checkout.
- Root Vitest owns `tests/**`; module tests use their separate Node/tsx runner.
  Services own their own checks. Root `tsc --noEmit` alone does not traverse this
  repository's referenced projects. Use package build-mode types or explicit
  app and Vite-config noEmit checks. Confirm selected tests and exit codes.
- For visual changes, inspect rendered views, progression, loading/failure,
  background/resume and cleanup. Distinguish fixtures, emulation, actual devices
  and authenticated owner play. Measure the agreed workloads before claiming
  performance. Review authority, persistence and recovery changes independently.
- Keep reviewed development commits visible on GitHub at meaningful checkpoints.
  Fetch first, scan the outgoing range, push an explicit non-forced refspec to the
  correct upstream branch and verify remote equality. Do not wait for production
  readiness to publish an honestly labeled development checkpoint.
- Preserve unrelated edits and private artifacts. Stage exact reviewed paths;
  never sweep an entire dirty worktree into a commit or force-overwrite new remote
  work. A clean-looking status is not worth losing work.
- Keep README, architecture, source routing and dated notes aligned. Update the
  canonical document for a topic instead of creating another competing plan.

## Delivery and handoff

GitHub Pages hosts the frontend, Cloudflare hosts identity/recovery services, and
SpacetimeDB hosts persistent realms. Verify configured accounts and immutable
targets. Complete the Windows/WSL/Linux operating path without a Mac dependency;
required workflow identity must come from the actual supported runner.

Source synchronization, a green test, deployment and usable player experience are
different outcomes. The [release acceptance record](docs/operations/0.4.0-release-checklist.md)
tracks the remaining evidence for preservation, gameplay, visuals, performance,
operations and the credential-free Desktop package. Keep it current with the
user's direction; do not turn historical task labels into new approval layers.
Inspect the exact selected job and artifact: a successful Pages preparation run
can deliberately skip deployment and does not establish a live release.

Recovery must preserve legitimate writes after deployment. Derive complete source
and artifact inventories; do not type hashes, weaken checks or fabricate old
evidence to make a release pass. Keep credentials, private player data and sensitive
operational records out of Git and public/Desktop deliverables. Read
[asset provenance](ASSETS-LICENSE.md) before changing media and credit reuse accurately.

End each session with what changed, the source and remote checkpoint, what was
actually verified, the exact remaining issue and the next useful action. Keep the
full release goal active until the deployed game and required evidence support it.
