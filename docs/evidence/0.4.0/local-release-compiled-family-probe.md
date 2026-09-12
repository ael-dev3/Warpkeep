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

## Corrected installation and resumed verification

The second native run used an independent Linux checkout of
`8eb53f1512b9c37db1d9041f37a9899768ae023a`, tree
`8067ec588ad3d39774c1c2dd38ac917bc9412e2d`. It completed the real producer calls,
installed 84 compiled artifact files in the draft, derived the closure family,
and installed the combined 98 files in a second candidate. It reached
`verifying-installed-family`, then exited 1 with `ENOENT`.

Inspection established that the new graph-input checker was looking for YAML
dependency files inside the candidate. Native bundle construction instead uses
the separately pinned YAML 2.9.0 toolchain. The probe now distinguishes those
dependency entries: only `node_modules/yaml/` entries present in the validated
`local-binding-runtime-yaml-v1.json` manifest are mapped to the fixed toolchain
directory, with both byte length and SHA-256 required to match. Unknown package
entries fail. Repository inputs continue to be checked in the candidate.

The original second process is still recorded as failed. A separate diagnostic
acquired a genuine candidate lock and verified its retained installed artifacts
using the corrected lookup, without recompiling or fabricating producer results:

- All 288 recorded bundle inputs matched their source/dependency hashes.
- The actual installed closure verifier accepted 1,099 members.
- Re-deriving the fourteen closure/source-pin/workflow outputs matched their
  installed bytes exactly.
- Manifest SHA-256:
  `a475cedfe253f8498850fc276a4d45a74dda2e44c9ec2275190d19413ffdd2d7`.
- All 98 combined candidate files and 84 draft files were checked against the
  recorded journal after-state hashes and lengths before recovery.
- Native recovery returned `rolled-back` for both transactions. Both subsequent
  Git status checks were empty. Existing bytes were restored and newly generated
  test-candidate files removed; the private checkouts/journals remain available.

Private test transaction identifiers for correlating retained records:

- Combined: `7d6370c9409b44b3e651fa1e5ba5e058`.
- Draft: `9a4499517f65c93213448f4b349bd8c7`.

This is native compiled-artifact installation plus resumed verification/recovery
evidence, **not** an uninterrupted successful probe, final Task 7 acceptance,
attested production-toolchain completion, or live release. It does not include
the later workflow transport changes in `172d8e0`. Full compiler regeneration
convergence and remaining dispatcher/activation/workflow consumers still matter.

## Uninterrupted native success

The third run completed with exit code 0 from a fresh independent Linux clone
of `fd9bb480cd8b8f2fc0bf4b632ca4bff34059d2f4`, tree
`738a5ac0e33a054717b483ed400a7b11ff401be4`. Unlike the second run, this source
already contained the corrected YAML graph-input lookup and the workflow body
bounds. No source overlays were applied to the running checkout.

Its terminal result reported:

- 84 real compiled artifact files and 14 derived closure-family files.
- 98 installed files checked against their generated hashes.
- 288 compiler-recorded bundle inputs checked against repository or separately
  pinned YAML dependency bytes.
- 1,099 members accepted by the actual installed closure verifier.
- Identical repeated derivation of the fourteen closure-family outputs.
- Manifest SHA-256:
  `fa765a45259bd23d5a251a6dd1944bcd8546ac4993e9e04d1ee40642c7084e68`.
- Successful native rollback of both test candidates before the process exited.
- `finalReleasePrepared: false`.

The run used the fixed Linux Node 22.22.3 executable with a cleared environment
and ordinary Linux test dependency links for the scanner. The private transaction
recovery restored replaced files and removed probe-created generated files;
source checkouts and recovery records remain retained. No production state was
touched. This run did not include subsequent documentation or the verifier-test
correction in `e4640ba`.

The uninterrupted result supersedes the need to rerun the corrected probe, not
the remaining release requirements: full consumer/test integration, complete
compiler regeneration convergence, production toolchain attestation, unfinished
activation and workflow operations, final freeze, and live acceptance remain.

## Recovery-inclusive native success — 2026-09-07

The recovery-inclusive probe completed uninterrupted with exit code 0 at source
`16c810718a9e236449e4083e7e3357740b6902ba`, tree
`5a183b996fc9ecc3d365419c9cb61f8401a60832`. It used the fixed Linux Node
22.22.3 executable with a cleared environment in the independent diagnostic
checkout. The checkout was not changed during execution.

Terminal evidence from `tests/fixtures/localReleaseCompiledFamilyNativeProbe.mjs`:

- 86 real compiled artifact files, including the recovery bundle and manifest.
- 14 closure-family outputs; 100 combined installed files verified by hash.
- 288 operation-bundle inputs and 7 recovery compiler inputs checked. Recovery
  package inputs were authenticated by the native producer; committed recovery
  inputs were also rechecked against the prospective installed candidate.
- 1,136 members accepted by the installed closure verifier, including the
  recovery CLI, compiled bundle, manifest, and external runtime dependencies.
- Repeated closure derivation produced identical output bytes.
- Manifest SHA-256:
  `f47a5032d015ebe34e67f9a624b4d352f85b7f90aaf2fa48d9320e543956ffd3`.
- Both isolated candidate transactions rolled back successfully.
- `finalReleasePrepared: false`.

This supersedes the earlier probe's missing recovery-family coverage. It is
local compiler, installation, closure-convergence, and candidate-file recovery
evidence—not a final freeze, live deployment, production database recovery test,
or completed workflow integration. Ordinary scanner dependency links remain
diagnostic dependencies, not production toolchain attestation. No production
state was changed.
