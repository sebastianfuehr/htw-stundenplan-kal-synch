import { describe, expect, it } from 'vitest';
import { parseCatalog } from '../src/lsf/parseCatalog.js';
import { fixture } from './helpers.js';

describe('parseCatalog', () => {
  const list = parseCatalog(fixture('catalog.html'));

  it('finds every Studiengang', () => {
    expect(list).toHaveLength(94);
  });

  it('extracts the ids this project was built against', () => {
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get('350')).toMatchObject({ name: 'Game Design (B)', degree: '84', po: '20222' });
    expect(byId.get('346')?.name).toBe('System Design/Game Design (M)');
    expect(byId.get('345')?.name).toBe('Angewandte Informatik (B)');
  });

  it('decodes umlauts', () => {
    expect(list.some((p) => p.label.includes('PrüfungsOrdnung'))).toBe(true);
    expect(list.some((p) => p.label.includes('&uuml;'))).toBe(false);
  });

  it('emits no duplicates and no id-less breadcrumb entries', () => {
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    expect(list.every((p) => /^\d+$/.test(p.id) && p.name.length > 2)).toBe(true);
  });
});
