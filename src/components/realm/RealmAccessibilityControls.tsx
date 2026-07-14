import { useEffect, useMemo, useState } from 'react';

import { hexKey, type HexCoord } from '../../game/map/hexCoordinates';
import type { TerrainCell } from '../../game/map/terrainTypes';

type RealmAccessibilityControlsProps = Readonly<{
  cells: readonly TerrainCell[];
  keepCoord: HexCoord;
  selectedCoord: HexCoord;
  onHover: (coord: HexCoord | null) => void;
  onSelect: (coord: HexCoord) => void;
}>;

export const REALM_CELL_NAVIGATOR_PAGE_SIZE = 72;

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
  const selectedIndex = useMemo(() => cells.findIndex((cell) => (
    sameCoord(cell.coord, selectedCoord)
  )), [cells, selectedCoord]);
  const pageCount = Math.max(1, Math.ceil(cells.length / REALM_CELL_NAVIGATOR_PAGE_SIZE));
  const [page, setPage] = useState(() => Math.max(
    0,
    Math.floor(Math.max(0, selectedIndex) / REALM_CELL_NAVIGATOR_PAGE_SIZE)
  ));

  useEffect(() => {
    if (selectedIndex < 0) return;
    setPage(Math.floor(selectedIndex / REALM_CELL_NAVIGATOR_PAGE_SIZE));
  }, [selectedIndex]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const visibleCells = cells.slice(
    page * REALM_CELL_NAVIGATOR_PAGE_SIZE,
    (page + 1) * REALM_CELL_NAVIGATOR_PAGE_SIZE
  );

  return (
    <details className="realm-cell-navigator">
      <summary>Traversable Cells <span>{cells.length}</span></summary>
      {pageCount > 1 ? (
        <div className="realm-cell-navigator__pagination" aria-label="Realm cell pages">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Previous
          </button>
          <span aria-live="polite">Page {page + 1} of {pageCount}</span>
          <button
            type="button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
      <div
        className="realm-cell-navigator__grid"
        role="group"
        aria-label={pageCount > 1 ? `Traversable realm cells, page ${page + 1}` : 'Traversable realm cells'}
      >
        {visibleCells.map((cell) => {
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
