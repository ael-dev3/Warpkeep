import { createHash, randomBytes } from "node:crypto";
import * as observationTransport from './ptr-production-state-observation.mjs';
import * as signedObservations from '../services/release-recovery/src/ptrObservation.ts';
import { types } from "node:util";
import * as ptrPublisher from "./ptr-production-publisher.mjs";
import * as g002Publisher from "./genesis002-production-publisher.mjs";
import * as credentials from "./ptr-update-provider-credentials.mjs";
import * as definitions from "./ptr-update-definition-policy.mjs";
import { assertSealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import { sourceCommitFromSealedRealmsProductionAuthority } from "./sealed-realms-production-source-authority.mjs";
import {
  readSealedRealmsProductionContinuationClaimBinding,
  assertSealedRealmsProductionContinuationReconciliation,
  classifySealedRealmsProductionContinuationNoEffect,
  readSealedRealmsProductionContinuationCompletion,
} from "./sealed-realms-production-continuation.mjs";
import { attestSealedRealmsProductionWorkflowPermit } from "./sealed-realms-production-workflow-authority.mjs";
import {
  parseExistingUpdateJson,
  parseExistingUpdatePlan,
  parseExistingUpdateSuccess,
  updateCanonical,
  updateDigest,
  updateExact,
  UPDATE_HASH,
} from "./sealed-realms-existing-update-protocol.mjs";

/** Shared update mechanics; each fixed realm owns separate capability registries. */
function createRealmUpdateRuntime(fixed) {
  const { assertSourceBuiltArtifact, createProviderCredentials, requestProvider,
    disposeProviderCredentials, compareDefinitions, parseDefinition,
    requestUpdateObservation, verifyHistoricalUpdateObservation, verifyUpdateObservationPair } = fixed;
  const PROFILE = fixed.profile, TARGET = fixed.target, LANE = fixed.lane;
  const DIRECTORY = `existing-updates-production-v1/${LANE}/${TARGET}`;
  const adapters = new WeakMap();
  const completionCapabilities = new WeakMap();
  const adoptionCapabilities = new WeakMap();
  const OBSERVATION_DIRECTORY = `${fixed.observationDirectory}/${TARGET}`;
  const jwsDigest = compact => createHash('sha256').update(compact, 'utf8').digest('hex');
  const actualSeconds = () => Math.floor(Date.now() / 1000);
  const requireFresh = observation => {
    const now = actualSeconds();
    if (!Number.isSafeInteger(now) || now < 1 || now < observation.issuedAt || now >= observation.expiresAt) fail();
  };
  const selections = new WeakMap();
  const fail = () => {
    throw new Error(fixed.error);
  };
  const same = (a, b) => updateCanonical(a) === updateCanonical(b);
  const freeze = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const stamp = () => new Date().toISOString();
  const digest = (value) => {
    if (typeof value !== "string" || !UPDATE_HASH.test(value)) fail();
    return value;
  };
  const time = (value) => {
    if (
      typeof value !== "string" ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    )
      fail();
  };
  const claimFields = (value) =>
    Object.fromEntries(
      [
        "claim",
        "store",
        "sourceAuthority",
        "kind",
        "runId",
        "runAttempt",
        "subject",
        "evidenceDigest",
        "receiptDigests",
        "predecessorDigests",
      ].map((key) => [key, value[key]]),
    );
  const inputRecord = (value, keys) => {
    if (
      types.isProxy(value) ||
      !value ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      fail();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(descriptors).length !== keys.length ||
      keys.some(
        (key) =>
          !descriptors[key]?.enumerable ||
          !Object.hasOwn(descriptors[key], "value"),
      )
    )
      fail();
    return Object.freeze(
      Object.fromEntries(keys.map((key) => [key, descriptors[key].value])),
    );
  };
  const hostObservation = (value) => {
    if (
      !value ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      value.version !== "2.10.0" ||
      value.package_name !== "spacetimedb-cloud"
    )
      fail();
    return value;
  };

  const BINDING_KEYS = Object.freeze([
    'sourceCommit', 'databaseIdentity', 'candidateProgram', 'candidateSha256',
    'candidateDescriptionDigest', 'moduleTreeId', 'dependencyClosureDigest', 'cliDigest', 'cliConfigDigest',
  ]);

  function readUpdateRecord(state, name) {
    const bytes = state.read({
      root: "runtime",
      relativePath: `${DIRECTORY}/${name}`,
    });
    try {
      const value = updateExact(parseExistingUpdateJson(bytes), [
        "profile",
        "kind",
        "inspectionDigest",
        "value",
      ]);
      if (
        value.profile !== PROFILE ||
        !same(
          Buffer.from(`${updateCanonical(value)}\n`).toString(),
          bytes.toString(),
        )
      )
        fail();
      digest(value.inspectionDigest);
      return value;
    } finally {
      bytes.fill(0);
    }
  }

  const slot = (predecessorDigest) =>
    updateDigest({
      profile: PROFILE,
      databaseIdentity: TARGET,
      predecessorDigest,
    });
  function readUpdateInventory(state) {
    const records = new Map();
    for (const name of state.list({
      root: "runtime",
      relativeDirectory: DIRECTORY,
    })) {
      const match =
        /^([a-f0-9]{64})\.(inspection|submission|acknowledgement|completion|not-submitted)\.json$/u.exec(
          name,
        );
      if (!match) fail();
      const record = readUpdateRecord(state, name);
      if (record.kind !== match[2]) fail();
      if (!records.has(record.inspectionDigest))
        records.set(record.inspectionDigest, {});
      const entry = records.get(record.inspectionDigest);
      if (entry[record.kind]) fail();
      entry[record.kind] = record;
      if (record.kind === "inspection") {
        if (
          record.inspectionDigest !== updateDigest(record.value) ||
          match[1] !== slot(record.value.predecessorDigest)
        )
          fail();
      } else if (match[1] !== record.inspectionDigest) fail();
    }
    const used = new Set();
    for (const [key, entry] of records) {
      if (!entry.inspection) fail();
      const value = updateExact(entry.inspection.value, [
        "binding",
        "beforeProgram",
        "beforeDefinition",
        "candidateDefinition",
        "plan",
        "preservation",
        "hostObservation",
        "predecessorDigest",
        "predecessorReceiptDigest",
        "nonce",
        "observedAt",
      ]);
      updateExact(value.binding, BINDING_KEYS);
      if (
        !/^[a-f0-9]{40}$/u.test(value.binding.sourceCommit) ||
        !/^[a-f0-9]{40}$/u.test(value.binding.moduleTreeId) ||
        value.binding.databaseIdentity !== TARGET
      )
        fail();
      for (const field of [
        "candidateProgram",
        "candidateSha256",
        "candidateDescriptionDigest",
        "dependencyClosureDigest",
        "cliDigest",
        "cliConfigDigest",
      ])
        digest(value.binding[field]);
      digest(value.nonce);
      digest(value.beforeProgram);
      time(value.observedAt);
      hostObservation(value.hostObservation);
      const policy = compareDefinitions({
        priorServerSchema: Buffer.from(updateCanonical(value.beforeDefinition)),
        candidateArtifactDefinition: value.candidateDefinition,
      });
      if (
        !same(policy, value.preservation) ||
        policy.candidateDigest !== value.binding.candidateDescriptionDigest
      )
        fail();
      const checked = parseExistingUpdatePlan(
        Buffer.from(updateCanonical(value.plan.observation)),
        TARGET,
        value.beforeProgram,
        value.binding.candidateProgram,
      );
      if (!same(checked, value.plan)) fail();
      if (value.predecessorDigest !== null) {
        digest(value.predecessorDigest);
        digest(value.predecessorReceiptDigest);
        if (
          used.has(value.predecessorDigest) ||
          value.predecessorDigest === key
        )
          fail();
        used.add(value.predecessorDigest);
      } else if (value.predecessorReceiptDigest !== null) fail();
      if (
        entry["not-submitted"] &&
        (entry.submission || entry.acknowledgement || entry.completion)
      )
        fail();
      for (const kind of ["submission", "not-submitted"])
        if (entry[kind]) {
          const operation = updateExact(entry[kind].value, [
            "runId",
            "runAttempt",
            "observedAt",
          ]);
          if (
            !/^[1-9][0-9]{0,19}$/u.test(operation.runId) ||
            !Number.isSafeInteger(operation.runAttempt) ||
            operation.runAttempt < 1
          )
            fail();
          time(operation.observedAt);
        }
      if (entry.acknowledgement) {
        if (!entry.submission) fail();
        const ack = updateExact(entry.acknowledgement.value, [
          "response",
          "responseDigest",
          "observedAt",
        ]);
        if (
          parseExistingUpdateSuccess(
            Buffer.from(updateCanonical(ack.response)),
            TARGET,
          ) !== ack.responseDigest
        )
          fail();
        time(ack.observedAt);
      }
      if (entry.completion) {
        if (!entry.submission) fail();
        const terminal = updateExact(entry.completion.value, [
          "candidateProgram",
          "candidateDescriptionDigest",
          "installedPlan",
          "acknowledgement",
          "responseDigest",
          "observedAt",
        ]);
        if (
          terminal.candidateProgram !== value.binding.candidateProgram ||
          terminal.candidateDescriptionDigest !==
            value.binding.candidateDescriptionDigest
        )
          fail();
        const installed = parseExistingUpdatePlan(
          Buffer.from(updateCanonical(terminal.installedPlan.observation)),
          TARGET,
          terminal.candidateProgram,
          terminal.candidateProgram,
        );
        if (!same(installed, terminal.installedPlan)) fail();
        if (
          terminal.acknowledgement !==
            (entry.acknowledgement ? "received" : "not-received") ||
          terminal.responseDigest !==
            (entry.acknowledgement?.value.responseDigest ?? null)
        )
          fail();
        time(terminal.observedAt);
      }
    }
    for (const entry of records.values()) {
      const previous = entry.inspection.value.predecessorDigest;
      if (previous !== null) {
        const prior = records.get(previous),
          terminal = prior?.completion ?? prior?.["not-submitted"];
        if (
          !terminal ||
          updateDigest(terminal) !==
            entry.inspection.value.predecessorReceiptDigest
        )
          fail();
        const expectedProgram =
          prior.completion?.value.candidateProgram ??
          prior.inspection.value.beforeProgram;
        if (entry.inspection.value.beforeProgram !== expectedProgram) fail();
      }
    }
    const heads = [...records].filter(([key]) => !used.has(key));
    if (records.size && heads.length !== 1) fail();
    if (heads.length) {
      let key = heads[0][0];
      const visited = new Set();
      while (key !== null) {
        if (visited.has(key)) fail();
        visited.add(key);
        key = records.get(key).inspection.value.predecessorDigest;
      }
      if (visited.size !== records.size) fail();
    }
    return heads[0];
  }

  function continuationSelection(key, entry) {
    return freeze({
      subject: `${LANE}-update:${TARGET}`,
      evidenceDigest: key,
      receiptDigests: [entry.inspection.value.plan.planDigest],
      predecessorDigests:
        entry.inspection.value.predecessorDigest === null
          ? []
          : [
              entry.inspection.value.predecessorDigest,
              entry.inspection.value.predecessorReceiptDigest,
            ].sort(),
    });
  }

  function readCompletedUpdateEvidence(state, current, store, expectedBinding) {
    const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(current);
    if (current.mode !== 'S' || current.operation !== `${LANE}-update-apply`) fail();
    const head = readUpdateInventory(state);
    if (!head || !head[1].completion
      || head[1].inspection.value.binding.sourceCommit !== sourceCommit
      || (expectedBinding !== undefined && !same(head[1].inspection.value.binding, expectedBinding))) fail();
    const [key, entry] = head;
    const continuation = readSealedRealmsProductionContinuationCompletion({
      store, privateState: state, sourceAuthority: current, kind: `${LANE}-update`,
      ...continuationSelection(key, entry),
    });
    if (continuation.claimRunId !== entry.submission.value.runId
      || continuation.claimRunAttempt !== entry.submission.value.runAttempt
      || Date.parse(continuation.terminalAt) < Date.parse(entry.completion.value.observedAt)
      || (continuation.outcome === 'reconciled-effect-applied'
        && continuation.observationDigest !== updateDigest(entry.completion))) fail();
    const inspection = entry.inspection.value;
    return freeze({
      schemaVersion: 1,
      profile: fixed.receiptProfile,
      binding: Object.fromEntries(BINDING_KEYS.map(field => [field, entry.inspection.value.binding[field]])),
      inspectionDigest: key,
      inspectionRecordDigest: updateDigest(entry.inspection),
      submissionRecordDigest: updateDigest(entry.submission),
      acknowledgementRecordDigest: entry.acknowledgement ? updateDigest(entry.acknowledgement) : null,
      completionRecordDigest: updateDigest(entry.completion),
      predecessorDigest: inspection.predecessorDigest,
      predecessorReceiptDigest: inspection.predecessorReceiptDigest,
      beforeProgram: inspection.beforeProgram,
      preservation: structuredClone(inspection.preservation),
      planDigest: inspection.plan.planDigest,
      installedPlanDigest: entry.completion.value.installedPlan.planDigest,
      inspectionHostObservationDigest: updateDigest(inspection.hostObservation),
      acknowledgement: entry.completion.value.acknowledgement,
      responseDigest: entry.completion.value.responseDigest,
      submission: structuredClone(entry.submission.value),
      completionObservedAt: entry.completion.value.observedAt,
      continuation: structuredClone(continuation),
    });
  }

  /** Real provider transport and private continuation records; no synthetic receipts. */
  function createAdapter(input) {
    const { authority, privateState, artifact, observation } = inputRecord(input, [
      "authority",
      "privateState",
      "artifact",
      "observation",
    ]);
    const observationConfiguration = inputRecord(observation, ['sourceTree', 'runId', 'runAttempt']);
    if (Object.values(observationConfiguration).some(value => typeof value !== 'string')
      || !/^[a-f0-9]{40}$/u.test(observationConfiguration.sourceTree)
      || !/^[1-9][0-9]{0,19}$/u.test(observationConfiguration.runId)
      || !/^[1-9][0-9]{0,3}$/u.test(observationConfiguration.runAttempt)
      || Number(observationConfiguration.runAttempt) > 1000) fail();
    const sourceCommit =
      sourceCommitFromSealedRealmsProductionAuthority(authority);
    const built = assertSourceBuiltArtifact(artifact);
    const state = assertSealedRealmsProductionPrivateState(privateState);
    if (
      built.sourceCommit !== sourceCommit ||
      !UPDATE_HASH.test(built.moduleProgramHash)
    )
      fail();
    let disposed = false,
      busy = false,
      execution;
    const assertAuthority = (current) => {
      if (
        disposed ||
        sourceCommitFromSealedRealmsProductionAuthority(current) !==
          sourceCommit ||
        current.mode !== "S" ||
        ![`${LANE}-update-inspect`, `${LANE}-update-apply`].includes(current.operation)
      )
        fail();
      assertSourceBuiltArtifact(built);
    };
    assertAuthority(authority);
    const provider = createProviderCredentials({ artifact: built });
    const bound = freeze({
      sourceCommit,
      databaseIdentity: TARGET,
      candidateProgram: built.moduleProgramHash,
      candidateSha256: built.moduleSha256,
      candidateDescriptionDigest: built.artifactDescription.descriptionSha256,
      moduleTreeId: built.moduleTreeId,
      dependencyClosureDigest: built.dependencyClosureDigest,
      cliDigest: built.spacetimeExecutableSha256,
      cliConfigDigest: built.spacetimeCliConfigSha256,
    });
    const observationPath = (claimRecordDigest, phase) => {
      digest(claimRecordDigest);
      if (!['pre', 'post'].includes(phase)) fail();
      return { root: 'runtime', relativePath: `${OBSERVATION_DIRECTORY}/${claimRecordDigest}.${phase}.json` };
    };
    const readObservationBytes = (claimRecordDigest, phase) => {
      const bytes = state.read(observationPath(claimRecordDigest, phase));
      try {
        if (bytes.length > 32768) fail();
        const record = updateExact(parseExistingUpdateJson(bytes), ['profile', 'compact']);
        if (record.profile !== fixed.observationProfile
          || typeof record.compact !== 'string' || record.compact.length > 24576
          || bytes.toString('utf8') !== `${updateCanonical(record)}\n`) fail();
        return record.compact;
      } finally { bytes.fill(0); }
    };
    const writeObservation = (claimRecordDigest, phase, compact) => {
      const location = observationPath(claimRecordDigest, phase);
      const bytes = Buffer.from(`${updateCanonical({ profile: fixed.observationProfile, compact })}\n`);
      try {
        if (!state.exists(location)) {
          try { state.write({ ...location, bytes }); }
          catch (error) {
            if (error?.code !== 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') throw error;
          }
        }
        if (readObservationBytes(claimRecordDigest, phase) !== compact) fail();
      } finally { bytes.fill(0); }
    };
    const commonContext = (key, entry, claim) => freeze({
      bindingDigest: updateDigest(bound), inspectionDigest: key,
      inspectionRecordDigest: updateDigest(entry.inspection),
      predecessorDigest: entry.inspection.value.predecessorDigest,
      predecessorReceiptDigest: entry.inspection.value.predecessorReceiptDigest,
      beforeProgram: entry.inspection.value.beforeProgram, candidateProgram: bound.candidateProgram,
      scopeDigest: claim.scopeDigest, issuedRecordDigest: claim.issuedRecordDigest,
      claimRecordDigest: claim.claimRecordDigest, claimRunId: claim.claimRunId,
      claimRunAttempt: String(claim.claimRunAttempt),
    });
    const validateObservation = async (compact, context, fresh = false) => {
      const value = await verifyHistoricalUpdateObservation(compact);
      if (value.identity.sourceCommit !== sourceCommit
        || value.identity.sourceTree !== observationConfiguration.sourceTree || !same(value.context, context)) fail();
      if (fresh) requireFresh(value);
      return value;
    };
    const observationReattester = (current, permit, runId, runAttempt) => async () => {
      assertAuthority(current);
      if (current.operation !== `${LANE}-update-apply`
        || runId !== observationConfiguration.runId || String(runAttempt) !== observationConfiguration.runAttempt) fail();
      await attestSealedRealmsProductionWorkflowPermit({ permit, sourceAuthority: current,
        phase: `${LANE}-update-observation`, runId, runAttempt });
      assertAuthority(current);
    };
    const path = (key, kind) => `${DIRECTORY}/${key}.${kind}.json`;
    const present = (key, kind) =>
      state.exists({ root: "runtime", relativePath: path(key, kind) });
    const read = (name) => readUpdateRecord(state, name);
    const write = (key, kind, inspectionDigest, value) => {
      const bytes = Buffer.from(
        `${updateCanonical({ profile: PROFILE, kind, inspectionDigest, value })}\n`,
      );
      try {
        state.write({ root: "runtime", relativePath: path(key, kind), bytes });
        const reopened = read(`${key}.${kind}.json`);
        if (!same(reopened.value, value)) fail();
        return reopened;
      } finally {
        bytes.fill(0);
      }
    };
    const inventory = () => readUpdateInventory(state);
    const request = async (current, options, parse) => {
      assertAuthority(current);
      const response = await requestProvider(provider, options);
      try {
        assertAuthority(current);
        return parse(response.bytes);
      } finally {
        response.bytes.fill(0);
      }
    };
    const schema = (current) =>
      request(current, { operation: "schema" }, (bytes) =>
        parseDefinition(bytes),
      );
    // Deployment health is an observed compatibility signal, not replica attestation.
    const observeSupportedHost = (current) =>
      request(current, { operation: "health" }, (bytes) =>
        hostObservation(parseExistingUpdateJson(bytes)),
      );
    const migration = (current, prior) =>
      request(current, { operation: "plan" }, (bytes) =>
        parseExistingUpdatePlan(bytes, TARGET, prior, bound.candidateProgram),
      );
    const select = (key, entry) => {
      if (!same(entry.inspection.value.binding, bound)) fail();
      const value = continuationSelection(key, entry);
      selections.set(value, { adapter, key });
      return value;
    };
    const chosen = (selection, current) => {
      assertAuthority(current);
      const item = selections.get(selection),
        head = inventory();
      if (
        !item ||
        item.adapter !== adapter ||
        !head ||
        item.key !== head[0] ||
        !same(head[1].inspection.value.binding, bound)
      )
        fail();
      return head;
    };
    const installed = async (current) => {
      await observeSupportedHost(current);
      const observed = await schema(current);
      if (observed.fullDigest !== bound.candidateDescriptionDigest) fail();
      const proof = await migration(current, bound.candidateProgram);
      const repeated = await schema(current);
      if (repeated.fullDigest !== observed.fullDigest) fail();
      return proof;
    };
    const complete = async (key, current) => {
      const installedPlan = await installed(current);
      const head = inventory();
      if (!head || head[0] !== key) fail();
      if (head[1].completion) return head[1].completion;
      const acknowledgement = head[1].acknowledgement;
      return write(key, "completion", key, {
        candidateProgram: bound.candidateProgram,
        candidateDescriptionDigest: bound.candidateDescriptionDigest,
        installedPlan,
        acknowledgement: acknowledgement ? "received" : "not-received",
        responseDigest: acknowledgement?.value.responseDigest ?? null,
        observedAt: stamp(),
      });
    };
    const adapter = Object.freeze({
      async inspectForContinuation({ authority: current }) {
        assertAuthority(current);
        if (busy) fail();
        busy = true;
        try {
          const prior = inventory();
          if (prior && !prior[1].completion && !prior[1]["not-submitted"])
            return select(...prior);
          const health = await request(
            current,
            { operation: "health" },
            parseExistingUpdateJson,
          );
          hostObservation(health);
          const metadata = await request(
            current,
            { operation: "metadata" },
            parseExistingUpdateJson,
          );
          updateExact(metadata, [
            "database_identity",
            "owner_identity",
            "host_type",
            "initial_program",
          ]);
          if (
            !same(metadata.database_identity, { __identity__: `0x${TARGET}` }) ||
            !same(metadata.host_type, { Js: [] }) ||
            !/^0x[a-f0-9]{64}$/u.test(metadata.initial_program)
          )
            fail();
          const beforeProgram =
            prior?.[1].completion?.value.candidateProgram ??
            prior?.[1].inspection.value.beforeProgram ??
            metadata.initial_program.slice(2);
          if (beforeProgram === bound.candidateProgram) fail();
          const before = await schema(current);
          const preservation = compareDefinitions({
            priorServerSchema: Buffer.from(updateCanonical(before.definition)),
            candidateArtifactDefinition: built.artifactDescription.definition,
          });
          const plan = await migration(current, beforeProgram);
          if (
            (await schema(current)).fullDigest !== before.fullDigest ||
            (inventory()?.[0] ?? null) !== (prior?.[0] ?? null)
          )
            fail();
          const value = {
            binding: bound,
            beforeProgram,
            beforeDefinition: before.definition,
            candidateDefinition: built.artifactDescription.definition,
            plan,
            preservation,
            hostObservation: health,
            predecessorDigest: prior?.[0] ?? null,
            predecessorReceiptDigest: prior
              ? updateDigest(prior[1].completion ?? prior[1]["not-submitted"])
              : null,
            nonce: randomBytes(32).toString("hex"),
            observedAt: stamp(),
          };
          const key = updateDigest(value);
          write(slot(value.predecessorDigest), "inspection", key, value);
          return select(...inventory());
        } finally {
          busy = false;
        }
      },
      reopenContinuation({ authority: current }) {
        assertAuthority(current);
        const head = inventory();
        if (!head) fail();
        return select(...head);
      },
      async consumeContinuationEntry(value) {
        const input = inputRecord(value, [
          "claim",
          "store",
          "permit",
          "sourceAuthority",
          "kind",
          "runId",
          "runAttempt",
          "subject",
          "evidenceDigest",
          "receiptDigests",
          "predecessorDigests",
          "selection",
        ]);
        const [key, entry] = chosen(input.selection, input.sourceAuthority);
        const claimBinding = readSealedRealmsProductionContinuationClaimBinding(claimFields(input));
        if (
          input.kind !== `${LANE}-update` ||
          input.evidenceDigest !== key ||
          busy ||
          entry.submission ||
          entry.completion ||
          entry["not-submitted"]
        )
          fail();
        if (input.runId !== observationConfiguration.runId
          || String(input.runAttempt) !== observationConfiguration.runAttempt) fail();
        busy = true;
        const lease = Object.freeze({ key });
        execution = lease;
        try {
          if (
            (await schema(input.sourceAuthority)).fullDigest !==
            entry.inspection.value.preservation.priorDigest
          )
            fail();
          if (
            !same(
              await migration(
                input.sourceAuthority,
                entry.inspection.value.beforeProgram,
              ),
              entry.inspection.value.plan,
            )
          )
            fail();
          await observeSupportedHost(input.sourceAuthority);
          const context = freeze({ ...commonContext(key, entry, claimBinding), phase: 'pre' });
          const location = observationPath(claimBinding.claimRecordDigest, 'pre');
          const reattest = observationReattester(input.sourceAuthority, input.permit, input.runId, input.runAttempt);
          let preCompact;
          if (state.exists(location)) {
            preCompact = readObservationBytes(claimBinding.claimRecordDigest, 'pre');
          } else {
            const observed = await requestUpdateObservation({ reattest, sourceCommit,
              ...observationConfiguration, context });
            preCompact = observed.compact;
            const pre = await validateObservation(preCompact, context, true);
            await reattest();
            requireFresh(pre);
            if (execution !== lease || Date.now() < Date.parse(claimBinding.claimedAt)
              || Date.now() >= Date.parse(claimBinding.expiresAt)) fail();
            writeObservation(claimBinding.claimRecordDigest, 'pre', preCompact);
          }
          const response = await request(
            input.sourceAuthority,
            {
              operation: "apply",
              migrationToken: entry.inspection.value.plan.token,
              beforeSend: async () => {
                await attestSealedRealmsProductionWorkflowPermit({
                  permit: input.permit,
                  sourceAuthority: input.sourceAuthority,
                  phase: "continuation-effect",
                  runId: input.runId,
                  runAttempt: input.runAttempt,
                });
                if (execution !== lease) fail();
                if (readObservationBytes(claimBinding.claimRecordDigest, 'pre') !== preCompact) fail();
                const pre = await validateObservation(preCompact, context, true);
                assertAuthority(input.sourceAuthority);
                if (execution !== lease) fail();
                requireFresh(pre);
                if (Date.now() < Date.parse(claimBinding.claimedAt)
                  || Date.now() >= Date.parse(claimBinding.expiresAt)) fail();
                const active = chosen(input.selection, input.sourceAuthority);
                if (
                  active[1].submission ||
                  active[1].completion ||
                  active[1]["not-submitted"]
                )
                  fail();
                if (readObservationBytes(claimBinding.claimRecordDigest, 'pre') !== preCompact) fail();
                requireFresh(pre);
                if (Date.now() >= Date.parse(claimBinding.expiresAt)) fail();
                write(key, "submission", key, {
                  runId: input.runId,
                  runAttempt: Number(input.runAttempt),
                  observedAt: stamp(),
                });
                requireFresh(pre);
                if (Date.now() >= Date.parse(claimBinding.expiresAt)) fail();
              },
            },
            (bytes) => ({
              response: parseExistingUpdateJson(bytes),
              responseDigest: parseExistingUpdateSuccess(bytes, TARGET),
            }),
          );
          write(key, "acknowledgement", key, {
            ...response,
            observedAt: stamp(),
          });
          await complete(key, input.sourceAuthority);
          return Object.freeze({ status: "completed" });
        } catch {
          if (!present(key, "submission"))
            write(key, "not-submitted", key, {
              runId: input.runId,
              runAttempt: Number(input.runAttempt),
              observedAt: stamp(),
            });
          fail();
        } finally {
          execution = undefined;
          busy = false;
        }
      },
      async reconcileContinuation(value) {
        const input = inputRecord(value, [
          "reconciliation",
          "store",
          "sourceAuthority",
          "selection",
        ]);
        const [key, entry] = chosen(input.selection, input.sourceAuthority),
          operation = entry.submission ?? entry["not-submitted"];
        if (!operation || busy) fail();
        assertSealedRealmsProductionContinuationReconciliation({
          reconciliation: input.reconciliation,
          store: input.store,
          sourceAuthority: input.sourceAuthority,
          kind: `${LANE}-update`,
          ...input.selection,
          claimRunId: operation.value.runId,
          claimRunAttempt: operation.value.runAttempt,
        });
        if (entry["not-submitted"])
          return classifySealedRealmsProductionContinuationNoEffect({
            reconciliation: input.reconciliation,
            evidenceDigest: key,
            observationDigest: updateDigest(entry["not-submitted"]),
          });
        busy = true;
        try {
          const terminal = await complete(key, input.sourceAuthority);
          return Object.freeze({
            outcome: "effect-applied",
            observationDigest: updateDigest(terminal),
          });
        } finally {
          busy = false;
        }
      },
      inspectResult() {
        if (disposed) fail();
        const head = inventory();
        if (head && !same(head[1].inspection.value.binding, bound)) fail();
        return head?.[1].completion
          ? freeze(structuredClone(head[1].completion.value))
          : undefined;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeProviderCredentials(provider);
        adapters.delete(adapter);
      },
    });
    const completedEvidence = (current, store) => {
      assertAuthority(current);
      if (busy) fail();
      return readCompletedUpdateEvidence(state, current, store, bound);
    };
    const adoptionContext = receipt => freeze({
      bindingDigest: updateDigest(receipt.binding), inspectionDigest: receipt.inspectionDigest,
      inspectionRecordDigest: receipt.inspectionRecordDigest, predecessorDigest: receipt.predecessorDigest,
      predecessorReceiptDigest: receipt.predecessorReceiptDigest, beforeProgram: receipt.beforeProgram,
      candidateProgram: receipt.binding.candidateProgram, scopeDigest: receipt.continuation.scopeDigest,
      issuedRecordDigest: receipt.continuation.issuedRecordDigest, claimRecordDigest: receipt.continuation.claimRecordDigest,
      claimRunId: receipt.continuation.claimRunId, claimRunAttempt: String(receipt.continuation.claimRunAttempt),
    });
    const postContext = (receipt, preCompact) => freeze({ ...adoptionContext(receipt), phase: 'post',
      preObservationJwsSha256: jwsDigest(preCompact), completionReceiptDigest: updateDigest(receipt),
      completionRecordDigest: receipt.completionRecordDigest, terminalRecordDigest: receipt.continuation.terminalRecordDigest,
      terminalRunId: receipt.continuation.terminalRunId, terminalRunAttempt: String(receipt.continuation.terminalRunAttempt),
      terminalOutcome: receipt.continuation.outcome, terminalAt: receipt.continuation.terminalAt });
    const readAdoption = async (current, store) => {
      const receipt = completedEvidence(current, store), claimDigest = receipt.continuation.claimRecordDigest;
      const preCompact = readObservationBytes(claimDigest, 'pre'), postCompact = readObservationBytes(claimDigest, 'post');
      const pair = await verifyUpdateObservationPair(preCompact, postCompact);
      if (!same(pair.pre.context, { ...adoptionContext(receipt), phase: 'pre' })
        || !same(pair.post.context, postContext(receipt, preCompact))
        || [pair.pre, pair.post].some(value => value.identity.sourceCommit !== sourceCommit
          || value.identity.sourceTree !== observationConfiguration.sourceTree)
        || pair.pre.identity.runId !== receipt.continuation.claimRunId
        || pair.pre.identity.runAttempt !== String(receipt.continuation.claimRunAttempt)
        || pair.pre.observation.observedThrough * 1000 > Date.parse(receipt.submission.observedAt)
        || pair.post.observation.observedFrom * 1000 < Date.parse(receipt.continuation.terminalAt)) fail();
      if (!same(receipt, completedEvidence(current, store))
        || preCompact !== readObservationBytes(claimDigest, 'pre')
        || postCompact !== readObservationBytes(claimDigest, 'post')) fail();
      return freeze({ schemaVersion: fixed.adoptionSchemaVersion, profile: fixed.adoptionProfile,
        sourceCommit, sourceTree: observationConfiguration.sourceTree, completionReceipt: receipt,
        preObservationJws: preCompact, postObservationJws: postCompact });
    };
    let capturingAdoption = false;
    const captureAdoption = async (current, store, permit, runId, runAttempt) => {
      if (capturingAdoption) fail();
      capturingAdoption = true;
      try {
        const receipt = completedEvidence(current, store), claimDigest = receipt.continuation.claimRecordDigest;
        // A committed effect without its original pre statement cannot be adopted.
        const preCompact = readObservationBytes(claimDigest, 'pre');
        await validateObservation(preCompact, { ...adoptionContext(receipt), phase: 'pre' });
        if (state.exists(observationPath(claimDigest, 'post'))) return await readAdoption(current, store);
        const context = postContext(receipt, preCompact);
        const reattest = observationReattester(current, permit, runId, runAttempt);
        // Bridge times are whole seconds; wait for the first representable instant
        // after the authentic millisecond terminal, without changing either time.
        const delay = Math.ceil(Date.parse(receipt.continuation.terminalAt) / 1000) * 1000 - Date.now();
        if (!Number.isFinite(delay) || delay > 1000) fail();
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        await reattest();
        const observed = await requestUpdateObservation({ reattest, sourceCommit,
          sourceTree: observationConfiguration.sourceTree, runId, runAttempt: String(runAttempt), context,
          preObservationJws: preCompact });
        const post = await validateObservation(observed.compact, context, true);
        await verifyUpdateObservationPair(preCompact, observed.compact);
        await reattest();
        if (!same(receipt, completedEvidence(current, store))
          || preCompact !== readObservationBytes(claimDigest, 'pre')
          || post.observation.observedFrom * 1000 < Date.parse(receipt.continuation.terminalAt)) fail();
        requireFresh(post);
        writeObservation(claimDigest, 'post', observed.compact);
        return await readAdoption(current, store);
      } finally { capturingAdoption = false; }
    };
    adapters.set(adapter, { privateState: state, completedEvidence, captureAdoption, readAdoption });
    return adapter;
  }

  function isAdapter(value) {
    return adapters.has(value);
  }

  /** Reopens retained update/continuation data without creating provider or effect authority. */
  function readCompletionFromPrivateState(input) {
    const { authority, privateState, store } = inputRecord(input, ['authority', 'privateState', 'store']);
    const state = assertSealedRealmsProductionPrivateState(privateState);
    return readCompletedUpdateEvidence(state, authority, store);
  }

  /** Grants access only to one reopened completed update and its real terminal lineage. */
  function exportCompletion(input) {
    const { adapter, authority, store } = inputRecord(input, ['adapter', 'authority', 'store']);
    const owner = adapters.get(adapter);
    if (!owner) fail();
    const receipt = owner.completedEvidence(authority, store);
    const capability = Object.freeze({});
    completionCapabilities.set(capability, { adapter, owner, authority, store, receiptDigest: updateDigest(receipt) });
    return capability;
  }

  /** Internal writer data access; a copied object, foreign store or disposed owner grants nothing. */
  function readCompletion(input) {
    const { completion, authority, privateState } = inputRecord(input, ['completion', 'authority', 'privateState']);
    const member = completionCapabilities.get(completion);
    if (!member || adapters.get(member.adapter) !== member.owner
      || assertSealedRealmsProductionPrivateState(privateState) !== member.owner.privateState) fail();
    const receipt = member.owner.completedEvidence(authority, member.store);
    if (updateDigest(receipt) !== member.receiptDigest) fail();
    return receipt;
  }

  /** Post-terminal capture only; this capability carries validated data, never effect authority. */
  async function captureAdoption(input) {
    const { adapter, authority, store, permit, runId, runAttempt } = inputRecord(input,
      ['adapter', 'authority', 'store', 'permit', 'runId', 'runAttempt']);
    const owner = adapters.get(adapter);
    if (!owner) fail();
    const envelope = await owner.captureAdoption(authority, store, permit, runId, runAttempt);
    if (adapters.get(adapter) !== owner) fail();
    const adoption = Object.freeze({});
    adoptionCapabilities.set(adoption, { adapter, owner, store, digest: updateDigest(envelope) });
    return adoption;
  }

  async function readAdoption(input) {
    const { adoption, authority, privateState } = inputRecord(input, ['adoption', 'authority', 'privateState']);
    const member = adoptionCapabilities.get(adoption);
    if (!member || adapters.get(member.adapter) !== member.owner
      || assertSealedRealmsProductionPrivateState(privateState) !== member.owner.privateState) fail();
    const envelope = await member.owner.readAdoption(authority, member.store);
    if (adapters.get(member.adapter) !== member.owner || updateDigest(envelope) !== member.digest) fail();
    return envelope;
  }
  return Object.freeze({ createAdapter, isAdapter, readCompletionFromPrivateState, exportCompletion, readCompletion, captureAdoption, readAdoption });
}

const ptrRuntime = createRealmUpdateRuntime(Object.freeze({
  lane: 'ptr', target: 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
  profile: 'warpkeep-ptr-production-existing-update-v1', error: 'PTR_PRODUCTION_EXISTING_UPDATE_INVALID',
  receiptProfile: 'warpkeep-ptr-existing-update-receipt-v1',
  observationDirectory: 'ptr-update-observation-v4',
  observationProfile: 'warpkeep-ptr-update-observation-sidecar-v1',
  adoptionSchemaVersion: 4, adoptionProfile: 'warpkeep-ptr-existing-state-adoption-v1',
  assertSourceBuiltArtifact: value => ptrPublisher.assertPtrSourceBuiltArtifact(value),
  createProviderCredentials: value => credentials.createPtrUpdateProviderCredentials(value),
  requestProvider: (...args) => credentials.requestPtrUpdateProvider(...args),
  disposeProviderCredentials: value => credentials.disposePtrUpdateProviderCredentials(value),
  compareDefinitions: value => definitions.comparePtrUpdateDefinitions(value),
  parseDefinition: value => definitions.parsePtrUpdateDefinition(value),
  requestUpdateObservation: value => observationTransport.requestPtrProductionUpdateObservation(value),
  verifyHistoricalUpdateObservation: value => signedObservations.verifyHistoricalPtrUpdateObservation(value),
  verifyUpdateObservationPair: (...args) => signedObservations.verifyPtrUpdateObservationPair(...args),
}));
const g002Runtime = createRealmUpdateRuntime(Object.freeze({
  lane: 'g002', target: 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
  profile: 'warpkeep-g002-production-existing-update-v1', error: 'G002_PRODUCTION_EXISTING_UPDATE_INVALID',
  receiptProfile: 'warpkeep-g002-existing-update-receipt-v1',
  observationDirectory: 'g002-update-observation-v1',
  observationProfile: 'warpkeep-g002-update-observation-sidecar-v1',
  adoptionSchemaVersion: 1, adoptionProfile: 'warpkeep-g002-existing-state-adoption-v1',
  assertSourceBuiltArtifact: value => g002Publisher.assertGenesis002SourceBuiltArtifact(value),
  createProviderCredentials: value => credentials.createG002UpdateProviderCredentials(value),
  requestProvider: (...args) => credentials.requestG002UpdateProvider(...args),
  disposeProviderCredentials: value => credentials.disposeG002UpdateProviderCredentials(value),
  compareDefinitions: value => definitions.compareG002UpdateDefinitions(value),
  parseDefinition: value => definitions.parseG002UpdateDefinition(value),
  requestUpdateObservation: value => observationTransport.requestG002ProductionUpdateObservation(value),
  verifyHistoricalUpdateObservation: value => signedObservations.verifyHistoricalG002UpdateObservation(value),
  verifyUpdateObservationPair: (...args) => signedObservations.verifyG002UpdateObservationPair(...args),
}));
export function createPtrProductionExistingUpdateAdapter(...args) { return ptrRuntime.createAdapter(...args); }
export function isPtrProductionExistingUpdateAdapter(...args) { return ptrRuntime.isAdapter(...args); }
export function readPtrExistingUpdateCompletionFromPrivateState(...args) { return ptrRuntime.readCompletionFromPrivateState(...args); }
export function exportPtrExistingUpdateCompletion(...args) { return ptrRuntime.exportCompletion(...args); }
export function readPtrExistingUpdateCompletion(...args) { return ptrRuntime.readCompletion(...args); }
export function capturePtrExistingUpdateAdoption(...args) { return ptrRuntime.captureAdoption(...args); }
export function readPtrExistingStateAdoption(...args) { return ptrRuntime.readAdoption(...args); }
export function createG002ProductionExistingUpdateAdapter(...args) {
  try { return g002Runtime.createAdapter(...args); }
  catch { throw new Error('G002_PRODUCTION_EXISTING_UPDATE_INVALID'); }
}
export function isG002ProductionExistingUpdateAdapter(...args) { return g002Runtime.isAdapter(...args); }
export function readG002ExistingUpdateCompletionFromPrivateState(...args) { return g002Runtime.readCompletionFromPrivateState(...args); }
export function exportG002ExistingUpdateCompletion(...args) { return g002Runtime.exportCompletion(...args); }
export function readG002ExistingUpdateCompletion(...args) { return g002Runtime.readCompletion(...args); }
export function captureG002ExistingUpdateAdoption(...args) { return g002Runtime.captureAdoption(...args); }
export function readG002ExistingStateAdoption(...args) { return g002Runtime.readAdoption(...args); }
