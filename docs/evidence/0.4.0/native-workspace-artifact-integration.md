# Native workspace and artifact integration — 2026-09-07

The actual fixed Linux workspace capture and artifact-input coordinator ran
together successfully, exit 0, `matched-workspace-artifacts-not-installed`.

- Source commit: `28a91376e588ea7499df186a06ba79aa170f266b`.
- Source tree: `90516fa3eebc8a3c2bc1ac2a8188f4b1c45a7fea`.
- Independently captured workspace profile, commit and tree matched the real
  binding and bundle producer results exactly.
- Workspace source-integrity and candidate-clean checks passed before and after
  production of the artifacts. The candidate lock remained held throughout.
- G001: 180 generated bindings passed the current-source zero-diff proof;
  compatibility checked all six frozen admission writers.
- G002: 50 generated binding files. PTR: 25 generated binding files.
- Four real bundle/declaration pairs and their manifest were returned in memory.
  No generated files were installed into the candidate or editable checkout.
- The lock was released after completion. Private source/candidate checkouts
  were retained; no cleanup or production mutation was performed.

The G001 bundle and dependency-closure digests were respectively
`7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a` and
`fcc9b32282ff947da96738a15735aa809919f9229e2861d9a53cb0c98acb6e62`.
The bundle manifest was 62,752 bytes with SHA-256
`a528b7c4376cf60089d5bf706028e2e1116a5a2a19d827b408e522b6fb57ae80`.
All eight bundle/declaration body hashes matched the earlier native producer
record; the manifest binds this run's different captured source identity.

## Reproduction and limits

```text
wsl -d Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/native-workspace-artifact-inputs.mjs
```

This uses an ignored local diagnostic, not a shipped assembler entrypoint.
It imports the fixed workspace and producer APIs without caller-provided source
identity or artifact bytes. It compares all three identity fields and rechecks
the candidate, then releases the lock in `finally`. Session 66713 completed;
silent observation intervals did not restart the run.

This closes the real composition feasibility check, not Task 7. Complete output
derivation, journaled installation/recovery, independent final checks and full
repeat-run convergence remain required. G001 production preservation, owner PTR
gameplay, deployment and final release acceptance are not established here.
