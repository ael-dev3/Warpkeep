import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  REALM_PROCEDURAL_WORKER_WAGON_FALLBACK_ID,
  createRealmProceduralWorkerWagonFallback
} from '../src/components/realm/createRealmProceduralWorkerWagonFallback';

describe('procedural worker wagon fallback', () => {
  it('merges a recognizable forward-facing body and four wheels into one batch', () => {
    const fallback = createRealmProceduralWorkerWagonFallback();
    const bounds = fallback.geometry.boundingBox!;

    expect(fallback).toMatchObject({
      fallbackId: REALM_PROCEDURAL_WORKER_WAGON_FALLBACK_ID,
      bodyPartCount: 3,
      wheelCount: 4,
      forwardAxis: '+z'
    });
    expect(fallback.triangleCount).toBeGreaterThan(12);
    expect(fallback.geometry.getAttribute('color')).toBeDefined();
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(0.4);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(0.3);
    // The +Z drawbar makes orientation readable even at compact LOD.
    expect(bounds.max.z).toBeGreaterThan(Math.abs(bounds.min.z));
    fallback.geometry.dispose();
  });

  it('disposes every temporary part after the one-batch merge', () => {
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const fallback = createRealmProceduralWorkerWagonFallback();

    expect(dispose).toHaveBeenCalledTimes(7);
    fallback.geometry.dispose();
    expect(dispose).toHaveBeenCalledTimes(8);
  });
});
