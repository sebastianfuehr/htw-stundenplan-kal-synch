import { readOperator, type Env } from './env.js';
import { handleFeed } from './routes/feed.js';
import { handleParse } from './routes/parse.js';
import { crawlCohort } from './routes/crawl.js';
import { handleApi } from './routes/api.js';
import { handleHealth } from './routes/health.js';
import { renderPage } from './ui/page.js';
import { renderDatenschutz, renderImpressum } from './ui/legal.js';
import { Store } from './storage/kv.js';
import { internalFetch } from './internal.js';

/** Constant-time-ish comparison; these are short tokens, but no reason to leak length hints. */
function tokenOk(request: Request, env: Env): boolean {
  const given = request.headers.get('X-Crawl-Token') ?? '';
  const want = env.CRAWL_TOKEN ?? '';
  if (want === '' || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    // Internal endpoints. Not secret data, but they cost LSF requests, so they are gated.
    if (url.pathname === '/__parse' || url.pathname === '/__crawl') {
      if (!tokenOk(request, env)) return new Response('Forbidden', { status: 403 });
      if (url.pathname === '/__parse') return await handleParse(url, env);

      const sg = url.searchParams.get('sg') ?? '';
      const sem = Number(url.searchParams.get('sem') ?? '0');
      if (!/^\d+$/.test(sg) || !Number.isInteger(sem) || sem < 1 || sem > 20) {
        return new Response('sg/sem ungültig', { status: 400 });
      }
      const report = await crawlCohort(env, sg, sem);
      return new Response(JSON.stringify(report, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    if (url.pathname === '/feed/htw.ics') return await handleFeed(request, url, env, ctx);
    if (url.pathname.startsWith('/api/')) return await handleApi(url, env, ctx);
    if (url.pathname === '/health') return await handleHealth(env);

    if (url.pathname === '/robots.txt') {
      // Feed URLs spell out a person's schedule; keep them out of search indexes.
      return new Response('User-agent: *\nDisallow: /feed/\nDisallow: /api/\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/impressum' || url.pathname === '/datenschutz') {
      const { operator, missing } = readOperator(env);
      const body = url.pathname === '/impressum'
        ? renderImpressum(operator, missing)
        : renderDatenschutz(operator, missing);
      return new Response(body, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=600',
        },
      });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(renderPage(), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=600',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Refreshes every subscribed cohort, and the Studiengang catalogue once a week.
   *
   * The handler itself does almost no work: each cohort is crawled in its own invocation, so
   * this stays inside the free plan's CPU limit no matter how many cohorts there are.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const store = new Store(env.CAL);

    ctx.waitUntil(
      (async () => {
        // Weekly cron: refresh the Studiengang catalogue.
        if (event.cron.startsWith('37 4')) {
          const res = await internalFetch(env, '/__parse', { kind: 'catalog' });
          if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list) && list.length > 0) await store.putCatalog(list);
          }
          return;
        }

        // Sequentially, so the cohorts do not race each other writing their snapshots and we
        // stay a polite guest on LSF.
        for (const c of await store.listCohorts()) {
          try {
            await internalFetch(env, '/__crawl', { sg: c.sg, sem: String(c.sem) });
          } catch {
            // One cohort failing must not stop the others.
          }
        }
      })(),
    );
  },
};
