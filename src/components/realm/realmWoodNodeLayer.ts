import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

import { axialToWorld, type HexCoord } from '../../game/map/hexCoordinates';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import type { RealmTerrainSurface } from '../../game/map/realmTerrainSurface';
import type { TerrainStructurePlacement } from '../../game/map/terrainPlacements';
import {
  HEGEMONY_SUPPLY_WAGON_RUNTIME_ASSETS,
  HEGEMONY_LOGGING_CAMP_RUNTIME_ASSETS,
  acquireHegemonyExpeditionPrefab,
  type HegemonyExpeditionLod,
  type HegemonyExpeditionModel,
  type HegemonyExpeditionPrefabLease
} from './loadHegemonyExpeditionAssets';
import type { RealmExpeditionLayerBudget } from './realmExpeditionPresentationBudget';
import {
  HEGEMONY_EXPEDITION_SCENE_LIMITS,
  HEGEMONY_LOGGING_CAMP_RENDER_LIMITS
} from './realmExpeditionPresentationBudget';
import type { RealmQualitySpec } from './realmQuality';
import {
  resolveRealmWoodWagonPose,
  type RealmWoodNodePresentation,
  type RealmWoodWagonPose
} from './realmWoodNodePresentation';

const HEX_SIZE = 1;
const RESOURCE_GROUND_LIFT = 0.018;
const LOGGING_CAMP_TARGET_FOOTPRINT = 1.22;
const WAGON_TARGET_FOOTPRINT = 0.64;

export type RealmWoodNodeSceneRecord = RealmWoodNodePresentation;

export type RealmWoodNodeInstanceHit = Readonly<{
  siteId: string;
  coord: HexCoord;
}>;

export type RealmWoodNodePresentationTelemetry = Readonly<{
  publicSiteCount: number;
  occupiedSiteCount: number;
  renderedWoodCampCount: number;
  renderedWagonCount: number;
  animatedWagonCount: number;
  markerOnlySiteCount: number;
}>;

export type RealmWoodNodeLayer = Readonly<{
  group: THREE.Group;
  update: (camera: THREE.PerspectiveCamera, nowMicros: bigint, elapsedSeconds: number) => boolean;
  reconcile: (sites: readonly RealmWoodNodeSceneRecord[]) => boolean;
  raycast: (raycaster: THREE.Raycaster) => RealmWoodNodeInstanceHit | null;
  setSelectedSiteId: (siteId: string | null) => void;
  hasMovingWagons: () => boolean;
  getPresentationTelemetry: () => RealmWoodNodePresentationTelemetry;
  dispose: () => void;
}>;

export type CreateRealmWoodNodeLayerOptions = Readonly<{
  sites: readonly RealmWoodNodeSceneRecord[];
  surface: RealmTerrainSurface;
  terrainPlacements: readonly TerrainStructurePlacement[];
  quality: RealmQualitySpec;
  baseUrl: string;
  maxAnisotropy: number;
  reducedMotion: boolean;
  /** Scene-owned Wood slice from the shared Gold/Food/Wood scene allocator. */
  presentationBudget?: RealmExpeditionLayerBudget;
  onModelReady?: () => void;
}>;

type SceneNode = {
  record: RealmWoodNodeSceneRecord;
  world: Readonly<{ x: number; y: number; z: number }>;
};

type ModelKind = 'logging-camp' | 'wagon';
type VisualInstance = Readonly<{
  key: string;
  root: THREE.Group;
  lod: HegemonyExpeditionLod;
  kind: ModelKind;
  mixer?: THREE.AnimationMixer;
}>;

function cameraDistance(camera: THREE.PerspectiveCamera, point: Readonly<{ x: number; y: number; z: number }>) {
  return Math.hypot(camera.position.x - point.x, camera.position.y - point.y, camera.position.z - point.z);
}

function qualityLods(quality: RealmQualitySpec): readonly HegemonyExpeditionLod[] {
  if (quality.id === 'high') return ['compact', 'balanced', 'high'];
  if (quality.id === 'balanced') return ['compact', 'balanced'];
  return ['compact'];
}

function chooseCampLod(quality: RealmQualitySpec, distance: number): HegemonyExpeditionLod | undefined {
  if (quality.id === 'high' && distance <= 16) return 'high';
  if (quality.id !== 'reduced' && distance <= 38) return 'balanced';
  return distance <= 70 ? 'compact' : undefined;
}

function chooseWagonLod(
  quality: RealmQualitySpec,
  distance: number,
  selected: boolean
): HegemonyExpeditionLod | undefined {
  if (quality.id === 'reduced' || distance > 70) return undefined;
  if (quality.id === 'high' && (selected || distance <= 12)) return 'high';
  return distance <= 28 ? 'balanced' : 'compact';
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
  pose: RealmWoodWagonPose,
  surface: RealmTerrainSurface,
  terrainPlacements: readonly TerrainStructurePlacement[]
) {
  const from = axialToWorld(pose.from, HEX_SIZE);
  const to = axialToWorld(pose.to, HEX_SIZE);
  const x = THREE.MathUtils.lerp(from.x, to.x, pose.progress);
  const z = THREE.MathUtils.lerp(from.z, to.z, pose.progress);
  return Object.freeze({
    x,
    y: terrainHeightAtWorld(surface.renderMap, { x, z }, HEX_SIZE, terrainPlacements) + RESOURCE_GROUND_LIFT,
    z,
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
  const root = (kind === 'wagon' ? cloneSkinned(model.root) : model.root.clone(true)) as THREE.Group;
  root.name = `${kind}-${lod}-${key}`;
  if (!animate) return Object.freeze({ key, root, kind, lod });
  const clip = kind === 'wagon' ? chooseWalkClip(model.clips) : undefined;
  if (!clip) return Object.freeze({ key, root, kind, lod });
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  return Object.freeze({ key, root, kind, lod, mixer });
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
 * A Wood-only visual layer. Missing Camp GLBs leave public fallback glyphs in
 * place; malformed Wood input has already been reduced to zero sites by the
 * Wood presentation policy and can never disturb Gold or core terrain.
 */
export function createRealmWoodNodeLayer(options: CreateRealmWoodNodeLayerOptions): RealmWoodNodeLayer {
  const group = new THREE.Group();
  group.name = 'realm-wood-node-layer';
  const siteIds = new Set<string>();
  const nodes: SceneNode[] = [];
  for (const record of options.sites
    .filter((site) => Number.isSafeInteger(site.coord.q) && Number.isSafeInteger(site.coord.r))
    .sort((left, right) => left.siteId.localeCompare(right.siteId))) {
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
  fallbackGroup.name = 'realm-wood-node-fallback-markers';
  const modelGroup = new THREE.Group();
  modelGroup.name = 'realm-wood-node-models';
  group.add(fallbackGroup, modelGroup);

  const markerGeometry = new THREE.ConeGeometry(0.18, 0.42, 5);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: '#78a95d',
    emissive: '#213f25',
    emissiveIntensity: 0.2,
    metalness: 0.08,
    roughness: 0.62
  });
  const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, nodes.length);
  markers.name = 'realm-wood-node-markers';
  markers.castShadow = options.quality.dynamicShadows;
  markers.receiveShadow = options.quality.dynamicShadows;
  markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const markerMatrix = new THREE.Matrix4();
  const markerPosition = new THREE.Vector3();
  const markerScale = new THREE.Vector3();
  const markerRotation = new THREE.Quaternion();
  const markerIndexBySiteId = new Map<string, number>();
  nodes.forEach((node, index) => {
    markerMatrix.makeTranslation(node.world.x, node.world.y + 0.21, node.world.z);
    markers.setMatrixAt(index, markerMatrix);
    markerIndexBySiteId.set(node.record.siteId, index);
  });
  markers.count = nodes.length;
  markers.instanceMatrix.needsUpdate = true;
  fallbackGroup.add(markers);

  const occupiedGeometry = new THREE.RingGeometry(0.34, 0.4, 24);
  const occupiedMaterial = new THREE.MeshBasicMaterial({
    color: '#b2dd86', transparent: true, opacity: 0.86, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false
  });
  const occupiedRings = new THREE.InstancedMesh(occupiedGeometry, occupiedMaterial, nodes.length);
  occupiedRings.name = 'realm-wood-node-occupation-rings';
  occupiedRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const syncOccupiedRings = () => {
    let occupiedRingCount = 0;
    nodes.forEach((node) => {
      if (!['outbound', 'gathering', 'returning'].includes(node.record.availability)) return;
      markerMatrix.makeRotationX(-Math.PI * 0.5);
      markerMatrix.setPosition(node.world.x, node.world.y + 0.025, node.world.z);
      occupiedRings.setMatrixAt(occupiedRingCount, markerMatrix);
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
      color: '#e4f7bd', transparent: true, opacity: 0.92, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    })
  );
  selectedRing.name = 'realm-wood-node-selection-ring';
  selectedRing.rotation.x = -Math.PI * 0.5;
  selectedRing.visible = false;
  fallbackGroup.add(selectedRing);

  const pickGeometry = new THREE.CylinderGeometry(0.52, 0.52, 0.72, 16);
  const pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const pickVolumes = new THREE.InstancedMesh(pickGeometry, pickMaterial, nodes.length);
  pickVolumes.name = 'realm-wood-node-pick-volumes';
  pickVolumes.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const pickIndexByInstance = new Map<number, SceneNode>();
  nodes.forEach((node, index) => {
    markerMatrix.makeTranslation(node.world.x, node.world.y + 0.36, node.world.z);
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
  const budget = options.presentationBudget;
  const maximumRenderedCamps = budget?.maximumRenderedNodes
    ?? HEGEMONY_LOGGING_CAMP_RENDER_LIMITS.maximumRenderedNodes[options.quality.id];
  const maximumRenderedWagons = budget?.maximumRenderedWagons
    ?? HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedWagons[options.quality.id];
  const wagonAnimationBudget = budget?.wagonAnimationBudget
    ?? (isMobileRealmPresentation()
      ? HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.mobile
      : HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.desktop);
  let selectedSiteId: string | undefined;
  let disposed = false;
  let lastElapsedSeconds = 0;
  let markerPresentationSignature = '';
  let telemetry: RealmWoodNodePresentationTelemetry = Object.freeze({
    publicSiteCount: nodes.length,
    occupiedSiteCount: nodes.filter((node) => node.record.occupation !== undefined).length,
    renderedWoodCampCount: 0,
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
  const modelFor = (kind: ModelKind, lod: HegemonyExpeditionLod) => models.get(modelMapKey(kind, lod));
  const loadedLodFor = (kind: ModelKind, requested: HegemonyExpeditionLod) => (
    loadedLodAtOrBelow(requested, (lod) => modelFor(kind, lod) !== undefined)
  );
  const syncFallbackMarkers = () => {
    const presentedSiteIds = [...visualInstances.values()]
      .filter((visual) => visual.kind === 'logging-camp')
      .map((visual) => visual.key.slice('camp:'.length))
      .sort();
    const signature = presentedSiteIds.join('|');
    if (signature === markerPresentationSignature) return;
    markerPresentationSignature = signature;
    const presented = new Set(presentedSiteIds);
    for (const node of nodes) {
      const index = markerIndexBySiteId.get(node.record.siteId);
      if (index === undefined) continue;
      markerPosition.set(node.world.x, node.world.y + 0.21, node.world.z);
      markerScale.setScalar(presented.has(node.record.siteId) ? 0 : 1);
      markerMatrix.compose(markerPosition, markerRotation, markerScale);
      markers.setMatrixAt(index, markerMatrix);
    }
    markers.instanceMatrix.needsUpdate = true;
  };

  const replaceVisuals = (camera: THREE.PerspectiveCamera, nowMicros: bigint, elapsedSeconds: number) => {
    const campCandidates = nodes
      .map((node) => ({ node, distance: cameraDistance(camera, node.world) }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, maximumRenderedCamps);
    const desired = new Map<string, Readonly<{
      kind: ModelKind;
      lod: HegemonyExpeditionLod;
      node: SceneNode;
      pose?: RealmWoodWagonPose;
      animate: boolean;
    }>>();
    for (const candidate of campCandidates) {
      const requested = chooseCampLod(options.quality, candidate.distance);
      const lod = requested ? loadedLodFor('logging-camp', requested) : undefined;
      if (lod) desired.set(`camp:${candidate.node.record.siteId}`, Object.freeze({
        kind: 'logging-camp', lod, node: candidate.node, animate: false
      }));
    }
    const wagonCandidates = nodes
      .map((node) => {
        const pose = resolveRealmWoodWagonPose(node.record, nowMicros);
        if (!pose) return undefined;
        const position = interpolatePose(pose, options.surface, options.terrainPlacements);
        return { node, pose, position, distance: cameraDistance(camera, position) };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
      .sort((left, right) => (
        Number(right.node.record.siteId === selectedSiteId) - Number(left.node.record.siteId === selectedSiteId)
        || Number(right.node.record.occupiedByViewer) - Number(left.node.record.occupiedByViewer)
        || left.distance - right.distance
      ))
      .slice(0, maximumRenderedWagons);
    let animatedWagons = 0;
    let detailedAnimatedWagons = 0;
    for (const candidate of wagonCandidates) {
      const requested = chooseWagonLod(options.quality, candidate.distance, candidate.node.record.siteId === selectedSiteId);
      const lod = requested ? loadedLodFor('wagon', requested) : undefined;
      const detailedLod = lod === 'high' || lod === 'balanced';
      const animate = lod !== undefined
        && !options.reducedMotion
        && candidate.pose.phase !== 'gathering'
        && animatedWagons < wagonAnimationBudget.total
        && (!detailedLod || detailedAnimatedWagons < wagonAnimationBudget.highOrBalanced);
      if (!lod) continue;
      desired.set(`wagon:${candidate.node.record.siteId}`, Object.freeze({
        kind: 'wagon', lod, node: candidate.node, pose: candidate.pose, animate
      }));
      if (animate) {
        animatedWagons += 1;
        if (detailedLod) detailedAnimatedWagons += 1;
      }
    }
    for (const [key, visual] of visualInstances) {
      const next = desired.get(key);
      if (!next || next.lod !== visual.lod || next.kind !== visual.kind || Boolean(next.animate) !== Boolean(visual.mixer)) {
        removeVisual(key);
      }
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
      if (next.kind === 'logging-camp') {
        visual.root.position.set(next.node.world.x, next.node.world.y, next.node.world.z);
      } else if (next.pose) {
        const position = interpolatePose(next.pose, options.surface, options.terrainPlacements);
        visual.root.position.set(position.x, position.y, position.z);
        visual.root.rotation.y = position.yaw;
        if (visual.mixer) visual.mixer.update(Math.max(0, Math.min(0.5, elapsedSeconds - lastElapsedSeconds)));
      }
    }
    lastElapsedSeconds = elapsedSeconds;
    syncFallbackMarkers();
    const renderedWoodCampCount = [...visualInstances.values()].filter((visual) => visual.kind === 'logging-camp').length;
    const renderedWagonCount = [...visualInstances.values()].filter((visual) => visual.kind === 'wagon').length;
    telemetry = Object.freeze({
      publicSiteCount: nodes.length,
      occupiedSiteCount: nodes.filter((node) => node.record.occupation !== undefined).length,
      renderedWoodCampCount,
      renderedWagonCount,
      animatedWagonCount: [...visualInstances.values()].filter((visual) => visual.kind === 'wagon' && visual.mixer !== undefined).length,
      markerOnlySiteCount: Math.max(0, nodes.length - renderedWoodCampCount)
    });
  };

  const loadModels = async () => {
    const tasks: Array<Promise<void>> = [];
    for (const lod of qualityLods(options.quality)) {
      tasks.push(acquireHegemonyExpeditionPrefab({
        label: `Hegemony Logging Camp ${lod}`,
        asset: HEGEMONY_LOGGING_CAMP_RUNTIME_ASSETS[lod],
        materialRole: 'gathering-node',
        baseUrl: options.baseUrl,
        targetFootprintDiameter: LOGGING_CAMP_TARGET_FOOTPRINT,
        dynamicShadows: options.quality.dynamicShadows,
        maxAnisotropy: options.maxAnisotropy,
        signal: modelAbortController.signal
      }).then((model) => {
        const key = modelMapKey('logging-camp', lod);
        if (disposed) { model.release(); return; }
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
          if (disposed) { model.release(); return; }
          modelLeases.set(key, model);
          models.set(key, model.model);
          options.onModelReady?.();
        }));
      }
    }
    await Promise.allSettled(tasks);
  };
  if (nodes.length > 0) void loadModels().catch(() => undefined);

  const setSelectedSiteId = (siteId: string | null) => {
    selectedSiteId = siteId ?? undefined;
    const node = selectedSiteId ? nodeBySiteId.get(selectedSiteId) : undefined;
    selectedRing.visible = node !== undefined;
    if (node) selectedRing.position.set(node.world.x, node.world.y + 0.026, node.world.z);
  };
  const reconcile = (sites: readonly RealmWoodNodeSceneRecord[]) => {
    if (disposed || sites.length !== nodes.length) return false;
    const nextBySiteId = new Map<string, RealmWoodNodeSceneRecord>();
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
    const before = `${telemetry.renderedWoodCampCount}:${telemetry.renderedWagonCount}:${telemetry.animatedWagonCount}`;
    replaceVisuals(camera, nowMicros, elapsedSeconds);
    const after = `${telemetry.renderedWoodCampCount}:${telemetry.renderedWagonCount}:${telemetry.animatedWagonCount}`;
    return before !== after || nodes.some((node) => node.record.availability === 'outbound' || node.record.availability === 'returning');
  };
  const raycast = (raycaster: THREE.Raycaster) => {
    const hit = raycaster.intersectObject(pickVolumes, false)[0];
    const node = hit?.instanceId === undefined ? undefined : pickIndexByInstance.get(hit.instanceId);
    return node ? Object.freeze({ siteId: node.record.siteId, coord: node.record.coord }) : null;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    modelAbortController.abort();
    for (const key of [...visualInstances.keys()]) removeVisual(key);
    for (const lease of modelLeases.values()) {
      try { lease.release(); } catch { /* continue teardown */ }
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
    hasMovingWagons: () => nodes.some((node) => node.record.availability === 'outbound' || node.record.availability === 'returning'),
    getPresentationTelemetry: () => telemetry,
    dispose
  });
}

export const HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS = Object.freeze({
  loggingCampTargetFootprint: LOGGING_CAMP_TARGET_FOOTPRINT,
  wagonTargetFootprint: WAGON_TARGET_FOOTPRINT
});
