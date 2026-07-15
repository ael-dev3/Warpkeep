import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  WARPKEEP_FARCASTER_CHANNEL_URL,
  WARPKEEP_GITHUB_ISSUE_INTAKE_URL
} from '../src/farcaster/farcasterProjectLinks';

describe('Warpkeep public project links', () => {
  it('pins the official Farcaster channel to its exact HTTPS destination', () => {
    const channel = new URL(WARPKEEP_FARCASTER_CHANNEL_URL);

    expect(channel.protocol).toBe('https:');
    expect(channel.hostname).toBe('farcaster.xyz');
    expect(channel.pathname).toBe('/~/channel/warpkeep');
    expect(channel.username).toBe('');
    expect(channel.password).toBe('');
    expect(channel.search).toBe('');
    expect(channel.hash).toBe('');
  });

  it('publishes the official Farcaster channel in the root README', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');

    expect(readme).toContain(
      `[Warpkeep channel on Farcaster](${WARPKEEP_FARCASTER_CHANNEL_URL})`
    );
  });

  it('pins the Realm Council issue chooser without query-prefilled fields', () => {
    const intake = new URL(WARPKEEP_GITHUB_ISSUE_INTAKE_URL);

    expect(intake.protocol).toBe('https:');
    expect(intake.hostname).toBe('github.com');
    expect(intake.pathname).toBe('/ael-dev3/Warpkeep/issues/new/choose');
    expect(intake.username).toBe('');
    expect(intake.password).toBe('');
    expect(intake.search).toBe('');
    expect(intake.hash).toBe('');
  });
});
