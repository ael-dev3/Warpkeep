# Windows source observer: Linux CI fixture repair — 2026-09-07

Hosted Verify run `34063307183`, Linux job `101567597735`, source
`78a0a7a7c3a48807e31111dfd56dd6fd1c49a6d5`, completed its test step unsuccessfully:
18 files failed, 533 passed, one skipped; 141 tests failed, 7,357 passed,
85 skipped. This is an older checkpoint, not the result for the latest branch.
The job log was obtained through the authenticated job logs API while its
separate SpacetimeDB job was still running; no job was restarted.

One setup failure was exact: `spawnSync C:/Program Files/Git/cmd/git.exe ENOENT`
in `tests/keep04WindowsSource.test.ts:19`. The fixture now uses native Git while
asserting that the production observer still requests its fixed Windows path.
No test was skipped or converted to fabricated Git output. Real temporary Git
repositories continue testing binary CRLF, text conversions and substantive edits.

The first genuine Linux execution then exposed an unhandled stdin `EPIPE` in
`boundedExec`: all 12 assertions passed but Vitest correctly exited one for the
unhandled error. A deterministic input-pipe regression reproduced the uncaught
error and unresolved query before the production correction. The helper now
rejects input errors with a fixed message and code, and closes empty input without
writing an empty chunk. It does not return source evidence on that rejection.
Existing executable, timeout, output bounds and environment remain unchanged.

Fresh verification with pinned Node 22.22.3:

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/keep04WindowsSource.test.ts
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/keep04WindowsCapture.test.ts tests/keep04CaptureOutput.test.ts
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
```

Windows source suite: 13 passed, 2.55 seconds. Related capture suites: 71 passed,
832 ms. Typecheck exited zero. An owned WSL Linux source fixture, using existing
read-only dependencies and a private Vite cache, ran the same source suite:
13 passed, 411 ms, zero unhandled errors or skips. The fixture was removed;
shared dependencies were not installed or modified.

Other CI failures remain unresolved. In particular the sealed-launch verifier
reported the G001 admission-monitor current-source mismatch before many later
assertions could run. Do not weaken that check, count those later checks as
exercised, or claim complete release-family verification from this repair.
