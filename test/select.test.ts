import { describe, expect, it } from 'vitest';
import {
  canonicalQuery, effectiveSemester, FeedParamError, parseFeedParams, selectInstances,
} from '../src/domain/select.js';
import type { Instance, Snapshot } from '../src/domain/types.js';

const q = (s: string) => new URLSearchParams(s);

const inst = (over: Partial<Instance>): Instance => ({
  publishId: '1', key: 'k1', title: 'Kurs', group: '1. Zug', groupSlug: '1zug',
  date: '2026-10-14', start: '08:00', end: '09:30', room: '', art: 'SL',
  rhythm: 'weekly', status: 'ok', seq: 0, changedAt: '', ...over,
});

const snap = (instances: Instance[]): Snapshot => ({
  v: 3, sg: '350', sem: 3, semesterLabel: 'WS 2026/27', semesterCode: '2026W',
  generatedAt: '', srcHash: '', courses: [], weeks: { '42_2026': instances },
  weekRange: [], weekCursor: 0, listFetchedAt: '', lastOk: '', errors: [], ruleDelta: [],
});

describe('parseFeedParams', () => {
  it('accepts a full link', () => {
    const p = parseFeedParams(q('v=1&sg=350&sem=3&anchor=2026W&roll=1&g=1zug-1gr&x=abc,def&n=Studium'));
    expect(p).toMatchObject({
      sg: '350', sem: 3, anchor: '2026W', roll: true,
      groups: ['1zug-1gr'], exclude: ['abc', 'def'], name: 'Studium', showCancelled: true,
    });
  });

  it('rejects a missing or nonsensical Studiengang', () => {
    expect(() => parseFeedParams(q('sem=3'))).toThrow(FeedParamError);
    expect(() => parseFeedParams(q('sg=abc&sem=3'))).toThrow(FeedParamError);
  });

  it('rejects an out-of-range Fachsemester', () => {
    expect(() => parseFeedParams(q('sg=350&sem=0'))).toThrow(FeedParamError);
    expect(() => parseFeedParams(q('sg=350&sem=99'))).toThrow(FeedParamError);
  });

  it('ignores roll without an anchor, which would otherwise drift unpredictably', () => {
    expect(parseFeedParams(q('sg=350&sem=3&roll=1')).roll).toBe(false);
  });

  it('lets a student hide cancelled events', () => {
    expect(parseFeedParams(q('sg=350&sem=3&cancelled=hide')).showCancelled).toBe(false);
  });
});

describe('effectiveSemester', () => {
  const base = parseFeedParams(q('sg=350&sem=3&anchor=2026W&roll=1'));

  it('stays put while LSF is still in the anchor semester', () => {
    expect(effectiveSemester(base, '2026W')).toBe(3);
  });

  it('advances exactly when LSF moves on', () => {
    expect(effectiveSemester(base, '2027S')).toBe(4);
    expect(effectiveSemester(base, '2027W')).toBe(5);
  });

  it('does not advance when the student switched rolling off', () => {
    const fixed = parseFeedParams(q('sg=350&sem=3&anchor=2026W'));
    expect(effectiveSemester(fixed, '2027W')).toBe(3);
  });

  it('falls back to the chosen semester when nothing is known yet', () => {
    expect(effectiveSemester(base, null)).toBe(3);
  });

  it('clamps rather than producing an impossible Fachsemester', () => {
    expect(effectiveSemester(base, '2040W')).toBe(20);
  });
});

describe('selectInstances', () => {
  const data = [
    inst({ key: 'a', groupSlug: '1zug' }),
    inst({ key: 'b', groupSlug: '1zug-1gr', start: '10:00' }),
    inst({ key: 'c', groupSlug: '1zug-2gr', start: '12:00' }),
    inst({ key: 'd', groupSlug: '', start: '14:00' }),
    inst({ key: 'e', groupSlug: '1zug-1gr', start: '16:00', status: 'cancelled' }),
  ];

  it('keeps the own group, the Zug-wide lecture and un-grouped events', () => {
    const p = parseFeedParams(q('sg=350&sem=3&g=1zug-1gr'));
    expect(selectInstances(snap(data), p).map((i) => i.key)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('drops excluded courses', () => {
    const p = parseFeedParams(q('sg=350&sem=3&g=1zug-1gr&x=b,e'));
    expect(selectInstances(snap(data), p).map((i) => i.key)).toEqual(['a', 'd']);
  });

  it('keeps everything when no group was picked', () => {
    const p = parseFeedParams(q('sg=350&sem=3'));
    expect(selectInstances(snap(data), p)).toHaveLength(5);
  });

  it('can hide cancelled appointments on request', () => {
    const p = parseFeedParams(q('sg=350&sem=3&cancelled=hide'));
    expect(selectInstances(snap(data), p).map((i) => i.key)).not.toContain('e');
  });

  it('returns appointments in chronological order', () => {
    const p = parseFeedParams(q('sg=350&sem=3'));
    const out = selectInstances(snap(data), p).map((i) => i.start);
    expect(out).toEqual([...out].sort());
  });
});

describe('a group selection that no longer exists', () => {
  // Group naming is not stable across semesters. A stale selection must not silently empty
  // the calendar.
  const data = [
    inst({ key: 'a', groupSlug: 'gra' }),
    inst({ key: 'b', groupSlug: 'grb', start: '10:00' }),
  ];

  it('is ignored when none of its groups exist in this snapshot', () => {
    const p = parseFeedParams(q('sg=350&sem=3&g=1zug-1gr'));
    expect(selectInstances(snap(data), p).map((i) => i.key)).toEqual(['a', 'b']);
  });

  it('still applies when at least one selected group is present', () => {
    const p = parseFeedParams(q('sg=350&sem=3&g=gra,1zug-1gr'));
    expect(selectInstances(snap(data), p).map((i) => i.key)).toEqual(['a']);
  });

  it('does not resurrect excluded courses', () => {
    const p = parseFeedParams(q('sg=350&sem=3&g=1zug-1gr&x=a'));
    expect(selectInstances(snap(data), p).map((i) => i.key)).toEqual(['b']);
  });
});

describe('canonicalQuery', () => {
  it('normalises equivalent links to one cache key', () => {
    const a = parseFeedParams(q('sg=350&sem=3&g=b,a&x=2,1'));
    const b = parseFeedParams(q('sem=3&sg=350&g=a,b&x=1,2'));
    expect(canonicalQuery(a)).toBe(canonicalQuery(b));
  });

  it('omits everything that is at its default', () => {
    expect(canonicalQuery(parseFeedParams(q('sg=350&sem=3')))).toBe('v=1&sg=350&sem=3');
  });
});
