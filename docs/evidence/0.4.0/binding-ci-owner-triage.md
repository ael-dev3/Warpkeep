# Binding CI ownership triage — 2026-09-07

Source inspected: `3ddfb48d66887cde4906926f63fe22933ee8cb9b`.
Failure evidence: Verify `34063307183`, Linux job `101567597735`, older
source `78a0a7a7c3a48807e31111dfd56dd6fd1c49a6d5`. This is diagnosis,
not a claim of fixed runtime tests or successful release preparation.

Three observed early boundaries:

| Test family | Observed rejection | Source boundary |
| --- | --- | --- |
| `localBindingRuntime.test.ts`, checked handoff | `LOCAL_BINDING_WORKER_HANDOFF_INVALID`, caused by `LOCAL_BINDING_BOUNDED_FILE_CHANGED` | `writeCheckedLocalBindingHandoff` copies a real fixture file with `expectedUid: 1000` on Linux |
| `localBindingRuntimeLifecycle.test.ts`, public entrypoint | `LOCAL_BINDING_WORKER_EXECUTABLE_INVALID` | `attestRuntimeExecutables` checks the CLI directory owner, mode, containment and identity before builders run |
| `localBindingRuntimeParent.test.ts`, CLI snapshot binding | `LOCAL_BINDING_RUNTIME_CLI_SNAPSHOT_INVALID` | `verifyDirectory(operationRoot)` requires UID 1000 and mode 0700 before copying executables |

The two controlled parent/lifecycle fixtures already translate production paths
or provide fake compiler boundaries. Their filesystem-stat adapters normalize
ownership to UID 1000 only on Windows. On Linux they expose the ambient fixture
owner instead. Production remains intentionally fixed to the approved local
UID 1000 runtime; the CI workflow runs the ordinary suite directly under the
hosted runner account. The inspected job output does not print its numeric UID,
so a hosted UID mismatch is a strongly supported hypothesis, not a directly
measured UID. The local WSL account was freshly measured with `id -u`: 1000.

Next diagnostic must reproduce the parent and lifecycle failures with controlled
non-1000 fixture ownership metadata, then show that representing the intended
fixture owner reaches their actual behavior assertions. Keep real Linux modes,
inode/link/digest checks and explicit hostile-owner scenarios intact. Do not
normalize all metadata indiscriminately, change production UID checks, run the
suite privileged, or label mocked metadata as native ownership verification.

The standalone checked-handoff test needs its own treatment: it uses real files
without those adapters. Do not assume a repair to the controlled lifecycle
fixtures fixes that native boundary. Other recorded failures (YAML manifest,
frozen source pins, source graph coverage and compiler cleanup) remain separate
until their full causes are inspected. Failure counts do not establish that
every failed assertion shares this cause.

## Parent fixture reproduction and correction

On September 7, an owned Linux copy of the current parent test was instrumented
only at its existing stat adapter to present UID 1001 before normalization.
No filesystem owner or system account was changed. At 00:54:29 this reproduced
27 failures / 10 passes in 322 ms, matching the hosted parent-file failure count
and early snapshot/bounded-file errors. This is controlled metadata evidence,
not a measurement of the hosted runner's actual UID.

The parent fixture now represents UID 1000 on both platforms while retaining
native Linux modes and other file identity fields. Two added negative cases
represent UID 999 and 1001 and require the real snapshot binder to reject before
any CLI copy or source consumption. Production code is unchanged.

With the same controlled UID-1001 instrumentation: 39 passed, 385 ms. The ordinary
owned Linux copy: 39 passed, 386 ms. Windows: 39 passed, 1.63 seconds. Pinned Node
22.22.3 was used throughout; typecheck and exact-file diff check exited zero.
The Linux copies used existing read-only dependencies and private cache directories
and were cleaned up after each run. No skip or weakened assertion was introduced.

Reproduce the checked-in suite with:

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingRuntimeParent.test.ts
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
```

This correction covers the controlled parent suite only. The lifecycle and native
handoff cases above remain open and must not be marked repaired by inference.

## Worker lifecycle fixture reproduction and correction

At 00:56:48, an owned Linux copy of `localBindingRuntimeLifecycle.test.ts`
instrumented at its existing path-stat adapter to present UID 1001 reproduced
39 failures / two passes in 870 ms. The early worker-executable rejection matched
the hosted failure boundary. No user account or filesystem ownership was changed.

The controlled lifecycle adapter now represents the fixed runtime UID on Linux
as well as Windows. Native Linux modes and remaining stat fields are retained;
the separate compiler-owner and compiler-mode mutation fixtures remain unchanged.
Two new cases require UID 999/1001 operations to fail before compiler commands.
An initial run of those additions exposed a missing test-local dynamic import;
it was corrected before final verification, not treated as a production defect.

Final results on pinned Node 22.22.3: controlled UID-1001 Linux copy 43 passed,
1.62 seconds; ordinary Linux copy 43 passed, 1.63 seconds; Windows 43 passed,
8.35 seconds. No skips or unhandled errors. Typecheck and exact diff check exit
zero. Commands use the same Vitest invocation above with
`tests/localBindingRuntimeLifecycle.test.ts`. Owned snapshots/private caches were
removed; shared dependencies and production runtime code were unchanged.

Parent and lifecycle controlled fixtures are now locally verified. This does not
establish hosted CI success, a real compiler build, or native ownership acceptance.
The standalone checked-handoff/native tests still need their separate repair.

## Native handoff/bootstrap expectation correction

The standalone tests no longer assume every native Linux account has UID 1000.
Their displayed names identify the applicable branch. Windows retains its
existing handoff checks and Linux-only bootstrap exclusion. Real UID-1000 Linux
continues to require successful handoff identity validation and rejection after
actual bootstrap file replacement. Other native owners must instead be rejected
by the production APIs; no handoff may appear and source bytes must be preserved.
There is no owner mocking, chown, elevated execution or production policy change.

Fresh local verification at 01:00:44: two selected tests passed on the actual
UID-1000 WSL account, 225 ms; 45 other tests were name-filtered. Windows: one
selected handoff passed, 46 filtered/platform skips, 3.52 seconds. Typecheck and
diff check exited zero. The owned Linux snapshot used existing dependencies and
was removed after the run.

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingRuntime.test.ts -t 'checked handoff identity|bootstrap module replacement|unauthorized native owner'
```

The non-1000 rejection branches require native execution evidence from an actual
other-owner environment; they are not proven by the UID-1000 results. Latest
hosted CI remains separate evidence. This checkpoint must not be reported as a
complete green root suite or successful production preparation.
