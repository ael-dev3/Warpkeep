// @vitest-environment node
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { deriveRecoverySourceClosure } from "../scripts/recovery-source-closure.mjs";
import {
  parseRecoverySourceClosure,
  encodeRecoverySourceClosure,
} from "../scripts/recovery-source-closure-codec.mjs";
const roots: string[] = [];
const gitBudget = process.platform === "win32" ? 60000 : 10000;
const pending = new Set<Promise<unknown>>();
function derive(input: Parameters<typeof deriveRecoverySourceClosure>[0]) {
  const work = deriveRecoverySourceClosure(input);
  pending.add(work);
  void work.finally(() => pending.delete(work)).catch(() => {});
  return work;
}
afterEach(async () => {
  await Promise.allSettled([...pending]);
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "warpkeep-source-inventory-"));
  roots.push(root);
  const git = (args: string[], input?: string) =>
    execFileSync("git", args, {
      cwd: root,
      input,
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    }).trim();
  git(["init", "-q"]);
  git(["config", "user.name", "Closure fixture"]);
  git(["config", "user.email", "closure@example.invalid"]);
  git(["config", "core.autocrlf", "false"]);
  mkdirSync(join(root, "services"));
  writeFileSync(
    join(root, "services", "signer.ts"),
    "export const enabled=false;\n",
  );
  writeFileSync(join(root, "asset.bin"), Buffer.from([0, 255, 10, 0]));
  git(["add", "."]);
  git(["commit", "-qm", "source"]);
  return { root, git, commit: git(["rev-parse", "HEAD"]) };
}
it(
  "derives all genuine Git bytes deterministically with independent SHA vectors",
  async () => {
    const f = fixture();
    const a = await derive({ repositoryRoot: f.root, sourceCommit: f.commit });
    const b = await derive({ repositoryRoot: f.root, sourceCommit: f.commit });
    expect(a.source).toEqual(b.source);
    const d = parseRecoverySourceClosure(a.source);
    expect(d.entries.map((e) => e.path)).toEqual([
      "asset.bin",
      "services/signer.ts",
    ]);
    for (const e of d.entries)
      expect(e.sha256).toBe(
        createHash("sha256")
          .update(readFileSync(join(f.root, e.path)))
          .digest("hex"),
      );
    expect(encodeRecoverySourceClosure(d)).toEqual(a.source);
    expect(a.sourceClosureSha256).toMatch(/^[a-f0-9]{64}$/);
  },
  gitBudget,
);
it(
  "rejects dirty source and ignored index flags",
  async () => {
    const f = fixture();
    writeFileSync(join(f.root, "asset.bin"), "changed");
    await expect(
      derive({ repositoryRoot: f.root, sourceCommit: f.commit }),
    ).rejects.toThrow();
    f.git(["update-index", "--assume-unchanged", "asset.bin"]);
    await expect(
      derive({ repositoryRoot: f.root, sourceCommit: f.commit }),
    ).rejects.toThrow();
  },
  gitBudget,
);
it(
  "includes executable modes and rejects symlink blobs",
  async () => {
    const f = fixture();
    // Keep the working-tree mode aligned with the executable bit committed
    // below. Linux reports a mode-only worktree drift when only the index bit
    // changes, which correctly makes the closure snapshot reject the fixture.
    chmodSync(join(f.root, "services", "signer.ts"), 0o755);
    f.git(["update-index", "--chmod=+x", "services/signer.ts"]);
    f.git(["commit", "-qm", "executable"]);
    const c = f.git(["rev-parse", "HEAD"]);
    expect(
      parseRecoverySourceClosure(
        (await derive({ repositoryRoot: f.root, sourceCommit: c })).source,
      ).entries[1].mode,
    ).toBe("100755");
    const oid = f.git(["hash-object", "-w", "--stdin"], "outside");
    f.git(["update-index", "--add", "--cacheinfo", `120000,${oid},link`]);
    f.git(["commit", "-qm", "link"]);
    await expect(
      derive({
        repositoryRoot: f.root,
        sourceCommit: f.git(["rev-parse", "HEAD"]),
      }),
    ).rejects.toThrow();
  },
  gitBudget,
);
it("codec refuses reordered, duplicate, unknown and malformed entries", () => {
  const d = {
    schemaVersion: 1,
    profile: "warpkeep-0.4.0-recovery-source-closure-v1",
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    entries: [
      {
        path: "a",
        mode: "100644",
        oid: "c".repeat(40),
        byteLength: 0,
        sha256: "d".repeat(64),
      },
      {
        path: "b",
        mode: "100644",
        oid: "e".repeat(40),
        byteLength: 0,
        sha256: "f".repeat(64),
      },
    ],
  };
  for (const value of [
    { ...d, extra: 1 },
    { ...d, entries: [...d.entries].reverse() },
    { ...d, entries: [d.entries[0], d.entries[0]] },
    { ...d, entries: [{ ...d.entries[0], path: "../escape" }] },
  ])
    expect(() =>
      parseRecoverySourceClosure(JSON.stringify(value) + "\n"),
    ).toThrow();
});

it(
  "writes only the fixed ephemeral CLI artifact from exact source and refuses overwrite",
  async () => {
    const f = fixture(),
      temp = mkdtempSync(join(tmpdir(), "warpkeep-inventory-output-"));
    roots.push(temp);
    const { writeRecoverySourceClosureArtifact } =
      await import("../scripts/generate-recovery-source-closure.mjs");
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(f.root);
    for (const [key, value] of Object.entries({
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "ael-dev3/Warpkeep",
      GITHUB_WORKFLOW: "Verify",
      GITHUB_SHA: f.commit,
      RUNNER_TEMP: temp,
    }))
      vi.stubEnv(key, value);
    try {
      const result = await writeRecoverySourceClosureArtifact();
      const path = join(
        temp,
        "warpkeep-recovery-source-closure-v1",
        "recovery-source-closure-v1.json",
      );
      const source = readFileSync(path, "utf8");
      expect(parseRecoverySourceClosure(source).sourceCommit).toBe(f.commit);
      expect(result.sourceClosureSha256).toMatch(/^[a-f0-9]{64}$/);
      await expect(writeRecoverySourceClosureArtifact()).rejects.toThrow();
      expect(readFileSync(path, "utf8")).toBe(source);
      vi.stubEnv("GITHUB_EVENT_NAME", "pull_request");
      await expect(writeRecoverySourceClosureArtifact()).rejects.toThrow(
        "RECOVERY_SOURCE_CLOSURE_CLI_INVALID",
      );
    } finally {
      cwd.mockRestore();
      vi.unstubAllEnvs();
    }
  },
  gitBudget,
);
it("rejects hostile entry arrays without executing caller behavior", () => {
  const entry = {
    path: "a",
    mode: "100644",
    oid: "c".repeat(40),
    byteLength: 0,
    sha256: "d".repeat(64),
  };
  const doc = (entries: unknown) => ({
    schemaVersion: 1,
    profile: "warpkeep-0.4.0-recovery-source-closure-v1",
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    entries,
  });
  const call = vi.fn(() => entry),
    accessor = [entry];
  Object.defineProperty(accessor, "0", { get: call, enumerable: true });
  const overridden = Object.assign([entry], { map: vi.fn(() => [entry]) });
  const extra = Object.assign([entry], { extra: 1 });
  const symbol = [entry];
  Object.defineProperty(symbol, Symbol("extra"), { value: 1 });
  for (const array of [
    Array(1),
    accessor,
    overridden,
    extra,
    symbol,
    new Proxy([entry], {}),
    Object.setPrototypeOf([entry], null),
  ])
    expect(() => encodeRecoverySourceClosure(doc(array))).toThrow();
  expect(call).not.toHaveBeenCalled();
  expect(overridden.map).not.toHaveBeenCalled();
});
