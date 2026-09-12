import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
// @vitest-environment node
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  statSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createSealedRealmsProductionPrivateState } from "../scripts/sealed-realms-production-private-state.mjs";
import { authenticateSealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import {
  createSealedRealmsProductionRecoverySourceClosure,
  readSealedRealmsProductionRecoverySourceClosure,
  disposeSealedRealmsProductionRecoverySourceClosure,
} from "../scripts/sealed-realms-production-recovery-source-closure.mjs";
const pending = new Set<Promise<unknown>>();
const roots: string[] = [];
afterEach(
  async () => {
    await Promise.allSettled([...pending]);
    vi.restoreAllMocks();
    for (const r of roots.splice(0))
      rmSync(r, { recursive: true, force: true });
  },
  process.platform === "win32" ? 60000 : 10000,
);
function state(home: string) {
  for (const p of ["audit/private", "runtime", "cache"])
    mkdirSync(
      join(sealedRealmsPrivateBase(home), p),
      { recursive: true, mode: 0o700 },
    );
  return createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyAllowPlatformMode: true,
    testOnlyFsync: () => {},
  });
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "warpkeep-source-cap-"));
  roots.push(root);
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
  writeFileSync(join(root, "source"), "actual S bytes");
  git(["add", "."]);
  git(["commit", "-qm", "S"]);
  const commit = git(["rev-parse", "HEAD"]);
  const authority = authenticateSealedRealmsProductionSourceAuthority({
    operation: "activation-evidence-generate",
    workflowInputSha: commit,
    readGit: () => commit + "\n",
    readBinding: () => ({
      schemaVersion: 1,
      profile: "warpkeep-0.4.0-sealed-launch-v1",
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (verifiedSha) => ({ verifiedSha }),
  });
  const home = mkdtempSync(join(tmpdir(), "warpkeep-source-owner-"));
  roots.push(home);
  return { root, git, authority, privateState: state(home) };
}
it(
  "joins real streamed Git producer to genuine owner capability, refuses forged/crossowner/stale reads and revokes",
  async () => {
    const f = fixture();
    vi.spyOn(process, "cwd").mockReturnValue(f.root);
    const work = createSealedRealmsProductionRecoverySourceClosure({
      privateState: f.privateState,
      authority: f.authority,
    });
    pending.add(work);
    const cap = await work;
    pending.delete(work);
    const input = {
      capability: cap,
      privateState: f.privateState,
      authority: f.authority,
    };
    expect(Object.keys(cap)).toEqual([]);
    expect(
      readSealedRealmsProductionRecoverySourceClosure(input)
        .sourceClosureSha256,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      readSealedRealmsProductionRecoverySourceClosure({
        ...input,
        capability: { ...cap },
      }),
    ).toThrow();
    const otherHome = mkdtempSync(join(tmpdir(), "warpkeep-other-owner-"));
    roots.push(otherHome);
    const otherState = state(otherHome);
    expect(() =>
      readSealedRealmsProductionRecoverySourceClosure({
        ...input,
        privateState: otherState,
      }),
    ).toThrow();
    expect(() =>
      readSealedRealmsProductionRecoverySourceClosure({
        ...input,
        authority: { ...f.authority } as never,
      }),
    ).toThrow();
    writeFileSync(join(f.root, "source"), "drift");
    expect(() =>
      readSealedRealmsProductionRecoverySourceClosure(input),
    ).toThrow();
    disposeSealedRealmsProductionRecoverySourceClosure(cap);
    expect(() =>
      readSealedRealmsProductionRecoverySourceClosure(input),
    ).toThrow();
  },
  process.platform === "win32" ? 60000 : 10000,
);

it(
  "rejects ownership-root drift while the real Git batch is in flight",
  async () => {
    const f = fixture();
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(f.root);
    const work = createSealedRealmsProductionRecoverySourceClosure({
      privateState: f.privateState,
      authority: f.authority,
    });
    pending.add(work);
    cwd.mockReturnValue(tmpdir());
    await expect(work).rejects.toThrow(
      "SEALED_REALMS_RECOVERY_SOURCE_CLOSURE_INVALID",
    );
    pending.delete(work);
  },
  process.platform === "win32" ? 60000 : 10000,
);
