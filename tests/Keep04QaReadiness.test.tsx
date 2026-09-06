import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Keep04QaHarness } from '../src/dev/Keep04QaHarness';

const armLabel = 'Simulate pending → ready on next suppressed command';
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('WebGL2RenderingContext', undefined);
  window.history.replaceState({}, '', '/?scenario=mill-placement');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); window.history.replaceState({}, '', '/'); });

function setup() {
  const mounted = render(<Keep04QaHarness />);
  fireEvent.click(screen.getByText('Synthetic controller · local visual QA only · Controls'));
  return mounted;
}
function armAndSubmit() {
  fireEvent.click(screen.getByRole('checkbox', { name: armLabel }));
  const confirm = screen.getByRole('button', { name: 'Confirm placement' });
  expect(confirm).toBeEnabled(); confirm.focus(); fireEvent.click(confirm);
  return confirm;
}
const expectPending = () => expect(screen.getByRole('region', { name: 'Keep status' })).toHaveTextContent('Request pending. Awaiting Realm update.');
function readinessTimerCount() {
  // jsdom queues zero-delay details-toggle events when the actual screen mounts.
  // Drain those DOM events without advancing the 1000ms readiness deadline.
  act(() => { vi.advanceTimersByTime(0); });
  return vi.getTimerCount();
}

it('defaults off and keeps an ordinary actual command suppressed without a pending timer', () => {
  setup();
  expect(screen.getByRole('checkbox', { name: armLabel })).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm placement' }));
  expect(screen.getByText('Synthetic controller: command suppressed. No resources or authority changed.')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Resources' })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Keep status' })).not.toBeInTheDocument();
  expect(readinessTimerCount()).toBe(0);
});

it('consumes the arm for an actual panel command, restores ready at 1000ms, and preserves resources and selection', () => {
  setup();
  const resources = screen.getByRole('region', { name: 'Resources' });
  const balances = resources.textContent;
  const selected = screen.getByRole('button', { name: 'City Mill' });
  const confirm = armAndSubmit();
  expectPending(); expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
  const toggle = screen.getByRole('checkbox', { name: armLabel });
  expect(toggle).not.toBeChecked(); expect(toggle).toBeDisabled();
  expect(screen.getByText('Synthetic controller: command suppressed. No resources or authority changed.')).toBeVisible();
  expect(readinessTimerCount()).toBe(1);
  // A repeated activation cannot start another transition or extend this one.
  act(() => { vi.advanceTimersByTime(500); }); fireEvent.click(confirm);
  expect(readinessTimerCount()).toBe(1);
  act(() => { vi.advanceTimersByTime(499); }); expectPending();
  act(() => { vi.advanceTimersByTime(1); });
  expect(screen.getByRole('region', { name: 'Resources' })).toBe(resources);
  expect(resources.textContent).toBe(balances);
  expect(within(resources).getAllByText('1000')).toHaveLength(4);
  expect(selected).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus();
  expect(toggle).toBeEnabled(); expect(toggle).not.toBeChecked(); expect(readinessTimerCount()).toBe(0);
  // The next different suppressed command does not cycle unless explicitly armed.
  fireEvent.click(screen.getByRole('button', { name: 'Lumber Camp' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm placement' }));
  expect(screen.getByRole('region', { name: 'Resources' })).toBeVisible(); expect(readinessTimerCount()).toBe(0);
});

it('retires scenario timers and ignores an old callback during a later scenario transition', () => {
  const timeout = vi.spyOn(window, 'setTimeout');
  setup(); armAndSubmit();
  const stale = timeout.mock.calls.find(([, delay]) => delay === 1000)![0] as () => void;
  fireEvent.change(screen.getByRole('combobox', { name: 'QA scenario' }), { target: { value: 'empty' } });
  expect(readinessTimerCount()).toBe(0);
  expect(screen.getByRole('region', { name: 'Resources' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: armLabel })).not.toBeChecked();
  fireEvent.change(screen.getByRole('combobox', { name: 'QA scenario' }), { target: { value: 'mill-placement' } });
  armAndSubmit(); act(() => stale()); expectPending(); expect(readinessTimerCount()).toBe(1);
  act(() => { vi.advanceTimersByTime(1000); }); expect(screen.getByRole('region', { name: 'Resources' })).toBeVisible();
});

it.each(['Unmount keep', 'Back'])('retires pending on %s and cannot restore into a later keep mount', control => {
  const timeout = vi.spyOn(window, 'setTimeout');
  setup(); armAndSubmit();
  const stale = timeout.mock.calls.find(([, delay]) => delay === 1000)![0] as () => void;
  fireEvent.click(screen.getByRole('button', { name: control }));
  expect(readinessTimerCount()).toBe(0); expect(screen.queryByRole('heading', { name: 'Your keep' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: armLabel })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: armLabel })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Mount keep' }));
  armAndSubmit(); act(() => stale()); expectPending();
  act(() => { vi.advanceTimersByTime(1000); }); expect(screen.getByRole('region', { name: 'Resources' })).toBeVisible();
});

it('retires the timer on harness unmount and leaves no later callback work', () => {
  const mounted = setup(); armAndSubmit(); expect(readinessTimerCount()).toBe(1);
  mounted.unmount(); expect(readinessTimerCount()).toBe(0);
  act(() => { vi.advanceTimersByTime(2000); }); expect(readinessTimerCount()).toBe(0);
  expect(mounted.container).toBeEmptyDOMElement();
});

it('resets an unused arm on scenario and keep lifecycle changes', () => {
  setup(); const toggle = screen.getByRole('checkbox', { name: armLabel });
  fireEvent.click(toggle);
  fireEvent.change(screen.getByRole('combobox', { name: 'QA scenario' }), { target: { value: 'empty' } });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle); fireEvent.click(screen.getByRole('button', { name: 'Unmount keep' }));
  expect(toggle).not.toBeChecked(); fireEvent.click(screen.getByRole('button', { name: 'Mount keep' }));
  expect(toggle).not.toBeChecked(); expect(readinessTimerCount()).toBe(0);
});

it('prevents mixing an armed or running readiness cycle with a bounded capture', () => {
  setup(); const toggle = screen.getByRole('checkbox', { name: armLabel });
  const start = screen.getByRole('button', { name: 'Start bounded observation' });
  fireEvent.click(toggle); expect(start).toBeDisabled(); fireEvent.click(start);
  expect(screen.getByRole('combobox', { name: 'QA scenario' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm placement' }));
  expectPending(); expect(start).toBeDisabled(); fireEvent.click(start);
  act(() => { vi.advanceTimersByTime(1000); }); expect(start).toBeEnabled();
  fireEvent.click(start); expect(toggle).toBeDisabled(); fireEvent.click(toggle); expect(toggle).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Lumber Camp' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm placement' }));
  expect(screen.getByRole('region', { name: 'Resources' })).toBeVisible(); expect(readinessTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Stop and publish observation' }));
  expect(toggle).toBeEnabled(); expect(toggle).not.toBeChecked();
});
