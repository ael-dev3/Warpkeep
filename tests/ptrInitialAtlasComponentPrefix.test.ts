// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ptrInitialAtlasComponentPrefixExpectedRow, verifyPtrInitialAtlasComponentPrefix } from '../scripts/ptr-initial-atlas-component-prefix';

const atlasId = 'PTR_GREATER_REALM';
const component = { componentKey: 'component-a', componentOrdinal: 0, regionMask: 1, rootCellKey: 'cell-a',
  expectedCellCount: 7, maxRouteDepth: 3, expectedSlotCount: 2, expectedFoodNodeCount: 1,
  expectedWoodNodeCount: 2, expectedStoneNodeCount: 3, expectedGoldNodeCount: 4, componentSha256: 'a'.repeat(64) };
const components = [component, { ...component, componentKey: 'component-b', componentOrdinal: 1, rootCellKey: 'cell-b' }];
function fixture(count = 2) {
  return { atlasId, components, rows: components.slice(0, count).map(row => ptrInitialAtlasComponentPrefixExpectedRow(row, atlasId)),
    // Observed SQL schema orders some(String), none(empty Product); rows encode none as [1, []].
    release: { atlas_id: atlasId, component_manifest_json: `${JSON.stringify(components.slice(0, count))}\n`, region_manifest_json: [1, []] } };
}
describe('retained initialized component prefix', () => {
  it.each([[0, '[]\n'], [1, ['unexpected']], [1], { none: [] }, null].map(value => [value]))('rejects a noncanonical or present region option: %j', option => {
    const input = fixture(); (input.release as any).region_manifest_json = option;
    expect(() => verifyPtrInitialAtlasComponentPrefix(input)).toThrow();
  });
  it.each([0, 1, 2])('verifies the exact contiguous prefix of %s rows', count => {
    const input = fixture(count);
    expect(verifyPtrInitialAtlasComponentPrefix(input).componentCount).toBe(count);
  });
  it('accepts provider row ordering and decimal integer encoding', () => {
    const input = fixture(); input.rows.reverse();
    for (const row of input.rows) for (const key of Object.keys(row)) if (typeof row[key] === 'number') row[key] = String(row[key]);
    expect(verifyPtrInitialAtlasComponentPrefix(input).componentCount).toBe(2);
  });
  it.each(Object.keys(ptrInitialAtlasComponentPrefixExpectedRow(component, atlasId)))('rejects changed component field %s', key => {
    const input = fixture(), value = input.rows[0]![key];
    input.rows[0]![key] = typeof value === 'number' ? value + 1 : typeof value === 'boolean' ? !value : 'changed';
    expect(() => verifyPtrInitialAtlasComponentPrefix(input)).toThrow('PTR_INITIAL_ATLAS_COMPONENT_PREFIX_DIFFERENT');
  });
  it('rejects extra fields and duplicate ordinals', () => {
    const extra = fixture(); extra.rows[0]!.unexpected = 0;
    expect(() => verifyPtrInitialAtlasComponentPrefix(extra)).toThrow();
    const duplicate = fixture(); duplicate.rows[1] = duplicate.rows[0]!;
    expect(() => verifyPtrInitialAtlasComponentPrefix(duplicate)).toThrow();
  });
  it('rejects a manifest mismatch, regions already imported and a different atlas', () => {
    const manifest = fixture(); manifest.release.component_manifest_json = '[]\n';
    expect(() => verifyPtrInitialAtlasComponentPrefix(manifest)).toThrow();
    const regions = fixture(); (regions.release as any).region_manifest_json = { some: '[]\n' };
    expect(() => verifyPtrInitialAtlasComponentPrefix(regions)).toThrow();
    const atlas = fixture(); atlas.release.atlas_id = 'different';
    expect(() => verifyPtrInitialAtlasComponentPrefix(atlas)).toThrow();
  });
});
