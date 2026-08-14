import { describe, expect, it } from 'vitest';

import {
  ProductionPlayerCanaryCommandAuthorityError,
  deriveProductionPlayerCanaryCommandAuthorityV2,
} from '../scripts/production-player-canary-command-authority.mjs';

describe('production player canary command authority', () => {
  it('pins the cross-runtime fixed vector and rejects extra/caller-shaped input', () => {
    const input = {
      challengeDigest: 'a'.repeat(64),
      reviewedAdmissionPlanDigest: 'b'.repeat(64),
      serverBaselineCommitment: 'c'.repeat(64),
      routeSetCommitment: 'd'.repeat(64),
    };
    const authority = deriveProductionPlayerCanaryCommandAuthorityV2(input);
    expect(authority.commandSetCommitment).toBe(
      '23b1a478735aa32dd791393a0a6067841b8cacae437dcc245ac69f322a08134e',
    );
    expect(authority.commands[0]).toEqual({
      ordinal: 1,
      dispatchIdempotencyKey:
        'pc2-d01-a27e57760cdd1249f9bdd1dd992510504dc2d13cdcf53cd445d5b241bfb1cabe',
      recallIdempotencyKey:
        'pc2-r01-5a462e21d437a3f00017c25bbdf83e052e9bf9c92bd358a62d8a8d0fe0b0e164',
    });
    expect(authority.recoveryFenceIdempotencyKey).toBe(
      'pc2-f00-08e3175673b973588a2800d4df6dd4d1cc576531edbb43d3c00194d8cd3c2a59',
    );
    expect(() => deriveProductionPlayerCanaryCommandAuthorityV2({
      ...input,
      dispatchIdempotencyKeys: [],
    } as never)).toThrowError(ProductionPlayerCanaryCommandAuthorityError);
    let challengeRead = false;
    expect(() => deriveProductionPlayerCanaryCommandAuthorityV2({
      get challengeDigest() {
        challengeRead = true;
        return input.challengeDigest;
      },
      reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
      serverBaselineCommitment: input.serverBaselineCommitment,
      routeSetCommitment: input.routeSetCommitment,
    })).toThrowError(ProductionPlayerCanaryCommandAuthorityError);
    expect(challengeRead).toBe(false);
    expect(authority.commands.flatMap(command => [
      command.dispatchIdempotencyKey,
      command.recallIdempotencyKey,
    ])).toHaveLength(8);
    expect(authority.commands.every(command => (
      /^pc2-d0[1-4]-[0-9a-f]{64}$/u.test(command.dispatchIdempotencyKey)
      && /^pc2-r0[1-4]-[0-9a-f]{64}$/u.test(command.recallIdempotencyKey)
    ))).toBe(true);
  });
});
