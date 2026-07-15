export type LocalQaRuntimeContext = Readonly<{
  compileGateEnabled: boolean;
  development: boolean;
  production: boolean;
  protocol: string;
  hostname: string;
}>;

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LOCAL_HTTP_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Local QA pages carry no player authority, but still fail closed outside the
 * machine that owns the Vite process. Hostname aliases and LAN addresses are
 * intentionally rejected instead of being resolved or trusted indirectly.
 */
export function isLocalQaRuntimeAllowed(context: LocalQaRuntimeContext) {
  return context.compileGateEnabled
    && context.development
    && !context.production
    && LOCAL_HTTP_PROTOCOLS.has(context.protocol)
    && LOOPBACK_HOSTNAMES.has(context.hostname.toLowerCase());
}

export function currentLocalQaRuntimeContext(): LocalQaRuntimeContext {
  return {
    compileGateEnabled: typeof __WARPKEEP_LOCAL_QA__ === 'boolean'
      && __WARPKEEP_LOCAL_QA__,
    development: import.meta.env.DEV,
    production: import.meta.env.PROD,
    protocol: window.location.protocol,
    hostname: window.location.hostname
  };
}

export function assertLocalQaRuntime(context = currentLocalQaRuntimeContext()) {
  if (!isLocalQaRuntimeAllowed(context)) {
    throw new Error('Warpkeep local QA is available only from an exact loopback Vite development server.');
  }
}
