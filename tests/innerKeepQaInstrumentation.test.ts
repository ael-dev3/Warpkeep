import { describe, expect, it } from 'vitest';

import { installInnerKeepQaInstrumentation } from '../src/dev/innerKeepQaInstrumentation';

describe('Inner Keep QA runtime instrumentation', () => {
  it('counts live renderers instead of cumulative hot-reload creations', () => {
    const instrumentation = installInnerKeepQaInstrumentation(window);
    try {
      const releaseFirst = instrumentation.recordRendererCreated();
      const releaseSecond = instrumentation.recordRendererCreated();
      expect(instrumentation.snapshot().rendererCount).toBe(2);
      releaseFirst();
      releaseFirst();
      expect(instrumentation.snapshot().rendererCount).toBe(1);
      releaseSecond();
      expect(instrumentation.snapshot().rendererCount).toBe(0);
    } finally {
      instrumentation.restore();
    }
  });
});
