# PTR source-closure checkpoint — 2026-09-07

Reviewed source: `16db897ad3a1d1c88cdbac755515c8a367331604`, based on
`78a0a7a7c3a48807e31111dfd56dd6fd1c49a6d5`. Published and independently matched
against GitHub's `codex/prepared-keep-bindings-fix` ref. This is a development
checkpoint, not a deployment or final release freeze.

The derivation and verifier now admit five exact existing PTR gameplay procedure
bindings and nine exact shared gameplay sources. A fixed PTR backend entrypoint
root protects dependencies that file enumeration alone previously missed.
Unknown imports and private PTR table bindings remain rejected. No frozen
inventory, manifest, deployment pin, admissions or runtime gameplay changed.

Independent root review read the complete three-file diff and implementation
report: no blocking specification or quality findings for this prerequisite.
Fresh Windows verification used the repository's pinned Node 22.22.3:

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/ptrGameplayClosurePolicy.test.ts
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/authBridgeNotificationPreparedWorkflow.test.ts -t 'derives the production browser admission and request graph'
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
git diff --check 78a0a7a..16db897
```

Results: new suite 16 passed, one explicit Linux-file-symlink platform skip,
73.75 seconds; original reproducer one passed, 117 name-filtered skips, 7.53
seconds. Typecheck and diff check exited zero. Implementer additionally ran the
complete focused suite in an owned genuine Linux fixture: 16 passed, one
Windows-junction skip, 31.01 seconds; the real file-symlink negative passed.
That Linux result is implementation evidence, not a second root-run measurement.

Root's exact outgoing-commit Gitleaks scan found zero leaks in one commit,
15,336 bytes. GitHub CI for this new source is separate and not yet claimed
passing. Full-family assembler convergence, activation, live owner gameplay,
recovery and the remaining release checklist still require completion.
