import { describe, expect, it } from 'vitest';

import { readInnerKeepQaRendererEvidence } from '../src/dev/innerKeepQaRendererEvidence';

describe('Inner Keep QA renderer evidence', () => {
  it('publishes actual settled renderer counters separately from graph estimates', () => {
    expect(readInnerKeepQaRendererEvidence({
      info: { render: { calls: 287, triangles: 412_905 } },
    })).toEqual({ drawCalls: 287, triangles: 412_905 });
  });

  it('uses safe zeroes before the first renderer frame', () => {
    expect(readInnerKeepQaRendererEvidence(null)).toEqual({
      drawCalls: 0,
      triangles: 0,
    });
  });
});
