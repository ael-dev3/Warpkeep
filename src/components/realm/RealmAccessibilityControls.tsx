import { hexKey, type HexCoord } from '../../game/map/hexCoordinates';
import type { TerrainCell } from '../../game/map/terrainTypes';

type RealmAccessibilityControlsProps = Readonly<{
  cells: readonly TerrainCell[];
  keepCoord: HexCoord;
  selectedCoord: HexCoord;
  onHover: (coord: HexCoord | null) => void;
  onSelect: (coord: HexCoord) => void;
}>;

function sameCoord(first: HexCoord, second: HexCoord) {
  return first.q === second.q && first.r === second.r;
}
export function RealmAccessibilityControls({
  cells,
  keepCoord,
  selectedCoord,
  onHover,
  onSelect
}: RealmAccessibilityControlsProps) {
  return (
    <details className="realm-cell-navigator">
      <summary>Realm Cells <span>{cells.length}</span></summary>
      <div className="realm-cell-navigator__grid" role="group" aria-label="Playable realm cells">
        {cells.map((cell) => {
          const selected = sameCoord(selectedCoord, cell.coord);
          const keep = sameCoord(keepCoord, cell.coord);
          return (
            <button
              key={hexKey(cell.coord)}
              type="button"
              aria-label={`Select cell ${cell.coord.q},${cell.coord.r}${keep ? ', your Hegemony keep' : ''}`}
              aria-pressed={selected}
              data-keep={keep ? 'true' : 'false'}
              onFocus={() => onHover(cell.coord)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(cell.coord)}
            >
              {keep ? '◆ ' : ''}{cell.coord.q},{cell.coord.r}
            </button>
          );
        })}
      </div>
    </details>
  );
}
