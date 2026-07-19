type PublicResourceSite = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

export const REALM_GOLD_SITE_POLICY_VERSION = 'genesis-001-tier1-gold-sites-v3';
export const REALM_GOLD_SITE_CATALOG_DIGEST =
  '84ea3eed9ff5cd3eb7e4704aee6fb562ef3f969c490e95d3bf88645abded7d7d';
export const REALM_FOOD_SITE_POLICY_VERSION = 'genesis-001-tier1-food-sites-v2';
export const REALM_FOOD_SITE_CATALOG_DIGEST =
  '10756337e27138b536a250ad6bf704c603a8c3946c72a1f0d3a041630610ce72';
export const REALM_WOOD_SITE_POLICY_VERSION = 'genesis-001-tier1-wood-sites-v2';
export const REALM_WOOD_SITE_CATALOG_DIGEST =
  '3f0ae99d2052c32b7fec9aec6126e86f53031c13d619fcef12dd42a02b4063d6';

const GOLD_COORDINATES =
  '-13,-20;24,34;-51,57;57,-40;-57,19;31,-58;-8,18;38,-3;-13,57;-4,-53;20,-22;-43,-14;-28,9;-37,33;15,12;-28,48;42,-47;12,-37;-2,33;-20,-33;-57,39;-36,-2;57,-13;33,-16';
const FOOD_COORDINATES =
  '-27,-20;33,25;55,-57;-42,57;-57,28;18,-2;13,-52;-5,43;-22,20;58,-26;23,-33;-57,2;-7,-15;-33,4;42,-2;-10,-43;-57,51;14,19;33,-53;-10,28;43,-36;14,38;-23,57;-43,33;5,-32;-30,37;27,-19;-48,9;-42,-6;-10,-27;37,-11;-43,19;36,11;-27,12;2,25;17,-42;40,-48;-26,-32;53,-33;-24,-8;30,2;-29,48;7,50;-4,-38;-43,47;53,-6;26,-57;42,-25;-53,34;-20,28;9,14;48,-12;-17,47;-37,-20;5,37;-10,53;-9,37;-17,-5;25,12;23,25;46,7;28,-43;-32,22;28,-6;52,-45;-20,-18;9,-27;5,-42;36,-38;9,28;-4,-24;33,-17;-31,-12;-2,-50;47,-19;-38,36;25,32;-53,6;-47,43;-26,52;15,7;-43,2;-47,26;40,-57;37,-29;15,-47;-42,12;-53,41;37,-4;-40,-13;23,5;-22,5;-48,18;29,23;-11,-32;52,-18';
const WOOD_COORDINATES =
  '-28,12;58,-27;8,45;20,-52;-35,-23;-33,53;20,7;51,-57;-57,8;28,-23;-52,43;-9,22;-7,-35;48,-6;25,23;-25,-8;-48,20;8,-22;30,-43;-11,47;6,26;48,-40;-33,29;-13,-44;15,-37;28,-8;-21,38;39,8;-43,6;-8,57;-20,-28;-10,-22;-41,48;2,-47;38,-22;-5,33;-22,53;-57,31;22,-32;-38,14;19,19;38,-9;10,12;20,33;3,40;-28,2;57,-53;-32,-10;5,-28;52,-30;39,-43;-57,21;-48,34;-42,38;34,-52;-22,15;-19,-4;-32,21;12,-48;53,-19;-2,48;28,-57;-18,57;31,16;-28,-24;-48,27;24,-27;10,38;12,20;-35,47;-28,58;-18,-24;14,-28;-27,24;-15,32;-27,38;28,-48;38,-48;53,-45;-47,39;52,-49;-23,8;12,25;-53,38;-12,-30;-20,48;-37,9;33,-4;28,-13;-2,28;23,9;13,-23;-33,10;-31,48;6,-33;-42,33';

function decodeCoordinates(value: string) {
  return Object.freeze(value.split(';').map((entry) => {
    const [q, r] = entry.split(',').map(Number);
    if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) {
      throw new Error('REALM_RESOURCE_SITE_CATALOG_CONTRACT_INVALID');
    }
    return Object.freeze({ q: q!, r: r! });
  }));
}

const GOLD_SITE_COORDINATES = decodeCoordinates(GOLD_COORDINATES);
const FOOD_SITE_COORDINATES = decodeCoordinates(FOOD_COORDINATES);
const WOOD_SITE_COORDINATES = decodeCoordinates(WOOD_COORDINATES);

export const REALM_GOLD_SITE_COUNT = GOLD_SITE_COORDINATES.length;
export const REALM_FOOD_SITE_COUNT = FOOD_SITE_COORDINATES.length;
export const REALM_WOOD_SITE_COUNT = WOOD_SITE_COORDINATES.length;

function exactCanonicalCatalog(
  rows: readonly PublicResourceSite[],
  family: 'gold' | 'food' | 'wood',
  idWidth: number,
  coordinates: readonly Readonly<{ q: number; r: number }>[]
) {
  if (rows.length !== coordinates.length) return false;
  const prefix = `genesis-001-tier1-${family}-`;
  const seen = new Uint8Array(coordinates.length);
  for (const row of rows) {
    if (
      typeof row?.siteId !== 'string'
      || !row.siteId.startsWith(prefix)
      || row.siteId.length !== prefix.length + idWidth
      || row.tier !== 1
      || row.active !== true
    ) return false;
    const ordinalText = row.siteId.slice(prefix.length);
    if (!/^\d+$/.test(ordinalText)) return false;
    const index = Number(ordinalText) - 1;
    const expected = coordinates[index];
    if (
      expected === undefined
      || seen[index] === 1
      || row.q !== expected.q
      || row.r !== expected.r
    ) return false;
    seen[index] = 1;
  }
  return seen.every((value) => value === 1);
}

export function isCanonicalRealmGoldSiteCatalog(rows: readonly PublicResourceSite[]) {
  return exactCanonicalCatalog(rows, 'gold', 2, GOLD_SITE_COORDINATES);
}

export function isCanonicalRealmFoodSiteCatalog(rows: readonly PublicResourceSite[]) {
  return exactCanonicalCatalog(rows, 'food', 3, FOOD_SITE_COORDINATES);
}

export function isCanonicalRealmWoodSiteCatalog(rows: readonly PublicResourceSite[]) {
  return exactCanonicalCatalog(rows, 'wood', 3, WOOD_SITE_COORDINATES);
}
