/**
 * Storage layer. Everything the Worker persists goes through here, so the snapshot blobs can
 * move to R2 later without touching the crawler or the feed handler.
 */

import type { Snapshot, StudyProgram } from '../domain/types.js';

export interface CohortRef {
  sg: string;
  sem: number;
}

export interface CohortRecord extends CohortRef {
  firstSeen: string;
  lastSeen: string;
}

const CATALOG_KEY = 'cat:v1';
const CATALOG_TTL = 14 * 24 * 3600;
/** Cohorts expire on their own, which doubles as garbage collection for dead subscriptions. */
const COHORT_TTL = 45 * 24 * 3600;
/** Only touch a cohort record when it is this old, to stay far below the KV write budget. */
const COHORT_REFRESH_MS = 6 * 3600 * 1000;
/**
 * Snapshots outlive their cohort registration, so a feed that goes quiet for a while still has
 * data when it comes back. They do expire, though, so cohorts crawled once by hand and never
 * subscribed cannot accumulate forever.
 */
const SNAPSHOT_TTL = 60 * 24 * 3600;

export const cohortId = (sg: string, sem: number): string => `${sg}:${sem}`;
const snapKey = (sg: string, sem: number) => `snap:${cohortId(sg, sem)}:v1`;
const subKey = (sg: string, sem: number) => `sub:${cohortId(sg, sem)}`;
const refreshKey = (sg: string, sem: number) => `refresh:${cohortId(sg, sem)}`;

export class Store {
  constructor(private readonly kv: KVNamespace) {}

  async getCatalog(): Promise<StudyProgram[] | null> {
    return await this.kv.get<StudyProgram[]>(CATALOG_KEY, { type: 'json', cacheTtl: 3600 });
  }

  async putCatalog(list: StudyProgram[]): Promise<void> {
    await this.kv.put(CATALOG_KEY, JSON.stringify(list), { expirationTtl: CATALOG_TTL });
  }

  async getSnapshot(sg: string, sem: number): Promise<Snapshot | null> {
    return await this.kv.get<Snapshot>(snapKey(sg, sem), { type: 'json', cacheTtl: 300 });
  }

  /**
   * Writes only when the observable content changed. A steady-state day therefore writes the
   * snapshot roughly never, which matters on the free plan's 1000 writes/day.
   */
  async putSnapshotIfChanged(snap: Snapshot, previous: Snapshot | null): Promise<boolean> {
    if (previous !== null && previous.srcHash === snap.srcHash && previous.v === snap.v) return false;
    await this.kv.put(snapKey(snap.sg, snap.sem), JSON.stringify(snap), { expirationTtl: SNAPSHOT_TTL });
    return true;
  }

  /** Records that somebody is subscribed to this cohort, so the crawler knows to refresh it. */
  async touchCohort(sg: string, sem: number): Promise<void> {
    const key = subKey(sg, sem);
    const now = new Date().toISOString();
    const existing = await this.kv.get<CohortRecord>(key, { type: 'json', cacheTtl: 3600 });
    if (existing !== null && Date.now() - Date.parse(existing.lastSeen) < COHORT_REFRESH_MS) return;
    await this.kv.put(
      key,
      JSON.stringify({ sg, sem, firstSeen: existing?.firstSeen ?? now, lastSeen: now }),
      { expirationTtl: COHORT_TTL },
    );
  }

  /**
   * Debounces on-demand refreshes: returns true at most once per `ttlSeconds` per cohort.
   *
   * KV has no compare-and-set, so two simultaneous requests can both win the claim. That is
   * harmless, since the worst case is one redundant crawl, and far cheaper than the lock a truly
   * atomic claim would need.
   */
  async tryClaimRefresh(sg: string, sem: number, ttlSeconds: number): Promise<boolean> {
    const key = refreshKey(sg, sem);
    if ((await this.kv.get(key, { cacheTtl: 60 })) !== null) return false;
    await this.kv.put(key, new Date().toISOString(), { expirationTtl: ttlSeconds });
    return true;
  }

  async listCohorts(): Promise<CohortRecord[]> {
    const out: CohortRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.kv.list({ prefix: 'sub:', cursor, limit: 100 });
      for (const k of page.keys) {
        const rec = await this.kv.get<CohortRecord>(k.name, { type: 'json' });
        if (rec !== null) out.push(rec);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor !== undefined);
    return out;
  }
}
