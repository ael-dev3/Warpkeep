import { createHash } from "node:crypto";
import { types } from "node:util";
export const RECOVERY_SOURCE_CLOSURE_PROFILE =
  "warpkeep-0.4.0-recovery-source-closure-v1";
export const RECOVERY_SOURCE_CLOSURE_LIMITS = Object.freeze({
  entries: 20000,
  pathBytes: 1024,
  blobBytes: 64 * 1024 * 1024,
  totalBytes: 512 * 1024 * 1024,
  artifactBytes: 16 * 1024 * 1024,
});
const fail = () => {
  throw Error("RECOVERY_SOURCE_CLOSURE_INVALID");
};
function record(value, keys) {
  if (
    types.isProxy(value) ||
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail();
  const d = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(d).length !== keys.length) fail();
  return Object.fromEntries(
    keys.map((k) => {
      if (!d[k]?.enumerable || !Object.hasOwn(d[k], "value")) fail();
      return [k, d[k].value];
    }),
  );
}
const oid = (v) => typeof v === "string" && /^[a-f0-9]{40}$/u.test(v);
function denseEntries(value) {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    fail();
  const descriptors = Object.getOwnPropertyDescriptors(value),
    length = descriptors.length?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > RECOVERY_SOURCE_CLOSURE_LIMITS.entries ||
    Reflect.ownKeys(descriptors).length !== length + 1
  )
    fail();
  const result = [];
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail();
    result.push(descriptor.value);
  }
  return result;
}
export function validateRecoverySourceClosure(value) {
  const d = record(value, [
    "schemaVersion",
    "profile",
    "sourceCommit",
    "sourceTree",
    "entries",
  ]);
  if (
    d.schemaVersion !== 1 ||
    d.profile !== RECOVERY_SOURCE_CLOSURE_PROFILE ||
    !oid(d.sourceCommit) ||
    !oid(d.sourceTree) ||
    types.isProxy(d.entries) ||
    !Array.isArray(d.entries) ||
    d.entries.length < 1 ||
    d.entries.length > RECOVERY_SOURCE_CLOSURE_LIMITS.entries
  )
    fail();
  let total = 0,
    previous;
  const entries = denseEntries(d.entries).map((e) => {
    const x = record(e, ["path", "mode", "oid", "byteLength", "sha256"]);
    if (
      typeof x.path !== "string" ||
      Buffer.byteLength(x.path) > 1024 ||
      !x.path ||
      x.path.startsWith("/") ||
      /[\x00-\x1f\x7f\\]/u.test(x.path) ||
      x.path.split("/").some((p) => !p || p === "." || p === "..") ||
      Buffer.from(x.path).toString("utf8") !== x.path ||
      !["100644", "100755"].includes(x.mode) ||
      !oid(x.oid) ||
      !Number.isSafeInteger(x.byteLength) ||
      x.byteLength < 0 ||
      x.byteLength > RECOVERY_SOURCE_CLOSURE_LIMITS.blobBytes ||
      typeof x.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(x.sha256)
    )
      fail();
    const path = Buffer.from(x.path);
    if (previous && Buffer.compare(previous, path) >= 0) fail();
    previous = path;
    total += x.byteLength;
    if (total > RECOVERY_SOURCE_CLOSURE_LIMITS.totalBytes) fail();
    return Object.freeze(x);
  });
  return Object.freeze({ ...d, entries: Object.freeze(entries) });
}
export function encodeRecoverySourceClosure(value) {
  const source = JSON.stringify(validateRecoverySourceClosure(value)) + "\n";
  if (Buffer.byteLength(source) > RECOVERY_SOURCE_CLOSURE_LIMITS.artifactBytes)
    fail();
  return source;
}
export function parseRecoverySourceClosure(source) {
  if (
    typeof source !== "string" ||
    Buffer.byteLength(source) > RECOVERY_SOURCE_CLOSURE_LIMITS.artifactBytes
  )
    fail();
  let d;
  try {
    d = validateRecoverySourceClosure(JSON.parse(source));
  } catch {
    fail();
  }
  if (encodeRecoverySourceClosure(d) !== source) fail();
  return d;
}
export function recoverySourceClosureSha256(source) {
  parseRecoverySourceClosure(source);
  return createHash("sha256")
    .update("warpkeep.recovery-source-closure.v1\n")
    .update(source)
    .digest("hex");
}
