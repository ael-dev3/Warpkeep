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
