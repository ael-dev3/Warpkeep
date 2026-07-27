import { afterEach, describe, expect, it } from 'vitest';

import {
  measuredVisibleRealmUiRects
} from '../src/components/realm/realmMeasuredComposition';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({})
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('measured Realm composition', () => {
  it('reserves open tooltips and profile surfaces by their exact visible rectangles', () => {
    const root = document.createElement('div');
    const tooltip = document.createElement('div');
    const menu = document.createElement('section');
    root.className = 'realm-map-screen';
    tooltip.className = 'realm-resource-tooltip';
    menu.className = 'realm-profile-menu__panel';
    root.append(tooltip, menu);
    document.body.append(root);
    root.getBoundingClientRect = () => domRect(10, 20, 400, 300);
    tooltip.getBoundingClientRect = () => domRect(310, 45, 80, 60);
    menu.getBoundingClientRect = () => domRect(25, 70, 160, 190);

    expect(measuredVisibleRealmUiRects(root)).toEqual([
      { left: 300, top: 25, right: 380, bottom: 85 },
      { left: 15, top: 50, right: 175, bottom: 240 }
    ]);
  });

  it('does not reserve a hidden resource tooltip', () => {
    const root = document.createElement('div');
    const tooltip = document.createElement('div');
    tooltip.className = 'realm-resource-tooltip';
    tooltip.hidden = true;
    root.append(tooltip);
    document.body.append(root);
    root.getBoundingClientRect = () => domRect(0, 0, 400, 300);
    tooltip.getBoundingClientRect = () => domRect(300, 10, 80, 60);

    expect(measuredVisibleRealmUiRects(root)).toEqual([]);
  });
});
