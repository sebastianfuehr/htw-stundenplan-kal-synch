/**
 * Every LSF query parameter lives here. When LSF changes, this is the first file to look at.
 * All endpoints are public: no login, no session, no cookies.
 */

export const LSF_BASE = 'https://lsf.htw-berlin.de/qisserver/rds';

/** Full list of Studiengänge (94 entries at the time of writing) in a single request. */
export function catalogUrl(): string {
  return `${LSF_BASE}?${new URLSearchParams({
    state: 'change',
    type: '5',
    moduleParameter: 'abstgvSearch',
    nextdir: 'change',
    next: 'search.vm',
    subdir: 'stg',
    purge: 'n',
    'k_abstgv.dtxt': '',
    search_Studiengang: 'Auswahl',
  })}`;
}

function planParams(sg: string, semFrom: number, semTo: number): URLSearchParams {
  return new URLSearchParams({
    state: 'wplan',
    'k_abstgv.abstgvnr': sg,
    'r_zuordabstgv.semvonint': String(semFrom),
    'r_zuordabstgv.sembisint': String(semTo),
    act: 'stg',
    pool: 'stg',
    'P.vx': 'lang',
    'P.subc': 'plan',
  });
}

/**
 * Semester-wide list view: course catalogue, metadata, group headings and rhythm rules.
 * NOTE: `week=` is ignored here. LSF always renders the *current* semester.
 */
export function listViewUrl(sg: string, semFrom: number, semTo = semFrom): string {
  const p = planParams(sg, semFrom, semTo);
  p.set('show', 'liste');
  return `${LSF_BASE}?${p}`;
}

/** Week grid. Unlike the list view this *does* honour `week`, and it suppresses lecture-free days. */
export function weekGridUrl(sg: string, semFrom: number, semTo: number, week: string): string {
  const p = planParams(sg, semFrom, semTo);
  p.set('show', 'plan');
  p.set('week', week);
  return `${LSF_BASE}?${p}`;
}

/** Per-course detail page (Credits, Sprache, per-date Status/Bemerkung). Not used in v1. */
export function courseDetailUrl(publishId: string): string {
  return `${LSF_BASE}?${new URLSearchParams({
    state: 'verpublish',
    status: 'init',
    vmfile: 'no',
    publishid: publishId,
    moduleCall: 'webInfo',
    publishConfFile: 'webInfo',
    publishSubDir: 'veranstaltung',
  })}`;
}
