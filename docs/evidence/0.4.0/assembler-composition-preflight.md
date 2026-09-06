# Complete assembler composition preflight — 2026-09-07

Source inspected: `0c8cb59468b925fc8a71594f5af6b0a676cc271a`, with the
existing Windows working-copy bytes and dependencies. This is a diagnostic,
not an authenticated Linux artifact family, final freeze, or deployment.

## Actual engine builds

Called `buildSealedRealmOperationBundle` with the installed real `esbuild.build`
for every lane, twice, using Node 22.22.3. Both invocations completed with the
same byte lengths and digests. No bundle was loaded, installed, or executed.

| Lane | Graph members | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| activation | 14 | 143788 | 957f4123cc368ac3c57c48d54560055895e6612df7320dabe53b5501c0acae5b |
| g001 | 12 | 117977 | c6e56b3114bfead0c0f67ba5e4bc04b6af3679d80585969df594658b933b5a63 |
| g002 | 131 | 482695 | 7d5686f44ab8ec4f07947f75709dd77f72f42ac343d6277376808ad1d3b051e2 |
| ptr | 131 | 483730 | dd0529b3bc58b9a276cb24664a49c8759d22462ac0b3a9a7101a82062c828724 |

Reproduce from the repository root with the pinned Node executable, passing
this JavaScript to `--input-type=module -e` (or an owned diagnostic `.mjs`):

```js
import { build } from 'esbuild';
import { buildSealedRealmOperationBundle } from './scripts/sealed-realms-production-bundle-engine.mjs';
for (const lane of ['activation', 'g001', 'g002', 'ptr']) {
  const result = await buildSealedRealmOperationBundle({ lane, sourceRoot: process.cwd(), build });
  console.log(JSON.stringify({ lane, count: result.graphManifest.length,
    bytes: result.bytes.length, sha256: result.byteDigest }));
}
```

The observed metafile inputs contain no G002 or PTR generated-binding files.
Thus this particular bundle graph does not establish a generated-binding →
bundle ordering dependency. Do not invent an intermediate source commit solely
on that assumption. The fixed committed-source builders must still return the
same profile, commit, and tree, and final checking must cover all generated
bindings and consumers. Graph membership can change as operating sources finish.

## Composition boundaries that remain real

- `local-binding-runtime.mjs` returns copied G002/PTR outputs and G001
  validation evidence, not installed bindings.
- `local-operation-bundle-runtime-core.mjs` captures committed source and
  independently builds/loads each lane twice. The Windows probe above does not
  substitute for that fixed, owned Linux process.
- `local-prepared-bundle-files.mjs` requires actual load results and the exact
  four captured entry declarations. It emits nine files. It has no operating
  caller in `scripts/`; do not fabricate load metadata to connect it.
- The bundle manifest file is not currently installed in `scripts/`.
- The engine's raw graph manifest hashes input bytes. Its fixed path transforms
  are not a general generated-pin projection. Any generated fact depending on
  another output needs an explicit dependency edge and the already-defined
  projection rule; unresolved cycles must fail rather than iterate hashes.
- The existing source capture starts from `HEAD` and checks committed control
  bytes. Durable installation must therefore have a separate candidate target
  from the immutable builder source; reruns must retain the recorded source
  identity, not silently recapture a newly committed output as the same input.

Next implementation remains complete output/consumer derivation followed by the
owned-Linux transaction and independent whole-family checking in the accepted
assembler specification. Current graph counts passed this probe; changing them
is not justified by this evidence. Mac-specific operating source and activation
placeholders still require implementation before final freeze.

## Hosted state observed during this inspection

The existing bundle/declaration serializer suite was also rerun locally:
`node node_modules/vitest/vitest.mjs run tests/localPreparedBundleFiles.test.ts`
using Node 22.22.3: 63 tests passed, one file, 27.62 seconds. These are component
tests, not proof of fixed Linux execution or complete candidate installation.

Verify run `34066214945` for the inspected commit: native-contract,
release-recovery, and auth-bridge succeeded; linux and spacetimedb-module were
still in progress. This is not a full green CI result.
