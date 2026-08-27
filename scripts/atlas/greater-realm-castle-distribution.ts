import type { IndexedAxialGrid } from './greater-realm-terrain';

const HEX_NEIGHBOR_COUNT = 6;
const WATER_DRY = 0;
const WATER_RIVER = 3;
const WATER_STREAM = 4;
export const GREATER_REALM_UNASSIGNED_DISTRIBUTION_SECTOR = 0xff;

export type GreaterRealmCastleDistributionSupportInput = Readonly<{
  grid: IndexedAxialGrid;
  regionId: Uint8Array;
  waterRegime: Uint8Array;
  barrier: Uint8Array;
  regionCount: number;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function isDistributionSupport(regime: number, barrier: number): boolean {
  return barrier === 0 && (
    regime === WATER_DRY
    || regime === WATER_RIVER
    || regime === WATER_STREAM
  );
}

/**
 * Classify passable regional support into six angular quantiles.
 *
 * Fixed world-axis wedges can be empty for a long coast or archipelago even
 * when castles cover all of the region's actual land. Quantiles retain the
 * angular-distribution proof while normalizing it to the region's own
 * passable support. The comparison uses exact integer polar ordering around
 * the rational support centroid; equal rays are never split across sectors.
 */
export function deriveGreaterRealmSupportNormalizedAngularSectors(
  input: GreaterRealmCastleDistributionSupportInput,
): Uint8Array {
  const { grid, regionId, waterRegime, barrier, regionCount } = input;
  if (
    !Number.isSafeInteger(regionCount)
    || regionCount < 1
    || regionCount > 0xff
    || regionId.length !== grid.cellCount
    || waterRegime.length !== grid.cellCount
    || barrier.length !== grid.cellCount
  ) fail('GREATER_REALM_CASTLE_DISTRIBUTION_SUPPORT_INVALID');

  const sectorByCell = new Uint8Array(grid.cellCount);
  sectorByCell.fill(GREATER_REALM_UNASSIGNED_DISTRIBUTION_SECTOR);
  const supportByRegion: number[][] = Array.from(
    { length: regionCount },
    () => [],
  );
  const qTotals = new BigInt64Array(regionCount);
  const rTotals = new BigInt64Array(regionCount);
  const polarX = new BigInt64Array(grid.cellCount);
  const polarY = new BigInt64Array(grid.cellCount);
  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const region = regionId[cell]!;
      if (
        region >= regionCount
        || !isDistributionSupport(waterRegime[cell]!, barrier[cell]!)
      ) continue;
      supportByRegion[region]!.push(cell);
      qTotals[region] += BigInt(grid.q[cell]!);
      rTotals[region] += BigInt(grid.r[cell]!);
    }

    for (let region = 0; region < regionCount; region += 1) {
      const support = supportByRegion[region]!;
      const supportCount = support.length;
      if (supportCount === 0) continue;
      const qTotal = qTotals[region]!;
      const rTotal = rTotals[region]!;
      const supportCountBigInt = BigInt(supportCount);
      for (const cell of support) {
        const deltaQ = BigInt(grid.q[cell]!) * supportCountBigInt - qTotal;
        const deltaR = BigInt(grid.r[cell]!) * supportCountBigInt - rTotal;
        // Axial (q,r) maps to Cartesian (2q+r, sqrt(3)r). The positive
        // sqrt(3) scale cancels from all polar cross-product comparisons.
        polarX[cell] = 2n * deltaQ + deltaR;
        polarY[cell] = deltaR;
      }
      const halfPlane = (x: bigint, y: bigint): number => (
        y > 0n || (y === 0n && x >= 0n) ? 0 : 1
      );
      support.sort((left, right) => {
        const leftX = polarX[left]!;
        const leftY = polarY[left]!;
        const rightX = polarX[right]!;
        const rightY = polarY[right]!;
        const leftAtCenter = leftX === 0n && leftY === 0n;
        const rightAtCenter = rightX === 0n && rightY === 0n;
        if (leftAtCenter || rightAtCenter) {
          if (leftAtCenter !== rightAtCenter) return leftAtCenter ? -1 : 1;
          return left - right;
        }
        const halfDifference = halfPlane(leftX, leftY) - halfPlane(rightX, rightY);
        if (halfDifference !== 0) return halfDifference;
        const cross = leftX * rightY - leftY * rightX;
        if (cross !== 0n) return cross > 0n ? -1 : 1;
        const leftRadius = leftX * leftX + 3n * leftY * leftY;
        const rightRadius = rightX * rightX + 3n * rightY * rightY;
        return leftRadius < rightRadius
          ? -1
          : leftRadius > rightRadius
            ? 1
            : left - right;
      });

      let angularStart = 0;
      while (angularStart < support.length) {
        const cell = support[angularStart]!;
        if (polarX[cell] !== 0n || polarY[cell] !== 0n) break;
        sectorByCell[support[angularStart]!] = 0;
        angularStart += 1;
      }
      const angularCount = support.length - angularStart;
      for (let start = angularStart; start < support.length;) {
        const firstCell = support[start]!;
        const firstX = polarX[firstCell]!;
        const firstY = polarY[firstCell]!;
        let end = start + 1;
        while (end < support.length) {
          const nextCell = support[end]!;
          const nextX = polarX[nextCell]!;
          const nextY = polarY[nextCell]!;
          if (
            halfPlane(firstX, firstY) !== halfPlane(nextX, nextY)
            || firstX * nextY !== firstY * nextX
          ) break;
          end += 1;
        }
        const relativeStart = start - angularStart;
        const relativeEnd = end - angularStart;
        const sector = angularCount === 0
          ? 0
          : Math.min(
            HEX_NEIGHBOR_COUNT - 1,
            Math.floor(
              (relativeStart + relativeEnd - 1)
                * (HEX_NEIGHBOR_COUNT / 2)
                / angularCount,
            ),
          );
        for (let ordinal = start; ordinal < end; ordinal += 1) {
          sectorByCell[support[ordinal]!] = sector;
        }
        start = end;
      }
    }
    return sectorByCell;
  } catch (error) {
    sectorByCell.fill(0);
    throw error;
  } finally {
    qTotals.fill(0n);
    rTotals.fill(0n);
    polarX.fill(0n);
    polarY.fill(0n);
    for (const support of supportByRegion) {
      support.fill(0);
      support.length = 0;
    }
    supportByRegion.length = 0;
  }
}
