import { createHash } from 'node:crypto';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PUBLICATION_MARKER_PROFILE =
  'warpkeep-sealed-realms-publication-possibly-submitted-v1';
const PUBLICATION_RECONCILIATION_PROFILE =
  'warpkeep-sealed-realms-publication-marker-reconciliation-v1';
const PUBLICATION_MARKER_MAXIMUM_BYTES = 4 * 1_024;
const PUBLICATION_MARKER_INPUT_KEYS = Object.freeze([
  'lane', 'sourceCommit', 'databaseUri', 'alias', 'moduleIdentity', 'release',
  'artifactDigest', 'toolchainDigest', 'publishPlanDigest',
  'confirmationDigest', 'attemptNonce', 'markedAt',
]);
const PUBLICATION_MARKER_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'lane', 'sourceCommit', 'databaseUri', 'alias',
  'moduleIdentity', 'release', 'artifactDigest', 'toolchainDigest',
  'publishPlanDigest', 'confirmationDigest', 'attemptNonce', 'markedAt',
  'submissionState',
]);
const PUBLICATION_RECONCILIATION_INPUT_KEYS = Object.freeze([
  'marker', 'markerDigest', 'outcome', 'databaseIdentity',
  'publicationReceiptDigest', 'observationDigest', 'observedAt',
]);

function exactPublicationRecord(value, keys, fail, code) {
  let descriptors;
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) fail(code);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(code);
  }
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (
    descriptorKeys.length !== keys.length
    || descriptorKeys.some((key, index) => (
      typeof key !== 'string' || key !== keys[index]
    ))
  ) fail(code);
  const snapshot = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !Object.hasOwn(descriptor, 'value')
      || descriptor.enumerable !== true
    ) fail(code);
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return Object.freeze(snapshot);
}

function canonicalPublicationTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

/**
 * Creates the small, public publication-marker surface needed by sealed
 * operation bundles. Publisher modules keep their richer private tooling;
 * this codec must remain free of atlas and private-workspace imports.
 */
export function createSealedRealmsPublicationCodec(options) {
  if (
    options === null
    || typeof options !== 'object'
    || typeof options.fail !== 'function'
    || typeof options.lane !== 'string'
    || typeof options.alias !== 'string'
    || typeof options.moduleIdentity !== 'string'
    || typeof options.release !== 'string'
  ) throw new TypeError('SEALED_REALMS_PUBLICATION_CODEC_OPTIONS_INVALID');
  const { fail, lane, alias, moduleIdentity, release } = options;

  function canonicalPublicationMarker(value) {
    const marker = exactPublicationRecord(
      value,
      PUBLICATION_MARKER_KEYS,
      fail,
      'SEALED_REALMS_PUBLICATION_MARKER_INVALID',
    );
    if (
      marker.lane !== lane
      || marker.schemaVersion !== 1
      || marker.profile !== PUBLICATION_MARKER_PROFILE
      || typeof marker.sourceCommit !== 'string'
      || !COMMIT.test(marker.sourceCommit)
      || marker.databaseUri !== 'https://maincloud.spacetimedb.com'
      || marker.alias !== alias
      || marker.moduleIdentity !== moduleIdentity
      || marker.release !== release
      || typeof marker.artifactDigest !== 'string'
      || !SHA256.test(marker.artifactDigest)
      || typeof marker.toolchainDigest !== 'string'
      || !SHA256.test(marker.toolchainDigest)
      || typeof marker.publishPlanDigest !== 'string'
      || !SHA256.test(marker.publishPlanDigest)
      || typeof marker.confirmationDigest !== 'string'
      || !SHA256.test(marker.confirmationDigest)
      || typeof marker.attemptNonce !== 'string'
      || !SHA256.test(marker.attemptNonce)
      || !canonicalPublicationTimestamp(marker.markedAt)
      || marker.submissionState !== 'possibly-submitted'
    ) fail('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
    const canonical = `${JSON.stringify(marker)}\n`;
    if (Buffer.byteLength(canonical, 'utf8') > PUBLICATION_MARKER_MAXIMUM_BYTES) {
      fail('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
    }
    return marker;
  }

  function createSealedRealmsPublicationPossiblySubmittedMarker(input) {
    const source = exactPublicationRecord(
      input,
      PUBLICATION_MARKER_INPUT_KEYS,
      fail,
      'SEALED_REALMS_PUBLICATION_MARKER_INVALID',
    );
    return canonicalPublicationMarker({
      schemaVersion: 1,
      profile: PUBLICATION_MARKER_PROFILE,
      lane: source.lane,
      sourceCommit: source.sourceCommit,
      databaseUri: source.databaseUri,
      alias: source.alias,
      moduleIdentity: source.moduleIdentity,
      release: source.release,
      artifactDigest: source.artifactDigest,
      toolchainDigest: source.toolchainDigest,
      publishPlanDigest: source.publishPlanDigest,
      confirmationDigest: source.confirmationDigest,
      attemptNonce: source.attemptNonce,
      markedAt: source.markedAt,
      submissionState: 'possibly-submitted',
    });
  }

  function parseSealedRealmsPublicationPossiblySubmittedMarker(bytes) {
    let text;
    try {
      if (typeof bytes === 'string') text = bytes;
      else if (bytes instanceof Uint8Array) {
        if (bytes.byteLength > PUBLICATION_MARKER_MAXIMUM_BYTES) {
          fail('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
        }
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } else fail('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
      if (
        Buffer.byteLength(text, 'utf8') > PUBLICATION_MARKER_MAXIMUM_BYTES
        || !text.endsWith('\n')
        || text.endsWith('\n\n')
      ) fail('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
      const parsed = JSON.parse(text.slice(0, -1));
      const marker = canonicalPublicationMarker(parsed);
      if (`${JSON.stringify(marker)}\n` !== text) {
        fail('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
      }
      return marker;
    } catch {
      return fail('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
    }
  }

  function digestSealedRealmsPublicationPossiblySubmittedMarker(value) {
    const marker = typeof value === 'string' || value instanceof Uint8Array
      ? parseSealedRealmsPublicationPossiblySubmittedMarker(value)
      : canonicalPublicationMarker(value);
    return createHash('sha256')
      .update('warpkeep.sealed-realms.publication-possibly-submitted-marker.v1\n')
      .update(`${JSON.stringify(marker)}\n`)
      .digest('hex');
  }

  function createSealedRealmsPublicationMarkerReconciliation(input) {
    const source = exactPublicationRecord(
      input,
      PUBLICATION_RECONCILIATION_INPUT_KEYS,
      fail,
      'SEALED_REALMS_PUBLICATION_RECONCILIATION_INVALID',
    );
    const marker = canonicalPublicationMarker(source.marker);
    const markerDigest = digestSealedRealmsPublicationPossiblySubmittedMarker(marker);
    const adopted = source.outcome === 'adopted';
    const noEffect = source.outcome === 'no-effect';
    if (
      source.markerDigest !== markerDigest
      || (!adopted && !noEffect)
      || (adopted && (
        typeof source.databaseIdentity !== 'string'
        || !SHA256.test(source.databaseIdentity)
        || typeof source.publicationReceiptDigest !== 'string'
        || !SHA256.test(source.publicationReceiptDigest)
      ))
      || (noEffect && (
        source.databaseIdentity !== null
        || source.publicationReceiptDigest !== null
      ))
      || typeof source.observationDigest !== 'string'
      || !SHA256.test(source.observationDigest)
      || !canonicalPublicationTimestamp(source.observedAt)
    ) fail('SEALED_REALMS_PUBLICATION_RECONCILIATION_INVALID');
    return Object.freeze({
      schemaVersion: 1,
      profile: PUBLICATION_RECONCILIATION_PROFILE,
      lane: marker.lane,
      markerDigest,
      outcome: source.outcome,
      databaseIdentity: source.databaseIdentity,
      publicationReceiptDigest: source.publicationReceiptDigest,
      observationDigest: source.observationDigest,
      observedAt: source.observedAt,
    });
  }

  return Object.freeze({
    createSealedRealmsPublicationPossiblySubmittedMarker,
    parseSealedRealmsPublicationPossiblySubmittedMarker,
    digestSealedRealmsPublicationPossiblySubmittedMarker,
    createSealedRealmsPublicationMarkerReconciliation,
  });
}
