import {
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  lstatSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveRecoverySourceClosure } from "./recovery-source-closure.mjs";
const fail = () => {
  throw Error("RECOVERY_SOURCE_CLOSURE_CLI_INVALID");
};
/** Fixed ephemeral CI artifact. Environment selectors are checked data, not authenticated GitHub authority. */
export async function writeRecoverySourceClosureArtifact() {
  if (
    arguments.length !== 0 ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "push" ||
    process.env.GITHUB_REF !== "refs/heads/main" ||
    process.env.GITHUB_REPOSITORY !== "ael-dev3/Warpkeep" ||
    process.env.GITHUB_WORKFLOW !== "Verify"
  )
    fail();
  const repositoryRoot = realpathSync(process.cwd()),
    sourceCommit = process.env.GITHUB_SHA,
    temp = process.env.RUNNER_TEMP;
  if (
    typeof temp !== "string" ||
    resolve(temp) !== temp ||
    realpathSync(temp) !== temp ||
    temp === repositoryRoot ||
    temp.startsWith(repositoryRoot + sep) ||
    repositoryRoot.startsWith(temp + sep)
  )
    fail();
  const initial = lstatSync(temp);
  if (!initial.isDirectory() || initial.isSymbolicLink()) fail();
  const result = await deriveRecoverySourceClosure({
    repositoryRoot,
    sourceCommit,
  });
  if (
    process.env.GITHUB_SHA !== sourceCommit ||
    process.env.RUNNER_TEMP !== temp ||
    realpathSync(process.cwd()) !== repositoryRoot
  )
    fail();
  const after = lstatSync(temp);
  if (initial.dev !== after.dev || initial.ino !== after.ino) fail();
  const root = join(temp, "warpkeep-recovery-source-closure-v1");
  mkdirSync(root, { mode: 0o700 });
  const identity = lstatSync(root);
  const path = join(root, "recovery-source-closure-v1.json");
  let descriptor;
  try {
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, result.source);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const final = lstatSync(root);
  if (
    realpathSync(root) !== root ||
    final.dev !== identity.dev ||
    final.ino !== identity.ino ||
    readFileSync(path, "utf8") !== result.source
  )
    fail();
  return Object.freeze({
    sourceCommit: result.sourceCommit,
    sourceTree: result.sourceTree,
    sourceClosureSha256: result.sourceClosureSha256,
  });
}
let direct = false;
try {
  direct =
    !!process.argv[1] &&
    realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
} catch {}
if (direct) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== "--write") fail();
    process.stdout.write(
      JSON.stringify(await writeRecoverySourceClosureArtifact()) + "\n",
    );
  } catch {
    process.stderr.write("RECOVERY_SOURCE_CLOSURE_CLI_INVALID\n");
    process.exitCode = 1;
  }
}
