# Warpkeep 0.4 agent handoff — start here

Audited 2026-09-07 against local commit `1600f4b8950720709cd97fc7b86a1077ccbaf5bd`
and the explicitly identified working changes. This is an implementation and
release-readiness audit, not a new goal, an exhaustive security audit, or a claim
that 0.4 is live. Recheck Git, CI and provider state before acting on this snapshot.

## Read in this order

1. [Fixed release checklist](../../operations/0.4.0-release-checklist.md): R01–R18
   remain the completion contract. Old status cells are dated, not current proof.
2. [Repository map](repo-map.md): entry points, ownership, source versus generated
   output, legal/asset boundaries, and where to investigate each kind of problem.
3. [Gameplay and visuals audit](gameplay-and-visuals.md): implemented strengths,
   concrete integration findings, missing owner/device evidence and acceptance matrix.
4. [Release and infrastructure audit](release-and-infrastructure.md): working
   components versus disconnected callers, CI, hosting and actual access limits.
5. [Execution handoff](execution-handoff.md): safe working procedure, verification
   commands, fixed next sequence and work continued after this audit.

Continue the existing [Astra keep design](../../superpowers/specs/2026-09-06-warpkeep-astra-keep-design.md)
and [gameplay specification](../../superpowers/specs/2026-09-05-warpkeep-0.4-gameplay-design.md).
Reopen settled decisions only when implementation evidence reveals a material
problem; record the reason and impact. Do not restart design because an old plan
has unchecked boxes or a previous model authored the implementation.

## Current assessment

The strongest parts are the server-owned transition core, realm/capability
isolation, strict input validation, resource lifecycle controls and adversarial
tests. Retain these. The weakest part is end-to-end composition: working pieces
still lack operating release callers, genuinely authorized owner acceptance and
final measured visual/performance evidence. More helper code alone does not close
those gaps. Targeted integration fixes have higher value than a wholesale rewrite.

| Evidence level | Meaning here | Does not establish |
| --- | --- | --- |
| Source-inspected | Implementation or an explicit fail-closed stop exists | Runtime correctness or deployment |
| Locally verified | Named tests or a bounded probe passed on recorded inputs | Current full CI, real players or production identity |
| Fixture-rendered | Synthetic local scene was rendered/inspected | Actual-owner gameplay or physical-phone performance |
| Authenticated observation | Configured provider returned the named metadata | All application permissions or authorization for a different account |
| Release accepted | Exact final source/artifacts and every mandatory live result are linked | Nothing may silently substitute for a missing gate |

Fresh audit results: 26 root suites / 472 gameplay, client, auth and routing tests
passed, plus 7 G001 admission-freeze module tests. A separate Linux diagnostic
overlay passed 39 recovery-record/G001-adoption tests. These are targeted results,
not a full-tree pass. The [execution handoff](execution-handoff.md) records their
commands and source limitations.

At the audit snapshot, PR #228 was draft/BLOCKED at `c42f6e6`; its Linux job
failed and its database job was still running. The checkpoint backup branch was
`ac69ab1`; local `1600f4b` had not yet been pushed. Later synchronization must be
recorded explicitly. A source checkpoint is not PR integration or deployment.

## Boundaries that define this release

- **G001:** preserve the recorded live 0.3.43 gameplay, player access, timers,
  database and presentation. Freeze new admissions/access requests only. Capture
  a fresh baseline before production changes; normal player writes must continue.
- **G002:** deploy 0.4 sealed and accurately listed as closed. Admissions are TBD.
  Denied gameplay must produce zero unauthorized writes. Do not open it for tests.
- **PTR:** demonstrate the complete journey with the genuinely authorized owner
  in the isolated realm. No fabricated identity, admin-token substitution or
  synthetic journey may close this gate.
- **Gameplay:** four Workers, six buildings and existing progression/effects,
  exact retries/stale-state checks, one Builder, permanent placement. First economy
  building **and its improved return** must complete within ten minutes on actual
  atlas routes. Do not add unrelated mechanics, queues, combat or admissions.
- **Appearance:** finish The Verdant Citadel with a distinct 0.4 composition.
  Voxel, forest and Pelagic-inspired water are bounded presentation only, mobile
  friendly, never authority for terrain, resources, navigation or interaction.
  Preserve pre-existing asset attribution; do not relabel old media Astra-authored.
- **Operations:** local Windows/WSL production preparation/execution; no reliance
  on the Mac runner. Required Actions/OIDC identity must come from a genuine
  authorized supported runner, not workflow emulation.
- **Delivery:** complete required sources, then final family freeze, protected
  integration, deployment, live verification and credential-free Desktop package.
  Missing mandatory evidence means incomplete, not shipped.

## Audit coverage and limits

The audit inventoried tracked top-level areas and examined the main browser,
0.4 gameplay, G001 preservation, PTR/G002 schemas, auth bridge, recovery service,
release scripts/workflows, verification configuration, asset/provenance and
operations/design/evidence documentation. Three parallel read-only reviews
covered gameplay, presentation and release infrastructure; the main review
reconciled them and verified the interrupted recovery change.

It did not read every generated binding, binary asset or historical note line by
line, run all tests, play as the owner, re-audit every third-party dependency,
or perform production mutations. Private stores, credentials, raw player rows,
receipts and cache contents were not swept into these notes. Report concrete
findings as findings; report missing evidence as missing evidence, not a proven
runtime defect. Use this index to avoid both redoing completed work and treating
narrow historical successes as whole-release readiness.
