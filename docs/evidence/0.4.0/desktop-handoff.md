# Warpkeep 0.4 credential-free workspace handoff

Status: **interim development handoff**. This document makes the current
source, setup and evidence routes reproducible without distributing credentials
or private player data. It is not a deployment attestation or a final release
package. The existing Desktop `Warpkeep - Full Project Handoff.md` remains a
reference; this tracked file is the compact delivery index. Its historical
filename is retained for link compatibility, not as a Desktop output instruction.

The owner's September 11 direction supersedes the former Desktop delivery
requirement. Keep routine notes in the repository and create the final package
only at `artifacts/delivery/0.4.0/` beneath the existing checkout, following the
[output and retention rules](../../engineering/development-workflow.md#output-locations-and-retention).
Do not create a new Desktop folder, handoff copy, backup or ZIP.

## Start here

- **Development branch:** `codex/prepared-keep-bindings-fix`
- **Review:** [PR #228](https://github.com/ael-dev3/Warpkeep/pull/228)
- **Product direction:** [`docs/design/warpkeep-direction.md`](../../design/warpkeep-direction.md)
- **Current agent index:** [`docs/agent-notes/0.4.0/README.md`](../../agent-notes/0.4.0/README.md)
- **Visual foundation:** [`visual-foundation-contract.md`](../../agent-notes/0.4.0/visual-foundation-contract.md)
- **Release gates:** [`0.4.0-release-checklist.md`](../../operations/0.4.0-release-checklist.md)

The current PR head and the last reviewed source checkpoint are authoritative;
do not copy a hash from this document into a deployment command. Re-read the
PR and the [execution handoff](../../agent-notes/0.4.0/execution-handoff.md)
before preparing a new artifact.

## Credential-free setup

Reuse a suitable existing independent checkout when reproducing the published
development source. The commands below are for first-time setup only, from a
workspace directory outside the Desktop/cloud sync. Do not create another clone
for routine verification or run installation into the shared Windows dependency
junction.

```powershell
git clone --branch codex/prepared-keep-bindings-fix https://github.com/ael-dev3/Warpkeep.git
Set-Location Warpkeep
node --version       # Node 22.13+ within the Node 22 line
npm --version        # npm 10.9.8 is the repository package-manager contract
npm ci
npm run dev
```

Open the Vite origin printed by the dev server. The bounded visual fixture is:

```text
/dev/keep04-qa.html?scenario=all-six-level-five&quality=high
```

The fixture proves composition and interaction plumbing only. It does not
connect an owner, authenticate a player, prove mobile frame pacing or establish
production acceptance.

## Safe verification routes

Run the focused Keep04 evidence when changing the keep surface:

```powershell
& .\node_modules\.bin\vitest.cmd run `
  tests/Keep04Screen.test.tsx `
  tests/Keep04Benefits.test.tsx `
  tests/Keep04PlacementUi.test.tsx `
  tests/Keep04Accessibility.test.tsx `
  tests/Keep04SceneHost.test.tsx `
  tests/keep04Scene.test.ts `
  tests/keep04VisualProfile.test.ts `
  tests/keep04Buildings.test.ts `
  --maxWorkers=1
```

For release engineering, follow the dated evidence rather than improvising a
provider command:

- [`integration.md`](integration.md) — PR and CI acceptance.
- [`local-operations.md`](local-operations.md) — Windows/WSL operating state.
- [`release-engineering.md`](release-engineering.md) — assembled workflow rails.
- [`local-release-closure-family.md`](local-release-closure-family.md) — source-family and closure proof.
- [`release-freeze.md`](release-freeze.md) — final artifact-family freeze requirements.
- [`recovery.md`](recovery.md) — recovery requirements and limits.
- [`deployment-attestation-install.md`](deployment-attestation-install.md) —
  credential-free installation and attestation boundaries.

Local green tests are evidence for their tested surface only. Hosted CI,
authenticated owner play, physical-device measurements and provider state must
be recorded separately.

## Realm and authority boundaries

| Realm | 0.4 rule |
| --- | --- |
| Genesis 001 | Preserve existing players, state and timers; keep the agreed admission freeze. Never reset or recreate it. |
| Genesis 002 | Keep sealed and accurately listed as closed; future admissions remain undecided. |
| Owner PTR | Use the genuine isolated owner route for the playable gather → choose → build → benefit → return journey. |

Cloudflare identity, SpacetimeDB persistence, generated bindings and release
callers each have separate evidence. A successful CLI login, schema read or
synthetic fixture does not prove owner admission or production authority.

## Package contents and exclusions

A final workspace package may contain this index, the exact reviewed source
manifest, reproducible commands, architecture notes, release/recovery results,
asset credits and a file/hash manifest. It must exclude:

- provider tokens, Wrangler profiles, signing keys and JWT material;
- `.env` files, private operation bundles and credential caches;
- player rows, FIDs, raw receipts and private baseline exports;
- disposable `node_modules`, intermediate build output, screenshots without provenance and
  unreviewed generated artifacts.

Include the actual verified distributable needed to use the release; link
reproducible source through its reviewed Git commit instead of copying every
checkout. Update the same delivery location after verifying its replacement.

The package must state the source commit, tool versions, evidence dates and
limitations. A historical artifact or a local emulation is not a rollback
package and cannot substitute for a fresh deployment attestation.

## Current acceptance boundary

The 0.4 visual foundation is implemented and reviewed through synthetic empty,
mature, placement, construction, completion and fallback states. Mobile layout,
safe-area spacing, touch targets, reduced motion, pending-resource semantics, the
accessible Worker Outbound → Gathering → Returning rail and the schematic fallback
are source-level behavior. The Worker rail is presentation-only; server phase,
captured yield, return credit and command authority remain authoritative.

The release remains incomplete until the mandatory checklist records the real
owner PTR journey, measured device performance, final artifact-family
execution, G001 preservation, sealed G002 denial, deployment, recovery and
post-deployment verification. Keep this document as the reproducible package
index; update it only when those results are actually observed.
