// @vitest-environment node
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { expect, it } from 'vitest';
import type { Plugin, UserConfigFn } from 'vite';
import config from '../vite.config';

const policy = "sandbox allow-scripts allow-same-origin; worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; form-action 'none'";
async function plugin(command: 'serve' | 'build') {
  const configured = await (config as UserConfigFn)({ command, mode: 'development' });
  return (configured.plugins as Plugin[]).find(entry => entry?.name === 'warpkeep-keep04-document-policy');
}
async function response(url: string, method = 'GET', existing?: string | string[]) {
  const selected = await plugin('serve');
  expect(selected, 'exact-route serve policy must be registered').toBeDefined();
  let middleware: ((req: IncomingMessage, res: ServerResponse, next: () => void) => void) | undefined;
  (selected!.configureServer as Function)({ middlewares: { use: (handler: typeof middleware) => { middleware = handler; } } });
  const req = new IncomingMessage(new Socket()); req.url = url; req.method = method;
  const res = new ServerResponse(req); res.setHeader('X-Unrelated', 'preserved');
  if (existing) res.setHeader('Content-Security-Policy', existing);
  let continued = false;
  middleware!(req, res, () => { continued = true; });
  expect(continued).toBe(true); expect(res.headersSent).toBe(false);
  expect(res.getHeader('X-Unrelated')).toBe('preserved');
  return res;
}
it.each(['/dev/keep04-qa.html', '/dev/keep04-qa.html?scenario=empty&quality=high'])('serves enforced worker/popup policy on exact GET document %s without writing body', async url => {
  expect((await response(url)).getHeader('Content-Security-Policy')).toBe(policy);
});
it.each(['/', '/index.html', '/owner-canary/index.html', '/assets/model.glb', '/dev/other.html', '/dev/keep04-qa.html/extra', '/dev/%6beep04-qa.html', '/dev/../dev/keep04-qa.html', '//dev/keep04-qa.html', '/dev/keep04-qa.html#fragment'])('does not change policy on noncanonical or unrelated route %s', async url => {
  expect((await response(url)).getHeader('Content-Security-Policy')).toBeUndefined();
});
it.each(['HEAD', 'POST', 'PUT', 'OPTIONS'])('does not apply GET document policy to %s', async method => {
  expect((await response('/dev/keep04-qa.html', method)).getHeader('Content-Security-Policy')).toBeUndefined();
});
it.each(["img-src 'none'", ["img-src 'none'", "connect-src 'self'"]])('preserves existing enforced policies %j', async prior => {
  const expected = [...(Array.isArray(prior) ? prior : [prior]), policy];
  expect((await response('/dev/keep04-qa.html', 'GET', prior)).getHeader('Content-Security-Policy')).toEqual(expected);
});
it('never installs the middleware for production build or preview hooks', async () => {
  expect(await plugin('build')).toBeUndefined();
  const selected = await plugin('serve'); expect(selected).toBeDefined();
  expect(selected!.apply).toBe('serve'); expect(selected!.configurePreviewServer).toBeUndefined();
});
