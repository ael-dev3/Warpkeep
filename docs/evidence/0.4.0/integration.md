# 0.4.0 integration evidence

Updated 2026-09-06. R14 remains incomplete; source publication is not production deployment.

## Published development checkpoints

- PR: https://github.com/ael-dev3/Warpkeep/pull/228, draft, targeting main.
- First synchronization: 259 commits published from remote `2d7e24f76cfb6da567770f3a940871a985f55c9b` through `de801391d26cf3bc1c3a1b80b0342a20181ae8d5`.
- Next checkpoint: reviewed controller repair `615597c152d8bc603052c98c8e25fa4b1d2dc4f8` and sync procedure `76480d6be2951cc884d6ecf705e12fc9d9dfe6dd`. Local and remote development heads were verified equal at the latter commit.
- No main merge, tag, release, provider mutation, or production deployment was performed by these pushes.
- Uncommitted UI work and plans are not represented as published source. See `docs/operations/0.4.0-development-sync.md` for the publication procedure.

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

Auth-bridge and release-recovery jobs passed. SpacetimeDB verification was still running when checked; no result is asserted here. A subsequent Verify run 34044461236 for `76480d6be2951cc884d6ecf705e12fc9d9dfe6dd` also showed those two failures, the two service jobs passing, and the module job in progress.

## Remaining R14 acceptance

Repair and review the concrete CI failures, complete the no-Mac execution path, publish reviewed gameplay/visual/operating sources, pass every required check on the final source, and integrate through repository protections. Capture final source/CI/PR identities in the release ledger. These intermediate observations cannot satisfy final release verification.
