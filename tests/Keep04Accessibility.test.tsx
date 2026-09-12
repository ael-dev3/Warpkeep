import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Keep04Screen, type Keep04UiSelection } from '../src/components/keep04/Keep04Screen';
import type { Keep04SceneHostProps } from '../src/components/keep04/Keep04SceneHost';
import { createKeep04QaSnapshot } from '../src/dev/Keep04QaHarness';
import type { Controller04, Snapshot04 } from '../src/ptr/gameplay04/createGameplay04Controller';
import { readFileSync } from 'node:fs';

let sceneProps: Keep04SceneHostProps;
const viewportStyles = new Set<HTMLStyleElement>();
// This file isolates screen DOM/focus ownership; actual scene lifecycle is covered in Keep04SceneHost.test.tsx.
vi.mock('../src/components/keep04/Keep04SceneHost', () => ({ Keep04SceneHost: (props: Keep04SceneHostProps) => { sceneProps = props; return null; } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); viewportStyles.forEach(style => style.remove()); viewportStyles.clear(); });
function setup(fixture: 'empty' | 'construction' | 'complete' = 'empty', snapshot = createKeep04QaSnapshot(fixture)) {
  const controller: Controller04 = { getSnapshot: () => snapshot, subscribe: () => () => {}, refresh: vi.fn(async () => {}), submit: vi.fn(async () => {}), retryPending: vi.fn(async () => {}), setAtlas: vi.fn(), dispose: vi.fn() };
  function Harness({ phase = snapshot.phase }: { phase?: Snapshot04['phase'] }) {
    const [selection, onSelectionChange] = useState<Keep04UiSelection>({ panel: null, selectedKind: null, draft: null });
    return <Keep04Screen snapshot={{ ...snapshot, phase }} controller={controller} selection={selection} onSelectionChange={onSelectionChange} onBack={vi.fn()} quality="balanced" reducedMotion onFindResources={vi.fn()} onReturnToWorld={vi.fn()} />;
  }
  const rendered = render(<Harness />);
  return { controller, rerenderPhase: (phase: Snapshot04['phase']) => rendered.rerender(<Harness phase={phase} />) };
}
it('promotes one complete selected review and connects it to the same schematic without commands', () => {
  const { controller, rerenderPhase } = setup(); act(() => sceneProps.onMode('webgl'));
  const opener = screen.getByRole('button', { name: 'Buildings' }); fireEvent.click(opener);
  const schematic = screen.getByRole('application', { name: 'Keep placement schematic' });
  for (const name of ['City Mill', 'Lumber Camp', 'City Stoneworks', 'City Goldworks', 'City Barracks', 'Grand Covenant Cathedral']) {
    fireEvent.click(screen.getByRole('button', { name }));
    const heading = screen.getByRole('heading', { name: `Place ${name}` }); expect(heading).toHaveFocus();
    const review = screen.getByRole('region', { name: `Place ${name}` });
    expect(within(review).getByText(/^Cost:/)).toBeVisible(); expect(within(review).getByText(/^Missing:/)).toBeVisible();
    expect(within(review).getByText(/^Build duration:/)).toBeVisible(); expect(within(review).getByText(/^Current:/)).toBeVisible();
    expect(screen.getAllByRole('article')).toHaveLength(6);
    const others = screen.getByRole('heading', { name: 'Other buildings' });
    expect(screen.getByRole('button', { name: 'Confirm placement' }).compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    schematic.closest('details')!.open = false;
    fireEvent.click(screen.getByRole('button', { name: 'Adjust placement' }));
    expect(schematic.closest('details')!.open).toBe(true); expect(schematic).toHaveFocus();
    fireEvent.keyDown(schematic, { key: 'ArrowRight' }); expect(schematic).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Review placement' })); expect(heading).toHaveFocus();
    rerenderPhase('ready'); fireEvent.resize(window); expect(heading).toHaveFocus();
  }
  expect(controller.submit).not.toHaveBeenCalled();
  const reviewedHeading = screen.getByRole('heading', { name: 'Place Grand Covenant Cathedral' });
  rerenderPhase('pending'); expect(reviewedHeading).toHaveFocus();
  rerenderPhase('ready'); expect(reviewedHeading).toHaveFocus();
  fireEvent.keyDown(schematic, { key: 'Escape' }); expect(opener).toHaveFocus();
});
it('connects persisted-site upgrade review without replacing or editing its schematic', () => {
  const { controller } = setup('complete');
  const schematic = screen.getByRole('application', { name: 'Keep placement schematic' });
  fireEvent.click(screen.getByRole('button', { name: /City Mill footprint/ }));
  const heading = screen.getByRole('heading', { name: 'Upgrade City Mill' }); expect(heading).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'View site' })); expect(schematic).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Move up 0.5 m' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review upgrade' })); expect(heading).toHaveFocus();
  expect(controller.submit).not.toHaveBeenCalled();
});
it('keeps the schematic, controls, selection and focus mounted through loading/webgl/fallback transitions', () => {
  const { controller } = setup(); const opener = screen.getByRole('button', { name: 'Buildings' }); fireEvent.click(opener);
  fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  const schematic = screen.getByRole('application', { name: 'Keep placement schematic' }); schematic.focus();
  const worker = screen.getByRole('button', { name: /Worker 1/ }); const confirm = screen.getByRole('button', { name: /Confirm placement/ });
  fireEvent.keyDown(schematic, { key: 'ArrowRight' }); fireEvent.keyDown(schematic, { key: 'r' });
  const draft = sceneProps.visual.draft;
  for (const mode of ['webgl', 'loading', 'fallback'] as const) {
    act(() => sceneProps.onMode(mode));
    expect(screen.getByRole('application', { name: 'Keep placement schematic' })).toBe(schematic);
    expect(schematic).toHaveFocus(); expect(screen.getByRole('button', { name: /Worker 1/ })).toBe(worker);
    expect(screen.getByRole('button', { name: /Confirm placement/ })).toBe(confirm); expect(sceneProps.visual.draft).toEqual(draft);
  }
  expect(screen.getByText(/3D graphics.*unavailable/i)).toBeVisible(); expect(controller.submit).not.toHaveBeenCalled();
  fireEvent.keyDown(schematic, { key: 'Escape' }); expect(opener).toHaveFocus();
});

it.each([['construction', 0, 'constructing'], ['complete', 1, 'complete']] as const)('exposes the %s building level and phase as an accessible control name', (fixture, level, phase) => {
  setup(fixture);
  expect(screen.getByRole('button', { name: new RegExp(`Select City Mill.*level ${level}.*${phase}`) })).toBeVisible();
});

it('reopens a user-collapsed schematic after graphics fail without replacing its DOM', () => {
  setup(); act(() => sceneProps.onMode('webgl'));
  const schematic = screen.getByRole('application', { name: 'Keep placement schematic' });
  const details = schematic.closest('details')!; details.open = false;
  act(() => sceneProps.onMode('fallback'));
  expect(details.open).toBe(true); expect(screen.getByRole('application', { name: 'Keep placement schematic' })).toBe(schematic);
});

it('returns Escape focus to Buildings when a non-focusable canvas opened the building panel', () => {
  setup(); act(() => sceneProps.onSelect('city-mill'));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close panel' }), { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Buildings' })).toHaveFocus();
});

it('puts compact primary commands before the scene and preserves their opener focus without collapsing the schematic', () => {
  setup();
  const commands = screen.getByRole('navigation', { name: 'Primary keep actions' });
  const schematic = screen.getByRole('application', { name: 'Keep placement schematic' });
  expect(commands.compareDocumentPosition(schematic) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  const primary = commands.querySelector('button')!; fireEvent.click(primary);
  expect(screen.getByRole('complementary', { name: 'Command panel' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close panel' }), { key: 'Escape' });
  expect(primary).toHaveFocus(); expect(schematic.closest('details')!.open).toBe(true);
});

// Apply the real matching responsive rules: jsdom does not evaluate viewport
// media queries or establish geometry. Browser acceptance owns the latter.
function applyViewportRules(width: number, height: number) {
  const source = document.createElement('style');
  source.textContent = readFileSync('src/components/keep04/Keep04Screen.css', 'utf8'); document.head.append(source);
  const applied = document.createElement('style');
  applied.textContent = Array.from(source.sheet!.cssRules).flatMap(rule => {
    if (!(rule instanceof CSSMediaRule)) return [rule.cssText];
    const matches = rule.conditionText.split(',').some(query => {
      const bound = query.trim().match(/^\(max-(width|height): (\d+)px\)$/);
      return bound !== null && (bound[1] === 'width' ? width : height) <= Number(bound[2]);
    });
    return matches ? Array.from(rule.cssRules).map(child => child.cssText) : [];
  }).join('\n');
  source.remove(); document.head.append(applied); viewportStyles.add(applied);
  return () => { applied.remove(); viewportStyles.delete(applied); };
}

it.each([[390, 844], [844, 390]])('keeps one decision header and unobscured document-scrolling commands at %ix%i', (width, height) => {
  const removeStyles = applyViewportRules(width, height);
  try {
    setup();
    const resources = screen.getByRole('region', { name: 'Resources' });
    const commands = screen.getByRole('navigation', { name: 'Primary keep actions' });
    expect(resources.parentElement).toBe(commands.parentElement);
    expect(getComputedStyle(resources.parentElement!).position).toBe('sticky');
    expect(getComputedStyle(commands).position).not.toBe('sticky');
    expect(screen.getAllByRole('region', { name: 'Resources' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open building catalog' }));
    fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
    const panel = screen.getByRole('complementary', { name: 'Command panel' });
    expect(getComputedStyle(panel).maxHeight).toBe('none');
    expect(getComputedStyle(panel).overflowY).toBe('visible');
    expect(getComputedStyle(screen.getByRole('button', { name: 'Confirm placement' }).parentElement!).position).toBe('static');
    expect(getComputedStyle(screen.getByRole('button', { name: 'Close panel' })).minHeight).toBe('44px');
    expect(getComputedStyle(panel).scrollMarginTop).toContain('var(--keep04-decision-height');
    expect(getComputedStyle(screen.getByRole('button', { name: 'Rotate 90°' })).scrollMarginTop).toContain('var(--keep04-decision-height');
  } finally { removeStyles(); }
});

it('exposes desktop primary commands and returns focus from the bounded side panel', () => {
  const removeStyles = applyViewportRules(1280, 900);
  try {
    const { controller } = setup();
    const commands = screen.getByRole('navigation', { name: 'Primary keep actions' });
    const catalog = within(commands).getByRole('button', { name: 'Open building catalog' });
    const workers = within(commands).getByRole('button', { name: 'Manage Workers' });
    expect(catalog).toBeVisible(); expect(workers).toBeVisible();
    expect(getComputedStyle(screen.getByRole('region', { name: 'Resources' }).parentElement!).position).not.toBe('sticky');
    fireEvent.click(catalog);
    const panel = screen.getByRole('complementary', { name: 'Command panel' });
    expect(getComputedStyle(panel).width).toBe('320px');
    expect(getComputedStyle(panel).maxHeight).toBe('76vh');
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(catalog).toHaveFocus();
    fireEvent.click(workers);
    expect(screen.getByRole('complementary', { name: 'Command panel' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(workers).toHaveFocus();
    expect(screen.getByRole('navigation', { name: 'Keep commands' })).toBeVisible();
    expect(controller.submit).not.toHaveBeenCalled();
  } finally { removeStyles(); }
});

it('measures header changes without realigning for resizes or draft edits and preserves schematic focus and user collapse', () => {
  let resized: ResizeObserverCallback = () => {};
  let observed: Element | undefined;
  let observedBox: ResizeObserverBoxOptions | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resized = callback; }
    observe(element: Element, options?: ResizeObserverOptions) { observed = element; observedBox = options?.box; }
    disconnect = disconnect;
  });
  const removeStyles = applyViewportRules(390, 844);
  try {
    const { rerenderPhase } = setup(); act(() => sceneProps.onMode('webgl'));
    const header = screen.getByRole('region', { name: 'Resources' }).parentElement!;
    expect(observed).toBe(header);
    expect(observedBox).toBe('border-box');
    const bounds = vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ height: 143.5 } as DOMRect);
    act(() => resized([], {} as ResizeObserver));
    const root = header.closest('.keep04') as HTMLElement;
    expect(root.style.getPropertyValue('--keep04-decision-height')).toBe('143.5px');
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    try {
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      const schematic = screen.getByRole('application', { name: 'Keep placement schematic' });
      const details = schematic.closest('details')!; details.open = false;
      const opener = screen.getByRole('button', { name: 'Open building catalog' }); fireEvent.click(opener);
      const panel = screen.getByRole('complementary', { name: 'Command panel' });
      expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'instant' });
      expect(scroll.mock.contexts[0]).toBe(panel);
      expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus();
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
      expect(details.open).toBe(false);
      bounds.mockReturnValue({ height: 126 } as DOMRect); fireEvent.resize(window);
      expect(root.style.getPropertyValue('--keep04-decision-height')).toBe('126px');
      expect(scroll).toHaveBeenCalledTimes(1);
      details.open = true; schematic.focus(); fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('heading', { name: 'Place City Mill' })).toHaveFocus();
      // Explicit selection navigates once; draft edits below still do not.
      scroll.mockClear();
      schematic.focus(); fireEvent.keyDown(schematic, { key: 'ArrowRight' });
      expect(schematic).toHaveFocus(); expect(scroll).not.toHaveBeenCalled();
      rerenderPhase('pending');
      expect(disconnect).not.toHaveBeenCalled();
      expect(root.style.getPropertyValue('--keep04-decision-height')).toBe('126px');
      bounds.mockClear(); fireEvent.resize(window); expect(bounds).toHaveBeenCalledOnce();
      rerenderPhase('ready');
      expect(root.style.getPropertyValue('--keep04-decision-height')).toBe('126px');
      expect(scroll).not.toHaveBeenCalled(); expect(schematic).toHaveFocus();
      fireEvent.click(opener);
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus();
      fireEvent.keyDown(schematic, { key: 'Escape' }); expect(opener).toHaveFocus();
      fireEvent.click(screen.getByRole('button', { name: 'Manage Workers' }));
      expect(scroll).toHaveBeenCalledTimes(2);
      // Leave and re-enter the compact CSS branch without remounting the screen.
      removeStyles(); const removeDesktopStyles = applyViewportRules(1280, 900);
      fireEvent.resize(window);
      fireEvent.keyDown(screen.getByRole('button', { name: 'Close panel' }), { key: 'Escape' });
      fireEvent.click(screen.getByRole('button', { name: 'Buildings' }));
      expect(scroll).toHaveBeenCalledTimes(2);
      const desktopOpener = screen.getByRole('button', { name: 'Buildings' });
      desktopOpener.focus(); fireEvent.click(desktopOpener); expect(desktopOpener).toHaveFocus();
      removeDesktopStyles(); const removeLandscapeStyles = applyViewportRules(844, 390);
      fireEvent.resize(window);
      fireEvent.click(screen.getByRole('button', { name: 'Manage Workers' }));
      expect(scroll).toHaveBeenCalledTimes(3); removeLandscapeStyles();
      cleanup(); expect(disconnect).toHaveBeenCalledTimes(1);
      bounds.mockClear(); fireEvent.resize(window); expect(bounds).not.toHaveBeenCalled();
    } finally { delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView; }
  } finally { removeStyles(); }
});

it.each([[390, 844], [844, 390]])('preserves command focus without scrolling during command/pending/ready at %ix%i', (width, height) => {
  const removeStyles = applyViewportRules(width, height);
  const scroll = vi.fn();
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  try {
    const snapshot = createKeep04QaSnapshot('complete');
    const { controller, rerenderPhase } = setup('complete', { ...snapshot,
      view: { ...snapshot.view!, atlas: { atlasId: 'synthetic-command-focus-test', revision: 1n } } });
    const opener = screen.getByRole('button', { name: 'Open building catalog' }); fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
    const confirm = screen.getByRole('button', { name: 'Confirm upgrade' });
    expect(confirm).toBeEnabled(); confirm.focus(); fireEvent.click(confirm);
    expect(controller.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'build' }));
    scroll.mockClear();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    rerenderPhase('pending');
    expect(confirm).toHaveFocus(); expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeVisible();
    rerenderPhase('ready');
    // jsdom verifies no programmatic navigation; Chrome verifies viewport geometry.
    expect(scroll).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
    expect(confirm).toHaveFocus();
    rerenderPhase('ready'); fireEvent.resize(window);
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close panel' }), { key: 'Escape' }); expect(opener).toHaveFocus();
  } finally {
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    removeStyles();
  }
});

it('keeps valid and blocked footprints distinct using system colors and line patterns in forced-colors rules', () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: 'Buildings' })); fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  const source = document.createElement('style'); source.textContent = readFileSync('src/components/keep04/Keep04Screen.css', 'utf8'); document.head.append(source);
  // jsdom cannot activate OS media preferences. Apply the actual forced-colors
  // branch through CSSOM, then inspect computed styles on the real rendered draft.
  const forced = document.createElement('style');
  forced.textContent = Array.from(source.sheet!.cssRules).filter(rule => rule instanceof CSSMediaRule && rule.conditionText.includes('forced-colors')).map(rule => Array.from((rule as CSSMediaRule).cssRules).map(child => child.cssText).join('\n')).join('\n');
  document.head.append(forced);
  try {
    const draft = document.querySelector('.keep04-draft')!;
    const validPattern = getComputedStyle(draft).strokeDasharray;
    act(() => sceneProps.onPlacement({ ...sceneProps.visual.draft!, x: 0n, z: 0n }));
    expect(screen.getByText('Keep roads and civic space clear.')).toBeVisible();
    expect(getComputedStyle(draft).stroke).toBe(getComputedStyle(document.querySelector('.keep04')!).color);
    expect(getComputedStyle(draft).strokeDasharray).not.toBe(validPattern);
    expect(getComputedStyle(draft).strokeDasharray).toBe('1 .7');
  } finally { source.remove(); forced.remove(); }
});
