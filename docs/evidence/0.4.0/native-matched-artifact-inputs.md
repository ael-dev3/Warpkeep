# Matched native binding and bundle inputs — 2026-09-07

The actual zero-argument `derivePreparedLinuxArtifactInputs()` coordinator
completed both fixed Linux producers and required matching profile, commit and
tree before returning their results. Exit 0:
`native-artifact-inputs-matched-not-installed`.

Captured commit: `d1717211e1b3cce93295d4be70f2665f3598b5cc`.
Captured tree: `5b709de4bcd318c61b91536f8638a8df7bcda7f3`.
Profile: `warpkeep-spacetime-binding-final-preparation-linux-x64-v1`.

| Result | Count | Bundle SHA-256 |
| --- | ---: | --- |
| G001 current zero-diff check | 180 bindings | 7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a |
| G002 returned bindings | 50 | 0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3 |
| PTR returned bindings | 25 | c5c2cc46d428e85c87352c341d1a5235a69336a960f566b0a91a484deba3ec4e |

Dependency closure digests, respectively:

- G001: `fcc9b32282ff947da96738a15735aa809919f9229e2861d9a53cb0c98acb6e62`.
- G002: `3135e65b47acf95b174adcf10d9453955afabde9f122382a0166b0a9d5bc26d5`.
- PTR: `acd9fe64d963d38715183a0451e6cc21b25abbfed5092c787d7e01842ab91901`.

The G001 compatibility branch also passed. Its baseline/frozen bundle and
descriptor hashes and six checked frozen writers match the recorded native
proof in `assembler-composition-preflight.md`. G001 returns metadata only,
not installable binding bytes.

The bundle producer returned all nine files. Its four bundles and four
declarations match the hashes in `native-bundle-file-composition.md`.
The source-bound manifest is 62,752 bytes, SHA-256
`9adf74e8718ed3985d9aec021204735193400bed88e2547a9480607c5f0bbfb1`.

## Commands and test scope

```text
wsl -d Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/native-release-artifact-inputs.mjs
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localReleaseArtifactInputs.test.ts tests/allRealmLocalBindingComposition.test.ts tests/localOperationBundleRuntime.test.ts tests/localPreparedBundleFiles.test.ts
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
```

The native diagnostic imports the committed public coordinator and prints only
metadata. It supplies no source identity, executors, credentials or file bodies.
The existing live process was observed to completion without a restart.
Focused tests at the captured commit: 93 passed, four files, 29.11 seconds.
Typecheck: exit 0. Nine coordinator tests failed before implementation and
passed afterward. Independent review found no Critical or Important issues;
its minor comment-precision correction is included with this record.

## Remaining requirements

This proves matching real producer inputs, not independently captured candidate
authority or complete artifact installation. R12/R13 still require all generated
consumer/workflow facts, durable candidate staging/installation, independent
whole-family checking and repeat-write convergence. The deployment closure
diagnostic separately remained repeat-equal at 1,077 members; it did not consume
these returned binding and bundle bytes or prove complete-family convergence.
No production mutation, admissions change, final freeze or deployment occurred.
