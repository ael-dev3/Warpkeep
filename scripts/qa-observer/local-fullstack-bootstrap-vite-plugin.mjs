export const LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID =
  'virtual:warpkeep-local-fullstack-bootstrap';
const RESOLVED_LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID =
  `\0${LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID}`;
const LOCAL_DATABASE = 'warpkeep-local-fullstack';
const LOCAL_ISSUER = 'http://127.0.0.1';
const LOCAL_AUDIENCE = 'warpkeep-spacetimedb';
const LOCAL_FID = 9_900_001;
const LOCAL_PROFILE_URL = 'https://i.imgur.com/warpkeep-local-keeper.png';
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const BOOTSTRAP_KEYS = Object.freeze([
  'accessExpiresAt',
  'accessToken',
  'audience',
  'database',
  'displayName',
  'fid',
  'issuer',
  'pfpUrl',
  'sessionExpiresAt',
  'spacetimeUri',
  'username',
  'version',
].sort());

function exactLoopbackOrigin(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:'
      && parsed.hostname === '127.0.0.1'
      && parsed.port !== ''
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.username === ''
      && parsed.password === ''
      && value === parsed.origin
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function exactBootstrap(value, now) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid disposable full-stack bootstrap.');
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== BOOTSTRAP_KEYS.length
    || keys.some((key, index) => key !== BOOTSTRAP_KEYS[index])
    || value.version !== 1
    || exactLoopbackOrigin(value.spacetimeUri) === undefined
    || value.database !== LOCAL_DATABASE
    || value.issuer !== LOCAL_ISSUER
    || value.audience !== LOCAL_AUDIENCE
    || value.fid !== LOCAL_FID
    || value.username !== 'qa.warpkeeper'
    || value.displayName !== 'Synthetic QA Keeper'
    || value.pfpUrl !== LOCAL_PROFILE_URL
    || typeof value.accessToken !== 'string'
    || value.accessToken.length < 64
    || value.accessToken.length > 16_384
    || !JWT_PATTERN.test(value.accessToken)
    || !Number.isSafeInteger(value.accessExpiresAt)
    || !Number.isSafeInteger(value.sessionExpiresAt)
    || !Number.isSafeInteger(now)
    || value.accessExpiresAt <= now
    || value.accessExpiresAt - now > 10 * 60 * 1_000
    || value.sessionExpiresAt < value.accessExpiresAt
  ) throw new TypeError('Invalid disposable full-stack bootstrap.');
  return Object.freeze({ ...value });
}

/**
 * Supplies the one-run player credential from parent memory. Vite receives no
 * environment file and its private cache is destroyed with the browser run.
 */
export function localFullstackBootstrapVitePlugin(value, now = Date.now()) {
  const bootstrap = exactBootstrap(value, now);
  let source = `export default Object.freeze(${JSON.stringify(bootstrap)});`;
  return Object.freeze({
    name: 'warpkeep-local-fullstack-bootstrap',
    enforce: 'pre',
    resolveId(id) {
      return id === LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID
        ? RESOLVED_LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID
        : null;
    },
    load(id) {
      return id === RESOLVED_LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID ? source : null;
    },
    closeBundle() {
      source = '';
    },
  });
}
