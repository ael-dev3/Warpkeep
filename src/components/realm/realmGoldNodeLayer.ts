import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

import { axialToWorld, type HexCoord } from '../../game/map/hexCoordinates';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import type { RealmTerrainSurface } from '../../game/map/realmTerrainSurface';
import type { TerrainStructurePlacement } from '../../game/map/terrainPlacements';
import {
  HEGEMONY_GOLD_MINE_RUNTIME_ASSETS,
  HEGEMONY_SUPPLY_WAGON_RUNTIME_ASSETS,
  acquireHegemonyExpeditionPrefab,
  type HegemonyExpeditionLod,
  type HegemonyExpeditionModel,
  type HegemonyExpeditionPrefabLease
} from './loadHegemonyExpeditionAssets';
import type { RealmQualitySpec } from './realmQuality';
import {
  resolveRealmGoldWagonPose,
  type RealmGoldNodePresentation,
  type RealmGoldWagonPose
} from './realmGoldNodePresentation';
import type { RealmExpeditionLayerBudget } from './realmExpeditionPresentationBudget';

const HEX_SIZE = 1;
const RESOURCE_GROUND_LIFT = 0.018;
const GOLD_MINE_TARGET_FOOTPRINT = 1.04;
const WAGON_TARGET_FOOTPRINT = 0.64;
const MAX_RENDERED_GOLD_MINES = Object.freeze({
  high: 72,
  balanced: 44,
  reduced: 20
} as const);
const MAX_RENDERED_WAGONS = Object.freeze({
  high: 17,
  balanced: 10,
  reduced: 0
} as const);
const WAGON_ANIMATION_BUDGET = Object.freeze({
  desktop: Object.freeze({ highOrBalanced: 4, total: 12 }),
  mobile: Object.freeze({ highOrBalanced: 2, total: 6 })
});

export type RealmGoldNodeSceneRecord = RealmGoldNodePresentation;

export type RealmGoldNodeInstanceHit = Readonly<{
  siteId: string;
  coord: HexCoord;
}>;

export type RealmGoldNodePresentationTelemetry = Readonly<{
  publicSiteCount: number;
  occupiedSiteCount: number;
  renderedGoldMineCount: number;
  renderedWagonCount: number;
  animatedWagonCount: number;
  markerOnlySiteCount: number;
}>;

export type RealmGoldNodeLayer = Readonly<{
  group: THREE.Group;
  /** The outer renderer supplies time only for local visual interpolation. */
  update: (camera: THREE.PerspectiveCamera, nowMicros: bigint, elapsedSeconds: number) => boolean;
  /** Reconcile public occupation state without replacing static node objects. */
  reconcile: (sites: readonly RealmGoldNodeSceneRecord[]) => boolean;
  raycast: (raycaster: THREE.Raycaster) => RealmGoldNodeInstanceHit | null;
  setSelectedSiteId: (siteId: string | null) => void;
  hasMovingWagons: () => boolean;
  getPresentationTelemetry: () => RealmGoldNodePresentationTelemetry;
  dispose: () => void;
}>;

export type CreateRealmGoldNodeLayerOptions = Readonly<{
  sites: readonly RealmGoldNodeSceneRecord[];
  surface: RealmTerrainSurface;
  terrainPlacements: readonly TerrainStructurePlacement[];
  quality: RealmQualitySpec;
  baseUrl: string;
  maxAnisotropy: number;
  reducedMotion: boolean;
  /**
   * Optional scene-owned slice of the shared Gold/Food workload. Omit only
   * for isolated Gold tests or legacy callers, which retain the historical
   * Gold-only ceiling.
   */
  presentationBudget?: RealmExpeditionLayerBudget;
  onModelReady?: () => void;
}>;

type SceneNode = {
  record: RealmGoldNodeSceneRecord;
  world: Readonly<{ x: number; y: number; z: number }>;
};

type ModelKind = 'gold-mine' | 'wagon';

type VisualInstance = Readonly<{
  key: string;
  root: THREE.Group;
  lod: HegemonyExpeditionLod;
  kind: ModelKind;
  mixer?: THREE.AnimationMixer;
  action?: THREE.AnimationAction;
}>;

function cameraDistance(camera: THREE.PerspectiveCamera, point: Readonly<{
  x: number;
  y: number;
  z: number;
}>) {
  return Math.hypot(
    camera.position.x - point.x,
    camera.position.y - point.y,
    camera.position.z - point.z
  );
}

function qualityLods(quality: RealmQualitySpec): readonly HegemonyExpeditionLod[] {
  if (quality.id === 'high') return ['compact', 'balanced', 'high'];
  if (quality.id === 'balanced') return ['compact', 'balanced'];
  return ['compact'];
}

function chooseGoldMineLod(
  quality: RealmQualitySpec,
  distance: number
): HegemonyExpeditionLod | undefined {
  if (quality.id === 'high' && distance <= 16) return 'high';
  if (quality.id !== 'reduced' && distance <= 38) return 'balanced';
  if (distance <= 70) return 'compact';
  return undefined;
}

function chooseWagonLod(
  quality: RealmQualitySpec,
  distance: number,
  selected: boolean,
  _ownExpedition: boolean
): HegemonyExpeditionLod | undefined {
  if (quality.id === 'reduced') return undefined;
  if (distance > 70) return undefined;
  // The immutable asset contract: High is selected or within 12 units;
  // Balanced is the nearby/owner profile; Compact carries the wider view.
  if (quality.id === 'high' && (selected || distance <= 12)) return 'high';
  if (distance <= 28) return 'balanced';
  return 'compact';
}

function isMobileRealmPresentation() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia?.('(max-width: 760px), (pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

function chooseWalkClip(clips: readonly THREE.AnimationClip[]) {
  return clips.find((clip) => clip.name === 'Walk')
    ?? clips.find((clip) => /walk/i.test(clip.name));
}

function interpolatePose(
  pose: RealmGoldWagonPose,
  surface: RealmTerrainSurface,
  terrainPlacements: readonly TerrainStructurePlacement[]
) {
  const from = axialToWorld(pose.from, HEX_SIZE);
  const to = axialToWorld(pose.to, HEX_SIZE);
  const x = THREE.MathUtils.lerp(from.x, to.x, pose.progress);
  const z = THREE.MathUtils.lerp(from.z, to.z, pose.progress);
  const groundY = terrainHeightAtWorld(surface.renderMap, { x, z }, HEX_SIZE, terrainPlacements);
  return Object.freeze({
    x,
    y: groundY + RESOURCE_GROUND_LIFT,
    z,
    // The source's front is +Z. This is visual orientation only, never a
    // route/avoidance decision.
    yaw: Math.atan2(to.x - from.x, to.z - from.z)
  });
}

function cloneModel(
  model: HegemonyExpeditionModel,
  kind: ModelKind,
  lod: HegemonyExpeditionLod,
  key: string,
  animate: boolean
): VisualInstance {
  // Wagon GLBs carry a 47-joint skin. Plain Object3D.clone shares skeleton
  // state, making one nearby wagon's mixer animate every clone. SkeletonUtils
  // gives each active visual its own bones while keeping immutable geometry
  // and textures shared by the parsed prefab lease.
  const root = (kind === 'wagon'
    ? cloneSkinned(model.root)
    : model.root.clone(true)) as THREE.Group;
  root.name = `${kind}-${lod}-${key}`;
  if (!animate) return Object.freeze({ key, root, kind, lod });
  const clip = kind === 'wagon' ? chooseWalkClip(model.clips) : undefined;
  if (!clip) return Object.freeze({ key, root, kind, lod });
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  return Object.freeze({ key, root, kind, lod, mixer, action });
}

function modelMapKey(kind: ModelKind, lod: HegemonyExpeditionLod) {
  return `${kind}:${lod}`;
}

function loadedLodAtOrBelow(
  requested: HegemonyExpeditionLod,
  hasModel: (lod: HegemonyExpeditionLod) => boolean
): HegemonyExpeditionLod | undefined {
  const candidates: readonly HegemonyExpeditionLod[] = requested === 'high'
    ? ['high', 'balanced', 'compact']
    : requested === 'balanced'
      ? ['balanced', 'compact']
      : ['compact'];
  return candidates.find(hasModel);
}

/**
 * Resource models are presentation-only. Public Gold-site rows create pick
 * volumes and fallback glyphs immediately; integrity-verified GLBs replace
 * those glyphs progressively and never decide availability or economy.
 */
export function createRealmGoldNodeLayer(
  options: CreateRealmGoldNodeLayerOptions
): RealmGoldNodeLayer {
  const group = new THREE.Group();
  group.name = 'realm-gold-node-layer';
  const validRecords = options.sites
    .filter((site) => Number.isSafeInteger(site.coord.q) && Number.isSafeInteger(site.coord.r))
    .sort((left, right) => left.siteId.localeCompare(right.siteId));
  const siteIds = new Set<string>();
  const nodes: SceneNode[] = [];
  for (const record of validRecords) {
    if (siteIds.has(record.siteId)) continue;
    siteIds.add(record.siteId);
    const world = axialToWorld(record.coord, HEX_SIZE);
    nodes.push({
      record,
      world: Object.freeze({
        x: world.x,
        y: terrainHeightAtWorld(options.surface.renderMap, world, HEX_SIZE, options.terrainPlacements)
          + RESOURCE_GROUND_LIFT,
        z: world.z
      })
    });
  }

  const nodeBySiteId = new Map(nodes.map((node) => [node.record.siteId, node]));
  const fallbackGroup = new THREE.Group();
  fallbackGroup.name = 'realm-gold-node-fallback-markers';
  group.add(fallbackGroup);
  const modelGroup = new THREE.Group();
  modelGroup.name = 'realm-gold-node-models';
  group.add(modelGroup);

  const markerGeometry = new THREE.DodecahedronGeometry(0.19, 0);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: '#eebd31',
    emissive: '#735009',
    emissiveIntensity: 0.36,
    metalness: 0.42,
    roughness: 0.34
  });
  const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, nodes.length);
  markers.name = 'realm-gold-node-markers';
  markers.castShadow = options.quality.dynamicShadows;
  markers.receiveShadow = options.quality.dynamicShadows;
  markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const markerMatrix = new THREE.Matrix4();
  const markerPosition = new THREE.Vector3();
  const markerScale = new THREE.Vector3();
  const markerRotation = new THREE.Quaternion();
  const markerIndexBySiteId = new Map<string, number>();
  nodes.forEach((node, index) => {
    markerMatrix.makeTranslation(node.world.x, node.world.y + 0.2, node.world.z);
    markers.setMatrixAt(index, markerMatrix);
    markerIndexBySiteId.set(node.record.siteId, index);
  });
  markers.count = nodes.length;
  markers.instanceMatrix.needsUpdate = true;
  fallbackGroup.add(markers);

  const occupiedGeometry = new THREE.RingGeometry(0.34, 0.4, 24);
  const occupiedMaterial = new THREE.MeshBasicMaterial({
    color: '#e9b93a',
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const occupiedRings = new THREE.InstancedMesh(occupiedGeometry, occupiedMaterial, nodes.length);
  occupiedRings.name = 'realm-gold-node-occupation-rings';
  occupiedRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const ringMatrix = new THREE.Matrix4();
  const syncOccupiedRings = () => {
    let occupiedRingCount = 0;
    nodes.forEach((node) => {
      if (
        node.record.availability !== 'outbound'
        && node.record.availability !== 'gathering'
        && node.record.availability !== 'returning'
      ) return;
      ringMatrix.makeRotationX(-Math.PI * 0.5);
      ringMatrix.setPosition(node.world.x, node.world.y + 0.025, node.world.z);
      occupiedRings.setMatrixAt(occupiedRingCount, ringMatrix);
      occupiedRingCount += 1;
    });
    occupiedRings.count = occupiedRingCount;
    occupiedRings.instanceMatrix.needsUpdate = true;
  };
  syncOccupiedRings();
  fallbackGroup.add(occupiedRings);

  const selectedRing = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.49, 28),
    new THREE.MeshBasicMaterial({
      color: '#fff1b8',
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  selectedRing.name = 'realm-gold-node-selection-ring';
  selectedRing.rotation.x = -Math.PI * 0.5;
  selectedRing.visible = false;
  fallbackGroup.add(selectedRing);

  // Dedicated simple pick volumes keep terrain triangles and decorative GLBs
  // from stealing the selected identity. They are not collision geometry.
  const pickGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16);
  const pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const pickVolumes = new THREE.InstancedMesh(pickGeometry, pickMaterial, nodes.length);
  pickVolumes.name = 'realm-gold-node-pick-volumes';
  pickVolumes.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const pickIndexByInstance = new Map<number, SceneNode>();
  nodes.forEach((node, index) => {
    markerMatrix.makeTranslation(node.world.x, node.world.y + 0.35, node.world.z);
    pickVolumes.setMatrixAt(index, markerMatrix);
    pickIndexByInstance.set(index, node);
  });
  pickVolumes.count = nodes.length;
  pickVolumes.instanceMatrix.needsUpdate = true;
  pickVolumes.computeBoundingSphere();
  group.add(pickVolumes);

  const models = new Map<string, HegemonyExpeditionModel>();
  const modelLeases = new Map<string, HegemonyExpeditionPrefabLease>();
  const visualInstances = new Map<string, VisualInstance>();
  const modelAbortController = new AbortController();
  let selectedSiteId: string | undefined;
  let disposed = false;
  let lastElapsedSeconds = 0;
  let markerPresentationSignature = '';
  const presentationBudget = options.presentationBudget;
  const maximumRenderedGoldMines = presentationBudget?.maximumRenderedNodes
    ?? MAX_RENDERED_GOLD_MINES[options.quality.id];
  const maximumRenderedWagons = presentationBudget?.maximumRenderedWagons
    ?? MAX_RENDERED_WAGONS[options.quality.id];
  const wagonAnimationBudget = presentationBudget?.wagonAnimationBudget
    ?? (isMobileRealmPresentation()
      ? WAGON_ANIMATION_BUDGET.mobile
      : WAGON_ANIMATION_BUDGET.desktop);
  let telemetry: RealmGoldNodePresentationTelemetry = Object.freeze({
    publicSiteCount: nodes.length,
    occupiedSiteCount: nodes.filter((node) => node.record.occupation !== undefined).length,
    renderedGoldMineCount: 0,
    renderedWagonCount: 0,
    animatedWagonCount: 0,
    markerOnlySiteCount: nodes.length
  });

  const removeVisual = (key: string) => {
    const visual = visualInstances.get(key);
    if (!visual) return;
    visual.mixer?.stopAllAction();
    modelGroup.remove(visual.root);
    visualInstances.delete(key);
  };

  const modelFor = (kind: ModelKind, lod: HegemonyExpeditionLod) => (
    models.get(modelMapKey(kind, lod))
  );

  const loadedLodFor = (kind: ModelKind, requested: HegemonyExpeditionLod) => (
    loadedLodAtOrBelow(requested, (lod) => modelFor(kind, lod) !== undefined)
  );

  const syncFallbackMarkers = () => {
    const presentedSiteIds = [...visualInstances.values()]
      .filter((visual) => visual.kind === 'gold-mine')
      .map((visual) => visual.key.slice('mine:'.length))
      .sort();
    const signature = presentedSiteIds.join('|');
    if (signature === markerPresentationSignature) return;
    markerPresentationSignature = signature;
    const presented = new Set(presentedSiteIds);
    for (const node of nodes) {
      const index = markerIndexBySiteId.get(node.record.siteId);
      if (index === undefined) continue;
      markerPosition.set(node.world.x, node.world.y + 0.2, node.world.z);
      markerScale.setScalar(presented.has(node.record.siteId) ? 0 : 1);
      markerMatrix.compose(markerPosition, markerRotation, markerScale);
      markers.setMatrixAt(index, markerMatrix);
    }
    markers.instanceMatrix.needsUpdate = true;
  };

  const replaceVisuals = (
    camera: THREE.PerspectiveCamera,
    nowMicros: bigint,
    elapsedSeconds: number
  ) => {
    const mineCandidates = nodes
      .map((node) => ({ node, distance: cameraDistance(camera, node.world) }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, maximumRenderedGoldMines);
    const desired = new Map<string, Readonly<{
      kind: ModelKind;
      lod: HegemonyExpeditionLod;
      node: SceneNode;
      pose?: RealmGoldWagonPose;
      animate: boolean;
    }>>();
    for (const candidate of mineCandidates) {
      const requestedLod = chooseGoldMineLod(options.quality, candidate.distance);
      const lod = requestedLod ? loadedLodFor('gold-mine', requestedLod) : undefined;
      if (lod) {
        desired.set(`mine:${candidate.node.record.siteId}`, Object.freeze({
          kind: 'gold-mine',
          lod,
          node: candidate.node,
          animate: false
        }));
      }
    }

    const wagonCandidates = nodes
      .map((node) => {
        const pose = resolveRealmGoldWagonPose(node.record, nowMicros);
        if (!pose) return undefined;
        const position = interpolatePose(pose, options.surface, options.terrainPlacements);
        return { node, pose, position, distance: cameraDistance(camera, position) };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
      .sort((left, right) => (
        Number(right.node.record.siteId === selectedSiteId)
        - Number(left.node.record.siteId === selectedSiteId)
        || Number(right.node.record.occupiedByViewer) - Number(left.node.record.occupiedByViewer)
        || left.distance - right.distance
      ))
      .slice(0, maximumRenderedWagons);
    let animatedWagons = 0;
    let detailedAnimatedWagons = 0;
    for (const candidate of wagonCandidates) {
      const requestedLod = chooseWagonLod(
        options.quality,
        candidate.distance,
        candidate.node.record.siteId === selectedSiteId,
        candidate.node.record.occupiedByViewer
      );
      const lod = requestedLod ? loadedLodFor('wagon', requestedLod) : undefined;
      const detailedLod = lod === 'high' || lod === 'balanced';
      const animate = lod !== undefined
        && !options.reducedMotion
        && candidate.pose.phase !== 'gathering'
        && animatedWagons < wagonAnimationBudget.total
        && (!detailedLod || detailedAnimatedWagons < wagonAnimationBudget.highOrBalanced);
      if (lod) {
        desired.set(`wagon:${candidate.node.record.siteId}`, Object.freeze({
          kind: 'wagon',
          lod,
          node: candidate.node,
          pose: candidate.pose,
          animate
        }));
        if (animate) {
          animatedWagons += 1;
          if (detailedLod) detailedAnimatedWagons += 1;
        }
      }
    }

    for (const [key, visual] of visualInstances) {
      const next = desired.get(key);
      if (
        !next
        || next.lod !== visual.lod
        || next.kind !== visual.kind
        || Boolean(next.animate) !== Boolean(visual.mixer)
      ) removeVisual(key);
    }
    for (const [key, next] of desired) {
      let visual = visualInstances.get(key);
      if (!visual) {
        const model = modelFor(next.kind, next.lod);
        if (!model) continue;
        visual = cloneModel(model, next.kind, next.lod, key, next.animate);
        visualInstances.set(key, visual);
        modelGroup.add(visual.root);
      }
      if (next.kind === 'gold-mine') {
        visual.root.position.set(next.node.world.x, next.node.world.y, next.node.world.z);
      } else if (next.pose) {
        const position = interpolatePose(next.pose, options.surface, options.terrainPlacements);
        visual.root.position.set(position.x, position.y, position.z);
        visual.root.rotation.y = position.yaw;
        if (visual.mixer) {
          const delta = Math.max(0, Math.min(0.5, elapsedSeconds - lastElapsedSeconds));
          visual.mixer.update(delta);
        }
      }
    }
    lastElapsedSeconds = elapsedSeconds;
    syncFallbackMarkers();
    const renderedGoldMineCount = [...visualInstances.values()]
      .filter((visual) => visual.kind === 'gold-mine').length;
    const renderedWagonCount = [...visualInstances.values()]
      .filter((visual) => visual.kind === 'wagon').length;
    telemetry = Object.freeze({
      publicSiteCount: nodes.length,
      occupiedSiteCount: nodes.filter((node) => node.record.occupation !== undefined).length,
      renderedGoldMineCount,
      renderedWagonCount,
      animatedWagonCount: [...visualInstances.values()]
        .filter((visual) => visual.kind === 'wagon' && visual.mixer !== undefined).length,
      markerOnlySiteCount: Math.max(0, nodes.length - renderedGoldMineCount)
    });
  };

  const loadModels = async () => {
    const lods = qualityLods(options.quality);
    const tasks: Array<Promise<void>> = [];
    for (const lod of lods) {
      tasks.push(acquireHegemonyExpeditionPrefab({
        label: `Hegemony Gold Mine ${lod}`,
        asset: HEGEMONY_GOLD_MINE_RUNTIME_ASSETS[lod],
        materialRole: 'gathering-node',
        baseUrl: options.baseUrl,
        targetFootprintDiameter: GOLD_MINE_TARGET_FOOTPRINT,
        dynamicShadows: options.quality.dynamicShadows,
        maxAnisotropy: options.maxAnisotropy,
        signal: modelAbortController.signal
      }).then((model) => {
        const key = modelMapKey('gold-mine', lod);
        if (disposed) {
          model.release();
          return;
        }
        modelLeases.set(key, model);
        models.set(key, model.model);
        options.onModelReady?.();
      }));
      if (options.quality.id !== 'reduced') {
        tasks.push(acquireHegemonyExpeditionPrefab({
          label: `Hegemony Supply Wagon ${lod}`,
          asset: HEGEMONY_SUPPLY_WAGON_RUNTIME_ASSETS[lod],
          materialRole: 'wagon',
          baseUrl: options.baseUrl,
          targetFootprintDiameter: WAGON_TARGET_FOOTPRINT,
          dynamicShadows: options.quality.dynamicShadows,
          maxAnisotropy: options.maxAnisotropy,
          signal: modelAbortController.signal
        }).then((model) => {
          const key = modelMapKey('wagon', lod);
          if (disposed) {
            model.release();
            return;
          }
          modelLeases.set(key, model);
          models.set(key, model.model);
          options.onModelReady?.();
        }));
      }
    }
    await Promise.allSettled(tasks);
  };
  // Individual asset failure leaves safe markers and must not revoke the
  // already-authoritative Realm or its public occupancy presentation.
  if (nodes.length > 0) void loadModels().catch(() => undefined);

  const setSelectedSiteId = (siteId: string | null) => {
    selectedSiteId = siteId ?? undefined;
    const node = selectedSiteId ? nodeBySiteId.get(selectedSiteId) : undefined;
    selectedRing.visible = node !== undefined;
    if (node) selectedRing.position.set(node.world.x, node.world.y + 0.026, node.world.z);
  };

  const reconcile = (sites: readonly RealmGoldNodeSceneRecord[]) => {
    if (disposed || sites.length !== nodes.length) return false;
    const nextBySiteId = new Map<string, RealmGoldNodeSceneRecord>();
    for (const site of sites) {
      const current = nodeBySiteId.get(site.siteId);
      if (
        !current
        || nextBySiteId.has(site.siteId)
        || site.coord.q !== current.record.coord.q
        || site.coord.r !== current.record.coord.r
        || site.tier !== current.record.tier
      ) return false;
      nextBySiteId.set(site.siteId, site);
    }
    for (const node of nodes) node.record = nextBySiteId.get(node.record.siteId)!;
    markerPresentationSignature = '';
    syncOccupiedRings();
    telemetry = Object.freeze({
      ...telemetry,
      occupiedSiteCount: nodes.filter((node) => node.record.occupation !== undefined).length
    });
    return true;
  };

  const update = (camera: THREE.PerspectiveCamera, nowMicros: bigint, elapsedSeconds: number) => {
    if (disposed) return false;
    const before = `${telemetry.renderedGoldMineCount}:${telemetry.renderedWagonCount}:${telemetry.animatedWagonCount}`;
    replaceVisuals(camera, nowMicros, elapsedSeconds);
    const after = `${telemetry.renderedGoldMineCount}:${telemetry.renderedWagonCount}:${telemetry.animatedWagonCount}`;
    return before !== after || nodes.some((node) => (
      node.record.availability === 'outbound' || node.record.availability === 'returning'
    ));
  };

  const raycast = (raycaster: THREE.Raycaster) => {
    const intersection = raycaster.intersectObject(pickVolumes, false)[0];
    const instanceId = intersection?.instanceId;
    const node = instanceId === undefined ? undefined : pickIndexByInstance.get(instanceId);
    return node
      ? Object.freeze({ siteId: node.record.siteId, coord: node.record.coord })
      : null;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    modelAbortController.abort();
    for (const key of [...visualInstances.keys()]) removeVisual(key);
    for (const lease of modelLeases.values()) {
      try {
        // The source root owns shared decoded GLB resources; clones only hold
        // references and must never dispose their geometry/materials.
        lease.release();
      } catch {
        // Layer teardown continues through every resource family.
      }
    }
    modelLeases.clear();
    models.clear();
    group.removeFromParent();
    markerGeometry.dispose();
    markerMaterial.dispose();
    occupiedGeometry.dispose();
    occupiedMaterial.dispose();
    selectedRing.geometry.dispose();
    (selectedRing.material as THREE.Material).dispose();
    pickGeometry.dispose();
    pickMaterial.dispose();
  };

  return Object.freeze({
    group,
    update,
    reconcile,
    raycast,
    setSelectedSiteId,
    hasMovingWagons: () => nodes.some((node) => (
      node.record.availability === 'outbound' || node.record.availability === 'returning'
    )),
    getPresentationTelemetry: () => telemetry,
    dispose
  });
}

export const HEGEMONY_EXPEDITION_ASSET_BUDGETS = Object.freeze({
  goldMineTargetFootprint: GOLD_MINE_TARGET_FOOTPRINT,
  wagonTargetFootprint: WAGON_TARGET_FOOTPRINT,
  maximumRenderedGoldMines: MAX_RENDERED_GOLD_MINES,
  maximumRenderedWagons: MAX_RENDERED_WAGONS,
  wagonAnimationBudget: WAGON_ANIMATION_BUDGET
});
