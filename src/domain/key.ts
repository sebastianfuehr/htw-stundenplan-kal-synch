/** Stable, URL-safe identifiers for courses and groups. */

const UMLAUTS: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', é: 'e', è: 'e', á: 'a', à: 'a', ç: 'c',
};

function fold(s: string): string {
  return s.toLowerCase().replace(/[äöüßéèáàç]/g, (c) => UMLAUTS[c] ?? c);
}

/** FNV-1a, base36. Only needs to be stable and collision-unlikely, not cryptographic. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(0, 6);
}

/**
 * Slug for a group heading.
 *
 * LSF headings mix three conventions and often carry free text around the part that actually
 * restricts the audience (`Studio Game Design 1. Zug`). We therefore *extract* the group
 * markers rather than slugifying the whole string, and a heading with no marker at all
 * (`Termin`, which LSF prints for un-grouped events) yields the empty slug, meaning
 * "applies to everyone".
 *
 *   `1. Zug, 2. Gruppe`          -> `1zug-2gr`
 *   `1. Zug`                     -> `1zug`
 *   `Gruppe A`                   -> `gra`
 *   `Studio Game Design 1. Zug`  -> `1zug`
 *   `Termin`                     -> `` (matches every selection)
 */
export function groupSlug(heading: string): string {
  const t = fold(heading);
  const zuege = new Set<string>();
  const numbered = new Set<string>();
  const lettered = new Set<string>();

  for (const m of t.matchAll(/(\d+)\s*\.?\s*zug/g)) zuege.add(`${Number(m[1])}zug`);
  for (const m of t.matchAll(/(\d+)\s*\.?\s*gruppe/g)) numbered.add(`${Number(m[1])}gr`);
  for (const m of t.matchAll(/gruppe\s+([a-z])(?![a-z])/g)) lettered.add(`gr${m[1]}`);

  const parts = [
    ...[...zuege].sort(),
    ...[...numbered].sort(),
    ...[...lettered].sort(),
  ];
  return parts.join('-');
}

/** The parts of a group slug, as a set, for subset matching. */
export function groupParts(slug: string): Set<string> {
  return new Set(slug.split('-').filter((p) => p.length > 0));
}

/**
 * Does an instance's group heading belong to a student who selected `selected`?
 *
 * True when the instance heading is exactly one of the selections, when it carries no group
 * information at all (a lecture for everyone), or when its parts are a subset of a selection.
 * That last rule is what makes a `1. Zug`-wide lecture appear for a `1. Zug, 2. Gruppe` student.
 */
export function groupMatches(instanceSlug: string, selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  if (instanceSlug.length === 0) return true;
  if (selected.includes(instanceSlug)) return true;
  const parts = groupParts(instanceSlug);
  return selected.some((sel) => {
    const selParts = groupParts(sel);
    for (const p of parts) if (!selParts.has(p)) return false;
    return true;
  });
}

/** Selection key for a course: the Veranstaltungsnummer, or a hash of the title as fallback. */
export function courseKey(vnr: string, title: string): string {
  const clean = vnr.replace(/[^A-Za-z0-9]/g, '');
  return clean.length > 0 ? clean : `t${shortHash(fold(title).replace(/\s+/g, ' ').trim())}`;
}
