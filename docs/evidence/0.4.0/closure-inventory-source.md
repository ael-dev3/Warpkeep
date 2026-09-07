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

## Expanded generator composition probe

After source checkpoint `069e1f572d55a07bbf85a38981ec323c0b0026cc`, a
read-only Windows Node 22.22.3 probe loaded the returned verifier source as an
in-memory module and invoked its actual closure generator with current member
bytes, substituting only that derived verifier source. No artifact was installed.
This is a composition diagnostic, not authenticated source capture or native
candidate verification. The generated module does not receive a member-list
override; its own derived declaration defines the exact inventory.

Result: 1,077 members, 16,545,929 input bytes, manifest SHA-256
`7774f246c64ed71798e0586781984dd8825c7b572798ec062f905d60c6f5d1be`.
Two derivations returned byte-identical manifests and all three workflow bodies:

| Workflow | Bytes | SHA-256 |
| --- | ---: | --- |
| deploy-pages.yml | 40349 | b993449425b876f71f34bcfed84b3cd429713dca0f975b2a114962fa621054f4 |
| notification-bridge-b0.yml | 54519 | 2c67b3dc5bb6150ad0a7831550ba3705b9c21da468ff9592902b2bf92a61b7df |
| notification-bridge-prepared.yml | 55697 | a04b21edb7a0e1becdba0776d576d82ec96d5f691eac3049be6742e9f3fd88d3 |

Reproduce diagnostic: pinned Node running `.superpowers/closure-candidate-probe.mjs`.
The ignored probe uses bounded member reads, a 128 MiB aggregate cap, fixed-error
reporting, and clears member buffers. It is not a production loader.

The probe does not include newly derived lane bundles/bindings or all Task 7
consumers. For example, the canary launcher's protected member count is still 997;
the production and Verify workflows are outside this generator's three-workflow
rewrite set. Complete consumer dependency derivation and whole-family installation
remain required; these partial deterministic outputs do not satisfy convergence.

## Count-consumer composition checkpoint

Working source based on `17c3e65ba0633289b8549158d321ddac42f7aa9c` now
derives all 11 inventory-dependent numeric slots in six fixed consumer files,
alongside the verifier inventory. No files are installed by this API.
The diagnostic substitutes all seven returned files before hashing closure
members, including the canary launcher; updating that launcher after hashing
would instead invalidate the manifest.

Fresh checks: Windows inventory suite 21 passed, 1 native symlink skip (626 ms);
native Linux suite 22 passed (166 ms); pinned TypeScript build exit 0.
The same commands above reproduce these component checks.

Actual generator composition returned 1,077 members, 16,545,930 input bytes,
manifest SHA-256
`17b2382d4932ed9440bc4d28626c6deaa8b2576711cd6667b0959824c55ac1ed`.
Both runs returned byte-identical manifests and all three workflow outputs:

| Workflow | Bytes | SHA-256 |
| --- | ---: | --- |
| deploy-pages.yml | 40349 | a11653ecd563005f9a60507352616f66bf3516d023faa67831b1dd7e5147e022 |
| notification-bridge-b0.yml | 54519 | caacabd82d0d270094127fe8795506393971dc1358e2d2ddb1c01bf4a023e2a7 |
| notification-bridge-prepared.yml | 55697 | 5a9b632468e32bda66d3860d73e85247b71b3c0595cc0f8d205483466ddb0d81 |

Independent review found no blocking issues and one minor missing boundary-test
case. Added direct rejection coverage for zero, leading zero, 2049, negative,
fractional and expression values; all passed with the existing implementation.
This is supplemental coverage of existing validation, not a new bug-fix claim.
This checkpoint is not a complete output
family: generated bundles/bindings, remaining workflow/source pins, native
installation and whole-family convergence still require integration.
