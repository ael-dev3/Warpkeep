import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreditsRoll, CREDITS_ROLES } from '../src/components/menu/CreditsRoll';

describe('CreditsRoll', () => {
  it('opens with the human idea and gives Clawberto the remaining gamedev roles', () => {
    expect(CREDITS_ROLES[0]).toEqual({ role: 'IDEAS MAN', name: 'AEL' });
    expect(CREDITS_ROLES.slice(1).length).toBeGreaterThan(1);
    expect(CREDITS_ROLES.slice(1).every((credit) => credit.name === 'CLAWBERTO')).toBe(true);
  });

  it('renders every credit and closes through its accessible control', () => {
    const onClose = vi.fn();
    render(<CreditsRoll onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Warpkeep credits' })).not.toBeNull();
    CREDITS_ROLES.forEach(({ role, name }) => {
      expect(screen.getByText(role)).not.toBeNull();
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /Back to Main Menu/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
