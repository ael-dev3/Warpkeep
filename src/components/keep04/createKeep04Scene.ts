import * as THREE from 'three';
import type { Building04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';
import type { BuildingView04 } from '../../ptr/gameplay04/gameplay04Presentation';
import type { InnerKeepRuntimeAssetBundle, InnerKeepRuntimePrefab } from '../inner-keep/loadInnerKeepRuntimeAssets';
import { createKeep04Building, KEEP04_FOOTPRINTS, measureKeep04Object, type Keep04Building } from './createKeep04Buildings';
import { KEEP04_BUILDING_IDS, KEEP04_TREE_IDS } from './loadKeep04Assets';
import { fitKeep04Camera, fitKeep04SiteCamera, KEEP04_VISUAL_PROFILE as P, type Quality04 } from './keep04VisualProfile';
import { createKeep04Dressing } from './keep04VoxelDressing';
import { KEEP04_VALE_PALETTE as V } from './keep04ValePalette';
import { createKeep04Landscape, type Keep04Landscape } from './createKeep04Landscape';
import { createKeep04Life, type Keep04Life, type Keep04WorkerVisual } from './createKeep04Life';
import { keep04ContactShadowGeometry, keep04ContactShadowMaterial } from './keep04ModelKit';
import {
  verdantDaylightAt, verdantDaylightKey, verdantLocalHour, verdantSunDirection, type VerdantDaylight,
} from '../../greater-realm/verdantDaylight';

export type { Keep04WorkerVisual } from './createKeep04Life';
/** Presentation-only scene input. `workers` carries confirmed journey phases, never economics. */
export type VisualState04 = Readonly<{ buildings: readonly BuildingView04[]; selectedKind: Building04 | null; draft: Placement04 | null; draftValid: boolean;
  workers?: readonly Keep04WorkerVisual[] }>;
export type SceneTelemetry04 = Readonly<{
  drawCalls: number; triangles: number; geometryBytes: number; textureBytes: number; uploadBytes: number;
  voxelQuads: number; sceneryInstances: number; buildingCount: number; pickTargetCount: number;
  voxelPreparationMs: number | null;
  /** Decorative vale instances and living actors; neither is pickable. */
  landscapeInstances: number; lifeActors: number;
  fallback: 'none' | 'asset' | 'voxel' | 'budget';
}>;
export type Scene04 = Readonly<{
  scene: THREE.Scene; camera: THREE.OrthographicCamera; reconcile: (state: VisualState04) => void;
  admitBuildingPrefab: (kind: Building04, prefab: InnerKeepRuntimePrefab) => boolean;
  resize: (width: number, height: number, preserveOrientation?: boolean) => void; pickBuilding: (ndcX: number, ndcY: number) => Building04 | null;
  selectedSiteBounds: () => THREE.Box3 | null; entryOverviewBounds: () => THREE.Box3 | null;
  fitSite: (bounds: THREE.Box3, aspect: number, inspection?: boolean) => boolean;
  pickPlacement: (ndcX: number, ndcY: number, kind: Building04) => Placement04 | null;
  /** Advances reveals, and ambient life when `ambient` allows it; true while anything still moves. */
  update: (elapsedSeconds: number, ambient?: boolean) => boolean; telemetry: () => SceneTelemetry04; dispose: () => void;
  /** Current daylight mood (presentation only) and the tone-mapping exposure it wants. */
  daylight: () => VerdantDaylight; exposure: () => number;
}>;

const KEEP04_MOAT_SURFACE_Y = -0.98;
// World bearings (atan2(x, z)) of the morning and evening sun. Both stay on the
// camera side of the citadel, so facades are lit from dawn to dusk while the
// shadows still sweep across the grounds through the day.
const KEEP04_SUN_MORNING = .9; const KEEP04_SUN_EVENING = -1.5;
const KEEP04_LIGHT_TARGET = new THREE.Vector3(0, 0, -4);

const WORKER_VISUAL_FIELDS = ['ordinal', 'phase', 'resource', 'phaseStartedAtMs', 'phaseEndsAtMs'];

export function createKeep04Scene(options: Readonly<{
  quality: Quality04; reducedMotion: boolean; assets: InnerKeepRuntimeAssetBundle; qaVoxelFailure?: boolean;
  /** Continuous ambient life (villagers walking, mills turning). Static when off or under reduced motion. */
  ambient?: boolean;
  /** Local hour for the daylight mood; defaults to the device clock. Presentation only. */
  daylightHour?: () => number;
}>): Scene04 {
  const { quality, assets } = options; const budget = P.budgets[quality];
  const animateAmbient = Boolean(options.ambient) && !options.reducedMotion;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(V.haze); scene.fog = new THREE.Fog(V.haze, 175, 390);
  const camera = new THREE.OrthographicCamera(); fitKeep04Camera(camera, 1.4);
  const scenery = new THREE.Group(); scenery.name = 'non-pickable-scenery'; scene.add(scenery);
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
  const instances = new Set<THREE.InstancedMesh>();
  const entryLandmarks: THREE.Mesh[] = [];
  let shadow: THREE.LightShadow | undefined;
  const buildings = new Map<Building04, { key: string; building: Keep04Building; view: BuildingView04; reveal: number | null }>();
  let disposed = false; let baseFallback: SceneTelemetry04['fallback'] = 'none'; let fallback: SceneTelemetry04['fallback'] = 'none'; let voxelQuads = 0;
  let voxelPreparationMs: number | null = null;
  let indicatorKey = ''; let selected: THREE.Mesh | null = null; let draft: THREE.Mesh | null = null;
  let visualState: VisualState04 | null = null;
  let landscape: Keep04Landscape | null = null; let life: Keep04Life | null = null;
  const hourNow = options.daylightHour ?? (() => verdantLocalHour(Date.now()));
  let daylight = verdantDaylightAt(hourNow()); let daylightApplied = -1; let applyDaylight: () => void = () => {};
  let contactBatch: THREE.InstancedMesh | null = null;
  let nightPools: THREE.InstancedMesh | null = null; let nightPoolMaterial: THREE.MeshBasicMaterial | null = null;
  const pickTargets: THREE.Object3D[] = []; const pickKinds = new Map<THREE.Object3D, Building04>();
  const raycaster = new THREE.Raycaster(); const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function mat(color: string) { const material = new THREE.MeshStandardMaterial({ color, roughness: .95 }); materials.add(material); return material; }
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    geometries.add(geometry); const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.receiveShadow = true; scenery.add(object); return object;
  }
  function dispose() {
    if (disposed) return; disposed = true;
    buildings.forEach(entry => entry.building.dispose()); buildings.clear(); pickTargets.length = 0; pickKinds.clear();
    life?.dispose(); life = null; landscape?.dispose(); landscape = null;
    entryLandmarks.length = 0;
    instances.forEach(instance => instance.dispose()); instances.clear();
    geometries.forEach(g => g.dispose()); geometries.clear(); materials.forEach(m => m.dispose()); materials.clear();
    shadow?.dispose(); scene.clear();
  }
  try {
    const masonry = mat(P.masonry); const groundMat = mat(P.ground);
    // One unbroken, level legal support deck, with the terracing strictly outside it.
    // A mown courtyard lawn: soft alternating bands and broad tonal patches make
    // the grounds read as a tended green rather than a display platform.
    const deckGeometry = new THREE.BoxGeometry(88, 1, 72, 44, 1, 36);
    const deckPositions = deckGeometry.getAttribute('position'); const deckColors = new Float32Array(deckPositions.count * 3);
    const lawn = new THREE.Color(V.courtyardLawn); const lawnDeep = new THREE.Color(V.courtyardLawnDeep); const lawnTone = new THREE.Color();
    for (let i = 0; i < deckPositions.count; i++) {
      const x = deckPositions.getX(i); const z = deckPositions.getZ(i);
      const shade = .93 + Math.sin(x * .31 + z * .17) * .05 + Math.cos(z * .39 - x * .13) * .035;
      const band = Math.floor((x + 44) / 4) % 2 === 0 ? 1.035 : .965;
      lawnTone.copy(lawn).lerp(lawnDeep, .5 + Math.sin(x * .11 - z * .07) * .3 + Math.cos(z * .16 + x * .05) * .2).multiplyScalar(shade * band);
      deckColors.set([lawnTone.r, lawnTone.g, lawnTone.b], i * 3);
    }
    deckGeometry.setAttribute('color', new THREE.BufferAttribute(deckColors, 3));
    const deckMaterial = mat('#ffffff'); deckMaterial.vertexColors = true;
    mesh(deckGeometry, deckMaterial, 0, -.5, -4).name = 'legal-support-y0';
    // The U-shaped moat sits just above the outer terrace course. It frames
    // the back and sides while keeping the front gate and civic approach open.
    // One merged mesh keeps the water static, non-pickable and inexpensive.
    const waterGeometry = new THREE.BufferGeometry();
    const waterPositions: number[] = [];
    const waterNormals: number[] = [];
    const waterColors: number[] = [];
    const waterIndices: number[] = [];
    const longSegments = quality === 'high' ? 12 : quality === 'balanced' ? 8 : 4;
    const appendWaterStrip = (x0: number, x1: number, z0: number, z1: number, xSegments: number, zSegments: number) => {
      const start = waterPositions.length / 3;
      for (let row = 0; row <= zSegments; row++) for (let column = 0; column <= xSegments; column++) {
        const x = x0 + (x1 - x0) * column / xSegments;
        const z = z0 + (z1 - z0) * row / zSegments;
        const shimmer = .86 + Math.sin(x * .36 + z * .52) * .06 + Math.cos(x * .18 - z * .77) * .04;
        waterPositions.push(x, KEEP04_MOAT_SURFACE_Y, z);
        waterNormals.push(0, 1, 0);
        waterColors.push(.28 * shimmer, .56 * shimmer, .60 * shimmer);
      }
      for (let row = 0; row < zSegments; row++) for (let column = 0; column < xSegments; column++) {
        const a = start + row * (xSegments + 1) + column;
        const b = a + 1;
        const d = a + xSegments + 1;
        const c = d + 1;
        // Winding faces upward in the X/Z plane.
        waterIndices.push(a, d, b, b, d, c);
      }
    };
    appendWaterStrip(-44, 44, -48, -40, longSegments, 2);
    appendWaterStrip(-52, -44, -40, 32, 2, longSegments);
    appendWaterStrip(44, 52, -40, 32, 2, longSegments);
    waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
    waterGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
    waterGeometry.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
    waterGeometry.setIndex(waterIndices);
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: '#5a9a9b',
      emissive: '#173d40',
      emissiveIntensity: .22,
      metalness: .08,
      roughness: .2,
      transparent: true,
      opacity: quality === 'reduced' ? .78 : .88,
      vertexColors: true,
    });
    materials.add(waterMaterial);
    mesh(waterGeometry, waterMaterial).name = 'moat-water-surface';
    const waterEdgeGeometry = new THREE.BoxGeometry(1, .08, .18);
    geometries.add(waterEdgeGeometry);
    const waterEdge = new THREE.InstancedMesh(waterEdgeGeometry, mat('#b7d2c1'), 3);
    waterEdge.name = 'moat-water-edge';
    const edge = (index: number, x: number, z: number, length: number, rotationY: number) => {
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(x, -.94, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
        new THREE.Vector3(length, 1, 1),
      );
      waterEdge.setMatrixAt(index, transform);
    };
    edge(0, 0, -40.45, 86, 0);
    edge(1, -44.45, -4, 72, Math.PI / 2);
    edge(2, 44.45, -4, 72, Math.PI / 2);
    waterEdge.instanceMatrix.needsUpdate = true;
    instances.add(waterEdge);
    scenery.add(waterEdge);
    let forestTerrace: THREE.Mesh;
    try {
      if (import.meta.env.DEV && options.qaVoxelFailure) throw new Error('QA voxel preparation failure.');
      const preparationStart = performance.now();
      const dressing = createKeep04Dressing(quality); voxelPreparationMs = performance.now() - preparationStart; voxelQuads = dressing.quads;
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }); materials.add(material);
      forestTerrace = mesh(dressing.geometry, material); forestTerrace.name = 'voxel-terracing';
    } catch {
      baseFallback = fallback = 'voxel'; forestTerrace = mesh(new THREE.BoxGeometry(96, 2, 80), groundMat, 0, -2, -4); forestTerrace.name = 'simple-perimeter-fallback';
    }
    // One shallow U-shaped bank gives the existing forest bands somewhere to
    // sit along the rear and side terraces. The south gate approach stays open.
    const forestBankGeometry = new THREE.BoxGeometry(1, 1, 1);
    geometries.add(forestBankGeometry);
    const forestBank = new THREE.InstancedMesh(forestBankGeometry, groundMat, 3);
    forestBank.name = 'forest-bank:perimeter'; forestBank.receiveShadow = true;
    const bankTransform = new THREE.Matrix4();
    [
      { position: [0, -5.25, -55] as const, size: [110, .5, 12] as const },
      { position: [-55, -5.25, -8] as const, size: [6, .5, 84] as const },
      { position: [55, -5.25, -8] as const, size: [6, .5, 84] as const },
    ].forEach(({ position, size }, index) => {
      bankTransform.compose(new THREE.Vector3(...position), new THREE.Quaternion(), new THREE.Vector3(...size));
      forestBank.setMatrixAt(index, bankTransform);
    });
    forestBank.instanceMatrix.needsUpdate = true;
    instances.add(forestBank); scenery.add(forestBank);
    // Read only the actual decorative support once while building the scene;
    // this ray is separate from the legal placement plane and gameplay picks.
    forestTerrace.updateMatrixWorld(true); forestBank.updateMatrixWorld(true);
    const forestSupportRay = new THREE.Raycaster(undefined, new THREE.Vector3(0, -1, 0), 0, 32);
    const forestSupport = [forestTerrace, forestBank];
    const forestGroundAt = (x: number, z: number) => {
      forestSupportRay.ray.origin.set(x, 8, z);
      const support = forestSupportRay.intersectObjects(forestSupport, false)[0];
      if (!support) throw new RangeError('Keep forest root has no rendered support.');
      return support.point.y;
    };
    const spine = mesh(new THREE.BoxGeometry(6, .035, 35), masonry, 0, .02, 14.5); spine.name = 'open-gate-spine';
    const commons = mesh(new THREE.BoxGeometry(10, .04, 10), masonry, 0, .022, 2); commons.name = 'open-civic-commons';
    const seal = mesh(new THREE.CylinderGeometry(2.3, 2.3, .04, 24), mat(P.warpViolet), 0, .06, 2); seal.name = 'civic-seal';
    entryLandmarks.push(spine, commons, seal);
    // Far parapet and low side coping: no camera-side opaque wall to hide buildings.
    mesh(new THREE.BoxGeometry(88, 1.2, .8), masonry, 0, .1, -40.6);
    for (const x of [-44.6, 44.6]) mesh(new THREE.BoxGeometry(.8, .55, 72), masonry, x, -.05, -4);
    for (const x of [-5.2, 5.2]) {
      entryLandmarks.push(mesh(new THREE.BoxGeometry(1.6, 3.5, 1.6), masonry, x, 1.75, 33.5),
        mesh(new THREE.ConeGeometry(1.3, 1.1, 4), mat(P.roofTeal), x, 4.05, 33.5));
    }
    // The surrounding vale and its life are decorative and optional: if either
    // cannot be prepared, the keep, its placement and its picking stay intact.
    try {
      landscape = createKeep04Landscape({ quality, reducedMotion: !animateAmbient, plinthGroundAt: (x, z) => {
        try { return forestGroundAt(x, z); } catch { return 0; }
      } });
      scenery.add(landscape.group);
    } catch { landscape = null; }
    try {
      life = createKeep04Life({ quality, animate: animateAmbient, landscape });
      scenery.add(life.group);
    } catch { life = null; }
    // A warm key (sun or moon) with the only shadow, a cool shadow-side fill and
    // a sky/ground hemisphere. The daylight mood drives all three, the fog and
    // the window glow; nothing here changes picking, placement or budgets.
    const key = new THREE.DirectionalLight('#ffeccb', 3.1); key.target.position.copy(KEEP04_LIGHT_TARGET);
    shadow = key.shadow;
    key.castShadow = quality === 'high'; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 240 }); key.shadow.bias = -.0008;
    key.shadow.normalBias = .04; key.shadow.radius = 2.5;
    const fill = new THREE.DirectionalLight('#a9bfd6', .3); fill.target.position.copy(KEEP04_LIGHT_TARGET);
    const sky = new THREE.HemisphereLight('#e4f0f2', '#5b6a49', 2.05);
    scene.add(key, key.target, fill, fill.target, sky);
    const sunDirection = new THREE.Vector3();
    applyDaylight = () => {
      const hour = hourNow(); const moodKey = verdantDaylightKey(hour);
      if (moodKey === daylightApplied) return;
      daylightApplied = moodKey; daylight = verdantDaylightAt(hour);
      verdantSunDirection(daylight, KEEP04_SUN_MORNING, KEEP04_SUN_EVENING, sunDirection);
      key.position.copy(sunDirection).multiplyScalar(120).add(KEEP04_LIGHT_TARGET);
      key.color.copy(daylight.sunColor); key.intensity = daylight.sunIntensity;
      key.shadow.intensity = .62 + .33 * (1 - daylight.night);
      // The fill comes low from the opposite side of the key, lifting shadowed faces with sky colour.
      fill.position.set(-sunDirection.x, .45, -sunDirection.z).normalize().multiplyScalar(120).add(KEEP04_LIGHT_TARGET);
      fill.color.copy(daylight.fillColor); fill.intensity = daylight.fillIntensity;
      sky.color.copy(daylight.skyColor); sky.groundColor.copy(daylight.groundColor); sky.intensity = daylight.hemisphereIntensity;
      (scene.background as THREE.Color).copy(daylight.hazeColor); (scene.fog as THREE.Fog).color.copy(daylight.hazeColor);
      landscape?.setNightGlow(daylight.windowGlow); life?.setNightGlow(daylight.windowGlow);
      if (nightPools && nightPoolMaterial) { nightPools.visible = daylight.windowGlow > .03; nightPoolMaterial.opacity = daylight.windowGlow * .3; }
    };
    applyDaylight();

    // The catalog-wide quality and size decision is made before loading. Preflight
    // each actual source before admitting it, including models loaded after entry.
    const admitted = new Map<string, InnerKeepRuntimePrefab>(); let sourceTriangles = 0; let sourceDraws = 0;
    // The vale and its life spend from the same scene target as authored models,
    // including shadow submissions, so decoration can never crowd out a building.
    {
      const vale = landscape?.cost(); const living = life?.cost();
      sourceTriangles += (vale?.triangles ?? 0) + (vale?.shadowTriangles ?? 0) + (living?.triangles ?? 0) * (quality === 'high' ? 1.5 : 1);
      sourceDraws += (vale?.drawCalls ?? 0) + (vale?.shadowDrawCalls ?? 0) + (living?.drawCalls ?? 0) + (quality === 'high' ? 3 : 0);
    }
    // Soft ground contact under the six buildings: one transparent batch.
    {
      const contactGeometry = keep04ContactShadowGeometry(quality === 'reduced' ? 8 : 18); geometries.add(contactGeometry);
      const contactMaterial = keep04ContactShadowMaterial(); materials.add(contactMaterial);
      contactBatch = new THREE.InstancedMesh(contactGeometry, contactMaterial, KEEP04_BUILDING_IDS.length);
      contactBatch.name = 'building-contact-shadows'; contactBatch.raycast = () => {}; contactBatch.count = 0; contactBatch.renderOrder = -1;
      instances.add(contactBatch); scenery.add(contactBatch);
      sourceTriangles += (contactGeometry.index!.count / 3) * KEEP04_BUILDING_IDS.length; sourceDraws += 1;
      // After dusk, warm light spills around each occupied building's base (not on reduced).
      if (quality !== 'reduced') {
        nightPoolMaterial = new THREE.MeshBasicMaterial({ color: '#ffae5a', vertexColors: true, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
        materials.add(nightPoolMaterial);
        nightPools = new THREE.InstancedMesh(contactGeometry, nightPoolMaterial, KEEP04_BUILDING_IDS.length);
        nightPools.name = 'building-night-light'; nightPools.raycast = () => {}; nightPools.count = 0; nightPools.visible = false;
        instances.add(nightPools); scenery.add(nightPools);
        sourceTriangles += (contactGeometry.index!.count / 3) * KEEP04_BUILDING_IDS.length; sourceDraws += 1;
      }
    }
    daylightApplied = -1; applyDaylight();
    function admitPrefab(id: string, prefab: InnerKeepRuntimePrefab) {
      if (admitted.has(id)) return true;
      try {
        const measured = measureKeep04Object(prefab.root); const instances = (KEEP04_TREE_IDS as readonly string[]).includes(id) ? budget.trees / 2 : 1;
        const shadowFactor = quality === 'high' ? 2 : 1;
        if (measured.triangles > prefab.triangles + 16 || measured.drawCalls > prefab.drawCalls
          || sourceTriangles + measured.triangles * instances * shadowFactor > budget.triangles - 12000
          || sourceDraws + measured.drawCalls * instances * shadowFactor > budget.draws - 40) { baseFallback = fallback = 'budget'; return false; }
        sourceTriangles += measured.triangles * instances * shadowFactor; sourceDraws += measured.drawCalls * instances * shadowFactor;
        admitted.set(id, prefab);
        return true;
      } catch { baseFallback = fallback = 'budget'; return false; }
    }
    for (const id of [...KEEP04_BUILDING_IDS, ...KEEP04_TREE_IDS]) {
      const prefab = assets.staticPrefabs.get(id); if (prefab) admitPrefab(id, prefab);
    }
    // Two sparse overlapping bands frame the back and sides, leaving the south
    // approach open. Instancing keeps each tree species to one draw call.
    for (let band = 0; band < 2; band++) {
      const id = KEEP04_TREE_IDS[band]; const prefab = admitted.get(id); const count = budget.trees / 2;
      const sourceMeshes: THREE.Mesh[] = [];
      if (prefab) { prefab.root.updateMatrixWorld(true); prefab.root.traverse(o => { if (o instanceof THREE.Mesh) sourceMeshes.push(o); }); }
      const rootMinY = sourceMeshes.length ? new THREE.Box3().setFromObject(prefab!.root).min.y : 0;
      if (!sourceMeshes.length) {
        const geometry = new THREE.ConeGeometry(2.3, 9, 7); geometry.translate(0, 4.5, 0);
        geometries.add(geometry); sourceMeshes.push(new THREE.Mesh(geometry, mat(band === 0 ? P.forestNear : '#81917a')));
        if (baseFallback === 'none') baseFallback = fallback = 'asset';
      }
      // Adapt the stable population/quality selection idea from Tervain
      // floraPopulation.ts @db2a356: detail thins a fixed authored population.
      // The first three ranks retain the back and both sides at every quality.
      const transforms = Array.from({ length: count }, (_, i) => {
        const cluster = i % 3; const slot = Math.floor(i / 3);
        const spread = [0, -.5, .5][slot];
        const x = cluster === 0 ? spread * (band === 0 ? 68 : 74)
          : (cluster === 1 ? -1 : 1) * (band === 0 ? 53 : 56);
        const z = cluster === 0 ? (band === 0 ? -52 : -58) - [0, 2, .8][(slot + band) % 3]
          : -8 + spread * (band === 0 ? 54 : 62) - [0, 2.3, .7][(slot + band) % 3];
        const size = prefab ? (band === 0 ? 1.5 : 1.92) + [.08, .3, 0, .18][(i + band) % 4] : 1;
        return new THREE.Matrix4().compose(new THREE.Vector3(x, forestGroundAt(x, z) - rootMinY * size, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), new THREE.Vector3(size, size, size));
      });
      for (const source of sourceMeshes) {
        const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld); geometries.add(geometry);
        const copies = (Array.isArray(source.material) ? source.material : [source.material]).map(original => {
          const copy = original.clone(); materials.add(copy);
          if (copy instanceof THREE.MeshStandardMaterial) copy.color.set(band === 0 ? P.forestNear : '#81917a');
          return copy;
        });
        const forest = new THREE.InstancedMesh(geometry, Array.isArray(source.material) ? copies : copies[0], count);
        instances.add(forest);
        forest.name = `forest-band:${band}`; forest.castShadow = quality === 'high'; forest.receiveShadow = true;
        transforms.forEach((transform, index) => forest.setMatrixAt(index, transform));
        forest.instanceMatrix.needsUpdate = true; scenery.add(forest);
      }
    }
    function retireIndicator(indicator: THREE.Mesh | null) {
      if (!indicator) return; indicator.removeFromParent(); indicator.geometry.dispose(); geometries.delete(indicator.geometry);
      const material = indicator.material as THREE.Material; material.dispose(); materials.delete(material);
    }
    function footprint(placement: Placement04, color: string, name: string) {
      const [w, d] = KEEP04_FOOTPRINTS[placement.kind];
      const shape = new THREE.Shape(); shape.moveTo(-w / 2, -d / 2); shape.lineTo(w / 2, -d / 2); shape.lineTo(w / 2, d / 2); shape.lineTo(-w / 2, d / 2); shape.closePath();
      const hole = new THREE.Path(); hole.moveTo(-w / 2 + .60, -d / 2 + .60); hole.lineTo(-w / 2 + .60, d / 2 - .60); hole.lineTo(w / 2 - .60, d / 2 - .60); hole.lineTo(w / 2 - .60, -d / 2 + .60); hole.closePath(); shape.holes.push(hole);
      const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(-Math.PI / 2); geometries.add(geometry);
      const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }); materials.add(material);
      const indicator = new THREE.Mesh(geometry, material); indicator.name = name; indicator.position.set(Number(placement.x) / 1e6, .20, Number(placement.z) / 1e6);
      indicator.rotation.y = -placement.rotation * Math.PI / 180000; scene.add(indicator); return indicator;
    }
    function reconcile(state: VisualState04) {
      if (disposed) return;
      if (Object.keys(state).some(key => !['buildings', 'selectedKind', 'draft', 'draftValid', 'workers'].includes(key))) throw new TypeError('Unexpected visual state field.');
      for (const worker of state.workers ?? []) {
        if (Object.keys(worker).some(key => !WORKER_VISUAL_FIELDS.includes(key))) throw new TypeError('Unexpected visual worker field.');
      }
      const placementFields = ['kind', 'x', 'z', 'rotation'];
      const buildingFields = ['kind', 'placement', 'completedLevel', 'targetLevel', 'phase', 'startsAtMicros', 'completesAtMicros'];
      for (const view of state.buildings) {
        if (Object.keys(view).some(key => !buildingFields.includes(key)) || Object.keys(view.placement).some(key => !placementFields.includes(key))) throw new TypeError('Unexpected visual building field.');
      }
      if (state.draft && Object.keys(state.draft).some(key => !placementFields.includes(key))) throw new TypeError('Unexpected visual draft field.');
      const present = new Set(state.buildings.map(view => view.kind));
      for (const [kind, entry] of buildings) if (!present.has(kind)) { entry.building.dispose(); buildings.delete(kind); }
      for (const view of state.buildings) {
        const key = [view.completedLevel, view.targetLevel, view.phase, view.startsAtMicros, view.completesAtMicros, view.placement.x, view.placement.z, view.placement.rotation,
          view.phase === 'complete' && admitted.has(view.kind) ? 'prefab' : 'silhouette'].join(':');
        const previous = buildings.get(view.kind); if (previous?.key === key) continue;
        const reveal = previous?.view.phase === 'constructing' && view.phase === 'complete' && !options.reducedMotion;
        previous?.building.dispose();
        const building = createKeep04Building({ kind: view.kind, level: view.completedLevel, constructing: view.phase === 'constructing', quality, prefab: admitted.get(view.kind) });
        building.root.position.set(Number(view.placement.x) / 1e6, 0, Number(view.placement.z) / 1e6); building.root.rotation.y = -view.placement.rotation * Math.PI / 180000;
        if (reveal) building.root.scale.setScalar(.94);
        scene.add(building.root); buildings.set(view.kind, { key, building, view, reveal: reveal ? -1 : null });
      }
      fallback = baseFallback === 'none' && [...buildings.values()].some(entry => entry.building.fallback) ? 'asset' : baseFallback;
      if (contactBatch) {
        let index = 0; const transform = new THREE.Matrix4(); const turn = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0);
        for (const { view } of buildings.values()) {
          if (index >= contactBatch.instanceMatrix.count) break;
          const [width, depth] = KEEP04_FOOTPRINTS[view.kind];
          transform.compose(new THREE.Vector3(Number(view.placement.x) / 1e6, .035, Number(view.placement.z) / 1e6),
            turn.setFromAxisAngle(up, -view.placement.rotation * Math.PI / 180000), new THREE.Vector3(width * .64 + .6, 1, depth * .64 + .6));
          contactBatch.setMatrixAt(index, transform);
          nightPools?.setMatrixAt(index, transform.scale(new THREE.Vector3(1.45, 1, 1.45)));
          index++;
        }
        contactBatch.count = index; contactBatch.instanceMatrix.needsUpdate = true; contactBatch.computeBoundingSphere();
        if (nightPools) { nightPools.count = index; nightPools.instanceMatrix.needsUpdate = true; nightPools.computeBoundingSphere(); }
      }
      pickTargets.length = 0; pickKinds.clear();
      for (const [kind, entry] of buildings) { pickTargets.push(entry.building.root); pickKinds.set(entry.building.root, kind); }
      const nextIndicatorKey = `${state.selectedKind}:${state.draft?.kind}:${state.draft?.x}:${state.draft?.z}:${state.draft?.rotation}:${state.draftValid}:${state.selectedKind ? buildings.get(state.selectedKind)?.key : ''}`;
      if (nextIndicatorKey !== indicatorKey) {
        retireIndicator(selected); retireIndicator(draft); selected = null; draft = null; indicatorKey = nextIndicatorKey;
        const picked = state.selectedKind ? buildings.get(state.selectedKind) : undefined;
        if (picked) selected = footprint(picked.view.placement, '#dfc6ff', 'selected-footprint');
        if (state.draft && !buildings.has(state.draft.kind)) draft = footprint(state.draft, state.draftValid ? '#d9f3be' : '#ffab7c', 'draft-footprint');
      }
      life?.reconcile({ buildings: state.buildings, workers: state.workers ?? [] });
      scene.updateMatrixWorld(true);
      visualState = state;
    }
    function setRay(x: number, y: number) { camera.updateMatrixWorld(true); raycaster.setFromCamera(new THREE.Vector2(x, y), camera); }
    function settledSiteBounds(placement: Placement04, root?: THREE.Group) {
      const [width, depth] = KEEP04_FOOTPRINTS[placement.kind];
      const transform = new THREE.Matrix4().compose(new THREE.Vector3(Number(placement.x) / 1e6, 0, Number(placement.z) / 1e6),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -placement.rotation * Math.PI / 180000), new THREE.Vector3(1, 1, 1));
      const bounds = new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, 0, depth / 2)).applyMatrix4(transform);
      if (root) {
        // Measure settled models without changing the temporary completion reveal
        // or borrowed geometry. Both camera views use the same bounds contract.
        const inverse = root.matrixWorld.clone().invert();
        root.traverseVisible(object => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.computeBoundingBox();
          if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(
            transform.clone().multiply(inverse).multiply(object.matrixWorld)));
        });
      }
      return bounds;
    }
    return {
      scene, camera, reconcile,
      admitBuildingPrefab: (kind, prefab) => !disposed && prefab.id === kind
        && (KEEP04_BUILDING_IDS as readonly string[]).includes(kind) && admitPrefab(kind, prefab),
      selectedSiteBounds: () => {
        if (disposed || !visualState?.selectedKind) return null;
        const entry = buildings.get(visualState.selectedKind);
        const placement = entry?.view.placement ?? (visualState.draft?.kind === visualState.selectedKind ? visualState.draft : null);
        if (!placement) return null;
        return settledSiteBounds(placement, entry?.building.root);
      },
      entryOverviewBounds: () => {
        if (disposed || buildings.size === 0) return null;
        const bounds = new THREE.Box3();
        for (const entry of buildings.values()) bounds.union(settledSiteBounds(entry.view.placement, entry.building.root));
        for (const landmark of entryLandmarks) bounds.union(new THREE.Box3().setFromObject(landmark));
        return bounds;
      },
      fitSite: (bounds, aspect, inspection = false) => !disposed && fitKeep04SiteCamera(camera, aspect, bounds, inspection),
      resize: (width, height, preserveOrientation = false) => { if (width > 0 && height > 0) fitKeep04Camera(camera, width / height, preserveOrientation); },
      pickBuilding: (x, y) => {
        if (disposed || ![x, y].every(value => Number.isFinite(value) && Math.abs(value) <= 1)) return null;
        setRay(x, y); const hit = raycaster.intersectObjects(pickTargets, true)[0]; let target: THREE.Object3D | null = hit?.object ?? null;
        while (target) { const kind = pickKinds.get(target); if (kind) return kind; target = target.parent; } return null;
      },
      pickPlacement: (x, y, kind) => {
        if (disposed || ![x, y].every(value => Number.isFinite(value) && Math.abs(value) <= 1)) return null;
        setRay(x, y); const position = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
        if (!position || Math.abs(position.x) > 44 || position.z < -40 || position.z > 32) return null;
        return Object.freeze({ kind, x: BigInt(Math.round(position.x * 2)) * 500000n, z: BigInt(Math.round(position.z * 2)) * 500000n, rotation: 0 });
      },
      update: (elapsed, ambient = true) => {
        if (disposed) return false;
        applyDaylight();
        if (options.reducedMotion) return false; let active = false;
        if (animateAmbient && ambient) {
          // Both run every ambient frame; neither touches placement or picking.
          const turning = landscape?.update(elapsed) ?? false; const living = life?.update(elapsed) ?? false;
          active = turning || living;
        }
        for (const entry of buildings.values()) if (entry.reveal !== null) {
          if (entry.reveal === -1) entry.reveal = elapsed;
          const t = Math.max(0, Math.min(1, (elapsed - entry.reveal) / .45)); entry.building.root.scale.setScalar(.94 + .06 * t);
          if (t === 1) entry.reveal = null; else active = true;
        }
        return active;
      },
      telemetry: () => ({ ...measureKeep04Object(scene), voxelPreparationMs, voxelQuads: disposed ? 0 : voxelQuads, sceneryInstances: disposed ? 0 : budget.trees,
        landscapeInstances: disposed ? 0 : landscape?.instanceCount ?? 0, lifeActors: disposed ? 0 : life?.actors() ?? 0,
        buildingCount: buildings.size, pickTargetCount: pickTargets.length, fallback }),
      dispose,
      daylight: () => daylight,
      exposure: () => daylight.exposure,
    };
  } catch (error) { dispose(); throw error; }
}
