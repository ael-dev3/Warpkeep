import * as THREE from 'three';

// Verdant daylight: one presentation clock for the keep and the Greater Realm.
// The player's own local hour chooses a lighting mood (dawn, day, golden
// hour, dusk or a moonlit night) so a returning Keeper finds the citadel in
// the same part of the day they are in. Presentation only: no gameplay value,
// timer, request or authority reads this, and nothing here leaves the device.
//
// Every mood keeps the scene readable. Night is a bright, cool moonlight with
// lit windows rather than darkness, and the sun stays on the camera side of
// the keep so building façades never fall into silhouette.

export type VerdantDaylightPhase = 'night' | 'dawn' | 'morning' | 'day' | 'golden' | 'dusk';

type Keyframe = Readonly<{
  hour: number; phase: VerdantDaylightPhase;
  sun: string; sunIntensity: number; elevation: number; swing: number;
  sky: string; ground: string; hemisphere: number;
  fill: string; fillIntensity: number;
  haze: string; exposure: number;
  /** 0 by day, 1 when windows and lanterns are fully lit. */
  glow: number;
  /** 0 by day, 1 for night ambience (crickets instead of birdsong). */
  night: number;
  /** 1 in full daylight, 0 at night: how much a view keeps its own daytime palette. */
  day: number;
}>;

// Hours are local wall-clock hours. Neighbouring keyframes blend with a
// smoothstep, so the light never jumps while a player watches.
const NIGHT: Omit<Keyframe, 'hour'> = {
  phase: 'night', sun: '#a6baf0', sunIntensity: 1.12, elevation: .82, swing: -.35,
  sky: '#3c5384', ground: '#1f2730', hemisphere: 1.24,
  fill: '#6f86c2', fillIntensity: .42, haze: '#2a3a52', exposure: 1.28, glow: 1, night: 1, day: 0,
};
const KEYFRAMES: readonly Keyframe[] = Object.freeze([
  { hour: 0, ...NIGHT },
  { hour: 4.6, ...NIGHT },
  { hour: 5.7, phase: 'dawn', sun: '#ffb68e', sunIntensity: 1.95, elevation: .3, swing: -.95,
    sky: '#c4b6d2', ground: '#4d4a3d', hemisphere: 1.5, fill: '#8ea1cf', fillIntensity: .36, haze: '#c7b8bb', exposure: 1.14, glow: .5, night: .3, day: .45 },
  { hour: 7, phase: 'morning', sun: '#ffe3c1', sunIntensity: 2.75, elevation: .55, swing: -.7,
    sky: '#d3e2ea', ground: '#59664a', hemisphere: 1.78, fill: '#9fb6d8', fillIntensity: .3, haze: '#c2cec3', exposure: 1.1, glow: 0, night: 0, day: .9 },
  { hour: 11.5, phase: 'day', sun: '#fff1da', sunIntensity: 3.05, elevation: .95, swing: -.15,
    sky: '#dbe9ef', ground: '#5c6a48', hemisphere: 1.82, fill: '#a9bfd6', fillIntensity: .26, haze: '#b6c5b4', exposure: 1.1, glow: 0, night: 0, day: 1 },
  { hour: 15.5, phase: 'day', sun: '#ffe9c6', sunIntensity: 3, elevation: .74, swing: .3,
    sky: '#dfe6e6', ground: '#5d6846', hemisphere: 1.76, fill: '#a3b8d4', fillIntensity: .3, haze: '#bec6b1', exposure: 1.1, glow: 0, night: 0, day: 1 },
  { hour: 17.6, phase: 'golden', sun: '#ffcf95', sunIntensity: 2.85, elevation: .4, swing: .75,
    sky: '#d9d8d2', ground: '#55573f', hemisphere: 1.52, fill: '#8ea6d6', fillIntensity: .5, haze: '#d2c4a6', exposure: 1.12, glow: .12, night: 0, day: .72 },
  { hour: 18.9, phase: 'dusk', sun: '#ff9a6a', sunIntensity: 1.9, elevation: .2, swing: 1,
    sky: '#7f83b4', ground: '#3a3c42', hemisphere: 1.42, fill: '#7a8fd0', fillIntensity: .55, haze: '#8f8aa8', exposure: 1.18, glow: .78, night: .45, day: .32 },
  { hour: 20.3, ...NIGHT },
  { hour: 24, ...NIGHT },
].map(frame => Object.freeze(frame as Keyframe)));

export type VerdantDaylight = Readonly<{
  /** Local wall-clock hour in [0, 24). */
  hour: number; phase: VerdantDaylightPhase;
  sunColor: THREE.Color; sunIntensity: number;
  /** Radians above the horizon; never below the shadow-safe minimum. */
  sunElevation: number;
  /** -1 morning side … +1 evening side of the keep's lit front. */
  sunSwing: number;
  skyColor: THREE.Color; groundColor: THREE.Color; hemisphereIntensity: number;
  fillColor: THREE.Color; fillIntensity: number;
  hazeColor: THREE.Color; exposure: number;
  windowGlow: number; night: number;
  /** 1 in full daylight, 0 at night. */
  day: number;
}>;

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The device's local hour, including minutes, for a timestamp. */
export function verdantLocalHour(nowMs: number) {
  const date = new Date(Number.isFinite(nowMs) ? nowMs : 0);
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** Normalises any hour (including QA overrides) into [0, 24). */
export function normalizeVerdantHour(hour: number) {
  if (!Number.isFinite(hour)) return 12;
  const value = hour % 24;
  return value < 0 ? value + 24 : value;
}

/** The blended lighting mood for a local hour. */
export function verdantDaylightAt(hour: number): VerdantDaylight {
  const h = normalizeVerdantHour(hour);
  let index = 0;
  while (index < KEYFRAMES.length - 2 && KEYFRAMES[index + 1].hour <= h) index++;
  const a = KEYFRAMES[index]; const b = KEYFRAMES[index + 1];
  const t = smooth(Math.min(1, Math.max(0, (h - a.hour) / Math.max(1e-6, b.hour - a.hour))));
  const color = (from: string, to: string) => new THREE.Color(from).lerp(new THREE.Color(to), t);
  return Object.freeze({
    hour: h, phase: t < .5 ? a.phase : b.phase,
    sunColor: color(a.sun, b.sun), sunIntensity: mix(a.sunIntensity, b.sunIntensity, t),
    sunElevation: Math.max(.2, mix(a.elevation, b.elevation, t)), sunSwing: mix(a.swing, b.swing, t),
    skyColor: color(a.sky, b.sky), groundColor: color(a.ground, b.ground), hemisphereIntensity: mix(a.hemisphere, b.hemisphere, t),
    fillColor: color(a.fill, b.fill), fillIntensity: mix(a.fillIntensity, b.fillIntensity, t),
    hazeColor: color(a.haze, b.haze), exposure: mix(a.exposure, b.exposure, t),
    windowGlow: mix(a.glow, b.glow, t), night: mix(a.night, b.night, t), day: mix(a.day, b.day, t),
  });
}

/** The mood for a timestamp in the device's local time. */
export function verdantDaylightNow(nowMs: number) {
  return verdantDaylightAt(verdantLocalHour(nowMs));
}

/**
 * Unit direction toward the sun (or moon). `morningAzimuth` and
 * `eveningAzimuth` are world-space bearings (atan2(x, z)) chosen by each view
 * so both ends of the swing stay on its camera side.
 */
export function verdantSunDirection(daylight: VerdantDaylight, morningAzimuth: number, eveningAzimuth: number, target = new THREE.Vector3()) {
  const azimuth = mix(morningAzimuth, eveningAzimuth, (daylight.sunSwing + 1) / 2);
  const flat = Math.cos(daylight.sunElevation);
  return target.set(Math.sin(azimuth) * flat, Math.sin(daylight.sunElevation), Math.cos(azimuth) * flat).normalize();
}

/** Minutes are enough resolution for a mood; callers can skip identical keys. */
export function verdantDaylightKey(hour: number) {
  return Math.floor(normalizeVerdantHour(hour) * 60);
}
