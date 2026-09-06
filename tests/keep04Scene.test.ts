import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createElement } from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Keep04SceneHost } from '../src/components/keep04/Keep04SceneHost';
import { Keep04QaHarness, createKeep04QaSnapshot } from '../src/dev/Keep04QaHarness';
import { createKeep04Scene, type VisualState04 } from '../src/components/keep04/createKeep04Scene';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

const empty = (): InnerKeepRuntimeAssetBundle => ({ staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() });
const mill = { kind: 'city-mill', placement: { kind: 'city-mill', x: -24_000_000n, z: -20_000_000n, rotation: 0 }, completedLevel: 0, targetLevel: 1, phase: 'constructing', startsAtMicros: 5n, completesAtMicros: 120_000_005n } as const;
const visual: VisualState04 = { buildings: [mill], selectedKind: 'city-mill', draft: null, draftValid: true };
it('projects exactly the active Mill site, separates scenery picks, and retains keyed buildings across selection', () => {
  const assets = empty(); const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: true, assets });
  scene.reconcile(visual);
  expect(scene.scene.getObjectByName('project:city-mill')).toBeDefined();
  expect(scene.scene.getObjectByName('selected-footprint')).toBeDefined();
  expect(scene.scene.getObjectByName('building:city-barracks')).toBeUndefined();
  expect(scene.scene.getObjectByName('building:grand-covenant-cathedral')).toBeUndefined();
  expect(scene.telemetry()).toMatchObject({ buildingCount: 1, pickTargetCount: 1, sceneryInstances: 6 });
  const retained = scene.scene.getObjectByName('building:city-mill');
  scene.reconcile({ ...visual, selectedKind: null });
  expect(scene.scene.getObjectByName('building:city-mill')).toBe(retained);
  expect(scene.update(10000)).toBe(false);
  expect(scene.scene.getObjectByName('project:city-mill')).toBeDefined();
  const p = new THREE.Vector3(-24, 1, -20).project(scene.camera);
  expect(scene.pickBuilding(p.x, p.y)).toBe('city-mill');
  expect(scene.pickBuilding(0.99, 0.99)).toBe(null);
  const spot = new THREE.Vector3(14.2, 0, -10.7).project(scene.camera);
  expect(scene.pickPlacement(spot.x, spot.y, 'city-mill')).toMatchObject({ x: 14_000_000n, z: -10_500_000n });
  scene.dispose(); scene.dispose(); expect(assets.dispose).not.toHaveBeenCalled();
  expect(scene.telemetry()).toMatchObject({ drawCalls: 0, triangles: 0, geometryBytes: 0, textureBytes: 0, voxelQuads: 0, sceneryInstances: 0, buildingCount: 0, pickTargetCount: 0 });
});
it.each(['high', 'balanced', 'reduced'] as const)('keeps all six maximum-level fallback buildings inside %s scene targets', quality => {
  const scene = createKeep04Scene({ quality, reducedMotion: true, assets: empty() });
  const kinds = ['city-mill', 'lumber-camp', 'city-stoneworks', 'city-goldworks', 'city-barracks', 'grand-covenant-cathedral'] as const;
  scene.reconcile({ buildings: kinds.map(kind => ({ ...mill, kind, placement: { ...mill.placement, kind }, phase: 'complete', completedLevel: 5, targetLevel: 5 })), selectedKind: null, draft: null, draftValid: true });
  const telemetry = scene.telemetry();
  expect(telemetry.buildingCount).toBe(6); expect(telemetry.drawCalls).toBeLessThanOrEqual({ high: 180, balanced: 120, reduced: 80 }[quality]);
  expect(telemetry.triangles).toBeLessThanOrEqual({ high: 300000, balanced: 180000, reduced: 90000 }[quality]); scene.dispose();
});
it('varies the flat legal deck material and staggers fixed-count forest instances without moving support height', () => {
  const scene = createKeep04Scene({ quality: 'balanced', reducedMotion: true, assets: empty() });
  const deck = scene.scene.getObjectByName('legal-support-y0') as THREE.Mesh;
  const colors = deck.geometry.getAttribute('color'); expect(colors).toBeDefined();
  const red = Array.from({ length: colors.count }, (_, i) => colors.getX(i));
  expect(Math.max(...red) - Math.min(...red)).toBeGreaterThan(.12);
  const bounds = new THREE.Box3().setFromObject(deck); expect(bounds.max.y).toBe(0);
  for (const band of [0, 1]) {
    const forest = scene.scene.getObjectByName(`forest-band:${band}`) as THREE.InstancedMesh;
    const points = Array.from({ length: forest.count }, (_, i) => { const matrix = new THREE.Matrix4(); forest.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); });
    const steps = points.slice(1).map((point, i) => Math.round((point.x - points[i].x) * 100));
    expect(new Set(steps).size).toBeGreaterThan(1);
    expect(points.every(point => point.z < -44)).toBe(true);
  }
  scene.dispose();
});
it('rejects economics and identity at the visual boundary', () => {
  const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: true, assets: empty() });
  expect(() => scene.reconcile({ ...visual, food: 100n } as VisualState04)).toThrow(/visual/i);
  expect(() => scene.reconcile({ ...visual, ownerIdentity: 'secret' } as VisualState04)).toThrow(/visual/i);
  // @ts-expect-error Economic fields are deliberately absent from BuildingView04.
  expect(() => scene.reconcile({ ...visual, buildings: [{ ...mill, food: 100n }] })).toThrow(/visual/i);
  scene.dispose();
});
it('never attaches an asset whose actual geometry exceeds pinned metadata or total target', () => {
  const geometry = new THREE.SphereGeometry(5, 100, 100); const material = new THREE.MeshStandardMaterial(); const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, material));
  const assets = empty(); (assets.staticPrefabs as Map<string, unknown>).set('city-mill', { id: 'city-mill', root, triangles: 1, drawCalls: 1, clone: () => root.clone(true) });
  const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: false, assets });
  scene.reconcile({ ...visual, buildings: [{ ...mill, completedLevel: 5, targetLevel: 5, phase: 'complete' }] });
  expect(scene.scene.getObjectByName('silhouette:city-mill')).toBeDefined(); expect(scene.telemetry().fallback).toBe('budget');
  scene.dispose(); geometry.dispose(); material.dispose();
});
it('uses the usable fallback without starting WebGL or requesting assets when WebGL is unavailable', () => {
  const mode = vi.fn(); const rendered = render(createElement(Keep04SceneHost, { visual, quality: 'balanced', reducedMotion: true, onMode: mode, onSelect: vi.fn(), onPlacement: vi.fn() }));
  expect(mode).toHaveBeenLastCalledWith('fallback'); expect(rendered.container.querySelector('canvas')).toBeNull(); cleanup();
});
it('opens the actual keep screen through a labelled synthetic fixture and changes only fixture state', () => {
  render(createElement(Keep04QaHarness));
  expect(screen.getByText(/Synthetic controller/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Mill construction fixture' }));
  expect(screen.getByText(/Constructing level 1/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Empty keep fixture' }));
  expect(screen.queryByText(/Constructing level 1/)).toBeNull(); cleanup();
});
it.each(['empty', 'construction', 'complete'] as const)('validates the %s fixture through the accepted state decoder', fixture => {
  const snapshot = createKeep04QaSnapshot(fixture);
  expect(Object.isFrozen(snapshot.view!.state)).toBe(true);
  expect(snapshot.view!.state.completedEffects.foodYieldPerQuantum).toBe(fixture === 'complete' ? 12n : 10n);
});
