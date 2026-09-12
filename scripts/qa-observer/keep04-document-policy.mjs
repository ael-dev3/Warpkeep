// Local synthetic QA only. This must originate at the server: Chrome151's
// headers-only CDP override did not enforce worker-src in native diagnostics.
export const KEEP04_DOCUMENT_POLICY = "sandbox allow-scripts allow-same-origin; worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; form-action 'none'";

export function keep04DocumentPolicyPlugin() {
  return {
    name: 'warpkeep-keep04-document-policy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        // Match raw canonical pathname, never URL-normalize aliases into scope.
        if (request.method === 'GET' && typeof request.url === 'string'
          && !/[\r\n\0#]/.test(request.url)
          && request.url.split('?', 1)[0] === '/dev/keep04-qa.html') {
          response.appendHeader('Content-Security-Policy', KEEP04_DOCUMENT_POLICY);
        }
        next();
      });
    },
  };
}
