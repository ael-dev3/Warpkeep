import { describe, expect, it } from 'vitest';

import {
  GENESIS_001_ID,
  GENESIS_002_ID,
  NEW_ADMISSIONS_SUSPENDED,
  getRealmChoices
} from '../src/components/menu/realmChoicePolicy';
import {
  GENESIS_001_GAME_VERSION,
  GENESIS_002_GAME_VERSION
} from '../src/release/realmReleaseIdentity';

describe('realm choice policy', () => {
  it('keeps the two realm game identities distinct from the 0.4.0 launcher', () => {
    expect(GENESIS_001_GAME_VERSION).toBe('0.3.43');
    expect(GENESIS_002_GAME_VERSION).toBe('0.4.0');
  });

  it('keeps every new admission path suspended for the 0.4.0 launch', () => {
    expect(NEW_ADMISSIONS_SUSPENDED).toBe(true);
  });

  it('shows authenticated Genesis 001 players as admitted while Genesis 002 stays sealed', () => {
    expect(getRealmChoices(true)).toEqual([
      expect.objectContaining({
        id: GENESIS_001_ID,
        version: '0.3.43',
        admission: 'admitted',
        statusLabel: 'Admitted'
      }),
      expect.objectContaining({
        id: GENESIS_002_ID,
        version: '0.4.0',
        admission: 'not-admitted',
        statusLabel: 'Not admitted'
      })
    ]);
    expect(getRealmChoices(true)[1]?.tooltip).toMatch(/admissions are suspended/i);
  });

  it('fails closed when Genesis 001 admission has not been authenticated', () => {
    const [genesis001] = getRealmChoices(false);

    expect(genesis001).toEqual(expect.objectContaining({
      id: GENESIS_001_ID,
      admission: 'not-admitted',
      statusLabel: 'Not admitted'
    }));
    expect(genesis001?.tooltip).toMatch(/sign in to verify existing admission/i);
    expect(genesis001?.tooltip).toMatch(/new admissions are suspended/i);
  });
});
