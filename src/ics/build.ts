import { escapeText, foldAll } from './escape.js';
import { EUROPE_BERLIN_VTIMEZONE } from './vtimezone.js';
import { expandLocation } from './location.js';
import { instanceId } from '../domain/snapshot.js';
import { courseDetailUrl } from '../lsf/urls.js';
import type { Instance } from '../domain/types.js';

export interface CalendarOptions {
  name: string;
  description: string;
  /** Host part of the UID domain; keeps UIDs stable across deployments of the same feed. */
  uidDomain: string;
  /** DTSTAMP for every event: the snapshot time, never the request time. */
  generatedAt: string;
  /** Rendered into the feed when the data is stale; surfaces silently-broken crawls. */
  staleSince?: string;
  refreshHours?: number;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  const t = Number.isNaN(d.getTime()) ? new Date(0) : d;
  return `${t.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

function local(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function line(name: string, value: string): string {
  return `${name}:${escapeText(value)}`;
}

/**
 * Renders appointments as fully materialized VEVENTs.
 *
 * No RRULE: with per-day lecture-free suppression, Block events, biweekly rhythms and
 * individual cancellations, every series would need a pile of `EXDATE;TZID=` entries, and that
 * is exactly the corner where Outlook, Google and Apple disagree. A semester is ~300 events,
 * which is nothing.
 */
export function buildCalendar(instances: readonly Instance[], opts: CalendarOptions): string {
  const dtstamp = stamp(opts.generatedAt);
  const refresh = `PT${opts.refreshHours ?? 6}H`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//sfuehr//htw-stundenplan-ics//DE',
    'CALSCALE:GREGORIAN',
    // No METHOD: this is a published feed, not an invitation. METHOD:PUBLISH nudges Outlook
    // toward invite semantics and makes it prompt the user.
    line('X-WR-CALNAME', opts.name),
    line('X-WR-CALDESC', opts.description),
    'X-WR-TIMEZONE:Europe/Berlin',
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
    ...EUROPE_BERLIN_VTIMEZONE,
  ];

  if (opts.staleSince !== undefined) {
    lines.push(...staleWarningEvent(opts.staleSince, dtstamp, opts.uidDomain));
  }

  for (const i of instances) {
    const uid = `${instanceId(i)}@${opts.uidDomain}`;
    const cancelled = i.status === 'cancelled';
    const summary = cancelled ? `❌ Fällt aus: ${i.title}` : i.title;

    const description: string[] = [];
    if (i.art !== '') description.push(i.art);
    if (i.group !== '') description.push(`Gruppe: ${i.group}`);
    if (i.room !== '') description.push(`Raum: ${i.room}`);
    if (cancelled) description.push('Diese Veranstaltung fällt aus.');
    description.push(`Quelle: ${courseDetailUrl(i.publishId)}`);
    description.push(`Stand: ${new Date(opts.generatedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Berlin:${local(i.date, i.start)}`,
      `DTEND;TZID=Europe/Berlin:${local(i.date, i.end)}`,
      line('SUMMARY', summary),
      line('DESCRIPTION', description.join('\n')),
      `SEQUENCE:${i.seq}`,
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      `TRANSP:${cancelled ? 'TRANSPARENT' : 'OPAQUE'}`,
      line('URL', courseDetailUrl(i.publishId)),
      line('CATEGORIES', 'HTW Berlin'),
    );
    const location = expandLocation(i.room);
    // An empty LOCATION property is worse than none: some clients render an empty map pin.
    if (location !== '') lines.push(line('LOCATION', location));
    if (i.changedAt !== '') lines.push(`LAST-MODIFIED:${stamp(i.changedAt)}`, `CREATED:${stamp(i.changedAt)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${foldAll(lines)}\r\n`;
}

/**
 * An all-day event announcing that the feed has gone stale.
 *
 * If a crawl silently stops working, a student would otherwise never notice.
 * They would just quietly miss a room change. Better to say so in the calendar itself.
 */
function staleWarningEvent(since: string, dtstamp: string, domain: string): string[] {
  const day = since.slice(0, 10).replace(/-/g, '');
  const next = new Date(`${since.slice(0, 10)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return [
    'BEGIN:VEVENT',
    `UID:stale-${day}@${domain}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
    line('SUMMARY', '⚠️ HTW-Stundenplan-Feed veraltet'),
    line(
      'DESCRIPTION',
      `Dieser Kalender konnte seit ${new Date(since).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} nicht mehr aus dem LSF aktualisiert werden.\nDie angezeigten Termine können veraltet sein, bitte im LSF nachsehen.`,
    ),
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}
