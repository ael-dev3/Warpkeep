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
  'pc1-d01-395e313394f5da8c705de5112a57e29c74678d6795f55b509f6169a1f0c09080',
  'pc1-d02-2b1f3855a49ef4a1d673c992ffbcd58976dc775c70268d618a18d68af50db2c3',
  'pc1-d03-9c0d1ad82e64138e65ae35fa6b0929d1b83bf3ddcb78d6e91e1317facbde04e4',
  'pc1-d04-f0a76fe36b5c3e45aef06dd346cfa9434e83f7c52a9272c912f2816d7f2afb90',
]);
const RECALL_KEYS = Object.freeze([
  'pc1-r01-821f764e1a723152e1c4883709c0644a8204eecfd978a60caa289fca64ea733d',
  'pc1-r02-124cb05fc26cd047596613471198a5e87c6dfe416d575894ae4e82e3ef27f700',
  'pc1-r03-412008be7e68262551f0dc2602ed5048cc2c2aaae458a62c6953be25acf4c6c8',
  'pc1-r04-bbfe3067eac01aa0b894541f1617491902948182716e9a0a8534fd9c2988bfba',
]);
const COMMAND_SET_COMMITMENT =
  '5f6bd8f228fe6df5f54d6a9ac852d55774f574c1c08aa2d263930adc0933f5a2';

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
    expect(JSON.stringify(plan)).not.toContain('pc1-');

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
