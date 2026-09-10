import type { Env } from '../env.js';
import { Store } from '../storage/kv.js';
import { allGroups } from '../domain/snapshot.js';
import { internalFetch } from '../internal.js';
import type { Course } from '../domain/types.js';

/** Data the picker UI needs. Everything comes from KV; the browser never talks to LSF. */
export async function handleApi(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const store = new Store(env.CAL);

  if (url.pathname === '/api/programs') {
    const list = await store.getCatalog();
    if (list === null) {
      ctx.waitUntil(refreshCatalog(env, store));
      return json({ programs: [], pending: true });
    }
    return json({ programs: list, pending: false }, 3600);
  }

  if (url.pathname === '/api/courses') {
    const sg = url.searchParams.get('sg') ?? '';
    const sem = Number(url.searchParams.get('sem') ?? '0');
    if (!/^\d+$/.test(sg) || !Number.isInteger(sem) || sem < 1 || sem > 20) {
      return json({ error: 'sg/sem ungültig' }, 0, 400);
    }
    const snap = await store.getSnapshot(sg, sem);
    if (snap === null) {
      // First time anybody asked for this cohort: start a crawl and tell the UI to come back.
      ctx.waitUntil(kick(env, sg, sem));
      return json({ pending: true, courses: [], groups: [], semester: '' });
    }
    return json({
      pending: false,
      semester: snap.semesterLabel,
      semesterCode: snap.semesterCode,
      generatedAt: snap.generatedAt,
      weeksCrawled: Object.keys(snap.weeks).length,
      weeksTotal: snap.weekRange.length,
      groups: allGroups(snap),
      courses: snap.courses.map(summarize),
    }, 120);
  }

  return json({ error: 'not found' }, 0, 404);
}

function summarize(c: Course) {
  return {
    key: c.key,
    title: c.title,
    art: c.art,
    sws: c.sws,
    belegung: c.belegung,
    groups: c.groups,
    terms: c.terms.length,
  };
}

async function kick(env: Env, sg: string, sem: number): Promise<void> {
  try {
    await internalFetch(env, '/__crawl', { sg, sem: String(sem) });
  } catch { /* the cron will retry */ }
}

async function refreshCatalog(env: Env, store: Store): Promise<void> {
  try {
    const res = await internalFetch(env, '/__parse', { kind: 'catalog' });
    if (!res.ok) return;
    const list = await res.json();
    if (Array.isArray(list) && list.length > 0) await store.putCatalog(list);
  } catch { /* the cron will retry */ }
}

const json = (body: unknown, maxAge = 0, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
