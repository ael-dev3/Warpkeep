# 0.4 production menu resource baseline

Date: 30 September 2026 (Europe/Budapest)

Candidate source: `7d12e0168bc8b935910ef08a4d05abbd7f45b9bc`

Build: production `/ptr/` output from that exact source

## Result

A direct top-level Chromium load rendered the 0.4 menu, including its WARPKEEP
title, primary menu controls and 3D scene. After the scene settled, the browser
reported 53 same-origin resources and 3,833,259 encoded body bytes:

| Resource group | Bytes |
| --- | ---: |
| JavaScript | 1,818,372 |
| GLB models | 1,797,980 |
| PNG images | 124,420 |
| CSS | 92,487 |
| **Total** | **3,833,259** |

The cold loopback preview reported 3,849,159 transferred bytes including
response overhead and a 2,736 ms navigation load event. The menu models
account for real startup traffic: the Hegemony castle GLB was 801,300 bytes,
and the complete first-entry set requested no audio or video.

## Method and limits

The candidate was built with the pinned native Linux toolchain and
`DEPLOY_BASE=/ptr/`. A loopback-only static server mounted the generated `dist`
directory at `/ptr/` so the browser used the production paths and base URL. The
browser measured same-origin `PerformanceResourceTiming` entries on the direct
menu route. A temporary measurement overlay was placed in ignored build output
only and is removed by the next clean production build.

The local server did not compress responses or simulate latency, packet loss,
mobile CPU/GPU limits or a physical device. These are decoded asset and local
startup figures, not public CDN transfer measurements or mobile performance
acceptance. The 139 MB complete publishable asset set should not be read as the
first-menu download; the measured menu subset is 3.83 MB before transfer
compression. The full-stack responsive browser probe remains separate evidence
and does not substitute for owner PTR or phone acceptance.
