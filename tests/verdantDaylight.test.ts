import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  normalizeVerdantHour, verdantDaylightAt, verdantDaylightKey, verdantLocalHour, verdantSunDirection,
} from '../src/greater-realm/verdantDaylight';
import { createKeep04Scene } from '../src/components/keep04/createKeep04Scene';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

const empty = () => ({ staticPrefabs: new Map(), failures: [], dispose: () => {} }) as unknown as InnerKeepRuntimeAssetBundle;

describe('verdant daylight mood', () => {
  it('chooses the expected phase across a local day', () => {
    expect(verdantDaylightAt(2).phase).toBe('night');
    expect(verdantDaylightAt(5.8).phase).toBe('dawn');
    expect(verdantDaylightAt(12).phase).toBe('day');
    expect(verdantDaylightAt(17.6).phase).toBe('golden');
    expect(verdantDaylightAt(18.9).phase).toBe('dusk');
    expect(verdantDaylightAt(23).phase).toBe('night');
  });

  it('lights windows only around night and keeps day fully unlit', () => {
    expect(verdantDaylightAt(12).windowGlow).toBe(0);
    expect(verdantDaylightAt(1).windowGlow).toBe(1);
    expect(verdantDaylightAt(22).night).toBe(1);
    expect(verdantDaylightAt(12).night).toBe(0);
  });

  it('never jumps between neighbouring minutes and keeps the sun above the shadow-safe minimum', () => {
    let previous = verdantDaylightAt(0);
    for (let minute = 1; minute <= 24 * 60; minute++) {
      const next = verdantDaylightAt(minute / 60);
      expect(Math.abs(next.sunIntensity - previous.sunIntensity)).toBeLessThan(.05);
      expect(Math.abs(next.exposure - previous.exposure)).toBeLessThan(.01);
      expect(Math.abs(next.windowGlow - previous.windowGlow)).toBeLessThan(.03);
      expect(Math.abs(next.hazeColor.r - previous.hazeColor.r)).toBeLessThan(.03);
      expect(next.sunElevation).toBeGreaterThanOrEqual(.2);
      expect(next.sunSwing).toBeGreaterThanOrEqual(-1); expect(next.sunSwing).toBeLessThanOrEqual(1);
      previous = next;
    }
    // Midnight wraps to the same mood from either side.
    expect(verdantDaylightAt(24).hazeColor.getHexString()).toBe(verdantDaylightAt(0).hazeColor.getHexString());
  });

  it('keeps night readable: exposure lifts while the key light dims', () => {
    const night = verdantDaylightAt(23); const noon = verdantDaylightAt(12);
    expect(night.exposure).toBeGreaterThan(noon.exposure);
    expect(night.sunIntensity).toBeGreaterThan(.8);
    expect(night.hemisphereIntensity).toBeGreaterThan(1);
  });

  it('normalises hours and derives the hour from a local timestamp', () => {
    expect(normalizeVerdantHour(25.5)).toBeCloseTo(1.5);
    expect(normalizeVerdantHour(-1)).toBeCloseTo(23);
    expect(normalizeVerdantHour(Number.NaN)).toBe(12);
    const local = new Date(2026, 9, 3, 18, 30, 0).getTime();
    expect(verdantLocalHour(local)).toBeCloseTo(18.5);
    expect(verdantDaylightKey(18.5)).toBe(18 * 60 + 30);
  });

  it('sweeps the light between the two bearings a view chooses', () => {
    const morning = verdantSunDirection(verdantDaylightAt(5.7), .9, -1.5);
    const evening = verdantSunDirection(verdantDaylightAt(18.9), .9, -1.5);
    expect(Math.atan2(morning.x, morning.z)).toBeGreaterThan(.7);
    expect(Math.atan2(evening.x, evening.z)).toBeLessThan(-1.3);
    for (const direction of [morning, evening]) { expect(direction.length()).toBeCloseTo(1); expect(direction.y).toBeGreaterThan(0); }
  });
});

describe('keep daylight presentation', () => {
  function frame(hour: number, quality: 'high' | 'balanced' | 'reduced' = 'balanced') {
    let current = hour;
    const scene = createKeep04Scene({ quality, reducedMotion: true, assets: empty(), daylightHour: () => current });
    return { scene, setHour: (value: number) => { current = value; } };
  }

  it('applies the mood to fog, background and exposure, and follows the clock on the next frame', () => {
    const { scene, setHour } = frame(12);
    const noonHaze = (scene.scene.background as THREE.Color).getHexString();
    expect((scene.scene.fog as THREE.Fog).color.getHexString()).toBe(noonHaze);
    expect(scene.exposure()).toBeCloseTo(verdantDaylightAt(12).exposure);
    setHour(23); scene.update(1);
    expect((scene.scene.background as THREE.Color).getHexString()).not.toBe(noonHaze);
    expect(scene.daylight().phase).toBe('night'); expect(scene.exposure()).toBeCloseTo(verdantDaylightAt(23).exposure);
    scene.dispose();
  });

  it('lights lamps and building pools only after dusk, and only on high and balanced', () => {
    for (const quality of ['high', 'balanced'] as const) {
      const { scene, setHour } = frame(12, quality);
      const pools = scene.scene.getObjectByName('building-night-light')!; const lamps = scene.scene.getObjectByName('keep04-life-lamp-light-pools')!;
      expect(pools.visible).toBe(false); expect(lamps.visible).toBe(false);
      setHour(22); scene.update(1);
      expect(pools.visible).toBe(true); expect(lamps.visible).toBe(true);
      scene.dispose();
    }
    const reduced = frame(22, 'reduced').scene;
    expect(reduced.scene.getObjectByName('building-night-light')).toBeUndefined();
    expect(reduced.scene.getObjectByName('keep04-life-lamp-light-pools')).toBeUndefined();
    reduced.dispose();
  });

  it('adds one key with the only shadow, a fill and a hemisphere, all non-pickable', () => {
    const { scene } = frame(9, 'high');
    const directional = scene.scene.children.filter(child => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight[];
    expect(directional).toHaveLength(2);
    expect(directional.filter(light => light.castShadow)).toHaveLength(1);
    expect(scene.scene.children.filter(child => child instanceof THREE.HemisphereLight)).toHaveLength(1);
    expect(scene.pickBuilding(0, 0)).toBeNull();
    scene.dispose();
  });
});
