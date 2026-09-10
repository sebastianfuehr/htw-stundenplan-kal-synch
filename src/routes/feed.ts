import type { Env } from '../env.js';
import { Store } from '../storage/kv.js';
import { buildCalendar } from '../ics/build.js';
import { canonicalQuery, effectiveSemester, FeedParamError, parseFeedParams, selectInstances } from '../domain/select.js';
import { contentHash } from '../domain/snapshot.js';
import { internalFetch } from '../internal.js';

/** Clients poll far more often than the data changes; 30 minutes keeps them off KV. */
const BROWSER_TTL = 1800;
/** Beyond this the feed announces its own staleness inside the calendar. */
const STALE_AFTER_MS = 72 * 3600 * 1000;
/**
 * Beyond this a request refreshes the cohort in the background.
 *
 * The cron already runs every six hours; this only closes the gap in between, so that a
 * cancellation entered this morning is not waiting for the next scheduled run. Debounced in
 * KV, and the edge cache keeps most requests from reaching this code at all.
 */
const REFRESH_AFTER_MS = 2 * 3600 * 1000;
/** How long a claimed refresh suppresses further ones. */
const REFRESH_DEBOUNCE_S = 1800;

export async function handleFeed(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  let params;
  try {
    params = parseFeedParams(url.searchParams);
  } catch (err) {
    if (err instanceof FeedParamError) return text(`Ungültige Feed-URL: ${err.message}`, 400);
    throw err;
  }

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}${url.pathname}?${canonicalQuery(params)}`, {
    method: 'GET',
  });
  const cached = await cache.match(cacheKey);
  if (cached !== undefined) return withEtagCheck(request, cached);

  const store = new Store(env.CAL);

  // Which Fachsemester to serve can depend on the snapshot's semester, so peek at the
  // originally chosen cohort first and only then resolve the rolling one.
  const base = await store.getSnapshot(params.sg, params.sem);
  const sem = effectiveSemester(params, base?.semesterCode ?? null);
  const snap = sem === params.sem ? base : await store.getSnapshot(params.sg, sem);

  // Remember that this cohort is subscribed, so the crawler keeps it fresh.
  ctx.waitUntil(store.touchCohort(params.sg, sem));

  const origin = env.PUBLIC_ORIGIN ?? url.origin;
  const uidDomain = new URL(origin).host;

  if (snap === null) {
    // Nothing crawled yet. Answer with a valid, empty calendar rather than an error, so the
    // client keeps the subscription and picks the data up on its next poll.
    ctx.waitUntil(kickCrawl(env, params.sg, sem));
    const body = buildCalendar([], {
      name: params.name || `HTW ${params.sg} · ${sem}. Semester`,
      description: 'Der Stundenplan wird gerade zum ersten Mal aus dem LSF geladen.',
      uidDomain,
      generatedAt: new Date(0).toISOString(),
      staleSince: new Date().toISOString(),
    });
    return ics(body, { maxAge: 300 });
  }

  const instances = selectInstances(snap, params);
  const age = Date.now() - Date.parse(snap.lastOk || snap.generatedAt);

  // Serve what we have now, then top it up for the next caller.
  if (Number.isFinite(age) && age > REFRESH_AFTER_MS) {
    ctx.waitUntil(
      store.tryClaimRefresh(params.sg, sem, REFRESH_DEBOUNCE_S).then(async (claimed) => {
        if (claimed) await kickCrawl(env, params.sg, sem);
      }),
    );
  }

  const staleSince = Number.isFinite(age) && age > STALE_AFTER_MS ? snap.lastOk || snap.generatedAt : undefined;

  const body = buildCalendar(instances, {
    name: params.name || `${snap.courses[0]?.studiengang ?? 'HTW'} · ${sem}. Semester`,
    description: `Automatisch aus dem HTW-LSF erzeugt. Semester: ${snap.semesterLabel}.`,
    uidDomain,
    generatedAt: snap.generatedAt,
    staleSince,
  });

  const response = ics(body, {
    maxAge: BROWSER_TTL,
    etag: `"${contentHash(snap.srcHash + canonicalQuery(params))}"`,
    lastModified: snap.generatedAt,
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return withEtagCheck(request, response);
}

async function kickCrawl(env: Env, sg: string, sem: number): Promise<void> {
  try {
    await internalFetch(env, '/__crawl', { sg, sem: String(sem) });
  } catch {
    // Best effort: the cron will pick this cohort up anyway.
  }
}

function withEtagCheck(request: Request, response: Response): Response {
  const etag = response.headers.get('etag');
  if (etag !== null && request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: response.headers });
  }
  return response;
}

function ics(
  body: string,
  opts: { maxAge: number; etag?: string; lastModified?: string },
): Response {
  const headers = new Headers({
    'content-type': 'text/calendar; charset=utf-8',
    'cache-control': `public, max-age=${opts.maxAge}, s-maxage=${opts.maxAge}`,
    'content-disposition': 'inline; filename="htw-stundenplan.ics"',
    // The URL states the student's Studiengang, semester and course selection in the clear.
    // Shared calendar links have historically ended up in search indexes.
    'x-robots-tag': 'noindex, nofollow',
  });
  if (opts.etag !== undefined) headers.set('etag', opts.etag);
  if (opts.lastModified !== undefined) {
    const d = new Date(opts.lastModified);
    if (!Number.isNaN(d.getTime())) headers.set('last-modified', d.toUTCString());
  }
  return new Response(body, { headers });
}

const text = (body: string, status: number): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
