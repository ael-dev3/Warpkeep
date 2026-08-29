import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Greater Realm host QA navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps Genesis 002 sealed while admitting the local owner to Genesis 001 and PTR', async () => {
    await act(async () => {
      await import('../src/dev/greaterRealmHostQaMain');
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Return to Menu' }));

    const menu = await screen.findByRole('navigation', { name: 'Hegemony main menu' });
    expect(within(menu).queryByRole('radio')).toBeNull();
    fireEvent.click(within(menu).getByRole('button', { name: 'ENTER REALM' }));

    const genesis001 = screen.getByRole('radio', {
      name: /Genesis 001.*version 0\.3\.43.*Admitted/i
    });
    const genesis002 = screen.getByRole('radio', {
      name: /Genesis 002.*version 0\.4\.0.*Not admitted/i
    });
    const ptr = screen.getByRole('radio', {
      name: /PTR.*version 0\.4\.0-ptr\.1.*Admitted/i
    });
    expect(within(genesis001).getByText('✓').getAttribute('aria-hidden')).toBe('true');
    expect(within(genesis002).getByText('×').getAttribute('aria-hidden')).toBe('true');
    expect(within(ptr).getByText('✓').getAttribute('aria-hidden')).toBe('true');
    expect(document.getElementById(genesis001.getAttribute('aria-describedby')!)?.textContent)
      .toMatch(/existing 0\.3\.43 access is preserved/i);
    expect(document.getElementById(genesis002.getAttribute('aria-describedby')!)?.textContent)
      .toMatch(/admissions are suspended/i);
    expect(document.getElementById(ptr.getAttribute('aria-describedby')!)?.textContent)
      .toMatch(/admitted to PTR/i);

    fireEvent.click(genesis002);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));
    expect(screen.getByRole('status').textContent).toMatch(/Genesis 002 is sealed/i);
    expect(screen.getByRole('heading', { name: 'CHOOSE YOUR REALM' })).not.toBeNull();

    fireEvent.click(ptr);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));
    expect(await screen.findByRole('main', { name: 'Greater Realm' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(genesis001);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));
    expect(await screen.findByRole('main', { name: 'Greater Realm' })).not.toBeNull();
  });
});
