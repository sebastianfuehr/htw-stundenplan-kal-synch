import { tokenize } from './html/lexer.js';
import { cellText, parseTables, tokensLinks, tokensText, toGrid, type Cell, type Table } from './html/table.js';
import { isoWeek, parseGermanDate, parseWallTime, parseWeekKey, type CivilDate } from './dates.js';
import { groupSlug } from '../domain/key.js';
import { parseRhythm } from './parseListView.js';
import type { Instance, Rhythm, WeekResult } from '../domain/types.js';

/**
 * Thrown when a grid response cannot be trusted.
 *
 * LSF answers a week it has no plan data for with HTTP 200, the usual course cells, and a
 * header row that has *no dates at all* (verified with `week=41_2027`). Parsing that naively
 * would place events on invented days, so every response is validated against the week we
 * asked for before a single instance is emitted.
 */
export class GridValidationError extends Error {
  constructor(public readonly reason: string) {
    super(`grid rejected: ${reason}`);
    this.name = 'GridValidationError';
  }
}

/** An event cell is one that links to a Veranstaltung. The legend and spacers never do. */
function isEventCell(cell: Cell): boolean {
  return tokensLinks(cell.tokens).some((l) => l.href.includes('publishid='));
}

function findPlanTable(tables: Table[]): Table | null {
  let best: Table | null = null;
  for (const t of tables) {
    const headerCells = t.rows[0]?.cells ?? [];
    if (!headerCells.some((c) => (c.attrs['class'] ?? '') === 'plan_rahmen')) continue;
    if (best === null || t.rows.length > best.rows.length) best = t;
  }
  return best;
}

interface DayColumn {
  col: number;
  date: CivilDate;
  note: string;
}

function readHeader(header: (Cell | null)[]): DayColumn[] {
  const days: DayColumn[] = [];
  const seen = new Set<Cell>();
  header.forEach((cell, col) => {
    if (cell === null || seen.has(cell)) return;
    seen.add(cell);
    const text = cellText(cell);
    const date = parseGermanDate(text);
    if (date === null) return;
    // `Montag 28.12.2026 Vorlesungsfrei`: LSF annotates lecture-free days in the header.
    const note = text.replace(/^\s*\S+\s*/, '').replace(/\d{2}\.\d{2}\.\d{4}/, '').trim();
    days.push({ col, date, note });
  });
  return days;
}

function validate(days: DayColumn[], week: string): void {
  if (days.length === 0) {
    throw new GridValidationError(`no dates in header for week ${week} (LSF has no plan for it)`);
  }
  if (days.length < 5) {
    throw new GridValidationError(`only ${days.length} day columns for week ${week}`);
  }
  const expected = parseWeekKey(week);
  if (expected === null) throw new GridValidationError(`malformed week key ${week}`);

  const first = days[0]!.date;
  const got = isoWeek(first);
  if (got.week !== expected.week || got.year !== expected.year) {
    throw new GridValidationError(
      `header starts ${first} (KW ${got.week}/${got.year}) but week ${week} was requested`,
    );
  }
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]!.date}T00:00:00Z`).getTime();
    const cur = new Date(`${days[i]!.date}T00:00:00Z`).getTime();
    if (cur - prev !== 86_400_000) {
      throw new GridValidationError(`header days are not consecutive: ${days[i - 1]!.date} -> ${days[i]!.date}`);
    }
  }
}

interface Entry {
  publishId: string;
  title: string;
  group: string;
  start: string;
  end: string;
  rhythm: Rhythm;
  room: string;
  art: string;
}

/**
 * One event cell can stack many courses. Up to 10 were observed in the merged 1..8 view, and
 * even a single-Fachsemester Game Design cell holds two. Each stacked entry is its own nested
 * table, and the *cell's* CSS class only describes the first of them, so the rhythm is read
 * from each entry's own `(…)` text rather than from the class.
 */
export function parseCellEntries(cell: Cell): Entry[] {
  const out: Entry[] = [];
  for (const inner of parseTables(cell.tokens)) {
    const entry: Entry = {
      publishId: '', title: '', group: '', start: '', end: '', rhythm: 'unknown', room: '', art: '',
    };
    for (const row of inner.rows) {
      const tokens = row.cells.flatMap((c) => c.tokens);
      const text = tokensText(tokens);
      if (text === '') continue;
      const links = tokensLinks(tokens);

      const course = links.find((l) => l.href.includes('publishid='));
      if (course !== undefined) {
        entry.publishId = /[?&]publishid=(\d+)/.exec(course.href)?.[1] ?? '';
        entry.title = course.text;
        continue;
      }

      const time = /(\d{1,2}:\d{2})\s*[-–bis]{1,3}\s*(\d{1,2}:\d{2})\s*(?:\(([^)]*)\))?/.exec(text);
      if (time !== null) {
        entry.start = parseWallTime(time[1]!) ?? '';
        entry.end = parseWallTime(time[2]!) ?? '';
        if (time[3] !== undefined) entry.rhythm = parseRhythm(time[3]);
        continue;
      }
      if (/^Start:/i.test(text) || /^Ende:/i.test(text)) continue;

      const room = links.find((l) => l.href.includes('raum.rgid='));
      if (room !== undefined) {
        entry.room = room.text;
        entry.art = text.replace(room.text, '').trim();
        continue;
      }
      // First unlabelled row after the title is the group heading; a later one is the
      // Veranstaltungsart (which is all that is left when no room is assigned).
      if (entry.group === '') entry.group = text;
      else if (entry.art === '') entry.art = text;
    }
    if (entry.publishId !== '' && entry.start !== '') out.push(entry);
  }
  return out;
}

/**
 * Reads one week grid into concrete appointments.
 *
 * The grid, not the list view, is the source of truth for dates, because it is the only
 * representation that reflects the academic calendar: it drops lecture-free days (verified:
 * KW 53/2026 is empty and Wed 23.12.2026 is missing from an otherwise weekly series), and it
 * resolves `Block` and biweekly rhythms into actual days.
 */
export function parseGrid(html: string, week: string): WeekResult {
  const plan = findPlanTable(parseTables(tokenize(html)));
  if (plan === null) throw new GridValidationError('no plan table found');

  const grid = toGrid(plan);
  const header = grid[0];
  if (header === undefined) throw new GridValidationError('plan table has no rows');

  const days = readHeader(header);
  validate(days, week);

  const dateByCol = new Map<number, CivilDate>();
  const dayNotes: Record<CivilDate, string> = {};
  for (const d of days) {
    dateByCol.set(d.col, d.date);
    if (d.note !== '') dayNotes[d.date] = d.note;
  }

  const instances: Instance[] = [];
  const seen = new Set<Cell>();
  const dedupe = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell === null || cell === undefined || seen.has(cell)) continue;
      seen.add(cell);
      const date = dateByCol.get(c);
      if (date === undefined || !isEventCell(cell)) continue;

      for (const e of parseCellEntries(cell)) {
        // A cell spanning many rows is visited once, but identical entries can still repeat
        // across adjacent cells in malformed markup; key on the tuple that defines an event.
        const id = `${e.publishId}|${e.group}|${date}|${e.start}|${e.end}`;
        if (dedupe.has(id)) continue;
        dedupe.add(id);
        instances.push({
          publishId: e.publishId,
          key: '',
          title: e.title,
          group: e.group,
          groupSlug: groupSlug(e.group),
          date,
          start: e.start,
          end: e.end,
          room: e.room,
          art: e.art,
          rhythm: e.rhythm,
          status: 'ok',
          seq: 0,
          changedAt: '',
        });
      }
    }
  }

  instances.sort((a, b) =>
    a.date === b.date
      ? a.start === b.start ? a.title.localeCompare(b.title, 'de') : a.start.localeCompare(b.start)
      : a.date.localeCompare(b.date),
  );

  return { week, days: days.map((d) => d.date), dayNotes, instances };
}
