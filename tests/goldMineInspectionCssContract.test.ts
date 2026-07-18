import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const CSS = readFileSync(
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

describe('Gold Mine inspection visual contract', () => {
  it('keeps the high-resolution art visibly overhanging but non-interactive', () => {
    const inspector = block(CSS, '.gold-mine-inspection {');
    const stage = block(CSS, '.gold-mine-inspection__art-stage {');
    const art = block(CSS, '.gold-mine-inspection__hero-art {');
    const drawer = block(CSS, '.gold-mine-inspection__drawer {');
    const close = block(CSS, '.gold-mine-inspection__dismiss {');

    expect(inspector).toContain('padding-top: clamp(4.45rem, 13vw, 5.6rem);');
    expect(stage).toContain('position: absolute;');
    expect(stage).toContain('top: 0;');
    expect(stage).toContain('pointer-events: none;');
    expect(art).toContain('object-fit: contain;');
    expect(art).toContain('pointer-events: none;');
    expect(art).toContain('user-select: none;');
    expect(drawer).toContain('overflow: hidden;');
    expect(close).toContain('z-index: 5;');
    expect(close).toContain('min-width: 2.75rem;');
    expect(close).toContain('min-height: 2.75rem;');
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
