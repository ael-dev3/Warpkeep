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
