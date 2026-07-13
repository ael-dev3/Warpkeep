import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { createTitleMaterialReveal } from '../src/components/title/titleMaterialReveal';

describe('title material reveal', () => {
  it('updates a shared material once and restores opacity, transparency, and depth writes exactly', () => {
    const material = new THREE.MeshBasicMaterial({
      opacity: 0.72,
      transparent: false,
      depthWrite: true
    });
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(new THREE.BoxGeometry(), material),
      new THREE.Mesh(new THREE.BoxGeometry(), material)
    );
    const reveal = createTitleMaterialReveal(group);
    expect(reveal.materials).toEqual([material]);

    reveal.setOpacity(0);
    expect(material.opacity).toBe(0);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);

    reveal.setOpacity(0.5);
    expect(material.opacity).toBeCloseTo(0.36, 8);
    reveal.restore();
    expect(material.opacity).toBeCloseTo(0.72, 8);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
  });

  it('preserves originally transparent material settings and does not clone per frame', () => {
    const material = new THREE.MeshBasicMaterial({
      opacity: 0.4,
      transparent: true,
      depthWrite: false
    });
    const clone = vi.spyOn(material, 'clone');
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const reveal = createTitleMaterialReveal(mesh);
    reveal.setOpacity(0.25);
    reveal.setOpacity(0.75);
    reveal.setOpacity(1);
    reveal.restore();
    expect(clone).not.toHaveBeenCalled();
    expect(material.opacity).toBeCloseTo(0.4, 8);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('clamps progress and makes restore idempotent', () => {
    const material = new THREE.MeshBasicMaterial({ opacity: 0.8 });
    const reveal = createTitleMaterialReveal(new THREE.Mesh(new THREE.BoxGeometry(), material));
    reveal.setOpacity(-10);
    expect(material.opacity).toBe(0);
    reveal.setOpacity(10);
    expect(material.opacity).toBe(0.8);
    reveal.restore();
    reveal.restore();
    expect(material.opacity).toBe(0.8);
  });
});
