# Lowlands Rabbit runtime selection

This record pins the three official Lowlands Rabbit runtime LODs from the
Warpkeep-Assets release
[`rabbit-runtime-ui-bundle-2026-07-30`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/rabbit-runtime-ui-bundle-2026-07-30).
The models are optional, visual-only wildlife for the land outside the Inner
Keep. They do not define collision, population, resources, ownership, rewards,
or any other gameplay authority.

## Exact source

| Item | Exact pin |
| --- | --- |
| Release tag commit | `d8c35bb01c399ecde711274ef43880d8d304ae44` |
| Trusted release manifest | 3,300 bytes; SHA-256 `c1009554053a793da979a8a1aae7558aade09bfbefcc53fcf2dae7a98a80a705` |
| Outer release ZIP | 2,717,585 bytes; SHA-256 `cf40e6c7149635a8cf6439e618e951219770491a7f364e7776b8af128461a3a9` |
| Nested privacy-sanitized ZIP | 2,710,713 bytes; SHA-256 `1ab9a02a39e68a3ddadcec4ac1824aafaf252f9cb068511e6341d2377f256dc3` |

The source release records public archival distribution as authorized by Ael
and makes no separate open-license grant. On 2026-08-04, Ael separately
authorized these exact three files for official Warpkeep repository/runtime
use while asking for animals outside the Inner Keep. That narrow integration
authorization does not relicense the archive, authorize unrelated reuse, or
approve activation, merge, or deployment.

## Runtime policy

High and Balanced scene quality use the Balanced rig by default. It has the
`Alert`, `Idle`, `Nibble`, and `Walk` clips. Reduced quality and reduced-motion
presentation use the Compact static LOD with no animation mixer. The High rig
remains available as an explicit close-detail option. All three models use one
embedded vertex-color material and have no external texture dependency.

The 2048px UI image is intentionally excluded. The exterior scene needs only
the three runtime GLBs, so unused UI media is not copied into Warpkeep.

## Reproduce and verify locally

Place the exact trusted release manifest at
`.cache/warpkeep-assets/rabbit-runtime-ui-bundle-2026-07-30/manifest.json` and
the exact release ZIP beside it. Then run:

```sh
npm run assets:audit:inner-keep-rabbit
npm run prepare:inner-keep-rabbit-assets
npm run verify:inner-keep-rabbit-assets
```

The audit validates the trusted release manifest, outer ZIP, nested sanitized
package, both nested manifests, complete member sets, and selected GLBs before
installation. Ordinary builds use only local content-addressed files and never
read the archive or access the network.
