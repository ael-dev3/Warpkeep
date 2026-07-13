# Credential rotation and compromise response

## Inventory

Credential values live only in their authorized platform or local secret store. This repository records names and purposes:

- GitHub account/app/CLI authorization: repository, Actions, Pages, releases.
- Cloudflare deployment credential: scoped Worker/domain/Durable Object deployment.
- `SIGNING_KEY_JWK`: Worker ES256/P-256 private signing key.
- `ADMIN_TOKEN_SECRET`: Worker/operator Hermes authentication boundary.
- `FARCASTER_RPC_URL`: server-only Farcaster verifier/provider endpoint.
- Maincloud CLI authorization: inspect/build/generate/publish access.

Never put values in a recovery manifest, `.env.example`, command-line argument, shell history, issue, screenshot, log, or chat transcript.

## Planned rotation

For every rotation record only timestamp, affected service, public key ID or deployment version, and verifier result.

- **ADMIN_TOKEN_SECRET:** update the Worker managed secret and authorized operator store together; verify admin-token issuance, synthetic probe, and protected aggregate.
- **FARCASTER_RPC_URL:** update the managed secret; verify normal SIWF resolution and fail-closed provider outage behavior.
- **SIGNING_KEY_JWK:** update the private key and matching public key ID, deploy, confirm JWKS contains no private `d`, and re-verify module/browser behavior.

The current bridge publishes one JWKS key. Do not claim seamless overlapping signing-key rotation; compromise rotation intentionally invalidates old tokens. Planned overlap requires a separately reviewed multi-key implementation. The module normally does not require republishing when only the issuer's signing key changes, but verify deployed runtime behavior.

## Compromise order

1. Isolate the suspected machine; do not copy unknown state.
2. Disable shared alpha through Pages.
3. Revoke workstation, GitHub, Cloudflare, and Maincloud authorizations.
4. Rotate Worker admin/provider secrets and signing key.
5. Audit GitHub Actions/releases/tags, Cloudflare deployments/logs, and Maincloud activity.
6. Rebuild from clean hardware and verified repositories/releases.
7. Restore credentials through managed stores.
8. Run the complete local, hosted, production, and protected-aggregate verification suite.
9. Re-enable shared alpha only after incident command approves the evidence.

If SIWF proof or player bearer material may have been exposed, treat it as identity-sensitive incident data, do not copy it into the report, and rotate/revoke the relevant authorization epoch or signing boundary.
