# Warpkeep agent guide

Repository-wide engineering guidance. This is not production credentials, a new
authorization grant, or a replacement for the current user's task.

## Start with the right source of truth

1. Read `README.md` and `docs/README.md` for product and navigation.
2. For 0.4, read `docs/operations/0.4.0-release-checklist.md` and
   `docs/agent-notes/0.4.0/README.md`; use their linked maps to find current code.
3. Continue the settled gameplay, Astra keep and assembler specifications linked
   there. Historical plans and unchecked boxes do not prove current status.
   Inspect source, actual callers and dated evidence before rebuilding something.
4. Inspect current branch/commit, scoped diff and relevant CI. Preserve unrelated
   changes and existing processes. Record which source your checks actually cover.

Read `docs/engineering/development-workflow.md` for document ownership, change
sequence and evidence standards. Keep dated operational status out of this guide.

## Architectural invariants

- Preserve G001's recorded 0.3 gameplay, presentation, identities and persistent
  state. Freeze new admissions, not existing players or legitimate timers/writes.
  Capture the required live baseline before effects; whole-database hash equality
  is not a valid preservation criterion while gameplay continues.
- G002 0.4 stays sealed with admissions TBD. Intentional pre-storage denial is
  correct, not a stub to open. PTR requires the actual authenticated owner in its
  isolated database. Never invent identity/tokens/receipts, substitute atlas-admin
  authority for player authority, or bypass denied access with another credential.
- Keep new gameplay in `spacetimedb/gameplay04/`, with thin realm transaction/auth
  adapters. Keep G001 authority separate. The browser presents validated state;
  it cannot grant resources or complete timers.
- Preserve exact replay envelopes, monotonic sequence, atomic settlement,
  stale-quote reconfirmation and realm/session/database/epoch retirement. Recheck
  authority across asynchronous boundaries; no optimistic irreversible effects.
- Use `src/ptr/gameplay04/` and `src/components/keep04/` for the new keep. Reuse
  neutral utilities, not legacy policy or prop bypasses. Actual 0.4 world water is
  in `src/greater-realm/createGreaterRealmSceneRuntime.ts`; `realmWaterLayer.ts`
  belongs to the preserved G001 renderer.
- Voxels, forest, water and scenery are decorative. Geometry cannot introduce
  harvesting, navigation/collision authority, terrain editing or persistence.
  Preserve mobile budgets, reduced motion, fallback and resource ownership.

## Make bounded, reviewable changes

- Choose a specific existing requirement and trace source → caller → test →
  operating evidence. A helper without its required caller is not delivery.
- Do not expand 0.4 or rewrite working foundations to change authorship. Record
  material design corrections with evidence, alternatives, impact and acceptance;
  defer unrelated improvements with reasons.
- Separate implementation, generated outputs and documentation in review. Stage
  exact paths, not a dirty checkout; do not normalize unrelated files, overwrite
  other work or force-push shared refs.
- Do not hand-edit generated bindings, manifests, source pins or closure counts.
  Use supported generation/assembly and verify outputs and convergence. Final
  freeze waits until required gameplay, visual and operating sources are complete.
- Private receipts, no-clobber files and fixed workflow checks are authority
  boundaries. Never remove a guard, widen an arbitrary callback or relax exact
  assertions merely to obtain green tests.

## Verify the actual boundary

Follow package manifests and lockfiles in a fresh isolated checkout. Inspect
existing dependency paths first: some worktrees use a shared `node_modules`
junction. Do not install into or otherwise mutate that shared dependency tree.

- Root: `npm run test`, `npm run typecheck`, `npm run build`; full `npm run check`.
- Read-only app typecheck: `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`.
  Also check `tsconfig.node.json` for Vite configuration. Bare root `tsc --noEmit`
  traverses no referenced project here (`files: []`); it is not app verification.
- Root Vitest selects `tests/**`. Module `spacetimedb/tests/**` needs the package's
  Node/tsx harness, plus its separate types/build checks.
- Auth bridge and release recovery have their own package scripts/dependencies.
  Root app types do not replace service or release-script verification.
- Verify selected file/test counts and exit codes. Label platform skips, overlays,
  fixtures, mocked SDK contexts and missing measurements; none is live owner play
  or physical-phone proof.
- Test delayed requests, stale responses, unknown outcomes and cleanup, not only
  instant mocks. Preserve scene/focus on healthy refresh without stale commands.
- Use `docs/evidence/0.4.0/performance.md`: emergency renderer ceilings and
  scene-graph counts are not measured acceptance budgets.

## Publication, operations and privacy

- Source sync is not deployment. Follow `docs/operations/0.4.0-development-sync.md`:
  review, secret scan, explicit non-forced branch push, verified remote SHA and
  honest draft status while incomplete. Respect current permission boundaries.
- Reverify hosting/account/immutable database targets with configured authorized
  access. Pages hosts the frontend; Cloudflare hosts auth; SpacetimeDB owns state.
  Login alone does not prove every application permission. Stop at actual denials.
- Windows/WSL is the local operating target; no Mac dependency. Required Actions/
  OIDC identity must come from a genuine authorized supported runner. Disposable
  verification receives no production credentials or private state.
- Keep credentials, raw identity proofs, real private FIDs/player records,
  sensitive receipts and authenticated dumps out of Git, public notes, diagnostic
  output and Desktop packages. Use synthetic/privacy-safe fixtures; approved
  public projections retain their explicit boundary. Reference restricted evidence
  without copying secret values.
- Recovery must preserve post-deployment writes. Do not reset/recreate G001 or
  call destructive old-snapshot restoration acceptable rollback.
- Read `ASSETS-LICENSE.md` and dated provenance before media changes. Retain exact-use
  and third-party terms; reused assets do not become newly Astra-authored.

## Handoff standard

Report changed behavior, source/paths, executed checks, limitations, remote sync
state and the next concrete requirement. Update the relevant evidence and routing
when adding a durable component. Do not create a competing release checklist.
Missing mandatory R01–R18 evidence means incomplete, not shipped.
