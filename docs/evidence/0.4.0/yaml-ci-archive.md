# Offline YAML archive CI repair — 2026-09-07

Verify run `34063307183`, job `101567597735`, reported three YAML-test failures.
The decisive evidence was ENOENT for `.git/yaml-2.9.0.tgz`; the generator correctly
rejected its missing fixed input as `LOCAL_BINDING_YAML_ARCHIVE_INVALID`.
The archive existed only in the developer checkout, not in a fresh CI checkout.

The Linux workflow now prepares the exact public npm archive before tests:
fixed HTTPS URL from the lockfile, no redirect following, 30-second transfer
limit, 112,086-byte limit and exact length, and the generator's existing SHA-256
`008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91`.
An existing destination is rejected. The generator still independently checks
length, SHA-256 and SHA-512 SRI before TAR parsing. No pins or generated manifest
bytes changed; this is input provisioning, not a final release refreeze.

Generator positive tests now copy their generator, manifest and archive into
owned disposable fixtures. `--write` verifies byte-for-byte output convergence
there and preserves the working checkout's manifest. Subprocesses have a
10-second timeout and 1 MiB output bound. Malformed archive and TAR tests remain.

Fresh Windows verification using pinned Node 22.22.3:

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingYamlManifest.test.ts tests/workflowSecurity.test.ts tests/sealedRealmsProductionWorkflow.test.ts
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
```

30 tests passed across three files, 3.64 seconds; typecheck exited zero.
An independent owned Linux fixture parsed the edited workflow and executed its
exact preparation shell step in a fresh directory. Download and checksum passed;
the same four YAML tests then passed offline in 424 ms. Its private cache and
temporary source directory were removed; shared dependencies were not modified.
This verifies the executable shell step locally, not GitHub workflow identity or
hosted CI completion. Other release blockers remain open.
