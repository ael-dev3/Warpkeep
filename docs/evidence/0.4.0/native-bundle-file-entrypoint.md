# Fixed native bundle-file entrypoint — 2026-09-07

Implemented `derivePreparedLinuxOperationBundleFiles()` in
`scripts/local-operation-bundle-runtime.mjs`. This zero-argument Linux API uses
the existing twice-built, isolated-load producer. Before source cleanup it reads
the four declaration blobs through the captured source's fixed Git boundary,
requiring exact 100644 tree records and nonempty bodies bounded to 64 KiB.
The existing serializer checks declarations against bundle exports and derives
the nine-file set. Captured declaration buffers are wiped after owned copies
are produced. The bundle-only API and metadata-only CLI remain unchanged.

The serializer is now part of the verified runtime control-source closure.
The source is rechecked before/after declaration reads and before cleanup.
No caller executor, source map, declaration override or credential is accepted
by the public operating API.

## Verification

- Four new orchestration tests failed before implementation, then passed.
- Focused runtime and bundle-file suites: 81 passed, two files, 35.33 seconds.
- `tsc -b`: exit 0.
- Independent bounded review: approved, no outstanding findings.
- Real fixed Linux entrypoint: exit 0, `native-files-derived-not-installed`.

Native captured commit: `5636561d8e72e431f78466a1da16093ecf9ad3a6`.
Native captured tree: `e57157f7085e571737876c0ee14778d7c5f860e4`.
Returned nine files: four bundle/declaration pairs plus the manifest.
The eight bundle/declaration hashes match the prior
`native-bundle-file-composition.md` diagnostic. The source-bound manifest is
62,752 bytes, SHA-256
`2d80bd80ffd63cb532db696a42006f6c18edea8cfc90627aec5cbbba5f704f9d`.

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localOperationBundleRuntime.test.ts tests/localPreparedBundleFiles.test.ts
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
wsl -d Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/native-operation-files-entrypoint.mjs
```

The ignored native diagnostic only imports the public zero-argument function and
prints file lengths and hashes; it does not supply source authority or install
outputs. The committed API is reusable without that diagnostic.

## Remaining scope

This closes the producer-owned declaration capture gap, not R12/R13. A complete
assembler still needs independently captured candidate identity, matching
all-realm binding/bundle identities, all consumer/workflow outputs, durable
installation and independent full-family/repeat-write verification. No release
candidate files were installed, production fence removed or service deployed.
