import { describe, expect, it, vi } from 'vitest';

import { settlePendingNavigatorCellFocus } from '../src/components/realm/realmNavigatorFocus';

describe('Realm navigator semantic focus scheduling', () => {
  it('waits for the post-close composition and consumes the latest focus once', () => {
    const focusCell = vi.fn();
    const coord = Object.freeze({ q: 20, r: -22 });

    let pending = settlePendingNavigatorCellFocus({
      pendingCoord: coord,
      navigatorOpen: true,
      navigatorDialogPresent: true,
      compositionApplied: true,
      focusCell
    });
    expect(pending).toBe(coord);
    expect(focusCell).not.toHaveBeenCalled();

    pending = settlePendingNavigatorCellFocus({
      pendingCoord: pending,
      navigatorOpen: false,
      navigatorDialogPresent: false,
      compositionApplied: true,
      focusCell
    });
    expect(pending).toBeNull();
    expect(focusCell).toHaveBeenCalledTimes(1);
    expect(focusCell).toHaveBeenCalledWith(coord);

    pending = settlePendingNavigatorCellFocus({
      pendingCoord: pending,
      navigatorOpen: false,
      navigatorDialogPresent: false,
      compositionApplied: true,
      focusCell
    });
    expect(pending).toBeNull();
    expect(focusCell).toHaveBeenCalledTimes(1);
  });

  it('does not consume focus before the scene accepts the closed composition', () => {
    const focusCell = vi.fn();
    const coord = Object.freeze({ q: -51, r: 57 });

    const pending = settlePendingNavigatorCellFocus({
      pendingCoord: coord,
      navigatorOpen: false,
      navigatorDialogPresent: false,
      compositionApplied: false,
      focusCell
    });
    expect(pending).toBe(coord);
    expect(focusCell).not.toHaveBeenCalled();
  });

  it('keeps a pending focus while the closing dialog remains mounted', () => {
    const focusCell = vi.fn();
    const coord = Object.freeze({ q: -8, r: 18 });

    const pending = settlePendingNavigatorCellFocus({
      pendingCoord: coord,
      navigatorOpen: false,
      navigatorDialogPresent: true,
      compositionApplied: true,
      focusCell
    });
    expect(pending).toBe(coord);
    expect(focusCell).not.toHaveBeenCalled();
  });
});
