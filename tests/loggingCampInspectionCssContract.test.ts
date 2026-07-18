import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const CAMP_CSS = readFileSync(
  resolve(ROOT, 'src/components/realm/LoggingCampInspectionPanel.css'),
  'utf8'
);
const SHARED_CSS = readFileSync(
  resolve(ROOT, 'src/components/realm/GoldMineInspectionPanel.css'),
  'utf8'
);

function block(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, `Missing CSS marker: ${marker}`).toBeGreaterThanOrEqual(0);
  const opening = source.indexOf('{', markerIndex);
  expect(opening, `Missing opening brace after: ${marker}`).toBeGreaterThan(markerIndex);

  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(opening + 1, index);
  }
  throw new Error(`Unclosed CSS block: ${marker}`);
}

describe('Logging Camp inspection visual contract', () => {
  it('frames only the compact resource glyph while retaining the shared safe dismiss shell', () => {
    const inspector = block(CAMP_CSS, '.logging-camp-inspection.gold-mine-inspection {');
    const glyphLockup = block(CAMP_CSS, '.logging-camp-inspection__resource-lockup {');
    const glyph = block(CAMP_CSS, '.logging-camp-inspection__resource-icon {');
    const drawer = block(SHARED_CSS, '.gold-mine-inspection__drawer {');
    const close = block(SHARED_CSS, '.gold-mine-inspection__dismiss {');

    expect(inspector).toContain('padding-top: 0;');
    expect(glyphLockup).toContain('z-index: 3;');
    expect(glyphLockup).toContain('place-items: center;');
    expect(glyph).toContain('object-fit: contain;');
    expect(glyph).toContain('drop-shadow(');
    expect(CAMP_CSS).not.toContain('__hero-art');
    expect(CAMP_CSS).not.toContain('__art-stage');
    expect(drawer).toContain('overflow: hidden;');
    expect(close).toContain('z-index: 5;');
    expect(close).toContain('min-width: 2.75rem;');
    expect(close).toContain('min-height: 2.75rem;');
    expect(SHARED_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
