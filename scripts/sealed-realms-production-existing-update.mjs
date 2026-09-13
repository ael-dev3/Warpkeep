import { createPtrProductionExistingUpdateAdapter, isPtrProductionExistingUpdateAdapter, createG002ProductionExistingUpdateAdapter, isG002ProductionExistingUpdateAdapter } from './ptr-production-existing-update-adapter.mjs';
import { randomBytes } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { readSyntheticNetworkIdentity } from './sealed-realms-synthetic-network.mjs';
import { types } from 'node:util';
import { assertSealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import { sourceCommitFromSealedRealmsProductionAuthority } from './sealed-realms-production-source-authority.mjs';
import {
  assertSealedRealmsProductionContinuationClaim,
  assertSealedRealmsProductionContinuationReconciliation,
  classifySealedRealmsProductionContinuationNoEffect,
} from './sealed-realms-production-continuation.mjs';
import { attestSealedRealmsProductionWorkflowPermit } from './sealed-realms-production-workflow-authority.mjs';
import {
  EXISTING_UPDATE_DEFINITION_POLICY, UPDATE_HASH, updateCanonical, updateDigest, updateExact, updateProgramHash, updateSha256,
  parseExistingUpdateJson, parseExistingUpdatePlan, parseExistingUpdateProgram,
  parseExistingUpdateSchema, parseExistingUpdateSql, parseExistingUpdateSuccess,
} from './sealed-realms-existing-update-protocol.mjs';

const PROFILE = 'warpkeep-synthetic-quiescent-existing-update-v3';
const adapters = new WeakMap();
const selections = new WeakMap();
const productionIdentities = new Set([
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
  'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
]);
export class SealedRealmsExistingUpdateError extends Error {
  constructor(code) { super(code); this.name = 'SealedRealmsExistingUpdateError'; this.code = code; }
}
const fail = code => { throw new SealedRealmsExistingUpdateError(`SEALED_REALMS_EXISTING_UPDATE_${code}`); };
const same = (left, right) => updateCanonical(left) === updateCanonical(right);
const now = () => new Date().toISOString();
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('RECORD_INVALID');
}
function snapshotShape(value) {
  updateExact(value, ['program', 'schemaDigest', 'definitionPolicy', 'tables']);
  if (value.definitionPolicy !== EXISTING_UPDATE_DEFINITION_POLICY) fail('RECORD_INVALID');
  if (!UPDATE_HASH.test(value.program) || !UPDATE_HASH.test(value.schemaDigest)
    || !Array.isArray(value.tables) || value.tables.length < 1 || value.tables.length > 128) fail('RECORD_INVALID');
  let previous = '';
  for (const table of value.tables) {
    updateExact(table, ['name', 'tableSchemaDigest', 'resultSchemaDigest', 'rowsDigest', 'count']);
    if (typeof table.name !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/u.test(table.name) || table.name <= previous
      || ![table.tableSchemaDigest, table.resultSchemaDigest, table.rowsDigest].every(digest => UPDATE_HASH.test(digest))
      || !Number.isSafeInteger(table.count) || table.count < 0 || table.count > 500_000) fail('RECORD_INVALID');
    previous = table.name;
  }
}
function input(value, keys) {
  if (types.isProxy(value) || !value || Object.getPrototypeOf(value) !== Object.prototype) fail('INPUT_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length
    || keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))) fail('INPUT_INVALID');
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key].value])));
}
function privateRuntime(root) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid() <= 0
    || typeof root !== 'string' || !/^\/tmp\/warpkeep-[A-Za-z0-9._-]+$/u.test(root)
    || realpathSync(root) !== root) fail('SYNTHETIC_RUNTIME_INVALID');
  const directory = lstatSync(root);
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== process.getuid()
    || (directory.mode & 0o777) !== 0o700) fail('SYNTHETIC_RUNTIME_INVALID');
  return Object.freeze({ root, device: directory.dev, inode: directory.ino,
    ...readSyntheticNetworkIdentity() });
}
function authorityFor(state, authority) {
  if (state.disposed || sourceCommitFromSealedRealmsProductionAuthority(authority) !== state.sourceCommit
    || authority.mode !== 'S' || ![`${state.lane}-update-inspect`, `${state.lane}-update-apply`].includes(authority.operation)) fail('SOURCE_INVALID');
  if (!same(privateRuntime(state.runtime.root), state.runtime)) fail('SYNTHETIC_RUNTIME_CHANGED');
  if (updateSha256(state.candidate) !== state.candidateSha256) fail('CANDIDATE_CHANGED');
}
function claimArguments(request) {
  return Object.fromEntries(['claim', 'store', 'sourceAuthority', 'kind', 'runId', 'runAttempt',
    'subject', 'evidenceDigest', 'receiptDigests', 'predecessorDigests'].map(key => [key, request[key]]));
}

/** Requires genuine source, private-state and internally built artifact capabilities. */
export function createSealedRealmsProductionExistingUpdateAdapter(value) {
  const options = input(value, ['authority', 'privateState', 'artifact', 'observation']);
  // Read the operation only after its source capability has been authenticated.
  sourceCommitFromSealedRealmsProductionAuthority(options.authority);
  if (['g002-update-inspect', 'g002-update-apply'].includes(options.authority.operation)) {
    return createG002ProductionExistingUpdateAdapter(options);
  }
  return createPtrProductionExistingUpdateAdapter(options);
}

/** Real protocol on an isolated loopback fixture. Never a production receipt producer. */
export function createSyntheticExistingUpdateAdapter(value) {
  const options = input(value, ['lane', 'origin', 'databaseIdentity', 'sourceCommit', 'candidateBytes',
    'candidateSchemaBytes', 'readAdminToken', 'privateState', 'runtimeRoot']);
  if (!['g002', 'ptr'].includes(options.lane) || !/^[a-f0-9]{40}$/u.test(options.sourceCommit ?? '')
    || !UPDATE_HASH.test(options.databaseIdentity ?? '') || productionIdentities.has(options.databaseIdentity)
    || typeof options.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(options.origin)
    || new URL(options.origin).origin !== options.origin || typeof options.readAdminToken !== 'function'
    || !(options.candidateBytes instanceof Uint8Array) || options.candidateBytes.length < 1
    || options.candidateBytes.length > 64 * 1024 * 1024) fail('INPUT_INVALID');
  const state = {
    lane: options.lane, origin: options.origin, databaseIdentity: options.databaseIdentity,
    sourceCommit: options.sourceCommit, runtime: privateRuntime(options.runtimeRoot),
    candidate: Buffer.from(options.candidateBytes), schema: parseExistingUpdateSchema(options.candidateSchemaBytes),
    readAdminToken: options.readAdminToken, privateState: assertSealedRealmsProductionPrivateState(options.privateState),
    active: false,
  };
  state.candidateSha256 = updateSha256(state.candidate);
  state.candidateProgram = updateProgramHash(state.candidate);
  state.directory = `existing-updates-synthetic-v3/${state.lane}/${state.databaseIdentity}`;
  const legacyDirectory = `existing-updates-synthetic-v2/${state.lane}/${state.databaseIdentity}`;
  const bound = Object.freeze({ profile: PROFILE, lane: state.lane, sourceCommit: state.sourceCommit,
    origin: state.origin, databaseIdentity: state.databaseIdentity, runtimeDigest: updateDigest(state.runtime),
    candidateSha256: state.candidateSha256, candidateProgram: state.candidateProgram,
    candidateSchemaDigest: state.schema.digest, definitionPolicy: state.schema.definitionPolicy });
  const file = (digest, kind) => `${state.directory}/${digest}.${kind}.json`;
  // All contenders for a predecessor occupy the same O_EXCL slot, even when
  // they select different candidates. The full inspection digest still binds
  // continuation authority; no separate reservation can be orphaned.
  const inspectionSlot = value => updateDigest({ profile: PROFILE, lane: state.lane,
    databaseIdentity: state.databaseIdentity, predecessorDigest: value.predecessorDigest });
  const exists = (digest, kind) => state.privateState.exists({ root: 'runtime', relativePath: file(digest, kind) });
  const read = (digest, kind) => {
    const bytes = state.privateState.read({ root: 'runtime', relativePath: file(digest, kind) });
    try {
      const record = parseExistingUpdateJson(bytes);
      if (`${updateCanonical(record)}\n` !== bytes.toString() || record.profile !== PROFILE
        || record.kind !== kind) fail('RECORD_INVALID');
      if (kind === 'inspection') {
        if (record.inspectionDigest !== updateDigest(record.value)
          || digest !== inspectionSlot(record.value)) fail('RECORD_INVALID');
      } else if (record.inspectionDigest !== digest) fail('RECORD_INVALID');
      return record;
    } finally { bytes.fill(0); }
  };
  const write = (digest, kind, content) => {
    const record = { profile: PROFILE, kind, inspectionDigest: digest, ...content };
    const storageKey = kind === 'inspection' ? inspectionSlot(content.value) : digest;
    const bytes = Buffer.from(`${updateCanonical(record)}\n`);
    try {
      state.privateState.write({ root: 'runtime', relativePath: file(storageKey, kind), bytes });
      if (!same(read(storageKey, kind), record)) fail('RECORD_REOPEN_FAILED');
    } finally { bytes.fill(0); }
    return record;
  };
  const inventory = () => {
    // Earlier records attest only tables and visible plan text. Keep them intact;
    // do not start a new chain that silently presents them as full definitions.
    if (state.privateState.list({ root: 'runtime', relativeDirectory: legacyDirectory }).length !== 0) fail('LEGACY_RECORDS_UNSUPPORTED');
    const names = state.privateState.list({ root: 'runtime', relativeDirectory: state.directory });
    const records = new Map();
    for (const name of names) {
      const match = /^([a-f0-9]{64})\.(inspection|submission|completion|not-submitted)\.json$/u.exec(name);
      if (!match) fail('RECORD_INVALID');
      const record = read(match[1], match[2]);
      if (!records.has(record.inspectionDigest)) records.set(record.inspectionDigest, {});
      records.get(record.inspectionDigest)[match[2]] = record;
    }
    const predecessors = new Set();
    for (const [digest, entry] of records) {
      const inspected = entry.inspection;
      if (!inspected || inspected.inspectionDigest !== updateDigest(inspected.value)) fail('RECORD_INVALID');
      updateExact(inspected, ['profile', 'kind', 'inspectionDigest', 'value']);
      updateExact(inspected.value, ['binding', 'before', 'plan', 'predecessorDigest', 'predecessorReceiptDigest', 'attemptId', 'observedAt']);
      const old = inspected.value;
      updateExact(old.binding, Object.keys(bound));
      if (old.binding.profile !== PROFILE || old.binding.lane !== state.lane
        || old.binding.databaseIdentity !== state.databaseIdentity || !UPDATE_HASH.test(old.attemptId)
        || old.binding.definitionPolicy !== EXISTING_UPDATE_DEFINITION_POLICY
        || old.binding.origin !== state.origin || old.binding.runtimeDigest !== bound.runtimeDigest
        || !/^[a-f0-9]{40}$/u.test(old.binding.sourceCommit)
        || ![old.binding.candidateSha256, old.binding.candidateProgram, old.binding.candidateSchemaDigest].every(digest => UPDATE_HASH.test(digest))) fail('RECORD_INVALID');
      timestamp(old.observedAt); snapshotShape(old.before);
      updateExact(old.plan, ['token', 'planDigest', 'observation']);
      const reopenedPlan = parseExistingUpdatePlan(Buffer.from(updateCanonical(old.plan.observation)), state.databaseIdentity,
        old.before.program, old.binding.candidateProgram);
      if (!same(reopenedPlan, old.plan)) fail('RECORD_INVALID');
      if (old.predecessorDigest !== null) {
        if (!UPDATE_HASH.test(old.predecessorDigest) || old.predecessorDigest === digest
          || predecessors.has(old.predecessorDigest)) fail('RECORD_FORK');
        predecessors.add(old.predecessorDigest);
      }
      if (entry.completion && entry['not-submitted']) fail('RECORD_CONFLICT');
      if (entry.completion) {
        updateExact(entry.completion, ['profile', 'kind', 'inspectionDigest', 'after', 'observedAt', 'outcome']);
        if (!entry.submission || entry.completion.outcome !== 'observed-preserved-candidate') fail('RECORD_INVALID');
        timestamp(entry.completion.observedAt); snapshotShape(entry.completion.after);
        preserved(old, entry.completion.after);
      }
      if (entry.submission) {
        updateExact(entry.submission, ['profile', 'kind', 'inspectionDigest', 'claimRunId', 'claimRunAttempt', 'markedAt']);
        if (!/^[1-9][0-9]{0,19}$/u.test(entry.submission.claimRunId)
          || !Number.isInteger(entry.submission.claimRunAttempt) || entry.submission.claimRunAttempt < 1) fail('RECORD_INVALID');
        timestamp(entry.submission.markedAt);
      }
      if (entry['not-submitted']) {
        updateExact(entry['not-submitted'], ['profile', 'kind', 'inspectionDigest', 'outcome', 'observedAt', 'claimRunId', 'claimRunAttempt']);
        if (entry.submission || entry['not-submitted'].outcome !== 'module-update-not-submitted') fail('RECORD_INVALID');
        if (!/^[1-9][0-9]{0,19}$/u.test(entry['not-submitted'].claimRunId)
          || !Number.isSafeInteger(entry['not-submitted'].claimRunAttempt) || entry['not-submitted'].claimRunAttempt < 1) fail('RECORD_INVALID');
        timestamp(entry['not-submitted'].observedAt);
      }
    }
    for (const entry of records.values()) {
      const previous = entry.inspection.value.predecessorDigest;
      if (previous !== null && (!records.has(previous)
        || (!records.get(previous).completion && !records.get(previous)['not-submitted']))) fail('RECORD_CHAIN_INVALID');
      const priorTerminal = previous === null ? null : records.get(previous).completion ?? records.get(previous)['not-submitted'];
      if (entry.inspection.value.predecessorReceiptDigest !== (priorTerminal === null ? null : updateDigest(priorTerminal))) fail('RECORD_CHAIN_INVALID');
    }
    const heads = [...records].filter(([digest]) => !predecessors.has(digest));
    if (heads.length > 1 || (records.size > 0 && heads.length !== 1)) fail('RECORD_FORK');
    if (heads.length) {
      const visited = new Set(); let current = heads[0][0];
      while (current !== null) {
        if (visited.has(current)) fail('RECORD_CHAIN_INVALID');
        visited.add(current); current = records.get(current).inspection.value.predecessorDigest;
      }
      if (visited.size !== records.size) fail('RECORD_CHAIN_INVALID');
    }
    return heads[0];
  };
  async function request(path, { method = 'GET', body, beforeSend } = {}) {
    const endpoint = `${state.origin}/v1/database/${state.databaseIdentity}${path}`;
    let token, response, reader;
    const chunks = []; const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 30_000);
    try {
      // Attach both outcomes immediately; even a late credential rejection is
      // handled after this bounded operation has stopped.
      token = await Promise.race([Promise.resolve().then(() => state.readAdminToken()), new Promise((_, reject) => {
        abort.signal.addEventListener('abort', () => reject(new SealedRealmsExistingUpdateError('SEALED_REALMS_EXISTING_UPDATE_TRANSPORT_TIMEOUT')), { once: true });
      })]);
      if (typeof token !== 'string' || !/^\S{20,16384}$/u.test(token)) fail('CREDENTIAL_INVALID');
      if (beforeSend) await beforeSend();
      if (abort.signal.aborted || !same(privateRuntime(state.runtime.root), state.runtime)) fail('SYNTHETIC_RUNTIME_CHANGED');
      response = await fetch(endpoint, { method, body, redirect: 'error', signal: abort.signal,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : {
          'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/octet-stream',
        }) } });
      if (response.redirected || response.url !== endpoint || response.status !== 200) fail(`HTTP_${response.status}`);
      if (!response.body) fail('BODY_INVALID');
      reader = response.body.getReader(); let length = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength; if (length > 32 * 1024 * 1024) fail('BODY_TOO_LARGE');
        chunks.push(Buffer.from(value));
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.includes(Buffer.from(token))) { bytes.fill(0); fail('CREDENTIAL_REFLECTED'); }
      return bytes;
    } catch (error) {
      if (error instanceof SealedRealmsExistingUpdateError) throw error;
      fail('TRANSPORT_FAILED');
    } finally {
      clearTimeout(timer); abort.abort(); token = undefined;
      try { await reader?.cancel(); } catch { /* No raw transport diagnostics. */ }
      for (const chunk of chunks) chunk.fill(0);
    }
  }
  async function parsed(path, options, parse) {
    const bytes = await request(path, options);
    try { return parse(bytes); } finally { bytes.fill(0); }
  }
  const program = () => parsed('/sql', { method: 'POST', body: 'SELECT program_hash FROM st_module' }, parseExistingUpdateProgram);
  async function snapshot() {
    const before = await program();
    const schema = await parsed('/schema?version=9', {}, parseExistingUpdateSchema);
    const tables = [];
    for (const name of schema.names) {
      const value = await parsed('/sql', { method: 'POST', body: `SELECT * FROM ${name}` }, parseExistingUpdateSql);
      tables.push({ name, tableSchemaDigest: schema.tableSchemas[name], resultSchemaDigest: updateDigest(value.schema),
        rowsDigest: value.rowsDigest, count: value.count });
    }
    if (before !== await program()) fail('PROGRAM_CHANGED_DURING_READ');
    return { program: before, schemaDigest: schema.digest, definitionPolicy: schema.definitionPolicy, tables };
  }
  function preserved(inspection, after) {
    const before = inspection.before;
    if (after.program !== inspection.binding.candidateProgram
      || after.schemaDigest !== inspection.binding.candidateSchemaDigest) fail('POSTFLIGHT_PROGRAM_OR_SCHEMA_INVALID');
    const old = new Map(before.tables.map(table => [table.name, table]));
    for (const table of after.tables) {
      if (old.has(table.name)) {
        if (!same(table, old.get(table.name))) fail('PRESERVATION_FAILED');
        old.delete(table.name);
      } else if (table.count !== 0) fail('NEW_TABLE_NOT_EMPTY');
    }
    if (old.size !== 0) fail('PRESERVATION_FAILED');
  }
  const binding = (digest, entry) => {
    if (!same(entry.inspection.value.binding, bound)) fail('SELECTED_CANDIDATE_CHANGED');
    const result = Object.freeze({ subject: `${state.lane}-update:${state.databaseIdentity}`,
      evidenceDigest: digest, receiptDigests: Object.freeze([entry.inspection.value.plan.planDigest]),
      predecessorDigests: Object.freeze(entry.inspection.value.predecessorDigest === null ? []
        : [entry.inspection.value.predecessorDigest, entry.inspection.value.predecessorReceiptDigest].sort()) });
    selections.set(result, { state, digest, inspection: entry.inspection.value });
    return result;
  };
  const select = (selection, authority) => {
    authorityFor(state, authority);
    const selected = selections.get(selection), head = inventory();
    if (!selected || selected.state !== state || !head || head[0] !== selected.digest
      || !same(head[1].inspection.value, selected.inspection)) fail('SELECTION_INVALID');
    return { digest: head[0], entry: head[1], inspection: selected.inspection };
  };
  const adapter = Object.freeze({
    async inspectForContinuation({ authority }) {
      authorityFor(state, authority); if (state.active) fail('BUSY'); state.active = true;
      try {
        const previous = inventory();
        if (previous && !previous[1].completion && !previous[1]['not-submitted']) return binding(...previous);
        const before = await snapshot(); authorityFor(state, authority);
        if (before.program === state.candidateProgram) fail('UNCHANGED_PROGRAM');
        for (const table of before.tables) {
          if (state.schema.tableSchemas[table.name] !== table.tableSchemaDigest) fail('SCHEMA_NOT_PRESERVED');
        }
        const plan = await parsed('/pre_publish?host_type=Js&style=NoColor', { method: 'POST', body: state.candidate },
          bytes => parseExistingUpdatePlan(bytes, state.databaseIdentity, before.program, state.candidateProgram));
        const repeated = await snapshot(); authorityFor(state, authority);
        if (!same(before, repeated)) fail('STATE_CHANGED_DURING_INSPECTION');
        if (!same(previous?.[0] ?? null, inventory()?.[0] ?? null)) fail('RECORD_CHANGED');
        const value = { binding: bound, before, plan, predecessorDigest: previous?.[0] ?? null,
          predecessorReceiptDigest: previous ? updateDigest(previous[1].completion ?? previous[1]['not-submitted']) : null,
          attemptId: randomBytes(32).toString('hex'), observedAt: now() };
        const digest = updateDigest(value); write(digest, 'inspection', { value });
        return binding(digest, inventory()[1]);
      } finally { state.active = false; }
    },
    reopenContinuation({ authority }) {
      authorityFor(state, authority); const head = inventory();
      if (!head) fail('INSPECTION_MISSING');
      return binding(...head);
    },
    async consumeContinuationEntry(value) {
      const request = input(value, ['claim', 'store', 'permit', 'sourceAuthority', 'kind', 'runId', 'runAttempt',
        'subject', 'evidenceDigest', 'receiptDigests', 'predecessorDigests', 'selection']);
      const chosen = select(request.selection, request.sourceAuthority);
      // Generic claim authority exists only for this direct synchronous call.
      assertSealedRealmsProductionContinuationClaim(claimArguments(request));
      if (request.kind !== `${state.lane}-update` || request.evidenceDigest !== chosen.digest) fail('CLAIM_INVALID');
      const execution = Object.freeze({ digest: chosen.digest });
      const assertActive = () => {
        authorityFor(state, request.sourceAuthority);
        if (state.execution !== execution) fail('EXECUTION_INVALID');
        select(request.selection, request.sourceAuthority);
      };
      if (state.active || chosen.entry.submission || chosen.entry.completion || chosen.entry['not-submitted']) fail('ALREADY_CONSUMED');
      state.active = true; state.execution = execution; let submissionWritten = false;
      try {
        const actual = await snapshot(); assertActive();
        if (!same(actual, chosen.inspection.before)) fail('STATE_CHANGED_BEFORE_SUBMISSION');
        const head = select(request.selection, request.sourceAuthority);
        if (head.entry.submission || head.entry.completion) fail('ALREADY_CONSUMED');
        await attestSealedRealmsProductionWorkflowPermit({ permit: request.permit, sourceAuthority: request.sourceAuthority,
          phase: 'continuation-effect', runId: request.runId, runAttempt: request.runAttempt });
        assertActive();
        write(chosen.digest, 'submission', { claimRunId: request.runId, claimRunAttempt: Number(request.runAttempt), markedAt: now() });
        submissionWritten = true;
        await parsed(`?host_type=Js&policy=BreakClients&token=${chosen.inspection.plan.token}`,
          { method: 'PUT', body: state.candidate, beforeSend: async () => {
            await attestSealedRealmsProductionWorkflowPermit({ permit: request.permit, sourceAuthority: request.sourceAuthority,
              phase: 'continuation-effect', runId: request.runId, runAttempt: request.runAttempt });
            assertActive();
          } }, bytes => parseExistingUpdateSuccess(bytes, state.databaseIdentity));
        const after = await snapshot(); assertActive(); preserved(chosen.inspection, after);
        write(chosen.digest, 'completion', { after, observedAt: now(), outcome: 'observed-preserved-candidate' });
        return Object.freeze({ status: 'completed' });
      } catch (error) {
        // The fixed transport cannot submit before the durable marker. Reopen even
        // after a write acknowledgement was lost; a present marker is uncertain.
        if (!submissionWritten && !exists(chosen.digest, 'submission')) {
          write(chosen.digest, 'not-submitted', { outcome: 'module-update-not-submitted', observedAt: now(),
            claimRunId: request.runId, claimRunAttempt: Number(request.runAttempt) });
          throw error;
        }
        fail('OUTCOME_UNCERTAIN');
      } finally { state.active = false; state.execution = undefined; }
    },
    async reconcileContinuation(request) {
      const chosen = select(request.selection, request.sourceAuthority);
      const submitted = chosen.entry.submission;
      if (!submitted && !chosen.entry['not-submitted']) fail('OUTCOME_UNCERTAIN');
      const claimRunId = submitted?.claimRunId ?? chosen.entry['not-submitted'].claimRunId;
      const claimRunAttempt = submitted?.claimRunAttempt ?? chosen.entry['not-submitted'].claimRunAttempt;
      assertSealedRealmsProductionContinuationReconciliation({ reconciliation: request.reconciliation, store: request.store,
        sourceAuthority: request.sourceAuthority, kind: `${state.lane}-update`, ...request.selection,
        claimRunId, claimRunAttempt });
      if (chosen.entry['not-submitted']) return classifySealedRealmsProductionContinuationNoEffect({
        reconciliation: request.reconciliation, evidenceDigest: chosen.digest,
        observationDigest: updateDigest(chosen.entry['not-submitted']),
      });
      if (state.active) fail('BUSY'); state.active = true;
      try {
        const after = await snapshot(); authorityFor(state, request.sourceAuthority);
        preserved(chosen.inspection, after); select(request.selection, request.sourceAuthority);
        if (!chosen.entry.completion) write(chosen.digest, 'completion', { after, observedAt: now(), outcome: 'observed-preserved-candidate' });
        const terminal = read(chosen.digest, 'completion');
        return Object.freeze({ outcome: 'effect-applied', observationDigest: updateDigest(terminal) });
      } finally { state.active = false; }
    },
    inspectResult() {
      const head = inventory();
      return head?.[1].completion ? Object.freeze({ ...head[1].completion }) : undefined;
    },
    dispose() { state.disposed = true; state.candidate.fill(0); adapters.delete(adapter); },
  });
  adapters.set(adapter, state);
  return adapter;
}
export function assertSealedRealmsExistingUpdateAdapter(adapter, lane) {
  if (lane === 'ptr' && isPtrProductionExistingUpdateAdapter(adapter)) return adapter;
  if (lane === 'g002' && isG002ProductionExistingUpdateAdapter(adapter)) return adapter;
  if (!adapters.has(adapter) || adapters.get(adapter).lane !== lane) fail('ADAPTER_INVALID');
  return adapter;
}
