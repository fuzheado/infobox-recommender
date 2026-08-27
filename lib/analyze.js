// lib/analyze.js — full pipeline for one title (Stages A–C), shared by the
// CLI and the eval harness. Pure function of (api, title) so it behaves
// identically in Node and the future userscript.

import { has } from './api.js';
import { discoverPeers } from './peers.js';
import { runCensus, findBareClusters, INFOBOX, primaryInfobox } from './census.js';
import { decide } from './decide.js';

const LIST_RE = /^(List|Lists|Timeline|Outline|Index) of/i;
const noop = () => {};

// Validate mode: the article already has an infobox; compare the existing
// choice against peer practice from the census. Advisory — evidence for a
// consensus discussion (MOS:INFOBOXUSE), never a directive.
function compareChoice({ existing, census, result }) {
  const dist = census.distribution ?? {};
  const boxed = census.withInfobox ?? 0;
  const cov = census.coverage ?? 0;
  const rec = result.verdict === 'recommend' ? result.template : null;

  if (result.verdict === 'recommend' && existing === rec) {
    return {
      status: 'consistent',
      current: existing,
      recommended: rec,
      note: `Matches peer practice: {{${rec}}} is used by ${dist[rec]} of ${boxed} boxed peers` +
        (census.subCluster.byClass ? ` (${Math.round(census.subCluster.byClass.coverage * 100)}% of ${census.subCluster.byClass.n} same-class peers)` : '') + '.'
    };
  }
  if (result.verdict === 'recommend') {
    const usedBy = dist[existing] ?? 0;
    return {
      status: 'atypical',
      current: existing,
      recommended: rec,
      note:
        `Peers predominantly use {{${rec}}} (${dist[rec]} of ${boxed} boxed peers); the current {{${existing}}} is used by only ${usedBy} boxed peer${usedBy === 1 ? '' : 's'}` +
        (existing === 'Infobox' ? ' — and the generic {{Infobox}} is the least specific option' : '') +
        '. Worth a discussion, not a mandate.'
    };
  }
  if (result.verdict === 'none-warranted') {
    return {
      status: 'atypical',
      current: existing,
      recommended: null,
      note: `Peers are overwhelmingly without infoboxes (${Math.round(cov * 100)}% coverage); the current infobox makes this article an outlier in its genre.`
    };
  }
  return {
    status: 'inconclusive',
    current: existing,
    recommended: null,
    note: 'Peer evidence is mixed or too thin — no strong signal for or against the current choice.'
  };
}

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
  const existingPrimary = primaryInfobox(existing);

  const base = {
    title: page.title,
    qid: page.pageprops?.wikibase_item ?? null,
    existingInfobox: existingPrimary,
  };

  // Wikidata statement presence (P31 instance-of, P279 subclass-of) — small
  // filtered claims fetches that show how much Wikidata can help this
  // article. P31 classes are handed to discovery so nothing is re-fetched.
  let p31Classes = [];
  let wdStatements = { qid: base.qid, p31: 0, p279: 0 };
  if (base.qid) {
    const [p31res, p279res] = await Promise.all([
      api.wikidata({ action: 'wbgetclaims', entity: base.qid, property: 'P31', formatversion: 2 }).catch(() => null),
      api.wikidata({ action: 'wbgetclaims', entity: base.qid, property: 'P279', formatversion: 2 }).catch(() => null),
    ]);
    p31Classes = (p31res?.claims?.P31 ?? [])
      .map((c) => c.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);
    wdStatements = {
      qid: base.qid,
      p31: p31Classes.length,
      p279: (p279res?.claims?.P279 ?? []).length,
    };
  }

  // Article digest — available immediately, before any census work.
  const digest = {
    title: page.title,
    qid: base.qid,
    shortdesc: page.pageprops?.['wikibase-shortdesc'] ?? summary?.description ?? null,
    description: summary?.description ?? null,
    extract: summary?.extract ?? null,
    thumbnail: summary?.thumbnail?.source ?? null,
    existingInfobox: base.existingInfobox,
    wikidata: wdStatements,
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
    p31Classes,
    log,
  });
  // Wikidata contribution ("how much is Wikidata helping"): statement
  // counts + how many P31 classes were usable for the census.
  const wikidata = {
    ...wdStatements,
    classesTotal: counts.classes?.total ?? 0,
    classesUsed: counts.classes?.used ?? 0,
    sparqlPeers: counts.sparql,
  };
  log({
    stage: 'wikidata',
    classesTotal: wikidata.classesTotal,
    classesUsed: wikidata.classesUsed,
    sparqlPeers: wikidata.sparqlPeers,
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

  // Validate mode: the article already has an infobox — compare it with peer
  // practice (skipExisting=false means the census ran).
  if (existing.length) result.comparison = compareChoice({ existing: existingPrimary ?? existing[0], census, result });

  return { ...base, digest, wikidata, ...result, peerCounts: counts };
}
