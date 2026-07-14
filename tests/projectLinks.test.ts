import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WARPKEEP_FARCASTER_CHANNEL_URL } from '../src/farcaster/farcasterProjectLinks';

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
});
