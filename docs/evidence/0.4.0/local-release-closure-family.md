# Closure-family composition — 2026-09-07

`scripts/local-prepared-closure-family.mjs` connects the fixed policy/inventory/
count producer to the real closure manifest and workflow-pin generator. The
result is fourteen prospective files: eight source/count outputs, two source-pin
outputs, the manifest, and three workflows. It performs no installation or
production operation.

The generated verifier must match this tool's verifier implementation byte for
byte outside its single literal inventory declaration before it is imported.
The generated inventory is produced internally; callers cannot provide source
bytes, inventory paths, a loader, or an executor. This avoids executing unrelated
candidate code merely to adopt the newly derived inventory.

Member bodies are read through the bounded reader (4 MiB per file, 128 MiB total).
Internally derived source bodies take precedence over old filesystem copies.
The real verifier derives canonical manifest members and workflow pins, including
its existing projection/convergence checks. Missing members fail the call.
All fourteen output paths must satisfy the shared installation namespace. Temporary
read buffers are cleared; returned buffers remain owned by the caller, and
failed derivations clear owned output buffers.

Verification with pinned Windows Node 22.22.3:

- Two focused suites: 39 tests passed, one Windows symlink test skipped.
- Targeted strict TypeScript check and JavaScript syntax check passed.
- Existing-inventory fixture uses the real verifier engine and real repository
  member bodies, verifies the manifest hash, and checks all three workflow pins.
- Expanded-inventory fixture adds all nine **synthetic** bundle bodies and checks
  that the real manifest engine includes them. It is not compiled-bundle proof.
- Altered verifier logic, missing member bodies, accessor options and caller
  inventory overrides fail; candidate code injection is rejected before import.

Remaining: connect native compiled binding/bundle bytes and source pins to the
prospective checkout; derive this family there; journal-install the entire Task 7
surface; independently verify and demonstrate complete repeat-run convergence.
Native toolchain/captured-source attestation must cover the orchestration when
it becomes a production preparation entrypoint. These tests do not grant release
authority, constitute final freeze, or establish live deployment readiness.

## Source-pin ordering and subset convergence

The coordinator now derives the activation generator and launch verifier source
pins before manifest generation. Those two outputs depend on operating source
files, not the policy/count outputs, so this adds no dependency cycle. Both must
be members of the generated closure. The manifest hashes their newly derived
bytes instead of stale filesystem copies.

Tests use the actual source-pin helper and manifest engine to check both raw
hashes, the launch verifier's reference to the newly generated activation
generator, and convergence of all fourteen outputs under a read-overlay fixture.
That fixture models reading the first result on a second pass; it is not native
filesystem installation or complete Task 7 convergence.

The first three-suite run before adding the convergence test passed 59 tests,
with two Windows symlink skips. The subsequent run passed 58 tests (including
the new convergence test), with two existing fixture test/hook timeouts and
two skips. Targeted strict types passed. No test deadline was increased.
After that process terminated, an unchanged rerun passed all 60 tests with two
skips (17.97 seconds total, 3.93 seconds in tests). The timeouts remain recorded;
the passing rerun is not a claim that all Windows timing instability is resolved.

## Native Linux compatibility evidence

An independent, no-hardlinks clone of commit
`64e49bf7fcb831dcf02c00ce8d6f90bc264623e4` was created at
`/tmp/warpkeep-closure-family.610hdezU/repo` in Ubuntu-24.04. It uses the pinned
Node 22.22.3 executable and an empty environment except HOME, PATH and LANG.
Root and auth-bridge dependencies were linked from the existing disposable Linux
test cache; they were **not** presented as attested production dependencies.

The same three suites passed all 62 tests (zero skips, 2.31 seconds). This includes
native symlink rejection and the real manifest engine's fourteen-output
read-overlay convergence fixture. The expanded bundle bodies remain synthetic
in the dedicated fixture; this does not prove native compiled-family assembly.

A separate non-mocked, read-only invocation of
`derivePreparedClosurePolicyInventoryAndCounts` and `derivePreparedSourcePins`
against that Linux clone succeeded: 1,086 closure members, eight inventory/policy/
count outputs and two source-pin outputs. This exercised the actual Linux
TypeScript source scanner, not the mocked scanner used in focused unit tests.
The clone's final `git status --porcelain=v1 --untracked-files=all` was empty.

Reproduction (from that disposable checkout, using pinned Node):

```text
node node_modules/vitest/vitest.mjs run tests/localPreparedClosureFamily.test.ts tests/localPreparedClosureInventory.test.ts tests/localPreparedSourcePins.test.ts --maxWorkers=1
```

This removes uncertainty about Linux compatibility of these connected helpers.
Production dependency attestation, compiled artifacts in the prospective checkout,
complete transaction installation, independent checks and final freeze remain.
