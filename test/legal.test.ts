import { describe, expect, it } from 'vitest';
import { readOperator } from '../src/env.js';
import { renderDatenschutz, renderImpressum } from '../src/ui/legal.js';
import { userAgent } from '../src/lsf/fetch.js';
import type { Env } from '../src/env.js';

const full = {
  OPERATOR_NAME: 'Erika Mustermann',
  OPERATOR_STREET: 'Wilhelminenhofstraße 75A',
  OPERATOR_CITY: '12459 Berlin',
  OPERATOR_EMAIL: 'kontakt@example.org',
} as unknown as Env;

describe('readOperator', () => {
  it('reads a complete configuration', () => {
    const { operator, missing } = readOperator(full);
    expect(missing).toEqual([]);
    expect(operator).toEqual({
      name: 'Erika Mustermann',
      street: 'Wilhelminenhofstraße 75A',
      city: '12459 Berlin',
      email: 'kontakt@example.org',
    });
  });

  it('treats a partial configuration as unconfigured, and names the gaps', () => {
    // Half an Impressum is worth no more than none, so it must not render as if it were valid.
    const { operator, missing } = readOperator({ OPERATOR_NAME: 'Erika Mustermann' } as unknown as Env);
    expect(operator).toBeNull();
    expect(missing).toEqual(['OPERATOR_STREET', 'OPERATOR_CITY', 'OPERATOR_EMAIL']);
  });

  it('does not accept whitespace as an answer', () => {
    expect(readOperator({ ...full, OPERATOR_CITY: '   ' } as unknown as Env).operator).toBeNull();
  });
});

describe('legal pages', () => {
  const configured = readOperator(full);
  const unconfigured = readOperator({} as unknown as Env);

  for (const [name, render] of [['Impressum', renderImpressum], ['Datenschutz', renderDatenschutz]] as const) {
    it(`${name}: shows the operator once configured`, () => {
      const html = render(configured.operator, configured.missing);
      expect(html).toContain('Erika Mustermann');
      expect(html).toContain('kontakt@example.org');
      expect(html).not.toContain('nicht für den öffentlichen Betrieb konfiguriert');
    });

    it(`${name}: says so when the operator is missing, and names the secrets`, () => {
      const html = render(unconfigured.operator, unconfigured.missing);
      expect(html).toContain('nicht für den öffentlichen Betrieb konfiguriert');
      expect(html).toContain('OPERATOR_NAME');
      expect(html).toContain('OPERATOR_EMAIL');
      expect(html).toContain('Nicht konfiguriert');
    });

    it(`${name}: carries no operator identity of its own`, () => {
      // A fork must not publish the original author's address.
      const html = render(unconfigured.operator, unconfigured.missing);
      expect(html).not.toMatch(/@sebastianfuehr\.com/);
    });

    it(`${name}: escapes the configured values`, () => {
      const html = render({ ...configured.operator!, name: 'A <script>x</script> B' }, []);
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>x</script>');
    });
  }
});

describe('userAgent', () => {
  it('carries the operator contact when configured', () => {
    expect(userAgent('kontakt@example.org')).toBe(
      'HTW-Stundenplan-ICS/1.0 (+https://github.com/sfuehr/htw-stundenplan-kal-synch; kontakt@example.org)',
    );
  });

  it('omits the contact rather than naming an unrelated person', () => {
    expect(userAgent()).toBe('HTW-Stundenplan-ICS/1.0 (+https://github.com/sfuehr/htw-stundenplan-kal-synch)');
    expect(userAgent('  ')).not.toContain(';');
  });
});
