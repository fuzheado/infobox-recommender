// lib/analyze.js — full pipeline for one title (Stages A–C), shared by the
// CLI and the eval harness. Pure function of (api, title) so it behaves
// identically in Node and the future userscript.

import { has } from './api.js';
import { discoverPeers } from './peers.js';
import { runCensus, findBareClusters, INFOBOX } from './census.js';
import { decide } from './decide.js';

const LIST_RE = /^(List|Lists|Timeline|Outline|Index) of/i;
const noop = () => {};

// REST API summary for the article digest (title, description, lead extract,
// thumbnail) — fetched concurrently with resolution and streamed to the UI
// via the 'digest' stage event so it can be shown while the census runs.
const restSummaryUrl = (title) =>
  `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;

export async function analyze(api, title, { skipExisting = true, log = noop } = {}) {
  log({ stage: 'resolve', label: 'Resolving article' });
  // Resolve (follow redirects, QID, exclusion flags, own templates — stale
  // {{Infobox requested}} tags are common) + REST summary, concurrently.
  const [data, summary] = await Promise.all([
    api.enwiki({
      action: 'query',
      titles: title,
      redirects: 1,
      prop: 'info|pageprops|templates',
      ppprop: 'wikibase_item|disambiguation',
      tllimit: 500,
      tlnamespace: 10,
    }),
    api.getJson(restSummaryUrl(title)).catch(() => null), // 404/network -> no digest
  ]);
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

  // Article digest — available immediately, before any census work.
  const digest = {
    title: page.title,
    qid: base.qid,
    shortdesc: page.pageprops?.['wikibase-shortdesc'] ?? summary?.description ?? null,
    description: summary?.description ?? null,
    extract: summary?.extract ?? null,
    thumbnail: summary?.thumbnail?.source ?? null,
    existingInfobox: base.existingInfobox,
  };
  log({ stage: 'digest', ...digest });

  if (page.ns !== 0) return { ...base, digest, verdict: 'excluded', reason: `namespace ${page.ns}` };
  if (has(page.pageprops, 'disambiguation')) {
    return { ...base, digest, verdict: 'excluded', reason: 'disambiguation page' };
  }
  if (LIST_RE.test(page.title)) return { ...base, digest, verdict: 'excluded', reason: 'list page' };
  if (skipExisting && existing.length) {
    return { ...base, digest, verdict: 'already-has-infobox', template: existing[0] };
  }

  const { peers, peerOrigin, banners, counts } = await discoverPeers({
    api,
    title: page.title,
    qid: base.qid,
    log,
  });
  const census = await runCensus({ api, peers, peerOrigin, log });
  // Bare sub-clusters only matter to the decision when coverage is in the
  // none-warranted band (decide's cluster rule fires at coverage <= 0.25) —
  // skip the extra calls otherwise.
  let bareCluster = [];
  if (census.coverage <= 0.25 && census.bare.length >= 5) {
    log({ stage: 'clusters', label: 'Bare-peer sub-clusters' });
    bareCluster = await findBareClusters({ api, bareTitles: census.bare });
  }
  log({ stage: 'decide', label: 'Decision' });
  const result = decide({ title: page.title, page, census, banners, bareCluster });

  return { ...base, digest, ...result, peerCounts: counts };
}
