import { normalizeText, tokenize } from './html/lexer.js';
import type { StudyProgram } from '../domain/types.js';

/**
 * Parses the Studiengang picker. Each entry is an anchor carrying `k_abstgv.abstgvnr`, with
 * link text like `Game Design (B), Abschluss 84, PrüfungsOrdnung 20222 (84624)`.
 */
export function parseCatalog(html: string): StudyProgram[] {
  const out: StudyProgram[] = [];
  const seen = new Set<string>();
  let href: string | null = null;
  let text = '';

  for (const tok of tokenize(html)) {
    if (tok.kind === 'open' && tok.name === 'a') {
      href = tok.attrs['href'] ?? '';
      text = '';
    } else if (tok.kind === 'text' && href !== null) {
      text += tok.text;
    } else if (tok.kind === 'close' && tok.name === 'a' && href !== null) {
      const m = /[?&]k_abstgv\.abstgvnr=(\d+)/.exec(href);
      const label = normalizeText(text);
      // The breadcrumb link back to the search form carries no id and must not be an entry.
      if (m !== null && label.length > 0 && !seen.has(m[1]!)) {
        seen.add(m[1]!);
        out.push({ id: m[1]!, label, ...splitLabel(label) });
      }
      href = null;
      text = '';
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function splitLabel(label: string): { name: string; degree?: string; po?: string } {
  // `Game Design (B), Abschluss 84, PrüfungsOrdnung 20222 (84624)`
  const name = label.split(/,\s*Abschluss\s/)[0]!.trim();
  const degree = /,\s*Abschluss\s+(\d+)/.exec(label)?.[1];
  const po = /Pr[üu]fungsOrdnung\s+(\d+)/.exec(label)?.[1];
  return { name: name.length > 0 ? name : label, degree, po };
}
