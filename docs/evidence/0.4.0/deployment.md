# Warpkeep 0.4 deployment evidence

Status: **pending**. This record is the authoritative destination for R15 and
must be updated only from an authenticated deployment and live readback.

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
and HTTP redirect to the HTTPS apex; one stale uncompressed `www` CDN variant
still returned the old 404 immediately after redeployment. The title,
menu and Alpha Terms rendered in a mobile browser. Public auth-bridge and G001
metadata/CORS probes passed. The complete old artifact had expired, and no
owner-session or private state readback was attempted; these baseline checks
do not satisfy 0.4 R15.

The public mirror now includes legal texts and provenance notices from that
historical source. The notices-only publication at
[`3ca5dad`](https://github.com/ael-dev3/Warpkeep-Live/commit/3ca5dadf7f287cefeaebe84bfaa7b49cc9e7ea58)
passed [Pages run 36312123405](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36312123405).
An intermediate link-correction commit `6b5f26f` was unsigned because the new
local deploy checkout lacked signing configuration; it changed no generated
app bytes. That configuration was fixed, and the signed current head
[`616eebf`](https://github.com/ael-dev3/Warpkeep-Live/commit/616eebfc67fa8888318515d7e33cac49eac5e473)
has a valid GitHub signature and successful
[Pages run 36312578563](https://github.com/ael-dev3/Warpkeep-Live/actions/runs/36312578563).
The live apex still returns the same 0.3.43 HTML hash. The signed successor
does not retroactively sign `6b5f26f`; preserve this note in the audit trail.

Record the exact reviewed source commit, Pages workflow run and artifact
identity, GitHub Pages URL, Cloudflare auth-bridge version/source, SpacetimeDB
database identities and program hashes, live frontend build identity, and the
post-deployment verification results. Keep tokens, private receipts, owner
identities and raw provider responses in the private operations store; link only
privacy-safe digests or secure references here.

What this record must not claim without fresh evidence: a successful provider
mutation, a deployed 0.4 frontend, an authenticated owner journey, preserved
Genesis 001 state, sealed Genesis 002 access, or recovery completion.

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
