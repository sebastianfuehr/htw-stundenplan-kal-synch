import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../src/index.js';
import type { Snapshot } from '../../src/domain/types.js';

const TOKEN = 'test-token-aaaaaaaaaaaaaaaaaaaa';

/** A hand-built snapshot, so these tests never touch LSF. */
const snapshot: Snapshot = {
  v: 3, sg: '350', sem: 3,
  semesterLabel: 'WS 2026/27', semesterCode: '2026W',
  generatedAt: '2026-10-14T06:00:00.000Z',
  srcHash: 'deadbeefdeadbeef',
  courses: [{
    publishId: '236116', vnr: '6241331', key: '6241331',
    title: 'B10 Grundlehre Spieltechnik 3 (StA)', art: 'Studioarbeit', sws: '4',
    belegung: 'Belegpflicht', fachbereich: 'FB 5', studiengang: 'Game Design (B)',
    semesterLabel: 'WS 2026/27', groups: ['1. Zug, 1. Gruppe', '1. Zug, 2. Gruppe'], terms: [],
  }],
  weeks: {
    '42_2026': [
      {
        publishId: '236116', key: '6241331', title: 'B10 Grundlehre Spieltechnik 3 (StA)',
        group: '1. Zug, 1. Gruppe', groupSlug: '1zug-1gr', date: '2026-10-12',
        start: '10:00', end: '18:00', room: '', art: 'Studioarbeit', rhythm: 'once',
        status: 'ok', seq: 0, changedAt: '2026-10-14T06:00:00.000Z',
      },
      {
        publishId: '236117', key: '6241332', title: 'Anderer Kurs',
        group: '1. Zug, 2. Gruppe', groupSlug: '1zug-2gr', date: '2026-10-14',
        start: '10:00', end: '12:00', room: 'WH Gebäude C 445', art: 'PÜ', rhythm: 'once',
        status: 'ok', seq: 0, changedAt: '2026-10-14T06:00:00.000Z',
      },
    ],
  },
  weekRange: ['42_2026'], weekCursor: 0,
  listFetchedAt: '2026-10-14T06:00:00.000Z',
  lastOk: new Date().toISOString(),
  errors: [], ruleDelta: [],
};

beforeAll(async () => {
  await env.CAL.put('snap:350:3:v1', JSON.stringify(snapshot));
});

const get = async (path: string, init?: RequestInit) => {
  const req = new Request(`https://example.com${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe('routing', () => {
  it('serves the picker UI at the root', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('HTW-Stundenplan abonnieren');
  });

  it('keeps feed URLs out of search engines', async () => {
    expect(await (await get('/robots.txt')).text()).toContain('Disallow: /feed/');
  });

  it('rejects write methods', async () => {
    expect((await get('/', { method: 'POST' })).status).toBe(405);
  });

  it('404s an unknown path', async () => {
    expect((await get('/nope')).status).toBe(404);
  });
});

describe('internal endpoints are gated', () => {
  it('refuses a crawl without the token', async () => {
    expect((await get('/__crawl?sg=350&sem=3')).status).toBe(403);
  });

  it('refuses a parse without the token', async () => {
    expect((await get('/__parse?kind=catalog')).status).toBe(403);
  });

  it('refuses a wrong token', async () => {
    const res = await get('/__crawl?sg=350&sem=3', { headers: { 'X-Crawl-Token': 'wrong' } });
    expect(res.status).toBe(403);
  });

  it('validates its parameters once past the token', async () => {
    const res = await get('/__crawl?sg=abc&sem=3', { headers: { 'X-Crawl-Token': TOKEN } });
    expect(res.status).toBe(400);
  });
});

describe('/feed/htw.ics', () => {
  it('serves a calendar from the stored snapshot', async () => {
    const res = await get('/feed/htw.ics?v=1&sg=350&sem=3');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect((body.match(/BEGIN:VEVENT/g) ?? [])).toHaveLength(2);
  });

  it('applies the group filter', async () => {
    const body = await (await get('/feed/htw.ics?v=1&sg=350&sem=3&g=1zug-1gr')).text();
    expect(body).toContain('B10 Grundlehre');
    expect(body).not.toContain('Anderer Kurs');
  });

  it('applies the course exclusion list', async () => {
    const body = await (await get('/feed/htw.ics?v=1&sg=350&sem=3&x=6241331')).text();
    expect(body).not.toContain('B10 Grundlehre');
    expect(body).toContain('Anderer Kurs');
  });

  it('rejects a malformed link with a readable message', async () => {
    const res = await get('/feed/htw.ics?sg=');
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Ungültige Feed-URL');
  });

  it('answers 304 when the client already has this version', async () => {
    const first = await get('/feed/htw.ics?v=1&sg=350&sem=3');
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();
    const second = await get('/feed/htw.ics?v=1&sg=350&sem=3', { headers: { 'If-None-Match': etag } });
    expect(second.status).toBe(304);
  });

  it('serves an empty but valid calendar for a cohort that has not been crawled', async () => {
    const res = await get('/feed/htw.ics?v=1&sg=999&sem=7');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
    // Tell the student something is going on instead of silently handing over nothing.
    expect(body).toContain('veraltet');
  });

  it('registers the cohort so the crawler will keep it fresh', async () => {
    await get('/feed/htw.ics?v=1&sg=350&sem=3');
    const rec = await env.CAL.get('sub:350:3', { type: 'json' });
    expect(rec).toMatchObject({ sg: '350', sem: 3 });
  });
});

describe('/api', () => {
  it('returns the courses and groups for a crawled cohort', async () => {
    const body = await (await get('/api/courses?sg=350&sem=3')).json() as Record<string, unknown>;
    expect(body['pending']).toBe(false);
    expect(body['semester']).toBe('WS 2026/27');
    expect(body['groups']).toEqual([
      { heading: '1. Zug, 1. Gruppe', slug: '1zug-1gr' },
      { heading: '1. Zug, 2. Gruppe', slug: '1zug-2gr' },
    ]);
  });

  it('validates its parameters', async () => {
    expect((await get('/api/courses?sg=&sem=0')).status).toBe(400);
  });
});

describe('/health', () => {
  it('reports the subscribed cohorts and their freshness', async () => {
    await get('/feed/htw.ics?v=1&sg=350&sem=3');
    const body = await (await get('/health')).json() as { ok: boolean; cohorts: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.cohorts.length).toBeGreaterThan(0);
  });
});

describe('SELF integration', () => {
  it('serves the UI through the full worker pipeline', async () => {
    const res = await SELF.fetch('https://example.com/');
    expect(res.status).toBe(200);
  });
});
