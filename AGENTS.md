# Working on Warpkeep

Build a persistent strategy game around a real person, a permanent keep and a
world worth returning to. Connect **gather → choose → build → benefit → return**
into a satisfying experience, then improve it through observed play.

This is durable repository guidance. The current user's instructions take
precedence. Handoffs, old plans and acceptance records provide context and
evidence; they do not silently restrict a newer task or create additional
permission requirements.

## Orient before changing things

1. Read [README.md](README.md) and the [ecosystem map](docs/engineering/ecosystem-map.md).
2. Inspect the actual checkout, branch, remote, scoped diff and relevant CI.
   `main` contains the G001 baseline and release preparation. Active 0.4 work is on
   `codex/prepared-keep-bindings-fix`; its gameplay core, owner PTR and `keep04`
   presentation are absent from this default-branch baseline.
3. For 0.4 work, read the instructions in that checkout, its
   [handoff](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/agent-notes/0.4.0/README.md)
   and [source map](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/agent-notes/0.4.0/repo-map.md).
   Work in the intended branch; do not recreate an implementation because it is
   missing from `main`.
4. Read the real caller, state owner and tests before editing. Distinguish
   implemented, verified, deployed and unknown behavior. Verify running work
   through its actual process or job handle before restarting it.

## Product and engineering judgment

- Favor useful choices, visible benefits, clear feedback and reliable return
  visits over feature count or implementation complexity. Improve weak mechanics
  and architecture when it materially helps the game; explain significant changes
  through the player problem, tradeoffs and verification.
- Continue The Verdant Citadel's pale masonry, dark timber, teal roofs, warm
  activity and layered natural framing. Review the actual rendered experience,
  mobile interaction and fallback states. Shader complexity is not visual quality.
- Keep marketing focused on the experience. Put tuning values, map capacities
  and performance limits in their technical owners rather than repeating them
  as permanent product promises.
- Use independent bounded collaborators where useful, with explicit file
  ownership. Integrate and review their work.

## Preserve authority and compatibility

Preserve established G001 player progress, access and normal timers alongside the
new-admission freeze. G002 remains sealed while future admissions are undecided.
Use the isolated owner PTR on the development branch for the new gameplay journey.
Do not substitute administrator authority or invented identities for player access.

The server owns resources, ownership, routes, completion and command outcomes.
Keep transactions atomic, retries exact and realm/session/database boundaries
explicit. Recheck authority after asynchronous work. Keep healthy UI refreshes
stable without exposing unconfirmed commands. Decorative geometry must not change
game authority. Preserve additive deployed schema compatibility and generate
bindings and manifests through their actual tools.

Legacy G001 Inner Keep construction and gathering are a different policy generation
from 0.4 return-credit and building benefits. Current source routes live in the
[ecosystem map](docs/engineering/ecosystem-map.md); do not cross those boundaries
because filenames or historical plans look similar.

## Work and verify

- Complete a coherent change through its real caller, inspect the scoped diff
  and run checks appropriate to the behavior. Preserve unrelated work. Do not
  weaken tests, security checks, CI or artifact verification to obtain a pass.
- Use [CONTRIBUTING.md](CONTRIBUTING.md) for baseline setup and verification.
  Inspect shared `node_modules` links or junctions before installing; use an
  independent checkout when installation would affect another task.
- Root Vitest owns `tests/**`; the SpacetimeDB package has a separate Node/tsx
  runner, and services have their own checks. Root `tsconfig.json` references
  projects: use `npm run typecheck`, not root `tsc --noEmit` as a substitute.
- For visuals, inspect rendered views, loading/failure, background/resume and
  cleanup. Describe whether evidence came from a fixture, emulation, a physical
  device or authenticated play. Measure workloads before claiming performance.
- Keep one canonical document per topic. Update product intent, architecture,
  source routing and dated evidence where each belongs. Verify links and
  generation labels when changing docs.

## Publication and handoff

Source publication, successful verification, deployment and usable gameplay are
different outcomes. The Pages workflow classifies verified source before selecting
a deployment lane; a green workflow with skipped deployment jobs is not a release.
Consult the actual scripts and target configuration before operating Cloudflare,
SpacetimeDB or Pages. Historical runbooks are context, not an instruction to deploy.

Keep reviewed source checkpoints visible when publication is part of the task.
Fetch first, scan the outgoing range, stage exact reviewed paths and push the
explicit branch without force. Verify remote equality and preserve unrelated edits.
Do not fabricate artifact hashes or evidence, bypass production checks, or discard
legitimate writes to make recovery convenient.

Keep credentials, private player data and sensitive receipts out of Git, public
reports and handoff packages. Read [asset provenance](ASSETS-LICENSE.md) before
changing media, preserve file-specific terms and credit reuse accurately.

End with what changed, the source and remote checkpoint, what was actually
verified, any remaining issue and the next useful action. Do not claim the full
release is complete from a documentation change or a local test result.
