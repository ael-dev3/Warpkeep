import assert from 'node:assert/strict';
import test from 'node:test';

import {
  greaterRealmWorkerRouteStepsWithinBoundV1,
} from '../src/greaterRealmWorkerAuthority';
import {
  productionPlayerCanaryCommandAuthorityV1,
  productionPlayerCanaryRouteSetCommitmentV1,
  selectProductionPlayerCanaryEqualRoutesV1,
} from '../src/productionPlayerCanaryRoutePolicy';

const NONCE = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const BASELINE = 'c'.repeat(64);
const ROUTE = 'd'.repeat(64);

test('server command derivation matches the independent browser fixed vector', () => {
  const authority = productionPlayerCanaryCommandAuthorityV1({
    evidenceNonce: NONCE,
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment: ROUTE,
  });
  assert.deepEqual(authority.commands.map(command => ({
    dispatch: command.dispatchIdempotencyKey,
    recall: command.recallIdempotencyKey,
  })), [
    {
      dispatch: 'pc1-d01-395e313394f5da8c705de5112a57e29c74678d6795f55b509f6169a1f0c09080',
      recall: 'pc1-r01-821f764e1a723152e1c4883709c0644a8204eecfd978a60caa289fca64ea733d',
    },
    {
      dispatch: 'pc1-d02-2b1f3855a49ef4a1d673c992ffbcd58976dc775c70268d618a18d68af50db2c3',
      recall: 'pc1-r02-124cb05fc26cd047596613471198a5e87c6dfe416d575894ae4e82e3ef27f700',
    },
    {
      dispatch: 'pc1-d03-9c0d1ad82e64138e65ae35fa6b0929d1b83bf3ddcb78d6e91e1317facbde04e4',
      recall: 'pc1-r03-412008be7e68262551f0dc2602ed5048cc2c2aaae458a62c6953be25acf4c6c8',
    },
    {
      dispatch: 'pc1-d04-f0a76fe36b5c3e45aef06dd346cfa9434e83f7c52a9272c912f2816d7f2afb90',
      recall: 'pc1-r04-bbfe3067eac01aa0b894541f1617491902948182716e9a0a8534fd9c2988bfba',
    },
  ]);
  assert.equal(
    authority.commandSetCommitment,
    '5f6bd8f228fe6df5f54d6a9ac852d55774f574c1c08aa2d263930adc0933f5a2',
  );
});

test('equal-route selection is permutation invariant and uses exact capacity/ASCII ties', () => {
  const kinds = ['food', 'wood', 'stone', 'gold'] as const;
  const workers = kinds.map((_kind, index) => ({
    ordinal: index + 1,
    workerId: `genesis-001-castle-9-worker-0${index + 1}`,
  }));
  const id = (letter: string) => `GRL-${letter.repeat(26)}`;
  const candidates = [
    { resourceKind: 'food' as const, locationId: id('C'), routeSteps: 2, nodeCount: 9 },
    { resourceKind: 'food' as const, locationId: id('B'), routeSteps: 2, nodeCount: 9 },
    { resourceKind: 'food' as const, locationId: id('A'), routeSteps: 2, nodeCount: 8 },
    { resourceKind: 'food' as const, locationId: id('Z'), routeSteps: 1, nodeCount: 32 },
    ...(['wood', 'stone', 'gold'] as const).flatMap((resourceKind, index) => [
      { resourceKind, locationId: id(String.fromCharCode(68 + index)), routeSteps: 2, nodeCount: 4 },
      { resourceKind, locationId: id(String.fromCharCode(72 + index)), routeSteps: 3, nodeCount: 32 },
    ]),
  ];
  const expected = selectProductionPlayerCanaryEqualRoutesV1({
    atlasRevision: 7n,
    workers,
    candidates,
  });
  const permuted = selectProductionPlayerCanaryEqualRoutesV1({
    atlasRevision: 7n,
    workers,
    candidates: [...candidates].reverse(),
  });
  assert.deepEqual(permuted, expected);
  assert.deepEqual(expected.map(route => route.resourceKind), kinds);
  assert.ok(expected.every(route => route.routeSteps === 2));
  assert.equal(expected[0]!.locationId, id('B'));
  assert.match(productionPlayerCanaryRouteSetCommitmentV1({
    evidenceNonce: NONCE,
    reviewedAdmissionPlanDigest: PLAN,
    routes: expected,
  }), /^[0-9a-f]{64}$/u);
});

function cell(depth: number) {
  return {
    cellKey: depth === 0 ? 'root' : `cell-${depth}`,
    atlasId: 'atlas',
    componentKey: 'component',
    tier: 1,
    passable: true,
    routeDepth: depth,
    routeParentDirection: depth === 0 ? undefined : 0,
    sealedBoundaryMask: 0,
    atlasQ: -depth,
    atlasR: 0,
  };
}

test('canary route distance aborts a 4096-depth chain after exactly twelve parent reads', () => {
  const root = cell(0);
  const origin = cell(4_096);
  const coordinates = new Map<string, ReturnType<typeof cell>>();
  for (let depth = 4_095; depth >= 4_084; depth -= 1) {
    const row = cell(depth);
    coordinates.set(`A:${row.atlasQ}:${row.atlasR}`, row);
  }
  let parentReads = 0;
  const ctx = {
    db: {
      greaterRealmCellV1: {
        cellKey: { find: (key: string) => key === 'root' ? root : null },
        atlasCoordKey: { find: (key: string) => {
          parentReads += 1;
          return coordinates.get(key) ?? null;
        } },
      },
    },
  } as never;
  assert.equal(greaterRealmWorkerRouteStepsWithinBoundV1(
    ctx, 'atlas', 'component', 'root', origin as never, root as never, 12,
  ), undefined);
  assert.equal(parentReads, 12);
});
