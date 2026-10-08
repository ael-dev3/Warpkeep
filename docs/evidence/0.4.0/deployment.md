# Warpkeep 0.4 deployment evidence

Status: **pending**. This record is the authoritative destination for R15 and
must be updated only from an authenticated deployment and live readback.

## Current delivery scope — 8 October 2026

The existing Alpha root remains reachable, and the immutable owner-PTR frontend
is already statically delivered at https://warpkeep.com/ptr/. Accepted frontend
source is 9ea4821a, public artifact 3634aa82 and Cloudflare Pages deployment
8a469929. Its full postflight passed all 800 files and both fallback routes,
as recorded in the release checklist and live-delivery status. Current root and
PTR HTML hashes remain ad741690ebcced015fde8d49d05c8ac63d50d8bd38378039669850ea8dafbd33
and 5fe1374aeb73b5d51b2e7a00585624edf52a6c729ce08f903f40690ac66435fa;
referenced JS/CSS return HTTP 200. These public GETs establish availability,
not authenticated owner gameplay or a fresh provider-account inspection.

R15 remains pending: an eligible atlas, owner admission/authenticated journey,
actual device/performance acceptance, and final provider/DNS/cutover readback
are not yet proved. Use the Cloudflare Pages direct-upload lane and preserve
Alpha rollback. Warpkeep-Live is the generated Alpha/provenance mirror; its
historical GitHub Pages runs do not establish the current owner-PTR release.

## Historical Alpha restoration and QR recovery — 27 September 2026

At this historical checkpoint, the public site was Alpha 0.3.43 and the 0.4 PTR
had not been deployed. Its signed diagnostic client source was
[`5f77c3ce`](https://github.com/ael-dev3/Warpkeep/commit/5f77c3cec555823fd52b73c90080032867fc2ed4),
published as generated files in
[`Warpkeep-Live@b6afe92`](https://github.com/ael-dev3/Warpkeep-Live/commit/b6afe92e7b09197b1578d992103ac3c8f916d8ad).
[Pages run 36343178620](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36343178620)
deployed that commit by 19:07:48 UTC on 27 September. Live root, SPA fallback,
owner canary and main JS matched the reviewed files; live `index.html` SHA-256
was `18658055f4fa1c2376fae34d9d34e400c4bb308f922de48aaeb604a1de0c3a4d`.

The source-pinned primary Optimism RPC endpoint repeatedly returned 429 from
the Cloudflare edge while bound QR exchanges returned 503 before admission.
That edge rate limit is the strongest supported cause; the previous secret
value could not be read back directly. A secret-only Worker version
`2b28a266-862b-45da-a747-3cea0a0d858c` was created at
**19:00:15.748685 UTC** and deployment
`b338c098-a33e-4922-a3a4-1c2d92a3b035` activated it at
**19:01:23.825605 UTC**. It replaced the primary RPC with the tested OP
Mainnet public endpoint while preserving the independent PublicNode secondary
and the existing verifier. A fresh owner-approved QR exchange returned 200 at
**19:06:14.479 UTC**, with `auth_epoch_resolved,session_created`, and the owner
confirmed browser login. The public mirror commit was created at 19:06:22 UTC,
**after** that successful exchange. No exact frontend build hash was captured
for the sign-in, so the later public artifact cannot be credited with causing
it. See the [timestamped QR-auth incident record](qr-auth-incident-2026-09-27.md)
for the failed attempts, edge probes, recovery and limitations. This Alpha
authentication result does not satisfy the 0.4 PTR deployment gate.

The preceding signed QR diagnostic and bounded clock-lag repair source was
[`2d6811a8`](https://github.com/ael-dev3/Warpkeep/commit/2d6811a861d42d7ca191ac30e2215176db1adabd),
published as generated files in
[`Warpkeep-Live@6568687`](https://github.com/ael-dev3/Warpkeep-Live/commit/6568687fccd1a317b1958f71bad33b36226e0b61).
[Pages run 36334223725](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36334223725)
succeeded on 27 September. The HTTPS apex returned 200 with `index.html`
SHA-256 `eb1b0eafa2c116e8a6c47956f1e72324a828b17bb2f36740047ab53b8d91d5f3`,
matching that reviewed build; its SPA fallback matched byte-for-byte and its
main asset returned 200. At that checkpoint, no successful phone-approved
desktop QR sign-in had been observed.

The old Alpha 0.3.43 site was restored on 27 September 2026, separately from
the 0.4 release. Last successful historical source:
[`f39d57c`](https://github.com/ael-dev3/Warpkeep/commit/f39d57c8622077e6543a16e5610d0e4ec73910da).
Rebuilt generated files: [`Warpkeep-Live@3e9170f`](https://github.com/ael-dev3/Warpkeep-Live/commit/3e9170fdc14e5b73083db7dd381de77236d4f06c).
[Pages run 36310726111](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36310726111)
completed successfully. Live `https://warpkeep.com/` returned 200 and SHA-256
`e8139922fac3619edff5cbece46a3d9516b75b2b26801935068459502b57d061`
for `index.html`, matching the historical served page and local rebuilt file.
The live main JS/CSS, Farcaster manifest and privacy page matched the local
build byte-for-byte. Signed README-only follow-up
[`da5a3988`](https://github.com/ael-dev3/Warpkeep-Live/commit/da5a3988dd456da1f7e2d909d078bff0cf958db3)
and [Pages run 36311370850](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36311370850)
also succeeded without changing the app bytes. Browser-style GETs to `www`
and HTTP redirect to the HTTPS apex. One stale uncompressed `www` CDN variant
initially returned the old 404; after cache expiry it also returned 301 to the
HTTPS apex on 27 September at 10:30 UTC. The title,
menu and Alpha Terms rendered in a mobile browser. Public auth-bridge and G001
metadata/CORS probes passed. The complete old artifact had expired, and no
owner-session or private state readback was attempted; these baseline checks
do not satisfy 0.4 R15.

The public mirror includes legal texts and provenance notices from that
historical source. The notices-only publication at
[`3ca5dad`](https://github.com/ael-dev3/Warpkeep-Live/commit/3ca5dadf7f287cefeaebe84bfaa7b49cc9e7ea58)
passed [Pages run 36312123405](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36312123405).
An intermediate link-correction commit `6b5f26f` was unsigned because the new
local deploy checkout lacked signing configuration; it changed no generated
app bytes. That configuration was fixed, and the signed later checkpoint
[`616eebf`](https://github.com/ael-dev3/Warpkeep-Live/commit/616eebfc67fa8888318515d7e33cac49eac5e473)
has a valid GitHub signature and successful
[Pages run 36312578563](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36312578563).
The signed successor
does not retroactively sign `6b5f26f`; preserve this note in the audit trail.

Record the exact reviewed source commit, Pages workflow run and artifact
identity, GitHub Pages URL, Cloudflare auth-bridge version/source, SpacetimeDB
database identities and program hashes, live frontend build identity, and the
post-deployment verification results. Keep tokens, private receipts, owner
identities and raw provider responses in the private operations store; link only
privacy-safe digests or secure references here.

What this record must not claim without fresh evidence: a successful provider
mutation, a deployed 0.4 frontend or authenticated **0.4 PTR** owner journey,
preserved Genesis 001 state, sealed Genesis 002 access, or recovery completion.

Evidence template:

```text
Date and gate:
Reviewed source / protected workflow run:
Pages artifact, URL and build identity:
Auth bridge version, source and configuration identity:
SpacetimeDB target identities and program hashes:
Live probes and observed results:
Rollback predecessor and readback:
Privacy-safe evidence links:
Limitations and next gate:
```
