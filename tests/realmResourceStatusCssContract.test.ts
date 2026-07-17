import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  resolve(import.meta.dirname, '../src/components/realm/RealmMapScreen.css'),
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

describe('Realm resource-status CSS contract', () => {
  it('keeps Marks visually distinct without treating it as an interactive control', () => {
    const marks = block(CSS, '.realm-resource-strip__item[data-status-kind="marks"] {');
    const strip = block(CSS, '.realm-resource-strip {');

    expect(marks).toContain('border-color: rgb(202 164 241 / 52%);');
    expect(strip).toContain('pointer-events: none;');
  });

  it('keeps five icon-only status items inside the narrow portrait rail', () => {
    const narrowPortrait = block(CSS, '@media (max-width: 430px) {');
    const item = block(narrowPortrait, '.realm-resource-strip__item {');
    const icon = block(narrowPortrait, '.realm-resource-strip__item :is(picture, img) {');

    expect(narrowPortrait).toContain('calc(100vw - 15rem - env(safe-area-inset-left) - env(safe-area-inset-right))');
    expect(item).toContain('grid-template-columns: 1fr;');
    expect(item).toContain('padding: 0.12rem;');
    expect(icon).toContain('width: 1.15rem;');
    expect(icon).toContain('height: 1.15rem;');
  });
});
