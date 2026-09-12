# Static preparation source composition — 2026-09-07

Working source based on `b734d68417d1c5625c957724a92496db7d193c03`.
The generated sealed-launch verifier now passes `verifySealedLaunchSources`
against actual repository sources on Linux. This is the static source gate,
not the CLI's authenticated checkout/history checks, full native assembler,
final frozen artifacts, or deployment authority.

## Corrections and derivation

The realm-choice check now requires the existing G002 `Sealed` display label.
The separate `admission: 'not-admitted'` check and no-request/no-connection
notices remain. Eleven existing realm-choice policy/UI tests pass.

Two package structural hashes are now derived from canonical bounded package
and lock JSON. Names, lock version 3, and matching supported release versions
are checked. The projection changes only package.version, lock.version, and
lock.packages[''].version to `<release-version>`, exactly as the existing verifier
does. All dependency versions and other fields remain hashed. No package files
are rewritten and no arbitrary caller hash is accepted.

Expanded tests first failed in five cases (output and malformed identities),
then passed after implementation. Independent review identified a minor oracle
gap; fixtures now explicitly retain unrelated `0.3.43` values in description
and a dependency version, with hand-specified expected projected objects.

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localPreparedSourcePins.test.ts
20 passed, 1 native symlink skip; 738 ms.

wsl -d Ubuntu-24.04 -- /tmp/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/release-journal-linux-check.mjs --source-pins
21 passed; 208 ms.

.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/realmChoicePolicy.test.ts tests/RealmChoiceSelector.test.tsx
11 passed; 2.93 s.
```

## Actual-source diagnostic

Pinned Linux Node runs `.superpowers/source-pin-verifier-probe.mjs`: it writes
the generated verifier to a fresh disposable directory and supplies current
source bytes with the generated generator/verifier outputs substituted.
The result is preparation, packageVersion 0.3.43, pagesDeploymentApproved false,
g001ReleaseVersion null, both G002/PTR database identities null, and
ptrPresentationEnabled false. No source check is skipped.

Four mutated copies fail at their expected independent boundaries:

| Mutation | Rejection |
| --- | --- |
| G002 gameplay keep public option | G002_PRIVATE_SCHEMA_INVALID |
| Additional G002 bootstrap export | G002_ROOT_ABI_INVALID |
| G002 display falsely says Admitted | REALM_CHOICE_POLICY_INVALID |
| G001 existing player access disabled | G001_POLICY_INVALID |

All rejection codes have the `SEALED_LAUNCH_` prefix.

## Combined closure composition

The bounded diagnostic `.superpowers/closure-candidate-probe.mjs` now substitutes
the inventory/count and source-pin outputs together before the real closure
generator hashes its inputs. No output collision or installation occurs.
Observed 1,077 members, 16,548,961 input bytes, manifest SHA-256
`20f6ff6a157eb6a4bb9bf31ad5f9d56c6689a843a8d9d794174809393bcfc710`.
Two runs return identical manifests and all three workflow bodies.

This combines nine derived source files but still lacks newly installed
bundle/binding families and remaining Task 7 consumers. Full-family independent
checking, durable installation, repeat-write convergence, protected integration,
live preservation/privacy/gameplay/performance and Desktop handoff remain open.
