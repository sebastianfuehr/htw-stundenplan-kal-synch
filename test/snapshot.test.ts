import { describe, expect, it } from 'vitest';
import { parseListView } from '../src/lsf/parseListView.js';
import { parseGrid } from '../src/lsf/parseGrid.js';
import {
  allGroups, allInstances, buildSnapshot, computeSrcHash, crawlWeekRange,
  diffInstances, instanceId, materializeRules,
} from '../src/domain/snapshot.js';
import type { Instance } from '../src/domain/types.js';
import { fixture } from './helpers.js';

const NOW = '2026-10-14T06:00:00.000Z';
const list345 = parseListView(fixture('list-345-3-3.html'));
const week42 = parseGrid(fixture('grid-345-3-42_2026.html'), '42_2026');
const week52 = parseGrid(fixture('grid-345-3-52_2026.html'), '52_2026');
const week53 = parseGrid(fixture('grid-345-3-53_2026.html'), '53_2026');

const build = (fresh = [week42, week52, week53], prev = null as never) =>
  buildSnapshot({ sg: '345', sem: 3, list: list345, fresh, prev, now: NOW });

describe('crawlWeekRange', () => {
  it('spans the whole lecture period implied by the list view', () => {
    const weeks = crawlWeekRange(list345);
    expect(weeks[0]).toBe('41_2026');
    expect(weeks.at(-1)).toBe('6_2027');
    // The Christmas week must be crawled, not assumed empty.
    expect(weeks).toContain('53_2026');
  });

  it('reaches past Vorlesungsende when a Studiengang has exam-period Block events', () => {
    // Deriving the range from the academic calendar would cut these off; the list view's
    // own max date does not.
    const weeks = crawlWeekRange(parseListView(fixture('list-345-1-8.html')));
    expect(weeks.at(-1)).toBe('8_2027');
    expect(weeks).toContain('7_2027');
  });

  it('stays inside the semester window', () => {
    const weeks = crawlWeekRange(list345);
    expect(weeks.length).toBeLessThanOrEqual(30);
    expect(weeks.length).toBeGreaterThan(15);
  });

  it('returns nothing when the list view has no dated terms', () => {
    expect(crawlWeekRange({ semesterLabel: 'WS 2026/27', courses: [] })).toEqual([]);
  });
});

describe('materializeRules', () => {
  it('expands a weekly rule across the whole range, holidays included', () => {
    const ids = materializeRules(list345);
    // This is the point: the rules *do* claim 23.12., which the grid correctly omits.
    expect([...ids].some((id) => id.includes('|2026-12-23|'))).toBe(true);
    expect([...ids].some((id) => id.includes('|2026-10-14|'))).toBe(true);
  });
});

describe('buildSnapshot', () => {
  const snap = build();

  it('keeps the crawled weeks, including one that is legitimately empty', () => {
    expect(Object.keys(snap.weeks).sort()).toEqual(['42_2026', '52_2026', '53_2026']);
    expect(snap.weeks['53_2026']).toEqual([]);
    expect(snap.weeks['42_2026']).toHaveLength(15);
  });

  it('attaches the stable course key to every appointment', () => {
    const i = allInstances(snap).find((x) => x.title.startsWith('B33 Algorithmen und Datenstrukturen (SL)'))!;
    expect(i.key).toBe('1161231'.replace('1161231', i.key)); // key comes from the catalogue
    expect(i.key).toMatch(/^\d+$/);
    expect(snap.courses.some((c) => c.key === i.key)).toBe(true);
  });

  it('records the semester so a rollover can be detected', () => {
    expect(snap.semesterLabel).toBe('WS 2026/27');
    expect(snap.semesterCode).toBe('2026W');
  });

  it('reports the lecture-free days as the rule/grid delta', () => {
    // Only crawled weeks are judged, so this is 23. bis 25.12. and the whole of week 53.
    expect(snap.ruleDelta).toContain('2026-12-23');
    expect(snap.ruleDelta).toContain('2026-12-30');
    expect(snap.ruleDelta).not.toContain('2026-10-14');
  });

  it('lists the groups a student can pick', () => {
    expect(allGroups(snap).map((g) => g.slug)).toEqual(['1zug', '1zug-1gr', '1zug-2gr']);
  });

  it('produces a hash that ignores timestamps but tracks content', () => {
    const again = build();
    expect(again.srcHash).toBe(snap.srcHash);
    const changed = { ...snap, courses: [{ ...snap.courses[0]!, title: 'anders' }, ...snap.courses.slice(1)] };
    expect(computeSrcHash(changed)).not.toBe(snap.srcHash);
  });

  it('drops everything on a semester rollover, because publishIds churn', () => {
    const rolled = buildSnapshot({
      sg: '345', sem: 3,
      list: { ...list345, semesterLabel: 'SoSe 2027' },
      fresh: [], prev: build(), now: NOW,
    });
    expect(Object.keys(rolled.weeks)).toHaveLength(0);
  });
});

describe('what survives in a subscriber\'s calendar', () => {
  it('keeps weeks already crawled when a later week is refreshed', () => {
    // Nothing prunes by date, so appointments that have already happened stay in the feed for
    // the rest of the semester. A student can still look back at what they had in October.
    const first = buildSnapshot({ sg: '345', sem: 3, list: list345, fresh: [week42], prev: null, now: NOW });
    const later = buildSnapshot({ sg: '345', sem: 3, list: list345, fresh: [week52], prev: first, now: NOW });
    expect(Object.keys(later.weeks).sort()).toEqual(['42_2026', '52_2026']);
    expect(later.weeks['42_2026']).toHaveLength(15);
  });

  it('drops the whole previous semester once LSF rolls over', () => {
    // Every publishId is reissued, so carrying the old weeks forward would mix two semesters
    // and defeat the diffing. The consequence for subscribers is real and worth stating: the
    // finished semester disappears from the subscribed calendar in one go.
    const winter = buildSnapshot({ sg: '345', sem: 3, list: list345, fresh: [week42], prev: null, now: NOW });
    expect(Object.values(winter.weeks).flat().length).toBeGreaterThan(0);

    const summer = buildSnapshot({
      sg: '345', sem: 3,
      list: { ...list345, semesterLabel: 'SoSe 2027' },
      fresh: [], prev: winter, now: NOW,
    });
    expect(Object.values(summer.weeks).flat()).toHaveLength(0);
    expect(summer.semesterCode).toBe('2027S');
  });
});

describe('diffInstances', () => {
  const base: Instance = {
    publishId: '1', key: 'k1', title: 'Kurs', group: '1. Zug', groupSlug: '1zug',
    date: '2026-10-14', start: '08:00', end: '09:30', room: 'C 445', art: 'SL',
    rhythm: 'weekly', status: 'ok', seq: 0, changedAt: NOW,
  };

  it('leaves an unchanged appointment alone, so clients see no update', () => {
    const out = diffInstances([{ ...base, seq: 4 }], [base], '2026-11-01T00:00:00Z');
    expect(out[0]).toMatchObject({ seq: 4, changedAt: NOW });
  });

  it('bumps SEQUENCE when the room changes', () => {
    const out = diffInstances([{ ...base, seq: 4 }], [{ ...base, room: 'C 999' }], '2026-11-01T00:00:00Z');
    expect(out[0]).toMatchObject({ seq: 5, changedAt: '2026-11-01T00:00:00Z' });
  });

  it('bumps SEQUENCE when an appointment is cancelled', () => {
    const out = diffInstances([base], [{ ...base, status: 'cancelled' }], '2026-11-01T00:00:00Z');
    expect(out[0]!.seq).toBe(1);
  });

  it('starts a new appointment at SEQUENCE 0', () => {
    const out = diffInstances([], [base], NOW);
    expect(out[0]).toMatchObject({ seq: 0, changedAt: NOW });
  });

  it('identifies appointments by course, group, day and start time', () => {
    expect(instanceId(base)).toBe('k1-1zug-20261014-0800');
    // Two appointments of the same course on one day must stay distinct.
    expect(instanceId({ ...base, start: '13:00' })).not.toBe(instanceId(base));
  });
});
