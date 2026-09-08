// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const seams = vi.hoisted(() => ({
  mkdir: vi.fn(),
  beforeStat: undefined as undefined | ((path: string) => void),
}));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  const mode = (s: import("node:fs").Stats) => {
    if (process.platform === "win32")
      Object.defineProperty(s, "mode", {
        value: (s.mode & ~0o777) | (s.isDirectory() ? 0o700 : 0o600),
      });
    return s;
  };
  return {
    ...fs,
    mkdirSync: (...args: Parameters<typeof fs.mkdirSync>) => {
      seams.mkdir(...args);
      return fs.mkdirSync(...args);
    },
    lstatSync: (path: string) => {
      seams.beforeStat?.(String(path));
      return mode(fs.lstatSync(path));
    },
    fstatSync: (fd: number) => mode(fs.fstatSync(fd)),
  };
});
import * as workspaceModule from "../scripts/atlas/greater-realm-private-workspace";
const roots: string[] = [];
afterEach(() => {
  seams.beforeStat = undefined;
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "warpkeep-existing-workspace-"));
  roots.push(root);
  const repositoryRoot = join(root, "repo"),
    workspaceRoot = join(root, "private");
  mkdirSync(repositoryRoot, { mode: 0o700 });
  seams.mkdir.mockClear();
  return { root, repositoryRoot, workspaceRoot };
}
const open = (input: { repositoryRoot: string; workspaceRoot: string }) =>
  workspaceModule.openExistingGreaterRealmPrivateWorkspace(input);
it("refuses an absent workspace without creating any path", () => {
  const f = fixture();
  expect(() => open(f)).toThrow();
  expect(existsSync(f.workspaceRoot)).toBe(false);
  expect(seams.mkdir).not.toHaveBeenCalled();
});
it("reopens existing owner files and refuses replaced workspace identity", () => {
  const f = fixture();
  mkdirSync(f.workspaceRoot, { mode: 0o700 });
  writeFileSync(join(f.workspaceRoot, "value.txt"), "retained", {
    mode: 0o600,
  });
  seams.mkdir.mockClear();
  const w = open(f);
  expect(w.readFile("value.txt").toString()).toBe("retained");
  expect(seams.mkdir).not.toHaveBeenCalled();
  renameSync(f.workspaceRoot, join(f.root, "old"));
  mkdirSync(f.workspaceRoot, { mode: 0o700 });
  writeFileSync(join(f.workspaceRoot, "value.txt"), "replacement", {
    mode: 0o600,
  });
  expect(() => w.readFile("value.txt")).toThrow();
});
it("never invokes creator when the root disappears during opening", () => {
  const f = fixture();
  mkdirSync(f.workspaceRoot, { mode: 0o700 });
  let hits = 0;
  seams.mkdir.mockClear();
  seams.beforeStat = (path) => {
    if (path === f.workspaceRoot && ++hits === 2) {
      seams.beforeStat = undefined;
      renameSync(f.workspaceRoot, join(f.root, "moved"));
    }
  };
  expect(() => open(f)).toThrow();
  expect(existsSync(f.workspaceRoot)).toBe(false);
  expect(seams.mkdir).not.toHaveBeenCalled();
});
