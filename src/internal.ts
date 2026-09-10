import type { Env } from './env.js';

/**
 * Calls one of this Worker's own internal endpoints.
 *
 * Goes through a self-referencing **service binding**, not a plain `fetch` to our own
 * hostname: Cloudflare refuses the latter with error 1042 ("Worker tried to fetch from another
 * Worker on the same zone"). The binding also skips the edge round trip entirely.
 *
 * The point of the indirection is CPU. Each call is a *separate* invocation with its own
 * budget, which is what lets a crawl parse twenty 110 KB documents on a plan that allows
 * 10 ms per invocation.
 */
export async function internalFetch(env: Env, path: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(path, env.PUBLIC_ORIGIN ?? 'https://internal.invalid');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const request = new Request(url, { headers: { 'X-Crawl-Token': env.CRAWL_TOKEN } });
  // If the binding is missing (an older local config), fall back to an ordinary fetch.
  // That works in `wrangler dev`, though not in production.
  return typeof env.SELF?.fetch === 'function' ? await env.SELF.fetch(request) : await fetch(request);
}
