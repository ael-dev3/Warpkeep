export const WARPKEEP_ALPHA_TERMS_PATH = 'terms/index.html';
export const WARPKEEP_ALPHA_PRIVACY_PATH = 'privacy/index.html';

export function resolvePublicDocumentUrl(baseUrl: string, documentPath: string) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${documentPath.replace(/^\/+/, '')}`;
}

export const WARPKEEP_ALPHA_TERMS_URL = resolvePublicDocumentUrl(
  import.meta.env.BASE_URL,
  WARPKEEP_ALPHA_TERMS_PATH
);

export const WARPKEEP_ALPHA_PRIVACY_URL = resolvePublicDocumentUrl(
  import.meta.env.BASE_URL,
  WARPKEEP_ALPHA_PRIVACY_PATH
);
