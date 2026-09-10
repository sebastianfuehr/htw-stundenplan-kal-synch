import type { Env } from '../env.js';
import { internalFetch } from '../internal.js';
import { Store } from '../storage/kv.js';
import { buildSnapshot, crawlWeekRange } from '../domain/snapshot.js';
import type { ListView, Snapshot, WeekResult } from '../domain/types.js';

/** How many LSF documents to have in flight at once. Politeness, not a technical limit. */
const CONCURRENCY = 6;
/** Guard against a runaway range; the crawl range itself is already capped at 30. */
const MAX_WEEKS = 30;

export interface CrawlReport {
  sg: string;
  sem: number;
  semester: string;
  weeksRequested: number;
  weeksOk: number;
  instances: number;
  written: boolean;
  errors: string[];
  ruleDelta: number;
}

/**
 * Refreshes one cohort.
 *
 * Orchestration only: every LSF document is parsed in its own `/__parse` invocation, so this
 * handler stays well inside the free plan's 10 ms of CPU even though a full semester is 22
 * documents. It ends in a single KV write, which also avoids the 1-write-per-second-per-key
 * limit that a fan-out of parallel writers would hit.
 */
export async function crawlCohort(env: Env, sg: string, sem: number): Promise<CrawlReport> {
  const store = new Store(env.CAL);
  const errors: string[] = [];
  const call = async <T>(params: Record<string, string>): Promise<T | null> => {
    const res = await internalFetch(env, '/__parse', params);
    const body = (await res.json()) as T & { error?: string };
    if (!res.ok || body.error !== undefined) {
      errors.push(`${params['kind']}${params['week'] !== undefined ? ` ${params['week']}` : ''}: ${body.error ?? res.status}`);
      return null;
    }
    return body;
  };

  const list = await call<ListView>({ kind: 'list', sg, sem: String(sem) });
  if (list === null || list.courses.length === 0) {
    return {
      sg, sem, semester: '', weeksRequested: 0, weeksOk: 0, instances: 0,
      written: false, errors: errors.length > 0 ? errors : ['Listenansicht leer'], ruleDelta: 0,
    };
  }

  const weeks = crawlWeekRange(list).slice(0, MAX_WEEKS);
  const fresh: WeekResult[] = [];
  for (let i = 0; i < weeks.length; i += CONCURRENCY) {
    const batch = weeks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((week) => call<WeekResult>({ kind: 'grid', sg, sem: String(sem), week })),
    );
    for (const r of results) if (r !== null) fresh.push(r);
  }

  const previous = await store.getSnapshot(sg, sem);
  const snapshot: Snapshot = buildSnapshot({
    sg, sem, list, fresh, prev: previous, now: new Date().toISOString(),
  });
  snapshot.errors = errors;

  // Never let a failed crawl overwrite good data with nothing.
  if (!isPlausible(snapshot, previous)) {
    return {
      sg, sem, semester: snapshot.semesterLabel, weeksRequested: weeks.length,
      weeksOk: fresh.length, instances: 0, written: false,
      errors: [...errors, 'Ergebnis unplausibel, alter Snapshot bleibt stehen'], ruleDelta: 0,
    };
  }

  const written = await store.putSnapshotIfChanged(snapshot, previous);
  return {
    sg, sem,
    semester: snapshot.semesterLabel,
    weeksRequested: weeks.length,
    weeksOk: fresh.length,
    instances: Object.values(snapshot.weeks).flat().length,
    written,
    errors,
    ruleDelta: snapshot.ruleDelta.length,
  };
}

/**
 * Refuses a snapshot that looks like a scrape of a broken page.
 *
 * The dangerous case is not an obvious failure but a plausible-looking empty one: LSF flips the
 * semester label before the new grids are populated, and for a few days the courses exist while
 * every week is empty. Serving that would silently blank a student's calendar.
 */
function isPlausible(next: Snapshot, prev: Snapshot | null): boolean {
  if (next.courses.length === 0) return false;
  const instances = Object.values(next.weeks).flat().length;
  if (instances === 0) return prev === null || Object.values(prev.weeks).flat().length === 0;
  return true;
}
