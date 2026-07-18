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
  it('stages the high-resolution record art while retaining the shared safe dismiss shell', () => {
    const inspector = block(CAMP_CSS, '.logging-camp-inspection.gold-mine-inspection {');
    const stage = block(CAMP_CSS, '.logging-camp-inspection__art-stage.gold-mine-inspection__art-stage {');
    const art = block(CAMP_CSS, '.logging-camp-inspection__hero-art.gold-mine-inspection__hero-art {');
    const drawer = block(SHARED_CSS, '.gold-mine-inspection__drawer {');
    const close = block(SHARED_CSS, '.gold-mine-inspection__dismiss {');

    expect(inspector).toContain('padding-top: clamp(');
    expect(stage).toContain('top: -0.28rem;');
    expect(stage).toContain('width: min(');
    expect(stage).toContain('height: clamp(');
    expect(art).toContain('object-fit: contain;');
    expect(art).toContain('object-position: 50% 54%;');
    expect(art).toContain('transform: translateY(');
    expect(art).toContain('drop-shadow(');
    expect(SHARED_CSS).toContain('.gold-mine-inspection__art-stage');
    expect(SHARED_CSS).toContain('pointer-events: none;');
    expect(drawer).toContain('overflow: hidden;');
    expect(close).toContain('z-index: 5;');
    expect(close).toContain('min-width: 2.75rem;');
    expect(close).toContain('min-height: 2.75rem;');
    expect(SHARED_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
