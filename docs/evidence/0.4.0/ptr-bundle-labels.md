# PTR compiled source-label portability — 2026-09-07

Hosted Verify `34063307183`, Linux job `101567597735`, failed the compiled PTR
source-section comparison. Its diff contained the same ordered application and
shared-gameplay sources as expected. Differences were limited to Rolldown's
virtual runtime ID and six locked dependency labels under `../node_modules`
instead of `node_modules`. This was not evidence of an additional gameplay API.

The test now recognizes the exact raw `\\0rolldown/runtime.js` virtual label
before filesystem-relative conversion, and normalizes only the known enclosing
module's `../node_modules/` prefix. The exact ordered dependency/file inventory
and all forbidden-policy expressions remain unchanged. Unexpected two-parent
dependency paths and legacy source paths remain distinguishable. A dedicated
label regression exercises those distinctions. The build subprocess now has a
120-second timeout and 4 MiB output bound.

Fresh Windows verification used Node 22.22.3 and the installed SpacetimeDB 2.6.1
CLI, with pinned Node prepended to the process-local PATH:

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/ptrRealmBackend.test.ts -t 'PTR bundle labels|compiled PTR payload'
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
```

Two tests passed, including the real module build and its exact compiled source
inspection, in 9.11 seconds; 13 unrelated tests were name-filtered. Typecheck
exited zero. No module source, generated bindings, admission policy or deployed
database was changed. Fresh hosted Linux verification is still required; the
older hosted bundle diff is diagnostic evidence, not a new successful build.
