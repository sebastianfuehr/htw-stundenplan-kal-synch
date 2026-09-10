import { tokenize, type Token } from './html/lexer.js';
import { cellText, parseTables, sliceElement, toGrid, tokensLinks, tokensText } from './html/table.js';
import { isoWeekday, parseAllGermanDates, parseTimeRange } from './dates.js';
import { courseKey } from '../domain/key.js';
import type { Course, ListView, Rhythm, RuleTerm } from '../domain/types.js';

const WEEKDAYS: Record<string, number> = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 7,
  mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7,
};

const TERMS_TABLE_SUMMARY = 'Übersicht über alle Veranstaltungstermine';

export function parseWeekday(s: string): number {
  const key = s.toLowerCase().replace(/[^a-zäöü]/g, '');
  return WEEKDAYS[key] ?? 0;
}

export function parseRhythm(s: string): Rhythm {
  const t = s.toLowerCase();
  if (t.startsWith('einzel')) return 'once';
  if (t.startsWith('block')) return 'block';
  if (t.startsWith('unger')) return 'odd';
  if (t.startsWith('ger')) return 'even';
  if (t.startsWith('wöch') || t.startsWith('woch')) return 'weekly';
  return 'unknown';
}

/**
 * Parses the semester-wide list view.
 *
 * Layout is div-based, not table-based: an `<h3>` containing a `publishid` anchor starts a
 * course, a following metadata `<div>` carries semester/Nr./Art/SWS/Fachbereich/Studiengang,
 * and each `<h3>` *without* an anchor starts a group section whose appointments live in the
 * next `<table summary="Übersicht über alle Veranstaltungstermine">`.
 */
export function parseListView(html: string): ListView {
  const toks: Token[] = [...tokenize(html)];
  const courses: Course[] = [];
  let current: Course | null = null;
  let group = '';
  let semesterLabel = '';

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;

    if (t.kind === 'open' && t.name === 'h3') {
      const { inner, next } = sliceElement(toks, i, 'h3');
      const links = tokensLinks(inner);
      const courseLink = links.find((l) => /[?&]publishid=(\d+)/.test(l.href));

      if (courseLink !== undefined) {
        const publishId = /[?&]publishid=(\d+)/.exec(courseLink.href)![1]!;
        const title = courseLink.text;
        const heading = tokensText(inner);
        // `Belegpflicht` / `Zuweisung` trails the title inside the same h3.
        const belegung = heading.slice(title.length).trim();
        const meta = readMetadata(toks, next);
        if (meta.semesterLabel !== '') semesterLabel = meta.semesterLabel;
        current = {
          publishId,
          vnr: meta.vnr,
          key: courseKey(meta.vnr, title),
          title,
          art: meta.art,
          sws: meta.sws,
          belegung,
          fachbereich: meta.fachbereich,
          studiengang: meta.studiengang,
          semesterLabel: meta.semesterLabel || semesterLabel,
          groups: [],
          terms: [],
        };
        courses.push(current);
        group = '';
      } else {
        // A group heading. Ignore stray empty h3s.
        const heading = tokensText(inner);
        if (heading.length > 0 && current !== null) {
          group = heading;
          if (!current.groups.includes(group)) current.groups.push(group);
        }
      }
      i = next - 1;
      continue;
    }

    if (
      t.kind === 'open' && t.name === 'table' &&
      (t.attrs['summary'] ?? '').startsWith(TERMS_TABLE_SUMMARY.slice(0, 20))
    ) {
      const { next } = sliceElement(toks, i, 'table');
      if (current !== null) {
        // parseTables needs the `<table>` token itself, so slice inclusively.
        for (const term of parseTermsTable(toks.slice(i, next), group)) current.terms.push(term);
        if (group !== '' && !current.groups.includes(group)) current.groups.push(group);
      }
      i = next - 1;
      continue;
    }
  }

  return { semesterLabel, courses };
}

interface Metadata {
  semesterLabel: string;
  vnr: string;
  art: string;
  sws: string;
  fachbereich: string;
  studiengang: string;
}

/** Reads the metadata div that follows a course heading, stopping at the next h3 or table. */
function readMetadata(toks: Token[], from: number): Metadata {
  let end = toks.length;
  for (let i = from; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.kind === 'open' && (t.name === 'h3' || t.name === 'table')) {
      end = i;
      break;
    }
  }
  const slice = toks.slice(from, end);
  const text = tokensText(slice);
  const links = tokensLinks(slice).filter((l) => l.href.includes('webInfoEinrichtung'));

  const semesterLabel = /(WS\s*\d{4}\/\d{2}|SoSe\s*\d{4}|SS\s*\d{4})/i.exec(text)?.[1]?.replace(/\s+/g, ' ') ?? '';
  const vnr = /Nr\.:\s*([0-9A-Za-z._-]+)/.exec(text)?.[1] ?? '';
  const sws = /([\d.,]+)\s*SWS/.exec(text)?.[1] ?? '';
  // Veranstaltungsart sits between the Nr. and the SWS figure: `Nr.: 6241331 Studioarbeit 4 SWS`.
  const art = /Nr\.:\s*[0-9A-Za-z._-]+\s+(.*?)\s+[\d.,]+\s*SWS/.exec(text)?.[1]?.trim() ?? '';

  return {
    semesterLabel,
    vnr,
    art,
    sws,
    fachbereich: links.find((l) => /Fachbereich|Zentral|Hochschul/i.test(l.text))?.text ?? links[0]?.text ?? '',
    studiengang: links.at(-1)?.text ?? '',
  };
}

/** Columns are matched by header name so a column reorder in LSF cannot silently shift data. */
function parseTermsTable(inner: Token[], group: string): RuleTerm[] {
  const [table] = parseTables(inner);
  if (table === undefined) return [];
  const grid = toGrid(table);
  const headerRow = grid.find((row) => row.some((c) => c !== null && c.tag === 'th'));
  if (headerRow === undefined) return [];

  const col: Record<string, number> = {};
  headerRow.forEach((c, idx) => {
    if (c === null) return;
    const name = cellText(c).toLowerCase();
    if (name.startsWith('tag')) col['day'] = idx;
    else if (name.startsWith('zeit')) col['time'] = idx;
    else if (name.startsWith('rhythmus')) col['rhythm'] = idx;
    else if (name.startsWith('dauer')) col['span'] = idx;
    else if (name.startsWith('fällt aus')) col['cancel'] = idx;
    else if (name.startsWith('lehrperson')) col['lecturer'] = idx;
    else if (name.startsWith('raum')) col['room'] = idx;
  });

  const at = (row: (ReturnType<typeof toGrid>[number][number])[], name: string): string => {
    const idx = col[name];
    if (idx === undefined) return '';
    const c = row[idx];
    return c === null || c === undefined ? '' : cellText(c);
  };

  const out: RuleTerm[] = [];
  for (const row of grid) {
    if (row === headerRow || row.some((c) => c !== null && c.tag === 'th')) continue;
    const time = parseTimeRange(at(row, 'time'));
    if (time === null) continue;

    const rhythmText = at(row, 'rhythm');
    const spanDates = parseAllGermanDates(at(row, 'span'));
    const rhythmDates = parseAllGermanDates(rhythmText);
    const from = spanDates[0] ?? rhythmDates[0] ?? '';
    const to = spanDates.at(-1) ?? rhythmDates.at(-1) ?? from;
    if (from === '') continue;

    // Block events span several weekdays, so LSF prints `keine Angabe` in the Tag column.
    // Dropping those rows would hide the whole exam-period block *and* cut the crawl range
    // short, so fall back to the weekday the series starts on.
    const weekday = parseWeekday(at(row, 'day')) || isoWeekday(from);

    out.push({
      group,
      weekday,
      start: time.start,
      end: time.end,
      rhythm: parseRhythm(rhythmText),
      from,
      to,
      cancelledOn: parseAllGermanDates(at(row, 'cancel')),
      room: at(row, 'room'),
      lecturer: at(row, 'lecturer'),
    });
  }
  return out;
}
