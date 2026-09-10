/**
 * Minimal, allocation-frugal HTML tag lexer.
 *
 * LSF's markup is hand-rolled JSP output: unclosed `<td>`, stray `</td>`, attributes in
 * arbitrary order, `&nbsp;` glued to words. We do not need a spec-compliant tree, only
 * a token stream cheap enough to run ~7 times inside a 10 ms Worker invocation.
 * Measured: ~0.3 ms for a 110 KB grid document.
 */

export type Token =
  | { kind: 'open'; name: string; attrs: Attrs; selfClosing: boolean }
  | { kind: 'close'; name: string }
  | { kind: 'text'; text: string };

export type Attrs = Record<string, string>;

/** Tags that never have a closing partner in LSF output. */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', shy: '­', auml: 'ä', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', middot: '·',
  ndash: '–', mdash: '—', bdquo: '„', ldquo: '“', rdquo: '”', hellip: '…',
};

export function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);?/g, (whole, body: string) => {
    if (body.charCodeAt(0) === 35 /* # */) {
      const cp = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    const hit = NAMED_ENTITIES[body];
    return hit === undefined ? whole : hit;
  });
}

/**
 * Collapse LSF whitespace: NBSP counts as a space, runs collapse, ends trim.
 * `05.10.2026&nbsp;bis` therefore becomes `05.10.2026 bis` rather than one glued word.
 */
export function normalizeText(s: string): string {
  return decodeEntities(s).replace(/[\s ­]+/g, ' ').trim();
}

function parseAttrs(raw: string): Attrs {
  const attrs: Attrs = {};
  // name ( = ("v" | 'v' | bare) )?  Order-independent, which is why we do not regex
  // for `class="planN" rowspan="M"` directly: LSF emits both orders.
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>=`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[m[1]!.toLowerCase()] = decodeEntities(value);
  }
  return attrs;
}

/**
 * Tokenizes a document into a flat array.
 *
 * Returns an array rather than a generator on purpose: an earlier generator version created a
 * nested generator per tag for the text flush, which cost ~3 ms on a 110 KB grid, a third of
 * the entire Workers free-plan CPU budget for one document. Straight-line array building is
 * roughly 20x faster and the arrays involved are small (~2k tokens per grid).
 */
export function tokenize(html: string): Token[] {
  const out: Token[] = [];
  const len = html.length;
  let i = 0;
  let textStart = 0;

  const flushText = (end: number): void => {
    if (end <= textStart) return;
    // Skip pure-whitespace runs without allocating a slice.
    for (let k = textStart; k < end; k++) {
      const c = html.charCodeAt(k);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) {
        out.push({ kind: 'text', text: html.slice(textStart, end) });
        return;
      }
    }
  };

  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    // Comments and doctype/PI blocks. LSF wraps dead links in comments.
    if (html.charCodeAt(lt + 1) === 33 /* ! */ || html.charCodeAt(lt + 1) === 63 /* ? */) {
      const isComment = html.startsWith('<!--', lt);
      flushText(lt);
      const end = isComment ? html.indexOf('-->', lt + 4) : html.indexOf('>', lt + 2);
      i = end === -1 ? len : end + (isComment ? 3 : 1);
      textStart = i;
      continue;
    }

    const isClose = html.charCodeAt(lt + 1) === 47; /* / */
    const nameStart = isClose ? lt + 2 : lt + 1;
    const first = html.charCodeAt(nameStart);
    const isNameChar =
      (first >= 97 && first <= 122) || (first >= 65 && first <= 90) || (first >= 48 && first <= 57);
    if (!isNameChar) {
      // A bare `<` in text. Leave it in the text run.
      i = lt + 1;
      continue;
    }

    const gt = html.indexOf('>', lt);
    if (gt === -1) break;

    flushText(lt);

    let nameEnd = nameStart;
    while (nameEnd < gt) {
      const c = html.charCodeAt(nameEnd);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 47) break;
      nameEnd++;
    }
    const name = html.slice(nameStart, nameEnd).toLowerCase();

    if (isClose) {
      out.push({ kind: 'close', name });
      i = gt + 1;
      textStart = i;
      continue;
    }

    const rawAttrs = html.slice(nameEnd, gt);
    const trimmed = rawAttrs.trim();
    out.push({
      kind: 'open',
      name,
      attrs: trimmed.length > 0 ? parseAttrs(rawAttrs) : EMPTY_ATTRS,
      selfClosing: trimmed.endsWith('/') || VOID.has(name),
    });

    i = gt + 1;
    textStart = i;

    // <script>/<style> bodies are not markup.
    if (name === 'script' || name === 'style') {
      const close = `</${name}`;
      const at = html.indexOf(close, i);
      const end = at === -1 ? len : html.indexOf('>', at);
      i = end === -1 ? len : end + 1;
      textStart = i;
      out.push({ kind: 'close', name });
    }
  }
  flushText(len);
  return out;
}

const EMPTY_ATTRS: Attrs = Object.freeze({}) as Attrs;
