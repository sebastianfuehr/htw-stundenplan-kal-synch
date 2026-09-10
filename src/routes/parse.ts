import type { Env } from '../env.js';
import { fetchLsf } from '../lsf/fetch.js';
import { catalogUrl, listViewUrl, weekGridUrl } from '../lsf/urls.js';
import { parseCatalog } from '../lsf/parseCatalog.js';
import { parseListView } from '../lsf/parseListView.js';
import { parseGrid } from '../lsf/parseGrid.js';

/**
 * Internal endpoint: fetch exactly one LSF document, parse it, return compact JSON.
 *
 * This exists purely to spend CPU somewhere else. Parsing one 110 KB week grid costs ~3.5 ms,
 * and the free plan allows 10 ms per invocation, so a crawl that parsed twenty weeks inline
 * would be killed. By having the orchestrator call this endpoint instead, every document gets
 * its own invocation and its own budget, while the orchestrator only ever handles small JSON.
 */
export async function handleParse(url: URL, env: Env): Promise<Response> {
  const contact = (env.OPERATOR_EMAIL ?? '').trim();
  const kind = url.searchParams.get('kind') ?? '';
  const sg = url.searchParams.get('sg') ?? '';
  const sem = Number(url.searchParams.get('sem') ?? '0');

  try {
    if (kind === 'catalog') {
      return json(parseCatalog(await fetchLsf(catalogUrl(), { contact })));
    }
    if (kind === 'list') {
      if (!/^\d+$/.test(sg) || !Number.isInteger(sem)) return bad('sg/sem fehlen');
      return json(parseListView(await fetchLsf(listViewUrl(sg, sem), { contact })));
    }
    if (kind === 'grid') {
      const week = url.searchParams.get('week') ?? '';
      if (!/^\d{1,2}_\d{4}$/.test(week)) return bad('week fehlt');
      return json(parseGrid(await fetchLsf(weekGridUrl(sg, sem, sem, week), { contact }), week));
    }
    return bad(`unbekannter kind: ${kind}`);
  } catch (err) {
    // A rejected week must not look like an empty week, or the crawler would delete real data.
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const bad = (msg: string): Response => json({ error: msg }, 400);
