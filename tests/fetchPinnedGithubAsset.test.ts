import { describe, expect, it, vi } from 'vitest';

import { fetchPinnedGithubReleaseAsset } from '../scripts/fetch-pinned-github-asset.mjs';

const SOURCE = 'https://github.com/example/project/releases/download/v1/asset.zip';

describe('pinned GitHub release fetch', () => {
  it('manually validates the GitHub payload host and forbids any payload redirect', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://release-assets.githubusercontent.com/github-production-release-asset/1' }
      }))
      .mockResolvedValueOnce(new Response('exact bytes', { status: 200 }));

    const response = await fetchPinnedGithubReleaseAsset(
      SOURCE,
      { headers: { 'user-agent': 'test' } },
      fetchImplementation as typeof fetch
    );

    expect(await response.text()).toBe('exact bytes');
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    expect(fetchImplementation.mock.calls[1][1]).toMatchObject({ redirect: 'error' });
    expect(String(fetchImplementation.mock.calls[1][0])).toMatch(/^https:\/\/release-assets\.githubusercontent\.com\//u);
  });

  it('rejects a redirect to a non-GitHub payload host before fetching it', async () => {
    const redirect = new Response('discard me', {
      status: 302,
      headers: { location: 'https://example.test/payload' }
    });
    const cancel = vi.spyOn(redirect.body!, 'cancel');
    const fetchImplementation = vi.fn().mockResolvedValue(redirect);

    await expect(fetchPinnedGithubReleaseAsset(
      SOURCE,
      {},
      fetchImplementation as typeof fetch
    )).rejects.toThrow(/unapproved payload host/i);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('fails closed if the approved payload endpoint redirects again', async () => {
    const secondRedirect = new Response('discard me too', { status: 307 });
    const cancel = vi.spyOn(secondRedirect.body!, 'cancel');
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://objects.githubusercontent.com/first' }
      }))
      .mockResolvedValueOnce(secondRedirect);

    await expect(fetchPinnedGithubReleaseAsset(
      SOURCE,
      {},
      fetchImplementation as typeof fetch
    )).rejects.toThrow(/additional redirect/i);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects non-release and credential-bearing source URLs', async () => {
    const fetchImplementation = vi.fn();
    await expect(fetchPinnedGithubReleaseAsset(
      'https://github.com/example/project/archive/main.zip',
      {},
      fetchImplementation as typeof fetch
    )).rejects.toThrow(/release attachment/i);
    await expect(fetchPinnedGithubReleaseAsset(
      'https://token@github.com/example/project/releases/download/v1/asset.zip',
      {},
      fetchImplementation as typeof fetch
    )).rejects.toThrow(/credential-free HTTPS/i);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
