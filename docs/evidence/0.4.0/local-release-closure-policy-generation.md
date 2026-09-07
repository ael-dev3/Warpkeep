# Prospective closure policy generation — 2026-09-07

The existing closure policy does not list the four operation bundles, their four
declarations, or their manifest. Task 7 requires those outputs to be protected.
`derivePreparedClosurePolicySource` now derives that fixed nine-member expansion
from the existing policy source, without modifying the editable checkout.

The transformation preserves all existing static entries and their order. It
requires one literal declaration with canonical, unique paths. A partial bundle
family is rejected, not silently completed. Artifact absence does not make the
expansion optional: the subsequent closure-body reader must require all members.
Applying this policy to the prospective checkout must precede inventory scanning.

Verification on Windows with pinned Node 22.22.3:

- `node node_modules/vitest/vitest.mjs run tests/localPreparedClosureInventory.test.ts --maxWorkers=1`: 30 passed, one platform-specific symlink test skipped.
- Targeted strict TypeScript checking of that test passed.
- LF and CRLF fixtures preserve unrelated source and converge after installation.
- Missing/duplicate declarations, duplicate paths, partial families, expressions,
  traversal paths, and invalid UTF-8 fail without changing source.
- Read-only derivation against the real working policy returned nine bundle
  members and 28,149 bytes, SHA-256
  `c710be31387a51886d28dd1ef10698ff9123f7f1e68b6215e6b26a468bb61c01`.

This is a generation step, not a final policy installation or release freeze.
Complete-family composition, native installation with independent verification,
and whole-family convergence remain required. No production state changed.

## Connected policy/inventory/count derivation

`derivePreparedClosurePolicyInventoryAndCounts` now returns all eight related
files together: the policy, verifier inventory, and six count-consumer files.
It combines the validated scanned inventory with the exact nine static bundle
members. This matches the policy's additive static-list transformation without
executing generated candidate code or accepting caller-selected member paths.
Existing graph traversal and existing security members are unchanged.

The expanded set is validated again after union, including the 2,048-member
bound and case-fold collisions. A missing later consumer fails the whole call;
no partial policy output is returned. Owned result buffers are cleared on failure.

Fresh evidence:

- Focused suite: 34 passed, one Windows symlink skip; strict targeted types passed.
- Tests cover consistent updates to every count, convergence with both the old
  and expanded scanner inventory, case collisions, aggregate member overflow,
  and missing later consumers.
- Read-only real-worktree derivation produced eight files and 1,086 members.
  Every output passed the transaction installer's shared path allowlist.
- The resulting verifier source was 110,699 bytes with SHA-256
  `06e96aff16f24e46bc29aa521d8258b0b6deb3e5dde99a78cf96b8604d706a55`.

This does not yet connect bindings, source pins, workflow/manifest generation,
native transaction publication, and independent post-install verification into
one complete assembler invocation. Those remain mandatory before release freeze.
