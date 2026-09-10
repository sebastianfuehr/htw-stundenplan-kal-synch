import { describe, expect, it } from 'vitest';
import {
  addDays, isoWeek, isoWeekday, mondayOfIsoWeek, parseAllGermanDates, parseGermanDate,
  parseSemesterLabel, parseTimeRange, parseWeekKey, semestersBetween, weekKey, weekKeysBetween,
} from '../src/lsf/dates.js';

describe('parseGermanDate', () => {
  it('parses the LSF format', () => {
    expect(parseGermanDate('05.10.2026')).toBe('2026-10-05');
    expect(parseGermanDate('am 23.12.2026 ')).toBe('2026-12-23');
  });

  it('rejects impossible dates instead of silently rolling them over', () => {
    expect(parseGermanDate('31.02.2027')).toBeNull();
    expect(parseGermanDate('00.01.2027')).toBeNull();
  });

  it('returns null when there is no date', () => {
    expect(parseGermanDate('Einzelt.')).toBeNull();
  });
});

describe('parseAllGermanDates', () => {
  it('pulls every distinct date out of a cell, in order', () => {
    expect(parseAllGermanDates('wöch 06.10.2026 bis 09.02.2027')).toEqual(['2026-10-06', '2027-02-09']);
    expect(parseAllGermanDates('05.10.2026, 05.10.2026')).toEqual(['2026-10-05']);
  });
});

describe('parseTimeRange', () => {
  it('parses both separators LSF uses', () => {
    expect(parseTimeRange('10:00 bis 18:00')).toEqual({ start: '10:00', end: '18:00' });
    expect(parseTimeRange('08:00 - 09:30')).toEqual({ start: '08:00', end: '09:30' });
  });

  it('rejects nonsense', () => {
    expect(parseTimeRange('10:00')).toBeNull();
    expect(parseTimeRange('25:00 bis 26:00')).toBeNull();
  });
});

describe('ISO week arithmetic', () => {
  it('agrees with the week numbers LSF served us', () => {
    // These pairings come from real LSF grid headers.
    expect(weekKey('2026-10-12')).toBe('42_2026');
    expect(weekKey('2026-12-21')).toBe('52_2026');
    expect(weekKey('2026-12-28')).toBe('53_2026');
    expect(weekKey('2027-01-04')).toBe('1_2027');
    expect(weekKey('2027-02-15')).toBe('7_2027');
  });

  it('round-trips week key to Monday', () => {
    expect(mondayOfIsoWeek(42, 2026)).toBe('2026-10-12');
    expect(mondayOfIsoWeek(53, 2026)).toBe('2026-12-28');
    expect(mondayOfIsoWeek(1, 2027)).toBe('2027-01-04');
  });

  it('handles the year boundary, where the ISO year differs from the calendar year', () => {
    expect(isoWeek('2027-01-01')).toEqual({ week: 53, year: 2026 });
  });

  it('numbers weekdays Monday=1', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-16')).toBe(5);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });

  it('enumerates the WS 2026/27 lecture period as 21 weeks', () => {
    const weeks = weekKeysBetween('2026-10-05', '2027-02-25');
    expect(weeks[0]).toBe('41_2026');
    expect(weeks.at(-1)).toBe('8_2027');
    expect(weeks).toHaveLength(21);
    expect(weeks).toContain('53_2026');
  });

  it('caps the crawl range so a bad max date cannot run away', () => {
    expect(weekKeysBetween('2026-10-05', '2030-01-01')).toHaveLength(30);
  });

  it('parses and rejects week keys', () => {
    expect(parseWeekKey('42_2026')).toEqual({ week: 42, year: 2026 });
    expect(parseWeekKey('54_2026')).toBeNull();
    expect(parseWeekKey('nope')).toBeNull();
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });
});

describe('semesters', () => {
  it('parses the labels LSF prints', () => {
    expect(parseSemesterLabel('WS 2026/27')).toMatchObject({ code: '2026W', from: '2026-10-01', to: '2027-03-31' });
    expect(parseSemesterLabel('SoSe 2027')).toMatchObject({ code: '2027S', from: '2027-04-01', to: '2027-09-30' });
    expect(parseSemesterLabel('irgendwas')).toBeNull();
  });

  it('counts semesters so a Fachsemester can be advanced on rollover', () => {
    expect(semestersBetween('2026W', '2027S')).toBe(1);
    expect(semestersBetween('2026W', '2027W')).toBe(2);
    expect(semestersBetween('2026W', '2026W')).toBe(0);
    expect(semestersBetween('2027S', '2026W')).toBe(-1);
  });
});
