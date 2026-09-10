import type { CivilDate, WallTime, WeekKey } from '../lsf/dates.js';

export interface StudyProgram {
  /** LSF `k_abstgv.abstgvnr`. Stable across semesters; a new PO gets a new id. */
  id: string;
  /** Full label as printed by LSF. */
  label: string;
  /** `Game Design (B)`, the label with degree and PO trimmed off. */
  name: string;
  degree?: string;
  po?: string;
}

export type Rhythm = 'once' | 'weekly' | 'even' | 'odd' | 'block' | 'unknown';

/** A scheduling rule as printed in the list view. Used for metadata and drift detection only. */
export interface RuleTerm {
  group: string;
  weekday: number;
  start: WallTime;
  end: WallTime;
  rhythm: Rhythm;
  from: CivilDate;
  to: CivilDate;
  cancelledOn: CivilDate[];
  room: string;
  lecturer: string;
}

export interface Course {
  publishId: string;
  /** Veranstaltungsnummer. Survives semester rollover, unlike publishId. */
  vnr: string;
  /** Stable selection key used in feed URLs: `vnr`, or a title hash when `vnr` is missing. */
  key: string;
  title: string;
  art: string;
  sws: string;
  belegung: string;
  fachbereich: string;
  studiengang: string;
  semesterLabel: string;
  /** Group headings as LSF prints them, e.g. `1. Zug, 2. Gruppe` or `Gruppe A`. */
  groups: string[];
  terms: RuleTerm[];
}

export interface ListView {
  semesterLabel: string;
  courses: Course[];
}

/** One concrete appointment, read off the week grid. This is what becomes a VEVENT. */
export interface Instance {
  publishId: string;
  key: string;
  title: string;
  group: string;
  groupSlug: string;
  date: CivilDate;
  start: WallTime;
  end: WallTime;
  room: string;
  art: string;
  rhythm: Rhythm;
  status: 'ok' | 'cancelled';
  /** Bumped only when the appointment actually changed; drives ICS SEQUENCE. */
  seq: number;
  changedAt: string;
}

export interface WeekResult {
  week: WeekKey;
  /** Mon-Fri civil dates read off the grid header. */
  days: CivilDate[];
  /** LSF's own annotations on a day, e.g. `Vorlesungsfrei`, `Neujahr`. */
  dayNotes: Record<CivilDate, string>;
  instances: Instance[];
}

export interface Snapshot {
  v: number;
  sg: string;
  sem: number;
  semesterLabel: string;
  semesterCode: string;
  generatedAt: string;
  /** Hash over the rendered payload; drives put-if-changed and ETags. */
  srcHash: string;
  courses: Course[];
  /** Week key -> instances. Crawled incrementally, so weeks fill in over several runs. */
  weeks: Record<WeekKey, Instance[]>;
  /** Week keys the crawl range covers, in order. */
  weekRange: WeekKey[];
  /** Rotation cursor into `weekRange` for the incremental crawler. */
  weekCursor: number;
  listFetchedAt: string;
  lastOk: string;
  errors: string[];
  /** Dates the list-view rules predict but the grid does not show. Expect the lecture-free days. */
  ruleDelta: CivilDate[];
}
