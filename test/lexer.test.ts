import { describe, expect, it } from 'vitest';
import { decodeEntities, normalizeText, tokenize } from '../src/lsf/html/lexer.js';
import { fixture } from './helpers.js';

const toks = (html: string) => [...tokenize(html)];

describe('decodeEntities', () => {
  it('decodes the entities LSF actually emits', () => {
    expect(decodeEntities('Pr&uuml;fungsOrdnung')).toBe('PrüfungsOrdnung');
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
    expect(decodeEntities('&#8211;&#x2013;')).toBe('––');
    expect(decodeEntities('R&amp;D')).toBe('R&D');
  });

  it('leaves unknown entities alone rather than mangling them', () => {
    expect(decodeEntities('&bogus;')).toBe('&bogus;');
  });
});

describe('normalizeText', () => {
  it('un-glues words joined by a non-breaking space', () => {
    // Verbatim from the LSF grid markup.
    expect(normalizeText('05.10.2026&nbsp;bis')).toBe('05.10.2026 bis');
  });

  it('collapses the double spaces LSF leaves inside titles', () => {
    expect(normalizeText('Praktische Grundlagen der Informatik  (SL)'))
      .toBe('Praktische Grundlagen der Informatik (SL)');
  });
});

describe('tokenize', () => {
  it('parses attributes regardless of their order', () => {
    const a = toks('<td class="plan2" rowspan="6">x</td>')[0];
    const b = toks('<td rowspan="6" class="plan2">x</td>')[0];
    expect(a).toMatchObject({ kind: 'open', name: 'td', attrs: { class: 'plan2', rowspan: '6' } });
    expect(b).toMatchObject({ kind: 'open', name: 'td', attrs: { class: 'plan2', rowspan: '6' } });
  });

  it('handles unquoted and valueless attributes', () => {
    const t = toks('<td valign=top nowrap align="right">')[0];
    expect(t).toMatchObject({ attrs: { valign: 'top', nowrap: '', align: 'right' } });
  });

  it('skips comments, which LSF uses to disable links', () => {
    const t = toks('a<!-- <a href="x">PDF</a> -->b');
    expect(t.filter((x) => x.kind === 'open')).toHaveLength(0);
    expect(t.map((x) => (x.kind === 'text' ? x.text : '')).join('')).toBe('ab');
  });

  it('treats script bodies as opaque', () => {
    const t = toks('<script>if (a<b) {}</script><td>');
    expect(t.filter((x) => x.kind === 'open' && x.name === 'td')).toHaveLength(1);
    expect(t.some((x) => x.kind === 'text' && x.text.includes('if'))).toBe(false);
  });

  it('does not choke on a bare < in text', () => {
    expect(toks('5 < 6').filter((x) => x.kind === 'open')).toHaveLength(0);
  });

  it('stays within the CPU budget one document is allowed', () => {
    const html = fixture('grid-345-3-42_2026.html');
    // Warm up: the first pass is JIT-dominated and says nothing about steady state.
    for (let i = 0; i < 10; i++) tokenize(html);

    const t0 = performance.now();
    const runs = 20;
    let n = 0;
    for (let i = 0; i < runs; i++) n = tokenize(html).length;
    const ms = (performance.now() - t0) / runs;

    expect(n).toBeGreaterThan(1000);
    // A 110 KB grid costs ~2.5 ms warm. The crawler gives every document its own invocation
    // precisely because a handful of these would exceed the free plan's 10 ms.
    expect(ms).toBeLessThan(6);
  });
});
