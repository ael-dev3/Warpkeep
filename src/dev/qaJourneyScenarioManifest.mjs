/**
 * The single checked-in manifest shared by the React journey lab and the
 * machine-local real-browser probe. Keep this file data-only: it is reachable
 * only from development entries and must never acquire product authority.
 */
export const QA_JOURNEY_SCENARIO_MANIFEST = Object.freeze([
  Object.freeze({
    id: 'journey',
    label: 'Interactive full journey',
    externalAnchorCount: 2,
    landmark: Object.freeze({ role: 'region', name: 'Synthetic journey controls' }),
  }),
  Object.freeze({
    id: 'menu',
    label: 'Main menu',
    externalAnchorCount: 2,
    landmark: Object.freeze({ role: 'navigation', name: 'Hegemony main menu' }),
  }),
  Object.freeze({
    id: 'terms',
    label: 'Alpha Terms',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'dialog', name: 'ALPHA PARTICIPATION TERMS' }),
  }),
  Object.freeze({
    id: 'auth-creating',
    label: 'Auth · creating channel',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'CLAIM YOUR KEEP' }),
  }),
  Object.freeze({
    id: 'auth-awaiting',
    label: 'Auth · synthetic QR ready',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'CLAIM YOUR KEEP' }),
  }),
  Object.freeze({
    id: 'auth-qr-error',
    label: 'Auth · QR unavailable',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'CLAIM YOUR KEEP' }),
  }),
  Object.freeze({
    id: 'auth-verifying',
    label: 'Auth · verifying',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'VERIFYING HEGEMONY RECORD' }),
  }),
  Object.freeze({
    id: 'admission-pending',
    label: 'Admission pending',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'ENTRY NOT YET GRANTED' }),
  }),
  Object.freeze({
    id: 'auth-authenticated',
    label: 'Authenticated presentation',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'HEGEMONY RECORD VERIFIED' }),
  }),
  Object.freeze({
    id: 'auth-expired',
    label: 'Auth · expired',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'AUTHENTICATION EXPIRED' }),
  }),
  Object.freeze({
    id: 'auth-error',
    label: 'Auth · error',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'AUTHENTICATION FAILED' }),
  }),
  Object.freeze({
    id: 'admission-connecting',
    label: 'Admission · connecting',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'OPENING HEGEMONY RECORDS' }),
  }),
  Object.freeze({
    id: 'admission-reconnecting',
    label: 'Admission · reconnecting',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'REOPENING HEGEMONY RECORDS' }),
  }),
  Object.freeze({
    id: 'admission-checking',
    label: 'Admission · checking',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'VERIFYING FRONTIER ACCESS' }),
  }),
  Object.freeze({
    id: 'admission-awaiting-terms',
    label: 'Admission · Terms required',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'ALPHA TERMS REQUIRED' }),
  }),
  Object.freeze({
    id: 'admission-denied',
    label: 'Admission · denied',
    externalAnchorCount: 1,
    landmark: Object.freeze({ role: 'heading', name: 'ENTRY NOT YET GRANTED' }),
  }),
  Object.freeze({
    id: 'admission-bootstrapping',
    label: 'Admission · bootstrapping',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'ESTABLISHING YOUR KEEP' }),
  }),
  Object.freeze({
    id: 'admission-accepting-terms',
    label: 'Admission · recording Terms',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'RECORDING ALPHA TERMS' }),
  }),
  Object.freeze({
    id: 'admission-opening-realm',
    label: 'Admission · opening Realm',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'OPENING GENESIS 001…' }),
  }),
  Object.freeze({
    id: 'admission-error',
    label: 'Admission · unavailable',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'heading', name: 'HEGEMONY RECORDS UNREACHABLE' }),
  }),
  Object.freeze({
    id: 'realm-player',
    label: 'Realm · synthetic player',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'main', name: 'Hegemony realm' }),
  }),
  Object.freeze({
    id: 'realm-observer',
    label: 'Realm · read-only observer',
    externalAnchorCount: 0,
    landmark: Object.freeze({ role: 'main', name: 'Hegemony realm QA observer' }),
  }),
]);

const UNREADABLE_QA_QR_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">',
  '<rect width="240" height="240" rx="16" fill="#f7edd5"/>',
  '<path d="M24 24h64v64H24zM152 24h64v64h-64zM24 152h64v64H24z" fill="#17121d"/>',
  '<path d="M104 112h32v16h-32zm48 0h40v16h-40zm-48 40h88v16h-88zm0 40h48v16h-48z" fill="#8d55ad"/>',
  '<text x="120" y="104" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#5a315f">LOCAL QA</text>',
  '<text x="120" y="138" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#5a315f">NOT SCANNABLE</text>',
  '</svg>',
].join('');

/** A fixed presentation image, never a QR encoding or authorization URL. */
export const QA_UNSCANNABLE_QR_DATA_URL =
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(UNREADABLE_QA_QR_SVG)}`;
