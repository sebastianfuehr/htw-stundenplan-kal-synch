/** RFC 5545 text escaping and line folding. */

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const enc = new TextEncoder();

/**
 * Folds a content line to 75 octets.
 *
 * The limit is octets, not characters. German umlauts are two bytes in UTF-8, so folding on
 * character counts would produce over-long lines, and splitting mid-sequence would corrupt them.
 */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;

  for (const ch of line) {
    const size = enc.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
      limit = 74; // continuation lines start with a space, which counts toward the 75.
    }
    current += ch;
    bytes += size;
  }
  if (current !== '') out.push(current);
  return out.join('\r\n ');
}

/** Joins content lines with CRLF, folding each. */
export function foldAll(lines: readonly string[]): string {
  return lines.map(foldLine).join('\r\n');
}
