import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkerInspectionPanel } from '../src/components/realm/WorkerInspectionPanel';
import type { RealmWorkerPublicPresentation } from '../src/components/realm/realmWorkerPresentation';

afterEach(() => {
  cleanup();
});

const ownedWorker: RealmWorkerPublicPresentation = {
  workerId: 'worker-hegemony-004-1',
  ordinal: 1,
  originCastleId: 4,
  originCastleName: 'Hegemony Keep 004',
  status: 'gathering',
  resourceKind: 'gold',
  destinationLabel: 'Gold Mine 07',
  ownedByViewer: true,
  claimableAmount: 3n
};

describe('WorkerInspectionPanel', () => {
  it('presents the supplied Worker art and owner-only actions', async () => {
    const onRequestClose = vi.fn();
    const onRecallWorker = vi.fn(async () => undefined);
    const onCollectWorker = vi.fn(async () => undefined);
    const focusTargetRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <WorkerInspectionPanel
        id="worker-record"
        worker={ownedWorker}
        onRequestClose={onRequestClose}
        onRecallWorker={onRecallWorker}
        onCollectWorker={onCollectWorker}
        focusTargetRef={focusTargetRef}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Worker 1' });
    expect(dialog.id).toBe('worker-record');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(dialog.getAttribute('aria-labelledby')).toBe('worker-record-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('worker-record-description');
    expect(screen.getByText('Hegemony Keep 004')).toBeTruthy();
    expect(screen.getByText('GATHERING GOLD')).toBeTruthy();
    expect(screen.getByText('Gold Mine 07')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();

    const art = container.querySelector<HTMLImageElement>('.worker-inspection__hero-art');
    expect(art?.getAttribute('src')).toBe('/images/realm/hegemony-worker-record.webp');
    expect(art?.getAttribute('alt')).toBe('');
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(art?.getAttribute('decoding')).toBe('async');
    expect(art?.getAttribute('draggable')).toBe('false');
    expect(art?.getAttribute('width')).toBe('1024');
    expect(art?.getAttribute('height')).toBe('1024');

    const close = screen.getByRole('button', { name: 'CLOSE WORKER RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(focusTargetRef.current).toBe(close);

    fireEvent.click(screen.getByRole('button', { name: 'COLLECT' }));
    fireEvent.click(screen.getByRole('button', { name: 'RETURN TO KEEP' }));
    await waitFor(() => {
      expect(onCollectWorker).toHaveBeenCalledWith(ownedWorker.workerId);
      expect(onRecallWorker).toHaveBeenCalledWith(ownedWorker.workerId);
    });

    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it('keeps another keeper read-only and hides caller-only cargo', () => {
    const otherWorker: RealmWorkerPublicPresentation = {
      ...ownedWorker,
      workerId: 'worker-other-1',
      originCastleId: 12,
      originCastleName: 'Northwatch Keep',
      ownedByViewer: false,
      claimableAmount: 99n
    };

    render(
      <WorkerInspectionPanel
        id="other-worker-record"
        worker={otherWorker}
        onRequestClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Worker 1' });
    expect(dialog.textContent).toContain('Northwatch Keep');
    expect(dialog.textContent).toContain('GATHERING GOLD');
    expect(dialog.textContent).toContain('read-only');
    expect(dialog.textContent).not.toContain('Claimable cargo');
    expect(screen.queryByRole('button', { name: 'COLLECT' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'RETURN TO KEEP' })).toBeNull();
    expect(dialog.textContent).not.toContain('99');
  });
});
