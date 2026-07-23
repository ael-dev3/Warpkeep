export const RENDERED_WEBGL_QA_ROUTE = '/dev/realm-rendered-webgl-qa.html';
export const RENDERED_WEBGL_QA_FIXTURE_ID = 'synthetic-canonical-100';
export const RENDERED_WEBGL_QA_CASTLE_COUNT = 100;
export const RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS = 120_000;

const QUALITY_VALUES = new Set(['high', 'balanced', 'reduced']);
const PRESENTATION_MODE_VALUES = new Set(['observer', 'player']);
const FIXTURE_VARIANT_VALUES = new Set(['baseline', 'occupancy-stress']);

function quality(value) {
  if (typeof value !== 'string' || !QUALITY_VALUES.has(value)) {
    throw new TypeError('Invalid rendered WebGL QA quality.');
  }
  return value;
}

function presentationMode(value) {
  if (typeof value !== 'string' || !PRESENTATION_MODE_VALUES.has(value)) {
    throw new TypeError('Invalid rendered WebGL QA presentation mode.');
  }
  return value;
}

function fixtureVariant(value) {
  if (typeof value !== 'string' || !FIXTURE_VARIANT_VALUES.has(value)) {
    throw new TypeError('Invalid rendered WebGL QA fixture variant.');
  }
  return value;
}

function port(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError('Invalid rendered WebGL QA loopback port.');
  }
  return value;
}

/**
 * This is deliberately a URL formatter, not a server or browser launcher.
 * Callers receive only the exact loopback fixture route and cannot provide a
 * host, origin, authentication state, snapshot, or storage destination.
 */
export function renderedWebglQaUrl(options = {}) {
  const selectedQuality = quality(options.quality ?? 'balanced');
  const selectedPresentationMode = presentationMode(options.mode ?? 'observer');
  const selectedFixtureVariant = fixtureVariant(options.fixture ?? 'baseline');
  const selectedPort = port(options.port ?? 5173);
  const url = new URL(RENDERED_WEBGL_QA_ROUTE, `http://127.0.0.1:${selectedPort}`);
  url.searchParams.set('quality', selectedQuality);
  if (selectedPresentationMode !== 'observer') {
    url.searchParams.set('mode', selectedPresentationMode);
  }
  if (selectedFixtureVariant !== 'baseline') {
    url.searchParams.set('fixture', selectedFixtureVariant);
  }
  return url.toString();
}

function exactRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid rendered WebGL QA observation.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Invalid rendered WebGL QA observation.');
  }
  return value;
}

/**
 * Accept only aggregate information that a local browser check can derive from
 * the synthetic fixture. A fallback or any additional field fails closed; this
 * helper never records, writes, or transports an observation.
 */
export function parseRenderedWebglQaObservation(value) {
  const candidate = exactRecord(value);
  const expectedKeys = [
    'castleCount',
    'fixture',
    'presentationMode',
    'quality',
    'readyAfterMilliseconds',
    'renderer',
    'version',
  ];
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || candidate.version !== 1
    || candidate.fixture !== RENDERED_WEBGL_QA_FIXTURE_ID
    || candidate.renderer !== 'webgl'
    || candidate.castleCount !== RENDERED_WEBGL_QA_CASTLE_COUNT
    || typeof candidate.presentationMode !== 'string'
    || !PRESENTATION_MODE_VALUES.has(candidate.presentationMode)
    || typeof candidate.quality !== 'string'
    || !QUALITY_VALUES.has(candidate.quality)
    || !Number.isSafeInteger(candidate.readyAfterMilliseconds)
    || candidate.readyAfterMilliseconds < 0
    || candidate.readyAfterMilliseconds > RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS
  ) {
    throw new TypeError('Invalid rendered WebGL QA observation.');
  }
  return Object.freeze({
    version: 1,
    fixture: RENDERED_WEBGL_QA_FIXTURE_ID,
    renderer: 'webgl',
    presentationMode: candidate.presentationMode,
    quality: candidate.quality,
    castleCount: RENDERED_WEBGL_QA_CASTLE_COUNT,
    readyAfterMilliseconds: candidate.readyAfterMilliseconds,
  });
}

function usage() {
  return 'Usage: node scripts/qa-observer/rendered-webgl-qa-contract.mjs --url [high|balanced|reduced] [port] [observer|player]';
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arguments_ = process.argv.slice(2);
  if (arguments_[0] !== '--url' || arguments_.length > 4) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
  } else {
    try {
      const selectedQuality = arguments_[1] ?? 'balanced';
      const selectedPort = arguments_[2] === undefined ? 5173 : Number(arguments_[2]);
      const selectedPresentationMode = arguments_[3] ?? 'observer';
      process.stdout.write(`${renderedWebglQaUrl({
        mode: selectedPresentationMode,
        quality: selectedQuality,
        port: selectedPort
      })}\n`);
    } catch {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = 2;
    }
  }
}
