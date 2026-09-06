import * as THREE from 'three';
import type { Building04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';
import type { BuildingView04 } from '../../ptr/gameplay04/gameplay04Presentation';
import type { InnerKeepRuntimeAssetBundle, InnerKeepRuntimePrefab } from '../inner-keep/loadInnerKeepRuntimeAssets';
import { createKeep04Building, KEEP04_FOOTPRINTS, measureKeep04Object, type Keep04Building } from './createKeep04Buildings';
import { KEEP04_BUILDING_IDS, KEEP04_TREE_IDS } from './loadKeep04Assets';
import { fitKeep04Camera, KEEP04_VISUAL_PROFILE as P, type Quality04 } from './keep04VisualProfile';
import { createKeep04Dressing } from './keep04VoxelDressing';

export type VisualState04 = Readonly<{ buildings: readonly BuildingView04[]; selectedKind: Building04 | null; draft: Placement04 | null; draftValid: boolean }>;
export type SceneTelemetry04 = Readonly<{
  drawCalls: number; triangles: number; geometryBytes: number; textureBytes: number; uploadBytes: number;
  voxelQuads: number; sceneryInstances: number; buildingCount: number; pickTargetCount: number;
  fallback: 'none' | 'asset' | 'voxel' | 'budget';
}>;
export type Scene04 = Readonly<{
  scene: THREE.Scene; camera: THREE.OrthographicCamera; reconcile: (state: VisualState04) => void;
  resize: (width: number, height: number) => void; pickBuilding: (ndcX: number, ndcY: number) => Building04 | null;
  pickPlacement: (ndcX: number, ndcY: number, kind: Building04) => Placement04 | null;
  update: (elapsedSeconds: number) => boolean; telemetry: () => SceneTelemetry04; dispose: () => void;
}>;

export function createKeep04Scene(options: Readonly<{ quality: Quality04; reducedMotion: boolean; assets: InnerKeepRuntimeAssetBundle }>): Scene04 {
  const { quality, assets } = options; const budget = P.budgets[quality];
  const scene = new THREE.Scene(); scene.background = new THREE.Color(P.distantHaze); scene.fog = new THREE.Fog(P.distantHaze, 150, 300);
  const camera = new THREE.OrthographicCamera(); fitKeep04Camera(camera, 1.4);
  const scenery = new THREE.Group(); scenery.name = 'non-pickable-scenery'; scene.add(scenery);
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
  const buildings = new Map<Building04, { key: string; building: Keep04Building; view: BuildingView04; reveal: number | null }>();
  let disposed = false; let fallback: SceneTelemetry04['fallback'] = 'none'; let voxelQuads = 0;
  let indicatorKey = ''; let selected: THREE.Mesh | null = null; let draft: THREE.Mesh | null = null;
  const pickTargets: THREE.Object3D[] = []; const pickKinds = new Map<THREE.Object3D, Building04>();
  const raycaster = new THREE.Raycaster(); const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function mat(color: string) { const material = new THREE.MeshStandardMaterial({ color, roughness: .95 }); materials.add(material); return material; }
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    geometries.add(geometry); const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.receiveShadow = true; scenery.add(object); return object;
  }
  const masonry = mat(P.masonry); const groundMat = mat(P.ground);
  // One unbroken, level legal support deck, with the terracing strictly outside it.
  const deckGeometry = new THREE.BoxGeometry(88, 1, 72, 22, 1, 18);
  const deckPositions = deckGeometry.getAttribute('position'); const deckColors = new Float32Array(deckPositions.count * 3);
  for (let i = 0; i < deckPositions.count; i++) {
    const x = deckPositions.getX(i); const z = deckPositions.getZ(i);
    const shade = .87 + Math.sin(x * .31 + z * .17) * .085 + Math.cos(z * .39 - x * .13) * .05;
    deckColors.set([shade, shade, shade], i * 3);
  }
  deckGeometry.setAttribute('color', new THREE.BufferAttribute(deckColors, 3));
  const deckMaterial = mat(P.ground); deckMaterial.vertexColors = true;
  mesh(deckGeometry, deckMaterial, 0, -.5, -4).name = 'legal-support-y0';
  try {
    const dressing = createKeep04Dressing(quality); voxelQuads = dressing.quads;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }); materials.add(material);
    mesh(dressing.geometry, material).name = 'voxel-terracing';
  } catch {
    fallback = 'voxel'; mesh(new THREE.BoxGeometry(96, 2, 80), groundMat, 0, -2, -4).name = 'simple-perimeter-fallback';
  }
  mesh(new THREE.BoxGeometry(110, .5, 12), groundMat, 0, -5.25, -55).name = 'distant-forest-bank';
  mesh(new THREE.BoxGeometry(6, .035, 35), masonry, 0, .02, 14.5).name = 'open-gate-spine';
  mesh(new THREE.BoxGeometry(10, .04, 10), masonry, 0, .022, 2).name = 'open-civic-commons';
  const seal = mesh(new THREE.CylinderGeometry(2.3, 2.3, .04, 24), mat(P.warpViolet), 0, .06, 2); seal.name = 'civic-seal';
  // Far parapet and low side coping: no camera-side opaque wall to hide buildings.
  mesh(new THREE.BoxGeometry(88, 1.2, .8), masonry, 0, .1, -40.6);
  for (const x of [-44.6, 44.6]) mesh(new THREE.BoxGeometry(.8, .55, 72), masonry, x, -.05, -4);
  for (const x of [-5.2, 5.2]) {
    mesh(new THREE.BoxGeometry(1.6, 3.5, 1.6), masonry, x, 1.75, 33.5);
    mesh(new THREE.ConeGeometry(1.3, 1.1, 4), mat(P.roofTeal), x, 4.05, 33.5);
  }
  const key = new THREE.DirectionalLight('#fff1d5', 3.0); key.position.set(-35, 75, 50); key.target.position.set(0, 0, -4);
  key.castShadow = quality === 'high'; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 200 }); key.shadow.bias = -.001;
  scene.add(key, key.target, new THREE.HemisphereLight('#e1eee4', '#526047', 2));

  // Preflight ALL six maximum-level prefabs and tree multiplicities before any source attaches.
  const admitted = new Map<string, InnerKeepRuntimePrefab>(); let sourceTriangles = 0; let sourceDraws = 0;
  for (const id of [...KEEP04_BUILDING_IDS, ...KEEP04_TREE_IDS]) {
    const prefab = assets.staticPrefabs.get(id); if (!prefab) continue;
    try {
      const measured = measureKeep04Object(prefab.root); const instances = (KEEP04_TREE_IDS as readonly string[]).includes(id) ? budget.trees / 2 : 1;
      const shadowFactor = quality === 'high' ? 2 : 1;
      if (measured.triangles > prefab.triangles + 16 || measured.drawCalls > prefab.drawCalls
        || sourceTriangles + measured.triangles * instances * shadowFactor > budget.triangles - 12000
        || sourceDraws + measured.drawCalls * instances * shadowFactor > budget.draws - 40) { fallback = 'budget'; continue; }
      sourceTriangles += measured.triangles * instances * shadowFactor; sourceDraws += measured.drawCalls * instances * shadowFactor;
      admitted.set(id, prefab);
    } catch { fallback = 'budget'; }
  }
  // Two sparse overlapping bands, always beyond the support rectangle, with no pick registration.
  for (let band = 0; band < 2; band++) {
    const id = KEEP04_TREE_IDS[band]; const prefab = admitted.get(id); const count = budget.trees / 2;
    const sourceMeshes: THREE.Mesh[] = [];
    if (prefab) { prefab.root.updateMatrixWorld(true); prefab.root.traverse(o => { if (o instanceof THREE.Mesh) sourceMeshes.push(o); }); }
    if (!sourceMeshes.length) {
      const geometry = new THREE.ConeGeometry(2.3, 9, 7); geometry.translate(0, 4.5, 0);
      geometries.add(geometry); sourceMeshes.push(new THREE.Mesh(geometry, mat(band === 0 ? P.forestNear : '#81917a')));
      if (fallback === 'none') fallback = 'asset';
    }
    for (const source of sourceMeshes) {
      const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld); geometries.add(geometry);
      const copies = (Array.isArray(source.material) ? source.material : [source.material]).map(original => {
        const copy = original.clone(); materials.add(copy);
        if (copy instanceof THREE.MeshStandardMaterial) copy.color.set(band === 0 ? P.forestNear : '#81917a');
        return copy;
      });
      const forest = new THREE.InstancedMesh(geometry, Array.isArray(source.material) ? copies : copies[0], count);
      forest.name = `forest-band:${band}`; forest.castShadow = quality === 'high'; forest.receiveShadow = true;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? .5 : i / (count - 1);
        const x = -49 + t * 94 + Math.sin(i * 2.17 + band * .9) * 2.7;
        const z = -46.5 - band * 6 - (i % 3) * 1.4 - Math.abs(Math.sin(i * 1.71 + band)) * 1.1;
        const size = prefab ? (band === 0 ? 1.6 : 2.1) + (i % 3) * .12 : 1;
        const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, -2 - band, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), new THREE.Vector3(size, size, size));
        forest.setMatrixAt(i, transform);
      }
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
    const hole = new THREE.Path(); hole.moveTo(-w / 2 + .22, -d / 2 + .22); hole.lineTo(-w / 2 + .22, d / 2 - .22); hole.lineTo(w / 2 - .22, d / 2 - .22); hole.lineTo(w / 2 - .22, -d / 2 + .22); hole.closePath(); shape.holes.push(hole);
    const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(-Math.PI / 2); geometries.add(geometry);
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }); materials.add(material);
    const indicator = new THREE.Mesh(geometry, material); indicator.name = name; indicator.position.set(Number(placement.x) / 1e6, .09, Number(placement.z) / 1e6);
    indicator.rotation.y = -placement.rotation * Math.PI / 180000; scene.add(indicator); return indicator;
  }
  function reconcile(state: VisualState04) {
    if (disposed) return;
    if (Object.keys(state).some(key => !['buildings', 'selectedKind', 'draft', 'draftValid'].includes(key))) throw new TypeError('Unexpected visual state field.');
    const placementFields = ['kind', 'x', 'z', 'rotation'];
    const buildingFields = ['kind', 'placement', 'completedLevel', 'targetLevel', 'phase', 'startsAtMicros', 'completesAtMicros'];
    for (const view of state.buildings) {
      if (Object.keys(view).some(key => !buildingFields.includes(key)) || Object.keys(view.placement).some(key => !placementFields.includes(key))) throw new TypeError('Unexpected visual building field.');
    }
    if (state.draft && Object.keys(state.draft).some(key => !placementFields.includes(key))) throw new TypeError('Unexpected visual draft field.');
    const present = new Set(state.buildings.map(view => view.kind));
    for (const [kind, entry] of buildings) if (!present.has(kind)) { entry.building.dispose(); buildings.delete(kind); }
    for (const view of state.buildings) {
      const key = [view.completedLevel, view.targetLevel, view.phase, view.startsAtMicros, view.completesAtMicros, view.placement.x, view.placement.z, view.placement.rotation].join(':');
      const previous = buildings.get(view.kind); if (previous?.key === key) continue;
      const reveal = previous?.view.phase === 'constructing' && view.phase === 'complete' && !options.reducedMotion;
      previous?.building.dispose();
      const building = createKeep04Building({ kind: view.kind, level: view.completedLevel, constructing: view.phase === 'constructing', quality, prefab: admitted.get(view.kind) });
      if (building.fallback && fallback === 'none') fallback = 'asset';
      building.root.position.set(Number(view.placement.x) / 1e6, 0, Number(view.placement.z) / 1e6); building.root.rotation.y = -view.placement.rotation * Math.PI / 180000;
      if (reveal) building.root.scale.setScalar(.94);
      scene.add(building.root); buildings.set(view.kind, { key, building, view, reveal: reveal ? -1 : null });
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
    scene.updateMatrixWorld(true);
  }
  function setRay(x: number, y: number) { camera.updateMatrixWorld(true); raycaster.setFromCamera(new THREE.Vector2(x, y), camera); }
  return {
    scene, camera, reconcile,
    resize: (width, height) => { if (width > 0 && height > 0) fitKeep04Camera(camera, width / height); },
    pickBuilding: (x, y) => {
      if (disposed || ![x, y].every(Number.isFinite)) return null;
      setRay(x, y); const hit = raycaster.intersectObjects(pickTargets, true)[0]; let target: THREE.Object3D | null = hit?.object ?? null;
      while (target) { const kind = pickKinds.get(target); if (kind) return kind; target = target.parent; } return null;
    },
    pickPlacement: (x, y, kind) => {
      if (disposed || ![x, y].every(Number.isFinite)) return null;
      setRay(x, y); const position = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      if (!position || Math.abs(position.x) > 44 || position.z < -40 || position.z > 32) return null;
      return Object.freeze({ kind, x: BigInt(Math.round(position.x * 2)) * 500000n, z: BigInt(Math.round(position.z * 2)) * 500000n, rotation: 0 });
    },
    update: elapsed => {
      if (disposed || options.reducedMotion) return false; let active = false;
      for (const entry of buildings.values()) if (entry.reveal !== null) {
        if (entry.reveal === -1) entry.reveal = elapsed;
        const t = Math.max(0, Math.min(1, (elapsed - entry.reveal) / .45)); entry.building.root.scale.setScalar(.94 + .06 * t);
        if (t === 1) entry.reveal = null; else active = true;
      }
      return active;
    },
    telemetry: () => ({ ...measureKeep04Object(scene), voxelQuads: disposed ? 0 : voxelQuads, sceneryInstances: disposed ? 0 : budget.trees, buildingCount: buildings.size, pickTargetCount: pickTargets.length, fallback }),
    dispose: () => {
      if (disposed) return; disposed = true;
      buildings.forEach(entry => entry.building.dispose()); buildings.clear(); pickTargets.length = 0; pickKinds.clear();
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); key.shadow.dispose(); scene.clear();
    },
  };
}
