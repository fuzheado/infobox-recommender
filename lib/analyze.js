// lib/analyze.js — full pipeline for one title (Stages A–C), shared by the
// CLI and the eval harness. Pure function of (api, title) so it behaves
// identically in Node and the future userscript.

import { has } from './api.js';
import { discoverPeers } from './peers.js';
import { runCensus, findBareClusters, INFOBOX } from './census.js';
import { decide } from './decide.js';

const LIST_RE = /^(List|Lists|Timeline|Outline|Index) of/i;

export async function analyze(api, title, { skipExisting = true } = {}) {
  // Resolve: follow redirects, grab QID, exclusion flags, and the article's
  // own templates (stale {{Infobox requested}} tags are common — if it
  // already has an infobox there is nothing to recommend).
  const data = await api.enwiki({
    action: 'query',
    titles: title,
    redirects: 1,
    prop: 'info|pageprops|templates',
    ppprop: 'wikibase_item|disambiguation',
    tllimit: 500,
    tlnamespace: 10,
  });
  const page = data.query.pages[0] ?? { missing: true, title };
  if (page.missing) return { title, verdict: 'excluded', reason: 'page does not exist' };

  const existing = (page.templates ?? [])
    .map((t) => t.title.replace(/^Template:/, ''))
    .filter((n) => INFOBOX(n));

  const base = {
    title: page.title,
    qid: page.pageprops?.wikibase_item ?? null,
    existingInfobox: existing[0] ?? null,
  };

  if (page.ns !== 0) return { ...base, verdict: 'excluded', reason: `namespace ${page.ns}` };
  if (has(page.pageprops, 'disambiguation')) {
    return { ...base, verdict: 'excluded', reason: 'disambiguation page' };
  }
  if (LIST_RE.test(page.title)) return { ...base, verdict: 'excluded', reason: 'list page' };
  if (skipExisting && existing.length) {
    return { ...base, verdict: 'already-has-infobox', template: existing[0] };
  }

  const { peers, peerOrigin, banners, counts } = await discoverPeers({
    api,
    title: page.title,
    qid: base.qid,
  });
  const census = await runCensus({ api, peers, peerOrigin });
  const bareCluster = census.bare.length
    ? await findBareClusters({ api, bareTitles: census.bare })
    : [];
  const result = decide({ title: page.title, page, census, banners, bareCluster });

  return { ...base, ...result, peerCounts: counts };
}
