/**
 * Expands an LSF room string into something a calendar can put on a map.
 *
 * LSF prints `WH Gebäude C 445`, where the prefix is the campus. Left as-is, calendar clients
 * geocode it to nothing useful.
 */
const CAMPUS: Record<string, string> = {
  WH: 'HTW Berlin (Wilhelminenhof), Wilhelminenhofstraße 75A, 12459 Berlin',
  TA: 'HTW Berlin (Treskowallee), Treskowallee 8, 10318 Berlin',
};

export function expandLocation(room: string): string {
  const trimmed = room.trim();
  if (trimmed === '') return '';
  const m = /^(WH|TA)\s+(.*)$/.exec(trimmed);
  if (m === null) return trimmed;
  const place = m[2]!.replace(/^Gebäude\s+/i, 'Geb. ');
  return `${place}, ${CAMPUS[m[1]!]}`;
}
