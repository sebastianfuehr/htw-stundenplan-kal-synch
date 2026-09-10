/**
 * Token stream -> tables, with rowspan/colspan expanded into a dense grid.
 *
 * Written against LSF's actual output, which violates several things a spec parser assumes:
 *  - `<td>` is frequently left unclosed before the next `<td>` (the legend block does this),
 *  - event cells contain *nested* tables, sometimes several siblings in one cell,
 *  - `<tr>` may be left unclosed before the next `<tr>`.
 * Nested tables are kept as raw tokens on the cell and parsed on demand by recursing, so the
 * outer walk never has to reason about them.
 */

import { normalizeText, type Attrs, type Token } from './lexer.js';

export interface Cell {
  tag: 'td' | 'th';
  attrs: Attrs;
  tokens: Token[];
  rowSpan: number;
  colSpan: number;
}

export interface Row {
  attrs: Attrs;
  cells: Cell[];
}

export interface Table {
  attrs: Attrs;
  rows: Row[];
}

function span(raw: string | undefined): number {
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  // LSF emits rowspan="0" nowhere, but a malformed value must not collapse the grid.
  return Number.isFinite(n) && n >= 1 && n <= 200 ? n : 1;
}

/** Parses the tables at the *top level* of `tokens`. Nested tables stay inside their cell. */
export function parseTables(tokens: Iterable<Token>): Table[] {
  const tables: Table[] = [];
  let table: Table | null = null;
  let row: Row | null = null;
  let cell: Cell | null = null;
  /** How many `<table>` are open *inside* the current cell. */
  let nested = 0;

  const endCell = () => {
    cell = null;
    nested = 0;
  };
  const endRow = () => {
    endCell();
    row = null;
  };
  const endTable = () => {
    endRow();
    table = null;
  };

  for (const tok of tokens) {
    // Inside a nested table: everything is opaque cell content.
    if (cell !== null && nested > 0) {
      if (tok.kind === 'open' && tok.name === 'table' && !tok.selfClosing) nested++;
      else if (tok.kind === 'close' && tok.name === 'table') nested--;
      cell.tokens.push(tok);
      continue;
    }

    if (tok.kind === 'open') {
      switch (tok.name) {
        case 'table':
          if (cell !== null) {
            nested = 1;
            cell.tokens.push(tok);
          } else {
            // A `<table>` while another is open without an intervening cell: LSF never does
            // this, but treating it as a sibling is the safe reading.
            if (table !== null) tables.push(table);
            table = { attrs: tok.attrs, rows: [] };
            row = null;
          }
          continue;
        case 'tr':
          if (table === null) continue;
          endRow();
          row = { attrs: tok.attrs, cells: [] };
          table.rows.push(row);
          continue;
        case 'td':
        case 'th': {
          if (table === null) continue;
          endCell();
          if (row === null) {
            // `<td>` without an enclosing `<tr>`.
            row = { attrs: {}, cells: [] };
            table.rows.push(row);
          }
          cell = {
            tag: tok.name,
            attrs: tok.attrs,
            tokens: [],
            rowSpan: span(tok.attrs['rowspan']),
            colSpan: span(tok.attrs['colspan']),
          };
          row.cells.push(cell);
          continue;
        }
        default:
          if (cell !== null) cell.tokens.push(tok);
          continue;
      }
    }

    if (tok.kind === 'close') {
      switch (tok.name) {
        case 'table':
          if (table !== null) {
            tables.push(table);
            endTable();
          }
          continue;
        case 'tr':
          endRow();
          continue;
        case 'td':
        case 'th':
          endCell();
          continue;
        default:
          if (cell !== null) cell.tokens.push(tok);
          continue;
      }
    }

    if (cell !== null) cell.tokens.push(tok);
  }

  if (table !== null) tables.push(table);
  return tables;
}

/** Concatenated, whitespace-normalized text of a cell (nested tables included). */
export function cellText(cell: Cell): string {
  let out = '';
  for (const t of cell.tokens) {
    if (t.kind === 'text') out += t.text;
    // Block-ish boundaries must not glue words together: `…18:00</td><td>Einzelt.` .
    else if (t.kind === 'open' && (t.name === 'br' || t.name === 'td' || t.name === 'tr' || t.name === 'div' || t.name === 'p')) out += ' ';
  }
  return normalizeText(out);
}

/** All `<a href>` targets inside a cell, in document order. */
export function cellLinks(cell: Cell): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  let open: { href: string; text: string } | null = null;
  for (const t of cell.tokens) {
    if (t.kind === 'open' && t.name === 'a') {
      open = { href: t.attrs['href'] ?? '', text: '' };
    } else if (t.kind === 'close' && t.name === 'a') {
      if (open !== null) {
        open.text = normalizeText(open.text);
        out.push(open);
        open = null;
      }
    } else if (open !== null && t.kind === 'text') {
      open.text += t.text;
    }
  }
  return out;
}

/**
 * Expands rowspan/colspan into a dense `rows x cols` matrix. A spanned-over slot holds a
 * reference to the same `Cell` object, so identity comparison detects continuation slots.
 */
export function toGrid(table: Table): (Cell | null)[][] {
  const grid: (Cell | null)[][] = [];
  /** Pending vertical spans: column -> { cell, remaining }. */
  const carry = new Map<number, { cell: Cell; remaining: number }>();

  for (const row of table.rows) {
    const out: (Cell | null)[] = [];
    let col = 0;
    const place = (c: Cell | null) => {
      out[col] = c;
      col++;
    };
    // Consume carried spans before the row's own cells claim columns.
    const takeCarry = () => {
      for (;;) {
        const hit = carry.get(col);
        if (hit === undefined) break;
        place(hit.cell);
        hit.remaining--;
        if (hit.remaining <= 0) carry.delete(col - 1);
      }
    };

    takeCarry();
    for (const cell of row.cells) {
      for (let k = 0; k < cell.colSpan; k++) {
        const startCol = col;
        place(cell);
        if (cell.rowSpan > 1) carry.set(startCol, { cell, remaining: cell.rowSpan - 1 });
        takeCarry();
      }
    }
    // Trailing carries in columns past this row's own cells.
    for (;;) {
      const before = col;
      takeCarry();
      if (col === before) break;
    }
    grid.push(out);
  }
  return grid;
}

/**
 * Returns the tokens strictly inside the element opening at `start`, plus the index just past
 * its closing tag. Tolerates a missing close tag by running to the end of the array.
 */
export function sliceElement(
  tokens: Token[],
  start: number,
  name: string,
): { inner: Token[]; next: number } {
  const open = tokens[start];
  if (open === undefined || open.kind !== 'open' || open.name !== name) {
    return { inner: [], next: start + 1 };
  }
  if (open.selfClosing) return { inner: [], next: start + 1 };
  let depth = 1;
  for (let i = start + 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === 'open' && t.name === name && !t.selfClosing) depth++;
    else if (t.kind === 'close' && t.name === name) {
      depth--;
      if (depth === 0) return { inner: tokens.slice(start + 1, i), next: i + 1 };
    }
  }
  return { inner: tokens.slice(start + 1), next: tokens.length };
}

/** Concatenated, normalized text of a token range. */
export function tokensText(tokens: Token[]): string {
  let out = '';
  for (const t of tokens) {
    if (t.kind === 'text') out += t.text;
    else if (t.kind === 'open' && (t.name === 'br' || t.name === 'div' || t.name === 'p' || t.name === 'td' || t.name === 'tr')) out += ' ';
  }
  return normalizeText(out);
}

/** All anchors in a token range. */
export function tokensLinks(tokens: Token[]): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  let open: { href: string; text: string } | null = null;
  for (const t of tokens) {
    if (t.kind === 'open' && t.name === 'a') open = { href: t.attrs['href'] ?? '', text: '' };
    else if (t.kind === 'close' && t.name === 'a' && open !== null) {
      open.text = normalizeText(open.text);
      out.push(open);
      open = null;
    } else if (open !== null && t.kind === 'text') open.text += t.text;
  }
  return out;
}
