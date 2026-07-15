export function fetchPinnedGithubReleaseAsset(
  url: string | URL,
  init?: RequestInit,
  fetchImplementation?: typeof fetch
): Promise<Response>;
