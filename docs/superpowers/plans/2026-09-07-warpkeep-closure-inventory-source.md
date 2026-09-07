# Closure inventory source derivation

> **For agentic workers:** Use test-driven development and bounded independent review.

**Goal:** Mechanically derive the expanded builtins-only closure inventory from
the existing policy scanner, without a caller-supplied inventory override.

**Spec:** `docs/superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md`.

**Architecture:** Internal source derivation, not installation or authority.
`derivePreparedClosureInventorySource({repositoryRoot})` invokes the existing
policy scanner, reads its fixed verifier path with the bounded reader, and
replaces only the unique canonical exported inventory declaration. The complete
assembler must supply its independently captured source/candidate root and later
verify and install the full output family. No standalone final freeze.

**Files:** `scripts/local-prepared-closure-inventory.mjs`, `.d.mts`, and
`tests/localPreparedClosureInventory.test.ts`.

- [x] Write failing tests using real temporary source files and a controlled
  scanner result: expansion preserves surrounding bytes; identical inventory
  converges; malformed/duplicate declarations and unsafe/duplicate/unsorted paths
  fail; source symlinks and unknown options fail; input files remain unchanged.
- [x] Implement exact option validation, fixed-path bounded fatal-UTF8 read,
  unique canonical declaration match, bounded sorted path checks, and immutable
  result `{path, bytes, memberCount}`. Preserve the source newline convention.
- [x] Run the existing real policy scanner and this transformer against the
  current source without writes; compare the resulting inventory with the real
  scanner and confirm every byte outside its declaration is unchanged.
- [ ] Run tests/types, review, scan and publish the source checkpoint.

Current scanner evidence: 1,077 members, 50 additions, zero removals compared
with the frozen inventory. These numbers are observations, never generation
inputs. Complete bundle/binding/consumer derivation, generated verifier execution,
native installation, convergence and protected integration remain mandatory.

## Inventory-dependent count consumers

Extend the internal module with `derivePreparedClosureInventoryAndCounts(options)`.
It consumes the existing inventory transformer, returning `{memberCount, files}`
for the verifier plus six fixed files: canary launcher/declaration, B0 closure
test, prepared release projection test, prepared workflow test, and greater-realm
deploy boundary test. Rewrite only the 11 existing named numeric slots. Preserve
all other bytes; missing/duplicate/unrecognized slots reject the entire result.
No scanner count or path map is caller-supplied, and no result is installed.

- [ ] Add failing fixture tests for complete seven-file output, exact count
  propagation, unchanged unrelated numbers, missing/duplicate slots and no writes.
- [ ] Implement fixed per-file slot patterns and exact occurrence checks. Existing
  values must be bounded positive integers; derive replacements from the scanner.
- [ ] Execute against current repository sources without writes, run tests/types,
  obtain review and publish. Later whole-family checking must reject tampered
  installed values; this internal transformer does not authenticate input commits.
