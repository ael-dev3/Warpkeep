import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

/** Owns both displayed meshes and models parsed while the menu is being left. */
export function createMenuWorldResourceOwner(scene: THREE.Scene) {
  const parsed = new Set<GLTF>();
  const geometries = new WeakSet<THREE.BufferGeometry>();
  const materials = new WeakSet<THREE.Material>();
  const textures = new WeakSet<THREE.Texture>();
  const bitmaps = new WeakSet<ImageBitmap>();
  const instancedMeshes = new WeakSet<THREE.InstancedMesh>();
  const skeletons = new WeakSet<THREE.Skeleton>();
  let disposed = false;

  const disposeTexture = (texture: THREE.Texture) => {
    if (textures.has(texture)) return;
    textures.add(texture);
    const source = texture.source.data;
    texture.dispose();
    // GLTFLoader can decode to ImageBitmap. Texture.dispose() releases the GPU
    // texture but leaves the bitmap's CPU memory owned by the caller.
    if (typeof ImageBitmap === 'function' && source instanceof ImageBitmap && !bitmaps.has(source)) {
      bitmaps.add(source);
      try {
        source.close();
      } catch {
        // A failed bitmap close must not interrupt cleanup of the rest of the scene.
      }
    }
  };

  const disposeTextureValue = (value: unknown) => {
    if (value instanceof THREE.Texture) disposeTexture(value);
    else if (Array.isArray(value)) value.forEach(disposeTextureValue);
  };

  const disposeMaterial = (material: THREE.Material) => {
    if (materials.has(material)) return;
    materials.add(material);
    for (const value of Object.values(material)) disposeTextureValue(value);
    if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) disposeTextureValue(uniform.value);
    }
    material.dispose();
  };

  const disposeTree = (root: THREE.Object3D) => {
    root.traverse((node) => {
      if (node instanceof THREE.InstancedMesh && !instancedMeshes.has(node)) {
        instancedMeshes.add(node);
        node.dispose();
      }
      if (node instanceof THREE.SkinnedMesh && !skeletons.has(node.skeleton)) {
        skeletons.add(node.skeleton);
        node.skeleton.dispose();
      }
      if (!(node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points)) return;
      if (!geometries.has(node.geometry)) {
        geometries.add(node.geometry);
        node.geometry.dispose();
      }
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        disposeMaterial(material);
      }
    });
  };

  const disposeModel = (model: GLTF) => {
    // GLTF may include scenes other than the default scene. Clones share their
    // geometries/materials, so the WeakSets prevent duplicate disposal.
    disposeTree(model.scene);
    model.scenes.forEach(disposeTree);
  };

  return {
    track(model: GLTF) {
      if (disposed) disposeModel(model);
      else parsed.add(model);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeTree(scene);
      for (const model of parsed) disposeModel(model);
      parsed.clear();
      scene.clear();
    },
  };
}
