import { describe, expect, it } from 'vitest';
import { courseKey, groupMatches, groupSlug, shortHash } from '../src/domain/key.js';

describe('groupSlug', () => {
  it('handles all three naming conventions LSF uses, sometimes within one Studiengang', () => {
    expect(groupSlug('1. Zug, 2. Gruppe')).toBe('1zug-2gr');
    expect(groupSlug('1. Zug, 1. Gruppe')).toBe('1zug-1gr');
    expect(groupSlug('2. Zug')).toBe('2zug');
    expect(groupSlug('Gruppe A')).toBe('gra');
    expect(groupSlug('Gruppe D')).toBe('grd');
  });

  it('extracts the group marker out of surrounding free text', () => {
    expect(groupSlug('Studio Game Design 1. Zug')).toBe('1zug');
  });

  it('treats a heading with no group marker as applying to everyone', () => {
    // `Termin` is what LSF prints for an un-grouped event; it appears in Game Design.
    expect(groupSlug('Termin')).toBe('');
    expect(groupSlug('')).toBe('');
  });

  it('is order-independent, so the same audience always yields the same slug', () => {
    expect(groupSlug('2. Gruppe, 1. Zug')).toBe(groupSlug('1. Zug, 2. Gruppe'));
  });
});

describe('groupMatches', () => {
  const selected = ['1zug-1gr'];

  it('matches the exact group', () => {
    expect(groupMatches('1zug-1gr', selected)).toBe(true);
  });

  it('includes the Zug-wide lecture for a student in one of its groups', () => {
    expect(groupMatches('1zug', selected)).toBe(true);
  });

  it('excludes a sibling group', () => {
    expect(groupMatches('1zug-2gr', selected)).toBe(false);
    expect(groupMatches('2zug', selected)).toBe(false);
  });

  it('includes un-grouped events', () => {
    expect(groupMatches('', selected)).toBe(true);
  });

  it('includes everything when nothing was selected', () => {
    expect(groupMatches('2zug', [])).toBe(true);
  });

  it('supports selecting several groups at once', () => {
    expect(groupMatches('gra', ['1zug-1gr', 'gra'])).toBe(true);
  });
});

describe('courseKey', () => {
  it('prefers the Veranstaltungsnummer, which survives semester rollover', () => {
    expect(courseKey('6241331', 'B10 Grundlehre')).toBe('6241331');
  });

  it('falls back to a title hash when there is no number', () => {
    const k = courseKey('', 'B10 Grundlehre Spieltechnik 3 (StA)');
    expect(k).toMatch(/^t[0-9a-z]{1,6}$/);
    expect(k).toBe(courseKey('', 'B10 Grundlehre Spieltechnik 3 (StA)'));
    expect(k).not.toBe(courseKey('', 'Etwas anderes'));
  });

  it('hashes stably', () => {
    expect(shortHash('abc')).toBe(shortHash('abc'));
  });
});
