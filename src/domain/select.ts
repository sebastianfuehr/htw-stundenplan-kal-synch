import { semestersBetween } from '../lsf/dates.js';
import { groupMatches } from './key.js';
import type { Instance, Snapshot } from './types.js';

export interface FeedParams {
  sg: string;
  /** The Fachsemester as chosen when the link was made. */
  sem: number;
  /** Semester the link was created in, e.g. `2026W`. Only meaningful with `roll`. */
  anchor: string;
  /** Advance the Fachsemester automatically when LSF moves to a new semester. */
  roll: boolean;
  /** Selected group slugs; empty means "every group". */
  groups: string[];
  /** Course keys to leave out. An exclusion list, so courses added later still show up. */
  exclude: string[];
  name: string;
  showCancelled: boolean;
}

export class FeedParamError extends Error {}

export function parseFeedParams(q: URLSearchParams): FeedParams {
  const sg = (q.get('sg') ?? '').trim();
  if (!/^\d{1,6}$/.test(sg)) throw new FeedParamError('sg fehlt oder ist keine Studiengang-Nummer');

  const sem = Number(q.get('sem') ?? '1');
  if (!Number.isInteger(sem) || sem < 1 || sem > 20) throw new FeedParamError('sem muss zwischen 1 und 20 liegen');

  const anchor = (q.get('anchor') ?? '').trim();
  if (anchor !== '' && !/^\d{4}[WS]$/.test(anchor)) throw new FeedParamError('anchor muss die Form 2026W haben');

  const list = (name: string): string[] =>
    (q.get(name) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  return {
    sg,
    sem,
    anchor,
    roll: q.get('roll') === '1' && anchor !== '',
    groups: list('g'),
    exclude: list('x'),
    name: (q.get('n') ?? '').slice(0, 120),
    showCancelled: q.get('cancelled') !== 'hide',
  };
}

/**
 * The Fachsemester to actually serve.
 *
 * Derived from the *snapshot's* semester rather than from the wall clock, so it flips exactly
 * when LSF flips and never during the weeks where the two disagree. Without this a student's
 * calendar quietly empties out in April.
 */
export function effectiveSemester(p: FeedParams, snapshotSemesterCode: string | null): number {
  if (!p.roll || snapshotSemesterCode === null || snapshotSemesterCode === '') return p.sem;
  const advanced = p.sem + semestersBetween(p.anchor, snapshotSemesterCode);
  return Math.min(20, Math.max(1, advanced));
}

/**
 * Is the saved group selection still meaningful for this snapshot?
 *
 * Group names are not stable across semesters. A student who picked `1. Zug, 1. Gruppe` may
 * land in a semester that only knows `Gruppe A`. Applying the old selection there would filter
 * away almost everything and hand back a near-empty calendar with no hint as to why. So if not
 * one of the selected groups exists in this snapshot, the selection is treated as stale and
 * ignored: showing too much is a visible problem the student can fix, showing too little is an
 * invisible one.
 */
function groupSelectionApplies(snap: Snapshot, groups: readonly string[]): boolean {
  if (groups.length === 0) return false;
  const known = new Set<string>();
  for (const week of Object.values(snap.weeks)) for (const i of week) known.add(i.groupSlug);
  return groups.some((g) => known.has(g));
}

export function selectInstances(snap: Snapshot, p: FeedParams): Instance[] {
  const excluded = new Set(p.exclude);
  const applyGroups = groupSelectionApplies(snap, p.groups);
  const out: Instance[] = [];
  for (const week of Object.values(snap.weeks)) {
    for (const i of week) {
      if (excluded.has(i.key)) continue;
      if (applyGroups && !groupMatches(i.groupSlug, p.groups)) continue;
      if (!p.showCancelled && i.status === 'cancelled') continue;
      out.push(i);
    }
  }
  return out.sort((a, b) =>
    a.date === b.date
      ? a.start === b.start ? a.title.localeCompare(b.title, 'de') : a.start.localeCompare(b.start)
      : a.date.localeCompare(b.date),
  );
}

/** Rebuilds the canonical query string, so equivalent links share one cache entry and ETag. */
export function canonicalQuery(p: FeedParams): string {
  const q = new URLSearchParams();
  q.set('v', '1');
  q.set('sg', p.sg);
  q.set('sem', String(p.sem));
  if (p.anchor !== '') q.set('anchor', p.anchor);
  if (p.roll) q.set('roll', '1');
  if (p.groups.length > 0) q.set('g', [...p.groups].sort().join(','));
  if (p.exclude.length > 0) q.set('x', [...p.exclude].sort().join(','));
  if (p.name !== '') q.set('n', p.name);
  if (!p.showCancelled) q.set('cancelled', 'hide');
  return q.toString();
}
