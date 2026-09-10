import { describe, expect, it } from 'vitest';
import { parseListView, parseRhythm, parseWeekday } from '../src/lsf/parseListView.js';
import { fixture } from './helpers.js';

describe('parseWeekday / parseRhythm', () => {
  it('maps the German weekday names LSF prints', () => {
    expect(parseWeekday('Montag')).toBe(1);
    expect(parseWeekday('Mi.')).toBe(3);
    expect(parseWeekday('Freitag')).toBe(5);
    expect(parseWeekday('Kauderwelsch')).toBe(0);
  });

  it('maps every rhythm value observed in LSF', () => {
    expect(parseRhythm('Einzelt.')).toBe('once');
    expect(parseRhythm('wöch 06.10.2026 bis 09.02.2027')).toBe('weekly');
    expect(parseRhythm('ger. W. 12.10.2026 bis 08.02.2027')).toBe('even');
    expect(parseRhythm('unger. W. 05.10.2026 bis 01.02.2027')).toBe('odd');
    expect(parseRhythm('Block 15.02.2027 bis 25.02.2027')).toBe('block');
    expect(parseRhythm('')).toBe('unknown');
  });
});

describe('parseListView: Angewandte Informatik, 3. Fachsemester', () => {
  const lv = parseListView(fixture('list-345-3-3.html'));

  it('reads the semester label, which is what drives rollover detection', () => {
    expect(lv.semesterLabel).toBe('WS 2026/27');
  });

  it('finds every course', () => {
    expect(lv.courses).toHaveLength(10);
  });

  it('extracts full metadata', () => {
    const c = lv.courses.find((x) => x.title === 'B31 Programmierung 3 (PCÜ)')!;
    expect(c).toMatchObject({
      publishId: '234896',
      vnr: '1161232',
      key: '1161232',
      art: 'PC-Übung',
      sws: '2',
      belegung: 'Belegpflicht',
      studiengang: 'Angewandte Informatik (B)',
      semesterLabel: 'WS 2026/27',
    });
    expect(c.fachbereich).toContain('Fachbereich 4');
  });

  it('reads weekly rules with rooms', () => {
    const c = lv.courses.find((x) => x.title === 'B31 Programmierung 3 (SL)')!;
    expect(c.terms).toHaveLength(1);
    expect(c.terms[0]).toMatchObject({
      group: '1. Zug',
      weekday: 1,
      start: '09:45',
      end: '11:15',
      rhythm: 'weekly',
      from: '2026-10-05',
      to: '2027-02-08',
      room: 'WH Gebäude C 445',
    });
  });

  it('attributes each rule to its own group section', () => {
    const c = lv.courses.find((x) => x.title === 'B31 Programmierung 3 (PCÜ)')!;
    expect(c.groups).toEqual(['1. Zug, 1. Gruppe', '1. Zug, 2. Gruppe']);
    expect(c.terms.map((t) => `${t.group} ${t.start}`)).toEqual([
      '1. Zug, 1. Gruppe 14:00',
      '1. Zug, 2. Gruppe 12:15',
    ]);
  });
});

describe('parseListView: Game Design, all semesters', () => {
  const lv = parseListView(fixture('list-350-1-8.html'));

  it('finds the Game Design courses', () => {
    expect(lv.courses).toHaveLength(13);
    expect(lv.courses.every((c) => c.semesterLabel === 'WS 2026/27')).toBe(true);
  });

  it('copes with rooms and lecturers being unset for this Fachbereich', () => {
    const c = lv.courses.find((x) => x.publishId === '236116')!;
    expect(c.terms.length).toBeGreaterThan(0);
    expect(c.terms.every((t) => t.room === '' && t.lecturer === '')).toBe(true);
  });

  it('parses single appointments', () => {
    const c = lv.courses.find((x) => x.publishId === '236116')!;
    expect(c.terms[0]).toMatchObject({
      group: '1. Zug, 1. Gruppe',
      weekday: 1,
      start: '10:00',
      end: '18:00',
      rhythm: 'once',
      from: '2026-10-05',
      to: '2026-10-05',
    });
  });

  it('surfaces every group naming convention present, including un-grouped events', () => {
    const groups = new Set(lv.courses.flatMap((c) => c.groups));
    expect(groups).toContain('1. Zug, 1. Gruppe');
    expect(groups).toContain('2. Zug');
    expect(groups).toContain('Gruppe A');
    // LSF prints `Termin` when an event has no group restriction at all.
    expect(groups).toContain('Termin');
  });

  it('reads Zuweisung as well as Belegpflicht', () => {
    const w = lv.courses.find((x) => x.title.startsWith('W 35 Sound Design'))!;
    expect(w.belegung).toBe('Zuweisung');
  });

  it('gives every course a stable selection key', () => {
    expect(lv.courses.every((c) => c.key.length > 0)).toBe(true);
    expect(new Set(lv.courses.map((c) => c.key)).size).toBe(lv.courses.length);
  });
});

describe('parseListView: Block events in the exam period', () => {
  const lv = parseListView(fixture('list-345-1-8.html'));

  it('keeps a Block row even though LSF prints "keine Angabe" as its weekday', () => {
    // Dropping these would hide the whole exam-period block and cut the crawl range short.
    const c = lv.courses.find((x) => x.publishId === '234885')!;
    expect(c.terms).toHaveLength(1);
    expect(c.terms[0]).toMatchObject({
      rhythm: 'block',
      start: '09:45',
      end: '13:00',
      from: '2027-02-15',
      to: '2027-02-25',
      group: '1. Zug',
    });
  });

  it('falls back to the weekday the block starts on', () => {
    const c = lv.courses.find((x) => x.publishId === '234885')!;
    expect(c.terms[0]!.weekday).toBe(1); // 15.02.2027 is a Monday
  });
});

describe('parseListView: the merged 1..8 view stays coherent', () => {
  it('parses the large Angewandte Informatik view', () => {
    const lv = parseListView(fixture('list-345-1-8.html'));
    expect(lv.courses).toHaveLength(73);
    const groups = new Set(lv.courses.flatMap((c) => c.groups));
    // Finding E: `Gruppe A`-style headings coexist with `N. Zug` ones in one Studiengang.
    expect([...groups].some((g) => /^Gruppe [A-Z]$/.test(g))).toBe(true);
    expect([...groups].some((g) => /Zug/.test(g))).toBe(true);
  });
});
