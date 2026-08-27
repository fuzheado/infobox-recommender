// lib/census.js — Stage B: peer infobox census.
//
// Batched prop=templates calls (tllimit=500, which for this module is a
// per-REQUEST total, not per-page — large batches silently truncate template
// lists mid-alphabet, right where "Infobox…" sorts). So: small batches (20)
// plus a tltitle continuation loop for correctness. Same call returns
// pageprops/info so we can prune non-article peers (redirects, disambiguation,
// missing, ns!=0) and detect sidebars (which may already serve the infobox
// role).
//
// Sub-cluster split: peers sharing the article's P31 class ('sparql' origin)
// vs category-only peers — surfaces the "event vs concept" case from the doc
// (26/27 boxed elections vs 0/7 bare institution articles).

export const INFOBOX = (name) =>
  !name.includes('/') && // subcomponents: styles.css, /denomination, /entry…
  (name.startsWith('Infobox') ||
    ['Taxobox', 'Geobox', 'Chembox', 'Drugbox', 'Infobox3cols'].includes(name));

const SIDEBAR = (name) => name.startsWith('Sidebar');

// Structural non-articles that pageprops can't flag but short descriptions
// can: set-index articles and "list of" pages are bare BY CONVENTION and
// drag coverage down + create fake bare clusters (Hypothesis H2, signals.md).
// The shortdesc is already in the census response (pageprops) — free filter.
const SHORTDESC_EXCLUDE =
  /^(list of|lists of|set index|wikimedia|index of|disambiguation|timeline of|outline of)/i;

import { chunk, has } from './api.js';
import { MAINTENANCE_CATEGORY_RE } from './peers.js';

// Stage B+: sub-cluster the BARE peers — categories they share with each
// other reveal a possible "no infobox customary" sub-genre (the doc's
// event-vs-concept case: 7 bare institution articles sharing the same
// category while 26 boxed elections share another).
export async function findBareClusters({ api, bareTitles, minMembers = 3, maxTitles = 60 }) {
  const titles = bareTitles.slice(0, maxTitles);
  if (titles.length < minMembers) return [];
  const shared = new Map(); // category name -> Set(bare titles)
  for (const batch of chunk(titles, 50)) {
    const data = await api.enwiki({
      action: 'query',
      titles: batch.join('|'),
      prop: 'categories',
      cllimit: 100,
    });
    for (const page of data.query?.pages ?? []) {
      for (const c of page.categories ?? []) {
        if (c.hidden) continue;
        const name = c.title.replace(/^Category:/, '');
        if (MAINTENANCE_CATEGORY_RE.test(name)) continue;
        if (!shared.has(name)) shared.set(name, new Set());
        shared.get(name).add(page.title);
      }
    }
  }
  return [...shared.entries()]
    .filter(([, s]) => s.size >= minMembers)
    .map(([category, s]) => ({ category, n: s.size, members: [...s] }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
}

const noop = () => {};

// Fetch complete template lists for a set of pages.
//
// tllimit=500 is a per-REQUEST total (not per-page), and the API silently
// drops trailing pages when the budget lands exactly on a page boundary (no
// continue token) — so this is a multi-pass loop:
//   - big batches (50 titles) + tltitle continuation rounds: each round
//     serves another ~500 templates, so ~15 rounds cover 150 peers instead
//     of 30 separate small-batch calls;
//   - a batch whose cumulative template count reached the 500 cap may have
//     starved its trailing pages — empty results there are SUSPECT and are
//     re-queued; a batch that ended below the cap is complete, so its empty
//     pages are genuinely bare;
//   - re-queue passes use 10-title batches (10 typical pages ≈ 300 templates
//     < 500, so truncation is effectively impossible and genuinely bare
//     pages verify as bare); anything still suspect after that is resolved
//     with individual queries, which cannot be starved at all.
async function fetchPageData(api, titles, log) {
  const pageData = new Map(); // title -> {templates: [], page}
  let toFetch = [...titles];
  let pass = 0;
  while (toFetch.length && pass < 3) {
    const next = [];
    const batchSize = pass === 0 ? 50 : 10;
    for (const batch of chunk(toFetch, batchSize)) {
      const params = {
        action: 'query',
        titles: batch.join('|'),
        prop: 'templates|pageprops|info',
        tllimit: 500,
        tlnamespace: 10,
      };
      let cumulative = 0;
      for (let round = 0; ; round++) {
        const data = await api.enwiki(params);
        for (const page of data.query?.pages ?? []) {
          if (!pageData.has(page.title)) pageData.set(page.title, { templates: [], page });
          const tpls = page.templates ?? [];
          pageData.get(page.title).templates.push(...tpls.map((t) => t.title));
          cumulative += tpls.length;
        }
        const cont = data.continue;
        // NB: with multiple props (templates|pageprops|info) the API uses the
        // GENERIC continuation: `continue: '||pageprops|info'` + the module
        // param `tlcontinue` (pageid|ns|title). A single-prop query instead
        // returns `tltitle`. Check both, echo both back.
        const resume = cont?.tltitle ?? cont?.tlcontinue;
        if (!resume) break;
        if (round >= 20) {
          console.warn('  [census] continuation exceeded 20 rounds; remainder dropped');
          break;
        }
        Object.assign(params, cont); // echo back continue (+ tltitle/tlcontinue)
      }
      // budget exhausted => trailing empties may be starved; re-queue them
      if (cumulative >= 500) {
        for (const t of batch) {
          const got = pageData.get(t);
          if (got && got.templates.length === 0) next.push(t);
        }
      }
    }
    toFetch = next;
    pass++;
    log({ stage: 'census', done: titles.length - toFetch.length, total: titles.length });
  }
  // final safety: individual queries cannot be starved — resolves any page
  // still suspect (only possible after truncation in a 10-title batch, i.e.
  // a page with >50 templates in a batch of near-maximum size)
  for (const t of toFetch) {
    const d = await api.enwiki({
      action: 'query',
      titles: t,
      prop: 'templates|pageprops|info',
      tllimit: 500,
      tlnamespace: 10,
    });
    const p = d.query.pages[0];
    pageData.set(t, {
      templates: (p.templates ?? []).map((x) => x.title),
      page: p,
    });
  }
  return pageData;
}

export async function runCensus({ api, peers, peerOrigin = {}, log = noop }) {
  const evaluated = []; // {title, origin, infoboxes, sidebars}
  const skipped = [];

  log({ stage: 'census', label: 'Peer infobox census', done: 0, total: peers.length });
  const pageData = await fetchPageData(api, peers, log);

  for (const [title, { templates: raw, page }] of pageData) {
    if (page.missing) { skipped.push({ title, why: 'missing' }); continue; }
    if (page.ns !== 0) { skipped.push({ title, why: 'ns' }); continue; }
    if (has(page, 'redirect')) {
      skipped.push({ title, why: 'redirect' });
      continue;
    }
    if (has(page.pageprops, 'disambiguation')) {
      skipped.push({ title, why: 'disambiguation' });
      continue;
    }
    const sd = page.pageprops?.['wikibase-shortdesc'] ?? '';
    if (SHORTDESC_EXCLUDE.test(sd)) {
      skipped.push({ title, why: 'shortdesc' });
      continue;
    }
    const all = raw.map((t) => t.replace(/^Template:/, ''));
    evaluated.push({
      title,
      origin: peerOrigin[title] ?? [],
      infoboxes: all.filter((n) => INFOBOX(n)),
      sidebars: all.filter((n) => SIDEBAR(n)),
    });
  }

  const total = evaluated.length;
  const withInfobox = evaluated.filter((p) => p.infoboxes.length > 0);
  const bare = evaluated.filter((p) => p.infoboxes.length === 0);
  const coverage = total ? withInfobox.length / total : 0;

  // Distribution counts only SPECIFIC templates — bare {{Infobox}} (the
  // generic meta-template) counts toward coverage but is never a
  // recommendation candidate (specificity ladder: it is the least specific).
  const distribution = {};
  for (const p of withInfobox) {
    for (const t of p.infoboxes) {
      if (t !== 'Infobox') distribution[t] = (distribution[t] ?? 0) + 1;
    }
  }
  const withSpecific = withInfobox.filter((p) =>
    p.infoboxes.some((t) => t !== 'Infobox')
  ).length;
  const dominantEntry = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0] ?? null;

  // Sub-cluster split: same-P31 peers vs category-only peers (n>=3 to count).
  // Returns coverage + the dominant template WITHIN the group — the doc's
  // event-vs-concept case (26/27 boxed elections vs 0/7 bare institutions)
  // means within-genre dominance is the strongest recommendation signal.
  const split = (isSparql) => {
    const g = evaluated.filter((p) => p.origin.includes('sparql') === isSparql);
    if (g.length < 3) return null;
    const boxed = g.filter((p) => p.infoboxes.length > 0);
    const dist = {};
    for (const p of boxed) {
      for (const t of p.infoboxes) {
        if (t !== 'Infobox') dist[t] = (dist[t] ?? 0) + 1; // bare meta-template never a candidate
      }
    }
    const top = Object.entries(dist).sort((a, b) => b[1] - a[1])[0] ?? null;
    return {
      n: g.length,
      boxed: boxed.length,
      coverage: boxed.length / g.length,
      dominant: top ? { template: top[0], count: top[1] } : null,
      dominantShare: top ? top[1] / boxed.length : 0,
    };
  };

  return {
    total,
    withInfobox: withInfobox.length,
    coverage,
    distribution,
    dominant: dominantEntry ? { template: dominantEntry[0], count: dominantEntry[1] } : null,
    dominanceShare: dominantEntry ? dominantEntry[1] / (withSpecific || 1) : 0,
    bare: bare.map((p) => p.title),
    sidebarOnly: bare.filter((p) => p.sidebars.length > 0).map((p) => p.title),
    subCluster: { byClass: split(true), byCategoryOnly: split(false) },
    skipped,
    evaluated,
  };
}
