/**
 * Fixed, synthetic-only Inner Keep presentation cases shared by the local
 * React harness and its reviewed browser probe. This module is intentionally
 * data-only and has no backend, identity, storage, or network seam.
 */
export const INNER_KEEP_QA_SCENARIO_MANIFEST = Object.freeze([
  Object.freeze({
    id: 'empty',
    label: 'Empty Inner Keep',
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: false,
    state: 'empty',
    level: null,
    progressBasisPoints: null,
    selectedSlotId: null,
    selectedBuildingKind: null,
  }),
  Object.freeze({
    id: 'high-quality',
    label: 'High quality living Inner Keep',
    renderMode: 'webgl',
    quality: 'high',
    reducedMotion: false,
    state: 'empty',
    level: null,
    progressBasisPoints: null,
    selectedSlotId: null,
    selectedBuildingKind: null,
  }),
  Object.freeze({
    id: 'active-conversation',
    label: 'Active courtyard conversation',
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: false,
    state: 'empty',
    level: null,
    progressBasisPoints: null,
    selectedSlotId: null,
    selectedBuildingKind: null,
    initialElapsedSeconds: 20,
  }),
  ...[1, 2, 3, 4, 5].map((level) => Object.freeze({
    id: `completed-level-${level}`,
    label: `Completed City Mill Level ${level}`,
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: false,
    state: 'complete',
    level,
    progressBasisPoints: null,
    selectedSlotId: null,
    selectedBuildingKind: null,
  })),
  ...[100, 5_000, 9_900].map((progressBasisPoints) => Object.freeze({
    id: `construction-${progressBasisPoints / 100}-percent`,
    label: `City Mill construction ${progressBasisPoints / 100}%`,
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: false,
    state: 'constructing',
    level: 1,
    progressBasisPoints,
    selectedSlotId: 'inner-keep-slot-m01',
    selectedBuildingKind: null,
  })),
  Object.freeze({
    id: 'completion-reveal',
    label: 'Authoritative completion reveal',
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: false,
    state: 'completion-reveal',
    level: 1,
    progressBasisPoints: 9_900,
    selectedSlotId: 'inner-keep-slot-m01',
    selectedBuildingKind: null,
  }),
  Object.freeze({
    id: 'builder-busy',
    label: 'Builder occupied',
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: false,
    state: 'builder-busy',
    level: 1,
    progressBasisPoints: 5_000,
    selectedSlotId: 'inner-keep-slot-m02',
    selectedBuildingKind: 'lumber-camp',
  }),
  Object.freeze({
    id: 'insufficient-resources',
    label: 'Insufficient stored resources',
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: false,
    state: 'insufficient',
    level: null,
    progressBasisPoints: null,
    selectedSlotId: 'inner-keep-slot-m01',
    selectedBuildingKind: 'city-mill',
  }),
  Object.freeze({
    id: 'compact-quality',
    label: 'Compact graphics quality',
    renderMode: 'webgl',
    quality: 'reduced',
    reducedMotion: false,
    state: 'complete',
    level: 3,
    progressBasisPoints: null,
    selectedSlotId: null,
    selectedBuildingKind: null,
  }),
  Object.freeze({
    id: 'reduced-motion',
    label: 'Reduced motion construction',
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: true,
    state: 'constructing',
    level: 1,
    progressBasisPoints: 5_000,
    selectedSlotId: 'inner-keep-slot-m01',
    selectedBuildingKind: null,
  }),
  Object.freeze({
    id: 'missing-asset-fallback',
    label: 'Missing optional art fallback',
    renderMode: 'webgl',
    quality: 'balanced',
    reducedMotion: false,
    state: 'missing-asset',
    level: 3,
    progressBasisPoints: null,
    selectedSlotId: 'inner-keep-slot-m01',
    selectedBuildingKind: null,
  }),
  Object.freeze({
    id: '2d-fallback',
    label: 'Functional 2D fallback',
    renderMode: 'fallback',
    quality: 'reduced',
    reducedMotion: true,
    state: 'complete',
    level: 2,
    progressBasisPoints: null,
    selectedSlotId: null,
    selectedBuildingKind: null,
  }),
]);

export const INNER_KEEP_QA_SCENARIO_IDS = Object.freeze(
  INNER_KEEP_QA_SCENARIO_MANIFEST.map((scenario) => scenario.id),
);

export function innerKeepQaScenarioById(value) {
  return INNER_KEEP_QA_SCENARIO_MANIFEST.find((scenario) => scenario.id === value)
    ?? INNER_KEEP_QA_SCENARIO_MANIFEST[0];
}

export function readInnerKeepQaScenario(search) {
  const parameters = new URLSearchParams(search);
  const keys = [...parameters.keys()];
  if (keys.some((key) => key !== 'scenario') || parameters.getAll('scenario').length > 1) {
    return INNER_KEEP_QA_SCENARIO_MANIFEST[0];
  }
  return innerKeepQaScenarioById(parameters.get('scenario'));
}
