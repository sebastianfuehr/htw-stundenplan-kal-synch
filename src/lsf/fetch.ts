/**
 * Polite, defensive HTTP client for LSF.
 *
 * LSF is a university system we are a guest on: requests are sequential, identify themselves,
 * and give up quickly rather than piling on when the server is struggling.
 */

const PROJECT_URL = 'https://github.com/sfuehr/htw-stundenplan-kal-synch';

/**
 * Identifies the crawler to the university, with a contact address for whoever runs *this*
 * instance. Without a configured operator the address is omitted rather than pointing at
 * someone who has nothing to do with these requests.
 */
export function userAgent(contact?: string): string {
  const mail = (contact ?? '').trim();
  return mail === ''
    ? `HTW-Stundenplan-ICS/1.0 (+${PROJECT_URL})`
    : `HTW-Stundenplan-ICS/1.0 (+${PROJECT_URL}; ${mail})`;
}

export class LsfFetchError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'LsfFetchError';
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  /** Contact address for the User-Agent; comes from the operator configuration. */
  contact?: string;
}

export async function fetchLsf(url: string, opts: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 12_000, retries = 1, contact } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': userAgent(contact),
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'de-DE,de;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) throw new LsfFetchError(`LSF antwortete mit ${res.status}`, res.status);

      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('html')) throw new LsfFetchError(`unerwarteter Content-Type: ${type}`);

      // LSF serves UTF-8 today, but its anchors still claim ISO-8859-1; honour whatever the
      // response header says rather than assuming.
      const charset = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase() ?? 'utf-8';
      if (charset === 'utf-8' || charset === 'utf8') return await res.text();
      const buf = await res.arrayBuffer();
      return new TextDecoder(charset, { fatal: false, ignoreBOM: false }).decode(buf);
    } catch (err) {
      lastError = err;
      // A 4xx will not get better on a retry; anything else might.
      if (err instanceof LsfFetchError && err.status !== undefined && err.status < 500) break;
    }
  }
  throw lastError instanceof Error ? lastError : new LsfFetchError(String(lastError));
}
