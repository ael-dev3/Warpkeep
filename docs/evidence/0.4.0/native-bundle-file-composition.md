# Native bundle/declaration/manifest composition — 2026-09-07

The real fixed Linux operation-bundle producer and the accepted bundle-file
serializer completed together. No generated files were installed or committed.

Captured source: `ba6dcf6a2ee2eb2594fbd0a8c9a6cf059d93950d`.
Captured tree: `d9b4cad751062179fac473d06c4866c7aeafdf2e`.
The producer performed two builds and actual isolated loading per lane. Its
result was supplied to `derivePreparedOperationBundleFiles` with declarations
read from that exact commit's Git blobs, not the mutable working tree.
The diagnostic checked each declaration's exact 100644 tree entry and bounded
blob size, and verified the captured commit resolves to the returned tree.

Two serializer invocations returned identical bytes for all nine files:

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| activation declaration | 850 | 23ed46c4a5b0313e5f3a1217c0dfb9a11ac68430933f03c77c4c6e7d2f7cc8d5 |
| activation bundle | 143788 | 957f4123cc368ac3c57c48d54560055895e6612df7320dabe53b5501c0acae5b |
| bundle manifest | 62752 | f478a1c6032b671c0f7a8626550d51931c1ae42d0a099a6a2029552529008e8b |
| G001 declaration | 809 | 0d245b2c4754d30d379b5ef7d304b6906e3f4c94eb0851b8493751b47ace1dbc |
| G001 bundle | 117977 | c6e56b3114bfead0c0f67ba5e4bc04b6af3679d80585969df594658b933b5a63 |
| G002 declaration | 778 | 076d38dbd53fb91800fe1ab4bbddefc4662e453da59a1f4b7afbd165eb0d3e58 |
| G002 bundle | 482695 | 7d5686f44ab8ec4f07947f75709dd77f72f42ac343d6277376808ad1d3b051e2 |
| PTR declaration | 823 | 195d9e51d21a204e25cc35f9ed0f04b733cd22f2b98c502a0d8c497ad661bca9 |
| PTR bundle | 483730 | dd0529b3bc58b9a276cb24664a49c8759d22462ac0b3a9a7101a82062c828724 |

All outputs use the fixed scripts/sealed-realms-production naming namespace.
No alternate compiler, caller executor, package path, or production credentials
were passed into the fixed producer.

```text
wsl -d Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/operation-files-probe.mjs
exit 0: built-loaded-composed-not-installed; repeatEqual true.

.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localPreparedBundleFiles.test.ts tests/localOperationBundleRuntime.test.ts
77 passed in 2 files; 29.04 s; exit 0.
```

The ignored diagnostic exports only metadata to stdout and clears copied
declaration buffers. It is not the production assembler or authenticated
installation authority. The actual producer's temporary source is cleaned on
success, so the eventual assembler must preserve the immutable source identity
when combining binding, bundle, declaration and consumer outputs. Reading
declarations from the later mutable checkout would mix sources and is invalid.

The checked-in bundle manifest remains absent and the production workflow
retains its Task 7 stop condition. Complete candidate capture, all-realm result
identity matching, exact full-family derivation, native durable installation,
independent checking and repeat-write convergence remain required.
