import {
  createSealedRealmsPublicationMarkerReconciliation as createGenesis002Reconciliation,
  createSealedRealmsPublicationPossiblySubmittedMarker as createGenesis002Marker,
  digestSealedRealmsPublicationPossiblySubmittedMarker as digestGenesis002Marker,
  parseSealedRealmsPublicationPossiblySubmittedMarker as parseGenesis002Marker,
} from './genesis002-production-publisher.mjs';
import {
  createSealedRealmsPublicationMarkerReconciliation as createPtrReconciliation,
  createSealedRealmsPublicationPossiblySubmittedMarker as createPtrMarker,
  digestSealedRealmsPublicationPossiblySubmittedMarker as digestPtrMarker,
  parseSealedRealmsPublicationPossiblySubmittedMarker as parsePtrMarker,
} from './ptr-production-publisher.mjs';
import { assertSealedRealmsProductionPrivateState } from
  './sealed-realms-production-private-state.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const confirmations = new WeakMap();
const reconcilers = new WeakSet();

export class SealedRealmsProductionReconciliationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionReconciliationError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsProductionReconciliationError(code);
}

function exactObject(value, keys, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail(code);
  return value;
}

function laneCodec(lane) {
  if (lane === 'g002') {
    return Object.freeze({
      marker: createGenesis002Marker,
      parse: parseGenesis002Marker,
      digest: digestGenesis002Marker,
      reconciliation: createGenesis002Reconciliation,
    });
  }
  if (lane === 'ptr') {
    return Object.freeze({
      marker: createPtrMarker,
      parse: parsePtrMarker,
      digest: digestPtrMarker,
      reconciliation: createPtrReconciliation,
    });
  }
  fail('SEALED_REALMS_RECONCILIATION_LANE_INVALID');
}

function markerPaths(lane, markerDigest) {
  if (!SHA256.test(markerDigest)) fail('SEALED_REALMS_RECONCILIATION_MARKER_INVALID');
  return Object.freeze({
    marker: `publication/${lane}/markers/possibly-submitted-${markerDigest}.json`,
    consumed: `publication/${lane}/consumed/confirmation-${markerDigest}.json`,
    reconciliation: `publication/${lane}/reconciliation/marker-${markerDigest}.json`,
    claim: `publication/${lane}/reconciliation/marker-${markerDigest}.lock`,
  });
}

function canonicalMarkerBytes(marker) {
  const bytes = Buffer.from(`${JSON.stringify(marker)}\n`, 'utf8');
  if (bytes.byteLength < 1 || bytes.byteLength > 4 * 1_024) {
    bytes.fill(0);
    fail('SEALED_REALMS_RECONCILIATION_MARKER_INVALID');
  }
  return bytes;
}

function canonicalMarkerValue(codec, value) {
  let bytes;
  try {
    bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
    return codec.parse(bytes);
  } catch (error) {
    if (error instanceof SealedRealmsProductionReconciliationError) throw error;
    fail('SEALED_REALMS_RECONCILIATION_MARKER_INVALID');
  } finally {
    bytes?.fill(0);
  }
}

function canonicalConsumedRecord({ lane, markerDigest, confirmationDigest, consumedAt }) {
  if (
    !SHA256.test(markerDigest) || !SHA256.test(confirmationDigest)
    || typeof consumedAt !== 'string'
    || new Date(consumedAt).toISOString() !== consumedAt
  ) fail('SEALED_REALMS_RECONCILIATION_CONFIRMATION_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-publication-confirmation-consumed-v1',
    lane,
    markerDigest,
    confirmationDigest,
    consumedAt,
  });
}

function opaqueConfirmation({ lane, markerDigest, confirmationDigest }) {
  const confirmation = Object.freeze({});
  confirmations.set(confirmation, Object.freeze({ lane, markerDigest, confirmationDigest }));
  return confirmation;
}

function exactMarkerFromBytes(codec, bytes, expectedDigest, lane) {
  try {
    const marker = codec.parse(bytes);
    const digest = codec.digest(marker);
    if (digest !== expectedDigest || marker.lane !== lane) {
      fail('SEALED_REALMS_RECONCILIATION_MARKER_INVALID');
    }
    return marker;
  } catch (error) {
    if (error instanceof SealedRealmsProductionReconciliationError) throw error;
    fail('SEALED_REALMS_RECONCILIATION_MARKER_INVALID');
  }
}

function canonicalPrivateRecord(bytes, expectedKeys) {
  let source;
  let value;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
  }
  if (
    !exactObject(value, expectedKeys, 'SEALED_REALMS_RECONCILIATION_STATE_INVALID')
    || `${JSON.stringify(value)}\n` !== source
  ) fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
  return value;
}

function canonicalTimestamp(value) {
  return typeof value === 'string'
    && new Date(value).toISOString() === value;
}

function validateConsumedRecord(bytes, lane, markerDigest, confirmationDigest) {
  const value = canonicalPrivateRecord(bytes, [
    'schemaVersion', 'profile', 'lane', 'markerDigest', 'confirmationDigest', 'consumedAt',
  ]);
  if (
    value.schemaVersion !== 1
    || value.profile !== 'warpkeep-sealed-realms-publication-confirmation-consumed-v1'
    || value.lane !== lane
    || value.markerDigest !== markerDigest
    || value.confirmationDigest !== confirmationDigest
    || !canonicalTimestamp(value.consumedAt)
  ) fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
  return value;
}

function validateReconciliationRecord(bytes, lane, markerDigest) {
  const value = canonicalPrivateRecord(bytes, [
    'schemaVersion', 'profile', 'lane', 'markerDigest', 'outcome', 'databaseIdentity',
    'publicationReceiptDigest', 'observationDigest', 'observedAt',
  ]);
  const adopted = value.outcome === 'adopted';
  const noEffect = value.outcome === 'no-effect';
  if (
    value.schemaVersion !== 1
    || value.profile !== 'warpkeep-sealed-realms-publication-marker-reconciliation-v1'
    || value.lane !== lane
    || value.markerDigest !== markerDigest
    || (!adopted && !noEffect)
    || (adopted && (!SHA256.test(value.databaseIdentity ?? '')
      || !SHA256.test(value.publicationReceiptDigest ?? '')))
    || (noEffect && (value.databaseIdentity !== null || value.publicationReceiptDigest !== null))
    || !SHA256.test(value.observationDigest ?? '')
    || !canonicalTimestamp(value.observedAt)
  ) fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
  return value;
}

/** Durable no-replay publisher marker persistence for one isolated lane. */
export function createSealedRealmsProductionPublicationReconciler(input) {
  const options = exactObject(
    input,
    ['privateState', 'lane', 'postflight'],
    'SEALED_REALMS_RECONCILIATION_INPUT_INVALID',
  );
  const privateState = assertSealedRealmsProductionPrivateState(options.privateState);
  const lane = options.lane;
  const codec = laneCodec(lane);
  if (typeof options.postflight !== 'function') {
    fail('SEALED_REALMS_RECONCILIATION_INPUT_INVALID');
  }

  // Only a confirmation minted by this live reconciler is apply-capable. A
  // durable unresolved marker discovered after restart is reconciliation-only;
  // it can never reissue a pre-crash publication token.
  const activeByMarker = new Map();
  const markerInventory = () => {
    const markerNames = privateState.list({
      root: 'runtime', relativeDirectory: `publication/${lane}/markers`,
    });
    const consumedNames = privateState.list({
      root: 'runtime', relativeDirectory: `publication/${lane}/consumed`,
    });
    const reconciliationNames = privateState.list({
      root: 'runtime', relativeDirectory: `publication/${lane}/reconciliation`,
    });
    const markerDigests = new Set();
    const consumedDigests = new Set();
    const reconciliationDigests = new Set();
    const claimDigests = new Set();
    for (const name of markerNames) {
      const match = /^possibly-submitted-([0-9a-f]{64})\.json$/u.exec(name);
      if (match === null || markerDigests.has(match[1])) {
        fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
      }
      markerDigests.add(match[1]);
    }
    for (const name of consumedNames) {
      const match = /^confirmation-([0-9a-f]{64})\.json$/u.exec(name);
      if (match === null || consumedDigests.has(match[1])) {
        fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
      }
      consumedDigests.add(match[1]);
    }
    for (const name of reconciliationNames) {
      const terminalMatch = /^marker-([0-9a-f]{64})\.json$/u.exec(name);
      const claimMatch = /^marker-([0-9a-f]{64})\.lock$/u.exec(name);
      if (terminalMatch !== null) {
        if (reconciliationDigests.has(terminalMatch[1])) fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
        reconciliationDigests.add(terminalMatch[1]);
        continue;
      }
      if (claimMatch === null || claimDigests.has(claimMatch[1])) {
        fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
      }
      claimDigests.add(claimMatch[1]);
      const claimBytes = privateState.read({
        root: 'runtime', relativePath: `publication/${lane}/reconciliation/${name}`,
      });
      try {
        const claim = canonicalPrivateRecord(claimBytes, [
          'schemaVersion', 'profile', 'lane', 'markerDigest',
        ]);
        if (claim.schemaVersion !== 1
          || claim.profile !== 'warpkeep-sealed-realms-publication-reconciliation-lock-v1'
          || claim.lane !== lane || claim.markerDigest !== claimMatch[1]) {
          fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
        }
      } finally { claimBytes.fill(0); }
    }
    if (
      [...consumedDigests].some(value => !markerDigests.has(value))
      || [...reconciliationDigests].some(value => !markerDigests.has(value))
      || [...claimDigests].some(value => !markerDigests.has(value))
    ) fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
    const entries = new Map();
    for (const markerDigest of [...markerDigests].sort()) {
      const paths = markerPaths(lane, markerDigest);
      const bytes = privateState.read({ root: 'runtime', relativePath: paths.marker });
      let marker;
      try {
        marker = exactMarkerFromBytes(codec, bytes, markerDigest, lane);
      } finally {
        bytes.fill(0);
      }
      let consumed;
      if (consumedDigests.has(markerDigest)) {
        const consumedBytes = privateState.read({
          root: 'runtime', relativePath: paths.consumed,
        });
        try {
          consumed = validateConsumedRecord(
            consumedBytes,
            lane,
            markerDigest,
            marker.confirmationDigest,
          );
        } finally {
          consumedBytes.fill(0);
        }
      }
      let reconciliation;
      if (reconciliationDigests.has(markerDigest)) {
        const reconciliationBytes = privateState.read({
          root: 'runtime', relativePath: paths.reconciliation,
        });
        try {
          reconciliation = validateReconciliationRecord(reconciliationBytes, lane, markerDigest);
        } finally {
          reconciliationBytes.fill(0);
        }
      }
      entries.set(markerDigest, Object.freeze({
        markerDigest,
        marker: Object.freeze(marker),
        consumed: consumed === undefined ? undefined : Object.freeze(consumed),
        reconciliation: reconciliation === undefined ? undefined : Object.freeze(reconciliation),
        claim: claimDigests.has(markerDigest),
      }));
    }
    return entries;
  };

  const writeReconciliation = async (entry) => {
    const paths = markerPaths(lane, entry.markerDigest);
    const claim = Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-publication-reconciliation-lock-v1',
      lane,
      markerDigest: entry.markerDigest,
    });
    const claimBytes = Buffer.from(`${JSON.stringify(claim)}\n`, 'utf8');
    try {
      privateState.write({ root: 'runtime', relativePath: paths.claim, bytes: claimBytes });
    } catch (error) {
      if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') {
        if (privateState.exists({ root: 'runtime', relativePath: paths.reconciliation })) {
          fail('SEALED_REALMS_RECONCILIATION_TERMINAL_CONFLICT');
        }
        fail('SEALED_REALMS_RECONCILIATION_BUSY');
      }
      throw error;
    } finally { claimBytes.fill(0); }
    let postflight;
    try {
      postflight = await options.postflight(Object.freeze({
        lane,
        marker: entry.marker,
      }));
    } catch (error) {
      if (error instanceof SealedRealmsProductionReconciliationError) throw error;
      fail('SEALED_REALMS_RECONCILIATION_POSTFLIGHT_AMBIGUOUS');
    }
    exactObject(postflight, [
      'outcome', 'databaseIdentity', 'publicationReceiptDigest',
      'observationDigest', 'observedAt',
    ], 'SEALED_REALMS_RECONCILIATION_POSTFLIGHT_INVALID');
    let record;
    try {
      record = codec.reconciliation({
        marker: entry.marker,
        markerDigest: entry.markerDigest,
        outcome: postflight.outcome,
        databaseIdentity: postflight.databaseIdentity,
        publicationReceiptDigest: postflight.publicationReceiptDigest,
        observationDigest: postflight.observationDigest,
        observedAt: postflight.observedAt,
      });
    } catch {
      fail('SEALED_REALMS_RECONCILIATION_POSTFLIGHT_INVALID');
    }
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    let terminalExact = false;
    try {
      privateState.write({ root: 'runtime', relativePath: paths.reconciliation, bytes });
      terminalExact = true;
    } catch (error) {
      if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') {
        const existing = privateState.read({ root: 'runtime', relativePath: paths.reconciliation });
        try {
          const value = validateReconciliationRecord(existing, lane, entry.markerDigest);
          if (!existing.equals(bytes)) fail('SEALED_REALMS_RECONCILIATION_TERMINAL_CONFLICT');
          terminalExact = true;
        } finally { existing.fill(0); }
      } else throw error;
    } finally {
      bytes.fill(0);
    }
    if (terminalExact) {
      try {
        const persisted = privateState.read({ root: 'runtime', relativePath: paths.reconciliation });
        try {
          validateReconciliationRecord(persisted, lane, entry.markerDigest);
          const expected = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
          try {
            if (!persisted.equals(expected)) fail('SEALED_REALMS_RECONCILIATION_TERMINAL_CONFLICT');
          } finally { expected.fill(0); }
        } finally { persisted.fill(0); }
        privateState.remove({ root: 'runtime', relativePath: paths.claim });
      } catch {
        fail('SEALED_REALMS_RECONCILIATION_BUSY');
      }
    }
    return validateReconciliationRecord(
      Buffer.from(`${JSON.stringify(record)}\n`, 'utf8'), lane, entry.markerDigest,
    );
  };

  const reconcileUnresolved = async (entry) => {
    if (activeByMarker.has(entry.markerDigest)) {
      fail('SEALED_REALMS_RECONCILIATION_UNRESOLVED_MARKER');
    }
    return writeReconciliation(entry);
  };

  const inspect = async ({ marker }) => {
    let canonical;
    try { canonical = canonicalMarkerValue(codec, marker); } catch {
      fail('SEALED_REALMS_RECONCILIATION_MARKER_INVALID');
    }
    if (canonical.lane !== lane) fail('SEALED_REALMS_RECONCILIATION_LANE_INVALID');
    const markerDigest = codec.digest(canonical);
    const paths = markerPaths(lane, markerDigest);
    const inventory = markerInventory();
    let didReconcile = false;
    for (const entry of inventory.values()) {
      if (entry.claim) {
        if (entry.reconciliation !== undefined) {
          fail('SEALED_REALMS_RECONCILIATION_TERMINAL_CONFLICT');
        }
        fail('SEALED_REALMS_RECONCILIATION_BUSY');
      }
      if (entry.reconciliation?.outcome === 'adopted') {
        fail('SEALED_REALMS_RECONCILIATION_ADOPTED_SEALED');
      }
      if (entry.reconciliation === undefined) {
        if (activeByMarker.has(entry.markerDigest)) {
          if (entry.markerDigest !== markerDigest) {
            fail('SEALED_REALMS_RECONCILIATION_UNRESOLVED_MARKER');
          }
        } else {
          await reconcileUnresolved(entry);
          didReconcile = true;
        }
      }
    }
    if (didReconcile) {
      const refreshed = markerInventory();
      if ([...refreshed.values()].some(entry => entry.reconciliation?.outcome === 'adopted')) {
        fail('SEALED_REALMS_RECONCILIATION_ADOPTED_SEALED');
      }
      // A restart/ambiguous record was durably terminalized. Do not turn that
      // same call into a fresh apply capability; a later inspect must supply a
      // newly authenticated marker after no-effect.
      return Object.freeze({ status: 'reconciled' });
    }
    const existing = inventory.get(markerDigest);
    if (existing !== undefined) {
      if (existing.reconciliation !== undefined) {
        if (existing.reconciliation.outcome === 'adopted') {
          fail('SEALED_REALMS_RECONCILIATION_ADOPTED_SEALED');
        }
        fail('SEALED_REALMS_RECONCILIATION_MARKER_TERMINAL');
      }
      if (JSON.stringify(existing.marker) !== JSON.stringify(canonical)) {
        fail('SEALED_REALMS_RECONCILIATION_MARKER_CONFLICT');
      }
      const active = activeByMarker.get(markerDigest);
      if (active === undefined) {
        // This should only be reachable under a synchronous construction race;
        // fail closed rather than minting a replacement token.
        fail('SEALED_REALMS_RECONCILIATION_UNRESOLVED_MARKER');
      }
      return Object.freeze({ confirmation: active });
    }
    const bytes = canonicalMarkerBytes(canonical);
    try {
      privateState.write({ root: 'runtime', relativePath: paths.marker, bytes });
    } catch (error) {
      if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') {
        fail('SEALED_REALMS_RECONCILIATION_MARKER_CONFLICT');
      }
      throw error;
    } finally {
      bytes.fill(0);
    }
    const confirmation = opaqueConfirmation({
      lane, markerDigest, confirmationDigest: canonical.confirmationDigest,
    });
    activeByMarker.set(markerDigest, confirmation);
    return Object.freeze({ confirmation });
  };

  const apply = async ({ confirmation, publish, consumedAt = new Date().toISOString() }) => {
    const member = confirmations.get(confirmation);
    if (
      member === undefined || member.lane !== lane || typeof publish !== 'function'
    ) fail('SEALED_REALMS_RECONCILIATION_CONFIRMATION_INVALID');
    if (activeByMarker.get(member.markerDigest) !== confirmation) {
      fail('SEALED_REALMS_RECONCILIATION_CONFIRMATION_CONSUMED');
    }
    // Claim before the first await/read so Promise.all cannot release the
    // same marker to two publishers.
    activeByMarker.delete(member.markerDigest);
    confirmations.delete(confirmation);
    const paths = markerPaths(lane, member.markerDigest);
    const markerBytes = privateState.read({ root: 'runtime', relativePath: paths.marker });
    try {
      const marker = exactMarkerFromBytes(codec, markerBytes, member.markerDigest, lane);
      if (marker.confirmationDigest !== member.confirmationDigest) {
        fail('SEALED_REALMS_RECONCILIATION_CONFIRMATION_INVALID');
      }
    } finally {
      markerBytes.fill(0);
    }
    if (privateState.exists({ root: 'runtime', relativePath: paths.consumed })) {
      fail('SEALED_REALMS_RECONCILIATION_CONFIRMATION_CONSUMED');
    }
    const consumed = canonicalConsumedRecord({ ...member, consumedAt });
    const bytes = Buffer.from(`${JSON.stringify(consumed)}\n`, 'utf8');
    try {
      privateState.write({ root: 'runtime', relativePath: paths.consumed, bytes });
    } finally {
      bytes.fill(0);
    }
    let callbackError;
    try {
      await publish(Object.freeze({ confirmation }));
    } catch (error) {
      callbackError = error;
    }
    const entry = markerInventory().get(member.markerDigest);
    if (entry === undefined) fail('SEALED_REALMS_RECONCILIATION_STATE_INVALID');
    try {
      await writeReconciliation(entry);
    } catch (error) {
      if (callbackError !== undefined) fail('SEALED_REALMS_RECONCILIATION_PUBLICATION_AMBIGUOUS');
      throw error;
    }
    return Object.freeze({ status: 'submitted' });
  };

  const reconcile = async (request) => {
    const value = exactObject(
      request,
      ['confirmation'],
      'SEALED_REALMS_RECONCILIATION_CONFIRMATION_INVALID',
    );
    const member = confirmations.get(value.confirmation);
    if (member === undefined || member.lane !== lane) {
      fail('SEALED_REALMS_RECONCILIATION_CONFIRMATION_INVALID');
    }
    if (activeByMarker.get(member.markerDigest) !== value.confirmation) {
      fail('SEALED_REALMS_RECONCILIATION_CONFIRMATION_CONSUMED');
    }
    activeByMarker.delete(member.markerDigest);
    confirmations.delete(value.confirmation);
    const paths = markerPaths(lane, member.markerDigest);
    const markerBytes = privateState.read({ root: 'runtime', relativePath: paths.marker });
    let marker;
    try {
      marker = exactMarkerFromBytes(codec, markerBytes, member.markerDigest, lane);
      if (marker.confirmationDigest !== member.confirmationDigest) {
        fail('SEALED_REALMS_RECONCILIATION_CONFIRMATION_INVALID');
      }
    } finally {
      markerBytes.fill(0);
    }
    if (privateState.exists({ root: 'runtime', relativePath: paths.reconciliation })) {
      fail('SEALED_REALMS_RECONCILIATION_ALREADY_TERMINAL');
    }
    await writeReconciliation(Object.freeze({
      markerDigest: member.markerDigest,
      marker: Object.freeze(marker),
    }));
    return Object.freeze({ status: 'reconciled' });
  };

  const reconciler = Object.freeze({ inspect, apply, reconcile });
  reconcilers.add(reconciler);
  return reconciler;
}

export function assertSealedRealmsProductionPublicationReconciler(reconciler) {
  if (!reconcilers.has(reconciler)) {
    fail('SEALED_REALMS_RECONCILIATION_CAPABILITY_INVALID');
  }
  return reconciler;
}
