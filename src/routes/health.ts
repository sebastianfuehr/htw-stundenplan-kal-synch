import type { Env } from '../env.js';
import { Store } from '../storage/kv.js';

/** Operational view: which cohorts are subscribed and how fresh each one is. */
export async function handleHealth(env: Env): Promise<Response> {
  const store = new Store(env.CAL);
  const cohorts = await store.listCohorts();
  const now = Date.now();

  const rows = await Promise.all(
    cohorts.map(async (c) => {
      const snap = await store.getSnapshot(c.sg, c.sem);
      const lastOk = snap?.lastOk ?? '';
      const ageHours = lastOk === '' ? null : Math.round((now - Date.parse(lastOk)) / 36e5);
      return {
        cohort: `${c.sg}:${c.sem}`,
        subscribedSince: c.firstSeen,
        semester: snap?.semesterLabel ?? null,
        courses: snap?.courses.length ?? 0,
        instances: snap === null ? 0 : Object.values(snap.weeks).flat().length,
        weeksCrawled: snap === null ? 0 : Object.keys(snap.weeks).length,
        weeksTotal: snap?.weekRange.length ?? 0,
        lastOk: lastOk === '' ? null : lastOk,
        ageHours,
        stale: ageHours !== null && ageHours > 72,
        errors: snap?.errors ?? [],
        ruleDelta: snap?.ruleDelta.length ?? 0,
      };
    }),
  );

  const ok = rows.length === 0 || rows.every((r) => !r.stale);
  return new Response(JSON.stringify({ ok, now: new Date().toISOString(), cohorts: rows }, null, 2), {
    status: ok ? 200 : 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
