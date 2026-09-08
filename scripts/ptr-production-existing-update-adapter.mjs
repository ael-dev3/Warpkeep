import { randomBytes } from "node:crypto";
import { types } from "node:util";
import { assertPtrSourceBuiltArtifact } from "./ptr-production-publisher.mjs";
import {
  createPtrUpdateProviderCredentials,
  requestPtrUpdateProvider,
  disposePtrUpdateProviderCredentials,
} from "./ptr-update-provider-credentials.mjs";
import {
  comparePtrUpdateDefinitions,
  parsePtrUpdateDefinition,
} from "./ptr-update-definition-policy.mjs";
import { assertSealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import { sourceCommitFromSealedRealmsProductionAuthority } from "./sealed-realms-production-source-authority.mjs";
import {
  assertSealedRealmsProductionContinuationClaim,
  assertSealedRealmsProductionContinuationReconciliation,
  classifySealedRealmsProductionContinuationNoEffect,
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

const PROFILE = "warpkeep-ptr-production-existing-update-v1";
const TARGET =
  "c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e";
const DIRECTORY = `existing-updates-production-v1/ptr/${TARGET}`;
const adapters = new WeakMap();
const selections = new WeakMap();
const fail = () => {
  throw new Error("PTR_PRODUCTION_EXISTING_UPDATE_INVALID");
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

/** Real provider transport and private continuation records; no synthetic receipts. */
export function createPtrProductionExistingUpdateAdapter(input) {
  const { authority, privateState, artifact } = inputRecord(input, [
    "authority",
    "privateState",
    "artifact",
  ]);
  const sourceCommit =
    sourceCommitFromSealedRealmsProductionAuthority(authority);
  const built = assertPtrSourceBuiltArtifact(artifact);
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
      !["ptr-update-inspect", "ptr-update-apply"].includes(current.operation)
    )
      fail();
    assertPtrSourceBuiltArtifact(built);
  };
  assertAuthority(authority);
  const provider = createPtrUpdateProviderCredentials({ artifact: built });
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
  const path = (key, kind) => `${DIRECTORY}/${key}.${kind}.json`;
  const present = (key, kind) =>
    state.exists({ root: "runtime", relativePath: path(key, kind) });
  const read = (name) => {
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
  };
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
  const slot = (predecessorDigest) =>
    updateDigest({
      profile: PROFILE,
      databaseIdentity: TARGET,
      predecessorDigest,
    });
  const inventory = () => {
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
      const record = read(name);
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
      updateExact(value.binding, Object.keys(bound));
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
      const policy = comparePtrUpdateDefinitions({
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
  };
  const request = async (current, options, parse) => {
    assertAuthority(current);
    const response = await requestPtrUpdateProvider(provider, options);
    try {
      assertAuthority(current);
      return parse(response.bytes);
    } finally {
      response.bytes.fill(0);
    }
  };
  const schema = (current) =>
    request(current, { operation: "schema" }, (bytes) =>
      parsePtrUpdateDefinition(bytes),
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
    const value = freeze({
      subject: `ptr-update:${TARGET}`,
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
        const preservation = comparePtrUpdateDefinitions({
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
      assertSealedRealmsProductionContinuationClaim(claimFields(input));
      if (
        input.kind !== "ptr-update" ||
        input.evidenceDigest !== key ||
        busy ||
        entry.submission ||
        entry.completion ||
        entry["not-submitted"]
      )
        fail();
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
              const active = chosen(input.selection, input.sourceAuthority);
              if (
                active[1].submission ||
                active[1].completion ||
                active[1]["not-submitted"]
              )
                fail();
              write(key, "submission", key, {
                runId: input.runId,
                runAttempt: Number(input.runAttempt),
                observedAt: stamp(),
              });
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
        kind: "ptr-update",
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
      disposePtrUpdateProviderCredentials(provider);
      adapters.delete(adapter);
    },
  });
  adapters.set(adapter, true);
  return adapter;
}

export function isPtrProductionExistingUpdateAdapter(value) {
  return adapters.has(value);
}
