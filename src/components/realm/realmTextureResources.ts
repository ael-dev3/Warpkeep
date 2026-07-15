import * as THREE from 'three';

/**
 * GLTFLoader uses ImageBitmapLoader when available. Texture.dispose() releases
 * WebGL state but Three deliberately does not close the underlying bitmap, so
 * Realm lifetime owners must account for it separately.
 */
export function imageBitmapSourceForTexture(texture: THREE.Texture) {
  const ImageBitmapConstructor = globalThis.ImageBitmap;
  const source = texture.source.data;
  return typeof ImageBitmapConstructor === 'function'
    && source instanceof ImageBitmapConstructor
    ? source
    : undefined;
}

export function uniqueImageBitmapSources(textures: Iterable<THREE.Texture>) {
  const sources = new Set<ImageBitmap>();
  for (const texture of textures) {
    const source = imageBitmapSourceForTexture(texture);
    if (source) sources.add(source);
  }
  return Object.freeze([...sources]);
}

/** Marks before closing so a throwing browser implementation is never retried. */
export function closeImageBitmapOnce(
  source: ImageBitmap,
  closed: WeakSet<ImageBitmap>
) {
  if (closed.has(source)) return;
  closed.add(source);
  source.close();
}
