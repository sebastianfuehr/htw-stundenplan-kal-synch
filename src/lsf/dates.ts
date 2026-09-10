/**
 * Date helpers. Everything internal is a civil date string `YYYY-MM-DD` plus a wall-clock
 * `HH:MM`; we never build a zoned instant until the ICS writer does, because LSF times are
 * Europe/Berlin wall times and converting early would bake in a DST assumption.
 */

/** `YYYY-MM-DD` */
export type CivilDate = string;
/** `HH:MM`, 24h wall clock */
export type WallTime = string;
/** `<isoWeek>_<isoYear>`, e.g. `42_2026`, the LSF `week=` parameter format. */
export type WeekKey = string;

const DATE_RE = /(\d{2})\.(\d{2})\.(\d{4})/;
const DATE_RE_G = /(\d{2})\.(\d{2})\.(\d{4})/g;
const TIME_RE = /(\d{1,2}):(\d{2})/;

export function parseGermanDate(s: string): CivilDate | null {
  const m = DATE_RE.exec(s);
  if (m === null) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const iso = `${yyyy}-${mm}-${dd}`;
  // Reject impossible civil dates (31.02.) rather than letting Date roll them over.
  return toUTC(iso).getUTCDate() === d ? iso : null;
}

export function parseAllGermanDates(s: string): CivilDate[] {
  const out: CivilDate[] = [];
  DATE_RE_G.lastIndex = 0;
  for (const m of s.matchAll(DATE_RE_G)) {
    const hit = parseGermanDate(m[0]);
    if (hit !== null && !out.includes(hit)) out.push(hit);
  }
  return out;
}

export function parseWallTime(s: string): WallTime | null {
  const m = TIME_RE.exec(s);
  if (m === null) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Parses a `10:00 bis 18:00` / `08:00 - 09:30` range. */
export function parseTimeRange(s: string): { start: WallTime; end: WallTime } | null {
  const parts = s.split(/\s*(?:bis|-|–|—)\s*/i);
  if (parts.length < 2) return null;
  const start = parseWallTime(parts[0]!);
  const end = parseWallTime(parts[1]!);
  return start !== null && end !== null ? { start, end } : null;
}

/** A UTC-midnight Date for a civil date. Used only for calendar arithmetic. */
export function toUTC(d: CivilDate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function toCivil(d: Date): CivilDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: CivilDate, n: number): CivilDate {
  const t = toUTC(d);
  t.setUTCDate(t.getUTCDate() + n);
  return toCivil(t);
}

/** 1 = Monday … 7 = Sunday (ISO). */
export function isoWeekday(d: CivilDate): number {
  const wd = toUTC(d).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isoWeek(d: CivilDate): { week: number; year: number } {
  const t = toUTC(d);
  // Shift to the Thursday of this ISO week; its calendar year is the ISO year.
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const year = t.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((t.getTime() - jan1) / 86_400_000 + 1) / 7);
  return { week, year };
}

export function weekKey(d: CivilDate): WeekKey {
  const { week, year } = isoWeek(d);
  return `${week}_${year}`;
}

export function parseWeekKey(k: WeekKey): { week: number; year: number } | null {
  const m = /^(\d{1,2})_(\d{4})$/.exec(k);
  if (m === null) return null;
  const week = Number(m[1]), year = Number(m[2]);
  if (week < 1 || week > 53) return null;
  return { week, year };
}

export function mondayOfIsoWeek(week: number, year: number): CivilDate {
  // 4 January is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4Weekday - 1) * 86_400_000);
  return toCivil(new Date(week1Monday.getTime() + (week - 1) * 7 * 86_400_000));
}

export function weekKeyOfMonday(monday: CivilDate): WeekKey {
  return weekKey(monday);
}

/** Inclusive list of week keys spanning two dates, capped to avoid runaway crawls. */
export function weekKeysBetween(from: CivilDate, to: CivilDate, cap = 30): WeekKey[] {
  const a = isoWeek(from);
  let cursor = mondayOfIsoWeek(a.week, a.year);
  const end = toUTC(to).getTime();
  const out: WeekKey[] = [];
  while (toUTC(cursor).getTime() <= end && out.length < cap) {
    out.push(weekKey(cursor));
    cursor = addDays(cursor, 7);
  }
  return out;
}

/**
 * The LSF semester label (`WS 2026/27`, `SoSe 2027`) mapped to a comparable ordinal and a
 * civil-date window. Used to clamp crawl ranges and to advance the Fachsemester on rollover.
 */
export interface SemesterInfo {
  label: string;
  /** `2026W` / `2027S` */
  code: string;
  /** Winter semesters are odd ordinals; consecutive semesters differ by 1. */
  ordinal: number;
  from: CivilDate;
  to: CivilDate;
}

export function parseSemesterLabel(label: string): SemesterInfo | null {
  const ws = /WS\s*(\d{4})/i.exec(label);
  if (ws !== null) {
    const y = Number(ws[1]);
    return {
      label, code: `${y}W`, ordinal: y * 2 + 1,
      from: `${y}-10-01`, to: `${y + 1}-03-31`,
    };
  }
  const ss = /(?:SoSe|SS)\s*(\d{4})/i.exec(label);
  if (ss !== null) {
    const y = Number(ss[1]);
    return {
      label, code: `${y}S`, ordinal: y * 2,
      from: `${y}-04-01`, to: `${y}-09-30`,
    };
  }
  return null;
}

export function parseSemesterCode(code: string): { ordinal: number } | null {
  const m = /^(\d{4})([WS])$/.exec(code);
  if (m === null) return null;
  const y = Number(m[1]);
  return { ordinal: m[2] === 'W' ? y * 2 + 1 : y * 2 };
}

/** How many semesters lie between two semester codes (may be negative). */
export function semestersBetween(fromCode: string, toCode: string): number {
  const a = parseSemesterCode(fromCode);
  const b = parseSemesterCode(toCode);
  if (a === null || b === null) return 0;
  return b.ordinal - a.ordinal;
}
