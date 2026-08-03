import {
  INNER_KEEP_QA_SCENARIO_IDS,
  INNER_KEEP_QA_SCENARIO_MANIFEST,
  innerKeepQaScenarioById,
} from '../../src/dev/innerKeepQaScenarioManifest.mjs';

export const INNER_KEEP_QA_ROUTE = '/dev/inner-keep-qa.html';
export const INNER_KEEP_QA_CASE_COUNT = INNER_KEEP_QA_SCENARIO_MANIFEST.length;
export const INNER_KEEP_QA_MAX_READY_MILLISECONDS = 30_000;

function exactPort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError('Invalid Inner Keep QA loopback port.');
  }
  return value;
}

export function innerKeepQaUrl(options = {}) {
  const selectedPort = exactPort(options.port ?? 5173);
  const scenario = innerKeepQaScenarioById(options.scenario ?? 'empty');
  if (options.scenario !== undefined && scenario.id !== options.scenario) {
    throw new TypeError('Invalid Inner Keep QA scenario.');
  }
  const url = new URL(INNER_KEEP_QA_ROUTE, `http://127.0.0.1:${selectedPort}`);
  url.searchParams.set('scenario', scenario.id);
  return url.toString();
}

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(message);
  }
  return value;
}

function exactInteger(value, minimum = 0, maximum = 1_000_000_000) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

const EVIDENCE_KEYS = Object.freeze([
  'assetFallbackCount',
  'builderBusyVisible',
  'canvasCount',
  'completedBuildingCount',
  'completionRevealActive',
  'constructionSiteCount',
  'documentHeight',
  'documentWidth',
  'enabledSlotControlCount',
  'finalModelCount',
  'horizontalOverflow',
  'innerKeepRenderer',
  'insufficientResourcesVisible',
  'levelVisible',
  'maximumPendingRafCount',
  'progressBasisPoints',
  'quality',
  'rafOwnerCount',
  'reducedMotion',
  'renderMode',
  'rendererCount',
  'scaffoldPresent',
  'scenario',
  'slotControlCount',
  'slotCount',
  'slotGeometryCount',
  'smokeSpriteCount',
  'status',
  'version',
  'verticalOverflow',
  'viewportHeight',
  'viewportWidth',
  'webglContextCount',
]);

export function parseInnerKeepQaEvidence(value) {
  const candidate = exactRecord(value, 'Invalid Inner Keep QA evidence.');
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== EVIDENCE_KEYS.length
    || keys.some((key, index) => key !== EVIDENCE_KEYS[index])
    || candidate.version !== 1
    || !INNER_KEEP_QA_SCENARIO_IDS.includes(candidate.scenario)
    || !['webgl', 'fallback'].includes(candidate.renderMode)
    || !['webgl', 'fallback'].includes(candidate.innerKeepRenderer)
    || !['high', 'balanced', 'reduced'].includes(candidate.quality)
    || candidate.status !== 'ready'
    || typeof candidate.reducedMotion !== 'boolean'
    || typeof candidate.scaffoldPresent !== 'boolean'
    || typeof candidate.completionRevealActive !== 'boolean'
    || typeof candidate.horizontalOverflow !== 'boolean'
    || typeof candidate.verticalOverflow !== 'boolean'
    || typeof candidate.builderBusyVisible !== 'boolean'
    || typeof candidate.insufficientResourcesVisible !== 'boolean'
    || typeof candidate.levelVisible !== 'boolean'
    || ![
      candidate.assetFallbackCount,
      candidate.canvasCount,
      candidate.completedBuildingCount,
      candidate.constructionSiteCount,
      candidate.documentHeight,
      candidate.documentWidth,
      candidate.enabledSlotControlCount,
      candidate.finalModelCount,
      candidate.maximumPendingRafCount,
      candidate.rafOwnerCount,
      candidate.rendererCount,
      candidate.slotControlCount,
      candidate.slotCount,
      candidate.slotGeometryCount,
      candidate.smokeSpriteCount,
      candidate.viewportHeight,
      candidate.viewportWidth,
      candidate.webglContextCount,
    ].every((entry) => exactInteger(entry))
    || !(
      candidate.progressBasisPoints === null
      || exactInteger(candidate.progressBasisPoints, 0, 10_000)
    )
  ) throw new TypeError('Invalid Inner Keep QA evidence.');
  return Object.freeze({ ...candidate });
}

function expectCompletedPresentation(evidence) {
  return evidence.completedBuildingCount === 1
    && evidence.constructionSiteCount === 0
    && evidence.finalModelCount === (evidence.renderMode === 'webgl' ? 1 : 0)
    && evidence.scaffoldPresent === false
    && evidence.smokeSpriteCount === 0;
}

function expectConstructionPresentation(evidence) {
  return evidence.completedBuildingCount === 0
    && evidence.constructionSiteCount === 1
    && evidence.finalModelCount === 0
    && evidence.scaffoldPresent === true
    && evidence.smokeSpriteCount > 0;
}

/**
 * Validates only aggregate synthetic presentation facts. No text, IDs, costs,
 * timestamps, screenshots, or browser URLs are accepted into the result.
 */
export function assertInnerKeepQaScenarioEvidence(
  value,
  expectedScenarioId,
  phase = 'steady',
) {
  const evidence = parseInnerKeepQaEvidence(value);
  const scenario = innerKeepQaScenarioById(expectedScenarioId);
  const expectedProgress = scenario.progressBasisPoints;
  if (
    scenario.id !== expectedScenarioId
    || evidence.scenario !== scenario.id
    || evidence.renderMode !== scenario.renderMode
    || evidence.innerKeepRenderer !== scenario.renderMode
    || evidence.quality !== scenario.quality
    || evidence.reducedMotion !== scenario.reducedMotion
    || evidence.progressBasisPoints !== expectedProgress
    || evidence.slotControlCount !== 12
    || evidence.enabledSlotControlCount !== 12
    || evidence.slotCount !== 12
    || evidence.horizontalOverflow
    || evidence.verticalOverflow
    || evidence.documentWidth > evidence.viewportWidth + 1
    || evidence.documentHeight > evidence.viewportHeight + 1
  ) throw new TypeError('Inner Keep QA scenario evidence mismatched.');

  if (scenario.renderMode === 'webgl') {
    if (
      evidence.canvasCount !== 1
      || evidence.rendererCount !== 1
      || evidence.webglContextCount !== 1
      || evidence.rafOwnerCount !== 1
      || evidence.maximumPendingRafCount > 1
      || evidence.slotGeometryCount !== 12
    ) throw new TypeError('Inner Keep QA single-renderer evidence mismatched.');
  } else if (
    evidence.canvasCount !== 0
    || evidence.rendererCount !== 0
    || evidence.webglContextCount !== 0
    || evidence.rafOwnerCount !== 0
    || evidence.maximumPendingRafCount !== 0
    || evidence.slotGeometryCount !== 0
  ) {
    throw new TypeError('Inner Keep QA fallback resource evidence mismatched.');
  }

  const constructing = [
    'constructing',
    'completion-reveal',
    'builder-busy',
  ].includes(scenario.state);
  const completed = ['complete', 'missing-asset'].includes(scenario.state);
  if (
    phase === 'reveal'
    && scenario.state === 'completion-reveal'
  ) {
    if (
      evidence.completedBuildingCount !== 1
      || evidence.constructionSiteCount !== 0
      || evidence.finalModelCount !== 1
      || !evidence.scaffoldPresent
      || !evidence.completionRevealActive
      || evidence.smokeSpriteCount < 1
    ) throw new TypeError('Inner Keep QA completion reveal evidence mismatched.');
  } else if (
    phase === 'completed'
    && scenario.state === 'completion-reveal'
  ) {
    if (!expectCompletedPresentation(evidence) || evidence.completionRevealActive) {
      throw new TypeError('Inner Keep QA completed reveal evidence mismatched.');
    }
  } else if (constructing) {
    if (!expectConstructionPresentation(evidence) || evidence.completionRevealActive) {
      throw new TypeError('Inner Keep QA construction evidence mismatched.');
    }
  } else if (completed) {
    if (!expectCompletedPresentation(evidence) || evidence.completionRevealActive) {
      throw new TypeError('Inner Keep QA completed-building evidence mismatched.');
    }
  } else if (
    evidence.completedBuildingCount !== 0
    || evidence.constructionSiteCount !== 0
    || evidence.finalModelCount !== 0
    || evidence.scaffoldPresent
    || evidence.smokeSpriteCount !== 0
  ) {
    throw new TypeError('Inner Keep QA empty presentation evidence mismatched.');
  }

  if (
    (scenario.state === 'missing-asset' && evidence.assetFallbackCount < 1)
    || (scenario.state === 'builder-busy' && !evidence.builderBusyVisible)
    || (scenario.state === 'insufficient' && !evidence.insufficientResourcesVisible)
    || (scenario.level !== null && !evidence.levelVisible)
  ) throw new TypeError('Inner Keep QA scenario UI evidence mismatched.');
  return evidence;
}

export function innerKeepQaBrowserCases(port) {
  const selectedPort = exactPort(port);
  return Object.freeze(INNER_KEEP_QA_SCENARIO_MANIFEST.map((scenario) => Object.freeze({
    id: scenario.id,
    scenario,
    url: innerKeepQaUrl({ port: selectedPort, scenario: scenario.id }),
    viewport: Object.freeze(
      ['construction-99-percent', 'compact-quality', 'reduced-motion',
        'missing-asset-fallback', '2d-fallback'].includes(scenario.id)
        ? { width: 390, height: 844 }
        : { width: 1_440, height: 900 }
    )
  })));
}
