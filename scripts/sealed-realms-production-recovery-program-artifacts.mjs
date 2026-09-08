import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { types } from "node:util";
import { derivePreparedGenesisProgramArtifacts } from "./local-binding-runtime.mjs";
import { assertRecoverySourceClosureSnapshot } from "./recovery-source-closure.mjs";
import { assertSealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import { sourceCommitFromSealedRealmsProductionAuthority } from "./sealed-realms-production-source-authority.mjs";
import {
  assertSealedRealmsProductionActivationRecordsAuthority,
  readSealedRealmsProductionRecoveryCandidateRecords,
} from "./sealed-realms-production-activation-records.mjs";
const owners = new WeakMap();
const BASELINE = "2ae51984e1fa6ce5b0028c1a250359fed79d819b";
const FROZEN_TREE = "90deebb5faf4129282f5c35999244f540001b27d";
const fail = () => {
  throw Error("SEALED_REALMS_RECOVERY_PROGRAM_ARTIFACTS_INVALID");
};
function capture(input, keys) {
  if (
    types.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    fail();
  const d = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(d).length !== keys.length) fail();
  return Object.fromEntries(
    keys.map((key) => {
      if (!d[key]?.enumerable || !Object.hasOwn(d[key], "value")) fail();
      return [key, d[key].value];
    }),
  );
}
function owner(privateState, authority) {
  assertSealedRealmsProductionPrivateState(privateState);
  const commit = sourceCommitFromSealedRealmsProductionAuthority(authority);
  if (
    authority.mode !== "S" ||
    authority.operation !== "activation-evidence-generate"
  )
    fail();
  return commit;
}
function treeAt(root, commit) {
  const nullPath =
    process.platform === "win32"
      ? "NUL"
      : String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108);
  const tree = execFileSync(
    process.platform === "win32"
      ? "git"
      : String.fromCodePoint(
          47,
          117,
          115,
          114,
          47,
          98,
          105,
          110,
          47,
          103,
          105,
          116,
        ),
    [
      "--no-replace-objects",
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "rev-parse",
      "--verify",
      `${commit}^{tree}`,
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 128,
      timeout: 10000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: nullPath,
        GIT_CONFIG_SYSTEM: nullPath,
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_TERMINAL_PROMPT: "0",
        LANG: "C",
        LC_ALL: "C",
      },
    },
  );
  if (!/^[a-f0-9]{40}\n$/u.test(tree)) fail();
  return tree.slice(0, -1);
}
function attest(state) {
  if (
    owner(state.privateState, state.authority) !== state.commit ||
    process.cwd() !== state.root ||
    realpathSync(new URL("..", import.meta.url)) !== state.root
  )
    fail();
  assertRecoverySourceClosureSnapshot({
    repositoryRoot: state.root,
    sourceCommit: state.commit,
    sourceTree: state.tree,
  });
}
function artifact(input, realm, state) {
  const value = capture(input, [
    "profile",
    "realm",
    "sourceCommit",
    "sourceTree",
    "moduleSourceCommit",
    "moduleTreeId",
    "dependencyClosureDigest",
    "nodeVersion",
    "programArtifactSha256",
    "programHashAlgorithm",
    "programKeccak256",
    "artifactBytes",
    "artifactBase64",
  ]);
  if (
    value.profile !== "warpkeep-local-program-artifact-v1" ||
    value.realm !== realm ||
    value.sourceCommit !== state.commit ||
    value.sourceTree !== state.tree ||
    value.moduleSourceCommit !==
      (realm === "genesis001" ? BASELINE : state.commit) ||
    !/^[a-f0-9]{40}$/u.test(value.moduleTreeId) ||
    (realm === "genesis001" && value.moduleTreeId !== FROZEN_TREE) ||
    value.nodeVersion !== (realm === "genesis001" ? "24.19.0" : "22.22.3") ||
    ![
      value.programArtifactSha256,
      value.dependencyClosureDigest,
      value.programKeccak256,
    ].every((x) => typeof x === "string" && /^[a-f0-9]{64}$/u.test(x)) ||
    value.programHashAlgorithm !== "keccak-256" ||
    !Number.isSafeInteger(value.artifactBytes) ||
    value.artifactBytes < 1 ||
    value.artifactBytes > 32 * 1024 * 1024 ||
    typeof value.artifactBase64 !== "string" ||
    value.artifactBase64.length !== 4 * Math.ceil(value.artifactBytes / 3)
  )
    fail();
  const bytes = Buffer.from(value.artifactBase64, "base64");
  try {
    if (
      bytes.length !== value.artifactBytes ||
      bytes.toString("base64") !== value.artifactBase64 ||
      createHash("sha256").update(bytes).digest("hex") !==
        value.programArtifactSha256
    )
      fail();
    // The fixed source-authenticated producer owns Keccak derivation. This is
    // private retention of that call, never acceptance of its public JSON CLI output.
    return Object.freeze(value);
  } finally {
    bytes.fill(0);
  }
}
/** Expected programs from fixed native source builds; no deployed-state assertion. */
export async function createSealedRealmsProductionRecoveryProgramArtifacts(
  input,
) {
  if (arguments.length !== 1) fail();
  const { privateState, authority } = capture(input, [
    "privateState",
    "authority",
  ]);
  const commit = owner(privateState, authority),
    root = realpathSync(process.cwd());
  const state = {
    privateState,
    authority,
    commit,
    root,
    tree: treeAt(root, commit),
  };
  attest(state);
  const result = await derivePreparedGenesisProgramArtifacts();
  attest(state);
  const captured = capture(result, [
    "profile",
    "sourceCommit",
    "sourceTree",
    "genesis001",
    "genesis002",
  ]);
  if (
    captured.profile !== "warpkeep-local-genesis-program-artifacts-v1" ||
    captured.sourceCommit !== commit ||
    captured.sourceTree !== state.tree
  )
    fail();
  const genesis001 = artifact(captured.genesis001, "genesis001", state),
    genesis002 = artifact(captured.genesis002, "genesis002", state);
  attest(state);
  const capability = Object.freeze({});
  owners.set(capability, Object.freeze({ ...state, genesis001, genesis002 }));
  return capability;
}
export function readSealedRealmsProductionRecoveryProgramArtifacts(input) {
  if (arguments.length !== 1 || types.isProxy(input) || !input) fail();
  const options = capture(input, [
    "capability",
    "privateState",
    "authority",
    "records",
    ...(Object.hasOwn(input, "readContext") ? ["readContext"] : []),
  ]);
  const state = owners.get(options.capability);
  if (
    !state ||
    state.privateState !== options.privateState ||
    state.authority !== options.authority
  )
    fail();
  attest(state);
  assertSealedRealmsProductionActivationRecordsAuthority({
    records: options.records,
    privateState: options.privateState,
    authority: options.authority,
  });
  const readCorpus = () =>
    readSealedRealmsProductionRecoveryCandidateRecords(
      options.records,
      options.readContext,
    );
  const corpus = readCorpus(),
    p = corpus.projection,
    g = state.genesis002;
  if (
    p.g001SourceBaselineCommit !== BASELINE ||
    p.g001PolicySourceCommit !== state.commit ||
    p.g001FreezePublishReceiptDigest !== null ||
    p.g002ModuleSourceCommit !== g.moduleSourceCommit ||
    p.g002ModuleSha256 !== g.programArtifactSha256 ||
    p.g002ModuleTreeId !== g.moduleTreeId ||
    p.g002DependencyClosureDigest !== g.dependencyClosureDigest
  )
    fail();
  if (JSON.stringify(corpus) !== JSON.stringify(readCorpus())) fail();
  attest(state);
  return Object.freeze({
    g001ExpectedProgramKeccak256: state.genesis001.programKeccak256,
    g002ExpectedProgramKeccak256: g.programKeccak256,
  });
}
export function disposeSealedRealmsProductionRecoveryProgramArtifacts(
  capability,
) {
  owners.delete(capability);
}
