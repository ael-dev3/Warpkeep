# Closure-family composition — 2026-09-07

`scripts/local-prepared-closure-family.mjs` connects the fixed policy/inventory/
count producer to the real closure manifest and workflow-pin generator. The
result is twelve prospective files: eight source/count outputs, the manifest,
and three workflows. It performs no installation or production operation.

The generated verifier must match this tool's verifier implementation byte for
byte outside its single literal inventory declaration before it is imported.
The generated inventory is produced internally; callers cannot provide source
bytes, inventory paths, a loader, or an executor. This avoids executing unrelated
candidate code merely to adopt the newly derived inventory.

Member bodies are read through the bounded reader (4 MiB per file, 128 MiB total).
Internally derived source bodies take precedence over old filesystem copies.
The real verifier derives canonical manifest members and workflow pins, including
its existing projection/convergence checks. Missing members fail the call.
All twelve output paths must satisfy the shared installation namespace. Temporary
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
