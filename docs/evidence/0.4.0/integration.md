# 0.4.0 integration evidence

Updated 2026-09-06. R14 remains incomplete; source publication is not production deployment.

## Published development checkpoints

- PR: https://github.com/ael-dev3/Warpkeep/pull/228, draft, targeting main.
- First synchronization: 259 commits published from remote `2d7e24f76cfb6da567770f3a940871a985f55c9b` through `de801391d26cf3bc1c3a1b80b0342a20181ae8d5`.
- Next checkpoint: reviewed controller repair `615597c152d8bc603052c98c8e25fa4b1d2dc4f8` and sync procedure `76480d6be2951cc884d6ecf705e12fc9d9dfe6dd`. Local and remote development heads were verified equal at the latter commit.
- No main merge, tag, release, provider mutation, or production deployment was performed by these pushes.
- Reviewed keep UI and its repeated-rejection repair were published through `737f68e46e2853186dedaf94590aaf64431a58cd`.
- Reviewed PTR integration was published at `acd62c7ce785939cbe8a16ca4ef3b63291a31e08`; `git ls-remote upstream refs/heads/codex/prepared-keep-bindings-fix` confirmed the exact remote head. Its one-commit outgoing scan with pinned Gitleaks 8.30.1 inspected 43,407 bytes and returned no leaks, exit 0. This does not resolve earlier history findings.
- Uncommitted renderer work and plans are not represented as published source. See `docs/operations/0.4.0-development-sync.md` for the publication procedure.

## CI observations

Verify run 34044383667 tested `de801391d26cf3bc1c3a1b80b0342a20181ae8d5`. Its completed Linux job 101516706723 scanned 725 commits / approximately 41.34 MB and failed with 14 secret-scanner findings. A separate local pinned Gitleaks 8.30.1 scan of the 259 outgoing commits reproduced 14 findings. Inspected findings were public signing-key hashes/thumbprint, schema field names, and synthetic invalid-key/credential/JWS test fixtures. This is a classification, not a passing scanner result. Precise exceptions and a successful complete-history scan remain required; do not disable scanning or broadly exclude test directories.

Native-contract job 101516706868 failed one of 105 tests:

```text
authBridgeNotificationPreparedDeployRuntime.test.ts
attests and resolves the exact pinned Wrangler from the pnpm layout
AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID
exactWrangler: auth-bridge-notification-prepared-cloudflare-runtime.mjs:998
```

The failing branch catches failure to resolve/stat the supplied Wrangler entrypoint. The job installs root dependencies with `npm ci` but does not install `services/auth-bridge` dependencies through its pinned pnpm layout; the test explicitly requires that layout. Repair must retain exact toolchain validation. The goal additionally requires removal of the mandatory Mac execution dependency, not another Mac-only workaround.

No-Mac repair preflight: the three `native-contract` test files exclude Windows
for POSIX filesystem cases, but have no Darwin/ARM64-only test gate. The workflow
itself explicitly requires macOS/ARM64. The Linux job already installs pinned
pnpm 11.7.0 and the exact bridge toolchain. A disposable Linux execution of the
same native-contract cases with those dependencies is therefore the concrete
replacement to verify, not a reason to delete the cases. This is source inspection,
not a passing replacement-run result. The public activation verifier still uses
a `Library/Application Support` path suffix, which must be reconciled with the
local release operations contract rather than silently treated as portable.

Auth-bridge and release-recovery jobs passed. SpacetimeDB verification was still running when checked; no result is asserted here. A subsequent Verify run 34044461236 for `76480d6be2951cc884d6ecf705e12fc9d9dfe6dd` also showed those two failures, the two service jobs passing, and the module job in progress.

## Remaining R14 acceptance

Dependency triage (2026-09-06): authenticated Dependabot alert #2 is open,
GHSA-528h-pc64-c93x, medium severity, for quadratic-depth denial of service in
stream-json pick/ignore/filter/replace filters. The advisory marks versions
through 3.4.0 affected and 3.5.0 first patched. Current root lockfile contains
stream-json 1.9.1 through jayson 4.3.0 (`^1.9.1`), itself required by the Solana
dependency tree. Inspected local jayson code imports StreamValues and Verifier;
this is not proof that the vulnerable filters are reachable, nor proof of safety.
Application source search found no direct stream-json import. Resolve the
dependency audit/reachability question before final integration; do not force
an incompatible major override or dismiss the alert without evidence. No
dependencies, lockfiles, scanner rules, or alert state were changed by triage.

Repair and review the concrete CI failures, complete the no-Mac execution path, publish reviewed gameplay/visual/operating sources, pass every required check on the final source, and integrate through repository protections. Capture final source/CI/PR identities in the release ledger. These intermediate observations cannot satisfy final release verification.
