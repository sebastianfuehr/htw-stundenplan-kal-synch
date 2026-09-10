/**
 * Inline VTIMEZONE for Europe/Berlin.
 *
 * LSF times are wall-clock times. Converting them to UTC at build time would bake in whichever
 * DST offset applied when the feed was generated, so appointments would shift by an hour after
 * the changeover. Emitting `TZID=Europe/Berlin` with the rules attached keeps them correct in
 * every client, including those that do not ship a timezone database.
 */
export const EUROPE_BERLIN_VTIMEZONE: readonly string[] = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'X-LIC-LOCATION:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];
