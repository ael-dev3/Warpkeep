import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const marker = 'warpkeep-admission-notifications-presentation-enabled-v1';

describe('admission notification presentation build marker', () => {
  it('emits one exact marker only behind the canonical true build literal', () => {
    const source = readFileSync(resolve(repositoryRoot, 'src/main.tsx'), 'utf8');

    expect(source.split(marker)).toHaveLength(2);
    expect(source).toContain(
      "import.meta.env.VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED === 'true'",
    );
    expect(source).toContain(
      'document.documentElement.dataset.warpkeepAdmissionNotificationsPresentation',
    );
    expect(source).not.toMatch(/VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED\s*!==/u);
  });
});
