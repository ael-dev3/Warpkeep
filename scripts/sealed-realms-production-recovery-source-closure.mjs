import { realpathSync } from "node:fs";
import { types } from "node:util";
import {
  deriveRecoverySourceClosure,
  assertRecoverySourceClosureSnapshot,
} from "./recovery-source-closure.mjs";
import { assertSealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import { sourceCommitFromSealedRealmsProductionAuthority } from "./sealed-realms-production-source-authority.mjs";
const owners = new WeakMap();
const fail = () => {
  throw Error("SEALED_REALMS_RECOVERY_SOURCE_CLOSURE_INVALID");
};
function capture(input, keys) {
  if (
    types.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    fail();
  const d = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(d).length !== keys.length) fail();
  return Object.fromEntries(
    keys.map((k) => {
      if (!d[k]?.enumerable || !Object.hasOwn(d[k], "value")) fail();
      return [k, d[k].value];
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
export async function createSealedRealmsProductionRecoverySourceClosure(input) {
  const { privateState, authority } = capture(input, [
    "privateState",
    "authority",
  ]);
  const commit = owner(privateState, authority),
    root = realpathSync(process.cwd());
  if (process.cwd() !== root) fail();
  const result = await deriveRecoverySourceClosure({
    repositoryRoot: root,
    sourceCommit: commit,
  });
  if (owner(privateState, authority) !== commit || process.cwd() !== root)
    fail();
  assertRecoverySourceClosureSnapshot({
    repositoryRoot: root,
    sourceCommit: commit,
    sourceTree: result.sourceTree,
  });
  const capability = Object.freeze({});
  owners.set(
    capability,
    Object.freeze({
      privateState,
      authority,
      root,
      commit,
      tree: result.sourceTree,
      facts: Object.freeze({ sourceClosureSha256: result.sourceClosureSha256 }),
    }),
  );
  return capability;
}
export function readSealedRealmsProductionRecoverySourceClosure(input) {
  const { capability, privateState, authority } = capture(input, [
    "capability",
    "privateState",
    "authority",
  ]);
  const state = owners.get(capability);
  if (
    !state ||
    state.privateState !== privateState ||
    state.authority !== authority
  )
    fail();
  if (
    owner(privateState, authority) !== state.commit ||
    process.cwd() !== state.root
  )
    fail();
  assertRecoverySourceClosureSnapshot({
    repositoryRoot: state.root,
    sourceCommit: state.commit,
    sourceTree: state.tree,
  });
  return state.facts;
}
export function disposeSealedRealmsProductionRecoverySourceClosure(capability) {
  owners.delete(capability);
}
