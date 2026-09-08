// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const fixturePath = resolve(
  repositoryRoot,
  'tests/fixtures/sealedRealmsProductionContinuationProcessFixture.mjs',
);
const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');

type Control = Readonly<{
  censusBase: number;
  publicationOutcome: 'adopted' | 'no-effect';
  counts: Readonly<Record<string, number>>;
}>;

type ChildResult = Readonly<{
  ok: boolean;
  result?: Readonly<Record<string, unknown>>;
  code?: string;
}>;

function processHome(publicationOutcome: 'adopted' | 'no-effect' = 'adopted') {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-task5-process-boundary-'));
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const controlPath = join(home, 'process-boundary-control.json');
  const initial: Control = {
    censusBase: Math.floor((Date.now() - 120_000) / 1_000) * 1_000,
    publicationOutcome,
    counts: {},
  };
  writeFileSync(controlPath, `${JSON.stringify(initial)}\n`, {
    encoding: 'utf8', mode: 0o600,
  });
  return Object.freeze({
    home,
    control: () => JSON.parse(readFileSync(controlPath, 'utf8')) as Control,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  });
}

function freshProcess(
  home: string,
  operation: string,
  runId: string,
  input: Readonly<{
    completed?: readonly string[];
    variant?: string;
  }> = {},
) {
  const environment = Object.fromEntries([
    ['NODE_ENV', 'test'],
    ['PATH', process.env.PATH],
    ['SystemRoot', process.env.SystemRoot],
    ['TEMP', process.env.TEMP],
    ['TMP', process.env.TMP],
  ].filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const child = spawnSync(process.execPath, [
    tsxCli,
    fixturePath,
    home,
    operation,
    runId,
    (input.completed ?? []).join(','),
    input.variant ?? 'normal',
  ], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
  expect(child.error, child.stderr).toBeUndefined();
  expect(child.signal, child.stderr).toBeNull();
  expect(child.status, child.stderr).toBe(0);
  expect(child.stderr).toBe('');
  const lines = child.stdout.trimEnd().split('\n');
  expect(lines).toHaveLength(1);
  const result = JSON.parse(lines[0]) as ChildResult;
  expect(JSON.stringify(result)).not.toMatch(
    /github-sealed|credential|private-state|runAttempt|token/iu,
  );
  if (result.ok) {
    expect(JSON.stringify(result.result))
      .not.toMatch(/confirmation|continuation|digest|path|runId|token/iu);
  }
  return result;
}

function expectCompleted(result: ChildResult, operation: string, status = 'completed') {
  expect(result).toEqual({
    ok: true,
    result: { operation, status },
  });
}

describe('sealed-realms continuation across actual process boundaries', () => {
  it('reconstructs both G001 transition brands in fresh processes and invokes each effect once', () => {
    const local = processHome();
    try {
      expectCompleted(
        freshProcess(local.home, 'g001-census-first', '10101'),
        'g001-census-first',
      );
      expectCompleted(
        freshProcess(local.home, 'g001-census-second-inspect', '10102'),
        'g001-census-second-inspect',
      );
      expectCompleted(
        freshProcess(local.home, 'g001-census-second-suspend', '10103'),
        'g001-census-second-suspend',
      );
      expect(freshProcess(local.home, 'g001-census-second-suspend', '10104'))
        .toEqual({ ok: false, code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(local.control().counts).toEqual({
        g001First: 1,
        g001Second: 1,
        g001Suspend: 1,
      });
    } finally {
      local.cleanup();
    }
  }, 120_000);

  it('reconstructs both publication lanes and rejects source, lane-brand, and subject swaps pre-effect', () => {
    const g002 = processHome();
    const ptr = processHome();
    try {
      expectCompleted(
        freshProcess(g002.home, 'g002-publish-inspect', '10201'),
        'g002-publish-inspect',
        'publish-inspected',
      );
      for (const [runId, variant] of [
        ['10202', 'wrong-source'],
        ['10203', 'wrong-lane-brand'],
        ['10204', 'wrong-subject'],
      ] as const) {
        expect(freshProcess(g002.home, 'g002-publish-apply', runId, { variant }))
          .toMatchObject({ ok: false });
        expect(g002.control().counts).toEqual({});
      }
      expectCompleted(
        freshProcess(g002.home, 'g002-publish-apply', '10205'),
        'g002-publish-apply',
      );
      expect(freshProcess(g002.home, 'g002-publish-apply', '10206'))
        .toEqual({ ok: false, code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(g002.control().counts).toEqual({ g002Publish: 1 });

      expectCompleted(
        freshProcess(ptr.home, 'ptr-publish-inspect', '10301'),
        'ptr-publish-inspect',
        'publish-inspected',
      );
      expectCompleted(
        freshProcess(ptr.home, 'ptr-publish-apply', '10302'),
        'ptr-publish-apply',
      );
      expect(freshProcess(ptr.home, 'ptr-publish-apply', '10303'))
        .toEqual({ ok: false, code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(ptr.control().counts).toEqual({ ptrPublish: 1 });
    } finally {
      g002.cleanup();
      ptr.cleanup();
    }
  }, 180_000);

  it.each(['adopted', 'no-effect'] as const)(
    'reconciles a post-claim publication crash from exact %s evidence in another process',
    outcome => {
      const local = processHome(outcome);
      try {
        expectCompleted(
          freshProcess(local.home, 'g002-publish-inspect', '10401'),
          'g002-publish-inspect',
          'publish-inspected',
        );
        expect(freshProcess(local.home, 'g002-publish-apply', '10402', {
          variant: outcome === 'adopted' ? 'crash-adopted' : 'crash-no-effect',
        })).toEqual({ ok: false, code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        expectCompleted(
          freshProcess(local.home, 'g002-publish-apply', '10403', {
            completed: ['10402'],
          }),
          'g002-publish-apply',
        );
        expect(local.control().counts).toEqual(
          outcome === 'adopted' ? { g002Publish: 1 } : {},
        );
        expect(freshProcess(local.home, 'g002-publish-apply', '10404'))
          .toEqual({ ok: false, code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      } finally {
        local.cleanup();
      }
    },
    150_000,
  );

  it('reconstructs G002/PTR import, PTR owner, and activation mappings in fresh processes', () => {
    const local = processHome();
    try {
      expectCompleted(
        freshProcess(local.home, 'g002-import-inspect', '10501'),
        'g002-import-inspect',
        'import-inspected',
      );
      expectCompleted(
        freshProcess(local.home, 'g002-import-apply', '10502'),
        'g002-import-apply',
      );
      expect(freshProcess(local.home, 'g002-import-apply', '10503'))
        .toEqual({ ok: false, code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });

      expectCompleted(
        freshProcess(local.home, 'ptr-import-inspect', '10511'),
        'ptr-import-inspect',
        'import-inspected',
      );
      expectCompleted(
        freshProcess(local.home, 'ptr-import-apply', '10512'),
        'ptr-import-apply',
      );
      expectCompleted(
        freshProcess(local.home, 'ptr-owner-provision-inspect', '10521'),
        'ptr-owner-provision-inspect',
        'owner-provision-inspected',
      );
      expectCompleted(
        freshProcess(local.home, 'ptr-owner-provision', '10522'),
        'ptr-owner-provision',
      );
      expectCompleted(
        freshProcess(local.home, 'activation-evidence-inspect', '10531'),
        'activation-evidence-inspect',
        'activation-evidence-inspected',
      );
      expectCompleted(
        freshProcess(local.home, 'activation-evidence-generate', '10532'),
        'activation-evidence-generate',
        'unavailable',
      );
      expect(local.control().counts).toEqual({
        g002Import: 1,
        ptrImport: 1,
        ownerInspect: 1,
        ownerProvision: 1,
      });
    } finally {
      local.cleanup();
    }
  }, 240_000);

  it.each(['adopted', 'no-effect'] as const)(
    'reconciles a post-claim import crash from exact %s evidence without replay in another process',
    outcome => {
      const local = processHome();
      try {
        expectCompleted(
          freshProcess(local.home, 'g002-import-inspect', '10601'),
          'g002-import-inspect',
          'import-inspected',
        );
        expect(freshProcess(local.home, 'g002-import-apply', '10602', {
          variant: outcome === 'adopted' ? 'crash-adopted' : 'crash-no-effect',
        })).toEqual({ ok: false, code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        expectCompleted(
          freshProcess(local.home, 'g002-import-apply', '10603', {
            completed: ['10602'],
          }),
          'g002-import-apply',
        );
        expect(local.control().counts).toEqual(
          outcome === 'adopted' ? { g002Import: 1 } : {},
        );
        expect(freshProcess(local.home, 'g002-import-apply', '10604'))
          .toEqual({ ok: false, code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      } finally {
        local.cleanup();
      }
    },
    150_000,
  );
});
