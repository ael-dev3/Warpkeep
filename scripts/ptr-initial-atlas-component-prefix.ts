import { GREATER_REALM_PUBLIC_REGIONS } from '../spacetimedb/ptr/src/atlasPolicy';
import { Sha256, updateLengthFramedSha256 } from '../spacetimedb/ptr/src/sha256';
import { updateCanonical, updateDigest } from './sealed-realms-existing-update-protocol.mjs';

const fail = (): never => { throw Object.assign(new Error('PTR_INITIAL_ATLAS_COMPONENT_PREFIX_DIFFERENT'),
  { code: 'PTR_INITIAL_ATLAS_COMPONENT_PREFIX_DIFFERENT' }); };
const sqlName = (name: string) => name.replace(/([a-z])([A-Z])/gu, '$1_$2').replace(/([a-z])([0-9])/gu, '$1_$2').toLowerCase();

/** Exact initialized rows, including all mutable counters, rather than counts alone. */
export function ptrInitialAtlasComponentPrefixExpectedRow(component: Readonly<Record<string, unknown>>, atlasId: string) {
  const hash = new Sha256().update('warpkeep.greater-realm.component.v1\n');
  updateLengthFramedSha256(hash, new TextEncoder().encode(`${JSON.stringify({ componentKey: component.componentKey })}\n`));
  updateLengthFramedSha256(hash, new TextEncoder().encode(`${JSON.stringify({ section: 'cells', count: component.expectedCellCount })}\n`));
  const row: Record<string, unknown> = { ...component, atlasId,
    importedCellCount: 0, verifiedCellCount: 0, verifiedRegionMask: 0, verifiedMaxRouteDepth: 0,
    importedSlotCount: 0, importedFoodNodeCount: 0, importedWoodNodeCount: 0,
    importedStoneNodeCount: 0, importedGoldNodeCount: 0, verifiedSlotCount: 0,
    verifiedFoodNodeCount: 0, verifiedWoodNodeCount: 0, verifiedStoneNodeCount: 0, verifiedGoldNodeCount: 0,
    verificationPhase: 'cells', verificationDigest: hash.serialize(), active: false,
    regionVerificationJson: `${JSON.stringify(GREATER_REALM_PUBLIC_REGIONS.map(region => ({ regionId: region.id,
      slotCount: 0, foodNodeCount: 0, woodNodeCount: 0, stoneNodeCount: 0, goldNodeCount: 0 })))}\n` };
  return Object.fromEntries(Object.entries(row).map(([name, value]) => [sqlName(name), value]));
}

export function verifyPtrInitialAtlasComponentPrefix(input: Readonly<{
  rows: readonly Readonly<Record<string, unknown>>[];
  release: Readonly<Record<string, unknown>>;
  components: readonly Readonly<Record<string, unknown>>[];
  atlasId: string;
}>) {
  const count = input.rows.length;
  if (count > input.components.length || input.release.atlas_id !== input.atlasId
    || input.release.component_manifest_json !== `${JSON.stringify(input.components.slice(0, count))}\n`
    // SQL's SATS sum representation: variant 1 is none, with an empty product.
    || updateCanonical(input.release.region_manifest_json) !== updateCanonical([1, []])) fail();
  const ordered = [...input.rows].sort((a, b) => Number(a.component_ordinal) - Number(b.component_ordinal));
  const expected = input.components.slice(0, count).map(component => ptrInitialAtlasComponentPrefixExpectedRow(component, input.atlasId));
  for (let index = 0; index < count; index++) {
    const actual = { ...ordered[index] };
    for (const [name, value] of Object.entries(expected[index]!)) {
      if (typeof value === 'number') {
        if (typeof actual[name] === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(actual[name] as string)) actual[name] = Number(actual[name]);
        if (!Number.isSafeInteger(actual[name])) fail();
      }
    }
    if (updateCanonical(actual) !== updateCanonical(expected[index])) fail();
  }
  return Object.freeze({ componentCount: count, digest: updateDigest({ rows: expected,
    componentManifestJson: input.release.component_manifest_json, regionManifestJson: input.release.region_manifest_json }) });
}
