import { spawn, execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { types } from "node:util";
import {
  RECOVERY_SOURCE_CLOSURE_PROFILE,
  RECOVERY_SOURCE_CLOSURE_LIMITS as LIMIT,
  encodeRecoverySourceClosure,
  recoverySourceClosureSha256,
} from "./recovery-source-closure-codec.mjs";
const fail = () => {
  throw Error("RECOVERY_SOURCE_CLOSURE_INVALID");
};
const GIT =
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
      );
const PREFIX = [
  "--no-replace-objects",
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
];
const environment = () => ({
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL:
    process.platform === "win32"
      ? "NUL"
      : String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108),
  GIT_CONFIG_SYSTEM:
    process.platform === "win32"
      ? "NUL"
      : String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108),
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_TERMINAL_PROMPT: "0",
  LANG: "C",
  LC_ALL: "C",
});
function capture(input) {
  if (
    types.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    fail();
  const d = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(d).length !== 2) fail();
  for (const k of ["repositoryRoot", "sourceCommit"])
    if (!d[k]?.enumerable || !Object.hasOwn(d[k], "value")) fail();
  const root = d.repositoryRoot.value,
    commit = d.sourceCommit.value;
  if (
    typeof root !== "string" ||
    resolve(root) !== root ||
    realpathSync(root) !== root ||
    typeof commit !== "string" ||
    !/^[a-f0-9]{40}$/u.test(commit)
  )
    fail();
  return { root, commit };
}
function sourceReader(input) {
  const { root, commit } = capture(input),
    env = environment();
  const git = (args) => {
    try {
      return execFileSync(GIT, [...PREFIX, ...args], {
        cwd: root,
        env,
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      fail();
    }
  };
  const line = (args) => {
    const bytes = git(args),
      s = new TextDecoder("utf8", { fatal: true }).decode(bytes);
    if (!s.endsWith("\n") || s.includes("\0") || s.slice(0, -1).includes("\n"))
      fail();
    return s.slice(0, -1);
  };
  const snapshot = () => {
    if (
      realpathSync(root) !== root ||
      realpathSync(line(["rev-parse", "--show-toplevel"])) !== root ||
      line(["rev-parse", "--verify", "HEAD^{commit}"]) !== commit
    )
      fail();
    const tree = line(["rev-parse", "--verify", `${commit}^{tree}`]);
    if (!/^[a-f0-9]{40}$/u.test(tree)) fail();
    const flags = git(["ls-files", "-v", "-z"]).toString("utf8").split("\0");
    if (flags.pop() !== "" || flags.some((f) => !f.startsWith("H "))) fail();
    if (
      git([
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--name-only",
        "HEAD",
        "--",
      ]).length
    )
      fail();
    return tree;
  };
  return { root, commit, env, git, snapshot };
}
/** Re-attests the expected immutable Git coordinate and tracked-source consistency. */
export function assertRecoverySourceClosureSnapshot(input) {
  if (
    types.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    fail();
  const d = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(d).length !== 3) fail();
  for (const k of ["repositoryRoot", "sourceCommit", "sourceTree"])
    if (!d[k]?.enumerable || !Object.hasOwn(d[k], "value")) fail();
  const expected = d.sourceTree.value;
  if (typeof expected !== "string" || !/^[a-f0-9]{40}$/u.test(expected)) fail();
  const reader = sourceReader({
    repositoryRoot: d.repositoryRoot.value,
    sourceCommit: d.sourceCommit.value,
  });
  if (reader.snapshot() !== expected) fail();
}
export async function deriveRecoverySourceClosure(input) {
  const { root, commit, env, git, snapshot } = sourceReader(input);
  const tree = snapshot(),
    listing = git(["ls-tree", "-r", "-l", "-z", commit]);
  let text;
  try {
    text = new TextDecoder("utf8", { fatal: true }).decode(listing);
  } catch {
    fail();
  }
  const rows = text.split("\0");
  if (rows.pop() !== "" || rows.length < 1 || rows.length > LIMIT.entries)
    fail();
  let total = 0;
  const entries = rows
    .map((row) => {
      const m = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/u.exec(
        row,
      );
      if (!m) fail();
      const size = Number(m[3]);
      if (
        !Number.isSafeInteger(size) ||
        size > LIMIT.blobBytes ||
        (total += size) > LIMIT.totalBytes
      )
        fail();
      return {
        path: m[4],
        mode: m[1],
        oid: m[2],
        byteLength: size,
        sha256: "0".repeat(64),
      };
    })
    .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  encodeRecoverySourceClosure({
    schemaVersion: 1,
    profile: RECOVERY_SOURCE_CLOSURE_PROFILE,
    sourceCommit: commit,
    sourceTree: tree,
    entries,
  });
  const child = spawn(GIT, [...PREFIX, "cat-file", "--batch"], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let processError,
    timedOut = false;
  const closed = new Promise((resolveClose) => {
    child.once("error", (error) => {
      processError = error;
      resolveClose(-1);
    });
    child.once("close", (code) => resolveClose(code));
  });
  child.stdin.on("error", (error) => {
    processError = error;
  });
  let stderrBytes = 0;
  child.stderr.on("data", (bytes) => {
    stderrBytes += bytes.length;
    if (stderrBytes > 16384) {
      processError = Error("stderr bound");
      child.kill();
    }
  });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 120000);
  let index = 0,
    state = "header",
    header = Buffer.alloc(0),
    remaining = 0,
    rawHash,
    objectHash;
  try {
    child.stdin.end(entries.map((e) => e.oid + "\n").join(""));
    for await (const chunk of child.stdout) {
      let offset = 0;
      while (offset < chunk.length) {
        if (index >= entries.length) fail();
        const entry = entries[index];
        if (state === "header") {
          const end = chunk.indexOf(10, offset);
          const part = chunk.subarray(offset, end < 0 ? chunk.length : end);
          if (header.length + part.length > 128) fail();
          header = Buffer.concat([header, part]);
          offset = end < 0 ? chunk.length : end + 1;
          if (end < 0) continue;
          if (
            !header.equals(
              Buffer.from(`${entry.oid} blob ${entry.byteLength}`, "ascii"),
            )
          )
            fail();
          header = Buffer.alloc(0);
          remaining = entry.byteLength;
          rawHash = createHash("sha256");
          objectHash = createHash("sha1").update(`blob ${remaining}\0`);
          state = remaining === 0 ? "newline" : "body";
        } else if (state === "body") {
          const length = Math.min(remaining, chunk.length - offset),
            part = chunk.subarray(offset, offset + length);
          rawHash.update(part);
          objectHash.update(part);
          remaining -= length;
          offset += length;
          if (remaining === 0) state = "newline";
        } else {
          if (chunk[offset++] !== 10 || objectHash.digest("hex") !== entry.oid)
            fail();
          entry.sha256 = rawHash.digest("hex");
          index++;
          state = "header";
        }
      }
    }
    if (
      (await closed) !== 0 ||
      processError ||
      timedOut ||
      index !== entries.length ||
      state !== "header" ||
      header.length
    )
      fail();
  } catch {
    child.kill();
    await closed;
    fail();
  } finally {
    clearTimeout(timer);
  }
  if (
    snapshot() !== tree ||
    !listing.equals(git(["ls-tree", "-r", "-l", "-z", commit]))
  )
    fail();
  const source = encodeRecoverySourceClosure({
    schemaVersion: 1,
    profile: RECOVERY_SOURCE_CLOSURE_PROFILE,
    sourceCommit: commit,
    sourceTree: tree,
    entries,
  });
  return Object.freeze({
    source,
    sourceCommit: commit,
    sourceTree: tree,
    sourceClosureSha256: recoverySourceClosureSha256(source),
  });
}
