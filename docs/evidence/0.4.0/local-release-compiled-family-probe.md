# Real compiled-family integration probe — 2026-09-07

`tests/fixtures/localReleaseCompiledFamilyNativeProbe.mjs` is a manual,
credential-free native integration probe, not a production preparation command.
It connects existing implementations instead of substituting synthetic compiler
results or caller-supplied hashes:

1. Capture a native private workspace with its candidate lock.
2. Run the real all-realm binding checks/generation and four bundle producers.
3. Require their exact profile, source commit and tree to match the workspace.
4. Journal-install G002/PTR bindings and bundle files into the private draft.
5. Derive the fourteen policy/count/pin/manifest/workflow outputs against it.
6. Capture a second matching workspace and journal-install the combined files.
7. Check every installed byte digest and every bundle-recorded compiler input
   against the installed source, run the installed closure verifier, and repeat
   closure derivation against the installed candidate.
8. Release locks and use native transaction recovery to roll both candidates back.

G001 is validation-only. Nothing writes a production database or uses production
credentials. Unexpected failures retain private candidates/journals for inspection
and release held locks; they do not emit a prepared-release success marker.

The probe accepts no arguments. Run it using the fixed Linux Node 22.22.3 runtime
with a credential-free environment and the required existing native compiler
caches. Its source checkout must provide compatible Linux test dependencies for
the closure scanner. Those ordinary dependencies are **not** claimed as attested
production tooling. Do not run it against a live database or call it deployment.

The final JSON, if reached, reports source identity, file/member counts, manifest
hash, closure convergence and rollback results, explicitly setting
`finalReleasePrepared: false`. It does not prove full Task 7 completeness or
compiler regeneration convergence after generated source changes. Missing
dispatcher/activation/workflow consumers, production toolchain attestation and
the final independent release checks remain required.

JavaScript syntax checking passed. The first native execution was started from
the independent Linux clone at commit
`64e49bf7fcb831dcf02c00ce8d6f90bc264623e4`, with this probe copied in as an explicit
test overlay. It reached `compiling-bindings-and-bundles`. No completed native
result is asserted in this record; add the terminal result after observing it.

The compiler-input comparison was added after that first process started and
is therefore **not** part of that initial execution. It prevents a successful
closure hash from concealing a bundle built from earlier source bytes. A later
execution must report `checkedBundleInputs` to prove this additional check ran;
do not retroactively attribute it to the already-running probe.

## First terminal result and ordering correction

The first process exited 1 with `LOCAL_RELEASE_TRANSACTION_INSTALL_INVALID`
after its real producer calls completed. It did not reach closure derivation.
The composed input concatenated separately ordered G002, PTR and bundle lists;
the installer's strict global-order check rejected the later `scripts/` bundle
paths after the `spacetimedb/` PTR group. The guard was correct and remains intact.

The retained draft candidate had empty Git status and no
`.git/warpkeep-release-assembly-v1` directory, consistent with rejection before
staging or publication. No production state was involved.

`derivePreparedLinuxArtifactInputs` now returns a globally ordered `files` array
without changing producer arrays or byte ownership. The probe also globally
sorts the combined artifact-plus-closure family before its second installation.
The producer test now covers ordering across all three groups, count, frozen
result-array shape, and preservation of original producer ordering/buffers.
All nine coordinator tests, targeted strict types and probe syntax checks passed.

A fresh native run is still needed to verify the correction and the additional
compiler-input comparison. The failed first run is not an assembly success.
