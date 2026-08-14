import { describe, expect, it } from 'vitest';

import {
  ProductionPlayerCanaryCommandAuthorityError,
  deriveProductionPlayerCanaryCommandAuthorityV1,
} from '../scripts/production-player-canary-command-authority.mjs';

describe('production player canary command authority', () => {
  it('pins the cross-runtime fixed vector and rejects extra/caller-shaped input', () => {
    const input = {
      evidenceNonce: 'a'.repeat(64),
      reviewedAdmissionPlanDigest: 'b'.repeat(64),
      serverBaselineCommitment: 'c'.repeat(64),
      routeSetCommitment: 'd'.repeat(64),
    };
    const authority = deriveProductionPlayerCanaryCommandAuthorityV1(input);
    expect(authority.commandSetCommitment).toBe(
      '5f6bd8f228fe6df5f54d6a9ac852d55774f574c1c08aa2d263930adc0933f5a2',
    );
    expect(authority.commands[0]).toEqual({
      ordinal: 1,
      dispatchIdempotencyKey:
        'pc1-d01-395e313394f5da8c705de5112a57e29c74678d6795f55b509f6169a1f0c09080',
      recallIdempotencyKey:
        'pc1-r01-821f764e1a723152e1c4883709c0644a8204eecfd978a60caa289fca64ea733d',
    });
    expect(() => deriveProductionPlayerCanaryCommandAuthorityV1({
      ...input,
      dispatchIdempotencyKeys: [],
    } as never)).toThrowError(ProductionPlayerCanaryCommandAuthorityError);
  });
});
