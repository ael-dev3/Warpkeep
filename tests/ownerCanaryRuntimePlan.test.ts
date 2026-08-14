import { describe, expect, it, vi } from 'vitest';

import {
  createOwnerCanaryRuntimePlanBoundary,
  ownerCanaryRuntimePlanFailureCode,
  ownerCanaryRuntimePlanTestSeams,
} from '../src/owner-canary/ownerCanaryRuntimePlan';

const INPUT = Object.freeze({
  evidenceNonce: 'a'.repeat(64),
  reviewedAdmissionPlanDigest: 'b'.repeat(64),
  serverBaselineCommitment: 'c'.repeat(64),
  routeSetCommitment: 'd'.repeat(64),
});

const DISPATCH_KEYS = Object.freeze([
  'pc2-d01-c7c5fb03fba4f6f4c5addc3fca0130884ceb1e6b8df6b58ee9690c0d64cb547b',
  'pc2-d02-0a171407f85a979af42505e662b59196550f915e182528b44b07dca545168576',
  'pc2-d03-856c2366330d1bc6e8c7f495e5046f53c51cdf76a20e2ee7c84bb0a4c6d8d1e3',
  'pc2-d04-e5b958439a11ff76260c3c9513f1edcaad18412ab95e3cf56a42370eb1e391f5',
]);
const RECALL_KEYS = Object.freeze([
  'pc2-r01-2fcfce8e88179e426427cc30024f3ca568c8875c3fa4aa1682d2b0c082a50862',
  'pc2-r02-3fd24530443cd9fafd67355e85926f6a69d05a0e363a848be0abff635029cd65',
  'pc2-r03-a193b134012a5a5c2dd8e5c2fe2ebc3e677f4ffaf8cc2cc5dad4205dca68791b',
  'pc2-r04-e279382141a36349cb59c7386603177bcdfa19247b2dc71996b993ec0f232eb2',
]);
const COMMAND_SET_COMMITMENT =
  'e12bfcfd5d1aa8d1ca94e6d71bdf47b87d20fea14c5aaefe704d5c34eb2f42f4';

describe('owner canary private runtime plan', () => {
  it('matches the fixed cross-runtime command-key and ordered command-set vectors', async () => {
    expect(ownerCanaryRuntimePlanTestSeams).toBeDefined();
    const material = await ownerCanaryRuntimePlanTestSeams!.deriveCommandMaterial(INPUT);
    expect(material.dispatch).toEqual(DISPATCH_KEYS);
    expect(material.recall).toEqual(RECALL_KEYS);
    expect(material.commandSetCommitment).toBe(COMMAND_SET_COMMITMENT);

    const changedRoute = await ownerCanaryRuntimePlanTestSeams!.deriveCommandMaterial({
      ...INPUT,
      routeSetCommitment: 'e'.repeat(64),
    });
    expect(changedRoute.dispatch).not.toEqual(DISPATCH_KEYS);
    expect(changedRoute.recall).not.toEqual(RECALL_KEYS);
    expect(changedRoute.commandSetCommitment).not.toBe(COMMAND_SET_COMMITMENT);
  });

  it('keeps an empty frozen handle and releases only one selected key to its runtime consumer', async () => {
    const received: unknown[] = [];
    const boundary = createOwnerCanaryRuntimePlanBoundary<Readonly<{ session: number }>>(
      vi.fn(async (command) => {
        received.push(command);
      }),
    );
    const plan = await boundary.prepare({
      ...INPUT,
      expectedCommandSetCommitment: COMMAND_SET_COMMITMENT,
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.keys(plan)).toEqual([]);
    expect(JSON.stringify(plan)).toBe('{}');
    expect(JSON.stringify(plan)).not.toContain(INPUT.evidenceNonce);
    expect(JSON.stringify(plan)).not.toContain(INPUT.reviewedAdmissionPlanDigest);
    expect(JSON.stringify(plan)).not.toContain(INPUT.serverBaselineCommitment);
    expect(JSON.stringify(plan)).not.toContain(INPUT.routeSetCommitment);
    expect(JSON.stringify(plan)).not.toContain('pc2-');

    const authority = Object.freeze({ session: 7 });
    const signal = new AbortController().signal;
    await boundary.runCommand({
      plan,
      operation: 'dispatch',
      ordinal: 1,
      authority,
      signal,
    });
    expect(received).toEqual([{
      operation: 'dispatch',
      ordinal: 1,
      idempotencyKey: DISPATCH_KEYS[0],
      authority,
      signal,
    }]);
    expect(JSON.stringify(received)).not.toContain(INPUT.evidenceNonce);
    expect(JSON.stringify(received)).not.toContain(INPUT.reviewedAdmissionPlanDigest);
    expect(JSON.stringify(received)).not.toContain(INPUT.serverBaselineCommitment);
    expect(JSON.stringify(received)).not.toContain(INPUT.routeSetCommitment);
  });

  it('rejects malformed, substituted, and route-bearing preparation inputs', async () => {
    const consume = vi.fn(async () => undefined);
    const boundary = createOwnerCanaryRuntimePlanBoundary(consume);
    const invalidInputs = [
      { ...INPUT, expectedCommandSetCommitment: COMMAND_SET_COMMITMENT, routeSetCommitment: 'd'.repeat(63) },
      { ...INPUT, expectedCommandSetCommitment: COMMAND_SET_COMMITMENT.toUpperCase() },
      { ...INPUT, expectedCommandSetCommitment: COMMAND_SET_COMMITMENT, routes: [] },
      Object.assign(
        { ...INPUT, expectedCommandSetCommitment: COMMAND_SET_COMMITMENT },
        { [Symbol('raw-routes')]: [] },
      ),
    ];
    for (const input of invalidInputs) {
      const error = await boundary.prepare(input as never).catch((caught: unknown) => caught);
      expect(ownerCanaryRuntimePlanFailureCode(error)).toBe('invalid-plan-input');
    }
    const substituted = await boundary.prepare({
      ...INPUT,
      routeSetCommitment: 'e'.repeat(64),
      expectedCommandSetCommitment: COMMAND_SET_COMMITMENT,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryRuntimePlanFailureCode(substituted)).toBe('command-set-mismatch');
    expect(consume).not.toHaveBeenCalled();
  });

  it('poisons a plan after an ambiguous command failure and rejects reconstructed handles', async () => {
    const consume = vi.fn(async () => {
      throw new Error('synthetic lost response');
    });
    const boundary = createOwnerCanaryRuntimePlanBoundary(consume);
    const plan = await boundary.prepare({
      ...INPUT,
      expectedCommandSetCommitment: COMMAND_SET_COMMITMENT,
    });
    const command = {
      plan,
      operation: 'recall' as const,
      ordinal: 1 as const,
      authority: Object.freeze({}),
      signal: new AbortController().signal,
    };
    const first = await boundary.runCommand(command).catch((caught: unknown) => caught);
    expect(ownerCanaryRuntimePlanFailureCode(first)).toBe('command-failed');
    const retry = await boundary.runCommand(command).catch((caught: unknown) => caught);
    expect(ownerCanaryRuntimePlanFailureCode(retry)).toBe('plan-poisoned');
    expect(consume).toHaveBeenCalledOnce();

    const reconstructed = await boundary.runCommand({
      ...command,
      plan: Object.freeze({}) as typeof plan,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryRuntimePlanFailureCode(reconstructed)).toBe('invalid-plan-handle');
  });

  it('attenuates at first dispatch invocation to attempted-ordinal recall only and permits exact retry', async () => {
    const received: Array<Readonly<Record<string, unknown>>> = [];
    const consume = vi.fn(async (command: Readonly<Record<string, unknown>>) => {
      received.push(command);
      if (command.operation === 'dispatch') throw new Error('synthetic lost dispatch response');
    });
    const boundary = createOwnerCanaryRuntimePlanBoundary(consume);
    const plan = await boundary.prepare({
      ...INPUT,
      expectedCommandSetCommitment: COMMAND_SET_COMMITMENT,
    });
    await expect(boundary.runCommand({
      plan,
      operation: 'dispatch',
      ordinal: 2,
      authority: Object.freeze({}),
      signal: new AbortController().signal,
    })).rejects.toThrow('The owner canary runtime plan stopped.');
    const recovery = boundary.takeRecallRecoveryPlan(plan)!;
    expect(recovery).toBeDefined();
    expect(Object.isFrozen(recovery)).toBe(true);
    expect(Reflect.ownKeys(recovery)).toEqual([]);
    expect(JSON.stringify(recovery)).toBe('{}');
    expect('dispatch' in recovery).toBe(false);

    boundary.dispose(plan);
    const rejected = await boundary.runRecoveryRecall({
      plan: recovery,
      ordinal: 1,
      authority: Object.freeze({}),
      signal: new AbortController().signal,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryRuntimePlanFailureCode(rejected)).toBe('invalid-recovery-command');

    const authority = Object.freeze({ recovery: true });
    const signal = new AbortController().signal;
    await boundary.runRecoveryRecall({ plan: recovery, ordinal: 2, authority, signal });
    await boundary.runRecoveryRecall({ plan: recovery, ordinal: 2, authority, signal });
    expect(received.slice(1)).toEqual([
      {
        operation: 'recall',
        ordinal: 2,
        idempotencyKey: RECALL_KEYS[1],
        authority,
        signal,
      },
      {
        operation: 'recall',
        ordinal: 2,
        idempotencyKey: RECALL_KEYS[1],
        authority,
        signal,
      },
    ]);
    boundary.disposeRecallRecovery(recovery);
    const disposed = await boundary.runRecoveryRecall({
      plan: recovery,
      ordinal: 2,
      authority,
      signal,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryRuntimePlanFailureCode(disposed)).toBe('invalid-recovery-command');
  });

  it('invalidates a disposed plan without exposing or returning its command material', async () => {
    const boundary = createOwnerCanaryRuntimePlanBoundary(vi.fn(async () => undefined));
    const plan = await boundary.prepare({
      ...INPUT,
      expectedCommandSetCommitment: COMMAND_SET_COMMITMENT,
    });
    expect(boundary.dispose(plan)).toBeUndefined();
    const error = await boundary.runCommand({
      plan,
      operation: 'dispatch',
      ordinal: 4,
      authority: Object.freeze({}),
      signal: new AbortController().signal,
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryRuntimePlanFailureCode(error)).toBe('invalid-plan-handle');
  });
});
