# Task 2 — B0 and Windows test-harness portability

## Status

Implemented and committed locally. No production workflow or policy file was
changed; no deployment, push, merge, or policy relaxation was performed.

## TDD evidence

The focused B0 regression was added before changing the generated-source
helper. The required red run was:

```powershell
npm test -- tests/authBridgeNotificationB0Workflow.test.ts --maxWorkers=1
```

It failed as intended at `renders a native selected Node path with forward
slashes in generated Bash only`: generated Bash still contained
`C:\\runner\\private\\node` and did not contain `C:/runner/private/node`.

That initial Windows run also established two pre-existing harness facts:

- direct `/usr/bin/env` and `/bin/bash` process entrypoints do not exist on
  this host, although Git-for-Windows provides `env.exe` and `bash.exe`;
- Git-for-Windows cannot represent this fixture's required POSIX permissions:
  after an explicit Git-Bash `chmod 700`, `stat -c %a` reported `755` for the
  copied Node executable. Node's Windows metadata reported the private test
  files as `0666`.

The brief's prescribed SpacetimeDB Vitest command could not start because
`spacetimedb` has no Vitest dependency. Its existing package convention is
`tsx --test`; that equivalent focused runner was used for the green check.

## Repair

- Added `bashPath()` and use it only when the immutable Node literal is
  injected into generated Bash source. Native paths remain the values supplied
  to filesystem and process APIs.
- Added the native-path regression proving generated Bash receives
  `C:/runner/private/node` and never retains the backslash form.
- Made the clean-runtime and private-runner positive fixtures create a private
  root in `tests/fixtures`, copy the active Node executable there, and assert
  the 0700 root and executable before replaying the existing leaf-to-root
  validation on POSIX hosts.
- Retained and strengthened rejection coverage: hard-linked Node,
  group-writable Node, and a group-writable intermediate ancestor all remain
  rejected with a pinned digest.
- Added a Windows-only Git-for-Windows launcher shim for test processes only.
  It does not alter the reviewed production shell literals.
- Added a narrowly documented `win32` skip only to replay cases whose subject
  is POSIX uid/gid/mode/ACL validation. These assertions cannot be faithfully
  exercised on NTFS/Git-Bash; generated-source, static-policy, and representable
  B0 negatives remain active on Windows.
- Normalized the G001 writer-key assertion with
  `relative(...).replaceAll(sep, '/')`, solely in the test assertion.

## Verification

Passed:

- Focused representable B0 suite:
  `npm test -- tests/authBridgeNotificationB0Workflow.test.ts --maxWorkers=1 -t "renders a native selected Node path|reports unavailable|is manual-only|loads only|rejects a forged|keeps all downstream|rejects both stale|always attempts|rejects both missing"`
  — 9 passed, 13 skipped.
- `pnpm --dir spacetimedb exec tsx --test tests/genesis001AccessFreeze.test.ts`
  — 7 passed.
- `npm run typecheck` — exit 0.
- `git diff --check` — clean.
- Production-boundary diff check:
  `git diff --numstat -- .github/workflows/notification-bridge-b0.yml scripts/verify-auth-bridge-notification-b0-policy.mjs`
  — no output; both audited files remain byte-identical.

Known unrelated Windows/baseline exceptions:

- The complete B0 test command now reaches the static workflow assertion and
  has one remaining failure: the Task7-owned stale boundary mismatch
  `AUTH_BRIDGE_NOTIFICATION_B0_WORKFLOW_STRUCTURE_INVALID` at
  `assertProtectedWorkflowExecutionBoundary(workflowSource)`. This task did
  not modify either audited production file and does not skip that assertion.
- The prescribed neighboring prepared-runtime/receipt command has 17 existing
  Windows failures caused by the same unsupported POSIX uid/mode assumptions
  (plus direct `/usr/bin/git` lookup). It reported 66 passed and 6 skipped;
  no Task 2 code is involved.
