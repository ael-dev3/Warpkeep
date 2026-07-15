const GITHUB_RELEASE_PAYLOAD_HOSTS = new Set([
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com'
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function assertHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid absolute URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error(`${label} must be credential-free HTTPS on the default port.`);
  }
  return url;
}

export async function fetchPinnedGithubReleaseAsset(url, init = {}, fetchImplementation = fetch) {
  const source = assertHttpsUrl(url, 'GitHub release URL');
  if (source.hostname !== 'github.com' || !source.pathname.includes('/releases/download/')) {
    throw new Error('GitHub release URL must name a github.com release attachment.');
  }

  const redirectResponse = await fetchImplementation(source, {
    ...init,
    redirect: 'manual'
  });
  if (redirectResponse.ok) return redirectResponse;
  if (!REDIRECT_STATUSES.has(redirectResponse.status)) return redirectResponse;

  const location = redirectResponse.headers.get('location');
  if (!location) throw new Error('GitHub release redirect omitted its Location header.');
  const destination = assertHttpsUrl(new URL(location, source), 'GitHub release payload URL');
  if (!GITHUB_RELEASE_PAYLOAD_HOSTS.has(destination.hostname)) {
    throw new Error(`GitHub release redirected to an unapproved payload host: ${destination.hostname}.`);
  }
  try {
    await redirectResponse.body?.cancel();
  } catch {
    // A redirect body is not trusted or needed; cancellation is best-effort.
  }

  const response = await fetchImplementation(destination, {
    ...init,
    redirect: 'error'
  });
  if (REDIRECT_STATUSES.has(response.status)) {
    throw new Error('GitHub release payload attempted an additional redirect.');
  }
  return response;
}
