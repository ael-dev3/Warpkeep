import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmChoiceSelector } from '../src/components/menu/RealmChoiceSelector';
import {
  GENESIS_001_ID,
  GENESIS_002_ID,
  getRealmChoices
} from '../src/components/menu/realmChoicePolicy';

afterEach(cleanup);

describe('RealmChoiceSelector', () => {
  it('renders both realm choices with visible, described admission marks', () => {
    render(
      <RealmChoiceSelector
        choices={getRealmChoices(true)}
        interactive
        onSelect={vi.fn()}
        selectedRealmId={GENESIS_001_ID}
      />
    );

    const selector = screen.getByRole('radiogroup', { name: 'Choose realm' });
    const genesis001 = within(selector).getByRole('radio', {
      name: /Genesis 001.*version 0\.3\.43.*Admitted/i
    });
    const genesis002 = within(selector).getByRole('radio', {
      name: /Genesis 002.*version 0\.4\.0.*Not admitted/i
    });

    expect(genesis001.getAttribute('aria-checked')).toBe('true');
    expect(genesis002.getAttribute('aria-checked')).toBe('false');
    expect(within(genesis001).getByText('✓').getAttribute('aria-hidden')).toBe('true');
    expect(within(genesis002).getByText('×').getAttribute('aria-hidden')).toBe('true');
    expect(genesis001.getAttribute('data-admission')).toBe('admitted');
    expect(genesis002.getAttribute('data-admission')).toBe('not-admitted');

    for (const choice of [genesis001, genesis002]) {
      const tooltipId = choice.getAttribute('aria-describedby');
      expect(tooltipId).toBeTruthy();
      expect(document.getElementById(tooltipId!)?.getAttribute('role')).toBe('tooltip');
      expect(document.getElementById(tooltipId!)?.textContent).toBeTruthy();
    }
  });

  it('selects a realm without treating its admission mark as an action', () => {
    const onSelect = vi.fn();
    render(
      <RealmChoiceSelector
        choices={getRealmChoices(false)}
        interactive
        onSelect={onSelect}
        selectedRealmId={GENESIS_001_ID}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /Genesis 002/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(GENESIS_002_ID);
  });

  it('supports standard radio-group arrow navigation', () => {
    const onSelect = vi.fn();
    render(
      <RealmChoiceSelector
        choices={getRealmChoices(false)}
        interactive
        onSelect={onSelect}
        selectedRealmId={GENESIS_001_ID}
      />
    );
    const genesis001 = screen.getByRole('radio', { name: /Genesis 001/i });
    const genesis002 = screen.getByRole('radio', { name: /Genesis 002/i });

    genesis001.focus();
    fireEvent.keyDown(genesis001, { key: 'ArrowRight' });

    expect(onSelect).toHaveBeenCalledWith(GENESIS_002_ID);
    expect(document.activeElement).toBe(genesis002);
  });

  it('locks realm selection during session restoration', () => {
    render(
      <RealmChoiceSelector
        choices={getRealmChoices(false)}
        interactive={false}
        onSelect={vi.fn()}
        selectedRealmId={GENESIS_001_ID}
      />
    );

    expect(screen.getAllByRole('radio').every((radio) => (
      (radio as HTMLButtonElement).disabled
    ))).toBe(true);
  });
});
