import {
  addDays, isoWeekday, parseSemesterLabel, weekKeysBetween, weekKey,
  type CivilDate, type WeekKey,
} from '../lsf/dates.js';
import { courseKey, groupSlug } from './key.js';
import type { Course, Instance, ListView, Snapshot, WeekResult } from './types.js';

export const SNAPSHOT_VERSION = 3;

/** 64-bit-ish FNV-1a over the string, hex. Used for put-if-changed and ETags only. */
export function contentHash(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b + c, 0x85ebca6b) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Which weeks to crawl.
 *
 * Derived from the earliest and latest date the list view mentions, *not* from the academic
 * calendar: `Block` entries sit in the exam period, after Vorlesungsende, and would be lost
 * if we stopped at the end of lectures. Clamped to the semester window so one malformed date
 * cannot send the crawler years away, and hard-capped at 30 weeks.
 */
export function crawlWeekRange(list: ListView): WeekKey[] {
  const dates: CivilDate[] = [];
  for (const c of list.courses) {
    for (const t of c.terms) {
      if (t.from !== '') dates.push(t.from);
      if (t.to !== '') dates.push(t.to);
    }
  }
  if (dates.length === 0) return [];
  dates.sort();

  const sem = parseSemesterLabel(list.semesterLabel);
  const lo = sem === null ? dates[0]! : maxDate(dates[0]!, sem.from);
  const hi = sem === null ? dates.at(-1)! : minDate(dates.at(-1)!, sem.to);
  if (lo > hi) return [];
  return weekKeysBetween(lo, hi, 30);
}

const maxDate = (a: CivilDate, b: CivilDate) => (a >= b ? a : b);
const minDate = (a: CivilDate, b: CivilDate) => (a <= b ? a : b);

/**
 * Expands the list view's rhythm rules into concrete dates.
 *
 * Deliberately NOT used to build the feed: it cannot know about lecture-free days, and it
 * cannot resolve `Block`. It exists so the crawler can diff rules against the grid: the
 * difference should be exactly the lecture-free days, and a sudden jump means either the grid
 * parser broke or LSF changed its markup.
 */
export function materializeRules(list: ListView): Set<string> {
  const out = new Set<string>();
  for (const c of list.courses) {
    for (const t of c.terms) {
      if (t.from === '') continue;
      const last = t.to === '' ? t.from : t.to;
      if (t.rhythm === 'once') {
        out.add(`${c.publishId}|${t.from}|${t.start}`);
        continue;
      }
      if (t.rhythm === 'block') {
        for (let d = t.from; d <= last; d = addDays(d, 1)) {
          if (isoWeekday(d) <= 5) out.add(`${c.publishId}|${d}|${t.start}`);
        }
        continue;
      }
      // Weekly-ish: walk to the first matching weekday, then step by 7 (or 14 when biweekly).
      let d = t.from;
      let guard = 0;
      while (isoWeekday(d) !== t.weekday && guard++ < 7) d = addDays(d, 1);
      const step = t.rhythm === 'even' || t.rhythm === 'odd' ? 14 : 7;
      for (; d <= last && guard < 400; d = addDays(d, step), guard++) {
        out.add(`${c.publishId}|${d}|${t.start}`);
      }
    }
  }
  return out;
}

/** Stable identity of an appointment; also the basis of the ICS UID. */
export function instanceId(i: Instance): string {
  return `${i.key}-${i.groupSlug}-${i.date.replace(/-/g, '')}-${i.start.replace(':', '')}`;
}

/** Fields whose change should bump SEQUENCE so Outlook re-processes the event. */
function fingerprint(i: Instance): string {
  return `${i.title}|${i.end}|${i.room}|${i.art}|${i.group}|${i.status}`;
}

/**
 * Carries `seq` / `changedAt` forward, bumping only where an appointment really changed.
 * Without this every crawl would look like a modification to subscribing clients.
 */
export function diffInstances(
  prev: readonly Instance[],
  next: readonly Instance[],
  now: string,
): Instance[] {
  const before = new Map(prev.map((i) => [instanceId(i), i]));
  return next.map((i) => {
    const old = before.get(instanceId(i));
    if (old === undefined) return { ...i, seq: 0, changedAt: now };
    if (fingerprint(old) === fingerprint(i)) return { ...i, seq: old.seq, changedAt: old.changedAt };
    return { ...i, seq: old.seq + 1, changedAt: now };
  });
}

export interface BuildInput {
  sg: string;
  sem: number;
  list: ListView;
  /** Only the weeks crawled in this run; everything else is carried over from `prev`. */
  fresh: WeekResult[];
  prev: Snapshot | null;
  now: string;
}

export function emptySnapshot(sg: string, sem: number, now: string): Snapshot {
  return {
    v: SNAPSHOT_VERSION, sg, sem, semesterLabel: '', semesterCode: '', generatedAt: now,
    srcHash: '', courses: [], weeks: {}, weekRange: [], weekCursor: 0,
    listFetchedAt: '', lastOk: '', errors: [], ruleDelta: [],
  };
}

export function buildSnapshot(input: BuildInput): Snapshot {
  const { sg, sem, list, fresh, prev, now } = input;
  const sameSemester = prev !== null && prev.semesterLabel === list.semesterLabel;

  const keyByPublishId = new Map(list.courses.map((c) => [c.publishId, c.key]));
  const titleOf = (i: Instance) => keyByPublishId.get(i.publishId) ?? courseKey('', i.title);

  // A semester rollover invalidates every publishId, so previously crawled weeks are dropped.
  const weeks: Record<WeekKey, Instance[]> = sameSemester ? { ...prev.weeks } : {};
  for (const w of fresh) {
    weeks[w.week] = w.instances.map((i) => ({ ...i, key: titleOf(i) }));
  }

  const weekRange = crawlWeekRange(list);
  // Weeks that fell out of the range (semester shifted) must not linger in the feed.
  for (const w of Object.keys(weeks)) {
    if (!weekRange.includes(w)) delete weeks[w];
  }

  const prevAll = sameSemester ? Object.values(prev.weeks).flat() : [];
  const nextAll = Object.values(weeks).flat();
  const diffed = diffInstances(prevAll, nextAll, now);
  const byWeek: Record<WeekKey, Instance[]> = {};
  for (const i of diffed) {
    const w = weekKey(i.date);
    (byWeek[w] ??= []).push(i);
  }
  // Preserve weeks that were crawled and legitimately empty.
  for (const w of Object.keys(weeks)) byWeek[w] ??= [];

  const semInfo = parseSemesterLabel(list.semesterLabel);
  const gridIds = new Set(diffed.map((i) => `${i.publishId}|${i.date}|${i.start}`));
  const crawled = new Set(Object.keys(byWeek));
  const ruleDelta = [...materializeRules(list)]
    .filter((id) => {
      const date = id.split('|')[1]!;
      // Only judge weeks we have actually crawled, or every uncrawled week looks like a gap.
      return crawled.has(weekKey(date)) && !gridIds.has(id);
    })
    .map((id) => id.split('|')[1]!)
    .filter((d, idx, arr) => arr.indexOf(d) === idx)
    .sort();

  const snapshot: Snapshot = {
    v: SNAPSHOT_VERSION,
    sg,
    sem,
    semesterLabel: list.semesterLabel,
    semesterCode: semInfo?.code ?? '',
    generatedAt: now,
    srcHash: '',
    courses: list.courses,
    weeks: byWeek,
    weekRange,
    weekCursor: prev?.weekCursor ?? 0,
    listFetchedAt: now,
    lastOk: fresh.length > 0 ? now : (sameSemester ? prev.lastOk : ''),
    errors: [],
    ruleDelta,
  };
  snapshot.srcHash = computeSrcHash(snapshot);
  return snapshot;
}

/** Hash over everything a subscriber can observe. Deliberately excludes timestamps. */
export function computeSrcHash(s: Snapshot): string {
  const payload = JSON.stringify({
    sem: s.semesterLabel,
    courses: s.courses.map((c) => [c.key, c.publishId, c.title, c.art, c.sws, c.belegung, c.groups]),
    weeks: Object.keys(s.weeks).sort().map((w) => [
      w,
      (s.weeks[w] ?? []).map((i) => [instanceId(i), fingerprint(i), i.seq]),
    ]),
  });
  return contentHash(payload);
}

/** The union of all appointments, in chronological order. */
export function allInstances(s: Snapshot): Instance[] {
  return Object.values(s.weeks)
    .flat()
    .sort((a, b) =>
      a.date === b.date
        ? a.start === b.start ? a.title.localeCompare(b.title, 'de') : a.start.localeCompare(b.start)
        : a.date.localeCompare(b.date),
    );
}

/**
 * Distinct group headings for the picker UI.
 *
 * Taken from the course catalogue rather than from crawled instances, because early on only a
 * few weeks have been crawled and a group whose lecture has not happened yet would be missing.
 * Headings with no group marker at all (`Termin`) are dropped: they apply to everyone anyway.
 */
export function allGroups(s: Snapshot): { heading: string; slug: string }[] {
  const seen = new Map<string, string>();
  for (const c of s.courses) {
    for (const heading of c.groups) {
      const slug = groupSlug(heading);
      if (slug !== '' && !seen.has(slug)) seen.set(slug, heading);
    }
  }
  return [...seen.entries()]
    .map(([slug, heading]) => ({ heading, slug }))
    .sort((a, b) => a.heading.localeCompare(b.heading, 'de'));
}
