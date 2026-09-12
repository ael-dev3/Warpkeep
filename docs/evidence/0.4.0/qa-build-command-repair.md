# QA build-command repair — 2026-09-07

Base: `89276da1244298906c59ac5ba507902dfa1775ae`.

The QA command allowlist retained the build command preceding `ab2c3fe`,
which added the offline voxel dressing generator's `--check` step. The real
contract verifier therefore rejected the committed package before running lanes.
The focused test reproduced that rejection before this repair.

Reviewed the generator: `--check` computes the bounded plans and compares the
fixed generated file without writing it. The allowlist now includes that exact
prefix; all remaining build commands and exact equality enforcement are unchanged.
Tests reject removing the check, changing it to generation/write mode, appending
a publishing command, and the existing root/bridge/SpacetimeDB script mutations.

Verification: Windows focused contract test passed; root TypeScript passed;
voxel generator `--check` passed. Full native Ubuntu 24.04 QA suite in a disposable
source archive with these two files overlaid: 21 passed, 1 skipped. Windows full
QA suite still has seven other platform-sensitive failures; this change does not
claim to repair them or establish end-to-end Windows/WSL production operations.

Commands: `node node_modules/vitest/vitest.mjs run tests/qaAgent.test.ts`
(Windows focused run adds `-t "refuses a mutable package-script"`),
`node node_modules/typescript/bin/tsc -b`, and
`node node_modules/tsx/dist/cli.mjs scripts/generate-keep04-voxel-dressing.ts --check`.

Separate review was requested but did not execute because the reviewer reported
a usage limit. No independent review approval is claimed. This remains a
development-branch checkpoint, not release integration or deployment evidence.
