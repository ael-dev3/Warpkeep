import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmChoiceSelector } from '../src/components/menu/RealmChoiceSelector';
import {
  GENESIS_001_ID,
  GENESIS_002_ID,
  PTR_ID,
  getRealmChoices
} from '../src/components/menu/realmChoicePolicy';

const SELECTOR_CSS = readFileSync(
  resolve(import.meta.dirname, '../src/components/menu/RealmChoiceSelector.css'),
  'utf8'
);

afterEach(cleanup);

describe('RealmChoiceSelector', () => {
  it('edge-aligns the outer tooltips at every viewport width', () => {
    const responsiveRules = SELECTOR_CSS.indexOf('@media');
    expect(responsiveRules).toBeGreaterThan(0);
    const baseRules = SELECTOR_CSS.slice(0, responsiveRules);

    expect(baseRules).toContain(
      '.realm-choice-selector__choice:first-child .realm-choice-selector__tooltip {'
    );
    expect(baseRules).toContain(
      '.realm-choice-selector__choice:last-child .realm-choice-selector__tooltip {'
    );
    expect(baseRules).toMatch(/first-child[\s\S]*?right:\s*auto;[\s\S]*?left:\s*0;/);
    expect(baseRules).toMatch(/last-child[\s\S]*?right:\s*0;[\s\S]*?left:\s*auto;/);
  });

  it('renders all three exact accessible realm names with visible, described admission marks', () => {
    render(
      <RealmChoiceSelector
        choices={getRealmChoices(true)}
        interactive
        onBack={vi.fn()}
        onContinue={vi.fn()}
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
    const ptr = within(selector).getByRole('radio', {
      name: /Public Test Realm.*version 0\.4\.0-ptr\.1.*Access unknown/i
    });

    expect(genesis001.getAttribute('aria-checked')).toBe('true');
    expect(genesis002.getAttribute('aria-checked')).toBe('false');
    expect(ptr.getAttribute('aria-checked')).toBe('false');
    expect(within(genesis001).getByText('✓').getAttribute('aria-hidden')).toBe('true');
    expect(within(genesis002).getByText('×').getAttribute('aria-hidden')).toBe('true');
    expect(within(ptr).getByText('×').getAttribute('aria-hidden')).toBe('true');
    expect(genesis001.getAttribute('data-admission')).toBe('admitted');
    expect(genesis002.getAttribute('data-admission')).toBe('not-admitted');
    expect(ptr.getAttribute('data-admission')).toBe('unknown');

    for (const choice of [genesis001, genesis002, ptr]) {
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
        onBack={vi.fn()}
        onContinue={vi.fn()}
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
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onSelect={onSelect}
        selectedRealmId={GENESIS_001_ID}
      />
    );
    const genesis001 = screen.getByRole('radio', { name: /Genesis 001/i });
    const genesis002 = screen.getByRole('radio', { name: /Genesis 002/i });
    const ptr = screen.getByRole('radio', { name: /Public Test Realm/i });

    genesis001.focus();
    fireEvent.keyDown(genesis001, { key: 'ArrowRight' });

    expect(onSelect).toHaveBeenCalledWith(GENESIS_002_ID);
    expect(document.activeElement).toBe(genesis002);

    fireEvent.keyDown(genesis002, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith(PTR_ID);
    expect(document.activeElement).toBe(ptr);
  });

  it('provides explicit Back and Enter actions for the selected realm', () => {
    const onBack = vi.fn();
    const onContinue = vi.fn();
    render(
      <RealmChoiceSelector
        choices={getRealmChoices(false)}
        interactive
        onBack={onBack}
        onContinue={onContinue}
        onSelect={vi.fn()}
        selectedRealmId={GENESIS_001_ID}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('locks realm selection during session restoration', () => {
    render(
      <RealmChoiceSelector
        choices={getRealmChoices(false)}
        interactive={false}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onSelect={vi.fn()}
        selectedRealmId={GENESIS_001_ID}
      />
    );

    expect(screen.getAllByRole('radio').every((radio) => (
      (radio as HTMLButtonElement).disabled
    ))).toBe(true);
  });
});
