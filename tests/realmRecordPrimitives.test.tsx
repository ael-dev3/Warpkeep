import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  RealmRecordField,
  RealmRecordStatus
} from '../src/components/realm/RealmRecordPrimitives';

afterEach(cleanup);

describe('Realm record primitives', () => {
  it('keeps semantic record facts composable without owning a panel shell', () => {
    render(
      <dl>
        <RealmRecordField className="domain-field" label="Arrival time left" valueRole="timer">
          2m remaining
        </RealmRecordField>
      </dl>
    );

    expect(screen.getByText('Arrival time left').tagName).toBe('DT');
    const value = screen.getByRole('timer');
    expect(value.tagName).toBe('DD');
    expect(value.textContent).toBe('2m remaining');
    expect(value.parentElement?.classList.contains('realm-record-field')).toBe(true);
    expect(value.parentElement?.classList.contains('domain-field')).toBe(true);
  });

  it('uses a common state vocabulary while retaining caller styling', () => {
    render(
      <>
        <RealmRecordStatus className="domain-status" state="pending">
          Waiting for the Realm
        </RealmRecordStatus>
        <RealmRecordStatus state="error">
          Command failed
        </RealmRecordStatus>
      </>
    );

    const pending = screen.getByRole('status');
    expect(pending.getAttribute('data-state')).toBe('pending');
    expect(pending.classList.contains('domain-status')).toBe(true);
    expect(screen.getByRole('alert').getAttribute('data-state')).toBe('error');
  });
});
