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
