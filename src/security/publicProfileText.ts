const ASCII_AND_C1_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;
const INVISIBLE_DIRECTIONAL_CONTROL_PATTERN =
  /[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/g;

/**
 * Normalizes untrusted profile text for browser presentation only. React
 * still owns HTML escaping; this boundary removes invisible and directional
 * controls that can make one public handle appear to be another.
 */
export function normalizePublicProfileText(
  value: unknown,
  maximumLength = 256
) {
  if (
    typeof value !== 'string'
    || !Number.isSafeInteger(maximumLength)
    || maximumLength <= 0
    // Producer policies bound Unicode code points, while JavaScript length
    // counts UTF-16 code units. Retain a strict raw-work ceiling without
    // rejecting a valid all-astral profile solely because each code point uses
    // a surrogate pair.
    || value.length > maximumLength * 2
  ) {
    return undefined;
  }

  const normalized = value
    .replace(ASCII_AND_C1_CONTROL_PATTERN, ' ')
    .replace(INVISIBLE_DIRECTIONAL_CONTROL_PATTERN, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized && [...normalized].length <= maximumLength
    ? normalized
    : undefined;
}
