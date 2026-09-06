# Current-source compiler lifecycle fixture — 2026-09-07

At source `b95948e3189bd5539829b4df35058de9d7fb1581`, the focused compiler
lifecycle suite reproduced two failures / ten passes in 6.88 seconds, matching
the older hosted run's unresolved-import failures. Its disposable source fixture
was copied from the final-release frozen inventory, which does not contain the
complete current graph. This prevented the two successful-scan scenarios from
reaching their compiler lifetime assertions.

The fixture now derives the current graph before installing observers and copies
those current member files into its owned temporary directory. Its scan must
preserve that graph across copying and after a failed scan. These equality checks
test fixture/scan consistency, not independent correctness of the graph policy;
the separate exact PTR graph-policy tests cover admitted and rejected dependencies.

All existing observations remain: three compiler instances on complete scans,
one outstanding snapshot at most, disposal and closure on failure, no reuse after
failure, and preservation of primary errors when cleanup also fails. On Linux,
the real `/proc` child-process checks still bound and verify child reaping.
No production code, path admission, frozen manifest or release pin changed.

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/preparedClosureCompilerLifecycle.test.ts
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
```

Fresh Windows result: 12 passed, 25.74 seconds. Genuine Linux owned-source fixture
with existing native bridge compiler dependencies: 12 passed, 12.67 seconds;
no skips. Typecheck and exact diff check exited zero. The Linux fixture and its
private cache were removed; existing dependency snapshots were not modified.
This is compiler-lifecycle evidence, not a full release build, completed assembler,
final freeze, hosted CI completion or deployment.
