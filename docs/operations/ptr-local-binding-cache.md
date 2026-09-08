# PTR local build cache

The fixed native PTR binding builder reads its own cache. A populated G002 cache
does not satisfy this requirement: the two locks select different versions of
some dependencies.

From the intended committed Warpkeep source checkout, run as the prepared Linux
UID1000 account:

```sh
/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node scripts/bootstrap-ptr-local-binding-cache.mjs
```

This command accepts no arguments. It requires the existing private preparation
namespace, pinned Node22 and Git executables, and the attested YAML2.9.0 runtime.
It validates the committed PTR package manifest and lock, selects the Linux x64
dependency graph, then downloads missing archives from the fixed npm registry.
No pnpm executable or install script is run.

Archives are installed under
`/home/warpkeep/.warpkeep/release-preparation-v1/cache/ptr/_cacache/content-v2/sha512/`
using the lock's SHA512 digest layout. Directories remain0700 and archives0400.
Existing valid archives are reused; invalid existing files are rejected and
preserved. Source and executable authority are checked again after downloads,
before installation. Concurrent exclusive-creation conflicts require successful
verification of the existing archive and do not count as new installations.

The JSON result records source commit/tree and package/installation counts. It
confirms cache preparation, not a module build, deployment or release acceptance.
Afterward, the existing local binding runtime can compile PTR; its locked builder
independently verifies and extracts the archives before executing compiler code.
