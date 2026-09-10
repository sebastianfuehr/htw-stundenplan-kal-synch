import { describe, expect, it } from 'vitest';
import ICAL from 'ical.js';
import { buildCalendar } from '../src/ics/build.js';
import { escapeText, foldLine } from '../src/ics/escape.js';
import { expandLocation } from '../src/ics/location.js';
import type { Instance } from '../src/domain/types.js';

const GENERATED = '2026-10-14T06:00:00.000Z';

const inst = (over: Partial<Instance> = {}): Instance => ({
  publishId: '234990', key: '1161231', title: 'B33 Algorithmen und Datenstrukturen (SL)',
  group: '1. Zug', groupSlug: '1zug', date: '2026-10-14', start: '08:00', end: '09:30',
  room: 'WH Gebäude C 445', art: 'Seminaristischer Lehrvortrag', rhythm: 'weekly',
  status: 'ok', seq: 0, changedAt: GENERATED, ...over,
});

const opts = {
  name: 'HTW Stundenplan', description: 'Test', uidDomain: 'htw.example',
  generatedAt: GENERATED,
};

const build = (list: Instance[], extra = {}) => buildCalendar(list, { ...opts, ...extra });

describe('escaping and folding', () => {
  it('escapes the characters RFC 5545 reserves', () => {
    expect(escapeText('a;b,c\\d')).toBe('a\;b\\,c\\\\d');
    expect(escapeText('line1\nline2')).toBe('line1\\nline2');
  });

  it('folds on octets, not characters, so umlauts cannot overflow a line', () => {
    const line = `DESCRIPTION:${'ä'.repeat(60)}`;
    const folded = foldLine(line);
    const enc = new TextEncoder();
    for (const part of folded.split('\r\n')) {
      expect(enc.encode(part).length).toBeLessThanOrEqual(75);
    }
  });

  it('never splits a multi-byte character', () => {
    const folded = foldLine(`SUMMARY:${'ü'.repeat(80)}`);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'ü'.repeat(80)}`);
  });

  it('leaves short lines alone', () => {
    expect(foldLine('UID:abc')).toBe('UID:abc');
  });
});

describe('expandLocation', () => {
  it('turns an LSF room into a geocodable address', () => {
    expect(expandLocation('WH Gebäude C 445'))
      .toBe('Geb. C 445, HTW Berlin (Wilhelminenhof), Wilhelminenhofstraße 75A, 12459 Berlin');
    expect(expandLocation('TA Gebäude A 123')).toContain('Treskowallee');
  });

  it('passes through anything it does not recognise', () => {
    expect(expandLocation('Sporthalle')).toBe('Sporthalle');
  });

  it('returns empty for an unset room', () => {
    expect(expandLocation('')).toBe('');
    expect(expandLocation('   ')).toBe('');
  });
});

describe('buildCalendar', () => {
  it('produces a calendar ical.js can parse back', () => {
    const comp = new ICAL.Component(ICAL.parse(build([inst()])));
    expect(comp.name).toBe('vcalendar');
    expect(comp.getAllSubcomponents('vevent')).toHaveLength(1);
    expect(comp.getFirstPropertyValue('prodid')).toContain('htw-stundenplan-ics');
  });

  it('places the event at the right wall-clock instant, before the DST change', () => {
    const comp = new ICAL.Component(ICAL.parse(build([inst({ date: '2026-10-19' })])));
    const ev = new ICAL.Event(comp.getAllSubcomponents('vevent')[0]!);
    // 19.10.2026 08:00 Berlin is still CEST (+02:00) => 06:00 UTC.
    expect(ev.startDate.toJSDate().toISOString()).toBe('2026-10-19T06:00:00.000Z');
  });

  it('places the event correctly after the DST change', () => {
    const comp = new ICAL.Component(ICAL.parse(build([inst({ date: '2026-10-26' })])));
    const ev = new ICAL.Event(comp.getAllSubcomponents('vevent')[0]!);
    // 26.10.2026 08:00 Berlin is CET (+01:00) => 07:00 UTC. Same wall time, different instant.
    expect(ev.startDate.toJSDate().toISOString()).toBe('2026-10-26T07:00:00.000Z');
  });

  it('ships a VTIMEZONE so clients without a tz database agree', () => {
    expect(build([inst()])).toContain('BEGIN:VTIMEZONE');
    expect(build([inst()])).toContain('TZID:Europe/Berlin');
  });

  it('pins DTSTAMP to the snapshot time, not to now', () => {
    const a = build([inst()]);
    const b = build([inst()]);
    // Byte-identical output is what makes ETags stable and 304s real.
    expect(a).toBe(b);
    expect(a).toContain('DTSTAMP:20261014T060000Z');
  });

  it('uses CRLF line endings throughout', () => {
    const out = build([inst()]);
    expect(out.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
    expect(out.endsWith('\r\n')).toBe(true);
  });

  it('builds a UID that is stable and free of the Studiengang', () => {
    // Excluding the Studiengang lets two feeds dedupe a shared course rather than double-book.
    expect(build([inst()])).toContain('UID:1161231-1zug-20261014-0800@htw.example');
  });

  it('carries SEQUENCE so Outlook re-processes a changed appointment', () => {
    expect(build([inst({ seq: 3 })])).toContain('SEQUENCE:3');
  });

  it('shows a cancelled appointment rather than hiding it', () => {
    const out = build([inst({ status: 'cancelled' })]);
    expect(out).toContain('STATUS:CANCELLED');
    expect(out).toContain('TRANSP:TRANSPARENT');
    // Google often hides STATUS:CANCELLED in subscribed feeds, so say it in the title too.
    expect(out).toMatch(/SUMMARY:❌ Fällt aus/);
  });

  it('expands the room into the LOCATION', () => {
    expect(build([inst()])).toMatch(/LOCATION:Geb. C 445/);
  });

  it('omits LOCATION entirely when no room is published, as for Game Design', () => {
    const out = build([inst({ room: '' })]);
    expect(out).not.toMatch(/^LOCATION:/m);
  });

  it('advertises how often clients should refresh', () => {
    const out = build([inst()]);
    expect(out).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
    expect(out).toContain('X-PUBLISHED-TTL:PT6H');
  });

  it('adds a visible warning event when the feed has gone stale', () => {
    const out = build([inst()], { staleSince: '2026-10-10T06:00:00.000Z' });
    const comp = new ICAL.Component(ICAL.parse(out));
    const events = comp.getAllSubcomponents('vevent');
    expect(events).toHaveLength(2);
    expect(out).toContain('⚠️ HTW-Stundenplan-Feed veraltet');
    expect(out).toContain('DTSTART;VALUE=DATE:20261010');
  });

  it('handles an empty feed without producing invalid output', () => {
    const comp = new ICAL.Component(ICAL.parse(build([])));
    expect(comp.getAllSubcomponents('vevent')).toHaveLength(0);
  });

  it('escapes commas in a title instead of splitting the property', () => {
    const comp = new ICAL.Component(ICAL.parse(build([inst({ title: 'Kurs, mit Komma; und Semikolon' })])));
    const ev = comp.getAllSubcomponents('vevent')[0]!;
    expect(ev.getFirstPropertyValue('summary')).toBe('Kurs, mit Komma; und Semikolon');
  });
});
