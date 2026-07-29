import {
  hexDisc,
  hexDistance,
  hexKey,
  worldToNearestAxial,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import type { GenesisWaterCellV1 } from '../../../spacetimedb/src/waterWorld';
import {
  WARPKEEP_WATER_AMBIENCE_OFF,
  type WarpkeepWaterAmbienceState
} from '../audio/waterAmbience';
import type { RealmCameraPresentationBand } from './realmCameraController';

const RIVER_AUDIBLE_RADIUS_CELLS = 4;
const OCEAN_AUDIBLE_RADIUS_CELLS = 3;
const SEARCH_RADIUS_CELLS = Math.max(
  RIVER_AUDIBLE_RADIUS_CELLS,
  OCEAN_AUDIBLE_RADIUS_CELLS
);

const CAMERA_BAND_GAIN: Readonly<Record<RealmCameraPresentationBand, number>> =
  Object.freeze({
    close: 1,
    strategy: 0.78,
    overview: 0.46
  });

type WaterAmbienceSamplerInput = Readonly<{
  active: boolean;
  cameraBand: RealmCameraPresentationBand;
  focus: HexWorldPosition;
  selectedCellKey?: string | null;
}>;

export type RealmWaterAmbienceSampler = Readonly<{
  sample: (input: WaterAmbienceSamplerInput) => WarpkeepWaterAmbienceState;
}>;

function regimeRadius(regime: GenesisWaterCellV1['regime']) {
  if (regime === 'river') return RIVER_AUDIBLE_RADIUS_CELLS;
  if (regime === 'ocean') return OCEAN_AUDIBLE_RADIUS_CELLS;
  return 0;
}

function proximityScore(
  cell: GenesisWaterCellV1,
  distanceCells: number
) {
  const radius = regimeRadius(cell.regime);
  if (radius <= 0 || distanceCells > radius) return 0;
  const falloff = 1 - distanceCells / (radius + 1);
  return falloff * (cell.regime === 'ocean' ? 0.84 : 1);
}

function waterCharacter(
  cell: GenesisWaterCellV1,
  maximumRiverAccumulation: number
) {
  if (cell.regime === 'river') {
    return Math.sqrt(
      Math.max(0, cell.flowAccumulation)
      / Math.max(1, maximumRiverAccumulation)
    );
  }
  return Math.min(1, Math.max(0, cell.oceanDepth) / 5);
}

/**
 * Resolves ambience from a bounded local hex neighborhood. It never scans the
 * 10,000-cell world during camera motion and never considers unpublished
 * full-fog ocean cells.
 */
export function createRealmWaterAmbienceSampler(
  cells: readonly GenesisWaterCellV1[]
): RealmWaterAmbienceSampler {
  const audibleCells = new Map(cells.flatMap((cell) => (
    (cell.regime === 'river' || cell.regime === 'ocean')
      && cell.fogBand !== 'full'
      && Number.isSafeInteger(cell.q)
      && Number.isSafeInteger(cell.r)
      ? [[hexKey(cell), cell] as const]
      : []
  )));
  const maximumRiverAccumulation = Math.max(
    1,
    ...[...audibleCells.values()]
      .filter((cell) => cell.regime === 'river')
      .map((cell) => cell.flowAccumulation)
  );
  let cachedKey = '';
  let cachedState = WARPKEEP_WATER_AMBIENCE_OFF;

  return Object.freeze({
    sample: (input) => {
      if (
        !input.active
        || !Number.isFinite(input.focus.x)
        || !Number.isFinite(input.focus.z)
      ) return WARPKEEP_WATER_AMBIENCE_OFF;

      const focusCoord = worldToNearestAxial(input.focus, 1);
      const selected = input.selectedCellKey
        ? audibleCells.get(input.selectedCellKey)
        : undefined;
      const key = [
        hexKey(focusCoord),
        input.cameraBand,
        selected?.cellKey ?? ''
      ].join(':');
      if (key === cachedKey) return cachedState;

      let strongestCell: GenesisWaterCellV1 | undefined;
      let strongestScore = 0;
      for (const coord of hexDisc(focusCoord, SEARCH_RADIUS_CELLS)) {
        const cell = audibleCells.get(hexKey(coord));
        if (!cell) continue;
        const score = proximityScore(cell, hexDistance(focusCoord, cell));
        if (
          score > strongestScore
          || (
            score === strongestScore
            && cell.regime === 'river'
            && strongestCell?.regime !== 'river'
          )
        ) {
          strongestCell = cell;
          strongestScore = score;
        }
      }

      const selectedScore = selected?.regime === 'river'
        ? 0.72
        : selected?.regime === 'ocean'
          ? 0.58
          : 0;
      if (selected && selectedScore > strongestScore) {
        strongestCell = selected;
        strongestScore = selectedScore;
      }

      cachedKey = key;
      if (!strongestCell || strongestScore <= 0) {
        cachedState = WARPKEEP_WATER_AMBIENCE_OFF;
        return cachedState;
      }
      const selectedIsStrongest = selected?.cellKey === strongestCell.cellKey;
      cachedState = Object.freeze({
        regime: strongestCell.regime as 'river' | 'ocean',
        relevance: Math.min(
          1,
          strongestScore * Math.max(
            CAMERA_BAND_GAIN[input.cameraBand],
            selectedIsStrongest ? 0.72 : 0
          )
        ),
        character: waterCharacter(
          strongestCell,
          maximumRiverAccumulation
        ),
        selected: selectedIsStrongest
      });
      return cachedState;
    }
  });
}
