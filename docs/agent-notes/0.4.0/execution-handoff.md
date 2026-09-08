# Continue Warpkeep 0.4

Refreshed 2026-09-08 (Europe/Budapest), after documentation merge `5b97c5f` and
published development checkpoint `0a2f6f9`. The original `781e51e` inspection
remains historical evidence. The source work in this revision adds complete
Linux preparation and the V2 generation/receipt path; read Git and the dated
evidence for its subsequent publication and actual native execution results.
Read the [handoff index](README.md) for product intent and the
[infrastructure audit](release-and-infrastructure.md) for dated provider/CI facts.
The owner requested the GitHub/profile/repository refresh before game shipping.

## Resume from the actual development checkout

The primary branch is `codex/prepared-keep-bindings-fix`. On the owner's current
Windows machine its working directory is
`C:/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree`.
The GitHub remote is **`upstream`**. The development branch now tracks
`upstream/codex/prepared-keep-bindings-fix`. `origin` points to a local temporary
baseline repository; comparisons with that remote are not GitHub synchronization
evidence.

Fetch and compare actual refs before editing. Preserve existing changes. The
checkout has contained widespread line-ending/stat noise, private or disposable
probes, and concurrent work. Inspect its current state rather than treating that
historical dirty status as unfinished source. Use explicit
paths and inspect real diffs; never stage everything or normalize this checkout
as a convenience. Git's Windows view of Linux worktree paths is not permission
to prune them.

The root `node_modules` is a shared junction. Install dependencies only in an
independent clone or verification worktree. Root tooling expects Node `22.22.3`
and npm `10.9.8`; this machine's default Node/npm differ. Read the actual package
scripts and engines in each service before invoking them.

See [source synchronization](../../operations/0.4.0-development-sync.md) for the
complete fetch, review, scan, non-forced push, and remote verification procedure.
Development checkpoints may be published while the release remains unfinished.

## What changed during this handoff

- The current product/architecture/source maps, agent guidance, contribution
  workflow, public intake, and repository roles were rewritten around 0.4.
  Public descriptions avoid arbitrary asset/player counts and unsupported claims.
- Independent review of the previously unpublished `c42f6e6..781e51e` range found
  no critical publication or privacy regression. Gitleaks `8.30.1`, using the
  repository configuration and that exact range, passed. This is source review,
  not approval for production activation.
- GitHub reads work. Configured Cloudflare reads reach the owning production
  account, and SpacetimeDB metadata lists existing G001/G002/PTR databases.
  The previous session's socket and WSL access denials are historical.
- Healthy refresh retains the existing keep scene, assets, and focus (`555e505`).
  Active PTR now also renews at hard expiry (`c990a3b`) through fresh scoped
  authorization, reconnect and preflight, with no automatic command replay. See the
  [local continuation evidence](../../evidence/0.4.0/isolation-lifecycle.md).
  Actual owner journey and integrated live acceptance remain open.
- The Linux `deploy-recovery` Pages caller is implemented at `c51bb00`, including
  build, attestation, exact artifact, claim, fresh deployment boundary and mandatory
  postflight. The [release engineering record](../../evidence/0.4.0/release-engineering.md)
  records local composition checks; runner/private-state provisioning, tracked
  generated bundle/manifest installation, final source-family preparation and
  live authorization acceptance remain separate work.
- Existing PR CodeQL annotations were reviewed against current source. They
  concern unchanged test fixtures and test helpers; no attacker-controlled
  production path was found in that review. Required checks still need legitimate
  triage and passing results; nothing was disabled or dismissed by this audit.
- A Windows-only issue-form test incorrectly split filesystem paths on `/`.
  Use `node:path`'s `basename` without changing the expected form names or privacy
  assertions. Linux-only filesystem cases in the license suite must still run on
  Linux; do not remove those cases to manufacture a Windows pass.

The [refresh verification record](../../evidence/0.4.0/documentation-refresh.md)
records successful native Linux documentation/license and focused component
checks, including the platform limitations found in the first Windows run.
The previously unpublished source through `781e51e` and the documentation/service
entry-point refresh through `4912ff5` were pushed with GitHub ref equality verified.
The protected main refresh is tracked separately in
[PR #230](https://github.com/ael-dev3/Warpkeep/pull/230), merged after all required
checks passed into main `9eb98e78bc975e29ced16d92c2060ab833ad9b46`. The local main
study checkout was fast-forwarded and verified equal to GitHub. The profile,
project catalog and descriptions were
refreshed, and the asset collection guide merged through
[Assets PR #32](https://github.com/ael-dev3/Warpkeep-Assets/pull/32). The water and
private authoring repositories accurately describe their planned roles.
Continue publishing reviewed source through the same procedure; none of these
source/documentation updates establishes that 0.4 is deployed.

The documentation reconciliation merged development `c51bb00` and protected
main `9eb98e7` into `5b97c5f`. Subsequent PTR scope and workflow test fixes were
published at `0a2f6f9039c78b505472ddb14b0cec6923945390`; local and GitHub refs matched
with no divergence. The outgoing two-commit secret scan passed. This records a
publication checkpoint, not the state of later working changes.

## Complete source preparation and remaining activation work

Use the [operating assembler runbook](../../operations/0.4.0-local-release-preparation.md).
The fixed CLI accepts `prepare`, `check` and `recover`; it does not accept an
arbitrary source, compiler or deployment callback. A retained candidate includes
the complete generated family, a native recovery journal and independent source
and candidate byte checks. `check` regenerates expected files from fresh source.
Recovery keeps the lease while restoring prior bytes and archiving completion
metadata, including after a killed process resumes.

The scanner derives its installed file inventory from lock-authenticated archives.
The bundle engine validates the actual closed reachable graph and required
authority modules instead of a stale stored member count. The V2 generator is
separate from the legacy generator's generated pins, resolving their compiler
dependency cycle. Its private receipt allows uncertainty reconciliation without
repeating provider calls or generation. The actual authenticated canonical
candidate/provider adapter remains missing; prepared source does not provide
those live facts.

Verify run `34170072520` at `5b97c5f` completed with a failed aggregate check:
root Linux reported 68 failures, 8,864 passes and 76 skips. Recovery,
native-contract and auth-bridge passed; the module job was cancelled. The three
workflow-layout failures were repaired and their focused suite passed at
`0a2f6f9`; source-pin/closure and obsolete activation-fixture failures motivated
the current complete-family and generator work. Recheck CI at the new exact
source. Do not label this earlier run green or infer skipped build results.

The [earlier execution record](https://github.com/ael-dev3/Warpkeep/blob/781e51e364d1e5a7319ca2364744c8730e83b0d6/docs/agent-notes/0.4.0/execution-handoff.md)
preserves historical test commands and exact limitations. Later evidence must
identify its own source, overlays, environment, and results.

## Local project inventory

| Area | Role and treatment |
| --- | --- |
| Primary 0.4 worktree | Active development and authoritative local progress; preserve concurrent edits. |
| Existing delivery worktree and current-session study clone | Clean snapshots of the public `main` baseline at inspection; these do not contain current 0.4 work. |
| Older `pl/Warpkeep` checkout | Earlier feature work. Its divergent change was patch-equivalent to work already represented in the current source; preserve the checkout and recheck before reuse. |
| Independent verification checkouts | Disposable installations and test output with exact source records. Do not confuse an overlay test with committed release evidence. |
| Registered WSL release-preparation sources | Generated/diagnostic candidate sources. Windows may report their Linux paths as prunable; inspect in their owning environment before any cleanup. |
| `.superpowers` probes, `artifacts/`, Python caches | Local investigations or generated output. Inspect relevant work, keep private data private, and stage only intended public source or sanitized evidence. |
| `docs/superpowers/` and dated evidence | Design/implementation history. Update current owners and link useful records; unchecked old plans do not restart the project. |
| Desktop handoff | Local continuation aid. Keep source/status accurate and credentials out; the final 0.4 delivery package still requires release acceptance. |

The inventory inspected project-related directories and Git/worktree metadata.
An older temporary verification checkout was owned by another account and Git
refused inspection; its current state remains unverified. No ownership override,
cleanup, private-store extraction, or production mutation was used for this study.

## Next useful work after the public refresh

1. **Finish a believable owner journey.** Trace real bindings, provider,
   controller, module, and keep UI. Verify the implemented active-session renewal
   with the actual owner, including foreground resume and uncertain command
   outcomes. Verify the first useful building and its improved return on
   actual routes. Evaluate clarity, pacing, and reasons to return as well as rules.
2. **Improve the rendered Verdant Citadel.** Use actual 0.4 scene ownership,
   especially Greater Realm water. Cover placement, construction, completion,
   loading/failure, reduced motion/quality, and mobile interaction. Preserve the
   [placement-readiness correction](../../evidence/0.4.0/placement-readiness-copy.md)
   already implemented in `fd8b146`. Distinguish fixture screenshots,
   emulation, physical devices, and real owner evidence.
3. **Connect local delivery and recovery.** Complete existing missing operating
   callers, authenticated inputs, existing-database reconciliation, and supported
   Windows/WSL/Linux execution. Native CI runs Linux; production workflows still
   contain Mac-specific dependencies. Helper tests do not establish a working
   release pipeline.

   The recovery Pages caller is composed in `deploy-pages.yml` at `c51bb00` and
   validated against the real source-evidence contract. Its supported Linux runner
   and private account/state remain unprovisioned; installation of the tracked
   generated bundle/manifest, final source family and live authorization acceptance
   remain outstanding. Follow the
   [dated operating gaps](../../evidence/0.4.0/release-engineering.md); do not
   reimplement the caller or treat local WSL identity as workflow evidence.
4. **Prove preservation and recovery before production effects.** Capture a
   fresh G001 baseline, preserve later writes, test isolated compatible recovery,
   and verify sealed G002 denial and owner-only PTR isolation.
5. **Settle source, derive the artifact family, integrate, deploy, and inspect.**
   Generate pins/bindings/closure through their real tools, run required checks,
   and use repository protections. Link live results to exact deployed artifacts.
   Complete the credential-free Desktop package after the actual release result.

Improve mechanics or architecture when evidence shows a better route to the
owner's goal. Record the decision and update its real consumers. Preserve player
state and authority boundaries without adding arbitrary process or scope rules.

## Verification reminders

- Root `tsc --noEmit` does not traverse the referenced projects. Use
  `npm run typecheck`, or explicitly check `tsconfig.app.json` and
  `tsconfig.node.json`; the latter covers Vite configuration only.
- Root Vitest selects `tests/**`. SpacetimeDB, auth bridge, and recovery packages
  have their own checks. Verify actual selection and process exit status.
- `npm run check` includes more than Vite build. Use the complete required
  pipeline on a stable candidate; retain targeted diagnostics with honest scope.
- Keep default assertions and budgets. Reproduce timing/platform failures in
  an appropriate isolated environment instead of hiding them.
- Record live evidence privately where required, with a sanitized public result.
  A successful upload, draft PR, local fixture, or source sync is not deployment.
