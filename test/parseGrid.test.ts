import { describe, expect, it } from 'vitest';
import { GridValidationError, parseGrid } from '../src/lsf/parseGrid.js';
import { fixture } from './helpers.js';

describe('parseGrid: a normal lecture week', () => {
  const r = parseGrid(fixture('grid-345-3-42_2026.html'), '42_2026');

  it('reads the five weekday dates from the header', () => {
    expect(r.days).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  });

  it('places each appointment on the date of its column', () => {
    const b33 = r.instances.filter((i) => i.title === 'B33 Algorithmen und Datenstrukturen (SL)');
    expect(b33).toHaveLength(1);
    expect(b33[0]).toMatchObject({
      date: '2026-10-14',
      start: '08:00',
      end: '09:30',
      rhythm: 'weekly',
      group: '1. Zug',
      groupSlug: '1zug',
      room: 'WH Gebäude C 445',
      art: 'Seminaristischer Lehrvortrag',
      publishId: '234990',
    });
  });

  it('splits a course into its lecture and its parallel exercise groups', () => {
    const b33 = r.instances.filter((i) => i.title.startsWith('B33 Algorithmen'));
    expect(b33.map((i) => `${i.title} | ${i.groupSlug} | ${i.start}`)).toEqual([
      'B33 Algorithmen und Datenstrukturen (SL) | 1zug | 08:00',
      'B33 Algorithmen und Datenstrukturen (PCÜ) | 1zug-1gr | 09:45',
      'B33 Algorithmen und Datenstrukturen (PCÜ) | 1zug-2gr | 12:15',
    ]);
  });

  it('emits every appointment in the week', () => {
    // 15 `publishid` anchors sit in the fixture's plan table; all must become appointments.
    expect(r.instances).toHaveLength(15);
    expect(r.instances.every((i) => r.days.includes(i.date))).toBe(true);
    expect(r.instances.every((i) => i.start < i.end)).toBe(true);
  });

  it('returns appointments sorted by date and time', () => {
    const keys = r.instances.map((i) => `${i.date} ${i.start}`);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('parseGrid: the academic calendar is respected', () => {
  it('yields nothing for the Christmas week, which the list view cannot express', () => {
    const r = parseGrid(fixture('grid-345-3-53_2026.html'), '53_2026');
    expect(r.days).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01']);
    expect(r.instances).toHaveLength(0);
  });

  it('surfaces the lecture-free annotations LSF puts in the header', () => {
    const r = parseGrid(fixture('grid-345-3-53_2026.html'), '53_2026');
    expect(r.dayNotes['2026-12-28']).toMatch(/Vorlesungsfrei/i);
    expect(r.dayNotes['2027-01-01']).toMatch(/Neujahr/i);
  });

  it('drops only the lecture-free days of a partially free week', () => {
    const r = parseGrid(fixture('grid-345-3-52_2026.html'), '52_2026');
    expect(r.days[0]).toBe('2026-12-21');
    const dates = new Set(r.instances.map((i) => i.date));
    // 23.12. onwards is lecture-free, so a Wednesday weekly series must not appear.
    expect(dates.has('2026-12-23')).toBe(false);
    expect(dates.has('2026-12-24')).toBe(false);
    expect(dates.has('2026-12-21')).toBe(true);
  });
});

describe('parseGrid: the silent-failure guard', () => {
  it('rejects a week LSF has no plan for, rather than inventing dates', () => {
    // `week=41_2027` returns HTTP 200 with eleven course cells and no header dates at all.
    expect(() => parseGrid(fixture('grid-345-3-41_2027.html'), '41_2027')).toThrow(GridValidationError);
    expect(() => parseGrid(fixture('grid-345-3-41_2027.html'), '41_2027')).toThrow(/no dates in header/);
  });

  it('rejects a response whose header belongs to a different week than requested', () => {
    expect(() => parseGrid(fixture('grid-345-3-42_2026.html'), '50_2026')).toThrow(/but week 50_2026 was requested/);
  });

  it('rejects a malformed week key', () => {
    expect(() => parseGrid(fixture('grid-345-3-42_2026.html'), 'nonsense')).toThrow(GridValidationError);
  });
});

describe('parseGrid: stacked cells', () => {
  it('reads every course out of a cell holding many, not just the first', () => {
    const r = parseGrid(fixture('grid-345-1-8-41_2026.html'), '41_2026');
    expect(r.instances.length).toBeGreaterThan(50);
    // Two different courses share one 08:00 Wednesday cell; both must survive.
    const wed8 = r.instances.filter((i) => i.date === '2026-10-07' && i.start === '08:00');
    expect(wed8.length).toBeGreaterThanOrEqual(2);
    expect(new Set(wed8.map((i) => i.publishId)).size).toBe(wed8.length);
  });

  it('reads the rhythm per entry, not from the cell class', () => {
    const r = parseGrid(fixture('grid-345-1-8-41_2026.html'), '41_2026');
    const rhythms = new Set(r.instances.map((i) => i.rhythm));
    expect(rhythms.has('weekly')).toBe(true);
    expect(rhythms.has('unknown')).toBe(false);
  });

  it('does not count the legend, which reuses the plan5/6/7 classes', () => {
    const r = parseGrid(fixture('grid-345-3-53_2026.html'), '53_2026');
    expect(r.instances.map((i) => i.title)).not.toContain('Blockveranstaltung');
  });
});

describe('parseGrid: Game Design, where no rooms are published', () => {
  const r = parseGrid(fixture('grid-350-3-42_2026.html'), '42_2026');

  it('parses appointments with an empty room', () => {
    expect(r.instances.length).toBeGreaterThan(0);
    expect(r.instances.every((i) => i.room === '')).toBe(true);
    expect(r.instances.every((i) => i.art !== '')).toBe(true);
  });

  it('keeps the two parallel Projekt A courses apart', () => {
    const projekt = r.instances.filter((i) => i.title.includes('Projekt A'));
    expect(projekt).toHaveLength(2);
    expect(projekt.map((i) => i.groupSlug).sort()).toEqual(['1zug', '2zug']);
  });

  it('handles group headings of the "N. Zug, N. Gruppe" shape', () => {
    const b10 = r.instances.find((i) => i.title.startsWith('B10 Grundlehre'))!;
    expect(b10.group).toBe('1. Zug, 1. Gruppe');
    expect(b10.groupSlug).toBe('1zug-1gr');
    expect(b10.rhythm).toBe('once');
  });
});
