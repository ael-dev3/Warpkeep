# Credential rotation and compromise response

> This is an approval-gated recovery plan, not evidence that any credential was
> configured or rotated. Keep Worker public auth and frontend shared-alpha
> access false during investigation and rotation.

## Inventory

Credential values live only in their authorized platform or local secret store. This repository records names and purposes:

- GitHub account/app/CLI authorization: repository, Actions, Pages, releases.
- Cloudflare deployment credential: scoped Worker/domain/Durable Object deployment.
- `SIGNING_KEY_JWK`: Worker ES256/P-256 private signing key.
- `ADMIN_TOKEN_SECRET`: Worker/operator Hermes authentication boundary.
- `SESSION_COOKIE_KEY`: independent Worker HMAC boundary for the
  `__Host-warpkeep_session` rotating family reference.
- `FARCASTER_RPC_URL`: server-only Farcaster verifier/provider endpoint.
- Maincloud CLI authorization: inspect/build/generate/publish access.

Never put values in a recovery manifest, `.env.example`, command-line argument, shell history, issue, screenshot, log, or chat transcript.

## Planned rotation

For every rotation record only timestamp, affected service, public key ID or deployment version, and verifier result.

- **ADMIN_TOKEN_SECRET:** update the Worker managed secret and authorized operator store together; verify admin-token issuance, synthetic probe, and protected aggregate.
- **SESSION_COOKIE_KEY:** rotate only with explicit approval. A change
  invalidates every existing session-family cookie, so treat it as intentional
  family-wide revocation; do not reuse or derive it from the admin/signing key.
  Verify exact `__Host-`, Secure, HttpOnly, SameSite=Strict attributes, tokenless
  pending behavior, generation rotation/replay revocation, and configuration
  attestation before any auth enable.
- **FARCASTER_RPC_URL:** update the managed secret; verify normal SIWF resolution and fail-closed provider outage behavior.
- **SIGNING_KEY_JWK:** update the private key and matching public key ID, deploy, confirm JWKS contains no private `d`, and re-verify module/browser behavior.

The current bridge publishes one JWKS key. Do not claim seamless overlapping signing-key rotation; compromise rotation intentionally invalidates old tokens. Planned overlap requires a separately reviewed multi-key implementation. The module normally does not require republishing when only the issuer's signing key changes, but verify deployed runtime behavior. Access tokens are maximum 600 seconds and memory-only in the auth-v2 target; the separate session family remains server-revocable.

Secret rotation approval does not approve a Durable Object migration, Worker
deploy, module publish, frontend deploy, or auth enable. Record the paused v2
config-attestation digest after an approved Worker deploy, never secret values.

## Compromise order

1. Isolate the suspected machine; do not copy unknown state.
2. Keep/restore Worker public auth and Pages shared alpha false through
   separately approved deployments.
3. Revoke workstation, GitHub, Cloudflare, and Maincloud authorizations.
4. With per-secret approval, rotate implicated Worker admin/provider/signing/
   session-cookie secrets; do not rotate unaffected boundaries automatically.
5. Audit GitHub Actions/releases/tags, Cloudflare deployments/logs, and Maincloud activity.
6. Rebuild from clean hardware and verified repositories/releases.
7. Restore credentials through managed stores.
8. Run the complete local, hosted, production, and protected-aggregate verification suite.
9. Re-enable Worker public auth and shared alpha only through separate final
   approvals after incident command accepts exact-head evidence.

If SIWF proof, memory-only player access bearer, or session-family material may
have been exposed, treat it as identity-sensitive incident data and do not copy
it into the report. Revoke the relevant family/authorization epoch or rotate the
implicated signing/session boundary with explicit approval. A bound
missing/disabled/epoch mismatch or stale replay must revoke the family.
