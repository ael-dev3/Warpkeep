import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';

const S = '1'.repeat(40);
const A = '2'.repeat(40);
const REPOSITORY = 'ael-dev3/Warpkeep';
const WORKFLOW_PATH = '.github/workflows/sealed-realms-production.yml';
type RuntimeModule = Readonly<Record<string, unknown>>;
type AnyFunction = (...arguments_: any[]) => any;

async function loadWorkflow(): Promise<RuntimeModule> {
  return import('../scripts/sealed-realms-production-workflow-authority.mjs')
    .catch(() => Object.freeze({})) as Promise<RuntimeModule>;
}

async function loadContinuation(): Promise<RuntimeModule> {
  return import('../scripts/sealed-realms-production-continuation.mjs')
    .catch(() => Object.freeze({})) as Promise<RuntimeModule>;
}

function functionExport(module: RuntimeModule, name: string): AnyFunction | undefined {
  const value = module[name];
  return typeof value === 'function' ? value as AnyFunction : undefined;
}

function requireModules(workflow: RuntimeModule, continuation: RuntimeModule) {
  const required = [
    [workflow, 'issueSealedRealmsProductionWorkflowPermit'],
    [continuation, 'createSealedRealmsProductionContinuationStore'],
    [continuation, 'issueSealedRealmsProductionContinuation'],
    [continuation, 'claimSealedRealmsProductionContinuation'],
    [continuation, 'reconcileSealedRealmsProductionContinuation'],
    [continuation, 'assertSealedRealmsProductionContinuationClaim'],
  ] as const;
  for (const [module, name] of required) expect(module[name]).toBeTypeOf('function');
  expect(continuation.SEALED_REALMS_PRODUCTION_CONTINUATION_KINDS).toEqual(
    FIXED_KINDS.map(value => value.kind),
  );
  return required.every(([module, name]) => typeof module[name] === 'function')
    && Array.isArray(continuation.SEALED_REALMS_PRODUCTION_CONTINUATION_KINDS);
}

function sourceAuthority(operation: string, sourceCommit = S) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: sourceCommit,
    readGit: arguments_ => {
      if (arguments_.join('\0') === 'rev-parse\0--verify\0HEAD^{commit}') {
        return `${sourceCommit}\n`;
      }
      if (arguments_.join('\0') === 'rev-parse\0--verify\0refs/remotes/origin/main^{commit}') {
        return `${sourceCommit}\n`;
      }
      throw new Error(`unexpected git call: ${arguments_.join(' ')}`);
    },
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: commit => ({ verifiedSha: commit }),
  });
}

function response(url: string, value: unknown) {
  const body = JSON.stringify(value);
  const result = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
  });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

function github(input: Readonly<{
  sourceCommit: string;
  runId: string;
  runAttempt: number;
  driftRunRequest?: number;
  onRunRequest?: (requestNumber: number, runId: string) => void | Promise<void>;
  runStatus?: (runId: string) => 'in_progress' | 'completed';
  runConclusion?: (runId: string) => 'success' | 'cancelled';
}>) {
  let runRequests = 0;
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return response(url, {
        name: 'main', protected: true, commit: { sha: input.sourceCommit },
      });
    }
    const runMatch = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url);
    if (runMatch !== null) {
      runRequests += 1;
      const requestedRunId = runMatch[1]!;
      await input.onRunRequest?.(runRequests, requestedRunId);
      const drift = input.driftRunRequest !== undefined
        && runRequests >= input.driftRunRequest;
      const status = input.runStatus?.(requestedRunId)
        ?? (drift ? 'completed' : 'in_progress');
      return response(url, {
        id: Number(requestedRunId),
        run_attempt: input.runAttempt,
        event: 'workflow_dispatch',
        status,
        conclusion: status === 'completed' ? (input.runConclusion?.(requestedRunId) ?? 'success') : null,
        head_branch: 'main',
        head_sha: input.sourceCommit,
        path: WORKFLOW_PATH,
        repository: { full_name: REPOSITORY },
      });
    }
    throw new Error(`unexpected GitHub request: ${url}`);
  });
}

async function workflowPermit(
  workflow: RuntimeModule,
  operation: string,
  runId: string,
  options: Readonly<{
    sourceCommit?: string;
    driftRunRequest?: number;
    onRunRequest?: (requestNumber: number, requestedRunId: string) => void | Promise<void>;
    runStatus?: (requestedRunId: string) => 'in_progress' | 'completed';
    runConclusion?: (requestedRunId: string) => 'success' | 'cancelled';
  }> = {},
) {
  const sourceCommit = options.sourceCommit ?? S;
  const source = sourceAuthority(operation, sourceCommit);
  const fetchImpl = github({
    sourceCommit,
    runId,
    runAttempt: 1,
    driftRunRequest: options.driftRunRequest,
    onRunRequest: options.onRunRequest,
    runStatus: options.runStatus,
    runConclusion: options.runConclusion,
  });
  const permit = await functionExport(
    workflow, 'issueSealedRealmsProductionWorkflowPermit',
  )!({
    sourceAuthority: source,
    githubToken: 'github-sealed-realms-owner-token',
    runId,
    runAttempt: '1',
    fetchImpl,
  });
  return { source, permit, fetchImpl };
}

function privateFixture() {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-sealed-realms-continuation-'));
  for (const root of [
    join(sealedRealmsPrivateBase(home), 'audit', 'private'),
    join(sealedRealmsPrivateBase(home), 'runtime'),
    join(sealedRealmsPrivateBase(home), 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const state = (testOnlyRace?: (phase: string, path: string) => void) =>
    createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync: () => {},
      testOnlyAllowPlatformMode: true,
      ...(testOnlyRace === undefined ? {} : { testOnlyRace }),
    });
  return { home, state, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function recordNames(home: string) {
  const root = join(sealedRealmsPrivateBase(home), 'runtime',
    'sealed-realms-v1', 'continuations',
  );
  if (!readdirSync(join(root, '..')).includes('continuations')) return [];
  return readdirSync(root)
    .flatMap(scope => readdirSync(join(root, scope)))
    .filter(name => name.endsWith('.json'))
    .sort();
}

function issuedPath(home: string) {
  const root = join(sealedRealmsPrivateBase(home), 'runtime',
    'sealed-realms-v1', 'continuations',
  );
  const scope = readdirSync(root)[0]!;
  const directory = join(root, scope);
  const name = readdirSync(directory).find(value => value.startsWith('issued-'))!;
  return { directory, path: join(directory, name), name };
}

function rewriteIssued(
  home: string,
  mutate: (record: Record<string, unknown>) => void,
  duplicate = false,
) {
  const current = issuedPath(home);
  const record = JSON.parse(readFileSync(current.path, 'utf8')) as Record<string, unknown>;
  mutate(record);
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (!duplicate) rmSync(current.path);
  writeFileSync(join(current.directory, `issued-${digest}.json`), bytes, { mode: 0o600 });
}

const FIXED_KINDS = Object.freeze([
  { kind: 'g001-census-first-to-second', issue: 'g001-census-first', claim: 'g001-census-second-inspect' },
  { kind: 'g001-census-second-to-suspension', issue: 'g001-census-second-inspect', claim: 'g001-census-second-suspend' },
  { kind: 'g002-publication', issue: 'g002-publish-inspect', claim: 'g002-publish-apply' },
  { kind: 'g002-import', issue: 'g002-import-inspect', claim: 'g002-import-apply' },
  { kind: 'ptr-publication', issue: 'ptr-publish-inspect', claim: 'ptr-publish-apply' },
  { kind: 'ptr-import', issue: 'ptr-import-inspect', claim: 'ptr-import-apply' },
  { kind: 'ptr-owner-provision', issue: 'ptr-owner-provision-inspect', claim: 'ptr-owner-provision' },
  { kind: 'activation-evidence', issue: 'activation-evidence-inspect', claim: 'activation-evidence-generate' },
  { kind: 'g002-update', issue: 'g002-update-inspect', claim: 'g002-update-apply' },
  { kind: 'ptr-update', issue: 'ptr-update-inspect', claim: 'ptr-update-apply' },
  { kind: 'activation-evidence-inline', issue: 'activation-evidence-generate', claim: 'activation-evidence-generate' },
]);

const BINDING = Object.freeze({
  subject: 'release-0.4.0',
  evidenceDigest: 'a'.repeat(64),
  receiptDigests: Object.freeze(['b'.repeat(64), 'c'.repeat(64)]),
  predecessorDigests: Object.freeze(['d'.repeat(64)]),
});

function store(
  continuation: RuntimeModule,
  privateState: ReturnType<typeof createSealedRealmsProductionPrivateState>,
  clock: () => Date,
  nonce = { value: 1 },
) {
  return functionExport(
    continuation, 'createSealedRealmsProductionContinuationStore',
  )!({
    privateState,
    clock,
    randomBytes: (length: number) => Buffer.alloc(length, nonce.value++),
  });
}

function issueInput(
  continuationStore: object,
  run: Awaited<ReturnType<typeof workflowPermit>>,
  kind: string,
  runId: string,
) {
  return {
    store: continuationStore,
    permit: run.permit,
    sourceAuthority: run.source,
    kind,
    runId,
    runAttempt: '1',
    ...BINDING,
  };
}

function claimAssertionInput(
  claim: object | undefined,
  continuationStore: object,
  run: Awaited<ReturnType<typeof workflowPermit>>,
  kind: string,
  runId: string,
) {
  return {
    claim,
    store: continuationStore,
    sourceAuthority: run.source,
    kind,
    runId,
    runAttempt: '1',
    ...BINDING,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(settle => { resolve = settle; });
  return Object.freeze({ promise, resolve });
}

describe('sealed-realms durable continuation core', () => {
  it('reads exact durable claim binding only inside the live synchronous PTR claim callback', async () => {
    const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
    const reader = functionExport(continuation, 'readSealedRealmsProductionContinuationClaimBinding');
    expect(reader).toBeTypeOf('function');
    if (!reader || !requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS.find(value => value.kind === 'ptr-update')!;
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    let retained: ReturnType<typeof claimAssertionInput> | undefined;
    let binding: Record<string, any> | undefined;
    let detached: Promise<void> | undefined;
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun, transition.kind, '1001'),
      );
      const claimRun = await workflowPermit(workflow, transition.claim, '2001');
      const privateState = fixture.state();
      const claimStore = store(continuation, privateState, now);
      await functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({
        ...issueInput(claimStore, claimRun, transition.kind, '2001'),
        effect: (claim: object) => {
          const exact = claimAssertionInput(claim, claimStore, claimRun, transition.kind, '2001');
          retained = exact;
          binding = reader(exact);
          const issued = issuedPath(fixture.home);
          const claimName = readdirSync(issued.directory).find(name => name.startsWith('claimed-'))!;
          const claimBytes = readFileSync(join(issued.directory, claimName));
          const claimRecord = JSON.parse(claimBytes.toString());
          const issuedRecord = JSON.parse(readFileSync(issued.path, 'utf8'));
          expect(binding).toEqual({
            scopeDigest: issued.directory.split(/[/\\]/u).at(-1),
            issuedRecordDigest: issued.name.slice(7, -5),
            claimRecordDigest: createHash('sha256').update(claimBytes).digest('hex'),
            sourceCommit: S,
            sourceAuthorityDigest: claimRun.source.authorityDigest,
            kind: transition.kind,
            subject: BINDING.subject,
            evidenceDigest: BINDING.evidenceDigest,
            receiptDigests: [...BINDING.receiptDigests],
            predecessorDigests: [...BINDING.predecessorDigests],
            claimRunId: '2001', claimRunAttempt: 1,
            claimedAt: claimRecord.claimedAt, expiresAt: issuedRecord.expiresAt,
          });
          expect(Object.isFrozen(binding)).toBe(true);
          expect(Object.isFrozen(binding!.receiptDigests)).toBe(true);
          expect(Object.isFrozen(binding!.predecessorDigests)).toBe(true);
          for (const changed of [{ claim: { ...claim } }, { claim: binding },
            { store: store(continuation, privateState, now) }, { sourceAuthority: { ...claimRun.source } },
            { evidenceDigest: 'f'.repeat(64) }, { runId: '2002' }]) {
            expect(() => reader({ ...exact, ...changed })).toThrow();
          }
          detached = Promise.resolve().then(() => {
            expect(() => reader(exact)).toThrow(/SEALED_REALMS_CONTINUATION_CLAIM_INVALID/u);
          });
          return detached;
        },
      });
      await detached;
      expect(() => reader(retained)).toThrow(/SEALED_REALMS_CONTINUATION_CLAIM_INVALID/u);
      const terminal = functionExport(continuation, 'readSealedRealmsProductionContinuationCompletion')!({
        store: claimStore, privateState, sourceAuthority: claimRun.source, kind: transition.kind, ...BINDING,
      });
      expect(terminal.claimRecordDigest).toBe(binding!.claimRecordDigest);
      expect(terminal.issuedRecordDigest).toBe(binding!.issuedRecordDigest);
      expect(terminal.outcome).toBe('completed');
      expect(recordNames(fixture.home).map(name => name.split('-')[0])).toEqual(['claimed', 'issued', 'terminal']);
    } finally { await detached; fixture.cleanup(); }
  });

  it.each(FIXED_KINDS)(
    'issues, reopens, claims, and terminalizes $kind without public continuation material',
    async transition => {
      const [workflow, continuation] = await Promise.all([
        loadWorkflow(), loadContinuation(),
      ]);
      if (!requireModules(workflow, continuation)) return;
      const fixture = privateFixture();
      let now = Date.parse('2026-09-01T00:00:00.000Z');
      try {
        const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
        const issued = await functionExport(
          continuation, 'issueSealedRealmsProductionContinuation',
        )!(issueInput(store(continuation, fixture.state(), () => new Date(now)), issuedRun,
          transition.kind, '1001'));
        expect(issued).toEqual({ status: 'issued' });
        expect(Object.keys(issued)).toEqual(['status']);

        now += 1_000;
        const claimRunId = transition.kind === 'activation-evidence-inline' ? '1001' : '2001';
        const claimedRun = await workflowPermit(workflow, transition.claim, claimRunId);
        let callbackClaim: object | undefined;
        const claimStore = store(continuation, fixture.state(), () => new Date(now));
        const effect = vi.fn(async (claim: object) => {
          callbackClaim = claim;
          expect(Object.keys(claim)).toEqual([]);
          expect(JSON.stringify(claim)).toBe('{}');
          expect(recordNames(fixture.home).some(name => name.startsWith('claimed-'))).toBe(true);
          expect(functionExport(
            continuation, 'assertSealedRealmsProductionContinuationClaim',
          )!(claimAssertionInput(
            claim, claimStore, claimedRun, transition.kind, claimRunId,
          ))).toBe(true);
        });
        const completed = await functionExport(
          continuation, 'claimSealedRealmsProductionContinuation',
        )!({
          ...issueInput(
            claimStore,
            claimedRun, transition.kind, claimRunId,
          ),
          effect,
        });
        expect(completed).toEqual({ status: 'completed' });
        expect(effect).toHaveBeenCalledTimes(1);
        expect(recordNames(fixture.home).map(name => name.split('-')[0])).toEqual([
          'claimed', 'issued', 'terminal',
        ]);
        expect(() => functionExport(
          continuation, 'assertSealedRealmsProductionContinuationClaim',
        )!(claimAssertionInput(
          callbackClaim, claimStore, claimedRun, transition.kind, claimRunId,
        )))
          .toThrow(/SEALED_REALMS_CONTINUATION_CLAIM_INVALID/u);
        expect(JSON.stringify({ issued, completed })).not.toMatch(/[a-f0-9]{40,64}/u);
        expect(JSON.stringify({ issued, completed })).not.toMatch(/path|token|confirmation|digest/iu);
      } finally {
        fixture.cleanup();
      }
    },
  );

  it.each(['other-run', 'other-attempt', 'changed-evidence', 'changed-receipts', 'changed-predecessor'])(
    'does not claim inline activation under %s', async scenario => {
      const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
      if (!requireModules(workflow, continuation)) return;
      const fixture = privateFixture();
      try {
        const run = await workflowPermit(workflow, 'activation-evidence-generate', '1001');
        const state = store(continuation, fixture.state(), () => new Date('2026-09-01T00:00:00.000Z'));
        const input = issueInput(state, run, 'activation-evidence-inline', '1001');
        await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(input);
        const effect = vi.fn();
        const changed = scenario === 'other-run' ? { runId: '2001' }
          : scenario === 'other-attempt' ? { runAttempt: '2' }
            : scenario === 'changed-evidence' ? { evidenceDigest: 'f'.repeat(64) }
              : scenario === 'changed-receipts' ? { receiptDigests: ['f'.repeat(64)] }
                : { predecessorDigests: ['f'.repeat(64)] };
        await expect(functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({
          ...input, ...changed, effect,
        })).rejects.toThrow(scenario.startsWith('other-') ? /RUN_INVALID/u : /BINDING_INVALID/u);
        expect(effect).not.toHaveBeenCalled();
        expect(recordNames(fixture.home).map(name => name.split('-')[0])).toEqual(['issued']);
      } finally { fixture.cleanup(); }
    });

  it('keeps legacy inspection issuance separate from same-run inline issuance and claims', async () => {
    const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    try {
      const inspect = await workflowPermit(workflow, 'activation-evidence-inspect', '1001');
      const generate = await workflowPermit(workflow, 'activation-evidence-generate', '1001');
      const state = store(continuation, fixture.state(), () => new Date('2026-09-01T00:00:00.000Z'));
      const issue = functionExport(continuation, 'issueSealedRealmsProductionContinuation')!;
      await expect(issue(issueInput(state, inspect, 'activation-evidence-inline', '1001'))).rejects.toThrow(/OPERATION_INVALID/u);
      await expect(issue(issueInput(state, generate, 'activation-evidence', '1001'))).rejects.toThrow(/OPERATION_INVALID/u);
      await issue(issueInput(state, inspect, 'activation-evidence', '1001'));
      const effect = vi.fn();
      const claim = functionExport(continuation, 'claimSealedRealmsProductionContinuation')!;
      await expect(claim({ ...issueInput(state, generate, 'activation-evidence-inline', '1001'), effect })).rejects.toThrow(/BINDING_INVALID/u);
      await expect(claim({ ...issueInput(state, generate, 'activation-evidence', '1001'), effect })).rejects.toThrow(/RUN_INVALID/u);
      expect(effect).not.toHaveBeenCalled();
      expect(recordNames(fixture.home)).toHaveLength(1);
    } finally { fixture.cleanup(); }
  });

  it.each(['activation-evidence', 'activation-evidence-inline'])(
    'preserves the legacy scope and refuses the other mode when %s is already issued', async kind => {
      const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
      if (!requireModules(workflow, continuation)) return;
      const fixture = privateFixture();
      try {
        const otherKind = kind === 'activation-evidence' ? 'activation-evidence-inline' : 'activation-evidence';
        const issued = await workflowPermit(workflow, kind === 'activation-evidence' ? 'activation-evidence-inspect' : 'activation-evidence-generate', '1001');
        const otherIssuer = await workflowPermit(workflow, otherKind === 'activation-evidence' ? 'activation-evidence-inspect' : 'activation-evidence-generate', '3001');
        const claimant = await workflowPermit(workflow, 'activation-evidence-generate', otherKind === 'activation-evidence-inline' ? '1001' : '2001');
        const state = store(continuation, fixture.state(), () => new Date('2026-09-01T00:00:00.000Z'));
        const issue = functionExport(continuation, 'issueSealedRealmsProductionContinuation')!;
        await issue(issueInput(state, issued, kind, '1001'));
        const scope = issuedPath(fixture.home).directory.split(/[/\\]/u).at(-1);
        expect(scope).toBe(createHash('sha256').update(`warpkeep.sealed-realms.continuation-scope.v1\n${issued.source.authorityDigest}\nactivation-evidence\n`).digest('hex'));
        await expect(issue(issueInput(state, otherIssuer, otherKind, '3001'))).rejects.toThrow(/DUPLICATE/u);
        const effect = vi.fn();
        await expect(functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({
          ...issueInput(state, claimant, otherKind, otherKind === 'activation-evidence-inline' ? '1001' : '2001'), effect,
        })).rejects.toThrow(/BINDING_INVALID/u);
        expect(effect).not.toHaveBeenCalled(); expect(recordNames(fixture.home)).toHaveLength(1);
      } finally { fixture.cleanup(); }
    });

  it.each([
    ['activation-evidence', 'completed'], ['activation-evidence', 'effect-threw'],
    ['activation-evidence-inline', 'completed'], ['activation-evidence-inline', 'effect-threw'],
  ])('blocks cross-mode replay after %s becomes %s', async (kind, outcome) => {
    const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    try {
      const otherKind = kind === 'activation-evidence' ? 'activation-evidence-inline' : 'activation-evidence';
      const issued = await workflowPermit(workflow, kind === 'activation-evidence' ? 'activation-evidence-inspect' : 'activation-evidence-generate', '1001');
      const claimId = kind === 'activation-evidence-inline' ? '1001' : '2001';
      const claimant = await workflowPermit(workflow, 'activation-evidence-generate', claimId);
      const otherIssuer = await workflowPermit(workflow, otherKind === 'activation-evidence' ? 'activation-evidence-inspect' : 'activation-evidence-generate', '3001');
      const state = store(continuation, fixture.state(), () => new Date('2026-09-01T00:00:00.000Z'));
      const issue = functionExport(continuation, 'issueSealedRealmsProductionContinuation')!;
      const claim = functionExport(continuation, 'claimSealedRealmsProductionContinuation')!;
      await issue(issueInput(state, issued, kind, '1001'));
      const effect = vi.fn(() => { if (outcome === 'effect-threw') throw Error('lost acknowledgment'); });
      const first = claim({ ...issueInput(state, claimant, kind, claimId), effect });
      if (outcome === 'completed') await expect(first).resolves.toEqual({ status: 'completed' });
      else await expect(first).rejects.toThrow(/EFFECT_AMBIGUOUS/u);
      const expected = outcome === 'completed' ? /TERMINAL/u : /AMBIGUOUS/u;
      await expect(issue({ ...issueInput(state, otherIssuer, otherKind, '3001'), evidenceDigest: 'f'.repeat(64) })).rejects.toThrow(expected);
      const otherClaimant = await workflowPermit(workflow, 'activation-evidence-generate', '3001');
      await expect(claim({ ...issueInput(state, otherClaimant, otherKind, '3001'), effect })).rejects.toThrow(expected);
      expect(effect).toHaveBeenCalledTimes(1);
    } finally { fixture.cleanup(); }
  });

  it.each(['completed', 'effect-threw'])(
    'does not replay an inline activation after %s or bypass its journal with fresh evidence', async outcome => {
      const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
      if (!requireModules(workflow, continuation)) return;
      const fixture = privateFixture();
      try {
        const run = await workflowPermit(workflow, 'activation-evidence-generate', '1001');
        const state = store(continuation, fixture.state(), () => new Date('2026-09-01T00:00:00.000Z'));
        const input = issueInput(state, run, 'activation-evidence-inline', '1001');
        const issue = functionExport(continuation, 'issueSealedRealmsProductionContinuation')!;
        const claim = functionExport(continuation, 'claimSealedRealmsProductionContinuation')!;
        await issue(input);
        const effect = vi.fn(() => {
          if (outcome === 'effect-threw') throw Error('lost effect acknowledgment');
        });
        const attempt = claim({ ...input, effect });
        if (outcome === 'completed') await expect(attempt).resolves.toEqual({ status: 'completed' });
        else await expect(attempt).rejects.toThrow(/EFFECT_AMBIGUOUS/u);
        const expected = outcome === 'completed' ? /TERMINAL/u : /AMBIGUOUS/u;
        await expect(claim({ ...input, effect })).rejects.toThrow(expected);
        await expect(issue({ ...input, evidenceDigest: 'f'.repeat(64) })).rejects.toThrow(expected);
        expect(effect).toHaveBeenCalledTimes(1);
        const names = recordNames(fixture.home).map(name => name.split('-')[0]);
        expect(names).toEqual(outcome === 'completed' ? ['claimed', 'issued', 'terminal'] : ['claimed', 'issued']);
      } finally { fixture.cleanup(); }
    });

  it('recovers a cancelled issuance-only inline run, retains its truthful no-effect record and reads fresh completion', async () => {
    const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    try {
      const privateState = fixture.state();
      const state = store(continuation, privateState, () => new Date('2026-09-01T00:00:00.000Z'));
      const previous = await workflowPermit(workflow, 'activation-evidence-generate', '1001');
      const issue = functionExport(continuation, 'issueSealedRealmsProductionContinuation')!;
      await issue(issueInput(state, previous, 'activation-evidence-inline', '1001'));
      const old = issuedPath(fixture.home), oldDigest = old.name.slice(7, -5);
      const current = await workflowPermit(workflow, 'activation-evidence-generate', '2001', {
        runStatus: id => id === '1001' ? 'completed' : 'in_progress',
        runConclusion: () => 'cancelled',
      });
      const freshBinding = { ...BINDING, evidenceDigest: 'e'.repeat(64), receiptDigests: ['f'.repeat(64)] };
      const input = { ...issueInput(state, current, 'activation-evidence-inline', '2001'), ...freshBinding };
      await expect(issue(input)).resolves.toEqual({ status: 'issued' });
      const oldTerminal = JSON.parse(readFileSync(join(old.directory, `terminal-${oldDigest}.json`), 'utf8'));
      expect(oldTerminal.outcome).toBe('reconciled-no-effect');
      expect(oldTerminal.terminalRunId).toBe('2001');
      expect(oldTerminal.observationDigest).toBe(createHash('sha256')
        .update(`warpkeep.sealed-realms.unclaimed-inline-no-effect.v1\n${oldDigest}\n`).digest('hex'));
      expect(readdirSync(old.directory)).not.toContain(`claimed-${oldDigest}.json`);
      const effect = vi.fn();
      await functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({ ...input, effect });
      expect(effect).toHaveBeenCalledTimes(1);
      const completed = functionExport(continuation, 'readSealedRealmsProductionContinuationCompletion')!({
        store: state, privateState, sourceAuthority: current.source, kind: 'activation-evidence-inline', ...freshBinding,
      });
      expect(completed.outcome).toBe('completed'); expect(completed.claimRunId).toBe('2001');
      expect(recordNames(fixture.home).map(name => name.split('-')[0])).toEqual(['claimed', 'issued', 'issued', 'terminal', 'terminal']);
    } finally { fixture.cleanup(); }
  });

  it.each(['live-issuer', 'same-run-rerun', 'claim-during-attestation', 'effect-resolution-during-attestation', 'effect-resolution-at-final-attestation',
    'failed-first-attestation', 'failed-final-attestation', 'issuer-live-at-final-attestation'])(
    'does not recover an unclaimed inline issuance with %s', async scenario => {
      const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
      if (!requireModules(workflow, continuation)) return;
      const fixture = privateFixture();
      try {
        const privateState = fixture.state();
        const state = store(continuation, privateState, () => new Date('2026-09-01T00:00:00.000Z'));
        const previous = await workflowPermit(workflow, 'activation-evidence-generate', '1001');
        const issue = functionExport(continuation, 'issueSealedRealmsProductionContinuation')!;
        const previousInput = issueInput(state, previous, 'activation-evidence-inline', '1001');
        await issue(previousInput);
        const old = issuedPath(fixture.home), oldDigest = old.name.slice(7, -5);
        const scope = old.directory.split(/[/\\]/u).at(-1)!;
        let oldReads = 0;
        const currentId = scenario === 'same-run-rerun' ? '1001' : '2001';
        const current = await workflowPermit(workflow, 'activation-evidence-generate', currentId, {
          runStatus: id => id === '1001' && scenario !== 'live-issuer' && scenario !== 'same-run-rerun'
            && !(scenario === 'issuer-live-at-final-attestation' && oldReads >= 2) ? 'completed' : 'in_progress',
          onRunRequest: async (_count, id) => {
            if (id !== '1001' || scenario === 'same-run-rerun') return;
            oldReads++;
            if ((oldReads === 1 && scenario === 'failed-first-attestation')
              || (oldReads === 2 && scenario === 'failed-final-attestation')) throw Error('GitHub unavailable');
            if (oldReads === 1 && scenario === 'claim-during-attestation') {
              await expect(functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({
                ...previousInput, effect: () => { throw Error('effect acknowledgment missing'); },
              })).rejects.toThrow(/EFFECT_AMBIGUOUS/u);
            }
            if (oldReads === 1 && scenario === 'effect-resolution-during-attestation') {
              privateState.reserveContinuationResolution({ scopeDigest: scope, recordDigest: oldDigest, decision: 'effect' });
            }
            if (oldReads === 2 && scenario === 'effect-resolution-at-final-attestation') {
              writeFileSync(join(old.directory, `resolution-${oldDigest}.lock`),
                'warpkeep-sealed-realms-continuation-resolution-v1:effect\n', { mode: 0o600 });
            }
          },
        });
        await expect(issue({ ...issueInput(state, current, 'activation-evidence-inline', currentId),
          ...(scenario === 'same-run-rerun' ? { runAttempt: '2' } : {}), evidenceDigest: 'e'.repeat(64),
        })).rejects.toThrow();
        expect(recordNames(fixture.home).filter(name => name.startsWith('issued-'))).toHaveLength(1);
        expect(recordNames(fixture.home).some(name => name.startsWith('terminal-'))).toBe(false);
        if (scenario === 'claim-during-attestation') expect(recordNames(fixture.home).some(name => name.startsWith('claimed-'))).toBe(true);
        else expect(recordNames(fixture.home)).toHaveLength(1);
      } finally { fixture.cleanup(); }
    });

  it.each(['missing-terminal', 'wrong-digest', 'wrong-outcome', 'missing-resolution', 'effect-resolution'])(
    'rejects %s in retained issuance-only recovery evidence before any fresh effect', async scenario => {
      const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
      if (!requireModules(workflow, continuation)) return;
      const fixture = privateFixture();
      try {
        const state = store(continuation, fixture.state(), () => new Date('2026-09-01T00:00:00.000Z'));
        const previous = await workflowPermit(workflow, 'activation-evidence-generate', '1001');
        const issue = functionExport(continuation, 'issueSealedRealmsProductionContinuation')!;
        await issue(issueInput(state, previous, 'activation-evidence-inline', '1001'));
        const old = issuedPath(fixture.home), oldDigest = old.name.slice(7, -5);
        const current = await workflowPermit(workflow, 'activation-evidence-generate', '2001', {
          runStatus: id => id === '1001' ? 'completed' : 'in_progress',
        });
        const input = { ...issueInput(state, current, 'activation-evidence-inline', '2001'), evidenceDigest: 'e'.repeat(64) };
        await issue(input);
        const terminalPath = join(old.directory, `terminal-${oldDigest}.json`);
        const resolutionPath = join(old.directory, `resolution-${oldDigest}.lock`);
        if (scenario === 'missing-terminal') rmSync(terminalPath);
        else if (scenario === 'missing-resolution') rmSync(resolutionPath);
        else if (scenario === 'effect-resolution') writeFileSync(resolutionPath, 'warpkeep-sealed-realms-continuation-resolution-v1:effect\n');
        else {
          const terminal = JSON.parse(readFileSync(terminalPath, 'utf8'));
          if (scenario === 'wrong-digest') terminal.observationDigest = 'f'.repeat(64);
          if (scenario === 'wrong-outcome') terminal.outcome = 'reconciled-effect-applied';
          writeFileSync(terminalPath, `${JSON.stringify(terminal)}\n`);
        }
        const effect = vi.fn();
        await expect(functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({ ...input, effect })).rejects.toThrow();
        expect(effect).not.toHaveBeenCalled();
      } finally { fixture.cleanup(); }
    });

  it('reads inline completion after a genuine legacy no-effect generation with a different binding', async () => {
    const [workflow, continuation] = await Promise.all([loadWorkflow(), loadContinuation()]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    try {
      const privateState = fixture.state();
      const state = store(continuation, privateState, () => new Date('2026-09-01T00:00:00.000Z'));
      const inspect = await workflowPermit(workflow, 'activation-evidence-inspect', '1001');
      const issue = functionExport(continuation, 'issueSealedRealmsProductionContinuation')!;
      await issue(issueInput(state, inspect, 'activation-evidence', '1001'));
      const stopped = await workflowPermit(workflow, 'activation-evidence-generate', '2001', { driftRunRequest: 3 });
      const effect = vi.fn();
      await expect(functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({
        ...issueInput(state, stopped, 'activation-evidence', '2001'), effect,
      })).rejects.toThrow();
      expect(effect).not.toHaveBeenCalled();
      const current = await workflowPermit(workflow, 'activation-evidence-generate', '3001', {
        runStatus: id => id === '2001' ? 'completed' : 'in_progress',
      });
      await functionExport(continuation, 'reconcileSealedRealmsProductionContinuation')!({
        ...issueInput(state, current, 'activation-evidence', '3001'),
        readOnlyReconcile: (reconciliation: object) => functionExport(continuation, 'classifySealedRealmsProductionContinuationNoEffect')!({
          reconciliation, evidenceDigest: BINDING.evidenceDigest, observationDigest: '9'.repeat(64),
        }),
      });
      const freshBinding = { ...BINDING, evidenceDigest: 'e'.repeat(64), receiptDigests: ['f'.repeat(64)] };
      const input = { ...issueInput(state, current, 'activation-evidence-inline', '3001'), ...freshBinding };
      await issue(input);
      await functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({ ...input, effect });
      const completed = functionExport(continuation, 'readSealedRealmsProductionContinuationCompletion')!({
        store: state, privateState, sourceAuthority: current.source, kind: 'activation-evidence-inline', ...freshBinding,
      });
      expect(completed.outcome).toBe('completed'); expect(completed.claimRunId).toBe('3001'); expect(effect).toHaveBeenCalledTimes(1);
      expect(() => functionExport(continuation, 'readSealedRealmsProductionContinuationCompletion')!({
        store: state, privateState, sourceAuthority: current.source, kind: 'activation-evidence', ...freshBinding,
      })).toThrow(/BINDING_INVALID/u);
    } finally { fixture.cleanup(); }
  });

  it('rejects live reconciliation and cannot terminalize no-effect ahead of its claimant', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[2]!;
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    const effectAttestationEntered = deferred();
    const releaseEffectAttestation = deferred();
    let effects = 0;
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun,
          transition.kind, '1001'),
      );
      const claimRun = await workflowPermit(workflow, transition.claim, '2001', {
        onRunRequest: async requestNumber => {
          if (requestNumber === 3) {
            effectAttestationEntered.resolve();
            await releaseEffectAttestation.promise;
          }
        },
      });
      const claimAttempt = functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), claimRun,
          transition.kind, '2001'),
        effect: async () => { effects += 1; },
      });
      await effectAttestationEntered.promise;

      const reconcileRun = await workflowPermit(workflow, transition.claim, '3001', {
        runStatus: requestedRunId => requestedRunId === '2001'
          ? 'in_progress'
          : 'in_progress',
      });
      const readOnlyReconcile = vi.fn(async () => ({
        outcome: 'no-effect', observationDigest: '9'.repeat(64),
      }));
      const reconciliation = await Promise.allSettled([
        functionExport(continuation, 'reconcileSealedRealmsProductionContinuation')!({
          ...issueInput(store(continuation, fixture.state(), now), reconcileRun,
            transition.kind, '3001'),
          readOnlyReconcile,
        }),
      ]);
      releaseEffectAttestation.resolve();
      const claimResult = await Promise.allSettled([claimAttempt]);

      expect(reconciliation[0]?.status).toBe('rejected');
      if (reconciliation[0]?.status === 'rejected') {
        expect(String(reconciliation[0].reason)).toMatch(
          /SEALED_REALMS_CONTINUATION_CLAIM_LIVE/u,
        );
      }
      expect(readOnlyReconcile).not.toHaveBeenCalled();
      expect(claimResult[0]?.status).toBe('fulfilled');
      expect(effects).toBe(1);
    } finally {
      releaseEffectAttestation.resolve();
      fixture.cleanup();
    }
  });

  it('binds a callback claim to the exact store, record, transition, binding, and run', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[2]!;
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun,
          transition.kind, '1001'),
      );
      const claimRun = await workflowPermit(workflow, transition.claim, '2001');
      const claimStore = store(continuation, fixture.state(), now);
      const otherStore = store(continuation, fixture.state(), now);
      const sameOperationOtherAuthority = sourceAuthority(transition.claim);
      const otherTransition = FIXED_KINDS[5]!;
      const otherOperationAuthority = sourceAuthority(otherTransition.claim);
      await functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({
        ...issueInput(claimStore, claimRun, transition.kind, '2001'),
        effect: async (claim: object) => {
          const exact = claimAssertionInput(
            claim, claimStore, claimRun, transition.kind, '2001',
          );
          expect(functionExport(
            continuation, 'assertSealedRealmsProductionContinuationClaim',
          )!(exact)).toBe(true);
          for (const changed of [
            { store: otherStore },
            { sourceAuthority: sameOperationOtherAuthority },
            { sourceAuthority: otherOperationAuthority, kind: otherTransition.kind },
            { subject: 'release-other' },
            { evidenceDigest: 'f'.repeat(64) },
            { receiptDigests: ['e'.repeat(64)] },
            { predecessorDigests: ['f'.repeat(64)] },
            { runId: '2999' },
            { runAttempt: '2' },
          ]) {
            expect(() => functionExport(
              continuation, 'assertSealedRealmsProductionContinuationClaim',
            )!({ ...exact, ...changed })).toThrow(
              /SEALED_REALMS_CONTINUATION_CLAIM_INVALID/u,
            );
          }
        },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it('allows exactly one concurrent issuer for a scope generation', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[2]!;
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    const bothAttestationsEntered = deferred();
    const releaseAttestations = deferred();
    let entered = 0;
    const gate = async (requestNumber: number) => {
      if (requestNumber !== 2) return;
      entered += 1;
      if (entered === 2) bothAttestationsEntered.resolve();
      await releaseAttestations.promise;
    };
    try {
      const [firstRun, secondRun] = await Promise.all([
        workflowPermit(workflow, transition.issue, '1001', { onRunRequest: gate }),
        workflowPermit(workflow, transition.issue, '1002', { onRunRequest: gate }),
      ]);
      const first = functionExport(
        continuation, 'issueSealedRealmsProductionContinuation',
      )!(issueInput(store(continuation, fixture.state(), now, { value: 1 }), firstRun,
        transition.kind, '1001'));
      const second = functionExport(
        continuation, 'issueSealedRealmsProductionContinuation',
      )!(issueInput(store(continuation, fixture.state(), now, { value: 2 }), secondRun,
        transition.kind, '1002'));
      await bothAttestationsEntered.promise;
      releaseAttestations.resolve();
      const settled = await Promise.allSettled([first, second]);

      expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect(recordNames(fixture.home).filter(name => name.startsWith('issued-')))
        .toHaveLength(1);
    } finally {
      releaseAttestations.resolve();
      fixture.cleanup();
    }
  });

  it('rechecks expiry after effect attestation and before invoking the callback', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[2]!;
    const issuedAt = Date.parse('2026-09-01T00:00:00.000Z');
    let nowValue = issuedAt;
    const now = () => new Date(nowValue);
    const effectAttestationEntered = deferred();
    const releaseEffectAttestation = deferred();
    const effect = vi.fn();
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun,
          transition.kind, '1001'),
      );
      nowValue += 1_000;
      const claimRun = await workflowPermit(workflow, transition.claim, '2001', {
        onRunRequest: async requestNumber => {
          if (requestNumber === 3) {
            effectAttestationEntered.resolve();
            await releaseEffectAttestation.promise;
          }
        },
      });
      const attempt = functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), claimRun,
          transition.kind, '2001'),
        effect,
      });
      await effectAttestationEntered.promise;
      nowValue = issuedAt + 24 * 60 * 60 * 1_000;
      releaseEffectAttestation.resolve();

      await expect(attempt).rejects.toThrow(/SEALED_REALMS_CONTINUATION_EXPIRED/u);
      expect(effect).not.toHaveBeenCalled();
    } finally {
      releaseEffectAttestation.resolve();
      fixture.cleanup();
    }
  });

  it('rechecks expiry after the durable effect-resolution write', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[2]!;
    const issuedAt = Date.parse('2026-09-01T00:00:00.000Z');
    let nowValue = issuedAt;
    let advancedDuringResolution = false;
    const now = () => new Date(nowValue);
    const effect = vi.fn();
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun,
          transition.kind, '1001'),
      );
      nowValue += 1_000;
      const claimRun = await workflowPermit(workflow, transition.claim, '2001');
      const claimState = fixture.state((phase, path) => {
        if (phase === 'write-before-open' && /resolution-[a-f0-9]{64}\.lock$/u.test(path)) {
          advancedDuringResolution = true;
          nowValue = issuedAt + 24 * 60 * 60 * 1_000;
        }
      });

      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, claimState, now), claimRun,
          transition.kind, '2001'),
        effect,
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_EXPIRED/u);
      expect(advancedDuringResolution).toBe(true);
      expect(effect).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it('revokes callback authority before a queued microtask can reuse it', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[2]!;
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    const queuedFinished = deferred();
    let queuedOutcome = 'not-run';
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun,
          transition.kind, '1001'),
      );
      const claimRun = await workflowPermit(workflow, transition.claim, '2001');
      const claimStore = store(continuation, fixture.state(), now);
      await functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({
        ...issueInput(claimStore, claimRun, transition.kind, '2001'),
        effect: (claim: object) => {
          const exact = claimAssertionInput(
            claim, claimStore, claimRun, transition.kind, '2001',
          );
          expect(functionExport(
            continuation, 'assertSealedRealmsProductionContinuationClaim',
          )!(exact)).toBe(true);
          queueMicrotask(() => {
            try {
              functionExport(
                continuation, 'assertSealedRealmsProductionContinuationClaim',
              )!(exact);
              queuedOutcome = 'valid';
            } catch (error) {
              queuedOutcome = String(error);
            } finally {
              queuedFinished.resolve();
            }
          });
        },
      });
      await queuedFinished.promise;

      expect(queuedOutcome).toMatch(/SEALED_REALMS_CONTINUATION_CLAIM_INVALID/u);
    } finally {
      fixture.cleanup();
    }
  });

  it('revokes a retained callback claim before terminal attestation begins', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[2]!;
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    const terminalAttestationEntered = deferred();
    const releaseTerminalAttestation = deferred();
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun,
          transition.kind, '1001'),
      );
      const claimRun = await workflowPermit(workflow, transition.claim, '2001', {
        onRunRequest: async requestNumber => {
          if (requestNumber === 4) {
            terminalAttestationEntered.resolve();
            await releaseTerminalAttestation.promise;
          }
        },
      });
      const claimStore = store(continuation, fixture.state(), now);
      let retained: object | undefined;
      const attempt = functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(claimStore, claimRun, transition.kind, '2001'),
        effect: async (claim: object) => { retained = claim; },
      });
      await terminalAttestationEntered.promise;
      let assertionError: unknown;
      try {
        functionExport(
          continuation, 'assertSealedRealmsProductionContinuationClaim',
        )!(claimAssertionInput(
          retained, claimStore, claimRun, transition.kind, '2001',
        ));
      } catch (error) {
        assertionError = error;
      } finally {
        releaseTerminalAttestation.resolve();
      }
      await expect(attempt).resolves.toEqual({ status: 'completed' });
      expect(String(assertionError)).toMatch(/SEALED_REALMS_CONTINUATION_CLAIM_INVALID/u);
    } finally {
      releaseTerminalAttestation.resolve();
      fixture.cleanup();
    }
  });

  it('allows exactly one concurrent durable claim before either callback effect', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    try {
      const transition = FIXED_KINDS[2]!;
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun, transition.kind, '1001'),
      );
      const [first, second] = await Promise.all([
        workflowPermit(workflow, transition.claim, '2001'),
        workflowPermit(workflow, transition.claim, '2002'),
      ]);
      let effects = 0;
      const attempt = (run: Awaited<ReturnType<typeof workflowPermit>>, runId: string) =>
        functionExport(continuation, 'claimSealedRealmsProductionContinuation')!({
          ...issueInput(store(continuation, fixture.state(), now), run, transition.kind, runId),
          effect: async () => { effects += 1; await Promise.resolve(); },
        });
      const settled = await Promise.allSettled([
        attempt(first, '2001'), attempt(second, '2002'),
      ]);
      expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect(effects).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects missing, wrong operation/source/subject/predecessor, injected paths, and serialized capabilities before callbacks', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const transition = FIXED_KINDS[2]!;
    const callback = vi.fn();
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    const fixture = privateFixture();
    try {
      const claimRun = await workflowPermit(workflow, transition.claim, '2001');
      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), claimRun,
          transition.kind, '2001'),
        effect: callback,
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_MISSING/u);

      const wrongOperation = await workflowPermit(workflow, 'ptr-import-inspect', '1001');
      await expect(functionExport(
        continuation, 'issueSealedRealmsProductionContinuation',
      )!(issueInput(store(continuation, fixture.state(), now), wrongOperation,
        transition.kind, '1001'))).rejects.toThrow(/SEALED_REALMS_CONTINUATION_OPERATION_INVALID/u);

      const issuedRun = await workflowPermit(workflow, transition.issue, '1002');
      const continuationStore = store(continuation, fixture.state(), now);
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(continuationStore, issuedRun, transition.kind, '1002'),
      );
      for (const changed of [
        { subject: 'release-other' },
        { predecessorDigests: ['e'.repeat(64)] },
        { evidenceDigest: 'f'.repeat(64) },
      ]) {
        const later = await workflowPermit(workflow, transition.claim,
          String(2100 + Object.keys(changed)[0]!.length));
        await expect(functionExport(
          continuation, 'claimSealedRealmsProductionContinuation',
        )!({
          ...issueInput(store(continuation, fixture.state(), now), later,
            transition.kind, String(2100 + Object.keys(changed)[0]!.length)),
          ...changed,
          effect: callback,
        })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_BINDING_INVALID/u);
      }
      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), claimRun,
          transition.kind, '2001'),
        store: JSON.parse(JSON.stringify(continuationStore)),
        effect: callback,
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_STORE_INVALID/u);
      await expect(functionExport(
        continuation, 'issueSealedRealmsProductionContinuation',
      )!({
        ...issueInput(continuationStore, issuedRun, '../g002-publication', '1002'),
        path: '../private',
        recordDigest: '0'.repeat(64),
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_INPUT_INVALID/u);

      const wrongSource = await workflowPermit(workflow, transition.claim, '3001', {
        sourceCommit: A,
      });
      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), wrongSource,
          transition.kind, '3001'),
        effect: callback,
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_MISSING|SOURCE/u);
      expect(callback).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it.each(['expired', 'duplicate', 'orphan', 'malformed', 'wrong lane', 'wrong run'])(
    'rejects an %s durable record before a callback',
    async corruption => {
      const [workflow, continuation] = await Promise.all([
        loadWorkflow(), loadContinuation(),
      ]);
      if (!requireModules(workflow, continuation)) return;
      const fixture = privateFixture();
      const transition = FIXED_KINDS[2]!;
      let nowValue = Date.parse('2026-09-01T00:00:00.000Z');
      const now = () => new Date(nowValue);
      const callback = vi.fn(async () => { throw new Error('crash after claim'); });
      try {
        const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
        await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
          issueInput(store(continuation, fixture.state(), now), issuedRun,
            transition.kind, '1001'),
        );
        if (corruption === 'expired') nowValue += 24 * 60 * 60 * 1_000 + 1;
        if (corruption === 'duplicate') {
          rewriteIssued(fixture.home, record => { record.nonce = '9'.repeat(64); }, true);
        }
        if (corruption === 'malformed') {
          const current = issuedPath(fixture.home);
          writeFileSync(current.path, '{}\n');
        }
        if (corruption === 'wrong lane') {
          rewriteIssued(fixture.home, record => { record.lane = 'ptr'; });
        }
        if (corruption === 'wrong run') {
          rewriteIssued(fixture.home, record => { record.issuanceRunId = '9999'; });
        }
        if (corruption === 'orphan') {
          const crashRun = await workflowPermit(workflow, transition.claim, '1901');
          await expect(functionExport(
            continuation, 'claimSealedRealmsProductionContinuation',
          )!({
            ...issueInput(store(continuation, fixture.state(), now), crashRun,
              transition.kind, '1901'),
            effect: callback,
          })).rejects.toThrow(/AMBIGUOUS/u);
          rmSync(issuedPath(fixture.home).path);
          callback.mockClear();
        }
        const claimRun = await workflowPermit(workflow, transition.claim, '2001');
        await expect(functionExport(
          continuation, 'claimSealedRealmsProductionContinuation',
        )!({
          ...issueInput(store(continuation, fixture.state(), now), claimRun,
            transition.kind, '2001'),
          effect: callback,
        })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_/u);
        expect(callback).not.toHaveBeenCalled();
      } finally {
        fixture.cleanup();
      }
    },
  );

  it('retains a pre-effect claim on permit drift and only read-only reconciliation can release no-effect', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[2]!;
    const now = () => new Date('2026-09-01T00:00:00.000Z');
    const effect = vi.fn();
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun,
          transition.kind, '1001'),
      );
      const drifted = await workflowPermit(workflow, transition.claim, '2001', {
        driftRunRequest: 3,
      });
      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), drifted,
          transition.kind, '2001'),
        effect,
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_|SEALED_REALMS_WORKFLOW_AUTHORITY_/u);
      expect(effect).not.toHaveBeenCalled();
      expect(recordNames(fixture.home).some(name => name.startsWith('claimed-'))).toBe(true);

      const retry = await workflowPermit(workflow, transition.claim, '2002', {
        runStatus: requestedRunId => requestedRunId === '2001'
          ? 'completed'
          : 'in_progress',
      });
      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), retry,
          transition.kind, '2002'),
        effect,
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_AMBIGUOUS/u);
      const retryInput = issueInput(store(continuation, fixture.state(), now), retry,
        transition.kind, '2002');
      await expect(functionExport(
        continuation, 'reconcileSealedRealmsProductionContinuation',
      )!({
        ...retryInput,
        readOnlyReconcile: async () => ({
          outcome: 'no-effect', observationDigest: '9'.repeat(64),
        }),
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_RECONCILIATION_INVALID/u);

      const reconcileRetry = await workflowPermit(workflow, transition.claim, '2003', {
        runStatus: requestedRunId => requestedRunId === '2001'
          ? 'completed'
          : 'in_progress',
      });
      const reconcileRetryInput = issueInput(
        store(continuation, fixture.state(), now), reconcileRetry,
        transition.kind, '2003',
      );
      const reconciled = await functionExport(
        continuation, 'reconcileSealedRealmsProductionContinuation',
      )!({
        ...reconcileRetryInput,
        readOnlyReconcile: async (reconciliation: unknown) => functionExport(
          continuation, 'classifySealedRealmsProductionContinuationNoEffect',
        )!({
          reconciliation,
          evidenceDigest: reconcileRetryInput.evidenceDigest,
          observationDigest: '9'.repeat(64),
        }),
      });
      expect(reconciled).toEqual({ status: 'reconciled', outcome: 'no-effect' });

      const freshInspect = await workflowPermit(workflow, transition.issue, '3001');
      await expect(functionExport(
        continuation, 'issueSealedRealmsProductionContinuation',
      )!(issueInput(store(continuation, fixture.state(), now), freshInspect,
        transition.kind, '3001'))).resolves.toEqual({ status: 'issued' });
    } finally {
      fixture.cleanup();
    }
  });

  it('never replays a callback that crashes after its effect and reconciles it terminally', async () => {
    const [workflow, continuation] = await Promise.all([
      loadWorkflow(), loadContinuation(),
    ]);
    if (!requireModules(workflow, continuation)) return;
    const fixture = privateFixture();
    const transition = FIXED_KINDS[5]!;
    let nowValue = Date.parse('2026-09-01T00:00:00.000Z');
    const now = () => new Date(nowValue);
    let effects = 0;
    try {
      const issuedRun = await workflowPermit(workflow, transition.issue, '1001');
      await functionExport(continuation, 'issueSealedRealmsProductionContinuation')!(
        issueInput(store(continuation, fixture.state(), now), issuedRun,
          transition.kind, '1001'),
      );
      nowValue += 1_000;
      const claimRun = await workflowPermit(workflow, transition.claim, '2001');
      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), claimRun,
          transition.kind, '2001'),
        effect: async () => { effects += 1; throw new Error('process crash after mutation'); },
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS/u);
      expect(effects).toBe(1);

      const retryRun = await workflowPermit(workflow, transition.claim, '2002');
      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), retryRun,
          transition.kind, '2002'),
        effect: async () => { effects += 1; },
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_AMBIGUOUS/u);
      expect(effects).toBe(1);

      const reconcileRun = await workflowPermit(workflow, transition.claim, '3001', {
        runStatus: requestedRunId => requestedRunId === '2001'
          ? 'completed'
          : 'in_progress',
      });
      const readOnlyReconcile = vi.fn(async () => ({
        outcome: 'effect-applied', observationDigest: '8'.repeat(64),
      }));
      await expect(functionExport(
        continuation, 'reconcileSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), reconcileRun,
          transition.kind, '3001'),
        readOnlyReconcile,
      })).resolves.toEqual({ status: 'reconciled', outcome: 'effect-applied' });
      expect(readOnlyReconcile).toHaveBeenCalledTimes(1);
      expect(recordNames(fixture.home).some(name => name.startsWith('terminal-'))).toBe(true);

      const finalRun = await workflowPermit(workflow, transition.claim, '4001');
      await expect(functionExport(
        continuation, 'claimSealedRealmsProductionContinuation',
      )!({
        ...issueInput(store(continuation, fixture.state(), now), finalRun,
          transition.kind, '4001'),
        effect: async () => { effects += 1; },
      })).rejects.toThrow(/SEALED_REALMS_CONTINUATION_TERMINAL/u);
      expect(effects).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });
});
