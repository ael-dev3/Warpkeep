# Desktop QR authentication incident — 27 September 2026

All timestamps below are UTC (Budapest local time was UTC+02:00). This record
contains route/status/fixed event labels and deployment identifiers only. No
QR token, sign-in proof, FID, bearer token or raw Worker tail was retained.

## Outcome and cause

The owner could not complete desktop Farcaster QR sign-in. A fresh, sanitized
production trace showed a successful challenge followed by three exchange
HTTP 503 responses. Each exchange passed browser-binding verification but
stopped before `auth_epoch_resolved`. The failure was therefore in Farcaster
proof verification, before Maincloud admission or browser session parsing.

The production verifier requires **both** configured Optimism RPC-backed
instances of the official Farcaster auth client to return the same FID. If
either instance is unavailable, the consensus verifier returns
`FarcasterVerifierUnavailableError`, and the exchange route returns
`verification_unavailable`/503 while restoring a still-live challenge for
retry. An isolated probe from Cloudflare's edge repeatedly received 429 from
the source-pinned dRPC primary endpoint. PublicNode secondary and the official
OP Mainnet public endpoint completed the same registry read. The old primary
path's edge rate limit is the strongest supported cause of the 503s. The
prior production secret value was not disclosed by Cloudflare and the private
RPC-role fingerprint attestation was unavailable without the existing operator
credential, so this is a causal diagnosis rather than a direct secret readback.

Changing only the primary RPC secret to the tested OP Mainnet endpoint restored
the existing two-provider verifier. A disposable **unauthorized** signed proof
then returned the expected 401 instead of 503, and a fresh owner-approved QR
exchange returned 200 with `session_created`. The owner confirmed the browser
logged in. No Maincloud, Farcaster proof rule, session lifetime or gameplay
logic was relaxed.

## Evidence timeline

| Time (UTC) | Observation |
| --- | --- |
| **18:45:30.154** | Failed owner attempt: `OPTIONS /v2/farcaster/challenge` 204. |
| **18:45:30.186** | `POST /v2/farcaster/challenge` 201, `challenge_binding_created,challenge_issued`. |
| **18:45:49.068 / 18:45:49.103** | Exchange preflight 204; `POST /v2/farcaster/exchange` 503, `exchange_binding_verified,exchange_rejected`. No `auth_epoch_resolved`. |
| **18:45:49.707 / 18:45:49.745** | Exchange preflight 204; retry POST 503 with the same fixed rejection stage. |
| **18:45:50.832 / 18:45:50.877** | Exchange preflight 204; second retry POST 503 with the same fixed rejection stage. |
| **18:53:15.267** | A disposable unauthorized proof test completed with challenge 201 and exchange 503 (`unavailable`, 369 ms). This is the tool-result observation time, not the exchange request time. |
| **18:56:20.860** | Initial isolated Cloudflare-edge probe result observed: primary RPC classified `http_4xx` (63 ms; exact HTTP status not recorded in this first sample), PublicNode registry read succeeded (38 ms). |
| **18:57:18.608** | Edge-probe batch result observed: dRPC 429 (28 ms), PublicNode registry read succeeded (37 ms), `https://mainnet.optimism.io/` registry read succeeded (171 ms). |
| **18:57:28.756** | Three repeated batches observed: dRPC 429 (27/26/30 ms), PublicNode registry reads succeeded (34/31/32 ms), OP Mainnet registry reads succeeded (45/54/44 ms). The temporary preview had no production routes, bindings or secrets. These are result-observation times and durations, not exact HTTP request timestamps. |
| **19:00:15.748685** | Wrangler created secret-only Worker version `2b28a266-862b-45da-a747-3cea0a0d858c`, replacing only `FARCASTER_RPC_URL` with `https://mainnet.optimism.io/`. |
| **19:01:23.825605** | Deployment `b338c098-a33e-4922-a3a4-1c2d92a3b035` activated that version at 100%. |
| **19:01:56.720** | A disposable unauthorized proof received challenge POST 201. |
| **19:01:57.465** | Its exchange POST returned 401 after browser-binding verification. This established fail-closed verifier execution, not owner authentication. |
| **19:05:42.753** | Fresh owner attempt: `OPTIONS /v2/farcaster/challenge` 204. |
| **19:05:42.786** | `POST /v2/farcaster/challenge` 201, `challenge_binding_created,challenge_issued`. |
| **19:05:57.269** | Second challenge preflight 204. |
| **19:05:57.302** | Second `POST /v2/farcaster/challenge` 201, `challenge_binding_created,challenge_issued`. The trace does not identify why the browser issued a second challenge; no identity fields were captured. |
| **19:06:14.445** | `OPTIONS /v2/farcaster/exchange` 204. |
| **19:06:14.479** | `POST /v2/farcaster/exchange` 200, `exchange_binding_verified,auth_epoch_resolved,session_created,exchange_succeeded`. The owner subsequently confirmed the browser was logged in. |
| **19:06:22** | Signed public mirror commit `b6afe92e7b09197b1578d992103ac3c8f916d8ad` recorded the separately reviewed Alpha QR diagnostic client. This commit came **after** the successful exchange; no browser build hash was captured for that exact sign-in. |
| **19:07:15–19:07:48** | [GitHub Pages run 36343178620](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36343178620) built and deployed that exact public commit successfully. Its deploy job completed at 19:07:47. Live root, SPA fallback, owner canary and main JS matched the reviewed files. |
| **20:28 UTC (session observation)** | The owner reported a fresh QR scan had logged in successfully. The message did not include the scan's exact time, request trace, browser, or served build hash, so this is recorded as an owner confirmation, not as a timestamped Worker exchange or independent reproduction. |

The creation and deployment timestamps are from Cloudflare's version and
deployment metadata. Failed and successful sign-in route timestamps are from
the sanitized live Worker tail as captured in the local Codex session record.
The public publication timestamps are from the signed commit and GitHub
Actions run. The isolated edge probe and first synthetic proof retained result
observation times, not individual request timestamps. Retained production
Worker logs are disabled. The 20:28 UTC owner confirmation time is the
assistant-session observation time, not the scan time.

## Change and validation

- The prior Worker version `79dfceec-9810-4868-afca-5b794d08a9a5` remains
  the exact rollback target. Candidate and prior live version had the same
  script etag, runtime, all 27 binding names/types, and all plain-text binding
  values. Only the primary RPC secret was intentionally replaced. Public
  `/healthz` and release attestation remained healthy.
- The source expectation in
  [`scripts/auth-bridge-config-attestation.mjs`](../../../scripts/auth-bridge-config-attestation.mjs)
  now pins `https://mainnet.optimism.io/` as primary and retains PublicNode as
  independent secondary. The focused attestation test rejects the former dRPC
  role and passed 23/23 locally. The private fingerprint endpoint still needs
  `WARPKEEP_ADMIN_TOKEN_SECRET`; that credential was not available here, so
  its check is **not** claimed.
- The Alpha diagnostic client was built from signed private source
  [`5f77c3ce`](https://github.com/ael-dev3/Warpkeep/commit/5f77c3cec555823fd52b73c90080032867fc2ed4)
  and published as signed generated-only
  [`Warpkeep-Live@b6afe92`](https://github.com/ael-dev3/Warpkeep-Live/commit/b6afe92e7b09197b1578d992103ac3c8f916d8ad).
  All 338 staged build files matched the reviewed `dist`; the live HTML hash
  is `18658055f4fa1c2376fae34d9d34e400c4bb308f922de48aaeb604a1de0c3a4d`.
  Its clearer failure copy aids a future diagnosis but did **not** cause the
  19:06 recovery.

For recurrence, attach a sanitized `wrangler tail` with the
`warpkeep-production` profile **before** one new scan and compare the fixed
exchange stage to this record. Test both configured RPC paths from the Worker
edge; local-machine success alone is insufficient. Do not run a source/config
`wrangler deploy` from the checked-in Worker TOML: its rollout variables are
stale. Review a proposed version against live script/runtime/binding shape,
activate only the intended candidate and read back the deployment. The 0.4
PTR remains unreleased; this incident proves Alpha QR sign-in, not release
acceptance.
