import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const FOOD_CSS = readFileSync(
  resolve(ROOT, 'src/components/realm/FoodFarmInspectionPanel.css'),
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

describe('Food Farm inspection visual contract', () => {
  it('keeps the high-resolution Farm record visibly overhanging, pointer-inert, and safe to dismiss', () => {
    const inspector = block(FOOD_CSS, '.food-farm-inspection.gold-mine-inspection {');
    const stage = block(
      FOOD_CSS,
      '.food-farm-inspection__art-stage.gold-mine-inspection__art-stage {'
    );
    const farmArt = block(
      FOOD_CSS,
      '.food-farm-inspection__hero-art.gold-mine-inspection__hero-art {'
    );
    const sharedStage = block(SHARED_CSS, '.gold-mine-inspection__art-stage {');
    const sharedArt = block(SHARED_CSS, '.gold-mine-inspection__hero-art {');
    const drawer = block(SHARED_CSS, '.gold-mine-inspection__drawer {');
    const close = block(SHARED_CSS, '.gold-mine-inspection__dismiss {');

    expect(inspector).toMatch(/padding-top:\s*clamp\(/);
    expect(stage).toMatch(/top:\s*-/);
    expect(stage).toContain('width:');
    expect(stage).toContain('height:');
    expect(farmArt).toContain('object-fit: contain;');
    expect(farmArt).toContain('object-position:');
    expect(farmArt).toContain('transform:');
    expect(farmArt).toContain('drop-shadow(');
    expect(sharedStage).toContain('z-index: 2;');
    expect(sharedStage).toContain('pointer-events: none;');
    expect(sharedArt).toContain('pointer-events: none;');
    expect(sharedArt).toContain('user-select: none;');
    expect(drawer).toContain('overflow: hidden;');
    expect(close).toContain('z-index: 5;');
    expect(close).toContain('min-width: 2.75rem;');
    expect(close).toContain('min-height: 2.75rem;');
    expect(SHARED_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
