import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InnerKeepScreen } from '../src/components/inner-keep/InnerKeepScreen';
import {
  InnerKeepProjectNoCommitError,
  type InnerKeepBuildingKind,
  type InnerKeepBuildingPresentation
} from '../src/components/inner-keep/innerKeepPresentation';
import { subscribeWarpkeepSfx } from '../src/components/audio/sfxEvents';
import { createInnerKeepPresentation } from './fixtures/innerKeepPresentation';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderScreen(options: Readonly<{
  presentation?: ReturnType<typeof createInnerKeepPresentation>;
  selectedBuildingKind?: InnerKeepBuildingKind;
  selectedSlotId?: string;
  renderMode?: 'webgl' | 'fallback';
  onStartProject?: (slotId: string, buildingKind: InnerKeepBuildingKind) => Promise<void>;
  onRequestSync?: () => void;
  onOpenSlot?: (slotId: string) => void;
  onReviewBuilding?: (buildingKind: InnerKeepBuildingKind) => void;
}> = {}) {
  const presentation = options.presentation ?? createInnerKeepPresentation();
  return render(
    <InnerKeepScreen
      onBack={vi.fn()}
      onCloseToRealm={vi.fn()}
      onOpenSlot={options.onOpenSlot ?? vi.fn()}
      onReviewBuilding={options.onReviewBuilding ?? vi.fn()}
      onRequestSync={options.onRequestSync}
      onStartProject={options.onStartProject}
      presentation={presentation}
      renderMode={options.renderMode}
      selectedBuildingKind={options.selectedBuildingKind}
      selectedSlotId={options.selectedSlotId}
    />
  );
}

describe('InnerKeepScreen functional fallback', () => {
  it('exposes all twelve sites as native controls without leaking raw IDs', () => {
    const presentation = createInnerKeepPresentation();
    const onOpenSlot = vi.fn();
    render(
      <InnerKeepScreen
        onBack={vi.fn()}
        onCloseToRealm={vi.fn()}
        onOpenSlot={onOpenSlot}
        onReviewBuilding={vi.fn()}
        presentation={presentation}
      />
    );

    const controls = document.querySelectorAll<HTMLButtonElement>(
      '[data-inner-keep-slot-id]'
    );
    expect(controls).toHaveLength(12);
    expect(screen.getByLabelText(/West Courtyard\. Empty build site/i)).toBeVisible();
    expect(screen.queryByText(/inner-keep-slot-/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/West Courtyard\. Empty build site/i));
    expect(onOpenSlot).toHaveBeenCalledOnce();
    expect(onOpenSlot).toHaveBeenCalledWith('inner-keep-slot-m01');
    expect(screen.getByLabelText(/Northwest Reserve\. Reserved future build site/i))
      .toBeVisible();
  });

  it('keeps the same native controls over the same-canvas WebGL presentation', () => {
    const presentation = createInnerKeepPresentation();
    const onOpenSlot = vi.fn();
    renderScreen({ presentation, renderMode: 'webgl', onOpenSlot });
    const root = document.querySelector('.inner-keep');
    expect(root).toHaveAttribute('data-inner-keep-renderer', 'webgl');
    expect(screen.getByLabelText(/Interactive Inner Keep with twelve build sites/i))
      .toBeVisible();
    const siteIndex = screen.getByRole('list', { name: 'Inner Keep build sites' });
    const controls = siteIndex.querySelectorAll<HTMLButtonElement>(
      '[data-inner-keep-slot-id]'
    );
    expect(controls).toHaveLength(12);
    expect([...controls].every((control) => control.tabIndex === 0)).toBe(true);
    const west = screen.getByLabelText(/West Courtyard\. Empty build site/i);
    expect(west).not.toHaveAttribute('aria-hidden');
    expect(west).not.toHaveAttribute('data-inner-keep-slot-projected');
    west.focus();
    expect(west).toHaveFocus();
    expect(fireEvent.keyDown(west, { key: 'Enter', repeat: false })).toBe(false);
    expect(onOpenSlot).toHaveBeenCalledWith('inner-keep-slot-m01');
    expect(onOpenSlot).toHaveBeenCalledOnce();
    fireEvent.keyDown(west, { key: 'Enter', repeat: true });
    expect(onOpenSlot).toHaveBeenCalledOnce();
  });

  it.each([' ', 'Space', 'Spacebar'])(
    'activates the pointer-transparent WebGL site index with %j',
    (key) => {
      const onOpenSlot = vi.fn();
      renderScreen({ renderMode: 'webgl', onOpenSlot });
      const west = screen.getByLabelText(/West Courtyard\. Empty build site/i);
      west.focus();
      expect(fireEvent.keyDown(west, { key, repeat: false })).toBe(false);
      expect(onOpenSlot).toHaveBeenCalledOnce();
      expect(onOpenSlot).toHaveBeenCalledWith('inner-keep-slot-m01');
    }
  );

  it('restores Back focus to the camera-independent WebGL site index', () => {
    const presentation = createInnerKeepPresentation();
    const props = {
      onBack: vi.fn(),
      onCloseToRealm: vi.fn(),
      onOpenSlot: vi.fn(),
      onReviewBuilding: vi.fn(),
      presentation,
      renderMode: 'webgl' as const
    };
    const view = render(
      <InnerKeepScreen {...props} selectedSlotId="inner-keep-slot-m01" />
    );
    expect(screen.getByRole('heading', { name: 'West Courtyard' })).toHaveFocus();

    view.rerender(<InnerKeepScreen {...props} />);

    const restored = screen.getByLabelText(/West Courtyard\. Empty build site/i);
    expect(restored).toHaveFocus();
    expect(restored.closest('ol')).toHaveAccessibleName('Inner Keep build sites');
  });

  it('renders exact controller-supplied costs and synchronously seals duplicate starts', async () => {
    let settle!: () => void;
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const onStartProject = vi.fn(() => pending);
    renderScreen({
      selectedSlotId: 'inner-keep-slot-m01',
      selectedBuildingKind: 'city-mill',
      onStartProject
    });

    expect(screen.getByText('300')).toBeVisible();
    expect(screen.getByText('900')).toBeVisible();
    expect(screen.getByText('600')).toBeVisible();
    const start = screen.getByRole('button', { name: 'START CONSTRUCTION' });
    fireEvent.click(start);
    fireEvent.click(start);
    expect(onStartProject).toHaveBeenCalledOnce();
    expect(onStartProject).toHaveBeenCalledWith(
      'inner-keep-slot-m01',
      'city-mill'
    );
    expect(screen.getByRole('button', { name: 'SUBMITTING…' })).toBeDisabled();
    settle();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AWAITING REALM STATUS' }))
        .toBeDisabled();
    });
  });

  it('explains a sealed construction request after navigating to another project', () => {
    const onStartProject = vi.fn(() => new Promise<void>(() => undefined));
    const props = {
      onBack: vi.fn(),
      onCloseToRealm: vi.fn(),
      onOpenSlot: vi.fn(),
      onReviewBuilding: vi.fn(),
      onStartProject,
      presentation: createInnerKeepPresentation(),
      renderMode: 'fallback' as const
    };
    const view = render(
      <InnerKeepScreen
        {...props}
        selectedBuildingKind="city-mill"
        selectedSlotId="inner-keep-slot-m01"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'START CONSTRUCTION' }));
    view.rerender(
      <InnerKeepScreen
        {...props}
        selectedBuildingKind="lumber-camp"
        selectedSlotId="inner-keep-slot-m02"
      />
    );

    expect(screen.getByRole('button', { name: 'ANOTHER REQUEST SUBMITTING' }))
      .toBeDisabled();
    expect(screen.getByText(
      'Another construction request is still being submitted. This action remains sealed until authoritative state changes.'
    )).toBeVisible();
  });

  it('retains an uncertain safety warning after navigating to another project', async () => {
    const onRequestSync = vi.fn();
    const onStartProject = vi.fn(async () => {
      throw new Error('synthetic ambiguous result');
    });
    const props = {
      onBack: vi.fn(),
      onCloseToRealm: vi.fn(),
      onOpenSlot: vi.fn(),
      onRequestSync,
      onReviewBuilding: vi.fn(),
      onStartProject,
      presentation: createInnerKeepPresentation(),
      renderMode: 'fallback' as const
    };
    const view = render(
      <InnerKeepScreen
        {...props}
        selectedBuildingKind="city-mill"
        selectedSlotId="inner-keep-slot-m01"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'START CONSTRUCTION' }));
    await waitFor(() => {
      expect(screen.getByText(
        'The result is uncertain. This action remains sealed until authoritative state changes.'
      )).toBeVisible();
    });

    view.rerender(
      <InnerKeepScreen
        {...props}
        selectedBuildingKind="lumber-camp"
        selectedSlotId="inner-keep-slot-m02"
      />
    );

    expect(screen.getByRole('button', { name: 'ANOTHER REQUEST NEEDS STATUS' }))
      .toBeDisabled();
    expect(screen.getByText(
      'Another construction request has an uncertain result. This action remains sealed until authoritative state changes. Check its status before trying again.'
    )).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'CHECK STATUS' }));
    expect(onRequestSync).toHaveBeenCalledOnce();
  });

  it('names the panel dismiss control as a close action', () => {
    renderScreen({ selectedSlotId: 'inner-keep-slot-m01' });
    expect(screen.getByRole('button', { name: 'Close Inner Keep panel' }))
      .toHaveTextContent('×');
  });

  it('shows build time on catalogue cards', () => {
    renderScreen({ selectedSlotId: 'inner-keep-slot-m01' });
    expect(screen.getAllByText('Build time')).toHaveLength(4);
    expect(screen.getAllByText('1 day')).toHaveLength(4);
  });

  it('shows exact completed effect, next quote, duration, and Builder status', () => {
    const completed: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      completedLevel: 2,
      targetLevel: 2,
      phase: 'complete',
      revision: 3n
    });
    renderScreen({
      presentation: createInnerKeepPresentation({ buildings: [completed] }),
      selectedSlotId: completed.slotId
    });

    expect(screen.getByText('Food construction costs -10%.')).toBeVisible();
    expect(screen.getByText('Next level').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Build time').parentElement).toHaveTextContent('1 day');
    expect(screen.getByText('Builder').parentElement).toHaveTextContent('Available');
    expect(screen.getByRole('button', { name: 'REVIEW LEVEL 3 UPGRADE' })).toBeEnabled();
    expect(screen.getByLabelText('Construction cost')).toBeVisible();
  });

  it('guides an idle Builder to an upgrade when every unique building exists', () => {
    const kinds: readonly InnerKeepBuildingKind[] = [
      'city-mill',
      'lumber-camp',
      'city-stoneworks',
      'city-goldworks'
    ];
    const buildings = kinds.map((buildingKind, index) => Object.freeze({
      slotId: `inner-keep-slot-m0${index + 1}`,
      buildingKind,
      completedLevel: 1,
      targetLevel: 1,
      phase: 'complete' as const,
      revision: 1n
    }));
    const onOpenSlot = vi.fn();
    renderScreen({
      presentation: createInnerKeepPresentation({ buildings }),
      onOpenSlot
    });

    fireEvent.click(screen.getByRole('button', { name: /BUILDER AVAILABLE/i }));
    expect(onOpenSlot).toHaveBeenCalledExactlyOnceWith('inner-keep-slot-m01');
  });

  it('keeps commands disabled without a compatible authority callback', () => {
    renderScreen({
      selectedSlotId: 'inner-keep-slot-m01',
      selectedBuildingKind: 'city-mill'
    });
    expect(screen.getByRole('button', { name: 'START CONSTRUCTION' })).toBeDisabled();
    expect(screen.getByText('Construction is not active on this backend.')).toBeVisible();
  });

  it('fails the selected command closed when the layout cannot be verified', () => {
    const presentation = {
      ...createInnerKeepPresentation(),
      layoutDigest: 'invalid-layout-digest'
    };
    renderScreen({
      presentation,
      selectedSlotId: 'inner-keep-slot-m01',
      selectedBuildingKind: 'city-mill',
      onStartProject: vi.fn(async () => undefined)
    });

    expect(screen.getByRole('button', { name: 'START CONSTRUCTION' })).toBeDisabled();
    expect(screen.getByText('Inner Keep layout could not be verified.')).toBeVisible();
  });

  it('reopens a deliberate start after a proven no-commit rejection', async () => {
    const onStartProject = vi.fn()
      .mockRejectedValueOnce(new InnerKeepProjectNoCommitError('Synthetic local preflight.'))
      .mockResolvedValueOnce(undefined);
    renderScreen({
      selectedSlotId: 'inner-keep-slot-m01',
      selectedBuildingKind: 'city-mill',
      onStartProject
    });

    fireEvent.click(screen.getByRole('button', { name: 'START CONSTRUCTION' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'START CONSTRUCTION' })).toBeEnabled();
    });
    expect(screen.getByText(
      'Construction was not started. Review the current Realm status and try again.'
    )).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'START CONSTRUCTION' }));
    expect(onStartProject).toHaveBeenCalledTimes(2);
  });

  it('keeps an authoritative status check reachable after a sealed failure', () => {
    const onRequestSync = vi.fn();
    renderScreen({
      presentation: createInnerKeepPresentation({
        commandsEnabled: false,
        phase: 'failed',
        statusMessage: 'There is not enough stored Wood for this project.'
      }),
      onRequestSync
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'There is not enough stored Wood for this project.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'CHECK REALM STATUS' }));
    expect(onRequestSync).toHaveBeenCalledOnce();
  });

  it('never lets pending accrual or a busy Builder enable another project', () => {
    const constructing: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      completedLevel: 0,
      targetLevel: 1,
      phase: 'constructing',
      startedAtMicros: BigInt(Date.now() - 1_000) * 1_000n,
      completesAtMicros: BigInt(Date.now() + 86_400_000) * 1_000n,
      revision: 2n
    });
    const presentation = createInnerKeepPresentation({
      available: { food: 0n, wood: 0n, stone: 0n, gold: 0n },
      buildings: [constructing],
      builder: {
        state: 'busy',
        slotId: constructing.slotId,
        buildingKind: constructing.buildingKind,
        targetLevel: constructing.targetLevel,
        completesAtMicros: constructing.completesAtMicros!
      }
    });
    const withPending = {
      ...presentation,
      resources: {
        ...presentation.resources,
        pending: { food: 10_000n, wood: 10_000n, stone: 10_000n, gold: 10_000n }
      }
    };
    renderScreen({
      presentation: withPending,
      selectedSlotId: 'inner-keep-slot-m02',
      selectedBuildingKind: 'lumber-camp',
      onStartProject: vi.fn(async () => undefined)
    });

    expect(screen.getByRole('button', { name: 'START CONSTRUCTION' })).toBeDisabled();
    expect(screen.getByText(/Builder is occupied/i)).toBeVisible();
    expect(screen.getAllByText(/pending · not spendable/i)).toHaveLength(4);
  });

  it('shows scaffold and smoke but no finished art during construction', () => {
    const constructing: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      completedLevel: 0,
      targetLevel: 1,
      phase: 'constructing',
      startedAtMicros: BigInt(Date.now() - 1_000) * 1_000n,
      completesAtMicros: BigInt(Date.now() + 86_400_000) * 1_000n,
      revision: 2n
    });
    const presentation = createInnerKeepPresentation({
      buildings: [constructing],
      builder: {
        state: 'busy',
        slotId: constructing.slotId,
        buildingKind: constructing.buildingKind,
        targetLevel: constructing.targetLevel,
        completesAtMicros: constructing.completesAtMicros!
      }
    });
    renderScreen({
      presentation,
      selectedSlotId: constructing.slotId
    });

    const slot = screen.getByLabelText(/West Courtyard\. CITY MILL, Building Level 1/i);
    expect(slot.querySelector('.inner-keep-worksite')).not.toBeNull();
    expect(slot.querySelector('.inner-keep-building-art')).toBeNull();
    expect(screen.getByText('CONSTRUCTION IN PROGRESS')).toBeVisible();
    expect(screen.getAllByRole('time')).not.toHaveLength(0);
  });

  it('refreshes the coarse clock immediately when an idle Builder starts work', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T08:00:00.000Z'));
    const baseProps = {
      onBack: vi.fn(),
      onCloseToRealm: vi.fn(),
      onOpenSlot: vi.fn(),
      onReviewBuilding: vi.fn()
    };
    const view = render(
      <InnerKeepScreen
        {...baseProps}
        presentation={createInnerKeepPresentation()}
      />
    );

    vi.setSystemTime(new Date('2026-08-08T20:00:00.000Z'));
    const constructing: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      completedLevel: 0,
      targetLevel: 1,
      phase: 'constructing',
      startedAtMicros: BigInt(Date.now()) * 1_000n,
      completesAtMicros: BigInt(Date.now() + 2 * 60 * 60 * 1_000) * 1_000n,
      revision: 2n
    });
    view.rerender(
      <InnerKeepScreen
        {...baseProps}
        presentation={createInnerKeepPresentation({
          buildings: [constructing],
          builder: {
            state: 'busy',
            slotId: constructing.slotId,
            buildingKind: constructing.buildingKind,
            targetLevel: constructing.targetLevel,
            completesAtMicros: constructing.completesAtMicros!
          }
        })}
      />
    );

    expect(screen.getByRole('time')).toHaveTextContent('2h remaining');
  });

  it('announces and cues an upgrade start and completion exactly once', async () => {
    const observedKinds: string[] = [];
    const unsubscribe = subscribeWarpkeepSfx((events) => {
      observedKinds.push(...events.map((event) => event.kind));
    });
    const completeLevelOne: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      completedLevel: 1,
      targetLevel: 1,
      phase: 'complete',
      revision: 1n
    });
    const baseProps = {
      onBack: vi.fn(),
      onCloseToRealm: vi.fn(),
      onOpenSlot: vi.fn(),
      onReviewBuilding: vi.fn()
    };
    const view = render(
      <InnerKeepScreen
        {...baseProps}
        presentation={createInnerKeepPresentation({ buildings: [completeLevelOne] })}
      />
    );
    expect(observedKinds).toEqual([]);

    const constructingUpgrade: InnerKeepBuildingPresentation = Object.freeze({
      ...completeLevelOne,
      targetLevel: 2,
      phase: 'constructing',
      completesAtMicros: BigInt(Date.now() + 86_400_000) * 1_000n,
      revision: 2n
    });
    view.rerender(
      <InnerKeepScreen
        {...baseProps}
        presentation={createInnerKeepPresentation({
          buildings: [constructingUpgrade],
          builder: {
            state: 'busy',
            slotId: constructingUpgrade.slotId,
            buildingKind: constructingUpgrade.buildingKind,
            targetLevel: constructingUpgrade.targetLevel,
            completesAtMicros: constructingUpgrade.completesAtMicros!
          },
          projectRevision: 2n
        })}
      />
    );
    await waitFor(() => expect(screen.getByText(
      'Construction begun. CITY MILL, Level 2.'
    )).toBeInTheDocument());

    const completeLevelTwo: InnerKeepBuildingPresentation = Object.freeze({
      ...constructingUpgrade,
      completedLevel: 2,
      phase: 'complete',
      completesAtMicros: undefined,
      revision: 3n
    });
    const completedPresentation = createInnerKeepPresentation({
      buildings: [completeLevelTwo],
      projectRevision: 3n
    });
    view.rerender(
      <InnerKeepScreen {...baseProps} presentation={completedPresentation} />
    );
    await waitFor(() => expect(screen.getByText(
      'CITY MILL, Level 2, is complete.'
    )).toBeInTheDocument());
    view.rerender(
      <InnerKeepScreen {...baseProps} presentation={completedPresentation} />
    );

    expect(observedKinds).toEqual([
      'inner-keep-project-confirmed',
      'inner-keep-project-completed'
    ]);
    unsubscribe();
  });
});
