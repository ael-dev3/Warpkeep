# Assembler source-pin dependency audit — 2026-09-07

Inspected source commit `8dcb5052370683bb6165bfba0d353470286f1c96`.
This is read-only diagnostic evidence, not a refreeze or source approval.

The real preparation command:

```text
.git/ci-node-22.22.3/node.exe scripts/verify-0.4.0-sealed-launch.mjs --phase=preparation
exit 1: SEALED_LAUNCH_G001_ADMISSION_MONITOR_CURRENT_STATE_INVALID
```

Compared seven explicit whole-source SHA-256 constants in
`scripts/verify-0.4.0-sealed-launch.mjs` with both `git show HEAD:<path>`
bytes and current local file bytes. The two sources below have stale pins;
their committed and local digests are identical, excluding checkout newline
conversion as the cause of these two mismatches.

| Source | Recorded pin | Actual SHA-256 |
| --- | --- | --- |
| scripts/genesis001-admission-monitor-current-state.mjs | 10c8286a38ac81a5672280dcede60f712a95bc78af2f263e3ee8cc40d4afd5ac | 50776faaeb1ccd0c7357e6058ed90ac5a4ad5ad043444126089bdd45d1fd4560 |
| scripts/generate-0.4.0-sealed-launch-activation.mjs | be5fc56e7fc232b186b5446fc1ac4b71130e1385a0e0783421f9cfa2b6e247df | 5ae40f565d47981699ab4aa71811a7060140594594cdf85ad254041dc9818237 |

The source-authority implementation/declaration, production bootstrap,
policy-observation receipt implementation, and sealed-launch adoption
implementation all match their five existing pins in both views.

## Dependency consequence

The assembler must derive source pins from its captured candidate, not replace
every hexadecimal constant or import these observed hashes as authority.
Bootstrap source must precede its activation-generator pin; the resulting
activation-generator bytes must precede the verifier's generator-source pin.
The bootstrap finalization pin hashes only the existing named function slice,
not the entire file. Preserve that established projection when deriving it.
These generated consumer bytes must be supplied before final closure hashing.

Historical freeze commit, publication/policy receipts, baseline ABI, database
identity and release nonce are not generated source hashes. This audit does
not authorize changing them. It does not prove all other verifier gates pass:
the actual command stops at the first current-state failure.

Next implementation: extend internal source derivation for the explicitly
named source-pin positions and finalization slice, with missing/duplicate-slot,
byte-preservation and dependency-order tests. Integrate this before complete
closure generation; leave installation and release authority to the complete
native transaction. Full-family convergence remains unproved.

## Source-pin derivation implementation

`scripts/local-prepared-source-pins.mjs` implements that internal two-file
subset. It reads only fixed source paths with the existing bounded reader,
rejects invalid UTF-8 and noncanonical/duplicate/missing pin declarations,
derives the generator bootstrap pin first, then the seven verifier source pins
and exact finalization slice. It returns bytes without installing them, accepts
no source map or hash override, and leaves historical constants untouched.

Test-first evidence: with the explicit rejecting API stub, the positive
dependency-order test failed and eight rejection cases passed. After implementation
and additional file/newline tests: Windows 12 passed, 1 native symlink skip;
native Linux 13 passed (142 ms); pinned TypeScript build exited 0.

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localPreparedSourcePins.test.ts
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
wsl -d Ubuntu-24.04 -- /tmp/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/release-journal-linux-check.mjs --source-pins
```

Real source derivation at the audited baseline plus this helper returned:

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| activation generator | 44946 | 5ae40f565d47981699ab4aa71811a7060140594594cdf85ad254041dc9818237 |
| sealed-launch verifier | 189301 | a89be31e2f7a091f69f07e4ae0224a91915e3c5cf6d6f9955169f069896c8306 |

The generator remains unchanged because its bootstrap pin was already correct.
A disposable diagnostic loaded the returned verifier and supplied real current
source files plus both generated outputs to `verifySealedLaunchSources`.
On Windows it stops at the observation-envelope check (which invokes `/bin/sh`).
On Linux it passes that check and stops at `SEALED_LAUNCH_G002_ROOT_ABI_INVALID`.
Reproduce with pinned Linux Node running the ignored
`.superpowers/source-pin-verifier-probe.mjs`. This executes static source
verification only, not authenticated checkout/history or deployment verification.

No production or frozen artifact files were replaced. The G002 ABI failure,
remaining generated consumer/test pins, whole-family transaction and convergence
remain required. The source helper is not the complete release assembler.

The next failure is concrete: `verifyGenesis002RootAbiSource` still expects
only lifecycle and atlas-import exports. The committed G002 root additionally
registers the existing six gameplay operations and their explicit canonical
names. This is an outdated ABI expectation, not a hash slot. It requires a
separate bounded verifier correction against the approved gameplay ABI and
closed-admission checks; source-pin generation must not silently rewrite it.

## Inline G002/PTR source pins

After the separately reviewed ABI correction (`f9c5ef8`), the source-pin
transformer now covers the 26 existing inline hash slots over 24 fixed source
paths. Auth-bridge JWT and application source each appear twice. It requires
the exact total and per-key occurrence counts and derives every digest from
bounded fixed-path reads. Only digest bytes change; source lookup expressions,
security checks, historical evidence, and unrelated source text stay intact.

The expanded tests first failed in five cases: expected replacement output and
missing/extra/unknown/expression slot rejection. With the implementation:
Windows 16 passed and 1 native-symlink skip (1.23 s); native Linux 17 passed
(186 ms); pinned TypeScript build exit 0. The earlier commands reproduce these
checks, with the same `--source-pins` Linux helper flag.

The actual Linux generated-verifier diagnostic now stops at
`SEALED_LAUNCH_G002_PRIVATE_SCHEMA_INVALID`, beyond the prior G002 source-hash
boundary. The current verifier still requires 23 private tables and forbids
`ScheduleV1`; the approved module has 30 tables including seven private gameplay
tables and its gameplay scheduler. This needs a separate exact privacy/schema
expectation correction, not removal of privacy checks. Full static preparation,
native assembly and live evidence remain incomplete.
