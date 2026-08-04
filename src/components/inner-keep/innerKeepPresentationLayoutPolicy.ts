/**
 * Canonical client-facing Inner Keep presentation layout.
 *
 * SpacetimeDB stores only the construction slots needed for authority. This
 * manifest pins the denser presentation contract without turning decorative
 * props into database rows. Every asset path is an installed, exact output of
 * the separately reviewed owner-authorized runtime selection.
 */

export const INNER_KEEP_PRESENTATION_LAYOUT_ID = 'genesis-001-inner-keep-v1';
export const INNER_KEEP_PRESENTATION_LAYOUT_VERSION = 1;
export const INNER_KEEP_PRESENTATION_LAYOUT_POLICY_VERSION =
  'genesis-001-inner-keep-presentation-layout-v1';
export const INNER_KEEP_PRESENTATION_ASSET_SELECTION_DIGEST =
  '00304c5dbf819cec6cb656996c1105f64efcf36acf8099c431f5b04b822679f0';
export const INNER_KEEP_PRESENTATION_ASSET_USE_STATUS =
  'authorized-owner-runtime-use';

export type InnerKeepPresentationAssetQuality = 'high' | 'balanced' | 'compact';
export type InnerKeepPresentationAssetFamily =
  | 'buildings'
  | 'landmarks'
  | 'palisade'
  | 'trees'
  | 'town-items'
  | 'stone';
export type InnerKeepPresentationVector3 = readonly [number, number, number];

export type InnerKeepPresentationAsset = Readonly<{
  assetId: string;
  sourceAssetId: string;
  family: InnerKeepPresentationAssetFamily;
  boundsMeters: InnerKeepPresentationVector3;
  runtimePaths: Readonly<Record<InnerKeepPresentationAssetQuality, string>>;
  qualityAvailability: readonly InnerKeepPresentationAssetQuality[];
}>;

const ALL_QUALITIES = Object.freeze([
  'high',
  'balanced',
  'compact'
] as const);

function asset(
  assetId: string,
  sourceAssetId: string,
  family: InnerKeepPresentationAssetFamily,
  boundsMeters: InnerKeepPresentationVector3,
  runtimePaths: Readonly<Record<InnerKeepPresentationAssetQuality, string>>,
): InnerKeepPresentationAsset {
  return Object.freeze({
    assetId,
    sourceAssetId,
    family,
    boundsMeters: Object.freeze(boundsMeters),
    runtimePaths: Object.freeze(runtimePaths),
    qualityAvailability: ALL_QUALITIES,
  });
}

/** Exact content-addressed paths from the reviewed archive selection record. */
export const INNER_KEEP_PRESENTATION_ASSETS: readonly InnerKeepPresentationAsset[] =
  Object.freeze([
    asset('city-mill', 'warpkeep.city-buildings.city-mill', 'buildings', [9.3, 7.1229, 7.5], {
      high: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-mill-high-8613faf8ac5a61f5.glb',
      balanced: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-mill-balanced-0963ee142eb0d8ea.glb',
      compact: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-mill-compact-80419c9566ea5ab5.glb',
    }),
    asset('lumber-camp', 'warpkeep.city-buildings.lumber-camp', 'buildings', [8.6, 6.05, 6.8], {
      high: 'public/models/hegemony/inner-keep/buildings/inner-keep-lumber-camp-high-a4f6831dd6ddcb09.glb',
      balanced: 'public/models/hegemony/inner-keep/buildings/inner-keep-lumber-camp-balanced-d8f33e487545f44a.glb',
      compact: 'public/models/hegemony/inner-keep/buildings/inner-keep-lumber-camp-compact-1be188b3bb6a90b5.glb',
    }),
    asset('city-stoneworks', 'warpkeep.city-buildings.city-stoneworks', 'buildings', [9, 5.39, 7.2], {
      high: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-stoneworks-high-01df9557bccaed14.glb',
      balanced: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-stoneworks-balanced-81f8818339900c2f.glb',
      compact: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-stoneworks-compact-174fd2f984065937.glb',
    }),
    asset('city-goldworks', 'warpkeep.city-buildings.city-goldworks', 'buildings', [9, 5.39, 7.2], {
      high: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-goldworks-high-9cd4a9851ce291a9.glb',
      balanced: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-goldworks-balanced-662fa7a5983818cf.glb',
      compact: 'public/models/hegemony/inner-keep/buildings/inner-keep-city-goldworks-compact-ed47ade5517e78da.glb',
    }),
    asset('palisade-wall-straight-4m', 'warpkeep.inner_keep.wood_palisade.W02', 'palisade', [4, 3.2, 0.65], {
      high: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-straight-4m-high-00cdf8624e12b594.glb',
      balanced: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-straight-4m-balanced-c16ecc1c5ea8adba.glb',
      compact: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-straight-4m-compact-d0d33e6da38ed1f7.glb',
    }),
    asset('palisade-wall-straight-8m', 'warpkeep.inner_keep.wood_palisade.W03', 'palisade', [8, 3.2, 0.65], {
      high: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-straight-8m-high-84d5d73d4b56baa9.glb',
      balanced: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-straight-8m-balanced-d3f7ad3299cfc932.glb',
      compact: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-straight-8m-compact-70aa97418582b41b.glb',
    }),
    asset('palisade-wall-corner-90', 'warpkeep.inner_keep.wood_palisade.W10', 'palisade', [4, 3.2, 4], {
      high: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-corner-90-high-6641c3b823412e2f.glb',
      balanced: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-corner-90-balanced-c138e93283e0daf6.glb',
      compact: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-wall-corner-90-compact-7a9f51fa1355fc6c.glb',
    }),
    asset('palisade-gate-frame-6m', 'warpkeep.palisade.inner_keep.W15', 'palisade', [6, 5, 1.3], {
      high: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-frame-6m-high-d4f580ae04a3b94e.glb',
      balanced: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-frame-6m-balanced-af67ba3dc8085d80.glb',
      compact: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-frame-6m-compact-c144a11a4f496e4b.glb',
    }),
    asset('palisade-gate-leaf-left', 'warpkeep.palisade.inner_keep.W16', 'palisade', [2.1, 3.45, 0.28], {
      high: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-leaf-left-high-a3e3e5eb7b13568e.glb',
      balanced: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-leaf-left-balanced-8b7009dccabeb38b.glb',
      compact: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-leaf-left-compact-6653afb68006acb2.glb',
    }),
    asset('palisade-gate-leaf-right', 'warpkeep.palisade.inner_keep.W17', 'palisade', [2.1, 3.45, 0.28], {
      high: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-leaf-right-high-0b397bb750ba886e.glb',
      balanced: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-leaf-right-balanced-e59ec83f925c9741.glb',
      compact: 'public/models/hegemony/inner-keep/palisade/inner-keep-palisade-gate-leaf-right-compact-5b7e4895ecf8f2d5.glb',
    }),
    asset('courtyard-linden-teardrop', 'warpkeep.tree.ornamental.courtyard-linden-teardrop', 'trees', [2.876495, 5.2, 2.040444], {
      high: 'public/models/hegemony/inner-keep/trees/inner-keep-courtyard-linden-teardrop-high-e1f548983c081308.glb',
      balanced: 'public/models/hegemony/inner-keep/trees/inner-keep-courtyard-linden-teardrop-balanced-70e50e8f3cc5de23.glb',
      compact: 'public/models/hegemony/inner-keep/trees/inner-keep-courtyard-linden-teardrop-compact-556a89c1ad3f6a31.glb',
    }),
    asset('pruned-ornamental-three-tier', 'warpkeep.tree.ornamental.pruned-ornamental-tiered', 'trees', [2.788351, 4.7, 2.738395], {
      high: 'public/models/hegemony/inner-keep/trees/inner-keep-pruned-ornamental-three-tier-high-8bbe6ec99f51822b.glb',
      balanced: 'public/models/hegemony/inner-keep/trees/inner-keep-pruned-ornamental-three-tier-balanced-72bdcd76ef4bf9f4.glb',
      compact: 'public/models/hegemony/inner-keep/trees/inner-keep-pruned-ornamental-three-tier-compact-6995d4e430b3b1ba.glb',
    }),
    asset('giant-ancient-cedar', 'warpkeep.tree.fantasy.giant-ancient-cedar', 'trees', [13.105342, 11.311282, 9.922385], {
      high: 'public/models/hegemony/inner-keep/trees/inner-keep-giant-ancient-cedar-high-a27d4410172bfba2.glb',
      balanced: 'public/models/hegemony/inner-keep/trees/inner-keep-giant-ancient-cedar-balanced-6563723d5f37cb00.glb',
      compact: 'public/models/hegemony/inner-keep/trees/inner-keep-giant-ancient-cedar-compact-48d82b31a418db32.glb',
    }),
    asset('compact-processional-standard', 'compact-processional-standard', 'town-items', [1.6341, 3.5823, 1.0083], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-compact-processional-standard-high-2b8b1a6b5c735374.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-compact-processional-standard-balanced-9cee7a39ec36ffb0.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-compact-processional-standard-compact-10ddd768469d4f4f.glb',
    }),
    asset('roofed-noticeboard', 'roofed-noticeboard', 'town-items', [2.92, 3.3079, 0.98], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-roofed-noticeboard-high-8d45890e63829407.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-roofed-noticeboard-balanced-91976a7e7e6ec54f.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-roofed-noticeboard-compact-dfd35c9c36f2f4da.glb',
    }),
    asset('directional-signpost', 'directional-signpost', 'town-items', [1.9564, 3.37, 0.9476], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-directional-signpost-high-8ab4ca08af77c67b.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-directional-signpost-balanced-1e41b951b18a6395.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-directional-signpost-compact-8afe0112a0de6af8.glb',
    }),
    asset('timber-bench', 'timber-bench', 'town-items', [3.08, 2.1482, 0.9575], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-bench-high-e96e0add043678ad.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-bench-balanced-625b24648f9fbdae.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-bench-compact-b77c20806cdf61e2.glb',
    }),
    asset('timber-post-lamp', 'timber-post-lamp', 'town-items', [1.3204, 3.435, 0.78], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-post-lamp-high-bf0d7f23315858a8.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-post-lamp-balanced-381b847971a6cc54.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-post-lamp-compact-5f35fa874a95c04b.glb',
    }),
    asset('stone-pedestal-brazier', 'stone-pedestal-brazier', 'town-items', [1.25, 2.6396, 1.25], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-stone-pedestal-brazier-high-c6d2485ca58328e1.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-stone-pedestal-brazier-balanced-6e9b6f425e081277.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-stone-pedestal-brazier-compact-35a276eee41bbb72.glb',
    }),
    asset('timber-water-trough', 'timber-water-trough', 'town-items', [3.43, 1.48, 1.2638], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-water-trough-high-66a56aae3d4a762c.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-water-trough-balanced-6425e366ed4276e8.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-timber-water-trough-compact-76408969d1a42d95.glb',
    }),
    asset('formal-hedge-straight', 'warpkeep.town.flora.formal-hedge-straight', 'town-items', [4.02824, 1.341619, 1.366458], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-formal-hedge-straight-high-ba22ccdbef21b42c.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-formal-hedge-straight-balanced-d619e7c26a496ba5.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-formal-hedge-straight-compact-3724b124e4504f98.glb',
    }),
    asset('formal-hedge-corner', 'warpkeep.town.flora.formal-hedge-corner', 'town-items', [4.141878, 1.353266, 4.025798], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-formal-hedge-corner-high-e87710f79704b117.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-formal-hedge-corner-balanced-088946fbca5f5b86.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-formal-hedge-corner-compact-0074e6825468a2c8.glb',
    }),
    asset('clipped-boxwood-mound', 'warpkeep.town.flora.clipped-boxwood-mound', 'town-items', [1.967486, 1.515793, 1.94], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-clipped-boxwood-mound-high-71bd32a43e6f81dd.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-clipped-boxwood-mound-balanced-6e447757d3a205d9.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-clipped-boxwood-mound-compact-c01e8db707adf31b.glb',
    }),
    asset('picket-fence-4m', 'warpkeep.town-hardscape.th02', 'town-items', [4, 1.25, 0.3], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-picket-fence-4m-high-a3a5044e87569151.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-picket-fence-4m-balanced-63f09802eac8c246.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-picket-fence-4m-compact-8d62f006b21fd721.glb',
    }),
    asset('dirt-road-straight-4m', 'warpkeep.town-hardscape.th07', 'town-items', [4, 0.12, 2.4], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-straight-4m-high-d572f8bc4e9d38d4.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-straight-4m-balanced-cec2db4515a24d8f.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-straight-4m-compact-88065d72da8b6ceb.glb',
    }),
    asset('dirt-road-curve-90-4m', 'warpkeep.town-hardscape.th08', 'town-items', [4, 0.12, 4], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-curve-90-4m-high-b93f180794c8de5c.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-curve-90-4m-balanced-e3c0221f0b8a5338.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-curve-90-4m-compact-8434a330607f9993.glb',
    }),
    asset('dirt-road-t-junction-4m', 'warpkeep.town-hardscape.th09', 'town-items', [4, 0.12, 4], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-t-junction-4m-high-8df463a83ecdf544.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-t-junction-4m-balanced-0278db0236891174.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-dirt-road-t-junction-4m-compact-07c1f95ab8841bb0.glb',
    }),
    asset('cobble-road-straight-4m', 'warpkeep.town-hardscape.th11', 'town-items', [4, 0.14, 2.4], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-cobble-road-straight-4m-high-2066fd90088760b6.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-cobble-road-straight-4m-balanced-54b23ca15974c825.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-cobble-road-straight-4m-compact-6d838a7ea65cf313.glb',
    }),
    asset('cobble-plaza-6m', 'warpkeep.town-hardscape.th13', 'town-items', [6, 0.1625, 6], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-cobble-plaza-6m-high-85662cda60bedecf.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-cobble-plaza-6m-balanced-965d83a7e208b704.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-cobble-plaza-6m-compact-767384a66fae7938.glb',
    }),
    asset('stone-curb-2m', 'warpkeep.town-hardscape.th18', 'town-items', [2, 0.3, 0.45], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-stone-curb-2m-high-46cbb80d3b92d3f3.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-stone-curb-2m-balanced-6a34e355098ba968.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-stone-curb-2m-compact-ad9a56588710e3e9.glb',
    }),
    asset('boulder-cluster-3m', 'warpkeep.town-hardscape.th15', 'town-items', [3, 1.5, 2.4], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-boulder-cluster-3m-high-a1859faf45ecf03e.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-boulder-cluster-3m-balanced-90235d94748ba8f9.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-boulder-cluster-3m-compact-06849c7703cc1e17.glb',
    }),
    asset('masonry-rubble-2m', 'warpkeep.town-hardscape.th16', 'town-items', [2, 0.8, 1.6], {
      high: 'public/models/hegemony/inner-keep/town-items/inner-keep-masonry-rubble-2m-high-ff69c805c0321fbf.glb',
      balanced: 'public/models/hegemony/inner-keep/town-items/inner-keep-masonry-rubble-2m-balanced-02f591b8bf2362c4.glb',
      compact: 'public/models/hegemony/inner-keep/town-items/inner-keep-masonry-rubble-2m-compact-06a6458760fcc83f.glb',
    }),
    asset('canopied-keep-well', 'CivicWell_Canopied', 'stone', [3.4, 3.6, 3.4], {
      high: 'public/models/hegemony/inner-keep/stone/inner-keep-canopied-keep-well-high-fa7b15b156fc13cb.glb',
      balanced: 'public/models/hegemony/inner-keep/stone/inner-keep-canopied-keep-well-balanced-750ea19f085dd660.glb',
      compact: 'public/models/hegemony/inner-keep/stone/inner-keep-canopied-keep-well-compact-8628434c2c8c3fde.glb',
    }),
    asset('collapsed-courtyard-arch', 'warpkeep.architecture.inner_keep.RuinArch_Collapsed4m', 'stone', [4.4, 4, 1.6], {
      high: 'public/models/hegemony/inner-keep/stone/inner-keep-collapsed-courtyard-arch-high-087f2557b6595d60.glb',
      balanced: 'public/models/hegemony/inner-keep/stone/inner-keep-collapsed-courtyard-arch-balanced-db433981ff318419.glb',
      compact: 'public/models/hegemony/inner-keep/stone/inner-keep-collapsed-courtyard-arch-compact-bb8b41dbe991314c.glb',
    }),
    asset('masonry-rubble-cluster', 'warpkeep.architecture.inner_keep.RuinRubble_Masonry3m', 'stone', [3.2, 1.1, 2.6], {
      high: 'public/models/hegemony/inner-keep/stone/inner-keep-masonry-rubble-cluster-high-9bed961f4df79a58.glb',
      balanced: 'public/models/hegemony/inner-keep/stone/inner-keep-masonry-rubble-cluster-balanced-33f632b032467856.glb',
      compact: 'public/models/hegemony/inner-keep/stone/inner-keep-masonry-rubble-cluster-compact-fbcc413bfd0f0cee.glb',
    }),
    asset('breached-keep-wall', 'warpkeep.architecture.inner_keep.RuinWall_Breached4m', 'stone', [4, 2.8, 1.1], {
      high: 'public/models/hegemony/inner-keep/stone/inner-keep-breached-keep-wall-high-802c1017e987e03b.glb',
      balanced: 'public/models/hegemony/inner-keep/stone/inner-keep-breached-keep-wall-balanced-914de93f1e8928c8.glb',
      compact: 'public/models/hegemony/inner-keep/stone/inner-keep-breached-keep-wall-compact-95131380fca529e6.glb',
    }),
    asset('grand-covenant-cathedral', 'warpkeep.city-buildings.grand-covenant-cathedral', 'landmarks', [34, 31.5, 29.02], {
      high: 'public/models/hegemony/inner-keep/landmarks/inner-keep-grand-covenant-cathedral-high-9bf438bdf020d274.glb',
      balanced: 'public/models/hegemony/inner-keep/landmarks/inner-keep-grand-covenant-cathedral-balanced-c90cf49f6b90325b.glb',
      compact: 'public/models/hegemony/inner-keep/landmarks/inner-keep-grand-covenant-cathedral-compact-cea4eb9e4de9c323.glb',
    }),
    asset('city-barracks', 'warpkeep.city-buildings.city-barracks', 'landmarks', [16, 10.1, 13], {
      high: 'public/models/hegemony/inner-keep/landmarks/inner-keep-city-barracks-high-21b4c204adbde086.glb',
      balanced: 'public/models/hegemony/inner-keep/landmarks/inner-keep-city-barracks-balanced-3a22b6e910d4dd1b.glb',
      compact: 'public/models/hegemony/inner-keep/landmarks/inner-keep-city-barracks-compact-7f90bd96932b7fea.glb',
    }),
  ]);

export type InnerKeepPresentationSlot = Readonly<{
  slotId: string;
  footprintClass: 'medium' | 'large';
  positionMeters: InnerKeepPresentationVector3;
  rotationYMilliDegrees: number;
  active: boolean;
}>;

export const INNER_KEEP_PRESENTATION_SLOTS: readonly InnerKeepPresentationSlot[] =
  Object.freeze([
    Object.freeze({ slotId: 'inner-keep-slot-m01', footprintClass: 'medium', positionMeters: Object.freeze([-7, 0, -3.2] as const), rotationYMilliDegrees: 25_000, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m02', footprintClass: 'medium', positionMeters: Object.freeze([-3.8, 0, -4.8] as const), rotationYMilliDegrees: 15_000, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m03', footprintClass: 'medium', positionMeters: Object.freeze([3.8, 0, -4.8] as const), rotationYMilliDegrees: 345_000, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m04', footprintClass: 'medium', positionMeters: Object.freeze([7, 0, -3.2] as const), rotationYMilliDegrees: 335_000, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m05', footprintClass: 'medium', positionMeters: Object.freeze([-7.2, 0, 1.9] as const), rotationYMilliDegrees: 155_000, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m06', footprintClass: 'medium', positionMeters: Object.freeze([-4.3, 0, 4.9] as const), rotationYMilliDegrees: 170_000, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m07', footprintClass: 'medium', positionMeters: Object.freeze([4.3, 0, 4.9] as const), rotationYMilliDegrees: 190_000, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-m08', footprintClass: 'medium', positionMeters: Object.freeze([7.2, 0, 1.9] as const), rotationYMilliDegrees: 205_000, active: true }),
    Object.freeze({ slotId: 'inner-keep-slot-l01', footprintClass: 'large', positionMeters: Object.freeze([-10.2, 0, -6.9] as const), rotationYMilliDegrees: 35_000, active: false }),
    Object.freeze({ slotId: 'inner-keep-slot-l02', footprintClass: 'large', positionMeters: Object.freeze([10.2, 0, -6.9] as const), rotationYMilliDegrees: 325_000, active: false }),
    Object.freeze({ slotId: 'inner-keep-slot-l03', footprintClass: 'large', positionMeters: Object.freeze([-10, 0, 7.2] as const), rotationYMilliDegrees: 145_000, active: false }),
    Object.freeze({ slotId: 'inner-keep-slot-l04', footprintClass: 'large', positionMeters: Object.freeze([10, 0, 7.2] as const), rotationYMilliDegrees: 215_000, active: false }),
  ]);

export type InnerKeepPresentationPlacementInstance = Readonly<{
  placementId: string;
  positionMeters: InnerKeepPresentationVector3;
  rotationMilliDegrees: InnerKeepPresentationVector3;
  scalePermille: InnerKeepPresentationVector3;
}>;

export type InnerKeepPresentationPlacementGroup = Readonly<{
  assetId: string;
  anchor: 'fixed' | 'active-medium-slot-template';
  slotIds: readonly string[];
  footprint: Readonly<{
    kind: 'asset-bounds-xz' | 'medium-slot-box';
    halfExtentsMeters?: readonly [number, number];
    clearanceMarginMeters: number;
  }>;
  pickingRole: 'none' | 'native-slot-control';
  collisionClearanceRole:
    | 'slot-occupant'
    | 'slot-level-dressing'
    | 'perimeter-solid'
    | 'gate-opening'
    | 'road-surface'
    | 'trunk-only-presentation'
    | 'decorative-slot-clearance'
    | 'north-edge-scenery'
    | 'primary-civic-anchor'
    | 'garrison-anchor';
  qualityAvailability: readonly InnerKeepPresentationAssetQuality[];
  instances: readonly InnerKeepPresentationPlacementInstance[];
}>;

function instance(
  placementId: string,
  positionMeters: InnerKeepPresentationVector3,
  rotationYMilliDegrees = 0,
  scalePermille = 1_000,
): InnerKeepPresentationPlacementInstance {
  return Object.freeze({
    placementId,
    positionMeters: Object.freeze(positionMeters),
    rotationMilliDegrees: Object.freeze([0, rotationYMilliDegrees, 0] as const),
    scalePermille: Object.freeze([scalePermille, scalePermille, scalePermille] as const),
  });
}

const ACTIVE_MEDIUM_SLOT_IDS = Object.freeze(
  INNER_KEEP_PRESENTATION_SLOTS.filter((slot) => slot.active).map((slot) => slot.slotId),
);

function placementGroup(
  assetId: string,
  collisionClearanceRole: InnerKeepPresentationPlacementGroup['collisionClearanceRole'],
  instances: readonly InnerKeepPresentationPlacementInstance[],
  options: Readonly<{
    anchor?: InnerKeepPresentationPlacementGroup['anchor'];
    slotIds?: readonly string[];
    pickingRole?: InnerKeepPresentationPlacementGroup['pickingRole'];
    footprintKind?: InnerKeepPresentationPlacementGroup['footprint']['kind'];
    halfExtentsMeters?: readonly [number, number];
    clearanceMarginMeters?: number;
  }> = {},
): InnerKeepPresentationPlacementGroup {
  return Object.freeze({
    assetId,
    anchor: options.anchor ?? 'fixed',
    slotIds: Object.freeze([...(options.slotIds ?? [])]),
    footprint: Object.freeze({
      kind: options.footprintKind ?? 'asset-bounds-xz',
      ...(options.halfExtentsMeters === undefined
        ? {}
        : { halfExtentsMeters: Object.freeze(options.halfExtentsMeters) }),
      clearanceMarginMeters: options.clearanceMarginMeters ?? 0.2,
    }),
    pickingRole: options.pickingRole ?? 'none',
    collisionClearanceRole,
    qualityAvailability: ALL_QUALITIES,
    instances: Object.freeze([...instances]),
  });
}

function buildingTemplate(
  assetId: string,
  scalePermille: number,
  halfExtentsMeters: readonly [number, number],
): InnerKeepPresentationPlacementGroup {
  return placementGroup(
    assetId,
    'slot-occupant',
    [instance(`${assetId}:active-medium-slot-template`, [0, 0, 0], 0, scalePermille)],
    {
      anchor: 'active-medium-slot-template',
      slotIds: ACTIVE_MEDIUM_SLOT_IDS,
      pickingRole: 'native-slot-control',
      footprintKind: 'medium-slot-box',
      halfExtentsMeters,
      clearanceMarginMeters: 0.12,
    },
  );
}

/**
 * Fixed placements are presentation-only. Slot templates compose their local
 * transform with the canonical slot transform above; the browser never sends
 * a transform to gameplay authority.
 */
export const INNER_KEEP_PRESENTATION_PLACEMENTS:
readonly InnerKeepPresentationPlacementGroup[] = Object.freeze([
  buildingTemplate('city-mill', 300, [1.395, 1.125]),
  buildingTemplate('lumber-camp', 320, [1.376, 1.088]),
  buildingTemplate('city-stoneworks', 310, [1.395, 1.116]),
  buildingTemplate('city-goldworks', 310, [1.395, 1.116]),
  placementGroup('grand-covenant-cathedral', 'primary-civic-anchor', [
    instance('grand-covenant-cathedral-main-building', [0, 0, -11.8], 0, 300),
  ], { clearanceMarginMeters: 0.8 }),
  placementGroup('city-barracks', 'garrison-anchor', [
    instance('shieldcourt-barracks-west-garrison', [-12.7, 0, -0.4], 0, 360),
  ], { clearanceMarginMeters: 0.55 }),
  placementGroup('palisade-wall-straight-4m', 'perimeter-solid', [
    instance('wall-south-gate-west-infill', [-5, 0, 10.5]),
    instance('wall-south-gate-east-infill', [5, 0, 10.5]),
    instance('wall-west-south-infill', [-16.2, 0, 8.75], 90_000),
    instance('wall-east-south-infill', [16.2, 0, 8.75], 90_000),
  ], { clearanceMarginMeters: 0.35 }),
  placementGroup('palisade-wall-straight-8m', 'perimeter-solid', [
    instance('wall-north-west-outer', [-12, 0, -17]),
    instance('wall-north-west-inner', [-4, 0, -17]),
    instance('wall-north-east-inner', [4, 0, -17]),
    instance('wall-north-east-outer', [12, 0, -17]),
    instance('wall-south-west', [-11, 0, 10.5]),
    instance('wall-south-east', [11, 0, 10.5]),
    instance('wall-west-far-north', [-16.2, 0, -13], 90_000),
    instance('wall-west-north', [-16.2, 0, -5], 90_000),
    instance('wall-west-south', [-16.2, 0, 3], 90_000),
    instance('wall-east-far-north', [16.2, 0, -13], 90_000),
    instance('wall-east-north', [16.2, 0, -5], 90_000),
    instance('wall-east-south', [16.2, 0, 3], 90_000),
  ], { clearanceMarginMeters: 0.35 }),
  placementGroup('palisade-wall-corner-90', 'perimeter-solid', [
    instance('wall-corner-north-west', [-16.2, 0, -17]),
    instance('wall-corner-north-east', [16.2, 0, -17], 90_000),
    instance('wall-corner-south-east', [16.2, 0, 10.5], 180_000),
    instance('wall-corner-south-west', [-16.2, 0, 10.5], 270_000),
  ], { clearanceMarginMeters: 0.35 }),
  placementGroup('palisade-gate-frame-6m', 'gate-opening', [
    instance('south-gate-frame', [0, 0, 10.5]),
  ], { clearanceMarginMeters: 0.4 }),
  placementGroup('palisade-gate-leaf-left', 'gate-opening', [
    instance('south-gate-leaf-left-open', [-1.25, 0, 10.25], -65_000),
  ], { clearanceMarginMeters: 0.2 }),
  placementGroup('palisade-gate-leaf-right', 'gate-opening', [
    instance('south-gate-leaf-right-open', [1.25, 0, 10.25], 65_000),
  ], { clearanceMarginMeters: 0.2 }),
  placementGroup('courtyard-linden-teardrop', 'trunk-only-presentation', [
    instance('linden-west', [-14.1, 0, -4.5], 35_000, 760),
    instance('linden-east', [14.1, 0, -4.5], 215_000, 820),
  ], { clearanceMarginMeters: 0.45 }),
  placementGroup('pruned-ornamental-three-tier', 'decorative-slot-clearance', [
    instance('ornamental-west', [-13.7, 0, 3.25], 80_000, 680),
    instance('ornamental-east', [13.7, 0, 3.25], 260_000, 720),
  ], { clearanceMarginMeters: 0.45 }),
  placementGroup('giant-ancient-cedar', 'north-edge-scenery', [
    instance('ancient-cedar-north-east-landmark', [12.2, 0, -13.1], 18_000, 420),
  ], { clearanceMarginMeters: 0.6 }),
  placementGroup('compact-processional-standard', 'gate-opening', [
    instance('gate-standard-west', [-1.7, 0, 8.7], 0, 850),
    instance('gate-standard-east', [1.7, 0, 8.7], 180_000, 850),
  ]),
  placementGroup('roofed-noticeboard', 'decorative-slot-clearance', [
    instance('builder-noticeboard', [-2.36, 0, 7.72], 0, 780),
  ]),
  placementGroup('directional-signpost', 'decorative-slot-clearance', [
    instance('civic-direction-sign', [3.55, 0, 7.75], -7_000, 720),
  ]),
  placementGroup('timber-bench', 'decorative-slot-clearance', [
    instance('plaza-bench-west', [-3.1, 0, 1.6], 90_000, 720),
    instance('plaza-bench-east', [3.1, 0, 1.6], 270_000, 720),
  ]),
  placementGroup('timber-post-lamp', 'decorative-slot-clearance', [
    instance('road-lamp-west', [-1.6, 0, 4.95], 0, 720),
    instance('road-lamp-east', [1.6, 0, 4.95], 180_000, 720),
  ]),
  placementGroup('stone-pedestal-brazier', 'decorative-slot-clearance', [
    instance('plaza-brazier-west', [-1.45, 0, 2.05], 0, 720),
    instance('plaza-brazier-east', [1.45, 0, 2.05], 180_000, 720),
  ]),
  placementGroup('timber-water-trough', 'decorative-slot-clearance', [
    instance('south-east-water-trough', [4.2, 0, 9], 90_000, 700),
  ]),
  placementGroup('formal-hedge-straight', 'decorative-slot-clearance', [
    instance('hedge-west-south', [-10.8, 0, -1.1], 90_000, 600),
    instance('hedge-east-south', [10.8, 0, -1.1], 90_000, 600),
    instance('hedge-west-north', [-10.8, 0, 3.6], 90_000, 600),
    instance('hedge-east-north', [10.8, 0, 3.6], 90_000, 600),
  ], { clearanceMarginMeters: 0.35 }),
  placementGroup('formal-hedge-corner', 'decorative-slot-clearance', [
    instance('hedge-corner-west', [-13.5, 0, 6.1], 0, 560),
    instance('hedge-corner-east', [13.5, 0, 6.1], 270_000, 560),
  ], { clearanceMarginMeters: 0.35 }),
  placementGroup('clipped-boxwood-mound', 'decorative-slot-clearance', [
    instance('boxwood-south-west', [-6.3, 0, 8.55], 35_000, 720),
    instance('boxwood-south-east', [6.3, 0, 8.55], 210_000, 760),
  ], { clearanceMarginMeters: 0.35 }),
  placementGroup('picket-fence-4m', 'slot-level-dressing', [
    instance('level-dressing-fence-template', [0, 0, 1.7], 0, 650),
  ], {
    anchor: 'active-medium-slot-template',
    slotIds: ACTIVE_MEDIUM_SLOT_IDS,
    footprintKind: 'medium-slot-box',
    halfExtentsMeters: [1.3, 0.1],
    clearanceMarginMeters: 0.08,
  }),
  placementGroup('dirt-road-straight-4m', 'road-surface', [
    instance('road-south-approach', [0, 0, 8.2]),
    instance('road-south-inner', [0, 0, 4.2]),
    instance('road-north-inner', [0, 0, -3.8]),
    instance('road-north-terminal', [0, 0, -7.8]),
  ], { clearanceMarginMeters: 0 }),
  placementGroup('dirt-road-curve-90-4m', 'road-surface', [
    instance('road-curve-west', [-2, 0, 0.2], 90_000),
    instance('road-curve-east', [2, 0, 0.2], 180_000),
  ], { clearanceMarginMeters: 0 }),
  placementGroup('dirt-road-t-junction-4m', 'road-surface', [
    instance('road-civic-t-junction', [0, 0, 0.2]),
  ], { clearanceMarginMeters: 0 }),
  placementGroup('cobble-road-straight-4m', 'road-surface', [
    instance('cobble-civic-spine', [0, 0, 3.2]),
  ], { clearanceMarginMeters: 0 }),
  placementGroup('cobble-plaza-6m', 'road-surface', [
    instance('central-civic-plaza', [0, 0, 3.15]),
  ], { clearanceMarginMeters: 0 }),
  placementGroup('stone-curb-2m', 'road-surface', [
    instance('plaza-curb-west', [-3.15, 0, 3.15], 90_000),
    instance('plaza-curb-east', [3.15, 0, 3.15], 90_000),
    instance('plaza-curb-north', [0, 0, 0], 0),
  ], { clearanceMarginMeters: 0 }),
  placementGroup('boulder-cluster-3m', 'north-edge-scenery', [
    instance('north-east-boulder-cluster', [14, 0, -8.1], 28_000, 720),
  ], { clearanceMarginMeters: 0.4 }),
  placementGroup('masonry-rubble-2m', 'north-edge-scenery', [
    instance('south-gate-small-rubble', [-4, 0, 9.3], -18_000, 780),
  ], { clearanceMarginMeters: 0.35 }),
  placementGroup('canopied-keep-well', 'decorative-slot-clearance', [
    instance('east-wall-keep-well', [12.8, 0, 0.1], 0, 760),
  ], { clearanceMarginMeters: 0.45 }),
  placementGroup('collapsed-courtyard-arch', 'north-edge-scenery', [
    instance('north-collapsed-arch', [-0.95, 0, -7.92], 12_000, 760),
  ], { clearanceMarginMeters: 0.4 }),
  placementGroup('masonry-rubble-cluster', 'north-edge-scenery', [
    instance('south-west-large-rubble', [-14, 0, 8.8], 16_000, 720),
  ], { clearanceMarginMeters: 0.35 }),
  placementGroup('breached-keep-wall', 'north-edge-scenery', [
    instance('north-breached-wall', [4.9, 0, -8.75], -8_000, 760),
  ], { clearanceMarginMeters: 0.4 }),
]);

export const INNER_KEEP_PRESENTATION_PROCEDURAL_ANCHORS = Object.freeze([
  Object.freeze({
    anchorId: 'central-keep-procedural-fallback',
    transform: Object.freeze({
      positionMeters: Object.freeze([0, 1.85, -0.15] as const),
      rotationMilliDegrees: Object.freeze([0, 0, 0] as const),
      scalePermille: Object.freeze([1_000, 1_000, 1_000] as const),
    }),
    footprint: Object.freeze({ halfExtentsMeters: Object.freeze([2.3, 1.9] as const) }),
    pickingRole: 'none',
    collisionClearanceRole: 'central-civic-anchor',
  }),
  Object.freeze({
    anchorId: 'construction-pad-procedural-template',
    slotIds: Object.freeze(INNER_KEEP_PRESENTATION_SLOTS.map((slot) => slot.slotId)),
    mediumRadiusMeters: 1.58,
    largeReservedRadiusMeters: 1.58,
    pickingRole: 'native-slot-control',
    collisionClearanceRole: 'slot-footprint-visualization',
  }),
]);

export const INNER_KEEP_PRESENTATION_CLEARANCES = Object.freeze({
  units: 'meters',
  ground: Object.freeze({
    halfExtentsMeters: Object.freeze([18.5, 18] as const),
    minimumLandmarkEdgeBuffer: 0.35,
  }),
  slot: Object.freeze({
    mediumHalfExtents: Object.freeze([1.5, 1.3] as const),
    largeReservedHalfExtents: Object.freeze([1.5, 1.5] as const),
    minimumBetweenFootprints: 0.2,
    decorativeBuffer: 0.25,
  }),
  road: Object.freeze({
    northSouthCenterX: 0,
    northSouthHalfWidth: 1.3,
    eastWestCenterZ: 0.2,
    eastWestHalfWidth: 1.075,
    requiredClearSideBuffer: 0.25,
  }),
  wall: Object.freeze({
    westX: -16.2,
    eastX: 16.2,
    northZ: -17,
    southZ: 10.5,
    interiorClearance: 0.08,
    southGateClearWidth: 6,
  }),
});

export const INNER_KEEP_PRESENTATION_CAMERA_PRESETS = Object.freeze({
  projection: 'orthographic',
  positionMeters: Object.freeze([21, 25, 24] as const),
  targetMeters: Object.freeze([0, 1, -2.5] as const),
  near: 0.1,
  far: 120,
  minimumHalfWidth: 17.4,
  landscape: Object.freeze({ minimumAspect: 0.78, baseHalfHeight: 16.8 }),
  portrait: Object.freeze({
    maximumAspectExclusive: 0.78,
    baseHalfHeight: 22.2,
    positionMeters: Object.freeze([0, 27, 30] as const),
    targetMeters: Object.freeze([0, 1, -2.5] as const),
    initialZoomMultiplier: 0.9,
  }),
  zoom: Object.freeze({ minimum: 0.72, initial: 1, maximum: 1.5 }),
  panBoundsMeters: Object.freeze({ x: Object.freeze([-4, 4] as const), z: Object.freeze([-4, 3] as const) }),
});

const INNER_KEEP_PRESENTATION_LAYOUT_DIGEST_PAYLOAD = Object.freeze({
  policyVersion: INNER_KEEP_PRESENTATION_LAYOUT_POLICY_VERSION,
  layoutId: INNER_KEEP_PRESENTATION_LAYOUT_ID,
  layoutVersion: INNER_KEEP_PRESENTATION_LAYOUT_VERSION,
  assetSelectionDigest: INNER_KEEP_PRESENTATION_ASSET_SELECTION_DIGEST,
  assetUseStatus: INNER_KEEP_PRESENTATION_ASSET_USE_STATUS,
  assets: INNER_KEEP_PRESENTATION_ASSETS,
  slots: INNER_KEEP_PRESENTATION_SLOTS,
  placements: INNER_KEEP_PRESENTATION_PLACEMENTS,
  proceduralAnchors: INNER_KEEP_PRESENTATION_PROCEDURAL_ANCHORS,
  clearances: INNER_KEEP_PRESENTATION_CLEARANCES,
  cameraPresets: INNER_KEEP_PRESENTATION_CAMERA_PRESETS,
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

/** Stable UTF-8 source for the SHA-256 presentation-layout digest. */
export function canonicalInnerKeepPresentationLayoutDigestInput(): string {
  return JSON.stringify(canonicalize(INNER_KEEP_PRESENTATION_LAYOUT_DIGEST_PAYLOAD));
}

// SHA-256 of canonicalInnerKeepPresentationLayoutDigestInput().
export const INNER_KEEP_PRESENTATION_LAYOUT_DIGEST =
  '7e10c6a765a1dbbf3b0a707597e9ecdc4038900d10d57ef565961fcfbd449070';

export const CANONICAL_INNER_KEEP_PRESENTATION_LAYOUT = Object.freeze({
  ...INNER_KEEP_PRESENTATION_LAYOUT_DIGEST_PAYLOAD,
  digest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
});

const assetIds = INNER_KEEP_PRESENTATION_ASSETS.map((entry) => entry.assetId);
const placedAssetIds = INNER_KEEP_PRESENTATION_PLACEMENTS.map((entry) => entry.assetId);
if (
  INNER_KEEP_PRESENTATION_ASSETS.length !== 38
  || new Set(assetIds).size !== 38
  || INNER_KEEP_PRESENTATION_SLOTS.length !== 12
  || new Set(INNER_KEEP_PRESENTATION_SLOTS.map((slot) => slot.slotId)).size !== 12
  || INNER_KEEP_PRESENTATION_PLACEMENTS.length !== 38
  || new Set(placedAssetIds).size !== 38
  || assetIds.some((assetId) => !placedAssetIds.includes(assetId))
  || INNER_KEEP_PRESENTATION_PLACEMENTS.some((placement) => (
    placement.instances.length === 0
    || placement.qualityAvailability.length !== ALL_QUALITIES.length
    || placement.instances.some((entry) => (
      entry.positionMeters.some((value) => !Number.isFinite(value))
      || entry.rotationMilliDegrees.some((value) => !Number.isSafeInteger(value))
      || entry.scalePermille.some((value) => !Number.isSafeInteger(value) || value <= 0)
    ))
  ))
) {
  throw new Error('INNER_KEEP_PRESENTATION_LAYOUT_POLICY_DRIFT');
}
