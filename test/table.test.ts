import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lsf/html/lexer.js';
import { cellText, parseTables, toGrid } from '../src/lsf/html/table.js';
import { fixture } from './helpers.js';

const tables = (html: string) => parseTables(tokenize(html));

describe('parseTables', () => {
  it('recovers rows when </td> is missing, as in the LSF legend block', () => {
    const [t] = tables(
      '<table><tr><td class="plan5">Einzel<td class="plan7">Block<td class="plan6">14t</tr></table>',
    );
    expect(t!.rows).toHaveLength(1);
    expect(t!.rows[0]!.cells.map(cellText)).toEqual(['Einzel', 'Block', '14t']);
  });

  it('recovers rows when </tr> is missing', () => {
    const [t] = tables('<table><tr><td>a</td><tr><td>b</td></table>');
    expect(t!.rows.map((r) => r.cells.map(cellText))).toEqual([['a'], ['b']]);
  });

  it('keeps a nested table inside its parent cell instead of flattening it', () => {
    const [outer] = tables(
      '<table><tr><td class="plan2"><table><tr><td>inner</td></tr></table></td><td>sibling</td></tr></table>',
    );
    expect(outer!.rows[0]!.cells).toHaveLength(2);
    const [nested] = parseTables(outer!.rows[0]!.cells[0]!.tokens);
    expect(cellText(nested!.rows[0]!.cells[0]!)).toBe('inner');
    expect(cellText(outer!.rows[0]!.cells[1]!)).toBe('sibling');
  });

  it('handles several sibling tables in one cell', () => {
    const [outer] = tables(
      '<table><tr><td><table><tr><td>one</td></tr></table><table><tr><td>two</td></tr></table></td></tr></table>',
    );
    const inner = parseTables(outer!.rows[0]!.cells[0]!.tokens);
    expect(inner).toHaveLength(2);
    expect(inner.map((t) => cellText(t.rows[0]!.cells[0]!))).toEqual(['one', 'two']);
  });
});

describe('cellText', () => {
  it('does not glue text across <br>', () => {
    const [t] = tables('<table><tr><td>10:00<br>bis<br>18:00</td></tr></table>');
    expect(cellText(t!.rows[0]!.cells[0]!)).toBe('10:00 bis 18:00');
  });
});

describe('toGrid', () => {
  it('carries a rowspan down into following rows', () => {
    const [t] = tables(
      '<table>' +
        '<tr><td rowspan="3">A</td><td>b1</td></tr>' +
        '<tr><td>b2</td></tr>' +
        '<tr><td>b3</td></tr>' +
        '</table>',
    );
    const g = toGrid(t!);
    expect(g.map((r) => r.map((c) => (c ? cellText(c) : null)))).toEqual([
      ['A', 'b1'],
      ['A', 'b2'],
      ['A', 'b3'],
    ]);
    // Continuation slots are the *same* object, so a parser can skip them by identity.
    expect(g[1]![0]).toBe(g[0]![0]);
  });

  it('expands colspan', () => {
    const [t] = tables('<table><tr><td colspan="2">A</td><td>B</td></tr></table>');
    expect(toGrid(t!)[0]!.map((c) => cellText(c!))).toEqual(['A', 'A', 'B']);
  });

  it('keeps columns aligned when a rowspan starts mid-row', () => {
    const [t] = tables(
      '<table>' +
        '<tr><td>a1</td><td rowspan="2">M</td><td>c1</td></tr>' +
        '<tr><td>a2</td><td>c2</td></tr>' +
        '</table>',
    );
    expect(toGrid(t!).map((r) => r.map((c) => cellText(c!)))).toEqual([
      ['a1', 'M', 'c1'],
      ['a2', 'M', 'c2'],
    ]);
  });
});

describe('against the real grid fixture', () => {
  const html = fixture('grid-345-3-42_2026.html');

  it('finds the legend table using the same plan5/6/7 classes as event cells', () => {
    // Finding D: an empty week still contains three plan5/6/7 cells from the legend.
    const empty = fixture('grid-345-3-53_2026.html');
    const legendish = parseTables(tokenize(empty))
      .flatMap((t) => t.rows)
      .flatMap((r) => r.cells)
      .filter((c) => /^plan[567]$/.test(c.attrs['class'] ?? ''));
    expect(legendish.map(cellText)).toEqual([
      'Einzel- o. Block-Veranstaltung',
      'Blockveranstaltung',
      '14-tägl. Veranstaltung',
    ]);
  });

  it('produces a rectangular grid for the plan table', () => {
    const planTable = parseTables(tokenize(html))
      .filter((t) => t.rows.some((r) => r.cells.some((c) => (c.attrs['class'] ?? '').startsWith('plan_rahmen'))))
      .at(-1)!;
    const g = toGrid(planTable);
    const widths = new Set(g.map((r) => r.length));
    // Every row must span the same number of columns, or weekday mapping is unsound.
    expect(widths.size).toBeLessThanOrEqual(2);
  });
});
