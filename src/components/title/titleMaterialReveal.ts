import * as THREE from 'three';

type MaterialSnapshot = Readonly<{
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}>;

export type TitleMaterialReveal = Readonly<{
  materials: ReadonlyArray<THREE.Material>;
  setOpacity: (progress: number) => void;
  restore: () => void;
}>;

export function createTitleMaterialReveal(root: THREE.Object3D): TitleMaterialReveal {
  const unique = new Map<string, THREE.Material>();
  root.traverse((object) => {
    const material = (object as THREE.Object3D & {
      material?: THREE.Material | THREE.Material[];
    }).material;
    const materials = material ? (Array.isArray(material) ? material : [material]) : [];
    materials.forEach((entry) => unique.set(entry.uuid, entry));
  });

  const snapshots: MaterialSnapshot[] = [...unique.values()].map((material) => ({
    material,
    opacity: material.opacity,
    transparent: material.transparent,
    depthWrite: material.depthWrite
  }));
  let restored = false;

  const setOpacity = (value: number) => {
    const progress = Math.min(1, Math.max(0, value));
    restored = false;
    snapshots.forEach((snapshot) => {
      const transitioning = progress < 1;
      if (
        snapshot.material.transparent !== (transitioning ? true : snapshot.transparent)
        || snapshot.material.depthWrite !== (transitioning ? false : snapshot.depthWrite)
      ) {
        snapshot.material.transparent = transitioning ? true : snapshot.transparent;
        snapshot.material.depthWrite = transitioning ? false : snapshot.depthWrite;
        snapshot.material.needsUpdate = true;
      }
      snapshot.material.opacity = snapshot.opacity * progress;
    });
  };

  const restore = () => {
    if (restored) return;
    restored = true;
    snapshots.forEach((snapshot) => {
      if (
        snapshot.material.transparent !== snapshot.transparent
        || snapshot.material.depthWrite !== snapshot.depthWrite
      ) {
        snapshot.material.transparent = snapshot.transparent;
        snapshot.material.depthWrite = snapshot.depthWrite;
        snapshot.material.needsUpdate = true;
      }
      snapshot.material.opacity = snapshot.opacity;
    });
  };

  return {
    materials: snapshots.map(({ material }) => material),
    setOpacity,
    restore
  };
}
