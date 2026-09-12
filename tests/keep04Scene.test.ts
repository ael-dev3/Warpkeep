import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createElement } from 'react';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Keep04SceneHost } from '../src/components/keep04/Keep04SceneHost';
import { Keep04QaHarness, createKeep04QaSnapshot } from '../src/dev/Keep04QaHarness';
import { createKeep04Scene, type VisualState04 } from '../src/components/keep04/createKeep04Scene';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';
import * as assetsLoader from '../src/components/keep04/loadKeep04Assets';

vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>();
  return { ...original, WebGLRenderer: vi.fn() };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const empty = (): InnerKeepRuntimeAssetBundle => ({ staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() });
const mill = { kind: 'city-mill', placement: { kind: 'city-mill', x: -24_000_000n, z: -20_000_000n, rotation: 0 }, completedLevel: 0, targetLevel: 1, phase: 'constructing', startsAtMicros: 5n, completesAtMicros: 120_000_005n } as const;
const visual: VisualState04 = { buildings: [mill], selectedKind: 'city-mill', draft: null, draftValid: true };
it('frames only occupied settled sites and existing civic landmarks, without changing scene work or picking', () => {
  const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: false, assets: empty() });
  scene.reconcile({ buildings: [], selectedKind: 'city-mill', draft: mill.placement, draftValid: true });
  expect(scene.entryOverviewBounds()).toBeNull();
  scene.reconcile(visual);
  const before = scene.telemetry(); const root = scene.scene.getObjectByName('building:city-mill')!;
  const transform = root.matrixWorld.clone(); const bounds = scene.entryOverviewBounds()!;
  expect(bounds.containsBox(new THREE.Box3().setFromObject(root))).toBe(true);
  expect(bounds.min.x).toBeCloseTo(-29.65, 5); expect(bounds.min.z).toBeCloseTo(-24.75, 5);
  expect(bounds.max.x).toBeCloseTo(6.5, 5); expect(bounds.max.z).toBeCloseTo(34.8, 5);
  expect(bounds.max.y).toBeGreaterThanOrEqual(4.6 - 1e-6);
  expect(bounds.containsPoint(new THREE.Vector3(0, 0, 2))).toBe(true);
  expect(bounds.containsPoint(new THREE.Vector3(44, 0, -40))).toBe(false);
  expect(scene.telemetry()).toEqual(before); expect(root.matrixWorld.equals(transform)).toBe(true);
  const point = new THREE.Vector3(-24, 1, -20).project(scene.camera);
  expect(scene.pickBuilding(point.x, point.y)).toBe('city-mill');
  bounds.makeEmpty(); expect(scene.entryOverviewBounds()!.isEmpty()).toBe(false);
  scene.reconcile({ ...visual, buildings: [{ ...mill, completedLevel: 1, phase: 'complete' }] });
  const completed = scene.scene.getObjectByName('building:city-mill')!;
  expect(completed.scale.x).toBe(.94);
  const revealingTransform = completed.matrixWorld.clone(); const settled = scene.entryOverviewBounds()!;
  expect(completed.matrixWorld.equals(revealingTransform)).toBe(true);
  scene.update(0); scene.update(1);
  expect(completed.scale.x).toBe(1); expect(scene.entryOverviewBounds()!.equals(settled)).toBe(true);
  scene.dispose(); expect(scene.entryOverviewBounds()).toBeNull();
});

it.each([['selected', 0], ['selected', 90000], ['draft', 0], ['draft', 90000]] as const)(
  'keeps the wider %s marker above the scaffold base and inside its exact rotated footprint (%s)', (kind, rotation) => {
    const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: true, assets: empty() });
    const placement = { ...mill.placement, rotation };
    scene.reconcile({ ...visual, buildings: kind === 'selected' ? [{ ...mill, placement }] : [], draft: kind === 'draft' ? placement : null });
    const marker = scene.scene.getObjectByName(`${kind}-footprint`) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(marker.position.y).toBeGreaterThan(.16); expect(marker.position.y).toBe(.20);
    expect(marker.position.x).toBe(-24); expect(marker.position.z).toBe(-20);
    expect(marker.rotation.y).toBe(-rotation * Math.PI / 180000);
    const positions = marker.geometry.getAttribute('position');
    const xs = Array.from({ length: positions.count }, (_, i) => Math.abs(positions.getX(i)));
    const zs = Array.from({ length: positions.count }, (_, i) => Math.abs(positions.getZ(i)));
    expect(Math.max(...xs) * 2).toBeCloseTo(11.3, 5); expect(Math.max(...zs) * 2).toBeCloseTo(9.5, 5);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(.60, 5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(.60, 5);
    expect(marker.geometry.index!.count / 3).toBe(8);
    expect(marker.material.depthTest).toBe(true); expect(marker.material.depthWrite).toBe(false);
    expect(scene.telemetry().pickTargetCount).toBe(kind === 'selected' ? 1 : 0);
    const geometryDispose = vi.spyOn(marker.geometry, 'dispose'); const materialDispose = vi.spyOn(marker.material, 'dispose');
    scene.reconcile({ buildings: [], selectedKind: null, draft: null, draftValid: false });
    expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce(); scene.dispose();
  },
);

it('inspects settled site bounds without changing geometry, placement or picking', () => {
  const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: true, assets: empty() }); scene.reconcile(visual);
  const before = scene.telemetry(); const root = scene.scene.getObjectByName('building:city-mill')!;
  const transform = root.matrixWorld.clone(); const bounds = scene.selectedSiteBounds();
  expect(bounds).not.toBeNull(); expect(bounds!.min.x).toBeLessThanOrEqual(-29.65); expect(bounds!.max.x).toBeGreaterThanOrEqual(-18.35);
  expect(scene.fitSite(bounds!, 2)).toBe(true); expect(root.matrixWorld.equals(transform)).toBe(true);
  expect(scene.telemetry()).toEqual(before);
  const point = new THREE.Vector3(-24, 1, -20).project(scene.camera); expect(scene.pickBuilding(point.x, point.y)).toBe('city-mill');
  scene.reconcile({ buildings: [], selectedKind: 'city-mill', draft: { ...mill.placement, rotation: 90000 }, draftValid: false });
  const size = scene.selectedSiteBounds()!.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(9.5, 10); expect(size.y).toBe(0); expect(size.z).toBeCloseTo(11.3, 10);
  scene.reconcile({ buildings: [], selectedKind: null, draft: null, draftValid: false }); expect(scene.selectedSiteBounds()).toBeNull(); scene.dispose();
});
it.each([0, 90000] as const)('keeps completed craft fascia and model picks owned by the same authoritative site at rotation %s', rotation => {
  const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: true, assets: empty() });
  scene.reconcile({ ...visual, buildings: [{ ...mill, placement: { ...mill.placement, rotation }, phase: 'complete', completedLevel: 5, targetLevel: 5 }] });
  scene.resize(390, 304); scene.fitSite(scene.selectedSiteBounds()!, 390 / 304);
  const root = scene.scene.getObjectByName('building:city-mill')!;
  for (const local of [new THREE.Vector3(-11.3 * .25 + 1.5, 1.55, 9.5 / 2 - .25), new THREE.Vector3(0, 4, 0)]) {
    const point = local.applyMatrix4(root.matrixWorld).project(scene.camera);
    expect(scene.pickBuilding(point.x, point.y)).toBe('city-mill');
  }
  const marker = scene.scene.getObjectByName('selected-footprint')!;
  expect(marker.position.toArray()).toEqual([-24, .2, -20]); expect(root.scale.toArray()).toEqual([1, 1, 1]);
  expect(scene.telemetry().pickTargetCount).toBe(1);
  scene.reconcile({ buildings: [], selectedKind: null, draft: null, draftValid: true });
  expect(scene.telemetry().pickTargetCount).toBe(0); scene.dispose();
});
it.each(['city-mill', 'lumber-camp', 'city-stoneworks', 'city-goldworks', 'city-barracks', 'grand-covenant-cathedral'] as const)('fits %s level-one/five and scaffold bounds without altering its transform', kind => {
  const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: false, assets: empty() });
  for (const phase of ['constructing', 'complete'] as const) for (const level of [1, 5]) {
    scene.reconcile({ buildings: [{ ...mill, kind, placement: { kind, x: 16_000_000n, z: -18_000_000n, rotation: 90000 }, phase, completedLevel: level, targetLevel: level }], selectedKind: kind, draft: null, draftValid: true });
    const root = scene.scene.getObjectByName(`building:${kind}`)!; const transform = root.matrixWorld.clone();
    const bounds = scene.selectedSiteBounds()!; expect(bounds.isEmpty()).toBe(false);
    for (const aspect of [342 / 220, 796 / 144]) {
      scene.resize(aspect * 200, 200); expect(scene.fitSite(bounds, aspect)).toBe(true);
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(scene.camera);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.2 + 1e-8); expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.2 + 1e-8);
      }
    }
    expect(root.matrixWorld.equals(transform)).toBe(true);
  }
  scene.dispose();
});
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
it('keeps the shallow water treatment outside the legal support deck and within the scenic layer', () => {
  const scene = createKeep04Scene({ quality: 'balanced', reducedMotion: true, assets: empty() });
  const water = scene.scene.getObjectByName('moat-water-surface') as THREE.Mesh;
  const edge = scene.scene.getObjectByName('moat-water-edge') as THREE.Mesh;
  expect(water).toBeDefined();
  expect(edge).toBeDefined();
  const waterBounds = new THREE.Box3().setFromObject(water);
  expect(waterBounds.max.y).toBeLessThan(0);
  expect(waterBounds.min.z).toBeLessThan(-40);
  expect(waterBounds.max.z).toBeLessThan(-40);
  const colors = water.geometry.getAttribute('color');
  const blue = Array.from({ length: colors.count }, (_, index) => colors.getZ(index));
  expect(Math.max(...blue) - Math.min(...blue)).toBeGreaterThan(.04);
  expect(scene.telemetry().pickTargetCount).toBe(0);
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

// Only the external asset request and GPU boundary are doubled. The actual React
// host, scene update/reconciliation, event listeners and scheduling run unchanged.
async function mountScheduledHost(quality: 'high' | 'balanced' | 'reduced', reducedMotion = false) {
  const queued = new Map<number, FrameRequestCallback>(); const renderedAt: number[] = [];
  let timestamp = 0; let sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queued.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { queued.delete(id); });
  vi.stubGlobal('WebGL2RenderingContext', class {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(assetsLoader, 'loadKeep04Assets').mockResolvedValue(empty());
  class RendererBoundary {
    domElement = document.createElement('canvas'); shadowMap = {}; info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio() {} setSize() {} dispose() {} forceContextLoss() {}
    render() { renderedAt.push(timestamp); }
  }
  vi.mocked(THREE.WebGLRenderer).mockImplementation(function () { return new RendererBoundary() as unknown as THREE.WebGLRenderer; });
  const props = { visual, quality, reducedMotion, onMode: vi.fn(), onSelect: vi.fn(), onPlacement: vi.fn() };
  const mounted = render(createElement(Keep04SceneHost, props));
  await act(async () => {});
  const canvas = mounted.container.querySelector('canvas')!;
  expect(canvas).not.toBeNull();
  function frame(now: number, input = false) {
    timestamp = now;
    if (input) fireEvent.wheel(canvas, { deltaY: 1 });
    const callbacks = [...queued.values()]; queued.clear();
    expect(callbacks.length).toBeLessThanOrEqual(1);
    const before = renderedAt.length;
    act(() => { callbacks.forEach(callback => callback(now)); });
    expect(renderedAt.length - before).toBeLessThanOrEqual(1); // Never catch up in a burst.
  }
  return { frame, renderedAt, queued, mounted, props };
}

for (const jitter of [false, true]) it.each([
  ['high', 33.4, 299], ['balanced', 50.05, 239], ['reduced', 75, 149],
] as const)('paces actual %s host requests over 600 RAF callbacks (jitter=' + jitter + ')', async (quality, p95Limit, minimumRenders) => {
  const host = await mountScheduledHost(quality);
  for (let i = 0; i <= 600; i++) host.frame(i * 1000 / 60 + (jitter ? [0, .015, -.015, .005][i % 4] : 0), true);
  const intervals = host.renderedAt.slice(1).map((time, i) => time - host.renderedAt[i]).sort((a, b) => a - b);
  expect(intervals[Math.ceil(intervals.length * .95) - 1]).toBeLessThanOrEqual(p95Limit);
  expect(host.renderedAt.length).toBeGreaterThanOrEqual(minimumRenders);
  expect(host.renderedAt.length).toBeLessThanOrEqual(minimumRenders + 3);
  expect(host.queued.size).toBe(0);
});

it.each(['high', 'balanced', 'reduced'] as const)('resumes %s after idle without stale catch-up or idle spinning', async quality => {
  const host = await mountScheduledHost(quality);
  host.frame(0); expect(host.queued.size).toBe(0);
  const resumedAt = 10013.7; // Deliberately not a multiple of any quality interval.
  host.frame(resumedAt, true); expect(host.renderedAt).toEqual([0, resumedAt]); expect(host.queued.size).toBe(0);
  host.frame(resumedAt + 1, true); // A new request remains bounded by this fresh phase.
  for (let i = 1; i <= 10; i++) host.frame(resumedAt + i * 1000 / 60);
  expect(host.renderedAt).toHaveLength(3); expect(host.queued.size).toBe(0);
  expect(host.renderedAt[2] - resumedAt).toBeGreaterThanOrEqual({ high: 33.3, balanced: 41.6, reduced: 66.6 }[quality]);
});

it('renders reduced-motion feedback on the next callback without spinning and skips the real completion reveal', async () => {
  const host = await mountScheduledHost('reduced', true);
  host.frame(0); host.frame(1, true);
  expect(host.renderedAt).toEqual([0, 1]); expect(host.queued.size).toBe(0);
  const complete: VisualState04 = { ...visual, buildings: [{ ...mill, completedLevel: 1, targetLevel: 1, phase: 'complete' }] };
  host.mounted.rerender(createElement(Keep04SceneHost, { ...host.props, visual: complete }));
  host.frame(2); expect(host.renderedAt).toEqual([0, 1, 2]); expect(host.queued.size).toBe(0);
});

it('paces real completion reveal then retires its last RAF without inventing an idle loop', async () => {
  const host = await mountScheduledHost('high'); host.frame(0);
  const complete: VisualState04 = { ...visual, buildings: [{ ...mill, completedLevel: 1, targetLevel: 1, phase: 'complete' }] };
  host.mounted.rerender(createElement(Keep04SceneHost, { ...host.props, visual: complete }));
  for (let i = 1; i <= 60; i++) host.frame(i * 1000 / 60);
  const intervals = host.renderedAt.slice(1).map((time, i) => time - host.renderedAt[i]);
  expect(Math.max(...intervals)).toBeLessThanOrEqual(33.4);
  expect(host.queued.size).toBe(0); expect(host.renderedAt.at(-1)).toBeLessThan(600);
});
