import assert from 'node:assert/strict';
import test from 'node:test';

import {
  greaterRealmWorkerRouteStepsWithinBoundV1,
} from '../src/greaterRealmWorkerAuthority';
import {
  productionPlayerCanaryCommandAuthorityV2,
  productionPlayerCanaryRouteSetCommitmentV1,
  selectProductionPlayerCanaryEqualRoutesV1,
} from '../src/productionPlayerCanaryRoutePolicy';

const NONCE = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const BASELINE = 'c'.repeat(64);
const ROUTE = 'd'.repeat(64);

test('server command derivation matches the independent browser fixed vector', () => {
  const authority = productionPlayerCanaryCommandAuthorityV2({
    challengeDigest: NONCE,
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment: ROUTE,
  });
  assert.deepEqual(authority.commands.map(command => ({
    dispatch: command.dispatchIdempotencyKey,
    recall: command.recallIdempotencyKey,
  })), [
    {
      dispatch: 'pc2-d01-a27e57760cdd1249f9bdd1dd992510504dc2d13cdcf53cd445d5b241bfb1cabe',
      recall: 'pc2-r01-5a462e21d437a3f00017c25bbdf83e052e9bf9c92bd358a62d8a8d0fe0b0e164',
    },
    {
      dispatch: 'pc2-d02-65761615f11604191a55a9ff402e01e5517243e349894f673b27ca65bfe5bcae',
      recall: 'pc2-r02-8cfcb6cb221a48e13a7dcf22667c75285387703ddaee21db0695afdbdab255d3',
    },
    {
      dispatch: 'pc2-d03-f4f0543e96c799313b6e553b79bc492794c3dcf57250b993a985e7fecc7a14a9',
      recall: 'pc2-r03-3875a694b3209aee90496d4d03ed123ced90ef0674cdbe5f754962da43539713',
    },
    {
      dispatch: 'pc2-d04-e68ae0a7108cbb7435c97dd5526a2fe4139eae0554f1ab162675965f6dc83e47',
      recall: 'pc2-r04-4cbf389b6b15ad26161b58802d28a15913bfbc8d8fb1dcc7e6c2b1afeaa9efcb',
    },
  ]);
  assert.equal(
    authority.commandSetCommitment,
    '23b1a478735aa32dd791393a0a6067841b8cacae437dcc245ac69f322a08134e',
  );
  assert.equal(
    authority.recoveryFenceIdempotencyKey,
    'pc2-f00-08e3175673b973588a2800d4df6dd4d1cc576531edbb43d3c00194d8cd3c2a59',
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
