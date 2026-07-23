import type { HexCoord } from '../../game/map/hexCoordinates';

/**
 * Consume one latest-wins navigator focus only after React has removed the
 * navigator dialog and the scene has accepted the resulting composition.
 * This prevents compact/full-height Explore geometry from clamping the cell
 * target before its reserved viewport disappears.
 */
export function settlePendingNavigatorCellFocus(input: Readonly<{
  pendingCoord: HexCoord | null;
  navigatorOpen: boolean;
  navigatorDialogPresent: boolean;
  compositionApplied: boolean;
  focusCell: (coord: HexCoord) => void;
}>): HexCoord | null {
  if (
    input.pendingCoord === null
    || input.navigatorOpen
    || input.navigatorDialogPresent
    || !input.compositionApplied
  ) return input.pendingCoord;
  input.focusCell(input.pendingCoord);
  return null;
}
