import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InnerKeepScreen } from '../src/components/inner-keep/InnerKeepScreen';
import {
  InnerKeepProjectNoCommitError,
  type InnerKeepBuildingKind,
  type StartInnerKeepProject
} from '../src/components/inner-keep/innerKeepPresentation';
import {
  evaluateInnerKeepPlacementDraft,
  initialInnerKeepPlacementDraft,
  type InnerKeepPlacementDraft
} from '../src/components/inner-keep/innerKeepPlacement';
import {
  createInnerKeepPresentation,
  createInnerKeepTestBuilding
} from './fixtures/innerKeepPresentation';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderScreen(options: Readonly<{
  catalogueOpen?: boolean;
  placementBuildingKind?: InnerKeepBuildingKind;
  placementDraft?: InnerKeepPlacementDraft | null;
  presentation?: ReturnType<typeof createInnerKeepPresentation>;
  renderMode?: 'webgl' | 'fallback';
  selectedBuildingKind?: InnerKeepBuildingKind;
  onBeginPlacement?: (kind: InnerKeepBuildingKind) => void;
  onOpenBuilding?: (kind: InnerKeepBuildingKind) => void;
  onOpenCatalogue?: () => void;
  onPlacementDraftChange?: (draft: InnerKeepPlacementDraft | null) => void;
  onStartProject?: StartInnerKeepProject;
}> = {}) {
  return render(
    <InnerKeepScreen
      catalogueOpen={options.catalogueOpen}
      onBack={vi.fn()}
      onBeginPlacement={options.onBeginPlacement ?? vi.fn()}
      onCloseToRealm={vi.fn()}
      onOpenBuilding={options.onOpenBuilding ?? vi.fn()}
      onOpenCatalogue={options.onOpenCatalogue ?? vi.fn()}
      onPlacementDraftChange={options.onPlacementDraftChange ?? vi.fn()}
      onStartProject={options.onStartProject}
      placementBuildingKind={options.placementBuildingKind}
      placementDraft={options.placementDraft}
      presentation={options.presentation ?? createInnerKeepPresentation()}
      renderMode={options.renderMode}
      selectedBuildingKind={options.selectedBuildingKind}
    />
  );
}

describe('InnerKeepScreen free placement', () => {
  it('opens a six-building catalogue from a mostly empty town', () => {
    const onOpenCatalogue = vi.fn();
    const view = renderScreen({ onOpenCatalogue });

    expect(screen.getByText('Your town is ready to grow')).toBeVisible();
    expect(document.querySelectorAll('[data-inner-keep-building-key]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /BUILD — choose a town project/i }));
    expect(onOpenCatalogue).toHaveBeenCalledOnce();

    view.rerender(
      <InnerKeepScreen
        catalogueOpen
        onBack={vi.fn()}
        onBeginPlacement={vi.fn()}
        onCloseToRealm={vi.fn()}
        onOpenBuilding={vi.fn()}
        onOpenCatalogue={onOpenCatalogue}
        onPlacementDraftChange={vi.fn()}
        presentation={createInnerKeepPresentation()}
      />
    );
    expect(screen.getByRole('heading', { name: 'Choose a town building' })).toHaveFocus();
    expect(screen.getAllByRole('button', { name: 'PLACE BUILDING' })).toHaveLength(6);
    expect(screen.getByText('City Barracks')).toBeVisible();
    expect(screen.getByText('Grand Covenant Cathedral')).toBeVisible();
    expect(screen.getByText('MILITARY BUILDING')).toBeVisible();
    expect(screen.getByText('CIVIC BUILDING')).toBeVisible();
  });

  it('starts building-first placement and exposes an accessible half-metre grid', () => {
    const presentation = createInnerKeepPresentation();
    const onPlacementDraftChange = vi.fn();
    const initial = initialInnerKeepPlacementDraft(
      'city-mill',
      presentation.buildings
    )!;
    renderScreen({
      placementBuildingKind: 'city-mill',
      placementDraft: initial,
      presentation,
      onPlacementDraftChange,
      onStartProject: vi.fn(async () => undefined)
    });

    expect(screen.getByRole('heading', { name: 'City Mill' })).toHaveFocus();
    expect(screen.getByText('This location is ready for construction.')).toBeVisible();
    expect(screen.getByText(/X 14\.0 m · Z -10\.0 m · 0°/)).toBeVisible();
    expect(document.querySelector('.inner-keep-map-placement-ghost'))
      .toHaveAttribute('data-valid', 'true');

    fireEvent.click(screen.getByRole('button', {
      name: 'Move building east by half a metre'
    }));
    expect(onPlacementDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({
      transform: expect.objectContaining({ localXMicrounits: 14_500_000n })
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Rotate building clockwise' }));
    expect(onPlacementDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({
      transform: expect.objectContaining({ rotationMilliDegrees: 90_000 })
    }));
  });

  it('projects canonical building envelopes onto fallback screen axes', () => {
    const presentation = createInnerKeepPresentation();
    const baseTransform = Object.freeze({
      localXMicrounits: -24_000_000n,
      localZMicrounits: -18_000_000n,
      rotationMilliDegrees: 0
    });
    const baseDraft = evaluateInnerKeepPlacementDraft(
      'grand-covenant-cathedral',
      baseTransform,
      presentation.buildings
    );
    const view = renderScreen({
      placementBuildingKind: 'grand-covenant-cathedral',
      placementDraft: baseDraft,
      presentation
    });

    const ghost = document.querySelector<HTMLElement>(
      '.inner-keep-map-placement-ghost'
    )!;
    expect(Number.parseFloat(ghost.style.width)).toBeCloseTo((37 / 88) * 100, 8);
    expect(Number.parseFloat(ghost.style.height)).toBeCloseTo((32.02 / 72) * 100, 8);
    expect(ghost.style.transform).toBe('translate(-50%, -50%)');

    view.unmount();
    const quarterTurn = Object.freeze({
      ...baseTransform,
      rotationMilliDegrees: 90_000
    });
    const quarterTurnDraft = evaluateInnerKeepPlacementDraft(
      'grand-covenant-cathedral',
      quarterTurn,
      presentation.buildings
    );
    const quarterTurnView = renderScreen({
      placementBuildingKind: 'grand-covenant-cathedral',
      placementDraft: quarterTurnDraft,
      presentation
    });

    const rotatedGhost = document.querySelector<HTMLElement>(
      '.inner-keep-map-placement-ghost'
    )!;
    expect(Number.parseFloat(rotatedGhost.style.width))
      .toBeCloseTo((32.02 / 88) * 100, 8);
    expect(Number.parseFloat(rotatedGhost.style.height))
      .toBeCloseTo((37 / 72) * 100, 8);
    expect(rotatedGhost.style.transform).toBe('translate(-50%, -50%)');

    quarterTurnView.unmount();
    renderScreen({
      presentation: createInnerKeepPresentation({
        buildings: [createInnerKeepTestBuilding({
          buildingKind: 'grand-covenant-cathedral',
          placement: quarterTurn
        })]
      })
    });
    const placedBuilding = document.querySelector<HTMLElement>(
      '[data-inner-keep-building-key="7:grand-covenant-cathedral"]'
    )!;
    expect(Number.parseFloat(placedBuilding.style.width))
      .toBeCloseTo((32.02 / 88) * 100, 8);
    expect(Number.parseFloat(placedBuilding.style.height))
      .toBeCloseTo((37 / 72) * 100, 8);
  });

  it('submits the exact confirmed transform once and seals duplicates', async () => {
    const presentation = createInnerKeepPresentation();
    const draft = initialInnerKeepPlacementDraft('city-barracks', presentation.buildings)!;
    let settle!: () => void;
    const pending = new Promise<void>((resolve) => { settle = resolve; });
    const onStartProject = vi.fn(() => pending);
    renderScreen({
      placementBuildingKind: 'city-barracks',
      placementDraft: draft,
      presentation,
      onStartProject
    });

    const confirm = screen.getByRole('button', { name: 'CONFIRM PLACEMENT' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onStartProject).toHaveBeenCalledExactlyOnceWith({
      kind: 'construct',
      buildingKind: 'city-barracks',
      placement: draft.transform
    });
    expect(screen.getByRole('button', { name: 'SUBMITTING…' })).toBeDisabled();
    settle();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AWAITING REALM STATUS' }))
        .toBeDisabled();
    });
  });

  it('explains invalid ground and blocks confirmation', () => {
    const presentation = createInnerKeepPresentation();
    const invalid = evaluateInnerKeepPlacementDraft(
      'city-mill',
      {
        localXMicrounits: 0n,
        localZMicrounits: 0n,
        rotationMilliDegrees: 0
      },
      presentation.buildings
    );
    renderScreen({
      placementBuildingKind: 'city-mill',
      placementDraft: invalid,
      presentation,
      onStartProject: vi.fn(async () => undefined)
    });

    expect(screen.getAllByText('Keep permanent roads and civic spaces clear.').length)
      .toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'CONFIRM PLACEMENT' })).toBeDisabled();
    expect(document.querySelector('.inner-keep-map-placement-ghost'))
      .toHaveAttribute('data-valid', 'false');
  });

  it('revalidates a retained draft when an authoritative building occupies it', async () => {
    const empty = createInnerKeepPresentation();
    const draft = initialInnerKeepPlacementDraft('city-mill', empty.buildings)!;
    const onPlacementDraftChange = vi.fn();
    const onStartProject = vi.fn(async () => undefined);
    const view = renderScreen({
      placementBuildingKind: 'city-mill',
      placementDraft: draft,
      presentation: empty,
      onPlacementDraftChange,
      onStartProject
    });
    expect(screen.getByRole('button', { name: 'CONFIRM PLACEMENT' })).toBeEnabled();

    const occupied = createInnerKeepPresentation({
      buildings: [createInnerKeepTestBuilding({
        buildingKind: 'city-goldworks',
        placement: draft.transform
      })]
    });
    view.rerender(
      <InnerKeepScreen
        onBack={vi.fn()}
        onBeginPlacement={vi.fn()}
        onCloseToRealm={vi.fn()}
        onOpenBuilding={vi.fn()}
        onOpenCatalogue={vi.fn()}
        onPlacementDraftChange={onPlacementDraftChange}
        onStartProject={onStartProject}
        placementBuildingKind="city-mill"
        placementDraft={draft}
        presentation={occupied}
      />
    );

    expect(screen.getByRole('button', { name: 'CONFIRM PLACEMENT' })).toBeDisabled();
    expect(screen.getAllByText('Move clear of another building.').length)
      .toBeGreaterThan(0);
    await waitFor(() => expect(onPlacementDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        evaluation: expect.objectContaining({
          valid: false,
          reason: 'building-overlap',
          conflictingId: '7:city-goldworks'
        })
      })
    ));
    expect(onStartProject).not.toHaveBeenCalled();
  });

  it('keeps existing buildings keyboard-selectable over WebGL and opens upgrades', () => {
    const building = createInnerKeepTestBuilding({ buildingKind: 'city-mill' });
    const presentation = createInnerKeepPresentation({ buildings: [building] });
    const onOpenBuilding = vi.fn();
    const view = renderScreen({ presentation, renderMode: 'webgl', onOpenBuilding });

    const control = screen.getByRole('button', { name: /City Mill\. Level 1/i });
    expect(control).toHaveAttribute('data-inner-keep-building-key', '7:city-mill');
    control.focus();
    fireEvent.click(control);
    expect(onOpenBuilding).toHaveBeenCalledExactlyOnceWith('city-mill');

    view.rerender(
      <InnerKeepScreen
        onBack={vi.fn()}
        onBeginPlacement={vi.fn()}
        onCloseToRealm={vi.fn()}
        onOpenBuilding={onOpenBuilding}
        onOpenCatalogue={vi.fn()}
        onPlacementDraftChange={vi.fn()}
        onStartProject={vi.fn(async () => undefined)}
        presentation={presentation}
        renderMode="webgl"
        selectedBuildingKind="city-mill"
      />
    );
    expect(screen.getByRole('button', { name: 'UPGRADE TO LEVEL 2' })).toBeEnabled();
    expect(screen.getByText(/X 14\.0 m · Z -10\.0 m/)).toBeVisible();
  });

  it('submits an upgrade without allowing the client to move the building', async () => {
    const building = createInnerKeepTestBuilding({ buildingKind: 'city-mill' });
    const onStartProject = vi.fn(async () => undefined);
    renderScreen({
      presentation: createInnerKeepPresentation({ buildings: [building] }),
      selectedBuildingKind: 'city-mill',
      onStartProject
    });

    fireEvent.click(screen.getByRole('button', { name: 'UPGRADE TO LEVEL 2' }));
    expect(onStartProject).toHaveBeenCalledExactlyOnceWith({
      kind: 'upgrade',
      buildingKind: 'city-mill'
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AWAITING REALM STATUS' }))
        .toBeDisabled();
    });
  });

  it('reopens a deliberate placement after a proven no-commit rejection', async () => {
    const presentation = createInnerKeepPresentation();
    const draft = initialInnerKeepPlacementDraft('city-mill', presentation.buildings)!;
    const onStartProject = vi.fn()
      .mockRejectedValueOnce(new InnerKeepProjectNoCommitError('Synthetic preflight.'))
      .mockResolvedValueOnce(undefined);
    renderScreen({
      placementBuildingKind: 'city-mill',
      placementDraft: draft,
      presentation,
      onStartProject
    });

    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM PLACEMENT' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'CONFIRM PLACEMENT' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM PLACEMENT' }));
    await waitFor(() => expect(onStartProject).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AWAITING REALM STATUS' }))
        .toBeDisabled();
    });
  });

  it('fails closed when the placement policy projection cannot be verified', () => {
    renderScreen({
      presentation: {
        ...createInnerKeepPresentation(),
        layoutDigest: 'invalid-layout-digest'
      }
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Inner Keep unavailable');
    expect(screen.getByRole('button', { name: /BUILD — choose a town project/i }))
      .toBeDisabled();
  });

  it('shows construction dressing without finished art or another active command', () => {
    const building = createInnerKeepTestBuilding({
      buildingKind: 'city-mill',
      phase: 'constructing'
    });
    const presentation = createInnerKeepPresentation({
      buildings: [building],
      builder: {
        state: 'busy',
        buildingKey: building.buildingKey,
        buildingKind: building.buildingKind,
        targetLevel: building.targetLevel,
        completesAtMicros: building.completesAtMicros!
      },
      phase: 'constructing'
    });
    renderScreen({
      presentation,
      selectedBuildingKind: 'city-mill',
      onStartProject: vi.fn(async () => undefined)
    });

    expect(screen.getByText('CONSTRUCTION IN PROGRESS')).toBeVisible();
    expect(document.querySelector('.inner-keep-worksite')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /UPGRADE TO LEVEL/i })).toBeNull();
    expect(screen.getByRole('button', { name: /BUILDER OCCUPIED/i })).toBeVisible();
  });
});
