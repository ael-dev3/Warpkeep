# Closure inventory source transformer — 2026-09-07

Internal transformer: `scripts/local-prepared-closure-inventory.mjs`.
Independent bounded source/parser review approved this implementation.
It invokes the existing policy scanner, reads the fixed verifier source, and
returns replacement source bytes. It does not accept a caller-provided member
list, write the checkout, generate deployment authority, or complete the refreeze.

Actual current-repository invocation (Windows Node 22.22.3):

```js
import { derivePreparedClosureInventorySource } from './scripts/local-prepared-closure-inventory.mjs';
const candidate = derivePreparedClosureInventorySource({ repositoryRoot: process.cwd() });
```

Observed 1,077 derived members: 50 additions to the frozen list, no removals.
Candidate verifier size 110,129 bytes; SHA-256
`0b406aea5689513b5f62310f524112d554be6f7b3e4a38be7b3c73a9bfc5ab70`.
A byte comparison confirmed the original verifier file remained unchanged.
This observed count and digest are results, not hand-entered generation inputs.

Component tests use real temporary files and controlled scanner output to isolate
source transformation. They cover LF/CRLF, byte preservation outside the inventory,
repeat derivation, malformed/duplicate declarations, expressions, invalid UTF-8,
unsafe/duplicate/unsorted/empty member lists, unknown/accessor options, oversize,
and source symlink rejection. The separate actual invocation above uses the real
scanner, not the controlled test dependency.

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localPreparedClosureInventory.test.ts
Windows: 12 passed, 1 Linux symlink test skipped; exit 0.

wsl -d Ubuntu-24.04 -- /tmp/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/release-journal-linux-check.mjs --inventory
Linux: 13 passed; exit 0, 146 ms.

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
exit 0
```

Full assembler integration remains incomplete: this returned verifier source must
be included with every derived binding, bundle, declaration, manifest, consumer
and workflow pin, then independently checked and installed in the native candidate.
No final frozen inventory, release artifact, or production deployment changed.
