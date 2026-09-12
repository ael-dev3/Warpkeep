// @vitest-environment node
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const seam = vi.hoisted(() => ({ fault: "", calls: 0 }));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      if (!seam.fault) return actual.spawn(...args);
      seam.calls++;
      const events = new EventEmitter();
      const c = Object.assign(events, {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill() {
          this.stdout.destroy();
          events.emit("close", 1);
          return true;
        },
      });
      let oid = "";
      c.stdin.on("data", (b) => {
        oid += b.toString();
      });
      c.stdin.on("finish", () => {
        queueMicrotask(() => {
          oid = oid.trim();
          let body = `${oid} blob 5\nhello\n`;
          if (seam.fault === "header") body = oid + " blob 5";
          if (seam.fault === "short") body = `${oid} blob 5\nhe`;
          if (seam.fault === "oid") body = `${"f".repeat(40)} blob 5\nhello\n`;
          if (seam.fault === "body") body = `${oid} blob 5\nworld\n`;
          if (seam.fault === "trailing") body += "extra";
          const bytes = Buffer.from(body);
          if (seam.fault === "high-bit") bytes[0] |= 128;
          c.stdout.end(bytes);
          c.stderr.end();
          c.emit("close", seam.fault === "exit" ? 1 : 0);
        });
      });
      return c;
    },
  };
});
import { deriveRecoverySourceClosure } from "../scripts/recovery-source-closure.mjs";
let root: string, commit: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "warpkeep-batch-fault-"));
  const git = (a: string[]) =>
    execFileSync("git", a, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    }).trim();
  git(["init", "-q"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "core.autocrlf", "false"]);
  writeFileSync(join(root, "value"), "hello");
  git(["add", "."]);
  git(["commit", "-qm", "source"]);
  commit = git(["rev-parse", "HEAD"]);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
it.each(["header", "short", "oid", "body", "trailing", "exit", "high-bit"])(
  "refuses malformed batch %s without returning an inventory",
  async (fault) => {
    seam.fault = fault;
    seam.calls = 0;
    await expect(
      deriveRecoverySourceClosure({
        repositoryRoot: root,
        sourceCommit: commit,
      }),
    ).rejects.toThrow("RECOVERY_SOURCE_CLOSURE_INVALID");
    expect(seam.calls).toBe(1);
  },
);
